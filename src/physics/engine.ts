/**
 * What the user interface needs from a transport engine. The photon slab
 * (transport.ts) and the neutron power iteration (neutron.ts) both provide it.
 */
import type { RNG } from './rng';
import type { Vec3 } from './sampling';

/** Polyline of one particle, drawn in the 2D/3D views. */
export interface Track {
  history: number;
  /** false for secondary particles (annihilation photons, (n,2n) neutrons) */
  primary: boolean;
  /** true while the particle has not interacted */
  uncollided: boolean;
  points: Vec3[];
  collisions: { pos: Vec3; kind: string }[];
  /** How the particle ended (engine specific, e.g. 'transmitted', 'leaked'). */
  fate?: string;
  /** For escaping particles: the last flight direction (to draw the exit ray). */
  exitDir?: Vec3;
}

export interface StepRecordBase {
  kind: string;
  /** Random numbers used in this step. */
  xi: { xi: number; manual: boolean }[];
}

export interface Engine<R extends StepRecordBase = StepRecordBase> {
  readonly rng: RNG;
  /** Completed tracks (most recent last), capped at maxTracks. */
  tracks: Track[];
  maxTracks: number;
  /** Track of the particle being followed, if any. */
  readonly currentTrack: Track | null;
  /** True when the next step starts a new history (or there is nothing left to do). */
  readonly atHistoryStart: boolean;
  /** How many random numbers the next step will use (at least). */
  readonly nextXiCount: number;
  /** Perform one elementary step. */
  step(): R;
  /** Run steps until the current history is finished. */
  finishHistory(): R;
  saveState(): unknown;
  restoreState(state: unknown): void;
  /** Undo the last step (state saved before it) and redo it with the given ξ. */
  redoStep(before: unknown, xi: number[]): R;
}
