import { EVMClient } from '@chainlink/cre-sdk';
import { ARC_TESTNET_CHAIN_ID } from '../../../packages/shared/src/arc.js';

export function lendingSelector(chainId: number) {
  return EVMClient.SUPPORTED_CHAIN_SELECTORS[chainId === ARC_TESTNET_CHAIN_ID ? 'arc-testnet' : 'ethereum-testnet-sepolia'];
}
