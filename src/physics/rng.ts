/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Every random number ξ ∈ [0, 1) used by the transport goes through `next()`.
 * Values queued with `override()` replace the generated ones, which lets
 * students type their own ξ in step-by-step mode. The underlying generator
 * still advances, so the rest of the random sequence is unchanged.
 */
export class RNG {
  private state: number;
  private manual: number[] = [];
  /** Every ξ drawn since the last `takeDrawn()`, with whether it was typed in. */
  private drawn: { xi: number; manual: boolean }[] = [];

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  private generate(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  next(): number {
    const generated = this.generate();
    const manual = this.manual.shift();
    const xi = manual ?? generated;
    this.drawn.push({ xi, manual: manual !== undefined });
    return xi;
  }

  /** Queue values that will be returned by the next calls to `next()`. */
  override(values: number[]): void {
    this.manual = values.slice();
  }

  clearOverride(): void {
    this.manual = [];
  }

  /** Return (and forget) the ξ values drawn since the previous call. */
  takeDrawn(): { xi: number; manual: boolean }[] {
    const d = this.drawn;
    this.drawn = [];
    return d;
  }
}
