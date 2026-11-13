/**
 * Tallies (scores). Each history contributes a score x_i; the estimate is the
 * mean over N histories and its statistical uncertainty is
 *     σ_mean = sqrt( (⟨x²⟩ − ⟨x⟩²) / (N − 1) ).
 */

export type TallyEvent =
  | { type: 'escape'; surface: string; uncollided: boolean; primary: boolean; E: number }
  | { type: 'deposit'; E: number };

export interface Tally {
  startHistory(): void;
  score(ev: TallyEvent): void;
  endHistory(): void;
  reset(): void;
  /** Copy of the internal state, so that a step can be undone. */
  snapshot(): unknown;
  restore(state: unknown): void;
}

export class Estimator {
  n = 0;
  sum = 0;
  sumSq = 0;
  add(x: number) {
    this.n++;
    this.sum += x;
    this.sumSq += x * x;
  }
  get mean() {
    return this.n ? this.sum / this.n : 0;
  }
  get sigma() {
    if (this.n < 2) return 0;
    const m = this.mean;
    return Math.sqrt(Math.max(0, this.sumSq / this.n - m * m) / (this.n - 1));
  }
  reset() {
    this.n = this.sum = this.sumSq = 0;
  }
  snapshot() {
    return { n: this.n, sum: this.sum, sumSq: this.sumSq };
  }
  restore(s: { n: number; sum: number; sumSq: number }) {
    this.n = s.n;
    this.sum = s.sum;
    this.sumSq = s.sumSq;
  }
}

/** Transmission through a slab: number of photons leaving the back face per source photon. */
export class SlabTransmissionTally implements Tally {
  readonly total = new Estimator();
  readonly uncollided = new Estimator();
  readonly scattered = new Estimator();
  readonly reflected = new Estimator();
  private h = { total: 0, uncollided: 0, scattered: 0, reflected: 0 };

  startHistory() {
    this.h = { total: 0, uncollided: 0, scattered: 0, reflected: 0 };
  }

  score(ev: TallyEvent) {
    if (ev.type !== 'escape') return;
    if (ev.surface === 'back') {
      this.h.total++;
      if (ev.uncollided) this.h.uncollided++;
      else this.h.scattered++;
    } else if (ev.surface === 'front') {
      this.h.reflected++;
    }
  }

  endHistory() {
    this.total.add(this.h.total);
    this.uncollided.add(this.h.uncollided);
    this.scattered.add(this.h.scattered);
    this.reflected.add(this.h.reflected);
  }

  get histories() {
    return this.total.n;
  }

  reset() {
    this.total.reset();
    this.uncollided.reset();
    this.scattered.reset();
    this.reflected.reset();
  }

  snapshot() {
    return {
      h: { ...this.h },
      total: this.total.snapshot(),
      uncollided: this.uncollided.snapshot(),
      scattered: this.scattered.snapshot(),
      reflected: this.reflected.snapshot(),
    };
  }

  restore(state: unknown) {
    const s = state as ReturnType<SlabTransmissionTally['snapshot']>;
    this.h = { ...s.h };
    this.total.restore(s.total);
    this.uncollided.restore(s.uncollided);
    this.scattered.restore(s.scattered);
    this.reflected.restore(s.reflected);
  }
}
