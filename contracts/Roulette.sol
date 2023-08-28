pragma solidity 0.8.17;

/// dependencies
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {SeedReceiverUpgradeable} from "./SeedReceiver.sol";

/// interfaces
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ISeeder.sol";

/// libraries
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "hardhat/console.sol";

contract Roulette is Initializable, OwnableUpgradeable, UUPSUpgradeable, SeedReceiverUpgradeable {
    using SafeCastUpgradeable for uint256;

    struct Bet {
        int256 amount;
        uint256 number;
    }

    enum Status {
        NOT_STARTED,
        OPEN,
        LOCKED,
        CLOSED
    }

    struct Round {
        Status status;
        uint256 winningNumber;
        // number => amount
        mapping(uint256 => uint256) totalBets;
    }

    uint256 public round;
    uint256 public maxBet;
    IERC20 public bettingToken;

    // round => user => number => amount
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public userBetsByRound;

    // idx is the round
    Round[] public rounds;

    event BetPlaced(address indexed gambler, uint256 indexed round, Bet[] bets, string strategy);
    event CollectedWinnings(address indexed gambler, uint256 indexed round, uint256 winnings);

    /// ======= MODIFIERS =======

    modifier roundOpen() {
        require(rounds[round].status == Status.OPEN, "Round is not open");
        _;
    }

    /// ======= INITIALIZERS =======

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice some helpers text
    function initialize(address _bettingToken, address _seeder) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __SeedReciever_init(_seeder);
        bettingToken = IERC20(_bettingToken);
        // initialize the first round to defaults
        rounds.push();
    }

    /// ========= ADMIN FUNCTIONS =========

    function nextRound() external onlyOwner {
        require(rounds[round].status == Status.CLOSED, "Round is not closed");
        round++;
        rounds.push();
    }

    function openRound() external onlyOwner {
        require(rounds[round].status == Status.NOT_STARTED, "Round cannot be opened");
        rounds[round].status = Status.OPEN;
    }

    function setMaxBet(uint256 _maxBet) external onlyOwner {
        maxBet = _maxBet;
    }

    function setBettingToken(address _bettingToken) external onlyOwner {
        bettingToken = IERC20(_bettingToken);
    }

    function withdraw(address _to, uint256 _amount) external onlyOwner {
        /// todo: should we be able to withdraw if this would cause contract to be unable to pay out winnings?
        bettingToken.transfer(_to, _amount);
    }

    function requestSpin(uint256 _gasLimit) external onlyOwner {
        rounds[round].status = Status.LOCKED;
        _requestRandomNumber(_gasLimit);
    }

    function setSpinResult() external onlyOwner {
        // todo: could have a valid range check here
        require(latestRandomResult != bytes32(""), "No spin result");
        rounds[round].status = Status.CLOSED;
        rounds[round].winningNumber = uint256(latestRandomResult) % 37;
        latestRandomResult = bytes32("");
    }

    /// ========= USER FUNCTIONS =========

    function _placeBet(int256 _amount, uint256 _number, address _gambler) internal {
        // check the bet is within the max bet for the user
        int256 newAmount = userBetsByRound[round][_gambler][_number].toInt256() + _amount;
        if (uint256(newAmount) > maxBet) revert("Bet > maxBet");
        else if (newAmount < 0) revert("Bet < 0");

        // check the bet is within the max bet for the round
        // not sure it makes sense to do this...you'd have to save the total payouts that are unclaimed
        // from previous rounds
        int256 newTotalBet = rounds[round].totalBets[_number].toInt256() + _amount;
        require(uint256(newTotalBet) * 36 <= bettingToken.balanceOf(address(this)), "Cannot payout winnings");

        // update the state
        rounds[round].totalBets[_number] = uint256(newTotalBet);
        userBetsByRound[round][_gambler][_number] = uint256(newAmount);
    }

    function placeBet(Bet[] memory _bets, string memory _strategy) external roundOpen {
        int256 totalBet = 0;
        for (uint256 i = 0; i < _bets.length; i++) {
            int256 amount = _bets[i].amount;
            uint256 number = _bets[i].number;
            require(number <= 36, "Invalid number");
            _placeBet(amount, number, msg.sender);
            totalBet += amount;
        }

        bettingToken.transferFrom(msg.sender, address(this), uint256(totalBet));
        emit BetPlaced(msg.sender, round, _bets, _strategy);
    }

    function collectWinnings(address _gambler, uint256 _round) external {
        uint256 winningNumber = rounds[_round].winningNumber;
        uint256 winnings = userBetsByRound[_round][_gambler][winningNumber];

        require(winnings > 0, "No winnings");
        userBetsByRound[_round][_gambler][winningNumber] = 0;

        bettingToken.transfer(_gambler, winnings);
        emit CollectedWinnings(_gambler, _round, winnings);
    }

    /// ============ UUPS UPGRADABLE ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
