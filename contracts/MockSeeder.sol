// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interfaces/ISeeder.sol";

contract MockSeeder {
    uint256 public nextId = 1;
    mapping(uint256 => RequestData) public requests;
    mapping(uint256 => uint256) public randomizerIdToRequestId;
    mapping(uint256 => uint256) public requestIdToRandomizerId;
    mapping(address => bool) public isRegistered;
    mapping(address => uint256) public clientBalanceOf;
    mapping(address => uint256) public clientReserved;

    event PrepareRequest(
        uint256 indexed id, address indexed client, uint256 ethReserved, uint256 callbackGasLimit, uint8 confirmations
    );
    event OwnershipTransferred(address indexed lastOwner, address indexed newOwner);
    event ClientWithdrawTo(address indexed client, address indexed to, uint256 amount);
    event ClientDepositEth(address indexed client, uint256 amount);
    event RegisterClient(address indexed client);
    event UnregisterClient(address indexed client);
    event Seed(uint256 indexed id, bytes32 seed);

    uint256 public estimatedFee;

    constructor() {}

    function __MOCK_setEstimatedFee(uint256 _estimatedFee) external {
        estimatedFee = _estimatedFee;
    }

    function registerClient(address _client) external {
        isRegistered[_client] = true;
        emit RegisterClient(_client);
    }

    function clientDeposit(address _client) external payable {
        require(msg.value > 0, "Invalid value");
        clientBalanceOf[_client] += msg.value;
        emit ClientDepositEth(_client, msg.value);
    }

    function clientWithdrawTo(address _to, uint256 _amount) public {
        require(clientBalanceOf[msg.sender] - clientReserved[msg.sender] >= _amount, "TOO_MUCH_RESERVED");
        clientBalanceOf[msg.sender] -= _amount;
        (bool success, ) = payable(_to).call{value: _amount}("");
        require(success, "Transfer failed");
        emit ClientWithdrawTo(msg.sender, _to, _amount);
    }

    function request(uint256 _callbackGasLimit) external payable returns (uint256) {
        return _requestFast(_callbackGasLimit, 1);
    }

    function _requestFast(uint256 _callbackGasLimit, uint8 _confirmations) private returns (uint256) {
        require(isRegistered[msg.sender] == true, "Invalid client");
        uint256 feeEstimate = estimatedFee;
        require(clientBalanceOf[msg.sender] - clientReserved[msg.sender] >= feeEstimate, "Insufficient ETH sent");

        uint256 id = nextId++;
        RequestData memory requestData = RequestData(id, msg.sender, feeEstimate, _callbackGasLimit, _confirmations);
        clientReserved[msg.sender] += feeEstimate;
        requests[id] = requestData;

        emit PrepareRequest(id, msg.sender, feeEstimate, _callbackGasLimit, _confirmations);
        return id;
    }

    function seedRequest(uint256 _id, bytes32 _seed, BloracleData calldata) external {
        require(requestIdToRandomizerId[_id] == 0, "Already seeded");
        uint256 randomizerId = 1;
        requestIdToRandomizerId[_id] = randomizerId;
        emit Seed(_id, _seed);
    }

    function randomizerCallback(uint256 _id, bytes32 _value) external {
        uint256 requestId = randomizerIdToRequestId[_id];
        RequestData memory requestData = requests[requestId];
        clientReserved[requestData.client] -= requestData.ethReserved;
        IRandomReceiver(requestData.client).randomizerCallback(requestId, _value);
    }
}
