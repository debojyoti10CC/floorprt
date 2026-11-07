'use client';

import { useEffect, useRef } from 'react';

const slides = [
  {
    label: 'PREDICTION MARKETS / CREDIT INFRASTRUCTURE',
    title: ['Beyond predictions.', 'Into possibilities.'],
    description: 'Verifiable performance  |  Risk intelligence  |  Collateral-backed credit',
    image: '/images/arqo-sunset-highway.jpg',
    imageClass: 'sunset',
    imageAlt: 'A long highway leading toward a desert sunset',
  },
  {
    label: "BUILT FOR WHAT'S NEXT",
    title: ['Your history.', 'Your leverage.'],
    description: 'Performance evidence  |  Transparent assessment  |  Lender-controlled funding',
    image: '/images/arqo-mountain-highway.jpg',
    imageClass: 'mountain',
    imageAlt: 'A winding mountain highway beneath a warm peach sky',
  },
];

export function ArqoPossibilitiesSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let revertMedia: (() => void) | undefined;

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([gsapPackage, scrollTriggerPackage]) => {
      if (disposed) return;
      const gsap = gsapPackage.gsap;
      const ScrollTrigger = scrollTriggerPackage.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      const media = gsap.matchMedia();
      media.add('(min-width: 761px) and (prefers-reduced-motion: no-preference)', () => {
        const imageReveal = section.querySelector<HTMLElement>('[data-reveal-image]');
        const firstCopy = section.querySelector<HTMLElement>('[data-copy="first"]');
        const secondCopy = section.querySelector<HTMLElement>('[data-copy="second"]');
        const firstLabel = section.querySelector<HTMLElement>('[data-label="first"]');
        const secondLabel = section.querySelector<HTMLElement>('[data-label="second"]');
        const firstFill = section.querySelector<HTMLElement>('[data-progress-fill="first"]');
        const secondFill = section.querySelector<HTMLElement>('[data-progress-fill="second"]');
        if (!imageReveal || !firstCopy || !secondCopy || !firstLabel || !secondLabel || !firstFill || !secondFill) return;

        gsap.set(imageReveal, { clipPath: 'inset(0 0 0 100%)' });
        gsap.set(secondCopy, { autoAlpha: 0, y: 14 });
        gsap.set(secondLabel, { autoAlpha: 0, y: 8 });
        gsap.set(firstFill, { scaleX: 1, transformOrigin: 'left center' });
        gsap.set(secondFill, { scaleX: 0, transformOrigin: 'left center' });

        let activeSlide = 'first';
        const updateAccessibleState = (progress: number) => {
          const next = progress >= 0.5 ? 'second' : 'first';
          if (next === activeSlide) return;
          activeSlide = next;
          firstCopy.setAttribute('aria-hidden', String(next !== 'first'));
          secondCopy.setAttribute('aria-hidden', String(next !== 'second'));
          firstLabel.setAttribute('aria-hidden', String(next !== 'first'));
          secondLabel.setAttribute('aria-hidden', String(next !== 'second'));
          section.dataset.activeSlide = next;
        };

        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * 1.05)}`,
            // Pin the section itself so pinSpacing is reserved in document flow.
            // Pinning the inner stage inside this fixed-height section kept the
            // spacer trapped within the section and let the next section scroll
            // underneath it before the image reveal had finished.
            pin: section,
            pinSpacing: true,
            scrub: 0.7,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (trigger) => updateAccessibleState(trigger.progress),
          },
        });

        timeline
          .to(imageReveal, { clipPath: 'inset(0 0 0 0%)', duration: 1 }, 0)
          .to(firstCopy, { autoAlpha: 0, y: -10, duration: 0.2 }, 0.43)
          .to(secondCopy, { autoAlpha: 1, y: 0, duration: 0.2 }, 0.43)
          .to(firstLabel, { autoAlpha: 0, y: -5, duration: 0.15 }, 0.45)
          .to(secondLabel, { autoAlpha: 1, y: 0, duration: 0.15 }, 0.45)
          .to(firstFill, { scaleX: 0, duration: 1 }, 0)
          .to(secondFill, { scaleX: 1, duration: 1 }, 0);
      });

      revertMedia = () => media.revert();
      requestAnimationFrame(() => {
        if (!disposed) ScrollTrigger.refresh();
      });
    }).catch(() => {
      // The first slide remains available as a static, readable fallback.
    });

    return () => {
      disposed = true;
      revertMedia?.();
    };
  }, []);

  return (
    <section className="arqo-possibilities-section" aria-label="ARQO possibilities" ref={sectionRef}>
      <span className="arqo-possibilities-rule arqo-possibilities-rule--top" aria-hidden="true" />
      <span className="arqo-possibilities-rule arqo-possibilities-rule--bottom" aria-hidden="true" />
      <span className="arqo-possibilities-rail arqo-possibilities-rail--left" aria-hidden="true" />
      <span className="arqo-possibilities-rail arqo-possibilities-rail--right" aria-hidden="true" />

      <div className="arqo-possibilities-stage" data-possibilities-stage>
        <div className="arqo-possibilities-copy">
          <span className="arqo-possibilities-corner arqo-possibilities-corner--tl" aria-hidden="true" />
          <span className="arqo-possibilities-corner arqo-possibilities-corner--tr" aria-hidden="true" />
          <span className="arqo-possibilities-corner arqo-possibilities-corner--bl" aria-hidden="true" />
          <span className="arqo-possibilities-corner arqo-possibilities-corner--br" aria-hidden="true" />

          <div className="arqo-possibilities-label-stack">
            <div className="arqo-possibilities-label" data-label="first" aria-hidden="false"><i aria-hidden="true" />{slides[0].label}</div>
            <div className="arqo-possibilities-label" data-label="second" aria-hidden="true"><i aria-hidden="true" />{slides[1].label}</div>
          </div>
          <div className="arqo-possibilities-copy-stack">
            <article data-copy="first" aria-hidden="false">
              <h2>{slides[0].title[0]}<br />{slides[0].title[1]}</h2>
              <p>{slides[0].description}</p>
            </article>
            <article data-copy="second" aria-hidden="true">
              <h2>{slides[1].title[0]}<br />{slides[1].title[1]}</h2>
              <p>{slides[1].description}</p>
            </article>
          </div>

          <div className="arqo-possibilities-progress" aria-hidden="true">
            <span><i data-progress-fill="first" /></span>
            <span><i data-progress-fill="second" /></span>
          </div>
        </div>

        <div className="arqo-possibilities-images" role="img" aria-label="Sunset and mountain highway images">
          <img className={`arqo-possibilities-image arqo-possibilities-image--base arqo-possibilities-image--${slides[0].imageClass}`} src={slides[0].image} alt="" />
          <img className={`arqo-possibilities-image arqo-possibilities-image--reveal arqo-possibilities-image--${slides[1].imageClass}`} data-reveal-image src={slides[1].image} alt="" aria-hidden="true" />
        </div>
      </div>

      <div className="arqo-possibilities-mobile">
        {slides.map((slide) => (
          <article className="arqo-possibilities-mobile-slide" key={slide.label}>
            <img className={`arqo-possibilities-mobile-image--${slide.imageClass}`} src={slide.image} alt={slide.imageAlt} />
            <div className="arqo-possibilities-mobile-copy">
              <div className="arqo-possibilities-label"><i aria-hidden="true" />{slide.label}</div>
              <h2>{slide.title[0]}<br />{slide.title[1]}</h2>
              <p>{slide.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
