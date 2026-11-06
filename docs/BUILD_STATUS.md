# AQRA build status

**Current product:** a prediction-market performance-metrics-based lending protocol pilot. The earlier seven-screen outcome-token terminal remains in the repository as separate contract/research history; it is not the AQRA app journey.

## Product mechanism

1. A trader connects one wallet or an ENS-discovered wallet group and reviews dated public Polymarket evidence.
2. A deterministic policy scores activity, repeat profitability, realized P&L efficiency and drawdown. Meeting the policy gates a borrower request and lender review; it does not set loan pricing or estimate repayment probability.
3. A borrower who passes can sign a fixed-term request and escrow the bond in the repayment token. Linked wallets must give scoped consent.
4. An authenticated workflow report binds the score to that exact request (Chainlink CRE when configured; a clearly labelled local forwarder on Anvil).
5. The borrower previews the public report, signs a short-lived consent, and AQRA uploads canonical JSON to configured Swarm storage. The API downloads it again and checks byte SHA-256 plus the internal evidence digest.
6. The borrower commits the report hash and Swarm reference immutably on the loan contract, then publishes the Arkiv v2 listing from their Rabdi wallet.
7. The lender discovers the listing on Arkiv, reconciles it with the request and onchain commitment, fetches the same Swarm file, rechecks the report metrics and hashes, and only then gets the funding control.
8. The borrower can repay before maturity. After maturity, the contract can transfer the escrowed bond to the lender and record the remaining principal loss. These paths do not depend on Arkiv or Swarm.

For the current demo terms, principal is $100, total due is $102, and the bond is $25. That leaves a $75 principal shortfall if the entire bond is recovered. Bond recovery can be impaired by token, contract or operational failure. Future prediction-market P&L cannot be seized and is not collateral.

## Application surfaces

- **Data:** committed Polymarket replay, sample coverage, monthly forward outcomes, wallet-level evidence, export, and the separate credit-loss stress engine.
- **Risk engine:** assumption-driven PD, default dependence, bond recovery, discrete loss distribution, VaR/Expected Shortfall, capital gap and a binding pooled-credit `REJECT` gate.
- **Borrow:** live evidence lookup, visible policy metrics, ENS primary/wallet-group resolution, controller consent, fixed terms, bond approval and borrower-signed request.
- **Lend:** Arkiv request discovery, actual Swarm report retrieval, byte hash + policy recomputation + onchain commitment checks, lender loss acknowledgement, funding, early repayment, matured default and chain receipts.

## Implemented and evidenced

- A reproducible 12-month sampled data collection/replay pipeline with 11 completed walk-forward decision rounds and a checked-in run artifact.
- Dated Polymarket evidence, UTC month cutoffs, source-block boundary checks, wallet grouping and a request-bound evidence digest.
- Separate `TraderCreditDesk` contract lifecycle, wallet-authorized funding, borrower bond escrow, repayment and matured-default handling.
- A local Anvil request path with explicitly labeled test accounts and test USDC; request/cancellation/settlement calls use local-chain transactions. Contract funding now also requires the assessment commitment.
- Swarm Bee upload/read-back and bounded retrieval code, borrower-signed public-release challenges, Arkiv v2 write/query, and immutable onchain report reference/hash commitment.
- An ENS identity read path and Chainlink CRE workflow source.
- The risk engine's pool gate remains closed because no mature AQRA repayment/default labels, calibrated PD, passing out-of-time credit validation or committed pool reserve exist.

## Benchmark snapshot

The checked-in expanded sample schedules 768 BTC/ETH 15-minute markets across November 2025–October 2026; 764 resolved markets are captured. It includes 3,906 wallet histories, 3,647,433 fill rows, 1,025,654 daily P&L observations, 15/15 verified month-boundary blocks and 6,155 candidate wallet-month rows. It is a sample, not a venue-wide census.

| Selection rule | Positive next-month P&L | Evaluated wallet-months |
|---|---:|---:|
| Consistency screen | 154 / 220 (70.0%) | 220 |
| Largest monthly P&L | 162 / 220 (73.6%) | 220 |
| 10× to below 100× settled buy | 55 / 160 (34.4%) | 160 |
| At least 100× settled buy | 2 / 4 (50.0%) | 4 |
| Seeded sample baseline | 61 / 220 (27.7%) | 220 |

The consistency screen is 3.6 percentage points below the strongest simple comparator in this replay. Rows are repeated wallet-month observations; the study reports no causal effect, statistical significance, credit loss or repayment prediction. See [`RISK_ENGINE.md`](RISK_ENGINE.md) and [`AQRA_WHITEPAPER.md`](AQRA_WHITEPAPER.md).

## Not complete / not claimed

- No mature repayment/default dataset, calibrated borrower PD, production credit approval, pooled lending capital, or evidence that a performance score predicts repayment.
- No public Sepolia loan deployment/receipt, live Chainlink DON write, or successful CRE CLI simulation recorded yet.
- Swarm/Bee URL, funded postage batch, Rabdi access key and writer transaction are not configured in this checkout. The new flow has passing unit/contract checks but no live Swarm upload, Rabdi entity receipt or second-wallet query proof. The Arkiv existing-project prize also requires event-new work and Continuity eligibility.
- No Arc Studio project URL, Arc deployment or confirmed Arc prize eligibility. The user is unsure whether the team joined Continuity; do not claim it.
- No external Polymarket position custody, venue trade execution, production token collateral, independent security audit or legal clearance.
- The earlier Floor Protocol outcome-token contracts and seven-screen documentation are not the current AQRA trader-credit UI and must not be presented as its shipped journey.

This file describes source status, not an audit. The current working tree adds the report commitment and Arkiv/Swarm path; the previous release-evidence record predates these changes and cannot be reused as proof for them. Run the fresh release checks before claiming a shipped external integration.
