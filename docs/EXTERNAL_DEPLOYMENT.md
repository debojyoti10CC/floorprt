# External collateral and historical feed deployment

The local stack uses an isolated test faucet. Sepolia uses the existing Circle USDC contract at `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` and the Chainlink ETH/USD proxy at `0x694AA1769357215DE4FAC081bf1f309aDC325306`. No MockUSDC is deployed on Sepolia. Testnet tokens still have no financial value.

Addresses were checked against [Circle's official registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) and [Chainlink's API reference](https://docs.chain.link/data-feeds/api-reference) on 5 November 2026.

## Read and fork verification

```sh
pnpm sepolia:check
pnpm test:fork
```

The first command makes public read-only RPC calls. The second runs the entire mint/custody/funding/oracle/settlement mechanism against real external bytecode on a pinned local fork at block 12071482. Foundry provides test balances on that fork. Neither command sends public transactions or manufactures public receipts.

## Deploy to Sepolia

Use a dedicated, funded testnet deployer in the process environment. Never place a key in browser configuration or source control. A separate borrower and lender supply their own wallet signatures and canonical test USDC. The deployer does not receive authority to spend their balances.

```powershell
$env:FLOOR_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
# Supply DEPLOYER_PRIVATE_KEY securely in this process, outside source files.
pnpm contracts:build
pnpm abi
pnpm deploy:sepolia
pnpm preflight
pnpm build
```

The deployment script accepts only chain 31337 or 11155111. Public deployment requires an explicit signer. Its generated manifest pins contract addresses, runtime-code hashes and collateral identity. Load that manifest/RPC under Operations and use an injected wallet. Faucet and local clock controls are unavailable for this deployment.

No funded public signer was available in this session; a public deployment has not been claimed. The saved public-read and fork evidence prove different, explicitly identified gates.

## Oracle semantics

The adapter creates its registry with itself as the immutable resolver. The registered asset, decimals and source hash must match its bound feed. Anyone may submit a historical round witness, but nobody may submit an arbitrary price.

The observation's price is the last feed publication at or before its timestamp. The immediately following round must publish strictly after that timestamp. Both rounds must be complete, have positive answers and valid timestamps. The previous publication and its successor must lie within the precommitted maximum window. The adapter finalizes the registry using the prior round's answer; the caller supplies only its ID.

The adapter snapshots the proxy's active phase at deployment and includes that phase in each observation's source commitment. Both witness rounds must be adjacent in that phase, and the proxy must still report that phase when finalization executes. This prevents retained historical rounds from an archived aggregator being treated as the current feed. Gaps, missing data and phase transitions fail closed. After a Chainlink phase upgrade, deploy a new protocol instance for new observations; observations bound to the previous phase remain unresolved and can use their committed longstop cancellation. This follows Chainlink's documented phase-encoded proxy round IDs and historical aggregator behavior ([historical data](https://docs.chain.link/data-feeds/price-feeds/historical-data)).

The UI's witness lookup does not override onchain validation. This adapter is distinct from CRE, which remains a separate future integration.

## Repayment and settlement races

The borrower can pay the complete agreed fixed due from their wallet and atomically recover the exact pledged claims. Full fees remain due; there is no hidden prorating. Repayment remains possible after maturity while the loan is funded. A successful repayment prevents settlement, and a successful settlement prevents repayment. Any failed token transfer or ERC-1155 receiver callback reverts the entire operation. New-funding pauses cannot block this exit.

## Production requirements

An independent audit, operational monitoring, feed/phase migration policy, multisig administration and settlement-token freeze handling remain necessary before a real-money deployment. Mainnet is not enabled by this release.
