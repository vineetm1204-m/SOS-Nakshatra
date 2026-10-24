import { 
  Satellite, 
  SpaceObject, 
  ConjunctionEvent, 
  ManeuverCandidate, 
  PostManeuverProjection, 
  FlightDirectorAssessment, 
  OperationalEvent, 
  DeterministicScenario,
  ConjunctionEventSchema,
  ManeuverCandidateSchema
} from '../types.js';
import {
  SEED_SATELLITES,
  SEED_SPACE_OBJECTS,
  SEED_CONJUNCTIONS,
  SEED_CANDIDATE_MANEUVER,
  SEED_POST_MANEUVER_PROJECTION,
  SEED_FLIGHT_DIRECTOR_ASSESSMENT,
  SEED_EVENTS,
  SEED_DETERMINISTIC_SCENARIO
} from '../data/seedData.js';

/**
 * Data provider interface defining the contract for both deterministic demo data
 * and future live satellite telemetry/tracking integrations.
 */
export interface IScenarioDataProvider {
  getSatellites(): Promise<Satellite[]>;
  getSatelliteById(id: string): Promise<Satellite | undefined>;
  getSpaceObjects(): Promise<SpaceObject[]>;
  getConjunctions(): Promise<ConjunctionEvent[]>;
  getFeaturedConjunction(): Promise<ConjunctionEvent>;
  getConjunctionById(id: string): Promise<ConjunctionEvent | undefined>;
  getCandidateManeuver(conjunctionId: string): Promise<ManeuverCandidate | undefined>;
  getPostManeuverProjection(conjunctionId: string): Promise<PostManeuverProjection | undefined>;
  saveCandidateManeuver(candidate: ManeuverCandidate, projection?: PostManeuverProjection): Promise<ManeuverCandidate>;
  resetCandidateManeuver(): Promise<ManeuverCandidate>;
  getFlightDirectorAssessment(conjunctionId: string): Promise<FlightDirectorAssessment | undefined>;
  getEvents(filters?: { category?: string; severity?: string; limit?: number }): Promise<OperationalEvent[]>;
  getDeterministicScenario(): Promise<DeterministicScenario>;
  validateIntegrity(): { isValid: boolean; errors: string[] };
}

/**
 * Deterministic local demo data provider.
 * Guarantees repeatability, valid cross-object references, and consistent aerospace units.
 */
export class DemoScenarioProvider implements IScenarioDataProvider {
  private satellites: Satellite[];
  private spaceObjects: SpaceObject[];
  private conjunctions: ConjunctionEvent[];
  private candidateManeuver: ManeuverCandidate;
  private postManeuverProjection: PostManeuverProjection;
  private flightDirectorAssessment: FlightDirectorAssessment;
  private events: OperationalEvent[];
  private scenario: DeterministicScenario;

  constructor() {
    this.satellites = [...SEED_SATELLITES];
    this.spaceObjects = [...SEED_SPACE_OBJECTS];
    this.conjunctions = [...SEED_CONJUNCTIONS];
    this.candidateManeuver = { ...SEED_CANDIDATE_MANEUVER };
    this.postManeuverProjection = { ...SEED_POST_MANEUVER_PROJECTION };
    this.flightDirectorAssessment = { ...SEED_FLIGHT_DIRECTOR_ASSESSMENT };
    this.events = [...SEED_EVENTS];
    this.scenario = { ...SEED_DETERMINISTIC_SCENARIO };

    // Self-validate upon initialization
    const integrity = this.validateIntegrity();
    if (!integrity.isValid) {
      console.error('[DemoScenarioProvider] Integrity validation failed:', integrity.errors);
      throw new Error(`DemoScenarioProvider integrity errors: ${integrity.errors.join('; ')}`);
    }
  }

  async getSatellites(): Promise<Satellite[]> {
    return [...this.satellites];
  }

  async getSatelliteById(id: string): Promise<Satellite | undefined> {
    return this.satellites.find(s => s.id === id || s.callsign === id || s.name === id);
  }

  async getSpaceObjects(): Promise<SpaceObject[]> {
    return [...this.spaceObjects];
  }

  async getConjunctions(): Promise<ConjunctionEvent[]> {
    return [...this.conjunctions];
  }

  async getFeaturedConjunction(): Promise<ConjunctionEvent> {
    const featured = this.conjunctions.find(c => c.isFeaturedScenario);
    return featured || this.conjunctions[0];
  }

  async getConjunctionById(id: string): Promise<ConjunctionEvent | undefined> {
    return this.conjunctions.find(c => c.id === id);
  }

  async getCandidateManeuver(conjunctionId: string): Promise<ManeuverCandidate | undefined> {
    if (this.candidateManeuver.conjunctionId === conjunctionId) {
      return { ...this.candidateManeuver };
    }
    return undefined;
  }

  async getPostManeuverProjection(conjunctionId: string): Promise<PostManeuverProjection | undefined> {
    if (this.candidateManeuver.conjunctionId === conjunctionId) {
      return { ...this.postManeuverProjection };
    }
    return undefined;
  }

  async saveCandidateManeuver(candidate: ManeuverCandidate, projection?: PostManeuverProjection): Promise<ManeuverCandidate> {
    this.candidateManeuver = { ...candidate };
    if (projection) {
      this.postManeuverProjection = { ...projection };
    }
    return { ...this.candidateManeuver };
  }

  async resetCandidateManeuver(): Promise<ManeuverCandidate> {
    this.candidateManeuver = { ...SEED_CANDIDATE_MANEUVER };
    this.postManeuverProjection = { ...SEED_POST_MANEUVER_PROJECTION };
    return { ...this.candidateManeuver };
  }

  async getFlightDirectorAssessment(conjunctionId: string): Promise<FlightDirectorAssessment | undefined> {
    if (this.flightDirectorAssessment.conjunctionId === conjunctionId) {
      return { ...this.flightDirectorAssessment };
    }
    return undefined;
  }

  async getEvents(filters?: { category?: string; severity?: string; limit?: number }): Promise<OperationalEvent[]> {
    let result = [...this.events];
    if (filters?.category) {
      result = result.filter(e => e.category.toLowerCase() === filters.category!.toLowerCase());
    }
    if (filters?.severity) {
      result = result.filter(e => e.severity.toLowerCase() === filters.severity!.toLowerCase());
    }
    if (filters?.limit && filters.limit > 0) {
      result = result.slice(0, filters.limit);
    }
    return result;
  }

  async getDeterministicScenario(): Promise<DeterministicScenario> {
    return { ...this.scenario };
  }

  /**
   * Validates all relational cross-references, schemas, units, and timestamps.
   */
  validateIntegrity(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validSatIds = new Set(this.satellites.map(s => s.id));
    const validObjectIds = new Set([
      ...this.satellites.map(s => s.id),
      ...this.spaceObjects.map(o => o.id)
    ]);
    const validConjIds = new Set(this.conjunctions.map(c => c.id));

    // 1. Validate Conjunction Schemas and Cross-References
    for (const conj of this.conjunctions) {
      const parseResult = ConjunctionEventSchema.safeParse(conj);
      if (!parseResult.success) {
        errors.push(`Conjunction ${conj.id} failed schema: ${parseResult.error.message}`);
      }

      if (!validSatIds.has(conj.primarySatelliteId)) {
        errors.push(`Conjunction ${conj.id} references non-existent primary satellite: ${conj.primarySatelliteId}`);
      }

      if (!validObjectIds.has(conj.secondaryObjectId)) {
        errors.push(`Conjunction ${conj.id} references non-existent secondary object: ${conj.secondaryObjectId}`);
      }

      // Check ISO timestamp
      if (isNaN(new Date(conj.tca).getTime())) {
        errors.push(`Conjunction ${conj.id} has invalid TCA timestamp: ${conj.tca}`);
      }
    }

    // 2. Validate Candidate Maneuver
    const manResult = ManeuverCandidateSchema.safeParse(this.candidateManeuver);
    if (!manResult.success) {
      errors.push(`Candidate maneuver ${this.candidateManeuver.id} failed schema: ${manResult.error.message}`);
    }

    if (!validConjIds.has(this.candidateManeuver.conjunctionId)) {
      errors.push(`Maneuver ${this.candidateManeuver.id} references invalid conjunction: ${this.candidateManeuver.conjunctionId}`);
    }

    if (!validSatIds.has(this.candidateManeuver.targetObjectId)) {
      errors.push(`Maneuver ${this.candidateManeuver.id} references invalid target satellite: ${this.candidateManeuver.targetObjectId}`);
    }

    // 3. Validate Flight Director Assessment
    if (!validConjIds.has(this.flightDirectorAssessment.conjunctionId)) {
      errors.push(`Flight director assessment references invalid conjunction: ${this.flightDirectorAssessment.conjunctionId}`);
    }

    if (!validSatIds.has(this.flightDirectorAssessment.targetSatelliteId)) {
      errors.push(`Flight director assessment references invalid target satellite: ${this.flightDirectorAssessment.targetSatelliteId}`);
    }

    // 4. Validate Operational Events Cross-References
    for (const evt of this.events) {
      if (evt.associatedSatelliteId && !validSatIds.has(evt.associatedSatelliteId)) {
        errors.push(`Event ${evt.id} references invalid satellite: ${evt.associatedSatelliteId}`);
      }
      if (evt.associatedConjunctionId && !validConjIds.has(evt.associatedConjunctionId)) {
        errors.push(`Event ${evt.id} references invalid conjunction: ${evt.associatedConjunctionId}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Extension Point: Future Live Provider integration template.
 * Enables connecting live Space-Track ephemeris, radar observations, or telemetry ground stations.
 */
export class LiveScenarioProvider implements IScenarioDataProvider {
  constructor(private apiEndpoint?: string) {}

  async getSatellites(): Promise<Satellite[]> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getSatelliteById(): Promise<Satellite | undefined> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getSpaceObjects(): Promise<SpaceObject[]> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getConjunctions(): Promise<ConjunctionEvent[]> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getFeaturedConjunction(): Promise<ConjunctionEvent> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getConjunctionById(): Promise<ConjunctionEvent | undefined> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getCandidateManeuver(): Promise<ManeuverCandidate | undefined> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getPostManeuverProjection(): Promise<PostManeuverProjection | undefined> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async saveCandidateManeuver(): Promise<ManeuverCandidate> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async resetCandidateManeuver(): Promise<ManeuverCandidate> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getFlightDirectorAssessment(): Promise<FlightDirectorAssessment | undefined> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getEvents(): Promise<OperationalEvent[]> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  async getDeterministicScenario(): Promise<DeterministicScenario> {
    throw new Error('Live telemetry provider requires configured uplink credentials.');
  }
  validateIntegrity(): { isValid: boolean; errors: string[] } {
    return { isValid: true, errors: [] };
  }
}

// Global Singleton Repository Instance
export const scenarioRepository: IScenarioDataProvider = new DemoScenarioProvider();
