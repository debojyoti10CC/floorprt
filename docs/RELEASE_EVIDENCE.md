# Release evidence — 5 November 2026

This release implements the local P0 outcome-collateral lifecycle and the final user-supplied Kimia visual direction. It is a test-funds prototype, independently authored after researching Cumulant and Senthos.

## Current push status

Pushed at the user's request before the final browser rerun. The latest full gate caught wallet identity being lost on refresh after successful repayment. Identity restoration has been implemented; its browser rerun and the final export remain pending. Contract, unit, differential and canonical Sepolia fork checks passed. The authoritative gate result remains FAIL until the rerun succeeds.

## Reproducible release gate

Run `pnpm verify` from the project root. The authoritative aggregate result and UTC timestamp are in `evidence/verification.json`; each command's output is retained in `evidence/logs/`.

| Gate | Evidence |
|---|---|
| Source, format and ABI consistency | 70 implementation sources checked; eight generated ABIs match compiler artifacts. |
| TypeScript | Root and Next application type checks. |
| Unit tests | 18 tests across proof math, persistent journal and oracle report guards and live-pair recovery. |
| Solidity | 73 offline tests across nine suites, including adversarial custody/backing cases, 512-run fuzz tests and three stateful invariants with 128 runs × 48 calls each. |
| Independent model | 10,000 Python/TypeScript vectors and 100 Solidity/TypeScript comparisons. |
| Deployment preflight | Chain 31337, seven runtime-code hashes and six-decimal collateral. |
| Browser | Twelve Chromium tests: offline read-only behavior, 3D/scenario controls, claim selection, four separate-wallet settlement cases, full repayment, expired-pair recovery, incompatible observations, mobile layout and Kimia/keyboard checks. |
| Replay | Six genuine local-chain settlements at below/lower-boundary/inside/upper-boundary/above/cancellation states. |
| Production export | Next production build and static packaging to `dist/`. |
| Dependency audit | Zero advisories at release; totals retained in `evidence/dependency-audit.json`. |

Foundry invariant handler reverts are expected rejected operations exercised by the handler; they are not test failures. The release gate propagates subprocess failures rather than treating a failed command as success.

## External dependencies

`pnpm test:fork` passes the complete mechanism against canonical Sepolia USDC and historical Chainlink feed bytecode at block 12071482. This separate test uses local fork balance provisioning and sends zero public transactions. Output is in `evidence/logs/sepolia-fork.log` and `evidence/sepolia-fork.json`. `pnpm sepolia:check` successfully read the real public contracts and a contiguous historical witness; `evidence/sepolia-external-read.json` records those reads. No public deployment is implied.

## Monetary evidence

`evidence/browser-results.json` records four borrower/lender/resolver settlement journeys plus full repayment, transaction hashes, block numbers and exact base-unit payouts. `evidence/demo-receipts.json` records all six replay cases. Principal moves from a distinct lender to the borrower; settlement burns the actual ERC-1155 collateral and transfers actual mock USDC. At a one-USDC floor, the demonstrated fixed due is 0.78 USDC; the residual is 1.22 inside the interval and 0.22 outside or on shared cancellation.

The API is read-only. Recorded snapshots cannot authorize transactions. Onchain reads are pinned to a single block; wallet writes verify chain and runtime identities and wait for receipts. The private static deployment exposes the mathematical tools and recorded evidence. Local `pnpm dev` supplies the live EVM and wallet-signed monetary journey.

## Visual and interaction evidence

`evidence/screenshots/overview.png` and `studio.png` show the final charcoal/periwinkle interface with self-hosted Poppins and the supplied depth treatment. `mobile-studio.png` records the 390px layout. Settlement screenshots accompany the browser journeys.

Browser assertions check the Poppins load, black canvas, token text contrast of at least 4.5:1, essential boundary/focus contrast of at least 3:1, chart arrow controls, wallet-dialog containment/Escape/focus return and reduced motion. Exact payoff tables and keyboard/click alternatives complement drag controls. These are focused implementation checks, not an independent full WCAG certification.

## Explicit limits

No public testnet receipt, live CRE simulation/DON deployment, signed RFQ market or tranche issuance is claimed. Oracle preparation code is tested but is not a live oracle integration. Generalized 2–8-leg research math does not authorize generalized vault collateral. Mock USDC has no market value; mainnet use is unsupported. The implementation has not received an independent audit.

The original PRD remains in `docs/`. Final design rules, implementation decisions, third-party notices and reference research document what was implemented and why.
