'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FlaskConical, RefreshCw } from 'lucide-react';
import { useProtocol } from '../lib/protocol';
import { createLocalDemoRequest, currentLocalDemo, type LocalDemoStatus } from '../lib/trader-credit';
import { TraderBorrow } from './trader-borrow';
import { TraderLoans } from './trader-loans';
import { TraderReplay } from './trader-replay';
import { Badge, Button, Panel } from './ui';

export type TraderCreditSection = 'Data' | 'Borrow' | 'Lend';

const demoRequestStorageKey = 'aqra-local-demo-request';

function readDemoRequestId(): bigint | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = window.localStorage.getItem(demoRequestStorageKey) ?? '';
  return /^[1-9]\d{0,18}$/.test(value) ? BigInt(value) : undefined;
}

function LocalDemoPanel({ requestId, status, onOpen, onRefresh, loading }: {
  requestId?: bigint;
  status: LocalDemoStatus | null;
  onOpen: (id: bigint) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const p = useProtocol();
  const { deployment, online, rpcUrl } = p;
  const [busy, setBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = deployment?.chainId === 31337 && deployment.mockCollateral
    && deployment.traderCredit?.mode === 'LOCAL_FORWARDER';
  if (!local) return null;
  const activeRequest = status?.state === 1 || status?.state === 2;
  const nextRole = status?.state === 1 ? status.score >= 60 ? 'lender' as const : 'resolver' as const
    : status?.state === 2 ? 'borrower' as const : null;
  const statusText = status?.state === 1 ? status.score >= 60 ? 'Attested · waiting for lender' : 'Awaiting curator report'
    : status?.state === 2 ? 'Funded · repayment open'
      : status?.state === 3 ? 'Repaid'
        : status?.state === 4 ? 'Defaulted'
          : status?.state === 5 ? 'Cancelled' : null;

  const createRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const demo = await createLocalDemoRequest({ deployment, rpcUrl });
      const id = BigInt(demo.status.id);
      window.localStorage.setItem(demoRequestStorageKey, id.toString());
      onOpen(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The local demo request failed.');
    } finally {
      setBusy(false);
    }
  };

  const connectNextRole = async () => {
    if (!nextRole || !status) return;
    setRoleBusy(true);
    setError(null);
    try {
      await p.connectLocal(nextRole);
      onOpen(BigInt(status.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not connect the local test role.');
    } finally {
      setRoleBusy(false);
    }
  };

  return <Panel title="Run the contract demo" eyebrow="ANVIL · TEST USDC" action={<Badge tone="amber"><FlaskConical size={12} /> LOCAL ONLY</Badge>}>
    <div className="trader-panel-body trader-demo-body">
      <p className="trader-note">Create a test-USDC request on local Anvil using a sampled wallet that passes the research screen. Local impersonation exercises the contracts; no production wallet signs and trading history is not collateral.</p>
      <div className="trader-demo-status">
        <span>{status ? <>Request #{status.id} · {statusText}</> : loading ? 'Checking for a seeded request…' : 'No seeded request found'}</span>
        <Button variant="ghost" disabled={!online || loading} onClick={onRefresh} aria-label="Refresh local demo status"><RefreshCw size={14} /></Button>
      </div>
      {nextRole && <div className="trader-inline">
        <Button variant="secondary" disabled={!online || roleBusy} onClick={() => void connectNextRole()}>
          {roleBusy ? 'Connecting local account…' : `Connect local ${nextRole === 'resolver' ? 'curator' : nextRole}`}
        </Button>
        <span className="trader-note">Then use the request card below to {nextRole === 'resolver' ? 'submit its report' : nextRole === 'lender' ? 'review and fund it' : 'repay it'}.</span>
      </div>}
      <ol className="trader-demo-steps">
        <li>Use the local curator account to submit the report.</li>
        <li>Use the separate local lender account to accept the risk and fund.</li>
        <li>Repay with the labeled local demo borrower action on the funded request.</li>
      </ol>
      <label className="trader-demo-confirm"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
        I understand this uses test USDC and a controller impersonation on local Anvil only.
      </label>
      <div className="trader-inline">
        <Button variant="secondary" disabled={!online || !accepted || busy || activeRequest} onClick={() => void createRequest()}>
          {busy ? 'Creating on local chain…' : activeRequest ? 'Finish the open demo request first' : 'Create local test request'}
        </Button>
        {requestId && <Button variant="ghost" disabled={!online} onClick={() => onOpen(requestId)}>
          Open request #{requestId.toString()} <ArrowRight size={14} />
        </Button>}
        {status && status.id !== requestId?.toString() && <Button variant="ghost" disabled={!online} onClick={() => onOpen(BigInt(status.id))}>
          Open request #{status.id} <ArrowRight size={14} />
        </Button>}
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
    </div>
  </Panel>;
}

export function TraderCredit({ activeTab = 'Data', focusRiskSignal = 0, onTabChange }: { activeTab?: TraderCreditSection; onTabChange?: (tab: TraderCreditSection) => void; focusRiskSignal?: number }) {
  const p = useProtocol();
  const { deployment, online, rpcUrl } = p;
  const [request, setRequest] = useState<bigint>();
  const [demoRequestId, setDemoRequestId] = useState<bigint | undefined>(readDemoRequestId);
  const [demoStatus, setDemoStatus] = useState<LocalDemoStatus | null>(null);
  const [demoStatusLoading, setDemoStatusLoading] = useState(false);
  const local = deployment?.chainId === 31337 && deployment.mockCollateral && deployment.traderCredit?.mode === 'LOCAL_FORWARDER';
  const refreshDemoStatus = useCallback(async () => {
    if (!local || !online) return;
    setDemoStatusLoading(true);
    try {
      const result = await currentLocalDemo({ deployment, rpcUrl });
      setDemoStatus(result);
      if (result) {
        const id = BigInt(result.id);
        setDemoRequestId(id);
        window.localStorage.setItem(demoRequestStorageKey, id.toString());
      }
    } catch {
      setDemoStatus(null);
    } finally {
      setDemoStatusLoading(false);
    }
  }, [deployment, local, online, rpcUrl]);
  useEffect(() => { void refreshDemoStatus(); }, [refreshDemoStatus]);
  const openDemoRequest = (id: bigint) => {
    setDemoRequestId(id);
    setRequest(id);
    void refreshDemoStatus();
    onTabChange?.('Lend');
  };
  return <div className="trader-workspace">
    <div className="page-heading trader-card-head">
      <div><span className="eyebrow">AQRA / {activeTab === 'Data' ? 'PERFORMANCE UNDERWRITING' : activeTab === 'Borrow' ? 'BORROW DESK' : 'LENDER DESK'}</span><h1>{activeTab === 'Data' ? 'Performance-based lending' : activeTab}</h1>{activeTab === 'Data' && <p className="trader-note">Prediction-market performance metrics determine pilot eligibility; lenders choose whether to fund each bonded request.</p>}</div>
      {deployment?.traderCredit && <Badge tone="amber">{deployment.traderCredit.mode === 'LOCAL_FORWARDER' ? 'LOCAL TEST FUNDS' : 'SEPOLIA TESTNET'}</Badge>}
    </div>
    {activeTab !== 'Data' && <LocalDemoPanel requestId={demoRequestId} status={demoStatus} loading={demoStatusLoading} onRefresh={() => void refreshDemoStatus()} onOpen={openDemoRequest} />}
    <section aria-label={`${activeTab} section`}>
      {activeTab === 'Data' && <TraderReplay focusRiskSignal={focusRiskSignal} />}
      {activeTab === 'Borrow' && <><TraderBorrow onRequest={setRequest} /><TraderLoans mine selectedId={request} demoRequestId={demoRequestId} /></>}
      {activeTab === 'Lend' && <TraderLoans selectedId={request} demoRequestId={demoRequestId} />}
    </section>
  </div>;
}
