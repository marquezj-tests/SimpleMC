/**
 * Continuous-energy neutron transport in a bare sphere with power
 * iteration (k-eigenvalue), written as a step-wise state machine like the
 * photon code. Teaching model ("simplified physics"):
 *
 *  - cross sections: ENDF/B-VII.1 pointwise data (OpenMC-processed), linear
 *    interpolation, targets at rest;
 *  - elastic scattering: isotropic in the centre-of-mass frame, or (option)
 *    sampled from the evaluated angular distribution;
 *  - inelastic scattering and (n,xn): outgoing energy from an evaporation
 *    spectrum E' exp(-E'/T), T = 3.2 sqrt(E/A) MeV, isotropic in the lab;
 *  - fission: total ν̄(E) from data, outgoing energy from a Watt spectrum
 *    fitted to the evaluated fission spectrum of each nuclide;
 *  - capture: the neutron disappears.
 *
 * keff is estimated (a) from the ratio of the number of fission sites
 * banked to the number of source neutrons in each cycle, and (b) from the
 * six-factor formula (four-factor formula with leakage), whose factors are
 * tallied with a fast/thermal cutoff energy Ec.
 */
import type { Engine, Track } from './engine';
import { RNG } from './rng';
import { invertCdf, isotropic, rotate, tabulateCdfOn, type Cdf, type Vec3 } from './sampling';

export const NREACTIONS = ['elastic', 'inelastic', 'n2n', 'n3n', 'fission', 'capture'] as const;
export type NReaction = (typeof NREACTIONS)[number];
export type NPartials = Record<NReaction, number>;

export interface NuclideTable {
  id: string;
  Z: number;
  A: number;
  awr: number;
  source: string;
  E: number[];
  total: number[];
  elastic: number[];
  inelastic: number[];
  n2n: number[];
  n3n: number[];
  fission: number[];
  capture: number[];
  nu: number[];
  watt: { a: number; b: number; fittedAt: number };
  /** inverse CDF of the elastic centre-of-mass cosine: mu[i][j] at E[i], ξ = j/(xi−1) */
  elasticMu: { E: number[]; xi: number; mu: number[][] };
}

/** Nuclide with pointwise cross sections (barn) and ν̄(E). Energies in MeV. */
export class Nuclide {
  readonly id: string;
  readonly awr: number;
  readonly table: NuclideTable;
  readonly wattCdf: Cdf;
  constructor(t: NuclideTable) {
    this.table = t;
    this.id = t.id;
    this.awr = t.awr;
    const { a, b } = t.watt;
    this.wattCdf = wattCdf(a, b);
  }

  private index(E: number): number {
    const g = this.table.E;
    if (E <= g[0]) return 0;
    if (E >= g[g.length - 1]) return g.length - 2;
    let lo = 0;
    let hi = g.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (g[mid] <= E) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Elastic centre-of-mass cosine from the evaluated angular distribution:
   * inverse CDF interpolated linearly in ξ and in incident energy.
   */
  elasticMuCm(E: number, xi: number): number {
    return this.elasticInverse(E)(xi);
  }

  /** Inverse CDF μ(ξ) of the elastic CM cosine at energy E. */
  elasticInverse(E: number): (xi: number) => number {
    const { E: g, mu, xi: n } = this.table.elasticMu;
    let i = 0;
    while (i < g.length - 2 && g[i + 1] <= E) i++;
    const f = Math.min(1, Math.max(0, (E - g[i]) / (g[i + 1] - g[i])));
    return (xi: number) => {
      const x = xi * (n - 1);
      const j = Math.min(n - 2, Math.floor(x));
      const t = x - j;
      const at = (row: number[]) => row[j] + t * (row[j + 1] - row[j]);
      return Math.min(1, Math.max(-1, (1 - f) * at(mu[i]) + f * at(mu[i + 1])));
    };
  }

  /** Microscopic cross sections (barn) at energy E (MeV), linear interpolation. */
  xs(E: number): NPartials & { total: number; nu: number } {
    const t = this.table;
    const i = this.index(E);
    const x0 = t.E[i];
    const x1 = t.E[i + 1];
    const f = Math.min(1, Math.max(0, (E - x0) / (x1 - x0)));
    const L = (y: number[]) => y[i] + f * (y[i + 1] - y[i]);
    const p = {
      elastic: L(t.elastic),
      inelastic: L(t.inelastic),
      n2n: L(t.n2n),
      n3n: L(t.n3n),
      fission: L(t.fission),
      capture: L(t.capture),
    };
    return { ...p, total: NREACTIONS.reduce((s, r) => s + p[r], 0), nu: L(t.nu) };
  }
}

/** Watt fission spectrum χ(E) ∝ exp(-E/a) sinh(sqrt(bE)), tabulated CDF on 0–20 MeV. */
export function wattPdf(a: number, b: number, E: number) {
  return Math.exp(-E / a) * Math.sinh(Math.sqrt(b * E));
}
function wattCdf(a: number, b: number): Cdf {
  const n = 600;
  const grid = Array.from({ length: n + 1 }, (_, i) => 20 * Math.pow(i / n, 2));
  return tabulateCdfOn(grid, (E) => wattPdf(a, b, E));
}

/** Nuclear temperature of the evaporation spectrum used for inelastic and (n,xn). */
export const evaporationT = (E: number, A: number) => 3.2 * Math.sqrt(E / A);

export interface MaterialComponent {
  nuclide: Nuclide;
  /** atom density (atoms / barn·cm) */
  N: number;
}

export type InitialSource = 'point' | 'uniform';

export interface CriticalProblem {
  radius: number;
  components: MaterialComponent[];
  neutronsPerCycle: number;
  inactive: number;
  active: number;
  initialSource: InitialSource;
  /** fast/thermal boundary for the six-factor formula (MeV) */
  cutoff: number;
  /** elastic angular distribution in the centre-of-mass frame */
  elastic: 'isotropic' | 'tabulated';
}

interface Site {
  pos: Vec3;
  /** index of the nuclide whose fission produced the site (selects the spectrum) */
  nuclide: number;
}

interface Neutron {
  pos: Vec3;
  dir: Vec3;
  E: number;
  collisions: number;
  primary: boolean;
  track: Track;
}

export interface NeutronState {
  pos: Vec3;
  dir: Vec3;
  E: number;
  collisions: number;
  primary: boolean;
}

export type NFate = 'leaked' | 'captured' | 'fission' | 'nxn';

type Base = { cycle: number; index: number; neutron: NeutronState | null; xi: { xi: number; manual: boolean }[] };

export type NStepRecord = Base &
  (
    | { kind: 'birth'; E: number; spectrumOf: string; cdf: Cdf; initial: boolean; source: InitialSource; dir: Vec3; fromStack: boolean }
    | { kind: 'lookup'; E: number; parts: { id: string; N: number; xs: NPartials & { total: number } }[]; Sigma: number }
    | { kind: 'flight'; Sigma: number; s: number; distance: number }
    | { kind: 'move'; s: number; distance: number; from: Vec3; to: Vec3; escaped: boolean; E: number }
    | { kind: 'nuclide'; E: number; probabilities: { id: string; p: number; cum: number }[]; chosen: string }
    | {
        kind: 'reaction';
        E: number;
        nuclide: string;
        nuclideIndex: number;
        xs: NPartials & { total: number; nu: number };
        probabilities: { reaction: NReaction; p: number; cum: number }[];
        chosen: NReaction;
      }
    | { kind: 'elastic'; A: number; E: number; muCm: number; muLab: number; Enew: number; model: 'isotropic' | 'tabulated'; nuclideIndex: number }
    | { kind: 'azimuth'; phi: number; cosTheta: number; oldDir: Vec3; newDir: Vec3 }
    | { kind: 'inelastic'; A: number; E: number; T: number; Enew: number; tries: number; newDir: Vec3 }
    | { kind: 'nxn'; multiplicity: number; E: number; T: number; energies: number[] }
    | { kind: 'fission'; E: number; nuclide: string; nu: number; banked: number }
    | { kind: 'capture'; E: number; nuclide: string }
    | { kind: 'bank'; remaining: number }
    | { kind: 'historyEnd'; fate: NFate; N: number }
    | {
        kind: 'cycleEnd';
        sourceSize: number;
        bankSize: number;
        k: number;
        active: boolean;
        kMean: number | null;
        kSigma: number | null;
        nextSize: number;
      }
    | { kind: 'done' }
  );

/** Six-factor tallies of one cycle; see `sixFactors()`. */
export interface SixFactorTally {
  /** source neutrons */
  N: number;
  /** expected fission neutrons (ν̄) from fast / thermal fissions */
  nuFast: number;
  nuThermal: number;
  /** neutrons slowing down below the cutoff (or born below it) */
  thermalized: number;
  /** net fast absorptions: captures + fissions − extra (n,xn) neutrons */
  absFast: number;
  /** thermal absorptions, all in fuel */
  absThermal: number;
  leakFast: number;
  leakThermal: number;
}

const emptyTally = (): SixFactorTally => ({
  N: 0,
  nuFast: 0,
  nuThermal: 0,
  thermalized: 0,
  absFast: 0,
  absThermal: 0,
  leakFast: 0,
  leakThermal: 0,
});

export interface SixFactors {
  epsilon: number;
  p: number;
  PFNL: number;
  f: number;
  eta: number;
  PTNL: number;
  k: number;
}

/**
 * Six-factor formula k = ε p P_FNL f η P_TNL from tallies. Undefined factors
 * (division by zero, e.g. no thermal neutrons) are NaN.
 */
export function sixFactors(t: SixFactorTally): SixFactors {
  const div = (a: number, b: number) => (b > 0 ? a / b : NaN);
  const epsilon = div(t.nuFast + t.nuThermal, t.nuThermal);
  const p = div(t.thermalized, t.thermalized + t.absFast);
  const PFNL = div(t.thermalized + t.absFast, t.thermalized + t.absFast + t.leakFast);
  const f = t.absThermal > 0 ? 1 : NaN; // the sphere is all fuel
  const eta = div(t.nuThermal, t.absThermal);
  const PTNL = div(t.absThermal, t.absThermal + t.leakThermal);
  return { epsilon, p, PFNL, f, eta, PTNL, k: epsilon * p * PFNL * f * eta * PTNL };
}

export interface CycleResult {
  cycle: number;
  active: boolean;
  /** source-ratio estimate: fission sites banked / source neutrons */
  kSource: number;
  /** six-factor estimate; equals (ν̄ fast + ν̄ thermal)/N whenever all factors are defined */
  kSix: number;
  tally: SixFactorTally;
}

type Phase =
  | 'birth'
  | 'lookup'
  | 'flight'
  | 'move'
  | 'nuclide'
  | 'reaction'
  | 'elastic'
  | 'azimuth'
  | 'inelastic'
  | 'nxn'
  | 'fission'
  | 'capture'
  | 'neutronDone'
  | 'cycleEnd'
  | 'done';

/** Energy bins for the spectrum tally (log-spaced, MeV). */
export const SPECTRUM_BINS = (() => {
  const lo = Math.log10(1e-9);
  const hi = Math.log10(20);
  const n = 70;
  return Array.from({ length: n + 1 }, (_, i) => Math.pow(10, lo + ((hi - lo) * i) / n));
})();
export const RADIAL_BINS = 20;
/** Radius r/R at the middle (in volume) of each equal-volume shell of the source histogram. */
export const RADIAL_CENTRES = Array.from({ length: RADIAL_BINS }, (_, i) => Math.cbrt((i + 0.5) / RADIAL_BINS));

interface SavedState {
  tracks: Track[];
  neutron: Neutron | null;
  stack: Neutron[];
  bank: Site[];
  tally: SixFactorTally;
  spectrum: number[];
  phase: Phase;
  history: number;
  index: number;
  fate: NFate;
  s: number;
  boundary: number;
  nuc: number;
  reaction: NReaction;
  muLab: number;
  rng: number;
}

export class PowerIteration implements Engine<NStepRecord> {
  readonly problem: CriticalProblem;
  readonly rng: RNG;
  tracks: Track[] = [];
  maxTracks = 300;
  version = 0;
  /** neutrons started so far (all cycles) */
  history = 0;

  cycle = 1;
  /** results of finished cycles */
  cycles: CycleResult[] = [];
  /** radial histogram of the source of each cycle (equal-volume shells, uniform = 1) */
  sourceHistograms: number[][] = [];
  /** track-length flux per energy bin, summed over active cycles */
  spectrum: number[] = new Array(SPECTRUM_BINS.length - 1).fill(0);
  spectrumSources = 0;
  /** six-factor tallies summed over active cycles */
  sixTotal: SixFactorTally = emptyTally();
  /** message when the run cannot continue */
  stopped: string | null = null;

  private phase: Phase = 'birth';
  private source: Site[] = [];
  private bank: Site[] = [];
  private index = 0; // index of the source neutron in the cycle
  private neutron: Neutron | null = null;
  private stack: Neutron[] = [];
  private tally: SixFactorTally = emptyTally();
  private fate: NFate = 'leaked';
  // carried between steps
  private s = 0;
  private boundary = 0;
  private nuc = 0;
  private reaction: NReaction = 'elastic';
  private muLab = 1;

  constructor(problem: CriticalProblem, seed: number) {
    this.problem = problem;
    this.rng = new RNG(seed);
    this.source = this.initialSource();
    this.recordSourceHistogram();
    this.rng.takeDrawn();
  }

  private initialSource(): Site[] {
    const { neutronsPerCycle: n, radius: R, initialSource } = this.problem;
    // the initial source uses the U-235 (first nuclide) fission spectrum
    return Array.from({ length: n }, () => {
      if (initialSource === 'point') return { pos: { x: 0, y: 0, z: 0 }, nuclide: 0 };
      const r = R * Math.cbrt(this.rng.next());
      const d = isotropic(this.rng.next(), this.rng.next());
      return { pos: { x: r * d.x, y: r * d.y, z: r * d.z }, nuclide: 0 };
    });
  }

  /**
   * Radial histogram of the source in equal-volume shells (so all bins have
   * the same statistical noise), as density relative to a uniform source.
   */
  private recordSourceHistogram() {
    const R = this.problem.radius;
    const h = new Array(RADIAL_BINS).fill(0);
    for (const s of this.source) {
      const u = (s.pos.x ** 2 + s.pos.y ** 2 + s.pos.z ** 2) ** 1.5 / R ** 3; // (r/R)³
      h[Math.min(RADIAL_BINS - 1, Math.floor(u * RADIAL_BINS))]++;
    }
    const n = this.source.length;
    this.sourceHistograms.push(h.map((c) => (n > 0 ? (c / n) * RADIAL_BINS : 0)));
  }

  get isActive() {
    return this.cycle > this.problem.inactive;
  }
  get isDone() {
    return this.phase === 'done';
  }
  get totalCycles() {
    return this.problem.inactive + this.problem.active;
  }
  get sourceSize() {
    return this.source.length;
  }
  get neutronIndex() {
    return this.index;
  }
  get currentTrack(): Track | null {
    return this.neutron?.track ?? null;
  }
  get atHistoryStart() {
    return this.phase === 'birth' || this.phase === 'cycleEnd' || this.phase === 'done';
  }
  get nextXiCount() {
    switch (this.phase) {
      case 'birth':
        return this.stack.length > 0 ? 0 : 3;
      case 'flight':
      case 'nuclide':
      case 'reaction':
      case 'elastic':
      case 'azimuth':
      case 'fission':
        return 1;
      case 'inelastic':
        return 4;
      case 'nxn':
        return 4;
      default:
        return 0;
    }
  }

  private snapshot(): NeutronState | null {
    const n = this.neutron;
    return n ? { pos: { ...n.pos }, dir: { ...n.dir }, E: n.E, collisions: n.collisions, primary: n.primary } : null;
  }

  private newNeutron(pos: Vec3, dir: Vec3, E: number, primary: boolean): Neutron {
    if (E < this.problem.cutoff) this.tally.thermalized++;
    return {
      pos: { ...pos },
      dir: { ...dir },
      E,
      collisions: 0,
      primary,
      track: { history: this.history, primary, uncollided: true, points: [{ ...pos }], collisions: [] },
    };
  }

  private finishNeutron(fate: NFate) {
    const n = this.neutron!;
    n.track.fate = fate;
    this.fate = fate;
    this.tracks.push(n.track);
    if (this.tracks.length > this.maxTracks) this.tracks.splice(0, this.tracks.length - this.maxTracks);
    this.phase = 'neutronDone';
  }

  private macro(E: number) {
    const parts = this.problem.components.map((c) => {
      const x = c.nuclide.xs(E);
      return { id: c.nuclide.id, N: c.N, xs: x };
    });
    const Sigma = parts.reduce((s, p) => s + p.N * p.xs.total, 0);
    return { parts, Sigma };
  }

  private distanceToSurface(p: Vec3, d: Vec3) {
    const R = this.problem.radius;
    const b = p.x * d.x + p.y * d.y + p.z * d.z;
    const c = p.x * p.x + p.y * p.y + p.z * p.z - R * R;
    return -b + Math.sqrt(Math.max(0, b * b - c));
  }

  /** Change the energy of the current neutron, scoring slowing down below the cutoff. */
  private setEnergy(Enew: number) {
    const n = this.neutron!;
    const Ec = this.problem.cutoff;
    if (n.E >= Ec && Enew < Ec) this.tally.thermalized++;
    n.E = Enew;
  }

  /** Sample E' from the evaporation spectrum E' exp(-E'/T), truncated to E' < E. */
  private evaporation(E: number, A: number) {
    const T = evaporationT(E, A);
    let tries = 0;
    let Enew = 0;
    do {
      tries++;
      Enew = -T * Math.log((1 - this.rng.next()) * (1 - this.rng.next()));
    } while (Enew >= E && tries < 100);
    if (Enew >= E) Enew = E * this.rng.next();
    return { T, Enew, tries };
  }

  step(): NStepRecord {
    const rec = this.doStep();
    this.version++;
    return rec;
  }

  private doStep(): NStepRecord {
    const pb = this.problem;
    const rng = this.rng;
    const base = () => ({ cycle: this.cycle, index: this.index, neutron: this.snapshot(), xi: rng.takeDrawn() });

    switch (this.phase) {
      case 'done':
        return { kind: 'done', ...base() };

      case 'birth': {
        const fromStack = this.stack.pop();
        if (fromStack) {
          this.neutron = fromStack;
          this.phase = 'lookup';
          return { kind: 'bank', remaining: this.stack.length, ...base() };
        }
        this.history++;
        this.tally.N++;
        const site = this.source[this.index];
        const nucl = pb.components[site.nuclide].nuclide;
        const E = invertCdf(nucl.wattCdf, rng.next(), false);
        const dir = isotropic(rng.next(), rng.next());
        this.neutron = this.newNeutron(site.pos, dir, Math.max(E, 1e-11), true);
        this.phase = 'lookup';
        return {
          kind: 'birth',
          E,
          spectrumOf: nucl.id,
          cdf: nucl.wattCdf,
          initial: this.cycle === 1,
          source: pb.initialSource,
          dir,
          fromStack: false,
          ...base(),
        };
      }

      case 'lookup': {
        const n = this.neutron!;
        const { parts, Sigma } = this.macro(n.E);
        this.phase = 'flight';
        return { kind: 'lookup', E: n.E, parts, Sigma, ...base() };
      }

      case 'flight': {
        const n = this.neutron!;
        const { Sigma } = this.macro(n.E);
        this.s = -Math.log(1 - rng.next()) / Sigma;
        this.boundary = this.distanceToSurface(n.pos, n.dir);
        this.phase = 'move';
        return { kind: 'flight', Sigma, s: this.s, distance: this.boundary, ...base() };
      }

      case 'move': {
        const n = this.neutron!;
        const from = { ...n.pos };
        const escaped = this.s >= this.boundary;
        const d = escaped ? this.boundary : this.s;
        n.pos = { x: n.pos.x + d * n.dir.x, y: n.pos.y + d * n.dir.y, z: n.pos.z + d * n.dir.z };
        n.track.points.push({ ...n.pos });
        if (this.isActive) {
          // track-length estimator of the flux spectrum
          const b = binIndex(n.E);
          if (b >= 0) this.spectrum[b] += d;
        }
        const rec = { kind: 'move' as const, s: this.s, distance: this.boundary, from, to: { ...n.pos }, escaped, E: n.E };
        if (escaped) {
          n.track.exitDir = { ...n.dir };
          if (n.E >= pb.cutoff) this.tally.leakFast++;
          else this.tally.leakThermal++;
          const r = { ...rec, ...base() };
          this.finishNeutron('leaked');
          return r;
        }
        this.phase = 'nuclide';
        return { ...rec, ...base() };
      }

      case 'nuclide': {
        const n = this.neutron!;
        const { parts, Sigma } = this.macro(n.E);
        let cum = 0;
        const probabilities = parts.map((p) => {
          const pr = (p.N * p.xs.total) / Sigma;
          cum += pr;
          return { id: p.id, p: pr, cum };
        });
        const xi = rng.next();
        let k = probabilities.findIndex((p) => p.p > 0 && xi < p.cum);
        if (k < 0) k = probabilities.length - 1;
        this.nuc = k;
        this.phase = 'reaction';
        return { kind: 'nuclide', E: n.E, probabilities, chosen: probabilities[k].id, ...base() };
      }

      case 'reaction': {
        const n = this.neutron!;
        const nucl = pb.components[this.nuc].nuclide;
        const xs = nucl.xs(n.E);
        let cum = 0;
        const probabilities = NREACTIONS.map((reaction) => {
          const pr = xs[reaction] / xs.total;
          cum += pr;
          return { reaction, p: pr, cum };
        });
        const xi = rng.next();
        let chosen: NReaction = 'capture';
        for (const pr of probabilities)
          if (pr.p > 0 && xi < pr.cum) {
            chosen = pr.reaction;
            break;
          }
        this.reaction = chosen;
        n.collisions++;
        n.track.uncollided = false;
        n.track.collisions.push({ pos: { ...n.pos }, kind: chosen });
        this.phase = chosen === 'n2n' || chosen === 'n3n' ? 'nxn' : chosen;
        return { kind: 'reaction', E: n.E, nuclide: nucl.id, nuclideIndex: this.nuc, xs, probabilities, chosen, ...base() };
      }

      case 'elastic': {
        // isotropic in the centre-of-mass frame, target at rest
        const n = this.neutron!;
        const A = pb.components[this.nuc].nuclide.awr;
        const xi = rng.next();
        const muCm = pb.elastic === 'tabulated' ? pb.components[this.nuc].nuclide.elasticMuCm(n.E, xi) : 2 * xi - 1;
        const E = n.E;
        const Enew = (E * (A * A + 2 * A * muCm + 1)) / ((A + 1) * (A + 1));
        this.muLab = (1 + A * muCm) / Math.sqrt(A * A + 2 * A * muCm + 1);
        this.setEnergy(Enew);
        this.phase = 'azimuth';
        return { kind: 'elastic', A, E, muCm, muLab: this.muLab, Enew, model: pb.elastic, nuclideIndex: this.nuc, ...base() };
      }

      case 'azimuth': {
        const n = this.neutron!;
        const phi = 2 * Math.PI * rng.next();
        const oldDir = { ...n.dir };
        n.dir = rotate(n.dir, this.muLab, phi);
        this.phase = 'lookup';
        return { kind: 'azimuth', phi, cosTheta: this.muLab, oldDir, newDir: { ...n.dir }, ...base() };
      }

      case 'inelastic': {
        const n = this.neutron!;
        const A = pb.components[this.nuc].nuclide.awr;
        const E = n.E;
        const { T, Enew, tries } = this.evaporation(E, A);
        n.dir = isotropic(rng.next(), rng.next());
        this.setEnergy(Enew);
        this.phase = 'lookup';
        return { kind: 'inelastic', A, E, T, Enew, tries, newDir: { ...n.dir }, ...base() };
      }

      case 'nxn': {
        // (n,2n) / (n,3n): the neutron is replaced by 2 or 3 neutrons
        const n = this.neutron!;
        const m = this.reaction === 'n3n' ? 3 : 2;
        const A = pb.components[this.nuc].nuclide.awr;
        const energies: number[] = [];
        let T = 0;
        for (let i = 0; i < m; i++) {
          const ev = this.evaporation(n.E, A);
          T = ev.T;
          const dir = isotropic(rng.next(), rng.next());
          energies.push(ev.Enew);
          this.stack.push(this.newNeutron(n.pos, dir, ev.Enew, false));
        }
        if (n.E >= pb.cutoff) this.tally.absFast += 1 - m; // net absorption
        const rec = { kind: 'nxn' as const, multiplicity: m, E: n.E, T, energies, ...base() };
        this.finishNeutron('nxn');
        return rec;
      }

      case 'fission': {
        const n = this.neutron!;
        const nucl = pb.components[this.nuc].nuclide;
        const nu = nucl.xs(n.E).nu;
        // integer number of sites with the right mean: floor(ν̄ + ξ)
        const banked = Math.floor(nu + rng.next());
        for (let i = 0; i < banked; i++) this.bank.push({ pos: { ...n.pos }, nuclide: this.nuc });
        if (n.E >= pb.cutoff) {
          this.tally.absFast++;
          this.tally.nuFast += nu;
        } else {
          this.tally.absThermal++;
          this.tally.nuThermal += nu;
        }
        const rec = { kind: 'fission' as const, E: n.E, nuclide: nucl.id, nu, banked, ...base() };
        this.finishNeutron('fission');
        return rec;
      }

      case 'capture': {
        const n = this.neutron!;
        if (n.E >= pb.cutoff) this.tally.absFast++;
        else this.tally.absThermal++;
        const rec = { kind: 'capture' as const, E: n.E, nuclide: pb.components[this.nuc].nuclide.id, ...base() };
        this.finishNeutron('captured');
        return rec;
      }

      case 'neutronDone': {
        if (this.stack.length > 0) {
          this.phase = 'birth'; // next step pops the stack
          return this.doStep();
        }
        const fate = this.fate;
        this.neutron = null;
        this.index++;
        this.phase = this.index >= this.source.length ? 'cycleEnd' : 'birth';
        return { kind: 'historyEnd', fate, N: this.source.length, ...base(), index: this.index - 1 };
      }

      case 'cycleEnd': {
        const finished = this.cycle;
        const N = this.source.length;
        const M = this.bank.length;
        const k = M / N;
        const active = this.isActive;
        const six = sixFactors(this.tally);
        const kSix = this.tally.N > 0 ? (this.tally.nuFast + this.tally.nuThermal) / this.tally.N : NaN;
        this.cycles.push({ cycle: this.cycle, active, kSource: k, kSix: Number.isFinite(six.k) ? six.k : kSix, tally: this.tally });
        if (active) {
          for (const key of Object.keys(this.sixTotal) as (keyof SixFactorTally)[]) this.sixTotal[key] += this.tally[key];
          this.spectrumSources += N;
        }
        const est = this.kSourceEstimate();
        const rec = {
          kind: 'cycleEnd' as const,
          sourceSize: N,
          bankSize: M,
          k,
          active,
          kMean: est?.mean ?? null,
          kSigma: est?.sigma ?? null,
          nextSize: Math.min(M, pb.neutronsPerCycle),
        };
        // next source: N sites sampled from the fission bank
        const n = pb.neutronsPerCycle;
        if (M === 0) {
          this.stopped = 'empty-bank';
          this.phase = 'done';
        } else {
          this.source = Array.from({ length: n }, () => this.bank[Math.floor(rng.next() * M)]);
          this.bank = [];
          this.tally = emptyTally();
          this.index = 0;
          if (this.cycle >= this.totalCycles) this.phase = 'done';
          else {
            this.cycle++;
            this.recordSourceHistogram();
            this.phase = 'birth';
          }
        }
        rng.takeDrawn(); // the resampling random numbers are not shown
        return { ...rec, cycle: finished, index: 0, neutron: null, xi: [] };
      }
    }
  }

  /** Mean and standard error of an estimator over active cycles. */
  private stats(values: number[]) {
    const n = values.length;
    if (n === 0) return null;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    if (n < 2) return { mean, sigma: NaN, n };
    const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
    return { mean, sigma: Math.sqrt(v / n), n };
  }

  kSourceEstimate() {
    return this.stats(this.cycles.filter((c) => c.active).map((c) => c.kSource));
  }

  /** Six-factor estimate: factors from the summed tallies, σ from cycle-to-cycle spread. */
  kSixEstimate() {
    const factors = sixFactors(this.sixTotal);
    const st = this.stats(this.cycles.filter((c) => c.active).map((c) => (c.tally.nuFast + c.tally.nuThermal) / c.tally.N));
    return { factors, sigma: st?.sigma ?? NaN, n: st?.n ?? 0 };
  }

  finishHistory(): NStepRecord {
    let rec = this.step();
    let guard = 0;
    while (rec.kind !== 'historyEnd' && rec.kind !== 'done' && guard++ < 1_000_000) rec = this.step();
    return rec;
  }

  /** Run until the end of the current cycle (inclusive). */
  finishCycle(): NStepRecord {
    let rec = this.step();
    let guard = 0;
    while (rec.kind !== 'cycleEnd' && rec.kind !== 'done' && guard++ < 10_000_000) rec = this.step();
    return rec;
  }

  saveState(): SavedState {
    const objects = structuredClone({
      tracks: this.tracks,
      neutron: this.neutron,
      stack: this.stack,
      bank: this.bank,
      tally: this.tally,
      spectrum: this.spectrum,
    });
    return {
      ...objects,
      phase: this.phase,
      history: this.history,
      index: this.index,
      fate: this.fate,
      s: this.s,
      boundary: this.boundary,
      nuc: this.nuc,
      reaction: this.reaction,
      muLab: this.muLab,
      rng: this.rng.getState(),
    };
  }

  restoreState(state: unknown): void {
    const st = structuredClone(state) as SavedState;
    this.tracks = st.tracks;
    this.neutron = st.neutron;
    this.stack = st.stack;
    this.bank = st.bank;
    this.tally = st.tally;
    this.spectrum = st.spectrum;
    this.phase = st.phase;
    this.history = st.history;
    this.index = st.index;
    this.fate = st.fate;
    this.s = st.s;
    this.boundary = st.boundary;
    this.nuc = st.nuc;
    this.reaction = st.reaction;
    this.muLab = st.muLab;
    this.rng.setState(st.rng);
    this.version++;
  }

  redoStep(before: unknown, xi: number[]): NStepRecord {
    this.restoreState(before);
    this.rng.override(xi);
    const rec = this.step();
    this.rng.clearOverride();
    return rec;
  }
}

function binIndex(E: number) {
  const b = SPECTRUM_BINS;
  if (E < b[0] || E >= b[b.length - 1]) return -1;
  const lo = Math.log10(b[0]);
  const hi = Math.log10(b[b.length - 1]);
  return Math.min(b.length - 2, Math.floor(((Math.log10(E) - lo) / (hi - lo)) * (b.length - 1)));
}

/** Atom densities (atoms/barn·cm) of uranium with weight fraction w235 of U-235. */
export function uraniumDensities(rho: number, w235: number, awr235: number, awr238: number) {
  const NA = 0.602214076; // Avogadro / 1e24
  const mn = 1.00866491595; // neutron mass (u), awr × mn = atomic mass
  return {
    N235: (rho * w235 * NA) / (awr235 * mn),
    N238: (rho * (1 - w235) * NA) / (awr238 * mn),
  };
}
