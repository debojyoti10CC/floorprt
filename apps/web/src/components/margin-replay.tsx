'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, formatUnits, http, isAddress, isAddressEqual, keccak256, parseEventLogs, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { z } from 'zod';
import { ARC_TESTNET_CHAIN_ID, MarginCreditDeskAbi, publicClientFor, type Deployment } from '@floor/shared';
import { Badge, Money, Panel, TxLink } from './ui';

const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/i).transform(value => value as Hex);
const proofSchema = z.object({
  mode: z.enum(['CRE_CLI_LOCAL_REPLAY', 'CRE_CLI_ARC_REPLAY']),
  chainId: z.union([z.literal(foundry.id), z.literal(ARC_TESTNET_CHAIN_ID)]),
  desk: z.string().refine(value => isAddress(value)).transform(value => value as Address),
  deskCodeHash: hex32,
  loanId: z.string().regex(/^[1-9]\d{0,18}$/).transform(value => BigInt(value)),
  receipts: z.object({ request: hex32, initialMark: hex32, fund: hex32, liquidation: hex32, shares: hex32 }),
});

async function readMarginReplay(deployment: Deployment, rpcUrl: string, signal: AbortSignal) {
  const arc = deployment.chainId === ARC_TESTNET_CHAIN_ID;
  const response = await fetch(arc ? '/cre-margin.arc.json' : '/cre-margin.local.json', { cache: 'no-store', signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load the replay receipts.');
  const { mode, chainId, desk, deskCodeHash, loanId, receipts } = proofSchema.parse(await response.json());
  const margin = deployment.traderCredit?.arcMargin;
  if (chainId !== deployment.chainId || mode !== (arc ? 'CRE_CLI_ARC_REPLAY' : 'CRE_CLI_LOCAL_REPLAY')
    || (arc && (!margin || !isAddressEqual(desk, margin.desk) || deskCodeHash !== margin.deskCodeHash))) {
    throw new Error('Replay proof does not match the lending deployment.');
  }
  const client = arc ? publicClientFor(deployment, rpcUrl)
    : createPublicClient({ chain: foundry, transport: http('http://127.0.0.1:8550', { timeout: 5_000, retryCount: 0 }) });
  const [chain, code, loan, pledgeReceipt, initialReceipt, fundReceipt, liquidationReceipt, sharesReceipt] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: desk }),
    client.readContract({ address: desk, abi: MarginCreditDeskAbi, functionName: 'getLoan', args: [loanId] }),
    client.getTransactionReceipt({ hash: receipts.request }),
    client.getTransactionReceipt({ hash: receipts.initialMark }),
    client.getTransactionReceipt({ hash: receipts.fund }),
    client.getTransactionReceipt({ hash: receipts.liquidation }),
    client.getTransactionReceipt({ hash: receipts.shares }),
  ]);
  if (chain !== chainId || !code || keccak256(code) !== deskCodeHash || loan.state !== 4
    || [pledgeReceipt, initialReceipt, fundReceipt, liquidationReceipt, sharesReceipt].some(receipt => receipt.status !== 'success')) {
    throw new Error('Replay receipts no longer match the lending chain.');
  }
  const fromDesk = (logs: typeof initialReceipt.logs) => logs.filter(log => isAddressEqual(log.address, desk));
  const pledge = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarginPledged', logs: fromDesk(pledgeReceipt.logs) })
    .find(event => event.args.loanId === loanId)?.args;
  const initial = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarketMark', logs: fromDesk(initialReceipt.logs) })
    .find(event => event.args.loanId === loanId)?.args;
  const fund = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'TraderLoanFunded', logs: fromDesk(fundReceipt.logs) })
    .find(event => event.args.loanId === loanId)?.args;
  const liquidationLogs = fromDesk(liquidationReceipt.logs);
  const latest = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarketMark', logs: liquidationLogs })
    .find(event => event.args.loanId === loanId)?.args;
  const liquidation = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarginLiquidated', logs: liquidationLogs })
    .find(event => event.args.loanId === loanId)?.args;
  const recovery = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'TraderLoanDefaulted', logs: liquidationLogs })
    .find(event => event.args.loanId === loanId)?.args;
  const release = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarginSharesReleased', logs: fromDesk(sharesReceipt.logs) })
    .find(event => event.args.loanId === loanId)?.args;
  if (!pledge || !initial || !fund || !latest || !liquidation || !recovery || !release
    || fund.principal !== loan.terms.principal || release.shares !== pledge.shares || recovery.lenderPaid !== loan.terms.due) {
    throw new Error('The receipts do not show the full directional recovery.');
  }
  const block = await client.getBlock({ blockHash: liquidationReceipt.blockHash });
  if (block.timestamp >= loan.maturity) throw new Error('The receipt did not liquidate before maturity.');
  return { loan, initial, latest, liquidation, recovery, release, receipts };
}

function LtvMark({ label, mark, due }: { label: string; mark: { price: bigint; backing: bigint }; due: bigint }) {
  const ltv = due * 10_000n / mark.backing;
  const width = ltv >= 10_000n ? 100 : Number(ltv) / 100;
  const danger = ltv >= 9_000n;
  return <div className="margin-mark">
    <div><span className="eyebrow">{label}</span><strong>{formatUnits(ltv, 2)}% LTV</strong></div>
    <div className="margin-ltv-track" aria-hidden="true">
      <span className={danger ? 'margin-ltv-breach' : ''} style={{ width: width + '%' }} />
    </div>
    <div><span>Mark <Money value={mark.price} full /></span><span>Backing <Money value={mark.backing} /></span></div>
  </div>;
}

export function MarginReplay({ deployment, rpcUrl }: { deployment: Deployment; rpcUrl: string }) {
  const [replay, setReplay] = useState<Awaited<ReturnType<typeof readMarginReplay>>>(null);
  const [error, setError] = useState(false);
  const arc = deployment.chainId === ARC_TESTNET_CHAIN_ID;
  const networkLabel = arc ? 'ARC TESTNET' : 'LOCAL TEST';
  useEffect(() => {
    if (!arc && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
    const controller = new AbortController();
    void readMarginReplay(deployment, rpcUrl, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        setReplay(value);
        setError(false);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [arc, deployment, rpcUrl]);
  if (error) return <Panel title="CRE liquidation replay" eyebrow={networkLabel}><div className="trader-panel-body" role="status">
    The lending chain or its replay receipts are unavailable.
  </div></Panel>;
  if (!replay) return null;
  const { loan, initial, latest, liquidation, recovery, release, receipts } = replay;
  return <Panel title="CRE liquidation replay" eyebrow="POLYMARKET PRICE HISTORY" action={<Badge tone="amber">{networkLabel}</Badge>}>
    <div className="trader-panel-body">
      <dl className="trader-metrics">
        <div><dt>Principal</dt><dd><Money value={loan.terms.principal} /></dd></div>
        <div><dt>Total due</dt><dd><Money value={loan.terms.due} /></dd></div>
        <div><dt>Shares escrowed</dt><dd>{formatUnits(release.shares, 6)}</dd></div>
        <div><dt>Borrower bond</dt><dd><Money value={loan.terms.bond} /></dd></div>
        <div><dt>Prefunded bid</dt><dd><Money value={liquidation.proceeds} /></dd></div>
        <div><dt>Lender recovered</dt><dd><Money value={recovery.lenderPaid} /> tUSDC</dd></div>
      </dl>
      <div className="margin-marks">
        <LtvMark label="AT FUNDING" mark={initial} due={loan.terms.due} />
        <LtvMark label="AT LIQUIDATION" mark={latest} due={loan.terms.due} />
      </div>
      <div className="trader-inline">
        <Badge tone="green">Full debt recovered</Badge><span className="trader-note">90% liquidation threshold</span>
      </div>
      <div className="trader-inline" aria-label="Transaction receipts">
        <TxLink hash={receipts.request} label="Position locked" />
        <TxLink hash={receipts.fund} label="Loan funded" />
        <TxLink hash={receipts.liquidation} label="Early liquidation" />
        <TxLink hash={receipts.shares} label="Shares released" />
      </div>
    </div>
  </Panel>;
}
