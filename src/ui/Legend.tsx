import { REACTIONS } from '../physics/material';
import { useT } from '../i18n';
import { useColors } from './colors';

export function Legend() {
  const t = useT();
  const c = useColors();
  const lines: [string, string, boolean?][] = [
    [c.track.uncollided, t.legendUncollided],
    [c.track.scattered, t.legendScattered],
    [c.track.reflected, t.legendReflected],
    [c.track.absorbed, t.legendAbsorbed],
    [c.ink2, t.legendAnnihilation, true],
    [c.current, t.legendCurrent],
  ];
  return (
    <div className="legend" aria-label={t.legend}>
      <div className="legend-row">
        {lines.map(([color, label, dashed]) => (
          <span key={label} className="legend-item">
            <span className={`swatch line ${dashed ? 'dashed' : ''}`} style={{ borderColor: color }} />
            {label}
          </span>
        ))}
      </div>
      <div className="legend-row">
        {[...REACTIONS, 'cutoff' as const].map((r) => (
          <span key={r} className="legend-item">
            <span className="swatch dot" style={{ background: c.reaction[r] }} />
            {t.reactions[r]}
          </span>
        ))}
      </div>
    </div>
  );
}
