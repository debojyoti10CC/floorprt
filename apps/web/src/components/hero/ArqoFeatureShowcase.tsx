'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { FeatureGeometry } from './FeatureGeometry';

const features = [
  {
    id: '01',
    title: 'Performance Evidence',
    description: 'Turn prediction-market activity into structured financial evidence for lender review.',
    cta: 'Explore Evidence',
    href: '/underwriting/',
  },
  {
    id: '02',
    title: 'Risk, quantified.',
    description: 'Evaluate collateral coverage, downside exposure, and borrowing risk before funding.',
    cta: 'Explore Risk Engine',
    href: '/underwriting/#risk-engine',
  },
  {
    id: '03',
    title: 'Liquidity, unlocked.',
    description: 'Use eligible collateral and historical performance evidence to request funding for lender review.',
    cta: 'Explore Credit Desk',
    href: '/app/credit/',
  },
];

function setActiveFeature(root: HTMLElement, activeId: string | null) {
  root.querySelectorAll<HTMLElement>('[data-story-feature]').forEach((feature) => {
    const active = feature.dataset.storyFeature === activeId;
    feature.inert = !active;
    feature.setAttribute('aria-hidden', String(!active));
    feature.querySelectorAll('a').forEach((link) => link.setAttribute('tabindex', active ? '0' : '-1'));
  });
}

export function ArqoFeatureShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let revertContext: (() => void) | undefined;
    let removeLoadListener: (() => void) | undefined;
    let layoutRefreshFrame = 0;

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([gsapPackage, scrollTriggerPackage]) => {
      if (disposed) return;
      const gsap = gsapPackage.gsap;
      const ScrollTrigger = scrollTriggerPackage.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      const media = gsap.matchMedia();
      media.add('(min-width: 761px) and (prefers-reduced-motion: no-preference)', () => {
        const introTitle = section.querySelector<HTMLElement>('[data-story-intro]');
        const eyebrow = section.querySelector<HTMLElement>('[data-story-eyebrow]');
        const articles = gsap.utils.toArray<HTMLElement>('[data-story-feature]', section);
        const geometry = gsap.utils.toArray<SVGGElement>('[data-geometry-scene]', section);
        const svgLines = gsap.utils.toArray<SVGElement>('[data-geometry-line]', section);

        svgLines.forEach((line) => line.setAttribute('pathLength', '1'));

        gsap.set(articles, { autoAlpha: 0, y: 18 });
        gsap.set(eyebrow, { autoAlpha: 0, y: -8 });
        gsap.set(geometry, { autoAlpha: 0, x: 14, scale: 0.985, transformOrigin: '50% 50%' });
        gsap.set('[data-geometry-scene="intro"]', { autoAlpha: 1, x: 0, scale: 1 });
        gsap.set(svgLines, { strokeDasharray: 1, strokeDashoffset: 1 });
        gsap.set(section.querySelectorAll('[data-geometry-scene="intro"] [data-geometry-line]'), { strokeDasharray: 1, strokeDashoffset: 1 });
        setActiveFeature(section, null);

        let accessibleFeature: string | null = null;
        let isWithinStory = false;
        const story = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * 4.9)}`,
            pin: stage,
            pinSpacing: true,
            refreshPriority: 2,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onEnter: () => { isWithinStory = true; },
            onEnterBack: () => { isWithinStory = true; },
            onLeave: () => {
              isWithinStory = false;
              accessibleFeature = null;
              setActiveFeature(section, null);
            },
            onLeaveBack: () => {
              isWithinStory = false;
              accessibleFeature = null;
              setActiveFeature(section, null);
            },
          },
        });

        story
          .to(section.querySelectorAll('[data-geometry-scene="intro"] [data-geometry-line]'), { strokeDashoffset: 0, duration: 0.9, stagger: 0.12, ease: 'none' }, 0)
          .to(introTitle, { autoAlpha: 0, y: -18, duration: 0.34 }, 0.62)
          .to(eyebrow, { autoAlpha: 1, y: 0, duration: 0.32 }, 0.68)
          .to('[data-geometry-scene="intro"]', { autoAlpha: 0.18, scale: 0.97, duration: 0.36 }, 0.7);

        const enterFeature = (feature: HTMLElement, index: number, start: number) => {
          const id = feature.dataset.storyFeature ?? '01';
          const geom = section.querySelector<SVGGElement>(`[data-geometry-scene="${id}"]`);
          const previousGeom = section.querySelector<SVGGElement>(`[data-geometry-scene="${index === 0 ? 'intro' : features[index - 1].id}"]`);
          const startAt = start;
          const exitAt = start + 0.91;
          const nextStart = start + 1.0;

          story.fromTo(feature, { autoAlpha: 0, y: 17 }, { autoAlpha: 1, y: 0, duration: 0.31, ease: 'power2.out' }, startAt);
          if (previousGeom) story.to(previousGeom, { autoAlpha: 0, scale: 0.985, x: -10, duration: 0.34 }, startAt);
          if (geom) {
            story.fromTo(geom, { autoAlpha: 0, scale: 0.97, x: 16 }, { autoAlpha: 1, scale: 1, x: 0, duration: 0.42, ease: 'power2.out' }, startAt + 0.03);
            story.to(geom.querySelectorAll('[data-geometry-line]'), { strokeDashoffset: 0, duration: 0.68, stagger: 0.055, ease: 'none' }, startAt + 0.12);
          }
          if (index < articles.length - 1) {
            story.to(feature, { autoAlpha: 0, y: -13, duration: 0.31 }, exitAt);
          }
          return nextStart;
        };

        let cursor = enterFeature(articles[0], 0, 0.88);
        cursor = enterFeature(articles[1], 1, cursor);
        enterFeature(articles[2], 2, cursor);

        story.to('[data-geometry-scene="03"]', { scale: 1.035, duration: 0.3, ease: 'none' }, 4.55);
        story.eventCallback('onUpdate', () => {
          if (!isWithinStory) return;
          const time = story.time();
          const active = time >= 2.88 ? '03' : time >= 1.88 ? '02' : time >= 0.88 ? '01' : null;
          if (active !== accessibleFeature) {
            accessibleFeature = active;
            setActiveFeature(section, active);
          }
        });
      });

      revertContext = () => media.revert();
      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener('load', refresh, { once: true });
      removeLoadListener = () => window.removeEventListener('load', refresh);
      layoutRefreshFrame = window.requestAnimationFrame(() => {
        layoutRefreshFrame = window.requestAnimationFrame(() => {
          if (!disposed) {
            ScrollTrigger.sort();
            ScrollTrigger.refresh();
          }
        });
      });
      document.fonts?.ready.then(() => {
        if (!disposed) {
          ScrollTrigger.sort();
          ScrollTrigger.refresh();
        }
      });
      ScrollTrigger.refresh();
    }).catch(() => {
      // Keep the section readable as a static sequence if animation chunks cannot load.
    });

    return () => {
      disposed = true;
      if (layoutRefreshFrame) window.cancelAnimationFrame(layoutRefreshFrame);
      removeLoadListener?.();
      revertContext?.();
    };
  }, []);

  return (
    <section className="arqo-scroll-story" id="arqo-capabilities" aria-labelledby="arqo-story-title arqo-story-static-title" ref={sectionRef}>
      <div className="arqo-scroll-stage" ref={stageRef}>
        <div className="arqo-story-guides" aria-hidden="true">
          <span className="arqo-story-horizontal-guide" />
          <span className="arqo-story-vertical-guide" />
          <span className="arqo-story-crosshair" />
          <span className="arqo-story-edge-mark arqo-story-edge-mark--left" />
          <span className="arqo-story-edge-mark arqo-story-edge-mark--right" />
        </div>
        <h2 className="arqo-story-intro" id="arqo-story-title" data-story-intro>Built for verifiable credit.</h2>
        <div className="arqo-story-eyebrow" data-story-eyebrow><i /> BUILT FOR VERIFIABLE CREDIT</div>
        <FeatureGeometry className="arqo-story-geometry" />

        <div className="arqo-story-content">
          {features.map((feature) => (
            <article className="arqo-story-feature" data-story-feature={feature.id} aria-hidden="true" inert key={feature.id}>
              <span className="arqo-story-index">{'{' + feature.id + '}'}</span>
              <div className="arqo-story-copy">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <Link className="arqo-story-link" href={feature.href} tabIndex={-1}>
                  <span>{feature.cta}</span><i><Plus size={19} strokeWidth={1.5} /></i>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="arqo-story-static" aria-label="ARQO capabilities">
        <h2 id="arqo-story-static-title">Built for verifiable credit.</h2>
        {features.map((feature) => (
          <article className="arqo-story-static-feature" key={feature.id}>
            <span className="arqo-story-static-number">{'{' + feature.id + '}'}</span>
            <FeatureGeometry className="arqo-story-static-geometry" scene={feature.id as '01' | '02' | '03'} />
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
            <Link className="arqo-story-link" href={feature.href}>
              <span>{feature.cta}</span><i><Plus size={19} strokeWidth={1.5} /></i>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
