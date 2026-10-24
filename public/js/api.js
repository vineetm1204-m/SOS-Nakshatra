/**
 * SOS REST API Client
 * Provides structured access to backend services with error handling and format helpers.
 */

const API_BASE = '/api/v1';

export class ApiClient {
  static async get(endpoint, params = {}) {
    try {
      const url = new URL(`${API_BASE}${endpoint}`, window.location.origin);
      Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          url.searchParams.append(k, params[k]);
        }
      });

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.warn(`[SOS API Warning] Failed to fetch ${endpoint}:`, err.message);
      throw err;
    }
  }

  static async post(endpoint, data = {}) {
    try {
      const url = `${API_BASE}${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.warn(`[SOS API Warning] Failed POST to ${endpoint}:`, err.message);
      throw err;
    }
  }

  // Domain Endpoints
  static async getFleetSummary() {
    return this.get('/fleet/summary');
  }

  static async getSatellites(filters = {}) {
    return this.get('/satellites', filters);
  }

  static async getSatelliteById(id) {
    return this.get(`/satellites/${encodeURIComponent(id)}`);
  }

  static async getConjunctions(filters = {}) {
    return this.get('/conjunctions', filters);
  }

  static async getFeaturedConjunction() {
    return this.get('/conjunctions/featured');
  }

  static async getConjunctionById(id) {
    return this.get(`/conjunctions/${encodeURIComponent(id)}`);
  }

  static async getFeaturedScenario() {
    return this.get('/scenarios/featured');
  }

  static async getCandidateManeuver(conjunctionId) {
    return this.get(`/maneuvers/candidate/${encodeURIComponent(conjunctionId)}`);
  }

  static async calculateManeuver(payload) {
    return this.post('/maneuvers/calculate', payload);
  }

  static async saveCandidateManeuver(candidate, projection) {
    return this.post('/maneuvers/save', { candidate, projection });
  }

  static async resetCandidateManeuver() {
    return this.post('/maneuvers/reset', {});
  }

  static async getFlightDirectorAssessment(conjunctionId) {
    return this.get(`/flight-director/assessment/${encodeURIComponent(conjunctionId)}`);
  }

  static async getEvents(filters = {}) {
    return this.get('/events', filters);
  }

  static async getSettings() {
    return this.get('/settings');
  }

  static async updateSettings(settings) {
    return this.post('/settings', settings);
  }
}

// Utility Formatters for Aerospace Precision
export function formatMissDistance(km) {
  if (km === undefined || km === null || isNaN(km)) return 'N/A';
  if (km < 1.0) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(2)} km`;
}

export function formatRelativeVelocity(kms) {
  if (kms === undefined || kms === null || isNaN(kms)) return 'N/A';
  return `${kms.toFixed(2)} km/s`;
}

export function formatProbability(p) {
  if (p === null || p === undefined || isNaN(p)) return 'INSUFFICIENT_COV';
  if (p < 0.0001) {
    return p.toExponential(2);
  }
  return p.toFixed(4);
}

export function formatCountdown(totalSeconds) {
  if (totalSeconds === undefined || totalSeconds === null) return '--:--:--';
  if (totalSeconds <= 0) return 'TCA PASSED';

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  const pad = (n) => String(n).padStart(2, '0');
  return `T-${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export function formatUtcTimestamp(iso) {
  if (!iso) return '---';
  try {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  } catch {
    return iso;
  }
}
