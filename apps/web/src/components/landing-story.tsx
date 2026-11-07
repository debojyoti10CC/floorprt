'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, Fingerprint, LockKeyhole, ShieldCheck, Wallet } from 'lucide-react';
import styles from './landing.module.css';

const chapters = [
  { title: 'Start with the evidence.', label: 'Discover', text: 'Read dated public wallet history, not a promise of future returns. ENS helps discover associated addresses; every additional controller must consent.', detail: '01 / PUBLIC HISTORY · PRIVATE KEYS STAY YOURS' },
  { title: 'Separate signal from risk.', label: 'Stress-test', text: 'Walk-forward research measures next-month trader P&L. The credit engine separately stresses default, correlation and bond recovery. One is never a substitute for the other.', detail: '02 / PERFORMANCE ≠ REPAYMENT PROBABILITY' },
  { title: 'Put your terms onchain.', label: 'Request', text: 'Review fixed terms and sign a request with an escrowed first-loss bond. An authenticated report binds the evidence and request. Your external trading positions stay outside AQRA.', detail: '03 / WALLET-SIGNED · BOND-BACKED REQUEST' },
  { title: 'A separate lender decides.', label: 'Fund', text: 'The lender reviews evidence, terms and possible principal loss, then explicitly acknowledges the risk before signing. Funding is a contract transaction—not a dashboard animation.', detail: '04 / DISTINCT WALLETS · EXPLICIT LOSS ACKNOWLEDGEMENT' },
  { title: 'Two outcomes. No hidden sweep.', label: 'Resolve', text: 'Voluntary full repayment returns the bond. After maturity, an unpaid loan can transfer the bond to the lender and record a shortfall. AQRA cannot collect future trading profits.', detail: '05 / REPAYMENT OR BOND-ONLY RECOVERY' },
];

function StoryVisual({ active, outcome, setOutcome }: { active: number; outcome: 'repay' | 'default'; setOutcome: (value: 'repay' | 'default') => void }) {
  return <div className={styles.storyVisual} data-testid="story-visual" data-stage={active}>
    <div className={styles.visualTop}><span><i/>AQRA / PRODUCT WALKTHROUGH</span><span>0{active + 1}—05</span></div>
    <div className={styles.visualBody}>
      <div className={styles.visualOrbit} aria-hidden="true"><span/><span/><span/></div>
      <div className={styles.identityNode}><Fingerprint size={29}/><div><small>BORROWER-CONSENTED</small><strong>Wallet evidence</strong></div><ShieldCheck size={20}/></div>
      <div className={styles.connector} aria-hidden="true"><span/><ArrowDown size={17}/></div>
      <div className={styles.evidencePanel} key={active}>
        {active === 0 && <><div className={styles.panelLabel}>DATED PUBLIC DATA <Fingerprint size={17}/></div><strong className={styles.visualTitle}>A history, not a credit score.</strong><div className={styles.miniChart} aria-hidden="true">{[24, 42, 33, 61, 45, 75, 58, 82, 69, 94, 78, 88].map((height, i) => <i key={i} style={{ height: `${height}%` }}/>)}</div><div className={styles.visualRow}><span>Illustrative activity graphic</span><span>AS-OF CUTOFF</span></div><p>Up to four associated addresses.<br/>Controller consent is required.</p></>}
        {active === 1 && <><div className={styles.panelLabel}>INDEPENDENT CREDIT STRESS <ShieldCheck size={17}/></div><strong className={styles.visualTitle}>Make assumptions visible.</strong><div className={styles.assumptionRows}><div><span>Assumed default probability</span><b>5%</b></div><div><span>Assumed default correlation</span><b>25%</b></div><div><span>Assumed bond recovery</span><b>100%</b></div></div><div className={styles.gate}>POOLED CREDIT GATE <strong>REJECT</strong></div><p>No mature loan labels, calibrated PD,<br/>validated credit model or funded reserve.</p></>}
        {active === 2 && <><div className={styles.panelLabel}>ILLUSTRATIVE LOCAL TERMS <LockKeyhole size={17}/></div><strong className={styles.visualTitle}>A request you sign.</strong><div className={styles.termGrid}><div><span>Principal</span><strong>$100</strong></div><div><span>Fixed total due</span><strong>$102</strong></div></div><div className={styles.bondStrip}><LockKeyhole size={18}/><span>Escrowed first-loss bond</span><strong>$25</strong></div><p>Test USDC only. The bond is the only pledged asset in this credit desk.</p></>}
        {active === 3 && <><div className={styles.panelLabel}>SEPARATE LENDER REVIEW <Wallet size={17}/></div><strong className={styles.visualTitle}>See the downside first.</strong><div className={styles.exposure}><span>Possible principal shortfall</span><strong>$75</strong><span>on default, assuming full $25 bond recovery</span></div><div className={styles.acknowledgement}><Check size={17}/>Explicit risk acknowledgement required</div><p>A lender can lose principal. Fees and recovery haircuts can worsen the outcome.</p></>}
        {active === 4 && <><div className={styles.panelLabel}>ILLUSTRATIVE OUTCOMES <ShieldCheck size={17}/></div><div className={styles.outcomeToggle} aria-label="Illustrative loan outcome"><button type="button" aria-pressed={outcome === 'repay'} onClick={() => setOutcome('repay')}>Full repayment</button><button type="button" aria-pressed={outcome === 'default'} onClick={() => setOutcome('default')}>Matured default</button></div><div className={styles.cashFlow}><div><span>{outcome === 'repay' ? 'Borrower pays lender' : 'Bond transferred to lender'}</span><strong>{outcome === 'repay' ? '$102' : '$25'}</strong></div><ArrowDown size={20}/><div><span>{outcome === 'repay' ? 'Bond returned to borrower' : 'Lender principal shortfall'}</span><strong>{outcome === 'repay' ? '$25' : '$75'}</strong></div></div><p>{outcome === 'repay' ? 'Full fixed due repaid voluntarily. No automatic trading-account withdrawal.' : 'Assumes full bond recovery. No claim on external positions or future P&L.'}</p></>}
      </div>
      <div className={styles.visualCaption}>EXPLANATORY VISUAL · NOT A TRANSACTION OR LIVE BALANCE</div>
    </div>
    <div className={styles.visualBottom}><span>PUBLIC EVIDENCE</span><span>→</span><span>EXPLICIT RISK</span><span>→</span><span>YOUR SIGNATURE</span></div>
  </div>;
}

export function LandingStory() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [outcome, setOutcome] = useState<'repay' | 'default'>('repay');
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const items = [...element.querySelectorAll<HTMLElement>('[data-chapter]')];
      const target = innerHeight * .48;
      let nearest = 0;
      let distance = Infinity;
      items.forEach((item, index) => {
        const rect = item.getBoundingClientRect();
        const nextDistance = Math.abs(rect.top + rect.height / 2 - target);
        if (nextDistance < distance) { distance = nextDistance; nearest = index; }
      });
      setActive(nearest);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    update();
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);
  const goTo = (index: number) => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`aqra-chapter-${index}`)?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'center' });
  };
  return <section className={styles.story} ref={root} aria-labelledby="story-title">
    <div className={styles.storyHeading}><span className={styles.eyebrow}>FROM WALLET HISTORY TO A CREDIT REQUEST</span><h2 id="story-title">Follow the evidence.<br/><span>Understand every step.</span></h2><p>Scroll through the product. Nothing moves without a signature.</p></div>
    <div className={styles.storyLayout}>
      <div className={styles.storyChapters}>{chapters.map((chapter, index) => <article id={`aqra-chapter-${index}`} data-chapter={index} data-active={active === index} key={chapter.label} className={styles.chapter}><span className={styles.chapterIndex}>0{index + 1}<span>/ 05</span></span><h3>{chapter.title}</h3><p>{chapter.text}</p><span className={styles.chapterDetail}>{chapter.detail}</span></article>)}</div>
      <div className={styles.stickyStage}><StoryVisual active={active} outcome={outcome} setOutcome={setOutcome}/><nav className={styles.chapterNav} aria-label="Product walkthrough chapters">{chapters.map((chapter, index) => <button type="button" key={chapter.label} aria-current={active === index ? 'step' : undefined} onClick={() => goTo(index)}><span>0{index + 1}</span>{chapter.label}</button>)}</nav><Link href="/underwriting/" className={styles.storyAppLink}>Try the working local/testnet interface<ArrowUpRight size={16}/></Link></div>
    </div>
  </section>;
}
