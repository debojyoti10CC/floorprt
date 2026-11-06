'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Cohort, UnderwritingRun } from '../../../../services/underwriting/report';
import { calculateRisk, decideCreditLimit, type RiskInput } from '../../../../services/underwriting/risk-engine';
import { Badge, Panel } from './ui';

const cohortOptions: { key: Cohort; label: string }[] = [
  { key: 'score', label: 'Performance policy' },
  { key: 'pnl', label: 'Highest monthly P&L' },
  { key: 'tail10', label: '10× to <100× settled buy' },
  { key: 'tail100', label: '≥100× settled buy' },
  { key: 'baseline', label: 'Sample baseline' },
];
const percent = (bps: number | null) => bps == null ? '—' : `${(bps / 100).toFixed(2)}%`;
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const currency = (micros: number) => currencyFormatter.format(Math.round(micros) / 1_000_000);

function LossDistributionChart({ distribution }: { distribution: ReturnType<typeof calculateRisk>['distribution'] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stale = false;
    let chart: import('echarts').ECharts | undefined;
    let resize: ResizeObserver | undefined;
    void import('echarts').then(({ init }) => {
      if (stale || !host.current) return;
      const css = getComputedStyle(document.documentElement);
      const token = (name: string) => css.getPropertyValue(name).trim();
      chart = init(host.current, undefined, { renderer: 'svg' });
      chart.setOption({
        animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        animationDuration: 180,
        textStyle: { fontFamily: 'Poppins, sans-serif' },
        grid: { left: 56, right: 16, top: 18, bottom: 48 },
        tooltip: {
          trigger: 'item', confine: true, backgroundColor: token('--color-surface-raised'),
          borderColor: token('--color-border-default'), textStyle: { color: token('--color-text-primary') },
          formatter: (item: { dataIndex: number }) => {
            const point = distribution[item.dataIndex];
            return `${point.defaults} default${point.defaults === 1 ? '' : 's'}<br/>Loss: ${currency(point.loss)}<br/>Probability: ${(point.probability * 100).toFixed(4)}%`;
          },
        },
        xAxis: {
          type: 'category', data: distribution.map(point => String(point.defaults)),
          name: 'Defaults in portfolio', nameLocation: 'middle', nameGap: 28,
          nameTextStyle: { color: token('--color-text-secondary'), fontSize: 11 },
          axisLabel: { color: token('--color-text-secondary'), fontSize: 10, interval: Math.max(0, Math.floor(distribution.length / 10)) },
          axisLine: { lineStyle: { color: token('--chart-grid') } }, axisTick: { show: false },
        },
        yAxis: {
          type: 'value', name: 'Scenario probability', nameTextStyle: { color: token('--color-text-secondary'), fontSize: 11 },
          axisLabel: { color: token('--color-text-secondary'), formatter: (value: number) => `${value}%` },
          splitLine: { lineStyle: { color: token('--chart-grid'), type: 'dashed' } },
        },
        series: [{
          type: 'bar', barMaxWidth: 24,
          data: distribution.map(point => ({
            value: point.probability * 100,
            itemStyle: { color: point.defaults === distribution.length - 1 ? token('--color-negative') : token('--chart-mid') },
          })),
          itemStyle: { borderRadius: [3, 3, 0, 0] },
        }],
      });
      resize = new ResizeObserver(() => chart?.resize());
      resize.observe(host.current);
    }).catch(() => { /* The full probability table remains available if chart code cannot load. */ });
    return () => { stale = true; resize?.disconnect(); chart?.dispose(); };
  }, [distribution]);
  return <div ref={host} className="trader-risk-chart" role="img" aria-label="Modeled portfolio loss probability by number of defaults. Exact discrete outcomes are listed below." />;
}

export function TraderRisk({ run, month }: { run: UnderwritingRun; month: string }) {
  const [policy, setPolicy] = useState<Cohort>('score');
  const [pdBps, setPdBps] = useState(500);
  const [correlationBps, setCorrelationBps] = useState(2_500);
  const [bondRecoveryBps, setBondRecoveryBps] = useState(10_000);
  const [confidenceBps, setConfidenceBps] = useState(9_900);
  const [capitalChargeBps, setCapitalChargeBps] = useState(1_000);
  const [operatingCostUsd, setOperatingCostUsd] = useState(0);
  const [scenarioCapitalUsd, setScenarioCapitalUsd] = useState(0);
  const round = run.rounds.find(item => item.month === month);
  const exposures = round?.results.find(item => item.cohort === policy)?.selected ?? 0;
  const input: RiskInput = {
    exposureCount: exposures,
    principal: run.policy.principal,
    bondBps: run.policy.bondBps,
    bondRecoveryBps,
    feeBps: run.policy.feeBps,
    pdBps,
    defaultCorrelationBps: correlationBps,
    confidenceBps,
    capitalChargeBps,
    operatingCostPerLoan: Math.round(operatingCostUsd * 1_000_000),
    scenarioCapital: Math.round(scenarioCapitalUsd * 1_000_000),
  };
  const risk = useMemo(() => calculateRisk(input), [exposures, run.policy.bondBps, run.policy.feeBps, run.policy.principal, pdBps, correlationBps, confidenceBps, capitalChargeBps, bondRecoveryBps, scenarioCapitalUsd, operatingCostUsd]);
  const decision = useMemo(() => decideCreditLimit(input, {
    requestedLoans: exposures,
    calibratedPd: false,
    outOfTimeValidationPassed: false,
    repaymentLabels: 0,
    committedCapital: 0,
  }), [risk, exposures]);
  const nonZero = risk.distribution.filter(point => point.probability > 1e-10);
  const defaultAny = nonZero.filter(point => point.defaults > 0).reduce((sum, point) => sum + point.probability, 0);
  const fullDefault = risk.distribution.at(-1)?.probability ?? 0;

  return <Panel title="Risk engine" eyebrow="CREDIT LOSS STRESS · ASSUMPTIONS EXPLICIT">
    <div className="trader-panel-body">
      <div className="trader-risk-gate" role="status">
        <div className="trader-risk-gate-icon"><ShieldAlert size={18} /></div>
        <div>
          <div className="trader-inline"><strong>Pool underwriting: {decision.status}</strong><Badge tone="red">NOT CALIBRATED</Badge></div>
          <p>Pool credit is disabled until loan outcomes, a validated PD model and funded loss capital are available. Direct demo lenders may fund only after accepting bond-only recovery.</p>
          <span>{decision.bindingReasons.join(' · ')}</span>
        </div>
      </div>

      <div className="trader-risk-controls">
        <label>Decision cohort<select value={policy} onChange={event => setPolicy(event.currentTarget.value as Cohort)}>
          {cohortOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select></label>
        <label>Default probability assumption <output>{percent(pdBps)}</output><input aria-label="Assumed probability of default" type="range" min="0" max="50" step="1" value={pdBps / 100} onChange={event => setPdBps(Number(event.currentTarget.value) * 100)} /></label>
        <label>Pairwise default correlation assumption <output>{percent(correlationBps)}</output><input aria-label="Assumed pairwise default correlation" type="range" min="0" max="100" step="5" value={correlationBps / 100} onChange={event => setCorrelationBps(Number(event.currentTarget.value) * 100)} /></label>
        <label>Bond recovery stress <output>{percent(bondRecoveryBps)}</output><input aria-label="Assumed recovery of the posted bond" type="range" min="0" max="100" step="5" value={bondRecoveryBps / 100} onChange={event => setBondRecoveryBps(Number(event.currentTarget.value) * 100)} /></label>
        <label>Tail confidence<select value={confidenceBps} onChange={event => setConfidenceBps(Number(event.currentTarget.value))}>
          <option value={9500}>95%</option><option value={9900}>99%</option><option value={9950}>99.5%</option>
        </select></label>
        <label>Capital charge per loan period <output>{percent(capitalChargeBps)}</output><input aria-label="Assumed capital charge for this loan period" type="range" min="0" max="50" step="1" value={capitalChargeBps / 100} onChange={event => setCapitalChargeBps(Number(event.currentTarget.value) * 100)} /></label>
        <label>Operating cost per loan <output>{currency(input.operatingCostPerLoan)}</output><input aria-label="Assumed operating cost per loan" type="range" min="0" max="20" step="0.25" value={operatingCostUsd} onChange={event => setOperatingCostUsd(Number(event.currentTarget.value))} /></label>
        <label>Scenario capital (not funded)<output>{currency(input.scenarioCapital)}</output><input aria-label="Hypothetical risk capital, not committed" type="range" min="0" max="500000" step="5000" value={scenarioCapitalUsd} onChange={event => setScenarioCapitalUsd(Number(event.currentTarget.value))} /></label>
      </div>

      <div className="stats-grid three trader-risk-stats">
        <div className="stat"><span className="stat-label">Expected credit loss</span><strong className="stat-value">{currency(risk.expectedLoss)}</strong><span className="stat-detail">At the selected default assumption</span></div>
        <div className="stat"><span className="stat-label">VaR · {percent(confidenceBps)}</span><strong className="stat-value">{currency(risk.valueAtRisk)}</strong><span className="stat-detail">Discrete portfolio loss quantile</span></div>
        <div className="stat"><span className="stat-label">Expected Shortfall · {percent(confidenceBps)}</span><strong className="stat-value">{currency(risk.expectedShortfall)}</strong><span className="stat-detail">Average loss in worst tail mass</span></div>
        <div className="stat"><span className="stat-label">Unfunded stress capital</span><strong className="stat-value trader-loss">{currency(risk.requiredCapital)}</strong><span className="stat-detail">Higher of tail loss and common-shock loss</span></div>
        <div className="stat"><span className="stat-label">Expected risk-adjusted margin</span><strong className={`stat-value ${risk.expectedRiskAdjustedMargin < 0 ? 'trader-loss' : ''}`}>{currency(risk.expectedRiskAdjustedMargin)}</strong><span className="stat-detail">Fee income after modeled losses and capital cost</span></div>
        <div className="stat"><span className="stat-label">Break-even PD</span><strong className="stat-value">{percent(risk.breakEvenPdBps)}</strong><span className="stat-detail">Fee covers modeled risk price</span></div>
      </div>

      <div className="trader-risk-facts">
        <div><span>Exposures in selected month</span><strong>{risk.exposureCount}</strong></div>
        <div><span>Principal / exposure</span><strong>{currency(risk.principal)}</strong></div>
        <div><span>Bond / exposure</span><strong>{currency(risk.bond)} · {percent(run.policy.bondBps)}</strong></div>
        <div><span>Bond value under stress</span><strong>{currency(risk.recoveredBond)} · {percent(risk.bondRecoveryBps)} recovery</strong></div>
        <div><span>Loss if one defaults</span><strong>{currency(risk.lossPerDefault)} · {percent(risk.lgdBps)} LGD</strong></div>
        <div><span>Expected fee revenue</span><strong>{currency(risk.expectedFeeRevenue)}</strong></div>
        <div><span>P(any default) in scenario</span><strong>{percent(Math.round(defaultAny * 10_000))}</strong></div>
        <div><span>All-default loss</span><strong>{currency(risk.mandatoryStressLoss)}</strong></div>
        <div><span>All-default probability</span><strong>{percent(Math.round(fullDefault * 10_000))}</strong></div>
      </div>

      <div className="trader-risk-chart-layout">
        <div><h3>Discrete loss distribution</h3><p className="trader-note">Beta-binomial default-count model. Assumed default correlation is the pairwise correlation between borrower default indicators.</p><LossDistributionChart distribution={risk.distribution} /></div>
        <div className="trader-risk-math">
          <h3>Loan and reserve terms</h3>
          <dl>
            <div><dt>Principal due</dt><dd>{currency(risk.principal)} per loan</dd></div>
            <div><dt>Borrower bond</dt><dd>{currency(risk.bond)} per loan</dd></div>
            <div><dt>Bond value under stress</dt><dd>{currency(risk.recoveredBond)} per loan</dd></div>
            <div><dt>Lender loss after bond</dt><dd>{currency(risk.lossPerDefault)} per default</dd></div>
            <div><dt>Unfunded stress capital</dt><dd>{currency(risk.requiredCapital)} across selected loans</dd></div>
            <div><dt>Scenario capital / remaining gap</dt><dd>{currency(risk.scenarioCapital)} / {currency(risk.capitalGap)}</dd></div>
            <div><dt>Scenario capital coverage</dt><dd>{percent(risk.coverageRatioBps)}</dd></div>
            <div><dt>Operating cost input</dt><dd>{currency(input.operatingCostPerLoan)} per loan</dd></div>
          </dl>
          <div className="trader-inline trader-note"><AlertTriangle size={14} /> Future trading P&amp;L is not collateral and never offsets default loss here.</div>
        </div>
      </div>

      <details className="trader-method">
        <summary>Scenario loss table</summary>
        <div className="table-wrap"><table>
          <thead><tr><th>Defaulted borrowers</th><th>Loss</th><th>Scenario probability</th><th>Cumulative probability</th></tr></thead>
          <tbody>{risk.distribution.map((point, index) => {
            const cumulative = risk.distribution.slice(0, index + 1).reduce((sum, row) => sum + row.probability, 0);
            return <tr key={point.defaults}><td>{point.defaults}</td><td>{currency(point.loss)}</td><td>{percent(Math.round(point.probability * 10_000))}</td><td>{percent(Math.min(10_000, Math.round(cumulative * 10_000)))}</td></tr>;
          })}</tbody>
        </table></div>
      </details>
      <p className="trader-note">Historical trader P&amp;L is out-of-sample performance evidence only. It does not estimate repayment probability. Forecast skill is unavailable because the captured data contains no timestamped trader probability forecasts. Scenario assumptions are not observed frequencies.</p>
    </div>
  </Panel>;
}
