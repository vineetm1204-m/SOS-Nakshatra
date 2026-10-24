import { describe, it, expect } from 'vitest';
import { SEED_SATELLITES, SEED_CONJUNCTIONS, SEED_EVENTS, DEFAULT_SETTINGS } from '../server/src/data/seedData.js';

describe('SOS Domain Data & Scenarios', () => {
  it('contains valid seed satellites with realistic orbital parameters', () => {
    expect(SEED_SATELLITES.length).toBeGreaterThan(0);
    const sentinel = SEED_SATELLITES.find(s => s.id === 'SAT-LEO-02');
    expect(sentinel).toBeDefined();
    expect(sentinel?.name).toBe('SENTINEL-X');
    expect(sentinel?.orbit.altitudeKm).toBeCloseTo(680.1, 1);
    expect(sentinel?.operationalStatus).toBe('CRITICAL_RISK');
    expect(sentinel?.subsystems.propulsion).toBe('NOMINAL');
    expect(sentinel?.provenance.source).toBe('SYNTHETIC_DEMO');
  });

  it('contains the featured critical conjunction event against COSMOS-2251 debris', () => {
    const featured = SEED_CONJUNCTIONS.find(c => c.isFeaturedScenario);
    expect(featured).toBeDefined();
    expect(featured?.id).toBe('CONJ-2026-084');
    expect(featured?.primarySatelliteId).toBe('SAT-LEO-02');
    expect(featured?.secondaryObjectName).toContain('COSMOS-2251');
    expect(featured?.missDistanceKm.total).toBe(0.184); // 184 meters
    expect(featured?.riskLevel).toBe('CRITICAL');
    expect(featured?.collisionProbability).toBeGreaterThan(1e-4);
    expect(featured?.provenance.isDeterministicDemo).toBe(true);
  });

  it('ensures operational event log tracks recent satellite contacts', () => {
    expect(SEED_EVENTS.length).toBeGreaterThanOrEqual(5);
    const criticalEvent = SEED_EVENTS.find(e => e.severity === 'CRITICAL');
    expect(criticalEvent).toBeDefined();
    expect(criticalEvent?.title).toContain('Critical Conjunction');
  });

  it('provides default system settings with realistic risk thresholds', () => {
    expect(DEFAULT_SETTINGS.dataMode).toBe('DEMO');
    expect(DEFAULT_SETTINGS.criticalMissDistanceThresholdKm).toBe(0.5);
    expect(DEFAULT_SETTINGS.criticalCollisionProbabilityThreshold).toBe(0.0001);
  });
});
