pragma solidity ^0.8.0;

/// @title  IRandomizer
/// @notice Interface for the Randomizer.ai contract
/// @dev    Randomizer contract requires funding, this can be done via randomizer dashboard or via clientDeposit function
interface IRandomizer {
    /// @notice request a random number with a given callback gas limit
    function request(uint256 _callbackGasLimit) external returns (uint256);

    /// @notice request a random number with a given callback gas limit, wait for a given number of confirmations
    function request(
        uint256 _callbackGasLimit,
        uint256 _confirmations
    ) external returns (uint256);

    /// @notice remove deposited ETH from randomizer to another address
    function clientWithdrawTo(address _to, uint256 _amount) external;

    /// @notice deposit ETH to randomizer to pay for requests
    function clientDeposit(address _client) external payable;

    /// @notice Gets the amount of ETH deposited and reserved for the client contract
    function clientBalanceOf(
        address _client
    ) external view returns (uint256 deposit, uint256 reserved);

    /// @notice get the estimated fee for a given callback gas limit
    function estimateFee(uint256 callbackGasLimit) external returns (uint256);

    /// @notice get the estimated fee for a given callback gas limit and number of confirmations
    function estimateFee(
        uint256 callbackGasLimit,
        uint256 confirmations
    ) external returns (uint256);
}

/// @title  IRandomizerReceiver
/// @notice RandomizerReceiver contract receives random numbers from Randomizer contract
interface IRandomizerReceiver {
    /// @notice callback function to be implemented in contract that calls randomizer
    function randomizerCallback(uint256 _id, bytes32 _randomNumber) external;
}
