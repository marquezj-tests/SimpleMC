/**
 * Angular and energy distributions for photon scattering and the helpers used to sample
 * them. Both distributions are sampled by numerically inverting their
 * cumulative distribution function (CDF), the same idea used for the flight
 * distance, so the step-by-step window can show the CDF and the sampled value.
 */

export const ELECTRON_MASS = 0.51099895; // MeV

export interface Cdf {
  /** cos θ grid, increasing from -1 to 1 */
  mu: Float64Array;
  /** CDF values F(μ), from 0 to 1 */
  F: Float64Array;
  /** probability density p(μ), normalised */
  pdf: Float64Array;
}

/**
 * Klein–Nishina differential cross section per unit solid angle (arbitrary
 * normalisation) for a photon of energy E (MeV) scattered with cos θ = mu.
 */
export function kleinNishina(E: number, mu: number): number {
  const k = E / ELECTRON_MASS;
  const r = 1 / (1 + k * (1 - mu)); // E'/E
  return r * r * (r + 1 / r - (1 - mu * mu));
}

/** Thomson / Rayleigh angular shape (1 + cos²θ), used for coherent scattering. */
export function rayleighShape(mu: number): number {
  return 1 + mu * mu;
}

/**
 * Tabulate the CDF of cos θ for the density p(μ) ∝ f(μ). The grid is denser
 * near μ = 1 because the Klein–Nishina distribution becomes strongly forward
 * peaked at high energy.
 */
export function tabulateCdf(f: (mu: number) => number, n = 400): Cdf {
  const mu = new Float64Array(n + 1);
  const pdf = new Float64Array(n + 1);
  const F = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = 1 - i / n; // 1 → 0
    mu[i] = 1 - 2 * t * t; // -1 → 1, dense near 1
    pdf[i] = f(mu[i]);
  }
  for (let i = 1; i <= n; i++) {
    F[i] = F[i - 1] + 0.5 * (pdf[i] + pdf[i - 1]) * (mu[i] - mu[i - 1]);
  }
  const norm = F[n];
  for (let i = 0; i <= n; i++) {
    F[i] /= norm;
    pdf[i] /= norm;
  }
  return { mu, F, pdf };
}

/** Tabulate the CDF of a density p(x) ∝ f(x) on the given increasing grid. */
export function tabulateCdfOn(grid: number[], f: (x: number) => number): Cdf {
  const n = grid.length;
  const mu = Float64Array.from(grid);
  const pdf = new Float64Array(n);
  const F = new Float64Array(n);
  for (let i = 0; i < n; i++) pdf[i] = f(grid[i]);
  for (let i = 1; i < n; i++) F[i] = F[i - 1] + 0.5 * (pdf[i] + pdf[i - 1]) * (mu[i] - mu[i - 1]);
  const norm = F[n - 1];
  for (let i = 0; i < n; i++) {
    F[i] /= norm;
    pdf[i] /= norm;
  }
  return { mu, F, pdf };
}

/** Invert a tabulated CDF: find μ such that F(μ) = ξ (linear interpolation). */
export function invertCdf(cdf: Cdf, xi: number, clamp = true): number {
  const { mu, F } = cdf;
  let lo = 0;
  let hi = F.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (F[mid] <= xi) lo = mid;
    else hi = mid;
  }
  const dF = F[hi] - F[lo];
  const t = dF > 0 ? (xi - F[lo]) / dF : 0;
  const v = mu[lo] + t * (mu[hi] - mu[lo]);
  return clamp ? Math.min(1, Math.max(-1, v)) : v;
}

export const kleinNishinaCdf = (E: number) => tabulateCdf((mu) => kleinNishina(E, mu));

let rayleighCache: Cdf | null = null;
export const rayleighCdf = () => (rayleighCache ??= tabulateCdf(rayleighShape));

/** Photon energy after Compton scattering by angle θ (cos θ = mu). */
export function comptonEnergy(E: number, mu: number): number {
  return E / (1 + (E / ELECTRON_MASS) * (1 - mu));
}

export type Vec3 = { x: number; y: number; z: number };

/**
 * Rotate the unit direction d by polar angle θ (cos θ = mu) and azimuth φ
 * around itself. Standard formula used in most Monte Carlo codes.
 */
export function rotate(d: Vec3, mu: number, phi: number): Vec3 {
  const sinT = Math.sqrt(Math.max(0, 1 - mu * mu));
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const { x: u, y: v, z: w } = d;
  let out: Vec3;
  if (Math.abs(w) > 0.99999) {
    out = { x: sinT * cosP, y: sinT * sinP, z: Math.sign(w) * mu };
  } else {
    const tmp = Math.sqrt(1 - w * w);
    out = {
      x: (sinT * (u * w * cosP - v * sinP)) / tmp + u * mu,
      y: (sinT * (v * w * cosP + u * sinP)) / tmp + v * mu,
      z: -sinT * cosP * tmp + w * mu,
    };
  }
  const n = Math.hypot(out.x, out.y, out.z);
  return { x: out.x / n, y: out.y / n, z: out.z / n };
}

/** Isotropic direction from two random numbers. */
export function isotropic(xi1: number, xi2: number): Vec3 {
  const mu = 2 * xi1 - 1;
  const phi = 2 * Math.PI * xi2;
  const s = Math.sqrt(1 - mu * mu);
  return { x: s * Math.cos(phi), y: s * Math.sin(phi), z: mu };
}
