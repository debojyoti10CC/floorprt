# Source verification and implementation lessons

Inspected 5 November 2026 from local, shallow public Git clones. Reference code was read, not executed, copied, or represented as tested. This supplements the original SOURCE_AUDIT.md with current file-level evidence.

## Repositories and provenance

| Project | Exact inspected revision | Scope |
|---|---|---|
| [Cumulant](https://github.com/notveiker/EG-Arc-Cumulant/tree/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1) | `ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1` | Solidity markets, basket/tranche/note contracts, Foundry tests, Next.js, Express, architecture and self-audit |
| [Senthos / Traxis](https://github.com/LuKresXD/SCBC-Hackathon-2026/tree/11f56862faf8c3c95c50d71cb75ec54c3ac243c3) | `11f56862faf8c3c95c50d71cb75ec54c3ac243c3` | Combined Next.js/Express/Supabase/Anchor/model source, onchain bridge, product docs, security notes and lending scaffold |

The implementation lead queried the authors' public repository lists: these were the only matches for Cumulant, Senthos, Traxis or SCBC in names/descriptions. That does not prove private repositories, renamed projects or other organizations do not exist.

Cumulant exposes one public branch (`main`). Senthos exposes eight, all shallow-fetched into the research clone without executing their contents:

| Senthos branch | Remote revision |
|---|---|
| `main` | `11f56862faf8c3c95c50d71cb75ec54c3ac243c3` |
| `alex-ui` | `3fdacf9f2cb883a61d10421db4f095dce1576faf` |
| `feat/portfolio-composer` | `7cd530d50c6093b3697c9f07c9f1ec7137afb20f` |
| `integration/all` | `d7cf7a8a4eb79cfcdc74bd9590abc0b5bc20016b` |
| `integration/full-wiring` | `3d7c8c3a938e9852298fc36a6cc99c2386c3ce5a` |
| `ml-model` | `12963b3a80909debaa660194f5b0213b4e895a14` |
| `phase-15-devnet-deploy` | `eeeefabd72eb535333a37a6f4e04a2db404f5bbe` |
| `wiring/onchain-ready` | `637159b01a3a54bd06b6ffe1aecb2b54606febdf` |

The [Senthos README merge table](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/README.md) states that main combines rebranded frontend/backend, phase-15 onchain work and ml-model artifacts. Branch trees and selected diffs were inspected; every file on every branch was not audited. `integration/full-wiring` has no diff from main in the inspected programs/lending-service paths. The composer branch omits substantial wallet/chain-client code present on main, so its name alone is not evidence of a more complete implementation.

## Findings that change Floor's design

1. **Do not reuse the market payoff mechanism.** [Cumulant PredictionMarket.sol](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/contracts/src/PredictionMarket.sol) records stakes and distributes pooled losing stakes pro rata. There is no fixed $1 face value per ERC-1155 winning token. Floor's complete sets must escrow one test USDC per YES/NO pair and redeem at fixed 1/0 or common 0.5/0.5.
2. **Model exact custody instead of outcome mirroring.** [Senthos onchain design](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/ONCHAIN_DESIGN.md) describes a USDC vault whose legs are set by authority, not custody of native Polymarket claims. [Its finalize implementation](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/programs/traxis_vault/src/instructions/finalize_vault.rs) computes won-weight payout and checks available USDC. Floor must lock its actual approved ERC-1155 inventory, burn it at redemption and verify cash deltas.
3. **Distinguish deployed functionality from scaffold.** [Senthos lending program](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/programs/traxis_lending/src/lib.rs) exists, but explicitly identifies itself as undeployed. [Anchor.toml](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/Anchor.toml) configures vault and PPN only. [The lending client](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/app/app/_lib/lending-client.ts) explicitly performs API mutations without wallet signing or chain confirmation; [the service](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/backend/src/services/lending.ts) stores the pool in memory. Thus “no lending code” is inaccurate; “undeployed skeleton plus sandbox runtime” is supported.
4. **Never accept the caller's collateral valuation.** [Senthos open_loan.rs](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/programs/traxis_lending/src/instructions/open_loan.rs) accepts caller-supplied collateral value, LTV and APY as a documented hackathon assumption. That is unsuitable for Floor's proof-backed credit. Recalculate the floor inside the vault from immutable market metadata; borrower inputs must never inflate it. Bound total debt including fees and its complete lifetime growth.
5. **Chain confirmation must lead the read model.** [Senthos onchain-bridge.ts](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/backend/src/services/onchain-bridge.ts) documents DB-first, fire-and-forget chain updates. Its [security notes](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/SECURITY.md) acknowledge non-atomic divergence and recommend chain first. Floor must use receipts, current direct reads, canonical-block cursors and visible cache/RPC failure states.
6. **Recoverability must preserve the theorem.** [Cumulant's security review](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/SECURITY.md) describes dead-leg freezes and per-market void recovery. Floor needs a shared permissionless longstop cancellation with 50/50 payout, rather than independent market voids or catch-and-continue redemption that could destroy the paired floor.
7. **Separate product types and liens.** [Cumulant TrancheVault](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/contracts/src/TrancheVault.sol) implements an actual senior/junior waterfall; [ProtectedNote](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/contracts/src/ProtectedNote.sol) reserves principal and funds upside separately. Neither demonstrates Floor's credit theorem. Any future tranche module must exclusively custody unencumbered claims and independently enforce its senior cap.

## Concrete verification categories to adapt independently

| Category | Source evidence | Floor acceptance |
|---|---|---|
| Solvency over varied amounts | [PredictionMarket tests](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/contracts/test/PredictionMarket.t.sol) include solvency fuzz, duplicate claim, before-close, void and empty-winner cases | Per-market escrow always covers outstanding terminal liabilities; independent claim holders and partial redemptions conserve cash |
| Waterfall edge cases | [Tranche tests](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/contracts/test/TrancheVault.t.sol) include junior-empty, first-loss and total-loss scenarios | Lender paid exact fixed due first; borrower receives exact residual; repeated settlement cannot pay again |
| Curated creation and bounded work | [Basket tests](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/contracts/test/BasketVault.t.sol) cover unauthorized creation, too many legs, small allocations, reused markets and unresolved settlement | Only curator creates observations/markets; bounded whole quantities; mismatch/reversed/equal strike rejection; no orphan custody deposits |
| Atomic failure | [Senthos security notes](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/SECURITY.md) review burn-before-transfer and authority constraints | Failed approval, token callback or cash transfer rolls back inventory and debt together; reentrant callback cannot reuse collateral |
| Honest integration labels | [Senthos PRODUCTS.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/PRODUCTS.md) and [Cumulant README](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/README.md) disclose sandbox or mock rails | No fabricated TVL, production oracle, live venue custody or public-testnet completion; show chain and actual receipts |

These are source-defined categories. Neither reference suite was executed here. README's 70-test count and SECURITY.md's 62-test count in Cumulant are inconsistent snapshots, not independently verified results.

## Licensing and related GitHub links

No top-level LICENSE, LICENSE.md or COPYING was found in either inspected checkout. Cumulant's four product Solidity files and its sampled tests explicitly declare `SPDX-License-Identifier: MIT`; this is narrower evidence than a repository-wide license grant. Its vendored OpenZeppelin and forge-std trees carry their own licenses. Senthos's inspected original Rust files do not declare a license header. Floor uses independently authored source and separately licensed upstream packages; reference branding, assets and code are not imported.

The inspected original documentation directly links these additional GitHub projects:

- [Dynamic React/JS SDK example](https://github.com/dynamic-labs-oss/react-via-js-example-app), linked by [Cumulant DYNAMIC_SETUP.md](https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/DYNAMIC_SETUP.md). Optional wallet onboarding example, not a Cumulant protocol repository.
- [Anchor](https://github.com/otter-sec/anchor), reached by the legacy coral-xyz/anchor link in [Senthos ONCHAIN.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/11f56862faf8c3c95c50d71cb75ec54c3ac243c3/ONCHAIN.md). Solana tooling, not required by Floor's EVM implementation. The redirect was checked in the browser on the research date.

No separate original Senthos/Cumulant protocol repository was linked from the inspected primary documentation. Floor's original blueprint also names Gnosis CTF, Polymarket agent skills and Chainlink CRE as ecosystem references; those are independent upstream projects, not additional Senthos/Cumulant implementations. Do not bulk-import code or install every dependency merely because a reference mentions it.

## Limits

This is architecture and selected-source research, not a security audit, exhaustive branch review, verified deployment inventory, legal opinion or proof of novelty. Senthos documentation contains different deployed program IDs between README and Anchor.toml, so source declarations alone do not verify current devnet deployment. No private accounts were accessed, no secrets were read, no trades were placed and no reference services were run.
