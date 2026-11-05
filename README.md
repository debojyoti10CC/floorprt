# Floor Protocol

An independently implemented outcome-collateral terminal: **compose → verify → lock → fund → settle**.

The application uses a real local EVM, fully backed ERC-1155 outcome claims, full fixed-debt repayment, wallet-signed transactions and a lender-first USDC settlement waterfall. Its scenario studio evaluates exact contractual payoffs; financial state comes from contract reads and confirmed events.

## Start the complete application

Prerequisites: Node 24, pnpm 10.20.0, Python 3.10+ for differential tests. Foundry native binaries are pinned npm dependencies; a separate global Foundry installation is unnecessary.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:3000/**. The command starts Anvil on `8545`, compiles contracts, generates typed ABIs, deploys/seeds when needed, and serves the read API on `8787`. It reuses an existing compatible local stack. Native package postinstall hooks that assume a Unix shell are deliberately disabled; the Foundry wrapper resolves the platform binary directly on Windows/Linux/macOS.

Choose **Connect wallet → Borrower**, **Lender**, or **Curator / test resolver** to use the explicitly labeled local Anvil accounts. An injected Ethereum wallet is also supported. The local signer is restricted to loopback chain 31337. The API has no signing route and never holds a borrower's spending key.

## A complete interactive journey

1. Open **Operations & devnet**, connect the curator/resolver, and create a fresh shared observation if the current one has matured.
2. Connect the borrower. Open **Portfolio studio**, choose YES at the lower strike and NO at the upper strike, and mint fully backed complete sets if needed. Claim chips support dragging and keyboard/click selection.
3. Inspect the exact payoff chart and **Proof inspector**. Approve the ERC-1155 operator and **Lock pair in vault**. The vault recomputes the proof onchain.
4. In **Credit desk → Borrow**, select the new vault position. Publish a `0.75` principal / `0.78` maximum total-due request for a one-USDC floor.
5. Switch to a distinct lender wallet. In **Lend**, select that request and **Approve & fund loan**. Principal transfers directly from lender to borrower.
6. Switch to the resolver. In **Operations**, select the observation and below/inside/above/cancellation scenario. **Advance local clock & finalize** explicitly changes the test chain; the studio's slider does not.
7. Open **Settlement audit**, select the loan and settle. The claims burn, the lender receives fixed due and the beneficiary receives the residual. Refresh to reproduce the result from chain state.

The command center's rotatable 3D surface and state matrix model price versus 1–6× portfolio scale. They are deterministic payoff models, not wallet balances, probability estimates or oracle writes. Changing a scenario updates the displayed exact cashflow. The final layout follows the supplied financial-terminal and Kimia references: Poppins, black/charcoal surfaces, pale periwinkle accents, rounded controls and inset/raised depth. Explanatory lifecycle cards were removed from the transaction screens; mechanism detail lives in documentation. The earlier Coinbase reference remains in `apps/web/DESIGN.md`; `docs/DESIGN_SYSTEM.md` defines the final semantic tokens, component states and accessibility checks. Poppins is self-hosted with its SIL license; no reference brand logos or trading data are copied.

## Reproduce the evidence

```sh
pnpm exec playwright install chromium  # once, for browser QA
pnpm check                            # source/ABI checks, types, unit/property tests, Foundry, differential math
pnpm preflight                        # chain identity, runtime code hashes and collateral decimals
pnpm e2e                              # separate wallet contexts, all four settlements, 3D controls, drag, mobile
pnpm demo                             # six real settlement cases; writes receipts and leaves fresh demo inventory
pnpm test:fork                        # pinned Sepolia fork: canonical USDC + Chainlink + full waterfall
pnpm sepolia:check                    # genuine public RPC reads; no transactions or keys
pnpm verify                           # full checks + browser + build + dependency audit, with saved logs
```

`pnpm demo` deliberately advances the local clock. It tests below/lower-boundary/inside/upper-boundary/above/cancel states, then leaves funded and unfunded positions on a new observation for exploration. Each repeated run adds new real test transactions; it does not reset or invent a ledger.

| Canonical scenario | Redeemed | Lender paid | Borrower residual |
|---|---:|---:|---:|
| Below 5,000 | 1.00 | 0.78 | 0.22 |
| Exactly 5,000 | 2.00 | 0.78 | 1.22 |
| Inside interval | 2.00 | 0.78 | 1.22 |
| Exactly 6,000 | 1.00 | 0.78 | 0.22 |
| Above 6,000 | 1.00 | 0.78 | 0.22 |
| Shared 50/50 cancellation | 1.00 | 0.78 | 0.22 |

Amounts are test USDC. Full transaction hashes, block numbers and exact base units are saved in `evidence/demo-receipts.json` and `evidence/browser-results.json`. Compiler artifacts generate eight typed ABIs; deployment manifests pin runtime code hashes and deployment blocks.

## Implementation map

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js terminal, scenario surface, draggable outcome graph, proof, credit, portfolio, audit, operations |
| `packages/contracts/src` | Registry, curated factory, backed claims, pair verifier, exact custody and matched credit |
| `packages/proof-engine` | BigInt payout engine, cancellation, conservative debt bounds, research-only 2–8-leg sweep |
| `packages/shared` | Generated ABIs, pinned-block chain reads, reason codes and types |
| `apps/api` | Read-only Hono API, validated proof previews, provenance-tagged Gamma research feed |
| `services/indexer` | Durable block-hash journal, idempotency, orphan retention and replay after reorg |
| `services/oracle-workflow` | Tested report-preparation guards; explicitly not a live CRE workflow |
| `e2e`, `scripts`, `.github/workflows` | Browser verification, independent Python model, deployment, replay and CI |
| `docs` | Original blueprint, implementation decisions, source research and runbooks |

The direct read snapshot is bounded to the newest 200 observations/markets/positions/loans and 5,000 blocks of events. This is a local P0 terminal, not a global institutional analytics index. The persistent event journal is secondary; it never authorizes spending or overrides contract state.

## External integrations and deployment boundaries

This release demonstrates the local P0 lifecycle and selected P1 components: persistent indexing, read-only external discovery, generalized research math, and oracle-input guards. **Public testnet transaction receipts, a CRE CLI simulation/live DON write, EIP-712 RFQs and tranche issuance are not demonstrated.** Full repayment and an external Chainlink feed adapter are implemented and tested. The canonical Sepolia USDC/feed integration passes on a pinned fork; fork balance provisioning is explicitly test-only. External CTF custody and cross-chain assets are excluded. These are explicit later-release items in the original PRD, not simulated buttons.

The website can be privately hosted as a static terminal. When no matching RPC is reachable it loads clearly labeled **recorded local-chain evidence**, disables writes, and retains the interactive mathematical studio. A static web deployment does not turn Anvil into a public blockchain. For the working monetary journey, run the local stack or configure a genuine supported testnet deployment.

The composer chooses an open shared-observation pair on initial load and offers a recovery action for closed observations. Pending reads preserve user edits. Local startup provisions an open pair when necessary; it never bypasses maturity guards. Account avatars are generated deterministically from addresses. The capital-flow chart aggregates confirmed funding, repayment and settlement events.

For Sepolia, supply a funded deployer wallet and `FLOOR_RPC_URL` as process environment variables, then run `pnpm deploy:sepolia`. It uses Circle's canonical external Sepolia USDC and deploys a permissionless historical-feed resolver; it never deploys MockUSDC on Sepolia. See `docs/EXTERNAL_DEPLOYMENT.md` for precise oracle semantics and commands. It refuses other chain IDs and mainnets. Never put a key in a `NEXT_PUBLIC_` variable. Rebuild the terminal with the resulting manifest, and record public receipts before claiming that gate passed.

## Mechanism and trust

For ordered thresholds sharing one observation, `F = min(qLower, qUpper) × 1,000,000` micro-USDC. Every winning unit pays 1 USDC; every canceled unit pays 0.5. Each complete set is funded by exactly 1 USDC. Due includes all lender fees and cannot exceed the floor minus the upward-rounded 20% reserve.

The floor is a terminal contractual cashflow bound, conditional on backing, custody, oracle finality and settlement-token transferability. It is not an immediate resale price or an acquisition-profit guarantee. This is an independently unaudited test-funds prototype.

Architecture was researched from Cumulant and Senthos without transplanting their source or assets. Pinned findings and important mechanism differences are in `docs/REFERENCE_RESEARCH.md`; dependency notices are in `THIRD_PARTY_NOTICES.md`. The original supplied specification remains in `docs/`.
