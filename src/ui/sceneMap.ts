import type { Scene } from '../examples/types';
import type { Vec3 } from '../physics/sampling';

/**
 * Normalised 3D coordinates used by both 3D views: lengths are divided by
 * the slab thickness or the sphere radius. Screen axes: depth z → X
 * (left to right), x → Y (up), y → Z.
 */
export function sceneMapping(scene: Scene) {
  if (scene.kind === 'slab') {
    const T = scene.thickness;
    return {
      map: (p: Vec3): [number, number, number] => [p.z / T - 0.5, p.x / T, p.y / T],
      exitLength: 1.2 * T,
    };
  }
  const R = scene.radius;
  return {
    map: (p: Vec3): [number, number, number] => [p.z / R, p.x / R, p.y / R],
    exitLength: 0.5 * R,
  };
}
