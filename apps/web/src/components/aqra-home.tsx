'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileCheck2,
  LockKeyhole,
  Menu,
  Network,
  ShieldCheck,
  X,
} from 'lucide-react';
import { KineticGrid } from './kinetic-grid';
import { CornerBrackets, LandingPageFrame, SectionDivider } from './LandingPageFrame';
import { DotMatrixWave } from './dot-matrix-wave';
import { ArqoLogo } from './ArqoLogo';

const navigation = [
  ['Protocol', '#how-it-works'],
  ['How it works', '#solution'],
  ['Risk & settlement', '#risk'],
];

export function ARQOHome() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="aqra-home">
      <LandingMotion />
      <a className="aqra-skip" href="#main-content">Skip to content</a>
      <LandingPageFrame>
      <header className="home-header">
        <Link className="home-brand" href="/" aria-label="ARQO home">
          <ArqoLogo variant="light" size={27} />
        </Link>
        <button
          className="home-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
        <nav className={`home-nav${menuOpen ? ' is-open' : ''}`} aria-label="Landing page">
          {navigation.map(([label, href]) => (
            <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <Link className="home-mobile-app-link" href="/app/" onClick={() => setMenuOpen(false)}>Open terminal</Link>
        </nav>
        <Link className="home-header-cta" href="/app/">
          Open terminal <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <SectionDivider />

      <main id="main-content">
        <section className="home-hero" aria-labelledby="hero-title">
          <KineticGrid />
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-lines" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="hero-copy">
            <div className="home-eyebrow"><span className="live-pip" /> COLLATERAL FOR EVENT OUTCOMES</div>
            <h1 id="hero-title">
              <span className="hero-line-mask"><span className="hero-line">Structure outcomes.</span></span>
              <span className="hero-line-mask"><span className="hero-line hero-line-accent">Prove value.</span></span>
              <span className="hero-line-mask"><span className="hero-line">Unlock liquidity.</span></span>
            </h1>
            <p className="hero-lead">Compose compatible, fully backed outcome claims. Prove their contractual settlement floor. Borrow USDC against eligible collateral.</p>
            <div className="hero-actions">
              <Link className="gold-button" href="/app/">Explore ARQO <ArrowRight size={16} /></Link>
              <a className="text-button" href="#how-it-works">See how it works <ArrowDown size={15} /></a>
            </div>
            <div className="hero-note hero-support"><span className="testnet-pill"><i /> TESTNET</span><span>Local protocol · Test collateral</span></div>
          </div>
          <div className="hero-visual-reveal"><DotMatrixWave /></div>
          <a className="scroll-cue" href="#protocol" aria-label="Scroll to protocol overview"><span>SCROLL TO EXPLORE</span><ArrowDown size={14} /></a>
        </section>
        <SectionDivider />

        <section className="home-section home-problem" id="protocol" aria-labelledby="problem-title">
          <div className="section-intro">
            <div className="home-eyebrow problem-label"><span className="section-dash" /> THE LIQUIDITY GAP</div>
            <h2 id="problem-title"><span className="section-line-mask"><span>Event claims carry value.</span></span><span className="section-line-mask"><span>It can be hard to use it.</span></span></h2>
          </div>
          <div className="problem-copy">
            <p>Outcome positions are often stranded until resolution. Selling can mean giving up exposure; keeping them may leave capital idle.</p>
            <p>Probability and correlation can help describe risk, but they cannot guarantee what a contract pays at settlement. ARQO starts with the payout rules.</p>
            <a className="underlined-link" href="#how-it-works">See the ARQO workflow <ArrowRight size={14} /></a>
          </div>
          <div className="problem-rule"><span>THE QUESTION</span><strong>What is the minimum these claims must pay together?</strong><i aria-hidden="true" /></div>
        </section>
        <SectionDivider />

        <section className="home-section solution-story" id="solution" aria-labelledby="solution-title">
          <KineticGrid />
          <div className="story-heading">
            <div>
              <div className="home-eyebrow story-label"><span className="section-dash" /> THE ARQO MECHANISM</div>
              <h2 id="solution-title">From outcomes to <span>available capital.</span></h2>
            </div>
            <p>Compose compatible contracts, prove the payout they share, then borrow against eligible collateral.</p>
          </div>
          <div className="solution-layout">
            <div className="solution-visual-pin">
              <CornerBrackets />
              <div className="solution-visual-top"><span>PORTFOLIO PATH</span><span className="story-current-step"><i>01</i> / 03</span></div>
              <div className="solution-visual-stage-wrap">
                <ComposeVisual />
                <PayoffVisual />
                <CreditVisual />
              </div>
              <div className="solution-visual-bottom"><span className="solution-active-caption">COMPOSE COMPATIBLE OUTCOMES</span><span>ILLUSTRATIVE · TESTNET</span></div>
            </div>
            <div className="solution-steps">
              <article className="solution-step" data-solution-step="01">
                <span className="solution-step-number">01 / COMPOSE</span>
                <h3>Pair contracts that<br />settle together.</h3>
                <p>Choose YES on the lower ETH price threshold and NO on the higher one. Both claims must share the same immutable observation, settlement time, collateral and payout rules.</p>
                <div className="step-inline-detail"><Network size={15} /><span>Observation <b>ETH/USD · shared</b></span></div>
              </article>
              <article className="solution-step" data-solution-step="02">
                <span className="solution-step-number">02 / PROVE</span>
                <h3>Inspect every payout<br />interval.</h3>
                <p>At one unit each, the portfolio pays $1 below $5,000, $2 between $5,000 and $6,000, and $1 at or above $6,000. The $1 minimum is a contractual settlement floor—not a profit or market price.</p>
                <div className="step-inline-detail"><FileCheck2 size={15} /><span>Verified settlement floor <b>$1.00 USDC · illustrative</b></span></div>
              </article>
              <article className="solution-step" data-solution-step="03">
                <span className="solution-step-number">03 / BORROW</span>
                <h3>Set fixed debt<br />within the proof.</h3>
                <p>An illustrative $0.75 principal with $0.78 due at maturity leaves at least $0.22 after lender repayment, assuming compatible settlement, redemption and the repayment waterfall.</p>
                <div className="step-inline-detail"><LockKeyhole size={15} /><span>Illustrative borrow amount <b>$0.75 USDC</b></span></div>
              </article>
            </div>
          </div>
          <p className="solution-disclaimer">A floor describes minimum contractual payout under the supported settlement rules. Acquisition cost, fees, oracle timing, redemption and contract risks remain separate.</p>
        </section>
        <SectionDivider />

        <section className="home-section feature-story" id="how-it-works" aria-labelledby="feature-title">
          <div className="feature-story-heading">
            <div className="home-eyebrow"><span className="section-dash" /> PROTOCOL CAPABILITIES</div>
            <h2 id="feature-title">One lifecycle.<br /><span>Rules you can follow.</span></h2>
            <p>Onchain terms connect market discovery, composition, proof, credit and final cashflow.</p>
          </div>
          <div className="feature-story-grid">
            <div className="feature-visual-sticky">
              <CornerBrackets />
              <div className="feature-visual-header"><span>PROTOCOL MAP</span><span className="feature-visual-status"><i /> LOCAL EVM</span></div>
              <FeatureVisual />
              <div className="feature-visual-footer"><span className="feature-current-name">OUTCOME INTELLIGENCE</span><span className="feature-current-count">01 / 05</span></div>
            </div>
            <div className="feature-chapters">
              <FeatureChapter number="01" title="Outcome intelligence" body="Discover curated, onchain registered threshold markets and inspect their shared observation, resolution time, collateral and payout policy." icon={<Network size={18} />} />
              <FeatureChapter number="02" title="Portfolio composition" body="Select whole-unit YES and NO positions, compare balances, and compose compatible claims in the portfolio workspace." icon={<ArrowRight size={18} />} />
              <FeatureChapter number="03" title="Settlement floor verification" body="A deterministic verifier checks exact predicates and settlement semantics across every supported payout interval." icon={<FileCheck2 size={18} />} />
              <FeatureChapter number="04" title="Collateralized credit" body="Lock approved, fully backed claims and constrain the fixed debt amount to the verified floor less a safety reserve." icon={<LockKeyhole size={18} />} />
              <FeatureChapter number="05" title="Automated settlement" body="After the shared observation resolves, claims redeem, the lender receives fixed debt first, and any remaining proceeds return to the borrower." icon={<CircleDollarSign size={18} />} />
            </div>
          </div>
          <div className="feature-story-foot"><span>ONCHAIN MONEY MOVES ARE WALLET-SIGNED · LOCAL EVM DEMO</span><span>Read-only market research never becomes collateral by itself</span></div>
        </section>
        <SectionDivider />

        <section className="home-section trust-section" id="risk" aria-labelledby="trust-title">
          <div className="trust-top">
            <div className="home-eyebrow"><span className="section-dash" /> RISK IS PART OF THE PRODUCT</div>
            <h2 id="trust-title">A proof has boundaries.<br /><span>We show them.</span></h2>
            <p>A verified floor depends on compatible contracts resolving as specified. It is not instant liquidity, market value or a guarantee of profit.</p>
          </div>
          <div className="trust-cards">
            <article><div className="trust-card-icon"><Check size={17} /></div><h3>What is verified</h3><p>That eligible whole-unit claims meet the supported payout rules across each settlement interval and shared cancellation state.</p></article>
            <article><div className="trust-card-icon muted-icon"><ChevronDown size={17} /></div><h3>What remains at risk</h3><p>Oracle timing, contract integrity, redemption execution, acquisition cost, fees and any lack of secondary liquidity.</p></article>
            <article><div className="trust-card-icon muted-icon"><ShieldCheck size={17} /></div><h3>What is not connected</h3><p>External venue listings are research-only. Direct Polymarket custody, mainnet lending and a live CRE deployment are not enabled.</p></article>
          </div>
          <div className="testnet-notice"><span className="testnet-pill"><i /> TESTNET</span><p>ARQO is a local EVM demonstrator using test collateral. It has not been independently audited or cleared for mainnet use.</p><Link href="/app/docs/">Read product limits <ArrowUpRight size={13} /></Link></div>
        </section>
        <SectionDivider />

        <section className="home-section terminal-preview" aria-labelledby="preview-title">
          <div className="preview-heading">
            <div><div className="home-eyebrow"><span className="section-dash" /> THE ARQO TERMINAL</div><h2 id="preview-title">Proof and capital,<br /><span>in one workspace.</span></h2></div>
            <div><p>Explore the actual markets, portfolio builder, proof inspector and credit desk. The embedded terminal uses the same testnet safeguards and wallet flows.</p><Link className="underlined-link" href="/app/">Open full terminal <ArrowUpRight size={14} /></Link></div>
          </div>
          <div className="terminal-frame">
            <CornerBrackets />
            <div className="terminal-frame-bar"><div className="terminal-frame-dots"><i /><i /><i /></div><span>arqo.local / app</span><Link href="/app/" aria-label="Open terminal in a new page"><ArrowUpRight size={14} /></Link></div>
            <iframe src="/app/" title="Live ARQO protocol terminal preview" loading="eager" />
          </div>
        </section>
        <SectionDivider />

        <section className="home-final-cta" aria-labelledby="final-title">
          <div className="cta-orbits" aria-hidden="true"><i /><i /><i /></div>
          <div className="home-eyebrow"><span className="live-pip" /> THE ARQO TERMINAL</div>
          <h2 id="final-title"><span className="cta-line-mask"><span>Turn outcomes</span></span><span className="cta-line-mask"><span>into liquidity.</span></span></h2>
          <p>Build a threshold portfolio, inspect its proof, and explore the credit flow on local testnet.</p>
          <div className="final-actions"><Link className="gold-button" href="/app/">Launch ARQO <ArrowRight size={16} /></Link><Link className="final-secondary" href="/app/docs/">Explore the Protocol <ArrowUpRight size={14} /></Link></div>
          <span className="cta-footnote">TEST COLLATERAL · LOCAL EVM · NO MAINNET CLAIMS</span>
        </section>
        <SectionDivider />
      </main>

      <footer className="home-footer">
        <Link className="home-brand" href="/" aria-label="ARQO home"><ArqoLogo variant="light" size={23} /></Link>
        <span>STRUCTURED OUTCOMES · VERIFIABLE SETTLEMENT · COLLATERALIZED CREDIT</span>
        <div><Link href="/app/">Terminal</Link><a href="https://github.com/debojyoti10CC/floorprt/tree/main/docs" target="_blank" rel="noreferrer">Protocol docs <ArrowUpRight size={12} /></a></div>
      </footer>
      </LandingPageFrame>
    </div>
  );
}

function ComposeVisual() {
  return (
    <div className="solution-visual-state compose-visual-state" data-solution-visual="compose">
      <div className="compose-visual-head"><span><i /> PORTFOLIO COMPOSITION</span><span>2 POSITIONS</span></div>
      <div className="compose-asset"><div className="compose-observation"><Network size={15} /><span>SHARED OBSERVATION <b>ETH/USD · 16:00 UTC</b></span></div><i className="observation-link" /></div>
      <div className="compose-position"><span className="compose-side">YES</span><div><small>LOWER THRESHOLD</small><b>ETH ≥ $5,000</b></div><span className="compose-units">1 UNIT</span></div>
      <div className="compose-position"><span className="compose-side no-side">NO</span><div><small>UPPER THRESHOLD</small><b>ETH ≥ $6,000</b></div><span className="compose-units">1 UNIT</span></div>
      <div className="compose-visual-foot"><span>COLLATERAL</span><b>6-DECIMAL USDC</b><span>SETTLEMENT</span><b>WHOLE UNITS</b></div>
      <div className="compose-visual-note">Compatible positions · illustrative example</div>
    </div>
  );
}

function PayoffVisual() {
  return (
    <div className="solution-visual-state proof-visual-state value-visual" data-solution-visual="prove" aria-label="Illustrative ETH threshold portfolio payoff">
      <div className="visual-topline"><span><i /> PAYOFF ANALYSIS</span><span>ETH/USD · SHARED OBSERVATION</span></div>
      <div className="visual-market-pair">
        <div><small>LOWER THRESHOLD</small><strong>ETH ≥ $5,000</strong><span><b>YES</b> · 1 unit</span></div>
        <div className="pair-link"><Network size={17} /><span>same observation</span></div>
        <div><small>UPPER THRESHOLD</small><strong>ETH ≥ $6,000</strong><span><b>NO</b> · 1 unit</span></div>
      </div>
      <div className="step-graph">
        <div className="graph-axis"><span>SETTLEMENT PAYOUT</span><b>USDC</b></div>
        <div className="graph-area">
          <div className="graph-grid"><i /><i /><i /></div>
          <div className="graph-floor"><span>$1.00 FLOOR</span></div>
          <svg viewBox="0 0 640 190" preserveAspectRatio="none" role="img" aria-label="Illustrative payout: one dollar below five thousand dollars, two dollars between five and six thousand dollars, and one dollar at or above six thousand dollars">
            <path className="graph-fill" d="M0 139 H214 V48 H428 V139 H640 V190 H0 Z" />
            <path className="graph-step proof-line-draw" pathLength="1" d="M0 139 H214 V48 H428 V139 H640" />
            <path className="graph-threshold" d="M214 25 V164 M428 25 V164" />
          </svg>
          <div className="graph-labels"><span>&lt; $5k <b>$1</b></span><span>$5k–$6k <b>$2</b></span><span>≥ $6k <b>$1</b></span></div>
        </div>
        <div className="graph-x-axis"><span>ETH PRICE AT SETTLEMENT</span><span>$5,000</span><span>$6,000</span><span>OBSERVATION VALUE</span></div>
      </div>
      <div className="visual-foot"><span><Check size={13} /> VERIFIED RULES · ILLUSTRATIVE</span><span>BEFORE COSTS & FEES</span></div>
    </div>
  );
}

function CreditVisual() {
  return (
    <div className="solution-visual-state credit-visual-state" data-solution-visual="borrow">
      <div className="credit-card-head"><span><CircleDollarSign size={15} /> FIXED-TERM CREDIT</span><span className="term-chip">ILLUSTRATIVE</span></div>
      <div className="credit-row"><span>Verified settlement floor</span><strong>$1.00</strong></div>
      <div className="credit-row"><span>Illustrative loan principal</span><strong>$0.75</strong></div>
      <div className="credit-row"><span>Fixed debt at maturity</span><strong>$0.78</strong></div>
      <div className="credit-cap-track"><span className="credit-cap-floor" /><span className="credit-cap-debt" /><i>FLOOR</i><b>FIXED DEBT</b></div>
      <div className="credit-residual"><div><span>Minimum residual after repayment</span><small>Assumes compatible settlement and redemption</small></div><strong>$0.22</strong></div>
      <div className="credit-waterfall"><span><i>01</i> Outcome settles</span><b>→</b><span><i>02</i> Claims redeem</span><b>→</b><span><i>03</i> Lender paid</span><b>→</b><span><i>04</i> Surplus returned</span></div>
      <div className="credit-visual-note">Fixed due stays below the verified floor less reserve.</div>
    </div>
  );
}

function FeatureChapter({ number, title, body, icon }: { number: string; title: string; body: string; icon: React.ReactNode }) {
  return (
    <article className="feature-chapter" data-feature-chapter={number}>
      <div className="feature-chapter-number"><span>{number}</span><i>{icon}</i></div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function FeatureVisual() {
  return (
    <div className="feature-visual-states" data-active-feature="01">
      <div className="feature-visual-state" data-feature-state="01">
        <div className="feature-visual-label"><Network size={14} /> REGISTERED THRESHOLDS</div>
        <div className="feature-market-row"><span>ETH / USD</span><b>≥ $5,000</b><i>YES</i></div>
        <div className="feature-market-row"><span>ETH / USD</span><b>≥ $6,000</b><i className="neutral-tag">NO</i></div>
        <div className="feature-observation"><i /> SAME OBSERVATION · SAME SETTLEMENT</div>
      </div>
      <div className="feature-visual-state" data-feature-state="02">
        <div className="feature-visual-label"><ArrowRight size={14} /> PORTFOLIO BUILDER</div>
        <div className="feature-composition"><span className="feature-leg">YES · $5,000</span><i>+</i><span className="feature-leg">NO · $6,000</span></div>
        <div className="feature-composition-result">2 positions <b>→</b> 1 portfolio</div>
      </div>
      <div className="feature-visual-state" data-feature-state="03">
        <div className="feature-visual-label"><FileCheck2 size={14} /> PAYOUT PARTITION</div>
        <div className="feature-intervals"><span>$1</span><span>$2</span><span>$1</span></div>
        <div className="feature-floor-line"><i /> <b>$1.00 minimum</b></div>
        <div className="feature-interval-labels"><span>&lt; $5k</span><span>$5k–$6k</span><span>≥ $6k</span></div>
      </div>
      <div className="feature-visual-state" data-feature-state="04">
        <div className="feature-visual-label"><LockKeyhole size={14} /> COLLATERAL VAULT</div>
        <div className="vault-box"><div><LockKeyhole size={17} /><span>APPROVED ERC-1155<br />CLAIMS LOCKED</span></div><ArrowDown size={17} /><b>FIXED DEBT ≤ FLOOR − RESERVE</b></div>
        <div className="vault-foot"><span>POSITION</span><span>ONE LIEN</span><span>TEST USDC</span></div>
      </div>
      <div className="feature-visual-state" data-feature-state="05">
        <div className="feature-visual-label"><CircleDollarSign size={14} /> SETTLEMENT WATERFALL</div>
        <div className="waterfall-mini"><span>OUTCOME<br />SETTLES</span><i>→</i><span>CLAIMS<br />REDEEM</span><i>→</i><span>LENDER<br />REPAID</span><i>→</i><span>REMAINDER<br />RETURNED</span></div>
        <div className="waterfall-mini-note">Borrower surplus follows fixed lender debt.</div>
      </div>
    </div>
  );
}

function LandingMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    let cancelled = false;
    let cleanupMotion: (() => void) | undefined;

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('lenis')]).then(([gsapPackage, scrollTriggerPackage, lenisPackage]) => {
      if (cancelled) return;
      const gsap = gsapPackage.gsap;
      const ScrollTrigger = scrollTriggerPackage.ScrollTrigger;
      const Lenis = lenisPackage.default;
      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({
        anchors: true,
        autoRaf: false,
        lerp: 0.085,
        respectReducedMotion: true,
        smoothWheel: true,
        stopInertiaOnNavigate: true,
        syncTouch: false,
      });
      const tick = (time: number) => lenis.raf(time * 1000);
      const updateScroll = () => ScrollTrigger.update();
      lenis.on('scroll', updateScroll);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const root = document.querySelector('.aqra-home');
      let responsiveStory: ReturnType<typeof gsap.matchMedia> | undefined;
      const context = gsap.context(() => {
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
        intro
          .fromTo('.home-header', { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.55 })
          .fromTo('.hero-line', { yPercent: 112 }, { yPercent: 0, duration: 0.88, stagger: 0.12 }, '-=0.25')
          .fromTo('.hero-lead', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.58 }, '-=0.24')
          .fromTo('.hero-actions > *', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.11 }, '-=0.2')
          .fromTo('.hero-support', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, '-=0.2')
          .fromTo('.hero-visual-reveal', { autoAlpha: 0, y: 26, scale: 0.975 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, clearProps: 'transform' }, '-=0.18');

        gsap.timeline({
          scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: 1 },
        })
          .to('.hero-copy', { y: -42, autoAlpha: 0.48, ease: 'none' }, 0)
          .to('.hero-visual-reveal', { y: 58, ease: 'none' }, 0)
          .to('.hero-lines', { yPercent: 8, opacity: 0.44, ease: 'none' }, 0);

        const reveal = (selector: string, trigger: string, y = 20) => {
          gsap.fromTo(selector, { autoAlpha: 0, y }, {
            autoAlpha: 1,
            y: 0,
            duration: 0.72,
            ease: 'power2.out',
            immediateRender: false,
            scrollTrigger: { trigger, start: 'top 78%', toggleActions: 'play none none reverse' },
          });
        };

        reveal('.problem-label', '.home-problem', 12);
        reveal('.section-intro h2 .section-line-mask > span', '.home-problem', 24);
        reveal('.problem-copy > p', '.home-problem', 15);
        reveal('.problem-rule', '.home-problem', 20);
        reveal('.story-heading', '.solution-story', 22);
        reveal('.feature-story-heading', '.feature-story', 22);
        reveal('.preview-heading', '.terminal-preview', 22);
        reveal('.home-final-cta .home-eyebrow', '.home-final-cta', 12);
        reveal('.home-final-cta h2 .cta-line-mask > span', '.home-final-cta', 24);
        reveal('.home-final-cta > p, .final-actions, .cta-footnote', '.home-final-cta', 14);

        const solutionVisual = document.querySelector<HTMLElement>('.solution-visual-pin');
        const solutionSteps = document.querySelector<HTMLElement>('.solution-steps');
        if (solutionVisual && solutionSteps) {
          const stageNodes = gsap.utils.toArray<HTMLElement>('[data-solution-visual]');
          const stageCopy = gsap.utils.toArray<HTMLElement>('[data-solution-step]');
          const stepReadout = document.querySelector('.story-current-step i');
          const stageCaption = document.querySelector('.solution-active-caption');
          responsiveStory = gsap.matchMedia();
          responsiveStory.add('(min-width: 1100px)', () => {
            gsap.set(stageNodes, { autoAlpha: 0, y: 14 });
            gsap.set(stageNodes[0], { autoAlpha: 1, y: 0 });
            const storyTimeline = gsap.timeline({
              scrollTrigger: {
                trigger: '.solution-layout',
                start: 'top top+=88',
                end: () => `+=${Math.max(solutionSteps.scrollHeight - solutionVisual.offsetHeight, window.innerHeight * 1.65)}`,
                scrub: 1,
                pin: solutionVisual,
                anticipatePin: 1,
                invalidateOnRefresh: true,
              },
            });
            storyTimeline
              .to(stageNodes[0], { autoAlpha: 0, y: -10, duration: 0.28, ease: 'power1.inOut' }, 0.72)
              .fromTo(stageNodes[1], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' }, 0.74)
              .fromTo('.proof-line-draw', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.55, ease: 'none' }, 0.92)
              .to(stageNodes[1], { autoAlpha: 0, y: -10, duration: 0.28, ease: 'power1.inOut' }, 1.56)
              .fromTo(stageNodes[2], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' }, 1.58)
              .fromTo('.credit-cap-debt', { scaleX: 0 }, { scaleX: 1, transformOrigin: 'left center', duration: 0.48, ease: 'power1.out' }, 1.75);
            storyTimeline.eventCallback('onUpdate', () => {
              const stage = storyTimeline.progress() < 0.37 ? 0 : storyTimeline.progress() < 0.72 ? 1 : 2;
              if (stepReadout) stepReadout.textContent = `0${stage + 1}`;
              if (stageCaption) stageCaption.textContent = ['COMPOSE COMPATIBLE OUTCOMES', 'PROVE THE PAYOUT FLOOR', 'BORROW WITH A FIXED BOUND'][stage];
            });
          });
          stageCopy.forEach((step) => {
            gsap.fromTo(step, { autoAlpha: 0.52 }, {
              autoAlpha: 1,
              duration: 0.35,
              immediateRender: false,
              scrollTrigger: { trigger: step, start: 'top 67%', end: 'bottom 43%', toggleActions: 'play reverse play reverse' },
            });
          });
        }

        const featurePanel = document.querySelector<HTMLElement>('.feature-visual-states');
        if (featurePanel) {
          const featureNames: Record<string, string> = {
            '01': 'OUTCOME INTELLIGENCE',
            '02': 'PORTFOLIO COMPOSITION',
            '03': 'SETTLEMENT FLOOR VERIFICATION',
            '04': 'COLLATERALIZED CREDIT',
            '05': 'AUTOMATED SETTLEMENT',
          };
          const setFeature = (chapter: HTMLElement) => {
            const featureId = chapter.dataset.featureChapter ?? '01';
            featurePanel.dataset.activeFeature = featureId;
            const featureName = document.querySelector('.feature-current-name');
            const featureCount = document.querySelector('.feature-current-count');
            if (featureName) featureName.textContent = featureNames[featureId];
            if (featureCount) featureCount.textContent = `${featureId} / 05`;
          };
          gsap.utils.toArray<HTMLElement>('[data-feature-chapter]').forEach((chapter) => {
            ScrollTrigger.create({
              trigger: chapter,
              start: 'top 55%',
              end: 'bottom 45%',
              onEnter: () => setFeature(chapter),
              onEnterBack: () => setFeature(chapter),
            });
            gsap.fromTo(chapter, { autoAlpha: 0.46, y: 18 }, {
              autoAlpha: 1,
              y: 0,
              duration: 0.65,
              ease: 'power2.out',
              immediateRender: false,
              scrollTrigger: { trigger: chapter, start: 'top 80%', toggleActions: 'play none none reverse' },
            });
          });
        }

        gsap.fromTo('.terminal-frame', { autoAlpha: 0, y: 26, scale: 0.965 }, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.9,
          ease: 'power2.out',
          immediateRender: false,
          scrollTrigger: { trigger: '.terminal-frame', start: 'top 78%', toggleActions: 'play none none reverse' },
        });

        gsap.to('.aqra-home', {
          backgroundColor: '#414148',
          ease: 'none',
          scrollTrigger: { trigger: 'main', start: 'top top', end: 'bottom bottom', scrub: 1 },
        });
        gsap.fromTo('.cta-orbits', { scale: 0.9, autoAlpha: 0.55 }, {
          scale: 1.06,
          autoAlpha: 1,
          ease: 'none',
          scrollTrigger: { trigger: '.home-final-cta', start: 'top bottom', end: 'bottom bottom', scrub: 1 },
        });

        ScrollTrigger.refresh();
        document.fonts?.ready.then(() => { if (!cancelled) ScrollTrigger.refresh(); });
      }, root ?? undefined);

      const refreshAfterLoad = () => ScrollTrigger.refresh();
      window.addEventListener('load', refreshAfterLoad, { once: true });

      cleanupMotion = () => {
        window.removeEventListener('load', refreshAfterLoad);
        responsiveStory?.revert();
        context.revert();
        lenis.off('scroll', updateScroll);
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
        lenis.destroy();
      };
    }).catch(() => {
      // Native scrolling and visible page content remain available if motion chunks fail to load.
    });

    return () => {
      cancelled = true;
      cleanupMotion?.();
    };
  }, []);

  return null;
}
