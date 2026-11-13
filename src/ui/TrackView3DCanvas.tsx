import { useEffect, useRef, useState } from 'react';
import type { Track, Transport, CollisionKind } from '../physics/transport';
import type { Vec3 } from '../physics/sampling';
import { useT } from '../i18n';
import { useColors } from './colors';
import { trackColor } from './TrackView2D';

interface Props {
  transport: Transport;
  version: number;
  thickness: number;
  showCurrent: boolean;
}

/**
 * 3D view drawn with the plain 2D canvas, for browsers without WebGL.
 * Points are rotated by the camera angles and projected in perspective.
 * Same axes as the WebGL view: depth z → X, x → Y (up), y → Z.
 * Drag to rotate, scroll (or pinch) to zoom.
 */
export function TrackView3DCanvas({ transport, version, thickness, showCurrent }: Props) {
  const t = useT();
  const c = useColors();
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [cam, setCam] = useState({ yaw: -0.6, pitch: 0.35, zoom: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(200, e.contentRect.width);
      setSize({ w, h: Math.max(260, Math.min(560, w * 0.6)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // wheel zoom needs a non-passive listener to prevent page scrolling
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCam((k) => ({ ...k, zoom: Math.min(6, Math.max(0.3, k.zoom * Math.exp(-e.deltaY * 0.001))) }));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = size;
    const T = thickness;

    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const D = 4; // camera distance
    const f = Math.min(w, h) * 1.1 * cam.zoom;
    /** Scene point (already normalised by T) → screen. */
    const proj = (X: number, Y: number, Z: number): [number, number] => {
      // yaw around the vertical axis, then pitch around the horizontal one
      const x1 = cy * X + sy * Z;
      const z1 = -sy * X + cy * Z;
      const y2 = cp * Y - sp * z1;
      const z2 = sp * Y + cp * z1;
      const d = Math.max(0.2, D - z2);
      return [w / 2 + (f * x1) / d, h / 2 - (f * y2) / d];
    };
    const P = (p: Vec3) => proj(p.z / T - 0.5, p.x / T, p.y / T);

    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, w, h);

    // slab: box of depth 1 and transverse size 1.6 (normalised units)
    const hx = 0.5;
    const hy = 0.8;
    const corners: [number, number, number][] = [];
    for (const X of [-hx, hx]) for (const Y of [-hy, hy]) for (const Z of [-hy, hy]) corners.push([X, Y, Z]);
    const face = (pts: [number, number, number][]) => {
      ctx.beginPath();
      pts.forEach((q, i) => {
        const [sx, sy2] = proj(...q);
        if (i) ctx.lineTo(sx, sy2);
        else ctx.moveTo(sx, sy2);
      });
      ctx.closePath();
    };
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c.slab;
    for (const X of [-hx, hx]) {
      face([
        [X, -hy, -hy],
        [X, hy, -hy],
        [X, hy, hy],
        [X, -hy, hy],
      ]);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.slabEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        const a = corners[i];
        const b = corners[j];
        const diff = (a[0] !== b[0] ? 1 : 0) + (a[1] !== b[1] ? 1 : 0) + (a[2] !== b[2] ? 1 : 0);
        if (diff !== 1) continue; // only box edges
        const [ax, ay] = proj(...a);
        const [bx, by] = proj(...b);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    ctx.stroke();

    // beam arrow
    const [a0x, a0y] = proj(-1.3, 0, 0);
    const [a1x, a1y] = proj(-0.6, 0, 0);
    ctx.strokeStyle = c.muted;
    ctx.fillStyle = c.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a0x, a0y);
    ctx.lineTo(a1x, a1y);
    ctx.stroke();
    const ang = Math.atan2(a1y - a0y, a1x - a0x);
    ctx.beginPath();
    ctx.moveTo(a1x, a1y);
    ctx.lineTo(a1x - 9 * Math.cos(ang - 0.4), a1y - 9 * Math.sin(ang - 0.4));
    ctx.lineTo(a1x - 9 * Math.cos(ang + 0.4), a1y - 9 * Math.sin(ang + 0.4));
    ctx.fill();

    const drawTrack = (tr: Track, color: string, width: number, alpha: number) => {
      const pts = tr.points.slice();
      if (tr.exitDir) {
        const last = tr.points[tr.points.length - 1];
        const L = 1.2 * T;
        pts.push({ x: last.x + L * tr.exitDir.x, y: last.y + L * tr.exitDir.y, z: last.z + L * tr.exitDir.z });
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(tr.primary ? [] : [5, 4]);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [sx, sy2] = P(p);
        if (i) ctx.lineTo(sx, sy2);
        else ctx.moveTo(sx, sy2);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    const dot = (p: Vec3, kind: CollisionKind, r: number) => {
      const [sx, sy2] = P(p);
      ctx.fillStyle = c.reaction[kind];
      ctx.strokeStyle = c.surface;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy2, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    };

    const tracks = transport.tracks;
    const many = tracks.length > 60;
    for (const tr of tracks) drawTrack(tr, trackColor(tr, c), many ? 1 : 1.5, many ? 0.55 : 0.9);
    for (const tr of tracks) for (const col of tr.collisions) dot(col.pos, col.kind, many ? 2.5 : 3.5);
    const cur = transport.currentTrack;
    if (showCurrent && cur) {
      drawTrack(cur, c.current, 2.5, 1);
      for (const col of cur.collisions) dot(col.pos, col.kind, 4.5);
      const [sx, sy2] = P(cur.points[cur.points.length - 1]);
      ctx.strokeStyle = c.current;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy2, 8, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'left';
    ctx.fillText(t.view3dSimplified, 8, h - 10);
  }, [version, size, cam, c, thickness, showCurrent, transport, t]);

  return (
    <div ref={box} className="view2d">
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h, cursor: 'grab', touchAction: 'none' }}
        role="img"
        aria-label="3D view of photon tracks"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setCam((k) => ({
            ...k,
            yaw: k.yaw + dx * 0.01,
            pitch: Math.min(1.5, Math.max(-1.5, k.pitch + dy * 0.01)),
          }));
        }}
        onPointerUp={() => (drag.current = null)}
      />
    </div>
  );
}
