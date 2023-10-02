// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

struct BloracleData {
    uint256 number;
    uint256 timestamp;
    bytes signature;
}

struct RequestData {
    uint256 id;
    address client;
    uint256 ethReserved;
    uint256 callbackGasLimit;
    uint8 confirmations;
}

interface IRandomizerZks {
    function registerValidator(address _validator) external;

    function unRegisterValidator(address _validator) external;

    function registerClient(address _client) external;

    function unRegisterClient(address _client) external;

    function request(uint256 _callbackGasLimit) external returns (uint256);

    function requestFast(
        uint256 _callbackGasLimit,
        bytes32 _seed,
        BloracleData calldata _bloracleData
    ) external returns (uint256);

    function estimateFeeFast(
        uint256 _callbackGasLimit
    ) external view returns (uint256);

    function estimateFeeFastUsingGasPrice(
        uint256 _callbackGasLimit,
        uint256 _gasPrice
    ) external view returns (uint256);

    function estimateFeeFastUsingConfirmations(
        uint256 _callbackGasLimit,
        uint256 _confirmations
    ) external view returns (uint256);

    function estimateFeeFastUsingConfirmationsAndGasPrice(
        uint256 _callbackGasLimit,
        uint256 _confirmations,
        uint256 _gasPrice
    ) external view returns (uint256);

    function clientDeposit(address _client) external payable;

    function clientWithdrawTo(address _reciver, uint _amount) external payable;

    function getFeeStats(
        uint256 _request
    ) external view returns (uint256[2] memory);

    function getRequest(
        uint256 _request
    )
        external
        view
        returns (
            bytes32 result,
            bytes32 dataHash,
            uint256 ethPaid,
            uint256 ethRefunded,
            bytes10[2] memory vrfHashes
        );
}

interface IRandomReceiver {
    function randomizerCallback(uint256 id, bytes32 value) external;
}
