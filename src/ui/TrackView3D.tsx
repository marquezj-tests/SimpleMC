import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Engine, Track } from '../physics/engine';
import type { Scene, Simulation } from '../examples/types';
import { useColors } from './colors';
import { sceneMapping } from './sceneMap';

interface Props {
  engine: Engine;
  sim: Simulation;
  scene: Scene;
  version: number;
  showCurrent: boolean;
  /** Called when WebGL is unavailable or the context is lost. */
  onFail: (reason: 'unsupported' | 'lost') => void;
}

/**
 * Interactive 3D view (drag to rotate, scroll to zoom), see sceneMapping()
 * for the coordinates.
 */
export function TrackView3D({ engine, sim, scene, version, showCurrent, onFail }: Props) {
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

  // geometry and colours
  useEffect(() => {
    const s = three.current;
    if (!s) return;
    s.scene.background = new THREE.Color(c.surface);
    s.slab.clear();
    const fill = new THREE.MeshBasicMaterial({ color: c.slab, transparent: true, opacity: 0.3, depthWrite: false });
    if (scene.kind === 'slab') {
      const geo = new THREE.BoxGeometry(1, 1.6, 1.6);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: c.slabEdge }));
      // beam direction arrow
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1.3, 0, 0), 0.7, c.muted, 0.12, 0.07);
      s.slab.add(new THREE.Mesh(geo, fill), edges, arrow);
    } else {
      const geo = new THREE.SphereGeometry(1, 32, 16);
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 8)),
        new THREE.LineBasicMaterial({ color: c.slabEdge, transparent: true, opacity: 0.35 }),
      );
      s.slab.add(new THREE.Mesh(geo, fill), wire);
    }
  }, [c, scene]);

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
    const { map, exitLength: L } = sceneMapping(scene);

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
        pts.push(map({ x: last.x + L * tr.exitDir.x, y: last.y + L * tr.exitDir.y, z: last.z + L * tr.exitDir.z }));
      }
      for (let i = 1; i < pts.length; i++) {
        linePos.push(...pts[i - 1], ...pts[i]);
        lineCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
      for (const cl of tr.collisions) {
        ptPos.push(...map(cl.pos));
        col.set(sim.markerColor(cl.kind, c));
        ptCol.push(col.r, col.g, col.b);
      }
    };
    for (const tr of engine.tracks) add(tr, sim.trackStyle(tr, c).color);
    const cur = engine.currentTrack;
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
  }, [version, scene, c, showCurrent, engine, sim]);

  return <div ref={box} className="view3d" aria-label="3D view of particle tracks" />;
}
