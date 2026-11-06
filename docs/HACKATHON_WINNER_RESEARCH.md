# AQRA: ETHGlobal Mumbai winner research and product plan

**Research checked:** 6 November 2026  
**Product surface:** the existing seven AQRA terminal screens  
**Purpose:** use prior winning work and current sponsor rules to prioritize credible improvements. This is research and a build plan, not a claim of prize eligibility or a prediction of judging outcomes.

## What prior winners did well

### Chainlink CRE: make the offchain trigger enforce one useful onchain action

[Thurman Protocol](https://ethglobal.com/showcase/thurman-protocol-q8iiy) won an Arc Continuity prize and a Chainlink-powered upgrade prize at ETHGlobal New York 2026. Its documented flow checks a real DocuSign status, checks the escrow's onchain settlement predicate, builds a bounded report containing package and chain identifiers, sends the report through CRE, and lets a receiver perform atomic delivery-versus-payment settlement. It updates its offchain status only after the chain action.

**AQRA lesson:** CRE should only resolve a registered, matured, unresolved AQRA observation from a named price source and its timestamp. The receiver must validate the configured workflow identity, target observation, source identity, age and price precision before finalizing it. The demo should expose the source value, receiver guard, transaction hash and resulting `ObservationFinalized` event. A green simulation badge by itself is not settlement evidence.

Chainlink's [CRE overview](https://docs.chain.link/cre/overview) distinguishes local workflow simulation from production workflow deployment; simulation still performs real API and public-chain calls. The [EVM Read & Write guide](https://docs.chain.link/cre/capabilities/evm-read-write) describes the workflow's authenticated report path. A reproducible local simulation is the first honest gate; a DON transaction is a separate claim.

### Arc: put programmable USDC at the center of a working financial flow

Circle's [ETHGlobal Cannes 2026 Arc recap](https://www.arc.io/blog/meet-the-arc-track-winners-from-ethglobal-cannes-hackathon-and-what-we-learned) names PayMate and Onda among the winners for advanced stablecoin logic. PayMate's product is a programmable credit pool; Onda uses small USDC payments to connect listening with artist payouts. The useful pattern is that stablecoin settlement is part of the user outcome rather than an unused token, logo or chain selector.

**AQRA lesson:** if Arc becomes a target, deploy the same collateral, fixed-debt and settlement waterfall there using the supported USDC asset and prove a full funded loan and settlement. Keep the lender-first payment waterfall visible as real Arc receipts. Do not add unrelated agent payments or CCTP just to increase the number of logos.

The [current Mumbai Arc criteria](https://ethglobal.com/events/mumbai/prizes) make Arc Studio a starting-point requirement for every Arc prize and ask for a shareable Studio project link, a functional frontend and backend, architecture diagram, demo video and documentation. The Arc Continuity track is only for Continuity participants. A chain deployment by itself does not meet those requirements. Confirm the team's Continuity status and preserve Studio's project link and contribution history before choosing this track.

### Arkiv: make persistent, owned, expiring data change the product

Arkiv's [ecosystem showcase](https://hub.arkiv.network/ecosystem) highlights Ocean, a collaborative workspace with queryable pages, membership and revision history; MentorGraph, wallet-owned profiles and bookings with expiry-aware UX; and Cortex, observations whose lifetime is tied to their use. The recurring strength is a clear reason for the data to live in a public, queryable, wallet-owned, expiring store.

**AQRA lesson:** reusable portfolio recipes are a good fit when the actual user journey is visible: publish a verified recipe, query and search public recipes, load a recipe from the same AQRA deployment, re-run the current onchain verifier, and let the owner delete it. Expiration must be visible. The recipe must never be treated as an oracle report, proof certificate, collateral or trade instruction.

The [current Arkiv Mumbai rules](https://ethglobal.com/events/mumbai/prizes) explicitly require a Rabdi testnet entity write, a user-facing feature that reads the entity, a public repo and open-source license, writer wallet addresses plus a reproducible query in README, `schema.md`, and criterion files for feedback, reach, why Arkiv and how Arkiv is used. Installing the SDK or saving an unused log does not qualify. AQRA now has the product code path and honest criterion files, but **it still needs a successful public write/read receipt and the actual writer wallet address** before claiming this integration is exercised.

## Apply that research to the seven screens

| Screen | Strongest truthful job | Change with the highest judging value | Evidence to show |
|---|---|---|---|
| **Market terminal** | Separate AQRA-issued collateral from outside research | Keep TradingView and venue prices explicitly research-only; make the onchain observation, settlement time, claim tokens and open/matured state the primary market data | Contract reads, observation ID, block number, selected-market state and testnet explorer link |
| **Outcome graph** | Find combinations the protocol can prove | Draw edges only for shared immutable observation and compatible YES-lower / NO-upper semantics; explain why a candidate is rejected | Exact observation IDs, strikes, sides, reason code and calculated unit floor |
| **Portfolio composer** | Turn selected claims into a fully specified payoff | Keep the payoff surface interactive and exact; show scenario payouts, available claims, verification result and actual transaction state; use Arkiv only for reusable public recipes | Onchain verification at a block, wallet claim balances, mint/lock receipts, Arkiv entity key/expiry, and re-verification before lock |
| **Proof inspector** | Let a judge independently check the theorem and assumptions | Map every proof statement to the deployed verifier, immutable observation fields and cancellation rule; show finite payout boundaries and the buffer used by credit | Verifier address/code hash, proof version, market metadata, block and contract-backed result |
| **Credit desk** | Match a borrower's fixed request with a distinct lender | Make borrower-approved principal, max due, fee, floor reserve, expiry and lender identity explicit; keep separate borrower and lender wallets in the demo | `requestLoan`, approval/funding transaction, `LoanFunded`, lender/borrower addresses and fixed debt bounds |
| **Portfolio dashboard** | Reconcile free inventory, locked collateral and obligations | Group exact wallet claims, vault position state, outstanding principal and lender receivable; distinguish current wallet state from recorded fallback | Direct contract reads and transaction event links, with chain and snapshot block visible |
| **Settlement explorer** | Show where the collateral went and who received it | Make the oracle provenance, redeemed claims, lender-first waterfall, borrower residual and final receipts traceable from the selected loan | Resolution and `LoanSettled` transactions, event log positions, amounts and both recipients |

## Prioritized build plan

### P0 — finish the judge's one-minute proof path

1. Keep the main journey in the existing screen sequence: **Market terminal → Outcome graph → Portfolio composer → Proof inspector → Credit desk → Portfolio dashboard → Settlement explorer**.
2. Run it with two distinct wallet identities and fully backed claims. Show the lender approval, funding, resolution and settlement as wallet-signed transactions on the selected chain.
3. Make every metric trace to one of: a chain read, confirmed event, deterministic payout calculation, or clearly labeled external research feed. Remove any metric with no live source.
4. Keep local clock advancement and test price selection confined to the local Anvil resolver. On a public network, block simulated time advancement and arbitrary prices.
5. Preserve an evidence packet: chain ID, contract addresses and runtime code hashes, deployment block, funding/finalization/settlement transactions, complete-set backing check, and rerun commands.

### P1 — make the three named sponsor paths real

| Track | Build gate | Current status |
|---|---|---|
| **Arkiv** | Publish and query a 30-day, owner-deletable AQRA recipe on Rabdi using a funded wallet; record the actual entity key, transaction and writer; show it loaded and re-verified in the composer | UI + SDK path implemented; public write/read still unverified |
| **Chainlink** | Implement a CRE workflow that reads a named external feed and the AQRA registry, rejects stale/mismatched/terminal observations, and writes through a receiver that verifies workflow/report identity; successfully run `cre workflow simulate` or deploy it | Not implemented as a CRE workflow; current test resolver / Sepolia historical adapter is not CRE |
| **Arc** | Begin or extend the project inside Arc Studio, preserve the shareable Studio URL and show Studio use; deploy the real flow on Arc testnet using the supported USDC asset; complete one loan settlement | Not implemented; eligibility also depends on Continuity participation or an Arc Studio-originated build as specified by the selected prize |

For Arkiv, restrict the public access key to the app origin and keep it out of the wallet's saved RPC URL. The [Rabdi docs](https://docs.arkiv.network/networks/rabdi/) give the testnet ID, RPC, tGLM, faucet and explorer; the [SDK entity guide](https://docs.arkiv.network/start-here/first-entity/) covers write-and-read; [access-key guidance](https://docs.arkiv.network/start-here/access-keys/) explains browser key handling.

For Arc, do not copy the current Sepolia resolver or label a Sepolia transaction as Arc. The app needs an Arc-specific settlement-token manifest and real Arc receipts. Confirm the canonical token and current testnet details against [Arc's official docs](https://docs.arc.network/) at implementation time.

### Cut from this submission

- No AI prediction card, generated trading advice, invented portfolio balance, fake correlation score or frontend-only transaction success.
- No external market collateral, bridge, tranche token, CCTP, Uniswap swap or Swarm attachment without a useful implemented flow and its own receipts.
- No extra dashboard cards merely to make the screen denser. Add visual complexity through real market history, payout curves, inventory and event evidence already present in the protocol.
- No statement that the project is audited, production-safe, live on Arc, settled by CRE, or used by customers without evidence for that exact statement.

## Demo story that matches the evidence

1. Select a registered AQRA market and distinguish its settlement observation from TradingView and external venue research.
2. Choose a compatible lower YES and upper NO claim; show the shared observation and payout surface.
3. Verify the current pair against the deployed contract, mint only fully backed test claims, and lock only the selected claim inventory.
4. Publish a wallet-owned Arkiv recipe, read it back, load it, and run the proof again (after the first Rabdi transaction is available).
5. Borrower publishes fixed terms; a separate lender wallet funds only within the certified floor and reserve.
6. Show the actual oracle path and settlement transaction for the chain being demoed. Do not substitute CRE simulation for an onchain settlement receipt.
7. End on the Settlement Explorer with lender payment, borrower surplus, transaction hashes and event log positions.

For judging, the strongest improvement is a smaller set of verifiable things done completely. The prior winners above all tie their sponsor tool to the product's central user action; adding more sponsor integrations without this evidence weakens that story.
