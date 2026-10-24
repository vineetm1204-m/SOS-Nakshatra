import { describe, it, expect } from 'vitest';
import { 
  FlightDirectorService, 
  IAIProvider 
} from '../server/src/services/FlightDirectorService.js';
import { 
  FlightDirectorOutputContractSchema 
} from '../server/src/types.js';
import { 
  SEED_SATELLITES, 
  SEED_CONJUNCTIONS, 
  SEED_CANDIDATE_MANEUVER 
} from '../server/src/data/seedData.js';

describe('Flight Director Service — AI Integration & Deterministic Fallback Engine', () => {
  const satellite = SEED_SATELLITES[0];
  const conjunction = SEED_CONJUNCTIONS[0];
  const candidate = SEED_CANDIDATE_MANEUVER;

  it('validates a well-formed AI response against the output contract', async () => {
    const mockAiPayload = JSON.stringify({
      summary: 'Critical encounter: Sentinel-X on collision path with Cosmos debris fragment.',
      severity: 'CRITICAL',
      evidence: [
        'Miss distance is 184 meters, well inside 500m threshold.',
        'Collision probability Pc is 4.82e-03.'
      ],
      recommendation: 'Authorize staged avoidance burn in Gate 5.',
      assumptions: ['Impulsive thrust assumption applied.']
    });

    const mockProvider: IAIProvider = {
      generate: async () => mockAiPayload
    };

    const service = new FlightDirectorService(mockProvider);
    const result = await service.evaluate({
      satellite,
      conjunction,
      candidateManeuver: candidate
    });

    // Validates against Zod schema
    const validation = FlightDirectorOutputContractSchema.safeParse(result);
    expect(validation.success).toBe(true);

    expect(result.source).toBe('ai');
    expect(result.severity).toBe('CRITICAL');
    expect(result.requires_operator_review).toBe(true);
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects malformed AI output and switches to deterministic fallback', async () => {
    const malformedPayloads = [
      'Not a json string at all',
      '{"summary": "Test without other fields"}',
      '{"summary": "Test", "severity": "UNKNOWN_SEVERITY", "evidence": []}',
      '{"severity": "INFO", "recommendation": "Do something"}'
    ];

    for (const malformed of malformedPayloads) {
      const mockProvider: IAIProvider = {
        generate: async () => malformed
      };

      const service = new FlightDirectorService(mockProvider);
      const result = await service.evaluate({
        satellite,
        conjunction,
        candidateManeuver: candidate
      });

      // Must be valid against contract schema via deterministic fallback
      const validation = FlightDirectorOutputContractSchema.safeParse(result);
      expect(validation.success).toBe(true);
      expect(result.source).toBe('deterministic_fallback');
      expect(result.requires_operator_review).toBe(true);
      // Rejection reason documented in assumptions
      expect(result.assumptions.some(a => a.includes('DETERMINISTIC FALLBACK ENGINE'))).toBe(true);
    }
  });

  it('handles AI provider timeout and seamlessly engages deterministic fallback', async () => {
    const timeoutProvider: IAIProvider = {
      generate: async () => {
        throw new Error('AI request timed out after 4000ms');
      }
    };

    const service = new FlightDirectorService(timeoutProvider);
    const result = await service.evaluate({
      satellite,
      conjunction,
      candidateManeuver: candidate,
      simulateTimeout: true
    });

    expect(result.source).toBe('deterministic_fallback');
    expect(result.severity).toBe('CRITICAL');
    expect(result.requires_operator_review).toBe(true);
    expect(result.assumptions.some(a => a.toLowerCase().includes('timeout') || a.toLowerCase().includes('timed out'))).toBe(true);
  });

  it('falls back to deterministic engine when server AI credentials are missing', async () => {
    // Save and clear environment keys
    const origGemini = process.env.GEMINI_API_KEY;
    const origOpenai = process.env.OPENAI_API_KEY;
    const origGoogle = process.env.GOOGLE_API_KEY;

    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    try {
      const service = new FlightDirectorService(); // uses default ServerSideAIProvider
      const result = await service.evaluate({
        satellite,
        conjunction,
        candidateManeuver: candidate
      });

      expect(result.source).toBe('deterministic_fallback');
      expect(result.requires_operator_review).toBe(true);
      expect(result.assumptions.some(a => a.includes('credentials missing'))).toBe(true);
    } finally {
      if (origGemini) process.env.GEMINI_API_KEY = origGemini;
      if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
      if (origGoogle) process.env.GOOGLE_API_KEY = origGoogle;
    }
  });

  it('correctly detects stale telemetry data and notes it in evidence and assumptions', async () => {
    const staleSatellite = {
      ...satellite,
      orbitDataStatus: 'STALE' as const,
      lastContact: new Date(Date.now() - 48 * 3600 * 1000).toISOString() // 48 hours ago
    };

    const service = new FlightDirectorService();
    const result = service.generateDeterministicFallback({
      satellite: staleSatellite,
      conjunction,
      candidateManeuver: candidate
    });

    expect(result.evidence.some(e => e.includes('stale'))).toBe(true);
    expect(result.assumptions.some(a => a.includes('stale') || a.includes('fresh tracking'))).toBe(true);
  });

  it('avoids inventing collision probability when Pc is missing or covariance is inadequate', async () => {
    const noPcConjunction = {
      ...conjunction,
      collisionProbability: null,
      collisionProbabilityConfidence: 'INSUFFICIENT_COVARIANCE' as const
    };

    const service = new FlightDirectorService();
    const result = service.generateDeterministicFallback({
      satellite,
      conjunction: noPcConjunction,
      candidateManeuver: null
    });

    // Must not contain fabricated probability numbers in evidence or assumptions
    expect(result.evidence.some(e => e.includes('UNCOMPUTED') || e.includes('unavailable'))).toBe(true);
    expect(result.assumptions.some(a => a.includes('unavailable') || a.includes('Covariance matrix inadequate'))).toBe(true);
    // Severity must still be critical because miss distance (184m) < 500m
    expect(result.severity).toBe('CRITICAL');
  });

  it('avoids recommending a specific burn when candidate maneuver inputs are unavailable', async () => {
    const service = new FlightDirectorService();
    
    // Evaluation with NO candidate maneuver
    const resultWithoutCandidate = service.generateDeterministicFallback({
      satellite,
      conjunction,
      candidateManeuver: null
    });

    // Must NOT state a specific delta-v or burn direction in recommendation
    expect(resultWithoutCandidate.recommendation).toContain('Maneuver Planner');
    expect(resultWithoutCandidate.recommendation).not.toContain('ΔV = +0.85 m/s');

    // Evaluation WITH candidate maneuver
    const resultWithCandidate = service.generateDeterministicFallback({
      satellite,
      conjunction,
      candidateManeuver: candidate
    });

    // Must refer to the staged candidate maneuver
    expect(resultWithCandidate.recommendation).toContain(candidate.id);
    expect(resultWithCandidate.recommendation).toContain('Gate 5');
  });

  it('strictly enforces operator review requirement across all operational paths', async () => {
    const service = new FlightDirectorService();

    // 1. Critical path
    const res1 = service.generateDeterministicFallback({ satellite, conjunction, candidateManeuver: candidate });
    expect(res1.requires_operator_review).toBe(true);

    // 2. Cleared path
    const clearedConjunction = { ...conjunction, status: 'CLEARED' as const };
    const res2 = service.generateDeterministicFallback({ satellite, conjunction: clearedConjunction, workflowStage: 'CLEAR' });
    expect(res2.requires_operator_review).toBe(true);
    expect(res2.severity).toBe('INFO');
  });
});
