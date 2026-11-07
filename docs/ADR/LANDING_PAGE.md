# Landing page — 6 November 2026

The user requested a public landing page using a supplied black-grid, dot-matrix and violet reference. This direction applies to `/` only; the existing trader-credit app remains at `/underwriting/` and the whitepaper at `/whitepaper/`.

The landing describes the current trader-credit pilot (ADR-019), not the legacy outcome-token floor as if it guaranteed trader-loan repayment. It displays no invented TVL, available credit, adoption metrics or return claims. Test-only status, lender principal-loss exposure, lack of external position custody and the uncalibrated model remain explicit.

Landing-only semantic colors live in `kimia.css`; scoped CSS retains the terminal's existing visual system. The supplied image is visual inspiration only, not bundled or traced. Dot lettering, procedural evidence sphere and metallic orbital geometry are independently authored; no reference branding, source, assets or financial figures are copied. Existing self-hosted, licensed fonts are reused.

Monetary contracts and transaction logic are unchanged. Historical terminal E2E files predate the current trader-credit navigation and are not represented as newly passing.

## Validation in this change

- `pnpm install --frozen-lockfile`: completed, added 32 previously missing dependency packages without lockfile changes. Initial type/build attempts failed on the missing existing Arkiv SDK; both pass after installation.
- `pnpm typecheck`: exit 0; root, CRE workflow and web TypeScript pass.
- `pnpm --filter @floor/web build`: exit 0; compiled and statically generated `/`, `/underwriting/`, `/whitepaper/` and the not-found page. Existing Rabdi public-endpoint rate-limit warning remains.
- `pnpm test`: 6 test files / 22 tests passed.
- `pnpm exec playwright test --config=playwright.landing.config.ts --repeat-each=3`: 12 passed (four tests repeated three times). Checks app navigation, disclosures, native keyboard/anchor behavior, overflow at 1440/1024/768/390/320px, and reduced motion. Initial test corrections fixed an accessible-name matcher and used focused keyboard activation for the keyboard test.
- `git diff --check`: exit 0.
- `node scripts/docs-api-generate.mjs --check`: PASS, 13 source-matched routes and 14 generated files.
- `node scripts/docs-generate.mjs --check`: fails on existing `specifications/PRD.mdx` generated drift. Neither that source nor its generator or mirror was edited here; no unrelated regeneration was performed. Full Mintlify validation was not run.

Desktop (1440px) and mobile (390px) screenshots were visually reviewed. This is targeted landing-page verification, not a rerun of monetary lifecycle/security gates or an accessibility certification.

## PDF-informed scroll walkthrough extension

Read the five-page user-supplied `/Users/sylviabarick/Downloads/document (2).pdf`, “AQRA: A Walk-Forward Study and Credit-Risk Framework for Prediction-Market Trader Lending.” Tables I–II supply the explicitly dated historical research figures, not live metrics. Include the better-performing largest-monthly-P&L comparator and the four-event cohort caveat; do not present 70% positive trader P&L as loan repayment. The existing ADR-019 trader-credit pivot resolves its distinction from legacy floor-backed loans; no contractual payout rule changes.

- Preserve the existing hero/theme and `/underwriting/` and `/whitepaper/` routes. Add a five-chapter sticky visual, native keyboard chapter buttons, illustrative full repayment/default controls, research coverage/comparisons, risk principles, native FAQ disclosures and final CTA.
- `landing-story.tsx` is the only new client boundary. Passive scroll events schedule one animation-frame update; cleanup cancels listeners/frames. No scroll interception, external animation dependency or financial writes. Monetary examples are fixed explanatory text, not a simulated ledger or transaction confirmation.
- Reduced motion disables decorative animations and smooth chapter navigation. All chapter prose and disclosures are server-rendered. CSS view-timeline reveals progressively enhance research content where supported.
- Existing uncommitted landing work was extended rather than reset. No subagent capability was available; no agents were spawned or model identities claimed. No reference code/assets were imported.

### Extension validation

- `pnpm typecheck`: exit 0; root, CRE workflow and web TypeScript passed.
- `pnpm test`: 6 files, 22 tests passed.
- `pnpm --filter @floor/web build`: exit 0; `/`, `/underwriting/`, `/whitepaper/` statically generated. Existing Rabdi missing-access-key/public-rate-limit warning remains.
- `pnpm exec playwright test --config=playwright.landing.config.ts`: 7 passed. Initial runs exposed sticky-panel interaction/scroll anchoring and animated-transform instability; stable panel geometry, no transform on interactive panels, and final-chapter space fixed these before the successful run.
- `pnpm exec playwright test --config=playwright.landing.config.ts --repeat-each=3`: 21 passed. Covers native navigation, all five scroll stages, keyboard chapter controls, both outcomes, FAQ keyboard activation, research context, responsive width at 1440/1024/768/390/320px and reduced motion.
- `git diff --check`: exit 0.
- Visually reviewed full desktop page and desktop/mobile sticky-stage screenshots saved under `/tmp/aqra-landing-desktop.png`, `/tmp/aqra-story-desktop.png` and `/tmp/aqra-story-mobile.png` (temporary review artifacts, not public execution evidence).

No monetary contract, underwriting engine, wallet action or deployment was changed. This validates the landing only; it does not establish mainnet readiness, an audit, legal clearance or a public CRE receipt.
