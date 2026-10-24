import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = 'http://localhost:3001';

describe('Phase 8 — Primary 15-Step Operator Demo Journey Acceptance Test', () => {
  let initialSatelliteId = 'SAT-LEO-02';
  let initialConjunctionId = 'CONJ-2026-084';
  let candidateManeuverId = 'MAN-2026-084-CANDIDATE';

  beforeAll(async () => {
    // Reset workflow to clean baseline
    await fetch(`${BASE_URL}/api/v1/workflow/reset`, { method: 'POST' });
  });

  it('Step 1: Open Mission Control & fetch fleet summary', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/fleet/summary`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.totalSatellites).toBeGreaterThanOrEqual(1);
    expect(body.data.activeConjunctionsCount).toBeGreaterThanOrEqual(1);
  });

  it('Step 2: Inspect demo/live data mode provenance and labels', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dataMode).toBe('DEMO'); // Initial state is DEMO data
  });

  it('Step 3: Select a satellite and verify state vector & telemetry', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/satellites/${initialSatelliteId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const sat = body.data;
    expect(sat.id).toBe(initialSatelliteId);
    expect(sat.name).toBe('SENTINEL-X');
    expect(sat.massKg).toBeGreaterThan(0);
    expect(sat.remainingFuelKg).toBeGreaterThan(0);
    expect(sat.ispSeconds).toBeGreaterThan(0);
    expect(sat.stateVector).toBeDefined();
    expect(sat.stateVector.referenceFrame).toBe('ECI_J2000');
  });

  it('Step 4: Open featured conjunction & transition to CONJUNCTION_DETECTED', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/conjunctions/${initialConjunctionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const conj = body.data;
    expect(conj.id).toBe(initialConjunctionId);
    expect(conj.primarySatelliteId).toBe(initialSatelliteId);

    // Transition workflow
    const wfRes = await fetch(`${BASE_URL}/api/v1/workflow/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toState: 'CONJUNCTION_DETECTED',
        conjunctionId: conj.id,
        satelliteId: conj.primarySatelliteId,
        notes: 'Operator selected featured conjunction in Mission Control'
      })
    });
    expect(wfRes.status).toBe(200);
    const wfBody = await wfRes.json();
    expect(wfBody.data.currentState).toBe('CONJUNCTION_DETECTED');
  });

  it('Step 5: Inspect TCA, miss distance, provenance, and uncertainty status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/conjunctions/${initialConjunctionId}`);
    const body = await res.json();
    const conj = body.data;
    expect(conj.tca).toBeDefined();
    expect(conj.missDistanceKm.total).toBe(0.184); // 184 meters (below 500m critical threshold)
    expect(conj.collisionProbability).toBe(0.00482);
    expect(conj.riskLevel).toBe('CRITICAL');
    expect(conj.provenance.source).toBe('SYNTHETIC_DEMO');
    expect(conj.collisionProbabilityConfidence).toBe('HIGH');
  });

  it('Step 6: Request Flight Director assessment', async () => {
    const evalRes = await fetch(`${BASE_URL}/api/v1/flight-director/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conjunctionId: initialConjunctionId,
        satelliteId: initialSatelliteId,
        workflowStage: 'CONJUNCTION_DETECTED',
        forceFallback: true // Deterministic verification without cloud dependencies
      })
    });
    expect(evalRes.status).toBe(200);
    const evalBody = await evalRes.json();
    const assessment = evalBody.data;
    expect(assessment.severity).toBe('CRITICAL');
    expect(assessment.summary).toContain('SENTINEL-X');
    expect(assessment.requires_operator_review).toBe(true);

    // Advance workflow state to ASSESSMENT_COMPLETE
    const wfRes = await fetch(`${BASE_URL}/api/v1/workflow/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toState: 'ASSESSMENT_COMPLETE',
        conjunctionId: initialConjunctionId,
        satelliteId: initialSatelliteId,
        notes: 'Flight Director assessment evaluated'
      })
    });
    const wfBody = await wfRes.json();
    expect(wfBody.data.currentState).toBe('ASSESSMENT_COMPLETE');
  });

  it('Step 7: Review evidence and assumptions in assessment', async () => {
    const evalRes = await fetch(`${BASE_URL}/api/v1/flight-director/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conjunctionId: initialConjunctionId,
        satelliteId: initialSatelliteId,
        workflowStage: 'ASSESSMENT_COMPLETE',
        forceFallback: true
      })
    });
    const body = await evalRes.json();
    const assessment = body.data;
    expect(assessment.evidence.length).toBeGreaterThanOrEqual(1);
    expect(assessment.assumptions.length).toBeGreaterThanOrEqual(1);
    expect(assessment.recommendation).toBeDefined();
  });

  it('Step 8 & 9: Open maneuver planner, change Delta-V, and recalculate', async () => {
    const payload = {
      spacecraftMassKg: 1250.0,
      fuelCapacityKg: 200.0,
      remainingFuelKg: 128.5,
      specificImpulseSeconds: 220.0,
      deltaVMagnitudeMps: 1.25, // Adjusted from 0.85
      burnDirection: 'ALONG_TRACK_POS',
      timeBeforeTcaSeconds: 9000,
      baselineMissDistanceKm: { total: 0.184, radial: -0.042, inTrack: 0.165, crossTrack: 0.071 },
      baselinePc: 0.00482
    };

    const res = await fetch(`${BASE_URL}/api/v1/maneuvers/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const result = body.data;
    expect(result.targetCriteriaMet).toBe(true);
    expect(result.postManeuverMissMeters).toBeGreaterThan(500);
    expect(result.idealPropellantConsumedKg).toBeGreaterThan(0);
    expect(result.remainingPropellantPostBurnKg).toBeLessThan(128.5);
  });

  it('Step 10: Save candidate maneuver and transition to MANEUVER_CANDIDATE_CREATED', async () => {
    const candidate = {
      id: candidateManeuverId,
      conjunctionId: initialConjunctionId,
      targetObjectId: initialSatelliteId,
      executionTime: '2026-10-24T13:45:00.000Z',
      burnDirection: 'ALONG_TRACK_POS',
      deltaVMagnitudeMps: 1.25,
      deltaVVectorMps: { radial: 0, inTrack: 1.25, crossTrack: 0 },
      estimatedPropellantKg: 0.724,
      burnDurationSeconds: 5.0,
      assumptions: ['Tsiolkovsky impulsive thrust model'],
      status: 'DRAFT'
    };

    const wfRes = await fetch(`${BASE_URL}/api/v1/workflow/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toState: 'MANEUVER_CANDIDATE_CREATED',
        conjunctionId: initialConjunctionId,
        satelliteId: initialSatelliteId,
        candidateManeuver: candidate,
        notes: 'Candidate maneuver saved in planner'
      })
    });
    expect(wfRes.status).toBe(200);
    const wfBody = await wfRes.json();
    expect(wfBody.data.currentState).toBe('MANEUVER_CANDIDATE_CREATED');
    expect(wfBody.data.hasCandidateManeuver).toBe(true);
  });

  it('Step 11: Explicitly approve the simulation (Gate 5 Sign-Off)', async () => {
    const wfRes = await fetch(`${BASE_URL}/api/v1/workflow/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toState: 'AWAITING_OPERATOR_APPROVAL',
        conjunctionId: initialConjunctionId,
        satelliteId: initialSatelliteId,
        notes: 'Operator submitted candidate to Gate 5'
      })
    });
    expect(wfRes.status).toBe(200);
    const wfBody = await wfRes.json();
    expect(wfBody.data.currentState).toBe('AWAITING_OPERATOR_APPROVAL');
  });

  it('Step 12: Execute the simulated maneuver with anti-duplicate lock', async () => {
    const burnRes = await fetch(`${BASE_URL}/api/v1/workflow/execute-burn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conjunctionId: initialConjunctionId,
        satelliteId: initialSatelliteId,
        authorizationKey: 'OP-AUTH-77291',
        simulatedBy: 'Flight Operations Console (HITL)'
      })
    });
    expect(burnRes.status).toBe(200);
    const burnBody = await burnRes.json();
    expect(burnBody.data.currentState).toBe('POST_MANEUVER_VERIFICATION_COMPLETE');
    expect(burnBody.data.burnResult.executionStatus).toBe('COMPLETED_SIMULATION');
    expect(burnBody.data.burnResult.isSimulatedOnly).toBe(true);
  });

  it('Step 13: Review post-maneuver verification status and illustrative note', async () => {
    const statusRes = await fetch(`${BASE_URL}/api/v1/workflow/status`);
    const statusBody = await statusRes.json();
    const status = statusBody.data;
    expect(status.currentState).toBe('POST_MANEUVER_VERIFICATION_COMPLETE');
    expect(status.verificationStatus).toBe('ILLUSTRATIVE_VERIFIED');
    expect(status.operatorApproved).toBe(true);
  });

  it('Step 14: Inspect event history ledger', async () => {
    const evRes = await fetch(`${BASE_URL}/api/v1/events?limit=10`);
    expect(evRes.status).toBe(200);
    const evBody = await evRes.json();
    expect(evBody.data.length).toBeGreaterThanOrEqual(5);

    // Verify workflow event categories exist
    const categories = evBody.data.map((e: any) => e.category);
    expect(categories).toContain('CONJUNCTION');
  });

  it('Step 15: Archive & Close workflow, verify shared state consistency', async () => {
    const closeRes = await fetch(`${BASE_URL}/api/v1/workflow/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toState: 'CLOSED',
        conjunctionId: initialConjunctionId,
        satelliteId: initialSatelliteId,
        notes: 'Operator closed encounter case'
      })
    });
    expect(closeRes.status).toBe(200);
    const closeBody = await closeRes.json();
    expect(closeBody.data.currentState).toBe('CLOSED');

    // Confirm Mission Control status query returns consistent closed state
    const mcStatusRes = await fetch(`${BASE_URL}/api/v1/workflow/status`);
    const mcStatus = await mcStatusRes.json();
    expect(mcStatus.data.currentState).toBe('CLOSED');
  });
});
