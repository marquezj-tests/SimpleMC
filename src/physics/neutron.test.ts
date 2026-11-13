import { describe, expect, it } from 'vitest';
import U235 from '../data/neutron/U235.json';
import U238 from '../data/neutron/U238.json';
import reference from '../data/neutron/reference.json';
import { godivaExample, buildGodiva } from '../examples/godiva';
import { NREACTIONS, Nuclide, sampleSab, sabWeights, sixFactors, type NuclideTable, type SabTable } from './neutron';

const data = { U235: new Nuclide(U235 as NuclideTable), U238: new Nuclide(U238 as NuclideTable) };
const godiva = (over: Record<string, number | string> = {}, seed = 1) =>
  buildGodiva({ ...godivaExample.defaults, ...over }, seed, data);

describe('neutron data', () => {
  it('partial cross sections add up to the total', () => {
    for (const n of [data.U235, data.U238])
      for (const E of [1e-8, 1e-3, 0.5, 2, 14]) {
        const x = n.xs(E);
        const sum = NREACTIONS.reduce((s, r) => s + x[r], 0);
        expect(sum).toBeCloseTo(x.total, 6);
        expect(x.nu).toBeGreaterThan(2);
      }
  });
  it('elastic scattering of uranium is forward-peaked at MeV energies', () => {
    let s = 0;
    for (let i = 0; i < 1000; i++) s += data.U235.elasticMuCm(1, (i + 0.5) / 1000);
    expect(s / 1000).toBeGreaterThan(0.4);
  });
});

describe('power iteration', () => {
  it('Godiva keff agrees with OpenMC within 3% (simplified physics, evaluated elastic)', () => {
    const pi = godiva({ neutronsPerCycle: 2000, inactive: 5, active: 20 });
    while (!pi.isDone) pi.finishHistory();
    const k = pi.kSourceEstimate()!;
    expect(Math.abs(k.mean - reference.keff)).toBeLessThan(0.03);
  });

  it('the six factors multiply to the absorption estimate of k', () => {
    const pi = godiva({ neutronsPerCycle: 500, inactive: 2, active: 6, cutoff: 1e5 });
    while (!pi.isDone) pi.finishHistory();
    const t = pi.sixTotal;
    const f = sixFactors(t);
    expect(Number.isFinite(f.k)).toBe(true);
    expect(f.k).toBeCloseTo((t.nuFast + t.nuThermal) / t.N, 10);
    // and both k estimators agree statistically
    const ks = pi.kSourceEstimate()!;
    expect(Math.abs(f.k - ks.mean)).toBeLessThan(0.05);
  });

  it('with the classic 0.625 eV cutoff the thermal factors of Godiva are undefined', () => {
    const pi = godiva({ neutronsPerCycle: 300, inactive: 1, active: 3 });
    while (!pi.isDone) pi.finishHistory();
    const f = sixFactors(pi.sixTotal);
    expect(Number.isNaN(f.eta)).toBe(true);
  });

  it('a uniform initial source starts spread over the sphere', () => {
    const pi = godiva({ initialSource: 'uniform' });
    const h = pi.sourceHistograms[0];
    expect(h.filter((v) => v > 0.7 && v < 1.3).length).toBeGreaterThan(17);
    const pt = godiva({ initialSource: 'point' });
    expect(pt.sourceHistograms[0][0]).toBeCloseTo(20, 6); // every site in the innermost shell
  });

  it('redoing a step with the original ξ reproduces the run', () => {
    const ref = godiva({ neutronsPerCycle: 50 }, 7);
    const refRecs = Array.from({ length: 300 }, () => ref.step());
    const pi = godiva({ neutronsPerCycle: 50 }, 7);
    const recs = [];
    for (let i = 0; i < 300; i++) {
      if (pi.nextXiCount > 0 && i % 7 === 3) {
        const before = pi.saveState();
        const orig = pi.step();
        pi.redoStep(before, [0.123]);
        const again = pi.redoStep(before, orig.xi.map((x) => x.xi));
        recs.push({ ...again, xi: again.xi.map((x) => ({ ...x, manual: false })) });
      } else recs.push(pi.step());
    }
    expect(recs).toEqual(refRecs);
  });
});

const load = async () => {
  const [h, o, sab] = await Promise.all([
    import('../data/neutron/H1.json'),
    import('../data/neutron/O16.json'),
    import('../data/neutron/HinH2O.json'),
  ]);
  return {
    H1: new Nuclide(h.default as NuclideTable),
    H1inH2O: new Nuclide(h.default as NuclideTable, sab.default as SabTable),
    O16: new Nuclide(o.default as NuclideTable),
  };
};

describe('water sphere, fixed source', () => {

  it('free gas gives a thermal peak near 2kT; every neutron leaks or is absorbed', async () => {
    const { buildWater, KT_WATER, waterExample } = await import('../examples/water');
    const data = await load();
    const pi = buildWater({ ...waterExample.defaults, thermal: 'freeGas', histories: 1500 }, 3, data);
    while (!pi.isDone) pi.finishHistory();
    expect(pi.spectrumSources).toBe(1500);
    expect(pi.counts.leaked + pi.counts.captured).toBe(1500);
    const b = pi.bins;
    let best = -1;
    let Epk = 0;
    pi.spectrum.forEach((v, i) => {
      const y = v / Math.log(b[i + 1] / b[i]);
      const E = Math.sqrt(b[i] * b[i + 1]);
      if (E < 1e-6 && y > best) {
        best = y;
        Epk = E;
      }
    });
    expect(Epk / (2 * KT_WATER)).toBeGreaterThan(0.6);
    expect(Epk / (2 * KT_WATER)).toBeLessThan(1.6);
  });

  it('redoing steps (including free-gas steps) with the original ξ reproduces the run', async () => {
    const { buildWater, waterExample } = await import('../examples/water');
    const data = await load();
    const v = { ...waterExample.defaults, histories: 5, energy: 1e-6 };
    const ref = buildWater(v, 11, data);
    const refRecs = Array.from({ length: 400 }, () => ref.step());
    expect(refRecs.some((r) => r.kind === 'target')).toBe(true);
    const pi = buildWater(v, 11, data);
    const recs = [];
    for (let i = 0; i < 400; i++) {
      if (pi.nextXiCount > 0 && i % 3 === 1) {
        const before = pi.saveState();
        const orig = pi.step();
        pi.redoStep(before, [0.77]);
        const again = pi.redoStep(before, orig.xi.map((x) => x.xi));
        recs.push({ ...again, xi: again.xi.map((x) => ({ ...x, manual: false })) });
      } else recs.push(pi.step());
    }
    expect(recs).toEqual(refRecs);
  });
});

describe('S(α,β) for H in H2O (ACE discrete form)', () => {
  const loadSab = async () => (await import('../data/neutron/HinH2O.json')).default as SabTable;

  it('skewed outgoing-energy bins have weights 0.1, 0.4, 1, …, 1, 0.4, 0.1', () => {
    const w = sabWeights(64, true);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(w[0] / w[10]).toBeCloseTo(0.1, 12);
    expect(w[1] / w[10]).toBeCloseTo(0.4, 12);
    expect(w[63]).toBe(w[0]);
  });

  it('sampling reproduces the discrete conditional probabilities', async () => {
    const sab = await loadSab();
    const E = 0.0253e-6;
    let mean = 0;
    let expected = 0;
    const n = 20000;
    for (let q = 0; q < n; q++) mean += sampleSab(sab, E, (q + 0.5) / n, 0.5).Enew / n;
    const s = sampleSab(sab, E, 0.5, 0.5);
    s.eOut.forEach((e, j) => (expected += e * s.weights[j]));
    expect(mean / expected).toBeCloseTo(1, 3);
    // cosines are equiprobable: 16 bins
    expect(sampleSab(sab, E, 0.5, 0.999).k).toBe(15);
    expect(sampleSab(sab, E, 0.5, 0.001).k).toBe(0);
  });

  it('bound hydrogen replaces elastic scattering below 4.46 eV only', async () => {
    const sab = await loadSab();
    const H = new Nuclide(U235 as NuclideTable, null); // any nuclide without table
    expect(H.xs(1e-8).thermal).toBe(0);
    const h1 = (await import('../data/neutron/H1.json')).default as NuclideTable;
    const bound = new Nuclide(h1, sab);
    expect(bound.xs(1e-8).elastic).toBe(0);
    expect(bound.xs(1e-8).thermal).toBeGreaterThan(20);
    expect(bound.xs(1e-5).thermal).toBe(0);
    expect(bound.xs(1e-5).elastic).toBeGreaterThan(10);
  });

  it('water sphere leakage agrees with OpenMC (S(α,β): 0.180)', async () => {
    const { buildWater, waterExample } = await import('../examples/water');
    const data = await load();
    const pi = buildWater({ ...waterExample.defaults, histories: 2000 }, 9, data);
    while (!pi.isDone) pi.finishHistory();
    const p = pi.counts.leaked / 2000;
    expect(Math.abs(p - 0.18)).toBeLessThan(4 * Math.sqrt((0.18 * 0.82) / 2000));
  });
});
