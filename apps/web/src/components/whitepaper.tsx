import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

export function Whitepaper() {
  return <article className="whitepaper">
    <header className="whitepaper-head">
      <div><span className="eyebrow">AQRA / PROTOCOL PAPER · 06 NOV 2026</span><h1>Trader credit</h1><p>Evidence-backed lending for prediction-market traders.</p></div>
      <Link href="/underwriting/" className="button secondary"><ArrowLeft size={14}/> Data</Link>
    </header>

    <section className="whitepaper-section">
      <h2>Abstract</h2>
      <p>AQRA evaluates a trader’s publicly observable, settled prediction-market history before a lender funds a small fixed-term loan. A deterministic underwriting policy, wallet consent and a borrower-funded first-loss bond make each request inspectable. The lender still assumes loss beyond the bond.</p>
      <p>The product tests a narrow claim: a past-performance screen may help organize credit decisions for prediction-market traders. It does not establish future profitability, repayment probability or principal protection.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Protocol</h2>
      <ol>
        <li><strong>Build evidence.</strong> AQRA reads settled Polymarket wallet history through a dated cutoff and records its evidence digest.</li>
        <li><strong>Prove account control.</strong> A borrower may group up to four wallets. ENS helps discover addresses; each linked controller must consent to the request.</li>
        <li><strong>Request credit.</strong> The borrower selects principal, fixed repayment and term, then escrows a first-loss bond.</li>
        <li><strong>Attest and fund.</strong> A pinned report sender attests to the policy result. A separate lender reviews the terms and funds the exact request.</li>
        <li><strong>Repay or record default.</strong> Repayment returns the bond. At maturity, a default can transfer the bond to the lender and records any remaining shortfall.</li>
      </ol>
      <p>The current trader-credit desk does not custody or liquidate native Polymarket positions. Wallet history is evidence for screening, not collateral. The separate outcome-token protocol is a local test demonstration and does not establish custody of external prediction-market claims.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Underwriting policy</h2>
      <p>Policy <code>aqra-trader-credit-v1</code> evaluates the three completed UTC months before the cutoff. A month is active at $500 or more of turnover and at least 20 trades. Eligibility requires two active months, two positive active months, positive combined realized P&amp;L, activity in the latest month and a score of at least 60 out of 100.</p>
      <div className="whitepaper-grid">
        <div className="whitepaper-fact"><span>Consistency</span><strong>40 points</strong></div>
        <div className="whitepaper-fact"><span>Realized efficiency</span><strong>35 points</strong></div>
        <div className="whitepaper-fact"><span>Observed drawdown</span><strong>25 points</strong></div>
        <div className="whitepaper-fact"><span>Maximum test principal</span><strong>$100</strong></div>
      </div>
      <p>These are screening rules, not a credit rating. The score is deterministic and tied to the policy version and evidence digest. Missing or unaudited history is held from funding.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Benchmark design</h2>
      <p>The data view uses monthly walk-forward rounds. Each decision cutoff uses only observations available before that date; measured outcomes are the following month’s realized trader P&amp;L and activity. The baseline and selection policies use the same sampled candidate universe.</p>
      <p>These results describe trader performance only. They are not simulated lender returns, repayment labels, collateral, or recovery. Polymarket daily P&amp;L is not account ROI because opening bankroll and full account equity are unavailable. High-multiple settled buys are exploratory cohorts and do not establish repeatable performance.</p>
      <p>Coverage, policy comparisons, wallet-level evidence and the dataset commitment are shown in <Link href="/underwriting/">Data</Link>.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Credit stress model</h2>
      <p>The Risk engine calculates principal shortfall after the posted bond and aggregates portfolio losses under adjustable default, dependence, recovery, capital-cost and reserve assumptions. It reports expected loss, VaR, Expected Shortfall, capital gap and modeled fee margin. Every default and correlation input is a scenario; the performance benchmark does not calibrate them.</p>
      <p>Pooled approval remains closed until AQRA has matured repayment/default labels, an out-of-time validated probability model and genuinely committed loss-absorbing capital. A hypothetical reserve control never counts as funded capital. The direct local demo requires a lender to accept the actual bond-only recovery limit.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Data and integrations</h2>
      <ul>
        <li><strong>Polymarket.</strong> Public P&amp;L and trade sources provide wallet-level observations. Boundary blocks are recorded so a decision has a verifiable as-of point.</li>
        <li><strong>ENS.</strong> Names and text records help discover wallet groups. A name alone does not prove control; linked wallets sign scoped consent.</li>
        <li><strong>Chainlink CRE.</strong> The workflow is designed to recompute evidence and submit an authenticated report. Local demo reports are explicitly labeled local. No public DON execution is claimed.</li>
        <li><strong>Arkiv.</strong> An optional expiring packet lets lenders discover a request and verify its claims against the loan record. Publishing requires the borrower’s wallet and network fees.</li>
      </ul>
    </section>

    <section className="whitepaper-section">
      <h2>Risk and limits</h2>
      <ul>
        <li>The lender can lose principal beyond the bond. A high score does not guarantee repayment.</li>
        <li>Prediction-market history may be incomplete, account-specific or affected by selection and survivorship bias.</li>
        <li>The application is a local or testnet prototype using test funds. It has no independent security audit or legal clearance.</li>
        <li>There is no production liquidity pool, automatic loan auction, real-market position custody or guaranteed liquidation.</li>
      </ul>
      <div className="whitepaper-links">
        <a href="https://docs.polymarket.com/api-reference/wallet/get-a-users-pnl-series" target="_blank" rel="noreferrer">Polymarket P&amp;L source <ArrowUpRight size={13}/></a>
        <a href="https://docs.chain.link/cre/capabilities/evm-read-write" target="_blank" rel="noreferrer">Chainlink CRE <ArrowUpRight size={13}/></a>
        <a href="https://www.bis.org/committees/bcbs/basel-framework/standard/cre.htm" target="_blank" rel="noreferrer">Basel PD/LGD/EAD <ArrowUpRight size={13}/></a>
        <a href="https://sites.math.washington.edu/~rtr/papers/rtr187-CVaR2.pdf" target="_blank" rel="noreferrer">Expected Shortfall reference <ArrowUpRight size={13}/></a>
      </div>
    </section>
  </article>;
}
