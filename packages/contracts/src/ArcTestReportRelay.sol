// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ArcTestnet} from "./ArcTestnet.sol";
import {ITraderReportReceiver} from "./TraderCreditDesk.sol";

/// @notice Delivers CRE simulation output from a designated operator on Arc Testnet.
contract ArcTestReportRelay {
    address public immutable operator;

    error InvalidConfiguration();
    error Unauthorized();

    constructor(address operator_) {
        if (block.chainid != ArcTestnet.CHAIN_ID || operator_ == address(0)) revert InvalidConfiguration();
        operator = operator_;
    }

    function deliver(ITraderReportReceiver receiver, bytes32 workflowId, bytes calldata payload) external {
        if (msg.sender != operator) revert Unauthorized();
        if (address(receiver).code.length == 0 || workflowId == bytes32(0)) revert InvalidConfiguration();
        receiver.onReport(abi.encodePacked(workflowId, bytes10(0), operator), payload);
    }
}
