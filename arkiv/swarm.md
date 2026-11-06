# Swarm evidence storage

## What AQRA stores

Each public assessment is the canonical JSON representation of AQRA's dated wallet evidence: linked wallet addresses, decision month, cutoff, three monthly windows, recomputed score and evidence digest. The report contains no login credentials, email, private key or wallet signing secret. It is public data and is published only after the borrower reviews the exact preview and signs a loan-specific message.

Arkiv stores the Swarm reference and SHA-256. The borrower also commits both values to the lending contract after upload/read-back verification. The lender fetches those exact bytes and verifies:

1. The byte-level SHA-256 matches the Arkiv entity and contract commitment.
2. The report schema, monthly windows, score and canonical evidence digest recompute.
3. The report wallet set, score, cutoff and evidence digest match the loan.
4. The Swarm reference matches the contract commitment.

The hash proves which bytes were reviewed; it does not prove that the data source or scoring policy is correct.

## Configuration

Copy `.env.example` to `.env`, then configure the API process with:

```dotenv
SWARM_BEE_URL=http://127.0.0.1:1633
SWARM_POSTAGE_BATCH_ID=<funded postage batch ID>
SWARM_BEE_API_TOKEN=<optional reverse-proxy bearer token>
NEXT_PUBLIC_ARKIV_ACCESS_KEY=<origin-restricted Rabdi access key>
```

The Bee URL, postage batch and optional API token are server-only. Do not prefix them with `NEXT_PUBLIC_`. Restart `pnpm dev` or the API after changing the file. The web app reports Swarm unconfigured if the URL or batch ID is missing. A configured value is not a live availability guarantee; upload and retrieval report actual errors.

The borrower needs a wallet that can sign the release and publish the Arkiv entity on Rabdi. The app uses Arkiv's SDK-provided Rabdi chain and a keyless RPC URL in the wallet configuration; its access key is used only by AQRA's own public query client.

## API and data path

- `GET /api/v1/underwriting/storage-status` — configuration state, without returning service secrets.
- `GET /api/v1/underwriting/assessment-challenge/:loanId` — returns the exact preview, SHA-256 and a short-lived message bound to chain, desk, loan, borrower, digest and expiry.
- `POST /api/v1/underwriting/assessment-publication/:loanId` — verifies the borrower signature, uploads through `@ethersphere/bee-js`, reads the reference back and verifies it.
- `GET /api/v1/underwriting/assessment/:reference?sha256=...` — downloads the public file as a bounded stream, verifies SHA-256 and report integrity, then returns it to the lender.

The upload uses a usable postage batch, `deferred: false` and local pinning. Bee requires postage for upload and returns a content reference. Pinning supports local recovery; it is not a promise of permanent network availability. AQRA verifies actual retrieval before exposing the reference as publishable and rechecks availability when a lender inspects it. See the official [Swarm upload/download documentation](https://docs.ethswarm.org/docs/develop/upload-and-download/) and [pinning documentation](https://docs.ethswarm.org/docs/develop/tools-and-features/pinning/).

## Failure behavior

If Bee or postage is unavailable, the borrower cannot finish report publication and the contract will not fund that request because it has no committed report reference/hash. The borrower can cancel the request and recover the bond under the contract's cancellation rules. Once a loan is funded, repayment and default settlement remain contract calls and do not depend on Bee or Arkiv. A report retrieval failure blocks the lender UI funding action; the lender can retry after availability returns.

The Arkiv packet expires 90 days after the contract funding deadline. The contract remains authoritative after that expiry. AQRA does not yet run an entity-extension worker or publish Swarm settlement reports; no retention beyond the entity lifetime is promised.

## Where Arkiv appears in the application

Choose **Lender** in the credit-desk mode chooser or use the **Lend** sidebar item. The Lend panel is titled **Arkiv reports & lending book**. On entry it queries Rabdi and displays query status, the number of report-backed listings verified against the lending contract, whether a Rabdi query key is configured, whether Swarm is configured, and a link to the Arkiv explorer. **Discover on Arkiv** retries the listing query; **Find request** can look up an onchain loan ID even when it has no Arkiv report.

An empty result is shown as zero verified listings; it does not create sample requests. If the public endpoint is unavailable, the panel reports the query failure and continues to show requests read from the lending chain. In the current checkout the public read returned zero entities, the Rabdi key is unset, and Swarm is unconfigured. No test listing or mocked Arkiv receipt is displayed as live data.

## Reproducible live proof

No Bee URL, postage batch, Rabdi writer, entity key, transaction receipt or Swarm reference is configured in this repository checkout. Therefore there is no honest live entity/reference pair to list yet. After a borrower completes the flow, append the writer address, Arkiv entity key and transaction hash, Swarm reference, SHA-256, Bee node/provenance and a second-wallet query result here and in `README.md`. Do not substitute local test accounts or fabricated references for a public testnet receipt.
