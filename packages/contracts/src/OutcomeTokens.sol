// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FloorTypes as T} from "./FloorTypes.sol";
import {SharedObservationRegistry} from "./SharedObservationRegistry.sol";

interface IOutcomeFactory {
    function getMarket(uint256 id) external view returns (T.Market memory);
}

/// @notice Each complete set escrows exactly 1 test USDC; no privileged mint route.
contract OutcomeTokens is ERC1155Supply, ReentrancyGuard {
    using SafeERC20 for IERC20;
    error InvalidUnits();
    error ClosedMarket();
    error NotResolved();
    error BackingMismatch();
    error InvalidRecipient();

    address public immutable factory;
    SharedObservationRegistry public immutable registry;
    IERC20 public immutable collateral;
    mapping(uint256 => uint256) public escrow;

    event CompleteSetMinted(uint256 indexed marketId, address indexed user, uint256 units, uint256 collateral);
    event CompleteSetMerged(uint256 indexed marketId, address indexed user, uint256 units, uint256 collateral);
    event ClaimRedeemed(uint256 indexed marketId, address indexed user, uint8 side, uint256 units, uint256 payout);

    constructor(address factory_, SharedObservationRegistry registry_, IERC20 collateral_) ERC1155("") {
        factory = factory_;
        registry = registry_;
        collateral = collateral_;
    }

    function mintCompleteSet(uint256 marketId, uint64 units) external nonReentrant {
        if (units == 0) revert InvalidUnits();
        T.Market memory m = IOutcomeFactory(factory).getMarket(marketId);
        _requireOpen(m);
        uint256 amount = uint256(units) * T.UNIT;
        uint256 beforeBalance = collateral.balanceOf(address(this));
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        if (collateral.balanceOf(address(this)) - beforeBalance != amount) revert BackingMismatch();
        escrow[marketId] += amount;
        (uint256[] memory ids, uint256[] memory amounts) = _pair(marketId, units);
        _mintBatch(msg.sender, ids, amounts, "");
        emit CompleteSetMinted(marketId, msg.sender, units, amount);
    }

    function mergeCompleteSet(uint256 marketId, uint64 units) external nonReentrant {
        if (units == 0) revert InvalidUnits();
        T.Market memory m = IOutcomeFactory(factory).getMarket(marketId);
        T.Observation memory obs = registry.observation(m.observationId);
        if (obs.state != T.ObservationState.UNRESOLVED || block.timestamp >= obs.observationTime) {
            revert ClosedMarket();
        }
        (uint256[] memory ids, uint256[] memory amounts) = _pair(marketId, units);
        _burnBatch(msg.sender, ids, amounts);
        uint256 amount = uint256(units) * T.UNIT;
        escrow[marketId] -= amount;
        collateral.safeTransfer(msg.sender, amount);
        emit CompleteSetMerged(marketId, msg.sender, units, amount);
    }

    function payoutPerUnit(uint256 marketId, T.Side side) public view returns (uint256) {
        T.Market memory m = IOutcomeFactory(factory).getMarket(marketId);
        T.Observation memory obs = registry.observation(m.observationId);
        if (obs.state == T.ObservationState.UNRESOLVED) revert NotResolved();
        if (obs.state == T.ObservationState.CANCELLED) return T.HALF;
        bool yesWins = obs.price >= m.strike;
        return (side == T.Side.YES) == yesWins ? T.UNIT : 0;
    }

    function redeem(uint256 marketId, T.Side side, uint64 units) external nonReentrant returns (uint256) {
        return _redeem(marketId, side, units, msg.sender);
    }

    /// @notice Always burns msg.sender's claims. Operators cannot redirect somebody else's payout.
    function redeemFor(uint256 marketId, T.Side side, uint64 units, address recipient)
        external
        nonReentrant
        returns (uint256)
    {
        return _redeem(marketId, side, units, recipient);
    }

    function _redeem(uint256 marketId, T.Side side, uint64 units, address recipient) private returns (uint256 paid) {
        if (units == 0) revert InvalidUnits();
        if (recipient == address(0)) revert InvalidRecipient();
        paid = payoutPerUnit(marketId, side) * uint256(units);
        _burn(msg.sender, marketId * 2 + 1 + uint256(side), units);
        escrow[marketId] -= paid;
        if (paid != 0) collateral.safeTransfer(recipient, paid);
        emit ClaimRedeemed(marketId, msg.sender, uint8(side), units, paid);
    }

    function _requireOpen(T.Market memory m) private view {
        T.Observation memory obs = registry.observation(m.observationId);
        if (
            !m.enabledForNewCollateral || obs.state != T.ObservationState.UNRESOLVED
                || block.timestamp >= obs.observationTime
        ) revert ClosedMarket();
    }

    function _pair(uint256 id, uint64 units) private pure returns (uint256[] memory ids, uint256[] memory amounts) {
        ids = new uint256[](2);
        amounts = new uint256[](2);
        ids[0] = id * 2 + 1;
        ids[1] = id * 2 + 2;
        amounts[0] = units;
        amounts[1] = units;
    }
}
