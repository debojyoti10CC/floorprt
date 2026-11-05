// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Fixture} from "../Fixture.sol";
import {FloorTypes as T} from "../../src/FloorTypes.sol";

contract ActualPayoutFuzz is Fixture {
    function testFuzz_RandomStrikesAndActualRedemption(
        uint128 rawLower,
        uint128 gap,
        uint64 qa,
        uint64 qb,
        uint128 rawPrice,
        bool cancelled
    ) public {
        uint256 l = bound(rawLower, 1e16, 1e30);
        uint256 u = l + bound(gap, 1, 1e30);
        uint64 a = uint64(bound(qa, 1, 4000));
        uint64 b = uint64(bound(qb, 1, 4000));
        uint256 lm = factory.createMarket(obs, l);
        uint256 um = factory.createMarket(obs, u);
        T.VerifiedFloor memory proof = verifier.verifyPair(lm, um, a, b);
        assertTrue(proof.valid);
        vm.startPrank(borrower);
        usdc.approve(address(tokens), uint256(a + b) * 1e6);
        tokens.mintCompleteSet(lm, a);
        tokens.mintCompleteSet(um, b);
        vm.stopPrank();
        uint256 price = bound(rawPrice, 0, 1e36);
        if (cancelled) {
            vm.warp(longstop);
            registry.cancel(obs);
        } else {
            _finalize(price);
        }
        uint256 beforeBalance = usdc.balanceOf(borrower);
        vm.startPrank(borrower);
        uint256 payA = tokens.redeem(lm, T.Side.YES, a);
        uint256 payB = tokens.redeem(um, T.Side.NO, b);
        vm.stopPrank();
        assertGe(payA + payB, proof.floorUsdcBase);
        assertEq(usdc.balanceOf(borrower) - beforeBalance, payA + payB);
        if (cancelled) assertEq(payA + payB, (uint256(a) + b) * 500_000);
    }
}
