# AQRA — Prediction-Market Trader Credit

**Engineering note · 6 November 2026**

## Abstract

AQRA studies whether public prediction-market history can inform small-loan screening. The prototype combines dated Polymarket wallet evidence, walk-forward trader-outcome benchmarking, borrower-consented credit requests, an escrowed first-loss bond, and lender-funded test loans. Trader performance is not treated as repayment probability, collateral, or guaranteed income.

The technical risk engine computes explicit default and bond-recovery scenarios, correlated portfolio loss distributions, tail loss, capital gap and scenario margin. Those outputs are not calibrated estimates: the current dataset contains no mature AQRA loan repayment/default labels or actual pool reserve. Pooled credit therefore remains rejected by a binding gate.

## Product mechanism

1. AQRA reads public, dated wallet performance and records evidence for a UTC cutoff.
2. A borrower can associate up to four addresses and must obtain scoped consent from additional wallet controllers. ENS helps discover a wallet group but does not prove that the borrower controls each address.
3. An eligible borrower requests fixed terms and escrows a bond in the repayment token.
4. An authenticated report records the underwriting result. A separate lender sees the terms and maximum principal shortfall, acknowledges the risk and funds the request.
5. Repayment returns the bond. A matured default can transfer the bond to the lender and records principal shortfall. There is no automatic access to the borrower's market account or future P&L.

The local/testnet demonstration uses $100 principal, $102 due and a $25 bond. These are prototype terms. The lender's principal shortfall can reach $75 before recovery haircuts and fees. No production pool, external Polymarket-position custody or public Chainlink DON execution is claimed.

## Evidence and benchmark

The benchmark samples resolved BTC and ETH 15-minute Polymarket markets and wallet histories. At each monthly cutoff, candidate policies use only information available through that cutoff; the following month measures trader P&L, activity and frequency of positive realized P&L. It compares selection policies against a deterministic sample baseline.

The sample is not a venue-wide census. Public daily wallet P&L is not return on equity because complete holdings and opening bankroll are unavailable. Candidate discovery and market sampling introduce selection and survivorship bias. A large winning trade is exploratory evidence, not proof of persistent skill. The benchmark never derives lender return, default probability, recovery or collateral from future trader P&L.

Dataset coverage, sample gaps, source-block checks and exact policy outcomes are committed in `apps/web/public/underwriting/run.json`; the reproducible source and CSV artifacts are under `work/underwriting`. See [`TRADER_CREDIT.md`](TRADER_CREDIT.md) for reproduction commands.

## Risk engine

For each exposure, the risk engine treats outstanding principal as exposure at default. It subtracts the stressed recoverable value of the escrowed borrower bond to calculate lender principal loss. Expected loss uses explicit PD and loss severity assumptions. A beta-binomial default-count distribution adds a user-set common-dependence stress; VaR and Expected Shortfall are computed over its discrete tail. Required capital is the greater of tail loss and all-default loss. Fee revenue, capital cost and operating cost form a scenario margin and break-even PD.

The UI exposes these calculations as assumptions and results, without suggesting they are observed loan outcomes. A scenario reserve amount is informational only. Production approval requires mature repayment labels, calibrated PD, out-of-time validation and truly committed capital. Full formulas, numerical definitions, validation design and citations are in [`RISK_ENGINE.md`](RISK_ENGINE.md).

## Integrations

- **Polymarket:** public wallet P&L, trades and resolved outcomes support historical performance research.
- **ENS:** primary-name resolution and a wallet-group text record help discover addresses; each linked controller still has to consent.
- **Chainlink CRE:** workflow code recomputes evidence and can submit an authenticated report. Local simulation is not a public DON execution receipt.
- **Arkiv:** optional expiring public underwriting packets can be checked against the onchain request. Packet publication does not transfer funds or create collateral.

## Limitations and next study

AQRA has no mature loan outcomes to calibrate PD or validate a credit model. Its benchmark does not include timestamped forecast-probability submissions, so Brier skill cannot be measured. PD and correlation sliders are what-if values; no automatic production lending decision should rely on them. Escrow recovery assumes the configured bond token can be transferred as expected; stress haircuts are user scenarios, not recovery observations.

The next empirical study must collect matured repayment/default and recovery labels, freeze point-in-time features, use temporal holdouts, report calibrated PD uncertainty and tail risk, measure dependence and operating costs, and compare selection policies against fixed and random baselines. Only then can a separate IEEE-style research paper report validated credit performance. The detailed model specification and references in [`RISK_ENGINE.md`](RISK_ENGINE.md) are an engineering basis, not that completed empirical paper.

## Primary resources

- [Polymarket wallet P&L API](https://docs.polymarket.com/api-reference/wallet/get-a-users-pnl-series)
- [Basel CRE: credit risk PD, LGD and EAD](https://www.bis.org/committees/bcbs/basel-framework/standard/cre.htm)
- [Brier (1950): probability forecast verification](https://doi.org/10.1175/1520-0493(1950)078%3C0001%3AVOFEIT%3E2.0.CO%3B2)
- [Rockafellar and Uryasev: Conditional Value-at-Risk](https://sites.math.washington.edu/~rtr/papers/rtr187-CVaR2.pdf)
- [Gordy (2003): risk-factor model and correlated exposures](https://www.sciencedirect.com/science/article/pii/S1042957303000408)
- [Chainlink CRE EVM read/write](https://docs.chain.link/cre/capabilities/evm-read-write)
- [ENS resolution](https://docs.ens.domains/resolution/)
- [Arkiv Rabdi network](https://docs.arkiv.network/networks/rabdi/)
