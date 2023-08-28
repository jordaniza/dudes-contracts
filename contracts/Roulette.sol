pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// safecast
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

contract Roulette is Initializable, OwnableUpgradeable, UUPSUpgradeable {
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
        mapping (uint256 => uint256) totalBets;
    }

    uint256 round;
    uint256 maxBet;
    IERC20 bettingToken;

    // round => user => number => amount
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) userBetsByRound;

    // idx is the round
    Round[] rounds;

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
    function initialize(address _bettingToken) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        bettingToken = IERC20(_bettingToken);
    }

    /// ========= ADMIN FUNCTIONS =========

    function nextRound() external onlyOwner {
        round++;
    }

    function openRound() external onlyOwner {
        rounds[round].status = Status.OPEN;
    }

    function setMaxBet(uint256 _maxBet) external onlyOwner {
        maxBet = _maxBet;
    }

    function setBettingToken(address _bettingToken) external onlyOwner {
        bettingToken = IERC20(_bettingToken);
    }

    function withdraw(address _to, uint256 _amount) external onlyOwner {
        bettingToken.transfer(_to, _amount);
    }

    function requestSpin() external onlyOwner {
        rounds[round].status = Status.LOCKED;
        // TODO: request spin from oracle
    }

    function setSpinResult() external onlyOwner {
        rounds[round].status = Status.CLOSED;
        // TODO: set spin result from oracle
    }

    /// ========= USER FUNCTIONS =========

    function _placeBet(int256 _amount, uint256 _number, address _gambler) internal {
        // check the bet is within the max bet for the user
        int256 newAmount = userBetsByRound[round][_gambler][_number].toInt256() + _amount;
        if (uint256(newAmount) > maxBet) revert("Bet > maxBet");
        else if (newAmount < 0) revert("Bet < 0");

        // check the bet is within the max bet for the round
        int newTotalBet = rounds[round].totalBets[_number].toInt256() + _amount;        
        require(uint(newTotalBet) * 36 <= bettingToken.balanceOf(address(this)), "Cannot payout winnings");

        // update the state
        rounds[round].totalBets[_number] = uint256(newTotalBet);
        userBetsByRound[round][_gambler][_number] = uint256(newAmount);
    }

    function placeBet(Bet[] memory _bets, string memory _strategy) external roundOpen {
        int256 totalBet = 0;
        for (uint256 i = 0; i < _bets.length; i++) {
            int256 amount = _bets[i].amount;
            uint256 number = _bets[i].number;
            require(number <= 36, "Number must be between 0 and 36");
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
