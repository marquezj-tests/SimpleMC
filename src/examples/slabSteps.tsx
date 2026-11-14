import type { ReactNode } from 'react';
import { REACTIONS, type Material } from '../physics/material';
import type { StepRecord } from '../physics/transport';
import type { Dict } from '../i18n';
import type { Colors } from '../ui/colors';
import { deg, fmt, fmtE, fmtVec } from '../ui/format';
import { Row } from '../ui/Kv';
import {
  AngleCdfPlot,
  AzimuthDiagram,
  CrossSectionPlot,
  FlightCdfPlot,
  ReactionBar,
  ScatterDiagram,
} from '../ui/StepPlots';
import type { StepContent } from './types';

/** Content of the step window for the photon slab example. */
export function slabStepContent(
  r: StepRecord | null,
  material: Material,
  sourceWidth: number,
  t: Dict,
  c: Colors,
): StepContent {
  const xi = r?.xi ?? [];
  const xiv = (i = 0) => xi[i]?.xi ?? 0;

  let title = t.stepWindow;
  let explanation = t.startHint;
  let visual: ReactNode = null;
  let rows: ReactNode = null;

  if (r) {
    title = t.stepTitles[r.kind];
    explanation = r.kind === 'move' ? (r.escaped ? t.explain.moveEscape : t.explain.moveCollide) : r.kind === 'angle' ? (r.reaction === 'incoherent' ? t.explain.angleIncoherent : t.explain.angleCoherent) : t.explain[r.kind];
    switch (r.kind) {
      case 'birth':
        rows = (
          <>
            <Row k="E₀" v={fmtE(r.E)} />
            <Row k="ξ" v={xiv().toFixed(4)} />
            <Row k="x = y = (ξ − ½)·W" v={`(${xiv().toFixed(4)} − 0.5) × ${fmt(sourceWidth)} cm = ${fmt(r.x)} cm`} />
            <Row k="Ω" v="(0, 0, 1)" />
          </>
        );
        break;
      case 'bank':
        rows = (
          <>
            <Row k="E" v={fmtE(r.photon!.E)} />
            <Row k={t.labels.remaining} v={r.remaining} />
          </>
        );
        break;
      case 'lookup':
        visual = <CrossSectionPlot material={material} E={r.E} mode="total" />;
        rows = (
          <>
            <Row k="E" v={fmtE(r.E)} />
            <Row k="μ/ρ" v={`${fmt(r.massTotal)} cm²/g`} />
            <Row k="ρ" v={`${fmt(r.density)} g/cm³`} />
            <Row k="μ = (μ/ρ)·ρ" v={`${fmt(r.mu)} cm⁻¹`} />
            <Row k={`λ = ${t.labels.mfp}`} v={`${fmt(1 / r.mu)} cm`} />
          </>
        );
        break;
      case 'flight':
        visual = <FlightCdfPlot mu={r.mu} s={r.s} xi={xiv()} distance={r.distance} />;
        rows = (
          <>
            <Row k="ξ" v={xiv().toFixed(4)} />
            <Row k="s = −ln(1 − ξ)/μ" v={`−ln(${(1 - xiv()).toFixed(4)}) / ${fmt(r.mu)} = ${fmt(r.s)} cm`} />
            <Row k={t.labels.d} v={`${fmt(r.distance)} cm`} />
            <Row
              k={r.s < r.distance ? 's < d' : 's ≥ d'}
              v={r.s < r.distance ? t.labels.collides : `${t.labels.escapes} ${t.labels.face[r.surface as 'back' | 'front' | 'none']}`}
            />
          </>
        );
        break;
      case 'move':
        rows = (
          <>
            <Row k={t.labels.from} v={`${fmtVec(r.from)} cm`} />
            <Row k={t.labels.to} v={`${fmtVec(r.to)} cm`} />
            <Row
              k={r.escaped ? '→' : '●'}
              v={r.escaped ? `${t.labels.escapes} ${t.labels.face[r.surface as 'back' | 'front' | 'none']}${r.fate === 'transmitted' && r.uncollided ? ` · ${t.labels.uncollided}` : ''}` : t.labels.collides}
            />
          </>
        );
        break;
      case 'partials':
        visual = <CrossSectionPlot material={material} E={r.E} mode="partials" />;
        rows = (
          <>
            <Row k="E" v={fmtE(r.E)} />
            {REACTIONS.map((rx) => (
              <Row key={rx} k={t.reactions[rx]} v={`${fmt(r.partials[rx])} cm²/g`} color={c.reaction[rx]} />
            ))}
            <Row k={t.total} v={`${fmt(r.massTotal)} cm²/g`} />
          </>
        );
        break;
      case 'reaction':
        visual = <ReactionBar probabilities={r.probabilities} xi={xiv()} chosen={r.chosen} />;
        rows = (
          <>
            <div className="kv kv-head">
              <span className="kv-k" />
              <span className="kv-v">
                pᵢ = μᵢ/μ &nbsp;·&nbsp; Σ
              </span>
            </div>
            {r.probabilities.map((p) => (
              <Row
                key={p.reaction}
                k={p.reaction === r.chosen ? <b>{t.reactions[p.reaction]}</b> : t.reactions[p.reaction]}
                v={`${p.p.toFixed(4)} · ${p.cum.toFixed(4)}`}
                color={c.reaction[p.reaction]}
              />
            ))}
            <Row k="ξ" v={xiv().toFixed(4)} />
            <Row k={t.labels.chosen} v={<b>{t.reactions[r.chosen]}</b>} />
          </>
        );
        break;
      case 'angle':
        visual = (
          <div className="visual-row">
            <AngleCdfPlot cdf={r.cdf} xi={xiv()} cosTheta={r.cosTheta} color={c.reaction[r.reaction]} />
            <ScatterDiagram cosTheta={r.cosTheta} color={c.reaction[r.reaction]} />
          </div>
        );
        rows = (
          <>
            <Row k="ξ" v={xiv().toFixed(4)} />
            <Row k="cos θ = F⁻¹(ξ)" v={r.cosTheta.toFixed(4)} />
            <Row k="θ" v={`${deg(Math.acos(r.cosTheta)).toFixed(2)}°`} />
            {r.reaction === 'incoherent' ? (
              <>
                <Row k="E′ = E / (1 + (E/mₑc²)(1 − cos θ))" v={`${fmtE(r.E)} → ${fmtE(r.Enew)}`} />
                <Row k={`E − E′ (${t.labels.deposited})`} v={fmtE(r.E - r.Enew)} />
              </>
            ) : (
              <Row k="E′ = E" v={fmtE(r.Enew)} />
            )}
          </>
        );
        break;
      case 'azimuth':
        visual = <AzimuthDiagram phi={r.phi} />;
        rows = (
          <>
            <Row k="ξ" v={xiv().toFixed(4)} />
            <Row k="φ = 2πξ" v={`${r.phi.toFixed(4)} rad = ${deg(r.phi).toFixed(1)}°`} />
            <Row k={t.labels.oldDir} v={fmtVec(r.oldDir)} />
            <Row k={t.labels.newDir} v={fmtVec(r.newDir)} />
            <Row k="E" v={fmtE(r.photon!.E)} />
          </>
        );
        break;
      case 'photoelectric':
        rows = <Row k={t.labels.deposited} v={fmtE(r.E)} />;
        break;
      case 'pair':
        rows = (
          <>
            <Row k="E" v={fmtE(r.E)} />
            <Row k={t.labels.kinetic} v={fmtE(r.kinetic)} />
            <Row k="ξ₁, ξ₂" v={`${xiv(0).toFixed(4)}, ${xiv(1).toFixed(4)}`} />
            <Row k={t.labels.dirs} v={`${fmtVec(r.dirs[0])}, ${fmtVec(r.dirs[1])}`} />
          </>
        );
        break;
      case 'cutoff':
        rows = <Row k="E < E_cut" v={`${fmtE(r.E)} < ${fmtE(r.cutoff)}`} />;
        break;
      case 'historyEnd':
        rows = (
          <>
            <Row k={t.labels.transmitted} v={r.transmitted} />
            <Row k={t.labels.uncollided} v={r.uncollided} />
            <Row k={t.labels.photons} v={r.photons} />
          </>
        );
        break;
    }
  }


  const ph = r?.photon;
  const kicker = r
    ? `${t.history} ${r.history}` +
      (ph ? ` · ${ph.primary ? t.photonPrimary : t.photonSecondary} · ${fmtE(ph.E)} · ${ph.collisions} ${t.collisions}` : '')
    : t.stepWindow;
  return { kicker, title, explanation, visual, rows };
}
