'use client';

import { useEffect, useRef, useState } from 'react';

const GOLD = '#BBA64F';
const DOTS = ['#727270', '#AAA9A4', '#C9C7C0'] as const;
const ENTRANCE_MS = 1_450;
const MORPH_MS = 720;
const TIMEFRAMES = ['1D', '7D', '30D'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const DATASETS: Record<Timeframe, number[]> = {
  '1D': [
    2, 2, 3, 6, 4, 2, 2, 3, 2, 1, 2, 3, 2, 1, 1, 2, 3, 2, 1, 1,
    2, 4, 8, 7, 6, 4, 6, 4, 3, 2, 1, 3, 2, 1, 3, 1, 2, 5, 3, 2,
    1, 4, 3, 2, 1,
  ],
  '7D': [
    3, 4, 5, 8, 5, 3, 3, 4, 3, 2, 3, 4, 3, 2, 2, 3, 4, 3, 2, 2,
    3, 5, 11, 9, 8, 7, 8, 6, 5, 4, 3, 6, 3, 2, 4, 2, 3, 7, 4, 3,
    2, 6, 4, 3, 2,
  ],
  '30D': [
    3, 4, 5, 8, 5, 3, 3, 4, 3, 2, 3, 4, 3, 2, 2, 3, 4, 3, 2, 2,
    3, 5, 12, 10, 8, 7, 8, 6, 5, 4, 3, 6, 3, 2, 4, 2, 3, 7, 4, 3,
    2, 6, 4, 3, 2,
  ],
};

type DotMatrixWaveProps = {
  className?: string;
};

export function DotMatrixWave({ className = '' }: DotMatrixWaveProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('30D');
  const cardRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metricRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipTitleRef = useRef<HTMLSpanElement>(null);
  const tooltipDetailRef = useRef<HTMLSpanElement>(null);
  const timeframeRef = useRef<Timeframe>('30D');
  const fromHeightsRef = useRef<number[]>(DATASETS['30D']);
  const currentHeightsRef = useRef<number[]>(DATASETS['30D']);
  const transitionStartedRef = useRef(0);

  useEffect(() => {
    const card = cardRef.current;
    const chart = chartRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!card || !chart || !canvas || !context) return;

    const cardElement = card;
    const chartElement = chart;
    const canvasElement = canvas;
    const drawingContext = context;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let width = 0;
    let height = 0;
    let dpr = 1;
    let columns = 0;
    let columnSpacing = 12;
    let rowSpacing = 11;
    let dotSize = 4.2;
    let frame = 0;
    let disposed = false;
    let inView = false;
    let opacity = 0;
    let entranceStarted = 0;
    let animationStarted = 0;
    let pointerEnabled = finePointer.matches && !motionPreference.matches;
    let pointerInside = false;
    let pointerX = -1_000;
    let pointerY = -1_000;
    let lastTooltipColumn = -1;

    const resize = () => {
      const rect = chartElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (!width || !height) return;

      const mobile = window.matchMedia('(max-width: 760px)').matches;
      const tablet = window.matchMedia('(max-width: 1099px)').matches;
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : tablet ? 1.25 : 1.5);
      canvasElement.width = Math.round(width * dpr);
      canvasElement.height = Math.round(height * dpr);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.max(mobile ? 18 : 28, Math.min(48, Math.floor((width - 20) / (mobile ? 11 : 11.6))));
      columnSpacing = columns > 1 ? (width - 20) / (columns - 1) : width;
      rowSpacing = mobile ? 10 : tablet ? 12 : 13;
      dotSize = mobile ? 3.8 : 4.2;
      requestDraw();
    };

    const pointerMove = (event: PointerEvent) => {
      if (!pointerEnabled || event.pointerType === 'touch') return;
      const rect = chartElement.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      pointerInside = true;
      requestDraw();
    };

    const pointerLeave = () => {
      pointerInside = false;
      pointerX = -1_000;
      pointerY = -1_000;
      if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
      lastTooltipColumn = -1;
      if (inView) requestDraw();
    };

    function requestDraw() {
      if (!disposed && frame === 0) frame = window.requestAnimationFrame(draw);
    }

    function draw(now: number) {
      frame = 0;
      if (disposed || !width || !height) return;

      const reducedMotion = motionPreference.matches;
      const targetOpacity = inView ? 1 : 0;
      if (reducedMotion) opacity = targetOpacity;
      else opacity += (targetOpacity - opacity) * 0.12;
      cardElement.style.opacity = opacity.toFixed(3);

      if (!inView && opacity < 0.008) {
        opacity = 0;
        cardElement.style.opacity = '0';
        return;
      }

      if (inView && entranceStarted === 0) {
        entranceStarted = now;
        animationStarted = now + ENTRANCE_MS;
      }
      const elapsed = entranceStarted ? now - entranceStarted : 0;
      const animationTime = reducedMotion || now < animationStarted ? 0 : (now - animationStarted) / 1_000;
      const transitionProgress = reducedMotion || transitionStartedRef.current === 0
        ? 1
        : clamp((now - transitionStartedRef.current) / MORPH_MS, 0, 1);
      const easedTransition = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
      const targetHeights = DATASETS[timeframeRef.current];
      const visibleHeights = targetHeights.map((target, index) => {
        const from = fromHeightsRef.current[index] ?? target;
        const result = from + (target - from) * easedTransition;
        currentHeightsRef.current[index] = result;
        return result;
      });
      const valueProgress = reducedMotion ? 1 : clamp((elapsed - 140) / 720, 0, 1);
      if (metricRef.current) metricRef.current.textContent = `$${valueProgress.toFixed(2)}`;

      renderDots(drawingContext, {
        width,
        height,
        columns,
        columnSpacing,
        rowSpacing,
        dotSize,
        elapsed: reducedMotion ? ENTRANCE_MS : elapsed,
        animationTime,
        heights: visibleHeights,
        pointerX: pointerEnabled && pointerInside ? pointerX : null,
      });
      updateTooltip(pointerInside && pointerEnabled ? pointerX : null, pointerY, width, height, columns, columnSpacing);

      if ((inView && !reducedMotion) || Math.abs(targetOpacity - opacity) >= 0.008) requestDraw();
    }

    function updateTooltip(
      x: number | null,
      y: number,
      plotWidth: number,
      plotHeight: number,
      count: number,
      spacing: number,
    ) {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (x === null) {
        tooltip.style.opacity = '0';
        lastTooltipColumn = -1;
        return;
      }
      const gridWidth = (count - 1) * spacing;
      const left = (plotWidth - gridWidth) / 2;
      const nearest = clamp(Math.round((x - left) / spacing), 0, count - 1);
      if (nearest !== lastTooltipColumn) {
        lastTooltipColumn = nearest;
        if (tooltipTitleRef.current) tooltipTitleRef.current.textContent = `SCENARIO ${String(nearest + 1).padStart(2, '0')}`;
        if (tooltipDetailRef.current) tooltipDetailRef.current.textContent = `$1.00 USDC · ILLUSTRATIVE`;
      }
      tooltip.style.left = `${clamp(x, 68, plotWidth - 68)}px`;
      tooltip.style.top = `${clamp(y - 36, 12, plotHeight - 44)}px`;
      tooltip.style.opacity = '1';
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(chartElement);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) {
        entranceStarted = 0;
        animationStarted = 0;
      }
      requestDraw();
    }, { rootMargin: '80px 0px' });
    intersectionObserver.observe(cardElement);

    const updateInteraction = () => {
      pointerEnabled = finePointer.matches && !motionPreference.matches;
      if (!pointerEnabled) pointerLeave();
      requestDraw();
    };

    chartElement.addEventListener('pointermove', pointerMove, { passive: true });
    chartElement.addEventListener('pointerleave', pointerLeave, { passive: true });
    finePointer.addEventListener('change', updateInteraction);
    motionPreference.addEventListener('change', updateInteraction);
    resize();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      chartElement.removeEventListener('pointermove', pointerMove);
      chartElement.removeEventListener('pointerleave', pointerLeave);
      finePointer.removeEventListener('change', updateInteraction);
      motionPreference.removeEventListener('change', updateInteraction);
    };
  }, []);

  useEffect(() => {
    fromHeightsRef.current = [...currentHeightsRef.current];
    timeframeRef.current = timeframe;
    transitionStartedRef.current = performance.now();
  }, [timeframe]);

  return (
    <div ref={cardRef} className={`dot-matrix-card ${className}`}>
      <header className="dot-matrix-card__header">
        <div className="dot-matrix-card__metric">
          <span className="dot-matrix-card__eyebrow">ILLUSTRATIVE FLOOR</span>
          <div className="dot-matrix-card__value"><strong ref={metricRef}>$1.00</strong><span>USDC</span></div>
        </div>
        <div className="dot-matrix-card__ranges" role="group" aria-label="Illustrative chart timeframe">
          {TIMEFRAMES.map((range) => (
            <button
              key={range}
              type="button"
              className={timeframe === range ? 'is-selected' : ''}
              aria-pressed={timeframe === range}
              onClick={() => setTimeframe(range)}
            >
              {range}
            </button>
          ))}
        </div>
      </header>
      <div className="dot-matrix-card__divider" />
      <div ref={chartRef} className="dot-matrix-card__chart" role="img" aria-label={`${timeframe} illustrative settlement floor chart`}>
        <canvas ref={canvasRef} className="dot-matrix-wave__canvas" aria-hidden="true" />
        <div ref={tooltipRef} className="dot-matrix-card__tooltip" aria-hidden="true">
          <span ref={tooltipTitleRef}>SCENARIO 01</span>
          <strong ref={tooltipDetailRef}>$1.00 USDC · ILLUSTRATIVE</strong>
        </div>
      </div>
      <footer className="dot-matrix-card__footer"><span>PORTFOLIO 01</span><span>ILLUSTRATIVE DATA</span></footer>
    </div>
  );
}

type RenderOptions = {
  width: number;
  height: number;
  columns: number;
  columnSpacing: number;
  rowSpacing: number;
  dotSize: number;
  elapsed: number;
  animationTime: number;
  heights: number[];
  pointerX: number | null;
};

function renderDots(context: CanvasRenderingContext2D, options: RenderOptions) {
  const { width, height, columns, columnSpacing, rowSpacing, dotSize, elapsed, animationTime, heights, pointerX } = options;
  context.clearRect(0, 0, width, height);
  if (!columns || !heights.length) return;

  const gridWidth = (columns - 1) * columnSpacing;
  const left = (width - gridWidth) / 2;
  const baseline = height * 0.83;
  const phase = (animationTime * Math.PI * 2) / 10;
  const activeColumn = pointerX === null ? -1 : clamp(Math.round((pointerX - left) / columnSpacing), 0, columns - 1);
  const highlightCenter = (0.5 + Math.sin(phase * 0.34) * 0.36) * (columns - 1);

  for (let column = 0; column < columns; column += 1) {
    const normalizedX = column / Math.max(1, columns - 1);
    const x = left + column * columnSpacing;
    const sourceIndex = Math.round(normalizedX * (heights.length - 1));
    const localMotion = animationTime > 0
      ? Math.exp(-(((column - highlightCenter) / 2.6) ** 2)) * Math.sin(phase + column * 0.13) * 0.48
      : 0;
    const dotCount = Math.max(0.8, Math.min(12, heights[sourceIndex] + localMotion));
    const count = Math.ceil(dotCount);
    const distanceFromPointer = activeColumn < 0 ? Infinity : Math.abs(column - activeColumn);
    const isHighlighted = distanceFromPointer < 0.6;
    const revealOffset = normalizedX * 430;
    const activeRegion = normalizedX >= 0.48 && normalizedX <= 0.57;

    for (let dot = 0; dot < count; dot += 1) {
      // Reveal each column left-to-right and each column bottom-to-top.
      const reveal = clamp((elapsed - revealOffset - dot * 34) / 440, 0, 1);
      if (reveal <= 0) continue;
      const y = baseline - dot * rowSpacing;
      const isTopDot = dot === count - 1;
      const fractionalDotOpacity = isTopDot ? dotCount - (count - 1) : 1;
      const tone = isTopDot ? 2 : dot >= count - 3 ? 1 : 0;
      const hoverOpacity = activeColumn < 0 ? 1 : isHighlighted ? 1.22 : 0.93;
      context.globalAlpha = [0.66, 0.78, 0.9][tone] * reveal * fractionalDotOpacity * hoverOpacity;
      context.fillStyle = activeRegion && dot >= count - 4 ? GOLD : DOTS[tone];
      context.beginPath();
      context.arc(x, y, dotSize / 2, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
