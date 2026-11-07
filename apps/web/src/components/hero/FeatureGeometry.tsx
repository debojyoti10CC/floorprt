type FeatureGeometryProps = {
  scene?: 'intro' | '01' | '02' | '03';
  className?: string;
};

export function FeatureGeometry({ scene, className = '' }: FeatureGeometryProps) {
  return (
    <svg className={`arqo-feature-geometry ${className}`} viewBox="0 0 840 760" preserveAspectRatio="none" aria-hidden="true">
      <rect className="geometry-outer-frame" x="40" y="38" width="760" height="684" />
      <line className="geometry-centerline" x1="420" y1="36" x2="420" y2="724" />
      <line className="geometry-crossline" x1="40" y1="380" x2="800" y2="380" />
      <path className="geometry-crosshair" d="M402 380h36M420 362v36" />

      {(!scene || scene === 'intro') && (
        <g className="geometry-state" data-geometry-scene="intro">
          <rect data-geometry-line x="180" y="174" width="480" height="412" />
          <rect data-geometry-line x="286" y="265" width="268" height="230" />
          <rect data-geometry-line x="362" y="320" width="116" height="118" />
          <rect className="geometry-registration" x="656" y="168" width="6" height="6" />
        </g>
      )}

      {(!scene || scene === '01') && (
        <g className="geometry-state" data-geometry-scene="01">
          <rect data-geometry-line x="180" y="174" width="480" height="412" />
          <rect data-geometry-line x="258" y="238" width="324" height="286" />
          <rect data-geometry-line x="324" y="302" width="192" height="158" />
          <path className="geometry-chart-line" data-geometry-line pathLength="1" d="M324 432 L352 411 L371 418 L395 386 L419 394 L442 360 L467 372 L490 335 L515 347" />
          <circle className="geometry-chart-point" cx="515" cy="347" r="4" />
          <text x="282" y="222">PERFORMANCE HISTORY</text>
          <text x="342" y="334">MONTHLY P&amp;L</text>
          <line data-geometry-line x1="342" y1="350" x2="495" y2="350" />
          <line data-geometry-line x1="342" y1="468" x2="495" y2="468" />
          <text x="342" y="491">REQUEST-BOUND EVIDENCE</text>
          <text className="geometry-note" x="286" y="557">ILLUSTRATIVE VIEW · WALK-FORWARD DATA</text>
          <rect className="geometry-registration" x="579" y="232" width="6" height="6" />
        </g>
      )}

      {(!scene || scene === '02') && (
        <g className="geometry-state" data-geometry-scene="02">
          <rect data-geometry-line x="180" y="174" width="480" height="412" />
          <rect className="geometry-risk-boundary" data-geometry-line x="236" y="232" width="368" height="296" />
          <line data-geometry-line x1="286" y1="292" x2="556" y2="292" />
          <line data-geometry-line x1="286" y1="365" x2="556" y2="365" />
          <line data-geometry-line x1="286" y1="438" x2="556" y2="438" />
          <line data-geometry-line x1="286" y1="511" x2="556" y2="511" />
          <path data-geometry-line d="M302 292h55m-55 73h149m-149 73h222m-222 73h87" />
          <path className="geometry-measure" data-geometry-line d="M570 292h14v219h-14M280 280v24m0 49v24m0 49v24m0 49v24" />
          <text x="286" y="270">RISK DISTRIBUTION · ONE-LOAN SCENARIO</text>
          <text x="302" y="351">EXPECTED LOSS</text><text className="geometry-value" x="509" y="351">$3.75</text>
          <text x="302" y="424">VALUE AT RISK · 99%</text><text className="geometry-value" x="509" y="424">$75</text>
          <text x="302" y="497">EXPECTED SHORTFALL</text><text className="geometry-value" x="509" y="497">$75</text>
          <text className="geometry-note" x="286" y="557">ILLUSTRATIVE · ASSUMED PD 5% · NOT A CALIBRATED DEFAULT RATE</text>
          <rect className="geometry-registration" x="600" y="228" width="6" height="6" />
        </g>
      )}

      {(!scene || scene === '03') && (
        <g className="geometry-state" data-geometry-scene="03">
          <rect className="geometry-dashed-boundary" data-geometry-line x="222" y="214" width="396" height="328" />
          <rect data-geometry-line x="286" y="274" width="268" height="210" />
          <rect data-geometry-line x="358" y="326" width="124" height="108" />
          <path data-geometry-line d="M286 316h-20v132h20M554 316h20v132h-20M354 484v20h132v-20" />
          <path className="geometry-credit-path" data-geometry-line d="M318 298h204m-204 159h204" />
          <line data-geometry-line x1="420" y1="280" x2="420" y2="476" />
          <line data-geometry-line x1="294" y1="379" x2="546" y2="379" />
          <circle className="geometry-credit-point" cx="420" cy="379" r="4" />
          <text x="306" y="302">PERFORMANCE EVIDENCE</text>
          <text x="373" y="371">CREDIT REQUEST</text>
          <text x="369" y="455">LENDER REVIEW</text>
          <text className="geometry-note" x="222" y="570">ILLUSTRATIVE TERMS · REVIEW REQUIRED · NOT A FUNDING PROMISE</text>
          <text className="geometry-value" x="503" y="197">$100</text>
          <rect className="geometry-registration" x="615" y="208" width="6" height="6" />
        </g>
      )}
    </svg>
  );
}
