// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SharedObservationRegistry} from "./SharedObservationRegistry.sol";
import {FloorTypes as T} from "./FloorTypes.sol";

interface IHistoricalPriceFeed {
    function decimals() external view returns (uint8);
    /// @dev Chainlink proxy phase that currently owns newly reported rounds.
    function phaseId() external view returns (uint16);
    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Resolves the last published price at/before the observation, witnessed
/// by its immediate successor. Unsupported gaps/phase transitions fail closed.
contract ChainlinkObservationResolver {
    struct RoundData {
        uint80 id;
        int256 answer;
        uint256 started;
        uint256 updated;
        uint80 answered;
    }

    error InvalidFeed();
    error IncompatibleObservation();
    error InvalidRound();
    error InvalidWindow();

    IHistoricalPriceFeed public immutable feed;
    SharedObservationRegistry public immutable registry;
    bytes32 public immutable assetId;
    bytes32 public immutable sourceId;
    uint32 public immutable maxAge;
    uint8 public immutable priceDecimals;
    uint16 public immutable feedPhase;

    event FeedObservationFinalized(
        uint256 indexed observationId, uint80 indexed roundId, uint256 price, uint256 publishedAt
    );

    constructor(address curator, IHistoricalPriceFeed feed_, bytes32 assetId_, uint32 maxAge_) {
        if (address(feed_).code.length == 0 || assetId_ == bytes32(0) || maxAge_ == 0 || maxAge_ > 1 days) {
            revert InvalidFeed();
        }
        uint8 decimals_ = feed_.decimals();
        uint16 phase_ = feed_.phaseId();
        if (decimals_ > 18 || phase_ == 0) revert InvalidFeed();
        feed = feed_;
        assetId = assetId_;
        maxAge = maxAge_;
        priceDecimals = decimals_;
        feedPhase = phase_;
        sourceId = keccak256(abi.encode("CHAINLINK_LAST_BEFORE_V2", block.chainid, address(feed_), maxAge_, phase_));
        registry = new SharedObservationRegistry(curator, address(this));
    }

    function finalizeFromFeed(uint256 id, uint80 roundId) external {
        T.Observation memory obs = registry.observation(id);
        if (obs.assetId != assetId || obs.sourceId != sourceId || obs.priceDecimals != priceDecimals) {
            revert IncompatibleObservation();
        }
        uint80 nextRoundId = _checkedSuccessor(roundId);
        RoundData memory previous = _readRound(roundId);
        RoundData memory next = _readRound(nextRoundId);
        if (
            previous.id != roundId || next.id != nextRoundId || uint16(next.id >> 64) != feedPhase
                || previous.answer <= 0 || next.answer <= 0 || previous.answered < previous.id
                || next.answered < next.id || previous.started == 0 || previous.started > previous.updated
                || next.started == 0 || next.started > next.updated
        ) revert InvalidRound();
        if (
            previous.updated > obs.observationTime || next.updated <= obs.observationTime
                || next.updated > block.timestamp || obs.observationTime - previous.updated > maxAge
                || next.updated - obs.observationTime > maxAge
        ) revert InvalidWindow();
        uint256 price = uint256(previous.answer);
        if (price > T.MAX_PRICE) revert InvalidRound();
        registry.finalize(id, price);
        emit FeedObservationFinalized(id, roundId, price, previous.updated);
    }

    function _checkedSuccessor(uint80 roundId) private view returns (uint80 nextRoundId) {
        if (roundId == type(uint80).max || uint64(roundId) == type(uint64).max) revert InvalidRound();
        // A proxy retains old phase history. Reject archived rounds and any
        // witness whose adjacent round crosses a proxy upgrade boundary.
        if (uint16(roundId >> 64) != feedPhase || feed.phaseId() != feedPhase) revert InvalidRound();
        nextRoundId = roundId + 1;
        if (uint16(nextRoundId >> 64) != feedPhase) revert InvalidRound();
    }

    function _readRound(uint80 id) private view returns (RoundData memory round) {
        (round.id, round.answer, round.started, round.updated, round.answered) = feed.getRoundData(id);
    }
}
