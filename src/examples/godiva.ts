import { createElement } from 'react';
import {
  Nuclide,
  PowerIteration,
  uraniumDensities,
  type InitialSource,
  type NStepRecord,
  type NuclideTable,
} from '../physics/neutron';
import type { Dict } from '../i18n';
import { fmtE } from '../ui/format';
import reference from '../data/neutron/reference.json';
import { GodivaPanels } from './GodivaPanels';
import { godivaStepContent } from './godivaSteps';
import { GODIVA_TEXT } from './godivaText';
import type { Example, ParamValues, Simulation } from './types';

// Nuclear data are loaded on first use (≈2 MB of JSON).
let nuclides: { U235: Nuclide; U238: Nuclide } | null = null;
async function loadNuclides() {
  if (nuclides) return;
  const [a, b] = await Promise.all([import('../data/neutron/U235.json'), import('../data/neutron/U238.json')]);
  nuclides = { U235: new Nuclide(a.default as NuclideTable), U238: new Nuclide(b.default as NuclideTable) };
}

/** Build the power-iteration engine (also used by the tests, after loading the data). */
export function buildGodiva(v: ParamValues, seed: number, data = nuclides): PowerIteration {
  if (!data) throw new Error('nuclear data not loaded');
  const w = Number(v.enrichment) / 100;
  const { N235, N238 } = uraniumDensities(Number(v.density), w, data.U235.awr, data.U238.awr);
  return new PowerIteration(
    {
      radius: Number(v.radius),
      components: [
        { nuclide: data.U235, N: N235 },
        { nuclide: data.U238, N: N238 },
      ],
      neutronsPerCycle: Number(v.neutronsPerCycle),
      inactive: Number(v.inactive),
      active: Number(v.active),
      initialSource: v.initialSource as InitialSource,
      cutoff: Number(v.cutoff) * 1e-6, // eV → MeV
      elastic: v.elastic as 'isotropic' | 'tabulated',
    },
    seed,
  );
}

const en = GODIVA_TEXT.en;
const es = GODIVA_TEXT.es;
const L = (pick: (t: typeof en) => string) => ({ en: pick(en), es: pick(es) });

export const godivaExample: Example = {
  id: 'godiva',
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
      max: 100,
      step: 0.1,
      presets: [{ label: 'Godiva (8.7407 cm)', value: 8.7407 }],
    },
    { key: 'density', type: 'number', label: L((t) => t.params.density), unit: 'g/cm³', min: 1, max: 25, step: 0.01 },
    {
      key: 'enrichment',
      type: 'number',
      label: L((t) => t.params.enrichment),
      unit: 'wt%',
      min: 0,
      max: 100,
      step: 0.1,
      presets: [
        { label: 'Godiva (93.71%)', value: 93.71 },
        { label: '20% (LEU limit)', value: 20 },
        { label: '3.5% (LWR fuel)', value: 3.5 },
      ],
    },
    {
      key: 'initialSource',
      type: 'select',
      label: L((t) => t.params.initialSource),
      options: [
        { value: 'point', label: L((t) => t.params.point) },
        { value: 'uniform', label: L((t) => t.params.uniform) },
      ],
    },
    { key: 'neutronsPerCycle', type: 'number', label: L((t) => t.params.neutronsPerCycle), min: 1, max: 1_000_000, step: 100, integer: true },
    { key: 'inactive', type: 'number', label: L((t) => t.params.inactive), min: 0, max: 10_000, step: 1, integer: true },
    { key: 'active', type: 'number', label: L((t) => t.params.active), min: 1, max: 100_000, step: 1, integer: true },
    {
      key: 'cutoff',
      type: 'number',
      label: L((t) => t.params.cutoff),
      unit: 'eV',
      min: 1e-5,
      max: 2e7,
      presets: [
        { label: '0.625 eV (classic)', value: 0.625 },
        { label: '1 keV', value: 1e3 },
        { label: '100 keV', value: 1e5 },
        { label: '1 MeV', value: 1e6 },
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
  defaults: {
    radius: 8.7407,
    density: 18.74,
    enrichment: 93.71,
    initialSource: 'point',
    neutronsPerCycle: 1000,
    inactive: 10,
    active: 40,
    cutoff: 0.625,
    elastic: 'tabulated',
  },
  load: loadNuclides,
  create(v, seed): Simulation {
    const engine = buildGodiva(v, seed);
    const radius = Number(v.radius);
    const Panels = ({ version }: { version: number }) => createElement(GodivaPanels, { engine, reference: reference.keff, version });
    return {
      engine,
      scene: {
        kind: 'sphere',
        radius,
        label: L((t) => t.sceneLabel(radius, Number(v.enrichment))),
      },
      isDone: () => engine.isDone,
      resultsNote: (t: Dict) => GODIVA_TEXT[t.lang].resultsNote,
      results(t, c) {
        const T = GODIVA_TEXT[t.lang];
        const ks = engine.kSourceEstimate();
        const six = engine.kSixEstimate();
        const f = six.factors;
        const ec = fmtE(engine.problem.cutoff);
        return [
          {
            label: T.cycle,
            value: NaN,
            text: engine.isDone ? T.finished : T.cycleOf(engine.cycle, engine.totalCycles, !engine.isActive),
          },
          { label: t.historiesDone, value: engine.history },
          { label: T.kSource, value: ks?.mean ?? NaN, sigma: ks?.sigma, main: true, fixed: 5, heading: T.keffHeading, color: c.track.uncollided },
          {
            label: T.kSix,
            value: f.k,
            sigma: six.sigma,
            fixed: 5,
            color: c.reaction.inelastic,
            text: six.n > 0 && !Number.isFinite(f.k) ? T.kSixUndefined : undefined,
          },
          { label: T.kRef, value: reference.keff, sigma: reference.sigma, fixed: 5 },
          { label: T.kBench, value: reference.benchmark.keff, sigma: reference.benchmark.sigma, fixed: 3 },
          { label: T.factors.epsilon, value: f.epsilon, fixed: 4, heading: T.sixHeading(ec) },
          { label: T.factors.p, value: f.p, fixed: 4 },
          { label: T.factors.PFNL, value: f.PFNL, fixed: 4 },
          { label: T.factors.f, value: f.f, fixed: 4 },
          { label: T.factors.eta, value: f.eta, fixed: 4 },
          { label: T.factors.PTNL, value: f.PTNL, fixed: 4 },
          { label: T.factors.k, value: f.k, fixed: 5 },
        ];
      },
      trackStyle: (tr, c) => ({ color: c.ntrack[tr.fate ?? 'leaked'] ?? c.muted, dashed: !tr.primary }),
      markerColor: (kind, c) => c.reaction[kind] ?? c.muted,
      legend: (t, c) => {
        const T = GODIVA_TEXT[t.lang];
        return {
          lines: [
            { color: c.ntrack.leaked, label: T.legendLeaked },
            { color: c.ntrack.fission, label: T.legendFission },
            { color: c.ntrack.captured, label: T.legendCaptured },
            { color: c.ntrack.nxn, label: T.legendNxn },
            { color: c.ink2, label: T.legendSecondary, dashed: true },
            { color: c.current, label: T.legendCurrent },
          ],
          markers: (['elastic', 'inelastic', 'n2n', 'n3n', 'fission', 'capture'] as const).map((r) => ({
            color: c.reaction[r],
            label: T.reactions[r],
          })),
        };
      },
      stepContent: (rec, _t, lang, c) => godivaStepContent(rec as NStepRecord | null, engine, lang, c),
      Panels,
      extraControls: [{ label: (t) => GODIVA_TEXT[t.lang].nextCycle, run: () => engine.finishCycle() }],
    };
  },
};
