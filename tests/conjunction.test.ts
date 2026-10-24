import { describe, it, expect } from 'vitest';
import { 
  ConjunctionService, 
  StateSample, 
  CovarianceMatrix2D, 
  DEFAULT_RISK_THRESHOLDS 
} from '../server/src/services/ConjunctionService.js';

describe('Conjunction Service — Calculations & Numerical Methods', () => {
  it('correctly computes relative state and RIC frame separation components', () => {
    // Primary at [7000, 0, 0] moving along +Y [0, 7.5, 0]
    const r1 = { x: 7000, y: 0, z: 0 };
    const v1 = { x: 0, y: 7.5, z: 0 };

    // Secondary offset by +100m radial, +200m in-track, +50m cross-track
    const r2 = { x: 7000.1, y: 0.2, z: 0.05 };
    const v2 = { x: 0, y: 7.5, z: 1.2 };

    const rel = ConjunctionService.computeRelativeState(r1, v1, r2, v2);

    expect(rel.ricBreakdownKm.radial).toBeCloseTo(0.1, 3);      // 100 meters
    expect(rel.ricBreakdownKm.inTrack).toBeCloseTo(0.2, 3);     // 200 meters
    expect(rel.ricBreakdownKm.crossTrack).toBeCloseTo(0.05, 3);  // 50 meters

    // Total distance = sqrt(0.1^2 + 0.2^2 + 0.05^2) = ~0.2291 km
    expect(rel.distanceKm).toBeCloseTo(Math.sqrt(0.1 ** 2 + 0.2 ** 2 + 0.05 ** 2), 4);
    expect(rel.relativeSpeedKmS).toBeCloseTo(1.2, 2);
  });

  it('searches time window and accurately pinpoints TCA using parabolic refinement', () => {
    // Construct a synthetic encounter where minimum separation occurs exactly at t = 1500 seconds
    const traj1: StateSample[] = [];
    const traj2: StateSample[] = [];
    const t0 = 1000000;
    const exactTcaOffset = 1500; // seconds

    for (let t = 0; t <= 3000; t += 100) {
      const epochMs = t0 + t * 1000;
      // Primary moving straight in X
      traj1.push({
        timestampEpochMs: epochMs,
        positionKm: { x: t * 7.5, y: 0, z: 0 },
        velocityKmS: { x: 7.5, y: 0, z: 0 }
      });

      // Secondary crossing Y axis with minimum miss of 0.200 km at t = 1500s
      const dt = t - exactTcaOffset;
      traj2.push({
        timestampEpochMs: epochMs,
        positionKm: { x: t * 7.5, y: 0.200, z: dt * 1.5 },
        velocityKmS: { x: 7.5, y: 0, z: 1.5 }
      });
    }

    const result = ConjunctionService.findClosestApproach(traj1, traj2, {
      startTimeEpochMs: t0,
      endTimeEpochMs: t0 + 3000 * 1000,
      coarseStepSeconds: 100
    });

    // TCA should be found exactly at t0 + 1500*1000
    expect(result.tcaEpochMs).toBe(t0 + 1500 * 1000);
    expect(result.missDistanceKm.total).toBeCloseTo(0.200, 3); // 200m minimum
    expect(result.numericalMethod).toBe('COARSE_GRID_WITH_PARABOLIC_REFINEMENT');
  });

  it('throws helpful error for insufficient or mismatched trajectory samples', () => {
    expect(() => {
      ConjunctionService.findClosestApproach([], [], { startTimeEpochMs: 0, endTimeEpochMs: 100, coarseStepSeconds: 10 });
    }).toThrow('Insufficient trajectory samples');

    const sample: StateSample = { timestampEpochMs: 0, positionKm: { x: 0, y: 0, z: 0 }, velocityKmS: { x: 0, y: 0, z: 0 } };
    expect(() => {
      ConjunctionService.findClosestApproach([sample, sample, sample], [sample, sample], { startTimeEpochMs: 0, endTimeEpochMs: 100, coarseStepSeconds: 10 });
    }).toThrow('Trajectory sample count mismatch');
  });

  it('calculates 2D collision probability (Pc) when covariance is valid', () => {
    const covariance: CovarianceMatrix2D = {
      sigmaXKm: 0.05, // 50m 1-sigma
      sigmaYKm: 0.05, // 50m 1-sigma
      crossCorrelationRho: 0.0
    };

    const missDistanceKm = 0.08; // 80m miss distance
    const result = ConjunctionService.calculateCollisionProbability(missDistanceKm, covariance, 5.0);

    expect(result.confidence).toBe('HIGH');
    expect(result.method).toBe('AKELLA_ALFRIEND_2D');
    expect(result.collisionProbability).toBeGreaterThan(0.0);
    expect(result.collisionProbability!).toBeLessThan(1.0);
  });

  it('refuses to compute fake Pc when covariance is missing or singular', () => {
    // Missing covariance
    const resultMissing = ConjunctionService.calculateCollisionProbability(0.184, undefined, 5.0);
    expect(resultMissing.collisionProbability).toBeNull();
    expect(resultMissing.confidence).toBe('INSUFFICIENT_COVARIANCE');
    expect(resultMissing.reason).toContain('Covariance matrix missing');

    // Singular / invalid correlation rho = 1.0
    const resultSingular = ConjunctionService.calculateCollisionProbability(0.184, {
      sigmaXKm: 0.1,
      sigmaYKm: 0.1,
      crossCorrelationRho: 1.0
    }, 5.0);
    expect(resultSingular.collisionProbability).toBeNull();
    expect(resultSingular.reason).toContain('violates covariance matrix non-singularity');
  });

  it('classifies risk based on named CARA Pc threshold redlines and geometric buffers', () => {
    // 1. Critical based on formal Pc >= 1e-4
    const resPcCritical = ConjunctionService.classifyRisk(1.5, 4.82e-3);
    expect(resPcCritical.riskLevel).toBe('CRITICAL');
    expect(resPcCritical.ruleApplied).toBe('CARA_PC_REDLINE');
    expect(resPcCritical.isHeuristicProximity).toBe(false);

    // 2. Critical based on geometric miss <= 0.5 km when Pc is null
    const resGeomCritical = ConjunctionService.classifyRisk(0.184, null);
    expect(resGeomCritical.riskLevel).toBe('CRITICAL');
    expect(resGeomCritical.ruleApplied).toBe('GEOMETRIC_MISS_DISTANCE_CRITICAL');
    expect(resGeomCritical.isHeuristicProximity).toBe(true);

    // 3. Warning based on 1e-5 <= Pc < 1e-4
    const resWarningPc = ConjunctionService.classifyRisk(2.5, 3.5e-5);
    expect(resWarningPc.riskLevel).toBe('WARNING');
    expect(resWarningPc.ruleApplied).toBe('CARA_PC_WARNING');

    // 4. Watch based on geometric buffer 2km < d <= 5km
    const resWatch = ConjunctionService.classifyRisk(3.85, null);
    expect(resWatch.riskLevel).toBe('WATCH');
    expect(resWatch.ruleApplied).toBe('GEOMETRIC_MISS_DISTANCE_WATCH');

    // 5. Negligible when clear of 5 km
    const resClear = ConjunctionService.classifyRisk(12.5, null);
    expect(resClear.riskLevel).toBe('NEGLIGIBLE');
    expect(resClear.ruleApplied).toBe('NOMINAL_CLEARANCE');
  });
});
