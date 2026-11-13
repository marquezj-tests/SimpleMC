/** Number formatting helpers. */
export function fmt(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = v.toExponential(digits - 1).split('e');
    return `${m}×10${superscript(Number(e))}`;
  }
  return Number(v.toPrecision(digits)).toString();
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const superscript = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** Energy in MeV, shown in keV below 1 MeV and in eV below 1 keV. */
export function fmtE(E: number): string {
  if (E >= 1) return `${fmt(E, 4)} MeV`;
  if (E >= 1e-3) return `${fmt(E * 1e3, 4)} keV`;
  return `${fmt(E * 1e6, 4)} eV`;
}

export function fmtVec(v: { x: number; y: number; z: number }): string {
  return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}

export const deg = (rad: number) => (rad * 180) / Math.PI;
