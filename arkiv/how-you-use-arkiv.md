# How AQRA uses Arkiv

The composer offers four user-facing Arkiv actions: query public strategy recipes, search visible recipe titles, publish the currently verified pair from a Rabdi wallet, and load a recipe that belongs to the exact AQRA deployment. The entity expires after 30 days. Its owner can delete it from the same wallet. A loaded recipe is only draft input; AQRA rechecks it against current chain state before collateral can be locked.

The query selects the entity key, owner, expiry, strategy title, chain, observation, asset, both market IDs, both quantities, strikes, saved floor, recipe fingerprint, registry and vault. It filters by the indexed app discriminator. The UI shows the owner and expiry-capable record; the current list query is capped at 100 records and the component filters titles locally.

The `chainId`, `observationId`, `asset` and `owner` fields are indexed for future narrowing by deployment, market context and publisher. The first user-facing query currently filters only by `app`, then displays and searches the returned recipes. Do not claim that the current UI executes an observation-specific Arkiv query until that query is implemented.

The wallet signs entity creation and deletion. The optional Rabdi access key is used by the browser's public RPC client and must be restricted to the AQRA web origin. The wallet network is added with a keyless RPC URL so another app cannot reuse AQRA's access key from the wallet configuration.

## Reproducible public query

Connect to Rabdi (chain `7794095`) and run the query implemented in `apps/web/src/components/arkiv-strategies.tsx`: select recipe fields from `aqra.floor.strategies.v1`, filter `app == "aqra.floor.strategies.v1"`, apply a maximum page size of 100, and fetch. The access-key-protected RPC is `https://rpc.rabdi.db-chain.testnet.arkiv.network`.

**Public proof pending:** add the first entity key, writer wallet, create transaction hash and read-back evidence to README after a real Rabdi wallet write. Do not replace this note with a local Anvil address.
