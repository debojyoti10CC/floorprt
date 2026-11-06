# AQRA integrations and ETHGlobal Mumbai tracks

**Checked against official ETHGlobal pages:** 6 November 2026. Recheck before submitting; track rules and eligibility can change.

## Recommended narrative

**AQRA is a prediction-market performance-metrics-based lending protocol pilot.** Dated activity, repeat profitability, realized P&L efficiency and drawdown determine whether a request meets the underwriting policy. A borrower posts cash collateral; a separate lender verifies the attested inputs and accepts or rejects the uncovered risk. The metrics do not establish a default probability or repayment promise and are not collateral.

At the demo terms, the borrower requests $100, owes $102 and escrows $25. The lender can lose $75 of principal even if the entire bond transfers. Token, contract and operational failures can increase that loss. There is no pool; the risk engine rejects pooled underwriting until real credit outcomes and funded reserves exist.

## Track fit and actual evidence

| Track | Why it fits | Current evidence | Remaining eligibility gate |
|---|---|---|---|
| **Chainlink CRE — best immediate fit** | The workflow combines a Polygon history API with a chain request and returns a request-bound report. | Workflow source exists at `services/trader-cre/workflow`; the application can use a confirmed report. **No successful CRE CLI simulation or live CRE deployment has been recorded.** | Install/sign in to the official CRE CLI; run the documented simulation on a pending local request; save the command, successful output, and demo evidence. Simulation is sufficient for the CRE prize, but is not a public DON write. |
| **Arkiv + Swarm — conditional** | Borrower-consented assessment bytes are uploaded/read-back verified on Swarm, committed on the lending contract, and discoverable through an Arkiv v2 listing that the lender reads before funding. | New API, UI, SDK, schema and contract code are implemented and unit/contract checked. **No Bee URL, postage batch, Rabdi writer wallet, public write/read receipt or second-wallet proof is configured/recorded.** | Existing-project prize requires Continuity eligibility and judges evaluate event-new work. Confirm registration; configure the services; complete one two-wallet round trip; record the entity key, writer, transaction, reference/hash pair and reproducible query in README; finish the `/arkiv/` criteria files. |
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

The repository has no Bee URL, postage batch, or recorded Rabdi writer receipt, so it cannot yet demonstrate the complete external storage path. Once configured:

1. **Show the data result.** Consistency screen 154/220 positive next month (70.0%); simple monthly-P&L ranking 162/220 (73.6%); seeded sample baseline 61/220 (27.7%). Clarify wallet-month rows repeat and none measure repayment.
2. **Show why pooled credit stays closed.** Change a risk assumption and show the `REJECT` gate persists without matured loan labels, calibrated PD, out-of-time validation or committed capital.
3. **Show borrower consent and storage.** Create/attest a request, preview linked wallets and report fields, sign the loan-specific release, upload/read back the Swarm file, commit reference/hash on the lending chain, then publish the Arkiv entity.
4. **Show lender verification.** Switch sessions, discover the loan on Arkiv, retrieve the exact Swarm report, show byte hash and onchain evidence checks, acknowledge up to $75 principal shortfall, fund, and show repayment/default receipt.
5. **Show one rejection.** Use a wrong/missing report commitment or unavailable Swarm read and show the funding UI and contract refuse origination. Repayment/default for funded loans continue without storage.
6. If no live external setup is available, show the disabled storage state and do not claim an Arkiv/Swarm write or funded loan.

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

Track choice follows verifiable product work, not the number of sponsor logos. CRE simulation and Arkiv/Swarm public transactions are still required for their respective claims. Arc remains out of scope until a project is built in Arc Studio under the applicable track.
