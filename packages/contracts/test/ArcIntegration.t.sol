// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TraderCreditDesk, ITraderReportReceiver} from "../src/TraderCreditDesk.sol";
import {PositionCreditDesk, IConditionalTokens} from "../src/PositionCreditDesk.sol";
import {MarginCreditDesk} from "../src/MarginCreditDesk.sol";
import {TraderCreditKeeper} from "../src/TraderCreditKeeper.sol";
import {ArcTestReportRelay} from "../src/ArcTestReportRelay.sol";

interface IArcTestCTF is IConditionalTokens {
    function prepareCondition(address oracle, bytes32 question, uint256 slots) external;
    function splitPosition(
        address collateral,
        bytes32 parent,
        bytes32 condition,
        uint256[] calldata partition,
        uint256 amount
    ) external;
}

/// @dev Offline tests use mock bytecode at Arc's canonical address. Not a public Arc or CRE simulation receipt.
contract ArcIntegrationTest is Test {
    uint256 private constant ARC = 5_042_002;
    bytes32 private constant WORKFLOW = keccak256("arc integration workflow");
    address private constant USDC = 0x3600000000000000000000000000000000000000;
    address private borrower = makeAddr("arc borrower");
    address private lender = makeAddr("arc lender");
    address private backstop = makeAddr("arc backstop");
    MockUSDC private asset;
    IArcTestCTF private ctf;
    bytes32 private condition;
    ArcTestReportRelay private relay;
    MarginCreditDesk private desk;
    TraderCreditKeeper private keeper;

    function setUp() public {
        vm.chainId(ARC);
        vm.warp(1_794_000_000);
        MockUSDC implementation = new MockUSDC();
        vm.etch(USDC, address(implementation).code);
        asset = MockUSDC(USDC);
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
        ctf = IArcTestCTF(ledger);
        bytes32 question = keccak256("arc integration condition");
        ctf.prepareCondition(address(this), question, 2);
        condition = keccak256(abi.encodePacked(address(this), question, uint256(2)));
        relay = new ArcTestReportRelay(address(this));
        desk = new MarginCreditDesk(asset, address(relay), address(this), WORKFLOW, ctf, condition, 731);
        keeper = new TraderCreditKeeper(desk, TraderCreditKeeper.Custody.Directional);
        vm.startPrank(borrower);
        asset.faucet(10e6);
        asset.approve(ledger, 2_400_000);
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        ctf.splitPosition(USDC, bytes32(0), condition, partition, 2_400_000);
        ctf.setApprovalForAll(address(desk), true);
        asset.approve(address(desk), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(lender);
        asset.faucet(10e6);
        asset.approve(address(desk), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(backstop);
        asset.faucet(770_000);
        asset.approve(address(desk), 770_000);
        desk.postBackstop(borrower, 2_400_000, 770_000);
        vm.stopPrank();
    }

    function test_ArcRelayRecoversExactUsdcAndKeeperDeliversSharesOnce() public {
        _request();
        _scoreAndCommit();
        _mark(505_000, block.chainid);
        vm.prank(lender);
        desk.fundLoan(1);
        assertEq(asset.balanceOf(address(desk)), 1_020_000);
        uint256 before = asset.balanceOf(lender);
        vm.warp(block.timestamp + 1);
        _mark(500, block.chainid);
        assertLt(block.timestamp, desk.getLoan(1).maturity);
        assertEq(uint256(desk.getLoan(1).state), uint256(TraderCreditDesk.State.Defaulted));
        assertEq(asset.balanceOf(lender) - before, 1_020_000);
        assertEq(asset.balanceOf(address(desk)), 0);
        vm.prank(borrower);
        vm.expectRevert(MarginCreditDesk.InvalidBackstop.selector);
        desk.claimPositionCollateral(1, borrower);
        (uint256 first, uint256 through,, uint64 observedAt,) = keeper.preview();
        bytes memory sweep = abi.encode(
            TraderCreditKeeper.Sweep(
                ARC, address(keeper), address(desk), first, through, observedAt, keccak256("arc fixture sweep")
            )
        );
        relay.deliver(keeper, WORKFLOW, sweep);
        assertEq(ctf.balanceOf(backstop, desk.tokenId()), 2_400_000);
        assertEq(ctf.balanceOf(address(desk), desk.tokenId()), 0);
        vm.expectRevert(TraderCreditKeeper.InvalidReport.selector);
        relay.deliver(keeper, WORKFLOW, sweep);
        vm.expectRevert(MarginCreditDesk.InvalidBackstop.selector);
        desk.claimPositionCollateral(1, backstop);
        vm.expectRevert(TraderCreditDesk.InvalidState.selector);
        desk.settleDefault(1);
    }

    function test_RelayCannotBeUsedByBorrowerOrSpoofWorkflow() public {
        _request();
        bytes memory payload = _score();
        vm.prank(borrower);
        vm.expectRevert(ArcTestReportRelay.Unauthorized.selector);
        relay.deliver(desk, WORKFLOW, payload);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        relay.deliver(desk, keccak256("wrong workflow"), payload);
        vm.expectRevert(TraderCreditDesk.InvalidReport.selector);
        desk.onReport(abi.encodePacked(WORKFLOW, bytes10(0), address(this)), payload);
        vm.expectRevert(ArcTestReportRelay.InvalidConfiguration.selector);
        relay.deliver(ITraderReportReceiver(borrower), WORKFLOW, payload);
        vm.expectRevert(ArcTestReportRelay.InvalidConfiguration.selector);
        relay.deliver(desk, bytes32(0), payload);
    }

    function test_WrongChainReplayAndStaleMarksFailClosed() public {
        _request();
        _scoreAndCommit();
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        _mark(505_000, 31337);
        _mark(505_000, ARC);
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        _mark(505_000, ARC);
        vm.warp(block.timestamp + 16 minutes);
        vm.prank(lender);
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        desk.fundLoan(1);
        assertEq(uint256(desk.getLoan(1).state), uint256(TraderCreditDesk.State.Requested));
        assertEq(asset.balanceOf(lender), 10e6);
    }

    function test_ArcRequiresCanonicalUsdcAndRelayRequiresArc() public {
        MockUSDC other = new MockUSDC();
        vm.expectRevert(TraderCreditDesk.InvalidConfiguration.selector);
        new PositionCreditDesk(other, address(relay), address(this), WORKFLOW, ctf, condition);
        vm.expectRevert(TraderCreditDesk.InvalidConfiguration.selector);
        new MarginCreditDesk(other, address(relay), address(this), WORKFLOW, ctf, condition, 731);
        vm.chainId(11155111);
        vm.expectRevert(ArcTestReportRelay.InvalidConfiguration.selector);
        new ArcTestReportRelay(address(this));
        vm.chainId(ARC);
        vm.expectRevert(ArcTestReportRelay.InvalidConfiguration.selector);
        new ArcTestReportRelay(address(0));
    }

    function test_RepaymentRefundsBidWithoutLiquidatingShares() public {
        _request();
        _scoreAndCommit();
        _mark(505_000, ARC);
        vm.prank(lender);
        desk.fundLoan(1);
        vm.prank(borrower);
        desk.repay(1);
        assertEq(asset.balanceOf(backstop), 770_000);
        desk.claimPositionCollateral(1, borrower);
        assertEq(ctf.balanceOf(borrower, desk.tokenId()), 2_400_000);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(MarginCreditDesk.InvalidMark.selector);
        _mark(500, ARC);
    }

    function _request() private {
        address[] memory traders = new address[](1);
        traders[0] = borrower;
        TraderCreditDesk.Terms memory terms = TraderCreditDesk.Terms(
            1_000_000,
            1_020_000,
            250_000,
            1 days,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 days),
            keccak256("arc test evidence"),
            bytes32(0)
        );
        vm.prank(borrower);
        desk.requestMarginLoan(terms, traders, traders, new bytes[](1), 1);
    }

    function _score() private view returns (bytes memory) {
        TraderCreditDesk.Loan memory loan = desk.getLoan(1);
        return abi.encode(
            address(desk),
            ARC,
            uint256(1),
            borrower,
            loan.walletSetHash,
            loan.terms.evidenceDigest,
            loan.terms.asOf,
            uint8(80),
            desk.POLICY_HASH()
        );
    }

    function _scoreAndCommit() private {
        relay.deliver(desk, WORKFLOW, _score());
        vm.prank(borrower);
        desk.commitAssessment(1, keccak256("report"), keccak256("swarm reference"));
    }

    function _mark(uint96 price, uint256 chainId) private {
        relay.deliver(
            desk,
            WORKFLOW,
            abi.encode(
                MarginCreditDesk.MarkReport(
                    keccak256("aqra-market-mark-v1"),
                    chainId,
                    address(desk),
                    1,
                    731,
                    price,
                    uint64(block.timestamp),
                    keccak256("recorded price fixture")
                )
            )
        );
    }
}
