#!/usr/bin/env python3
"""
Reference keff for the Godiva model used in SimpleMC, computed with OpenMC's
full continuous-energy physics and the same data (ENDF/B-VII.1, NNDC ACE,
293.6 K, U-235 and U-238 only; U-234 counted as U-238).

    python scripts/openmc_reference.py <dir with U235.h5, U238.h5 from preprocess_openmc.py>

Writes src/data/neutron/reference.json.
"""
import json
import sys
import tempfile
from pathlib import Path

import openmc

H5 = Path(sys.argv[1]).resolve()
OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'neutron' / 'reference.json'

# Godiva, HEU-MET-FAST-001: bare sphere, r = 8.7407 cm, rho = 18.74 g/cm3,
# 93.71 wt% U-235, 5.27 wt% U-238, 1.02 wt% U-234 (here counted as U-238).
R, RHO, W235 = 8.7407, 18.74, 0.9371

lib = openmc.data.DataLibrary()
for f in ('U235.h5', 'U238.h5'):
    lib.register_file(H5 / f)

with tempfile.TemporaryDirectory() as tmp:
    lib.export_to_xml(Path(tmp) / 'cross_sections.xml')
    openmc.config['cross_sections'] = Path(tmp) / 'cross_sections.xml'

    fuel = openmc.Material(name='HEU')
    fuel.add_nuclide('U235', W235, 'wo')
    fuel.add_nuclide('U238', 1 - W235, 'wo')
    fuel.set_density('g/cm3', RHO)
    sphere = openmc.Sphere(r=R, boundary_type='vacuum')
    geom = openmc.Geometry([openmc.Cell(fill=fuel, region=-sphere)])

    s = openmc.Settings()
    s.batches, s.inactive, s.particles = 220, 20, 50000
    s.source = openmc.IndependentSource(space=openmc.stats.Point())
    s.temperature = {'method': 'nearest', 'default': 294}

    model = openmc.Model(geometry=geom, materials=openmc.Materials([fuel]), settings=s)
    sp_path = model.run(cwd=tmp, output=False)
    with openmc.StatePoint(sp_path) as sp:
        k = sp.keff
        res = {
            'keff': round(k.nominal_value, 5),
            'sigma': round(k.std_dev, 5),
            'code': f'OpenMC {openmc.__version__}, continuous energy, full physics',
            'data': 'ENDF/B-VII.1 (NNDC ACE, 293.6 K): U-235 and U-238; U-234 counted as U-238',
            'particles': s.particles,
            'batches': s.batches,
            'inactive': s.inactive,
            'benchmark': {'name': 'HEU-MET-FAST-001 (Godiva)', 'keff': 1.0, 'sigma': 0.001},
        }
OUT.write_text(json.dumps(res, indent=2) + '\n')
print(res)
