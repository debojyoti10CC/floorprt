'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, Fingerprint, Wallet } from 'lucide-react';
import { COHORTS, type CandidateRow, type Cohort, type UnderwritingRun } from '../../../../services/underwriting/report';
import { Address, Badge, Button, Panel, Stat } from './ui';
import { TraderRisk } from './trader-risk';
import { short } from '../lib/protocol';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-US');
export const usd = (micros: number | bigint | null | undefined) => micros == null ? '—' : currency.format(Number(micros) / 1_000_000);
const cohortKeys = Object.keys(COHORTS) as Cohort[];
const pageSize = 12;

function ReplayTrajectory({ run }: { run: UnderwritingRun }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stale = false;
    let chart: import('echarts').ECharts | undefined;
    let resize: ResizeObserver | undefined;
    void import('echarts').then(({ init }) => {
      if (stale || !host.current) return;
      const css = getComputedStyle(document.documentElement);
      const token = (name: string) => css.getPropertyValue(name).trim();
      const colors = {
        score: token('--chart-high'), pnl: token('--color-positive'), tail10: token('--color-warning'),
        tail100: token('--chart-low'), baseline: token('--color-negative'),
      };
      const labels = { score: 'Performance policy', pnl: 'Highest monthly P&L', tail10: '10×–<100× buy', tail100: '≥100× buy', baseline: 'Sample baseline' };
      const series = run.summary.filter(row => row.selected > 0).map(({ cohort }) => {
        return {
          name: labels[cohort], type: 'line' as const, symbol: 'circle', symbolSize: 5, connectNulls: false,
          data: run.rounds.map(round => {
            const result = round.results.find(row => row.cohort === cohort);
            return result?.evaluated ? Number((result.forwardProfitable / result.evaluated * 100).toFixed(2)) : null;
          }),
          itemStyle: { color: colors[cohort] }, lineStyle: { width: 2, type: cohort === 'baseline' ? 'dashed' as const : 'solid' as const },
        };
      });
      chart = init(host.current, undefined, { renderer: 'svg' });
      chart.setOption({
        animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        animationDuration: 250,
        textStyle: { fontFamily: 'Poppins, sans-serif' },
        legend: { bottom: 1, textStyle: { color: token('--color-text-tertiary'), fontSize: 11 } },
        grid: { left: 65, right: 20, top: 20, bottom: 67 },
        tooltip: {
          trigger: 'axis', confine: true, backgroundColor: token('--color-surface-raised'),
          borderColor: token('--color-border-default'), textStyle: { color: token('--color-text-primary') },
          valueFormatter: (value: unknown) => typeof value === 'number' ? `${value.toFixed(1)}%` : 'No observations',
        },
        xAxis: {
          type: 'category', boundaryGap: false, data: run.rounds.map(row => row.forwardMonth),
          axisLabel: { color: token('--color-text-tertiary'), fontSize: 11 },
          axisLine: { lineStyle: { color: token('--chart-grid') } },
        },
        yAxis: {
          type: 'value', min: 0, max: 100, axisLabel: { color: token('--color-text-tertiary'), formatter: (value: number) => `${value}%` },
          splitLine: { lineStyle: { color: token('--chart-grid'), type: 'dashed' } },
        },
        series,
      });
      resize = new ResizeObserver(() => chart?.resize());
      resize.observe(host.current);
    }).catch(() => { /* The policy totals and monthly table remain available. */ });
    return () => { stale = true; resize?.disconnect(); chart?.dispose(); };
  }, [run]);
  return <div ref={host} className="trader-trajectory" role="img" aria-label="Share of selected traders with positive realized P&L in the following month, by selection policy. Monthly counts are available in the cohort table." />;
}

function CandidateDetails({ row }: { row: CandidateRow }) {
  const evidence = row.evidence;
  return <div className="trader-panel-body trader-details">
    <div className="trader-inline">
      <Address value={row.wallet} />
      <Badge tone={evidence?.decision.qualified ? 'green' : 'muted'}>{evidence?.decision.reason ?? 'History unavailable'}</Badge>
    </div>
    <dl className="trader-metrics">
      <div><dt>Score</dt><dd>{evidence?.decision.score ?? '—'}/100</dd></div>
      <div><dt>Recent active months</dt><dd>{evidence?.decision.activeMonths ?? '—'}/3</dd></div>
      <div><dt>Following month P&L</dt><dd>{usd(row.forward?.pnl)}</dd></div>
      <div><dt>Largest settled buy</dt><dd>{row.bestGrossBuyMultiple == null ? '—' : row.bestGrossBuyMultiple.toFixed(2) + '×'}</dd></div>
    </dl>
    {row.bestFill && <a href={'https://polygonscan.com/tx/' + row.bestFill.tx} target="_blank" rel="noreferrer" className="text-link">
      Polygon fill · {currency.format(row.bestFill.cost)} cost · {currency.format(row.bestFill.payout)} gross payout
    </a>}
    {evidence && <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>As-of window</th><th>Realized P&L</th><th>Turnover</th><th>Trades</th><th>P&L drawdown</th></tr></thead>
          <tbody>{evidence.windows.map((window, index) => <tr key={index}>
            <td>{window?.month ?? 'Missing coverage'}</td>
            <td>{usd(window?.pnl)}</td><td>{usd(window?.turnover)}</td>
            <td>{window?.trades ?? '—'}</td><td>{usd(window?.pnlDrawdown)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="trader-inline trader-note"><span>Evidence digest</span><Address value={evidence.digest} /></div>
    </>}
  </div>;
}

export function TraderReplay({ focusRiskSignal = 0 }: { focusRiskSignal?: number }) {
  const [run, setRun] = useState<UnderwritingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState('');
  const [cohort, setCohort] = useState<Cohort | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CandidateRow | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/underwriting/run.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Run pnpm underwriting:collect and pnpm underwriting:replay to load the evidence.');
        return response.json() as Promise<UnderwritingRun>;
      })
      .then(data => {
        if (data.schema !== 'aqra-underwriting-v2' || !data.rounds.length) throw new Error('The replay artifact is invalid.');
        if (controller.signal.aborted) return;
        setRun(data);
        setMonth(data.rounds.at(-1)!.month);
      }).catch(reason => {
        if (!controller.signal.aborted) setError((reason as Error).message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!focusRiskSignal || !run) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('risk-engine')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [focusRiskSignal, run]);

  const matches = useMemo(() => run?.candidates
    .filter(row => row.month === month && (cohort === 'all' || row.selectedBy.includes(cohort))
      && row.wallet.includes(search.trim().toLowerCase()))
    .sort((a, b) => (b.evidence?.decision.score ?? -1) - (a.evidence?.decision.score ?? -1) || a.wallet.localeCompare(b.wallet)) ?? [],
  [run, month, cohort, search]);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const chosen = selected?.month === month && matches.includes(selected) ? selected : matches[0];
  const round = run?.rounds.find(row => row.month === month);
  if (error) return <Panel title="Replay unavailable"><div className="trader-panel-body error-box" role="alert">{error}</div></Panel>;
  if (!run) return <Panel title="Loading evidence"><div className="trader-panel-body" role="status">Reading the captured replay…</div></Panel>;

  const chosenMonth = run.coverage.decisionMonths.find(row => row.month === month);
  const overall = (key: Cohort) => run.summary.find(row => row.cohort === key);
  const consistency = overall('score');
  const pnlRank = overall('pnl');
  const baseline = overall('baseline');
  const hitRate = (row: typeof consistency) => row?.evaluated
    ? `${row.forwardProfitable}/${row.evaluated} · ${(row.forwardProfitable / row.evaluated * 100).toFixed(1)}%`
    : 'no forward observations';
  const leadPp = consistency?.evaluated && pnlRank?.evaluated
    ? (consistency.forwardProfitable / consistency.evaluated - pnlRank.forwardProfitable / pnlRank.evaluated) * 100
    : null;
  return <>
    <div className="stats-grid three">
      <Stat label="Wallet histories" value={`${number.format(run.coverage.pnlCaptured)} / ${number.format(run.coverage.pnlWallets)}`} detail={number.format(run.coverage.pnlDays) + ' daily observations'} icon={<Wallet size={15} />} />
      <Stat label="Walk-forward rounds" value={run.rounds.length} detail={run.first + ' → ' + run.last + ' UTC · ' + run.sampleProfile} icon={<BarChart3 size={15} />} />
      <Stat label="Polymarket fills" value={number.format(run.coverage.polyFills)} detail={`${run.coverage.polyMarkets} / ${run.coverage.polyPlanned} resolved sample markets`} icon={<Fingerprint size={15} />} />
    </div>
    <Panel title="Forward trader outcomes" eyebrow="WALLET-MONTHS · NEXT-MONTH P&amp;L" action={<a className="button secondary" href="/underwriting/run.json" download="aqra-underwriting-run.json"><Download size={14} /> Export data</a>}>
      <div className="trader-panel-body">
        <p className="trader-note">Consistency screen: {hitRate(consistency)} positive next month. Monthly P&amp;L rank: {hitRate(pnlRank)}; seeded sample: {hitRate(baseline)}. {leadPp !== null && `The consistency screen was ${Math.abs(leadPp).toFixed(1)} percentage points ${leadPp < 0 ? 'below' : 'above'} monthly P&L rank. `}These are repeated wallet-month performance observations, not loan repayment outcomes.</p>
        <div className="trader-replay-layout">
        <ReplayTrajectory run={run} />
        <div className="trader-bars" aria-label="Following-month positive realized P&L rate by policy">
          {run.summary.map(row => <div className="trader-bar-row" key={row.cohort}>
            <div><strong>{COHORTS[row.cohort]}</strong><span>{row.forwardProfitable}/{row.evaluated} profitable · {row.selected} selected</span></div>
            <div className="trader-bar-track" aria-hidden="true"><span className="gain" style={{ width: (row.evaluated ? row.forwardProfitable / row.evaluated * 100 : 0) + '%' }} /></div>
            <b className="mono">{row.evaluated ? `${(row.forwardProfitable / row.evaluated * 100).toFixed(1)}%` : '—'}</b>
          </div>)}
        </div>
        </div>
        <details className="trader-method">
          <summary>Data coverage</summary>
          <p>{run.coverage.verifiedBoundaries}/{run.coverage.totalBoundaries} UTC boundary blocks verified on Polygon. Polymarket histories provide wallet-level realized P&amp;L. Selection is tested against the following month; the final decision month has no completed forward outcome.</p>
          <p>Historical loan repayment/default labels, opening account bankroll, and timestamped trader forecast probabilities are unavailable. The benchmark does not estimate lender returns, probability of default, or Brier skill.</p>
          <div className="trader-inline">Dataset commitment <Address value={run.datasetHash} /></div>
        </details>
      </div>
    </Panel>
    <div id="risk-engine" className="trader-risk-anchor"><TraderRisk run={run} month={month} /></div>
    <Panel title="Cohort decisions" eyebrow="UTC MONTHLY CUTOFF">
      <div className="trader-panel-body">
        <div className="trader-controls">
          <label>Decision month<select value={month} onChange={event => { setMonth(event.target.value); setPage(0); setSelected(null); }}>
            {run.coverage.decisionMonths.map(row => <option key={row.month}>{row.month}</option>)}
          </select></label>
          <label>Selection policy<select value={cohort} onChange={event => { setCohort(event.target.value as Cohort | 'all'); setPage(0); }}>
            <option value="all">All candidates</option>
            {cohortKeys.map(key => <option key={key} value={key}>{COHORTS[key]}</option>)}
          </select></label>
          <label>Wallet search<input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="0x…" /></label>
        </div>
        <div className="trader-inline trader-note">
          <Badge tone="blue">{round ? round.month + ' → ' + round.forwardMonth : 'Forward month incomplete'}</Badge>
          <span>{chosenMonth?.sampled ?? 0} candidates · {chosenMonth?.qualified ?? 0} pass policy · {chosenMonth?.observed10x ?? 0} observed ≥10× buys · {chosenMonth?.observed100x ?? 0} observed ≥100× buys</span>
        </div>
        {round && <div className="table-wrap">
          <table><thead><tr><th>Selection policy</th><th>Selected wallets</th><th>Forward observed</th><th>Profitable next month</th><th>Median next-month P&amp;L</th></tr></thead>
          <tbody>{round.results.map(row => <tr key={row.cohort}>
            <td>{COHORTS[row.cohort]}</td><td>{row.selected}</td><td>{row.evaluated}</td>
            <td>{row.evaluated ? `${row.forwardProfitable}/${row.evaluated} · ${(row.forwardProfitable / row.evaluated * 100).toFixed(1)}%` : '—'}</td>
            <td className="mono">{usd(row.medianForwardPnl)}</td>
          </tr>)}</tbody></table>
        </div>}
        <div className="table-wrap trader-candidate-table">
          <table><thead><tr><th>Public wallet</th><th>Score</th><th>Decision P&L</th><th>Next month P&L</th><th>Policy status</th></tr></thead>
          <tbody>{matches.slice(page * pageSize, (page + 1) * pageSize).map(row => <tr key={row.wallet} className={chosen === row ? 'trader-selected' : ''}>
            <td><button className="trader-table-link mono" type="button" title={row.wallet} aria-pressed={chosen === row} onClick={() => setSelected(row)}>{short(row.wallet)}</button></td>
            <td>{row.evidence?.decision.score ?? '—'}</td><td className="mono">{usd(row.current?.pnl)}</td>
            <td className="mono">{usd(row.forward?.pnl)}</td><td><Badge tone={row.evidence?.decision.qualified ? 'green' : 'muted'}>{row.evidence?.decision.qualified ? 'Review' : 'Hold'}</Badge></td>
          </tr>)}</tbody></table>
          {!matches.length && <p className="trader-note">No matching wallets in this cutoff and policy.</p>}
        </div>
        <div className="trader-inline">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="trader-note">{page + 1}/{pageCount} · {matches.length} wallets</span>
          <Button variant="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </Panel>
    {chosen && <Panel title="Wallet evidence" eyebrow="CUTOFF SNAPSHOT"><CandidateDetails row={chosen} /></Panel>}
  </>;
}
