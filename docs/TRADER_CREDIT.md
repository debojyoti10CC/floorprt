# AQRA trader credit

AQRA is a prediction-market performance-metrics-based lending protocol pilot. Activity, repeat profitability, realized P&L efficiency and drawdown determine whether a borrower meets the policy for a bonded loan request. The lender reloads the dated metrics, checks their digest against the authenticated report, and chooses whether to fund. The policy does not set pricing or predict repayment; trading history is not collateral.

## Run the pilot

Run `pnpm install --frozen-lockfile` and `pnpm dev` from the repository root. Open [AQRA](http://127.0.0.1:3000/).

- **Data** compares completed walk-forward rounds. The current expanded run has 11 completed rounds; 70.0% of consistency-screen wallet-months and 73.6% of largest-monthly-P&L wallet-months are positive next month. The simpler monthly-P&L comparator is 3.6 percentage points higher; neither result measures loan repayment. Change the month, filter the selection policy and select a wallet for dated evidence. Download the replay JSON from the panel.
- **Risk engine** exposes assumption-driven credit loss, dependence and reserve stresses. It does not infer PD from P&L and it keeps pooled lending rejected until real credit outcomes, validation and committed capital exist. See [`RISK_ENGINE.md`](RISK_ENGINE.md) for the full model.
- **Borrow** accepts one to four addresses or an ENS name. Check the latest closed month's history, review terms, verify the controllers, and sign the collateral allowance and request. The request appears in **Your request**. Cancel it before funding or repay by maturity.
- **Lend** reads recent onchain requests and accepts an exact request ID. An attested request shows its bond, total due, deadline, maximum principal loss and receipts. Connect a distinct lender and acknowledge the loss to fund. After maturity any connected account can settle an unpaid loan.

The local desk uses a curator-only forwarder and test collateral. It labels attestation receipts **Local forwarder**. Run `pnpm underwriting:demo` to exercise the contract with a wallet that passes the current performance screen. The script uses explicitly labeled localhost impersonation, fetches real history and checks confirmed balances. Run `pnpm underwriting:demo --pending` to prepare a fresh request for the local curator or CRE simulation. Use `--controller <address>` to verify a supported Polygon proxy/controller pair and impersonate the controller on Anvil. The script records the request event index and hashes in `work/underwriting/local-credit-demo.json`.

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

## Arkiv packets

An attested borrower can publish a read-only underwriting packet from the same injected wallet on Rabdi. It stores the request ID, chain, desk, score, funding cutoff, as-of timestamp, wallet-set hash and evidence digest. It expires at the cutoff, rounded to a Rabdi block. **Discover on Arkiv** finds packets for the active desk and checks the entity owner and every claim against the onchain request. A stale, funded, expired, or cancelled request drops out on refresh. The public query uses the rate-limited endpoint. Publishing requires tGLM in the borrower's wallet. [Rabdi network](https://docs.arkiv.network/networks/rabdi/)

## Read API

| Route | Result |
| --- | --- |
| GET /api/v1/underwriting/evidence?wallet=… | Up to four repeated wallet parameters and an optional completed UTC month |
| GET /api/v1/underwriting/identity?name=… | Finalized ENS primary and wallet group |
| GET /api/v1/underwriting/controller?trader=…&controller=… | Finalized Polygon proxy/controller match |
| GET /api/v1/underwriting/local-report/:id | Unsigned input for the local curator on loopback Anvil |
