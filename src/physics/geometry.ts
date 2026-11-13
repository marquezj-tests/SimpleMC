import type { Vec3 } from './sampling';

/** A single homogeneous region surrounded by vacuum. */
export interface Geometry {
  /** Distance along d from p to the region boundary, and the surface hit. */
  distanceToBoundary(p: Vec3, d: Vec3): { distance: number; surface: string };
}

/**
 * Infinite slab 0 <= z <= thickness. Photons travel along +z when they enter
 * through the front face (z = 0) and are transmitted when they leave through
 * the back face (z = thickness).
 */
export class Slab implements Geometry {
  constructor(readonly thickness: number) {}

  distanceToBoundary(p: Vec3, d: Vec3) {
    if (d.z > 0) return { distance: (this.thickness - p.z) / d.z, surface: 'back' };
    if (d.z < 0) return { distance: -p.z / d.z, surface: 'front' };
    return { distance: Infinity, surface: 'none' };
  }
}
