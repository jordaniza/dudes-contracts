import * as hre from "hardhat";
import { Dude, MockRandomizer, Roulette } from "../../typechain-types";

/*
  Set of helpers for deploying contracts in the HH environment
  ZKSync contracts are deployed using the ZKSync deployer but this is so slow
  that it is not practical for development. Instead we use the HH deployer
  to test contract logic then the zk deployer to run final tests.
*/

export const RICH_WALLET_PK = "0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110";

type Deployment = {
  roulette: Roulette;
  randomizer: MockRandomizer;
  dudesToken: Dude;
};

export async function deployRoulette(): Promise<Deployment> {
  const [deployer, ..._] = await hre.ethers.getSigners();

  const mockRandomizerFactory = await hre.ethers.getContractFactory("MockRandomizer", deployer);
  const mockRandomizer = await mockRandomizerFactory.deploy();

  const dudeFactory = await hre.ethers.getContractFactory("Dude", deployer);
  const dudesToken = (await hre.upgrades.deployProxy(dudeFactory, [], {
    initializer: "initialize",
    kind: "uups",
  })) as Dude;

  const rouletteFactory = await hre.ethers.getContractFactory("Roulette", deployer);

  const roulette = (await hre.upgrades.deployProxy(rouletteFactory, [dudesToken.address, mockRandomizer.address], {
    initializer: "initialize",
    kind: "uups",
  })) as Roulette;

  return {
    roulette,
    randomizer: mockRandomizer,
    dudesToken,
  };
}

export enum RoundStatus {
  NOT_STARTED,
  OPEN,
  LOCKED,
  CLOSED,
}
