pragma solidity ^0.8.0;

import "./DudeToken.sol";
import "./Roulette.sol";

contract DudeTokenV2 is Dude {
  function isUpgraded() external pure  returns (bool) {
    return true;
  }
}

contract RouletteV2 is Roulette {
  function isUpgraded() external pure  returns (bool) {
    return true;
  }
}


