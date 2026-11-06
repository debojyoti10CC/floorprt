# Reach

## AQRA credit evidence

The intended users are prediction-market traders requesting a small fixed-term loan and lenders reviewing those requests. The Arkiv-backed feature is used directly by both: borrowers publish an expiring listing after a public-data disclosure; lenders query it and inspect the exact referenced report before their funding action unlocks.

This is a prototype with no verified production borrowers, lending customers, third-party Arkiv consumers or live Arkiv/Swarm receipts recorded in this checkout. It has not shipped to users. For a testable release, configure a Bee node and postage batch, restrict the optional Rabdi access key, use funded borrower/lender test wallets, complete one report publication, and record the Arkiv entity key, writer, transaction hash, Swarm reference, content hash and second-wallet query result in the README. A live post-event launch depends on testnet evaluation and audited custody/loan code.

This repository predates the current event work. AQRA will only claim an Arkiv existing-project prize if the team is eligible for and enrolled in the event's Continuity track; otherwise, do not submit this code as a from-scratch project. The new Arkiv/Swarm lending path is distinguishable from the pre-existing outcome-strategy library in Git history.

AQRA is an early prototype. There are no verified production users, customers, external applications consuming these recipes, or public Arkiv writer addresses to report yet. This file intentionally does not invent adoption metrics.

Potential users are outcome-portfolio builders and risk researchers who want to share a recipe with a known owner, query its terms, and open it in AQRA. The immediate use is inside the portfolio composer; the next evidence step is to test that flow with at least two distinct Rabdi wallets and record a real public entity that a second wallet can query and load.

The repository is intended to be public at [debojyoti10CC/floorprt](https://github.com/debojyoti10CC/floorprt). That link and the feature describe reach potential, not measured user adoption. Any statement that the repo is public, the entity is live or another app depends on it must be checked against the live repository and transaction before submission.
