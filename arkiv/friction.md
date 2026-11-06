# Arkiv builder feedback

During integration review, the Rabdi SDK's chain object carried the access key in its RPC URL. Passing that URL to `wallet_addEthereumChain` would save the app's RPC key in the user's wallet network settings, where unrelated apps could reuse it. AQRA now adds Rabdi with the keyless RPC URL while keeping the restricted key in its own browser-side public client. The connect action also explicitly switches after adding the network, rather than assuming `wallet_addEthereumChain` changed the active chain.

**Reproduction:** configure `NEXT_PUBLIC_ARKIV_ACCESS_KEY`, connect the strategy library while the browser wallet is on another chain, and inspect the wallet's Rabdi network details. The saved RPC URL should not contain the app access key; the app's own public query should still use its configured key.

This was found by comparing AQRA's wallet flow with the official [Arkiv access-key guide](https://docs.arkiv.network/start-here/access-keys/). It is implementation feedback from a code review, not a claim that a successful Rabdi entity transaction has been completed. The app still needs live-wallet and tGLM testing to surface network-specific issues.
