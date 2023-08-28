pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/ISeeder.sol";

abstract contract SeedReceiverUpgradeable is IRandomReceiver, Initializable, OwnableUpgradeable {
    IRandomizerZks public seeder;

    bytes32 public latestRandomResult;
    uint256 public latestRequestId;

    event UpdatedSeeder(address indexed newSeeder);
    event ReceivedRandom(uint256 indexed id, bytes32 random); 

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __SeedReciever_init(address _seed) public onlyInitializing {
        __Ownable_init();
        setSeeder(_seed);
    }

    function topUp() external payable {
        seeder.clientDeposit{value: msg.value}(msg.sender);
    }

    function withdraw(uint256 amount) external onlyOwner {
        seeder.clientWithdrawTo(msg.sender, amount);
    }

    function setSeeder(address _seed) public onlyOwner {
        seeder = IRandomizerZks(_seed);
        seeder.registerClient(address(this));
        emit UpdatedSeeder(_seed);
    }

    function randomizerCallback(uint256 _id, bytes32 _randomNumber) external override {
        require(msg.sender == address(seeder), "Unauthorized");
        latestRandomResult = _randomNumber;
        emit ReceivedRandom(_id, _randomNumber);
    }

    function _requestRandomNumber(uint256 _callbackGasLimit) internal {
        // request fast can be done if we pass in the seed and bloracle data
        // but we need to test as the gist is inconsistent
        latestRequestId = seeder.request(_callbackGasLimit);
    }
}
