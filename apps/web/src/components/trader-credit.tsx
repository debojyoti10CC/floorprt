'use client';

import { useState } from 'react';
import { useProtocol } from '../lib/protocol';
import { TraderBorrow } from './trader-borrow';
import { TraderLoans } from './trader-loans';
import { TraderReplay } from './trader-replay';
import { Badge } from './ui';

export type TraderCreditSection = 'Data' | 'Borrow' | 'Lend';

export function TraderCredit({ activeTab = 'Data', focusRiskSignal = 0 }: { activeTab?: TraderCreditSection; onTabChange?: (tab: TraderCreditSection) => void; focusRiskSignal?: number }) {
  const { deployment } = useProtocol();
  const [request, setRequest] = useState<bigint>();
  return <div className="trader-workspace">
    <div className="page-heading trader-card-head">
      <div><span className="eyebrow">AQRA / {activeTab === 'Data' ? 'CREDIT RESEARCH' : activeTab === 'Borrow' ? 'BORROW DESK' : 'LENDER DESK'}</span><h1>{activeTab === 'Data' ? 'Trader credit' : activeTab}</h1></div>
      {deployment?.traderCredit && <Badge tone="amber">{deployment.traderCredit.mode === 'LOCAL_FORWARDER' ? 'LOCAL TEST FUNDS' : 'SEPOLIA TESTNET'}</Badge>}
    </div>
    <section aria-label={`${activeTab} section`}>
      {activeTab === 'Data' && <TraderReplay focusRiskSignal={focusRiskSignal} />}
      {activeTab === 'Borrow' && <><TraderBorrow onRequest={setRequest} /><TraderLoans mine selectedId={request} /></>}
      {activeTab === 'Lend' && <TraderLoans selectedId={request} />}
    </section>
  </div>;
}
