import { useEffect, useRef, useState } from 'react';
import type { Engine, Track } from '../physics/engine';
import type { Scene, Simulation } from '../examples/types';
import { useLang } from '../i18n';
import { useColors } from './colors';

interface Props {
  engine: Engine;
  sim: Simulation;
  scene: Scene;
  version: number;
  showCurrent: boolean;
}

/**
 * 2D projection of the tracks. Depth z runs left to right and x upwards
 * (a side view of the slab, or a cut through the centre of the sphere).
 */
export function TrackView2D({ engine, sim, scene, version, showCurrent }: Props) {
  const lang = useLang();
  const c = useColors();
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });

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

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = size;

    // world → canvas
    let X: (z: number) => number;
    let Y: (x: number) => number;
    let L: number; // length of exit rays
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '12px system-ui, sans-serif';

    if (scene.kind === 'slab') {
      const T = scene.thickness;
      const scale = Math.min(w / (2.2 * T), h / (1.6 * T));
      const cz = w * 0.45;
      X = (z) => cz + (z - T / 2) * scale;
      Y = (x) => h / 2 - x * scale;
      L = 4 * T;
      ctx.fillStyle = c.slab;
      ctx.fillRect(X(0), 0, T * scale, h);
      ctx.strokeStyle = c.slabEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(0), 0);
      ctx.lineTo(X(0), h);
      ctx.moveTo(X(T), 0);
      ctx.lineTo(X(T), h);
      ctx.stroke();
      ctx.fillStyle = c.ink2;
      ctx.textAlign = 'center';
      ctx.fillText(scene.label[lang], X(T / 2), 16);
      // beam arrows
      ctx.strokeStyle = c.muted;
      ctx.fillStyle = c.muted;
      ctx.lineWidth = 1.2;
      const z0 = Math.max(-T * 0.55, -(cz - T * scale * 0.5 - 10) / scale);
      for (let i = -2; i <= 2; i++) {
        const y = Y(i * 0.25 * T);
        ctx.beginPath();
        ctx.moveTo(X(z0), y);
        ctx.lineTo(X(-0.06 * T), y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(X(-0.02 * T), y);
        ctx.lineTo(X(-0.02 * T) - 7, y - 4);
        ctx.lineTo(X(-0.02 * T) - 7, y + 4);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.fillText(scene.beamLabel[lang], 8, h - 10);
    } else {
      const R = scene.radius;
      const scale = Math.min(w, h) / (2.6 * R);
      X = (z) => w / 2 + z * scale;
      Y = (x) => h / 2 - x * scale;
      L = 0.5 * R;
      ctx.fillStyle = c.slab;
      ctx.strokeStyle = c.slabEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, R * scale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.ink2;
      ctx.textAlign = 'left';
      ctx.fillText(scene.label[lang], 8, 16);
    }

    const drawTrack = (tr: Track, color: string, dashed: boolean, width: number, alpha: number) => {
      if (tr.points.length < 1) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(X(tr.points[0].z), Y(tr.points[0].x));
      for (const p of tr.points) ctx.lineTo(X(p.z), Y(p.x));
      if (tr.exitDir) {
        const p = tr.points[tr.points.length - 1];
        ctx.lineTo(X(p.z + L * tr.exitDir.z), Y(p.x + L * tr.exitDir.x));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    const markers = (tr: Track, r: number) => {
      for (const col of tr.collisions) {
        ctx.fillStyle = sim.markerColor(col.kind, c);
        ctx.strokeStyle = c.surface;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X(col.pos.z), Y(col.pos.x), r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    };

    const tracks = engine.tracks;
    const many = tracks.length > 60;
    for (const tr of tracks) {
      const st = sim.trackStyle(tr, c);
      drawTrack(tr, st.color, st.dashed, many ? 1 : 1.5, many ? 0.55 : 0.9);
    }
    for (const tr of tracks) markers(tr, many ? 2.5 : 3.5);

    const cur = engine.currentTrack;
    if (showCurrent && cur) {
      drawTrack(cur, c.current, !cur.primary, 2.5, 1);
      markers(cur, 4.5);
      const last = cur.points[cur.points.length - 1];
      // ring around the current position, so the collision marker stays visible
      ctx.strokeStyle = c.current;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(last.z), Y(last.x), 8, 0, 2 * Math.PI);
      ctx.stroke();
    }
    // version is used only to trigger redraws
  }, [version, size, c, scene, showCurrent, engine, sim, lang]);

  return (
    <div ref={box} className="view2d">
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} role="img" aria-label="Particle tracks" />
    </div>
  );
}
