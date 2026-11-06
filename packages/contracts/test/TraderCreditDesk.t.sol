// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TraderCreditDesk} from "../src/TraderCreditDesk.sol";

contract TraderCreditDeskTest is Test {
    MockUSDC private collateral;
    TraderCreditDesk private desk;
    address private borrower;
    address private lender;
    address private author;
    bytes32 private constant WORKFLOW = keccak256("workflow");
    bytes32 private constant EVIDENCE = keccak256("observed-wallet-evidence");
    bytes32 private constant REPORT_HASH = keccak256("public report bytes");
    bytes32 private constant SWARM_REFERENCE = keccak256("swarm reference");

    function setUp() public {
        vm.warp(1_794_000_000);
        borrower = makeAddr("borrower");
        lender = makeAddr("lender");
        author = makeAddr("workflow-author");
        collateral = new MockUSDC();
        desk = new TraderCreditDesk(IERC20Metadata(address(collateral)), address(this), author, WORKFLOW);
        _fundWallet(borrower);
        _fundWallet(lender);
    }

    function test_OnlyPinnedReportUnlocksExactFundingAndRepayment() public {
        uint256 id = _request();
        assertEq(collateral.balanceOf(address(desk)), 25e6);
        vm.prank(lender);
        vm.expectRevert(TraderCreditDesk.InvalidState.selector);
        desk.fundLoan(id);

        bytes memory report = _report(id, EVIDENCE, 78);
        bytes memory wrongDigest = _report(id, bytes32(uint256(1)), 78);
        bytes memory lowScore = _report(id, EVIDENCE, 59);
        vm.prank(makeAddr("wrong-forwarder"));
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.onReport(_metadata(author), report);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.onReport(_metadata(lender), report);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.onReport(_metadata(author), wrongDigest);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.onReport(_metadata(author), lowScore);

        desk.onReport(_metadata(author), report);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.onReport(_metadata(author), report);
        vm.prank(lender);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.fundLoan(id);
        _commitAssessment(id);
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.Unauthorized.selector);
        desk.fundLoan(id);

        vm.prank(lender);
        desk.fundLoan(id);
        assertEq(collateral.balanceOf(borrower), 575e6);
        assertEq(collateral.balanceOf(lender), 400e6);

        vm.prank(borrower);
        desk.repay(id);
        assertEq(collateral.balanceOf(borrower), 498e6);
        assertEq(collateral.balanceOf(lender), 502e6);
        assertEq(collateral.balanceOf(address(desk)), 0);
        assertEq(desk.activeForWallet(borrower), 0);
        assertEq(uint8(desk.getLoan(id).state), uint8(TraderCreditDesk.State.Repaid));
    }

    function test_DefaultPaysOnlyEscrowedBondAndReleasesIdentity() public {
        uint256 id = _request();
        desk.onReport(_metadata(author), _report(id, EVIDENCE, 78));
        _commitAssessment(id);
        vm.prank(lender);
        desk.fundLoan(id);
        vm.expectRevert(TraderCreditDesk.Deadline.selector);
        desk.settleDefault(id);

        vm.warp(desk.getLoan(id).maturity);
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.Deadline.selector);
        desk.repay(id);
        desk.settleDefault(id);
        assertEq(collateral.balanceOf(lender), 425e6);
        assertEq(collateral.balanceOf(address(desk)), 0);
        assertEq(desk.activeForWallet(borrower), 0);
        assertEq(uint8(desk.getLoan(id).state), uint8(TraderCreditDesk.State.Defaulted));
        vm.expectRevert(TraderCreditDesk.InvalidState.selector);
        desk.settleDefault(id);
    }

    function test_AssessmentCommitIsBorrowerOwnedAndImmutable() public {
        uint256 id = _request();
        desk.onReport(_metadata(author), _report(id, EVIDENCE, 78));
        vm.prank(lender);
        vm.expectRevert(TraderCreditDesk.Unauthorized.selector);
        desk.commitAssessment(id, REPORT_HASH, SWARM_REFERENCE);

        _commitAssessment(id);
        assertEq(desk.assessmentHashOf(id), REPORT_HASH);
        assertEq(desk.assessmentReferenceOf(id), SWARM_REFERENCE);
        vm.prank(borrower);
        desk.commitAssessment(id, REPORT_HASH, SWARM_REFERENCE);
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.commitAssessment(id, keccak256("different report"), SWARM_REFERENCE);
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.commitAssessment(id, bytes32(0), SWARM_REFERENCE);
    }

    function test_LinkConsentIsScopedAndCannotBeReused() public {
        uint256 traderKey = 0xA123;
        address trader = vm.addr(traderKey);
        _fundWallet(trader);
        TraderCreditDesk.Terms memory terms = _terms();
        terms.ensNode = keccak256("borrower.eth");
        address[] memory traders = new address[](1);
        traders[0] = trader;
        bytes[] memory consents = new bytes[](1);
        consents[0] = hex"";
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(TraderCreditDesk.InvalidWalletConsent.selector, trader));
        desk.requestLoan(terms, traders, consents);

        bytes32 context = keccak256(abi.encode(terms.evidenceDigest, terms.ensNode, terms.asOf, terms.linkExpires));
        bytes32 digest = desk.linkDigest(borrower, trader, context, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(traderKey, MessageHashUtils.toEthSignedMessageHash(digest));
        consents[0] = abi.encodePacked(r, s, v);
        vm.prank(borrower);
        uint256 id = desk.requestLoan(terms, traders, consents);
        assertEq(desk.activeForWallet(trader), id);
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(TraderCreditDesk.WalletAlreadyInUse.selector, trader));
        desk.requestLoan(terms, traders, new bytes[](1));

        vm.prank(borrower);
        desk.cancelRequest(id);
        assertEq(desk.activeForWallet(trader), 0);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(TraderCreditDesk.InvalidWalletConsent.selector, trader));
        desk.requestLoan(terms, traders, consents);
    }

    function test_ExpiredRequestRefundsTheBondAndCannotBeAttested() public {
        uint256 id = _request();
        bytes memory report = _report(id, EVIDENCE, 75);
        vm.warp(desk.getLoan(id).fundBy);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.onReport(_metadata(author), report);
        vm.prank(lender);
        desk.cancelRequest(id);
        assertEq(collateral.balanceOf(borrower), 500e6);
        assertEq(desk.activeForWallet(borrower), 0);
    }

    function test_UnverifiedPolygonAliasCannotReserveOrReleaseAnotherRequest() public {
        TraderCreditDesk.Terms memory terms = _terms();
        address[] memory traders = new address[](1);
        address[] memory controllers = new address[](1);
        bytes[] memory consents = new bytes[](1);
        traders[0] = lender;
        controllers[0] = borrower;
        vm.prank(borrower);
        uint256 forgedClaim = desk.requestLoanWithControllers(terms, traders, controllers, consents);
        assertEq(desk.traderControllers(forgedClaim)[0], borrower);
        assertEq(desk.activeForWallet(lender), 0);
        vm.prank(lender);
        uint256 direct = desk.requestLoan(terms, traders, consents);
        bytes memory payload = _report(forgedClaim, EVIDENCE, 78);
        vm.expectRevert(abi.encodeWithSelector(TraderCreditDesk.WalletAlreadyInUse.selector, lender));
        desk.onReport(_metadata(author), payload);
        vm.prank(borrower);
        desk.cancelRequest(forgedClaim);
        assertEq(desk.activeForWallet(lender), direct);
    }

    function test_AttestedPolygonAliasLocksAndUnlocksWithTheLoan() public {
        TraderCreditDesk.Terms memory terms = _terms();
        address[] memory traders = new address[](1);
        address[] memory controllers = new address[](1);
        traders[0] = lender;
        controllers[0] = borrower;
        vm.prank(borrower);
        uint256 id = desk.requestLoanWithControllers(terms, traders, controllers, new bytes[](1));
        assertEq(desk.activeForWallet(lender), 0);
        desk.onReport(_metadata(author), _report(id, EVIDENCE, 78));
        assertEq(desk.activeForWallet(lender), id);
        _commitAssessment(id);
        vm.prank(lender);
        vm.expectRevert(TraderCreditDesk.Unauthorized.selector);
        desk.fundLoan(id);
        vm.prank(borrower);
        desk.cancelRequest(id);
        assertEq(desk.activeForWallet(lender), 0);
    }

    function test_RejectsBelowBondAndBeyondLoanCap() public {
        TraderCreditDesk.Terms memory terms = _terms();
        terms.bond -= 1;
        address[] memory traders = new address[](1);
        traders[0] = borrower;
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.InvalidTerms.selector);
        desk.requestLoan(terms, traders, new bytes[](1));
        terms = _terms();
        terms.principal += 1;
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.InvalidTerms.selector);
        desk.requestLoan(terms, traders, new bytes[](1));
    }

    function test_WorkflowCanBePinnedOnceAfterDeskAddressIsKnown() public {
        desk = new TraderCreditDesk(IERC20Metadata(address(collateral)), address(this), author, bytes32(0));
        TraderCreditDesk.Terms memory terms = _terms();
        address[] memory traders = new address[](1);
        traders[0] = borrower;
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.InvalidConfiguration.selector);
        desk.requestLoan(terms, traders, new bytes[](1));
        vm.prank(borrower);
        vm.expectRevert(TraderCreditDesk.Unauthorized.selector);
        desk.pinWorkflow(WORKFLOW);
        desk.pinWorkflow(WORKFLOW);
        vm.expectRevert(TraderCreditDesk.InvalidConfiguration.selector);
        desk.pinWorkflow(bytes32(uint256(1)));
        _fundWallet(borrower);
        assertEq(_request(), 1);
    }

    function _terms() private view returns (TraderCreditDesk.Terms memory) {
        return TraderCreditDesk.Terms(
            100e6,
            102e6,
            25e6,
            30 days,
            uint64(block.timestamp - 2 days),
            uint64(block.timestamp + 1 days),
            EVIDENCE,
            bytes32(0)
        );
    }

    function _request() private returns (uint256) {
        TraderCreditDesk.Terms memory terms = _terms();
        address[] memory traders = new address[](1);
        traders[0] = borrower;
        vm.prank(borrower);
        return desk.requestLoan(terms, traders, new bytes[](1));
    }

    function _commitAssessment(uint256 id) private {
        vm.prank(borrower);
        desk.commitAssessment(id, REPORT_HASH, SWARM_REFERENCE);
    }

    function _metadata(address owner) private pure returns (bytes memory) {
        return abi.encodePacked(WORKFLOW, bytes10(0), owner);
    }

    function _report(uint256 id, bytes32 digest, uint8 score) private view returns (bytes memory) {
        TraderCreditDesk.Loan memory loan = desk.getLoan(id);
        return abi.encode(
            TraderCreditDesk.ScoreReport(
                address(desk),
                block.chainid,
                id,
                borrower,
                loan.walletSetHash,
                digest,
                loan.terms.asOf,
                score,
                desk.POLICY_HASH()
            )
        );
    }

    function _fundWallet(address who) private {
        vm.startPrank(who);
        collateral.faucet(500e6);
        collateral.approve(address(desk), type(uint256).max);
        vm.stopPrank();
    }
}
