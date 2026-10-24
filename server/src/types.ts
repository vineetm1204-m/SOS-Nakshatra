export type ProvenanceType = 'LIVE_TELEMETRY' | 'NORAD_TLE' | 'GPS_EPHEMERIS' | 'SYNTHETIC_DEMO';

export interface DataProvenance {
  source: ProvenanceType;
  provider: string;
  timestamp: string;
  isDeterministicDemo: boolean;
  confidenceScore: number;
  notes?: string;
}

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

export interface Satellite {
  id: string;
  noradId: number;
  name: string;
  callsign: string;
  internationalDesignator: string;
  orbitClass: 'LEO' | 'MEO' | 'GEO' | 'SSO';
  operationalStatus: 'OPERATIONAL' | 'DEGRADED' | 'CRITICAL_RISK' | 'IN_MANEUVER' | 'DECOMMISSIONED';
  massKg: number;
  dryMassKg: number;
  remainingFuelKg: number;
  fuelCapacityKg: number;
  propellantType: 'HYDRAZINE' | 'ELECTRIC_ION' | 'COLD_GAS';
  ispSeconds: number;
  orbit: KeplerianElements;
  subsystems: SubsystemStatus;
  lastContact: string;
  provenance: DataProvenance;
}

export interface MissDistanceBreakdown {
  total: number;
  radial: number;
  inTrack: number;
  crossTrack: number;
}

export interface ConjunctionEvent {
  id: string;
  code: string;
  primarySatelliteId: string;
  primarySatelliteName: string;
  secondaryObjectId: string;
  secondaryObjectName: string;
  secondaryObjectType: 'DEBRIS' | 'ACTIVE_SATELLITE' | 'ROCKET_BODY' | 'UNKNOWN';
  tca: string; // ISO 8601
  timeToTcaSeconds: number;
  missDistanceKm: MissDistanceBreakdown;
  relativeVelocityKmS: number;
  collisionProbability: number | null; // Null if covariance inadequate
  collisionProbabilityConfidence: 'HIGH' | 'ESTIMATED' | 'INSUFFICIENT_COVARIANCE';
  riskLevel: 'NEGLIGIBLE' | 'WATCH' | 'WARNING' | 'CRITICAL';
  status: 'DETECTED' | 'UNDER_REVIEW' | 'MANEUVER_PLANNED' | 'MANEUVER_EXECUTING' | 'CLEARED';
  isFeaturedScenario: boolean;
  provenance: DataProvenance;
  notes: string;
}

export interface OperationalEvent {
  id: string;
  timestamp: string;
  category: 'CONJUNCTION' | 'TELEMETRY' | 'PROPULSION' | 'COMMUNICATION' | 'SYSTEM';
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  title: string;
  description: string;
  associatedSatelliteId?: string;
  associatedConjunctionId?: string;
  provenance: DataProvenance;
}

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
