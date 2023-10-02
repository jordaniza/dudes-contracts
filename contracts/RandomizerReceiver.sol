pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IRandomizerReceiver, IRandomizer} from "./interfaces/IRandomizer.sol";

/// @title  RandomizerReceiverUpgradeable
/// @notice RandomizerReceiver contract implements the IRandomizerReceiver interface to allow other contracts
///         to pay for and receive random numbers from the Randomizer contract
abstract contract RandomizerReceiverUpgradeable is
    IRandomizerReceiver,
    Initializable,
    OwnableUpgradeable
{
    /// ===== VARIABLES =====

    /// @notice address of the Randomizer contract
    IRandomizer public randomizer;

    /// @notice the latest random number received, will be reset once consumed
    bytes32 public latestRandomResult;

    /// @notice the latest request id received
    uint256 public latestRequestId;

    /// ===== EVENTS =====

    event UpdatedRandomizer(address indexed newRandomizer);
    event ReceivedRandom(uint256 indexed id, bytes32 random);

    /// ===== INITIALIZERS =====

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice initialize the contract with the randomizer and with an onwer
    function __RandomizerReceiver_init(
        address _randomizer
    ) internal onlyInitializing {
        __Ownable_init();
        setRandomizer(_randomizer);
    }

    /// ===== ADMIN FUNCTIONS =====

    /// @notice set the randomizer contract address
    function setRandomizer(address _randomizer) public onlyOwner {
        randomizer = IRandomizer(_randomizer);
        emit UpdatedRandomizer(_randomizer);
    }

    /// @notice owner can withdraw ETH from the randomizer contract to another account
    function withdrawFromRandomizer(
        address _receiver,
        uint256 amount
    ) external onlyOwner {
        randomizer.clientWithdrawTo(_receiver, amount);
    }

    /// @notice the randomizer contract expects to call this function where it can send some random bytes
    /// @dev    we save the random bytes in latestRandomResult, which can be interpreted by the contract
    function randomizerCallback(
        uint256 _id,
        bytes32 _randomNumber
    ) external override {
        require(msg.sender == address(randomizer), "Unauthorized");
        latestRandomResult = _randomNumber;
        emit ReceivedRandom(_id, _randomNumber);
    }

    /// @dev callable internally to request a random number from the randomizer contract
    ///      must be sufficient ETH in the randomizer contract to pay for the request
    function _requestRandomNumber(uint256 _callbackGasLimit) internal {
        latestRequestId = randomizer.request(_callbackGasLimit);
    }

    /// ===== PUBLIC FUNCTIONS =====

    /// @notice anybody can send ETH to the randomizer contract to pay for VRF Calls
    function depositToRandomizer() external payable {
        randomizer.clientDeposit{value: msg.value}(address(this));
    }

    /// ===== VIEW FUNCTIONS =====

    /// @notice check the balance of this contract in the randomizer contract
    function checkBalance() external view returns (uint256) {
        (uint256 deposit, uint256 reserved) = randomizer.clientBalanceOf(
            address(this)
        );
        return deposit - reserved;
    }
}
