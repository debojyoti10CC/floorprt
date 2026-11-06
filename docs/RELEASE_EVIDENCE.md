# AQRA release evidence — 6 November 2026

## Position credit browser run

Chromium completed request #2 at desk `0x322813fd9a801c5507c9de605d63cea4f2ce6c44` on the isolated local lending chain. The borrower pledged 120 complete Conditional Tokens pairs plus 25 test USDC against 102 test USDC due. After Arkiv publication, the test reloaded the app, discovered the entity again and verified the report from Bee before funding. After repayment and release, the wallet held 150 YES and 150 NO shares. The desk held zero of both.

| Step | Local receipt or reference |
|---|---|
| Request and lock | `0xcec7de1acf972e54ee7c36d94a7ecf7ec6988f8664566d367b8b48f98ed592f3` |
| Local score attestation | `0x61fe51a46b619e9f46ea00bf1716829fd52f7842727b309cbb2748c2e8405710` |
| Onchain report commitment | `0x233b4edd3aee4622983cd098c0473b7584d3d4607e3c4fa905cf4538713f62a7` |
| Arkiv transaction | `0xbb0ac8c128f36b9efcd6b39bd56f425dfc654872192288c4fed30f03e55e9a18` |
| Arkiv entity | `0x913b58c4c42b1d8536044365657eace55a4a944690a1a38aeb4f2ac34fbd12f5` |
| Swarm file (1,681 bytes) | `d2fdaa4063216580badbbfaa0c0b1f5dfaae3f373427a8c9e7cd380f4ec1b6a0` |
| File SHA-256 | `91287a6a3c8c728a4e108221e106e0a8fb299ebf256330b9fa2b1c34b0fe7814` |
| Funding | `0x56bbeb220595382cb5049215e41e3d6d552f31810e3abb491bd0e04d5d37c96e` |
| Repayment | `0x347d4550dbb8889960c4504e35886bcc26f47be284a316b78670494975468256` |
| Collateral release | `0x4255ec6af7833da49e08abff97198c285a49dca7e0e31d020ce640945a9fd096` |

The lending chain, Bee v2.8.0 and Arkiv v0.1.0-pure-6 ran locally. The score used the disclosed performance fixture. The separate public Polymarket check read 176 open rows and found a nonzero Polygon balance for all 176 at a finalized block.

## Release result

The recorded full verification passed on commit `a63d033e096b319f30cb33bab109130cb08afe52` at 2026-11-05 22:20 UTC. Its command outputs are in `evidence/verification.json` and `evidence/logs/`. This is historical evidence for that committed snapshot; it does **not** cover later working-tree changes. The current source must pass fresh checks before claiming the same release gate.

## Verification

| Gate | Result |
|---|---|
| Source and ABI consistency | PASS; source conflict/secret checks and eight generated contract ABIs |
| TypeScript | PASS; API, shared packages, proof engine and web app |
| Unit tests | PASS; 19 tests across five files, including API deployment reload and journal isolation |
| Solidity | PASS; 75 offline tests, 512-run fuzz cases and three stateful invariants at 128 runs × 48 calls |
| Independent payoff model | PASS; 10,000 Python/TypeScript vectors and 100 Solidity/TypeScript comparisons |
| Local chain preflight | PASS; Anvil 31337, seven contract code hashes and six-decimal collateral |
| Browser workflows | PASS; 12 Chromium cases covering offline read-only, payoff controls, drag/keyboard, five borrower/lender scenarios, expired-pair recovery, mobile and focus/contrast |
| Settlement replay | PASS; six real local-EVM outcomes and two fresh collateral positions |
| Production build | PASS; Next static build and `dist/` packaging |
| Dependency audit | PASS; zero known advisories in the captured audit |
| Sepolia read-only check | PASS at block 12072398; canonical Circle USDC and Chainlink ETH/USD proxy, zero transactions |
| Sepolia fork mechanism | PASS at pinned block 12071482; full collateral and settlement waterfall, local-only test balances, zero public transactions |

Foundry skips the fork test during the offline Solidity suite; the separate `pnpm test:fork` gate runs and passes it. The local faucet, test resolver and clock controls exist only on loopback Anvil. The UI's recorded snapshot is provenance-labeled and cannot authorize writes.

## Monetary behavior

The browser suite uses distinct borrower, lender and resolver identities. It verifies exact wallet balances after funding, full repayment and settlement for below, inside, above and common-cancellation outcomes. Replay receipts, block numbers and exact base-unit payouts are saved in `evidence/browser-results.json` and `evidence/demo-receipts.json`.

At a one-USDC certified floor, the demo principal is 0.75 USDC and the fixed lender due is 0.78 USDC. The lender receives 0.78; the borrower receives the remaining 1.22 for an inside payoff or 0.22 for the other demonstrated cases. These are local test-USDC transfers, not real-value claims.

## Visual and interaction evidence

`evidence/screenshots/overview.png`, `studio.png`, `mobile-studio.png` and the settlement captures show the restored AQRA terminal. It uses the approved black/charcoal surfaces, Poppins, raised/inset depth and rounded controls. Both Poppins and JetBrains Mono are self-hosted with their original SIL Open Font License notices. Browser checks verify text and non-text contrast thresholds, visible keyboard focus, wallet-dialog focus/escape behavior, reduced motion and chart keyboard controls. These focused checks are not an independent accessibility certification.

## Boundaries

No public Sepolia deployment or public transaction was performed because no funded deployer signer was configured. The public read and fork tests are separate evidence; neither is a deployment receipt. The Chainlink adapter binds each observation to the proxy phase captured at deployment. After a feed phase upgrade, unresolved observations from the old instance fail closed and can reach their committed longstop cancellation; new observations require a new deployment.

The project has not received an independent security audit. Mainnet use, live Chainlink CRE/DON writes, signed RFQs, tranche issuance, external CTF custody and generalized multi-leg collateral are not implemented or claimed. See `FEATURES_AND_LIMITATIONS.md` and `EXTERNAL_DEPLOYMENT.md` for details.
