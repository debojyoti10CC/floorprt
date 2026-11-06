'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Radio, RefreshCw } from 'lucide-react';
import type { Address as EvmAddress, Hex } from 'viem';
import type { Evidence } from '../../../../services/underwriting/policy';
import { monthOf, offsetMonth } from '../../../../services/underwriting/calendar';
import { message, useProtocol } from '../lib/protocol';
import { approveTraderCredit, repaySeededLocalDemo, sameWallet, traderDesk, underwritingApi, type TraderLoan } from '../lib/trader-credit';
import { arkivExplorer, packetMatches, publishPacket, readPackets } from '../lib/underwriting-packets';
import { useAction } from './actions';
import { usd } from './trader-replay';
import { Address, Badge, Button, Panel, TxLink } from './ui';

type Row = { id: bigint; loan: TraderLoan; packet?: Hex };
const states = ['Missing', 'Requested', 'Funded', 'Repaid', 'Defaulted', 'Cancelled'];
const eventNames: Record<string, string> = {
  TraderCreditRequested: 'Request', ScoreAttested: 'Score', TraderLoanFunded: 'Funding',
  TraderLoanRepaid: 'Repayment', TraderLoanDefaulted: 'Default', TraderCreditCancelled: 'Cancellation',
};
const date = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const validId = /^[1-9]\d{0,18}$/;

function LoanCard({ row, now, active, demoRequestId, onChange }: { row: Row; now: bigint; active: bigint; demoRequestId?: bigint; onChange: () => void }) {
  const p = useProtocol();
  const action = useAction();
  const [acceptedBy, setAcceptedBy] = useState<EvmAddress | null>(null);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceEvidence, setPerformanceEvidence] = useState<Evidence | null>(null);
  const [published, setPublished] = useState<{ entityKey: Hex; txHash: Hex } | null>(null);
  const { id, loan, packet } = row;
  const local = p.deployment?.traderCredit?.mode === 'LOCAL_FORWARDER';
  const desk = p.deployment?.contracts.TraderCreditDesk;
  const borrower = sameWallet(p.address, loan.borrower);
  const requested = loan.state === 1;
  const funded = loan.state === 2;
  const expired = requested && now >= loan.fundBy;
  const mature = funded && now >= loan.maturity;
  const attested = loan.score >= 60;
  const canAct = p.walletReady && !action.busy;
  const canAttest = local && sameWallet(p.address, p.deployment?.roles.curator) && !expired && !attested;
  const canReviewFunding = requested && attested && !expired && !borrower && active !== id;
  const canRepayDemo = local && demoRequestId === id && funded;
  const acknowledged = sameWallet(acceptedBy, p.address);
  const loss = loan.terms.principal > loan.terms.bond ? loan.terms.principal - loan.terms.bond : 0n;
  const reviewPerformance = () => {
    setPerformanceOpen(value => !value);
    if (performanceEvidence || performanceOpen) return;
    setPerformanceLoading(true);
    void action.run(async () => {
      try {
        const live = await traderDesk(p);
        const wallets = await live.client.readContract({ ...live.contract, functionName: 'traderWallets', args: [id] });
        const month = offsetMonth(monthOf(Number(loan.terms.asOf)), -1);
        const query = new URLSearchParams({ month });
        for (const wallet of wallets) query.append('wallet', wallet);
        const evidence = await underwritingApi<Evidence>('/evidence?' + query);
        if (evidence.asOf !== Number(loan.terms.asOf)
          || evidence.digest.toLowerCase() !== loan.terms.evidenceDigest.toLowerCase()
          || evidence.decision.score !== loan.score) {
          throw new Error('The current performance data does not match the report attested to this request. Do not use it to review this loan.');
        }
        setPerformanceEvidence(evidence);
      } finally {
        setPerformanceLoading(false);
      }
    });
  };
  const history = p.data?.activity.filter(event => event.address.toLowerCase() === desk?.toLowerCase()
    && String(event.args.loanId) === id.toString() && eventNames[event.event]) ?? [];
  const transact = (label: string, fn: string, allowance?: bigint) => void action.run(async () => {
    if (allowance !== undefined) {
      const live = await traderDesk(p);
      const [current, reserved] = await Promise.all([live.loan(id), p.address ? live.active(p.address) : 0n]);
      if (fn === 'fundLoan' && (current.state !== 1 || current.score < 60 || current.fundBy <= live.block.timestamp || reserved === id)) {
        throw new Error('This wallet cannot fund the request in its current state.');
      }
      if (fn === 'repay' && (current.state !== 2 || current.maturity <= live.block.timestamp)) {
        throw new Error('The loan is past its repayment window.');
      }
      await approveTraderCredit(p, allowance);
    }
    await p.transact(label, 'TraderCreditDesk', fn, [id]);
    onChange();
  });

  const attest = () => void action.run(async () => {
    const report = await underwritingApi<{ metadata: Hex; report: Hex }>('/local-report/' + id.toString());
    await p.transact('Attest score with local forwarder', 'TraderCreditDesk', 'onReport', [report.metadata, report.report]);
    onChange();
  });
  const publish = () => void action.run(async () => {
    const live = await traderDesk(p);
    setPublished(await publishPacket(p.deployment!.chainId, live.address, id, await live.loan(id)));
    onChange();
  });

  return <article className="trader-loan-card">
    <div className="trader-card-head">
      <h3>Request #{id.toString()}</h3>
      <Badge tone={expired || loan.state === 4 ? 'red' : attested && loan.state !== 5 ? 'green' : 'muted'}>
        {expired ? 'Expired' : requested ? attested ? 'Attested' : 'Awaiting report' : states[loan.state]}
      </Badge>
    </div>
    <div className="trader-inline">
      <span className="trader-note">Borrower</span><Address value={loan.borrower} />
      {loan.lender !== '0x0000000000000000000000000000000000000000' && <><span className="trader-note">Lender</span><Address value={loan.lender} /></>}
      {attested && <Badge tone="blue">Performance policy {loan.score}/100 · {local ? 'Local forwarder' : 'Chainlink CRE'}</Badge>}
      {packet && <Badge tone="blue">Arkiv packet matched</Badge>}
    </div>
    <dl className="trader-metrics">
      <div><dt>Principal</dt><dd>{usd(loan.terms.principal)}</dd></div>
      <div><dt>Repayment</dt><dd>{usd(loan.terms.due)}</dd></div>
      <div><dt>Bond</dt><dd>{usd(loan.terms.bond)}</dd></div>
      <div><dt>Shortfall after full bond recovery</dt><dd className="trader-loss">{usd(loss)}</dd></div>
    </dl>
    <div className="trader-inline trader-note">
      <span>{requested ? 'Fund by ' + date(loan.fundBy) : loan.maturity > 0n ? 'Maturity ' + date(loan.maturity) : ''}</span>
      <span>Evidence <Address value={loan.terms.evidenceDigest} /></span>
      {history.map(event => <TxLink key={event.transactionHash + ':' + event.logIndex} hash={event.transactionHash} label={eventNames[event.event]} />)}
    </div>
    {attested && <div className="trader-performance-review">
      <Button variant="secondary" disabled={action.busy} onClick={reviewPerformance}>
        {performanceLoading ? 'Checking report…' : performanceOpen ? 'Hide performance metrics' : 'Review performance metrics'}
      </Button>
      {performanceOpen && performanceEvidence && <>
        <div className="trader-inline"><Badge tone="green">Evidence digest matches attested report</Badge><span className="trader-note">As of {new Date(performanceEvidence.asOf * 1000).toISOString().slice(0, 10)}</span></div>
        <dl className="trader-metrics">
          <div><dt>Performance score</dt><dd>{performanceEvidence.decision.score}/100</dd></div>
          <div><dt>Active / positive months</dt><dd>{performanceEvidence.decision.activeMonths} / {performanceEvidence.decision.positiveMonths}</dd></div>
          <div><dt>Active-window realized P&amp;L</dt><dd>{usd(performanceEvidence.decision.pnl)}</dd></div>
          <div><dt>Turnover</dt><dd>{usd(performanceEvidence.decision.turnover)}</dd></div>
          <div><dt>Realized efficiency</dt><dd>{(performanceEvidence.decision.efficiencyBps / 100).toFixed(2)}%</dd></div>
          <div><dt>Drawdown / turnover</dt><dd>{(performanceEvidence.decision.drawdownBps / 100).toFixed(2)}%</dd></div>
        </dl>
        <p className="trader-note">Score components · consistency {performanceEvidence.decision.components.consistency}/40 · efficiency {performanceEvidence.decision.components.efficiency}/35 · drawdown {performanceEvidence.decision.components.drawdown}/25</p>
        <p className="trader-note">This report informs the pilot eligibility policy. It is not repayment history, borrower income or a probability of default.</p>
      </>}
    </div>}
    {canReviewFunding && <label className="trader-inline trader-risk">
      <input type="checkbox" checked={acknowledged} disabled={!p.address} onChange={event => setAcceptedBy(event.target.checked ? p.address : null)} />
      I accept a principal shortfall of up to {usd(loss)}, assuming full bond recovery.
    </label>}
    <div className="trader-inline">
      {requested && canAttest && <Button variant="secondary" disabled={!canAct} onClick={attest}>Submit local report</Button>}
      {canReviewFunding && <Button disabled={!canAct || !acknowledged || !performanceEvidence} onClick={() => transact('Fund trader loan', 'fundLoan', loan.terms.principal)}>Fund {usd(loan.terms.principal)}</Button>}
      {requested && (borrower || expired) && <Button variant="secondary" disabled={!canAct} onClick={() => transact('Cancel request and return bond', 'cancelRequest')}>Cancel and return bond</Button>}
      {requested && attested && !expired && borrower && p.mode === 'injected' && !packet && !published && <Button variant="secondary" disabled={!canAct} onClick={publish}><Radio size={14} /> Publish on Arkiv</Button>}
      {funded && borrower && !mature && <Button disabled={!canAct} onClick={() => transact('Repay trader loan', 'repay', loan.terms.due)}>Repay {usd(loan.terms.due)}</Button>}
      {canRepayDemo && <Button variant="secondary" disabled={!p.online || action.busy}
        onClick={() => void action.run(async () => { await repaySeededLocalDemo(p, id); onChange(); })}>Repay from local demo borrower</Button>}
      {mature && <Button variant="danger" disabled={!canAct} onClick={() => transact('Settle default and release bond', 'settleDefault')}>Settle default</Button>}
    </div>
    {published && <div className="trader-inline trader-note">
      <span>Arkiv entity</span><Address value={published.entityKey} />
      <a href={arkivExplorer.replace(/\/+$/, '') + '/tx/' + published.txHash} target="_blank" rel="noreferrer" className="text-link">Publication receipt <ArrowUpRight size={12} /></a>
    </div>}
    {action.error && <div className="error-box" role="alert">{action.error}</div>}
  </article>;
}

export function TraderLoans({ mine = false, selectedId, demoRequestId }: { mine?: boolean; selectedId?: bigint; demoRequestId?: bigint }) {
  const p = useProtocol();
  const { deployment, rpcUrl, address, online } = p;
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0n);
  const [active, setActive] = useState(0n);
  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState('');
  const [id, setId] = useState<bigint>();
  const [revision, setRevision] = useState(0);
  const [discover, setDiscover] = useState(false);
  const [packetStatus, setPacketStatus] = useState('');
  const deskAddress = deployment?.contracts.TraderCreditDesk;
  const block = p.data?.blockNumber;
  const confirmed = p.tx?.status === 'confirmed' ? p.tx.hash : undefined;
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    if (!deskAddress || !online || (mine && !address)) return;
    let stale = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const live = await traderDesk({ deployment, rpcUrl });
      const current = live.block.timestamp;
      const count = await live.client.readContract({ ...live.contract, functionName: 'loanCount' });
      const ids = new Set<bigint>();
      if (selectedId) ids.add(selectedId);
      if (id) ids.add(id);
      const activeId = address ? await live.active(address) : 0n;
      if (activeId) ids.add(activeId);
      if (!mine && !id) for (let index = count; index > 0n && count - index < 10n; index--) ids.add(index);
      const matched = new Map<bigint, Hex>();
      let status = '';
      if (discover && deployment) {
        try {
          const packets = await readPackets(deployment.chainId, live.address);
          const checked = await Promise.all(packets.filter(packet => packet.loanId.value > 0n && packet.loanId.value <= count)
            .map(async packet => ({ packet, loan: await live.loan(packet.loanId.value) })));
          for (const { packet, loan } of checked) {
            if (packetMatches(packet, loan, current)) {
              matched.set(packet.loanId.value, packet.$key);
              ids.add(packet.loanId.value);
            }
          }
          status = matched.size ? matched.size + ' current Arkiv packets' : 'No current Arkiv packets for this desk.';
        } catch {
          status = 'Arkiv query unavailable. Onchain requests are still available.';
        }
      }
      const nextRows = await Promise.all([...ids].map(async id => ({ id, loan: await live.loan(id), packet: matched.get(id) })));
      if (stale) return;
      setNow(current);
      setActive(activeId);
      setRows(nextRows.filter(row => row.loan.state > 0 && (!mine || sameWallet(row.loan.borrower, address))));
      setPacketStatus(status);
      if (id && id > count) setError('No request with that ID.');
    })().catch(error => { if (!stale) { setError(message(error)); setRows([]); } })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [address, block, confirmed, deployment, deskAddress, discover, id, mine, online, revision, rpcUrl, selectedId]);

  return <Panel title={mine ? 'Your request' : 'Lending book'} eyebrow={mine ? 'ONCHAIN STATUS' : 'ONCHAIN REQUESTS'}
    action={<Button variant="ghost" onClick={refresh} disabled={!online || !deskAddress} aria-label="Refresh credit requests"><RefreshCw size={15} className={loading && online && deskAddress ? 'spin' : ''} /></Button>}>
    <div className="trader-panel-body">
      {!mine && <div className="trader-inline trader-discovery">
        <form className="trader-inline" onSubmit={event => { event.preventDefault(); if (validId.test(lookup)) { setId(BigInt(lookup)); refresh(); } }}>
          <input aria-label="Request ID" placeholder="Request ID" inputMode="numeric" maxLength={19} value={lookup} onChange={event => setLookup(event.target.value)} />
          <Button variant="secondary" type="submit" disabled={!validId.test(lookup) || !deskAddress || !online}>Find request</Button>
          {id !== undefined && <Button variant="ghost" type="button" onClick={() => { setLookup(''); setId(undefined); }}>Recent requests</Button>}
        </form>
        <Button variant="secondary" disabled={!deskAddress || !online} onClick={() => { setDiscover(true); refresh(); }}><Radio size={14} /> Discover on Arkiv</Button>
      </div>}
      {packetStatus && <div className="trader-note" role="status">{packetStatus}</div>}
      {!deployment && <div className="trader-note" role="status">Waiting for the deployment.</div>}
      {deployment && !deskAddress && <div className="trader-note" role="status">Trader credit is unavailable on this deployment.</div>}
      {deskAddress && !online && <div className="trader-note" role="status">Waiting for the lending chain.</div>}
      {mine && !address && <p className="trader-note">Connect a wallet to see its request.</p>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {deskAddress && online && (!mine || address) && !rows.length && !error && <p className="trader-note" role="status">{loading ? 'Reading the desk…' : 'No credit requests.'}</p>}
      {deskAddress && online && <div className="trader-loan-list">{rows.filter(row => !mine || sameWallet(row.loan.borrower, address)).map(row =>
        <LoanCard key={deskAddress + ':' + row.id} row={row} now={now} active={active} demoRequestId={demoRequestId} onChange={refresh} />)}</div>}
    </div>
  </Panel>;
}
