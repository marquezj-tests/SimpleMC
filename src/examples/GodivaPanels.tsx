import { RADIAL_BINS, RADIAL_CENTRES, SPECTRUM_BINS, wattPdf, type PowerIteration } from '../physics/neutron';
import { useLang } from '../i18n';
import { Plot, type Series } from '../ui/Plot';
import { useColors } from '../ui/colors';
import { fmt, fmtE } from '../ui/format';
import { GODIVA_TEXT } from './godivaText';

function Legend({ items }: { items: { color: string; label: string; dashed?: boolean; dot?: boolean }[] }) {
  return (
    <div className="legend-row">
      {items.map((it) => (
        <span className="legend-item" key={it.label}>
          <span
            className={`swatch ${it.dot ? 'dot' : 'line'} ${it.dashed ? 'dashed' : ''}`}
            style={it.dot ? { background: it.color } : { borderColor: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Charts of the power iteration, shown under the track view. */
export function GodivaPanels({ engine, reference }: { engine: PowerIteration; reference: number; version: number }) {
  const lang = useLang();
  const c = useColors();
  const T = GODIVA_TEXT[lang].panels;
  const cycles = engine.cycles;
  const inactive = engine.problem.inactive;
  const total = engine.totalCycles;

  // ---- keff per cycle
  const ks = cycles.flatMap((x) => [x.kSource, x.kSix]).filter(Number.isFinite);
  ks.push(reference);
  let ymin = Math.min(...ks);
  let ymax = Math.max(...ks);
  const pad = Math.max(0.01, (ymax - ymin) * 0.15);
  ymin -= pad;
  ymax += pad;
  const running: [number, number][] = [];
  let sum = 0;
  let n = 0;
  for (const x of cycles)
    if (x.active) {
      sum += x.kSource;
      n++;
      running.push([x.cycle, sum / n]);
    }

  // ---- source distribution: first, intermediate and latest cycles
  const H = engine.sourceHistograms;
  const r = RADIAL_CENTRES;
  const picks = [...new Set([0, Math.floor((H.length - 1) / 3), Math.floor((2 * (H.length - 1)) / 3), H.length - 1])].filter(
    (i) => i >= 0 && i < H.length,
  );
  const shades = [c.muted, c.track.scattered, c.reaction.inelastic, c.track.uncollided];
  // scale to the later cycles: a point source makes cycle 1 a huge spike at r = 0
  const later = H.length > 1 ? H.slice(1) : H;
  const srcMax = Math.max(2, ...later.flatMap((h) => h)) * 1.15;
  const firstOff = H.length > 1 && Math.max(...H[0]) > srcMax;
  const srcSeries: Series[] = picks.map((i, j) => ({
    id: `c${i}`,
    label: i === 0 ? (firstOff ? `${T.first} (${T.offScale})` : T.first) : T.cycleN(i + 1),
    color: shades[Math.min(j, shades.length - 1) + (picks.length < 4 ? 4 - picks.length : 0)] ?? c.ink,
    points: r.map((x, b) => [x, H[i][b]] as [number, number]),
    width: i === H.length - 1 ? 2.5 : 1.5,
  }));

  // ---- spectrum: flux per unit lethargy, normalised to its maximum
  const lethargy = engine.spectrum.map((v, i) => v / Math.log(SPECTRUM_BINS[i + 1] / SPECTRUM_BINS[i]));
  const mx = Math.max(...lethargy);
  const spec: [number, number][] = [];
  lethargy.forEach((v, i) => {
    const y = mx > 0 ? v / mx : 0;
    spec.push([SPECTRUM_BINS[i], y], [SPECTRUM_BINS[i + 1], y]);
  });
  const watt = engine.problem.components[0].nuclide.table.watt;
  const wattPts: [number, number][] = [];
  let wmax = 0;
  for (let i = 0; i <= 200; i++) {
    const E = Math.pow(10, -3 + (i / 200) * Math.log10(20 / 1e-3));
    const y = E * wattPdf(watt.a, watt.b, E); // per unit lethargy
    wmax = Math.max(wmax, y);
    wattPts.push([E, y]);
  }
  wattPts.forEach((p) => (p[1] /= wmax));

  return (
    <div className="panels">
      <section className="panel chart">
        <h2>{T.keff}</h2>
        {cycles.length === 0 ? (
          <p className="muted small">{GODIVA_TEXT[lang].explain.start}</p>
        ) : (
          <>
            <Plot
              ariaLabel="keff-per-cycle"
              x={{ min: 0.5, max: total + 0.5, label: T.cycleX }}
              y={{ min: ymin, max: ymax, label: T.keffY }}
              series={[{ id: 'mean', label: T.runningMean, color: c.ink, points: running, width: 2 }]}
              hoverTitle={(x) => `${T.cycleX} ${Math.round(x)}`}
              hover={(x) => {
                const cy = cycles.find((q) => q.cycle === Math.round(x));
                if (!cy) return [];
                return [
                  { label: T.perCycleSource, value: cy.kSource.toFixed(5), color: c.track.uncollided },
                  { label: T.perCycleSix, value: Number.isFinite(cy.kSix) ? cy.kSix.toFixed(5) : '—', color: c.reaction.inelastic },
                ];
              }}
              overlay={(sx, sy) => (
                <g>
                  {inactive > 0 && (
                    <>
                      <rect
                        x={sx(0.5)}
                        y={sy(ymax)}
                        width={Math.max(0, sx(inactive + 0.5) - sx(0.5))}
                        height={sy(ymin) - sy(ymax)}
                        fill={c.grid}
                        opacity={0.6}
                      />
                      <text x={sx(0.5) + 4} y={sy(ymax) + 12} className="tick">
                        {T.inactive}
                      </text>
                    </>
                  )}
                  <line x1={sx(0.5)} x2={sx(total + 0.5)} y1={sy(reference)} y2={sy(reference)} stroke={c.ink2} strokeDasharray="5 4" />
                  {cycles.map((q) => (
                    <g key={q.cycle}>
                      {Number.isFinite(q.kSix) && <circle cx={sx(q.cycle)} cy={sy(q.kSix)} r={2.5} fill={c.reaction.inelastic} />}
                      <circle cx={sx(q.cycle)} cy={sy(q.kSource)} r={3} fill={c.track.uncollided} stroke={c.surface} strokeWidth={1} />
                    </g>
                  ))}
                </g>
              )}
            />
            <Legend
              items={[
                { color: c.track.uncollided, label: T.perCycleSource, dot: true },
                { color: c.reaction.inelastic, label: T.perCycleSix, dot: true },
                { color: c.ink, label: T.runningMean },
                { color: c.ink2, label: `${T.reference} (${fmt(reference, 5)})`, dashed: true },
              ]}
            />
          </>
        )}
      </section>

      <section className="panel chart">
        <h2>{T.source}</h2>
        <Plot
          ariaLabel="source-distribution"
          x={{ min: 0, max: 1, label: T.sourceX }}
          y={{ min: 0, max: srcMax, label: T.sourceY }}
          series={srcSeries}
          hoverTitle={(x) => `r/R = ${x.toFixed(2)}`}
          hover={(x) => {
            const b = Math.min(RADIAL_BINS - 1, Math.floor(x ** 3 * RADIAL_BINS));
            return srcSeries.map((s) => ({ label: s.label, value: s.points[b][1].toFixed(2), color: s.color }));
          }}
        />
        <Legend items={srcSeries.map((s) => ({ color: s.color, label: s.label }))} />
      </section>

      <section className="panel chart">
        <h2>{T.spectrum}</h2>
        {engine.spectrumSources === 0 ? (
          <p className="muted small">{T.noData}</p>
        ) : (
          <>
            <Plot
              ariaLabel="neutron-spectrum"
              x={{ min: 1e-3, max: 20, log: true, label: T.spectrumX }}
              y={{ min: 0, max: 1.1, label: T.spectrumY }}
              series={[
                { id: 'watt', label: T.watt, color: c.reaction.fission, points: wattPts, width: 1.5, dash: '5 4' },
                { id: 'flux', label: T.flux, color: c.track.uncollided, points: spec, width: 2 },
              ]}
              hoverTitle={(x) => fmtE(x)}
              hover={(x) => {
                const i = SPECTRUM_BINS.findIndex((b, j) => x >= b && x < SPECTRUM_BINS[j + 1]);
                return i >= 0 && mx > 0 ? [{ label: T.flux, value: (lethargy[i] / mx).toFixed(3), color: c.track.uncollided }] : [];
              }}
            />
            <Legend
              items={[
                { color: c.track.uncollided, label: T.flux },
                { color: c.reaction.fission, label: T.watt, dashed: true },
              ]}
            />
          </>
        )}
      </section>
    </div>
  );
}
