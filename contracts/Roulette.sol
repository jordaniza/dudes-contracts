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

    struct Round {
        bool isOpen;
        uint256 winningNumber;
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
        require(rounds[round].isOpen, "Round is not open");
        _;
    }

    /// ======= INITIALIZERS =======

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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
        rounds[round].isOpen = true;
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

    /// ========= USER FUNCTIONS =========

    function _placeBet(int256 _amount, uint256 _number, address _gambler) internal {
        int256 newAmount = userBetsByRound[round][_gambler][_number].toInt256() + _amount;

        if (uint(newAmount) > maxBet) revert("Bet > maxBet");
        else if (newAmount < 0) revert("Bet < 0");

        userBetsByRound[round][_gambler][_number] = uint256(newAmount);
    }

    function placeBet(Bet[] memory _bets, string memory _strategy) external roundOpen {
        int totalBet = 0; 
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

    function collectWinnings(address _gambler, uint _round) external {
        uint winningNumber = rounds[_round].winningNumber;
        uint256 winnings = userBetsByRound[_round][_gambler][winningNumber];
        
        require(winnings > 0, "No winnings");
        userBetsByRound[_round][_gambler][winningNumber] = 0;

        bettingToken.transfer(_gambler, winnings);
        emit CollectedWinnings(_gambler, _round, winnings);
    }

    /// ============ UUPS UPGRADABLE ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
