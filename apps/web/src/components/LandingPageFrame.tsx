import type { ReactNode } from 'react';

type LandingPageFrameProps = {
  children: ReactNode;
};

export function LandingPageFrame({ children }: LandingPageFrameProps) {
  return (
    <div className="landing-page-frame">
      <div className="landing-page-frame__rails" aria-hidden="true">
        <span className="landing-page-frame__rail landing-page-frame__rail--left" />
        <span className="landing-page-frame__rail landing-page-frame__rail--right" />
      </div>
      {children}
    </div>
  );
}

export function SectionDivider() {
  return (
    <div className="section-divider" aria-hidden="true">
      <FrameCrosshair side="left" />
      <FrameCrosshair side="right" />
    </div>
  );
}

function FrameCrosshair({ side }: { side: 'left' | 'right' }) {
  return <span className={`frame-crosshair frame-crosshair--${side}`} />;
}

export function CornerBrackets() {
  return (
    <span className="corner-brackets" aria-hidden="true">
      <i className="corner-brackets__corner corner-brackets__corner--top-left" />
      <i className="corner-brackets__corner corner-brackets__corner--top-right" />
      <i className="corner-brackets__corner corner-brackets__corner--bottom-left" />
      <i className="corner-brackets__corner corner-brackets__corner--bottom-right" />
    </span>
  );
}
