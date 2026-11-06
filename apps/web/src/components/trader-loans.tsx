'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Radio, RefreshCw } from 'lucide-react';
import type { Address as EvmAddress, Hex } from 'viem';
import { walletSetHash } from '../../../../services/underwriting/reports';
import { message, useProtocol } from '../lib/protocol';
import { approveTraderCredit, repaySeededLocalDemo, sameWallet, traderDesk, underwritingApi, type TraderLoan } from '../lib/trader-credit';
import { arkivAccessKeyConfigured, arkivExplorer, packetMatches, publishPacket, readPackets, type ArkivPacket } from '../lib/underwriting-packets';
import { prepareAssessmentRelease, requestBorrowerSignature, retrieveAssessment, uploadConsentedAssessment, type AssessmentChallenge, type PublicAssessment } from '../lib/assessment-evidence';
import { useAction } from './actions';
import { usd } from './trader-replay';
import { Address, Badge, Button, Panel, TxLink } from './ui';

type Row = { id: bigint; loan: TraderLoan; packet?: ArkivPacket };
const states = ['Missing', 'Requested', 'Funded', 'Repaid', 'Defaulted', 'Cancelled'];
const eventNames: Record<string, string> = {
  TraderCreditRequested: 'Request', ScoreAttested: 'Score', TraderLoanFunded: 'Funding',
  AssessmentCommitted: 'Report commitment', TraderLoanRepaid: 'Repayment', TraderLoanDefaulted: 'Default', TraderCreditCancelled: 'Cancellation',
};
const date = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const validId = /^[1-9]\d{0,18}$/;

function LoanCard({ row, now, active, demoRequestId, swarmReady, onChange }: { row: Row; now: bigint; active: bigint; demoRequestId?: bigint; swarmReady: boolean | null; onChange: () => void }) {
  const p = useProtocol();
  const action = useAction();
  const [acceptedBy, setAcceptedBy] = useState<EvmAddress | null>(null);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceEvidence, setPerformanceEvidence] = useState<PublicAssessment | null>(null);
  const [releasePreview, setReleasePreview] = useState<AssessmentChallenge | null>(null);
  const [publicConsent, setPublicConsent] = useState(false);
  const [uploaded, setUploaded] = useState<PublicAssessment | null>(null);
  const [published, setPublished] = useState<{ entityKey: Hex; txHash: Hex | null; artifact: PublicAssessment } | null>(null);
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
  const canReviewFunding = requested && attested && !expired && !borrower && active !== id && !!packet;
  const canRepayDemo = local && demoRequestId === id && funded;
  const acknowledged = sameWallet(acceptedBy, p.address);
  const loss = loan.terms.principal > loan.terms.bond ? loan.terms.principal - loan.terms.bond : 0n;
  const reviewPerformance = () => {
    setPerformanceOpen(value => !value);
    if (performanceEvidence || performanceOpen) return;
    if (!packet) {
      action.setError('Discover this loan on Arkiv first. Funding review requires the borrower-published evidence pointer.');
      return;
    }
    setPerformanceLoading(true);
    void action.run(async () => {
      try {
        const report = await retrieveAssessment(packet.reportRef.value, packet.reportHash.value);
        const live = await traderDesk(p);
        const wallets = await live.client.readContract({ ...live.contract, functionName: 'traderWallets', args: [id] });
        const evidence = report.evidence;
        if (evidence.asOf !== Number(loan.terms.asOf)
          || evidence.digest.toLowerCase() !== loan.terms.evidenceDigest.toLowerCase()
          || evidence.decision.score !== loan.score
          || walletSetHash(evidence.wallets as EvmAddress[]).toLowerCase() !== loan.walletSetHash.toLowerCase()
          || evidence.wallets.length !== wallets.length
          || evidence.wallets.some((wallet, index) => wallet.toLowerCase() !== wallets[index]?.toLowerCase())) {
          throw new Error('The retrieved Swarm report does not match the borrower, wallet group and score attested to this loan.');
        }
        setPerformanceEvidence(report);
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
      if (fn === 'fundLoan') {
        if (!packet || !performanceEvidence) throw new Error('Inspect the Arkiv-listed Swarm report before funding.');
        const [committedHash, committedReference] = await Promise.all([
          live.client.readContract({ ...live.contract, functionName: 'assessmentHashOf', args: [id] }),
          live.client.readContract({ ...live.contract, functionName: 'assessmentReferenceOf', args: [id] }),
        ]);
        if (committedHash.toLowerCase() !== `0x${packet.reportHash.value.toLowerCase()}`
          || committedReference.toLowerCase() !== `0x${packet.reportRef.value.toLowerCase()}`
          || performanceEvidence.sha256.toLowerCase() !== packet.reportHash.value.toLowerCase()
          || performanceEvidence.reference.toLowerCase() !== packet.reportRef.value.toLowerCase()) {
          throw new Error('The Arkiv listing and inspected Swarm bytes no longer match the onchain report commitment.');
        }
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
    await p.transact('Approve performance report', 'TraderCreditDesk', 'onReport', [report.metadata, report.report]);
    onChange();
  });
  const prepareRelease = () => void action.run(async () => {
    const challenge = await prepareAssessmentRelease(id);
    if (challenge.evidence.digest.toLowerCase() !== loan.terms.evidenceDigest.toLowerCase()
      || challenge.evidence.decision.score !== loan.score) {
      throw new Error('The public report preview differs from the report already attested to this loan.');
    }
    setReleasePreview(challenge);
    setPublicConsent(false);
  });

  const publish = () => void action.run(async () => {
    if (!publicConsent && !uploaded) throw new Error('Review and accept the public evidence disclosure first.');
    let artifact = uploaded;
    if (!artifact) {
      if (!releasePreview) throw new Error('Prepare and inspect the public report preview first.');
      const signature = await requestBorrowerSignature(loan.borrower, releasePreview.message);
      artifact = await uploadConsentedAssessment(id, releasePreview.challengeId, signature);
      if (artifact.sha256.toLowerCase() !== releasePreview.sha256.toLowerCase()
        || artifact.evidence.digest.toLowerCase() !== releasePreview.evidence.digest.toLowerCase()) {
        throw new Error('Swarm read-back differs from the report shown in the consent prompt.');
      }
      setUploaded(artifact);
    }
    const live = await traderDesk(p);
    const current = await live.loan(id);
    if (current.state !== 1 || current.score !== loan.score
      || current.terms.evidenceDigest.toLowerCase() !== loan.terms.evidenceDigest.toLowerCase()) {
      throw new Error('The loan changed after the report was uploaded. Refresh before publishing it.');
    }
    await p.transact('Commit assessment report to loan', 'TraderCreditDesk', 'commitAssessment', [
      id, `0x${artifact.sha256}`, `0x${artifact.reference}`,
    ]);
    const receipt = await publishPacket(p.deployment!.chainId, live.address, id, current, {
      reference: artifact.reference, sha256: artifact.sha256,
    });
    setPublished({ ...receipt, artifact });
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
      {attested && <Badge tone="blue">Performance report verified · {loan.score}/100</Badge>}
      {packet && <Badge tone="blue">Arkiv report listing matched</Badge>}
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
      {packet ? <Button variant="secondary" disabled={action.busy} onClick={reviewPerformance}>
        {performanceLoading ? 'Verifying Swarm report…' : performanceOpen ? 'Hide assessment evidence' : 'Inspect assessment evidence'}
      </Button> : requested && !borrower ? <p className="trader-note">No fundable Arkiv listing loaded. Use “Discover on Arkiv” to find a borrower-published Swarm report.</p> : null}
      {performanceOpen && performanceEvidence && <>
        <div className="trader-inline"><Badge tone="green">Swarm bytes, Arkiv hash and on-chain evidence digest verified</Badge><span className="trader-note">As of {new Date(performanceEvidence.evidence.asOf * 1000).toISOString().slice(0, 10)}</span></div>
        <div className="trader-inline trader-note"><span>Swarm reference</span><code className="trader-hash">{performanceEvidence.reference}</code></div>
        <div className="trader-inline trader-note"><span>SHA-256</span><code className="trader-hash">{performanceEvidence.sha256}</code></div>
        <dl className="trader-metrics">
          <div><dt>Performance score</dt><dd>{performanceEvidence.evidence.decision.score}/100</dd></div>
          <div><dt>Active / positive months</dt><dd>{performanceEvidence.evidence.decision.activeMonths} / {performanceEvidence.evidence.decision.positiveMonths}</dd></div>
          <div><dt>Active-window realized P&amp;L</dt><dd>{usd(performanceEvidence.evidence.decision.pnl)}</dd></div>
          <div><dt>Turnover</dt><dd>{usd(performanceEvidence.evidence.decision.turnover)}</dd></div>
          <div><dt>Realized efficiency</dt><dd>{(performanceEvidence.evidence.decision.efficiencyBps / 100).toFixed(2)}%</dd></div>
          <div><dt>Drawdown / turnover</dt><dd>{(performanceEvidence.evidence.decision.drawdownBps / 100).toFixed(2)}%</dd></div>
        </dl>
        <p className="trader-note">Score components · consistency {performanceEvidence.evidence.decision.components.consistency}/40 · efficiency {performanceEvidence.evidence.decision.components.efficiency}/35 · drawdown {performanceEvidence.evidence.decision.components.drawdown}/25</p>
        <p className="trader-note">This report informs the pilot eligibility policy. It is not repayment history, borrower income or a probability of default.</p>
      </>}
    </div>}
    {canReviewFunding && <label className="trader-inline trader-risk">
      <input type="checkbox" checked={acknowledged} disabled={!p.address} onChange={event => setAcceptedBy(event.target.checked ? p.address : null)} />
      I accept a principal shortfall of up to {usd(loss)}, assuming full bond recovery.
    </label>}
    <div className="trader-inline">
      {requested && canAttest && <Button variant="secondary" disabled={!canAct} onClick={attest}>Approve performance report</Button>}
      {canReviewFunding && <Button disabled={!canAct || !acknowledged || !performanceEvidence} onClick={() => transact('Fund trader loan', 'fundLoan', loan.terms.principal)}>Fund {usd(loan.terms.principal)}</Button>}
      {requested && (borrower || expired) && <Button variant="secondary" disabled={!canAct} onClick={() => transact('Cancel request and return bond', 'cancelRequest')}>Cancel and return bond</Button>}
      {requested && attested && !expired && borrower && p.mode === 'injected' && !packet && !published && <>
        {swarmReady === false && <p className="trader-note" role="status">Swarm publication is unavailable: the AQRA API needs a Bee node URL and funded postage batch.</p>}
        {swarmReady === null && <p className="trader-note" role="status">Checking Swarm storage configuration…</p>}
        {releasePreview && !uploaded && <div className="trader-public-preview">
          <strong>Public report preview</strong>
          <p>Anyone can retrieve this report from Swarm and discover its listing on Arkiv. It contains the linked wallet addresses and the metrics below.</p>
          <div className="trader-inline"><span className="trader-note">Wallets</span>{releasePreview.evidence.wallets.map(value => <Address key={value} value={value as EvmAddress} />)}</div>
          <dl className="trader-metrics">
            <div><dt>Score</dt><dd>{releasePreview.evidence.decision.score}/100</dd></div>
            <div><dt>Decision month</dt><dd>{releasePreview.evidence.month}</dd></div>
            <div><dt>Cutoff</dt><dd>{new Date(releasePreview.evidence.asOf * 1000).toISOString().slice(0, 10)}</dd></div>
            <div><dt>Active / positive months</dt><dd>{releasePreview.evidence.decision.activeMonths} / {releasePreview.evidence.decision.positiveMonths}</dd></div>
            <div><dt>Realized P&amp;L</dt><dd>{usd(releasePreview.evidence.decision.pnl)}</dd></div>
            <div><dt>Turnover</dt><dd>{usd(releasePreview.evidence.decision.turnover)}</dd></div>
          </dl>
          <div className="trader-inline trader-note"><span>Report SHA-256</span><code className="trader-hash">{releasePreview.sha256}</code></div>
          <p className="trader-note">Consent expires {new Date(releasePreview.expiresAt * 1000).toLocaleString()}.</p>
          <label className="trader-inline trader-risk"><input type="checkbox" checked={publicConsent} disabled={!canAct} onChange={event => setPublicConsent(event.target.checked)} />
            I approve publishing this exact report publicly on Swarm and in Arkiv.</label>
        </div>}
        <div className="trader-inline">
          {!uploaded && <Button variant="secondary" disabled={!canAct || swarmReady !== true} onClick={prepareRelease}><Radio size={14} /> {releasePreview ? 'Refresh public report preview' : 'Preview public report'}</Button>}
          {(releasePreview || uploaded) && <Button variant="secondary" disabled={!canAct || swarmReady !== true || (!publicConsent && !uploaded)} onClick={publish}><Radio size={14} /> {uploaded ? 'Retry Arkiv listing' : 'Sign consent, upload and publish'}</Button>}
        </div>
      </>}
      {funded && borrower && !mature && <Button disabled={!canAct} onClick={() => transact('Repay trader loan', 'repay', loan.terms.due)}>Repay {usd(loan.terms.due)}</Button>}
      {canRepayDemo && <Button variant="secondary" disabled={!p.online || action.busy}
        onClick={() => void action.run(async () => { await repaySeededLocalDemo(p, id); onChange(); })}>Repay from demo borrower account</Button>}
      {mature && <Button variant="danger" disabled={!canAct} onClick={() => transact('Settle default and release bond', 'settleDefault')}>Settle default</Button>}
    </div>
    {published && <div className="trader-inline trader-note">
      <span>Arkiv entity</span><Address value={published.entityKey} />
      {published.txHash && <a href={arkivExplorer.replace(/\/+$/, '') + '/tx/' + published.txHash} target="_blank" rel="noreferrer" className="text-link">Publication receipt <ArrowUpRight size={12} /></a>}
      <span>Swarm SHA-256</span><code className="trader-hash">{published.artifact.sha256}</code>
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
  const [discover, setDiscover] = useState(!mine);
  const [packetStatus, setPacketStatus] = useState('');
  const [packetCount, setPacketCount] = useState<number | null>(null);
  const [swarmReady, setSwarmReady] = useState<boolean | null>(null);
  const deskAddress = deployment?.contracts.TraderCreditDesk;
  const block = p.data?.blockNumber;
  const confirmed = p.tx?.status === 'confirmed' ? p.tx.hash : undefined;
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    let stale = false;
    void underwritingApi<{ swarmConfigured: boolean }>('/storage-status')
      .then(status => { if (!stale) setSwarmReady(status.swarmConfigured); })
      .catch(() => { if (!stale) setSwarmReady(false); });
    return () => { stale = true; };
  }, []);
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
      const matched = new Map<bigint, ArkivPacket>();
      let status = '';
      if (discover && deployment) {
        setPacketStatus('Querying Arkiv Rabdi for report-backed requests…');
        setPacketCount(null);
        try {
          const packets = await readPackets(deployment.chainId, live.address);
          const checked = await Promise.all(packets.filter(packet => packet.loanId.value > 0n && packet.loanId.value <= count)
            .map(async packet => {
              const [loan, reportHash, reportReference] = await Promise.all([
                live.loan(packet.loanId.value),
                live.client.readContract({ ...live.contract, functionName: 'assessmentHashOf', args: [packet.loanId.value] }),
                live.client.readContract({ ...live.contract, functionName: 'assessmentReferenceOf', args: [packet.loanId.value] }),
              ]);
              return { packet, loan, reportHash, reportReference };
            }));
          for (const { packet, loan, reportHash, reportReference } of checked) {
            const artifactMatches = reportHash.toLowerCase() === `0x${packet.reportHash.value.toLowerCase()}`
              && reportReference.toLowerCase() === `0x${packet.reportRef.value.toLowerCase()}`;
            if (artifactMatches && packetMatches(packet, loan, current)) {
              matched.set(packet.loanId.value, packet);
              ids.add(packet.loanId.value);
            }
          }
          status = matched.size ? matched.size + ' open, report-backed Arkiv listings verified against the lending chain.' : 'No current report-backed Arkiv listings for this desk.';
          setPacketCount(matched.size);
        } catch {
          status = 'Arkiv query unavailable. Onchain requests are still available.';
          setPacketCount(null);
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

  return <Panel title={mine ? 'Your request' : 'Arkiv reports & lending book'} eyebrow={mine ? 'ONCHAIN STATUS' : 'RABDI DISCOVERY · ONCHAIN FUNDING'}
    action={<Button variant="ghost" onClick={refresh} disabled={!online || !deskAddress} aria-label="Refresh credit requests"><RefreshCw size={15} className={loading && online && deskAddress ? 'spin' : ''} /></Button>}>
    <div className="trader-panel-body">
      {!mine && <div className="arkiv-credit-status" role="status" aria-live="polite">
        <div className="arkiv-credit-status-copy"><span className="eyebrow">ARKIV / RABDI</span><strong>{packetStatus || (loading ? 'Reading the lending desk and Arkiv…' : 'Arkiv discovery is ready')}</strong>
          <p>Arkiv publishes borrower-approved report pointers. Loan principal, bond and funding remain on the lending chain.</p></div>
        <div className="arkiv-credit-status-meta">
          <Badge tone={packetCount && packetCount > 0 ? 'green' : packetCount === 0 ? 'muted' : 'amber'}>{packetCount === null ? discover ? loading ? 'QUERYING' : 'NOT VERIFIED' : 'NOT QUERIED' : `${packetCount} LISTING${packetCount === 1 ? '' : 'S'}`}</Badge>
          <Badge tone={arkivAccessKeyConfigured ? 'green' : 'amber'}>{arkivAccessKeyConfigured ? 'RABDI KEY SET' : 'PUBLIC RPC · RATE LIMITED'}</Badge>
          <Badge tone={swarmReady ? 'green' : swarmReady === false ? 'amber' : 'muted'}>{swarmReady ? 'SWARM CONFIGURED' : swarmReady === false ? 'SWARM NOT CONFIGURED' : 'CHECKING SWARM'}</Badge>
          <a href={arkivExplorer} target="_blank" rel="noreferrer" className="text-link">Arkiv explorer <ArrowUpRight size={12} /></a>
        </div>
      </div>}
      {!mine && <div className="trader-inline trader-discovery">
        <form className="trader-inline" onSubmit={event => { event.preventDefault(); if (validId.test(lookup)) { setId(BigInt(lookup)); refresh(); } }}>
          <input aria-label="Request ID" placeholder="Request ID" inputMode="numeric" maxLength={19} value={lookup} onChange={event => setLookup(event.target.value)} />
          <Button variant="secondary" type="submit" disabled={!validId.test(lookup) || !deskAddress || !online}>Find request</Button>
          {id !== undefined && <Button variant="ghost" type="button" onClick={() => { setLookup(''); setId(undefined); }}>Recent requests</Button>}
        </form>
        <Button variant="secondary" disabled={!deskAddress || !online || loading} onClick={() => { setDiscover(true); refresh(); }}><Radio size={14} /> {packetCount === null ? 'Discover on Arkiv' : 'Refresh Arkiv listings'}</Button>
      </div>}
      {!deployment && <div className="trader-note" role="status">Waiting for the deployment.</div>}
      {deployment && !deskAddress && <div className="trader-note" role="status">Trader credit is unavailable on this deployment.</div>}
      {deskAddress && !online && <div className="trader-note" role="status">Waiting for the lending chain.</div>}
      {mine && !address && <p className="trader-note">Connect a wallet to see its request.</p>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {deskAddress && online && (!mine || address) && !rows.length && !error && <p className="trader-note" role="status">{loading ? 'Reading the desk…' : 'No credit requests.'}</p>}
      {deskAddress && online && <div className="trader-loan-list">{rows.filter(row => !mine || sameWallet(row.loan.borrower, address)).map(row =>
        <LoanCard key={deskAddress + ':' + row.id} row={row} now={now} active={active} demoRequestId={demoRequestId} swarmReady={swarmReady} onChange={refresh} />)}</div>}
    </div>
  </Panel>;
}
