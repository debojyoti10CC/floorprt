// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Freely mintable TEST money. Never represent this asset as canonical USDC.
contract MockUSDC is ERC20 {
    error FaucetLimit();

    constructor() ERC20("Floor Test USDC - NO VALUE", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(uint256 amount) external {
        if (amount == 0 || amount > 10_000 * 1e6) revert FaucetLimit();
        _mint(msg.sender, amount);
    }
}
