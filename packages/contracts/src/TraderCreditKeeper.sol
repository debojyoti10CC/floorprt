// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TraderCreditDesk, ITraderReportReceiver} from "./TraderCreditDesk.sol";
import {PositionCreditDesk} from "./PositionCreditDesk.sol";
import {MarginCreditDesk} from "./MarginCreditDesk.sol";

interface IPositionClaim {
    function claimPositionCollateral(uint256 loanId, address recipient) external;
}

/// @notice Executes bounded, permissionless loan servicing through the desk's pinned CRE workflow.
contract TraderCreditKeeper is IERC165, ITraderReportReceiver, ReentrancyGuard {
    uint256 public constant BATCH_SIZE = 4;
    uint256 public constant MAX_REPORT_AGE = 30 minutes;

    enum Action {
        Watch,
        Expire,
        Liquidate,
        ReturnPositions
    }

    enum Custody {
        Bond,
        Paired,
        Directional
    }

    struct Check {
        uint256 loanId;
        TraderCreditDesk.State state;
        Action action;
        address trader;
        uint64 deadline;
        uint96 due;
        uint96 bond;
        uint96 shares;
        uint64 lastMark;
        bool custodyVerified;
        bool directional;
    }

    struct Sweep {
        uint256 chainId;
        address keeper;
        address desk;
        uint256 first;
        uint256 through;
        uint64 observedAt;
        bytes32 observationHash;
    }

    error InvalidReport();
    error InvalidConfiguration();

    TraderCreditDesk public immutable desk;
    PositionCreditDesk public immutable positionDesk;
    MarginCreditDesk public immutable marginDesk;
    uint256 public cursor = 1;
    uint64 public lastObservedAt;

    event LoanServiced(uint256 indexed loanId, Action indexed action);
    event LoanServiceFailed(uint256 indexed loanId, Action indexed action);
    event SweepCompleted(
        uint256 indexed first, uint256 indexed through, uint64 observedAt, bytes32 observationHash, uint256 next
    );

    constructor(TraderCreditDesk desk_, Custody custody) {
        if (address(desk_).code.length == 0 || (block.chainid != 31337 && block.chainid != 11155111)) {
            revert InvalidConfiguration();
        }
        desk = desk_;
        positionDesk = PositionCreditDesk(custody == Custody.Paired ? address(desk_) : address(0));
        marginDesk = MarginCreditDesk(custody == Custody.Directional ? address(desk_) : address(0));
        if (
            (address(positionDesk) != address(0) && address(positionDesk.positionToken()).code.length == 0)
                || (address(marginDesk) != address(0) && address(marginDesk.positionToken()).code.length == 0)
        ) revert InvalidConfiguration();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(ITraderReportReceiver).interfaceId;
    }

    function preview()
        external
        view
        returns (uint256 first, uint256 through, uint256 loanCount, uint64 observedAt, Check[] memory checks)
    {
        first = cursor;
        loanCount = desk.loanCount();
        observedAt = uint64(block.timestamp);
        through = first + BATCH_SIZE - 1;
        if (through > loanCount) through = loanCount;
        checks = new Check[](through >= first ? through - first + 1 : 0);
        for (uint256 i; i < checks.length; ++i) {
            uint256 id = first + i;
            (Check memory check,) = _inspect(id, observedAt);
            if (check.state == TraderCreditDesk.State.Requested || check.state == TraderCreditDesk.State.Funded) {
                address[] memory traders = desk.traderWallets(id);
                if (traders.length != 0) check.trader = traders[0];
            }
            checks[i] = check;
        }
    }

    function onReport(bytes calldata metadata, bytes calldata report) external nonReentrant {
        bytes32 workflowId = desk.workflowId();
        if (
            msg.sender != desk.forwarder() || workflowId == bytes32(0) || metadata.length != 62
                || bytes32(metadata[:32]) != workflowId || address(bytes20(metadata[42:62])) != desk.workflowOwner()
        ) revert InvalidReport();
        Sweep memory sweep = abi.decode(report, (Sweep));
        uint256 count = desk.loanCount();
        if (
            sweep.chainId != block.chainid || sweep.keeper != address(this) || sweep.desk != address(desk)
                || sweep.first != cursor || sweep.through < sweep.first || sweep.through > count
                || sweep.through - sweep.first >= BATCH_SIZE || sweep.observedAt <= lastObservedAt
                || sweep.observedAt > block.timestamp || block.timestamp - sweep.observedAt > MAX_REPORT_AGE
                || sweep.observationHash == bytes32(0)
        ) revert InvalidReport();

        lastObservedAt = sweep.observedAt;
        cursor = sweep.through == count ? 1 : sweep.through + 1;
        for (uint256 id = sweep.first; id <= sweep.through; ++id) {
            (Check memory check, address borrower) = _inspect(id, sweep.observedAt);
            _service(check, borrower);
        }
        emit SweepCompleted(sweep.first, sweep.through, sweep.observedAt, sweep.observationHash, cursor);
    }

    function _inspect(uint256 id, uint64 observedAt) private view returns (Check memory check, address borrower) {
        TraderCreditDesk.Loan memory loan = desk.getLoan(id);
        borrower = loan.borrower;
        check.loanId = id;
        check.state = loan.state;
        check.due = loan.terms.due;
        check.bond = loan.terms.bond;
        bool live = loan.state == TraderCreditDesk.State.Requested || loan.state == TraderCreditDesk.State.Funded;
        check.custodyVerified = live && desk.asset().balanceOf(address(desk)) >= check.bond;

        bool released;
        if (address(positionDesk) != address(0)) {
            (check.shares, released) = positionDesk.positionCollateralOf(id);
            if (live && check.shares != 0) {
                check.custodyVerified = check.custodyVerified && !released
                    && loan.terms.due <= positionDesk.maximumPositionDue(check.bond, check.shares)
                    && positionDesk.positionToken().balanceOf(address(desk), positionDesk.yesTokenId()) >= check.shares
                    && positionDesk.positionToken().balanceOf(address(desk), positionDesk.noTokenId()) >= check.shares;
            }
        } else if (address(marginDesk) != address(0)) {
            uint256 offer = marginDesk.loanBackstop(id);
            if (offer != 0) {
                (address bidder,, uint96 shares, uint96 proceeds,, bool closed) = marginDesk.backstops(offer);
                check.directional = true;
                check.shares = shares;
                (, check.lastMark,) = marginDesk.quotes(id);
                released = marginDesk.sharesClaimed(id);
                if (loan.state == TraderCreditDesk.State.Defaulted) borrower = bidder;
                if (live) {
                    check.custodyVerified = !closed && !released && uint256(check.bond) + proceeds >= check.due
                        && desk.asset().balanceOf(address(desk)) >= uint256(check.bond) + proceeds
                        && marginDesk.positionToken().balanceOf(address(desk), marginDesk.tokenId()) >= shares;
                }
            }
        }
        if (loan.state == TraderCreditDesk.State.Requested) {
            check.deadline = loan.fundBy;
            if (observedAt >= loan.fundBy) check.action = Action.Expire;
        } else if (loan.state == TraderCreditDesk.State.Funded) {
            check.deadline = loan.maturity;
            if (observedAt >= loan.maturity && check.custodyVerified) check.action = Action.Liquidate;
        } else if (
            check.shares != 0 && !released
                && (loan.state == TraderCreditDesk.State.Repaid
                    || loan.state == TraderCreditDesk.State.Cancelled
                    || (check.directional && loan.state == TraderCreditDesk.State.Defaulted))
        ) {
            check.action = Action.ReturnPositions;
        }
    }

    function _service(Check memory check, address borrower) private {
        uint256 id = check.loanId;
        Action action = check.action;
        if (action == Action.Expire) {
            try desk.cancelRequest{gas: 180_000}(id) {
                emit LoanServiced(id, action);
            } catch {
                emit LoanServiceFailed(id, action);
            }
        } else if (action == Action.Liquidate) {
            try desk.settleDefault{gas: 300_000}(id) {
                emit LoanServiced(id, action);
            } catch {
                emit LoanServiceFailed(id, action);
            }
        } else if (action == Action.ReturnPositions) {
            try IPositionClaim(address(desk)).claimPositionCollateral{gas: 180_000}(id, borrower) {
                emit LoanServiced(id, action);
            } catch {
                emit LoanServiceFailed(id, action);
            }
        }
    }
}
