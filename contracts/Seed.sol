// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interfaces/ISeeder.sol";

contract Seeder {
    IRandomizerZks randomizer;

    mapping(uint256 => RequestData) public requests;
    mapping(uint256 => uint256) public randomizerIdToRequestId;
    mapping(uint256 => uint256) public requestIdToRandomizerId;
    mapping(address => bool) public isRegistered;
    mapping(address => uint256) public clientBalanceOf;
    mapping(address => uint256) public clientReserved;
    mapping(address => bool) public isValidator;
    uint256 public nextId = 1;
    uint8 private entered = 1;
    bool paused = false;
    address public owner;

    event PrepareRequest(
        uint256 indexed id,
        address indexed client,
        uint256 ethReserved,
        uint256 callbackGasLimit,
        uint8 confirmations
    );
    event OwnershipTransferred(
        address indexed lastOwner,
        address indexed newOwner
    );
    event ClientWithdrawTo(
        address indexed client,
        address indexed to,
        uint256 amount
    );
    event RegisterValidator(address indexed validator);
    event UnregisterValidator(address indexed validator);
    event ClientDepositEth(address indexed client, uint256 amount);
    event RegisterClient(address indexed client);
    event UnregisterClient(address indexed client);

    event Seed(uint256 indexed id, bytes32 seed);
    event Paused();
    event Unpaused();
    constructor(address _randomizerContractAddress) {
        randomizer = IRandomizerZks(_randomizerContractAddress);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Unauthorized");

        _;
    }

    modifier reentrancy() {
        require(entered == 1, "Reentrancy");
        entered = 2;

        _;

        entered = 1;
    }

    modifier unpaused() {
        require(!paused, "Paused");

        _;
    }

    modifier onlyValidator() {
        require(isValidator[msg.sender] || msg.sender == owner, "Unauthorized");

        _;
    }

    function registerValidator(address _validator) external onlyOwner {
        isValidator[_validator] = true;
        emit RegisterValidator(_validator);
    }

    function unRegisterValidator(address _validator) external onlyOwner {
        isValidator[_validator] = false;
        emit UnregisterValidator(_validator);
    }

    function getFeeStats(
        uint256 _request
    ) external view returns (uint256[2] memory) {
        return randomizer.getFeeStats(requestIdToRandomizerId[_request]);
    }

    function requestToFeePaid(uint256 _request) public view returns (uint256) {
        return randomizer.getFeeStats(requestIdToRandomizerId[_request])[0];
    }

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
        )
    {
        return randomizer.getRequest(requestIdToRandomizerId[_request]);
    }

    function transferOwnership(address _owner) external onlyOwner {
        owner = _owner;
        emit OwnershipTransferred(msg.sender, _owner);
    }

    function registerClient(address _client) external onlyOwner {
        isRegistered[_client] = true;
        emit RegisterClient(_client);
    }

    function unRegisterClient(address _client) external onlyOwner {
        isRegistered[_client] = false;
        emit UnregisterClient(_client);
    }

    function clientDeposit(address _client) external payable unpaused {
        require(msg.value > 0, "Invalid value");
        randomizer.clientDeposit{value: msg.value}(address(this));
        clientBalanceOf[_client] += msg.value;
        emit ClientDepositEth(_client, msg.value);
    }

    function clientWithdrawTo(address _to, uint256 _amount) public {
        // Require that the amount is less than the user's balance minus their reserved balance
        require(
            clientBalanceOf[msg.sender] - clientReserved[msg.sender] >= _amount,
            "TOO_MUCH_RESERVED"
        );
        clientBalanceOf[msg.sender] -= _amount;
        (bool success, ) = payable(_to).call{value: _amount}("");
        require(success, "Transfer failed.");
        emit ClientWithdrawTo(msg.sender, _to, _amount);
    }

    function request(
        uint256 _callbackGasLimit
    ) external payable returns (uint256) {
        return _requestFast(_callbackGasLimit, 1);
    }

    function request(
        uint256 _callbackGasLimit,
        uint8 _confirmations
    ) external payable returns (uint256) {
        require(_confirmations > 0, "Invalid confirmations");
        return _requestFast(_callbackGasLimit, _confirmations);
    }

    function _requestFast(
        uint256 _callbackGasLimit,
        uint8 _confirmations
    ) private reentrancy unpaused returns (uint256) {
        require(isRegistered[msg.sender] == true, "Invalid client");
        // Add 25% since we are making the real request at a later block
        uint256 feeEstimate = (estimateFeeUsingConfirmations(
            _callbackGasLimit,
            _confirmations
        ) * 125) / 100;
        require(
            clientBalanceOf[msg.sender] - clientReserved[msg.sender] >=
                feeEstimate,
            "Insufficient ETH sent"
        );

        uint256 id = nextId++;
        RequestData memory requestData = RequestData(
            id,
            msg.sender,
            feeEstimate,
            _callbackGasLimit,
            _confirmations
        );

        clientReserved[msg.sender] += feeEstimate;

        requests[id] = requestData;

        emit PrepareRequest(
            id,
            msg.sender,
            feeEstimate,
            _callbackGasLimit,
            _confirmations
        );

        return id;
    }

    function estimateFee(
        uint256 _callbackGasLimit
    ) public view returns (uint256) {
        return
            randomizer.estimateFeeFast(_callbackGasLimit) +
            (160000 * tx.gasprice); // add 130k Seeder callback gas
    }

    function estimateFeeUsingConfirmations(
        uint256 _callbackGasLimit,
        uint8 _confirmations
    ) public view returns (uint256) {
        return
            randomizer.estimateFeeFastUsingConfirmations(
                _callbackGasLimit,
                _confirmations
            ) + (160000 * tx.gasprice); // add 130k Seeder callback gas
    }

    function estimateFeeUsingConfirmationsAndGasPrice(
        uint256 _callbackGasLimit,
        uint8 _confirmations,
        uint256 _gasPrice
    ) public view returns (uint256) {
        return
            randomizer.estimateFeeFastUsingConfirmationsAndGasPrice(
                _callbackGasLimit,
                _confirmations,
                _gasPrice
            ) + (160000 * tx.gasprice); // add 130k Seeder callback gas
    }

    function estimateFeeUsingGasPrice(
        uint256 _callbackGasLimit,
        uint256 _gasPrice
    ) public view returns (uint256) {
        return
            randomizer.estimateFeeFastUsingGasPrice(
                _callbackGasLimit,
                _gasPrice
            ) + (155000 * _gasPrice); // add 130k Seeder callback gas
    }

    function seedRequest(
        uint256 _id,
        bytes32 _seed,
        BloracleData calldata _bloracleData
    ) external onlyOwner unpaused {
        require(requestIdToRandomizerId[_id] == 0, "Already seeded");
        uint256 randomizerId = randomizer.requestFast(
            requests[_id].callbackGasLimit,
            _seed,
            _bloracleData
        );
        randomizerIdToRequestId[randomizerId] = _id;
        requestIdToRandomizerId[_id] = randomizerId;

        emit Seed(_id, _seed);
    }

    function randomizerCallback(
        uint256 _id,
        bytes32 _value
    ) external reentrancy unpaused {
        require(msg.sender == address(randomizer), "Invalid sender");

        uint256 requestId = randomizerIdToRequestId[_id];

        RequestData memory requestData = requests[requestId];

        clientReserved[requestData.client] -= requestData.ethReserved;

        IRandomReceiver(requestData.client).randomizerCallback(
            requestId,
            _value
        );
    }

    function pause() external onlyValidator {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyValidator {
        paused = false;
        emit Unpaused();
    }
}
