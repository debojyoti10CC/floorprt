import { EVMClient } from '@chainlink/cre-sdk';
import { ARC_TESTNET_CHAIN_ID } from '../../../packages/shared/src/arc.js';

export function lendingSelector(chainId: number) {
  if (![31337, 11155111, ARC_TESTNET_CHAIN_ID].includes(chainId)) throw new Error('Unsupported lending chain.');
  // The local CRE project maps the Sepolia capability to Anvil; this is not a public Sepolia read.
  const name = chainId === ARC_TESTNET_CHAIN_ID ? 'arc-testnet' : 'ethereum-testnet-sepolia';
  const selector = EVMClient.SUPPORTED_CHAIN_SELECTORS[name];
  if (selector === undefined) throw new Error('The installed CRE SDK does not support ' + name);
  return selector;
}
