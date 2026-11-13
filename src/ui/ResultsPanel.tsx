import { Fragment } from 'react';
import type { ResultRow } from '../examples/types';
import { useT } from '../i18n';
import { fmt } from './format';

export function ResultsPanel({ rows, note }: { rows: ResultRow[]; note: string; version: number }) {
  const t = useT();
  return (
    <section className="panel results" aria-live="polite">
      <h2>{t.results}</h2>
      <p className="muted small">{note}</p>
      {rows.map((r) => {
        const ok = Number.isFinite(r.value);
        const rel = ok && r.sigma !== undefined && Number.isFinite(r.sigma) && r.value !== 0 ? (100 * r.sigma) / Math.abs(r.value) : null;
        const value = r.text
          ? r.text
          : !ok
          ? '—'
          : r.fixed !== undefined
            ? r.value.toFixed(r.fixed)
            : Number.isInteger(r.value) && r.sigma === undefined
              ? r.value.toLocaleString()
              : fmt(r.value, 4);
        const sigma =
          ok && r.sigma !== undefined && Number.isFinite(r.sigma) && r.sigma > 0
            ? r.fixed !== undefined
              ? r.sigma.toFixed(r.fixed)
              : fmt(r.sigma, 2)
            : null;
        return (
          <Fragment key={r.label}>
            {r.heading && <h3 className="results-heading">{r.heading}</h3>}
            <div className={`result ${r.main ? 'main' : ''}`}>
              <span className="result-label">
                {r.color && <span className="swatch" style={{ background: r.color }} />}
                {r.label}
              </span>
              <span className="result-value">
                {value}
                {sigma && (
                  <>
                    {' '}
                    <span className="pm">± {sigma}</span>
                  </>
                )}
                {rel !== null && rel > 0 && (
                  <small className="muted rel">
                    {t.relErr} {rel < 0.1 ? rel.toFixed(2) : rel.toFixed(1)}%
                  </small>
                )}
              </span>
            </div>
          </Fragment>
        );
      })}
    </section>
  );
}
