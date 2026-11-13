import { REACTIONS, type Material, type Reaction } from '../physics/material';
import type { Cdf } from '../physics/sampling';
import { useT } from '../i18n';
import { Plot, type Series } from './Plot';
import { useColors } from './colors';
import { deg, fmt, fmtE } from './format';

const decadeDown = (v: number) => Math.pow(10, Math.floor(Math.log10(v)));
const decadeUp = (v: number) => Math.pow(10, Math.ceil(Math.log10(v)));

/** μ/ρ versus energy, either the total or all partial cross sections, with the photon energy marked. */
export function CrossSectionPlot({ material, E, mode }: { material: Material; E: number; mode: 'total' | 'partials' }) {
  const t = useT();
  const c = useColors();
  const tab = material.table;
  const totals = tab.E.map((_, i) => REACTIONS.reduce((s, r) => s + tab[r][i], 0));
  const ymax = decadeUp(Math.max(...totals));
  const ymin = mode === 'total' ? decadeDown(Math.min(...totals)) : ymax * 1e-6;
  const partials = material.massPartials(E);
  const total = REACTIONS.reduce((s, r) => s + partials[r], 0);

  const totalSeries: Series = {
    id: 'total',
    label: t.total,
    color: c.ink,
    width: mode === 'total' ? 2 : 1.5,
    dash: mode === 'total' ? undefined : '4 3',
    points: tab.E.map((e, i) => [e, totals[i]]),
  };
  const series: Series[] =
    mode === 'total'
      ? [totalSeries]
      : [
          totalSeries,
          ...REACTIONS.map((r) => ({
            id: r,
            label: t.reactions[r],
            color: c.reaction[r],
            points: tab.E.map((e, i) => [e, tab[r][i]] as [number, number]),
          })),
        ];

  const markers: { y: number; color: string }[] =
    mode === 'total'
      ? [{ y: total, color: c.ink }]
      : REACTIONS.filter((r) => partials[r] > ymin).map((r) => ({ y: partials[r], color: c.reaction[r] }));

  return (
    <>
      <Plot
        ariaLabel={`cross-sections-${mode}`}
        x={{ min: tab.E[0], max: tab.E[tab.E.length - 1], log: true, label: t.energyAxis }}
        y={{ min: ymin, max: ymax, log: true, label: t.muRhoAxis }}
        series={series}
        hoverTitle={(x) => fmtE(x)}
        hover={(x) => {
          const p = material.massPartials(x);
          const tot = REACTIONS.reduce((s, r) => s + p[r], 0);
          const rows = [{ label: t.total, value: `${fmt(tot)} cm²/g`, color: c.ink }];
          if (mode === 'partials')
            for (const r of REACTIONS) rows.push({ label: t.reactions[r], value: fmt(p[r]), color: c.reaction[r] });
          return rows;
        }}
        overlay={(sx, sy) => (
          <g>
            <line x1={sx(E)} x2={sx(E)} y1={sy(ymin)} y2={sy(ymax)} stroke={c.ink2} strokeDasharray="3 3" />
            {markers.map((m, i) => (
              <circle key={i} cx={sx(E)} cy={sy(m.y)} r={5} fill={m.color} stroke={c.surface} strokeWidth={2} />
            ))}
            {mode === 'total' && (
              <text
                x={sx(E) + (sx(E) > 300 ? -8 : 8)}
                y={sy(total) - 8}
                textAnchor={sx(E) > 300 ? 'end' : 'start'}
                className="plot-annot"
              >
                μ/ρ = {fmt(total)} cm²/g
              </text>
            )}
          </g>
        )}
      />
      {mode === 'partials' && (
        <div className="legend-row">
          <span className="legend-item">
            <span className="swatch line dashed" style={{ borderColor: c.ink }} />
            {t.total}
          </span>
          {REACTIONS.map((r) => (
            <span className="legend-item" key={r}>
              <span className="swatch" style={{ background: c.reaction[r] }} />
              {t.reactions[r]}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** CDF of the flight distance with ξ mapped to s. */
export function FlightCdfPlot({ mu, s, xi, distance }: { mu: number; s: number; xi: number; distance: number }) {
  const t = useT();
  const c = useColors();
  let xmax = 1.15 * Math.max(s, Math.min(distance, 6 / mu), 2 / mu);
  if (!Number.isFinite(xmax)) xmax = 5 / mu;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 200; i++) {
    const x = (xmax * i) / 200;
    pts.push([x, 1 - Math.exp(-mu * x)]);
  }
  const showD = Number.isFinite(distance) && distance <= xmax;
  return (
    <Plot
      ariaLabel="flight-cdf"
      x={{ min: 0, max: xmax, label: t.labels.cdfAxisS }}
      y={{ min: 0, max: 1, label: t.labels.cdfAxisF }}
      series={[{ id: 'cdf', label: 'F(s)', color: c.track.uncollided, points: pts }]}
      hoverTitle={(x) => `s = ${fmt(x)} cm`}
      hover={(x) => [{ label: 'F(s)', value: fmt(1 - Math.exp(-mu * x)) }]}
      overlay={(sx, sy) => (
        <g>
          {showD && (
            <>
              <rect
                x={sx(distance)}
                y={sy(1)}
                width={Math.max(0, sx(xmax) - sx(distance))}
                height={sy(0) - sy(1)}
                fill={c.grid}
                opacity={0.6}
              />
              <line x1={sx(distance)} x2={sx(distance)} y1={sy(0)} y2={sy(1)} stroke={c.ink2} strokeDasharray="5 3" />
              <text x={sx(distance) + 4} y={sy(0.06)} className="plot-annot">
                {t.labels.boundary} d = {fmt(distance)} cm
              </text>
            </>
          )}
          <line x1={sx(0)} x2={sx(Math.min(s, xmax))} y1={sy(xi)} y2={sy(xi)} stroke={c.reaction.incoherent} strokeWidth={2} />
          <line
            x1={sx(Math.min(s, xmax))}
            x2={sx(Math.min(s, xmax))}
            y1={sy(xi)}
            y2={sy(0)}
            stroke={c.reaction.incoherent}
            strokeWidth={2}
          />
          <circle cx={sx(Math.min(s, xmax))} cy={sy(xi)} r={5} fill={c.reaction.incoherent} stroke={c.surface} strokeWidth={2} />
          <text x={sx(0) + 6} y={sy(xi) - 6} className="plot-annot">
            ξ = {xi.toFixed(4)}
          </text>
          <text x={sx(Math.min(s, xmax)) + 6} y={sy(0) - 8} className="plot-annot">
            s = {fmt(s)} cm
          </text>
        </g>
      )}
    />
  );
}

/** Cumulative probability vector of the reactions, with ξ marked. */
export function ReactionBar({
  probabilities,
  xi,
  chosen,
}: {
  probabilities: { reaction: Reaction; p: number; cum: number }[];
  xi: number;
  chosen: Reaction;
}) {
  const t = useT();
  const c = useColors();
  const W = 440;
  const x0 = 14;
  const x1 = W - 14;
  const sx = (v: number) => x0 + v * (x1 - x0);
  let prev = 0;
  return (
    <div className="plot">
      <svg viewBox={`0 0 ${W} 92`} role="img" aria-label="reaction-probabilities">
        {probabilities.map((pr) => {
          const a = prev;
          prev = pr.cum;
          if (pr.p <= 0) return null;
          const w = Math.max(0, sx(pr.cum) - sx(a) - 2);
          return (
            <rect
              key={pr.reaction}
              x={sx(a) + 1}
              y={30}
              width={w}
              height={26}
              rx={3}
              fill={c.reaction[pr.reaction]}
              opacity={pr.reaction === chosen ? 1 : 0.45}
            />
          );
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={58} y2={63} stroke={c.ink2} />
            <text x={sx(v)} y={75} className="tick" textAnchor="middle">
              {v}
            </text>
          </g>
        ))}
        <path d={`M${sx(xi)},28 l-6,-10 h12 z`} fill={c.ink} />
        <line x1={sx(xi)} x2={sx(xi)} y1={26} y2={58} stroke={c.ink} strokeWidth={2} />
        <text x={sx(xi)} y={12} className="plot-annot" textAnchor={xi > 0.8 ? 'end' : xi < 0.2 ? 'start' : 'middle'}>
          ξ = {xi.toFixed(4)} → {t.reactions[chosen]}
        </text>
        <text x={W / 2} y={90} className="axis-label" textAnchor="middle">
          {t.labels.cumulative} Σ μᵢ/μ
        </text>
      </svg>
    </div>
  );
}

/** CDF of cos θ (Klein–Nishina or Rayleigh) with ξ mapped to cos θ. */
export function AngleCdfPlot({ cdf, xi, cosTheta, color }: { cdf: Cdf; xi: number; cosTheta: number; color: string }) {
  const t = useT();
  const c = useColors();
  const pts: [number, number][] = Array.from(cdf.mu, (m, i) => [m, cdf.F[i]]);
  return (
    <Plot
      ariaLabel="angle-cdf"
      x={{ min: -1, max: 1, label: t.labels.cdfAxisMu }}
      y={{ min: 0, max: 1, label: t.labels.cdfAxisFmu }}
      series={[{ id: 'cdf', label: 'F', color, points: pts }]}
      hoverTitle={(x) => `cos θ = ${x.toFixed(3)} (θ = ${deg(Math.acos(x)).toFixed(1)}°)`}
      hover={(x) => {
        let i = 0;
        while (i < cdf.mu.length - 1 && cdf.mu[i + 1] < x) i++;
        return [{ label: 'F', value: cdf.F[i].toFixed(4) }];
      }}
      overlay={(sx, sy) => (
        <g>
          <line x1={sx(-1)} x2={sx(cosTheta)} y1={sy(xi)} y2={sy(xi)} stroke={c.ink} strokeWidth={2} />
          <line x1={sx(cosTheta)} x2={sx(cosTheta)} y1={sy(xi)} y2={sy(0)} stroke={c.ink} strokeWidth={2} />
          <circle cx={sx(cosTheta)} cy={sy(xi)} r={5} fill={color} stroke={c.surface} strokeWidth={2} />
          <text x={sx(-1) + 6} y={sy(xi) - 6} className="plot-annot">
            ξ = {xi.toFixed(4)}
          </text>
          <text
            x={sx(cosTheta) + (cosTheta > 0.3 ? -6 : 6)}
            y={sy(0) - 8}
            className="plot-annot"
            textAnchor={cosTheta > 0.3 ? 'end' : 'start'}
          >
            cos θ = {cosTheta.toFixed(4)}
          </text>
        </g>
      )}
    />
  );
}

/** Small diagram of the incoming and outgoing directions with angle θ. */
export function ScatterDiagram({ cosTheta, color }: { cosTheta: number; color: string }) {
  const c = useColors();
  const th = Math.acos(cosTheta);
  const cx = 90;
  const cy = 70;
  const L = 58;
  const ex = cx + L * Math.cos(th);
  const ey = cy - L * Math.sin(th);
  const r = 22;
  const arc = `M${cx + r},${cy} A${r},${r} 0 0 0 ${cx + r * Math.cos(th)},${cy - r * Math.sin(th)}`;
  return (
    <svg viewBox="0 0 180 100" className="diagram" role="img" aria-label="scattering-angle">
      <defs>
        <marker id="arr-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={c.ink2} />
        </marker>
        <marker id="arr-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      </defs>
      <line x1={cx - L} y1={cy} x2={cx - 4} y2={cy} stroke={c.ink2} strokeWidth={2} markerEnd="url(#arr-in)" />
      <line x1={cx} y1={cy} x2={cx + L} y2={cy} stroke={c.grid} strokeWidth={1.5} strokeDasharray="4 3" />
      <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={color} strokeWidth={2.5} markerEnd="url(#arr-out)" />
      <path d={arc} fill="none" stroke={c.ink} strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={3.5} fill={c.ink} />
      <text x={cx + r + 4} y={cy - 6} className="plot-annot">
        θ = {deg(th).toFixed(1)}°
      </text>
    </svg>
  );
}

/** Azimuthal angle φ on a circle. */
export function AzimuthDiagram({ phi }: { phi: number }) {
  const c = useColors();
  const cx = 60;
  const cy = 50;
  const R = 36;
  const ex = cx + R * Math.cos(phi);
  const ey = cy - R * Math.sin(phi);
  const large = phi > Math.PI ? 1 : 0;
  const r = 16;
  const arc = `M${cx + r},${cy} A${r},${r} 0 ${large} 0 ${cx + r * Math.cos(phi)},${cy - r * Math.sin(phi)}`;
  return (
    <svg viewBox="0 0 160 100" className="diagram" role="img" aria-label="azimuth">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={c.grid} strokeWidth={1.5} />
      <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke={c.muted} strokeDasharray="3 3" />
      <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={c.reaction.coherent} strokeWidth={2.5} />
      <path d={arc} fill="none" stroke={c.ink} strokeWidth={1.2} />
      <circle cx={ex} cy={ey} r={4.5} fill={c.reaction.coherent} stroke={c.surface} strokeWidth={2} />
      <text x={cx + R + 8} y={cy + 4} className="plot-annot">
        φ = {deg(phi).toFixed(1)}°
      </text>
    </svg>
  );
}
