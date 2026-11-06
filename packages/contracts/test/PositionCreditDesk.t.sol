// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PositionCreditDesk, IConditionalTokens} from "../src/PositionCreditDesk.sol";
import {TraderCreditDesk} from "../src/TraderCreditDesk.sol";

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
        TraderCreditDesk.Loan memory loan = desk.getLoan(id);
        TraderCreditDesk.ScoreReport memory report = TraderCreditDesk.ScoreReport(
            address(desk),
            block.chainid,
            id,
            borrower,
            loan.walletSetHash,
            EVIDENCE,
            loan.terms.asOf,
            78,
            desk.POLICY_HASH()
        );
        desk.onReport(abi.encodePacked(WORKFLOW, bytes10(0), address(this)), abi.encode(report));
        vm.prank(borrower);
        desk.commitAssessment(id, keccak256("report"), keccak256("reference"));
        vm.prank(lender);
        desk.fundLoan(id);
    }

    function _assertLocked(uint256 amount) private view {
        assertEq(ctf.balanceOf(address(desk), desk.yesTokenId()), amount);
        assertEq(ctf.balanceOf(address(desk), desk.noTokenId()), amount);
    }
}
