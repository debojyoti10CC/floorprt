# Arkiv strategy entity schema

## Current borrower and lender flow: `aqra.trader.credit.v2`

AQRA uses one wallet-owned, expiring credit packet to make an open loan request discoverable and point to the exact public assessment file. The packet is not an oracle attestation. The lender compares it with the current lending contract, then retrieves and verifies the Swarm report before funding.

| Field | Arkiv type | Indexed | Meaning |
|---|---|---:|---|
| `app` | string | yes | Fixed namespace `aqra.trader.credit.v2` |
| `lendingChain` | uint64 | yes | EVM chain containing the loan |
| `desk` | address | yes | AQRA trader-credit contract |
| `loanId` | uint64 | yes | Request ID on that desk |
| `score` | uint64 | yes | Score already attested by the configured report workflow |
| `fundBy` | uint64 | yes | Contract funding deadline; the assessment cannot originate a loan after it |
| `asOf` | uint64 | no | Evidence cutoff committed by the loan |
| `evidence` | string | no | Canonical evidence digest committed by the loan |
| `group` | string | no | Sorted trader-wallet set hash committed by the loan |
| `reportRef` | string | no | 64-character Swarm file reference |
| `reportHash` | string | no | SHA-256 of the exact UTF-8 report bytes stored in Swarm |

The actual Arkiv `$owner` must equal the borrower in `getLoan(loanId)`. The lender query filters indexed `app`, `lendingChain` and `desk`; the selected request is then checked against `loanId`, owner, contract state, score, funding deadline, cutoff, evidence digest, wallet-set hash and the contract's `assessmentHashOf` / `assessmentReferenceOf` values. `apps/web/src/lib/underwriting-packets.ts` defines and queries the schema.

Assessment validity and record retention are separate: `fundBy` is the validity deadline for originating this loan; the Arkiv packet expires 90 days after `fundBy` to leave a review period. Contract loan state remains authoritative after packet expiry. The application does not currently extend Arkiv entities or publish settlement events.

The borrower creates a read-only entity from their browser wallet after reviewing the report and signing the AQRA release message. Old `aqra.trader.credit.v1` packets lack a Swarm pointer and are not eligible for the new funding review flow. The earlier `aqra.floor.strategies.v1` recipe schema below remains a separate composer feature.

## Current report commitment

After Swarm upload and read-back verification, the borrower calls `commitAssessment(loanId, reportHash, swarmReference)` on the lending contract. The contract binds those two bytes32 values immutably and refuses funding until they exist. This binds the report location and bytes to the loan; the lender still verifies the content and does not treat a hash as proof that the source data is true.

## Live evidence status

The repository contains the SDK write and query path. This checkout has no configured Bee URL, postage batch, Rabdi writer wallet, or transaction receipt. Do not claim a live Arkiv entity/Swarm pair until a borrower has completed the flow and the receipt is recorded in the project README.

## Legacy trader credit packet v1 (pre-Swarm)

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
