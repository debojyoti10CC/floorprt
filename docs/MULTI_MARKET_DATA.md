# AQRA multi-market data study

**Research date:** 6 November 2026  
**Purpose:** identify prediction-market trader histories that can expand AQRA's evidence base without mixing incompatible money, identity, or history semantics.

## Finding

AQRA's current benchmark remains Polymarket-only. The existing capture covers November 2025–October 2026 and contains 3,906 wallet histories, 3,647,433 fill rows, 1,025,654 daily P&L observations, 15 of 15 scheduled month-boundary block checks, 6,155 candidate wallet-month rows and 11 completed forward rounds.

The usable universe is wider than the current benchmark, but access falls into three classes: public wallet history (Polymarket; Opinion and Predict.fun behind API keys), account-owner-only history (Limitless, Kalshi, Gemini), and non-cash research history (Manifold). A market-data aggregator can broaden event and price coverage, but does not create wallet-level trader histories. Predict.fun is the strongest new on-chain cohort candidate: its API supports address-level fills, positions and activity, and an independent indexer decodes its BNB-chain trade, resolution and settlement events. Its indexed archive is currently recent-only, so it cannot yet match AQRA's year-long Polymarket lookback.

**Do not combine these raw rows into one credit score.** A larger sample with play-money outcomes, unrealized marks, incomplete account cash flows, or member-only records would not strengthen the current cash-lending evidence.

## Source inventory

| Venue | Trader-level data available | Access and completeness | Treatment in AQRA |
| --- | --- | --- | --- |
| Polymarket | Public wallet P&L series, positions, activity, trade records; Polygon source blocks on the current pipeline | Public wallet/account address; the address may be a proxy or deposit wallet; API data can be incomplete or delayed | **Current benchmark and borrower evidence source.** Keep cash-denominated P&L, open positions, fills and source timestamps distinct. |
| OPINION | Filled user trades by wallet; current positions and unrealized P&L; trades include quote-token and USD amount fields | Issued API key; wallet-address query; pagination and rate limits apply | **Priority real-money adapter.** Request API access; validate full pagination, fees, quote-token conversion, settled P&L and as-of reproducibility before scoring. |
| Predict.fun | Wallet-address fills (via `/v1/orders/matches`), positions and activity; smart-account trade, resolution and settlement events on BNB Chain | Mainnet API key; pages are capped at 150; account address may be a Predict smart account; third-party indexed BNB coverage begins 22 Oct 2026 and has no archive history yet | **Priority short-window real-money adapter.** Add API-key-backed capture and reconcile a sample to BNB logs; report the short observation window separately. |
| Limitless | Account positions, AMM/CLOB trades, historical portfolio events including fills, splits, merges and claims | Authenticated owner account; HMAC-signed API; its REST state is indexed and must be reconciled to chain | **Opt-in account adapter.** Requires borrower-controlled credentials or a safer delegated flow; never treat an indexer snapshot as final chain truth. |
| Kalshi | Public market data; member-specific orders, trades, portfolio and portfolio history | Signed member API key; account-specific records. Terms restrict use of other members' private data and certain benchmarking/redistribution | **No public trader census.** Consider borrower-authorized export or member-scoped access only after data-use permission and secure credential handling are resolved. |
| Gemini Predictions | Public event/market/volume data; account positions and order history are authenticated | API key/OAuth account access; public endpoints do not expose an anonymous trader leaderboard | **Opt-in account source.** Obtain account-owner authorization and verify prediction-market-specific history and settlement fields before ingestion. |
| Manifold | Public user/bet APIs, user portfolio history, markets and resolved outcomes | Public API; API is alpha and rate-limited. Free bulk market/trade dumps are non-commercial and were last updated 6 July 2024. M$ is not cash collateral | **Separate exploratory cohort only.** Do not train, calibrate or gate cash loans from M$ performance. Commercial use of bulk data requires licensing. |
| Prediction.com (aggregator) | Cross-venue event matching, prices, price history and market data across supported venues | API key; product is market-data centric, not a wallet-level trade/repayment history source | **Discovery only.** Use to find comparable markets and prices; never count it as another independent trader cohort. |
| Bitquery (indexer) | Decoded on-chain fills, market lifecycle and settlements for Polymarket on Polygon and Predict.fun on BNB | Provider API/plan; Predict.fun real-time coverage begins 22 Oct 2026 and has no archive dataset yet | **Reconciliation source.** Cross-check raw chain events and market settlement; avoid double-counting API/indexer copies of the same trade. |

## Comparability rules

Before adding any venue to the cash-lending evidence stream, an adapter must provide:

1. A stable account identifier and an explicit identity-link/consent record. A public address is not proof that two addresses belong to one person.
2. Trade-level timestamps, market/outcome identifiers, side, size, price, fee, fill/settlement state and raw source references.
3. A reproducible as-of cutoff. The adapter must exclude post-cutoff fills, mark updates, resolution data and identity links.
4. Realized cash P&L separated from unrealized P&L, deposits/withdrawals, rewards, rebates, transfers and open exposure. Do not label volume or market-value change as profit.
5. Quote-token currency and conversion source, decimals, fees, corrections, late fills and market-resolution semantics.
6. Source terms that authorize the research and the intended product use. Academic access must not silently become a commercial dataset license.
7. A venue-specific benchmark with time-based splits, deduplicated wallet identity, coverage checks and uncertainty clustered by trader. Do not pool venue rows until these tests pass.

The common candidate outputs are monthly active status, settled realized P&L, turnover, filled trade count, positive-month indicator, drawdown, missing-history flags, and source/coverage metadata. All original amounts and source values remain stored alongside normalized values. A venue-specific adapter must not infer unavailable opening equity or report account ROI from P&L alone.

## Recommended collection sequence

### 1. Preserve the Polymarket benchmark

Do not replace the current 3,906-history capture. Keep its manifest, schedule, source gaps, wallet-month overlap and month-boundary audits. The consistency policy's 70.0% positive next-month rate is 3.6 percentage points below the same-sample largest-monthly-P&L rank at 73.6%. Neither rate measures repayment.

### 2. Add Predict.fun and OPINION as separate walk-forward adapters

Predict.fun is the best next on-chain addition for a short-window replication. Its account API accepts any address for activity/positions and returns fills through a separate signer-address query, but mainnet calls need an API key. Its smart-account model means AQRA must record both the prediction-account address and the user-controlled signer proof. A chain-indexed source currently gives only recent BNB coverage; capture a baseline now and do not imply a year-long study. Reconcile filled trades, fees, resolved outcomes and redemptions before computing cash P&L. OPINION provides the other near-term candidate: wallet-level filled trades and positions behind an API key. Keep both cohorts separate from Polymarket and report source coverage before outcome rates.

Obtain the required API keys through the venue developer programs. Collect each wallet's first/last page, position response and chain references; independently reconcile a sample. Then build consented cohorts and publish row counts, source failures and fee/settlement coverage before performance results. Do not copy venue API keys into browser code or repository configuration.

### 3. Add member-consented account history

For Limitless and Kalshi, use account-owner initiated connection/export rather than harvesting other traders. Start with a file upload or a server-side, least-privilege session after the provider terms permit it. Strip account secrets immediately after ingestion, preserve evidence hashes and let borrowers revoke future sharing. Never request a Kalshi password or expose private API keys in the browser.

### 4. Use Manifold only for an external behavioral check

The public API and historical bets can test whether an explicitly defined selection feature generalizes to a play-money forecasting community. Report M$ units, user discovery bias, missing deposits/transfers and the separate sample window. Keep all such results out of AQRA credit eligibility, PD calibration and lender return claims. Get a commercial data license before any commercial product use.

### 5. Add opt-in Gemini account history and evaluate remaining on-chain candidates individually

Gemini Prediction positions are account-scoped and require authenticated access; ask for borrower initiated authorization and confirm that the API provides complete historical settled positions before adding it. For any other smart-account venue, identify canonical contracts, decode fills/claims/fees, reconstruct positions from chain events, and verify an account-to-owner consent path. Until a complete event replay is demonstrated, show a source as a research candidate rather than an AQRA integration.

### 6. Keep discovery data separate from trader records

Prediction.com can identify matched events and provide prices/candles across venues, and Bitquery can decode on-chain trades for supported networks. These can improve market mapping, timestamp checks and settlement reconciliation. Neither one is an additional venue nor proof of a trader's complete account P&L. Preserve each underlying venue/source ID and deduplicate by transaction/fill identifiers.

## Arkiv evidence for this checkout

Arkiv is still used by the lender book. `apps/web/src/lib/underwriting-packets.ts` reads and writes the `aqra.trader.credit.v2` Rabdi schema; `apps/web/src/components/trader-loans.tsx` queries candidate entities and reconciles each one against the EVM credit desk. Arkiv stores expiring discovery pointers. Swarm stores borrower-consented report bytes. Principal, bond, repayment and the report hash/reference commitment remain in the lending contract.

On 6 November 2026, the current checkout queried the public Rabdi endpoint through `readPackets(31337, 0x0000000000000000000000000000000000000001)`. The query succeeded and returned **zero entities**. The SDK warned that no access key is configured and that the public endpoint is heavily rate-limited. This is a live read check, not a borrower write or a verified loan flow.

This workspace has no `.env`, Bee URL, funded Swarm postage batch, Rabdi writer wallet/tGLM, public entity key, write transaction receipt, or second-wallet read proof. The UI now exposes Arkiv discovery status in Lend; new report-backed funding remains unavailable until Swarm is configured and the borrower publishes the consented report. Read [`../arkiv/swarm.md`](../arkiv/swarm.md) for exact setup and evidence requirements.

## Primary sources

- Polymarket [user P&L series](https://docs.polymarket.com/api-reference/wallet/get-a-users-pnl-series), [Data API index](https://docs.polymarket.com/llms.txt).
- OPINION [user trades](https://docs.opinion.trade/developer-guide/opinion-open-api/trade), [user positions](https://docs.opinion.trade/developer-guide/opinion-open-api/position), [API overview and key access](https://docs.opinion.trade/developer-guide/opinion-open-api/overview).
- Predict.fun [address activity](https://dev.predict.fun/api/account/get-account-activity-by-address), [wallet fill matches](https://dev.predict.fun/api/orders/get-order-match-events), [API overview, credentials and pagination](https://dev.predict.fun/api); [Bitquery prediction-market coverage](https://docs.bitquery.io/docs/examples/prediction-market/prediction-market-api/) and [Predict.fun coverage window](https://docs.bitquery.io/docs/examples/prediction-market/predict-fun-api/).
- Limitless [API Academy: positions, trades and portfolio history](https://academy.limitless.exchange/academies/api_academy/06_Positions.html).
- Kalshi [API keys and member authentication](https://docs.kalshi.com/getting_started/api_keys), [Developer Agreement](https://kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf), [Data Terms](https://kalshi-public-docs.s3.amazonaws.com/kalshi-data-terms-of-service.pdf).
- Gemini [Prediction Markets API](https://developer.gemini.com/prediction-markets-spec) and [authenticated position recovery](https://developer.gemini.com/rest-api/prediction-markets).
- Manifold [API documentation](https://docs.manifold.markets/api), [data access and licensing](https://docs.manifold.markets/data).
- Prediction.com [cross-market data API](https://prediction.com/api/docs).
