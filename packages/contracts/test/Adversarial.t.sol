// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Fixture} from "./Fixture.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {FloorTypes as T} from "../src/FloorTypes.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {OutcomeTokens} from "../src/OutcomeTokens.sol";
import {OutcomeMarketFactory} from "../src/OutcomeMarketFactory.sol";
import {FloorVault} from "../src/FloorVault.sol";

contract ReenteringHolder is ERC1155Holder {
    OutcomeTokens internal tokens;
    FloorVault internal vault;
    uint256 internal lower;
    uint256 internal upper;
    uint256 internal position;
    uint8 internal mode;
    bool public blocked;

    constructor(MockUSDC cash, OutcomeTokens tokens_, FloorVault vault_, uint256 l, uint256 u) {
        tokens = tokens_;
        vault = vault_;
        lower = l;
        upper = u;
        cash.faucet(10e6);
        cash.approve(address(tokens), type(uint256).max);
        tokens.setApprovalForAll(address(vault), true);
    }

    function attackMint() external {
        mode = 1;
        tokens.mintCompleteSet(lower, 1);
    }

    function attackRelease() external {
        mode = 0;
        tokens.mintCompleteSet(lower, 1);
        tokens.mintCompleteSet(upper, 1);
        position = vault.lockPair(lower, upper, 1, 1, address(this));
        mode = 2;
        vault.releaseUnfunded(position);
    }

    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public
        override
        returns (bytes4)
    {
        if (mode == 1) {
            try tokens.mergeCompleteSet(lower, 1) {
                blocked = false;
            } catch {
                blocked = true;
            }
        } else if (mode == 2) {
            try vault.releaseUnfunded(position) {
                blocked = false;
            } catch {
                blocked = true;
            }
        }
        return this.onERC1155BatchReceived.selector;
    }
}

contract FeeToken is ERC20 {
    constructor() ERC20("Bad fee asset", "BAD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value != 0) {
            super._update(from, address(0), 1);
            super._update(from, to, value - 1);
        } else {
            super._update(from, to, value);
        }
    }
}

contract AdversarialTests is Fixture {
    function test_MintReceiverCannotReenterAccounting() public {
        ReenteringHolder attacker = new ReenteringHolder(usdc, tokens, vault, lower, upper);
        attacker.attackMint();
        assertTrue(attacker.blocked());
        assertEq(tokens.escrow(lower), 1e6);
        assertEq(tokens.balanceOf(address(attacker), lower * 2 + 1), 1);
    }

    function test_ReleaseReceiverCannotReleaseTwice() public {
        ReenteringHolder attacker = new ReenteringHolder(usdc, tokens, vault, lower, upper);
        attacker.attackRelease();
        assertTrue(attacker.blocked());
        assertEq(uint8(vault.getPosition(1).state), uint8(T.PositionState.RELEASED));
        assertEq(tokens.balanceOf(address(attacker), lower * 2 + 1), 1);
    }

    function test_FeeOnTransferCannotCreateUnbackedClaims() public {
        FeeToken bad = new FeeToken();
        OutcomeMarketFactory f = new OutcomeMarketFactory(address(this), registry, IERC20Metadata(address(bad)));
        uint256 market = f.createMarket(obs, 5000e8);
        OutcomeTokens t = f.tokens();
        bad.mint(borrower, 10e6);
        vm.startPrank(borrower);
        bad.approve(address(t), 1e6);
        vm.expectRevert(OutcomeTokens.BackingMismatch.selector);
        t.mintCompleteSet(market, 1);
        vm.stopPrank();
        assertEq(t.escrow(market), 0);
        assertEq(t.totalSupply(market * 2 + 1), 0);
        assertEq(bad.balanceOf(borrower), 10e6);
    }

    function test_CallerCannotInjectFloorOrStealForeignIssuerTokens() public {
        OutcomeMarketFactory other = new OutcomeMarketFactory(address(this), registry, usdc);
        uint256 m = other.createMarket(obs, 5000e8);
        OutcomeTokens foreign = other.tokens();
        vm.startPrank(borrower);
        usdc.approve(address(foreign), 1e6);
        foreign.mintCompleteSet(m, 1);
        vm.expectRevert();
        foreign.safeTransferFrom(borrower, address(vault), m * 2 + 1, 1, "");
        vm.expectRevert();
        vault.lockPair(lower, upper, 1, 1, borrower);
        vm.stopPrank();
        assertEq(vault.positionCount(), 0);
    }
}
