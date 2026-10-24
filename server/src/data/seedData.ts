import { Satellite, ConjunctionEvent, OperationalEvent, SystemSettings, DataProvenance } from '../types.js';

const DEMO_PROVENANCE: DataProvenance = {
  source: 'SYNTHETIC_DEMO',
  provider: 'SOS Space Surveillance Simulation Feed (SSN-Sim)',
  timestamp: new Date().toISOString(),
  isDeterministicDemo: true,
  confidenceScore: 0.96,
  notes: 'High-fidelity deterministic orbital demo scenario for operator simulation and validation.'
};

export const SEED_SATELLITES: Satellite[] = [
  {
    id: 'SAT-LEO-02',
    noradId: 49211,
    name: 'SENTINEL-X',
    callsign: 'SNX-02',
    internationalDesignator: '2021-088B',
    orbitClass: 'LEO',
    operationalStatus: 'CRITICAL_RISK',
    massKg: 1250,
    dryMassKg: 1050,
    remainingFuelKg: 128.5,
    fuelCapacityKg: 200,
    propellantType: 'HYDRAZINE',
    ispSeconds: 220,
    orbit: {
      semiMajorAxisKm: 7058.14,
      eccentricity: 0.00142,
      inclinationDeg: 97.4,
      raanDeg: 145.2,
      argOfPerigeeDeg: 82.5,
      trueAnomalyDeg: 218.4,
      altitudeKm: 680.1,
      orbitalPeriodMinutes: 98.3,
      epoch: new Date().toISOString()
    },
    subsystems: {
      power: 'NOMINAL',
      propulsion: 'NOMINAL',
      adcs: 'LOCKED',
      comms: 'ONLINE'
    },
    lastContact: '3 mins ago (Svalbard KSAT Station)',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'SAT-LEO-01',
    noradId: 54890,
    name: 'AURA-1',
    callsign: 'AUR-01',
    internationalDesignator: '2022-114A',
    orbitClass: 'SSO',
    operationalStatus: 'OPERATIONAL',
    massKg: 850,
    dryMassKg: 720,
    remainingFuelKg: 114.4,
    fuelCapacityKg: 130,
    propellantType: 'HYDRAZINE',
    ispSeconds: 215,
    orbit: {
      semiMajorAxisKm: 6928.14,
      eccentricity: 0.00085,
      inclinationDeg: 98.2,
      raanDeg: 210.6,
      argOfPerigeeDeg: 45.1,
      trueAnomalyDeg: 132.8,
      altitudeKm: 550.0,
      orbitalPeriodMinutes: 95.6,
      epoch: new Date().toISOString()
    },
    subsystems: {
      power: 'NOMINAL',
      propulsion: 'NOMINAL',
      adcs: 'LOCKED',
      comms: 'ONLINE'
    },
    lastContact: '7 mins ago (Tromsø Station)',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'SAT-MEO-03',
    noradId: 40122,
    name: 'NAVGUIDE-4',
    callsign: 'NVG-04',
    internationalDesignator: '2014-045A',
    orbitClass: 'MEO',
    operationalStatus: 'OPERATIONAL',
    massKg: 1980,
    dryMassKg: 1600,
    remainingFuelKg: 349.6,
    fuelCapacityKg: 380,
    propellantType: 'HYDRAZINE',
    ispSeconds: 290,
    orbit: {
      semiMajorAxisKm: 26560.0,
      eccentricity: 0.0021,
      inclinationDeg: 55.0,
      raanDeg: 68.4,
      argOfPerigeeDeg: 190.2,
      trueAnomalyDeg: 42.1,
      altitudeKm: 20182.0,
      orbitalPeriodMinutes: 718.0,
      epoch: new Date().toISOString()
    },
    subsystems: {
      power: 'NOMINAL',
      propulsion: 'NOMINAL',
      adcs: 'LOCKED',
      comms: 'ONLINE'
    },
    lastContact: '14 mins ago (Diego Garcia Station)',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'SAT-GEO-01',
    noradId: 38920,
    name: 'AEROLINK-G1',
    callsign: 'ALK-G1',
    internationalDesignator: '2012-058A',
    orbitClass: 'GEO',
    operationalStatus: 'OPERATIONAL',
    massKg: 3400,
    dryMassKg: 2400,
    remainingFuelKg: 780.0,
    fuelCapacityKg: 1000,
    propellantType: 'ELECTRIC_ION',
    ispSeconds: 1650,
    orbit: {
      semiMajorAxisKm: 42164.14,
      eccentricity: 0.00012,
      inclinationDeg: 0.04,
      raanDeg: 12.0,
      argOfPerigeeDeg: 0.0,
      trueAnomalyDeg: 89.2,
      altitudeKm: 35786.0,
      orbitalPeriodMinutes: 1436.1,
      epoch: new Date().toISOString()
    },
    subsystems: {
      power: 'NOMINAL',
      propulsion: 'NOMINAL',
      adcs: 'LOCKED',
      comms: 'ONLINE'
    },
    lastContact: 'Continuous telemetry lock (Perth Earth Station)',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'SAT-LEO-04',
    noradId: 51204,
    name: 'POLAR-OBS-3',
    callsign: 'PLR-03',
    internationalDesignator: '2022-005C',
    orbitClass: 'LEO',
    operationalStatus: 'DEGRADED',
    massKg: 1100,
    dryMassKg: 950,
    remainingFuelKg: 42.0,
    fuelCapacityKg: 150,
    propellantType: 'HYDRAZINE',
    ispSeconds: 210,
    orbit: {
      semiMajorAxisKm: 7098.14,
      eccentricity: 0.0031,
      inclinationDeg: 98.6,
      raanDeg: 330.1,
      argOfPerigeeDeg: 112.4,
      trueAnomalyDeg: 78.9,
      altitudeKm: 720.0,
      orbitalPeriodMinutes: 99.1,
      epoch: new Date().toISOString()
    },
    subsystems: {
      power: 'DEGRADED',
      propulsion: 'CHARGING',
      adcs: 'LOCKED',
      comms: 'ONLINE'
    },
    lastContact: '21 mins ago (McMurdo Station)',
    provenance: DEMO_PROVENANCE
  }
];

export const SEED_CONJUNCTIONS: ConjunctionEvent[] = [
  {
    id: 'CONJ-2026-084',
    code: 'ALPHA-THREAT',
    primarySatelliteId: 'SAT-LEO-02',
    primarySatelliteName: 'SENTINEL-X',
    secondaryObjectId: 'DEB-1993-024CZ',
    secondaryObjectName: 'COSMOS-2251 DEBRIS (FRAG #23419)',
    secondaryObjectType: 'DEBRIS',
    tca: new Date(Date.now() + 15502 * 1000).toISOString(),
    timeToTcaSeconds: 15502,
    missDistanceKm: {
      total: 0.184,
      radial: -0.042,
      inTrack: 0.165,
      crossTrack: 0.071
    },
    relativeVelocityKmS: 14.28,
    collisionProbability: 0.00482,
    collisionProbabilityConfidence: 'HIGH',
    riskLevel: 'CRITICAL',
    status: 'UNDER_REVIEW',
    isFeaturedScenario: true,
    provenance: DEMO_PROVENANCE,
    notes: 'Primary collision risk. Miss distance 184m at 14.28 km/s relative speed. Pc exceeds threshold (1e-4). Operator intervention required.'
  },
  {
    id: 'CONJ-2026-085',
    code: 'BETA-WATCH',
    primarySatelliteId: 'SAT-LEO-01',
    primarySatelliteName: 'AURA-1',
    secondaryObjectId: 'DEB-2007-006EU',
    secondaryObjectName: 'FENGYUN-1C DEBRIS (FRAG #31402)',
    secondaryObjectType: 'DEBRIS',
    tca: new Date(Date.now() + 68200 * 1000).toISOString(),
    timeToTcaSeconds: 68200,
    missDistanceKm: {
      total: 1.42,
      radial: 0.38,
      inTrack: 1.25,
      crossTrack: -0.54
    },
    relativeVelocityKmS: 12.14,
    collisionProbability: 0.000041,
    collisionProbabilityConfidence: 'ESTIMATED',
    riskLevel: 'WATCH',
    status: 'DETECTED',
    isFeaturedScenario: false,
    provenance: DEMO_PROVENANCE,
    notes: 'Secondary conjunction alert in observation window. Miss distance 1.42 km.'
  },
  {
    id: 'CONJ-2026-081',
    code: 'GAMMA-CLEAR',
    primarySatelliteId: 'SAT-LEO-04',
    primarySatelliteName: 'POLAR-OBS-3',
    secondaryObjectId: 'RKB-2018-099B',
    secondaryObjectName: 'CZ-3B R/B SPENT STAGE',
    secondaryObjectType: 'ROCKET_BODY',
    tca: new Date(Date.now() - 14400 * 1000).toISOString(),
    timeToTcaSeconds: -14400,
    missDistanceKm: {
      total: 3.85,
      radial: 1.1,
      inTrack: 3.4,
      crossTrack: 1.2
    },
    relativeVelocityKmS: 9.88,
    collisionProbability: null,
    collisionProbabilityConfidence: 'INSUFFICIENT_COVARIANCE',
    riskLevel: 'NEGLIGIBLE',
    status: 'CLEARED',
    isFeaturedScenario: false,
    provenance: DEMO_PROVENANCE,
    notes: 'Encounter past TCA. Tracked miss distance 3.85 km confirmed clear.'
  }
];

export const SEED_EVENTS: OperationalEvent[] = [
  {
    id: 'EVT-1008',
    timestamp: new Date(Date.now() - 360000).toISOString(),
    category: 'CONJUNCTION',
    severity: 'CRITICAL',
    title: 'Critical Conjunction Escalation',
    description: 'CONJ-2026-084 promoted to CRITICAL. Miss distance 184m, Pc = 4.82e-3 against COSMOS-2251 debris fragment.',
    associatedSatelliteId: 'SAT-LEO-02',
    associatedConjunctionId: 'CONJ-2026-084',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1007',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    category: 'TELEMETRY',
    severity: 'INFO',
    title: 'Svalbard KSAT Pass Completed',
    description: 'Telemetry lock acquired for SENTINEL-X. Propulsion pressure nominal at 22.4 bar, battery SOC 94%.',
    associatedSatelliteId: 'SAT-LEO-02',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1006',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    category: 'CONJUNCTION',
    severity: 'WARNING',
    title: 'Conjunction Screening Updated',
    description: '14-day screening cycle processed 24,190 tracked space catalog objects against 5 active fleet assets.',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1005',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    category: 'PROPULSION',
    severity: 'INFO',
    title: 'Thruster Line Pre-Heat Complete',
    description: 'SENTINEL-X RCS manifold pre-heat verification successful. System ready for Delta-V commands.',
    associatedSatelliteId: 'SAT-LEO-02',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1004',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    category: 'CONJUNCTION',
    severity: 'SUCCESS',
    title: 'Encounter Cleared: CONJ-2026-081',
    description: 'POLAR-OBS-3 encounter with CZ-3B upper stage passed TCA safely with 3.85 km clearance.',
    associatedSatelliteId: 'SAT-LEO-04',
    associatedConjunctionId: 'CONJ-2026-081',
    provenance: DEMO_PROVENANCE
  }
];

export const DEFAULT_SETTINGS: SystemSettings = {
  dataMode: 'DEMO',
  criticalMissDistanceThresholdKm: 0.5,
  warningMissDistanceThresholdKm: 2.0,
  criticalCollisionProbabilityThreshold: 0.0001,
  telemetryRefreshIntervalSeconds: 15,
  activeScenarioId: 'CONJ-2026-084',
  noradAutoSync: false,
  operatorCallsign: 'OPS-ALPHA-LEAD'
};
