# AQRA build status

**Current product:** the AQRA prediction-market trader-credit pilot. The earlier seven-screen outcome-token terminal remains in the repository as a separate contract/research codebase; it is not the current AQRA app journey.

## Product mechanism

1. A trader connects one wallet or an ENS-discovered wallet group and reviews dated public Polymarket evidence.
2. A deterministic pilot policy checks the evidence. Its score is a performance screen, not a probability of default, loan approval or repayment forecast.
3. A borrower who passes can sign a fixed-term request and escrow the bond in the repayment token. Linked wallets must give scoped consent.
4. A report is attached to that exact request. A distinct lender reviews the principal shortfall and decides whether to fund it.
5. The borrower can repay before maturity. After maturity, the contract can transfer the escrowed bond to the lender and record the remaining principal loss.

For the current demo terms, principal is $100, total due is $102, and the bond is $25. That leaves a $75 principal shortfall if the entire bond is recovered. Bond recovery can be impaired by token, contract or operational failure. Future prediction-market P&L cannot be seized and is not collateral.

## Application surfaces

- **Data:** committed Polymarket replay, sample coverage, monthly forward outcomes, wallet-level evidence, export, and the separate credit-loss stress engine.
- **Risk engine:** assumption-driven PD, default dependence, bond recovery, discrete loss distribution, VaR/Expected Shortfall, capital gap and a binding pooled-credit `REJECT` gate.
- **Borrow:** live evidence lookup, ENS primary/wallet-group resolution, controller consent, fixed terms, bond approval and borrower-signed request.
- **Lend:** direct request discovery, report review, lender loss acknowledgement, funding, early repayment, matured default and chain receipts.

## Implemented and evidenced

- A reproducible 12-month sampled data collection/replay pipeline with 11 completed walk-forward decision rounds and a checked-in run artifact.
- Dated Polymarket evidence, UTC month cutoffs, source-block boundary checks, wallet grouping and a request-bound evidence digest.
- Separate `TraderCreditDesk` contract lifecycle, wallet-authorized funding, borrower bond escrow, repayment and matured-default handling.
- A local Anvil demo path with explicitly labeled test accounts and test USDC; it performs real local-chain contract calls and never claims production funds.
- An ENS identity read path, Chainlink CRE workflow source, and Arkiv packet read/write path.
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
- Arkiv integration code exists, but no current Rabdi write/read receipt is recorded. The existing-project Arkiv prize requires event-new work and Continuity eligibility.
- No Arc Studio project URL, Arc deployment or confirmed Arc prize eligibility. The user is unsure whether the team joined Continuity; do not claim it.
- No external Polymarket position custody, venue trade execution, production token collateral, independent security audit or legal clearance.
- The earlier Floor Protocol outcome-token contracts and seven-screen documentation are not the current AQRA trader-credit UI and must not be presented as its shipped journey.

This file describes source status, not an audit. The last full release-evidence record is in [`RELEASE_EVIDENCE.md`](RELEASE_EVIDENCE.md); any local changes made after that record require fresh validation before they can inherit its claims.
