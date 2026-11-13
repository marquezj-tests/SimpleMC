#!/usr/bin/env python3
"""
Preprocess ENDF/B-VII.1 neutron data (NNDC ACE files, 293.6 K) with the
OpenMC Python API and write the compact JSON tables embedded in SimpleMC.

Usage (needs OpenMC, e.g. `conda install -c conda-forge openmc=0.16.0`):

    # ENDF-B-VII.1-neutron-293.6K.tar.gz from
    # https://www.nndc.bnl.gov/endf-b7.1/aceFiles/
    python scripts/preprocess_openmc.py <dir with the *_293.6K.ace files> [hdf5_out_dir] [names...]

Default names: U_235 U_238 H_001 O_016 hh2o.acer (the last one is the
thermal scattering table of H in H2O, from ENDF-B-VII.1-tsl.tar.gz).

For each nuclide it
  * reads the ACE file with openmc.data.IncidentNeutron.from_ace,
  * groups the reactions used by the teaching code (elastic, inelastic,
    (n,2n), (n,3n), (n,4n), fission, capture = everything else),
  * evaluates total nu-bar (prompt + delayed) on the energy grid,
  * fits a Watt spectrum to the tabulated prompt fission spectrum,
  * tabulates the inverse CDF of the elastic centre-of-mass cosine,
  * thins the energy grid so that linear interpolation reproduces every
    cross section within TOL (TOL_LOW below E_LOW),
and optionally exports OpenMC HDF5 files (used for the reference run).
"""
import json
import sys
from pathlib import Path

import numpy as np
import openmc.data

TOL = 0.01  # relative interpolation tolerance of the thinned grid (fast range)
TOL_LOW = 0.05  # looser below E_LOW, where few neutrons of a fast system are found
E_LOW = 5.0e4  # eV
TEMP = '294K'
OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'neutron'


def xs_on_grid(nuc, mt, E):
    """Cross section of reaction mt on the full energy grid (0 below threshold)."""
    out = np.zeros_like(E)
    if mt not in nuc.reactions:
        return out
    xs = nuc.reactions[mt].xs[TEMP]
    idx = getattr(xs, '_threshold_idx', 0)
    out[idx:idx + len(xs.y)] = xs.y
    return out


def nubar(nuc, E):
    """Total nu-bar = prompt + delayed neutron yields of fission (MT18)."""
    total = np.zeros_like(E)
    for p in nuc.reactions[18].products:
        if p.particle == 'neutron':
            total += p.yield_(E)
    return total


def watt_fit(nuc, E_in=1.0e6):
    """Fit a Watt spectrum C exp(-E/a) sinh(sqrt(bE)) to the prompt fission
    spectrum tabulated for incident energy E_in (eV). Returns a [MeV], b [1/MeV]."""
    prompt = nuc.reactions[18].products[0]
    dist = prompt.distribution[0].energy  # ContinuousTabular
    i = int(np.argmin(np.abs(np.asarray(dist.energy) - E_in)))
    tab = dist.energy_out[i]
    x = np.asarray(tab.x) / 1e6  # MeV
    p = np.asarray(tab.p) * 1e6  # 1/MeV
    mask = (x > 1e-3) & (x < 15)
    x, p = x[mask], p[mask]
    best = None
    for a in np.linspace(0.7, 1.3, 121):
        for b in np.linspace(0.5, 6.0, 111):
            w = np.exp(-x / a) * np.sinh(np.sqrt(b * x))
            c = np.sum(w * p) / np.sum(w * w)
            err = np.sum((c * w - p) ** 2)
            if best is None or err < best[0]:
                best = (err, a, b)
    return float(best[1]), float(best[2]), float(dist.energy[i])


def thin(E, columns):
    """Greedy thinning: keep the fewest points such that linear interpolation
    between kept points reproduces every column within tol (relative)."""
    n = len(E)
    keep = [0]
    i = 0
    while i < n - 1:
        j = i + 2
        tol = TOL if E[i] >= E_LOW else TOL_LOW
        while j < n:
            ok = True
            x0, x1 = E[i], E[j]
            for y in columns:
                y0, y1 = y[i], y[j]
                mid = slice(i + 1, j)
                yi = y0 + (y1 - y0) * (E[mid] - x0) / (x1 - x0)
                ref = y[mid]
                scale = np.maximum(np.abs(ref), 1e-6 * np.max(np.abs(y)) + 1e-30)
                if np.any(np.abs(yi - ref) > tol * scale):
                    ok = False
                    break
            if not ok:
                break
            j += 1
        i = j - 1
        keep.append(i)
    if keep[-1] != n - 1:
        keep.append(n - 1)
    return np.array(sorted(set(keep)))


def elastic_angles(nuc, n_xi=33):
    """Inverse CDF of the centre-of-mass cosine of elastic scattering, mu(xi)
    for xi = 0, 1/(n_xi-1), ..., 1, at each tabulated incident energy."""
    ang = nuc.reactions[2].products[0].distribution[0].angle
    xi = np.linspace(0, 1, n_xi)
    table = []
    for m in ang.mu:
        x = np.linspace(-1, 1, 4001)
        if hasattr(m, 'x') and len(m.x) > 1:
            p = np.interp(x, np.asarray(m.x), np.asarray(m.p))
        else:  # isotropic
            p = np.ones_like(x)
        cdf = np.concatenate([[0], np.cumsum(0.5 * (p[1:] + p[:-1]) * np.diff(x))])
        cdf /= cdf[-1]
        table.append([round(float(v), 5) for v in np.interp(xi, cdf, x)])
    return {'E': [float(f'{e / 1e6:.6g}') for e in ang.energy], 'xi': n_xi, 'mu': table}


def sig(a, digits=5):
    return [float(f'{v:.{digits}g}') for v in a]


def process(ace_dir: Path, name: str, h5_dir: Path | None):
    nuc = openmc.data.IncidentNeutron.from_ace(str(ace_dir / f'{name}_293.6K.ace'))
    if h5_dir:
        h5_dir.mkdir(parents=True, exist_ok=True)
        nuc.export_to_hdf5(str(h5_dir / f'{nuc.name}.h5'), 'w')
    E = np.asarray(nuc.energy[TEMP])  # eV
    total = xs_on_grid(nuc, 1, E)
    elastic = xs_on_grid(nuc, 2, E)
    inelastic = xs_on_grid(nuc, 4, E) if 4 in nuc.reactions else sum(xs_on_grid(nuc, mt, E) for mt in range(51, 92))
    n2n = xs_on_grid(nuc, 16, E)
    n3n = xs_on_grid(nuc, 17, E)
    n4n = xs_on_grid(nuc, 37, E)
    fission = xs_on_grid(nuc, 18, E)
    # capture: everything else, so that the partial cross sections add up to the total
    capture = np.maximum(0.0, total - elastic - inelastic - n2n - n3n - n4n - fission)
    fissile = 18 in nuc.reactions
    nu = nubar(nuc, E) if fissile else np.zeros_like(E)
    keep = thin(E, [total, elastic, inelastic, fission, capture, n2n, nu])
    a, b, Ein = watt_fit(nuc) if fissile else (0.0, 0.0, 0.0)
    data = {
        'id': nuc.name,
        'Z': nuc.atomic_number,
        'A': nuc.mass_number,
        'awr': nuc.atomic_weight_ratio,
        'temperature': '293.6 K',
        'source': 'ENDF/B-VII.1, NNDC ACE library (293.6 K), processed with OpenMC '
        + openmc.__version__,
        'units': {'E': 'MeV', 'xs': 'barn'},
        'E': sig(E[keep] / 1e6, 7),
        'total': sig(total[keep]),
        'elastic': sig(elastic[keep]),
        'inelastic': sig(inelastic[keep]),
        'n2n': sig((n2n + n4n)[keep]),  # (n,4n) is negligible; lumped with (n,2n) as 2 extra neutrons
        'n3n': sig(n3n[keep]),
        'fission': sig(fission[keep]),
        'capture': sig(capture[keep]),
        'nu': sig(nu[keep], 5),
        'watt': {'a': round(a, 4), 'b': round(b, 4), 'fittedAt': Ein / 1e6} if fissile else None,
        'elasticMu': elastic_angles(nuc),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{nuc.name}.json').write_text(json.dumps(data, separators=(',', ':')))
    print(f'{nuc.name}: {len(E)} -> {len(keep)} energies' + (f'; Watt a={a:.4f} MeV b={b:.4f} 1/MeV' if fissile else ''))


def process_sab(path: Path, out_name: str, h5_dir: Path | None):
    """Thermal scattering law S(alpha,beta) from an ACE thermal table, kept in
    ACE form: for each incident energy, equiprobable (or "skewed") outgoing
    energies and, for each of them, equiprobable scattering cosines."""
    t = openmc.data.ThermalScattering.from_ace(str(path), name='c_H_in_H2O')
    if h5_dir:
        h5_dir.mkdir(parents=True, exist_ok=True)
        t.export_to_hdf5(str(h5_dir / f'{t.name}.h5'), 'w')
    T = t.temperatures[0]
    if t.elastic is not None:
        raise SystemExit('elastic thermal scattering is not handled')
    xs = t.inelastic.xs[T]
    dist = t.inelastic.distribution[T]  # IncoherentInelasticAEDiscrete
    data = {
        'id': t.name,
        'nuclides': t.nuclides,
        'temperature': T,
        'kT': float(t.kTs[0]) / 1e6,
        'Emax': float(t.energy_max) / 1e6,
        'source': 'ENDF/B-VII.1 thermal scattering (NNDC ACE ' + path.name + '), processed with OpenMC ' + openmc.__version__,
        'units': {'E': 'MeV', 'xs': 'barn'},
        'E': [float(f'{e / 1e6:.6g}') for e in xs.x],
        'xs': sig(xs.y, 6),
        'skewed': bool(dist.skewed),
        # outgoing energies E'[i][j] (MeV) and cosines mu[i][j][k]
        'Eout': [[float(f'{e / 1e6:.5g}') for e in row] for row in dist.energy_out],
        'mu': [[[round(float(m), 4) for m in cell] for cell in row] for row in dist.mu_out],
    }
    (OUT / f'{out_name}.json').write_text(json.dumps(data, separators=(',', ':')))
    print(f'{t.name}: {len(xs.x)} incident energies up to {t.energy_max} eV, '
          f'{len(dist.energy_out[0])} outgoing energies, {len(dist.mu_out[0][0])} cosines, skewed={dist.skewed}')


if __name__ == '__main__':
    ace_dir = Path(sys.argv[1])
    h5 = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    names = sys.argv[3:] or ['U_235', 'U_238', 'H_001', 'O_016', 'hh2o.acer']
    for n in names:
        if n.endswith('.acer'):
            # thermal scattering table (from ENDF-B-VII.1-tsl.tar.gz)
            process_sab(ace_dir / n, 'HinH2O', h5)
        else:
            process(ace_dir, n, h5)
