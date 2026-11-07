import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, ChartNoAxesCombined, FileText, Fingerprint, MoveUpRight, ShieldCheck, Zap } from 'lucide-react';
import styles from './landing.module.css';
import { LandingStory } from './landing-story';
import { LandingResearch } from './landing-research';

const letters: Record<string, string[]> = {
  A: ['01110', '11011', '11011', '11111', '11011', '11011', '11011'],
  Q: ['01110', '11011', '11011', '11011', '11011', '01110', '00011'],
  R: ['11110', '11011', '11011', '11110', '11100', '11010', '11011'],
};

function DotWord({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 234 70" aria-hidden="true">
    {'AQRA'.split('').flatMap((letter, index) => letters[letter].flatMap((row, y) => [...row].map((dot, x) => dot === '1' ? <circle key={`${index}-${x}-${y}`} cx={5 + index * 60 + x * 10} cy={5 + y * 10} r="3.3" fill="currentColor" /> : null)))}
  </svg>;
}

// Original procedural artwork: a dotted evidence sphere and a metallic orbital path.
function EvidenceSphere() {
  const dots = [];
  for (let row = -10; row <= 10; row++) {
    for (let col = -10; col <= 10; col++) {
      const distance = Math.sqrt(row * row + col * col);
      if (distance > 10.2) continue;
      const a = Math.abs(col);
      const isMark = row >= -5 && row <= 5 && (Math.abs(a - (1 + (row + 5) * .4)) < .85 || (row === 1 && a <= 3));
      dots.push(<circle key={`${row}-${col}`} cx={310 + col * 19} cy={270 + row * 19} r={distance > 9.5 ? 4.5 : 5.8} fill={isMark ? 'url(#aqra-dot-light)' : 'currentColor'} opacity={isMark ? 1 : .14 + (1 - distance / 11) * .28} />);
    }
  }
  return <svg className={styles.sphere} viewBox="0 0 640 550" aria-hidden="true">
    <defs>
      <radialGradient id="aqra-dot-light"><stop stopColor="white"/><stop offset="1" stopColor="#d8d7ff"/></radialGradient>
      <linearGradient id="aqra-orbit" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#252529"/><stop offset=".2" stopColor="#fff"/><stop offset=".32" stopColor="#4d4d56"/><stop offset=".5" stopColor="#161619"/><stop offset=".7" stopColor="#9d98ff"/><stop offset=".85" stopColor="#fff"/><stop offset="1" stopColor="#414148"/></linearGradient>
      <filter id="aqra-glow"><feGaussianBlur stdDeviation="8"/></filter>
    </defs>
    <ellipse cx="318" cy="295" rx="286" ry="83" transform="rotate(-25 318 295)" fill="none" stroke="url(#aqra-orbit)" strokeWidth="11" opacity=".35"/>
    <g>{dots}</g>
    <path d="M 570 157 C 706 197 391 412 121 416 C -9 417 10 369 87 309" fill="none" stroke="url(#aqra-orbit)" strokeWidth="13"/>
    <path d="M 570 152 C 706 192 391 407 121 411 C -9 412 10 364 87 304" fill="none" stroke="url(#aqra-orbit)" strokeWidth="2"/>
    <circle cx="477" cy="309" r="15" fill="#7770ff" opacity=".7" filter="url(#aqra-glow)"/>
    <circle cx="477" cy="309" r="7" fill="#b8b1ff"/>
    <path d="M306 42v12m-6-6h12M545 429v12m-6-6h12M79 169v12m-6-6h12" stroke="currentColor" opacity=".4"/>
  </svg>;
}

const steps = [
  { number: '01', title: 'Bring your history.', description: 'Explore dated Polymarket wallet evidence. See the data behind the screen—not just a score.', icon: Fingerprint },
  { number: '02', title: 'Understand the risk.', description: 'Stress-test explicit assumptions. Trading performance is never treated as repayment probability.', icon: ShieldCheck },
  { number: '03', title: 'Make it onchain.', description: 'A borrower signs a bonded request. A separate lender reviews, acknowledges risk, and funds with test USDC.', icon: Zap },
];

export function Landing() {
  return <div className={styles.landing}>
    <a className={styles.skip} href="#landing-main">Skip to content</a>
    <div className={styles.frame}>
      <header className={styles.header}>
        <Link href="/" aria-label="AQRA home" className={styles.brand}><span className={styles.brandIcon} aria-hidden="true"><i/><i/><i/></span><DotWord className={styles.wordmark}/></Link>
        <nav aria-label="Landing navigation" className={styles.nav}>
          <Link href="/underwriting/" className={styles.navLink}><ChartNoAxesCombined size={16}/><span>Explore data</span></Link>
          <Link href="/whitepaper/" className={styles.navLink}><FileText size={16}/><span>Whitepaper</span></Link>
          <Link href="/underwriting/" className={styles.launch}><Zap size={17} fill="currentColor"/>Launch app<ArrowUpRight size={17}/></Link>
        </nav>
      </header>
      <main id="landing-main" className={styles.main}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><span/>PREDICTION-MARKET TRADER CREDIT</div>
            <DotWord className={styles.heroWord}/>
            <h1 id="landing-title">FOR TRADERS<br/>WITH A<br/>TRACK RECORD<span className={styles.period}>.</span></h1>
            <p>Your history. A clearer credit conversation.<br className={styles.desktopBreak}/> Explore the evidence. Know the risk.</p>
            <div className={styles.heroActions}><Link href="/underwriting/" className={styles.primary}>Explore AQRA<ArrowUpRight size={19}/></Link><a href="#how-it-works" className={styles.textLink}>How it works<ArrowDown size={16}/></a></div>
            <div className={styles.demoLabel}><span/>LOCAL / TESTNET PROTOTYPE · TEST FUNDS ONLY</div>
          </div>
          <div className={styles.art}><div className={styles.artLabel}><span>HISTORY → EVIDENCE → CREDIT</span><span>FIG. 001</span></div><EvidenceSphere/><div className={styles.artCaption}><span className={styles.captionCross}>+</span>CONVICTION, WITH CONTEXT.<span className={styles.captionCross}>+</span></div></div>
        </section>
        <section className={styles.cards} aria-label="Explore the protocol">
          <Link href="/underwriting/" className={styles.featureCard}><div className={styles.cardTop}><span>The evidence</span><ArrowUpRight size={22}/></div><strong>History.<br/>Not hype.</strong><div className={styles.cardBottom}><span>Walk-forward wallet research</span><ChartNoAxesCombined size={22}/></div></Link>
          <Link href="/whitepaper/" className={styles.featureCard}><div className={styles.cardTop}><span>The approach</span><ArrowUpRight size={22}/></div><strong>Transparent<br/>by design.</strong><div className={styles.cardBottom}><span>Read the method &amp; limitations</span><Fingerprint size={23}/></div></Link>
          <Link href="/underwriting/" className={`${styles.featureCard} ${styles.accentCard}`}><div className={styles.cardTop}><span>The credit desk</span><ArrowUpRight size={22}/></div><strong>Your terms.<br/>Your signature.</strong><div className={styles.cardBottom}><span>Explore bonded test loans</span><Zap size={23}/></div><div className={styles.cardDots} aria-hidden="true"/></Link>
        </section>
        <div className={styles.heroFootnote}><span>BUILT FOR QUESTIONS. NOT BLIND CONVICTION.</span><span>Past performance does not guarantee repayment.</span></div>
      </main>
    </div>
    <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>THE AQRA APPROACH</span><h2 id="how-title">A track record is a starting point.<br/><span>Not a promise.</span></h2></div><Link href="/whitepaper/" className={styles.textLink}>Read the whitepaper<MoveUpRight size={17}/></Link></div>
      <div className={styles.steps}>{steps.map(({ number, title, description, icon: Icon }) => <article key={number}><div className={styles.stepTop}><span>{number} /</span><Icon size={23}/></div><h3>{title}</h3><p>{description}</p></article>)}</div>
      <div className={styles.riskNote}><ShieldCheck size={22}/><div><strong>Evidence is not collateral.</strong><p>A lender can lose principal beyond the borrower’s bond. AQRA does not custody Polymarket positions or collect future trading P&amp;L. There is no live lending pool or calibrated default model.</p></div><Link href="/whitepaper/" aria-label="Read the risks and limitations"><ArrowUpRight size={22}/></Link></div>
    </section>
    <LandingStory/>
    <LandingResearch/>
    <footer className={styles.footer}><Link href="/" aria-label="AQRA home"><DotWord className={styles.footerWord}/></Link><p>Independent research. Wallet-signed credit.<br/><span>Unaudited local/testnet software. Not for mainnet use.</span></p><div><a href="https://github.com/debojyoti10CC/floorprt/tree/main/docs/mintlify" target="_blank" rel="noreferrer">Documentation<ArrowUpRight size={14}/></a><a href="https://github.com/debojyoti10CC/floorprt" target="_blank" rel="noreferrer">GitHub<ArrowUpRight size={14}/></a><Link href="/whitepaper/">Whitepaper<ArrowRight size={14}/></Link></div></footer>
  </div>;
}
