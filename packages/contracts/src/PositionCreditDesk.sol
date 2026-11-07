// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {TraderCreditDesk} from "./TraderCreditDesk.sol";
import {ArcTestnet} from "./ArcTestnet.sol";

interface IConditionalTokens is IERC1155 {
    function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256);
    function getCollectionId(bytes32 parent, bytes32 conditionId, uint256 indexSet) external view returns (bytes32);
    function getPositionId(address collateral, bytes32 collectionId) external pure returns (uint256);
    function mergePositions(
        address collateral,
        bytes32 parent,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external;
}

/// @notice Local pilot for one approved, fully backed binary Conditional Tokens market.
contract PositionCreditDesk is TraderCreditDesk, IERC1155Receiver {
    uint256 public constant MAX_DEBT_LTV_BPS = 8_000;

    error DebtExceedsCollateral(uint256 due, uint256 maxDue);
    error InvalidPositionCollateral();

    struct PositionCollateral {
        uint96 amount;
        bool released;
    }

    IConditionalTokens public immutable positionToken;
    bytes32 public immutable conditionId;
    uint256 public immutable yesTokenId;
    uint256 public immutable noTokenId;
    mapping(uint256 => PositionCollateral) public positionCollateralOf;
    bytes32 private _expectedTransfer;

    event PositionCollateralLocked(uint256 indexed loanId, bytes32 indexed condition, uint256 amount, uint256 maxDue);
    event PositionCollateralReleased(uint256 indexed loanId, address indexed recipient, uint256 amount);
    event PositionCollateralMerged(uint256 indexed loanId, uint256 recovered);

    constructor(
        IERC20Metadata asset_,
        address forwarder_,
        address workflowOwner_,
        bytes32 workflowId_,
        IConditionalTokens positionToken_,
        bytes32 conditionId_
    ) TraderCreditDesk(asset_, forwarder_, workflowOwner_, workflowId_) {
        if (
            !ArcTestnet.supportsPositionCollateral(address(asset_)) || address(positionToken_).code.length == 0
                || conditionId_ == bytes32(0) || positionToken_.getOutcomeSlotCount(conditionId_) != 2
        ) revert InvalidConfiguration();
        positionToken = positionToken_;
        conditionId = conditionId_;
        yesTokenId =
            positionToken_.getPositionId(address(asset_), positionToken_.getCollectionId(bytes32(0), conditionId_, 1));
        noTokenId =
            positionToken_.getPositionId(address(asset_), positionToken_.getCollectionId(bytes32(0), conditionId_, 2));
    }

    function maximumPositionDue(uint96 bond, uint96 amount) public pure returns (uint256) {
        return (uint256(bond) + amount) * MAX_DEBT_LTV_BPS / 10_000;
    }

    function requestLoanWithPositions(
        Terms calldata terms,
        address[] calldata traders,
        address[] calldata controllers,
        bytes[] calldata consents,
        uint96 amount
    ) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert InvalidPositionCollateral();
        uint256 maxDue = maximumPositionDue(terms.bond, amount);
        if (terms.due > maxDue) revert DebtExceedsCollateral(terms.due, maxDue);

        id = _requestLoan(terms, traders, controllers, consents);
        (uint256[] memory ids, uint256[] memory amounts) = _pair(amount);
        uint256 yesBefore = positionToken.balanceOf(address(this), yesTokenId);
        uint256 noBefore = positionToken.balanceOf(address(this), noTokenId);
        _expectedTransfer = keccak256(abi.encode(msg.sender, ids, amounts));
        positionToken.safeBatchTransferFrom(msg.sender, address(this), ids, amounts, "");
        if (
            _expectedTransfer != bytes32(0) || positionToken.balanceOf(address(this), yesTokenId) != yesBefore + amount
                || positionToken.balanceOf(address(this), noTokenId) != noBefore + amount
        ) revert TransferMismatch();
        positionCollateralOf[id].amount = amount;
        emit PositionCollateralLocked(id, conditionId, amount, maxDue);
    }

    function claimPositionCollateral(uint256 id, address recipient) external nonReentrant {
        Loan memory loan = getLoan(id);
        if (msg.sender != loan.borrower && recipient != loan.borrower) revert Unauthorized();
        if (loan.state != State.Repaid && loan.state != State.Cancelled) revert InvalidState();
        if (recipient == address(0) || recipient == address(this)) revert InvalidPositionCollateral();

        PositionCollateral storage pledge = positionCollateralOf[id];
        if (pledge.amount == 0 || pledge.released) revert InvalidPositionCollateral();
        pledge.released = true;
        (uint256[] memory ids, uint256[] memory amounts) = _pair(pledge.amount);
        positionToken.safeBatchTransferFrom(address(this), recipient, ids, amounts, "");
        emit PositionCollateralReleased(id, recipient, pledge.amount);
    }

    function _recoverPositionCollateral(uint256 id) internal override returns (uint256) {
        PositionCollateral storage pledge = positionCollateralOf[id];
        if (pledge.amount == 0) return 0;
        if (pledge.released) revert InvalidPositionCollateral();
        pledge.released = true;

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        uint256 beforeBalance = asset.balanceOf(address(this));
        positionToken.mergePositions(address(asset), bytes32(0), conditionId, partition, pledge.amount);
        if (asset.balanceOf(address(this)) != beforeBalance + pledge.amount) revert TransferMismatch();
        emit PositionCollateralMerged(id, pledge.amount);
        return pledge.amount;
    }

    function supportsInterface(bytes4 interfaceId) public pure override(TraderCreditDesk, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert InvalidPositionCollateral();
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata
    ) external returns (bytes4) {
        if (
            msg.sender != address(positionToken) || operator != address(this) || _expectedTransfer == bytes32(0)
                || keccak256(abi.encode(from, ids, values)) != _expectedTransfer
        ) revert InvalidPositionCollateral();
        delete _expectedTransfer;
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function _pair(uint256 amount) private view returns (uint256[] memory ids, uint256[] memory amounts) {
        ids = new uint256[](2);
        ids[0] = yesTokenId;
        ids[1] = noTokenId;
        amounts = new uint256[](2);
        amounts[0] = amount;
        amounts[1] = amount;
    }
}
