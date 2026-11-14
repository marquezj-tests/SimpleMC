import type { ReactNode } from 'react';
import { NREACTIONS, type NStepRecord, type Nuclide, type PowerIteration } from '../physics/neutron';
import { tabulateCdfOn } from '../physics/sampling';
import type { Lang } from '../i18n';
import type { Colors } from '../ui/colors';
import { deg, fmt, fmtE, fmtVec } from '../ui/format';
import { Row } from '../ui/Kv';
import { Plot, type Series } from '../ui/Plot';
import { AzimuthDiagram, CdfPlot, FlightCdfPlot, ProbabilityBar, ScatterDiagram } from '../ui/StepPlots';
import { GODIVA_TEXT } from './godivaText';
import type { StepContent } from './types';

/** Nuclide colours in plots (U-235, U-238). */
export const nuclideColor = (i: number, c: Colors) => (i === 0 ? c.track.uncollided : c.reaction.inelastic);

/**
 * Reduce a pointwise curve to at most ~2 points per log-energy bin (min and
 * max), so resonance envelopes stay visible while the SVG stays light.
 */
const decimated = new Map<string, [number, number][]>();
function curve(nuc: Nuclide, key: 'total' | (typeof NREACTIONS)[number]): [number, number][] {
  const id = `${nuc.id}:${key}`;
  const hit = decimated.get(id);
  if (hit) return hit;
  let E: number[];
  let y: number[];
  if (nuc.sab) {
    // Bound nucleus: evaluate the cross sections actually used in transport,
    // so that below the S(α,β) limit elastic is 0 and the total is S(α,β) +
    // capture. Points just below and at the limit show the step.
    const Emax = nuc.sab.Emax;
    E = [...new Set([...nuc.table.E, ...nuc.sab.E, Emax * (1 - 1e-9), Emax])].sort((a, b) => a - b);
    y = E.map((e) => nuc.xs(e)[key]);
  } else {
    E = nuc.table.E;
    y = key === 'thermal' ? [] : nuc.table[key];
  }
  const bins = 500;
  const lo = Math.log10(1e-11);
  const hi = Math.log10(20);
  const out: [number, number][] = [];
  let bin = -1;
  let iMin = -1;
  let iMax = -1;
  const flush = () => {
    if (iMin < 0) return;
    const [a, b] = iMin < iMax ? [iMin, iMax] : [iMax, iMin];
    out.push([E[a], y[a]]);
    if (b !== a) out.push([E[b], y[b]]);
  };
  for (let i = 0; i < E.length; i++) {
    if (y[i] <= 0) continue;
    const b = Math.floor(((Math.log10(E[i]) - lo) / (hi - lo)) * bins);
    if (b !== bin) {
      flush();
      bin = b;
      iMin = iMax = i;
    } else {
      if (y[i] < y[iMin]) iMin = i;
      if (y[i] > y[iMax]) iMax = i;
    }
  }
  flush();
  decimated.set(id, out);
  return out;
}

function XsPlot({
  series,
  markers,
  E,
  lang,
  c,
  aria,
}: {
  series: Series[];
  markers: { y: number; color: string }[];
  E: number;
  lang: Lang;
  c: Colors;
  aria: string;
}) {
  const T = GODIVA_TEXT[lang];
  const ymax = 1e4;
  const ymin = 1e-3;
  return (
    <Plot
      ariaLabel={aria}
      x={{ min: 1e-11, max: 20, log: true, label: T.axis.E }}
      y={{ min: ymin, max: ymax, log: true, label: T.axis.sigma }}
      series={series}
      overlay={(sx, sy) => (
        <g>
          <line x1={sx(E)} x2={sx(E)} y1={sy(ymin)} y2={sy(ymax)} stroke={c.ink2} strokeDasharray="3 3" />
          {markers
            .filter((m) => m.y > ymin)
            .map((m, i) => (
              <circle key={i} cx={sx(E)} cy={sy(m.y)} r={5} fill={m.color} stroke={c.surface} strokeWidth={2} />
            ))}
        </g>
      )}
    />
  );
}

/** Reactions that exist for this nuclide (S(α,β) only with a thermal table). */
const reactionsOf = (nuc: Nuclide) => NREACTIONS.filter((rx) => rx !== 'thermal' || nuc.sab);

/** Discrete CDF drawn as a staircase, for the ACE thermal tables (values are increasing). */
function discreteCdf(values: number[], weights: number[]) {
  const mu: number[] = [];
  const F: number[] = [];
  let cum = 0;
  for (let i = 0; i < values.length; i++) {
    mu.push(values[i], values[i]);
    F.push(cum, cum + weights[i]);
    cum += weights[i];
  }
  return { mu: Float64Array.from(mu), F: Float64Array.from(F), pdf: new Float64Array(mu.length) };
}

function LegendRow({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="legend-row">
      {items.map((it) => (
        <span className="legend-item" key={it.label}>
          <span className="swatch" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function godivaStepContent(r: NStepRecord | null, engine: PowerIteration, lang: Lang, c: Colors): StepContent {
  const T = GODIVA_TEXT[lang];
  const nuclides = engine.problem.components.map((x) => x.nuclide);
  const xi = r?.xi ?? [];
  const xiv = (i = 0) => xi[i]?.xi ?? 0;

  const fixed = engine.isFixedSource;
  if (!r) {
    return {
      kicker: fixed ? T.kickerFixed(engine.neutronIndex, engine.sourceSize) : T.kicker(engine.cycle, engine.neutronIndex, engine.sourceSize),
      title: T.titles.start,
      explanation: T.explain.start,
    };
  }

  const n = r.neutron;
  const kicker =
    r.kind === 'cycleEnd' || r.kind === 'done'
      ? `${T.cycle} ${r.cycle}`
      : (fixed ? T.kickerFixed(r.index, engine.sourceSize) : T.kicker(r.cycle, r.index, engine.sourceSize)) + (n && !n.primary ? ` · ${T.secondary}` : '') + (n ? ` · ${fmtE(n.E)}` : '');
  let explanation = '';
  let visual: ReactNode = null;
  let rows: ReactNode = null;
  let title = T.titles[r.kind];

  switch (r.kind) {
    case 'birth': {
      if (!r.cdf) {
        // monoenergetic point source
        title = T.birthMonoTitle;
        explanation = T.explain.birthMono(fmtE(r.E));
        rows = (
          <>
            <Row k="E₀" v={fmtE(r.E)} />
            <Row k={T.rows.dir} v={fmtVec(r.dir)} />
          </>
        );
        break;
      }
      explanation = r.initial ? T.explain.birthInitial(r.source) : T.explain.birth(r.spectrumOf);
      visual = (
        <CdfPlot
          cdf={r.cdf}
          xi={xiv(0)}
          value={r.E}
          color={c.reaction.fission}
          xLabel={T.axis.watt}
          yLabel={T.axis.F}
          xMin={0}
          xMax={10}
          format={(x) => fmtE(x)}
          ariaLabel="fission-spectrum-cdf"
        />
      );
      rows = (
        <>
          <Row k={T.rows.site} v={`${fmtVec(r.neutron!.pos)} cm`} />
          <Row k={`${T.rows.E} = F⁻¹(ξ₁)`} v={fmtE(r.E)} />
          <Row k={T.rows.dir} v={fmtVec(r.dir)} />
        </>
      );
      break;
    }
    case 'bank':
      explanation = T.explain.bank;
      rows = <Row k={T.rows.E} v={fmtE(r.neutron!.E)} />;
      break;
    case 'lookup': {
      explanation = T.explain.lookup;
      visual = (
        <>
          <XsPlot
            aria="total-xs"
            E={r.E}
            lang={lang}
            c={c}
            series={nuclides.map((nu, i) => ({ id: nu.id, label: nu.id, color: nuclideColor(i, c), points: curve(nu, 'total'), width: 1.5 }))}
            markers={r.parts.map((p, i) => ({ y: p.xs.total, color: nuclideColor(i, c) }))}
          />
          <LegendRow items={nuclides.map((nu, i) => ({ color: nuclideColor(i, c), label: `σt ${nu.id}` }))} />
        </>
      );
      rows = (
        <>
          <Row k={T.rows.E} v={fmtE(r.E)} />
          {r.parts.map((p, i) => (
            <Row
              key={p.id}
              k={`${p.id}: N σt`}
              v={`${fmt(p.N, 4)} × ${fmt(p.xs.total, 4)} b = ${fmt(p.N * p.xs.total, 4)} cm⁻¹`}
              color={nuclideColor(i, c)}
            />
          ))}
          <Row k={T.rows.Sigma} v={`${fmt(r.Sigma, 4)} cm⁻¹`} />
          <Row k={T.rows.mfp} v={`${fmt(1 / r.Sigma, 4)} cm`} />
        </>
      );
      break;
    }
    case 'flight':
      explanation = T.explain.flight;
      visual = <FlightCdfPlot mu={r.Sigma} s={r.s} xi={xiv()} distance={r.distance} yLabel={T.axis.sF} />;
      rows = (
        <>
          <Row k={T.rows.s} v={`−ln(${(1 - xiv()).toFixed(4)}) / ${fmt(r.Sigma)} = ${fmt(r.s)} cm`} />
          <Row k={T.rows.d} v={`${fmt(r.distance)} cm`} />
          <Row k={r.s < r.distance ? 's < d' : 's ≥ d'} v={r.s < r.distance ? T.rows.collides : T.rows.leaks} />
        </>
      );
      break;
    case 'move':
      explanation = r.escaped ? T.explain.moveEscape : T.explain.moveCollide;
      rows = (
        <>
          <Row k={T.rows.from} v={`${fmtVec(r.from)} cm`} />
          <Row k={T.rows.to} v={`${fmtVec(r.to)} cm`} />
          <Row k={r.escaped ? '→' : '●'} v={r.escaped ? T.rows.leaks : T.rows.collides} />
          {!fixed && r.scores && (
            <>
              <Row k={T.rows.scoreP} v={r.scores.prod.toFixed(4)} />
              <Row k={T.rows.scoreA} v={r.scores.abs.toFixed(4)} />
            </>
          )}
          {!fixed && r.escaped && <Row k="L" v="+1" />}
        </>
      );
      break;
    case 'nuclide':
      explanation = T.explain.nuclide;
      visual = (
        <ProbabilityBar
          items={r.probabilities.map((p, i) => ({ key: p.id, label: p.id, color: nuclideColor(i, c), p: p.p, cum: p.cum }))}
          xi={xiv()}
          chosen={r.chosen}
          axisLabel="Σ Nᵢσt,ᵢ / Σt"
        />
      );
      rows = (
        <>
          {r.probabilities.map((p, i) => (
            <Row key={p.id} k={p.id === r.chosen ? <b>{p.id}</b> : p.id} v={`${p.p.toFixed(4)} · ${p.cum.toFixed(4)}`} color={nuclideColor(i, c)} />
          ))}
          <Row k={T.rows.chosen} v={<b>{r.chosen}</b>} />
        </>
      );
      break;
    case 'reaction': {
      explanation = T.explain.reaction;
      const nuc = nuclides[r.nuclideIndex];
      visual = (
        <>
          <XsPlot
            aria="partial-xs"
            E={r.E}
            lang={lang}
            c={c}
            series={reactionsOf(nuc).map((rx) => ({ id: rx, label: rx, color: c.reaction[rx], points: curve(nuc, rx), width: 1.5 }))}
            markers={reactionsOf(nuc).map((rx) => ({ y: r.xs[rx], color: c.reaction[rx] }))}
          />
          <LegendRow items={reactionsOf(nuc).map((rx) => ({ color: c.reaction[rx], label: `${T.reactions[rx]} (${nuc.id})` }))} />
          <ProbabilityBar
            items={r.probabilities.map((p) => ({ key: p.reaction, label: T.reactions[p.reaction], color: c.reaction[p.reaction], p: p.p, cum: p.cum }))}
            xi={xiv()}
            chosen={r.chosen}
            axisLabel="Σ σₓ / σt"
          />
        </>
      );
      rows = (
        <>
          {r.probabilities.filter((p) => reactionsOf(nuc).includes(p.reaction)).map((p) => (
            <Row
              key={p.reaction}
              k={p.reaction === r.chosen ? <b>{T.reactions[p.reaction]}</b> : T.reactions[p.reaction]}
              v={`${fmt(r.xs[p.reaction], 4)} b · ${p.p.toFixed(4)} · ${p.cum.toFixed(4)}`}
              color={c.reaction[p.reaction]}
            />
          ))}
          <Row k={T.rows.chosen} v={<b>{T.reactions[r.chosen]}</b>} />
        </>
      );
      break;
    }
    case 'elastic': {
      explanation = r.model === 'tabulated' ? T.explain.elasticTab : T.explain.elasticIso;
      const nuc = nuclides[r.nuclideIndex];
      // CDF of μ_cm at this energy, from the inverse CDF (or uniform)
      const inv = nuc.elasticInverse(r.E);
      const grid = Array.from({ length: 201 }, (_, i) => -1 + i / 100);
      const cdf =
        r.model === 'tabulated'
          ? (() => {
              const xs = Array.from({ length: 401 }, (_, i) => i / 400);
              const mus = xs.map((x) => inv(x));
              return { mu: Float64Array.from(mus), F: Float64Array.from(xs), pdf: new Float64Array(xs.length) };
            })()
          : tabulateCdfOn(grid, () => 1);
      visual = (
        <div className="visual-row">
          <CdfPlot
            cdf={cdf}
            xi={xiv()}
            value={r.muCm}
            color={c.reaction.elastic}
            xLabel={T.axis.mu}
            yLabel={T.axis.Fmu}
            xMin={-1}
            xMax={1}
            format={(x) => `μ_cm = ${x.toFixed(4)}`}
            ariaLabel="elastic-angle-cdf"
          />
          <ScatterDiagram cosTheta={r.muLab} color={c.reaction.elastic} />
        </div>
      );
      rows = (
        <>
          <Row k={T.rows.A} v={r.A.toFixed(3)} />
          <Row k={r.model === 'tabulated' ? 'μ_cm = F⁻¹(ξ)' : 'μ_cm = 2ξ − 1'} v={r.muCm.toFixed(4)} />
          <Row k="E′ = E (A² + 2Aμ_cm + 1)/(A + 1)²" v={`${fmtE(r.E)} → ${fmtE(r.Enew)}`} />
          <Row k="μ_lab = (1 + Aμ_cm)/√(A² + 2Aμ_cm + 1)" v={`${r.muLab.toFixed(4)} (θ_lab = ${deg(Math.acos(r.muLab)).toFixed(1)}°)`} />
        </>
      );
      break;
    }
    case 'sab': {
      explanation = T.explain.sab;
      const sm = r.sample;
      const eMin = Math.min(...sm.eOut);
      const eMax = Math.max(...sm.eOut);
      visual = (
        <>
          <CdfPlot
            cdf={discreteCdf(
              sm.eOut.map((e) => e * 1e6),
              sm.weights,
            )}
            xi={xiv(0)}
            value={sm.Enew * 1e6}
            color={c.reaction.thermal}
            xLabel={T.rows.sabAxisE}
            yLabel={T.rows.sabAxisPE}
            xMin={eMin * 1e6}
            xMax={eMax * 1e6}
            format={(x) => `E′ = ${fmtE(x * 1e-6)}`}
            ariaLabel="sab-energy-cdf"
          />
          <div className="visual-row">
            <CdfPlot
              cdf={discreteCdf(sm.muOut, sm.muOut.map(() => 1 / sm.muOut.length))}
              xi={xiv(1)}
              value={sm.mu}
              color={c.reaction.thermal}
              xLabel={T.rows.sabAxisMu}
              yLabel={T.rows.sabAxisPMu}
              xMin={-1}
              xMax={1}
              format={(x) => `μ = ${x.toFixed(4)}`}
              ariaLabel="sab-angle-cdf"
            />
            <ScatterDiagram cosTheta={sm.mu} color={c.reaction.thermal} />
          </div>
        </>
      );
      rows = (
        <>
          <Row k={T.rows.E} v={fmtE(r.E)} />
          <Row k={T.rows.sabInterval} v={`${fmtE(r.Ein[0])} – ${fmtE(r.Ein[1])} (f = ${sm.f.toFixed(3)})`} />
          <Row k={`ξ₁ → ${T.rows.sabBin(sm.j, sm.eOut.length)}`} v={`p = ${sm.weights[sm.j].toFixed(4)}`} />
          <Row k="E′" v={`${fmtE(r.E)} → ${fmtE(sm.Enew)}${sm.Enew > r.E ? ' ↑' : ''}`} />
          <Row k={`ξ₂ → ${T.rows.sabMu(sm.k, sm.muOut.length)}`} v={`μ = ${sm.mu.toFixed(4)} (θ = ${deg(Math.acos(sm.mu)).toFixed(1)}°)`} />
        </>
      );
      break;
    }
    case 'target':
      explanation = T.explain.target;
      rows = (
        <>
          <Row k={T.rows.nuclide} v={nuclides[r.nuclideIndex].id} />
          <Row k={T.rows.kT} v={fmtE(r.kT)} />
          <Row k={T.rows.E} v={fmtE(r.E)} />
          <Row k={T.rows.Et} v={`${fmtE(r.Et)} (${(r.Et / r.kT).toFixed(2)} kT)`} />
          <Row k={T.rows.muNT} v={r.muNT.toFixed(4)} />
          <Row k={T.rows.tries} v={r.tries} />
        </>
      );
      break;
    case 'elasticGas':
      explanation = T.explain.elasticGas;
      visual = <ScatterDiagram cosTheta={r.muLab} color={c.reaction.elastic} />;
      rows = (
        <>
          <Row k={T.rows.A} v={r.A.toFixed(4)} />
          <Row k={r.model === 'tabulated' ? 'μ_cm = F⁻¹(ξ₁)' : 'μ_cm = 2ξ₁ − 1'} v={r.muCm.toFixed(4)} />
          <Row k="φ = 2πξ₂" v={`${deg(r.phi).toFixed(1)}°`} />
          <Row k={T.rows.Et} v={fmtE(r.Et)} />
          <Row k="E → E′" v={`${fmtE(r.E)} → ${fmtE(r.Enew)}${r.Enew > r.E ? ' ↑' : ''}`} />
          <Row k={T.rows.thetaLab} v={`${deg(Math.acos(Math.max(-1, Math.min(1, r.muLab)))).toFixed(1)}°`} />
        </>
      );
      break;
    case 'azimuth':
      explanation = T.explain.azimuth;
      visual = <AzimuthDiagram phi={r.phi} />;
      rows = (
        <>
          <Row k={T.rows.phi} v={`${r.phi.toFixed(4)} rad = ${deg(r.phi).toFixed(1)}°`} />
          <Row k={T.rows.oldDir} v={fmtVec(r.oldDir)} />
          <Row k={T.rows.newDir} v={fmtVec(r.newDir)} />
        </>
      );
      break;
    case 'inelastic':
      explanation = T.explain.inelastic;
      rows = (
        <>
          <Row k="T = 3.2 √(E/A)" v={`${fmtE(r.T)}`} />
          <Row k="E′ = −T ln(ξ₁ξ₂)" v={`${fmtE(r.E)} → ${fmtE(r.Enew)}`} />
          <Row k={T.rows.tries} v={r.tries} />
          <Row k={T.rows.newDir} v={fmtVec(r.newDir)} />
        </>
      );
      break;
    case 'nxn':
      explanation = T.explain.nxn;
      rows = (
        <>
          <Row k={T.rows.multiplicity} v={r.multiplicity} />
          <Row k="T = 3.2 √(E/A)" v={fmtE(r.T)} />
          <Row k={T.rows.energies} v={r.energies.map((e) => fmtE(e)).join(', ')} />
        </>
      );
      break;
    case 'fission':
      explanation = T.explain.fission;
      rows = (
        <>
          <Row k={T.rows.nuclide} v={r.nuclide} />
          <Row k={T.rows.nu} v={r.nu.toFixed(4)} />
          <Row k={T.rows.banked} v={`⌊${r.nu.toFixed(4)} + ${xiv().toFixed(4)}⌋ = ${r.banked}`} />
        </>
      );
      break;
    case 'capture':
      explanation = T.explain.capture;
      rows = <Row k={T.rows.nuclide} v={r.nuclide} />;
      break;
    case 'historyEnd':
      explanation = T.explain.historyEnd;
      rows = <Row k={T.rows.fate} v={T.rows.fates[r.fate]} />;
      break;
    case 'cycleEnd':
      explanation = T.explain.cycleEnd;
      rows = (
        <>
          <Row k={T.rows.sourceSize} v={r.sourceSize} />
          <Row k={T.rows.bankSize} v={r.bankSize} />
          <Row k={T.rows.k} v={`${r.bankSize} / ${r.sourceSize} = ${r.k.toFixed(5)}`} />
          <Row k={T.rows.phase} v={r.active ? T.rows.active : T.rows.inactive} />
          {r.kMean !== null && (
            <Row k={T.rows.kMean} v={`${r.kMean.toFixed(5)}${Number.isFinite(r.kSigma) ? ` ± ${r.kSigma!.toFixed(5)}` : ''}`} />
          )}
          <Row k={T.rows.P} v={r.balance.P.toFixed(2)} />
          <Row k={T.rows.Aabs} v={r.balance.A.toFixed(2)} />
          <Row k={T.rows.L} v={r.balance.L} />
          <Row k={T.rows.kbar} v={r.balance.kbar.toFixed(4)} />
          <Row k={T.rows.PNL} v={r.balance.PNL.toFixed(4)} />
          <Row k={T.rows.kTwo} v={r.balance.k.toFixed(5)} />
          <Row k="→" v={T.rows.nextSource} />
        </>
      );
      break;
    case 'done':
      explanation = engine.stopped ? T.emptyBank : T.explain.done;
      break;
  }
  return { kicker, title, explanation, visual, rows };
}
