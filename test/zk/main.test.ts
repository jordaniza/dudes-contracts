import { expect } from "chai";
import { Wallet } from "zksync-web3";
import * as hre from "hardhat";
import { Deployer as ZkDeployer } from "@matterlabs/hardhat-zksync-deploy";
import { deployRoulette, RICH_WALLET_PK } from "./zk-utils";
import { Dude, DudeTokenV2, MockRandomizer, Roulette, RouletteV2 } from "../../typechain-types";

describe("ZK_TEST ZkDeployment", function () {
  const wallet = new Wallet(RICH_WALLET_PK);
  const deployer = new ZkDeployer(hre, wallet);

  let roulette: Roulette;
  let randomizer: MockRandomizer;
  let dudesToken: Dude;

  beforeEach(async function () {
    const deployment = await deployRoulette(deployer);
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
      const dudeArtifactV2 = await deployer.loadArtifact("DudeTokenV2");

      const dudeV2 = (await hre.zkUpgrades.upgradeProxy(
        deployer.zkWallet,
        dudesToken.address,
        dudeArtifactV2
      )) as DudeTokenV2;

      const rouletteArtifactV2 = await deployer.loadArtifact("RouletteV2");
      const rouletteV2 = (await hre.zkUpgrades.upgradeProxy(
        deployer.zkWallet,
        roulette.address,
        rouletteArtifactV2
      )) as RouletteV2;

      const [dudeUpgrade, rouletteUpgrade] = await Promise.all([dudeV2.isUpgraded(), rouletteV2.isUpgraded()]);

      expect(dudeUpgrade).to.be.true;
      expect(rouletteUpgrade).to.be.true;
    });
  });
});
