import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Track, Transport } from '../physics/transport';
import { useColors } from './colors';
import { trackColor } from './TrackView2D';

interface Props {
  transport: Transport;
  version: number;
  thickness: number;
  showCurrent: boolean;
  /** Called when WebGL is unavailable or the context is lost. */
  onFail: (reason: 'unsupported' | 'lost') => void;
}

/**
 * Interactive 3D view (drag to rotate, scroll to zoom). Lengths are divided
 * by the slab thickness. Screen axes: depth z → X (left to right),
 * x → Y (up), y → Z.
 */
export function TrackView3D({ transport, version, thickness, showCurrent, onFail }: Props) {
  const c = useColors();
  const box = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    dynamic: THREE.Group;
    slab: THREE.Group;
  } | null>(null);

  // set-up once
  useEffect(() => {
    const el = box.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      // WebGL disabled, blocklisted GPU, hardware acceleration off, ...
      onFail('unsupported');
      return;
    }
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      onFail('lost');
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(-1.6, 1.2, 2.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const dynamic = new THREE.Group();
    const slab = new THREE.Group();
    scene.add(slab, dynamic);
    three.current = { renderer, scene, camera, controls, dynamic, slab };

    const resize = () => {
      const w = el.clientWidth;
      const h = Math.max(260, Math.min(560, w * 0.6));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // slab and colours
  useEffect(() => {
    const s = three.current;
    if (!s) return;
    s.scene.background = new THREE.Color(c.surface);
    s.slab.clear();
    const geo = new THREE.BoxGeometry(1, 1.6, 1.6);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: c.slab, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: c.slabEdge }));
    s.slab.add(mesh, edges);
    // beam direction arrow
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1.3, 0, 0), 0.7, c.muted, 0.12, 0.07);
    s.slab.add(arrow);
  }, [c]);

  // tracks
  useEffect(() => {
    const s = three.current;
    if (!s) return;
    for (const child of s.dynamic.children) {
      const o = child as THREE.LineSegments | THREE.Points;
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    s.dynamic.clear();
    const T = thickness;
    const map = (p: { x: number; y: number; z: number }) => [p.z / T - 0.5, p.x / T, p.y / T];

    const linePos: number[] = [];
    const lineCol: number[] = [];
    const ptPos: number[] = [];
    const ptCol: number[] = [];
    const col = new THREE.Color();

    const add = (tr: Track, color: string) => {
      col.set(color);
      const pts = tr.points.map(map);
      if (tr.exitDir) {
        const last = tr.points[tr.points.length - 1];
        const L = 1.2 * T;
        pts.push(map({ x: last.x + L * tr.exitDir.x, y: last.y + L * tr.exitDir.y, z: last.z + L * tr.exitDir.z }));
      }
      for (let i = 1; i < pts.length; i++) {
        linePos.push(...pts[i - 1], ...pts[i]);
        lineCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
      for (const cl of tr.collisions) {
        ptPos.push(...map(cl.pos));
        col.set(c.reaction[cl.kind]);
        ptCol.push(col.r, col.g, col.b);
      }
    };
    for (const tr of transport.tracks) add(tr, trackColor(tr, c));
    const cur = transport.currentTrack;
    if (showCurrent && cur) add(cur, c.current);

    if (linePos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));
      s.dynamic.add(
        new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 })),
      );
    }
    if (ptPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ptPos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(ptCol, 3));
      s.dynamic.add(new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: 6, sizeAttenuation: false })));
    }
  }, [version, thickness, c, showCurrent, transport]);

  return <div ref={box} className="view3d" aria-label="3D view of photon tracks" />;
}
