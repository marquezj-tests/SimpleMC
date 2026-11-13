import { Slab } from '../physics/geometry';
import { SlabTransmissionTally } from '../physics/tally';
import type { Dict } from '../i18n';
import { Transport, type Problem, type Source, type StepRecord } from '../physics/transport';
import { MATERIALS, materialById } from '../data/materials';
import type { Example, ParamValues, Simulation } from './types';
import { slabStepContent } from './slabSteps';
import type { Track } from '../physics/engine';
import type { Colors } from '../ui/colors';
import { fmtE } from '../ui/format';

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

/** Build the physics problem (also used by the tests). */
export function buildSlabProblem(v: ParamValues): Problem {
  const thickness = Number(v.thickness);
  return {
    geometry: new Slab(thickness),
    material: materialById(String(v.material)),
    source: new ParallelBeam(Number(v.energy), thickness * 1.2),
    cutoff: Number(v.cutoff),
    tally: new SlabTransmissionTally(),
  };
}

function trackColor(tr: Track, c: Colors): string {
  if (tr.fate === 'transmitted') return tr.uncollided && tr.primary ? c.track.uncollided : c.track.scattered;
  if (tr.fate === 'reflected') return c.track.reflected;
  return c.track.absorbed;
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
      key: 'histories',
      type: 'number',
      label: { en: 'Histories to run', es: 'Historias a simular' },
      min: 1,
      max: 10_000_000,
      step: 1000,
      integer: true,
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
  about: {
    en: [
      'Each photon history is a random walk: sample a flight distance from the exponential law, move, sample the reaction from the partial cross sections, sample new energy and direction, and repeat until the photon is absorbed or escapes.',
      'Cross sections: NIST XCOM (Berger et al., NIST Standard Reference Database 8), 10 keV – 20 MeV, log–log interpolation. Incoherent scattering uses Klein–Nishina (free electrons), coherent scattering uses the Thomson shape, photoelectric absorption is local, and pair production deposits the kinetic energy locally and emits two 511 keV photons.',
      'Transmission T is the number of photons leaving through the back face per source photon. Its uncertainty is the standard error of the mean over histories.'
    ],
    es: [
      'Cada historia de un fotón es un camino aleatorio: se muestrea la distancia de vuelo con la ley exponencial, se mueve el fotón, se muestrea la reacción a partir de las secciones eficaces parciales, se muestrean la nueva energía y dirección, y se repite hasta que el fotón es absorbido o escapa.',
      'Secciones eficaces: NIST XCOM (Berger et al., NIST Standard Reference Database 8), de 10 keV a 20 MeV, interpolación log–log. La dispersión incoherente usa Klein–Nishina (electrones libres), la coherente usa la forma de Thomson, la absorción fotoeléctrica es local, y la producción de pares deposita localmente la energía cinética y emite dos fotones de 511 keV.',
      'La transmisión T es el número de fotones que salen por la cara posterior por cada fotón de la fuente. Su incertidumbre es el error estándar de la media sobre las historias.'
    ],
  },
  defaults: { material: 'Pb', energy: 0.662, thickness: 1, histories: 10000, cutoff: 0.01 },
  validate(v, t: Dict) {
    if (Number(v.cutoff) >= Number(v.energy)) return t.cutoffTooHigh;
    return null;
  },
  create(v, seed): Simulation {
    const problem = buildSlabProblem(v);
    const engine = new Transport(problem, seed);
    const tally = problem.tally as SlabTransmissionTally;
    const thickness = Number(v.thickness);
    const E = Number(v.energy);
    const target = Number(v.histories);
    const sourceWidth = thickness * 1.2;
    return {
      engine,
      scene: {
        kind: 'slab',
        thickness,
        label: {
          en: `${problem.material.name.en} · t = ${thickness} cm`,
          es: `${problem.material.name.es} · t = ${thickness} cm`,
        },
        beamLabel: { en: `beam ${fmtE(E)}`, es: `haz ${fmtE(E)}` },
      },
      isDone: () => engine.atHistoryStart && tally.histories >= target,
      resultsNote: (t) => `T: ${t.perSource}`,
      results(t, c) {
        const mut = problem.material.mu(E) * thickness;
        const analytic = Math.exp(-mut);
        const B = tally.histories > 0 ? tally.total.mean / analytic : NaN;
        // uncertainty of B from that of T (the analytic value has no MC error)
        const sB = tally.histories > 0 ? tally.total.sigma / analytic : undefined;
        return [
          { label: t.historiesDone, value: tally.histories },
          { label: t.transmittedTotal, value: tally.total.mean, sigma: tally.total.sigma, main: true },
          { label: t.transmittedUnc, value: tally.uncollided.mean, sigma: tally.uncollided.sigma, color: c.track.uncollided },
          { label: t.transmittedSc, value: tally.scattered.mean, sigma: tally.scattered.sigma, color: c.track.scattered },
          { label: t.reflected, value: tally.reflected.mean, sigma: tally.reflected.sigma, color: c.track.reflected },
          { label: t.analyticUnc, value: analytic },
          { label: t.mfpThickness, value: mut },
          { label: t.buildup, value: B, sigma: sB },
        ];
      },
      trackStyle: (tr, c) => ({ color: trackColor(tr, c), dashed: !tr.primary }),
      markerColor: (kind, c) => c.reaction[kind as keyof typeof c.reaction] ?? c.muted,
      legend: (t, c) => ({
        lines: [
          { color: c.track.uncollided, label: t.legendUncollided },
          { color: c.track.scattered, label: t.legendScattered },
          { color: c.track.reflected, label: t.legendReflected },
          { color: c.track.absorbed, label: t.legendAbsorbed },
          { color: c.ink2, label: t.legendAnnihilation, dashed: true },
          { color: c.current, label: t.legendCurrent },
        ],
        markers: (['photoelectric', 'incoherent', 'coherent', 'pairNuclear', 'pairElectron', 'cutoff'] as const).map((r) => ({
          color: c.reaction[r],
          label: t.reactions[r],
        })),
      }),
      stepContent: (rec, t, _lang, c) =>
        slabStepContent(rec as StepRecord | null, problem.material, sourceWidth, t, c),
    };
  },
};
