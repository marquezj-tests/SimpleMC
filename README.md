# SimpleMC

A small Monte Carlo program for teaching the basics of **Monte Carlo radiation transport**. It runs entirely in the browser and is deployed as a GitHub Pages site.

**Example 1: slab shield, parallel beam.** A parallel beam of monoenergetic photons hits a slab at normal incidence. The program estimates the fraction of photons transmitted through the back face, split into uncollided and scattered photons. It compares the uncollided part with the analytic value e^(−μt) and reports the buildup factor.

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

### Code layout

```
src/physics/      transport engine, independent of the UI
  transport.ts    random walk as a state machine (one call to step() = one elementary step)
  material.ts     XCOM tables and interpolation
  sampling.ts     Klein–Nishina / Rayleigh CDFs, direction rotation
  geometry.ts     slab geometry
  tally.ts        estimators with statistical errors
  rng.ts          seeded generator with manual-ξ override
src/examples/     teaching examples (geometry + source + tally + results)
src/ui/           React components: step window, plots, 2D/3D views
src/i18n.ts       English / Spanish texts
```

New examples (point source, multilayer shield, detector response, …) are added by implementing the `Example` interface in `src/examples/types.ts` and registering them in `src/examples/index.ts`.

## Deployment to GitHub Pages

`.github/workflows/deploy.yml` runs the tests, builds the site and publishes it on every push to `main`. Before the first deployment, go to **Settings → Pages** in the repository and set **Source** to **GitHub Actions**.

## Data credit

M.J. Berger, J.H. Hubbell, S.M. Seltzer, J. Chang, J.S. Coursey, R. Sukumar, D.S. Zucker and K. Olsen, *XCOM: Photon Cross Sections Database*, NIST Standard Reference Database 8 (XGAM), https://physics.nist.gov/xcom
