# Arkiv + Swarm completion

## Decision

Extend the existing ADR-019 borrower-consented credit flow; do not create a new financial ledger, change contracts or import public wallet histories into Arkiv without consent/licensing review. Preserve the separate legacy payout-floor invariants in MECHANISM_AND_PROOFS.md.

- Extract the credit packet schema/query into a browser-independent module used by the UI and read-only verification CLI. Keep Rabdi and loopback devnet explicitly distinct.
- Validate packet identity and immutable report commitments against the current lending chain before reviewing evidence or funding. Arkiv is untrusted discovery, not a credit oracle.
- Separate Swarm read configuration from upload configuration: a reader needs a Bee endpoint, not postage or an upload wallet. No automatic gateway fallback hides a retrieval error.
- Export an evidence bundle after a verified inspection/publication. Its timestamps are observations, not ongoing availability guarantees; monetary state remains onchain.
- The verifier sends no transactions, holds no wallet key, and records only successful checks. Missing public receipts, batch provenance, video evidence and Continuity eligibility remain explicit submission blockers.

Existing contracts already enforce an immutable report reference/hash before funding. New tests cover storage failures and packet mismatch boundaries without changing payout rules.

## Validation

- `pnpm install --frozen-lockfile`: exit 0; installed seven missing existing locked packages, including Bee JS; no lockfile change.
- `pnpm typecheck`: exit 0 (root, CRE workflow and web).
- `pnpm test`: 13 files, 66 tests passed. New tests cover packet mismatch/deadline/pledge/commitment boundaries, independently recomputed browser report hashes, Bee byte-level failure paths, and real EOA consent signatures against mocked chain/storage adapters. These mocks are not public integration proof.
- `pnpm storage:verify --help`: exit 0; documented read-only arguments. A real Rabdi/Swarm join was not run because no configured writer/entity/Bee service is available.
- `pnpm --filter @floor/web build`: exit 0; static `/`, `/underwriting/` and `/whitepaper/`. Rabdi warns that the optional access key is absent/public RPC is rate-limited.
- `pnpm contracts:build && pnpm lint`: exit 0; 86 Solidity files compiled, 144 source files checked, 12 generated ABIs matched. Existing timestamp/typecast lint warnings remain. Initial lint failed because compiler artifacts were absent; building them resolved it without ABI/source changes.
- `pnpm contracts:test`: 90 passed, 0 failed, 1 fork-only test skipped; includes 512-case fuzz tests and three stateful invariants (128 runs / 6,144 calls each). No Solidity files changed.
- `node scripts/docs-api-generate.mjs --check`: PASS; 13 source-matched HTTP routes / 14 generated files.
- `node scripts/docs-generate.mjs --check`: fails on existing `specifications/PRD.mdx` drift, as already recorded in the unrelated landing ADR. No unrelated generated-document regeneration performed. Full Mintlify validation not run.
- `git diff --check`: exit 0.

No public transactions, public uploads, browser wallet lifecycle, Swarm network availability, prize qualification or independent audit are established by these checks. Bee/Arkiv/Docker binaries were unavailable; the node-backed storage browser E2E was not rerun. Existing landing changes were preserved.

## Event provenance

This repository and the basic Arkiv/Swarm flow predate this change. Git history is the work boundary; no claim is made that these changes occurred during ETHGlobal Mumbai. The team must record event dates, baseline revision and actual event-new commits, and obtain Continuity acceptance before entering the existing-project prizes.
