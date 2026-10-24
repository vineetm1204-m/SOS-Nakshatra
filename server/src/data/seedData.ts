import { 
  Satellite, 
  SpaceObject, 
  ConjunctionEvent, 
  ManeuverCandidate, 
  PostManeuverProjection, 
  FlightDirectorAssessment, 
  OperationalEvent, 
  SystemSettings, 
  DataProvenance,
  DeterministicScenario
} from '../types.js';

// Deterministic Reference Epoch (Fixed ISO timestamp for reproducible orbital calculations)
export const SCENARIO_EPOCH = '2026-10-24T12:00:00.000Z';
export const TCA_EPOCH = '2026-10-24T16:18:22.000Z'; // 4 hours 18 mins 22 secs post epoch
export const MANEUVER_EXEC_EPOCH = '2026-10-24T13:48:00.000Z'; // T-02h 30m prior to TCA

export const DEMO_PROVENANCE: DataProvenance = {
  source: 'SYNTHETIC_DEMO',
  provider: 'SOS Space Surveillance Simulation Feed (SSN-Sim)',
  timestamp: SCENARIO_EPOCH,
  isDeterministicDemo: true,
  confidenceScore: 0.96,
  notes: 'High-fidelity deterministic orbital demo scenario for operator simulation and validation.'
};

// ============================================================================
// 1. Trackable Space Objects (Satellites & Tracked Debris)
// ============================================================================

export const SEED_SATELLITES: Satellite[] = [
  {
    id: 'SAT-LEO-02',
    noradId: 49211,
    name: 'SENTINEL-X',
    callsign: 'SNX-02',
    internationalDesignator: '2021-088B',
    objectType: 'PAYLOAD',
    orbitClass: 'LEO',
    operationalStatus: 'CRITICAL_RISK',
    orbitDataStatus: 'VALID',
    dataEpoch: SCENARIO_EPOCH,
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
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: -3540.21, y: 5210.84, z: 3290.15 },
      velocityVectorKmS: { x: -5.421, y: -2.894, z: 4.102 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    telemetry: {
      massKg: 1250.0,
      dryMassKg: 1050.0,
      remainingFuelKg: 128.5,
      fuelCapacityKg: 200.0,
      batteryStateOfChargePct: 94.2,
      manifoldPressureBar: 22.8,
      solarArrayCurrentAmps: 18.4,
      temperatureCelsius: 14.8
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
    objectType: 'PAYLOAD',
    orbitClass: 'SSO',
    operationalStatus: 'OPERATIONAL',
    orbitDataStatus: 'VALID',
    dataEpoch: SCENARIO_EPOCH,
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
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: 4210.55, y: -2890.12, z: 4890.34 },
      velocityVectorKmS: { x: 3.12, y: 6.42, z: 2.15 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    telemetry: {
      massKg: 850.0,
      dryMassKg: 720.0,
      remainingFuelKg: 114.4,
      fuelCapacityKg: 130.0,
      batteryStateOfChargePct: 98.0,
      manifoldPressureBar: 21.5,
      solarArrayCurrentAmps: 14.2,
      temperatureCelsius: 16.2
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
    objectType: 'PAYLOAD',
    orbitClass: 'MEO',
    operationalStatus: 'OPERATIONAL',
    orbitDataStatus: 'VALID',
    dataEpoch: SCENARIO_EPOCH,
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
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: 18200.0, y: 14500.0, z: 12100.0 },
      velocityVectorKmS: { x: -1.95, y: 2.45, z: 2.10 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    telemetry: {
      massKg: 1980.0,
      dryMassKg: 1600.0,
      remainingFuelKg: 349.6,
      fuelCapacityKg: 380.0,
      batteryStateOfChargePct: 91.5,
      manifoldPressureBar: 24.1,
      solarArrayCurrentAmps: 22.0,
      temperatureCelsius: 12.0
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
    objectType: 'PAYLOAD',
    orbitClass: 'GEO',
    operationalStatus: 'OPERATIONAL',
    orbitDataStatus: 'VALID',
    dataEpoch: SCENARIO_EPOCH,
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
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: 42150.0, y: 1100.0, z: 25.0 },
      velocityVectorKmS: { x: -0.08, y: 3.07, z: 0.01 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    telemetry: {
      massKg: 3400.0,
      dryMassKg: 2400.0,
      remainingFuelKg: 780.0,
      fuelCapacityKg: 1000.0,
      batteryStateOfChargePct: 99.4,
      manifoldPressureBar: 2.1,
      solarArrayCurrentAmps: 34.5,
      temperatureCelsius: 19.5
    },
    subsystems: {
      power: 'NOMINAL',
      propulsion: 'NOMINAL',
      adcs: 'LOCKED',
      comms: 'ONLINE'
    },
    lastContact: 'Continuous lock (Perth Earth Station)',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'SAT-LEO-04',
    noradId: 51204,
    name: 'POLAR-OBS-3',
    callsign: 'PLR-03',
    internationalDesignator: '2022-005C',
    objectType: 'PAYLOAD',
    orbitClass: 'LEO',
    operationalStatus: 'DEGRADED',
    orbitDataStatus: 'DEGRADED',
    dataEpoch: SCENARIO_EPOCH,
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
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: -1200.4, y: -4500.1, z: 5350.8 },
      velocityVectorKmS: { x: 6.21, y: -3.85, z: -1.2 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    telemetry: {
      massKg: 1100.0,
      dryMassKg: 950.0,
      remainingFuelKg: 42.0,
      fuelCapacityKg: 150.0,
      batteryStateOfChargePct: 62.1,
      manifoldPressureBar: 18.2,
      solarArrayCurrentAmps: 8.5,
      temperatureCelsius: 24.1
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

// Secondary Tracked Debris & Upper Stage Objects
export const SEED_SPACE_OBJECTS: SpaceObject[] = [
  {
    id: 'DEB-1993-024CZ',
    noradId: 23419,
    name: 'COSMOS-2251 DEBRIS (FRAG #23419)',
    internationalDesignator: '1993-036CZ',
    objectType: 'DEBRIS',
    radarCrossSectionM2: 0.12,
    orbitClass: 'LEO',
    orbit: {
      semiMajorAxisKm: 7062.5,
      eccentricity: 0.0045,
      inclinationDeg: 74.0,
      raanDeg: 12.4,
      argOfPerigeeDeg: 210.0,
      trueAnomalyDeg: 140.2,
      altitudeKm: 684.3,
      orbitalPeriodMinutes: 98.4,
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: -3540.35, y: 5210.98, z: 3290.08 },
      velocityVectorKmS: { x: 4.82, y: 8.12, z: -9.54 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'DEB-2007-006EU',
    noradId: 31402,
    name: 'FENGYUN-1C DEBRIS (FRAG #31402)',
    internationalDesignator: '1999-025EU',
    objectType: 'DEBRIS',
    radarCrossSectionM2: 0.08,
    orbitClass: 'LEO',
    orbit: {
      semiMajorAxisKm: 6932.0,
      eccentricity: 0.0062,
      inclinationDeg: 98.8,
      raanDeg: 220.1,
      argOfPerigeeDeg: 80.5,
      trueAnomalyDeg: 110.0,
      altitudeKm: 554.0,
      orbitalPeriodMinutes: 95.7,
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: 4211.8, y: -2888.9, z: 4891.0 },
      velocityVectorKmS: { x: -4.1, y: 7.2, z: -1.8 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'RKB-2018-099B',
    noradId: 43801,
    name: 'CZ-3B R/B SPENT STAGE',
    internationalDesignator: '2018-099B',
    objectType: 'ROCKET_BODY',
    radarCrossSectionM2: 4.80,
    orbitClass: 'LEO',
    orbit: {
      semiMajorAxisKm: 7105.0,
      eccentricity: 0.012,
      inclinationDeg: 55.4,
      raanDeg: 180.0,
      argOfPerigeeDeg: 90.0,
      trueAnomalyDeg: 15.0,
      altitudeKm: 727.0,
      orbitalPeriodMinutes: 99.2,
      epoch: SCENARIO_EPOCH
    },
    stateVector: {
      timestamp: SCENARIO_EPOCH,
      positionVectorKm: { x: -1197.0, y: -4503.2, z: 5352.0 },
      velocityVectorKmS: { x: -2.1, y: 5.4, z: 5.8 },
      referenceFrame: 'ECI_J2000',
      units: { position: 'km', velocity: 'km/s' }
    },
    provenance: DEMO_PROVENANCE
  }
];

// ============================================================================
// 2. Conjunction Events
// ============================================================================

export const SEED_CONJUNCTIONS: ConjunctionEvent[] = [
  {
    id: 'CONJ-2026-084',
    code: 'ALPHA-THREAT',
    primarySatelliteId: 'SAT-LEO-02',
    primarySatelliteName: 'SENTINEL-X',
    secondaryObjectId: 'DEB-1993-024CZ',
    secondaryObjectName: 'COSMOS-2251 DEBRIS (FRAG #23419)',
    secondaryObjectType: 'DEBRIS',
    tca: TCA_EPOCH,
    timeToTcaSeconds: 15502, // 4 hours 18 mins 22 secs
    missDistanceKm: {
      total: 0.184, // 184 meters
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
    tca: '2026-10-25T06:56:40.000Z',
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
    tca: '2026-10-24T08:00:00.000Z',
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

// ============================================================================
// 3. Candidate Avoidance Maneuver
// ============================================================================

export const SEED_CANDIDATE_MANEUVER: ManeuverCandidate = {
  id: 'MAN-2026-084-A',
  conjunctionId: 'CONJ-2026-084',
  targetObjectId: 'SAT-LEO-02',
  executionTime: MANEUVER_EXEC_EPOCH,
  burnDirection: 'ALONG_TRACK_POS',
  deltaVVectorMps: {
    radial: 0.0,
    inTrack: 0.85,
    crossTrack: 0.0
  },
  deltaVMagnitudeMps: 0.85,
  estimatedPropellantKg: 0.49,
  burnDurationSeconds: 3.4,
  assumptions: [
    'Hydrazine Thruster Isp = 220.0 seconds',
    'Spacecraft Wet Mass m0 = 1250.0 kg',
    'Mass flow rate = 0.144 kg/s',
    'Pure In-Track (+V) burn orientation',
    'Zero cross-track coupling perturbation'
  ],
  status: 'DRAFT'
};

// ============================================================================
// 4. Post-Maneuver Trajectory Projection
// ============================================================================

export const SEED_POST_MANEUVER_PROJECTION: PostManeuverProjection = {
  missDistanceKm: {
    total: 2.45, // 2,450 meters
    radial: 0.38,
    inTrack: 2.41,
    crossTrack: 0.09
  },
  collisionProbability: 8.5e-8,
  riskLevel: 'NEGLIGIBLE',
  status: 'CLEARED',
  clearanceConfidence: 'HIGH',
  notes: 'Post-burn trajectory clearance confirmed. Miss distance expanded from 184m to 2,450m. Pc reduced below 1.0e-7 threshold.'
};

// ============================================================================
// 5. Flight Director Assessment
// ============================================================================

export const SEED_FLIGHT_DIRECTOR_ASSESSMENT: FlightDirectorAssessment = {
  id: 'FDA-2026-084',
  conjunctionId: 'CONJ-2026-084',
  targetSatelliteId: 'SAT-LEO-02',
  timestamp: SCENARIO_EPOCH,
  summary: 'MANDATED AVOIDANCE BURN: Miss distance (184m) and collision probability (4.82e-3) violate safe orbit bounds.',
  severity: 'CRITICAL',
  evidence: [
    'Conjunction ID: CONJ-2026-084',
    'Target Asset: SENTINEL-X (SAT-LEO-02)',
    'Intersecting Object: COSMOS-2251 Debris fragment #23419',
    'Total Miss Distance: 184 meters (Redline: 500m)',
    'Relative Speed: 14.28 km/s (Hypervelocity encounter)',
    'Collision Probability: 4.82e-03 (NASA/ESA Redline: 1.0e-04)',
    'Time to TCA: 04h 18m 22s',
    'Subsystem Check: Propulsion nominal, battery 94.2%, propellant reserve 128.5 kg'
  ],
  recommendedNextAction: 'Execute Maneuver Plan MAN-2026-084-A (+0.85 m/s In-Track) at T-02h 30m.',
  assumptions: [
    'Debris orbit propagated from high-confidence NORAD radar track',
    'Sentinel-X GPS ephemeris error covariance < 15m (1-sigma)',
    'Akella-Alfriend 2D collision probability model valid in encounter B-plane'
  ],
  sourceType: 'DETERMINISTIC_FALLBACK',
  operatorApprovalRequired: true,
  operatorApproved: false
};

// ============================================================================
// 6. Timeline Operational Events (Chronological Ledger)
// ============================================================================

export const SEED_EVENTS: OperationalEvent[] = [
  {
    id: 'EVT-1008',
    timestamp: '2026-10-24T11:45:00.000Z',
    category: 'CONJUNCTION',
    severity: 'CRITICAL',
    title: 'Critical Conjunction Escalation',
    description: 'CONJ-2026-084 promoted to CRITICAL. Miss distance 184m, Pc = 4.82e-3 against COSMOS-2251 debris fragment.',
    associatedSatelliteId: 'SAT-LEO-02',
    associatedConjunctionId: 'CONJ-2026-084',
    metadata: {
      missDistanceMeters: 184,
      collisionProbability: 0.00482,
      tca: TCA_EPOCH
    },
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1007',
    timestamp: '2026-10-24T11:15:00.000Z',
    category: 'TELEMETRY',
    severity: 'INFO',
    title: 'Svalbard KSAT Pass Completed',
    description: 'Telemetry lock acquired for SENTINEL-X. Propulsion pressure nominal at 22.8 bar, battery SOC 94.2%.',
    associatedSatelliteId: 'SAT-LEO-02',
    metadata: {
      station: 'SVALBARD_KSAT',
      manifoldPressureBar: 22.8,
      batterySoc: 94.2
    },
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1006',
    timestamp: '2026-10-24T10:00:00.000Z',
    category: 'CONJUNCTION',
    severity: 'WARNING',
    title: 'Conjunction Screening Cycle Completed',
    description: '14-day screening cycle processed 24,190 tracked space catalog objects against 5 active fleet assets.',
    metadata: {
      catalogObjectsScanned: 24190,
      activeFleetAssets: 5
    },
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1005',
    timestamp: '2026-10-24T08:30:00.000Z',
    category: 'PROPULSION',
    severity: 'INFO',
    title: 'Thruster Line Pre-Heat Complete',
    description: 'SENTINEL-X RCS manifold pre-heat verification successful. System ready for Delta-V commands.',
    associatedSatelliteId: 'SAT-LEO-02',
    provenance: DEMO_PROVENANCE
  },
  {
    id: 'EVT-1004',
    timestamp: '2026-10-24T08:00:00.000Z',
    category: 'CONJUNCTION',
    severity: 'SUCCESS',
    title: 'Encounter Cleared: CONJ-2026-081',
    description: 'POLAR-OBS-3 encounter with CZ-3B upper stage passed TCA safely with 3.85 km clearance.',
    associatedSatelliteId: 'SAT-LEO-04',
    associatedConjunctionId: 'CONJ-2026-081',
    metadata: {
      clearedMissDistanceKm: 3.85
    },
    provenance: DEMO_PROVENANCE
  }
];

// ============================================================================
// 7. Complete Unified Deterministic Scenario
// ============================================================================

export const SEED_DETERMINISTIC_SCENARIO: DeterministicScenario = {
  scenarioId: 'SCENARIO-ALPHA-2026-084',
  title: 'SENTINEL-X vs COSMOS-2251 Hypervelocity Debris Conjunction',
  description: 'Deterministic 184m critical close approach in LEO (680 km) requiring along-track avoidance maneuver.',
  trackableObjects: [...SEED_SATELLITES, ...SEED_SPACE_OBJECTS],
  featuredConjunction: SEED_CONJUNCTIONS[0],
  candidateManeuver: SEED_CANDIDATE_MANEUVER,
  postManeuverProjection: SEED_POST_MANEUVER_PROJECTION,
  flightDirectorAssessment: SEED_FLIGHT_DIRECTOR_ASSESSMENT,
  timelineEvents: SEED_EVENTS
};

export const DEFAULT_SETTINGS: SystemSettings = {
  dataMode: 'DEMO',
  criticalMissDistanceThresholdKm: 0.5,
  warningMissDistanceThresholdKm: 2.0,
  criticalCollisionProbabilityThreshold: 0.0001,
  telemetryRefreshIntervalSeconds: 15,
  activeScenarioId: 'SCENARIO-ALPHA-2026-084',
  noradAutoSync: false,
  operatorCallsign: 'OPS-ALPHA-LEAD'
};
