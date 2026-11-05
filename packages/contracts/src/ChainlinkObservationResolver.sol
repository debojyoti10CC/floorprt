// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SharedObservationRegistry} from "./SharedObservationRegistry.sol";
import {FloorTypes as T} from "./FloorTypes.sol";

interface IHistoricalPriceFeed {
    function decimals() external view returns (uint8);
    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Resolves the last published price at/before the observation, witnessed
/// by its immediate successor. Unsupported gaps/phase transitions fail closed.
contract ChainlinkObservationResolver {
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

    event FeedObservationFinalized(
        uint256 indexed observationId, uint80 indexed roundId, uint256 price, uint256 publishedAt
    );

    constructor(address curator, IHistoricalPriceFeed feed_, bytes32 assetId_, uint32 maxAge_) {
        if (address(feed_).code.length == 0 || assetId_ == bytes32(0) || maxAge_ == 0 || maxAge_ > 1 days) {
            revert InvalidFeed();
        }
        uint8 decimals_ = feed_.decimals();
        if (decimals_ > 18) revert InvalidFeed();
        feed = feed_;
        assetId = assetId_;
        maxAge = maxAge_;
        priceDecimals = decimals_;
        sourceId = keccak256(abi.encode("CHAINLINK_LAST_BEFORE_V1", block.chainid, address(feed_), maxAge_));
        registry = new SharedObservationRegistry(curator, address(this));
    }

    function finalizeFromFeed(uint256 id, uint80 roundId) external {
        T.Observation memory obs = registry.observation(id);
        if (obs.assetId != assetId || obs.sourceId != sourceId || obs.priceDecimals != priceDecimals) {
            revert IncompatibleObservation();
        }
        if (roundId == type(uint80).max || uint64(roundId) == type(uint64).max) revert InvalidRound();
        (uint80 returned, int256 answer, uint256 started, uint256 updated, uint80 answered) = feed.getRoundData(roundId);
        (uint80 next, int256 nextAnswer, uint256 nextStart, uint256 nextUpdated, uint80 nextAnswered) =
            feed.getRoundData(roundId + 1);
        if (
            returned != roundId || next != roundId + 1 || answer <= 0 || nextAnswer <= 0 || answered < returned
                || nextAnswered < next || started == 0 || started > updated || nextStart == 0 || nextStart > nextUpdated
        ) revert InvalidRound();
        if (
            updated > obs.observationTime || nextUpdated <= obs.observationTime || nextUpdated > block.timestamp
                || obs.observationTime - updated > maxAge || nextUpdated - obs.observationTime > maxAge
        ) revert InvalidWindow();
        uint256 price = uint256(answer);
        if (price > T.MAX_PRICE) revert InvalidRound();
        registry.finalize(id, price);
        emit FeedObservationFinalized(id, roundId, price, updated);
    }
}
