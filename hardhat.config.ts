import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "solidity-coverage";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";

import "@matterlabs/hardhat-zksync-upgradable";
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
// bugged as of now
// import "@matterlabs/hardhat-zksync-verify";

dotenv.config();

// Environment variables
const useZkEVM = process.env.USE_ZKEVM === "true";
const isTestEnv = process.env.NODE_ENV == "test";

const zkSyncTestnet = isTestEnv
  ? {
      url: "http://localhost:3050",
      ethNetwork: "http://localhost:8545",
      zksync: true,
    }
  : {
      url: "https://zksync2-testnet.zksync.dev",
      ethNetwork: "goerli",
      zksync: true,
      // verifyURL: "https://zksync2-testnet-explorer.zksync.dev/contract_verification",
    };

const commonConfig: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
  },
  typechain: {
    target: "ethers-v5",
  },
};

const zkConfig: HardhatUserConfig = {
  ...commonConfig,
  zksolc: {
    version: "latest",
    settings: {},
  },
  defaultNetwork: "zkSyncTestnet",
  networks: {
    hardhat: {
      zksync: true,
    },
    zkSyncTestnet,
  },
  paths: {
    tests: "./test/zk",
  },
};

const defaultConfig: HardhatUserConfig = {
  ...commonConfig,
  paths: {
    tests: "./test/hh",
  },
};

export default useZkEVM ? zkConfig : defaultConfig;
