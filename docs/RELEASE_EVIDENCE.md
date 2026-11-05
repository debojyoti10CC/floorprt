# AQRA release evidence — 6 November 2026

## Release result

`pnpm verify` passes on the checked-out source. The command runs source/ABI checks, TypeScript, unit and property tests, Foundry, differential vectors, chain preflight, the real browser suite, six onchain replay cases, a production build, and the dependency audit. The recorded result and per-command logs are in `evidence/verification.json` and `evidence/logs/`.

## Verification

| Gate | Result |
|---|---|
| Source and ABI consistency | PASS; source conflict/secret checks and eight generated contract ABIs |
| TypeScript | PASS; API, shared packages, proof engine and web app |
| Unit tests | PASS; 19 tests across five files, including API deployment reload and journal isolation |
| Solidity | PASS; 75 offline tests, 512-run fuzz cases and three stateful invariants at 128 runs × 48 calls |
| Independent payoff model | PASS; 10,000 Python/TypeScript vectors and 100 Solidity/TypeScript comparisons |
| Local chain preflight | PASS; Anvil 31337, seven contract code hashes and six-decimal collateral |
| Browser workflows | PASS; 12 Chromium cases covering offline read-only, payoff controls, drag/keyboard, five borrower/lender scenarios, expired-pair recovery, mobile and focus/contrast |
| Settlement replay | PASS; six real local-EVM outcomes and two fresh collateral positions |
| Production build | PASS; Next static build and `dist/` packaging |
| Dependency audit | PASS; zero known advisories in the captured audit |
| Sepolia read-only check | PASS at block 12072398; canonical Circle USDC and Chainlink ETH/USD proxy, zero transactions |
| Sepolia fork mechanism | PASS at pinned block 12071482; full collateral and settlement waterfall, local-only test balances, zero public transactions |

Foundry skips the fork test during the offline Solidity suite; the separate `pnpm test:fork` gate runs and passes it. The local faucet, test resolver and clock controls exist only on loopback Anvil. The UI's recorded snapshot is provenance-labeled and cannot authorize writes.

## Monetary behavior

The browser suite uses distinct borrower, lender and resolver identities. It verifies exact wallet balances after funding, full repayment and settlement for below, inside, above and common-cancellation outcomes. Replay receipts, block numbers and exact base-unit payouts are saved in `evidence/browser-results.json` and `evidence/demo-receipts.json`.

At a one-USDC certified floor, the demo principal is 0.75 USDC and the fixed lender due is 0.78 USDC. The lender receives 0.78; the borrower receives the remaining 1.22 for an inside payoff or 0.22 for the other demonstrated cases. These are local test-USDC transfers, not real-value claims.

## Visual and interaction evidence

`evidence/screenshots/overview.png`, `studio.png`, `mobile-studio.png` and the settlement captures show the restored AQRA terminal. It uses the approved black/charcoal surfaces, Poppins, raised/inset depth and rounded controls. Both Poppins and JetBrains Mono are self-hosted with their original SIL Open Font License notices. Browser checks verify text and non-text contrast thresholds, visible keyboard focus, wallet-dialog focus/escape behavior, reduced motion and chart keyboard controls. These focused checks are not an independent accessibility certification.

## Boundaries

No public Sepolia deployment or public transaction was performed because no funded deployer signer was configured. The public read and fork tests are separate evidence; neither is a deployment receipt. The Chainlink adapter binds each observation to the proxy phase captured at deployment. After a feed phase upgrade, unresolved observations from the old instance fail closed and can reach their committed longstop cancellation; new observations require a new deployment.

The project has not received an independent security audit. Mainnet use, live Chainlink CRE/DON writes, signed RFQs, tranche issuance, external CTF custody and generalized multi-leg collateral are not implemented or claimed. See `FEATURES_AND_LIMITATIONS.md` and `EXTERNAL_DEPLOYMENT.md` for details.
