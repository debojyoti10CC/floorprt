# Demonstrated implementation

- Eight independently authored Solidity contracts, real local deployment and pinned code identities.
- Fully funded complete sets, merge, holder-only redemption, exact cancellation payouts and nontransferable vault positions.
- Shared observation verification, reason-coded rejection, atomic batch custody and protection against unsolicited deposits.
- Borrower consent, exact principal, fixed fee-inclusive debt, distinct lender, expiring request, 20% reserve and one lien.
- Permissionless terminal settlement, lender-first cashflows, real residual, duplicate-settlement rejection and pause-safe exits.
- Atomic full fixed-due repayment with exact claim release; paid loans cannot settle again.
- Canonical external Sepolia USDC deployment path and a source-bound historical Chainlink resolver.
- Command center with an interactive 3D payout model, state matrix, exact scenario controls and canonical event activity.
- Draggable outcome nodes and outcome selection, payoff studio, proof inspector, credit, wallet portfolio, audit and resolver operations.
- Direct reads pinned to one block, receipt recovery, pending-send guard, runtime-code identity checks and explicit offline state with no saved-snapshot substitution.
- Read-only API, 10-second market-feed cache with a labeled five-minute stale fallback, persistent reorg-aware journal and independent Python differential model.
- Separate-browser-wallet tests; no frontend monetary reducer and no server spending route.

# Boundaries

- Only Anvil 31337 and optionally configured Sepolia 11155111 are supported. No public testnet receipt was produced in this session.
- Mock USDC has no market value. Local price resolution uses a trusted test role; local clock advancement is visible and deliberate.
- The external historical-feed adapter is tested against actual Sepolia feed/token bytecode on a pinned fork. This is not a public deployment receipt. The separate CRE preparation module is not a successful CRE CLI simulation or DON deployment.
- Generalized 2–8-leg math is research only; the collateral vault accepts the restricted two-leg grammar.
- No tranches, signed RFQ book, live external CTF custody, bridges, estimated correlations or price probabilities are claimed.
- The UI's bounded direct read window is suitable for the local prototype; full-scale pagination/projections and operations require later hardening.
- No independent audit or legal/regulatory clearance. Mainnet use is not supported.
