// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ChainlinkObservationResolver, IHistoricalPriceFeed} from "../src/ChainlinkObservationResolver.sol";
import {SharedObservationRegistry} from "../src/SharedObservationRegistry.sol";
import {OutcomeMarketFactory} from "../src/OutcomeMarketFactory.sol";
import {FloorVerifier} from "../src/FloorVerifier.sol";
import {FloorVault} from "../src/FloorVault.sol";
import {CreditDesk} from "../src/CreditDesk.sol";
import {FloorTypes as T} from "../src/FloorTypes.sol";

/// @notice Real external token/feed bytecode on a pinned fork, never a public receipt.
contract SepoliaForkTests is Test {
    IERC20Metadata usdc;
    ChainlinkObservationResolver oracle;
    SharedObservationRegistry registry;
    OutcomeMarketFactory factory;
    FloorVault vault;
    CreditDesk desk;

    function test_CanonicalUsdcAndFeedDriveFullWaterfall() public {
        if (!vm.envOr("FLOOR_FORK_TEST", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(
            vm.envOr("FLOOR_SEPOLIA_RPC", string("https://ethereum-sepolia-rpc.publicnode.com")), 12071482
        );
        usdc = IERC20Metadata(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238);
        IHistoricalPriceFeed feed = IHistoricalPriceFeed(0x694AA1769357215DE4FAC081bf1f309aDC325306);
        uint80 round = 18446744073709588972;
        (,,, uint256 nextTime,) = feed.getRoundData(round + 1);
        (, int256 answer,,,) = feed.getRoundData(round);
        uint64 maturity = uint64(nextTime - 1);
        vm.warp(maturity - 600);
        oracle = new ChainlinkObservationResolver(address(this), feed, keccak256("ETH/USD"), 7200);
        registry = oracle.registry();
        factory = new OutcomeMarketFactory(address(this), registry, usdc);
        vault = new FloorVault(address(this), new FloorVerifier(factory));
        desk = new CreditDesk(address(this), vault, 2000);
        vault.bindCreditDesk(address(desk));
        uint256 obs = registry.registerObservation(
            oracle.assetId(), maturity, 8, oracle.sourceId(), registry.POLICY(), maturity + 1 days
        );
        uint256 lower = factory.createMarket(obs, uint256(answer) - 100e8);
        uint256 upper = factory.createMarket(obs, uint256(answer) + 100e8);
        address borrower = makeAddr("fork-borrower");
        address lender = makeAddr("fork-lender");
        // Test-only balance provisioning on the fork. No faucet or public mint exists.
        deal(address(usdc), borrower, 10e6);
        deal(address(usdc), lender, 10e6);
        vm.startPrank(borrower);
        usdc.approve(address(factory.tokens()), 2e6);
        factory.tokens().mintCompleteSet(lower, 1);
        factory.tokens().mintCompleteSet(upper, 1);
        factory.tokens().setApprovalForAll(address(vault), true);
        uint256 position = vault.lockPair(lower, upper, 1, 1, borrower);
        desk.requestLoan(position, 750_000, 780_000, maturity);
        vm.stopPrank();
        vm.startPrank(lender);
        usdc.approve(address(desk), 750_000);
        uint256 loan = desk.fundLoan(position, 750_000, 780_000);
        vm.stopPrank();
        vm.warp(nextTime);
        oracle.finalizeFromFeed(obs, round);
        uint256 b = usdc.balanceOf(borrower);
        uint256 l = usdc.balanceOf(lender);
        desk.settle(loan);
        assertEq(usdc.balanceOf(lender) - l, 780_000);
        assertEq(usdc.balanceOf(borrower) - b, 1_220_000);
        assertEq(uint8(desk.getLoan(loan).state), uint8(T.LoanState.SETTLED));
    }
}
