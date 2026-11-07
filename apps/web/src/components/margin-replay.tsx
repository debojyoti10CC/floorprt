'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, formatUnits, http } from 'viem';
import { foundry } from 'viem/chains';
import { ARC_TESTNET_CHAIN_ID, publicClientFor, type Deployment } from '@floor/shared';
import { verifyMarginReplay } from '../../../../packages/shared/src/margin-replay';
import { Badge, Money, Panel, TxLink } from './ui';

async function readMarginReplay(deployment: Deployment, rpcUrl: string, signal: AbortSignal) {
  const arc = deployment.chainId === ARC_TESTNET_CHAIN_ID;
  const response = await fetch(arc ? '/cre-margin.arc.json' : '/cre-margin.local.json', { cache: 'no-store', signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load the replay receipts.');
  const client = arc ? publicClientFor(deployment, rpcUrl)
    : createPublicClient({ chain: foundry, transport: http('http://127.0.0.1:8550', { timeout: 5_000, retryCount: 0 }) });
  return verifyMarginReplay(client, deployment, await response.json());
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
  const [error, setError] = useState<string | null>(null);
  const arc = deployment.chainId === ARC_TESTNET_CHAIN_ID;
  const networkLabel = arc ? 'ARC TESTNET' : 'LOCAL TEST';
  useEffect(() => {
    if (!arc && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
    const controller = new AbortController();
    setReplay(null);
    setError(null);
    void readMarginReplay(deployment, rpcUrl, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        setReplay(value);
        setError(null);
      }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unknown replay verification failure.');
    });
    return () => controller.abort();
  }, [arc, deployment, rpcUrl]);
  if (error) return <Panel title="CRE liquidation replay" eyebrow={networkLabel}><div className="trader-panel-body" role="alert">
    Replay verification failed: {error}
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
      <p className="trader-note">Official CRE CLI simulation replay · recorded Polymarket prices · test performance score.
        {arc ? ' An operator-restricted relay submitted the reports to Arc; this is not live Chainlink DON delivery.' : ' Local test-forwarder delivery; not a public DON transaction.'}
        {' '}The prefunded bid and bond paid the lender; the backstop received the shares.</p>
      <div className="trader-inline" aria-label="Transaction receipts">
        <TxLink hash={receipts.request} label="Position locked" />
        <TxLink hash={receipts.fund} label="Loan funded" />
        <TxLink hash={receipts.liquidation} label="Early liquidation" />
        <TxLink hash={receipts.shares} label="Shares released" />
      </div>
    </div>
  </Panel>;
}
