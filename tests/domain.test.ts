import { describe, it, expect } from 'vitest';
import { scenarioRepository, DemoScenarioProvider } from '../server/src/services/ScenarioRepository.js';
import { 
  ConjunctionEventSchema, 
  ManeuverCandidateSchema, 
  DataProvenanceSchema 
} from '../server/src/types.js';

describe('Phase 2 Domain Model & Scenario Integrity', () => {
  const provider = new DemoScenarioProvider();

  it('passes comprehensive repository integrity self-check with zero errors', () => {
    const integrity = provider.validateIntegrity();
    expect(integrity.isValid).toBe(true);
    expect(integrity.errors).toEqual([]);
  });

  it('validates that every conjunction references existing primary satellites and secondary objects', async () => {
    const [satellites, spaceObjects, conjunctions] = await Promise.all([
      provider.getSatellites(),
      provider.getSpaceObjects(),
      provider.getConjunctions()
    ]);

    const satIds = new Set(satellites.map(s => s.id));
    const allObjectIds = new Set([
      ...satellites.map(s => s.id),
      ...spaceObjects.map(o => o.id)
    ]);

    for (const conj of conjunctions) {
      expect(satIds.has(conj.primarySatelliteId)).toBe(true);
      expect(allObjectIds.has(conj.secondaryObjectId)).toBe(true);
      expect(Date.parse(conj.tca)).not.toBeNaN();
    }
  });

  it('validates candidate maneuver schema and cross-references', async () => {
    const candidate = await provider.getCandidateManeuver('CONJ-2026-084');
    expect(candidate).toBeDefined();
    
    // Zod schema validation
    const parsed = ManeuverCandidateSchema.safeParse(candidate);
    expect(parsed.success).toBe(true);

    expect(candidate?.targetObjectId).toBe('SAT-LEO-02');
    expect(candidate?.deltaVMagnitudeMps).toBeCloseTo(0.85, 2);
    expect(candidate?.estimatedPropellantKg).toBeGreaterThan(0);
    expect(candidate?.burnDurationSeconds).toBeGreaterThan(0);
    expect(candidate?.assumptions.length).toBeGreaterThan(0);
  });

  it('validates post-maneuver projection delivers clearance', async () => {
    const projection = await provider.getPostManeuverProjection('CONJ-2026-084');
    expect(projection).toBeDefined();
    expect(projection?.status).toBe('CLEARED');
    expect(projection?.missDistanceKm.total).toBeGreaterThan(2.0); // 2.45 km
    expect(projection?.collisionProbability).toBeLessThan(1e-4);
  });

  it('validates Flight Director assessment references valid threat and recommendations', async () => {
    const assessment = await provider.getFlightDirectorAssessment('CONJ-2026-084');
    expect(assessment).toBeDefined();
    expect(assessment?.targetSatelliteId).toBe('SAT-LEO-02');
    expect(assessment?.severity).toBe('CRITICAL');
    expect(assessment?.sourceType).toBe('DETERMINISTIC_FALLBACK');
    expect(assessment?.operatorApprovalRequired).toBe(true);
    expect(assessment?.evidence.length).toBeGreaterThanOrEqual(5);
  });

  it('verifies mathematical consistency of RIC miss distance vector', async () => {
    const conj = await provider.getConjunctionById('CONJ-2026-084');
    expect(conj).toBeDefined();
    if (conj) {
      const { radial, inTrack, crossTrack, total } = conj.missDistanceKm;
      const computedTotal = Math.sqrt(radial * radial + inTrack * inTrack + crossTrack * crossTrack);
      expect(computedTotal).toBeCloseTo(total, 2);
    }
  });

  it('validates operational timeline events reference the featured scenario', async () => {
    const events = await provider.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(4);

    const relatedEvent = events.find(e => e.associatedConjunctionId === 'CONJ-2026-084');
    expect(relatedEvent).toBeDefined();
    expect(relatedEvent?.associatedSatelliteId).toBe('SAT-LEO-02');
    expect(relatedEvent?.severity).toBe('CRITICAL');
  });

  it('ensures data provenance is explicitly declared and deterministic', async () => {
    const scenario = await provider.getDeterministicScenario();
    expect(scenario.featuredConjunction.provenance.source).toBe('SYNTHETIC_DEMO');
    expect(scenario.featuredConjunction.provenance.isDeterministicDemo).toBe(true);
    expect(scenario.featuredConjunction.provenance.confidenceScore).toBe(0.96);

    const provenanceCheck = DataProvenanceSchema.safeParse(scenario.featuredConjunction.provenance);
    expect(provenanceCheck.success).toBe(true);
  });
});
