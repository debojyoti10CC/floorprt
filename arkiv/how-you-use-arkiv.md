# How AQRA uses Arkiv

## Borrower evidence and lender discovery

Borrower flow: after the report workflow attests an open request, AQRA shows the exact fields that will be public. The borrower checks the disclosure and signs a short-lived, loan-specific message. The server uploads that evidence JSON to a configured Bee node, downloads it again, and checks its SHA-256 and internal evidence digest. The borrower commits the report hash and Swarm reference to the loan contract, then publishes `aqra.trader.credit.v2` from their Rabdi browser wallet.

Lender flow: **Discover on Arkiv** queries the indexed namespace, chain and desk. AQRA reads each candidate's loan state and report commitment from the lending chain. Only matching open, unexpired requests are shown as fundable. **Inspect assessment evidence** fetches the listed Swarm file through the AQRA API; the server and browser check the SHA-256, AQRA recomputes the report decision and digest, and the component compares the wallet group, score, cutoff, report hash and Swarm reference to the lender-chain commitment. Funding is disabled until those checks pass.

The API never sends a Bee node URL, postage batch or token to the browser. The Arkiv access key is public and should be origin-restricted. Each packet is borrower-owned and read-only. `fundBy` controls origination validity; the Arkiv entity is set to expire 90 days later. Repayment and default settlement use the loan contract and do not call Arkiv or Swarm.

Publication needs `SWARM_BEE_URL`, a usable `SWARM_POSTAGE_BATCH_ID` and a funded Rabdi borrower wallet. `NEXT_PUBLIC_ARKIV_ACCESS_KEY` is optional but recommended to avoid public-RPC limits. Reading an existing report needs only a Bee endpoint, not postage. No public entity receipt is recorded in this repository yet.

The shared SDK query is in `apps/web/src/lib/credit-packet-schema.ts`; both the lender UI and `pnpm storage:verify` use it. The command scopes the query by namespace, lending chain, desk and loan ID and independently joins the result to chain state and Swarm bytes. **Download storage proof** exports the lender's verified read observation, including the chain block/hash and report reference/hash. See [the reproducible runbook](submission.md#independent-reproducible-query-and-read). These artifacts do not replace an actual Rabdi create transaction or second-wallet browser demonstration.

## Outcome strategy recipes

The composer offers four user-facing Arkiv actions: query public strategy recipes, search visible recipe titles, publish the currently verified pair from a Rabdi wallet, and load a recipe that belongs to the exact AQRA deployment. The entity expires after 30 days. Its owner can delete it from the same wallet. A loaded recipe is only draft input; AQRA rechecks it against current chain state before collateral can be locked.

The query selects the entity key, owner, expiry, strategy title, chain, observation, asset, both market IDs, both quantities, strikes, saved floor, recipe fingerprint, registry and vault. It filters by the indexed app discriminator. The UI shows the owner and expiry-capable record; the current list query is capped at 100 records and the component filters titles locally.

The `chainId`, `observationId`, `asset` and `owner` fields are indexed for future narrowing by deployment, market context and publisher. The first user-facing query currently filters only by `app`, then displays and searches the returned recipes. Do not claim that the current UI executes an observation-specific Arkiv query until that query is implemented.

The wallet signs entity creation and deletion. The optional Rabdi access key is used by the browser's public RPC client and must be restricted to the AQRA web origin. The wallet network is added with a keyless RPC URL so another app cannot reuse AQRA's access key from the wallet configuration.

## Reproducible public query

Connect to Rabdi (chain `7794095`) and run the query implemented in `apps/web/src/components/arkiv-strategies.tsx`: select recipe fields from `aqra.floor.strategies.v1`, filter `app == "aqra.floor.strategies.v1"`, apply a maximum page size of 100, and fetch. The access-key-protected RPC is `https://rpc.rabdi.db-chain.testnet.arkiv.network`.

**Public proof pending:** add the first entity key, writer wallet, create transaction hash and read-back evidence to README after a real Rabdi wallet write. Do not replace this note with a local Anvil address.
