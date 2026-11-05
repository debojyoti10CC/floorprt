# Primary-Source Research Audit — Senthos × Cumulant × Outcome Collateral

**Research date:** 5 November 2026.  
**Method:** inspected public landing/showcase pages, then fetched actual public GitHub README, architecture, product, onchain, security, audit and selected Solidity files with GitHub repository access. Findings describe source repository declarations and code review samples; **not** a local clone, executable test run or full audit. Local git clone was unavailable in the research environment, so do not confuse document inspection with test verification.

## 1. Direct-source inventory

### Senthos / Traxis — Solana

- [Senthos creator case study](https://lukres.dev/projects/senthos) — original project, team, eight-day SCBC hackathon, split responsibilities, devnet deployments.
- [Colosseum portfolio description](https://colosseum.com/companies/senthos) — current institutional prediction-market risk, pricing, margin and financing positioning.
- [GitHub: LuKresXD/SCBC-Hackathon-2026](https://github.com/LuKresXD/SCBC-Hackathon-2026) — public hackathon repo.
- [README.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/README.md) — exact combined-repo tree and branch provenance.
- [ARCHITECTURE.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/ARCHITECTURE.md) — frontend routes, backend routes, services, dependency graph, correlation logic and lending curve.
- [PRODUCTS.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/PRODUCTS.md) — four product primitives, risk tiers and crucial real-vs-sandbox disclosure.
- [ONCHAIN_DESIGN.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/ONCHAIN_DESIGN.md) — Anchor vault account model, custody/USDC flow, authority and settlement.
- [SECURITY.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/SECURITY.md) — key powers, mismatch between Solana webhooks and Polygon settlement, non-atomic DB/chain, mock Meteora integration.
- [AUDIT.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/AUDIT.md) — April 2026 repo state and limits of local audit; some observations are dated and may no longer describe the current branch.
- [MARKET_FILTER.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/MARKET_FILTER.md) — curated Polymarket feed and NLP/filter pipeline.
- [MODEL_INTEGRATION.md](https://github.com/LuKresXD/SCBC-Hackathon-2026/blob/main/MODEL_INTEGRATION.md) — correlation/ML artifacts, TypeScript runtime gate and limitations.

**Verified Senthos architecture pattern:**

```text
app/                                  Next.js app, route segments /app/*
app/app/basket, tranche, ppn, lending, hedge, portfolio
app/app/_lib/demo-state.tsx           browser-local demo state for some products
backend/src/routes/                   market, bundle, lending, hedge, ppn and admin APIs
backend/src/services/                 Polymarket, correlation, tranching, NAV, rates, monitoring
backend/src/db/                       Supabase plus mock fallback
programs/traxis_vault/                Anchor USDC-backed basket program
programs/traxis_ppn/                  Anchor PPN program with mock yield adapter
traxis-correlation-deliverables/      model and model-audit artifacts
scripts/, tests/, migrations/         build/deploy/testing helpers
```

**Senthos product facts:** Native Basket, Tranched Pool Tokens, PPN, Lending/Repo and custom Hedge Builder. Tranches attach/detach 0–60%, 60–85%, 85–100% in the product docs; lending LTV tiers for baskets 0.85/0.60/0.40 and senior/mezz/junior 0.88/0.60/0.30 are based on risk tiers and rates. They are **not** formal guaranteed settlement floors. The project's own PRODUCTS.md explicitly says native basket and PPN were onchain, while tranche positions and lending pool state were *client/in-memory sandbox*. ONCHAIN_DESIGN.md states Solana vault holds USDC and outcomes are mirrored by privileged authority, **not native Polymarket outcome tokens**. This distinction is decisive for Floor Protocol architecture.

**Reusable as inspiration:** product navigation and screens, market metadata normalization, correlation as informational layer, curated feed, monitor and tested lifecycle categories. **Not reusable as our proof:** Solana-specific escrow accounts, NLP inference of market equivalence, in-memory lending ledger, authority-set leg status, simulated yield data.

### Cumulant — Arc EVM

- [ETHGlobal Cumulant showcase](https://ethglobal.com/showcase/cumulant-xfzya) — finalist and Arc winner, product coverage, implementation notes.
- [GitHub: notveiker/EG-Arc-Cumulant](https://github.com/notveiker/EG-Arc-Cumulant) — public code, README, module tree.
- [README.md](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/README.md) — products, testnet mock status, paths and deployment setup.
- [ARCHITECTURE.md](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/ARCHITECTURE.md) — chain-centered topology, contract descriptions, backend signing roles, frontend trading lifecycle.
- [SECURITY.md](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/SECURITY.md) — internal security review and fixed issues.
- [PredictionMarket.sol](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/contracts/src/PredictionMarket.sol) — parimutuel market stakes and resolution; **different payoff type**.
- [BasketVault.sol](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/contracts/src/BasketVault.sol) — weighted multi-leg basket, market assignment, mint/redeem accounting.
- [TrancheVault.sol](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/contracts/src/TrancheVault.sol) — senior/junior waterfall and internal shares.
- [ProtectedNote.sol](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/contracts/src/ProtectedNote.sol) — reserved depositor principal and issuer-funded upside.
- [Foundry config](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/contracts/foundry.toml) — Solidity/Foundry toolchain, Arc settings.
- [Frontend package](https://github.com/notveiker/EG-Arc-Cumulant/blob/main/frontend/package.json) — Next.js, wagmi, viem, wallet integrations.

**Verified Cumulant architecture pattern:**

```text
contracts/src/           PredictionMarket.sol, BasketVault.sol,
                         TrancheVault.sol, ProtectedNote.sol
contracts/test/          Foundry unit/fuzz/invariant and security scenarios
contracts/script/        Anvil/Arc deploy and seed
backend/                 Express/viem chain reader and limited server-signed demo rails
frontend/                Next.js + wagmi/viem + Dynamic wallet integration
infra/                   supporting infrastructure
ARCHITECTURE.md          contract/backend/frontend boundary documentation
SECURITY.md              self-audit and known production gaps
```

**Important distinctions and repo discrepancies:**

1. `PredictionMarket.sol` is a parimutuel model; winners share pooled loser deposits. It is **not** a token claim with a fixed $1 winning redemption. For mathematically proved face value, Floor Protocol needs a different market issuer mechanism.
2. `TrancheVault.sol` on the public source is a real Solidity contract with waterfall math, but the showcase describes its demo experience using note rails and some offchain metadata. Both statements may reflect implementation stages; avoid oversimplifying that *all* tranches were merely offchain.
3. The repository README reports **70 Foundry tests**, whereas `ARCHITECTURE.md` and `SECURITY.md` still cite **62**; these are documentation snapshots. We did **not** run tests locally, so do not present either number as independently verified.
4. The live Arc testnet suite uses a **freely mintable mock USDC** in its main demo and a deployer-owned server key for mock faucet, resolver, market-maker quote and payout roles. Correctly label these as test/demo rails, not trustless mainnet behavior.
5. Their protected note reserves principal 1:1 and funds upside from the issuer—**not the same product** as borrowing against event-claim payout floors.
6. Their roadmap calls for transferable ERC-1155 product shares, stronger oracle resolution and an event indexer. Floor Protocol treats actual ERC-1155 collateral tokens and indexer readiness as foundational rather than optional cosmetics.

**Reusable as inspiration:** contract boundaries, explicit vault accounting, settlement waterfall patterns, Foundry fuzz tests, wallet-signed flows, security review checklists, claim/event indexing. **Not reusable as proof:** parimutuel math, demo role trust, simulated market-maker depth, blanket `ProtectedNote` principal guarantee in a loan product.

## 2. Comparative design matrix

| Dimension | Senthos | Cumulant | Floor Protocol proposal |
|---|---|---|---|
| Origin | Solana hackathon / startup | Arc ETHGlobal winner | EVM-first new app |
| Main product | Structured baskets/tranches/PPNs and risk pricing | USDC-backed markets, baskets, tranches, notes, distribution quotes | Proof-certified event portfolios + matched USDC term credit |
| Frontend | Next.js 16 pages and sandbox reducer | Next.js App Router, wagmi/viem/Dynamic | Next.js terminal + graph + proof + credit + settlement |
| Risk signal | Heuristic/ML correlation and Monte Carlo | ML decorrelation/VaR-CVaR on backend | Logical condition proof for P0; optional research signal later |
| Underlying claims | Solana escrow mirror of Polymarket results in vault | Parimutuel market stakes, internal shares | Fully collateralized fixed-payout ERC-1155 outcome tokens |
| Loan mechanics | Lending math/client-state demo in source | No equivalent restricted proof-backed loan documented | Onchain collateral custody, funded debt and waterfall P0 |
| Oracle | Privileged outcome mirroring | Trusted resolver/admin demo role | Shared immutable observation; test resolver→CRE later |
| P0 differentiator | Structured product breadth | Multi-product EVM demo | Verifiable floor→locked collateral→actual loan→automatic repay |

## 3. Related infrastructure and papers

### Gnosis Conditional Token Framework (CTF)

- [Gnosis Conditional Tokens contracts](https://github.com/gnosis/conditional-tokens-contracts), [developer guide](https://github.com/gnosis/conditional-tokens-contracts/blob/master/docs/developer-guide.rst), [ConditionalTokens.sol](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol).
- Split collateral into exhaustive outcome claims, merge full sets, redeem according to reported payout vector, ERC-1155 positions. Gnosis contract source is LGPL-3.0; be license-conscious about direct code reuse.
- [Polymarket CTF operations](https://github.com/Polymarket/agent-skills/blob/main/ctf-operations.md) — practical full-set funding, `YES`/`NO` tokens and redemption. Polymarket uses fixed-winning-share economics rather than Cumulant parimutuel stakes.
- [Polymarket resolution help](https://help.polymarket.com/en/articles/13364518-how-are-prediction-markets-resolved) — UMA dispute and resolution process, important for real-world custody assumptions. A Polymarket event's terms can be different from this P0 shared-scalar model.

### Formal relationship research

- [Saguillo et al. (2025), *Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets*](https://arxiv.org/abs/2508.03474) — combinatorial market arbitrage and the importance of relationship identification.
- [Shi and Zhai (Oct 2026), *Combinatorial Arbitrage in Prediction Markets*](https://arxiv.org/abs/2610.23517) — payoff-vector feasibility, logical relations, integer programming and execution limits; a direct research inspiration for computing conservative bounds.
- These works **do not** prove our lending contracts safe, and `arbitrage` in a paper does not imply realizable early liquidity or risk-free investments.

### Oracle + EVM engineering

- [Chainlink CRE overview](https://docs.chain.link/cre/overview) — workflow architecture and CLI simulation. Simulation counts toward current Chainlink Mumbai workflow qualification only if meaningfully used; need captured successful artifact.
- [ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes) — sponsor rules; check again before submitting.
- [ETHGlobal event rules](https://ethglobal.com/rules) — Classic track start-at-kickoff; disclose any pre-existing work; Continuity track has different restrictions.
- [Underlay ETHGlobal Cannes 2026](https://ethglobal.com/showcase/underlay-ikbjb) — nearby onchain multi-leg risk underwriting concept; underscores that multi-leg prediction risk + lending/underwriting is not intrinsically unprecedented.

## 4. Originality and attribution policy

**Potentially new synthesis (not independently proven novel):** a user-facing proof terminal that attaches an enforceable *shared-observation* deterministic lower-bound to actual ERC-1155 custody and uses that bound as the cap on a fixed-debt loan automatically paid at settlement. This combines pre-existing conditional-token mechanics, logical arbitrage theory and lending/structured products in a specific product workflow. There may be other independently developed examples; undertake direct competitor/repository checks before claiming novelty in marketing.

**Do not copy:** logos, screenshots, copywriting, frontend designs, code artifacts or proprietary research. Source repos may have license headers on individual files, but the tool inspection did not locate a canonical top-level `LICENSE`, `LICENSE.md` or `COPYING` in either root path. Verify precise file license and terms before redistribution. The Gnosis CTF repo explicitly uses LGPL-3.0, so attribution and redistribution duties matter if its source is reused.

**ETHGlobal:** researching architecture and writing product documents may occur before a hackathon, but submitting pre-written project-specific code/design/assets as a Classic from-scratch build can violate the event rules. Tell organizers about prior work, and begin qualifying implementation at event kick-off under the appropriate track. Read current rules independently.

## 5. Research confidence table

| Claim | Confidence | Basis / limits |
|---|---|---|
| Senthos has public GitHub and actual Anchor program code | High | Creator page + GitHub README/ONCHAIN_DESIGN; no local chain verification |
| Senthos hackathon lending and tranche state were in-memory/sandbox | High | Explicit `PRODUCTS.md` and `ARCHITECTURE.md` |
| Cumulant has four Solidity products and Arc testnet demo | High | ETHGlobal showcase + README + inspected contracts |
| Cumulant's market engine is parimutuel | High | README/ARCHITECTURE + source Solidity |
| Our proof holds for **the restricted conditions in MECHANISM_AND_PROOFS** | Mathematical argument + implementation pending | Theorem can be reasoned; Solidity tests/audit still required |
| Arbitrary Polymarket positions qualify for the same floor | **False** | Market semantics/custody vary; require explicit adapter |
| This product is never-before-built | Unknown | No exhaustive startup/patent/repo proof; do not claim |
| All contracts can be production-ready in 48 hours | **False** | Security, liveness and regulatory work needed |
