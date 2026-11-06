# AQRA trader credit

AQRA is a prediction-market performance-metrics-based lending protocol pilot. Activity, repeat profitability, realized P&L efficiency and drawdown determine whether a borrower meets the policy for a bonded loan request. The borrower previews and consents to a public report; Swarm stores the exact JSON and Arkiv makes its listing discoverable. The lender downloads that report, verifies the file hash and onchain commitment, and chooses whether to fund. The policy does not set pricing or predict repayment; trading history is not collateral.

## Run the pilot

Run `pnpm install --frozen-lockfile` and `pnpm dev` from the repository root. Open [AQRA](http://127.0.0.1:3000/).

- **Data** compares completed walk-forward rounds. The current expanded run has 11 completed rounds; 70.0% of consistency-screen wallet-months and 73.6% of largest-monthly-P&L wallet-months are positive next month. The simpler monthly-P&L comparator is 3.6 percentage points higher; neither result measures loan repayment. Change the month, filter the selection policy and select a wallet for dated evidence. Download the replay JSON from the panel.
- **Risk engine** exposes assumption-driven credit loss, dependence and reserve stresses. It does not infer PD from P&L and it keeps pooled lending rejected until real credit outcomes, validation and committed capital exist. See [`RISK_ENGINE.md`](RISK_ENGINE.md) for the full model.
- **Borrow** accepts one to four addresses or an ENS name. Check the latest closed month's history, review terms, verify the controllers, and sign the collateral allowance and request. The request appears in **Your request**. Cancel it before funding or repay by maturity.
- **Lend** reads recent onchain requests and accepts an exact request ID. Select **Discover on Arkiv** to load report-backed listings. Inspect the exact Swarm report; funding stays unavailable unless its SHA-256, Swarm reference, evidence digest, cutoff, score and wallet group match the contract. A distinct lender acknowledges the loss to fund. After maturity any connected account can settle an unpaid loan.

The local desk uses a curator-only forwarder and test collateral. It labels attestation receipts **Local forwarder**. Run `pnpm underwriting:demo --pending` to prepare a fresh local request using a sampled wallet. This script only creates a pending request; it does not impersonate consent, publish a report, fund or claim repayment. Finish the user-consented publication in the browser. Use `--controller <address>` only to exercise the local request setup for a supported Polygon proxy/controller pair. The script records the request event index and hashes in `work/underwriting/local-credit-demo.json`.

## Polymarket holdings and position-backed requests

The borrower can look up a Polymarket trading wallet or ENS name without signing. The desk shows up to 400 open positions from the v2 API and reads their token balances from the published Polygon ledgers at one finalized block. The public preview queries a fixed public wallet. The API reuses recent captures for one minute and can show a labeled snapshot up to 15 minutes old during an upstream error. The market marks and P&L are informational. Polygon positions are read-only. [Polymarket positions API](https://docs.polymarket.com/api-reference/wallet/list-positions-for-a-user-or-market) · [Polymarket position ledgers](https://docs.polymarket.com/resources/onchain-position-data)

If the positions feed is rate-limited and a recent capture is unavailable, AQRA checks the outcome IDs from up to ten recent activity records against both Polygon ledgers. This view shows confirmed balances for the discovered tokens. It omits mark prices, P&L and collateral eligibility. [Polymarket account activity](https://docs.polymarket.com/api-reference/feeds/list-account-activity)

The isolated `pnpm dev:positions` profile uses one approved binary Gnosis Conditional Tokens condition on local chain 31337. Its complete set contains one YES and one NO backed by one test USDC. For balances `Y` and `N`, the wallet can pledge up to `min(Y, N)` complete pairs. Unpaired inventory contributes zero backing. The contract locks equal amounts of the two derived token IDs together with the cash bond. It verifies the transfer and leaves the legacy Floor vault and existing cash-bond desk on their own deployment.

For locked pairs `Q`, bond `B`, principal `P` and fixed fee `F`, use the six-decimal integer units of the collateral asset:

| Quantity | Calculation |
| --- | --- |
| Backing | `V = B + Q` |
| Principal LTV | `P / V` |
| Debt LTV | `(P + F) / V` |
| Maximum total due | `floor(8,000 × V / 10,000)` |
| Minimum pairs for the requested terms | `max(0, ceil((P + F) × 10,000 / 8,000) − B)` |

The contract rejects any request whose principal plus fee exceeds the integer cap. The 20% buffer is a pilot policy. The underlying value comes from the complete set's merge into the original backing token. The existing performance threshold, bond minimum, principal and fee caps still apply. For $100 principal, $102 due and a $25 bond, exactly 102.5 pairs satisfy the cap. With 120 pairs the quote shows $145 backing, 68.96% principal LTV and 70.34% debt LTV. The UI truncates ratios to two decimals.

After cancellation or repayment the borrower claims the pairs back. For an unpaid matured loan, anyone can settle. The contract merges the pairs, checks that the exact backing is recovered, pays the lender up to the fixed amount due and transfers excess collateral to the borrower. For the 120-pair example, default pays the lender $102 and returns $43 in test USDC to the borrower.

The local reviewer can attest a labeled synthetic performance fixture for the funded test borrower. Borrower consent covers the exact report bytes, including the pledge and loan terms. Swarm stores the report and Arkiv indexes its pointer. The lender verifies the report, owner, digest and pledge against the lending contract. Follow [the storage guide](../arkiv/swarm.md#local-position-demo) to run this path.

## Replay evidence

Run `pnpm underwriting:benchmark` to collect and replay the expanded November 2025–October 2026 sample. It schedules 768 BTC/ETH Polymarket markets across 12 UTC months. Candidate discovery samples activity wallets and large-win wallets per month. The schedule and caps are fixed in the capture manifest before outcomes are ranked. Re-running the command reuses successful normalized source captures and retries failures.

The original July–October 2026 pilot remains reproducible with `pnpm underwriting:collect` and `pnpm underwriting:replay`. Both collector and replay accept `--first YYYY-MM --last YYYY-MM`; add `--benchmark` to use the expanded schedule and independent output directory. Raw normalized tapes, derived CSVs, source manifest, checksums and browser JSON are written under `work/underwriting`.

The replay discovers Polymarket wallets from scheduled BTC and ETH 15-minute sessions. It uses daily realized market P&L, turnover and trade counts through each cutoff. It audits each boundary's highest recorded source block on Polygon. The score uses realized efficiency, active profitable months and drawdown. A 10× hit measures a single settled buy with at least $5 of filled cost. Starting account equity is unavailable, so P&L is not ROI. [Polymarket P&L endpoint](https://docs.polymarket.com/api-reference/wallet/get-a-users-pnl-series)

Forward outcomes report realized next-month trader P&L, activity and cohort profitability. They do not claim loan repayment, lender returns or collateral. The contract demo advances $100 with $102 due and a $25 bond. It supports voluntary repayment and bond-only contractual recovery on default; it cannot collect future trading P&L. No historical repayment/default labels exist.

## ENS and wallet consent

The API resolves the Ethereum address and optional text record `com.aqra.wallets` at one finalized Ethereum block. Set the text value to a JSON array of one to four distinct EVM addresses. A missing record uses the resolved address. The interface requires the resolved primary account to sign a request using the name. [ENS resolution](https://docs.ens.domains/resolution/)

The desk verifies each controller's scoped consent. The digest binds the desk, chain, borrower, trader, evidence, ENS node, expiry and borrower nonce. The borrower signs through the request transaction. Other controllers sign the raw digest with `personal_sign` or supply a compatible ERC-1271 signature on the lending chain. A wallet can only back one active request.

Polymarket's legacy proxy and single-signature Safe routes support a controller that differs from the trader address. The workflow verifies the canonical Polygon exchange's derived address at a finalized block. For Safes it also checks current ownership and threshold. The desk reserves a claimed proxy when the report is accepted. Polygon deposit wallets and multi-signature Safes need an additional verifier. [Polymarket contract directory](https://docs.polymarket.com/resources/contracts)

## Chainlink CRE

The workflow source in `services/trader-cre/workflow` triggers on a finalized `TraderCreditRequested` log. It reads the terms and linked wallets from the request block, verifies Polygon controllers, fetches Polymarket P&L with node consensus, checks the source boundary blocks, and recomputes the policy and evidence digest. For an eligible, matching request it writes a report through the CRE forwarder. The receiver pins the sender, workflow ID and owner and checks the chain, desk, request, borrower, wallet set, cutoff, policy, score and expiry. A missing or rejected report leaves the bond cancellable. **No successful CRE CLI simulation or live CRE deployment is recorded yet.** [Chainlink EVM writes](https://docs.chain.link/cre/capabilities/evm-read-write)

Install the official CRE CLI and Bun, then sign in to CRE. Run this command from the repository root with the receipt and index from a pending local request. The local target uses loopback Anvil and public Polygon. A successful CLI simulation returns the encoded report for comparison with the local curator's input; this is the next CRE evidence gate. The Sepolia target signs and sends the report through CRE's configured EVM capability.

~~~text
cre workflow simulate ./services/trader-cre/workflow --project-root ./services/trader-cre --target local-simulation --non-interactive --trigger-index 0 --evm-tx-hash <request-transaction> --evm-event-index <receipt-event-index>
~~~

For Sepolia, provision a manifest with `pnpm deploy:sepolia` and approved testnet credentials. Set `FLOOR_CRE_FORWARDER` to the Sepolia forwarder for your tenant and `FLOOR_CRE_WORKFLOW_OWNER` to the CRE workflow owner. Run `pnpm underwriting:deploy --sepolia`. Build and hash the workflow using the generated Sepolia config. Set `FLOOR_CRE_WORKFLOW_ID` to the resulting ID with its `0x` prefix. Run `pnpm underwriting:deploy --sepolia --pin-workflow` with the same deployer to pin it once. Deploy and activate the exact workflow through CRE, configure the frontend and API with the Sepolia manifest, and verify a fresh request and report receipt. [Forwarder directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory) · [Workflow hash](https://docs.chain.link/cre/reference/cli/workflow#cre-workflow-hash) · [Deploy access](https://docs.chain.link/cre/guides/operations/deploy-access)

## Arkiv and Swarm

Configure `SWARM_BEE_URL`, `SWARM_POSTAGE_BATCH_ID`, optional `SWARM_BEE_API_TOKEN`, and `NEXT_PUBLIC_ARKIV_ACCESS_KEY` in `.env`. The API loads this file when launched by `pnpm dev` or `pnpm dev:api`. The borrower sees the exact wallet and metric preview, checks the public-disclosure consent, and signs a short-lived message. AQRA uses Bee to upload the canonical report and read it back. The borrower commits SHA-256 and the Swarm reference to the loan contract, then signs an expiring `aqra.trader.credit.v2` entity on Rabdi. The packet remains queryable 90 days after the funding deadline; `fundBy` remains the loan validity cutoff.

**Discover on Arkiv** filters on namespace, lending chain and desk, then reconciles owner, loan state, terms and the report reference/hash against the contract. **Inspect assessment evidence** retrieves the exact Swarm file and independently checks its hash and recomputed evidence. A missing listing, expired request, hash mismatch or unavailable report keeps the funding action disabled. The app does not yet extend entity retention or store settlement files. No public writer/reference/receipt is recorded in this checkout. See [`../arkiv/swarm.md`](../arkiv/swarm.md) and [`../arkiv/schema.md`](../arkiv/schema.md).

## Read API

| Route | Result |
| --- | --- |
| GET /api/v1/underwriting/evidence?wallet=… | Up to four repeated wallet parameters and an optional completed UTC month |
| GET /api/v1/underwriting/identity?name=… | Finalized ENS primary and wallet group |
| GET /api/v1/underwriting/controller?trader=…&controller=… | Finalized Polygon proxy/controller match |
| GET /api/v1/underwriting/local-report/:id | Unsigned input for the local curator on loopback Anvil |
| GET /api/v1/underwriting/storage-status | Whether Swarm settings are present; no server secret is returned |
| GET /api/v1/underwriting/assessment-challenge/:id | Loan-bound public-release preview, SHA-256 and short-lived consent message |
| POST /api/v1/underwriting/assessment-publication/:id | Verify borrower signature, upload to Swarm and check read-back |
| GET /api/v1/underwriting/assessment/:reference?sha256=… | Bounded Swarm retrieval and report/hash validation for lender review |
