// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {FloorTypes as T} from "../src/FloorTypes.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SharedObservationRegistry} from "../src/SharedObservationRegistry.sol";
import {OutcomeMarketFactory} from "../src/OutcomeMarketFactory.sol";
import {OutcomeTokens} from "../src/OutcomeTokens.sol";
import {FloorVerifier} from "../src/FloorVerifier.sol";
import {FloorVault} from "../src/FloorVault.sol";
import {CreditDesk} from "../src/CreditDesk.sol";

abstract contract Fixture is Test {
    MockUSDC internal usdc;
    SharedObservationRegistry internal registry;
    OutcomeMarketFactory internal factory;
    OutcomeTokens internal tokens;
    FloorVerifier internal verifier;
    FloorVault internal vault;
    CreditDesk internal desk;
    address internal borrower = makeAddr("borrower");
    address internal lender = makeAddr("lender");
    address internal resolver = makeAddr("test-resolver");
    address internal stranger = makeAddr("stranger");
    uint64 internal maturity;
    uint64 internal longstop;
    uint256 internal obs;
    uint256 internal lower;
    uint256 internal upper;

    function setUp() public virtual {
        usdc = new MockUSDC();
        registry = new SharedObservationRegistry(address(this), resolver);
        factory = new OutcomeMarketFactory(address(this), registry, usdc);
        tokens = factory.tokens();
        verifier = new FloorVerifier(factory);
        vault = new FloorVault(address(this), verifier);
        desk = new CreditDesk(address(this), vault, 2000);
        vault.bindCreditDesk(address(desk));
        maturity = uint64(block.timestamp + 1 hours);
        longstop = maturity + 1 hours;
        obs = registry.registerObservation(
            keccak256("ETH/USD"), maturity, 8, keccak256("TEST_RESOLVER"), registry.POLICY(), longstop
        );
        lower = factory.createMarket(obs, 5000e8);
        upper = factory.createMarket(obs, 6000e8);
        vm.prank(borrower);
        usdc.faucet(10_000e6);
        vm.prank(lender);
        usdc.faucet(10_000e6);
    }

    function _mint(uint64 qLower, uint64 qUpper) internal {
        vm.startPrank(borrower);
        usdc.approve(address(tokens), type(uint256).max);
        tokens.mintCompleteSet(lower, qLower);
        tokens.mintCompleteSet(upper, qUpper);
        tokens.setApprovalForAll(address(vault), true);
        vm.stopPrank();
    }

    function _lock(uint64 qLower, uint64 qUpper) internal returns (uint256 id) {
        _mint(qLower, qUpper);
        vm.prank(borrower);
        id = vault.lockPair(lower, upper, qLower, qUpper, borrower);
    }

    function _fund() internal returns (uint256 id) {
        uint256 position = _lock(1, 1);
        vm.prank(borrower);
        desk.requestLoan(position, 750_000, 780_000, maturity);
        vm.startPrank(lender);
        usdc.approve(address(desk), 750_000);
        id = desk.fundLoan(position, 750_000, 780_000);
        vm.stopPrank();
    }

    function _finalize(uint256 price) internal {
        vm.warp(maturity);
        vm.prank(resolver);
        registry.finalize(obs, price);
    }
}
