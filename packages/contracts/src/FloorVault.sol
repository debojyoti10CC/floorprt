// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FloorTypes as T} from "./FloorTypes.sol";
import {FloorVerifier} from "./FloorVerifier.sol";
import {OutcomeTokens} from "./OutcomeTokens.sol";

interface IBoundCreditDesk {
    function vault() external view returns (address);
}

contract FloorVault is Ownable2Step, ERC165, IERC1155Receiver, ReentrancyGuard {
    using SafeERC20 for IERC20;
    error InvalidPair(uint16 reasonCode);
    error InvalidPosition();
    error NotPositionOwner();
    error OnlyCreditDesk();
    error InvalidDesk();
    error UnexpectedDeposit();
    error InvalidBeneficiary();
    error NewLocksPaused();
    error RedemptionShortfall();

    FloorVerifier public immutable verifier;
    OutcomeTokens public immutable tokens;
    IERC20 public immutable collateral;
    address public creditDesk;
    bool public locksPaused;
    uint256 public positionCount;
    mapping(uint256 => T.Position) private _positions;
    bytes32 private _expectedTransfer;

    event VaultPositionCreated(uint256 indexed positionId, address indexed owner, uint256 floorUsdc);
    event VaultPositionReleased(uint256 indexed positionId);
    event PositionEncumbered(uint256 indexed positionId, uint256 indexed loanId);
    event PositionRedeemed(uint256 indexed positionId, uint256 amount);
    event CreditDeskBound(address indexed desk);
    event LocksPaused(bool paused);

    constructor(address curator, FloorVerifier verifier_) Ownable(curator) {
        verifier = verifier_;
        tokens = verifier_.tokens();
        collateral = IERC20(address(verifier_.factory().collateral()));
    }

    modifier onlyDesk() {
        if (msg.sender != creditDesk) revert OnlyCreditDesk();
        _;
    }

    function bindCreditDesk(address desk) external onlyOwner {
        if (creditDesk != address(0) || desk.code.length == 0 || IBoundCreditDesk(desk).vault() != address(this)) {
            revert InvalidDesk();
        }
        creditDesk = desk;
        emit CreditDeskBound(desk);
    }

    function setLocksPaused(bool paused) external onlyOwner {
        locksPaused = paused;
        emit LocksPaused(paused);
    }

    function lockPair(uint256 lower, uint256 upper, uint64 qLower, uint64 qUpper, address beneficiary)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (locksPaused) revert NewLocksPaused();
        if (beneficiary == address(0) || beneficiary == address(this)) revert InvalidBeneficiary();
        T.VerifiedFloor memory proof = verifier.verifyPair(lower, upper, qLower, qUpper);
        if (!proof.valid) revert InvalidPair(proof.reasonCode);
        id = ++positionCount;
        _positions[id] = T.Position({
            owner: msg.sender,
            beneficiary: beneficiary,
            marketLower: lower,
            marketUpper: upper,
            unitsLower: qLower,
            unitsUpper: qUpper,
            observationId: proof.observationId,
            certifiedFloor: proof.floorUsdcBase,
            state: T.PositionState.OPEN,
            lienLoanId: 0
        });
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = lower * 2 + 1;
        ids[1] = upper * 2 + 2;
        amounts[0] = qLower;
        amounts[1] = qUpper;
        bytes memory data = abi.encode(id);
        _expectedTransfer = keccak256(abi.encode(msg.sender, ids, amounts, data));
        tokens.safeBatchTransferFrom(msg.sender, address(this), ids, amounts, data);
        if (_expectedTransfer != bytes32(0)) revert UnexpectedDeposit();
        emit VaultPositionCreated(id, msg.sender, proof.floorUsdcBase);
    }

    function getPosition(uint256 id) public view returns (T.Position memory p) {
        p = _positions[id];
        if (p.state == T.PositionState.NONE) revert InvalidPosition();
    }

    function releaseUnfunded(uint256 id) external nonReentrant {
        T.Position storage p = _positions[id];
        if (msg.sender != p.owner) revert NotPositionOwner();
        if (p.state != T.PositionState.OPEN || p.lienLoanId != 0) revert InvalidPosition();
        p.state = T.PositionState.RELEASED;
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = p.marketLower * 2 + 1;
        ids[1] = p.marketUpper * 2 + 2;
        amounts[0] = p.unitsLower;
        amounts[1] = p.unitsUpper;
        tokens.safeBatchTransferFrom(address(this), p.owner, ids, amounts, "");
        emit VaultPositionReleased(id);
    }

    function markEncumbered(uint256 id, uint256 loanId) external onlyDesk {
        T.Position storage p = _positions[id];
        if (p.state != T.PositionState.OPEN || p.lienLoanId != 0 || loanId == 0) revert InvalidPosition();
        p.state = T.PositionState.ENCUMBERED;
        p.lienLoanId = loanId;
        emit PositionEncumbered(id, loanId);
    }

    /// @notice Only the bound desk can release a lien after atomic full repayment.
    function releaseRepaid(uint256 id, uint256 loanId) external onlyDesk nonReentrant {
        T.Position storage p = _positions[id];
        if (p.state != T.PositionState.ENCUMBERED || p.lienLoanId != loanId) revert InvalidPosition();
        p.state = T.PositionState.RELEASED;
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = p.marketLower * 2 + 1;
        ids[1] = p.marketUpper * 2 + 2;
        amounts[0] = p.unitsLower;
        amounts[1] = p.unitsUpper;
        tokens.safeBatchTransferFrom(address(this), p.owner, ids, amounts, "");
        emit VaultPositionReleased(id);
    }

    function redeemLocked(uint256 id) external onlyDesk nonReentrant returns (uint256 amount) {
        T.Position storage p = _positions[id];
        if (p.state != T.PositionState.ENCUMBERED) revert InvalidPosition();
        p.state = T.PositionState.REDEEMED;
        uint256 beforeBalance = collateral.balanceOf(address(this));
        uint256 lowerPaid = tokens.redeemFor(p.marketLower, T.Side.YES, p.unitsLower, address(this));
        uint256 upperPaid = tokens.redeemFor(p.marketUpper, T.Side.NO, p.unitsUpper, address(this));
        amount = collateral.balanceOf(address(this)) - beforeBalance;
        if (amount != lowerPaid + upperPaid || amount < p.certifiedFloor) revert RedemptionShortfall();
        collateral.safeTransfer(creditDesk, amount);
        emit PositionRedeemed(id, amount);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert UnexpectedDeposit();
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external returns (bytes4) {
        if (
            msg.sender != address(tokens) || operator != address(this) || _expectedTransfer == bytes32(0)
                || _expectedTransfer != keccak256(abi.encode(from, ids, values, data))
        ) revert UnexpectedDeposit();
        _expectedTransfer = bytes32(0);
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }
}
