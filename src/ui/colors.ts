import { useEffect, useState } from 'react';
import type { CollisionKind } from '../physics/transport';

/**
 * Colour roles. Reaction colours follow a fixed categorical order (validated
 * for colour-vision deficiencies); track colours use the remaining slots.
 * Dark mode uses the same hues stepped for a dark surface.
 */
const light = {
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#8a8984',
  grid: '#e4e3df',
  slab: '#d9d7cf',
  slabEdge: '#8a8984',
  reaction: {
    photoelectric: '#2a78d6',
    incoherent: '#eb6834',
    coherent: '#1baf7a',
    pairNuclear: '#eda100',
    pairElectron: '#e87ba4',
    cutoff: '#52514e',
  } as Record<CollisionKind, string>,
  track: { uncollided: '#6250d6', scattered: '#008300', reflected: '#e34948', absorbed: '#8a8984' },
  current: '#0b0b0b',
};

const dark: typeof light = {
  surface: '#1a1a19',
  ink: '#f0efec',
  ink2: '#c3c2b7',
  muted: '#8f8e86',
  grid: '#2e2e2c',
  slab: '#3a3936',
  slabEdge: '#8f8e86',
  reaction: {
    photoelectric: '#3987e5',
    incoherent: '#d95926',
    coherent: '#199e70',
    pairNuclear: '#c98500',
    pairElectron: '#d55181',
    cutoff: '#c3c2b7',
  },
  track: { uncollided: '#9085e9', scattered: '#2fa52f', reflected: '#e66767', absorbed: '#8f8e86' },
  current: '#f0efec',
};

export type Colors = typeof light;

const query = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function useColors(): Colors {
  const [isDark, setDark] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const q = query();
    if (!q) return;
    const f = () => setDark(q.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);
  return isDark ? dark : light;
}
