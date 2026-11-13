import type { LegendSpec } from '../examples/types';
import { useT } from '../i18n';

export function Legend({ spec }: { spec: LegendSpec }) {
  const t = useT();
  return (
    <div className="legend" aria-label={t.legend}>
      <div className="legend-row">
        {spec.lines.map(({ color, label, dashed }) => (
          <span key={label} className="legend-item">
            <span className={`swatch line ${dashed ? 'dashed' : ''}`} style={{ borderColor: color }} />
            {label}
          </span>
        ))}
      </div>
      <div className="legend-row">
        {spec.markers.map(({ color, label }) => (
          <span key={label} className="legend-item">
            <span className="swatch dot" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
