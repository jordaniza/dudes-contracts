# zkSync Hardhat project

This project was scaffolded with [zksync-cli](https://github.com/matter-labs/zksync-cli).

## Project structure

- `/contracts`: smart contracts.
- `/deploy`: deployment and contract interaction scripts.
- `/test`: test files
- `hardhat.config.ts`: configuration file.

## Commands

We run separate test suites for unit vs integration tests. Check the package json for details. In particular, {command}:hh runs hardhat commands, while {command}:zk runs zkSync commands.

- Hardhat tests are fast, and stable. You can test contract logic using these.
- ZkSync tests are slow, and require a docker container running a zkSync node. The packages also have bugs. That said, they are using the actual ZkEVM, so they are good to run integration tests.

The hardhat config reads from an env var USE_ZKEVM="true|false", this builds the relevant HH config file for the tests.

## Environment variables

In order to prevent users to leak private keys, this project includes the `dotenv` package which is used to load environment variables. It's used to load the wallet private key, required to run the deploy script.

To use it, rename `.env.example` to `.env` and enter your private key.

```
WALLET_PRIVATE_KEY=123cde574ccff....
```

### Local testing

In order to run test, you need to start the zkSync local environment. Please check [this section of the docs](https://v2-docs.zksync.io/api/hardhat/testing.html#prerequisites) which contains all the details.

The era node is buggy. You need to start the docker environment instead.

If you do not start the zkSync local environment, the tests will fail with error `Error: could not detect network (event="noNetwork", code=NETWORK_ERROR, version=providers/5.7.2)`

## Official Links

- [Website](https://zksync.io/)
- [Documentation](https://v2-docs.zksync.io/dev/)
- [GitHub](https://github.com/matter-labs)
- [Twitter](https://twitter.com/zksync)
- [Discord](https://discord.gg/nMaPGrDDwk)

### Summary of Randomizer zkSync Quick Start Guide:

- Randomizer on zkSync is an MVP protocol designed to provide a new reliable Verifiable Random Function (VRF).
- To use Randomizer with your smart contracts, familiarize yourself with their documentation.
- Use the Randomizer service to generate non-deterministic seeds for VRF requests.

### Randomizer zkSync MVP Flowchart:

- A user initiates a function in your DApp contract to request a random number.
- The DApp contract communicates this request to your Randomizer contract, which saves the information and activates an event.
- Your randomizer service (a server operated by you) provides the Randomizer contract an off-chain random seed.
- Your Randomizer contract, through its seedRequest function, asks the Randomizer contract for a random number.
- Two selected beacons produce Verifiable Random Function (VRF) proofs, which are then shared using a private off-chain P2P protocol.
- All beacons verify the VRF proofs and share their signatures on the P2P network.
- Upon receiving the necessary signatures, a beacon creates a transaction containing the VRF proofs and their approval signatures.
- The Randomizer contract checks the signatures, triggers an event, but doesn't callback yet.
- The Randomizer service watches for the VRF proofs and checks them, ensuring they are valid. It can suspend the Randomizer contract if they aren't.
- After a one-block window, a beacon triggers the Randomizer contract's callback function, subsequently initiating the Randomizer contract's callback function, and then the DApp contract's callback function.
  Tutorial:

- Deployment: Deploy the Randomizer contract to zkSync. Use the given Randomizer zkSync Testnet Address in the Randomizer's constructor.
- Register Client Contract: Make sure your client contract interfaces with the Randomizer and not directly with Randomizer.
- Deposits: Deposit ETH for your Client contract fees through the randomizer's clientDeposit function. Your client contract must deposit the estimateFee ETH using the clientDeposit function.
- Request a Random Number: Use the request function from the client contract.
- Seed Request: Your Randomizer service will use the seedRequest function.
- Handle the Callback: The RandomizerFast contract will automatically call the randomizerCallback function in your Randomizer contract.
- Withdraw Balance: Clients can use the clientWithdrawTo function.

#### Events to Watch:

PrepareRequest, Seed, RegisterClient, UnregisterClient, ClientDepositEth, ClientWithdrawTo.

#### Additional Functions:

- View functions like getFeeStats and getRequest.
- Functions for transferring contract ownership.
- Functions for registering/unregistering validators.
  Ensure your contracts are upgradeable, as zkSync might introduce breaking changes. Always ensure safety and understand the flowchart thoroughly before integrating.
