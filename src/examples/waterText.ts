import type { Lang } from '../i18n';

const en = {
  title: 'Neutron point source in a water sphere',
  description:
    'A monoenergetic neutron point source at the centre of a sphere of water. Neutrons slow down by collisions with hydrogen and oxygen, reach thermal equilibrium with the water molecules and are absorbed or leak out. We compute the neutron spectrum averaged over the sphere.',
  params: {
    radius: 'Sphere radius',
    energy: 'Source energy',
    histories: 'Histories to run',
    thermal: 'Thermal motion of the nuclei',
    sab: 'S(α,β) for H in H₂O, free gas for O',
    freeGas: 'Free gas at 293.6 K',
    atRest: 'Targets at rest (no thermal motion)',
    elastic: 'Elastic angular distribution',
    tabulated: 'Evaluated (ENDF/B-VII.1)',
    isotropic: 'Isotropic in CM frame',
  },
  resultsNote: 'Per source neutron, ± 1σ.',
  leaked: 'Leaked from the sphere',
  absorbed: 'Absorbed in the water',
  collisions: 'Collisions per source neutron',
  panelTitle: 'Neutron spectrum in the sphere',
  panelNote: 'Flux per unit lethargy, E·φ(E), averaged over the sphere volume (track-length estimator).',
  axisX: 'neutron energy (MeV)',
  axisY: 'E·φ(E)  (cm⁻² per source neutron)',
  flux: 'track-length estimate',
  band: '± 1σ',
  noData: 'Run some histories to see the spectrum.',
  regions: { thermal: 'thermal (Maxwellian)', slowing: 'slowing down (≈ 1/E)', source: 'source' },
  sceneLabel: (r: number) => `H₂O · r = ${r} cm`,
  about: [
    'A point source of neutrons of energy E₀ sits at the centre of a sphere of water (ρ = 1 g/cm³). Each neutron is followed collision by collision until it is absorbed or leaks out of the sphere.',
    'Data: ENDF/B-VII.1 neutron library of the NNDC (ACE, 293.6 K) for H-1 and O-16, processed with the OpenMC Python API. Elastic scattering uses the evaluated angular distributions; inelastic scattering on oxygen uses the simplified evaporation model of the Godiva example.',
    'Thermal neutrons: by default hydrogen uses the thermal scattering law S(α,β) of H bound in H₂O (ENDF/B-VII.1, NNDC ACE table HH2O.71t at 293.6 K, processed with OpenMC) below 4.46 eV. The table is used in ACE form: for each incident energy, discrete outgoing energies with their probabilities p(E′|E) and, for each of them, equiprobable cosines p(μ|E,E′). Oxygen, and hydrogen between 4.46 eV and 400 kT ≈ 10 eV, use the free-gas model. The bound hydrogen behaves as a heavier, vibrating target: the thermal spectrum is harder than with the free-gas model. With "targets at rest" there is no equilibrium: neutrons keep losing energy until they are absorbed.',
    'The spectrum is the track-length estimator: in each energy bin, the total length travelled by neutrons divided by the number of source neutrons, the sphere volume and the lethargy width of the bin. Its uncertainty comes from the spread of the per-history scores.',
  ],
};

type Text = typeof en;

const es: Text = {
  title: 'Fuente puntual de neutrones en una esfera de agua',
  description:
    'Una fuente puntual de neutrones monoenergéticos en el centro de una esfera de agua. Los neutrones se frenan por colisiones con hidrógeno y oxígeno, alcanzan el equilibrio térmico con las moléculas de agua y son absorbidos o fugan. Se calcula el espectro neutrónico promediado en la esfera.',
  params: {
    radius: 'Radio de la esfera',
    energy: 'Energía de la fuente',
    histories: 'Historias a simular',
    thermal: 'Movimiento térmico de los núcleos',
    sab: 'S(α,β) para H en H₂O, gas libre para O',
    freeGas: 'Gas libre a 293,6 K',
    atRest: 'Blancos en reposo (sin movimiento térmico)',
    elastic: 'Distribución angular elástica',
    tabulated: 'Evaluada (ENDF/B-VII.1)',
    isotropic: 'Isótropa en el sistema CM',
  },
  resultsNote: 'Por neutrón de la fuente, ± 1σ.',
  leaked: 'Fugados de la esfera',
  absorbed: 'Absorbidos en el agua',
  collisions: 'Colisiones por neutrón de la fuente',
  panelTitle: 'Espectro neutrónico en la esfera',
  panelNote: 'Flujo por unidad de letargia, E·φ(E), promediado en el volumen de la esfera (estimador de longitud de traza).',
  axisX: 'energía del neutrón (MeV)',
  axisY: 'E·φ(E)  (cm⁻² por neutrón fuente)',
  flux: 'estimador de longitud de traza',
  band: '± 1σ',
  noData: 'Simule algunas historias para ver el espectro.',
  regions: { thermal: 'térmica (maxwelliana)', slowing: 'moderación (≈ 1/E)', source: 'fuente' },
  sceneLabel: (r: number) => `H₂O · r = ${r} cm`,
  about: [
    'Una fuente puntual de neutrones de energía E₀ está en el centro de una esfera de agua (ρ = 1 g/cm³). Cada neutrón se sigue colisión a colisión hasta que es absorbido o fuga de la esfera.',
    'Datos: biblioteca neutrónica ENDF/B-VII.1 del NNDC (ACE, 293,6 K) para H-1 y O-16, procesada con la API de Python de OpenMC. La dispersión elástica usa las distribuciones angulares evaluadas; la inelástica en oxígeno usa el modelo simplificado de evaporación del ejemplo Godiva.',
    'Neutrones térmicos: por defecto el hidrógeno usa la ley de dispersión térmica S(α,β) del H ligado en H₂O (ENDF/B-VII.1, tabla ACE HH2O.71t del NNDC a 293,6 K, procesada con OpenMC) por debajo de 4,46 eV. La tabla se usa en formato ACE: para cada energía incidente, energías de salida discretas con sus probabilidades p(E′|E) y, para cada una, cosenos equiprobables p(μ|E,E′). El oxígeno, y el hidrógeno entre 4,46 eV y 400 kT ≈ 10 eV, usan el modelo de gas libre. El hidrógeno ligado se comporta como un blanco más pesado que vibra: el espectro térmico es más duro que con el gas libre. Con «blancos en reposo» no hay equilibrio: los neutrones siguen perdiendo energía hasta ser absorbidos.',
    'El espectro es el estimador de longitud de traza: en cada intervalo de energía, la longitud total recorrida por los neutrones dividida por el número de neutrones de la fuente, el volumen de la esfera y el ancho en letargia del intervalo. Su incertidumbre se obtiene de la dispersión de las puntuaciones por historia.',
  ],
};

export const WATER_TEXT: Record<Lang, Text> = { en, es };
