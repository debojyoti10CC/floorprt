// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Fixture} from "./Fixture.sol";
import {FloorTypes as T} from "../src/FloorTypes.sol";
import {CreditDesk} from "../src/CreditDesk.sol";

contract RepaymentTests is Fixture {
    function test_FullRepaymentPaysLenderAndReturnsExactClaims() public {
        uint256 id = _fund();
        uint256 beforeLender = usdc.balanceOf(lender);
        vm.startPrank(borrower);
        usdc.approve(address(desk), 780_000);
        desk.repay(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(lender) - beforeLender, 780_000);
        assertEq(uint8(desk.getLoan(id).state), uint8(T.LoanState.REPAID));
        assertEq(uint8(vault.getPosition(1).state), uint8(T.PositionState.RELEASED));
        assertEq(tokens.balanceOf(borrower, lower * 2 + 1), 1);
        assertEq(tokens.balanceOf(borrower, upper * 2 + 2), 1);
        vm.expectRevert(CreditDesk.InvalidState.selector);
        desk.settle(id);
        vm.prank(borrower);
        vm.expectRevert(CreditDesk.InvalidState.selector);
        desk.repay(id);
    }

    function test_FailedRepaymentLeavesLienAndLoanIntact() public {
        uint256 id = _fund();
        vm.prank(borrower);
        vm.expectRevert();
        desk.repay(id);
        assertEq(uint8(desk.getLoan(id).state), uint8(T.LoanState.FUNDED));
        assertEq(uint8(vault.getPosition(1).state), uint8(T.PositionState.ENCUMBERED));
    }

    function test_OnlyBorrowerRepaysAndPauseCannotStrandExit() public {
        uint256 id = _fund();
        vm.prank(stranger);
        vm.expectRevert(CreditDesk.Unauthorized.selector);
        desk.repay(id);
        desk.setFundingPaused(true);
        vm.warp(longstop);
        registry.cancel(obs);
        vm.startPrank(borrower);
        usdc.approve(address(desk), 780_000);
        desk.repay(id);
        tokens.redeem(lower, T.Side.YES, 1);
        tokens.redeem(upper, T.Side.NO, 1);
        vm.stopPrank();
        assertEq(uint8(desk.getLoan(id).state), uint8(T.LoanState.REPAID));
    }
}
