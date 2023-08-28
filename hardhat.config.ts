import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";
import "@typechain/hardhat";

const zkSyncTestnet = process.env.NODE_ENV == "test"
  ? {
    url: "http://localhost:3050",
    ethNetwork: "http://localhost:8545",
    zksync: true,
  }
  : {
    url: "https://zksync2-testnet.zksync.dev",
    ethNetwork: "goerli",
    zksync: true,
    // contract verification endpoint
    verifyURL:
      "https://zksync2-testnet-explorer.zksync.dev/contract_verification",
  };

const config: HardhatUserConfig = {
  zksolc: {
    version: "latest",
    settings: {},
  },
  // this appeats to have some issues with causing LSP support
  // I think possibly becse we need to have the server running
  // you can uncomment this during development of contracts
  // defaultNetwork: "zkSyncTestnet",
  networks: {
    hardhat: {
      zksync: false,
    },
    zkSyncTestnet,
  },
  solidity: {
    version: "0.8.17",
  },
  typechain: {
    target: "ethers-v5",
  },
};

export default config;
