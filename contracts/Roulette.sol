/// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// dependencies
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {RandomizerReceiverUpgradeable as RandomizerReceiver} from "./RandomizerReceiver.sol";

/// interfaces
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IRandomizer.sol";

/// libraries
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

/**
 * @title Roulette
 * @author DudesNFT
 * @notice This contract allows users to place bets on a roulette wheel
 */
contract Roulette is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    RandomizerReceiver
{
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    /// ======= STRUCTS =======

    struct Bet {
        int256 amount;
        uint256 number;
    }

    /// @notice status of a betting round
    /// NOT_STARTED - the round has not started yet
    /// OPEN - the round is open for bets
    /// LOCKED - the round is locked and waiting for a random number to be generated
    /// CLOSED - the round is closed and the winning number has been determined
    enum Status {
        NOT_STARTED,
        OPEN,
        LOCKED,
        CLOSED
    }

    /// @notice a betting round
    /// status - the status of the round
    /// winningNumber - the winning number for the round
    /// totalBets - the total amount bet on each number
    struct Round {
        Status status;
        uint256 winningNumber;
        // number => amount
        mapping(uint256 => uint256) totalBets;
    }

    /// ======= STATE VARIABLES =======

    /// @notice auto-incrementing round number
    uint256 public round;

    /// @notice the maximum bet that we allow a user to place, set by the admin
    /// @dev    check if this can be gamed with multiple bets
    uint256 public maxBet;

    /// @notice the token that is used for betting
    IERC20 public bettingToken;

    // round => user => number => amount
    mapping(uint256 => mapping(address => mapping(uint256 => uint256)))
        public userBetsByRound;

    /// @notice rounds indexed by `round`
    Round[] public rounds;

    /// ======= EVENTS =======

    event BetPlaced(
        address indexed gambler,
        uint256 indexed round,
        Bet[] bets,
        string strategy
    );
    event CollectedWinnings(
        address indexed gambler,
        uint256 indexed round,
        uint256 winnings
    );

    /// ======= MODIFIERS =======

    modifier roundOpen(uint _round) {
        require(rounds[_round].status == Status.OPEN, "Round is not open");
        _;
    }

    modifier roundLocked(uint _round) {
        require(rounds[_round].status == Status.LOCKED, "Round is not locked");
        _;
    }

    modifier roundClosed(uint _round) {
        require(rounds[_round].status == Status.CLOSED, "Round is not closed");
        _;
    }

    /// ======= INITIALIZERS =======

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice initialize the contract, sets owner, randomizer, and betting token, then creates the first round
    function initialize(
        address _bettingToken,
        address _randomizer
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __RandomizerReceiver_init(_randomizer);
        bettingToken = IERC20(_bettingToken);
        // initialize the first round to defaults
        rounds.push();
    }

    /// ========= ADMIN FUNCTIONS =========

    /// @notice increment the round number and create a new round
    function nextRound() external onlyOwner {
        require(rounds[round].status == Status.CLOSED, "Round is not closed");
        round++;
        rounds.push();
    }

    /// @notice open the current round for betting
    function openRound() external onlyOwner {
        require(
            rounds[round].status == Status.NOT_STARTED,
            "Round cannot be opened"
        );
        rounds[round].status = Status.OPEN;
    }

    /// @notice changes the maximum bet that a user can place
    function setMaxBet(uint256 _maxBet) external onlyOwner {
        maxBet = _maxBet;
    }

    /// @notice changes the token that is used for betting
    function setBettingToken(address _bettingToken) external onlyOwner {
        bettingToken = IERC20(_bettingToken);
    }

    /// @notice the owner can withdraw betting tokens from the contract
    function withdraw(address _to, uint256 _amount) external onlyOwner {
        bettingToken.safeTransfer(_to, _amount);
    }

    /// @notice owner can request a random number from the randomizer
    /// @dev    can only be called when the round is locked
    function requestSpin(
        uint256 _gasLimit
    ) external onlyOwner roundOpen(round) {
        rounds[round].status = Status.LOCKED;
        _requestRandomNumber(_gasLimit);
    }

    /// @notice owner retrieves the latest random number from the randomizer and sets the winning number for the round
    /// @dev    can only be called when the round is closed
    ///         resets the latest random result to the empty string
    function setSpinResult() external onlyOwner roundLocked(round) {
        require(latestRandomResult != bytes32(""), "No spin result");
        rounds[round].status = Status.CLOSED;
        rounds[round].winningNumber = uint256(latestRandomResult) % 37;
        latestRandomResult = bytes32("");
    }

    /// ========= USER FUNCTIONS =========

    /// @dev internally place a bet, this can be called by public functions with different bet presets
    function _placeBet(
        int256 _amount,
        uint256 _number,
        address _gambler
    ) internal {
        // check the bet is within the max bet for the user
        int256 newAmount = userBetsByRound[round][_gambler][_number]
            .toInt256() + _amount;
        if (uint256(newAmount) > maxBet) revert("Bet > maxBet");
        else if (newAmount < 0) revert("Bet < 0");

        // check the bet is within the max bet for the round
        // not sure it makes sense to do this...you'd have to save the total payouts that are unclaimed
        // from previous rounds
        int256 newTotalBet = rounds[round].totalBets[_number].toInt256() +
            _amount;
        require(
            uint256(newTotalBet) * 36 <= bettingToken.balanceOf(address(this)),
            "Cannot payout winnings"
        );

        // update the state
        rounds[round].totalBets[_number] = uint256(newTotalBet);
        userBetsByRound[round][_gambler][_number] = uint256(newAmount);
    }

    /// @notice place one or more bets on the current round
    /// @param _bets an array of bets to place, can be duplicates, in which case the amount is cumulative
    /// @param _strategy a string describing the strategy used to place the bets
    function placeBet(
        Bet[] memory _bets,
        string memory _strategy
    ) external roundOpen(round) {
        int256 totalBet = 0;
        for (uint256 i = 0; i < _bets.length; i++) {
            int256 amount = _bets[i].amount;
            uint256 number = _bets[i].number;
            require(number <= 36, "Invalid number");
            _placeBet(amount, number, msg.sender);
            totalBet += amount;
        }

        bettingToken.safeTransferFrom(
            msg.sender,
            address(this),
            uint256(totalBet)
        );
        emit BetPlaced(msg.sender, round, _bets, _strategy);
    }

    /// @notice winners can collect their winnings after the round is closed
    /// @param _gambler the address of the gambler. Can collect on behalf of another
    /// @param _round the round number
    function collectWinnings(
        address _gambler,
        uint256 _round
    ) external roundClosed(_round) {
        // fetch any bets the user made for the winning number
        // if winning number is zero, that's the same as the uninitialized value
        // so it's absolutely vital that the round is closed after setting the winning number
        uint256 winningNumber = rounds[_round].winningNumber;
        uint256 winningBet = userBetsByRound[_round][_gambler][winningNumber];

        require(winningBet > 0, "No winnings");
        userBetsByRound[_round][_gambler][winningNumber] = 0;

        bettingToken.safeTransfer(_gambler, winningBet * 36);
        emit CollectedWinnings(_gambler, _round, winningBet * 36);
    }

    /// ============ UUPS UPGRADABLE ============

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
