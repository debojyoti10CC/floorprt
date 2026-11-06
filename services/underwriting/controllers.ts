import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address, type Hex } from 'viem';

const exchange: Address = '0xe111180000d2663c0091e4f400237545b87b996b';
export const polygonMulticall = '0xca11bde05977b3631167028862be2a173976ca11';
const factoryAbi = parseAbi([
  'function getSafeWalletAddress(address signer) view returns (address)',
  'function getProxyWalletAddress(address signer) view returns (address)',
]);
const safeAbi = parseAbi([
  'function isOwner(address owner) view returns (bool)',
  'function getThreshold() view returns (uint256)',
]);
const batchAbi = parseAbi([
  'function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] results)',
]);
const sameAddress = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

// The report binds the immutable loan ID. A Polygon alias is reserved only after these finalized reads.
export async function verifyControllers(
  wallets: readonly Address[],
  controllers: readonly Address[],
  readPolygon: (address: Address, data: Hex) => Promise<Hex>,
) {
  if (wallets.length !== controllers.length) throw new Error('The trader group and controllers do not match.');
  const aliases = wallets.flatMap((wallet, index) =>
    sameAddress(wallet, controllers[index]) ? [] : [{ wallet, controller: controllers[index] }],
  );
  if (!aliases.length) return;
  const calls = aliases.flatMap(({ wallet, controller }) => [
    { target: exchange, allowFailure: false, callData: encodeFunctionData({ abi: factoryAbi, functionName: 'getProxyWalletAddress', args: [controller] }) },
    { target: exchange, allowFailure: false, callData: encodeFunctionData({ abi: factoryAbi, functionName: 'getSafeWalletAddress', args: [controller] }) },
    { target: wallet, allowFailure: true, callData: encodeFunctionData({ abi: safeAbi, functionName: 'isOwner', args: [controller] }) },
    { target: wallet, allowFailure: true, callData: encodeFunctionData({ abi: safeAbi, functionName: 'getThreshold' }) },
  ]);
  const data = await readPolygon(polygonMulticall, encodeFunctionData({ abi: batchAbi, functionName: 'aggregate3', args: [calls] }));
  const results = decodeFunctionResult({ abi: batchAbi, functionName: 'aggregate3', data });
  if (results.length !== calls.length) throw new Error('The Polygon wallet read was incomplete.');
  for (const [index, { wallet }] of aliases.entries()) {
    const [proxy, safe, owner, threshold] = results.slice(index * 4, index * 4 + 4);
    if (proxy.success && sameAddress(wallet, decodeFunctionResult({ abi: factoryAbi, functionName: 'getProxyWalletAddress', data: proxy.returnData }))) continue;
    const isSafe = safe.success && sameAddress(wallet, decodeFunctionResult({ abi: factoryAbi, functionName: 'getSafeWalletAddress', data: safe.returnData }));
    if (isSafe && owner.success && threshold.success
      && decodeFunctionResult({ abi: safeAbi, functionName: 'isOwner', data: owner.returnData })
      && decodeFunctionResult({ abi: safeAbi, functionName: 'getThreshold', data: threshold.returnData }) === 1n) continue;
    throw new Error('Polygon could not verify the controller of ' + wallet + '. Use a supported Polymarket proxy or sign directly with the trader wallet.');
  }
}
