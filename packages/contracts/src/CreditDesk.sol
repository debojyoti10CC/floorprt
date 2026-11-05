// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FloorTypes as T} from "./FloorTypes.sol";
import {FloorVault} from "./FloorVault.sol";
import {SharedObservationRegistry} from "./SharedObservationRegistry.sol";

contract CreditDesk is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    error InvalidTerms();
    error Unauthorized();
    error InvalidState();
    error Expired();
    error ObservationClosed();
    error NotResolved();
    error FundingPaused();
    error TransferMismatch();
    error RedemptionShortfall();

    FloorVault public immutable vault;
    SharedObservationRegistry public immutable registry;
    IERC20 public immutable collateral;
    uint16 public immutable bufferBps;
    bool public fundingPaused;
    uint256 public loanCount;
    mapping(uint256 => T.BorrowRequest) private _requests;
    mapping(uint256 => T.Loan) private _loans;

    event BorrowRequested(
        uint256 indexed positionId, address indexed borrower, uint256 requestedPrincipal, uint256 maxDue
    );
    event BorrowRequestCancelled(uint256 indexed positionId);
    event LoanFunded(
        uint256 indexed loanId,
        uint256 indexed positionId,
        address indexed lender,
        address borrower,
        uint256 principal,
        uint256 due
    );
    event LoanSettled(uint256 indexed loanId, uint256 redeemed, uint256 lenderPaid, uint256 borrowerPaid);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, address indexed lender, uint256 paid);
    event NewFundingPaused(bool paused);

    constructor(address curator, FloorVault vault_, uint16 bufferBps_) Ownable(curator) {
        if (bufferBps_ > 10_000) revert InvalidTerms();
        vault = vault_;
        registry = vault_.verifier().registry();
        collateral = vault_.collateral();
        bufferBps = bufferBps_;
    }

    function setFundingPaused(bool paused) external onlyOwner {
        fundingPaused = paused;
        emit NewFundingPaused(paused);
    }

    function maximumDue(uint256 floorAmount) public view returns (uint256) {
        // Floor amounts are bounded by uint64 claim quantities, so this multiplication cannot overflow.
        uint256 reserve = (floorAmount * bufferBps + 9_999) / 10_000;
        return floorAmount - reserve;
    }

    function requestLoan(uint256 positionId, uint256 principal, uint256 maxDue, uint64 expiry) external nonReentrant {
        if (fundingPaused) revert FundingPaused();
        T.Position memory p = vault.getPosition(positionId);
        if (p.owner != msg.sender) revert Unauthorized();
        if (p.state != T.PositionState.OPEN) revert InvalidState();
        T.Observation memory obs = _requireOpen(p.observationId);
        if (
            principal == 0 || maxDue < principal || maxDue > maximumDue(p.certifiedFloor) || expiry <= block.timestamp
                || expiry > obs.observationTime
        ) revert InvalidTerms();
        _requests[positionId] = T.BorrowRequest(principal, maxDue, expiry, true);
        emit BorrowRequested(positionId, msg.sender, principal, maxDue);
    }

    function cancelRequest(uint256 positionId) external nonReentrant {
        T.Position memory p = vault.getPosition(positionId);
        if (p.owner != msg.sender) revert Unauthorized();
        if (p.state != T.PositionState.OPEN) revert InvalidState();
        delete _requests[positionId];
        emit BorrowRequestCancelled(positionId);
    }

    function getRequest(uint256 positionId) external view returns (T.BorrowRequest memory) {
        return _requests[positionId];
    }

    function fundLoan(uint256 positionId, uint256 principal, uint256 totalDue)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (fundingPaused) revert FundingPaused();
        T.Position memory p = vault.getPosition(positionId);
        if (p.state != T.PositionState.OPEN) revert InvalidState();
        if (msg.sender == p.owner || msg.sender == p.beneficiary || msg.sender == address(vault)) {
            revert Unauthorized();
        }
        T.BorrowRequest memory request = _requests[positionId];
        if (!request.active) revert InvalidState();
        if (block.timestamp >= request.expiry) revert Expired();
        T.Observation memory obs = _requireOpen(p.observationId);
        if (
            principal != request.principal || principal == 0 || totalDue < principal || totalDue > request.maximumDue
                || totalDue > maximumDue(p.certifiedFloor)
        ) revert InvalidTerms();
        id = ++loanCount;
        _requests[positionId].active = false;
        _loans[id] = T.Loan({
            positionId: positionId,
            lender: msg.sender,
            borrower: p.owner,
            principal: principal,
            due: totalDue,
            certifiedFloor: p.certifiedFloor,
            fundedAt: uint64(block.timestamp),
            targetMaturity: obs.observationTime,
            state: T.LoanState.FUNDED
        });
        vault.markEncumbered(positionId, id);
        uint256 beforeBalance = collateral.balanceOf(p.owner);
        collateral.safeTransferFrom(msg.sender, p.owner, principal);
        if (collateral.balanceOf(p.owner) - beforeBalance != principal) revert TransferMismatch();
        emit LoanFunded(id, positionId, msg.sender, p.owner, principal, totalDue);
    }

    function getLoan(uint256 id) external view returns (T.Loan memory loan) {
        loan = _loans[id];
        if (loan.state == T.LoanState.NONE) revert InvalidState();
    }

    function settle(uint256 id) external nonReentrant {
        T.Loan storage loan = _loans[id];
        if (loan.state != T.LoanState.FUNDED) revert InvalidState();
        T.Position memory p = vault.getPosition(loan.positionId);
        if (registry.observation(p.observationId).state == T.ObservationState.UNRESOLVED) revert NotResolved();
        loan.state = T.LoanState.SETTLED;
        uint256 beforeBalance = collateral.balanceOf(address(this));
        uint256 redeemed = vault.redeemLocked(loan.positionId);
        if (
            collateral.balanceOf(address(this)) - beforeBalance != redeemed || redeemed < loan.certifiedFloor
                || redeemed < loan.due
        ) revert RedemptionShortfall();
        uint256 residual = redeemed - loan.due;
        collateral.safeTransfer(loan.lender, loan.due);
        if (residual != 0) collateral.safeTransfer(p.beneficiary, residual);
        emit LoanSettled(id, redeemed, loan.due, residual);
    }

    /// @notice The agreed fixed due is paid in full; no time-based fee or discount.
    function repay(uint256 id) external nonReentrant {
        T.Loan storage loan = _loans[id];
        if (loan.state != T.LoanState.FUNDED) revert InvalidState();
        if (msg.sender != loan.borrower) revert Unauthorized();
        loan.state = T.LoanState.REPAID;
        uint256 beforeBalance = collateral.balanceOf(loan.lender);
        collateral.safeTransferFrom(msg.sender, loan.lender, loan.due);
        if (collateral.balanceOf(loan.lender) - beforeBalance != loan.due) revert TransferMismatch();
        vault.releaseRepaid(loan.positionId, id);
        emit LoanRepaid(id, msg.sender, loan.lender, loan.due);
    }

    function _requireOpen(uint256 observationId) private view returns (T.Observation memory obs) {
        obs = registry.observation(observationId);
        if (obs.state != T.ObservationState.UNRESOLVED || block.timestamp >= obs.observationTime) {
            revert ObservationClosed();
        }
    }
}
