import { Vector3D, KeplerianElements } from '../types.js';

export const EARTH_RADIUS_KM = 6378.137;
export const SCENE_SCALE = 1 / 1000; // 1 unit = 1000 km
export const EARTH_SCENE_RADIUS = EARTH_RADIUS_KM * SCENE_SCALE; // ~6.378 units

export class OrbitalService {
  /**
   * Transforms an ECI Cartesian vector (km) into 3D scene coordinates (units).
   */
  static transformEciToScene(x: number, y: number, z: number): Vector3D {
    return {
      x: x * SCENE_SCALE,
      y: z * SCENE_SCALE,  // ECI Z (North) maps to Scene Y (Up)
      z: -y * SCENE_SCALE
    };
  }

  /**
   * Transforms 3D scene coordinates back to ECI Cartesian vector (km).
   */
  static transformSceneToEci(sx: number, sy: number, sz: number): Vector3D {
    return {
      x: sx / SCENE_SCALE,
      y: -sz / SCENE_SCALE,
      z: sy / SCENE_SCALE
    };
  }

  /**
   * Computes Cartesian position vector in ECI frame from Keplerian orbital elements.
   */
  static keplerianToEci(elements: KeplerianElements, trueAnomalyDeg: number): Vector3D {
    const deg2rad = Math.PI / 180;
    const a = elements.semiMajorAxisKm;
    const e = elements.eccentricity;
    const i = elements.inclinationDeg * deg2rad;
    const raan = elements.raanDeg * deg2rad;
    const omega = elements.argOfPerigeeDeg * deg2rad;
    const nu = trueAnomalyDeg * deg2rad;

    // Orbital radius (km)
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));

    // Coordinates in orbital plane
    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);

    // Orbital plane to ECI transformation vectors P & Q
    const px = Math.cos(raan) * Math.cos(omega) - Math.sin(raan) * Math.sin(omega) * Math.cos(i);
    const py = Math.sin(raan) * Math.cos(omega) + Math.cos(raan) * Math.sin(omega) * Math.cos(i);
    const pz = Math.sin(omega) * Math.sin(i);

    const qx = -Math.cos(raan) * Math.sin(omega) - Math.sin(raan) * Math.cos(omega) * Math.cos(i);
    const qy = -Math.sin(raan) * Math.sin(omega) + Math.cos(raan) * Math.cos(omega) * Math.cos(i);
    const qz = Math.cos(omega) * Math.sin(i);

    return {
      x: xOrb * px + yOrb * qx,
      y: xOrb * py + yOrb * qy,
      z: xOrb * pz + yOrb * qz
    };
  }

  /**
   * Computes Euclidean distance between two 3D vectors.
   */
  static distance(v1: Vector3D, v2: Vector3D): number {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    const dz = v1.z - v2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
