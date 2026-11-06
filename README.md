# AQRA

AQRA is a **performance-informed, bond-backed direct-lending pilot for prediction-market traders**. Public trading history is an experimental screening signal; the borrower posts USDC collateral and a separate lender chooses whether to fund. Trading P&L is never collateral or a repayment guarantee.

The working interface has four navigation destinations:

- **Data** — observed monthly wallet outcomes, cohort comparisons and dated wallet evidence.
- **Risk engine** — expected loss, portfolio loss distribution, VaR, Expected Shortfall, reserve gap and a binding credit gate. Default probability and default correlation are explicit stress assumptions, not inferred from P&L.
- **Borrow** — ENS/wallet discovery, evidence review and wallet-signed bonded credit requests. Passing the performance screen does not approve a loan.
- **Lend** — onchain requests, explicit bond-adjusted principal shortfall, lender risk acknowledgement, funding, repayment/default state and transaction receipts.

The current $100 demo advance has $102 due and a $25 bond: up to $75 of principal remains uncovered assuming full bond recovery. Full bond recovery is not guaranteed if token, contract or operational failures occur. AQRA has no mature loan outcomes, calibrated probability of default, or live lending pool; pool underwriting stays rejected. Full limits are in [`docs/RISK_ENGINE.md`](docs/RISK_ENGINE.md) and [`docs/FEATURES_AND_LIMITATIONS.md`](docs/FEATURES_AND_LIMITATIONS.md).

## Run the demo

Prerequisites are Node 24, pnpm 10.20.0 and the checked-in dependencies.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:3000/>. The local runner starts Anvil, deploys contracts, seeds the test stack and starts the read API. In the wallet menu, choose the labeled local borrower, lender or resolver account. This uses test USDC on local chain 31337. Wallet-authorized actions write to the local contracts and show transaction receipts.

For a full historical-evidence request, run `pnpm underwriting:demo --pending` against the local stack. It records local receipts at `work/underwriting/local-credit-demo.json`.

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

## Technical references

- [`docs/RISK_ENGINE.md`](docs/RISK_ENGINE.md) — credit risk equations, stress model, validation requirements and sources.
- [`docs/TRADER_CREDIT.md`](docs/TRADER_CREDIT.md) — product mechanics and data workflow.
- [`docs/MECHANISM_AND_PROOFS.md`](docs/MECHANISM_AND_PROOFS.md) — outcome-token protocol and proof constraints.
- [`docs/mintlify`](docs/mintlify) — developer documentation source.

Useful implementation commands:

```sh
pnpm typecheck
pnpm build
pnpm docs:generate
pnpm docs:check
```

AQRA is unaudited local/testnet software. No production liquidity pool, external Polymarket position custody, public CRE execution receipt or mainnet lending is claimed.
