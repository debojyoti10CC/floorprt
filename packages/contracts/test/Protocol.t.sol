// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Fixture} from "./Fixture.sol";
import {FloorTypes as T} from "../src/FloorTypes.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SharedObservationRegistry} from "../src/SharedObservationRegistry.sol";
import {OutcomeMarketFactory} from "../src/OutcomeMarketFactory.sol";
import {OutcomeTokens} from "../src/OutcomeTokens.sol";
import {FloorVault} from "../src/FloorVault.sol";
import {CreditDesk} from "../src/CreditDesk.sol";

contract RegistryTests is Fixture {
    function test_NoPrematureResolution() public {
        vm.prank(resolver);
        vm.expectRevert(SharedObservationRegistry.TooEarly.selector);
        registry.finalize(obs, 5500e8);
    }

    function test_NoUnauthorizedResolver() public {
        vm.warp(maturity);
        vm.prank(stranger);
        vm.expectRevert(SharedObservationRegistry.UnauthorizedResolver.selector);
        registry.finalize(obs, 5500e8);
    }

    function test_NoPrematureCancellationEvenByResolver() public {
        vm.prank(resolver);
        vm.expectRevert(SharedObservationRegistry.TooEarly.selector);
        registry.cancel(obs);
    }

    function test_FinalizationIsImmutable() public {
        _finalize(5500e8);
        vm.prank(resolver);
        vm.expectRevert(SharedObservationRegistry.AlreadyTerminal.selector);
        registry.finalize(obs, 4500e8);
        vm.warp(longstop);
        vm.expectRevert(SharedObservationRegistry.AlreadyTerminal.selector);
        registry.cancel(obs);
    }

    function test_CancellationPermissionlessAtLongstop() public {
        vm.warp(longstop);
        vm.prank(stranger);
        registry.cancel(obs);
        assertEq(uint8(registry.observation(obs).state), uint8(T.ObservationState.CANCELLED));
        vm.prank(resolver);
        vm.expectRevert(SharedObservationRegistry.AlreadyTerminal.selector);
        registry.finalize(obs, 5500e8);
    }

    function test_RejectInvalidPolicyAndPrecision() public {
        bytes32 policy = registry.POLICY();
        vm.expectRevert(SharedObservationRegistry.InvalidObservation.selector);
        registry.registerObservation(keccak256("ETH"), maturity, 8, keccak256("SOURCE"), bytes32(0), longstop);
        vm.expectRevert(SharedObservationRegistry.InvalidObservation.selector);
        registry.registerObservation(keccak256("ETH"), maturity, 19, keccak256("SOURCE"), policy, longstop);
    }

    function test_RejectOutOfRangePrice() public {
        vm.warp(maturity);
        vm.prank(resolver);
        vm.expectRevert(SharedObservationRegistry.InvalidPrice.selector);
        registry.finalize(obs, 1e36 + 1);
    }

    function test_PriceZeroIsValid() public {
        _finalize(0);
        assertEq(registry.observation(obs).price, 0);
    }

    function test_OnlyCuratorCreatesMarkets() public {
        vm.prank(stranger);
        vm.expectRevert();
        factory.createMarket(obs, 7000e8);
    }

    function test_DuplicateStrikeAndUnknownObservationReject() public {
        vm.expectRevert(OutcomeMarketFactory.InvalidMarket.selector);
        factory.createMarket(obs, 5000e8);
        vm.expectRevert(SharedObservationRegistry.UnknownObservation.selector);
        factory.createMarket(100, 7000e8);
    }
}

contract TokenTests is Fixture {
    function test_MintBackedCompleteSetAndUniqueIds() public {
        _mint(3, 2);
        assertEq(usdc.balanceOf(address(tokens)), 5e6);
        assertEq(tokens.escrow(lower), 3e6);
        assertEq(tokens.balanceOf(borrower, lower * 2 + 1), 3);
        assertEq(tokens.balanceOf(borrower, lower * 2 + 2), 3);
        assertEq(tokens.balanceOf(borrower, upper * 2 + 1), 2);
        assertEq(usdc.decimals(), 6);
    }

    function test_MergeBurnsBothAndReturnsExactCollateral() public {
        _mint(3, 2);
        uint256 beforeBalance = usdc.balanceOf(borrower);
        vm.prank(borrower);
        tokens.mergeCompleteSet(lower, 2);
        assertEq(usdc.balanceOf(borrower) - beforeBalance, 2e6);
        assertEq(tokens.totalSupply(lower * 2 + 1), 1);
        assertEq(tokens.escrow(lower), 1e6);
    }

    function test_MintWithoutAllowanceRevertsAtomically() public {
        vm.prank(stranger);
        vm.expectRevert();
        tokens.mintCompleteSet(lower, 1);
        assertEq(tokens.escrow(lower), 0);
        assertEq(tokens.totalSupply(lower * 2 + 1), 0);
    }

    function test_ZeroUnitsRejected() public {
        vm.expectRevert(OutcomeTokens.InvalidUnits.selector);
        tokens.mintCompleteSet(lower, 0);
    }

    function test_ClosedMarketsCannotMintOrMerge() public {
        _mint(1, 1);
        vm.warp(maturity);
        vm.startPrank(borrower);
        vm.expectRevert(OutcomeTokens.ClosedMarket.selector);
        tokens.mintCompleteSet(lower, 1);
        vm.expectRevert(OutcomeTokens.ClosedMarket.selector);
        tokens.mergeCompleteSet(lower, 1);
        vm.stopPrank();
    }

    function test_NoEarlyRedemption() public {
        _mint(1, 1);
        vm.prank(borrower);
        vm.expectRevert(OutcomeTokens.NotResolved.selector);
        tokens.redeem(lower, T.Side.YES, 1);
    }

    function test_RedeemWinningAndLosingClaims() public {
        _mint(1, 1);
        _finalize(5500e8);
        vm.startPrank(borrower);
        assertEq(tokens.redeem(lower, T.Side.YES, 1), 1e6);
        assertEq(tokens.redeem(lower, T.Side.NO, 1), 0);
        assertEq(tokens.redeem(upper, T.Side.YES, 1), 0);
        assertEq(tokens.redeem(upper, T.Side.NO, 1), 1e6);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(tokens)), 0);
    }

    function test_CancelOddWholeUnitsExactNoDust() public {
        _mint(3, 1);
        vm.warp(longstop);
        registry.cancel(obs);
        vm.startPrank(borrower);
        assertEq(tokens.redeem(lower, T.Side.YES, 3), 1_500_000);
        assertEq(tokens.redeem(lower, T.Side.NO, 3), 1_500_000);
        assertEq(tokens.redeem(upper, T.Side.YES, 1), 500_000);
        assertEq(tokens.redeem(upper, T.Side.NO, 1), 500_000);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(tokens)), 0);
    }

    function test_OperatorCannotRedeemSomeoneElsesBalance() public {
        _mint(1, 1);
        _finalize(5500e8);
        vm.prank(borrower);
        tokens.setApprovalForAll(stranger, true);
        vm.prank(stranger);
        vm.expectRevert();
        tokens.redeemFor(lower, T.Side.YES, 1, stranger);
        assertEq(tokens.balanceOf(borrower, lower * 2 + 1), 1);
    }

    function test_DoubleRedeemReverts() public {
        _mint(1, 1);
        _finalize(5500e8);
        vm.startPrank(borrower);
        tokens.redeem(lower, T.Side.YES, 1);
        vm.expectRevert();
        tokens.redeem(lower, T.Side.YES, 1);
        vm.stopPrank();
    }

    function test_DisablingNewCollateralPreservesRedemption() public {
        _mint(1, 1);
        factory.setEnabled(lower, false);
        _finalize(5500e8);
        vm.prank(borrower);
        assertEq(tokens.redeem(lower, T.Side.YES, 1), 1e6);
    }

    function testFuzz_CompleteSetConservation(uint64 amount, bool cancelled, bool yesWins) public {
        uint64 q = uint64(bound(amount, 1, 4000));
        _mint(q, 1);
        if (cancelled) {
            vm.warp(longstop);
            registry.cancel(obs);
        } else {
            _finalize(yesWins ? 5000e8 : 4999e8);
        }
        uint256 beforeBalance = usdc.balanceOf(borrower);
        vm.startPrank(borrower);
        tokens.redeem(lower, T.Side.YES, q);
        tokens.redeem(lower, T.Side.NO, q);
        vm.stopPrank();
        assertEq(usdc.balanceOf(borrower) - beforeBalance, uint256(q) * 1e6);
        assertEq(tokens.escrow(lower), 0);
    }
}

contract ProofAndCustodyTests is Fixture {
    function test_ProofIsChainComputedAndUnequalQuantitiesSupported() public view {
        T.VerifiedFloor memory p = verifier.verifyPair(lower, upper, 3, 2);
        assertTrue(p.valid);
        assertEq(p.floorUsdcBase, 2e6);
        assertEq(p.observationId, obs);
    }

    function test_MismatchedObservationRejectsEvenWithSameAssetAndSource() public {
        uint256 otherObs = registry.registerObservation(
            keccak256("ETH/USD"), maturity, 8, keccak256("TEST_RESOLVER"), registry.POLICY(), longstop
        );
        uint256 other = factory.createMarket(otherObs, 6000e8);
        assertEq(verifier.verifyPair(lower, other, 1, 1).reasonCode, 2);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(FloorVault.InvalidPair.selector, uint16(2)));
        vault.lockPair(lower, other, 1, 1, borrower);
    }

    function test_ReversedAndEqualStrikesReject() public view {
        assertEq(verifier.verifyPair(upper, lower, 1, 1).reasonCode, 3);
        assertEq(verifier.verifyPair(lower, lower, 1, 1).reasonCode, 3);
    }

    function test_UnknownEmptyAndWrongSidesReject() public view {
        assertEq(verifier.verifyPair(0, 2, 1, 1).reasonCode, 1);
        assertEq(verifier.verifyPair(lower, upper, 0, 1).reasonCode, 4);
        assertEq(verifier.verifySelection(lower, upper, 1, 1, T.Side.NO, T.Side.YES).reasonCode, 7);
    }

    function test_ProofExpiresAtObservationTime() public {
        vm.warp(maturity);
        assertEq(verifier.verifyPair(lower, upper, 1, 1).reasonCode, 5);
    }

    function test_DisabledMarketRejectsNewLocks() public {
        factory.setEnabled(lower, false);
        assertEq(verifier.verifyPair(lower, upper, 1, 1).reasonCode, 6);
    }

    function test_LockActualInventoryAndLeaveCounterparts() public {
        uint256 id = _lock(1, 1);
        assertEq(vault.getPosition(id).certifiedFloor, 1e6);
        assertEq(tokens.balanceOf(address(vault), lower * 2 + 1), 1);
        assertEq(tokens.balanceOf(borrower, lower * 2 + 1), 0);
        assertEq(tokens.balanceOf(borrower, lower * 2 + 2), 1);
        assertEq(tokens.balanceOf(borrower, upper * 2 + 1), 1);
    }

    function test_DoublePledgeFailsAndRollsBackPositionId() public {
        _lock(1, 1);
        vm.prank(borrower);
        vm.expectRevert();
        vault.lockPair(lower, upper, 1, 1, borrower);
        assertEq(vault.positionCount(), 1);
    }

    function test_ReleaseUnfundedReturnsExactClaims() public {
        uint256 id = _lock(3, 2);
        vm.prank(borrower);
        vault.releaseUnfunded(id);
        assertEq(tokens.balanceOf(borrower, lower * 2 + 1), 3);
        assertEq(tokens.balanceOf(borrower, upper * 2 + 2), 2);
        assertEq(uint8(vault.getPosition(id).state), uint8(T.PositionState.RELEASED));
    }

    function test_OnlyOwnerCanReleaseAndOnlyDeskCanLienOrRedeem() public {
        uint256 id = _lock(1, 1);
        vm.prank(stranger);
        vm.expectRevert(FloorVault.NotPositionOwner.selector);
        vault.releaseUnfunded(id);
        vm.expectRevert(FloorVault.OnlyCreditDesk.selector);
        vault.markEncumbered(id, 1);
        vm.expectRevert(FloorVault.OnlyCreditDesk.selector);
        vault.redeemLocked(id);
    }

    function test_UnsolicitedSingleAndBatchDepositsReject() public {
        _mint(1, 1);
        vm.startPrank(borrower);
        vm.expectRevert();
        tokens.safeTransferFrom(borrower, address(vault), lower * 2 + 1, 1, "");
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = lower * 2 + 1;
        amounts[0] = 1;
        vm.expectRevert();
        tokens.safeBatchTransferFrom(borrower, address(vault), ids, amounts, "");
        vm.stopPrank();
        assertEq(vault.positionCount(), 0);
    }

    function test_CallbackCannotBeSpoofedAndDeskBindingIsImmutable() public {
        uint256[] memory ids = new uint256[](0);
        vm.expectRevert(FloorVault.UnexpectedDeposit.selector);
        vault.onERC1155BatchReceived(address(vault), borrower, ids, ids, "");
        vm.expectRevert(FloorVault.InvalidDesk.selector);
        vault.bindCreditDesk(address(desk));
    }

    function testFuzz_MinimumBoundAllPrices(uint64 ql, uint64 qu, uint128 rawPrice) public view {
        uint64 a = uint64(bound(ql, 1, type(uint64).max));
        uint64 b = uint64(bound(qu, 1, type(uint64).max));
        uint256 price = bound(rawPrice, 0, 1e36);
        uint256 pay = (price >= 5000e8 ? uint256(a) * 1e6 : 0) + (price < 6000e8 ? uint256(b) * 1e6 : 0);
        uint256 floorAmount = verifier.verifyPair(lower, upper, a, b).floorUsdcBase;
        assertGe(pay, floorAmount);
        assertGe((uint256(a) + b) * 500_000, floorAmount);
    }
}

contract CreditTests is Fixture {
    function test_LenderFundingMovesRealBalancesAndRecordsLien() public {
        uint256 beforeBorrower = usdc.balanceOf(borrower);
        uint256 beforeLender = usdc.balanceOf(lender);
        uint256 id = _fund();
        T.Loan memory loan = desk.getLoan(id);
        assertEq(usdc.balanceOf(borrower), beforeBorrower - 2e6 + 750_000);
        assertEq(usdc.balanceOf(lender), beforeLender - 750_000);
        assertEq(loan.due, 780_000);
        assertEq(loan.lender, lender);
        assertEq(vault.getPosition(loan.positionId).lienLoanId, id);
    }

    function test_ConsentRequiredAndPrincipalCannotBeChanged() public {
        uint256 id = _lock(1, 1);
        vm.prank(lender);
        vm.expectRevert(CreditDesk.InvalidState.selector);
        desk.fundLoan(id, 750_000, 780_000);
        vm.prank(borrower);
        desk.requestLoan(id, 750_000, 780_000, maturity);
        vm.prank(lender);
        vm.expectRevert(CreditDesk.InvalidTerms.selector);
        desk.fundLoan(id, 740_000, 780_000);
    }

    function test_OwnerOnlyRequestAndCancel() public {
        uint256 id = _lock(1, 1);
        vm.prank(stranger);
        vm.expectRevert(CreditDesk.Unauthorized.selector);
        desk.requestLoan(id, 750_000, 780_000, maturity);
        vm.prank(borrower);
        desk.requestLoan(id, 750_000, 780_000, maturity);
        vm.prank(borrower);
        desk.cancelRequest(id);
        vm.prank(lender);
        vm.expectRevert(CreditDesk.InvalidState.selector);
        desk.fundLoan(id, 750_000, 780_000);
    }

    function test_DebtIncludingFeeCannotExceedBufferCap() public {
        uint256 id = _lock(1, 1);
        assertEq(desk.maximumDue(1e6), 800_000);
        vm.prank(borrower);
        vm.expectRevert(CreditDesk.InvalidTerms.selector);
        desk.requestLoan(id, 750_000, 800_001, maturity);
        vm.prank(borrower);
        desk.requestLoan(id, 750_000, 780_000, maturity);
        vm.prank(lender);
        vm.expectRevert(CreditDesk.InvalidTerms.selector);
        desk.fundLoan(id, 750_000, 780_001);
    }

    function test_SameWalletCannotFabricateLender() public {
        uint256 id = _lock(1, 1);
        vm.prank(borrower);
        desk.requestLoan(id, 750_000, 780_000, maturity);
        vm.prank(borrower);
        vm.expectRevert(CreditDesk.Unauthorized.selector);
        desk.fundLoan(id, 750_000, 780_000);
    }

    function test_FailedAllowanceRevertsAllDebtAndCustodyChanges() public {
        uint256 id = _lock(1, 1);
        vm.prank(borrower);
        desk.requestLoan(id, 750_000, 780_000, maturity);
        vm.prank(lender);
        vm.expectRevert();
        desk.fundLoan(id, 750_000, 780_000);
        assertEq(desk.loanCount(), 0);
        assertTrue(desk.getRequest(id).active);
        assertEq(uint8(vault.getPosition(id).state), uint8(T.PositionState.OPEN));
        assertEq(vault.getPosition(id).lienLoanId, 0);
    }

    function test_ExpiredAndResolvedRequestsCannotFund() public {
        uint256 id = _lock(1, 1);
        uint64 expiry = uint64(block.timestamp + 30);
        vm.prank(borrower);
        desk.requestLoan(id, 750_000, 780_000, expiry);
        vm.warp(expiry);
        vm.prank(lender);
        vm.expectRevert(CreditDesk.Expired.selector);
        desk.fundLoan(id, 750_000, 780_000);
    }

    function test_NoNewRequestAtMaturity() public {
        uint256 id = _lock(1, 1);
        _finalize(5500e8);
        vm.prank(borrower);
        vm.expectRevert(CreditDesk.ObservationClosed.selector);
        desk.requestLoan(id, 750_000, 780_000, longstop);
    }

    function test_NoReleaseOrSecondFundingAfterLien() public {
        uint256 id = _fund();
        uint256 p = desk.getLoan(id).positionId;
        vm.prank(borrower);
        vm.expectRevert(FloorVault.InvalidPosition.selector);
        vault.releaseUnfunded(p);
        vm.prank(stranger);
        vm.expectRevert(CreditDesk.InvalidState.selector);
        desk.fundLoan(p, 750_000, 780_000);
    }

    function test_NoSettlementWhileUnresolved() public {
        uint256 id = _fund();
        vm.expectRevert(CreditDesk.NotResolved.selector);
        desk.settle(id);
        assertEq(uint8(desk.getLoan(id).state), uint8(T.LoanState.FUNDED));
    }

    function _checkSettlement(uint256 price, uint256 expected) internal {
        uint256 id = _fund();
        uint256 b = usdc.balanceOf(borrower);
        uint256 l = usdc.balanceOf(lender);
        _finalize(price);
        vm.prank(stranger);
        desk.settle(id);
        assertEq(usdc.balanceOf(lender) - l, 780_000);
        assertEq(usdc.balanceOf(borrower) - b, expected - 780_000);
        assertEq(uint8(desk.getLoan(id).state), uint8(T.LoanState.SETTLED));
        assertEq(uint8(vault.getPosition(1).state), uint8(T.PositionState.REDEEMED));
        assertEq(usdc.balanceOf(address(desk)), 0);
        assertEq(usdc.balanceOf(address(vault)), 0);
        vm.expectRevert(CreditDesk.InvalidState.selector);
        desk.settle(id);
    }

    function test_BelowPaysOne() public {
        _checkSettlement(4500e8, 1e6);
    }

    function test_LowerBoundaryPaysTwo() public {
        _checkSettlement(5000e8, 2e6);
    }

    function test_InsidePaysTwo() public {
        _checkSettlement(5500e8, 2e6);
    }

    function test_UpperBoundaryPaysOne() public {
        _checkSettlement(6000e8, 1e6);
    }

    function test_AbovePaysOne() public {
        _checkSettlement(6500e8, 1e6);
    }

    function test_SharedCancelPaysOne() public {
        uint256 id = _fund();
        uint256 b = usdc.balanceOf(borrower);
        uint256 l = usdc.balanceOf(lender);
        vm.warp(longstop);
        registry.cancel(obs);
        desk.settle(id);
        assertEq(usdc.balanceOf(lender) - l, 780_000);
        assertEq(usdc.balanceOf(borrower) - b, 220_000);
    }

    function test_PauseBlocksNewExposureButNotSettlementOrUnfundedRelease() public {
        uint256 loan = _fund();
        uint256 freePosition = _lock(1, 1);
        desk.setFundingPaused(true);
        vault.setLocksPaused(true);
        vm.prank(borrower);
        vault.releaseUnfunded(freePosition);
        _finalize(5500e8);
        desk.settle(loan);
        assertEq(uint8(desk.getLoan(loan).state), uint8(T.LoanState.SETTLED));
    }

    function testFuzz_BufferRoundsUp(uint128 floorAmount) public view {
        uint256 f = bound(floorAmount, 1, uint256(type(uint64).max) * 1e6);
        uint256 cap = desk.maximumDue(f);
        assertLe(cap * 10_000, f * 8000);
        assertLt(f * 8000 - cap * 10_000, 10_000);
    }
}
