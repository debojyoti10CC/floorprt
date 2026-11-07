# AQRA

AQRA is a **prediction-market performance-metrics-based, bond-backed lending protocol pilot**. Dated trader activity, realized P&L efficiency, repeat profitability and drawdown determine whether a borrower meets the pilot's request policy. The borrower posts USDC collateral, and a separate lender chooses whether to fund. Performance metrics are not repayment proof or collateral.

The landing page is at `/`; **Launch app** opens the working interface at `/underwriting/`. The whitepaper is at `/whitepaper/`.

The working interface has four navigation destinations:

- **Data** — observed monthly wallet outcomes, cohort comparisons and dated wallet evidence.
- **Risk engine** — expected loss, portfolio loss distribution, VaR, Expected Shortfall, reserve gap and a binding credit gate. Default probability and default correlation are explicit stress assumptions, not inferred from P&L.
- **Borrow** — live Polymarket holdings with Polygon balance checks, ENS/wallet discovery, performance review and wallet-signed credit requests. The position demo adds full-pair escrow and a live LTV quote.
- **Lend** — Arkiv discovery, borrower-consented Swarm reports, SHA-256 and onchain report-commitment verification, bond-adjusted principal shortfall, lender risk acknowledgement, funding, repayment/default state and transaction receipts.

The first visit to the credit desk opens a Borrower/Lender chooser; the mode switch remains visible in the desk. Opening Lend automatically queries Arkiv Rabdi and shows the listing count, public RPC/key state, Swarm configuration state and Arkiv explorer link. A zero listing count is a real empty query, not demo data.

The current $100 demo advance has $102 due and a $25 bond: up to $75 of principal remains uncovered assuming full bond recovery. Full bond recovery is not guaranteed if token, contract or operational failures occur. AQRA has no mature loan outcomes, calibrated probability of default, or live lending pool; pool underwriting stays rejected. Full limits are in [`docs/RISK_ENGINE.md`](docs/RISK_ENGINE.md) and [`docs/FEATURES_AND_LIMITATIONS.md`](docs/FEATURES_AND_LIMITATIONS.md).

New funding requires a borrower-committed Swarm reference and SHA-256 in the lending contract. The lender UI discovers the v2 request on Arkiv, fetches the actual Swarm report, verifies its bytes and recomputes the evidence before enabling funding. To exercise that flow, copy `.env.example` to `.env`, configure a Bee node and funded postage batch plus a Rabdi access key, and restart `pnpm dev`. Without Swarm configuration, users can inspect/request and cancel, but cannot originate a funded loan; repayment/default for already-funded loans remains onchain and independent of storage. Setup and current proof status are in [`arkiv/swarm.md`](arkiv/swarm.md).

## Arkiv + Swarm track

The borrower publishes a wallet-owned, expiring `aqra.trader.credit.v2` listing on **Arkiv Rabdi (7794095)**. It points to the exact consented assessment on **Swarm**; lenders query Arkiv, retrieve the file and verify it against the lending contract before funding. Balances and debt remain onchain, not in Arkiv.

- [Submission setup, query and evidence checklist](arkiv/submission.md)
- [Ownership, indexed fields and expiry](arkiv/schema.md) · [Swarm upload/read and failure behavior](arkiv/swarm.md)
- **Lend → Inspect assessment evidence → Download storage proof** exports a point-in-time verification bundle.
- `pnpm storage:verify --help` describes the independent, read-only Rabdi/Swarm verification command. Readers need a Bee endpoint, not a postage batch or wallet key.

**Public writer addresses, Rabdi entity/transaction, openable Swarm reference and batch provenance: pending.** Local receipts do not meet those public-proof requirements. This is an existing repository; Continuity acceptance and event-new work must be confirmed before entering the existing-project track and bonus. The basic storage flow existed before this completion change; [the runbook](arkiv/submission.md#track-and-timing--human-verification-required) records the work boundary. No from-scratch eligibility is claimed.

**AI use:** this completion change used an AI coding assistant for inspection, implementation, tests and documentation; maintainers must review it and provide the team's full event disclosure.

## Run the demo

Prerequisites are Node 24, pnpm 10.20.0 and the checked-in dependencies.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:3000/>. The local runner starts Anvil, deploys contracts, seeds the test stack and starts the read API. In the wallet menu, choose the labeled local borrower, lender or resolver account. This uses test USDC on local chain 31337. Wallet-authorized request, cancellation, repayment and settlement actions write to local contracts and show transaction receipts. Funding requires the separately configured Swarm/Arkiv evidence flow above.

### Position collateral

Run `pnpm dev:positions` and open [the position credit desk](http://127.0.0.1:3002/). **Borrow → Load Polymarket** reads a trading address or ENS name. **Preview public portfolio** reads a live public account. Mainnet positions are read-only.

**Load test borrower** uses funded Conditional Tokens on a separate local chain and a labeled scoring fixture. A request locks equal YES and NO quantities for one binary condition plus a test USDC bond. Borrowing $100 with $102 due against 120 matched pairs and a $25 bond gives $145 backing and 70.34% debt LTV. The contract caps repayment at $116 under its 80% debt limit. For Swarm upload and Arkiv discovery, configure the [local storage nodes](arkiv/swarm.md#local-position-demo).

The [Chainlink CRE replay](docs/TRADER_CREDIT.md#run-the-official-cre-replay) locks a directional outcome and replays a real Polymarket price drop. Run `pnpm cre:margin:demo` with the isolated chain and Bee running. Open **Lend** to inspect the lender payment and share release receipts.

For a local historical-evidence request that stops before borrower consent and funding, run `pnpm underwriting:demo --pending` against the local stack. It records local receipts at `work/underwriting/local-credit-demo.json`. This uses a historical public wallet under Anvil impersonation and must not be used to bypass the interactive public-report consent flow.

### Arc Testnet

Run `pnpm dev:arc` and open [AQRA on Arc Testnet](http://127.0.0.1:3003/underwriting/). The profile connects to chain `5042002` and Circle's six-decimal test USDC. **Borrow** supports wallet-signed issuance of test outcome pairs. **Lend** verifies public receipts for a directional liquidation replay that recovered **1.02 test USDC** and released **2.4 outcome shares**. The replay uses Chainlink CRE CLI simulation and an operator-restricted Arc relay. [Arc setup and reproduction](docs/TRADER_CREDIT.md#arc-testnet) · [Liquidation receipt](https://explorer.testnet.arc.io/tx/0x6c24c3197fc52c96f45c86bbe6c3734dddf5b6f3042996b4be65cac8606e5475)

Read-only settlement check: `pnpm arc:verify` verifies the pinned deployment, canonical replay receipts and historical USDC/share balance deltas without a key. [Arc + Chainlink architecture and runbook](docs/ARC_CHAINLINK.md) · [Arc Studio handoff](arc/README.md).

**Arc Studio remains pending:** a public Arc transaction is not proof of a Studio build/test/deploy. `pnpm arc:studio:prepare` creates a fingerprinted, key-free source/test handoff; open the [Studio prompt](arc/STUDIO_PROMPT.md) in your authenticated project and record its actual shareable URL and deployment evidence. The advanced-stablecoin prize accepts an existing frontend, but prior work/event eligibility must still be disclosed and confirmed.

## Reproduce the benchmark

The expanded dataset covers November 2025 through October 2026. Its fixed sample schedules up to 768 BTC/ETH 15-minute Polymarket sessions and samples activity and large-win wallets. The checked-in capture manifest records gaps, sample limits and Polygon month-boundary block checks.

```sh
pnpm underwriting:benchmark
```

The command collects the missing source captures and replays the complete sample. To replay already captured data without new requests:

```sh
pnpm underwriting:replay --benchmark
```

The replay reports next-month realized trader P&L and profitable-wallet frequency. It does not convert those outcomes into loan repayment, lender returns, default labels or collateral. Daily P&L is not account ROI because complete equity and opening bankroll are unavailable. Sources and derived CSVs are written under `work/underwriting`; the browser reads `apps/web/public/underwriting/run.json`.

The benchmark currently contains Polymarket only. [The multi-market study](docs/MULTI_MARKET_DATA.md) reviews address-level and consented account history on OPINION, Predict.fun, Limitless, Kalshi, Gemini Predictions and Manifold, plus market-data/indexing services. It records source access and collection limits; none of those venues' rows are represented in the current backtest.

## Technical references

- [`docs/RISK_ENGINE.md`](docs/RISK_ENGINE.md) — credit risk equations, stress model, validation requirements and sources.
- [`docs/MULTI_MARKET_DATA.md`](docs/MULTI_MARKET_DATA.md) — trader-history source study, access/consent rules and cross-venue collection plan.
- [`docs/TRADER_CREDIT.md`](docs/TRADER_CREDIT.md) — product mechanics and data workflow.
- [`docs/MECHANISM_AND_PROOFS.md`](docs/MECHANISM_AND_PROOFS.md) — outcome-token protocol and proof constraints.
- [`docs/mintlify`](docs/mintlify) — developer documentation source.
- [`arkiv/schema.md`](arkiv/schema.md), [`arkiv/how-you-use-arkiv.md`](arkiv/how-you-use-arkiv.md), [`arkiv/swarm.md`](arkiv/swarm.md) — Arkiv/Swarm schemas, app flow and reproducible-proof status.
- [`paper/main.tex`](paper/main.tex), [`paper/references.bib`](paper/references.bib) — Overleaf-ready IEEE paper source and bibliography.

Useful implementation commands:

```sh
pnpm typecheck
pnpm build
pnpm docs:generate
pnpm docs:check
pnpm exec playwright test --config=playwright.landing.config.ts
```

The landing-page browser checks start only the web server; they do not require a local chain.

AQRA is unaudited local/testnet software. No production liquidity pool, external Polymarket position custody, public CRE execution receipt or mainnet lending is claimed.
