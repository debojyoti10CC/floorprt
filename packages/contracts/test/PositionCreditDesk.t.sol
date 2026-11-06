// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MarginCreditDesk} from "../src/MarginCreditDesk.sol";
import {PositionCreditDesk, IConditionalTokens} from "../src/PositionCreditDesk.sol";
import {TraderCreditDesk} from "../src/TraderCreditDesk.sol";
import {TraderCreditKeeper} from "../src/TraderCreditKeeper.sol";

interface ITestConditionalTokens is IConditionalTokens {
    function prepareCondition(address oracle, bytes32 question, uint256 slots) external;
    function splitPosition(
        address collateral,
        bytes32 parent,
        bytes32 condition,
        uint256[] calldata partition,
        uint256 amount
    ) external;
}

contract PositionCreditDeskTest is Test {
    bytes32 private constant WORKFLOW = keccak256("position credit test");
    bytes32 private constant EVIDENCE = keccak256("dated evidence");
    address private borrower = makeAddr("position borrower");
    address private lender = makeAddr("position lender");
    address private bidder = makeAddr("liquidation bidder");
    MockUSDC private asset;
    ITestConditionalTokens private ctf;
    PositionCreditDesk private desk;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1_794_000_000);
        asset = new MockUSDC();
        bytes memory code = vm.parseJsonBytes(
            vm.readFile(
                "../../node_modules/@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json"
            ),
            ".bytecode"
        );
        address ledger;
        assembly ("memory-safe") {
            ledger := create(0, add(code, 32), mload(code))
        }
        assertGt(ledger.code.length, 0);
        ctf = ITestConditionalTokens(ledger);
        bytes32 question = keccak256("position credit condition");
        ctf.prepareCondition(address(this), question, 2);
        bytes32 condition = keccak256(abi.encodePacked(address(this), question, uint256(2)));
        desk = new PositionCreditDesk(asset, address(this), address(this), WORKFLOW, ctf, condition);

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        vm.startPrank(borrower);
        asset.faucet(500e6);
        asset.approve(ledger, 150e6);
        ctf.splitPosition(address(asset), bytes32(0), condition, partition, 150e6);
        ctf.setApprovalForAll(address(desk), true);
        asset.approve(address(desk), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(lender);
        asset.faucet(500e6);
        asset.approve(address(desk), type(uint256).max);
        vm.stopPrank();
    }

    function test_DebtCapRoundsDownAndExcessRevertsWithoutMovingFunds() public {
        assertEq(desk.maximumPositionDue(25e6, 102_499_999), 101_999_999);
        vm.expectRevert(abi.encodeWithSelector(PositionCreditDesk.DebtExceedsCollateral.selector, 102e6, 101_999_999));
        _request(102_499_999);
        assertEq(desk.activeForWallet(borrower), 0);
        assertEq(asset.balanceOf(address(desk)), 0);
        assertEq(ctf.balanceOf(borrower, desk.yesTokenId()), 150e6);

        uint256 id = _request(102_500_000);
        assertEq(desk.maximumPositionDue(25e6, 102_500_000), 102e6);
        _assertLocked(102_500_000);
        vm.prank(borrower);
        desk.cancelRequest(id);
        vm.prank(borrower);
        desk.claimPositionCollateral(id, borrower);
        _assertLocked(0);
        assertEq(ctf.balanceOf(borrower, desk.yesTokenId()), 150e6);
    }

    function test_RepayAndClaimExactPairsOnce() public {
        uint256 id = _request(120e6);
        _assertLocked(120e6);
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.InvalidState.selector);
        desk.claimPositionCollateral(id, borrower);
        _fund(id);
        vm.prank(borrower);
        desk.repay(id);
        assertEq(asset.balanceOf(lender), 502e6);
        vm.prank(borrower);
        desk.claimPositionCollateral(id, borrower);
        _assertLocked(0);
        assertEq(ctf.balanceOf(borrower, desk.noTokenId()), 150e6);
        vm.prank(borrower);
        vm.expectRevert(PositionCreditDesk.InvalidPositionCollateral.selector);
        desk.claimPositionCollateral(id, borrower);
    }

    function test_DefaultMergesBothSharesAndReturnsSurplus() public {
        uint256 id = _request(120e6);
        _fund(id);
        vm.expectRevert(TraderCreditDesk.Deadline.selector);
        desk.settleDefault(id);
        vm.warp(desk.getLoan(id).maturity);
        uint256 borrowerBefore = asset.balanceOf(borrower);
        desk.settleDefault(id);
        _assertLocked(0);
        assertEq(asset.balanceOf(address(desk)), 0);
        assertEq(asset.balanceOf(lender), 502e6);
        assertEq(asset.balanceOf(borrower) - borrowerBefore, 43e6);
        vm.expectRevert(TraderCreditDesk.InvalidState.selector);
        desk.settleDefault(id);
    }

    function test_KeeperExpiresRequestAndReturnsPairsToBorrower() public {
        uint256 id = _request(120e6);
        TraderCreditKeeper keeper = new TraderCreditKeeper(desk, TraderCreditKeeper.Custody.Paired);
        vm.warp(desk.getLoan(id).fundBy);
        bytes memory report = _sweep(keeper);
        vm.prank(lender);
        vm.expectRevert(TraderCreditKeeper.InvalidReport.selector);
        keeper.onReport(_metadata(), report);
        keeper.onReport(_metadata(), report);
        assertEq(uint256(desk.getLoan(id).state), uint256(TraderCreditDesk.State.Cancelled));
        assertEq(asset.balanceOf(address(desk)), 0);
        vm.expectRevert(TraderCreditKeeper.InvalidReport.selector);
        keeper.onReport(_metadata(), report);
        vm.warp(block.timestamp + 1);
        keeper.onReport(_metadata(), _sweep(keeper));
        _assertLocked(0);
        assertEq(ctf.balanceOf(borrower, desk.yesTokenId()), 150e6);
    }

    function test_MarginEarlyLiquidationPaysFullDueAndReleasesSharesToBidder() public {
        MarginCreditDesk margin = _marginRequest();
        assertEq(ctf.balanceOf(address(margin), margin.tokenId()), 120e6);
        assertEq(asset.balanceOf(address(margin)), 51e6);
        vm.prank(bidder);
        vm.expectRevert(MarginCreditDesk.InvalidBackstop.selector);
        margin.withdrawBackstop(1);
        _approveFunding(margin, 1);
        vm.prank(lender);
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        margin.fundLoan(1);

        bytes memory mark = _mark(margin, 427083, uint64(block.timestamp));
        vm.prank(lender);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        margin.onReport(_metadata(), mark);
        bytes memory future = _mark(margin, 505000, uint64(block.timestamp + 1));
        bytes memory stale = _mark(margin, 505000, uint64(block.timestamp - 16 minutes));
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        margin.onReport(_metadata(), future);
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        margin.onReport(_metadata(), stale);
        margin.onReport(_metadata(), mark);
        vm.prank(lender);
        vm.expectRevert(MarginCreditDesk.AboveOriginationLtv.selector);
        margin.fundLoan(1);
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        margin.onReport(_metadata(), mark);

        vm.warp(block.timestamp + 1);
        margin.onReport(_metadata(), _mark(margin, 505000, uint64(block.timestamp)));
        vm.warp(block.timestamp + 16 minutes);
        vm.prank(lender);
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        margin.fundLoan(1);
        margin.onReport(_metadata(), _mark(margin, 505000, uint64(block.timestamp)));
        vm.prank(lender);
        margin.fundLoan(1);
        vm.expectRevert(TraderCreditDesk.Deadline.selector);
        margin.settleDefault(1);

        vm.warp(block.timestamp + 1);
        margin.onReport(_metadata(), _mark(margin, 400000, uint64(block.timestamp)));
        assertEq(uint256(margin.getLoan(1).state), uint256(TraderCreditDesk.State.Funded));
        vm.warp(block.timestamp + 1);
        margin.onReport(_metadata(), _mark(margin, 500, uint64(block.timestamp)));
        assertLt(block.timestamp, margin.getLoan(1).maturity);
        assertEq(uint256(margin.getLoan(1).state), uint256(TraderCreditDesk.State.Defaulted));
        assertEq(asset.balanceOf(lender), 501e6);
        assertEq(asset.balanceOf(address(margin)), 0);
        vm.prank(borrower);
        vm.expectRevert(MarginCreditDesk.InvalidBackstop.selector);
        margin.claimPositionCollateral(1, borrower);

        TraderCreditKeeper keeper = new TraderCreditKeeper(margin, TraderCreditKeeper.Custody.Directional);
        keeper.onReport(_metadata(), _sweep(keeper));
        assertEq(ctf.balanceOf(bidder, margin.tokenId()), 120e6);
        assertEq(ctf.balanceOf(address(margin), margin.tokenId()), 0);
        vm.prank(bidder);
        vm.expectRevert(MarginCreditDesk.InvalidBackstop.selector);
        margin.claimPositionCollateral(1, bidder);
    }

    function test_MarginRepaymentRefundsUnusedReserveAndReleasesShares() public {
        MarginCreditDesk margin = _marginRequest();
        _approveFunding(margin, 1);
        margin.onReport(_metadata(), _mark(margin, 505000, uint64(block.timestamp)));
        vm.prank(lender);
        margin.fundLoan(1);
        vm.prank(borrower);
        margin.repay(1);
        margin.claimPositionCollateral(1, borrower);
        assertEq(asset.balanceOf(bidder), 38.5e6);
        assertEq(asset.balanceOf(address(margin)), 0);
        assertEq(asset.balanceOf(lender), 501e6);
        assertEq(ctf.balanceOf(borrower, margin.tokenId()), 150e6);
    }

    function _marginRequest() private returns (MarginCreditDesk margin) {
        margin = new MarginCreditDesk(asset, address(this), address(this), WORKFLOW, ctf, desk.conditionId(), 731);
        vm.startPrank(bidder);
        asset.faucet(38.5e6);
        asset.approve(address(margin), 38.5e6);
        margin.postBackstop(borrower, 120e6, 38.5e6);
        vm.stopPrank();
        vm.prank(lender);
        asset.approve(address(margin), 50e6);
        TraderCreditDesk.Terms memory terms = TraderCreditDesk.Terms(
            50e6, 51e6, 12.5e6, 1 days, uint64(block.timestamp), uint64(block.timestamp + 1 days), EVIDENCE, bytes32(0)
        );
        address[] memory traders = new address[](1);
        traders[0] = borrower;
        vm.startPrank(borrower);
        ctf.setApprovalForAll(address(margin), true);
        asset.approve(address(margin), type(uint256).max);
        margin.requestMarginLoan(terms, traders, traders, new bytes[](1), 1);
        vm.stopPrank();
    }

    function _mark(MarginCreditDesk margin, uint96 price, uint64 observedAt) private view returns (bytes memory) {
        return abi.encode(
            MarginCreditDesk.MarkReport(
                margin.MARK_SCHEMA(),
                block.chainid,
                address(margin),
                1,
                margin.referenceTokenId(),
                price,
                observedAt,
                keccak256("test order book")
            )
        );
    }

    function _sweep(TraderCreditKeeper keeper) private view returns (bytes memory) {
        (uint256 first, uint256 through,, uint64 observedAt,) = keeper.preview();
        return abi.encode(
            TraderCreditKeeper.Sweep(
                block.chainid,
                address(keeper),
                address(keeper.desk()),
                first,
                through,
                observedAt,
                keccak256("test sweep")
            )
        );
    }

    function _metadata() private view returns (bytes memory) {
        return abi.encodePacked(WORKFLOW, bytes10(0), address(this));
    }

    function _request(uint96 pairs) private returns (uint256) {
        TraderCreditDesk.Terms memory terms = TraderCreditDesk.Terms(
            100e6, 102e6, 25e6, 1 days, uint64(block.timestamp), uint64(block.timestamp + 1 days), EVIDENCE, bytes32(0)
        );
        address[] memory traders = new address[](1);
        traders[0] = borrower;
        vm.prank(borrower);
        return desk.requestLoanWithPositions(terms, traders, traders, new bytes[](1), pairs);
    }

    function _fund(uint256 id) private {
        _approveFunding(desk, id);
        vm.prank(lender);
        desk.fundLoan(id);
    }

    function _approveFunding(TraderCreditDesk credit, uint256 id) private {
        TraderCreditDesk.Loan memory loan = credit.getLoan(id);
        TraderCreditDesk.ScoreReport memory report = TraderCreditDesk.ScoreReport(
            address(credit),
            block.chainid,
            id,
            borrower,
            loan.walletSetHash,
            EVIDENCE,
            loan.terms.asOf,
            78,
            credit.POLICY_HASH()
        );
        credit.onReport(_metadata(), abi.encode(report));
        vm.prank(borrower);
        credit.commitAssessment(id, keccak256("report"), keccak256("reference"));
    }

    function _assertLocked(uint256 amount) private view {
        assertEq(ctf.balanceOf(address(desk), desk.yesTokenId()), amount);
        assertEq(ctf.balanceOf(address(desk), desk.noTokenId()), amount);
    }
}
