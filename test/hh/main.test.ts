import chai from "chai";
const { expect } = chai;

import * as hre from "hardhat";
import { deployRoulette, RoundStatus } from "./hh-utils";
import { Dude, DudeTokenV2, MockRandomizer, Roulette, RouletteV2 } from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish } from "ethers";

const P = (i: BigNumberish) => hre.ethers.utils.parseEther(i.toString());
const N = (i: BigNumber) => hre.ethers.utils.formatEther(i.toString());
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const redBets = (bet: number) => RED_NUMBERS.map((number) => ({ number, amount: P(bet) }));
const oneBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000001";

describe("Hardhat Roulette Tests", function () {
  let deployer: SignerWithAddress;
  let signers: SignerWithAddress[];
  let roulette: Roulette;
  let randomizer: MockRandomizer;
  let dudesToken: Dude;

  beforeEach(async function () {
    [deployer, ...signers] = await hre.ethers.getSigners();
    const deployment = await deployRoulette();
    roulette = deployment.roulette;
    randomizer = deployment.randomizer;
    dudesToken = deployment.dudesToken;
  });

  context("Deployment Params", () => {
    it("Should deploy all the contracts", () => {
      expect(roulette.address).to.not.be.undefined;
      expect(randomizer.address).to.not.be.undefined;
      expect(dudesToken.address).to.not.be.undefined;
    });

    it("Can upgrade the roulette and dudes contracts", async () => {
      const dudeArtifactV2 = await hre.ethers.getContractFactory("DudeTokenV2", deployer);
      const dudeV2 = (await hre.upgrades.upgradeProxy(dudesToken.address, dudeArtifactV2)) as DudeTokenV2;

      const rouletteArtifactV2 = await hre.ethers.getContractFactory("RouletteV2", deployer);
      const rouletteV2 = (await hre.upgrades.upgradeProxy(roulette.address, rouletteArtifactV2)) as RouletteV2;

      const [dudeUpgrade, rouletteUpgrade] = await Promise.all([dudeV2.isUpgraded(), rouletteV2.isUpgraded()]);

      expect(dudeUpgrade).to.be.true;
      expect(rouletteUpgrade).to.be.true;
    });

    it("can't initialize the contracts again", async () => {
      const ROULETTE_ALREADY_INITIALIZED = "Initializable: contract is already initialized";

      await expect(
        roulette.initialize(hre.ethers.constants.AddressZero, hre.ethers.constants.AddressZero)
      ).to.be.revertedWith(ROULETTE_ALREADY_INITIALIZED);
    });
  });

  context("Randomizer", () => {
    it("Only allows the randomizer to call the randomizer callback", async () => {
      const RANDOMIZER_ERROR = "Unauthorized";
      await expect(roulette.randomizerCallback(1, oneBytes32)).to.be.revertedWith(RANDOMIZER_ERROR);
    });

    it("Allows anybody to deposit to fund the VRF randomizer", async () => {
      const deposit = P(10);
      const randomizerBalancePre = await roulette.checkBalance();
      await roulette.depositToRandomizer({ value: deposit });

      let randomizerBalance = await roulette.checkBalance();
      expect(randomizerBalance.sub(randomizerBalancePre)).to.eq(deposit);

      await roulette.connect(signers[1]).depositToRandomizer({ value: deposit });

      randomizerBalance = await roulette.checkBalance();
      expect(randomizerBalance.sub(randomizerBalancePre)).to.eq(deposit.add(deposit));
    });

    it("Allows the owner to withdraw from the randomizer", async () => {
      const deposit = P(10);
      const player3BalancePre = await signers[3].getBalance();

      await roulette.depositToRandomizer({ value: deposit });

      const randomizerBalancePre = await roulette.checkBalance();

      await roulette.withdrawFromRandomizer(signers[3].address, deposit);

      const randomizerBalance = await roulette.checkBalance();
      const player3Balance = await signers[3].getBalance();

      expect(randomizerBalancePre.sub(randomizerBalance)).to.eq(deposit);
      expect(player3Balance.sub(player3BalancePre)).to.eq(deposit);
    });
  });

  context("Withdrawal", () => {
    it("Lets the owner withdraw", async () => {
      const ownerBalancePre = await dudesToken.balanceOf(deployer.address);
      await dudesToken.mint(roulette.address, P(100));
      await roulette.withdraw(deployer.address, P(100));
      const ownerBalance = await dudesToken.balanceOf(deployer.address);
      expect(ownerBalance.sub(ownerBalancePre)).to.eq(P(100));
    });
  });

  context("Rounds", () => {
    beforeEach(async () => {
      // fund the randomizser contract
      roulette.depositToRandomizer({ value: P(10) });
    });

    const ERRORS = {
      ROUND_OPEN: "Round cannot be opened",
      ROUND_NOT_OPEN: "Round is not open",
      ROUND_NOT_LOCKED: "Round is not locked",
      ROUND_NOT_CLOSED: "Round is not closed",
    };

    it("allows us to open a round", async () => {
      await roulette.openRound();
      const round = await roulette.round();
      const roundData = await roulette.rounds(round);
      expect(roundData.status).to.eq(RoundStatus.OPEN);
    });

    it("Prevents us from opening a round if one is already open", async () => {
      await roulette.openRound();
      await expect(roulette.openRound()).to.be.revertedWith(ERRORS.ROUND_OPEN);
    });

    it("Allows us to lock a round by requesting a spin", async () => {
      await roulette.openRound();
      await roulette.requestSpin(99999);
      const round = await roulette.round();
      const roundData = await roulette.rounds(round);
      expect(roundData.status).to.eq(RoundStatus.LOCKED);
    });

    it("Prevents us from requesting a spin if the round is not open", async () => {
      await expect(roulette.requestSpin(99999)).to.be.revertedWith(ERRORS.ROUND_NOT_OPEN);
    });

    it("Prevents us from requesting a spin if the round is already locked", async () => {
      await roulette.openRound();
      await roulette.requestSpin(99999);
      await expect(roulette.requestSpin(99999)).to.be.revertedWith(ERRORS.ROUND_NOT_OPEN);
    });

    it("Closes the round after the spin result is received", async () => {
      await roulette.openRound();
      await roulette.requestSpin(99999);
      await randomizer.randomizerCallback(1, oneBytes32);
      await roulette.setSpinResult();
      const round = await roulette.round();
      const roundData = await roulette.rounds(round);
      expect(roundData.status).to.eq(RoundStatus.CLOSED);
    });

    it("Cannot set a spin result before we have it from the randomizer", async () => {
      await roulette.openRound();
      await roulette.requestSpin(99999);
      await expect(roulette.setSpinResult()).to.be.revertedWith("No spin result");
    });

    it("Prevents us from requesting a spin if the round is already closed", async () => {
      await roulette.openRound();
      await roulette.requestSpin(99999);
      await randomizer.randomizerCallback(1, oneBytes32);
      await roulette.setSpinResult();
      await expect(roulette.requestSpin(99999)).to.be.revertedWith(ERRORS.ROUND_NOT_OPEN);
    });

    it("Cannot set the spin result if the round is not locked", async () => {
      await expect(roulette.setSpinResult()).to.be.revertedWith(ERRORS.ROUND_NOT_LOCKED);
    });

    it("Can only create the next round if the current round is closed", async () => {
      await expect(roulette.nextRound()).to.be.revertedWith(ERRORS.ROUND_NOT_CLOSED);
      await roulette.openRound();
      await expect(roulette.nextRound()).to.be.revertedWith(ERRORS.ROUND_NOT_CLOSED);
      await roulette.requestSpin(99999);
      await expect(roulette.nextRound()).to.be.revertedWith(ERRORS.ROUND_NOT_CLOSED);
      await randomizer.randomizerCallback(1, oneBytes32);
      await expect(roulette.nextRound()).to.be.revertedWith(ERRORS.ROUND_NOT_CLOSED);
      await roulette.setSpinResult();
    });

    it("Can open the next round once it has been created", async () => {
      await roulette.openRound();
      await roulette.requestSpin(99999);
      await randomizer.randomizerCallback(1, oneBytes32);
      await roulette.setSpinResult();
      await roulette.nextRound();
      let round = await roulette.round();
      let roundData = await roulette.rounds(round);
      expect(roundData.status).to.eq(RoundStatus.NOT_STARTED);
      await roulette.openRound();
      round = await roulette.round();
      roundData = await roulette.rounds(round);
      expect(roundData.status).to.eq(RoundStatus.OPEN);
    });
  });

  context("Roulette", () => {
    beforeEach(async () => {
      // fund the randomizser contract
      roulette.depositToRandomizer({ value: P(10) });
    });

    it("Initializes with the correct params", async () => {
      const [maxBet, bettingToken, owner, round] = await Promise.all([
        roulette.maxBet(),
        roulette.bettingToken(),
        roulette.owner(),
        roulette.round(),
      ]);

      expect(round).to.eq(0);
      expect(bettingToken).to.eq(dudesToken.address);
      expect(maxBet).to.eq(0);
      expect(owner).to.eq(deployer.address);
    });

    context("Admin", () => {
      it("admin can set the max bet", async () => {
        const newMaxBet = 100;
        await roulette.setMaxBet(newMaxBet);
        const maxBet = await roulette.maxBet();
        expect(maxBet).to.eq(newMaxBet);
      });

      it("admin can set the betting token", async () => {
        const newBettingToken = signers[1].address;
        await roulette.setBettingToken(newBettingToken);
        const bettingToken = await roulette.bettingToken();
        expect(bettingToken).to.eq(newBettingToken);
      });

      it("admin can set the randomizer", async () => {
        const mockRandomizerFactory = await hre.ethers.getContractFactory("MockRandomizer", deployer);
        const mockRandomizer = await mockRandomizerFactory.deploy();
        const newRandomizer = mockRandomizer.address;
        await roulette.setRandomizer(newRandomizer);
        const randomizer = await roulette.randomizer();
        expect(randomizer).to.eq(newRandomizer);
      });

      it("admin can set the owner", async () => {
        const newOwner = signers[1].address;
        await roulette.transferOwnership(newOwner);
        const owner = await roulette.owner();
        expect(owner).to.eq(newOwner);
      });

      it("non admins not allowed to use the admin functions ", async () => {
        const newOwner = signers[1].address;
        await roulette.transferOwnership(newOwner);
        const OWNER_ERROR = "Ownable: caller is not the owner";

        await expect(roulette.setMaxBet(0)).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.setBettingToken(deployer.address)).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.setRandomizer(deployer.address)).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.transferOwnership(deployer.address)).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.nextRound()).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.openRound()).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.requestSpin(0)).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.setSpinResult()).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.withdraw(deployer.address, 0)).to.be.revertedWith(OWNER_ERROR);
        await expect(roulette.withdrawFromRandomizer(deployer.address, 0)).to.be.revertedWith(OWNER_ERROR);
      });
    });

    context("Betting", () => {
      beforeEach(async () => {
        // fund the randomizser contract
        roulette.depositToRandomizer({ value: P(10) });
      });

      let player1: SignerWithAddress;
      let player2: SignerWithAddress;
      let player3: SignerWithAddress;

      let roulettePlayer1: Roulette;
      let roulettePlayer2: Roulette;
      let roulettePlayer3: Roulette;

      beforeEach(async () => {
        player1 = signers[1];
        player2 = signers[2];
        player3 = signers[3];

        await dudesToken.mint(player1.address, P(1000));
        await dudesToken.mint(player2.address, P(1000));
        await dudesToken.mint(player3.address, P(1000));

        roulettePlayer1 = roulette.connect(player1);
        roulettePlayer2 = roulette.connect(player2);
        roulettePlayer3 = roulette.connect(player3);

        await dudesToken.connect(player1).approve(roulette.address, P(1000));
        await dudesToken.connect(player2).approve(roulette.address, P(1000));
        await dudesToken.connect(player3).approve(roulette.address, P(1000));

        await dudesToken.mint(roulette.address, P(20_000));
      });

      it("Cant bet before round is open", async () => {
        const ROUND_NOT_OPEN_ERROR = "Round is not open";
        await expect(roulettePlayer1.placeBet([{ number: 24, amount: P(100) }], "Custom")).to.be.revertedWith(
          ROUND_NOT_OPEN_ERROR
        );
      });

      it("Requires that individual bets are <= max bet", async () => {
        await roulette.openRound();
        const MAX_BET_ERROR = "Bet > maxBet";
        await roulette.setMaxBet(P(999));
        await expect(roulettePlayer1.placeBet([{ number: 24, amount: P(1000) }], "Individual")).to.be.revertedWith(
          MAX_BET_ERROR
        );
      });

      it("Cumulative bets must be <= max bet", async () => {
        await roulette.openRound();
        const MAX_BET_ERROR = "Bet > maxBet";
        await roulette.setMaxBet(P(500));
        await roulettePlayer1.placeBet([{ number: 24, amount: P(400) }], "Individual");
        await expect(roulettePlayer1.placeBet([{ number: 24, amount: P(101) }], "Individual")).to.be.revertedWith(
          MAX_BET_ERROR
        );
      });

      it("Same if we place a multi bet", async () => {
        await roulette.openRound();
        const MAX_BET_ERROR = "Bet > maxBet";
        await roulette.setMaxBet(P(499));
        await expect(
          roulettePlayer1.placeBet(
            [
              { number: 24, amount: P(400) },
              { number: 25, amount: P(500) },
            ],
            "Custom"
          )
        ).to.be.revertedWith(MAX_BET_ERROR);
      });

      it("requires that the contract has a balance > bet", async () => {
        await roulette.openRound();
        const INSUFFICIENT_FUNDS_ERROR = "Cannot payout winnings";
        await roulette.setMaxBet(P(1000));
        await expect(roulettePlayer1.placeBet([{ number: 24, amount: P(1000) }], "Individual")).to.be.revertedWith(
          INSUFFICIENT_FUNDS_ERROR
        );
      });

      it("requires that the owner has opened the round", async () => {
        const ROUND_NOT_OPEN_ERROR = "Round is not open";
        await expect(roulettePlayer1.placeBet([{ number: 24, amount: P(100) }], "Custom")).to.be.revertedWith(
          ROUND_NOT_OPEN_ERROR
        );
      });

      it("stops us placing bets in invalid ranges", async () => {
        await roulette.openRound();
        const INVALID_RANGE_ERROR = "Invalid number";
        await expect(roulettePlayer1.placeBet([{ number: 37, amount: P(100) }], "Custom")).to.be.revertedWith(
          INVALID_RANGE_ERROR
        );
      });

      it("Allows us to place some bets", async () => {
        await roulette.openRound();
        await roulette.setMaxBet(P(10));
        const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

        const NOBODY_BET = [2, 4, 6, 8, 10];
        const p1BetOnRed = RED_NUMBERS.map((number) => ({
          number,
          amount: P(10),
        }));

        await roulettePlayer1.placeBet(p1BetOnRed, "Red");

        await roulettePlayer2.placeBet([{ number: 12, amount: P(5) }], "Individual");

        await roulettePlayer3.placeBet(
          [
            { number: 12, amount: P(5 / 1) },
            { number: 13, amount: P(5 / 2) },
            { number: 14, amount: P(5 / 3) },
          ],
          "Custom"
        );

        const player2BetOn12 = await roulette.userBetsByRound(0, player2.address, 12);
        expect(player2BetOn12).to.eq(P(5));

        const player3BetOn12 = await roulette.userBetsByRound(0, player3.address, 12);
        expect(player3BetOn12).to.eq(P(5));

        const player3BetOn13 = await roulette.userBetsByRound(0, player3.address, 13);
        expect(player3BetOn13).to.eq(P(5 / 2));

        const player3BetOn14 = await roulette.userBetsByRound(0, player3.address, 14);
        expect(player3BetOn14).to.eq(P(5 / 3));

        const redPromises = RED_NUMBERS.map(
          async (number) => await roulette.userBetsByRound(0, player1.address, number)
        );
        const redBets = await Promise.all(redPromises);
        expect(redBets).to.deep.eq(RED_NUMBERS.map(() => P(10)));

        const player1NobodyBet = NOBODY_BET.map(
          async (number) => await roulette.userBetsByRound(0, player1.address, number)
        );
        const player1NobodyBets = await Promise.all(player1NobodyBet);
        expect(player1NobodyBets).to.deep.eq(NOBODY_BET.map(() => P(0)));

        const player2NobodyBet = NOBODY_BET.map(
          async (number) => await roulette.userBetsByRound(0, player2.address, number)
        );
        const player2NobodyBets = await Promise.all(player2NobodyBet);
        expect(player2NobodyBets).to.deep.eq(NOBODY_BET.map(() => P(0)));

        const player3NobodyBet = NOBODY_BET.map(
          async (number) => await roulette.userBetsByRound(0, player3.address, number)
        );
        const player3NobodyBets = await Promise.all(player3NobodyBet);
        expect(player3NobodyBets).to.deep.eq(NOBODY_BET.map(() => P(0)));
      });

      it("Will error out if total bets for a number exceed what we can pay out", async () => {});
    });

    context("Payouts", () => {
      beforeEach(async () => {
        // fund the randomizser contract
        roulette.depositToRandomizer({ value: P(10) });
      });

      let player1: SignerWithAddress;
      let player2: SignerWithAddress;
      let player3: SignerWithAddress;

      let roulettePlayer1: Roulette;
      let roulettePlayer2: Roulette;
      let roulettePlayer3: Roulette;

      beforeEach(async () => {
        player1 = signers[1];
        player2 = signers[2];
        player3 = signers[3];

        await dudesToken.mint(player1.address, P(1000));
        await dudesToken.mint(player2.address, P(1000));
        await dudesToken.mint(player3.address, P(1000));

        roulettePlayer1 = roulette.connect(player1);
        roulettePlayer2 = roulette.connect(player2);
        roulettePlayer3 = roulette.connect(player3);

        await dudesToken.connect(player1).approve(roulette.address, P(1000));
        await dudesToken.connect(player2).approve(roulette.address, P(1000));
        await dudesToken.connect(player3).approve(roulette.address, P(1000));

        await dudesToken.mint(roulette.address, P(20_000));

        await roulette.openRound();
        await roulette.setMaxBet(P(1000));

        await roulettePlayer1.placeBet([{ number: 24, amount: P(100) }], "Custom");
        await roulettePlayer2.placeBet([{ number: 0, amount: P(200) }], "Custom");
        await roulettePlayer3.placeBet(redBets(10), "Custom");

        await roulette.requestSpin(99999);
      });

      it("Will not payout if the round isn't closed", async () => {
        await expect(roulette.collectWinnings(player1.address, 0)).to.be.revertedWith("Round is not closed");
      });

      context("Round closed", () => {
        const zeroBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
        // 61 % 37 === 24
        const sixtyOneB32 = "0x000000000000000000000000000000000000000000000000000000000000003d";
        // 62 % 37 === 25
        const sixtyTwoB32 = "0x000000000000000000000000000000000000000000000000000000000000003e";

        beforeEach(async () => {
          await randomizer.randomizerCallback(1, sixtyOneB32);
          await roulette.setSpinResult();
        });

        it("Round is closed and the random number is set", async () => {
          const round = await roulette.round();
          const [roundData, receivedRandom] = await Promise.all([
            roulette.rounds(round),
            roulette.latestRandomResult(),
          ]);

          expect(roundData.status).to.eq(RoundStatus.CLOSED);
          expect(receivedRandom).to.eq(zeroBytes32);
          expect(roundData.winningNumber).to.eq(24);
        });

        it("Will not payout if the user bet on the wrong number", async () => {
          await expect(roulette.collectWinnings(player2.address, 0)).to.be.revertedWith("No winnings");
        });

        it("Pays out the correct amount for the round", async () => {
          const player1BalancePre = await dudesToken.balanceOf(player1.address);
          await roulette.collectWinnings(player1.address, 0);
          const player1Balance = await dudesToken.balanceOf(player1.address);
          expect(player1Balance.sub(player1BalancePre)).to.eq(P(3600));
        });

        it("Will not payout if user has already claimed", async () => {
          await roulette.collectWinnings(player1.address, 0);
          await expect(roulette.collectWinnings(player1.address, 0)).to.be.revertedWith("No winnings");
        });

        it("Lets a player collect winnings on someone else's behalf", async () => {
          const player1BalancePre = await dudesToken.balanceOf(player1.address);
          await roulette.connect(player2).collectWinnings(player1.address, 0);
          const player1Balance = await dudesToken.balanceOf(player1.address);
          expect(player1Balance.sub(player1BalancePre)).to.eq(P(3600));
        });

        it("Works across multiple rounds", async () => {
          // open the next round
          await roulette.nextRound();
          await roulette.openRound();

          // place bets
          await roulettePlayer1.placeBet([{ number: 25, amount: P(100) }], "Custom");
          await roulettePlayer2.placeBet([{ number: 25, amount: P(100) }], "Custom");

          // save balances here or we will undercount the winnings
          const player1BalancePre = await dudesToken.balanceOf(player1.address);
          const player2BalancePre = await dudesToken.balanceOf(player2.address);
          const player3BalancePre = await dudesToken.balanceOf(player3.address);

          // close the round
          await roulette.requestSpin(99999);
          await randomizer.randomizerCallback(2, sixtyTwoB32);
          await roulette.setSpinResult();

          // p1 wins both times
          await roulette.collectWinnings(player1.address, 0);
          await roulette.collectWinnings(player1.address, 1);

          // p2 wins once
          await expect(roulette.collectWinnings(player2.address, 0)).to.be.revertedWith("No winnings");
          await roulette.collectWinnings(player2.address, 1);

          // p3 wins none
          await expect(roulette.collectWinnings(player3.address, 0)).to.be.revertedWith("No winnings");
          await expect(roulette.collectWinnings(player3.address, 1)).to.be.revertedWith("No winnings");

          const player1Balance2 = await dudesToken.balanceOf(player1.address);
          const player2Balance2 = await dudesToken.balanceOf(player2.address);
          const player3Balance2 = await dudesToken.balanceOf(player3.address);

          expect(player1Balance2.sub(player1BalancePre)).to.eq(P(7200));
          expect(player2Balance2.sub(player2BalancePre)).to.eq(P(3600));
          expect(player3Balance2.sub(player3BalancePre)).to.eq(P(0));
        });

        it("Will not payout if the user selects a round not created", async () => {
          await expect(roulette.collectWinnings(player1.address, 1)).to.be.reverted;
        });
      });
    });
  });
});
