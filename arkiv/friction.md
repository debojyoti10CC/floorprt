# Arkiv builder feedback

## Credit listing and cross-network workflow

The new credit path has three separate actions across two networks: borrower-signed Swarm upload consent, a lending-chain report commitment, and a Rabdi-owned Arkiv entity. This avoids pretending there is an atomic transaction across Bee, the lending EVM and Arkiv. If a later step fails, the report remains content-addressed and the UI can retry the remaining step in the current session. The repository has no live Rabdi wallet or Bee configuration, so we have not yet observed a production/testnet transaction failure or measured query latency; this is an implementation constraint, not a claim that Arkiv failed.

The most useful improvement for builders would be an SDK example that demonstrates a multi-step publish with durable client-side recovery: persist an upload reference, verify it, publish an entity idempotently, and query the result from a second wallet. A first-party helper for replacing or extending an entity while preserving its owner and expiry would also reduce app-specific state handling. We will replace this feedback with concrete transaction/query evidence after running the configured flow.

During integration review, the Rabdi SDK's chain object carried the access key in its RPC URL. Passing that URL to `wallet_addEthereumChain` would save the app's RPC key in the user's wallet network settings, where unrelated apps could reuse it. AQRA now adds Rabdi with the keyless RPC URL while keeping the restricted key in its own browser-side public client. The connect action also explicitly switches after adding the network, rather than assuming `wallet_addEthereumChain` changed the active chain.

**Reproduction:** configure `NEXT_PUBLIC_ARKIV_ACCESS_KEY`, connect the strategy library while the browser wallet is on another chain, and inspect the wallet's Rabdi network details. The saved RPC URL should not contain the app access key; the app's own public query should still use its configured key.

This was found by comparing AQRA's wallet flow with the official [Arkiv access-key guide](https://docs.arkiv.network/start-here/access-keys/). It is implementation feedback from a code review, not a claim that a successful Rabdi entity transaction has been completed. The app still needs live-wallet and tGLM testing to surface network-specific issues.
