import { describe, expect, it } from 'vitest';
import { materialById } from '../data/materials';
import { buildSlabProblem } from '../examples/slab';
import { Transport } from './transport';
import { SlabTransmissionTally } from './tally';
import { invertCdf, kleinNishina, kleinNishinaCdf, rotate } from './sampling';
import { RNG } from './rng';

describe('XCOM data', () => {
  it('interpolates lead at a tabulated energy', () => {
    const pb = materialById('Pb');
    // XCOM: Pb at 1 MeV, total with coherent = 7.102E-02 cm2/g
    expect(pb.massTotal(1)).toBeCloseTo(0.07102, 4);
  });
  it('honours the K edge of lead', () => {
    const pb = materialById('Pb');
    expect(pb.massPartials(0.0879).photoelectric).toBeLessThan(2);
    expect(pb.massPartials(0.088).photoelectric).toBeGreaterThan(7);
  });
  it('has no pair production below threshold', () => {
    const fe = materialById('Fe');
    expect(fe.massPartials(1.0).pairNuclear).toBe(0);
    expect(fe.massPartials(5).pairNuclear).toBeGreaterThan(0);
  });
});

describe('sampling', () => {
  it('Klein–Nishina CDF reproduces the mean cos θ', () => {
    const E = 0.662;
    // reference by direct quadrature of the pdf
    let num = 0;
    let den = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const mu = -1 + (2 * (i + 0.5)) / n;
      const f = kleinNishina(E, mu);
      num += mu * f;
      den += f;
    }
    const cdf = kleinNishinaCdf(E);
    const rng = new RNG(1);
    let s = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) s += invertCdf(cdf, rng.next());
    expect(s / N).toBeCloseTo(num / den, 2);
  });
  it('rotation keeps unit length and the requested angle', () => {
    const d = { x: 0.3, y: -0.4, z: Math.sqrt(1 - 0.25) };
    const r = rotate(d, 0.5, 1.2);
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1, 10);
    expect(r.x * d.x + r.y * d.y + r.z * d.z).toBeCloseTo(0.5, 10);
  });
});

describe('slab transport', () => {
  it('uncollided transmission agrees with exp(-μt)', () => {
    const problem = buildSlabProblem({ material: 'Pb', energy: 0.662, thickness: 1, cutoff: 0.01 });
    const t = new Transport(problem, 12345);
    const N = 20000;
    for (let i = 0; i < N; i++) t.finishHistory();
    const tally = problem.tally as SlabTransmissionTally;
    const expected = Math.exp(-problem.material.mu(0.662) * 1);
    const unc = tally.uncollided;
    expect(Math.abs(unc.mean - expected)).toBeLessThan(4 * unc.sigma);
    expect(tally.total.mean).toBeGreaterThan(unc.mean); // buildup > 1
  });
  it('produces annihilation photons above the pair threshold', () => {
    const problem = buildSlabProblem({ material: 'Pb', energy: 10, thickness: 2, cutoff: 0.01 });
    const t = new Transport(problem, 7);
    let banked = 0;
    for (let i = 0; i < 20000 && banked === 0; i++) if (t.step().kind === 'bank') banked++;
    expect(banked).toBeGreaterThan(0);
  });
  it('manual ξ overrides the generator', () => {
    const problem = buildSlabProblem({ material: 'H2O', energy: 1, thickness: 10, cutoff: 0.01 });
    const t = new Transport(problem, 1);
    t.step(); // birth
    t.step(); // lookup
    t.rng.override([0.5]);
    const rec = t.step();
    expect(rec.kind).toBe('flight');
    if (rec.kind === 'flight') expect(rec.s).toBeCloseTo(Math.log(2) / rec.mu, 10);
  });
  it('redoing a step with another ξ, then with the original ξ, restores the same history', () => {
    const build = () => buildSlabProblem({ material: 'Pb', energy: 0.662, thickness: 1, cutoff: 0.01 });
    const ref = new Transport(build(), 99);
    const refRecs = Array.from({ length: 40 }, () => ref.step());

    const t = new Transport(build(), 99);
    t.step(); // birth
    t.step(); // lookup
    const before = t.saveState();
    const orig = t.step(); // flight
    expect(orig.kind).toBe('flight');
    const changed = t.redoStep(before, [0.5]);
    if (changed.kind === 'flight') expect(changed.s).toBeCloseTo(Math.log(2) / changed.mu, 10);
    const back = t.redoStep(before, [orig.xi[0].xi]);
    expect(back).toEqual({ ...orig, xi: [{ xi: orig.xi[0].xi, manual: true }] });
    // the rest of the history continues exactly as in the untouched run
    for (let i = 3; i < 40; i++) expect(t.step()).toEqual(refRecs[i]);
  });
});
