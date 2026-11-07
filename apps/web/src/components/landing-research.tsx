import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Plus, ShieldCheck } from 'lucide-react';
import styles from './landing.module.css';

const policies = [
  { name: 'Largest monthly P&L', rate: '73.6%', width: '73.6%', n: '220', highlight: false },
  { name: 'Consistency policy', rate: '70.0%', width: '70%', n: '220', highlight: true },
  { name: '≥100× settled buy', rate: '50.0%', width: '50%', n: '4', highlight: false },
  { name: '10×–<100× settled buy', rate: '34.4%', width: '34.4%', n: '160', highlight: false },
  { name: 'Seeded sample baseline', rate: '27.7%', width: '27.7%', n: '220', highlight: false },
];
const questions = [
  ['What does AQRA actually do?', 'AQRA combines public prediction-market wallet research, an assumption-driven credit-risk engine, and a wallet-signed bonded lending demonstration. The working interface has Data, Risk engine, Borrow and Lend views.'],
  ['Does a profitable history mean a borrower will repay?', 'No. Positive next-month trading P&L is not a repayment outcome, a default probability, return on equity or available collateral. The benchmark has no mature AQRA repayment/default labels.'],
  ['What can a lender lose?', 'The local example advances $100 against a $25 first-loss bond. If the borrower defaults and the full bond is recovered, the lender can still lose $75 of principal. Recovery haircuts can increase this loss. The $102 total due is not guaranteed.'],
  ['Can AQRA access my Polymarket positions?', 'No. This trader-credit desk only escrows the posted bond. It does not custody, liquidate or automatically sweep external positions, trading balances or future P&L. ENS discovery does not prove control of a wallet.'],
  ['Why does the pooled credit gate say REJECT?', 'There are no mature loan labels, calibrated default probabilities, passing out-of-time credit validation or funded shared reserve. Scenario inputs do not supply that evidence or capital. The binding pooled approval gate therefore remains closed.'],
  ['Is this ready for real money?', 'No. AQRA is unaudited local/testnet software using test funds. A local report or CRE simulation is not a public DON execution receipt. No production liquidity pool, legal clearance or mainnet safety is claimed.'],
];

export function LandingResearch() {
  return <>
    <section id="research" className={styles.research} aria-labelledby="research-title">
      <div className={styles.researchIntro}><span className={styles.eyebrow}>RESEARCH, WITH THE RECEIPTS</span><h2 id="research-title">Less folklore.<br/><span>More forward testing.</span></h2><p>Freeze the information at a monthly cutoff. Select a cohort. Observe the following month. Repeat—without letting tomorrow leak into today.</p><Link href="/whitepaper/" className={styles.textLink}>Read the study & limitations<ArrowUpRight size={17}/></Link><div className={styles.dateStamp}><span>NOV 2025 — OCT 2026</span><span>SAMPLED POLYMARKET DATA</span></div></div>
      <div className={styles.benchmark}><div className={styles.benchmarkHead}><span>POSITIVE NEXT-MONTH TRADER P&L</span><span>WALLET-MONTH EVENTS</span></div>{policies.map(policy => <div className={styles.policy} key={policy.name} data-highlight={policy.highlight}><div><span>{policy.name}</span><strong>{policy.rate}</strong></div><div className={styles.policyTrack}><i style={{ width: policy.width }}/></div><small>n = {policy.n}{policy.n === '4' ? ' · especially underpowered' : ''}</small></div>)}<p>Descriptive research, not loan results. Wallets can recur. The largest-monthly-P&L comparator outperformed the consistency policy in this sample. No causal or significance claim.</p></div>
      <div className={styles.coverage}><div><strong>764<span>/768</span></strong><span>Scheduled markets captured</span></div><div><strong>3,906</strong><span>Wallet histories</span></div><div><strong>3.65M</strong><span>Fill rows · 3,647,433 exact</span></div><div><strong>11</strong><span>Walk-forward rounds</span></div></div><p className={styles.sourceNote}>Source: supplied AQRA study, Tables I–II · Sampled panel, not a venue-wide census. Four missing sessions were not imputed. Counts describe research coverage, not customers or loans.</p>
    </section>
    <section className={styles.principles} aria-labelledby="principles-title"><div><span className={styles.eyebrow}>SAFETY IS A PRODUCT FEATURE</span><h2 id="principles-title">Know what the<br/>system <span>doesn’t know.</span></h2></div><div className={styles.principleList}><article><span>01</span><div><h3>History cannot secure a loan.</h3><p>Historical performance cannot secure a loan. The first-loss bond is the only pledged asset in this desk.</p></div></article><article><span>02</span><div><h3>Scenarios are not forecasts.</h3><p>PD, default correlation and bond recovery are explicit what-if assumptions—not calibrated estimates.</p></div></article><article><span>03</span><div><h3>A closed gate is an honest answer.</h3><p>Pooled approval remains REJECT until real repayment labels, credit validation and committed capital exist.</p></div></article></div></section>
    <section className={styles.faq} aria-labelledby="faq-title"><div><span className={styles.eyebrow}>BEFORE YOU CONNECT</span><h2 id="faq-title">Good questions.<br/><span>Straight answers.</span></h2></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={19}/></summary><p>{answer}</p></details>)}</div></section>
    <section className={styles.finalCta} aria-labelledby="cta-title"><div className={styles.ctaGrid} aria-hidden="true"/><span className={styles.eyebrow}>CONVICTION DESERVES CONTEXT.</span><h2 id="cta-title">Bring your questions.<br/>Explore the evidence.</h2><p>A transparent starting point for prediction-market trader credit.</p><div><Link href="/underwriting/" className={styles.primary}>Launch AQRA<ArrowUpRight size={18}/></Link><Link href="/whitepaper/" className={styles.textLink}>Read the whitepaper<ArrowRight size={17}/></Link></div><small><ShieldCheck size={14}/>LOCAL / TESTNET · TEST FUNDS · UNAUDITED</small></section>
  </>;
}
