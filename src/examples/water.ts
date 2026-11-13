import { createElement } from 'react';
import { Nuclide, PowerIteration, logBins, type NStepRecord, type NuclideTable, type SabTable } from '../physics/neutron';
import type { Dict } from '../i18n';
import { GODIVA_TEXT } from './godivaText';
import { godivaStepContent } from './godivaSteps';
import { WaterPanels } from './WaterPanels';
import { WATER_TEXT } from './waterText';
import type { Example, ParamValues, Simulation } from './types';

/** kT at 293.6 K, the temperature of the data (MeV). */
export const KT_WATER = 8.617333e-11 * 293.6;

export interface WaterData {
  H1: Nuclide;
  /** H-1 with the S(α,β) table of hydrogen bound in water */
  H1inH2O: Nuclide;
  O16: Nuclide;
}

let nuclides: WaterData | null = null;
async function loadNuclides() {
  if (nuclides) return;
  const [h, o, sab] = await Promise.all([
    import('../data/neutron/H1.json'),
    import('../data/neutron/O16.json'),
    import('../data/neutron/HinH2O.json'),
  ]);
  nuclides = {
    H1: new Nuclide(h.default as NuclideTable),
    H1inH2O: new Nuclide(h.default as NuclideTable, sab.default as SabTable),
    O16: new Nuclide(o.default as NuclideTable),
  };
}

/** Build the fixed-source engine (also used by the tests). */
export function buildWater(v: ParamValues, seed: number, data: WaterData | null = nuclides): PowerIteration {
  if (!data) throw new Error('nuclear data not loaded');
  const NA = 0.602214076; // Avogadro / 1e24
  const Nmol = (1.0 * NA) / 18.0153; // water molecules per barn·cm at 1 g/cm³
  return new PowerIteration(
    {
      radius: Number(v.radius),
      components: [
        { nuclide: v.thermal === 'sab' ? data.H1inH2O : data.H1, N: 2 * Nmol },
        { nuclide: data.O16, N: Nmol },
      ],
      neutronsPerCycle: Number(v.histories),
      inactive: 0,
      active: 1,
      initialSource: 'point',
      cutoff: 0.625e-6,
      elastic: v.elastic as 'isotropic' | 'tabulated',
      source: { kind: 'mono', E: Number(v.energy) },
      // free gas for oxygen (and for hydrogen above the S(α,β) table)
      freeGas: v.thermal !== 'atRest' ? { kT: KT_WATER } : undefined,
      spectrumBins: logBins(1e-11, 20, 124),
    },
    seed,
  );
}

const en = WATER_TEXT.en;
const es = WATER_TEXT.es;
const L = (pick: (t: typeof en) => string) => ({ en: pick(en), es: pick(es) });

export const waterExample: Example = {
  id: 'water',
  title: L((t) => t.title),
  description: L((t) => t.description),
  about: { en: en.about, es: es.about },
  params: [
    {
      key: 'radius',
      type: 'number',
      label: L((t) => t.params.radius),
      unit: 'cm',
      min: 0.5,
      max: 200,
      step: 1,
      presets: [5, 10, 20, 50].map((r) => ({ label: `${r} cm`, value: r })),
    },
    {
      key: 'energy',
      type: 'number',
      label: L((t) => t.params.energy),
      unit: 'MeV',
      min: 1e-6,
      max: 20,
      step: 0.1,
      presets: [
        { label: 'D-T (14.1 MeV)', value: 14.1 },
        { label: 'D-D (2.45 MeV)', value: 2.45 },
        { label: 'Fission-like (2 MeV)', value: 2 },
        { label: '1 keV', value: 1e-3 },
      ],
    },
    { key: 'histories', type: 'number', label: L((t) => t.params.histories), min: 1, max: 10_000_000, step: 1000, integer: true },
    {
      key: 'thermal',
      type: 'select',
      label: L((t) => t.params.thermal),
      options: [
        { value: 'sab', label: L((t) => t.params.sab) },
        { value: 'freeGas', label: L((t) => t.params.freeGas) },
        { value: 'atRest', label: L((t) => t.params.atRest) },
      ],
    },
    {
      key: 'elastic',
      type: 'select',
      label: L((t) => t.params.elastic),
      options: [
        { value: 'tabulated', label: L((t) => t.params.tabulated) },
        { value: 'isotropic', label: L((t) => t.params.isotropic) },
      ],
    },
  ],
  defaults: { radius: 20, energy: 2, histories: 2000, thermal: 'sab', elastic: 'tabulated' },
  load: loadNuclides,
  create(v, seed): Simulation {
    const engine = buildWater(v, seed);
    const radius = Number(v.radius);
    const kT = v.thermal !== 'atRest' ? KT_WATER : null;
    const Panels = ({ version }: { version: number }) => createElement(WaterPanels, { engine, kT, version });
    const frac = (k: number) => {
      const n = engine.spectrumSources;
      const p = n > 0 ? k / n : NaN;
      return { value: p, sigma: n > 1 ? Math.sqrt((p * (1 - p)) / n) : undefined };
    };
    return {
      engine,
      scene: { kind: 'sphere', radius, label: L((t) => t.sceneLabel(radius)) },
      isDone: () => engine.isDone,
      resultsNote: (t: Dict) => WATER_TEXT[t.lang].resultsNote,
      results(t, c) {
        const T = WATER_TEXT[t.lang];
        const n = engine.spectrumSources;
        return [
          { label: t.historiesDone, value: n },
          { label: T.leaked, ...frac(engine.counts.leaked), main: true, fixed: 4, color: c.ntrack.leaked },
          { label: T.absorbed, ...frac(engine.counts.captured), fixed: 4, color: c.ntrack.captured },
          { label: T.collisions, value: n > 0 ? engine.counts.collisions / n : NaN, fixed: 1 },
        ];
      },
      trackStyle: (tr, c) => ({ color: c.ntrack[tr.fate ?? 'leaked'] ?? c.muted, dashed: !tr.primary }),
      markerColor: (kind, c) => c.reaction[kind] ?? c.muted,
      legend: (t, c) => {
        const G = GODIVA_TEXT[t.lang];
        return {
          lines: [
            { color: c.ntrack.leaked, label: G.legendLeaked },
            { color: c.ntrack.captured, label: G.legendCaptured },
            { color: c.current, label: G.legendCurrent },
          ],
          markers: (['elastic', 'thermal', 'inelastic', 'capture'] as const).map((r) => ({ color: c.reaction[r], label: G.reactions[r] })),
        };
      },
      stepContent: (rec, _t, lang, c) => godivaStepContent(rec as NStepRecord | null, engine, lang, c),
      Panels,
    };
  },
};
