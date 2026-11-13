/**
 * Minimal SVG plotting: linear/log axes, line series, markers and a hover
 * crosshair. Written by hand to keep the code readable for students.
 */
import { useRef, useState, type ReactNode } from 'react';

export interface Axis {
  min: number;
  max: number;
  log?: boolean;
  label: string;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  points: [number, number][];
  width?: number;
  dash?: string;
}

export interface PlotProps {
  width?: number;
  height?: number;
  x: Axis;
  y: Axis;
  series: Series[];
  /** Extra SVG drawn on top; receives the scale functions. */
  overlay?: (sx: (v: number) => number, sy: (v: number) => number) => ReactNode;
  /** Tooltip rows for a hovered x value. */
  hover?: (x: number) => { label: string; value: string; color?: string }[];
  hoverTitle?: (x: number) => string;
  ariaLabel: string;
}

export const MARGIN = { left: 58, right: 14, top: 10, bottom: 40 };

function scale(a: Axis, from: number, to: number) {
  if (a.log) {
    const l0 = Math.log10(a.min);
    const l1 = Math.log10(a.max);
    return {
      f: (v: number) => from + ((Math.log10(Math.max(v, a.min * 1e-6)) - l0) / (l1 - l0)) * (to - from),
      inv: (p: number) => Math.pow(10, l0 + ((p - from) / (to - from)) * (l1 - l0)),
    };
  }
  return {
    f: (v: number) => from + ((v - a.min) / (a.max - a.min)) * (to - from),
    inv: (p: number) => a.min + ((p - from) / (to - from)) * (a.max - a.min),
  };
}

function ticks(a: Axis): { v: number; major: boolean }[] {
  if (a.log) {
    const out: { v: number; major: boolean }[] = [];
    const d0 = Math.floor(Math.log10(a.min));
    const d1 = Math.ceil(Math.log10(a.max));
    const decades = d1 - d0;
    for (let d = d0; d <= d1; d++) {
      for (let m = 1; m < 10; m++) {
        const v = m * Math.pow(10, d);
        if (v < a.min * 0.999 || v > a.max * 1.001) continue;
        if (m === 1) out.push({ v, major: true });
        else if (decades <= 3 && (m === 2 || m === 5)) out.push({ v, major: false });
      }
    }
    return out;
  }
  const span = a.max - a.min;
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: { v: number; major: boolean }[] = [];
  for (let v = Math.ceil(a.min / step) * step; v <= a.max + step * 1e-9; v += step) out.push({ v, major: true });
  return out;
}

export function fmtTick(v: number, log?: boolean): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (log) {
    const e = Math.log10(a);
    if (Math.abs(e - Math.round(e)) < 1e-9 && (a >= 1e4 || a < 1e-2)) return `1e${Math.round(e)}`;
  }
  if (a >= 1e4 || a < 1e-3) return v.toExponential(0);
  return String(Number(v.toPrecision(3)));
}

export function Plot({ width = 440, height = 250, x, y, series, overlay, hover, hoverTitle, ariaLabel }: PlotProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [hx, setHx] = useState<number | null>(null);
  const x0 = MARGIN.left;
  const x1 = width - MARGIN.right;
  const y0 = height - MARGIN.bottom;
  const y1 = MARGIN.top;
  const sx = scale(x, x0, x1);
  const sy = scale(y, y0, y1);
  const clip = `clip-${ariaLabel.replace(/\W/g, '')}`;

  const onMove = (e: React.PointerEvent) => {
    if (!hover || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    if (px < x0 || px > x1) return setHx(null);
    setHx(sx.inv(px));
  };

  const rows = hx !== null && hover ? hover(hx) : [];
  const tipLeft = hx !== null ? sx.f(hx) > (x0 + x1) / 2 : false;

  return (
    <div className="plot">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHx(null)}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={x0} y={y1} width={x1 - x0} height={y0 - y1} />
          </clipPath>
        </defs>
        {ticks(x).map((t, i) => (
          <g key={`x${i}`}>
            <line x1={sx.f(t.v)} x2={sx.f(t.v)} y1={y0} y2={y1} className={t.major ? 'grid' : 'grid minor'} />
            {t.major && (
              <text x={sx.f(t.v)} y={y0 + 14} className="tick" textAnchor="middle">
                {fmtTick(t.v, x.log)}
              </text>
            )}
          </g>
        ))}
        {ticks(y).map((t, i) => (
          <g key={`y${i}`}>
            <line x1={x0} x2={x1} y1={sy.f(t.v)} y2={sy.f(t.v)} className={t.major ? 'grid' : 'grid minor'} />
            {t.major && (
              <text x={x0 - 5} y={sy.f(t.v) + 3.5} className="tick" textAnchor="end">
                {fmtTick(t.v, y.log)}
              </text>
            )}
          </g>
        ))}
        <line x1={x0} x2={x1} y1={y0} y2={y0} className="axis" />
        <line x1={x0} x2={x0} y1={y0} y2={y1} className="axis" />
        <text x={(x0 + x1) / 2} y={height - 6} className="axis-label" textAnchor="middle">
          {x.label}
        </text>
        <text
          transform={`translate(13 ${(y0 + y1) / 2}) rotate(-90)`}
          className="axis-label"
          textAnchor="middle"
        >
          {y.label}
        </text>
        <g clipPath={`url(#${clip})`}>
          {series.map((s) => (
            <polyline
              key={s.id}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={s.width ?? 2}
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              points={s.points
                .filter(([, v]) => !y.log || v > 0)
                .map(([a, b]) => `${sx.f(a).toFixed(1)},${sy.f(b).toFixed(1)}`)
                .join(' ')}
            />
          ))}
          {overlay?.(sx.f, sy.f)}
        </g>
        {hx !== null && hover && (
          <line x1={sx.f(hx)} x2={sx.f(hx)} y1={y0} y2={y1} className="crosshair" />
        )}
      </svg>
      {hx !== null && rows.length > 0 && (
        <div
          className="tooltip"
          style={tipLeft ? { right: `${((width - sx.f(hx) + 10) / width) * 100}%` } : { left: `${((sx.f(hx) + 10) / width) * 100}%` }}
        >
          {hoverTitle && <div className="tooltip-title">{hoverTitle(hx)}</div>}
          {rows.map((r) => (
            <div key={r.label} className="tooltip-row">
              {r.color && <span className="swatch" style={{ background: r.color }} />}
              <span className="tooltip-label">{r.label}</span>
              <span className="tooltip-value">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
