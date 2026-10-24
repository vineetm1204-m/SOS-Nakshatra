import { describe, it, expect } from 'vitest';
import { 
  OrbitalService, 
  EARTH_RADIUS_KM, 
  SCENE_SCALE, 
  EARTH_SCENE_RADIUS 
} from '../server/src/services/OrbitalService.js';
import { KeplerianElements } from '../server/src/types.js';

describe('Orbital Coordinate Transformation & Scale Correctness', () => {
  it('correctly scales Earth radius to scene units', () => {
    expect(EARTH_RADIUS_KM).toBeCloseTo(6378.137, 3);
    expect(SCENE_SCALE).toBe(0.001);
    expect(EARTH_SCENE_RADIUS).toBeCloseTo(6.378137, 4);
  });

  it('performs exact round-trip transformation between ECI and Scene space', () => {
    const originalEci = { x: -3540.21, y: 5210.84, z: 3290.15 };
    const scene = OrbitalService.transformEciToScene(originalEci.x, originalEci.y, originalEci.z);
    
    // Scene Y should be positive (matching northern ECI Z)
    expect(scene.y).toBeCloseTo(3.29015, 4);
    
    const reconstructed = OrbitalService.transformSceneToEci(scene.x, scene.y, scene.z);
    expect(reconstructed.x).toBeCloseTo(originalEci.x, 3);
    expect(reconstructed.y).toBeCloseTo(originalEci.y, 3);
    expect(reconstructed.z).toBeCloseTo(originalEci.z, 3);
  });

  it('computes correct radius at perigee and apogee from Keplerian elements', () => {
    const orbit: KeplerianElements = {
      semiMajorAxisKm: 7000.0,
      eccentricity: 0.1,
      inclinationDeg: 0.0,
      raanDeg: 0.0,
      argOfPerigeeDeg: 0.0,
      trueAnomalyDeg: 0.0,
      altitudeKm: 621.86,
      orbitalPeriodMinutes: 97.0,
      epoch: new Date().toISOString()
    };

    // At ν = 0 (Perigee): r = a * (1 - e) = 7000 * 0.9 = 6300 km
    const perigeePos = OrbitalService.keplerianToEci(orbit, 0);
    const rPerigee = Math.sqrt(perigeePos.x ** 2 + perigeePos.y ** 2 + perigeePos.z ** 2);
    expect(rPerigee).toBeCloseTo(6300.0, 1);

    // At ν = 180 (Apogee): r = a * (1 + e) = 7000 * 1.1 = 7700 km
    const apogeePos = OrbitalService.keplerianToEci(orbit, 180);
    const rApogee = Math.sqrt(apogeePos.x ** 2 + apogeePos.y ** 2 + apogeePos.z ** 2);
    expect(rApogee).toBeCloseTo(7700.0, 1);
  });

  it('preserves polar orbit inclination orientation in ECI frame', () => {
    const polarOrbit: KeplerianElements = {
      semiMajorAxisKm: 7058.14,
      eccentricity: 0.001,
      inclinationDeg: 90.0, // Pure polar orbit
      raanDeg: 0.0,
      argOfPerigeeDeg: 0.0,
      trueAnomalyDeg: 90.0, // North pole encounter
      altitudeKm: 680.0,
      orbitalPeriodMinutes: 98.3,
      epoch: new Date().toISOString()
    };

    const northPolePos = OrbitalService.keplerianToEci(polarOrbit, 90.0);
    // At ν = 90° for inclination 90°, Z should dominate (approaching north pole)
    expect(Math.abs(northPolePos.z)).toBeGreaterThan(7000.0);
    expect(Math.abs(northPolePos.x)).toBeLessThan(10.0);
  });
});
