// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FloorTypes as T} from "./FloorTypes.sol";
import {OutcomeMarketFactory} from "./OutcomeMarketFactory.sol";
import {OutcomeTokens} from "./OutcomeTokens.sol";
import {SharedObservationRegistry} from "./SharedObservationRegistry.sol";

/// @notice Restricted grammar: YES(lower GEQ) + NO(upper GEQ), exact shared observation.
contract FloorVerifier {
    bytes32 public constant PROOF_VERSION = keccak256("FLOOR_PAIR_GEQ_V1");
    OutcomeMarketFactory public immutable factory;
    OutcomeTokens public immutable tokens;
    SharedObservationRegistry public immutable registry;

    constructor(OutcomeMarketFactory factory_) {
        factory = factory_;
        tokens = factory_.tokens();
        registry = factory_.registry();
    }

    /// @return result reasonCode: 0 OK, 1 unknown, 2 observation mismatch, 3 strikes,
    /// 4 empty units, 5 closed, 6 disabled, 7 wrong sides.
    function verifyPair(uint256 lower, uint256 upper, uint64 qLower, uint64 qUpper)
        public
        view
        returns (T.VerifiedFloor memory result)
    {
        result.proofVersion = PROOF_VERSION;
        if (qLower == 0 || qUpper == 0) {
            result.reasonCode = 4;
            return result;
        }
        if (lower == 0 || upper == 0 || lower > factory.marketCount() || upper > factory.marketCount()) {
            result.reasonCode = 1;
            return result;
        }
        T.Market memory l = factory.getMarket(lower);
        T.Market memory u = factory.getMarket(upper);
        if (l.observationId != u.observationId) {
            result.reasonCode = 2;
            return result;
        }
        result.observationId = l.observationId;
        if (l.strike >= u.strike) {
            result.reasonCode = 3;
            return result;
        }
        T.Observation memory obs = registry.observation(l.observationId);
        if (obs.state != T.ObservationState.UNRESOLVED || block.timestamp >= obs.observationTime) {
            result.reasonCode = 5;
            return result;
        }
        if (!l.enabledForNewCollateral || !u.enabledForNewCollateral) {
            result.reasonCode = 6;
            return result;
        }
        result.valid = true;
        result.floorUsdcBase = uint256(qLower < qUpper ? qLower : qUpper) * T.UNIT;
    }

    function verifySelection(
        uint256 lower,
        uint256 upper,
        uint64 qLower,
        uint64 qUpper,
        T.Side sideLower,
        T.Side sideUpper
    ) external view returns (T.VerifiedFloor memory result) {
        if (sideLower != T.Side.YES || sideUpper != T.Side.NO) {
            result.proofVersion = PROOF_VERSION;
            result.reasonCode = 7;
            return result;
        }
        return verifyPair(lower, upper, qLower, qUpper);
    }
}
