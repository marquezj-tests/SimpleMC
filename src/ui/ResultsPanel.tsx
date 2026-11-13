import type { ResultRow } from '../examples/types';
import { useT } from '../i18n';
import { useColors } from './colors';
import { fmt } from './format';

export function ResultsPanel({ rows }: { rows: ResultRow[]; version: number }) {
  const t = useT();
  const c = useColors();
  return (
    <section className="panel results" aria-live="polite">
      <h2>{t.results}</h2>
      <p className="muted small">T: {t.perSource}</p>
      {rows.map((r) => {
        const rel = r.sigma !== undefined && r.value !== 0 ? (100 * r.sigma) / Math.abs(r.value) : null;
        const color = r.color ? c.track[r.color as keyof typeof c.track] : undefined;
        return (
          <div key={r.label} className={`result ${r.main ? 'main' : ''}`}>
            <span className="result-label">
              {color && <span className="swatch" style={{ background: color }} />}
              {r.label}
            </span>
            <span className="result-value">
              {Number.isInteger(r.value) && r.sigma === undefined ? r.value.toLocaleString() : fmt(r.value, 4)}
              {r.sigma !== undefined && r.sigma > 0 && (
                <>
                  {' '}
                  <span className="pm">± {fmt(r.sigma, 2)}</span>
                </>
              )}
              {rel !== null && rel > 0 && (
                <small className="muted rel">
                  {t.relErr} {rel < 0.1 ? rel.toFixed(2) : rel.toFixed(1)}%
                </small>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}
