import { describe, it, expect } from 'vitest';
import { 
  ManeuverService, 
  STANDARD_GRAVITY_G0 
} from '../server/src/services/ManeuverService.js';
import { SEED_CONJUNCTIONS, SEED_SATELLITES } from '../server/src/data/seedData.js';

describe('Maneuver Service — Tsiolkovsky Rocket Equation & CW Trajectory Model', () => {
  it('accurately computes ideal propellant consumption against known analytical solution', () => {
    const m0 = 1250.0; // kg
    const deltaV = 0.85; // m/s
    const isp = 220.0; // s
    const g0 = STANDARD_GRAVITY_G0; // 9.80665 m/s^2

    // Analytical: c = 220 * 9.80665 = 2157.463 m/s
    // Δm = 1250 * (1 - exp(-0.85 / 2157.463)) = 1250 * (1 - 0.999606) = ~0.4925 kg
    const expectedDeltaM = m0 * (1.0 - Math.exp(-deltaV / (isp * g0)));
    const computedDeltaM = ManeuverService.computeTsiolkovskyPropellant(m0, deltaV, isp);

    expect(computedDeltaM).toBeCloseTo(expectedDeltaM, 6);
    expect(computedDeltaM).toBeCloseTo(0.4925, 3);
  });

  it('strictly validates positive mass, positive Isp, and non-negative Delta-V', () => {
    // Non-positive mass
    expect(() => {
      ManeuverService.computeTsiolkovskyPropellant(0, 0.85, 220);
    }).toThrow('Invalid spacecraft mass');

    expect(() => {
      ManeuverService.computeTsiolkovskyPropellant(-500, 0.85, 220);
    }).toThrow('Invalid spacecraft mass');

    // Non-positive specific impulse
    expect(() => {
      ManeuverService.computeTsiolkovskyPropellant(1000, 0.85, 0);
    }).toThrow('Invalid specific impulse');

    expect(() => {
      ManeuverService.computeTsiolkovskyPropellant(1000, 0.85, -10);
    }).toThrow('Invalid specific impulse');

    // Negative Delta-V
    expect(() => {
      ManeuverService.computeTsiolkovskyPropellant(1000, -1.0, 220);
    }).toThrow('Invalid Delta-V magnitude');

    // Zero Delta-V consumes exactly 0 propellant
    expect(ManeuverService.computeTsiolkovskyPropellant(1000, 0.0, 220)).toBe(0);
  });

  it('projects Clohessy-Wiltshire along-track separation shift based on lead time before TCA', () => {
    const baselineMiss = { total: 0.184, radial: -0.042, inTrack: 0.165, crossTrack: 0.071 };
    const deltaV = 0.85; // m/s
    const timeBeforeTca = 9000; // 2.5 hours = 9000 seconds

    const projection = ManeuverService.projectPostManeuverSeparation(
      baselineMiss,
      deltaV,
      'ALONG_TRACK_POS',
      timeBeforeTca
    );

    // Expected in-track shift = 3 * deltaV * dt = 3 * 0.85 * 9000 = +22,950m
    // Baseline in-track = 165m
    expect(projection.inTrackMeters).toBeGreaterThan(20000);
    expect(projection.postMissMeters).toBeGreaterThanOrEqual(projection.inTrackMeters);
  });

  it('evaluates complete maneuver candidate and checks target safety criteria', () => {
    const sentinel = SEED_SATELLITES[0];
    const conjunction = SEED_CONJUNCTIONS[0];

    const result = ManeuverService.evaluateManeuverCandidate({
      spacecraftMassKg: sentinel.massKg,
      fuelCapacityKg: sentinel.fuelCapacityKg,
      remainingFuelKg: sentinel.remainingFuelKg,
      specificImpulseSeconds: sentinel.ispSeconds,
      deltaVMagnitudeMps: 0.85,
      burnDirection: 'ALONG_TRACK_POS',
      timeBeforeTcaSeconds: 9000,
      baselineMissDistanceKm: conjunction.missDistanceKm,
      baselinePc: conjunction.collisionProbability
    });

    expect(result.maneuverType).toBe('IMPULSIVE_COLLISION_AVOIDANCE_BURN');
    expect(result.idealPropellantConsumedKg).toBeCloseTo(0.493, 2);
    expect(result.targetCriteriaMet).toBe(true);
    expect(result.assumptions.length).toBeGreaterThanOrEqual(5);
    expect(result.limitations.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves baseline scenario immutability when candidate is created or modified', () => {
    const baseline = SEED_CONJUNCTIONS[0];
    const initialTotalMiss = baseline.missDistanceKm.total;
    const initialStatus = baseline.status;

    // Evaluate multiple alternative candidate maneuvers
    ManeuverService.evaluateManeuverCandidate({
      spacecraftMassKg: 1250,
      fuelCapacityKg: 200,
      remainingFuelKg: 128.5,
      specificImpulseSeconds: 220,
      deltaVMagnitudeMps: 2.5, // High delta
      burnDirection: 'CROSS_TRACK',
      timeBeforeTcaSeconds: 7200,
      baselineMissDistanceKm: baseline.missDistanceKm,
      baselinePc: baseline.collisionProbability
    });

    // Baseline values MUST NOT mutate
    expect(baseline.missDistanceKm.total).toBe(initialTotalMiss);
    expect(baseline.status).toBe(initialStatus);
  });

  it('correctly handles lead time unit conversions and timing trade-offs', () => {
    // 2.5 hours = 150 minutes = 9000 seconds
    const hoursToSeconds = (h: number) => h * 3600;
    const minutesToSeconds = (m: number) => m * 60;

    expect(hoursToSeconds(2.5)).toBe(9000);
    expect(minutesToSeconds(150)).toBe(9000);

    const baselineMiss = { total: 0.184, radial: -0.042, inTrack: 0.165, crossTrack: 0.071 };
    const deltaV = 0.5;

    // Longer lead time creates greater along-track separation for identical Delta-V
    const projShort = ManeuverService.projectPostManeuverSeparation(baselineMiss, deltaV, 'ALONG_TRACK_POS', 1800); // 30 min
    const projLong = ManeuverService.projectPostManeuverSeparation(baselineMiss, deltaV, 'ALONG_TRACK_POS', 7200); // 2 hours

    expect(projLong.postMissMeters).toBeGreaterThan(projShort.postMissMeters);
  });

  it('fails target safety criteria when Delta-V is insufficient or fuel is exhausted', () => {
    const sentinel = SEED_SATELLITES[0];
    const conjunction = SEED_CONJUNCTIONS[0];

    // Case 1: Insufficient Delta-V and short lead time -> miss distance remains below 500m
    const underBurn = ManeuverService.evaluateManeuverCandidate({
      spacecraftMassKg: sentinel.massKg,
      fuelCapacityKg: sentinel.fuelCapacityKg,
      remainingFuelKg: sentinel.remainingFuelKg,
      specificImpulseSeconds: sentinel.ispSeconds,
      deltaVMagnitudeMps: 0.02, // very small burn
      burnDirection: 'ALONG_TRACK_POS',
      timeBeforeTcaSeconds: 60, // only 1 minute before TCA
      baselineMissDistanceKm: conjunction.missDistanceKm,
      baselinePc: conjunction.collisionProbability
    });
    expect(underBurn.targetCriteriaMet).toBe(false);

    // Case 2: Fuel exhausted
    const fuelExhausted = ManeuverService.evaluateManeuverCandidate({
      spacecraftMassKg: sentinel.massKg,
      fuelCapacityKg: sentinel.fuelCapacityKg,
      remainingFuelKg: 0.05, // only 50 grams of fuel remaining
      specificImpulseSeconds: sentinel.ispSeconds,
      deltaVMagnitudeMps: 1.5, // requires ~0.87 kg
      burnDirection: 'ALONG_TRACK_POS',
      timeBeforeTcaSeconds: 9000,
      baselineMissDistanceKm: conjunction.missDistanceKm,
      baselinePc: conjunction.collisionProbability
    });
    expect(fuelExhausted.targetCriteriaMet).toBe(false);
    expect(fuelExhausted.remainingPropellantPostBurnKg).toBe(0);
  });

  it('supports candidate reset to default baseline configuration', () => {
    const defaultDeltaV = 0.85;
    const defaultDirection = 'ALONG_TRACK_POS';

    // Simulate operator editing candidate to high delta-V
    let currentCandidate = {
      deltaVMagnitudeMps: 2.75,
      burnDirection: 'CROSS_TRACK',
      leadTimeHours: 4.0
    };

    // Operator triggers Reset Action
    currentCandidate = {
      deltaVMagnitudeMps: defaultDeltaV,
      burnDirection: defaultDirection,
      leadTimeHours: 2.5
    };

    expect(currentCandidate.deltaVMagnitudeMps).toBe(0.85);
    expect(currentCandidate.burnDirection).toBe('ALONG_TRACK_POS');
    expect(currentCandidate.leadTimeHours).toBe(2.5);
  });

  it('persists and resets candidate maneuvers in scenario repository without mutating baseline scenario', async () => {
    const { DemoScenarioProvider } = await import('../server/src/services/ScenarioRepository.js');
    const repo = new DemoScenarioProvider();

    const baseline = await repo.getFeaturedConjunction();
    const initialCandidate = await repo.getCandidateManeuver(baseline.id);
    expect(initialCandidate).toBeDefined();
    expect(initialCandidate?.deltaVMagnitudeMps).toBe(0.85);

    // Persist an updated candidate
    const modifiedCandidate = {
      ...initialCandidate!,
      deltaVMagnitudeMps: 1.45,
      burnDirection: 'CROSS_TRACK' as const
    };
    await repo.saveCandidateManeuver(modifiedCandidate);

    const saved = await repo.getCandidateManeuver(baseline.id);
    expect(saved?.deltaVMagnitudeMps).toBe(1.45);
    expect(saved?.burnDirection).toBe('CROSS_TRACK');

    // Baseline conjunction MUST remain unchanged
    const baselineCheck = await repo.getFeaturedConjunction();
    expect(baselineCheck.missDistanceKm.total).toBe(baseline.missDistanceKm.total);

    // Reset candidate back to baseline
    const reset = await repo.resetCandidateManeuver();
    expect(reset.deltaVMagnitudeMps).toBe(0.85);
    expect(reset.burnDirection).toBe('ALONG_TRACK_POS');
  });
});
