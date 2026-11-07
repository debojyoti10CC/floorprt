
export function ParticleWaveSection() {
  return (
    <section className="particle-wave-section" aria-labelledby="particle-wave-title">
      <span className="particle-wave-section-rule particle-wave-section-rule--top" aria-hidden="true" />
      <span className="particle-wave-section-rule particle-wave-section-rule--bottom" aria-hidden="true" />
      <span className="particle-wave-section-edge particle-wave-section-edge--left" aria-hidden="true" />
      <span className="particle-wave-section-edge particle-wave-section-edge--right" aria-hidden="true" />

      <div className="particle-wave-frame">
        <span className="particle-wave-corner particle-wave-corner--tl" aria-hidden="true" />
        <span className="particle-wave-corner particle-wave-corner--tr" aria-hidden="true" />
        <span className="particle-wave-corner particle-wave-corner--bl" aria-hidden="true" />
        <span className="particle-wave-corner particle-wave-corner--br" aria-hidden="true" />
        <div className="particle-wave-layout">
          <div className="particle-wave-visual">
            <img className="particle-wave-image" src="/images/arqo-particle-wave.jpg" alt="" aria-hidden="true" />
          </div>
          <div className="particle-wave-copy">
            <h2 id="particle-wave-title">
              <span>Your performance.</span>
              <span>Your proof.</span>
              <span>Your leverage.</span>
            </h2>
            <p>Turn prediction-market performance into verifiable evidence and access collateral-backed credit through ARQO.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
