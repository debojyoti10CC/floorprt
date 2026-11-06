'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Database, Layers3 } from 'lucide-react';
import { formatUnits } from 'viem';
import type { PolymarketPortfolio } from '../../../../services/underwriting/polymarket';
import { Address, Badge, Button } from './ui';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const shares = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const money = (value: number | null) => value == null ? '—' : currency.format(value);
const price = (value: number | null) => value == null ? '—' : (100 * value).toFixed(1) + '¢';

export function PolymarketHoldings({ portfolio }: { portfolio: PolymarketPortfolio }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const sorted = [...portfolio.positions].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const search = filter.trim().toLowerCase();
  const filtered = search ? sorted.filter(row => (row.title + ' ' + row.outcome).toLowerCase().includes(search)) : sorted;
  const visible = filtered.slice(0, expanded ? filtered.length : 8);
  const values = sorted.filter(row => row.value != null);
  const value = values.length ? values.reduce((sum, row) => sum + (row.value ?? 0), 0) : null;
  const confirmed = sorted.filter(row => row.onchain).length;

  return <div className="polymarket-holdings">
    <div className="poly-account-line">
      <div className="trader-inline"><strong>{portfolio.label || 'Trading wallet'}</strong><Address value={portfolio.account} /></div>
      <div className="trader-inline">
        {portfolio.sampled && <Badge tone="muted">PUBLIC SAMPLE</Badge>}
        <Badge tone="blue"><Database size={12} /> POLYMARKET DATA API</Badge>
        <Badge tone={portfolio.polygonBlock ? 'green' : 'muted'}>{portfolio.polygonBlock ? 'POLYGON BLOCK ' + portfolio.polygonBlock : 'INDEXER SNAPSHOT'}</Badge>
      </div>
    </div>
    <dl className="poly-portfolio-summary">
      <div><dt>Loaded mark value</dt><dd>{money(value)}</dd></div>
      <div><dt>Open positions</dt><dd>{sorted.length}{portfolio.more ? '+' : ''}</dd></div>
      <div><dt>Polygon confirmed</dt><dd>{portfolio.ledgersChecked ? confirmed : '—'}</dd></div>
      <div><dt>Matched markets</dt><dd>{portfolio.ledgersChecked ? portfolio.matched.length : '—'}</dd></div>
    </dl>
    {portfolio.matched.length > 0 && <div className="poly-pair-strip">
      <Layers3 size={17} aria-hidden="true" />
      <div><strong>Matched outcome balances</strong>
        {portfolio.matched.slice(0, 3).map(pair => <span key={pair.condition}>{pair.title} · {formatUnits(BigInt(pair.units), 6)} pairs</span>)}
        <small>Polygon inventory. Position escrow is available in the local lending demo.</small>
      </div>
    </div>}
    {!sorted.length ? <p className="trader-note" role="status">No open holdings returned. Check the trading address shown in your Polymarket profile.</p> : <>
      <div className="poly-table-controls">
        <span className="eyebrow">OUTCOME INVENTORY</span>
        <input aria-label="Filter Polymarket positions" placeholder="Filter positions" value={filter} onChange={event => setFilter(event.target.value)} />
      </div>
      <div className="poly-table-scroll">
        <table className="poly-table">
          <thead><tr><th scope="col">Market</th><th scope="col">Shares</th><th scope="col">Entry</th><th scope="col">Mark</th><th scope="col">Value</th><th scope="col">Open P&amp;L</th></tr></thead>
          <tbody>{visible.map(row => {
            const marketUrl = row.eventSlug && /^[a-z0-9-]{1,220}$/i.test(row.eventSlug) ? 'https://polymarket.com/event/' + row.eventSlug : null;
            const gain = row.unrealized !== null && row.unrealized >= 0;
            return <tr key={row.id}>
              <td>
                {marketUrl ? <a href={marketUrl} target="_blank" rel="noreferrer">{row.title} <ArrowUpRight size={12} /></a> : <strong>{row.title}</strong>}
                <div className="trader-inline">
                  <Badge tone={row.outcome.toLowerCase() === 'yes' ? 'green' : row.outcome.toLowerCase() === 'no' ? 'red' : 'blue'}>{row.outcome}</Badge>
                  {row.onchain && <span className="poly-confirmed" title={'ERC-1155 ledger: ' + row.onchain.ledger}><Check size={12} /> Polygon</span>}
                  {row.redeemable && <span className="poly-confirmed">Redeemable</span>}
                </div>
              </td>
              <td title={'Polymarket indexed size: ' + row.size}>{row.onchain ? formatUnits(BigInt(row.onchain.units), 6) : shares.format(row.size)}</td>
              <td>{price(row.average)}</td><td>{price(row.mark)}</td><td>{money(row.value)}</td>
              <td className={row.unrealized === null ? '' : gain ? 'poly-gain' : 'trader-loss'}>
                {row.unrealized !== null && (gain ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)} {money(row.unrealized)}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!visible.length && <p className="trader-note" role="status">No positions match this filter.</p>}
      <div className="poly-portfolio-footer">
        <small>Snapshot {new Date(portfolio.capturedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC{portfolio.more ? ' · partial portfolio' : ''}</small>
        {filtered.length > 8 && <Button variant="ghost" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer' : 'Show all ' + filtered.length}</Button>}
      </div>
    </>}
  </div>;
}
