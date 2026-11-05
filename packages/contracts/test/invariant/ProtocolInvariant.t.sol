// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Fixture} from "../Fixture.sol";
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {FloorTypes as T} from "../../src/FloorTypes.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {SharedObservationRegistry} from "../../src/SharedObservationRegistry.sol";
import {OutcomeTokens} from "../../src/OutcomeTokens.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {CreditDesk} from "../../src/CreditDesk.sol";

contract ProtocolHandler is Test, ERC1155Holder {
    MockUSDC internal cash;
    SharedObservationRegistry internal registry;
    OutcomeTokens internal tokens;
    FloorVault internal vault;
    CreditDesk internal desk;
    uint256 internal observationId;
    address internal resolver;
    address internal lender;

    constructor(
        MockUSDC c,
        SharedObservationRegistry r,
        OutcomeTokens t,
        FloorVault v,
        CreditDesk d,
        uint256 obs,
        address resolver_,
        address lender_
    ) {
        cash = c;
        registry = r;
        tokens = t;
        vault = v;
        desk = d;
        observationId = obs;
        resolver = resolver_;
        lender = lender_;
        cash.faucet(10_000e6);
        cash.approve(address(tokens), type(uint256).max);
        tokens.setApprovalForAll(address(vault), true);
    }

    function mint(uint8 raw) public {
        uint64 q = uint64(bound(raw, 1, 50));
        tokens.mintCompleteSet(1, q);
        tokens.mintCompleteSet(2, q);
    }

    function merge(uint8 raw) public {
        uint256 a = tokens.balanceOf(address(this), 3);
        uint256 b = tokens.balanceOf(address(this), 4);
        uint256 available = a < b ? a : b;
        if (available == 0) return;
        tokens.mergeCompleteSet(1, uint64(bound(raw, 1, available)));
    }

    function lock(uint8 rawA, uint8 rawB) public {
        if (vault.positionCount() >= 30) return;
        uint256 a = tokens.balanceOf(address(this), 3);
        uint256 b = tokens.balanceOf(address(this), 6);
        if (a == 0 || b == 0) return;
        vault.lockPair(1, 2, uint64(bound(rawA, 1, a)), uint64(bound(rawB, 1, b)), address(this));
    }

    function release(uint8 raw) public {
        if (vault.positionCount() == 0) return;
        uint256 id = bound(raw, 1, vault.positionCount());
        vault.releaseUnfunded(id);
    }

    function fund(uint8 raw) public {
        if (vault.positionCount() == 0) return;
        uint256 id = bound(raw, 1, vault.positionCount());
        T.Position memory p = vault.getPosition(id);
        uint256 principal = p.certifiedFloor * 75 / 100;
        uint256 due = p.certifiedFloor * 78 / 100;
        desk.requestLoan(id, principal, due, registry.observation(observationId).observationTime);
        vm.startPrank(lender);
        cash.approve(address(desk), principal);
        desk.fundLoan(id, principal, due);
        vm.stopPrank();
    }

    function resolve(uint128 raw, bool cancel) public {
        T.Observation memory o = registry.observation(observationId);
        if (cancel) {
            vm.warp(o.cancelAfter);
            registry.cancel(observationId);
        } else {
            vm.warp(o.observationTime);
            vm.prank(resolver);
            registry.finalize(observationId, bound(raw, 0, 1e36));
        }
    }

    function redeem(uint8 raw) public {
        uint256 m = raw % 2 + 1;
        uint256 yes = tokens.balanceOf(address(this), m * 2 + 1);
        uint256 no = tokens.balanceOf(address(this), m * 2 + 2);
        if (yes > 0) tokens.redeem(m, T.Side.YES, uint64(yes));
        if (no > 0) tokens.redeem(m, T.Side.NO, uint64(no));
    }

    function settle(uint8 raw) public {
        if (desk.loanCount() == 0) return;
        desk.settle(bound(raw, 1, desk.loanCount()));
    }

    function repay(uint8 raw) public {
        if (desk.loanCount() == 0) return;
        cash.approve(address(desk), type(uint256).max);
        desk.repay(bound(raw, 1, desk.loanCount()));
    }
}

contract ProtocolInvariant is Fixture {
    ProtocolHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new ProtocolHandler(usdc, registry, tokens, vault, desk, obs, resolver, lender);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = handler.mint.selector;
        selectors[1] = handler.merge.selector;
        selectors[2] = handler.lock.selector;
        selectors[3] = handler.release.selector;
        selectors[4] = handler.fund.selector;
        selectors[5] = handler.resolve.selector;
        selectors[6] = handler.redeem.selector;
        selectors[7] = handler.settle.selector;
        selectors[8] = handler.repay.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    function invariant_FullyBackedForEveryOutstandingClaim() public view {
        T.Observation memory o = registry.observation(obs);
        uint256 sum;
        for (uint256 m = 1; m <= 2; m++) {
            uint256 yes = tokens.totalSupply(m * 2 + 1);
            uint256 no = tokens.totalSupply(m * 2 + 2);
            uint256 liability;
            if (o.state == T.ObservationState.UNRESOLVED) liability = (yes > no ? yes : no) * 1e6;
            else if (o.state == T.ObservationState.CANCELLED) liability = (yes + no) * 500_000;
            else liability = (o.price >= (m == 1 ? 5000e8 : 6000e8) ? yes : no) * 1e6;
            assertEq(tokens.escrow(m), liability);
            sum += tokens.escrow(m);
        }
        assertEq(usdc.balanceOf(address(tokens)), sum);
    }

    function invariant_ExactVaultInventoryAndSingleLien() public view {
        uint256 yes;
        uint256 no;
        for (uint256 id = 1; id <= vault.positionCount(); id++) {
            T.Position memory p = vault.getPosition(id);
            if (p.state == T.PositionState.OPEN || p.state == T.PositionState.ENCUMBERED) {
                yes += p.unitsLower;
                no += p.unitsUpper;
            }
            if (p.state == T.PositionState.ENCUMBERED) {
                assertGt(p.lienLoanId, 0);
                assertEq(desk.getLoan(p.lienLoanId).positionId, id);
                assertEq(uint8(desk.getLoan(p.lienLoanId).state), uint8(T.LoanState.FUNDED));
            }
        }
        assertEq(tokens.balanceOf(address(vault), 3), yes);
        assertEq(tokens.balanceOf(address(vault), 6), no);
    }

    function invariant_AllDebtFitsCertifiedFloorAndNoStrandedCash() public view {
        for (uint256 id = 1; id <= desk.loanCount(); id++) {
            T.Loan memory l = desk.getLoan(id);
            assertLe(l.due, desk.maximumDue(l.certifiedFloor));
            assertGe(l.due, l.principal);
            assertTrue(l.lender != l.borrower);
            if (l.state == T.LoanState.SETTLED) {
                assertEq(uint8(vault.getPosition(l.positionId).state), uint8(T.PositionState.REDEEMED));
            }
            if (l.state == T.LoanState.REPAID) {
                assertEq(uint8(vault.getPosition(l.positionId).state), uint8(T.PositionState.RELEASED));
            }
        }
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(address(desk)), 0);
    }
}
