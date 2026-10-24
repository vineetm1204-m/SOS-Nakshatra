import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowService } from '../server/src/services/WorkflowService.js';
import { DemoScenarioProvider } from '../server/src/services/ScenarioRepository.js';
import { 
  SEED_SATELLITES, 
  SEED_CONJUNCTIONS, 
  SEED_CANDIDATE_MANEUVER 
} from '../server/src/data/seedData.js';
import { ManeuverCandidate } from '../server/src/types.js';

describe('Workflow Service — Phase 7 End-to-End Operational Pipeline', () => {
  let scenarioProvider: DemoScenarioProvider;
  let workflowService: WorkflowService;

  const satId = SEED_SATELLITES[0].id;
  const conjId = SEED_CONJUNCTIONS[0].id;
  const candidate: ManeuverCandidate = SEED_CANDIDATE_MANEUVER;

  beforeEach(() => {
    scenarioProvider = new DemoScenarioProvider();
    workflowService = new WorkflowService(scenarioProvider);
  });

  it('initializes in MONITORING state with clean history', () => {
    const status = workflowService.getStatus();
    expect(status.currentState).toBe('MONITORING');
    expect(status.verificationStatus).toBe('UNVERIFIED');
    expect(status.history.length).toBe(1);
    expect(status.history[0].toState).toBe('MONITORING');
  });

  it('follows the full legal 8-stage happy path from MONITORING to CLOSED', async () => {
    // 1. MONITORING -> CONJUNCTION_DETECTED
    let status = await workflowService.transition({
      toState: 'CONJUNCTION_DETECTED',
      conjunctionId: conjId,
      satelliteId: satId,
      notes: 'Conjunction flagged by screening envelope'
    });
    expect(status.currentState).toBe('CONJUNCTION_DETECTED');

    // 2. CONJUNCTION_DETECTED -> ASSESSMENT_COMPLETE
    status = await workflowService.transition({
      toState: 'ASSESSMENT_COMPLETE',
      conjunctionId: conjId,
      satelliteId: satId,
      notes: 'Flight Director assessment evaluated'
    });
    expect(status.currentState).toBe('ASSESSMENT_COMPLETE');

    // 3. ASSESSMENT_COMPLETE -> MANEUVER_CANDIDATE_CREATED
    status = await workflowService.transition({
      toState: 'MANEUVER_CANDIDATE_CREATED',
      conjunctionId: conjId,
      satelliteId: satId,
      candidateManeuver: candidate,
      notes: 'Candidate CAM staged in planner'
    });
    expect(status.currentState).toBe('MANEUVER_CANDIDATE_CREATED');
    expect(status.candidateManeuver).toBeDefined();

    // 4. MANEUVER_CANDIDATE_CREATED -> AWAITING_OPERATOR_APPROVAL
    status = await workflowService.transition({
      toState: 'AWAITING_OPERATOR_APPROVAL',
      conjunctionId: conjId,
      satelliteId: satId,
      candidateManeuver: candidate,
      notes: 'CAM submitted to Gate 5 for operator review'
    });
    expect(status.currentState).toBe('AWAITING_OPERATOR_APPROVAL');

    // 5. AWAITING_OPERATOR_APPROVAL -> SIMULATED_MANEUVER_EXECUTING & POST_MANEUVER_VERIFICATION_COMPLETE
    const burnExecution = await workflowService.executeSimulatedBurn({
      conjunctionId: conjId,
      satelliteId: satId,
      candidateManeuver: candidate,
      simulatedBy: 'Operator Unit Test'
    });
    expect(burnExecution.currentState).toBe('POST_MANEUVER_VERIFICATION_COMPLETE');
    expect(burnExecution.verificationStatus).toBe('ILLUSTRATIVE_VERIFIED');
    expect(burnExecution.burnResult).toBeDefined();
    expect(burnExecution.burnResult?.postBurnMissDistanceMeters).toBeGreaterThan(500);

    // 6. POST_MANEUVER_VERIFICATION_COMPLETE -> CLOSED
    status = await workflowService.transition({
      toState: 'CLOSED',
      conjunctionId: conjId,
      satelliteId: satId,
      notes: 'Encounter verified and safely archived'
    });
    expect(status.currentState).toBe('CLOSED');
  });

  it('rejects illegal transition skipping straight to SIMULATED_MANEUVER_EXECUTING from MONITORING', async () => {
    await expect(workflowService.transition({
      toState: 'SIMULATED_MANEUVER_EXECUTING',
      notes: 'Unauthorized jump'
    })).rejects.toThrow(/Illegal workflow transition/);

    expect(workflowService.getStatus().currentState).toBe('FAILED_OR_BLOCKED');
  });

  it('blocks transition to CONJUNCTION_DETECTED if conjunctionId is missing', async () => {
    await expect(workflowService.transition({
      toState: 'CONJUNCTION_DETECTED'
      // missing conjunctionId
    })).rejects.toThrow(/requires conjunctionId/);

    expect(workflowService.getStatus().currentState).toBe('FAILED_OR_BLOCKED');
  });

  it('blocks transition to MANEUVER_CANDIDATE_CREATED if candidateManeuver is missing', async () => {
    // Move to CONJUNCTION_DETECTED then ASSESSMENT_COMPLETE first
    await workflowService.transition({
      toState: 'CONJUNCTION_DETECTED',
      conjunctionId: conjId,
      satelliteId: satId
    });
    await workflowService.transition({
      toState: 'ASSESSMENT_COMPLETE',
      conjunctionId: conjId,
      satelliteId: satId
    });

    await expect(workflowService.transition({
      toState: 'MANEUVER_CANDIDATE_CREATED',
      conjunctionId: conjId,
      satelliteId: satId
      // missing candidateManeuver
    })).rejects.toThrow(/requires a candidate maneuver/);

    expect(workflowService.getStatus().currentState).toBe('FAILED_OR_BLOCKED');
  });

  it('enforces idempotency and prevents concurrent simulated burn execution', async () => {
    // Stage up to AWAITING_OPERATOR_APPROVAL
    await workflowService.transition({
      toState: 'CONJUNCTION_DETECTED',
      conjunctionId: conjId,
      satelliteId: satId
    });
    await workflowService.transition({
      toState: 'ASSESSMENT_COMPLETE',
      conjunctionId: conjId,
      satelliteId: satId
    });
    await workflowService.transition({
      toState: 'MANEUVER_CANDIDATE_CREATED',
      conjunctionId: conjId,
      satelliteId: satId,
      candidateManeuver: candidate
    });
    await workflowService.transition({
      toState: 'AWAITING_OPERATOR_APPROVAL',
      conjunctionId: conjId,
      satelliteId: satId,
      candidateManeuver: candidate
    });

    // Execute burn
    const res1Promise = workflowService.executeSimulatedBurn({
      conjunctionId: conjId,
      satelliteId: satId,
      candidateManeuver: candidate
    });

    // Attempt second simultaneous burn
    await expect(workflowService.executeSimulatedBurn({
      conjunctionId: conjId,
      satelliteId: satId,
      candidateManeuver: candidate
    })).rejects.toThrow(/Simulated burn sequence is already in progress/);

    const res1 = await res1Promise;
    expect(res1.currentState).toBe('POST_MANEUVER_VERIFICATION_COMPLETE');
  });

  it('logs operational events into the mission operations ledger during workflow actions', async () => {
    const initialEvents = (await scenarioProvider.getEvents()).length;

    await workflowService.transition({
      toState: 'CONJUNCTION_DETECTED',
      conjunctionId: conjId,
      satelliteId: satId
    });

    const updatedEvents = await scenarioProvider.getEvents();
    expect(updatedEvents.length).toBe(initialEvents + 1);
    expect(updatedEvents[0].associatedConjunctionId).toBe(conjId);
  });

  it('resets workflow cleanly back to MONITORING and preserves baseline data', async () => {
    await workflowService.transition({
      toState: 'CONJUNCTION_DETECTED',
      conjunctionId: conjId,
      satelliteId: satId
    });

    const resetStatus = await workflowService.reset();
    expect(resetStatus.currentState).toBe('MONITORING');
    expect(resetStatus.verificationStatus).toBe('UNVERIFIED');
    expect(resetStatus.activeConjunctionId).toBeNull();
    expect(resetStatus.candidateManeuver).toBeNull();
  });
});
