/**
 * Photon interaction data for a material, tabulated by NIST XCOM.
 *
 * XCOM gives mass attenuation coefficients μ/ρ (cm²/g) for each process on an
 * energy grid. Absorption edges appear as two rows with the same energy
 * (below and above the edge). Values between grid points are obtained by
 * log-log interpolation, the standard practice for XCOM data.
 */

export const REACTIONS = ['photoelectric', 'incoherent', 'coherent', 'pairNuclear', 'pairElectron'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface XcomTable {
  id: string;
  name: { en: string; es: string };
  density: number;
  composition: string;
  source: string;
  E: number[];
  coherent: number[];
  incoherent: number[];
  photoelectric: number[];
  pairNuclear: number[];
  pairElectron: number[];
  total: number[];
  edges: { label: string; E: number }[];
}

/** Mass attenuation coefficients μ/ρ (cm²/g) for each reaction. */
export type Partials = Record<Reaction, number>;

export class Material {
  readonly id: string;
  readonly name: { en: string; es: string };
  readonly density: number;
  readonly table: XcomTable;
  readonly Emin: number;
  readonly Emax: number;

  constructor(table: XcomTable) {
    this.table = table;
    this.id = table.id;
    this.name = table.name;
    this.density = table.density;
    this.Emin = table.E[0];
    this.Emax = table.E[table.E.length - 1];
  }

  /**
   * Index i such that E[i] <= E < E[i+1]. When E sits exactly on an edge the
   * upper (above-edge) row is chosen.
   */
  private interval(E: number): number {
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
    // Skip zero-width (edge) intervals
    while (lo < g.length - 2 && g[lo + 1] === g[lo]) lo++;
    return lo;
  }

  private interp(values: number[], E: number, i: number): number {
    const g = this.table.E;
    const x0 = g[i];
    const x1 = g[i + 1];
    const y0 = values[i];
    const y1 = values[i + 1];
    if (x1 === x0) return y1;
    if (y0 <= 0 || y1 <= 0) {
      // log-log is undefined at zero (e.g. pair production near threshold)
      const v = y0 + ((y1 - y0) * (E - x0)) / (x1 - x0);
      return Math.max(0, v);
    }
    const t = Math.log(E / x0) / Math.log(x1 / x0);
    return Math.exp(Math.log(y0) + t * Math.log(y1 / y0));
  }

  /** Partial mass attenuation coefficients μ/ρ (cm²/g) at energy E (MeV). */
  massPartials(E: number): Partials {
    const i = this.interval(E);
    const t = this.table;
    return {
      photoelectric: this.interp(t.photoelectric, E, i),
      incoherent: this.interp(t.incoherent, E, i),
      coherent: this.interp(t.coherent, E, i),
      pairNuclear: E < 1.022 ? 0 : this.interp(t.pairNuclear, E, i),
      pairElectron: E < 2.044 ? 0 : this.interp(t.pairElectron, E, i),
    };
  }

  /** Total mass attenuation coefficient μ/ρ (cm²/g): sum of the partials. */
  massTotal(E: number): number {
    const p = this.massPartials(E);
    return REACTIONS.reduce((s, r) => s + p[r], 0);
  }

  /** Linear attenuation coefficient μ (1/cm). */
  mu(E: number): number {
    return this.massTotal(E) * this.density;
  }
}
