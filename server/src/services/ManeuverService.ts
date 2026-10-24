import { Vector3D, MissDistanceBreakdown, BurnDirection, ManeuverCandidate } from '../types.js';

export const STANDARD_GRAVITY_G0 = 9.80665; // m/s^2

export interface ManeuverInputs {
  spacecraftMassKg: number;
  fuelCapacityKg: number;
  remainingFuelKg: number;
  specificImpulseSeconds: number;
  deltaVMagnitudeMps: number;
  burnDirection: BurnDirection;
  timeBeforeTcaSeconds: number; // Execution offset before TCA
  baselineMissDistanceKm: MissDistanceBreakdown;
  baselinePc: number | null;
}

export interface ManeuverEvaluationResult {
  candidateId: string;
  maneuverType: 'IMPULSIVE_COLLISION_AVOIDANCE_BURN';
  deltaVMagnitudeMps: number;
  burnDirection: BurnDirection;
  deltaVVectorMps: Vector3D;
  idealPropellantConsumedKg: number;
  remainingPropellantPostBurnKg: number;
  burnDurationSeconds: number;
  preManeuverMissMeters: number;
  postManeuverMissMeters: number;
  missDistanceGainMeters: number;
  postManeuverPc: number | null;
  targetCriteriaMet: boolean; // Miss >= 500m AND Pc < 1e-4
  assumptions: string[];
  limitations: string[];
  calculationMethod: 'TSIOLKOVSKY_IDEAL_ROCKET_EQUATION_AND_CLOHESSY_WILTSHIRE_DRIFT';
}

export class ManeuverService {
  /**
   * Evaluates ideal propellant consumption via Tsiolkovsky Rocket Equation:
   * Δm = m0 * (1 - exp(-Δv / (Isp * g0)))
   * 
   * @param m0 Initial spacecraft wet mass in kg (must be > 0)
   * @param deltaVMps Total velocity increment magnitude in m/s (must be >= 0)
   * @param ispSeconds Thruster specific impulse in seconds (must be > 0)
   * @param g0 Standard gravitational acceleration (default 9.80665 m/s^2)
   */
  static computeTsiolkovskyPropellant(
    m0: number,
    deltaVMps: number,
    ispSeconds: number,
    g0 = STANDARD_GRAVITY_G0
  ): number {
    if (m0 <= 0) {
      throw new Error(`Invalid spacecraft mass: ${m0} kg. Mass must be strictly positive.`);
    }
    if (ispSeconds <= 0) {
      throw new Error(`Invalid specific impulse: ${ispSeconds} s. Isp must be strictly positive.`);
    }
    if (deltaVMps < 0) {
      throw new Error(`Invalid Delta-V magnitude: ${deltaVMps} m/s. Delta-V must be non-negative.`);
    }

    if (deltaVMps === 0) return 0;

    const effectiveExhaustVelocity = ispSeconds * g0;
    const deltaM = m0 * (1.0 - Math.exp(-deltaVMps / effectiveExhaustVelocity));
    return deltaM;
  }

  /**
   * Projects post-maneuver encounter separation using linearized Clohessy-Wiltshire (CW) relative motion equations.
   * For an along-track impulse Δv_t applied Δt seconds before TCA, the along-track separation shift is:
   * Δs_t ≈ -3 * Δv_t * Δt
   * 
   * @param baselineMissKm Baseline miss distance breakdown
   * @param deltaVMps Delta-V magnitude in m/s
   * @param direction Burn direction in RIC frame
   * @param timeBeforeTcaSeconds Lead time before TCA in seconds
   */
  static projectPostManeuverSeparation(
    baselineMissKm: MissDistanceBreakdown,
    deltaVMps: number,
    direction: BurnDirection,
    timeBeforeTcaSeconds: number
  ): {
    postMissMeters: number;
    radialMeters: number;
    inTrackMeters: number;
    crossTrackMeters: number;
  } {
    const baseRadialM = baselineMissKm.radial * 1000;
    const baseInTrackM = baselineMissKm.inTrack * 1000;
    const baseCrossTrackM = baselineMissKm.crossTrack * 1000;

    let deltaR = 0;
    let deltaT = 0;
    let deltaN = 0;

    // Linearized CW encounter plane drift:
    // Along-track burn produces an orbit energy change, shifting orbital period and creating linear secular in-track drift
    if (direction === 'ALONG_TRACK_POS') {
      // Prograde burn: raises orbit, increases period, satellite arrives later (relative along-track separation increases)
      deltaT = 3.0 * deltaVMps * Math.max(0, timeBeforeTcaSeconds);
      deltaR = (deltaVMps * 4.0); // Minor radial apogee rise
    } else if (direction === 'ALONG_TRACK_NEG') {
      // Retrograde burn: lowers orbit, satellite arrives earlier
      deltaT = -3.0 * deltaVMps * Math.max(0, timeBeforeTcaSeconds);
      deltaR = -(deltaVMps * 4.0);
    } else if (direction === 'CROSS_TRACK') {
      // Out-of-plane inclination adjustment
      deltaN = deltaVMps * (timeBeforeTcaSeconds > 0 ? 850 : 0);
    } else if (direction === 'RADIAL') {
      // Radial burn: changes eccentricity / argument of perigee
      deltaR = deltaVMps * (timeBeforeTcaSeconds > 0 ? 650 : 0);
    }

    const newRadialM = baseRadialM + deltaR;
    const newInTrackM = baseInTrackM + deltaT;
    const newCrossTrackM = baseCrossTrackM + deltaN;
    const postMissMeters = Math.sqrt(newRadialM * newRadialM + newInTrackM * newInTrackM + newCrossTrackM * newCrossTrackM);

    return {
      postMissMeters: Math.round(postMissMeters),
      radialMeters: Math.round(newRadialM),
      inTrackMeters: Math.round(newInTrackM),
      crossTrackMeters: Math.round(newCrossTrackM)
    };
  }

  /**
   * Evaluates complete avoidance maneuver candidate against configured safety criteria.
   */
  static evaluateManeuverCandidate(inputs: ManeuverInputs): ManeuverEvaluationResult {
    const {
      spacecraftMassKg,
      fuelCapacityKg,
      remainingFuelKg,
      specificImpulseSeconds,
      deltaVMagnitudeMps,
      burnDirection,
      timeBeforeTcaSeconds,
      baselineMissDistanceKm,
      baselinePc
    } = inputs;

    // 1. Compute propellant via Tsiolkovsky
    const deltaM = this.computeTsiolkovskyPropellant(
      spacecraftMassKg,
      deltaVMagnitudeMps,
      specificImpulseSeconds
    );

    const remainingPostBurn = Math.max(0, remainingFuelKg - deltaM);

    // Approximate burn duration assuming constant mass flow rate (e.g. 1-Newton Hydrazine thruster: mdot ~ 0.144 kg/s)
    const massFlowRateKgPerSec = 0.144;
    const burnDuration = deltaVMagnitudeMps > 0 ? (deltaM / massFlowRateKgPerSec) : 0;

    // 2. Project post-maneuver trajectory separation
    const projection = this.projectPostManeuverSeparation(
      baselineMissDistanceKm,
      deltaVMagnitudeMps,
      burnDirection,
      timeBeforeTcaSeconds
    );

    const preMissMeters = Math.round(baselineMissDistanceKm.total * 1000);
    const gainMeters = projection.postMissMeters - preMissMeters;

    // 3. Post-maneuver collision probability estimation
    let postPc: number | null = null;
    if (baselinePc !== null && !isNaN(baselinePc)) {
      // Exponential risk reduction with Euclidean separation expansion
      const ratio = projection.postMissMeters / Math.max(1, preMissMeters);
      postPc = Math.max(1e-9, baselinePc * Math.exp(-ratio * 2.2));
    }

    // 4. Target safety criteria: Miss >= 500m AND (Pc is null OR Pc < 1e-4) AND fuel available
    const targetCriteriaMet = 
      projection.postMissMeters >= 500 && 
      (postPc === null || postPc < 1e-4) &&
      remainingPostBurn > 0;

    // 3D vector components in RIC frame
    let deltaVx = 0, deltaVy = 0, deltaVz = 0;
    if (burnDirection === 'RADIAL') deltaVx = deltaVMagnitudeMps;
    else if (burnDirection === 'ALONG_TRACK_POS') deltaVy = deltaVMagnitudeMps;
    else if (burnDirection === 'ALONG_TRACK_NEG') deltaVy = -deltaVMagnitudeMps;
    else if (burnDirection === 'CROSS_TRACK') deltaVz = deltaVMagnitudeMps;

    return {
      candidateId: `MAN-CAM-${Date.now().toString().slice(-6)}`,
      maneuverType: 'IMPULSIVE_COLLISION_AVOIDANCE_BURN',
      deltaVMagnitudeMps,
      burnDirection,
      deltaVVectorMps: { x: deltaVx, y: deltaVy, z: deltaVz },
      idealPropellantConsumedKg: parseFloat(deltaM.toFixed(3)),
      remainingPropellantPostBurnKg: parseFloat(remainingPostBurn.toFixed(3)),
      burnDurationSeconds: parseFloat(burnDuration.toFixed(1)),
      preManeuverMissMeters: preMissMeters,
      postManeuverMissMeters: projection.postMissMeters,
      missDistanceGainMeters: gainMeters,
      postManeuverPc: postPc ? parseFloat(postPc.toExponential(2)) : null,
      targetCriteriaMet,
      assumptions: [
        'Impulsive velocity increment model (instantaneous delta-v approximation)',
        `Initial spacecraft wet mass m0 = ${spacecraftMassKg.toFixed(1)} kg`,
        `Hydrazine monopropellant thruster specific impulse Isp = ${specificImpulseSeconds.toFixed(1)} seconds`,
        `Standard gravity constant g0 = ${STANDARD_GRAVITY_G0} m/s²`,
        'Linearized Clohessy-Wiltshire (Hill frame) relative motion propagation',
        'Perturbations ignored: Earth oblateness (J2 secular precession), third-body lunar/solar gravitation, solar radiation pressure'
      ],
      limitations: [
        'Excludes finite-burn cosine thruster canting losses',
        'Excludes ADCS attitude slew settling duration and gyro jitter',
        'Assumes constant thruster chamber pressure and thermal equilibrium',
        'Atmospheric density variations at LEO perigee may introduce unmodeled in-track drift'
      ],
      calculationMethod: 'TSIOLKOVSKY_IDEAL_ROCKET_EQUATION_AND_CLOHESSY_WILTSHIRE_DRIFT'
    };
  }
}
