# Arkiv strategy entity schema

## Trader credit underwriting packets

Schema `aqra.trader.credit.v1` uses Rabdi. It indexes the app discriminator, lending chain, desk, loan ID, score and funding deadline. The payload also commits to the as-of timestamp, evidence digest and wallet-set hash. The borrower signs a read-only entity using the same wallet that owns the request. Expiry is the funding cutoff rounded to a Rabdi block.

The lender board joins public packets to onchain requests. A packet is accepted only if its owner, score, cutoff and commitments match an attested, unfunded request on the active desk. The lending contract authorizes funding. The packet supplies discovery and provenance.

## Outcome strategy recipes

**Schema:** `aqra.floor.strategies.v1`  
**Network:** Rabdi testnet, chain ID `7794095`  
**Expiry:** 30 days from create. AQRA does not extend an entity's lifetime when it is loaded.  
**Evidence state:** application read/write path is implemented. A public entity key, transaction and writer wallet remain pending; do not claim a successful live write until those are recorded.

## Purpose

An entity stores a public recipe for selecting two AQRA outcome claims. It helps another user discover and reload a portfolio. It is not a financial position, oracle attestation, cryptographic proof, contract authorization, collateral receipt or market order. The composer must resolve current contract metadata and verify the pair on the selected AQRA chain before locking any claims.

## Fields

| Field | Type | Indexed | Meaning |
|---|---|---:|---|
| `app` | string | yes | Fixed application/schema discriminator `aqra.floor.strategies.v1` |
| `owner` | address | yes | Wallet address recorded by the submitting client; the entity's actual Arkiv `$owner` is the authoritative owner |
| `chainId` | uint64 | yes | AQRA EVM chain where the recipe was verified |
| `observationId` | uint64 | yes | AQRA shared observation referenced at publish time |
| `asset` | string | yes | Display identifier copied from AQRA metadata |
| `title` | string | no | User-provided name, trimmed to 3–48 characters |
| `lowerMarketId` | uint64 | no | AQRA lower-threshold market selected as the YES leg |
| `upperMarketId` | uint64 | no | AQRA upper-threshold market selected as the NO leg |
| `lowerUnits` | uint64 | no | Whole YES claim units in the recipe |
| `upperUnits` | uint64 | no | Whole NO claim units in the recipe |
| `lowerStrike` | string | no | Display/audit copy of the lower strike at publish time |
| `upperStrike` | string | no | Display/audit copy of the upper strike at publish time |
| `certifiedFloorMicros` | uint64 | no | Display copy of the verified lower bound in six-decimal USDC base units |
| `proofHash` | string | no | Hash of selected chain, observation, markets, quantities and AQRA registry/vault addresses; a recipe fingerprint, not a proof |
| `registry` | address | no | AQRA `SharedObservationRegistry` address at publish time |
| `vault` | address | no | AQRA `FloorVault` address at publish time |

The AQRA app queries by the indexed `app` field and reads at most 100 matching entities. It shows up to 30 locally filtered titles at a time. Owners can delete their own entity from the wallet currently connected to Rabdi. Any other reader can query public recipes.

## Ownership and privacy

Arkiv's `$owner` determines entity ownership and deletion rights. The input `owner` field is a duplicate query attribute and must equal the signing wallet on publish. All recipe contents are public. Users must not store private keys, personal data or confidential market strategy in these entities.

## Loading rules

AQRA enables **Load** only when the saved AQRA chain ID, registry and vault match the currently configured deployment. Loading changes composer inputs only. The loaded recipe must pass the current pair verifier and wallet-balance checks again before it can be locked or borrowed.
