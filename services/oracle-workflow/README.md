# Oracle workflow boundary

`validate-report.ts` is an executable, tested report-preparation module. It checks exact asset/source identity, decimal precision, observation maturity, a bounded source-time window, freshness, nonnegative canonical price and nonterminal state. It produces `finalize` calldata without signing it.

**This is not a deployed Chainlink CRE workflow, a DON-attested report, or a successful CRE CLI simulation.** The delivered application uses the immutable trusted test resolver stated in its deployment manifest. Registry cancellation is permissionless only at the common longstop.

To add CRE, deploy a new registry whose resolver is a properly authenticated CRE consumer, use the current official SDK and a real historical scalar feed, read the registry before writing, verify forwarder/workflow identity in the consumer, and record a successful CLI simulation or deployed execution. A sourceId string alone does not authenticate an HTTP response. Existing registries do not have a hidden resolver-upgrade switch.

Primary documentation checked for this build:

- https://docs.chain.link/cre/overview
- https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts
- https://docs.chain.link/cre/getting-started/part-2-fetching-data
- https://docs.chain.link/cre/getting-started/part-4-writing-onchain

Never relabel this validator's unit tests or the app's Anvil resolver transactions as a CRE sponsor artifact.
