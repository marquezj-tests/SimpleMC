import { useRef, useState, type ReactNode } from 'react';
import { REACTIONS, type Material } from '../physics/material';
import type { StepRecord } from '../physics/transport';
import { useT } from '../i18n';
import { useColors } from './colors';
import { deg, fmt, fmtE, fmtVec } from './format';
import {
  AngleCdfPlot,
  AzimuthDiagram,
  CrossSectionPlot,
  FlightCdfPlot,
  ReactionBar,
  ScatterDiagram,
} from './StepPlots';

interface Props {
  record: StepRecord | null;
  material: Material;
  sourceWidth: number;
  nextXiCount: number;
  xiText: string;
  setXiText: (s: string) => void;
  xiError: boolean;
  controls: ReactNode;
  onClose: () => void;
}

function Row({ k, v, color }: { k: ReactNode; v: ReactNode; color?: string }) {
  return (
    <div className="kv">
      <span className="kv-k">
        {color && <span className="swatch" style={{ background: color }} />}
        {k}
      </span>
      <span className="kv-v">{v}</span>
    </div>
  );
}

export function StepWindow(props: Props) {
  const { record: r, material, nextXiCount, xiText, setXiText, xiError, controls, onClose } = props;
  const t = useT();
  const c = useColors();
  const [pos, setPos] = useState(() => ({
    x: Math.max(8, window.innerWidth - 520),
    y: 70,
  }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: Math.min(window.innerWidth - 120, Math.max(-380, e.clientX - drag.current.dx)),
      y: Math.min(window.innerHeight - 40, Math.max(0, e.clientY - drag.current.dy)),
    });
  };
  const onUp = () => (drag.current = null);

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
            <Row k="x = (ξ − ½)·W" v={`(${xiv().toFixed(4)} − 0.5) × ${fmt(props.sourceWidth)} cm = ${fmt(r.x)} cm`} />
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
  return (
    <div className="step-window" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={t.stepWindow}>
      <div className="step-header" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <div>
          <div className="step-kicker">
            {r ? `${t.history} ${r.history}` : t.stepWindow}
            {ph && ` · ${ph.primary ? t.photonPrimary : t.photonSecondary} · ${fmtE(ph.E)} · ${ph.collisions} ${t.collisions}`}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t.close} title={t.close}>
          ✕
        </button>
      </div>
      {/* Fixed bar: buttons and ξ field stay in place whatever the step content is */}
      <div className="step-actions">
        <div className="controls">{controls}</div>
        <label className="xi-input">
          <span className="xi-label">
            {t.nextXi} <small className="muted">· {t.nextNeeds(nextXiCount)}</small>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={xiText}
            placeholder="0 ≤ ξ < 1"
            disabled={nextXiCount === 0}
            aria-invalid={xiError}
            title={xiError ? `${t.invalid}: 0 ≤ ξ < 1` : t.nextXiHelp}
            onChange={(e) => setXiText(e.target.value)}
          />
        </label>
      </div>
      <div className="step-body">
        <div className="step-title">{title}</div>
        <p className="step-explain">{explanation}</p>
        {visual}
        {rows && <div className="kv-list">{rows}</div>}
        {xi.length > 0 && (
          <div className="xi-chips">
            {xi.map((x, i) => (
              <span key={i} className={`xi-chip ${x.manual ? 'manual' : ''}`}>
                ξ{xi.length > 1 ? ['₁', '₂', '₃'][i] : ''} = {x.xi.toFixed(4)} <small>({x.manual ? t.xiManual : t.xiRandom})</small>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
