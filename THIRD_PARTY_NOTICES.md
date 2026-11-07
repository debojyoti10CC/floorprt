# Sources, dependencies and provenance

Floor's protocol, application code, CSS, SVG mark and proof engine were independently authored for this project. No Senthos or Cumulant source files, designs or assets were transplanted. Their full research clones remain outside this deliverable, under the task's work/references directory.

## Architectural research

- Cumulant: https://github.com/notveiker/EG-Arc-Cumulant at `ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1`. Its product Solidity files have MIT SPDX notices; no root license was found. Used for contract/module boundaries and security categories, not fixed-claim payout code.
- Senthos / Traxis: https://github.com/LuKresXD/SCBC-Hackathon-2026 at `11f56862faf8c3c95c50d71cb75ec54c3ac243c3`, with eight public branches inspected. No root license was found. Used for product/workflow context and lessons from its sandbox/undeployed lending model.
- See `docs/REFERENCE_RESEARCH.md` for pinned file links, exact distinctions and independently checked findings.

## Direct dependencies

- OpenZeppelin Contracts 5.6.1 — MIT; imported ERC-20/ERC-1155, ownership, safe transfers and reentrancy primitives. https://github.com/OpenZeppelin/openzeppelin-contracts
- Foundry 1.7.1 — MIT OR Apache-2.0; pinned npm native binaries. https://github.com/foundry-rs/foundry
- forge-std — MIT / Apache-2.0; vendored test library with its original license files. https://github.com/foundry-rs/forge-std
- Next.js — MIT; React / React DOM — MIT. https://github.com/vercel/next.js and https://github.com/facebook/react
- viem — MIT. https://github.com/wevm/viem
- @arkiv-network/sdk 1.0.1 — MIT, copyright 2025 Arkiv Network; schema/query and wallet-owned entity SDK. Original license is distributed with the installed package. https://github.com/Arkiv-Network
- @ethersphere/bee-js 13.2.0 — BSD-3-Clause; Swarm file upload/download client. Original license is distributed with the installed package. https://github.com/ethersphere/bee-js
- React Flow / @xyflow/react — MIT; its visible attribution is preserved. https://github.com/xyflow/xyflow
- Apache ECharts — Apache-2.0. https://github.com/apache/echarts
- Lucide icons — ISC. https://github.com/lucide-icons/lucide
- Hono — MIT; Zod — MIT. https://github.com/honojs/hono and https://github.com/colinhacks/zod
- TypeScript — Apache-2.0; tsx — MIT; Vitest — MIT; Playwright — Apache-2.0.
- Poppins is self-hosted from the Google Fonts repository with its original SIL Open Font License in apps/web/public/fonts. JetBrains Mono is also self-hosted from the official Google Fonts repository, with its original SIL license and system-font fallbacks.

Package versions and transitive dependency provenance are pinned in pnpm-lock.yaml. Dependency licenses remain with the installed packages. The root MIT license applies to original Floor code and does not override third-party licenses.

No Gnosis CTF source is copied. External Polymarket data is fetched through the public Gamma metadata API, labeled research only, with direct source links and no lending eligibility.

The user-requested Coinbase DESIGN.md was fetched with getdesign. It is a design reference; no Coinbase logos, proprietary fonts or product assets are bundled. User-provided financial-terminal screenshots informed the layout.

The final Kimia treatment uses the user-supplied tokens and screenshots. Colors, geometry and depth were independently implemented; Kimia logos, account data and product code are not bundled.
