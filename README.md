# SimpleMC

A small Monte Carlo program for teaching the basics of **Monte Carlo radiation transport**. It runs entirely in the browser and is deployed as a GitHub Pages site.

Three examples are included. Choose one from the selector at the top of the page.

**Example 1: slab shield, parallel beam.** A parallel beam of monoenergetic photons hits a slab at normal incidence. The program estimates the fraction of photons transmitted through the back face, split into uncollided and scattered photons. It compares the uncollided part with the analytic value e^(−μt) and reports the buildup factor.

**Example 2: critical sphere (Godiva), power iteration.** A bare sphere of highly enriched uranium (HEU-MET-FAST-001: r = 8.7407 cm, ρ = 18.74 g/cm³, 93.71 wt% U-235). Neutrons are followed generation by generation, and keff is estimated in two ways:
- **Source ratio:** k = M/N, the number of fission sites banked divided by the number of source neutrons in each cycle.
- **Six-factor formula:** k = ε p P_FNL f η P_TNL, the four-factor formula with fast and thermal non-leakage, tallied with an adjustable fast/thermal cutoff Ec.

Other features:
- **Initial source:** a point at the centre, or uniform in the sphere.
- **Adjustable parameters:** radius, density and enrichment.
- **Cycles:** separate counts of inactive and active cycles.
- **Charts:** keff per cycle, the convergence of the fission source and the neutron spectrum.
- **Reference values:** the result is compared with OpenMC (same data, full physics) and with the benchmark.

**Example 3: neutron point source in a water sphere.** A monoenergetic neutron point source at the centre of a sphere of water (H-1 and O-16, ENDF/B-VII.1 via OpenMC). The track-length estimator gives the neutron spectrum averaged over the sphere, E·φ(E) per unit lethargy with ±1σ. It shows the source line, the 1/E slowing-down plateau and the thermal Maxwellian peak near 2kT. Below 400 kT, collisions use the free-gas model at 293.6 K, and its two extra steps are shown in step-by-step mode: sampling the target velocity, then scattering in the centre-of-mass frame. You can switch to targets at rest to see that without thermal motion there is no equilibrium peak. Radius, source energy and number of histories are adjustable; leakage and absorption fractions are reported.

## Modes

- **Automatic.** Histories run continuously, tracks are drawn and the tallies update live, with their statistical errors. The speed slider goes from one animated step at a time to thousands of histories per second.
- **Step by step.** A floating, draggable window explains every elementary step of the random walk:
  1. The source emits a photon.
  2. The total cross section μ/ρ(E) is plotted with the photon energy marked, and μ and the mean free path are computed.
  3. The flight distance is sampled from the CDF F(s) = 1 − e^(−μs), using s = −ln(1 − ξ)/μ. The distance to the boundary is shown.
  4. The photon moves. It either collides inside the slab or escapes, in which case it is tallied.
  5. The partial cross sections are plotted, each with its value at the photon energy marked.
  6. The reaction is chosen from the cumulative probability vector Σ μᵢ/μ using ξ.
  7. The scattering angle is sampled by inverting the Klein–Nishina or Rayleigh CDF of cos θ. The new energy is E′.
  8. The azimuth is sampled as φ = 2πξ, and the photon is given its new direction.

  Photoelectric absorption, pair production (two 511 keV photons are sent to the bank), the energy cutoff and the end of the history are also shown as steps.

  Buttons: **Next step**, **Next particle** (finishes the current history) and **Run** (steps continuously at the chosen speed). The window shows the ξ that the current step used. Students can **type their own ξ** to redo that step with it, and the plots and results update immediately. This is useful for pen-and-paper exercises.

The trajectories can be shown in a **2D** side view or an interactive **3D** view (drag to rotate, scroll to zoom). If the browser has no WebGL, the 3D view falls back to a simpler drawing on the ordinary 2D canvas. The interface is available in **English and Spanish**.

## Physics (teaching model)

| Process | Treatment |
|---|---|
| Cross sections | NIST XCOM, 10 keV – 20 MeV, log–log interpolation, absorption edges preserved |
| Incoherent (Compton) | Klein–Nishina (free electron); electron energy deposited locally |
| Coherent (Rayleigh) | Thomson angular shape 1 + cos²θ, no energy change |
| Photoelectric | Local absorption (no fluorescence) |
| Pair production (nuclear and electron field) | Kinetic energy E − 2mₑc² deposited locally; two back-to-back 511 keV photons emitted isotropically |
| Energy cutoff | Photons below the cutoff are terminated |

Angular distributions are sampled by numerically inverting their CDF, which matches the way the flight distance is sampled.

Materials: lead, iron, water and ordinary concrete (NIST composition, ρ = 2.3 g/cm³).

### Neutron physics (Godiva example)

| Item | Treatment |
|---|---|
| Data | ENDF/B-VII.1, NNDC ACE library at 293.6 K, read and processed with the OpenMC Python API (`scripts/preprocess_openmc.py`): U-235 and U-238 (U-234 counted as U-238), H-1 and O-16 |
| Thermal motion (water example) | Free-gas target velocity sampling below 400 kT at 293.6 K (no S(α,β)) |
| Cross sections | Pointwise, linear interpolation; grid thinned to 1% accuracy above 50 keV and 5% below |
| Elastic | Target at rest. Centre-of-mass angle from the evaluated angular distribution (default), or isotropic in the centre-of-mass frame as an option to show its effect on leakage |
| Inelastic, (n,2n), (n,3n) | Evaporation spectrum E′ e^(−E′/T), T = 3.2 √(E/A) MeV, isotropic emission |
| Fission | Total ν̄(E) from data; ⌊ν̄ + ξ⌋ sites banked; Watt spectrum fitted to the evaluated fission spectrum |
| Capture | Absorption without fission |

With isotropic elastic scattering, leakage from the small sphere is strongly underestimated (keff ≈ 1.10). With the evaluated angular distribution, keff ≈ 1.01, against 0.996 for OpenMC with full physics and the same data (`scripts/openmc_reference.py`, stored in `src/data/neutron/reference.json`).


## Development

```bash
npm install
npm run dev        # local development server
npm test           # physics tests (XCOM lookup, sampling, e^(−μt) check)
npm run build      # production build in dist/
```

The cross-section tables in `src/data/xcom/*.json` were downloaded from XCOM with:

```bash
npm run fetch-xcom
```

To add a material, add an entry to `MATERIALS` in `scripts/fetch-xcom.mjs`, run the script, and register the JSON file in `src/data/materials.ts`.

The neutron data in `src/data/neutron/` were produced with OpenMC 0.16.0 (from conda-forge):

```bash
# ENDF-B-VII.1-neutron-293.6K.tar.gz from https://www.nndc.bnl.gov/endf-b7.1/aceFiles/
python scripts/preprocess_openmc.py <dir with the *_293.6K.ace files> <hdf5 output dir>   # U-235, U-238, H-1, O-16
python scripts/openmc_reference.py <hdf5 output dir>
```

### Code layout

```
src/physics/      transport engines, independent of the UI
  engine.ts       interface shared by the engines (step, tracks, undo/redo of a step)
  transport.ts    photon random walk as a state machine (one call to step() = one elementary step)
  neutron.ts      neutron transport and power iteration, keff estimators, six-factor tallies
  material.ts     XCOM tables and interpolation
  sampling.ts     Klein–Nishina / Rayleigh CDFs, direction rotation
  geometry.ts     slab geometry
  tally.ts        estimators with statistical errors
  rng.ts          seeded generator with manual-ξ override
src/examples/     teaching examples: parameters, results, step-window content, charts
src/ui/           React components: step window, plots, 2D/3D views
src/i18n.ts       English / Spanish texts
```

New examples (point source, multilayer shield, detector response, …) are added by implementing the `Example` interface in `src/examples/types.ts` and registering them in `src/examples/index.ts`. An example creates a `Simulation`: an engine implementing `src/physics/engine.ts`, plus the scene to draw, the results, the step-window content and, optionally, extra charts and buttons.

## Deployment to GitHub Pages

`.github/workflows/deploy.yml` runs the tests, builds the site and publishes it on every push to `main`. Before the first deployment, go to **Settings → Pages** in the repository and set **Source** to **GitHub Actions**.

## Data credit

ENDF/B-VII.1 neutron data: M.B. Chadwick et al., Nuclear Data Sheets 112 (2011) 2887; ACE library from the National Nuclear Data Center (NNDC), Brookhaven National Laboratory. Processed with OpenMC (P.K. Romano et al., Ann. Nucl. Energy 82 (2015) 90). Godiva: ICSBEP Handbook, HEU-MET-FAST-001.

M.J. Berger, J.H. Hubbell, S.M. Seltzer, J. Chang, J.S. Coursey, R. Sukumar, D.S. Zucker and K. Olsen, *XCOM: Photon Cross Sections Database*, NIST Standard Reference Database 8 (XGAM), https://physics.nist.gov/xcom
