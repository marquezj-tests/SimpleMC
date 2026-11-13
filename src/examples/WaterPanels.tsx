import type { PowerIteration } from '../physics/neutron';
import { useLang } from '../i18n';
import { Plot } from '../ui/Plot';
import { useColors } from '../ui/colors';
import { fmt, fmtE } from '../ui/format';
import { WATER_TEXT } from './waterText';

/**
 * Track-length flux spectrum per unit lethargy, averaged over the sphere,
 * per source neutron, with its ±1σ band.
 */
export function WaterPanels({ engine, kT }: { engine: PowerIteration; kT: number | null; version: number }) {
  const lang = useLang();
  const c = useColors();
  const T = WATER_TEXT[lang];
  const N = engine.spectrumSources;
  const bins = engine.bins;
  const R = engine.problem.radius;
  const V = (4 / 3) * Math.PI * R ** 3;
  const E0 = engine.problem.source?.kind === 'mono' ? engine.problem.source.E : 1;

  const rows = engine.spectrum.map((L, i) => {
    const du = Math.log(bins[i + 1] / bins[i]);
    const mean = N > 0 ? L / N : 0;
    const varH = N > 1 ? Math.max(0, engine.spectrumSq[i] / N - mean * mean) / (N - 1) : 0;
    const k = 1 / (V * du);
    return { lo: bins[i], hi: bins[i + 1], y: mean * k, s: Math.sqrt(varH) * k };
  });
  const positive = rows.filter((r) => r.y > 0);
  const ymax = positive.length ? Math.pow(10, Math.ceil(Math.log10(Math.max(...positive.map((r) => r.y + r.s))))) : 1;
  const ymin = positive.length ? Math.max(ymax * 1e-6, Math.pow(10, Math.floor(Math.log10(Math.min(...positive.map((r) => r.y)))))) : 1e-6;

  const line: [number, number][] = [];
  for (const r of rows) if (r.y > 0) line.push([r.lo, r.y], [r.hi, r.y]);

  return (
    <div className="panels single">
      <section className="panel chart">
        <h2>{T.panelTitle}</h2>
        <p className="muted small">{T.panelNote}</p>
        {N === 0 || positive.length === 0 ? (
          <p className="muted small">{T.noData}</p>
        ) : (
          <>
            <Plot
              width={760}
              height={300}
              ariaLabel="water-spectrum"
              x={{ min: 1e-11, max: 20, log: true, label: T.axisX }}
              y={{ min: ymin, max: ymax, log: true, label: T.axisY }}
              series={[{ id: 'flux', label: T.flux, color: c.track.uncollided, points: line, width: 2 }]}
              hoverTitle={(x) => fmtE(x)}
              hover={(x) => {
                const r = rows.find((q) => x >= q.lo && x < q.hi);
                return r && r.y > 0 ? [{ label: 'E·φ(E)', value: `${fmt(r.y, 3)} ± ${fmt(r.s, 2)}`, color: c.track.uncollided }] : [];
              }}
              overlay={(sx, sy) => (
                <g>
                  {rows
                    .filter((r) => r.y > 0 && r.s > 0)
                    .map((r) => (
                      <rect
                        key={r.lo}
                        x={sx(r.lo)}
                        width={Math.max(0, sx(r.hi) - sx(r.lo))}
                        y={sy(r.y + r.s)}
                        height={Math.max(0, sy(Math.max(ymin, r.y - r.s)) - sy(r.y + r.s))}
                        fill={c.track.uncollided}
                        opacity={0.18}
                      />
                    ))}
                  {kT !== null && (
                    <>
                      <line x1={sx(2 * kT)} x2={sx(2 * kT)} y1={sy(ymin)} y2={sy(ymax)} stroke={c.ink2} strokeDasharray="3 3" />
                      <text x={sx(2 * kT) + 4} y={sy(ymax) + 12} className="tick">
                        2kT
                      </text>
                    </>
                  )}
                  <text x={sx(Math.sqrt(1e-8 * 1e-6))} y={sy(ymin) - 6} className="tick" textAnchor="middle">
                    {T.regions.thermal}
                  </text>
                  <text x={sx(Math.sqrt(1e-5 * 1e-2))} y={sy(ymin) - 6} className="tick" textAnchor="middle">
                    {T.regions.slowing}
                  </text>
                  <line x1={sx(E0)} x2={sx(E0)} y1={sy(ymin)} y2={sy(ymax)} stroke={c.reaction.fission} strokeDasharray="3 3" />
                  <text x={sx(E0) - 4} y={sy(ymax) + 12} className="tick" textAnchor="end">
                    {T.regions.source} {fmtE(E0)}
                  </text>
                </g>
              )}
            />
            <div className="legend-row">
              <span className="legend-item">
                <span className="swatch line" style={{ borderColor: c.track.uncollided }} />
                {T.flux}
              </span>
              <span className="legend-item">
                <span className="swatch" style={{ background: c.track.uncollided, opacity: 0.3 }} />
                {T.band}
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
