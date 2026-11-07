# Codex Agent Instructions — ARQO

Read `README.md` and every specification in `docs/` before implementation. The contract invariants and exact payout rules in `docs/MECHANISM_AND_PROOFS.md` take priority over design simplification, shortcut implementations and visual mockups. If a contradiction is found, stop the conflicting task, record a decision, and propose a safe spec change with tests.

## Non-negotiables

1. This repository is new and independent. Use Senthos/Cumulant public repos as architectural references only; do not paste their code/assets without checking licenses and explicitly recording provenance. Follow event timing rules.
2. Keep **mathematical contractual payout floor** distinct from expected market value, profit and liquid redemption.
3. Only approved, fully backed local outcome token contracts can enter the initial collateral vault. Do not promise live Polymarket custody.
4. The entire eligible threshold portfolio must share the identical immutable onchain observation and 50/50 cancellation semantics.
5. All monetary state onchain. No in-memory ledger or UI-only finance claims. Read-side cache is never authoritative.
6. All user monetary transactions are wallet-signed. Backend must not custody borrower keys or sign user trades.
7. Whole ERC-1155 units only in P0; six-decimal USDC settlement; BigInt everywhere.
8. Lender's `totalDue` (principal+fee) ≤ certified floor minus buffer. Fixed debt and one lender per position in P0.
9. No double pledge, double redemption, double settle or release of encumbered inventory.
10. Chain settlement and CRE simulation clearly distinguished in UI and docs.
11. Test negative conditions and boundary values; security incidents should not be hidden by catch-all UI fallbacks.
12. Never claim a local/testnet prototype is audited, legally cleared or safe for mainnet.

## Engineering sequence

A. Resolve decision log / ADRs. B. Implement registry and fixed-backed outcome issuer. C. Verify pair and custody. D. Borrow/fund/settle. E. Generate ABIs and wire UI. F. Differential math + Foundry invariants + Playwright. G. Deploy and record receipts. No agent should run unreviewed multi-agent edits to shared contract files.

## Quality bar

Run the full appropriate check for each path edited, report exact commands and outputs. Track what is functional versus mock. Favor correctness, reproducibility, accessible UX and stable demo over shipping untested P1 features.
