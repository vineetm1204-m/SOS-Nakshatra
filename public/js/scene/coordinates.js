/**
 * SOS Orbital Coordinate Transformation Engine
 * Strictly maps Keplerian orbital elements and ECI coordinates to 3D scene units.
 * 
 * REFERENCE FRAME SPECIFICATION:
 * - Planetary body: Earth (WGS-84 equatorial radius: 6,378.137 km)
 * - Inertial coordinate system: ECI J2000 (Earth-Centered Inertial)
 *   +X: Vernal Equinox direction
 *   +Z: Celestial North Pole
 *   +Y: Orthogonal completing right-handed system (Z × X)
 * - Rendering Scene coordinate system (Three.js standard):
 *   Scene +Y = Celestial North (+Z_ECI)
 *   Scene +X = Vernal Equinox (+X_ECI)
 *   Scene +Z = -Y_ECI
 * - Scale factor: 1 Scene Unit = 1,000 km (Earth Radius = 6.378137 units)
 */

export const EARTH_RADIUS_KM = 6378.137;
export const SCENE_SCALE = 1 / 1000; // 1 unit = 1000 km
export const EARTH_SCENE_RADIUS = EARTH_RADIUS_KM * SCENE_SCALE; // ~6.378 units

/**
 * Transforms an ECI Cartesian vector (km) into 3D scene coordinates (units).
 * @param {number} x - ECI X (km)
 * @param {number} y - ECI Y (km)
 * @param {number} z - ECI Z (km)
 * @returns {{x: number, y: number, z: number}} Scene coordinates
 */
export function transformEciToScene(x, y, z) {
  return {
    x: x * SCENE_SCALE,
    y: z * SCENE_SCALE,  // ECI Z (North) maps to Scene Y (Up)
    z: -y * SCENE_SCALE  // Right-handed coordinate mapping
  };
}

/**
 * Transforms 3D scene coordinates back to ECI Cartesian vector (km).
 * @param {number} sx - Scene X
 * @param {number} sy - Scene Y
 * @param {number} sz - Scene Z
 * @returns {{x: number, y: number, z: number}} ECI coordinates (km)
 */
export function transformSceneToEci(sx, sy, sz) {
  return {
    x: sx / SCENE_SCALE,
    y: -sz / SCENE_SCALE,
    z: sy / SCENE_SCALE
  };
}

/**
 * Computes Cartesian position vector in ECI frame from Keplerian orbital elements.
 * @param {object} elements - Keplerian elements
 * @param {number} elements.semiMajorAxisKm - Semi-major axis in km (a)
 * @param {number} elements.eccentricity - Eccentricity (e)
 * @param {number} elements.inclinationDeg - Inclination in degrees (i)
 * @param {number} elements.raanDeg - Right Ascension of Ascending Node in degrees (Ω)
 * @param {number} elements.argOfPerigeeDeg - Argument of Perigee in degrees (ω)
 * @param {number} trueAnomalyDeg - True Anomaly in degrees (ν)
 * @returns {{x: number, y: number, z: number}} ECI Cartesian position in km
 */
export function keplerianToEci(elements, trueAnomalyDeg) {
  const deg2rad = Math.PI / 180;
  const a = elements.semiMajorAxisKm;
  const e = elements.eccentricity;
  const i = elements.inclinationDeg * deg2rad;
  const raan = elements.raanDeg * deg2rad;
  const omega = elements.argOfPerigeeDeg * deg2rad;
  const nu = trueAnomalyDeg * deg2rad;

  // Orbital radius in orbital plane (km)
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));

  // Coordinates in orbital plane
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  // Rotation matrix from orbital plane to ECI frame:
  // P vector (towards perigee)
  const px = Math.cos(raan) * Math.cos(omega) - Math.sin(raan) * Math.sin(omega) * Math.cos(i);
  const py = Math.sin(raan) * Math.cos(omega) + Math.cos(raan) * Math.sin(omega) * Math.cos(i);
  const pz = Math.sin(omega) * Math.sin(i);

  // Q vector (in orbital plane, 90° from perigee in direction of motion)
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
 * Generates an array of 3D scene points sampling a full Keplerian orbit.
 * @param {object} elements - Keplerian elements
 * @param {number} [samples=128] - Number of points along the ellipse
 * @returns {Array<{x: number, y: number, z: number}>} Array of scene coordinate points
 */
export function sampleOrbitPath(elements, samples = 128) {
  const points = [];
  const step = 360 / samples;
  for (let nu = 0; nu <= 360; nu += step) {
    const eci = keplerianToEci(elements, nu);
    points.push(transformEciToScene(eci.x, eci.y, eci.z));
  }
  return points;
}
