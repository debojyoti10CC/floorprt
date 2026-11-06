import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

const cohorts = [
  { label: 'Consistency screen', wins: 154, n: 220, rate: 70.0, ci: '63.6–75.7%' },
  { label: 'Largest monthly P&L', wins: 162, n: 220, rate: 73.6, ci: '67.4–79.0%' },
  { label: '10× to below 100× settled buy', wins: 55, n: 160, rate: 34.4, ci: '27.5–42.0%' },
  { label: '100× or higher settled buy', wins: 2, n: 4, rate: 50.0, ci: '15.0–85.0%' },
  { label: 'Seeded sample baseline', wins: 61, n: 220, rate: 27.7, ci: '22.2–34.0%' },
];

const venues = [
  ['Polymarket', 'Public wallet P&L, trades, activity, positions', 'Public address; account may be proxy/deposit wallet', 'Current benchmark; primary source'],
  ['OPINION', 'Filled wallet trades include fee, quote token and USD value; positions expose open holdings', 'API key required; wallet lookup; paginated', 'Priority real-money adapter; reconcile fills, fees and settlement'],
  ['Predict.fun', 'Address-level fills, positions, activity and BNB Chain settlement events', 'Mainnet API key; smart-account mapping; independent indexer has recent-only BNB history', 'Priority short-window cohort; capture separately and verify history depth'],
  ['Limitless', 'Owner portfolio, fills and history', 'Authenticated account key; HMAC on portfolio endpoints', 'Consent-only account import; not public trader census'],
  ['Kalshi', 'Public markets; private member orders, trades, portfolio', 'Member API key signs requests; user account data', 'Borrower-authorized export/API only; data-use approval needed'],
  ['Gemini Predictions', 'Public market data; private account positions and order history', 'Authenticated API/OAuth; no public trader census', 'Borrower-authorized account adapter after history completeness review'],
  ['Manifold', 'Public bets, users and portfolio history', 'Virtual M$; free bulk dumps are non-commercial and stop at July 2024', 'Separate behavioral cohort only; never cash-credit evidence'],
  ['Prediction.com', 'Cross-venue event matching, prices and market history', 'API key; market-data coverage, not trader account history', 'Discovery and market matching only; not a trader cohort'],
  ['Bitquery', 'Decoded Polygon and BNB fills, resolutions and settlements', 'Provider API/plan; Predict.fun archive begins 22 Oct 2026', 'Independent chain reconciliation; deduplicate against venue APIs'],
];

export function Whitepaper() {
  return <article className="whitepaper">
    <header className="whitepaper-head">
      <div>
        <span className="eyebrow">AQRA / RESEARCH PAPER · 06 NOV 2026</span>
        <h1>Prediction-market performance-metrics-based lending</h1>
        <p>Performance data screens borrower requests; an independent lender decides whether to fund.</p>
        <div className="whitepaper-authors">Debojyoti De Majumder · Sylvia Barick · Swarupa Saha · Ahir Sarkar<br/>Institute of Engineering and Management, Kolkata</div>
      </div>
      <div className="whitepaper-head-actions"><a className="button secondary" href="https://raw.githubusercontent.com/debojyoti10CC/floorprt/main/paper/main.tex" target="_blank" rel="noreferrer">IEEE LaTeX <ArrowUpRight size={14}/></a><a className="button secondary" href="https://raw.githubusercontent.com/debojyoti10CC/floorprt/main/paper/references.bib" target="_blank" rel="noreferrer">Bibliography <ArrowUpRight size={14}/></a><Link href="/underwriting/" className="button secondary"><ArrowLeft size={14}/> Data</Link></div>
    </header>

    <section className="whitepaper-section">
      <h2>Abstract</h2>
      <p>AQRA is a lender-controlled credit desk that uses a trader’s dated prediction-market performance as an eligibility signal for a small, bonded loan request. The borrower supplies wallet history, reviews the cutoff and score, and signs a fixed-term request with a USDC bond. A lender verifies the report and terms before funding. The benchmark measures future trader P&amp;L, not willingness or ability to repay; the score is therefore an auditable screening signal, not a validated credit score.</p>
      <p>The current contract demo advances $100 with $102 due and a $25 bond. At full bond recovery, up to $75 of principal remains exposed. There are no mature AQRA repayment labels or production lending pool.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Protocol workflow</h2>
      <ol>
        <li><strong>Build dated evidence.</strong> Read public Polymarket account history through the last completed month and record the evidence digest.</li>
        <li><strong>Establish wallet control.</strong> ENS helps discover linked wallets; the name alone does not prove control. Every linked controller must provide scoped consent.</li>
        <li><strong>Request credit.</strong> The borrower chooses principal, fixed repayment and term, then escrows the required first-loss bond.</li>
        <li><strong>Publish a lender-verifiable report.</strong> After explicit borrower consent, the report bytes are uploaded to Swarm and their hash/reference are committed to the loan. Arkiv publishes an expiring pointer for lender discovery.</li>
        <li><strong>Review and fund.</strong> The lender retrieves the report, checks its hash and recomputed evidence against the loan, acknowledges the shortfall, and funds the request on the lending chain.</li>
        <li><strong>Repay or settle default.</strong> Repayment returns the bond. A matured default transfers only the contract-held bond; AQRA cannot seize trading profits or native prediction-market positions.</li>
      </ol>
      <p>Polymarket history is read-only evidence. AQRA does not sign in to Polymarket, custody its account, trade on the borrower’s behalf, or pledge Polymarket positions as collateral. Privy wallet login, if enabled, would identify a wallet signer; it would not be Polymarket OAuth or proof that the signer owns a different proxy/deposit account.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Underwriting policy</h2>
      <p>Policy <code>aqra-trader-credit-v1</code> evaluates the three completed UTC months before the cutoff. A month is active at turnover of at least $500 and at least 20 trades. The request must have two active months, two positive active months, positive combined realized P&amp;L, activity in the latest month, and a deterministic score of at least 60/100.</p>
      <div className="whitepaper-grid">
        <div className="whitepaper-fact"><span>Profitable active-month consistency</span><strong>40 points</strong></div>
        <div className="whitepaper-fact"><span>Realized P&amp;L efficiency</span><strong>35 points</strong></div>
        <div className="whitepaper-fact"><span>Observed drawdown</span><strong>25 points</strong></div>
        <div className="whitepaper-fact"><span>Current maximum test principal</span><strong>$100</strong></div>
      </div>
      <p>The score gates eligibility only. It does not set the fee, principal, recovery, or a probability of default. Missing, stale, or unsupported account evidence must not be treated as a passing score.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Polymarket walk-forward benchmark</h2>
      <p>The expanded capture covers November 2025 through October 2026. It scheduled 768 BTC/ETH 15-minute market sessions; 764 resolved market captures were retained. The collected set contains 3,906 wallet histories, 3,647,433 fill rows, 1,025,654 daily P&amp;L observations, all 15/15 scheduled month-boundary block checks, 6,155 candidate wallet-month rows, and 11 completed forward rounds.</p>
      <p>Each monthly decision uses only data available before that cutoff. The measured outcome is positive realized trader P&amp;L in the following month. The selection cohorts use the same sampled candidate universe where applicable.</p>
      <div className="whitepaper-chart" role="img" aria-label="Positive next-month trader P&L rates: consistency 70.0 percent, largest monthly P&L 73.6 percent, 10 times to below 100 times buy 34.4 percent, 100 times or higher buy 50 percent from four rows, seeded baseline 27.7 percent.">
        {cohorts.map(row => <div className="whitepaper-chart-row" key={row.label}>
          <span>{row.label}<small>{row.wins}/{row.n} positive · 95% Wilson interval {row.ci}</small></span>
          <div className="whitepaper-chart-track"><i style={{ width: `${row.rate}%` }}/></div>
          <strong>{row.rate.toFixed(1)}%</strong>
        </div>)}
        <div className="whitepaper-chart-axis"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      </div>
      <div className="whitepaper-table-wrap"><table className="whitepaper-table"><thead><tr><th>Selection rule</th><th>Positive next month</th><th>Rows</th><th>95% Wilson interval*</th></tr></thead><tbody>
        {cohorts.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.rate.toFixed(1)}%</td><td>{row.wins}/{row.n}</td><td>{row.ci}</td></tr>)}
      </tbody></table></div>
      <p>The consistency screen exceeds the seeded baseline by 42.3 percentage points, but trails the largest-monthly-P&amp;L ranking by 3.6 points. The two 95% row-level intervals overlap. Wallet-months can repeat a trader and are dependent; the intervals are descriptive and ignore clustering, so no significance or causal claim is made. The 100× cohort has only four observations.</p>
      <p>Daily realized P&amp;L is not account ROI: complete opening equity, bankroll, and all account cash flows are unavailable. A single high-multiple purchase is not evidence of repeatable skill. None of these statistics is a loan-repayment result.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Cross-market data study</h2>
      <p>More records do not automatically make a stronger credit model. AQRA’s primary cohort must represent cash-risk trading and retain an auditable as-of history. We assessed available trader-level sources; only Polymarket is currently collected by the benchmark engine.</p>
      <div className="whitepaper-table-wrap"><table className="whitepaper-table"><thead><tr><th>Venue</th><th>Available account data</th><th>Access constraint</th><th>Research treatment</th></tr></thead><tbody>
        {venues.map(([venue, data, access, treatment]) => <tr key={venue}><td>{venue}</td><td>{data}</td><td>{access}</td><td>{treatment}</td></tr>)}
      </tbody></table></div>
      <p><strong>Collection status:</strong> the benchmark currently has one venue, Polymarket. OPINION and Predict.fun are the next wallet-history sources, but both require API credentials that are not configured in this checkout. Limitless, Kalshi and Gemini require account-owner authorization. No cross-market count or performance result is claimed until those histories are collected and checked.</p>
      <p>The next direct cohorts are OPINION and Predict.fun. OPINION documents wallet-level filled trades and positions behind an API key. Predict.fun exposes wallet-address activity and fills through a key-gated API; a separate indexer decodes its BNB trades, resolutions and settlements, but only from 22 October 2026 in its current real-time dataset. That makes it useful for a short-window replication, not a year-long comparison. Limitless, Kalshi and Gemini require borrower-authorized account access, so they cannot create a public trader census. Manifold is public and useful for a separate forecasting-behavior study, but its M$ currency and non-commercial bulk-data terms make it unsuitable as cash-credit evidence. Prediction.com can help match markets and price histories; Bitquery can reconcile chain events. Neither service supplies an additional independent trader population.</p>
      <p>Cross-market evaluation must report each venue separately. Normalize signed realized cash P&amp;L, fees, settlement status, open-position marks, deposits/withdrawals, and observation coverage before comparing a signal. Do not add M$, unsettled marks, incentives, or volume as if they were cash earnings. Do not pool venue-specific rows into AQRA eligibility until point-in-time completeness, identity linkage, permissions, and out-of-time performance have been validated.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Credit risk and validation</h2>
      <p>For loan (i), the principal loss after bond recovery is ℓ<sub>i</sub> = max(0, EAD<sub>i</sub> − hB<sub>i</sub>), where EAD is principal outstanding, B is the posted bond, and h is an assumed recovery fraction. Expected loss is EL = Σ PD<sub>i</sub>ℓ<sub>i</sub>. AQRA’s default probability, bond haircut, correlation, capital cost, and reserve are explicit stress inputs; none is estimated from trader P&amp;L.</p>
      <p>For homogeneous loans, correlated default count is stress-tested with a beta-binomial distribution. VaR and Expected Shortfall are computed from the discrete loss distribution, including fractional probability mass at the tail boundary. Pooled approval remains rejected until the protocol has matured repayment labels, calibrated PD, out-of-time validation, and committed loss capital.</p>
      <p>A valid future credit evaluation must split by origination date, prevent the same wallet from leaking across train/test windows, label only matured loans, separate partial/late/censored outcomes, and report calibration, Brier score, log loss, observed-to-expected defaults, recovery, and confidence intervals. Benchmarking trader P&amp;L cannot substitute for this study.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Arkiv’s role and current proof</h2>
      <p>Arkiv is still part of the lender flow. The Lend screen queries the <code>aqra.trader.credit.v2</code> schema on Arkiv Rabdi and reconciles each borrower-owned listing against the live lending contract. The listing contains an expiring discovery pointer, not the loan balance or authority to fund. Swarm holds the consented report bytes; the lending contract holds the debt, bond, and report hash/reference commitment.</p>
      <p>The borrower must explicitly consent, configure a Bee endpoint and funded postage batch, upload and read the report back, then publish the Arkiv entity from a Rabdi wallet funded with tGLM. The lender fetches the exact Swarm bytes and verifies the hash, recomputed report, wallet group, cutoff, and on-chain commitment before funding.</p>
      <p>From this checkout, the Arkiv SDK successfully queried the public Rabdi endpoint and returned zero current AQRA credit entities. The endpoint warned that no access key is configured and public requests are rate-limited. No borrower entity write, public transaction receipt, or second-wallet read proof is recorded. Swarm is unconfigured in this workspace, so a new report-backed funded request cannot complete here. This confirms that the code path exists and the public read endpoint responded; it does not claim a completed live write/read loan flow.</p>
    </section>

    <section className="whitepaper-section">
      <h2>Limitations and primary sources</h2>
      <ul>
        <li>The benchmark is a sampled Polymarket set, not a venue-wide census. Wallet-month observations are dependent and selection/survivorship bias remains.</li>
        <li>There are no mature AQRA repayment/default outcomes, no calibrated default model, no production pool, and no independent security audit.</li>
        <li>The contract only recovers its bond. AQRA does not custody prediction-market positions or guarantee lender principal.</li>
        <li>CRE workflow source exists, but no successful public CRE/DON receipt is recorded. A local report must not be described as DON-verified.</li>
      </ul>
      <div className="whitepaper-links">
        <a href="https://docs.polymarket.com/api-reference/wallet/get-a-users-pnl-series" target="_blank" rel="noreferrer">Polymarket Data API <ArrowUpRight size={13}/></a>
        <a href="https://docs.opinion.trade/developer-guide/opinion-open-api/trade" target="_blank" rel="noreferrer">OPINION user trades <ArrowUpRight size={13}/></a>
        <a href="https://dev.predict.fun/api/account/get-account-activity-by-address" target="_blank" rel="noreferrer">Predict.fun address activity <ArrowUpRight size={13}/></a>
        <a href="https://dev.predict.fun/api/orders/get-order-match-events" target="_blank" rel="noreferrer">Predict.fun wallet fills <ArrowUpRight size={13}/></a>
        <a href="https://academy.limitless.exchange/academies/api_academy/06_Positions.html" target="_blank" rel="noreferrer">Limitless portfolio API <ArrowUpRight size={13}/></a>
        <a href="https://docs.kalshi.com/getting_started/api_keys" target="_blank" rel="noreferrer">Kalshi API access <ArrowUpRight size={13}/></a>
        <a href="https://developer.gemini.com/prediction-markets-spec" target="_blank" rel="noreferrer">Gemini Predictions API <ArrowUpRight size={13}/></a>
        <a href="https://docs.manifold.markets/data" target="_blank" rel="noreferrer">Manifold data and licensing <ArrowUpRight size={13}/></a>
        <a href="https://prediction.com/api/docs" target="_blank" rel="noreferrer">Prediction.com market data <ArrowUpRight size={13}/></a>
        <a href="https://docs.chain.link/cre/capabilities/evm-read-write" target="_blank" rel="noreferrer">Chainlink CRE <ArrowUpRight size={13}/></a>
        <a href="https://raw.githubusercontent.com/debojyoti10CC/floorprt/main/paper/main.tex" target="_blank" rel="noreferrer">IEEE LaTeX paper <ArrowUpRight size={13}/></a>
      </div>
      <p className="whitepaper-footnote">*Wilson intervals treat wallet-month rows as independent Bernoulli trials and are shown only as descriptive uncertainty bands; repeated wallets violate that assumption. Full sources, adapter requirements, and limitations are documented in <a href="https://github.com/debojyoti10CC/floorprt/blob/main/docs/MULTI_MARKET_DATA.md" target="_blank" rel="noreferrer">the multi-market data study</a>.</p>
    </section>
  </article>;
}
