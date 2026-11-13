/**
 * Analog Monte Carlo photon transport, written as a state machine.
 *
 * Each call to `step()` performs ONE elementary operation of the random walk
 * (look up a cross section, sample a flight distance, move, choose a
 * reaction, sample an angle, ...) and returns a record describing what was
 * done and with which random numbers. The step-by-step window displays these
 * records; automatic mode simply calls `step()` many times.
 */
import { Material, REACTIONS, type Partials, type Reaction } from './material';
import type { Geometry } from './geometry';
import { RNG } from './rng';
import {
  ELECTRON_MASS,
  comptonEnergy,
  invertCdf,
  isotropic,
  kleinNishinaCdf,
  rayleighCdf,
  rotate,
  type Cdf,
  type Vec3,
} from './sampling';
import type { Tally } from './tally';
import type { Engine, Track } from './engine';

export interface SourceParticle {
  pos: Vec3;
  dir: Vec3;
  E: number;
}

export interface Source {
  sample(rng: RNG): SourceParticle;
}

export interface Problem {
  geometry: Geometry;
  material: Material;
  source: Source;
  /** Photons below this energy (MeV) are terminated and deposit their energy. */
  cutoff: number;
  tally: Tally;
}

export type Fate = 'transmitted' | 'reflected' | 'photoelectric' | 'pair' | 'cutoff';
export type CollisionKind = Reaction | 'cutoff';
export type { Track };

export interface PhotonState {
  pos: Vec3;
  dir: Vec3;
  E: number;
  collisions: number;
  primary: boolean;
}

interface Photon extends PhotonState {
  track: Track;
}

type XiList = { xi: number; manual: boolean }[];

interface Base {
  history: number;
  /** State of the photon AFTER the step. */
  photon: PhotonState | null;
  /** Random numbers used in this step. */
  xi: XiList;
}

export type StepRecord = Base &
  (
    | { kind: 'birth'; E: number; x: number }
    | { kind: 'bank'; remaining: number }
    | { kind: 'lookup'; E: number; partials: Partials; massTotal: number; density: number; mu: number }
    | { kind: 'flight'; mu: number; s: number; distance: number; surface: string }
    | {
        kind: 'move';
        s: number;
        distance: number;
        from: Vec3;
        to: Vec3;
        escaped: boolean;
        surface: string;
        fate?: Fate;
        uncollided: boolean;
      }
    | { kind: 'partials'; E: number; partials: Partials; massTotal: number }
    | {
        kind: 'reaction';
        E: number;
        probabilities: { reaction: Reaction; p: number; cum: number }[];
        chosen: Reaction;
      }
    | {
        kind: 'angle';
        reaction: 'incoherent' | 'coherent';
        E: number;
        cdf: Cdf;
        cosTheta: number;
        Enew: number;
      }
    | { kind: 'azimuth'; phi: number; cosTheta: number; oldDir: Vec3; newDir: Vec3 }
    | { kind: 'photoelectric'; E: number }
    | { kind: 'pair'; E: number; kinetic: number; dirs: [Vec3, Vec3] }
    | { kind: 'cutoff'; E: number; cutoff: number }
    | { kind: 'historyEnd'; transmitted: number; uncollided: number; photons: number }
  );

export type StepKind = StepRecord['kind'];

type Phase =
  | 'birth'
  | 'lookup'
  | 'flight'
  | 'move'
  | 'partials'
  | 'reaction'
  | 'angle'
  | 'azimuth'
  | 'absorb'
  | 'photonDone';

export interface TransportState {
  tracks: Track[];
  photon: Photon | null;
  bank: Photon[];
  history: number;
  phase: Phase;
  photonsThisHistory: number;
  transmittedThisHistory: number;
  uncollidedThisHistory: number;
  s: number;
  boundary: { distance: number; surface: string };
  reaction: Reaction;
  absorbKind: Reaction | 'cutoff';
  cosTheta: number;
  Enew: number;
  rng: number;
  tally: unknown;
}

export class Transport implements Engine<StepRecord> {
  readonly problem: Problem;
  readonly rng: RNG;
  history = 0;
  /** Completed tracks (most recent last), capped at `maxTracks`. */
  tracks: Track[] = [];
  maxTracks = 300;
  /** Incremented whenever `tracks` or the current track changes. */
  version = 0;

  private phase: Phase = 'birth';
  private photon: Photon | null = null;
  private bank: Photon[] = [];
  private photonsThisHistory = 0;
  private transmittedThisHistory = 0;
  private uncollidedThisHistory = 0;
  // values carried between steps
  private s = 0;
  private boundary = { distance: 0, surface: '' };
  private reaction: Reaction = 'photoelectric';
  /** What terminates the photon in the 'absorb' phase. */
  private absorbKind: Reaction | 'cutoff' = 'photoelectric';
  private cosTheta = 1;
  private Enew = 0;

  constructor(problem: Problem, seed: number) {
    this.problem = problem;
    this.rng = new RNG(seed);
  }

  get currentTrack(): Track | null {
    return this.photon?.track ?? null;
  }

  /** True when the next step starts a new history. */
  get atHistoryStart(): boolean {
    return this.phase === 'birth';
  }

  /** How many random numbers the next step will consume. */
  get nextXiCount(): number {
    switch (this.phase) {
      case 'birth':
      case 'flight':
      case 'reaction':
      case 'angle':
      case 'azimuth':
        return 1;
      case 'absorb':
        return this.absorbKind === 'pairNuclear' || this.absorbKind === 'pairElectron' ? 2 : 0;
      default:
        return 0;
    }
  }

  private snapshot(): PhotonState | null {
    const p = this.photon;
    if (!p) return null;
    return { pos: { ...p.pos }, dir: { ...p.dir }, E: p.E, collisions: p.collisions, primary: p.primary };
  }

  private finishPhoton(fate: Fate) {
    const p = this.photon!;
    p.track.fate = fate;
    this.tracks.push(p.track);
    if (this.tracks.length > this.maxTracks) this.tracks.splice(0, this.tracks.length - this.maxTracks);
    this.phase = 'photonDone';
  }

  private newPhoton(pos: Vec3, dir: Vec3, E: number, primary: boolean): Photon {
    this.photonsThisHistory++;
    return {
      pos: { ...pos },
      dir: { ...dir },
      E,
      collisions: 0,
      primary,
      track: { history: this.history, primary, uncollided: true, points: [{ ...pos }], collisions: [] },
    };
  }

  /** Perform one elementary step of the random walk. */
  step(): StepRecord {
    const rec = this.doStep();
    this.version++;
    return rec;
  }

  private doStep(): StepRecord {
    const { material, geometry, tally, cutoff } = this.problem;
    const rng = this.rng;
    const base = () => ({ history: this.history, photon: this.snapshot(), xi: rng.takeDrawn() });

    switch (this.phase) {
      case 'birth': {
        this.history++;
        this.photonsThisHistory = 0;
        this.transmittedThisHistory = 0;
        this.uncollidedThisHistory = 0;
        tally.startHistory();
        const src = this.problem.source.sample(rng);
        this.photon = this.newPhoton(src.pos, src.dir, src.E, true);
        this.phase = 'lookup';
        return { kind: 'birth', E: src.E, x: src.pos.x, ...base() };
      }

      case 'lookup': {
        const p = this.photon!;
        const partials = material.massPartials(p.E);
        const massTotal = REACTIONS.reduce((s, r) => s + partials[r], 0);
        this.phase = 'flight';
        return {
          kind: 'lookup',
          E: p.E,
          partials,
          massTotal,
          density: material.density,
          mu: massTotal * material.density,
          ...base(),
        };
      }

      case 'flight': {
        const p = this.photon!;
        const mu = material.mu(p.E);
        const xi = rng.next();
        // Inverse of the CDF F(s) = 1 - exp(-μ s)
        this.s = -Math.log(1 - xi) / mu;
        this.boundary = geometry.distanceToBoundary(p.pos, p.dir);
        this.phase = 'move';
        return {
          kind: 'flight',
          mu,
          s: this.s,
          distance: this.boundary.distance,
          surface: this.boundary.surface,
          ...base(),
        };
      }

      case 'move': {
        const p = this.photon!;
        const from = { ...p.pos };
        const escaped = this.s >= this.boundary.distance;
        const d = escaped ? this.boundary.distance : this.s;
        p.pos = { x: p.pos.x + d * p.dir.x, y: p.pos.y + d * p.dir.y, z: p.pos.z + d * p.dir.z };
        p.track.points.push({ ...p.pos });
        let fate: Fate | undefined;
        const uncollided = p.collisions === 0 && p.primary;
        if (escaped) {
          fate = this.boundary.surface === 'back' ? 'transmitted' : 'reflected';
          p.track.exitDir = { ...p.dir };
          tally.score({ type: 'escape', surface: this.boundary.surface, uncollided, primary: p.primary, E: p.E });
          if (fate === 'transmitted') {
            this.transmittedThisHistory++;
            if (uncollided) this.uncollidedThisHistory++;
          }
          const rec = {
            kind: 'move' as const,
            s: this.s,
            distance: this.boundary.distance,
            from,
            to: { ...p.pos },
            escaped,
            surface: this.boundary.surface,
            fate,
            uncollided,
            ...base(),
          };
          this.finishPhoton(fate);
          return rec;
        }
        this.phase = 'partials';
        return {
          kind: 'move',
          s: this.s,
          distance: this.boundary.distance,
          from,
          to: { ...p.pos },
          escaped,
          surface: this.boundary.surface,
          uncollided,
          ...base(),
        };
      }

      case 'partials': {
        const p = this.photon!;
        const partials = material.massPartials(p.E);
        const massTotal = REACTIONS.reduce((s, r) => s + partials[r], 0);
        this.phase = 'reaction';
        return { kind: 'partials', E: p.E, partials, massTotal, ...base() };
      }

      case 'reaction': {
        const p = this.photon!;
        const partials = material.massPartials(p.E);
        const massTotal = REACTIONS.reduce((s, r) => s + partials[r], 0);
        let cum = 0;
        const probabilities = REACTIONS.map((reaction) => {
          const pr = partials[reaction] / massTotal;
          cum += pr;
          return { reaction, p: pr, cum };
        });
        const xi = rng.next();
        let chosen: Reaction = probabilities[probabilities.length - 1].reaction;
        for (const pr of probabilities) {
          if (pr.p > 0 && xi < pr.cum) {
            chosen = pr.reaction;
            break;
          }
        }
        this.reaction = chosen;
        this.absorbKind = chosen;
        p.collisions++;
        p.track.uncollided = false;
        p.track.collisions.push({ pos: { ...p.pos }, kind: chosen });
        this.phase = chosen === 'incoherent' || chosen === 'coherent' ? 'angle' : 'absorb';
        return { kind: 'reaction', E: p.E, probabilities, chosen, ...base() };
      }

      case 'angle': {
        const p = this.photon!;
        const reaction = this.reaction as 'incoherent' | 'coherent';
        const cdf = reaction === 'incoherent' ? kleinNishinaCdf(p.E) : rayleighCdf();
        const xi = rng.next();
        this.cosTheta = invertCdf(cdf, xi);
        this.Enew = reaction === 'incoherent' ? comptonEnergy(p.E, this.cosTheta) : p.E;
        const E = p.E;
        this.phase = 'azimuth';
        return { kind: 'angle', reaction, E, cdf, cosTheta: this.cosTheta, Enew: this.Enew, ...base() };
      }

      case 'azimuth': {
        const p = this.photon!;
        const xi = rng.next();
        const phi = 2 * Math.PI * xi;
        const oldDir = { ...p.dir };
        p.dir = rotate(p.dir, this.cosTheta, phi);
        const deposit = p.E - this.Enew;
        if (deposit > 0) tally.score({ type: 'deposit', E: deposit });
        p.E = this.Enew;
        const rec = { kind: 'azimuth' as const, phi, cosTheta: this.cosTheta, oldDir, newDir: { ...p.dir }, ...base() };
        if (p.E < cutoff) {
          this.phase = 'absorb';
          this.absorbKind = 'cutoff';
        } else {
          this.phase = 'lookup';
        }
        return rec;
      }

      case 'absorb': {
        const p = this.photon!;
        const kind = this.absorbKind;
        if (kind === 'photoelectric') {
          tally.score({ type: 'deposit', E: p.E });
          const rec = { kind: 'photoelectric' as const, E: p.E, ...base() };
          this.finishPhoton('photoelectric');
          return rec;
        }
        if (kind === 'pairNuclear' || kind === 'pairElectron') {
          const kinetic = p.E - 2 * ELECTRON_MASS;
          tally.score({ type: 'deposit', E: kinetic });
          // The positron annihilates at rest: two 511 keV photons, back to back,
          // emitted isotropically.
          const d = isotropic(rng.next(), rng.next());
          const dirs: [Vec3, Vec3] = [d, { x: -d.x, y: -d.y, z: -d.z }];
          const E = p.E;
          for (const dir of dirs) this.bank.push(this.newPhoton(p.pos, dir, ELECTRON_MASS, false));
          const rec = { kind: 'pair' as const, E, kinetic, dirs, ...base() };
          this.finishPhoton('pair');
          return rec;
        }
        // energy cutoff
        tally.score({ type: 'deposit', E: p.E });
        p.track.collisions.push({ pos: { ...p.pos }, kind: 'cutoff' });
        const rec = { kind: 'cutoff' as const, E: p.E, cutoff, ...base() };
        this.finishPhoton('cutoff');
        return rec;
      }

      case 'photonDone': {
        const next = this.bank.pop();
        if (next) {
          this.photon = next;
          this.phase = 'lookup';
          return { kind: 'bank', remaining: this.bank.length, ...base() };
        }
        this.photon = null;
        tally.endHistory();
        this.phase = 'birth';
        return {
          kind: 'historyEnd',
          transmitted: this.transmittedThisHistory,
          uncollided: this.uncollidedThisHistory,
          photons: this.photonsThisHistory,
          ...base(),
        };
      }
    }
  }

  /**
   * Save everything a step can change. Used in step-by-step mode to redo
   * the last step with a different random number.
   */
  saveState(): TransportState {
    // tracks, photon and bank are cloned together so that shared track
    // objects stay shared in the copy
    const objects = structuredClone({ tracks: this.tracks, photon: this.photon, bank: this.bank });
    return {
      ...objects,
      history: this.history,
      phase: this.phase,
      photonsThisHistory: this.photonsThisHistory,
      transmittedThisHistory: this.transmittedThisHistory,
      uncollidedThisHistory: this.uncollidedThisHistory,
      s: this.s,
      boundary: { ...this.boundary },
      reaction: this.reaction,
      absorbKind: this.absorbKind,
      cosTheta: this.cosTheta,
      Enew: this.Enew,
      rng: this.rng.getState(),
      tally: this.problem.tally.snapshot(),
    };
  }

  restoreState(state: unknown): void {
    const st = state as TransportState;
    const objects = structuredClone({ tracks: st.tracks, photon: st.photon, bank: st.bank });
    this.tracks = objects.tracks;
    this.photon = objects.photon;
    this.bank = objects.bank;
    this.history = st.history;
    this.phase = st.phase;
    this.photonsThisHistory = st.photonsThisHistory;
    this.transmittedThisHistory = st.transmittedThisHistory;
    this.uncollidedThisHistory = st.uncollidedThisHistory;
    this.s = st.s;
    this.boundary = { ...st.boundary };
    this.reaction = st.reaction;
    this.absorbKind = st.absorbKind;
    this.cosTheta = st.cosTheta;
    this.Enew = st.Enew;
    this.rng.setState(st.rng);
    this.problem.tally.restore(st.tally);
    this.version++;
  }

  /**
   * Undo the last step and perform it again with the given random numbers
   * (missing values are generated as before). `before` must be the state
   * saved just before that step.
   */
  redoStep(before: unknown, xi: number[]): StepRecord {
    this.restoreState(before);
    this.rng.override(xi);
    const rec = this.step();
    this.rng.clearOverride();
    return rec;
  }

  /** Run steps until the current history is finished. */
  finishHistory(): StepRecord {
    let rec = this.step();
    let guard = 0;
    while (rec.kind !== 'historyEnd' && guard++ < 1_000_000) rec = this.step();
    return rec;
  }
}
