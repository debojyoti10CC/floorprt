'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Menu,
  X,
} from 'lucide-react';
import { KineticGrid } from './kinetic-grid';
import { CornerBrackets, LandingPageFrame, SectionDivider } from './LandingPageFrame';
import { ArqoLogo } from './ArqoLogo';
import { ArqoFeatureShowcase } from './hero/ArqoFeatureShowcase';
import { ParticleWaveSection } from './hero/ParticleWaveSection';
import { ArqoPossibilitiesSection } from './hero/ArqoPossibilitiesSection';

const navigation = [
  ['Whitepaper', '/whitepaper.pdf'],
];

export function ARQOHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState('');

  const submitNewsletter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewsletterMessage('Newsletter signup is not connected yet. Your email was not sent.');
  };

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
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <span className="home-nav-unconfigured" aria-disabled="true" title="Official X account link is not configured">X</span>
        </nav>
      </header>
      <SectionDivider />

      <main id="main-content">
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <CornerBrackets />
            <div className="home-eyebrow">CREDIT INFRASTRUCTURE FOR PREDICTION MARKETS</div>
            <h1 id="hero-title">
              <span className="hero-line-mask"><span className="hero-line">Your edge.</span></span>
              <span className="hero-line-mask"><span className="hero-line hero-line-accent">Your capital.</span></span>
            </h1>
            <p className="hero-lead">Your track record deserves more than a leaderboard.</p>
            <div className="hero-actions">
              <Link className="hero-segment-button" href="/app/"><span>Launch Terminal</span><i><ArrowRight size={15} /></i></Link>
            </div>
          </div>
          <div className="hero-visual-reveal">
            <img
              className="hero-highway-image"
              src="/images/arqo-monochrome-highway.png"
              alt="A curved highway lit by streetlights at night"
              fetchPriority="high"
            />
          </div>
        </section>
        <SectionDivider />

        <ArqoFeatureShowcase />
        <SectionDivider />
        <ParticleWaveSection />
        <SectionDivider />
        <ArqoPossibilitiesSection />
        <SectionDivider />

        <section className="arqo-next-era" aria-labelledby="next-era-title">
          <KineticGrid className="arqo-next-era-grid" />
          <div className="arqo-next-era-content">
            <h2 id="next-era-title">The next era of prediction<br className="arqo-next-era-break" /> markets starts with ARQO.</h2>
            <Link className="arqo-next-era-cta" href="/app/">
              <span>Explore ARQO</span><i aria-hidden="true">+</i>
            </Link>
          </div>
        </section>
        <SectionDivider />

        <section className="home-newsletter" aria-labelledby="newsletter-title">
          <div className="home-newsletter-content">
            <CornerBrackets />
            <div className="home-newsletter-label">[ Newsletter ]</div>
            <h2 id="newsletter-title">Stay ahead with ARQO.</h2>
            <form className="home-newsletter-form" onSubmit={submitNewsletter}>
              <label className="home-newsletter-sr-only" htmlFor="newsletter-email">Email address</label>
              <input id="newsletter-email" name="email" type="email" autoComplete="email" placeholder="Enter your email..." required />
              <button type="submit">Subscribe</button>
            </form>
            <p className="home-newsletter-support">Protocol updates, product releases, and insights. No spam.</p>
            <p className="home-newsletter-status" aria-live="polite">
              {newsletterMessage || 'Newsletter signup is not connected yet. No email will be sent.'}
            </p>
          </div>
        </section>
        <SectionDivider />
      </main>

      <footer className="home-footer">
        <div className="home-footer-brand">
          <Link className="home-brand" href="/" aria-label="ARQO home"><ArqoLogo variant="light" size={23} /></Link>
          <p>Infrastructure for collateral-backed credit in prediction markets.</p>
        </div>
        <nav className="home-footer-group" aria-label="Explore">
          <h2>Explore</h2>
          <Link href="/app/">ARQO Terminal</Link>
          <Link href="/app/docs/">Documentation</Link>
          <Link href="/underwriting/">Protocol Overview</Link>
        </nav>
        <div className="home-footer-group">
          <h2>Socials</h2>
          <p>Social channels are not configured.</p>
        </div>
        <div className="home-footer-bottom">
          <span>Copyright © 2026 ARQO.</span>
          <div><span>Privacy</span><span aria-hidden="true">|</span><span>Terms</span></div>
        </div>
      </footer>
      </LandingPageFrame>
    </div>
  );
}

function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
      const context = gsap.context(() => {
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
        intro
          .fromTo('.home-header', { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.55 })
          .fromTo('.hero-line', { yPercent: 112 }, { yPercent: 0, duration: 0.88, stagger: 0.12 }, '-=0.25')
          .fromTo('.hero-lead', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.58 }, '-=0.24')
          .fromTo('.hero-actions > *', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.11 }, '-=0.2')
          .fromTo('.hero-visual-reveal', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, '-=0.18');

        gsap.to('.aqra-home', {
          backgroundColor: '#414148',
          ease: 'none',
          scrollTrigger: { trigger: 'main', start: 'top top', end: 'bottom bottom', scrub: 1 },
        });

        ScrollTrigger.refresh();
        document.fonts?.ready.then(() => { if (!cancelled) ScrollTrigger.refresh(); });
      }, root ?? undefined);

      const refreshAfterLoad = () => ScrollTrigger.refresh();
      window.addEventListener('load', refreshAfterLoad, { once: true });

      cleanupMotion = () => {
        window.removeEventListener('load', refreshAfterLoad);
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
