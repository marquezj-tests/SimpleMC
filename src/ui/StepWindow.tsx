import { useRef, useState, type ReactNode } from 'react';
import type { StepRecordBase } from '../physics/engine';
import type { StepContent } from '../examples/types';
import { useT } from '../i18n';

interface Props {
  record: StepRecordBase | null;
  content: StepContent;
  xiText: string;
  setXiText: (s: string) => void;
  xiError: boolean;
  /** True when the step on screen used random numbers and can be redone. */
  xiEditable: boolean;
  controls: ReactNode;
  onClose: () => void;
}

/** Floating, draggable window that explains the current step (content supplied by the example). */
export function StepWindow(props: Props) {
  const { record: r, content, xiText, setXiText, xiError, xiEditable, controls, onClose } = props;
  const t = useT();
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

  return (
    <div className="step-window" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={t.stepWindow}>
      <div className="step-header" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <div>
          <div className="step-kicker">{content.kicker}</div>
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
            {t.xiThisStep}{' '}
            <small className="muted">· {xiEditable ? t.xiThisStepHint : r && r.xi.length === 0 ? t.xiNone : t.xiNotEditable}</small>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={xiEditable ? xiText : ''}
            placeholder={xiEditable ? '0 ≤ ξ < 1' : '—'}
            disabled={!xiEditable}
            aria-invalid={xiError}
            title={xiError ? `${t.invalid}: 0 ≤ ξ < 1` : t.xiThisStepHelp}
            onChange={(e) => setXiText(e.target.value)}
          />
        </label>
      </div>
      <div className="step-body">
        <div className="step-title">{content.title}</div>
        <p className="step-explain">{content.explanation}</p>
        {content.visual}
        {content.rows && <div className="kv-list">{content.rows}</div>}
        {xi.length > 0 && (
          <div className="xi-chips">
            {xi.map((x, i) => (
              <span key={i} className={`xi-chip ${x.manual ? 'manual' : ''}`}>
                ξ{xi.length > 1 ? SUB[i] ?? i + 1 : ''} = {x.xi.toFixed(4)} <small>({x.manual ? t.xiManual : t.xiRandom})</small>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SUB = ['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
