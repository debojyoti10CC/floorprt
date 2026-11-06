# Why Arkiv

## Why the lending workflow uses Arkiv

AQRA's lender needs to discover open borrower requests across addresses without depending on a single AQRA-owned listing database. Arkiv provides wallet-owned public entities, indexed filters and chosen expiration. The user-visible result is a lender search that returns candidate requests and validates each candidate against the lending contract before showing it as fundable.

The file itself is stored on Swarm; Arkiv keeps the small, searchable summary and the report reference/hash. Loan principal, bond, debt, report issuer's attestation and immutable report commitment remain in the EVM contract. A report hash does not establish that the prediction-market history is truthful; it establishes which bytes the borrower published and which bytes the lender inspected.

If this data lived only in AQRA's database, lenders would need to trust AQRA to serve the same assessment later and independent clients could not query user-owned listings directly. AQRA keeps private keys, account credentials, session secrets, and any future private material off Arkiv. The assessment contains wallet addresses and trading metrics, so the borrower must see and sign the public release before upload.

AQRA uses Arkiv for public, wallet-owned, queryable portfolio recipes that expire. Without Arkiv, sharing a recipe would require a central database/API, a manually copied string, or a new persistent onchain contract for each recipe. Arkiv lets another user query the recipe by its indexed application and market context, see who owns it, and load it without giving that service custody of the user's strategy data.

AQRA intentionally keeps USDC balances, outcome claim balances, loans, collateral custody, resolution results and settlement records on the EVM contracts. Arkiv data is a discovery and convenience layer only. It does not authorize a lock, certify a payout floor or replace the onchain verifier. This keeps the data store aligned with user-visible sharing while leaving monetary state in the contracts.

Entities expire after 30 days and their owner can delete them sooner. Expiration is appropriate for recipes tied to a specific observation and deployment: an old recipe should not look like a permanently valid market instruction. If a user loads a recipe, AQRA checks that it came from the same deployed registry and vault, then re-reads market/observation state and runs the proof again.

**Evidence limit:** this rationale describes the implemented product path. A public Rabdi transaction and repeatable query are still required before claiming the integration has been exercised on testnet.
