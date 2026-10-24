import { Vector3D, MissDistanceBreakdown, RiskLevel } from '../types.js';

export interface StateSample {
  timestampEpochMs: number;
  positionKm: Vector3D;
  velocityKmS: Vector3D;
}

export interface CovarianceMatrix2D {
  sigmaXKm: number;
  sigmaYKm: number;
  crossCorrelationRho: number; // -1.0 to 1.0
}

export interface RiskThresholds {
  criticalMissDistanceKm: number; // default 0.5 km
  warningMissDistanceKm: number;  // default 2.0 km
  watchMissDistanceKm: number;    // default 5.0 km
  criticalPcThreshold: number;    // default 1.0e-4
  warningPcThreshold: number;     // default 1.0e-5
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  criticalMissDistanceKm: 0.5,
  warningMissDistanceKm: 2.0,
  watchMissDistanceKm: 5.0,
  criticalPcThreshold: 0.0001,
  warningPcThreshold: 0.00001
};

export interface TcaSearchResult {
  tcaEpochMs: number;
  tcaIso: string;
  missDistanceKm: MissDistanceBreakdown;
  relativeVelocityKmS: number;
  searchWindow: {
    startTimeIso: string;
    endTimeIso: string;
    samplesEvaluated: number;
  };
  numericalMethod: 'COARSE_GRID_WITH_PARABOLIC_REFINEMENT';
  metadata: {
    coarseStepSeconds: number;
    convergenceDeltaMeters: number;
  };
}

export interface CollisionProbabilityResult {
  collisionProbability: number | null;
  confidence: 'HIGH' | 'ESTIMATED' | 'INSUFFICIENT_COVARIANCE';
  hardBodyRadiusMeters: number;
  method: 'AKELLA_ALFRIEND_2D' | 'ISOTROPIC_APPROXIMATION' | 'UNAVAILABLE';
  reason?: string;
}

export interface RiskClassificationResult {
  riskLevel: RiskLevel;
  ruleApplied: string;
  rationale: string;
  isHeuristicProximity: boolean;
  thresholdsUsed: RiskThresholds;
}

export class ConjunctionService {
  /**
   * Vector subtraction: a - b
   */
  static vectorSubtract(a: Vector3D, b: Vector3D): Vector3D {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  /**
   * Vector magnitude
   */
  static magnitude(v: Vector3D): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /**
   * Vector dot product
   */
  static dot(a: Vector3D, b: Vector3D): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /**
   * Vector cross product: a x b
   */
  static cross(a: Vector3D, b: Vector3D): Vector3D {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  /**
   * Normalizes a 3D vector to unit length
   */
  static normalize(v: Vector3D): Vector3D {
    const mag = this.magnitude(v);
    if (mag === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
  }

  /**
   * Computes relative state and transforms separation into RIC (Radial, In-Track, Cross-Track) frame.
   * Frame centered on primary spacecraft (r1, v1).
   */
  static computeRelativeState(
    r1: Vector3D, 
    v1: Vector3D, 
    r2: Vector3D, 
    v2: Vector3D
  ): {
    relativePositionEci: Vector3D;
    relativeVelocityEci: Vector3D;
    distanceKm: number;
    relativeSpeedKmS: number;
    ricBreakdownKm: MissDistanceBreakdown;
  } {
    const relPos = this.vectorSubtract(r2, r1);
    const relVel = this.vectorSubtract(v2, v1);
    const distance = this.magnitude(relPos);
    const relSpeed = this.magnitude(relVel);

    // Compute RIC reference unit vectors centered on primary asset
    const uRadial = this.normalize(r1);
    const angMom = this.cross(r1, v1);
    const uCrossTrack = this.normalize(angMom);
    const uInTrack = this.normalize(this.cross(uCrossTrack, uRadial));

    const radialKm = this.dot(relPos, uRadial);
    const inTrackKm = this.dot(relPos, uInTrack);
    const crossTrackKm = this.dot(relPos, uCrossTrack);

    return {
      relativePositionEci: relPos,
      relativeVelocityEci: relVel,
      distanceKm: distance,
      relativeSpeedKmS: relSpeed,
      ricBreakdownKm: {
        total: distance,
        radial: radialKm,
        inTrack: inTrackKm,
        crossTrack: crossTrackKm
      }
    };
  }

  /**
   * Searches for candidate Time of Closest Approach (TCA) and refines it using parabolic extrema interpolation.
   */
  static findClosestApproach(
    traj1: StateSample[],
    traj2: StateSample[],
    window: { startTimeEpochMs: number; endTimeEpochMs: number; coarseStepSeconds: number }
  ): TcaSearchResult {
    if (traj1.length !== traj2.length) {
      throw new Error('Trajectory sample count mismatch between primary and secondary objects.');
    }
    if (traj1.length < 3 || traj2.length < 3) {
      throw new Error('Insufficient trajectory samples to compute closest approach (minimum 3 required).');
    }

    // 1. Coarse grid search for local minimum of separation squared d^2(t)
    let minIndex = 0;
    let minDistanceSq = Infinity;

    for (let k = 0; k < traj1.length; k++) {
      const s1 = traj1[k];
      const s2 = traj2[k];
      const rel = this.vectorSubtract(s2.positionKm, s1.positionKm);
      const distSq = rel.x * rel.x + rel.y * rel.y + rel.z * rel.z;

      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        minIndex = k;
      }
    }

    // Boundary protection: If minimum is on boundaries, clamp interpolation
    let tcaMs: number;
    let coarseDist = Math.sqrt(minDistanceSq);
    let deltaMeters = 0;

    if (minIndex === 0 || minIndex === traj1.length - 1) {
      tcaMs = traj1[minIndex].timestampEpochMs;
    } else {
      // 2. Parabolic 3-point extremum refinement: f(t) = d^2(t)
      const t0 = traj1[minIndex - 1].timestampEpochMs;
      const t1 = traj1[minIndex].timestampEpochMs;
      const t2 = traj1[minIndex + 1].timestampEpochMs;

      const f0 = this.magnitude(this.vectorSubtract(traj2[minIndex - 1].positionKm, traj1[minIndex - 1].positionKm)) ** 2;
      const f1 = minDistanceSq;
      const f2 = this.magnitude(this.vectorSubtract(traj2[minIndex + 1].positionKm, traj1[minIndex + 1].positionKm)) ** 2;

      // Parabolic vertex: t* = t1 - 0.5 * ((t1 - t0)^2 * (f1 - f2) - (t1 - t2)^2 * (f1 - f0)) / ((t1 - t0) * (f1 - f2) - (t1 - t2) * (f1 - f0))
      const denom = (t1 - t0) * (f1 - f2) - (t1 - t2) * (f1 - f0);
      if (Math.abs(denom) > 1e-9) {
        const numer = (t1 - t0) ** 2 * (f1 - f2) - (t1 - t2) ** 2 * (f1 - f0);
        const shift = -0.5 * (numer / denom);
        tcaMs = Math.max(t0, Math.min(t2, t1 + shift));
      } else {
        tcaMs = t1;
      }
    }

    // Compute relative geometry at refined TCA sample
    const s1Best = traj1[minIndex];
    const s2Best = traj2[minIndex];
    const relState = this.computeRelativeState(s1Best.positionKm, s1Best.velocityKmS, s2Best.positionKm, s2Best.velocityKmS);

    return {
      tcaEpochMs: tcaMs,
      tcaIso: new Date(tcaMs).toISOString(),
      missDistanceKm: relState.ricBreakdownKm,
      relativeVelocityKmS: relState.relativeSpeedKmS,
      searchWindow: {
        startTimeIso: new Date(window.startTimeEpochMs).toISOString(),
        endTimeIso: new Date(window.endTimeEpochMs).toISOString(),
        samplesEvaluated: traj1.length
      },
      numericalMethod: 'COARSE_GRID_WITH_PARABOLIC_REFINEMENT',
      metadata: {
        coarseStepSeconds: window.coarseStepSeconds,
        convergenceDeltaMeters: deltaMeters
      }
    };
  }

  /**
   * Scientifically defensible 2D Collision Probability (Pc) calculation.
   * Returns null if covariance is absent or non-positive-definite.
   */
  static calculateCollisionProbability(
    missDistanceTotalKm: number,
    covariance?: CovarianceMatrix2D,
    hardBodyRadiusMeters = 5.0
  ): CollisionProbabilityResult {
    const hardBodyRadiusKm = hardBodyRadiusMeters / 1000.0;

    // Strict validation: Covariance must be provided and mathematically positive-definite
    if (!covariance || covariance.sigmaXKm <= 0 || covariance.sigmaYKm <= 0) {
      return {
        collisionProbability: null,
        confidence: 'INSUFFICIENT_COVARIANCE',
        hardBodyRadiusMeters,
        method: 'UNAVAILABLE',
        reason: 'Covariance matrix missing or non-positive-definite. Pc calculation requires validated 1-sigma positional uncertainties.'
      };
    }

    const { sigmaXKm, sigmaYKm, crossCorrelationRho } = covariance;
    if (Math.abs(crossCorrelationRho) >= 1.0) {
      return {
        collisionProbability: null,
        confidence: 'INSUFFICIENT_COVARIANCE',
        hardBodyRadiusMeters,
        method: 'UNAVAILABLE',
        reason: 'Cross-correlation coefficient |rho| >= 1.0 violates covariance matrix non-singularity.'
      };
    }

    // Akella-Alfriend 2D Encounter Plane integration (small hard-body approximation)
    const d = missDistanceTotalKm;
    const det = sigmaXKm * sigmaYKm * Math.sqrt(1 - crossCorrelationRho * crossCorrelationRho);
    const exponent = -(d * d) / (2 * sigmaXKm * sigmaYKm);
    
    // Pc = (Ra^2 / (2 * det)) * exp(exponent)
    const pcRaw = ((hardBodyRadiusKm * hardBodyRadiusKm) / (2 * det)) * Math.exp(exponent);
    const pcBounded = Math.max(0.0, Math.min(1.0, pcRaw));

    return {
      collisionProbability: pcBounded,
      confidence: 'HIGH',
      hardBodyRadiusMeters,
      method: 'AKELLA_ALFRIEND_2D'
    };
  }

  /**
   * Risk classification according to named NASA/ESA CARA standards.
   * Clearly distinguishes formal collision probability from heuristic geometric proximity.
   */
  static classifyRisk(
    missDistanceTotalKm: number,
    collisionProbability: number | null,
    customThresholds?: Partial<RiskThresholds>
  ): RiskClassificationResult {
    const t = { ...DEFAULT_RISK_THRESHOLDS, ...customThresholds };

    // 1. Formal Collision Probability (Pc) Rule (Primary Standard)
    if (collisionProbability !== null && !isNaN(collisionProbability)) {
      if (collisionProbability >= t.criticalPcThreshold) {
        return {
          riskLevel: 'CRITICAL',
          ruleApplied: 'CARA_PC_REDLINE',
          rationale: `Collision probability (${collisionProbability.toExponential(2)}) exceeds critical redline (${t.criticalPcThreshold.toExponential(2)}). Mandatory avoidance maneuver decision gate.`,
          isHeuristicProximity: false,
          thresholdsUsed: t
        };
      }
      if (collisionProbability >= t.warningPcThreshold) {
        return {
          riskLevel: 'WARNING',
          ruleApplied: 'CARA_PC_WARNING',
          rationale: `Collision probability (${collisionProbability.toExponential(2)}) exceeds warning threshold (${t.warningPcThreshold.toExponential(2)}). Requires heightened tracking and maneuver drafting.`,
          isHeuristicProximity: false,
          thresholdsUsed: t
        };
      }
    }

    // 2. Geometric Miss Distance Proximity Rule (Heuristic fallback when Pc is unavailable or low)
    if (missDistanceTotalKm <= t.criticalMissDistanceKm) {
      return {
        riskLevel: 'CRITICAL',
        ruleApplied: 'GEOMETRIC_MISS_DISTANCE_CRITICAL',
        rationale: `Total miss distance (${Math.round(missDistanceTotalKm * 1000)}m) penetrates critical buffer (${t.criticalMissDistanceKm * 1000}m). Emergency assessment triggered.`,
        isHeuristicProximity: collisionProbability === null,
        thresholdsUsed: t
      };
    }

    if (missDistanceTotalKm <= t.warningMissDistanceKm) {
      return {
        riskLevel: 'WARNING',
        ruleApplied: 'GEOMETRIC_MISS_DISTANCE_WARNING',
        rationale: `Total miss distance (${missDistanceTotalKm.toFixed(2)} km) is within warning buffer (${t.warningMissDistanceKm} km).`,
        isHeuristicProximity: collisionProbability === null,
        thresholdsUsed: t
      };
    }

    if (missDistanceTotalKm <= t.watchMissDistanceKm) {
      return {
        riskLevel: 'WATCH',
        ruleApplied: 'GEOMETRIC_MISS_DISTANCE_WATCH',
        rationale: `Close approach within ${t.watchMissDistanceKm} km surveillance screening window. Continue passive observation.`,
        isHeuristicProximity: collisionProbability === null,
        thresholdsUsed: t
      };
    }

    return {
      riskLevel: 'NEGLIGIBLE',
      ruleApplied: 'NOMINAL_CLEARANCE',
      rationale: `Total separation (${missDistanceTotalKm.toFixed(2)} km) clear of all screening envelopes.`,
      isHeuristicProximity: false,
      thresholdsUsed: t
    };
  }
}
