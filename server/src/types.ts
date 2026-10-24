import { z } from 'zod';

// ==========================================
// 1. Reference Frames & Provenance
// ==========================================
export type ProvenanceType = 'LIVE_TELEMETRY' | 'NORAD_TLE' | 'GPS_EPHEMERIS' | 'SYNTHETIC_DEMO';

export interface DataProvenance {
  source: ProvenanceType;
  provider: string;
  timestamp: string;
  isDeterministicDemo: boolean;
  confidenceScore: number;
  notes?: string;
}

export type ReferenceFrame = 'ECI_J2000' | 'TEME' | 'RIC' | 'LVLH';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface OrbitState {
  timestamp: string; // ISO 8601
  positionVectorKm: Vector3D;
  velocityVectorKmS: Vector3D;
  referenceFrame: ReferenceFrame;
  units: {
    position: 'km';
    velocity: 'km/s';
  };
}

// ==========================================
// 2. Space Object & Satellite Domain
// ==========================================
export type ObjectType = 'PAYLOAD' | 'DEBRIS' | 'ROCKET_BODY' | 'UNKNOWN';
export type OrbitDataStatus = 'VALID' | 'STALE' | 'DEGRADED';
export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'SSO';
export type OperationalStatus = 'OPERATIONAL' | 'DEGRADED' | 'CRITICAL_RISK' | 'IN_MANEUVER' | 'DECOMMISSIONED';

export interface KeplerianElements {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argOfPerigeeDeg: number;
  trueAnomalyDeg: number;
  altitudeKm: number;
  orbitalPeriodMinutes: number;
  epoch: string;
}

export interface SubsystemStatus {
  power: 'NOMINAL' | 'DEGRADED' | 'FAULT';
  propulsion: 'NOMINAL' | 'CHARGING' | 'OFFLINE';
  adcs: 'LOCKED' | 'TUMBLING' | 'REORIENTING';
  comms: 'ONLINE' | 'INTERMITTENT' | 'LOSS_OF_SIGNAL';
}

export interface SatelliteTelemetry {
  massKg: number;
  dryMassKg: number;
  remainingFuelKg: number;
  fuelCapacityKg: number;
  batteryStateOfChargePct: number;
  manifoldPressureBar: number;
  solarArrayCurrentAmps: number;
  temperatureCelsius: number;
}

export interface Satellite {
  id: string; // Stable ID, e.g. "SAT-LEO-02"
  noradId: number;
  name: string;
  callsign: string;
  internationalDesignator: string;
  objectType: ObjectType;
  orbitClass: OrbitClass;
  operationalStatus: OperationalStatus;
  orbitDataStatus: OrbitDataStatus;
  dataEpoch: string; // ISO 8601
  massKg: number;
  dryMassKg: number;
  remainingFuelKg: number;
  fuelCapacityKg: number;
  propellantType: 'HYDRAZINE' | 'ELECTRIC_ION' | 'COLD_GAS';
  ispSeconds: number;
  orbit: KeplerianElements;
  stateVector: OrbitState;
  telemetry: SatelliteTelemetry;
  subsystems: SubsystemStatus;
  lastContact: string;
  provenance: DataProvenance;
}

// Trackable non-satellite object (e.g. debris, spent stages)
export interface SpaceObject {
  id: string;
  noradId: number;
  name: string;
  internationalDesignator: string;
  objectType: ObjectType;
  radarCrossSectionM2: number;
  orbitClass: OrbitClass;
  orbit: KeplerianElements;
  stateVector: OrbitState;
  provenance: DataProvenance;
}

// ==========================================
// 3. Conjunction Domain
// ==========================================
export interface MissDistanceBreakdown {
  total: number; // km
  radial: number; // km (RIC radial component)
  inTrack: number; // km (RIC in-track component)
  crossTrack: number; // km (RIC cross-track component)
}

export type RiskLevel = 'NEGLIGIBLE' | 'WATCH' | 'WARNING' | 'CRITICAL';
export type ConjunctionStatus = 'DETECTED' | 'UNDER_REVIEW' | 'MANEUVER_PLANNED' | 'MANEUVER_EXECUTING' | 'CLEARED';

export interface ConjunctionEvent {
  id: string; // Stable ID, e.g. "CONJ-2026-084"
  code: string;
  primarySatelliteId: string;
  primarySatelliteName: string;
  secondaryObjectId: string;
  secondaryObjectName: string;
  secondaryObjectType: ObjectType;
  tca: string; // ISO 8601 Time of Closest Approach
  timeToTcaSeconds: number;
  missDistanceKm: MissDistanceBreakdown;
  relativeVelocityKmS: number;
  collisionProbability: number | null; // Null if covariance inadequate
  collisionProbabilityConfidence: 'HIGH' | 'ESTIMATED' | 'INSUFFICIENT_COVARIANCE';
  riskLevel: RiskLevel;
  status: ConjunctionStatus;
  isFeaturedScenario: boolean;
  provenance: DataProvenance;
  notes: string;
}

// ==========================================
// 4. Maneuver Domain
// ==========================================
export type BurnDirection = 'ALONG_TRACK_POS' | 'ALONG_TRACK_NEG' | 'CROSS_TRACK' | 'RADIAL';
export type ManeuverStatus = 'DRAFT' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'ABORTED';

export interface ManeuverCandidate {
  id: string; // e.g. "MAN-2026-084-A"
  conjunctionId: string;
  targetObjectId: string; // primary satellite ID
  executionTime: string; // ISO 8601
  burnDirection: BurnDirection;
  deltaVVectorMps: {
    radial: number;
    inTrack: number;
    crossTrack: number;
  };
  deltaVMagnitudeMps: number;
  estimatedPropellantKg: number;
  burnDurationSeconds: number;
  assumptions: string[];
  status: ManeuverStatus;
}

// ==========================================
// 5. Flight Director Assessment Domain
// ==========================================
export type FlightDirectorSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AssessmentSource = 'AI_GENERATED' | 'DETERMINISTIC_FALLBACK';

export interface FlightDirectorAssessment {
  id: string;
  conjunctionId: string;
  targetSatelliteId: string;
  timestamp: string;
  summary: string;
  severity: FlightDirectorSeverity;
  evidence: string[];
  recommendedNextAction: string;
  assumptions: string[];
  sourceType: AssessmentSource;
  operatorApprovalRequired: boolean;
  operatorApproved: boolean;
}

// ==========================================
// 6. Complete Deterministic Scenario
// ==========================================
export interface PostManeuverProjection {
  missDistanceKm: MissDistanceBreakdown;
  collisionProbability: number;
  riskLevel: RiskLevel;
  status: 'CLEARED';
  clearanceConfidence: 'HIGH' | 'ESTIMATED';
  notes: string;
}

export interface DeterministicScenario {
  scenarioId: string;
  title: string;
  description: string;
  trackableObjects: (Satellite | SpaceObject)[];
  featuredConjunction: ConjunctionEvent;
  candidateManeuver: ManeuverCandidate;
  postManeuverProjection: PostManeuverProjection;
  flightDirectorAssessment: FlightDirectorAssessment;
  timelineEvents: OperationalEvent[];
}

// ==========================================
// 7. Operational Event Domain
// ==========================================
export interface OperationalEvent {
  id: string;
  timestamp: string;
  category: 'CONJUNCTION' | 'TELEMETRY' | 'PROPULSION' | 'COMMUNICATION' | 'SYSTEM';
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  title: string;
  description: string;
  associatedSatelliteId?: string;
  associatedConjunctionId?: string;
  associatedManeuverId?: string;
  metadata?: Record<string, string | number | boolean>;
  provenance: DataProvenance;
}

// ==========================================
// 8. Settings & Summary
// ==========================================
export interface SystemSettings {
  dataMode: 'DEMO' | 'LIVE_SIMULATED';
  criticalMissDistanceThresholdKm: number;
  warningMissDistanceThresholdKm: number;
  criticalCollisionProbabilityThreshold: number;
  telemetryRefreshIntervalSeconds: number;
  activeScenarioId: string;
  noradAutoSync: boolean;
  operatorCallsign: string;
}

export interface FleetSummary {
  totalSatellites: number;
  operationalCount: number;
  criticalRiskCount: number;
  warningCount: number;
  fuelNominalCount: number;
  pendingManeuversCount: number;
  activeConjunctionsCount: number;
  lastUpdated: string;
  dataMode: string;
}

// ==========================================
// 9. Validation Schemas (Zod)
// ==========================================
export const Vector3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const DataProvenanceSchema = z.object({
  source: z.enum(['LIVE_TELEMETRY', 'NORAD_TLE', 'GPS_EPHEMERIS', 'SYNTHETIC_DEMO']),
  provider: z.string().min(1),
  timestamp: z.string().datetime(),
  isDeterministicDemo: z.boolean(),
  confidenceScore: z.number().min(0).max(1),
  notes: z.string().optional()
});

export const MissDistanceSchema = z.object({
  total: z.number().nonnegative(),
  radial: z.number(),
  inTrack: z.number(),
  crossTrack: z.number()
});

export const ConjunctionEventSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  primarySatelliteId: z.string().min(1),
  primarySatelliteName: z.string().min(1),
  secondaryObjectId: z.string().min(1),
  secondaryObjectName: z.string().min(1),
  secondaryObjectType: z.enum(['PAYLOAD', 'DEBRIS', 'ROCKET_BODY', 'UNKNOWN']),
  tca: z.string().datetime(),
  timeToTcaSeconds: z.number(),
  missDistanceKm: MissDistanceSchema,
  relativeVelocityKmS: z.number().nonnegative(),
  collisionProbability: z.number().min(0).max(1).nullable(),
  collisionProbabilityConfidence: z.enum(['HIGH', 'ESTIMATED', 'INSUFFICIENT_COVARIANCE']),
  riskLevel: z.enum(['NEGLIGIBLE', 'WATCH', 'WARNING', 'CRITICAL']),
  status: z.enum(['DETECTED', 'UNDER_REVIEW', 'MANEUVER_PLANNED', 'MANEUVER_EXECUTING', 'CLEARED']),
  isFeaturedScenario: z.boolean(),
  provenance: DataProvenanceSchema,
  notes: z.string()
});

export const ManeuverCandidateSchema = z.object({
  id: z.string().min(1),
  conjunctionId: z.string().min(1),
  targetObjectId: z.string().min(1),
  executionTime: z.string().datetime(),
  burnDirection: z.enum(['ALONG_TRACK_POS', 'ALONG_TRACK_NEG', 'CROSS_TRACK', 'RADIAL']),
  deltaVVectorMps: z.object({
    radial: z.number(),
    inTrack: z.number(),
    crossTrack: z.number()
  }),
  deltaVMagnitudeMps: z.number().positive(),
  estimatedPropellantKg: z.number().positive(),
  burnDurationSeconds: z.number().positive(),
  assumptions: z.array(z.string()),
  status: z.enum(['DRAFT', 'APPROVED', 'EXECUTING', 'COMPLETED', 'ABORTED'])
});

export const FlightDirectorOutputContractSchema = z.object({
  summary: z.string().min(1, 'Summary must not be empty'),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  evidence: z.array(z.string()).min(1, 'At least one evidence claim is required'),
  recommendation: z.string().min(1, 'Recommendation must not be empty'),
  assumptions: z.array(z.string()),
  source: z.enum(['ai', 'deterministic_fallback']),
  requires_operator_review: z.boolean()
});

export type FlightDirectorOutputContract = z.infer<typeof FlightDirectorOutputContractSchema>;

