#!/usr/bin/env node
// Downloads photon cross sections from NIST XCOM and writes them as JSON
// into src/data/xcom/. Run with:  node scripts/fetch-xcom.mjs
//
// XCOM: M.J. Berger, J.H. Hubbell, S.M. Seltzer, J. Chang, J.S. Coursey,
// R. Sukumar, D.S. Zucker, K. Olsen, "XCOM: Photon Cross Sections Database",
// NIST Standard Reference Database 8 (XGAM), https://physics.nist.gov/xcom

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'xcom');
const EMIN = 0.01; // MeV
const EMAX = 20; // MeV

// Materials. Densities and compositions (mass fractions) for water and
// ordinary concrete follow the NIST material compositions database.
const MATERIALS = [
  { id: 'Pb', name: { en: 'Lead', es: 'Plomo' }, density: 11.35, kind: 'elem', z: 82 },
  { id: 'Fe', name: { en: 'Iron', es: 'Hierro' }, density: 7.874, kind: 'elem', z: 26 },
  { id: 'H2O', name: { en: 'Water', es: 'Agua' }, density: 1.0, kind: 'comp', formula: 'H2O' },
  {
    id: 'concrete',
    name: { en: 'Ordinary concrete', es: 'Hormigón ordinario' },
    density: 2.3,
    kind: 'mix',
    mix: [
      ['H', 0.01], ['C', 0.001], ['O', 0.529107], ['Na', 0.016], ['Mg', 0.002],
      ['Al', 0.033872], ['Si', 0.337021], ['K', 0.013], ['Ca', 0.044], ['Fe', 0.014],
    ],
  },
];

// Extra energies (log-spaced, 20/decade) so that plots look smooth.
const extra = [];
for (let lg = Math.log10(EMIN); lg <= Math.log10(EMAX) + 1e-9; lg += 0.05) {
  extra.push(Number(Math.pow(10, lg).toPrecision(4)));
}

function body(m) {
  const p = new URLSearchParams();
  let url;
  if (m.kind === 'elem') {
    url = 'https://physics.nist.gov/cgi-bin/Xcom/xcom3_1';
    p.set('ZNum', String(m.z));
  } else if (m.kind === 'comp') {
    url = 'https://physics.nist.gov/cgi-bin/Xcom/xcom3_2';
    p.set('Formula', m.formula);
  } else {
    url = 'https://physics.nist.gov/cgi-bin/Xcom/xcom3_3';
    p.set('Formulae', m.mix.map(([s, w]) => `${s} ${w}`).join('\n'));
  }
  p.set('Name', m.name.en.replace(/[^A-Za-z]/g, '')); // XCOM accepts letters only
  p.set('OutOpt', 'PIC');
  p.set('Graph0', 'on');
  p.set('NumAdd', '1');
  p.set('Energies', extra.join('\n'));
  p.set('Output', 'on');
  p.set('WindowXmin', String(EMIN));
  p.set('WindowXmax', String(EMAX));
  p.set('ResizeFlag', 'on');
  return { url, body: p.toString() };
}

function parse(html) {
  const rows = [];
  const edges = [];
  for (const tr of html.split(/<tr[^>]*>/i)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length !== 9) continue;
    const nums = cells.slice(1).map((c) => Number(c.trim()));
    if (nums.some((v) => !Number.isFinite(v))) continue;
    const label = cells[0].replace(/<sub>(.*?)<\/sub>/g, '$1').replace(/&#160;/g, ' ').trim();
    if (label) edges.push({ label, E: nums[0] });
    rows.push(nums);
  }
  // Remove exact duplicate rows (an extra energy coinciding with a grid point)
  const out = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (prev && prev.every((v, i) => v === r[i])) continue;
    out.push(r);
  }
  return { rows: out, edges };
}

mkdirSync(OUT, { recursive: true });
for (const m of MATERIALS) {
  const { url, body: b } = body(m);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: b,
  });
  if (!res.ok) throw new Error(`${m.id}: HTTP ${res.status}`);
  const html = await res.text();
  const { rows, edges } = parse(html);
  if (rows.length < 20) throw new Error(`${m.id}: could not parse XCOM output`);
  const col = (i) => rows.map((r) => r[i]);
  const data = {
    id: m.id,
    name: m.name,
    density: m.density,
    composition: m.kind === 'elem' ? `Z = ${m.z}` : m.kind === 'comp' ? m.formula : m.mix.map(([s, w]) => `${s} ${w}`).join(', '),
    source: 'NIST XCOM (https://physics.nist.gov/xcom), retrieved ' + new Date().toISOString().slice(0, 10),
    units: { E: 'MeV', mu: 'cm2/g' },
    E: col(0),
    coherent: col(1),
    incoherent: col(2),
    photoelectric: col(3),
    pairNuclear: col(4),
    pairElectron: col(5),
    total: col(6),
    edges,
  };
  writeFileSync(join(OUT, `${m.id}.json`), JSON.stringify(data));
  console.log(`${m.id}: ${rows.length} energies, ${edges.length} edges`);
}
