// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {FloorTypes as T} from "./FloorTypes.sol";
import {SharedObservationRegistry} from "./SharedObservationRegistry.sol";
import {OutcomeTokens} from "./OutcomeTokens.sol";

contract OutcomeMarketFactory is Ownable2Step {
    error InvalidMarket();
    error UnknownMarket();
    error InvalidCollateral();

    SharedObservationRegistry public immutable registry;
    IERC20Metadata public immutable collateral;
    OutcomeTokens public immutable tokens;
    uint256 public marketCount;
    mapping(uint256 => T.Market) private _markets;
    mapping(uint256 => mapping(uint256 => bool)) private _strikeExists;

    event MarketCreated(uint256 indexed marketId, uint256 indexed observationId, uint256 strike);
    event MarketEligibilityChanged(uint256 indexed marketId, bool enabled);

    constructor(address curator, SharedObservationRegistry registry_, IERC20Metadata collateral_) Ownable(curator) {
        if (address(registry_) == address(0) || address(collateral_).code.length == 0 || collateral_.decimals() != 6) {
            revert InvalidCollateral();
        }
        registry = registry_;
        collateral = collateral_;
        tokens = new OutcomeTokens(address(this), registry_, collateral_);
    }

    function createMarket(uint256 observationId, uint256 strike) external onlyOwner returns (uint256 id) {
        T.Observation memory obs = registry.observation(observationId);
        if (
            strike == 0 || strike > T.MAX_PRICE || _strikeExists[observationId][strike]
                || obs.state != T.ObservationState.UNRESOLVED || block.timestamp >= obs.observationTime
                || marketCount >= 4096
        ) revert InvalidMarket();
        id = ++marketCount;
        _markets[id] = T.Market(id, observationId, strike, true);
        _strikeExists[observationId][strike] = true;
        emit MarketCreated(id, observationId, strike);
    }

    function getMarket(uint256 id) external view returns (T.Market memory market) {
        market = _markets[id];
        if (market.id == 0) revert UnknownMarket();
    }

    /// @notice Changes eligibility for NEW inventory only, never existing redemption rights.
    function setEnabled(uint256 id, bool enabled) external onlyOwner {
        if (_markets[id].id == 0) revert UnknownMarket();
        _markets[id].enabledForNewCollateral = enabled;
        emit MarketEligibilityChanged(id, enabled);
    }

    function tokenId(uint256 marketId, T.Side side) external pure returns (uint256) {
        return marketId * 2 + 1 + uint256(side);
    }
}
