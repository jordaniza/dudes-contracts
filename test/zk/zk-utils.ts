import { Contract } from "zksync-web3";
import * as hre from "hardhat";
import { Deployer as ZkDeployer } from "@matterlabs/hardhat-zksync-deploy";
import {
  Dude,
  MockSeeder,
  Roulette,
} from "../../typechain-types";

/*
 * Set of helpers for deploying contracts in the ZkSync environment
 * ZKSync contracts are deployed using the ZKSync deployer but this is so slow
 * so use the HH deployer to test contract logic then the zk deployer to run final tests.
 */

export const RICH_WALLET_PK =
  "0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110";

type Deployment = {
  roulette: Roulette;
  seeder: MockSeeder;
  dudesToken: Dude;
};

async function zkDeploy<C extends Contract>(
  contractName: string,
  deployer: ZkDeployer,
  args?: any[],
): Promise<C> {
  const artifact = await deployer.loadArtifact(contractName);
  return await deployer.deploy(artifact, args) as C;
}

async function zkDeployProxy<C extends Contract>(
  contractName: string,
  deployer: ZkDeployer,
  args?: any[],
): Promise<C> {
  const contract = await deployer.loadArtifact(contractName);
  return await hre.zkUpgrades.deployProxy(deployer.zkWallet, contract, args, {
    initializer: "initialize",
    kind: "uups",
  }) as C;
}

export async function deployRoulette(
  deployer: ZkDeployer,
): Promise<Deployment> {
  console.log("Deploying contracts with the account:", RICH_WALLET_PK);

  const mockSeeder = await zkDeploy<MockSeeder>("MockSeeder", deployer);
  const dudesToken = await zkDeployProxy<Dude>("Dude", deployer);
  const roulette = await zkDeployProxy<Roulette>("Roulette", deployer, [
    dudesToken.address,
    mockSeeder.address,
  ]);

  return {
    roulette,
    seeder: mockSeeder,
    dudesToken,
  };
}
