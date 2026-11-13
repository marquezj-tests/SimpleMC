import { Slab } from '../physics/geometry';
import { SlabTransmissionTally } from '../physics/tally';
import type { Dict } from '../i18n';
import type { Source } from '../physics/transport';
import { MATERIALS, materialById } from '../data/materials';
import type { Example } from './types';

/**
 * Parallel beam hitting the front face of the slab at normal incidence.
 * The slab is infinite in x and y, so the entry point does not change the
 * physics; it is spread over `width` only so that the tracks do not overlap
 * in the drawing.
 */
export class ParallelBeam implements Source {
  constructor(
    readonly E: number,
    readonly width: number,
  ) {}
  sample(rng: { next(): number }) {
    const x = (rng.next() - 0.5) * this.width;
    return { pos: { x, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, E: this.E };
  }
}

export const slabExample: Example = {
  id: 'slab',
  title: { en: 'Slab shield, parallel beam', es: 'Blindaje plano, haz paralelo' },
  description: {
    en: 'A parallel beam of monoenergetic photons hits a slab at normal incidence. We estimate the fraction of photons transmitted through the back face, separating uncollided and scattered photons.',
    es: 'Un haz paralelo de fotones monoenergéticos incide normalmente sobre una placa. Se estima la fracción de fotones transmitidos por la cara posterior, separando los no colisionados de los dispersados.',
  },
  params: [
    {
      key: 'material',
      type: 'select',
      label: { en: 'Material', es: 'Material' },
      options: MATERIALS.map((m) => ({ value: m.id, label: m.name })),
    },
    {
      key: 'energy',
      type: 'number',
      label: { en: 'Photon energy', es: 'Energía del fotón' },
      unit: 'MeV',
      min: 0.01,
      max: 20,
      step: 0.001,
      presets: [
        { label: 'Am-241 (59.5 keV)', value: 0.0595 },
        { label: 'Cs-137 (662 keV)', value: 0.662 },
        { label: 'Co-60 (1.173 MeV)', value: 1.173 },
        { label: 'Co-60 (1.332 MeV)', value: 1.332 },
        { label: 'N-16 (6.13 MeV)', value: 6.129 },
      ],
    },
    {
      key: 'thickness',
      type: 'number',
      label: { en: 'Slab thickness', es: 'Espesor de la placa' },
      unit: 'cm',
      min: 0.001,
      max: 500,
      step: 0.1,
    },
    {
      key: 'cutoff',
      type: 'number',
      label: { en: 'Energy cutoff', es: 'Energía de corte' },
      unit: 'MeV',
      min: 0.01,
      max: 20,
      step: 0.001,
    },
  ],
  defaults: { material: 'Pb', energy: 0.662, thickness: 1, cutoff: 0.01 },
  build(v) {
    const thickness = Number(v.thickness);
    return {
      geometry: new Slab(thickness),
      material: materialById(String(v.material)),
      source: new ParallelBeam(Number(v.energy), thickness * 1.2),
      cutoff: Number(v.cutoff),
      tally: new SlabTransmissionTally(),
    };
  },
  validate(v, t: Dict) {
    if (Number(v.cutoff) >= Number(v.energy)) return t.cutoffTooHigh;
    return null;
  },
  results(problem, v, t) {
    const tally = problem.tally as SlabTransmissionTally;
    const E = Number(v.energy);
    const mut = problem.material.mu(E) * Number(v.thickness);
    const analytic = Math.exp(-mut);
    const B = tally.histories > 0 ? tally.total.mean / analytic : NaN;
    // uncertainty of B from that of T (the analytic value has no MC error)
    const sB = tally.histories > 0 ? tally.total.sigma / analytic : undefined;
    return [
      { label: t.historiesDone, value: tally.histories },
      { label: t.transmittedTotal, value: tally.total.mean, sigma: tally.total.sigma, main: true },
      { label: t.transmittedUnc, value: tally.uncollided.mean, sigma: tally.uncollided.sigma, color: 'uncollided' },
      { label: t.transmittedSc, value: tally.scattered.mean, sigma: tally.scattered.sigma, color: 'scattered' },
      { label: t.reflected, value: tally.reflected.mean, sigma: tally.reflected.sigma, color: 'reflected' },
      { label: t.analyticUnc, value: analytic },
      { label: t.mfpThickness, value: mut },
      { label: t.buildup, value: B, sigma: sB },
    ];
  },
};
