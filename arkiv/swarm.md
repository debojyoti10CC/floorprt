# Swarm evidence storage

## What AQRA stores

Each public assessment is the canonical JSON representation of AQRA's dated wallet evidence: linked wallet addresses, decision month, cutoff, three monthly windows, recomputed score and evidence digest. The report contains no login credentials, email, private key or wallet signing secret. It is public data and is published only after the borrower reviews the exact preview and signs a loan-specific message.

Position-backed loans use `aqra.position-assessment/v1`. The report also binds the asset, locked token IDs, quantity, condition, principal, total due, bond, funding deadline and debt cap. The lender compares these terms with the pledge and request read directly from the lending chain.

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

## Local position demo

Start a funded [Arkiv dev node](https://github.com/Arkiv-Network/arkiv-op-reth/tree/v0.1.0-pure-6) using chain 1337 and its standard dev genesis. Set the RPC port to 8548 and allow the web origin `http://127.0.0.1:3002`. Start a local Bee node. The verified setup used [Bee v2.8.0](https://github.com/ethersphere/bee/releases/tag/v2.8.0) with `bee dev --api-addr 127.0.0.1:1633`. Create a test batch using `POST /stamps/1000000/20` on that dev node. Put these values in `.env.positions.local` at the AQRA root.

```dotenv
NEXT_PUBLIC_AQRA_LOCAL_ARKIV_URL=http://127.0.0.1:8548
SWARM_BEE_URL=http://127.0.0.1:1633
SWARM_POSTAGE_BATCH_ID=<usable Bee dev batch ID>
SWARM_DEV_MODE=true
```

Start `pnpm dev:positions` and open [the credit desk](http://127.0.0.1:3002/). Load the test borrower in **Borrow**, lock the shares, switch to the demo reviewer and approve the report. Switch back to the borrower, preview and consent to publication. **Lend** queries the entity from Arkiv and verifies the linked report from Bee before funding. The demo accounts only write to the configured loopback Arkiv chain. The dev Bee keeps its local storage for the node's lifetime.

With those services running, set `AQRA_E2E_POSITIONS=true` and run `pnpm exec playwright test e2e/position-credit.spec.ts`. The test requires the demo borrower to have 150 free pairs and no active request. It tests cap rejection, consent, publication, discovery after reload, funding and repayment. The [release record](../docs/RELEASE_EVIDENCE.md#position-credit-browser-run) contains the local receipts from a completed run.

## API and data path

- `GET /api/v1/underwriting/storage-status` — configuration state, without returning service secrets.
- `GET /api/v1/underwriting/assessment-challenge/:loanId` — returns the exact preview, SHA-256 and a short-lived message bound to chain, desk, loan, borrower, digest and expiry.
- `POST /api/v1/underwriting/assessment-publication/:loanId` — verifies the borrower signature, uploads through `@ethersphere/bee-js`, reads the reference back and verifies it.
- `GET /api/v1/underwriting/assessment/:reference?sha256=...` — downloads the public file as a bounded stream, verifies SHA-256 and report integrity, then returns it to the lender.

The upload uses a usable postage batch and local pinning. Network Bee uses direct upload. The loopback Bee dev profile uses deferred upload for local storage. AQRA verifies actual retrieval before exposing the reference as publishable and rechecks availability when a lender inspects it. [Swarm upload and download](https://docs.ethswarm.org/docs/develop/upload-and-download/) · [Swarm pinning](https://docs.ethswarm.org/docs/develop/tools-and-features/pinning/)

## Failure behavior

If Bee or postage is unavailable, the borrower cannot finish report publication and the contract will not fund that request because it has no committed report reference/hash. The borrower can cancel the request and recover the bond under the contract's cancellation rules. Once a loan is funded, repayment and default settlement remain contract calls and do not depend on Bee or Arkiv. A report retrieval failure blocks the lender UI funding action; the lender can retry after availability returns.

The Arkiv packet expires 90 days after the contract funding deadline. The contract remains authoritative after that expiry. AQRA does not yet run an entity-extension worker or publish Swarm settlement reports; no retention beyond the entity lifetime is promised.

## Where Arkiv appears in the application

Choose **Lender** in the credit-desk mode chooser or use the **Lend** sidebar item. **Arkiv reports & lending book** queries the configured Arkiv network on entry and displays the count of listings verified against the lending contract. **Discover on Arkiv** retries the query. **Find request** reads a specific onchain loan even when it has no Arkiv report. When Arkiv is unavailable, the panel reports the failure and continues to show onchain requests.
