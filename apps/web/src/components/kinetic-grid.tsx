'use client';

import { useEffect, useRef } from 'react';

type KineticGridProps = {
  className?: string;
};

const DESKTOP_CELL = 65;
const TABLET_CELL = 78;
const MOBILE_CELL = 86;
const INFLUENCE_RADIUS = 200;
const MAX_WARP = 7;
const LERP_SPEED = 0.045;
const RIPPLE_DURATION = 720;
const RIPPLE_DISPLACEMENT = 1.8;

type GridPoint = { x: number; y: number };
type GridField = GridPoint & { field: number; ripple: number };

export function KineticGrid({ className = '' }: KineticGridProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const canvas = canvasRef.current;
    const section = layer?.parentElement;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!layer || !canvas || !section || !context) return;
    const drawingContext: CanvasRenderingContext2D = context;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let width = 0;
    let height = 0;
    let dpr = 1;
    let cellSize = DESKTOP_CELL;
    let points: GridPoint[] = [];
    let columns = 0;
    let rows = 0;
    let frame = 0;
    let inViewport = false;
    let disposed = false;
    let pointerEnabled = false;
    let pointerInside = false;
    let lastClientX = 0;
    let lastClientY = 0;
    let pointerX = -1_000;
    let pointerY = -1_000;
    let rippleX = -1_000;
    let rippleY = -1_000;
    let rippleStartedAt = 0;
    let rippleActive = false;
    let rippleReturning = false;

    const rgb = '255, 255, 255';

    const fitCanvas = () => {
      const rect = section.getBoundingClientRect();
      width = Math.max(0, rect.width);
      height = Math.max(0, rect.height);
      const narrow = window.matchMedia('(max-width: 760px)').matches;
      const tablet = window.matchMedia('(max-width: 1099px)').matches;
      cellSize = narrow ? MOBILE_CELL : tablet ? TABLET_CELL : DESKTOP_CELL;
      dpr = Math.min(window.devicePixelRatio || 1, narrow ? 1 : 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);

      columns = Math.ceil(width / cellSize) + 1;
      rows = Math.ceil(height / cellSize) + 1;
      points = Array.from({ length: columns * rows }, (_, index) => ({
        x: (index % columns) * cellSize,
        y: Math.floor(index / columns) * cellSize,
      }));
      if (pointerInside) updatePointerPosition();
      requestDraw();
    };

    const updatePointerPosition = () => {
      const rect = section.getBoundingClientRect();
      pointerX = lastClientX - rect.left;
      pointerY = lastClientY - rect.top;
    };

    const pointerMove = (event: PointerEvent) => {
      if (!pointerEnabled || event.pointerType === 'touch') return;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      pointerInside = true;
      updatePointerPosition();
      requestDraw();
    };

    const pointerLeave = () => {
      pointerInside = false;
      pointerX = -1_000;
      pointerY = -1_000;
      requestDraw();
    };

    const click = (event: MouseEvent) => {
      if (!pointerEnabled || event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('a, button, input, textarea, select, iframe, [role="button"]')) return;
      // Only clicks landing on the section's open background create ripples.
      // Content, artwork, and controls keep their ordinary pointer behavior.
      if (target !== section) return;
      const rect = section.getBoundingClientRect();
      rippleX = event.clientX - rect.left;
      rippleY = event.clientY - rect.top;
      rippleStartedAt = performance.now();
      rippleActive = true;
      rippleReturning = false;
      requestDraw();
    };

    const scroll = () => {
      if (!pointerInside) return;
      updatePointerPosition();
      requestDraw();
    };

    function requestDraw() {
      if (!disposed && inViewport && frame === 0) frame = window.requestAnimationFrame(draw);
    }

    function draw(now: number) {
      frame = 0;
      if (disposed || !inViewport || width <= 0 || height <= 0) return;

      drawingContext.clearRect(0, 0, width, height);
      let needsAnotherFrame = false;
      const reducedMotion = motionPreference.matches;
      const radius = INFLUENCE_RADIUS;
      const rippleProgress = rippleActive ? Math.min(1, (now - rippleStartedAt) / RIPPLE_DURATION) : 1;
      const rippleRadius = rippleProgress * 250;
      if (rippleActive && rippleProgress >= 1) {
        rippleActive = false;
        rippleReturning = true;
      }

      const fields = points.map((point, index) => {
        const baseX = (index % columns) * cellSize;
        const baseY = Math.floor(index / columns) * cellSize;
        let field = 0;
        let rippleField = 0;
        let targetX = baseX;
        let targetY = baseY;

        if (pointerEnabled && pointerInside && !reducedMotion) {
          const dx = pointerX - baseX;
          const dy = pointerY - baseY;
          const distance = Math.hypot(dx, dy);
          if (distance < radius && distance > 0.01) {
            field = (1 - distance / radius) ** 2;
            const displacement = MAX_WARP * field * Math.min(1, distance / 14);
            targetX += (dx / distance) * displacement;
            targetY += (dy / distance) * displacement;
          }
        }

        if (rippleActive && !reducedMotion) {
          const dx = baseX - rippleX;
          const dy = baseY - rippleY;
          const distance = Math.hypot(dx, dy);
          const waveDistance = Math.abs(distance - rippleRadius);
          const wave = Math.max(0, 1 - waveDistance / 48) * (1 - rippleProgress) ** 1.35;
          if (wave > 0 && distance > 0.01) {
            const displacement = wave * RIPPLE_DISPLACEMENT;
            targetX += (dx / distance) * displacement;
            targetY += (dy / distance) * displacement;
            rippleField = wave;
            field = Math.max(field, wave * 0.45);
          }
        }

        const deltaX = targetX - point.x;
        const deltaY = targetY - point.y;
        const smoothing = rippleReturning ? 0.18 : LERP_SPEED;
        const x = Math.abs(deltaX) < 0.12 ? targetX : point.x + deltaX * (reducedMotion ? 1 : smoothing);
        const y = Math.abs(deltaY) < 0.12 ? targetY : point.y + deltaY * (reducedMotion ? 1 : smoothing);
        if (Math.abs(targetX - x) >= 0.12 || Math.abs(targetY - y) >= 0.12) needsAnotherFrame = true;
        point.x = x;
        point.y = y;
        return { x, y, field, ripple: rippleField };
      });

      drawingContext.lineWidth = 0.65;
      drawingContext.lineCap = 'round';
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
          const start = row * columns + column;
          drawSegment(fields[start], fields[start + 1]);
        }
      }
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows - 1; row += 1) {
          const start = row * columns + column;
          drawSegment(fields[start], fields[start + columns]);
        }
      }

      for (const point of fields) {
        const active = Math.max(point.field, 0);
        drawingContext.beginPath();
        const nodeOpacity = Math.min(0.85, 0.12 + active * 0.73 + point.ripple * 0.13);
        drawingContext.fillStyle = `rgba(${rgb}, ${nodeOpacity})`;
        drawingContext.arc(point.x, point.y, active < 0.015 ? 0.65 : 0.8 + Math.min(active, 0.9) * 0.65, 0, Math.PI * 2);
        drawingContext.fill();
      }

      if (rippleReturning && !needsAnotherFrame) rippleReturning = false;
      if (rippleActive || rippleReturning || needsAnotherFrame) requestDraw();
    }

    function drawSegment(from: GridField, to: GridField) {
      const active = Math.max(from.field, to.field);
      const ripple = Math.max(from.ripple, to.ripple);
      drawingContext.beginPath();
      drawingContext.moveTo(from.x, from.y);
      drawingContext.lineTo(to.x, to.y);
      const lineOpacity = ripple > 0
        ? Math.min(0.25, 0.06 + active * 0.39 + ripple * 0.25)
        : Math.min(0.45, 0.06 + active * 0.39);
      drawingContext.strokeStyle = `rgba(${rgb}, ${lineOpacity})`;
      drawingContext.stroke();
    }

    const resizeObserver = new ResizeObserver(fitCanvas);
    resizeObserver.observe(section);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      if (inViewport) requestDraw();
      else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    }, { rootMargin: '80px' });
    intersectionObserver.observe(section);

    const setInteractionMode = () => {
      pointerEnabled = finePointer.matches && !motionPreference.matches;
      if (!pointerEnabled) {
        pointerInside = false;
        pointerX = -1_000;
        pointerY = -1_000;
        rippleActive = false;
        rippleReturning = false;
      }
      requestDraw();
    };

    section.addEventListener('pointermove', pointerMove, { passive: true });
    section.addEventListener('pointerleave', pointerLeave, { passive: true });
    section.addEventListener('click', click);
    window.addEventListener('scroll', scroll, { passive: true });
    finePointer.addEventListener('change', setInteractionMode);
    motionPreference.addEventListener('change', setInteractionMode);
    setInteractionMode();
    fitCanvas();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      section.removeEventListener('pointermove', pointerMove);
      section.removeEventListener('pointerleave', pointerLeave);
      section.removeEventListener('click', click);
      window.removeEventListener('scroll', scroll);
      finePointer.removeEventListener('change', setInteractionMode);
      motionPreference.removeEventListener('change', setInteractionMode);
    };
  }, []);

  return (
    <div ref={layerRef} className={`kinetic-grid-layer ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="kinetic-grid-canvas" />
    </div>
  );
}
