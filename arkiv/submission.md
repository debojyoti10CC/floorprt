# Arkiv + Swarm submission runbook

## Track and timing — human verification required

This is an existing project. Enter **Build on Arkiv (existing projects)** plus **Arkiv + Swarm (existing projects)** only after ETHGlobal confirms Continuity acceptance. Do not submit it as from scratch or as a public-data mirror.

The checkout baseline for this completion work was `2a94889a11c72dbbdfe32e7a90e1f859a258b5f4`. Basic consent, Swarm upload/read-back, report commitments and Arkiv discovery already existed. This change adds shared query/validation code, a read-only verifier, proof export, read-without-postage support and negative tests. That baseline is not necessarily the event kickoff commit. Record the actual event start/end, kickoff revision and event-new commits before submitting; code existing before kickoff is not eligible new work.

## Public proof checklist

| Required evidence | Current status / value to record |
| --- | --- |
| Continuity acceptance | **Pending team confirmation** |
| Event-new commit range | **Pending event timing review** |
| Public repository and open-source license | Root MIT license exists; confirm repository visibility |
| Rabdi writer address(es) | **Pending actual borrower publication** |
| Rabdi create transaction and explorer link | **Pending** |
| Rabdi entity key | **Pending** |
| Swarm reference and openable file URL | **Pending network-backed upload** |
| Exact SHA-256 and file size | Record from successful upload and verifier |
| Postage batch ID | **Pending**; disclose only the batch ID, never service credentials |
| Batch buyer wallet or provider | **Pending** |
| Bee node/service used | **Pending**; publish a safe service description, not bearer credentials |
| Second-wallet Arkiv discovery and Swarm verification | **Pending public run** |
| Demo video Swarm timestamp | **Pending**, e.g. `01:20–01:45` only after recording |

Recorded local-node receipts in `docs/RELEASE_EVIDENCE.md` are not Rabdi or publicly retrievable Swarm proof. Never substitute those values into this table as public evidence.

## Publish and inspect

1. `pnpm install --frozen-lockfile`. Copy `.env.example` to `.env` and configure a network-backed Bee endpoint, usable postage batch and optionally an origin-restricted Rabdi key. Leave `NEXT_PUBLIC_AQRA_LOCAL_ARKIV_URL` empty for Rabdi. Keep Bee credentials server-only.
2. Start `pnpm dev` and open `/underwriting/`. For local lending-chain transactions, use the injected borrower wallet on Anvil, not the named demo-account mode; only the injected wallet can publish to Rabdi. Import only disposable test identities and never fund a public Anvil mnemonic address with real value.
3. Borrow: create an eligible request, obtain the appropriate report attestation, preview the exact public JSON, accept the disclosure and sign consent. The local forwarder and synthetic fixtures must stay labeled. A historical public wallet is not a consenting borrower; do not impersonate one to claim a public release.
4. The API uploads canonical JSON through Bee and verifies read-back. The borrower signs the lending-chain commitment and then the Rabdi entity transaction. Approve the wallet network switch and ensure the borrower has Rabdi tGLM. The wallet returns to the lending network afterward.
5. Copy the create transaction, writer address, entity key, reference and SHA-256. Fill the checklist above with real receipts. Record the funding deadline; verify the request before it expires or is funded.
6. Connect a separate lender wallet, reload, open Lend and discover the request through Arkiv. Inspect the Swarm assessment. Download the storage proof. Capture the two wallets and query result in the video. Funding remains a separate wallet-signed lending-chain action.

## Independent reproducible query and read

No wallet or postage batch is required to read. Set `SWARM_BEE_URL` to a reachable Bee node that can retrieve the uploaded network file, then run:

```sh
pnpm storage:verify \
  --deployment apps/web/public/deployment.json \
  --loan <loan-id> \
  --entity <Rabdi-entity-key> \
  --output evidence/storage-public-proof.json
```

Use the actual lending deployment manifest. `FLOOR_RPC_URL`, if set, must refer to that same lending chain. This command **always queries Rabdi 7794095**, never the local Arkiv node. It sends no transactions. It requires an open attested loan and fails closed on any mismatch or unavailable service. It writes a new file only after checking chain/code identity, packet ownership, report commitment, SHA-256, recomputed evidence, wallet group and any position disclosure. Run it before funding; after funding the packet deliberately no longer matches an open request. Keep the resulting point-in-time artifact.

The same query lives in `apps/web/src/lib/credit-packet-schema.ts`:

```text
namespace: aqra.trader.credit.v2
filters: app == namespace AND lendingChain == <chain-id> AND desk == <desk-address> AND loanId == <id>
projection: entity key/owner, loan ID, score, fundBy, asOf, evidence, group,
            reportRef, reportHash, optional pledge/principal/maxDue
limit: 10 for a specific loan (60 for the lender board)
```

The CLI is an independent read path, not proof of a second user's wallet interaction. Preserve the browser evidence separately. A private/local lending RPC prevents remote judges from reproducing the full join; provide a reachable testnet deployment or explicitly label that limitation.

## Privacy, retention and availability

Public reports reveal wallet groups and performance metrics. Require explicit release consent. Only unencrypted 32-byte Swarm references enter public entities; encrypted references contain keys and are rejected. Entity expiry is funding deadline plus 90 days; expiration/deletion does not recall public copies or remove a Swarm file. A pinned Bee upload is not a perpetual availability guarantee. The SHA-256 proves byte identity, not source accuracy, legal data-republication rights or credit safety.

## AI disclosure

This completion change used an AI coding assistant for code inspection, implementation, tests and documentation. Human maintainers must review its output, confirm event timing/eligibility and complete the public-wallet demonstration. Include the team's full AI-use disclosure in the event submission; this statement does not attest to the provenance of every earlier commit.
