# AQRA features and limitations

## The product in one sentence

AQRA uses dated prediction-market performance metrics to gate borrower eligibility for a bonded loan request, then lets an independent lender review the matching report and decide whether to fund.

The metrics are the protocol's underwriting input, but they have only been benchmarked against future trader P&L—not loan repayment. They do not set loan pricing or guarantee repayment. The escrowed bond is the only recovery source the contract can deliver to a lender after default, and the lender accepts the residual loss directly.

## Working surfaces

### Data

- Reads the checked-in walk-forward replay and exposes monthly policy comparisons, sample counts, wallet evidence and export.
- The last completed benchmark has 154/220 consistency-screen wallet-months positive next month (70.0%). Largest-monthly-P&L ranking has 162/220 (73.6%); the seeded sample baseline has 61/220 (27.7%).
- Those are trader P&L outcomes. They do not measure repayment, credit loss or return on equity. Wallet-month rows can repeat an address.

### Risk engine

- Computes expected loss, a beta-binomial default-count stress, VaR, Expected Shortfall, capital gap and scenario margin from explicit user assumptions.
- Displays the assumptions separately from the results. Slider values are not observations and cannot open the pooled credit gate.
- Pooled underwriting returns `REJECT` until mature loan outcomes, calibrated PD, temporal validation and committed loss capital exist.

### Borrow

- Resolves ENS primary names and the optional `com.aqra.wallets` group; linked controllers must provide request-scoped consent.
- Loads dated Polymarket evidence and displays the policy inputs: activity, positive months, realized P&L, turnover, efficiency and drawdown. A passing policy allows the borrower to submit a fixed-term request and escrow a bond.
- At default demo values, borrower requests $100, owes $102 and escrows $25. Performance metrics gate policy eligibility; a distinct lender approves funding and assumes loss beyond the bond.

### Lend

- Reads requests from the lending contract and discovers report-backed listings through Arkiv. It fetches the exact Swarm file and requires SHA-256, Swarm reference, wallet set, cutoff, score and evidence-digest checks against the attestation and contract before the app enables funding.
- Supports full repayment before maturity and matured default settlement from the escrowed bond. Transaction status is read from chain state and receipts.
- A lender can lose up to $75 of principal at the $100/$25 terms if the bond transfers in full; lower bond recovery or token/contract failures can increase the loss.

## Demo and integrations

- **Local Anvil:** test USDC and named borrower/lender/curator accounts. The pending-request helper impersonates a sampled wallet only on loopback Anvil and stops before report release/funding; it is not a real borrower's consent or production credit decision.
- **Chainlink CRE:** workflow source is present. A successful `cre workflow simulate` output or a live CRE deployment is not yet recorded; do not call a report CRE-attested until that evidence exists.
- **Arkiv and Swarm:** borrower-signed public report release, Bee upload/read-back, SHA-256 + report recomputation, immutable report hash/reference on the loan, expiring Arkiv v2 listing, and lender retrieval are implemented. This checkout has no Bee URL, postage batch, Rabdi writer, public receipt or second-wallet proof. These artifacts are not collateral or payment.
- **ENS:** helps discover linked addresses. It does not prove common beneficial ownership or replace controller signatures.
- **Arc:** no Arc Studio artifact, Arc deployment or Arc transaction exists in this repo's evidence.

## Boundaries

- The data is a sampled Polymarket research set, not a venue-wide census. Market selection, wallet discovery, source coverage and survivorship can bias it.
- Daily realized P&L is not ROI without opening equity, full holdings and bankroll. A single 10× or 100× fill does not establish persistent skill.
- No historical AQRA repayment/default or recovery labels exist. PD, default correlation, recovery haircuts, cost and scenario capital are uncalibrated assumptions.
- The workflow does not custody prediction-market positions, execute trades, pledge future income or automatically collect trading profits.
- The lender UI checks the report file and Arkiv pointer, and the contract requires a report commitment; the contract cannot verify that a lender downloaded or read the public file. File validity depends on Swarm availability, and no retention extension worker exists yet.
- The local test token has no market value. No public lending liquidity, production deployment, audit or regulatory clearance is claimed.
- The legacy outcome-token protocol remains in code and technical documentation. It is not part of the AQRA app's four-screen trader-credit flow.

See [`TRADER_CREDIT.md`](TRADER_CREDIT.md) for operation, [`RISK_ENGINE.md`](RISK_ENGINE.md) for formulas and calibration requirements, and [`ETHGLOBAL_SUBMISSION.md`](ETHGLOBAL_SUBMISSION.md) for the current sponsor-track evidence checklist.
