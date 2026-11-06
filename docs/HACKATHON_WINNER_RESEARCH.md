# AQRA hackathon research

**Checked:** 6 November 2026. Winner examples and Mumbai prize criteria are linked to primary project/sponsor sources.

## What the relevant winners demonstrate

### Thurman Protocol — Chainlink CRE

[ETHGlobal showcase](https://ethglobal.com/showcase/thurman-protocol-q8iiy)

Thurman connects an external DocuSign event, onchain escrow state and an authenticated CRE report to a bounded delivery-versus-payment action. The transferable lesson is not “use an oracle”: the workflow gates one consequential state change, and the demo can show the input, guard, transaction and resulting state.

**AQRA application:** consume finalized Polymarket data for a specific request, recompute the policy at the cutoff, bind the report to that request and block stale or mismatched evidence. Then show the report changing the contract's funding eligibility. A CLI simulation proves orchestration, not a public CRE DON write.

### Arc Cannes winners — stablecoin-native product logic

[Arc's 2026 Cannes winner recap](https://www.arc.io/blog/meet-the-arc-track-winners-from-ethglobal-cannes-hackathon-and-what-we-learned)

PayMate makes programmable credit central to the product; Onda uses stablecoin payments in the core action. The lesson is that USDC should settle a user need, not appear as an unused chain badge.

**AQRA application:** borrower posts a bond, a distinct lender funds, and the contract routes repayment or the available bond on default. However, Mumbai requires Arc Studio as the starting point for every Arc bounty and a shareable Studio project; this repository alone does not qualify.

### Arkiv ecosystem examples — data that remains useful elsewhere

[Arkiv ecosystem showcase](https://hub.arkiv.network/ecosystem)

Projects such as Ocean, MentorGraph and Cortex make records wallet-owned, queryable and time-bounded in ways their users can act on.

**AQRA application:** an expiring request packet can let a lender discover a borrower request and compare its claims with authoritative chain state. The packet must remain a convenience/index; contract state remains authoritative. Mumbai's existing-project bounty requires Continuity eligibility, event-new work, a user-visible write/read, and the required criteria files.

## AQRA evidence: strong enough to test, not to promise credit outcomes

| Cohort | Positive next-month P&L | Evaluated wallet-months |
|---|---:|---:|
| Consistency screen | 70.0% | 220 |
| Largest monthly P&L | 73.6% | 220 |
| 10× to below 100× settled buy | 34.4% | 160 |
| At least 100× settled buy | 50.0% | 4 |
| Seeded sample baseline | 27.7% | 220 |

The consistency rule is 42.3 percentage points above the sample baseline and 3.6 points below the strongest simple comparator. These descriptive differences are affected by repeated wallets, sample discovery and market regime. They are not repayment labels, a causal policy effect or calibrated PD. That limitation makes the bond, lender's explicit risk acceptance and closed pool gate essential to the narrative.

## Current product fit

AQRA has four current screens: **Data**, **Risk engine**, **Borrow**, and **Lend**. Its strongest demonstration is one traceable request from point-in-time evidence through a separately consented borrower, posted bond, authenticated report, lender decision and repayment/default receipt. The expanded outcome-token terminal is an earlier product direction and should not be presented as the current app.

## Track decision

- **First priority: Chainlink CRE.** The workflow source already connects the Polymarket API and EVM request. Complete and preserve a successful official CLI simulation; no DON deployment is required for the CRE prize.
- **Conditional: Arkiv.** Current code can publish and discover request packets, but there is no saved Rabdi receipt or event-new-work evidence. Confirm Continuity registration before spending time on the existing-project bounty.
- **Conditional: Arc.** Build in Arc Studio first and save the shareable project URL; its Continuity track also requires program eligibility. Do not label the existing Anvil or Sepolia demo an Arc integration.

The complete qualification checklist and demo script are in [`INTEGRATIONS_AND_PRIZES.md`](INTEGRATIONS_AND_PRIZES.md). Current implementation boundaries are in [`BUILD_STATUS.md`](BUILD_STATUS.md).
