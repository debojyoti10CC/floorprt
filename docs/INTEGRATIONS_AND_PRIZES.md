# AQRA integrations and ETHGlobal Mumbai tracks

**Checked against official ETHGlobal pages** on 7 November 2026.

## Recommended narrative

**AQRA is a prediction-market performance-metrics-based lending protocol pilot.** Dated activity, repeat profitability, realized P&L efficiency and drawdown determine whether a request meets the underwriting policy. A borrower posts cash collateral; a separate lender verifies the attested inputs and accepts or rejects the uncovered risk. The metrics do not establish a default probability or repayment promise and are not collateral.

The directional replay advances 50 tUSDC with 51 tUSDC due. The borrower locks 120 test shares and a 12.50 tUSDC bond. A market maker escrows a 38.50 tUSDC bid. The Polymarket price drop triggers early liquidation and the lender receives 51 tUSDC from that escrow. [Recorded replay](RELEASE_EVIDENCE.md#chainlink-cre-margin-replay)

## Track fit and actual evidence

| Track | Why it fits | Current evidence | Remaining eligibility gate |
|---|---|---|---|
| **Chainlink CRE** | Scheduled CRE reads EVM escrow and Polymarket price history, then produces the reports that trigger early liquidation and share delivery. | The official CLI ran all three stages. The local chain confirms lender payment and collateral delivery. | Show the reproducible simulation and its local receipts to judges. |
| **Arkiv + Swarm** | Lenders find borrower-owned listings and verify the Swarm assessment before funding. | A local two-wallet run verifies publication, discovery after reload, file verification, funding and repayment. | Public Rabdi run and Continuity eligibility are still open. |
| **Arc — not presently eligible from this repo alone** | A direct USDC loan could fit an onchain-finance product. | There is no Arc deployment, Circle-supported settlement flow, Arc Studio project URL or Arc receipt in this repository. | Every Arc prize requires Arc Studio as the starting point, a shareable project URL, showing Studio in the demo, working frontend/backend and an architecture diagram. The Continuity prize additionally requires Continuity participation. Do not present the current Sepolia or Anvil flow as an Arc build. |

The separate Chainlink **CCIP** prize requires CCIP to cause an onchain state change. It is not the CRE prize, and AQRA has no CCIP integration. Adding a bridge without a necessary cross-chain user flow would dilute this submission.

Official current rule pages: [ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes), [Arc prizes](https://ethglobal.com/events/mumbai/prizes/arc), [CRE docs](https://docs.chain.link/cre), [Arkiv Rabdi docs](https://docs.arkiv.network/networks/rabdi/).

## Product map for judges

The current application has four destinations, not the earlier seven-screen Floor Protocol concept:

1. **Data:** benchmark sample, forward outcomes, wallet evidence and export.
2. **Risk engine:** explicit PD/recovery/dependence assumptions and a hard `REJECT` for pooled lending.
3. **Borrow:** consented wallet group, evidence screen, fixed terms and bond escrow.
4. **Lend:** Arkiv request discovery, exact Swarm evidence retrieval and hash/recomputation checks, shortfall acknowledgement, direct funding and repayment/default state.

ENS discovers the wallet group; it is not a credit signal or proof of common control. Chainlink authenticates an evidence report; it does not make trader performance a loan outcome. Arkiv shares an expiring request packet; the contract remains authoritative. The new contract also requires an immutable Swarm reference and SHA-256 commitment before funding, while the lender UI verifies the actual file.

## Three-minute demo

1. Show the dated borrower metrics and the 70.0% consistency and 73.6% monthly-P&L forward profitability rates.
2. Run the [CRE demo](TRADER_CREDIT.md#run-the-official-cre-replay). Show the share pledge, lender funding, price drop and full recovery in **Lend**.
3. For the storage demo, use the [complete-pair profile](../arkiv/swarm.md#local-position-demo). Show report consent, Arkiv discovery, Swarm verification and repayment.

## Evidence that must not be claimed

- A 70% next-month trader-positive rate is not repayment probability, credit approval precision, lender yield or causal policy lift.
- A simulated CRE workflow is not a public DON transaction. A Chainlink Data Feed read alone does not qualify for a Mumbai sponsor track.
- A local Anvil transaction is not mainnet/testnet settlement with real-value USDC.
- An Arkiv/Swarm code path is not evidence of a public write/read, writer address, live content pair or event eligibility.
- A Sepolia or mock collateral demo is not an Arc integration; only a shareable Arc Studio project and its working Arc flow address that track.

## Prior winner research

- [Thurman Protocol at ETHGlobal New York](https://ethglobal.com/showcase/thurman-protocol-q8iiy) demonstrates a useful CRE pattern: an external event is checked against onchain state and an authenticated workflow triggers a bounded settlement action. AQRA should copy that *integration shape*, not its product or code: make the request, API evidence, report checks and final transaction traceable.
- [Arc's Cannes winner recap](https://www.arc.io/blog/meet-the-arc-track-winners-from-ethglobal-cannes-hackathon-and-what-we-learned) is a reminder that USDC settlement should be central to the user flow. It does not waive Mumbai's Arc Studio requirement.
- [Arkiv ecosystem showcase](https://hub.arkiv.network/ecosystem) demonstrates why wallet ownership, useful query filters and entity lifetime should affect the product. An expiring lender-discoverable request fits more naturally than writing analytics logs with no reader.

The CRE simulation receipts and local storage evidence are recorded in the [release record](RELEASE_EVIDENCE.md). Arc Studio and public Rabdi evidence have separate eligibility gates.
