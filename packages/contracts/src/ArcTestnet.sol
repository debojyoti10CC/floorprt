// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library ArcTestnet {
    uint256 internal constant CHAIN_ID = 5_042_002;
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    function supportsPositionCollateral(address asset) internal view returns (bool) {
        return block.chainid == 31337 || (block.chainid == CHAIN_ID && asset == USDC);
    }
}
