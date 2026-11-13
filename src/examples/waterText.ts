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
    'Thermal motion: below 400 kT (≈ 10 eV) the target velocity is sampled from the free-gas model at 293.6 K, so neutrons can gain energy and reach a Maxwellian-like equilibrium peaked near 2kT ≈ 0.05 eV in E·φ(E). Chemical binding of hydrogen in the water molecule (S(α,β)) is not included. With "targets at rest" there is no equilibrium: neutrons keep losing energy until they are absorbed.',
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
    'Movimiento térmico: por debajo de 400 kT (≈ 10 eV) la velocidad del blanco se muestrea con el modelo de gas libre a 293,6 K, de modo que los neutrones pueden ganar energía y alcanzan un equilibrio casi maxwelliano con máximo cerca de 2kT ≈ 0,05 eV en E·φ(E). No se incluye la ligadura química del hidrógeno en la molécula de agua (S(α,β)). Con «blancos en reposo» no hay equilibrio: los neutrones siguen perdiendo energía hasta ser absorbidos.',
    'El espectro es el estimador de longitud de traza: en cada intervalo de energía, la longitud total recorrida por los neutrones dividida por el número de neutrones de la fuente, el volumen de la esfera y el ancho en letargia del intervalo. Su incertidumbre se obtiene de la dispersión de las puntuaciones por historia.',
  ],
};

export const WATER_TEXT: Record<Lang, Text> = { en, es };
