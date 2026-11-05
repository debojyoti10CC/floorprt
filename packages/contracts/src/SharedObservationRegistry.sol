// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FloorTypes as T} from "./FloorTypes.sol";

contract SharedObservationRegistry is Ownable2Step {
    error InvalidObservation();
    error UnknownObservation();
    error UnauthorizedResolver();
    error TooEarly();
    error AlreadyTerminal();
    error InvalidPrice();

    address public immutable resolver;
    bytes32 public constant POLICY = keccak256("FLOOR_SHARED_GEQ_50_50_V1");
    uint256 public observationCount;
    mapping(uint256 => T.Observation) private _observations;

    event ObservationRegistered(uint256 indexed observationId, bytes32 indexed assetId, uint64 observationTime);
    event ObservationFinalized(uint256 indexed observationId, uint256 price);
    event ObservationCancelled(uint256 indexed observationId);

    constructor(address curator, address testResolver) Ownable(curator) {
        if (testResolver == address(0)) revert InvalidObservation();
        resolver = testResolver;
    }

    function registerObservation(
        bytes32 assetId,
        uint64 observationTime,
        uint8 priceDecimals,
        bytes32 sourceId,
        bytes32 resolutionPolicyHash,
        uint64 cancelAfter
    ) external onlyOwner returns (uint256 id) {
        if (
            assetId == bytes32(0) || sourceId == bytes32(0) || priceDecimals > 18 || observationTime <= block.timestamp
                || cancelAfter <= observationTime || resolutionPolicyHash != POLICY
        ) revert InvalidObservation();
        id = ++observationCount;
        _observations[id] = T.Observation({
            assetId: assetId,
            observationTime: observationTime,
            priceDecimals: priceDecimals,
            sourceId: sourceId,
            resolutionPolicyHash: resolutionPolicyHash,
            cancelAfter: cancelAfter,
            state: T.ObservationState.UNRESOLVED,
            price: 0,
            resolver: resolver
        });
        emit ObservationRegistered(id, assetId, observationTime);
    }

    function observation(uint256 id) public view returns (T.Observation memory obs) {
        obs = _observations[id];
        if (obs.observationTime == 0) revert UnknownObservation();
    }

    function finalize(uint256 id, uint256 canonicalPrice) external {
        T.Observation storage obs = _observations[id];
        if (obs.observationTime == 0) revert UnknownObservation();
        if (msg.sender != obs.resolver) revert UnauthorizedResolver();
        if (obs.state != T.ObservationState.UNRESOLVED) revert AlreadyTerminal();
        if (block.timestamp < obs.observationTime) revert TooEarly();
        if (canonicalPrice > T.MAX_PRICE) revert InvalidPrice();
        obs.state = T.ObservationState.FINALIZED;
        obs.price = canonicalPrice;
        emit ObservationFinalized(id, canonicalPrice);
    }

    /// @notice Permissionless common longstop, never an independent market void.
    function cancel(uint256 id) external {
        T.Observation storage obs = _observations[id];
        if (obs.observationTime == 0) revert UnknownObservation();
        if (obs.state != T.ObservationState.UNRESOLVED) revert AlreadyTerminal();
        if (block.timestamp < obs.cancelAfter) revert TooEarly();
        obs.state = T.ObservationState.CANCELLED;
        emit ObservationCancelled(id);
    }
}
