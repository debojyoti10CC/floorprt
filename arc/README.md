# Arc Studio handoff

## Status

The published Arc Testnet integration exists. Arc Studio provenance is **not recorded**: no shareable Studio project URL, Studio build/test transcript or Studio-originated deployment receipt is available in this checkout. This directory does not certify eligibility.

1. Read [the complete Arc + CRE runbook](../docs/ARC_CHAINLINK.md) and confirm event/prior-work eligibility with the organizers.
2. Run `pnpm arc:studio:prepare` to create a key-free snapshot under `work/arc-studio-handoff`. It includes original contract sources, the offline Arc integration tests, Foundry settings and pinned contract dependencies/licenses; `source-manifest.json` fingerprints every copied file.
3. Sign in to [Arc Studio](https://studio.arc.io) and use [STUDIO_PROMPT.md](STUDIO_PROMPT.md). If the interface supports importing files, provide the handoff; otherwise ask Studio/sponsor how to bring the reviewed source into the project. No unsupported Studio API is assumed.
4. Build/test/deploy through Studio and connect the reviewed contracts to the app there. Record which code Studio authored/changed versus which code already existed. Users must approve their own testnet transactions.
5. Save the actual shareable Studio URL and build/test/deploy evidence in a human-reviewed submission record. Pin any new deployment's addresses, code hashes, relay/workflow and keeper bindings in a new deployment manifest before changing the app's active profile. A new deployment needs its own replay receipts; old addresses and receipts cannot be mixed.

## Constructor/deployment order

- Deploy the pinned Gnosis Conditional Tokens artifact (LGPL-3.0), then prepare a binary condition with two outcome slots. Keep its original provenance/license; these are issued Arc test shares, not Polygon custody.
- Deploy `ArcTestReportRelay(operator)` on chain 5042002. The operator is only a test report submitter, not a user custodian or production DON.
- Deploy `PositionCreditDesk(asset, relay, workflowOwner, workflowId, ledger, condition)` for complete-pair requests.
- Deploy `MarginCreditDesk(asset, relay, workflowOwner, workflowId, ledger, condition, referenceTokenId)` for directional escrow. For the test relay, `workflowOwner` must equal its operator and `workflowId` must be nonzero.
- Deploy `TraderCreditKeeper(marginDesk, 2)` for directional servicing. Verify its bound desk and both receivers' forwarder/workflow identity.

`asset` must be canonical six-decimal Arc test USDC. Deploy only after reviewing the exact parameters and approving wallet costs. The existing `scripts/deploy-arc.ts` is a Foundry-driven reference for constructor order, **not evidence of a Studio deployment**.

## Local/offline reproduction

```sh
pnpm install --frozen-lockfile
pnpm contracts:build
node scripts/foundry.mjs forge test --root packages/contracts --match-contract ArcIntegrationTest -vv
pnpm arc:verify
```

The first tests are offline. The final command reads public Arc receipts and historical balances without a key, spending or running CRE. It cannot establish Studio authorship, event timing, public DON execution or mainnet safety.
