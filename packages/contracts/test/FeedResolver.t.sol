// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {ChainlinkObservationResolver, IHistoricalPriceFeed} from "../src/ChainlinkObservationResolver.sol";
import {SharedObservationRegistry} from "../src/SharedObservationRegistry.sol";
import {FloorTypes as T} from "../src/FloorTypes.sol";

contract HistoricalFeedFixture is IHistoricalPriceFeed {
    struct Round {
        uint80 id;
        int256 price;
        uint256 started;
        uint256 updated;
        uint80 answered;
    }
    mapping(uint80 => Round) private rounds;
    uint8 public constant decimals = 8;
    uint16 public phaseId = 1;

    function set(uint80 id, int256 price, uint256 started, uint256 updated, uint80 answered) external {
        rounds[id] = Round(id, price, started, updated, answered);
    }

    function setPhase(uint16 phase) external {
        phaseId = phase;
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = rounds[id];
        require(r.id != 0, "No data");
        return (r.id, r.price, r.started, r.updated, r.answered);
    }
}

contract FeedResolverTests is Test {
    HistoricalFeedFixture feed;
    ChainlinkObservationResolver adapter;
    SharedObservationRegistry registry;
    uint256 id;
    uint64 maturity;

    function rid(uint64 aggregatorRound) internal pure returns (uint80) {
        return (uint80(1) << 64) | aggregatorRound;
    }

    function setUp() public {
        vm.warp(100_000);
        feed = new HistoricalFeedFixture();
        adapter = new ChainlinkObservationResolver(address(this), feed, keccak256("ETH/USD"), 3600);
        registry = adapter.registry();
        maturity = uint64(block.timestamp + 3600);
        id = registry.registerObservation(
            adapter.assetId(), maturity, 8, adapter.sourceId(), registry.POLICY(), maturity + 7200
        );
        feed.set(rid(41), 5001e8, maturity - 100, maturity - 60, rid(41));
        feed.set(rid(42), 5002e8, maturity + 10, maturity + 30, rid(42));
        vm.warp(maturity + 30);
    }

    function test_AnyKeeperUsesBoundFeedAndImmutableHistoricalPrice() public {
        vm.prank(makeAddr("keeper"));
        adapter.finalizeFromFeed(id, rid(41));
        assertEq(registry.observation(id).price, 5001e8);
        assertEq(uint8(registry.observation(id).state), uint8(T.ObservationState.FINALIZED));
        vm.expectRevert(SharedObservationRegistry.AlreadyTerminal.selector);
        adapter.finalizeFromFeed(id, rid(41));
    }

    function test_CallerCannotSubmitPriceDirectly() public {
        vm.expectRevert(SharedObservationRegistry.UnauthorizedResolver.selector);
        registry.finalize(id, 9999e8);
    }

    function test_RejectsUnboundSource() public {
        uint256 other = registry.registerObservation(
            adapter.assetId(),
            uint64(block.timestamp + 10),
            8,
            keccak256("OTHER"),
            registry.POLICY(),
            uint64(block.timestamp + 100)
        );
        vm.expectRevert(ChainlinkObservationResolver.IncompatibleObservation.selector);
        adapter.finalizeFromFeed(other, rid(41));
    }

    function test_RejectsWrongAssetAndPrecision() public {
        uint256 other = registry.registerObservation(
            keccak256("BTC/USD"),
            uint64(block.timestamp + 10),
            8,
            adapter.sourceId(),
            registry.POLICY(),
            uint64(block.timestamp + 100)
        );
        vm.expectRevert(ChainlinkObservationResolver.IncompatibleObservation.selector);
        adapter.finalizeFromFeed(other, rid(41));
    }

    function test_RejectsStaleFutureAndNegativeData() public {
        feed.set(rid(41), 5001e8, maturity - 4000, maturity - 3700, rid(41));
        vm.expectRevert(ChainlinkObservationResolver.InvalidWindow.selector);
        adapter.finalizeFromFeed(id, rid(41));
        feed.set(rid(41), -1, maturity - 100, maturity - 60, rid(41));
        vm.expectRevert(ChainlinkObservationResolver.InvalidRound.selector);
        adapter.finalizeFromFeed(id, rid(41));
        feed.set(rid(41), 5001e8, maturity - 100, maturity - 60, rid(41));
        feed.set(rid(42), 5002e8, maturity + 50, maturity + 60, rid(42));
        vm.expectRevert(ChainlinkObservationResolver.InvalidWindow.selector);
        adapter.finalizeFromFeed(id, rid(41));
    }

    function test_CannotChooseLaterOrEarlierRoundForOutcome() public {
        feed.set(rid(40), 1000e8, maturity - 300, maturity - 200, rid(40));
        vm.expectRevert(ChainlinkObservationResolver.InvalidWindow.selector);
        adapter.finalizeFromFeed(id, rid(40));
        feed.set(rid(43), 9000e8, maturity + 40, maturity + 50, rid(43));
        vm.warp(maturity + 50);
        vm.expectRevert(ChainlinkObservationResolver.InvalidWindow.selector);
        adapter.finalizeFromFeed(id, rid(42));
    }

    function test_ExactObservationRoundIsIncluded() public {
        feed.set(rid(41), 5001e8, maturity - 10, maturity, rid(41));
        adapter.finalizeFromFeed(id, rid(41));
        assertEq(registry.observation(id).price, 5001e8);
    }

    function test_IncompleteRoundAndMissingSuccessorFailClosed() public {
        feed.set(rid(41), 5001e8, maturity - 100, maturity - 60, rid(40));
        vm.expectRevert(ChainlinkObservationResolver.InvalidRound.selector);
        adapter.finalizeFromFeed(id, rid(41));
        vm.expectRevert();
        adapter.finalizeFromFeed(id, rid(500));
    }

    function test_RejectsRoundsFromArchivedFeedPhase() public {
        feed.setPhase(2);
        vm.expectRevert(ChainlinkObservationResolver.InvalidRound.selector);
        adapter.finalizeFromFeed(id, rid(41));
    }

    function test_RejectsRoundWhoseSuccessorCrossesPhaseBoundary() public {
        uint80 lastRound = (uint80(1) << 64) | type(uint64).max;
        vm.expectRevert(ChainlinkObservationResolver.InvalidRound.selector);
        adapter.finalizeFromFeed(id, lastRound);
    }

    function test_CommonLongstopWorksWhenFeedStalls() public {
        vm.warp(maturity + 7200);
        vm.prank(makeAddr("keeper"));
        registry.cancel(id);
        vm.expectRevert(SharedObservationRegistry.AlreadyTerminal.selector);
        adapter.finalizeFromFeed(id, rid(41));
    }
}
