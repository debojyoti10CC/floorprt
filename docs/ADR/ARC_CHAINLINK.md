# Arc + Chainlink integration completion

## Decision and provenance

Fast-forwarded the checkout from `2a94889` to the three already-published Arc commits ending at `526ebaa`; Git autostash restored the existing landing and Arkiv/Swarm work. The published deployment is not a Studio-originated deployment unless separately demonstrated.

The [official Arc prize page](https://ethglobal.com/events/mumbai/prizes/arc) was retrieved during this review. The advanced-stablecoin prize allows a new or existing frontend, but requires contracts written/tested/deployed in Arc Studio, app connection through Studio, a shareable project URL, working frontend/backend, an architecture diagram and a demo showing Studio. This permission does not waive ETHGlobal event-new-work rules. AQRA's existing repository must be disclosed; organizers determine eligibility.

Keep the current restricted operator relay as a **testnet simulation delivery mechanism**, not a Chainlink DON forwarder. Arc workflow configuration must explicitly select simulation mode; production Arc delivery is not enabled by this work. The recorded score is a test fixture and recorded historical prices are not current executable bids. Recovery comes from prefunded USDC, not historical P&L or the legacy payout-floor theorem.

Complete reproducible read-only receipt verification, negative Arc-chain/relay tests, explicit UI provenance and a Studio handoff/runbook. No new public deployments or transactions are authorized by verification commands. Preserve legacy mathematical invariants and wallet-signed origination/funding.

## Validation and evidence

- `git merge --ff-only --autostash origin/main`: fast-forward to `526ebaa`; autostash reapplied cleanly. Existing uncommitted changes retained; no new commit/push performed.
- `pnpm typecheck`: exit 0 (root, CRE workflow and web).
- `pnpm test`: 15 files / 74 tests passed, including packet/storage tests preserved from the prior change, new receipt-verifier negative tests and CRE simulation/config boundaries.
- `pnpm arc:verify --output work/arc-testnet/verification.json`: PASS on public Arc. Canonical finalized block `71119906`; independently observed `1020000` micro-USDC paid and `2400000` share units delivered. Published the non-secret read evidence in `evidence/arc-verification.json`. `pnpm arc:verify` passed again after final freshness/receipt validation changes. These commands send no transactions.
- `node scripts/foundry.mjs forge test --root packages/contracts --match-contract ArcIntegrationTest -vv`: five passed. An initial formatting invocation used a root-relative filename incorrectly, and an initial `pnpm contracts:test -- --match-contract ...` passed an extra argument separator; corrected direct invocations passed.
- `pnpm contracts:test`: 95 passed / 0 failed / 1 fork-only test skipped; includes existing 512-case fuzz tests and three invariants at 128 runs / 6,144 total calls per invariant. No deployed contract source changed in this completion work.
- `pnpm lint`: PASS; 158 source files scanned, 13 generated ABIs match compiler artifacts; Foundry format check passes.
- `pnpm arc:studio:prepare`: PASS; 581 fingerprinted source/test/dependency files copied without secrets to `work/arc-studio-handoff`.
- `node scripts/foundry.mjs forge test --root work/arc-studio-handoff/packages/contracts --match-contract ArcIntegrationTest -vv`: 78 source files compiled, five tests passed in the isolated handoff. This is local Foundry execution, not Studio execution.
- `AQRA_E2E_ARC=true pnpm exec playwright test e2e/cre-margin.spec.ts`: one Chromium case passed against the public Arc profile (7.9s). Corrected navigation to `/underwriting/` to coexist with the landing page; verified LTVs, exact recovery, explorer receipts, simulation disclosure and non-demo Borrow view. No wallet transaction was sent.
- `NEXT_PUBLIC_AQRA_ARC_DEV=true pnpm --filter @floor/web build`: exit 0; Arc static build generated `/`, `/underwriting/` and `/whitepaper/`. Rabdi warns about the absent optional public access key.
- `node scripts/docs-api-generate.mjs --check`: PASS, 13 routes / 14 generated files. `node scripts/docs-generate.mjs --check`: blocked by pre-existing `specifications/PRD.mdx` drift. Updated the affected status/submission/evidence mirrors only; did not regenerate unrelated historical docs. Full Mintlify validation not run.
- `git diff --check`: exit 0.

No new public deployment, report submission, user monetary transaction, Studio project or CRE simulation run was performed. This is not an audit or confirmation of event eligibility.

## External blockers

No Arc Studio authenticated session/shareable project URL or CRE CLI/Bun executable is available in this workspace. Do not invent Studio provenance or claim a new official simulation run. The team must create and share the actual Studio project and review its build/test/deployment output; a local bundle or deployment made by Foundry does not meet that gate.
