import chai from "chai";
const { expect } = chai;

import * as hre from "hardhat";
import { deployRoulette, RICH_WALLET_PK } from "./hh-utils";
import {
  Dude,
  DudeTokenV2,
  MockSeeder,
  Roulette,
  RouletteV2,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish } from "ethers";

const P = (i: BigNumberish) => hre.ethers.utils.parseEther(i.toString());

describe("HHDeployment", function () {
  let deployer: SignerWithAddress;
  let signers: SignerWithAddress[];
  let roulette: Roulette;
  let seeder: MockSeeder;
  let dudesToken: Dude;

  beforeEach(async function () {
    [deployer, ...signers] = await hre.ethers.getSigners();
    const deployment = await deployRoulette();
    roulette = deployment.roulette;
    seeder = deployment.seeder;
    dudesToken = deployment.dudesToken;
  });

  context("Deployment Params", () => {
    it("Should deploy all the contracts", () => {
      expect(roulette.address).to.not.be.undefined;
      expect(seeder.address).to.not.be.undefined;
      expect(dudesToken.address).to.not.be.undefined;
    });

    it("Can upgrade the roulette and dudes contracts", async () => {
      const dudeArtifactV2 = await hre.ethers.getContractFactory(
        "DudeTokenV2",
        deployer,
      );
      const dudeV2 = await hre.upgrades.upgradeProxy(
        dudesToken.address,
        dudeArtifactV2,
      ) as DudeTokenV2;

      const rouletteArtifactV2 = await hre.ethers.getContractFactory(
        "RouletteV2",
        deployer,
      );
      const rouletteV2 = await hre.upgrades.upgradeProxy(
        roulette.address,
        rouletteArtifactV2,
      ) as RouletteV2;

      const [dudeUpgrade, rouletteUpgrade] = await Promise.all([
        dudeV2.isUpgraded(),
        rouletteV2.isUpgraded(),
      ]);

      expect(dudeUpgrade).to.be.true;
      expect(rouletteUpgrade).to.be.true;
    });
  });

  context("Roulette", () => {
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

      it("admin can set the seeder", async () => {
        const mockSeederFactory = await hre.ethers.getContractFactory(
          "MockSeeder",
          deployer,
        );
        const mockSeeder = await mockSeederFactory.deploy();
        const newSeeder = mockSeeder.address;
        await roulette.setSeeder(newSeeder);
        const seeder = await roulette.seeder();
        expect(seeder).to.eq(newSeeder);
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
        await expect(roulette.setBettingToken(deployer.address)).to.be
          .revertedWith(OWNER_ERROR);
        await expect(roulette.setSeeder(deployer.address)).to.be.revertedWith(
          OWNER_ERROR,
        );
        await expect(roulette.transferOwnership(deployer.address)).to.be
          .revertedWith(OWNER_ERROR);
      });
    });

    context("Betting", () => {
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
        await expect(
          roulettePlayer1.placeBet([{ number: 24, amount: P(100) }], "Custom"),
        ).to.be.revertedWith(ROUND_NOT_OPEN_ERROR);
      });

      it("Requires that individual bets are <= max bet", async () => {
        await roulette.openRound();
        const MAX_BET_ERROR = "Bet > maxBet";
        await roulette.setMaxBet(P(999));
        console.log("Max bet set to 999");
        await expect(
          roulettePlayer1.placeBet(
            [{ number: 24, amount: P(1000) }],
            "Individual",
          ),
        ).to.be.revertedWith(MAX_BET_ERROR);
      });

      it("Same if we place a multi bet", async () => {
        await roulette.openRound();
        const MAX_BET_ERROR = "Bet > maxBet";
        await roulette.setMaxBet(P(499));
        await expect(
          roulettePlayer1.placeBet(
            [{ number: 24, amount: P(400) }, { number: 25, amount: P(500) }],
            "Custom",
          ),
        ).to.be.revertedWith(MAX_BET_ERROR);
      });

      it("requires that the contract has a balance > bet", async () => {
        await roulette.openRound();
        const INSUFFICIENT_FUNDS_ERROR = "Cannot payout winnings";
        await roulette.setMaxBet(P(1000));
        await expect(
          roulettePlayer1.placeBet(
            [{ number: 24, amount: P(1000) }],
            "Individual",
          ),
        ).to.be.revertedWith(INSUFFICIENT_FUNDS_ERROR);
      });

      it("requires that the owner has opened the round", async () => {
        const ROUND_NOT_OPEN_ERROR = "Round is not open";
        await expect(
          roulettePlayer1.placeBet([{ number: 24, amount: P(100) }], "Custom"),
        ).to.be.revertedWith(ROUND_NOT_OPEN_ERROR);
      });

      it("stops us placing bets in invalid ranges", async () => {
        await roulette.openRound();
        const INVALID_RANGE_ERROR = "Invalid number";
        await expect(
          roulettePlayer1.placeBet([{ number: 37, amount: P(100) }], "Custom"),
        ).to.be.revertedWith(INVALID_RANGE_ERROR);
      });

      it("Allows us to place some bets", async () => {
        await roulette.openRound();
        await roulette.setMaxBet(P(10));
        const RED_NUMBERS = [
          1,
          3,
          5,
          7,
          9,
          12,
          14,
          16,
          18,
          19,
          21,
          23,
          25,
          27,
          30,
          32,
          34,
          36,
        ];

        const NOBODY_BET = [
          2,
          4,
          6,
          8,
          10,
        ]
        const p1BetOnRed = RED_NUMBERS.map((number) => ({
          number,
          amount: P(10),
        }));

        await roulettePlayer1.placeBet(
          p1BetOnRed,
          "Red",
        );

        await roulettePlayer2.placeBet(
          [
            { number: 12, amount: P(5) },
          ],
          "Individual",
        );

        await roulettePlayer3.placeBet(
          [
            { number: 12, amount: P(5 / 1) },
            { number: 13, amount: P(5 / 2) },
            { number: 14, amount: P(5 / 3) },
          ],
          "Custom",
        );

        const player2BetOn12 = await roulette.userBetsByRound(0, player2.address, 12);
        expect(player2BetOn12).to.eq(P(5));


        const player3BetOn12 = await roulette.userBetsByRound(0, player3.address, 12);
        expect(player3BetOn12).to.eq(P(5));

        const player3BetOn13 = await roulette.userBetsByRound(0, player3.address, 13);
        expect(player3BetOn13).to.eq(P(5/2));

        const player3BetOn14 = await roulette.userBetsByRound(0, player3.address, 14);
        expect(player3BetOn14).to.eq(P(5/3));

        const redPromises = RED_NUMBERS.map(async (number) => await roulette.userBetsByRound(0, player1.address, number));
        const redBets = await Promise.all(redPromises);
        expect(redBets).to.deep.eq(RED_NUMBERS.map(() => P(10)));

        const player1NobodyBet = NOBODY_BET.map(async (number) => await roulette.userBetsByRound(0, player1.address, number));
        const player1NobodyBets = await Promise.all(player1NobodyBet);
        expect(player1NobodyBets).to.deep.eq(NOBODY_BET.map(() => P(0)));

        const player2NobodyBet = NOBODY_BET.map(async (number) => await roulette.userBetsByRound(0, player2.address, number));
        const player2NobodyBets = await Promise.all(player2NobodyBet);
        expect(player2NobodyBets).to.deep.eq(NOBODY_BET.map(() => P(0)));

        const player3NobodyBet = NOBODY_BET.map(async (number) => await roulette.userBetsByRound(0, player3.address, number));
        const player3NobodyBets = await Promise.all(player3NobodyBet);
        expect(player3NobodyBets).to.deep.eq(NOBODY_BET.map(() => P(0)));
      });

      it("Will error out if total bets for a number exceed what we can pay out", async () => {});
    });
  });
});
