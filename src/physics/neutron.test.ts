import { describe, expect, it } from 'vitest';
import U235 from '../data/neutron/U235.json';
import U238 from '../data/neutron/U238.json';
import reference from '../data/neutron/reference.json';
import { godivaExample, buildGodiva } from '../examples/godiva';
import { NREACTIONS, Nuclide, sixFactors, type NuclideTable } from './neutron';

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
