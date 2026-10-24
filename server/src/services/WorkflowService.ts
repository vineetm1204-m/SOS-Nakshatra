import { 
  WorkflowState, 
  WorkflowEventType, 
  WorkflowTransitionRecord, 
  WorkflowStatus, 
  ConjunctionEvent, 
  Satellite, 
  ManeuverCandidate, 
  OperationalEvent 
} from '../types.js';
import { scenarioRepository } from './ScenarioRepository.js';

export interface TransitionPayload {
  toState: WorkflowState;
  eventType: WorkflowEventType;
  reason: string;
  associatedSatelliteId?: string;
  associatedConjunctionId?: string;
  operatorApproved?: boolean;
  candidateManeuver?: ManeuverCandidate | null;
  assessmentSummary?: string;
  verificationOutcome?: {
    postMissMeters: number;
    postPc: number | null;
    isIllustrative: boolean;
  };
  metadata?: Record<string, string | number | boolean>;
}

export class WorkflowService {
  private currentState: WorkflowState = 'CONJUNCTION_DETECTED';
  private selectedSatelliteId: string = 'SAT-LEO-02';
  private selectedConjunctionId: string = 'CONJ-2026-084';
  private candidateManeuver: ManeuverCandidate | null = null;
  private operatorApproved: boolean = false;
  private burnExecuting: boolean = false;
  private verificationStatus: 'PENDING' | 'ILLUSTRATIVE_VERIFIED' | 'PHYSICAL_VERIFIED' | 'BLOCKED' = 'PENDING';
  private transitionHistory: WorkflowTransitionRecord[] = [];

  // Legal transitions mapping
  private readonly legalTransitions: Record<WorkflowState, WorkflowState[]> = {
    MONITORING: ['CONJUNCTION_DETECTED', 'FAILED_OR_BLOCKED'],
    CONJUNCTION_DETECTED: ['ASSESSMENT_COMPLETE', 'FAILED_OR_BLOCKED', 'MONITORING'],
    ASSESSMENT_COMPLETE: ['MANEUVER_CANDIDATE_CREATED', 'FAILED_OR_BLOCKED', 'MONITORING'],
    MANEUVER_CANDIDATE_CREATED: ['AWAITING_OPERATOR_APPROVAL', 'FAILED_OR_BLOCKED', 'MONITORING'],
    AWAITING_OPERATOR_APPROVAL: ['SIMULATED_MANEUVER_EXECUTING', 'FAILED_OR_BLOCKED', 'MONITORING'],
    SIMULATED_MANEUVER_EXECUTING: ['POST_MANEUVER_VERIFICATION_COMPLETE', 'FAILED_OR_BLOCKED'],
    POST_MANEUVER_VERIFICATION_COMPLETE: ['CLOSED', 'FAILED_OR_BLOCKED', 'MONITORING'],
    CLOSED: ['MONITORING', 'CONJUNCTION_DETECTED'],
    FAILED_OR_BLOCKED: ['MONITORING', 'CONJUNCTION_DETECTED', 'ASSESSMENT_COMPLETE', 'MANEUVER_CANDIDATE_CREATED', 'AWAITING_OPERATOR_APPROVAL']
  };

  constructor() {
    // Initial transition record
    this.recordTransition(
      'MONITORING',
      'CONJUNCTION_DETECTED',
      'DETERMINISTIC_ASSESSMENT',
      'Initial deterministic conjunction flagged in screening window.',
      'SAT-LEO-02',
      'CONJ-2026-084'
    );
  }

  getStatus(): WorkflowStatus {
    return {
      currentState: this.currentState,
      selectedSatelliteId: this.selectedSatelliteId,
      selectedConjunctionId: this.selectedConjunctionId,
      hasCandidateManeuver: !!this.candidateManeuver,
      operatorApproved: this.operatorApproved,
      burnExecuting: this.burnExecuting,
      verificationStatus: this.verificationStatus,
      history: [...this.transitionHistory],
      lastUpdated: new Date().toISOString()
    };
  }

  setSelectedContext(satId?: string, conjId?: string) {
    if (satId) this.selectedSatelliteId = satId;
    if (conjId) this.selectedConjunctionId = conjId;
  }

  setCandidateManeuver(candidate: ManeuverCandidate | null) {
    this.candidateManeuver = candidate ? { ...candidate } : null;
  }

  /**
   * Validates prerequisites and performs atomic legal state transition.
   */
  async transition(payload: TransitionPayload): Promise<WorkflowStatus> {
    const { toState, eventType, reason, operatorApproved, candidateManeuver, verificationOutcome } = payload;
    const fromState = this.currentState;

    // 1. Verify Legal State Transition
    const allowed = this.legalTransitions[fromState] || [];
    if (!allowed.includes(toState)) {
      throw new Error(`Illegal state transition from ${fromState} to ${toState}. Allowed: [${allowed.join(', ')}].`);
    }

    // 2. Enforce Prerequisites for Target States
    if (toState === 'CONJUNCTION_DETECTED') {
      const conjId = payload.associatedConjunctionId || this.selectedConjunctionId;
      if (!conjId) throw new Error('Cannot transition to CONJUNCTION_DETECTED: Missing conjunction ID.');
    }

    if (toState === 'ASSESSMENT_COMPLETE') {
      // Must have conjunction
      if (!this.selectedConjunctionId) {
        throw new Error('Cannot transition to ASSESSMENT_COMPLETE: No active conjunction selected.');
      }
    }

    if (toState === 'MANEUVER_CANDIDATE_CREATED') {
      const cand = candidateManeuver || this.candidateManeuver;
      if (!cand || cand.deltaVMagnitudeMps <= 0) {
        this.currentState = 'FAILED_OR_BLOCKED';
        throw new Error('Cannot transition to MANEUVER_CANDIDATE_CREATED: Candidate maneuver is missing or has invalid Delta-V.');
      }
      this.candidateManeuver = { ...cand };
    }

    if (toState === 'AWAITING_OPERATOR_APPROVAL') {
      if (!this.candidateManeuver) {
        this.currentState = 'FAILED_OR_BLOCKED';
        throw new Error('Cannot transition to AWAITING_OPERATOR_APPROVAL: No candidate maneuver available for sign-off.');
      }
      this.operatorApproved = false; // Reset approval until explicit action
    }

    if (toState === 'SIMULATED_MANEUVER_EXECUTING') {
      // Duplicate click prevention
      if (this.burnExecuting) {
        throw new Error('Duplicate execution command blocked: Simulated burn is already in progress.');
      }

      // Mandatory operator approval prerequisite
      const isApproved = operatorApproved !== undefined ? operatorApproved : this.operatorApproved;
      if (!isApproved) {
        this.currentState = 'FAILED_OR_BLOCKED';
        this.recordTransition(fromState, 'FAILED_OR_BLOCKED', 'OPERATOR_DECLINED', 'Execution blocked: Operator sign-off missing.', this.selectedSatelliteId, this.selectedConjunctionId);
        throw new Error('Execution blocked: Mandatory human operator authorization (Gate 5) is required before burn execution.');
      }

      if (!this.candidateManeuver) {
        this.currentState = 'FAILED_OR_BLOCKED';
        throw new Error('Execution blocked: No valid candidate maneuver found to execute.');
      }

      this.burnExecuting = true;
    }

    if (toState === 'POST_MANEUVER_VERIFICATION_COMPLETE') {
      this.burnExecuting = false;

      if (verificationOutcome) {
        if (verificationOutcome.postMissMeters >= 500) {
          this.verificationStatus = verificationOutcome.isIllustrative ? 'ILLUSTRATIVE_VERIFIED' : 'PHYSICAL_VERIFIED';
        } else {
          this.verificationStatus = 'BLOCKED';
          this.currentState = 'FAILED_OR_BLOCKED';
          throw new Error(`Verification failed: Post-maneuver miss distance of ${verificationOutcome.postMissMeters}m is below the 500m threshold.`);
        }
      } else {
        this.verificationStatus = 'ILLUSTRATIVE_VERIFIED';
      }
    }

    if (toState === 'CLOSED') {
      this.burnExecuting = false;
      this.operatorApproved = false;
    }

    // 3. Apply Transition
    this.currentState = toState;
    if (operatorApproved !== undefined) {
      this.operatorApproved = operatorApproved;
    }

    const satId = payload.associatedSatelliteId || this.selectedSatelliteId;
    const conjId = payload.associatedConjunctionId || this.selectedConjunctionId;

    this.recordTransition(fromState, toState, eventType, reason, satId, conjId, payload.metadata);

    // 4. Record to ScenarioRepository Operational Events Ledger
    await this.recordLedgerEvent(toState, eventType, reason, satId, conjId, payload.metadata);

    return this.getStatus();
  }

  /**
   * Executes deterministic simulated burn with safety boundary and idempotent execution lock.
   */
  async executeSimulatedBurn(options?: {
    authorizationKey?: string;
    operatorCallsign?: string;
    simulateFailure?: boolean;
  }): Promise<{ status: WorkflowStatus; simulatedBurnResult: Record<string, any> }> {
    // 1. Check idempotency lock
    if (this.burnExecuting) {
      throw new Error('Duplicate execution blocked: A simulated burn sequence is already executing.');
    }

    // 2. Check prerequisites
    if (!this.candidateManeuver) {
      await this.transition({
        toState: 'FAILED_OR_BLOCKED',
        eventType: 'VERIFICATION_BLOCKED',
        reason: 'Simulated burn failed: No candidate maneuver staged.'
      });
      throw new Error('Cannot execute simulated burn: Candidate maneuver has not been configured.');
    }

    if (!this.operatorApproved) {
      await this.transition({
        toState: 'FAILED_OR_BLOCKED',
        eventType: 'OPERATOR_DECLINED',
        reason: 'Simulated burn failed: Operator approval was not confirmed.'
      });
      throw new Error('Cannot execute simulated burn: Operator authorization required.');
    }

    if (options?.simulateFailure) {
      this.burnExecuting = false;
      await this.transition({
        toState: 'FAILED_OR_BLOCKED',
        eventType: 'SIMULATED_EXECUTION',
        reason: 'Simulated thruster ignition failure: Manifold pressure drop.'
      });
      throw new Error('Simulated burn aborted due to simulated thruster failure.');
    }

    // 3. Transition to SIMULATED_MANEUVER_EXECUTING
    await this.transition({
      toState: 'SIMULATED_MANEUVER_EXECUTING',
      eventType: 'SIMULATED_EXECUTION',
      reason: `Initiating simulated RCS impulsive burn sequence (Δv = ${this.candidateManeuver.deltaVMagnitudeMps} m/s).`,
      operatorApproved: true,
      metadata: {
        authorizationKey: options?.authorizationKey || 'OP-AUTH-SIMULATED',
        operatorCallsign: options?.operatorCallsign || 'FLIGHT_DIRECTOR_1',
        deltaVMps: this.candidateManeuver.deltaVMagnitudeMps,
        isSimulatedOnly: true
      }
    });

    const candidate = this.candidateManeuver;
    const postMissMeters = 23115; // From tested CW encounter model
    const postPc = 1e-9;

    // 4. Transition to POST_MANEUVER_VERIFICATION_COMPLETE
    const status = await this.transition({
      toState: 'POST_MANEUVER_VERIFICATION_COMPLETE',
      eventType: 'VERIFICATION_COMPLETE',
      reason: `Simulated burn complete. Illustrative verification: Post-maneuver separation = ${postMissMeters}m (clear of 500m threshold).`,
      verificationOutcome: {
        postMissMeters,
        postPc,
        isIllustrative: true // Clearly labeled illustrative verification
      },
      metadata: {
        postMissMeters,
        targetCriteriaMet: true,
        verificationType: 'ILLUSTRATIVE_CW_ENCOUNTER_MODEL'
      }
    });

    return {
      status,
      simulatedBurnResult: {
        executionStatus: 'COMPLETED_SIMULATION',
        isSimulatedOnly: true,
        authorizationKey: options?.authorizationKey || 'OP-AUTH-SIMULATED',
        deltaVMps: candidate.deltaVMagnitudeMps,
        burnDurationSeconds: candidate.burnDurationSeconds,
        fuelConsumedKg: candidate.estimatedPropellantKg,
        postMissMeters,
        postPc,
        verificationLabel: 'Illustrative verification (linearized CW relative encounter model)'
      }
    };
  }

  /**
   * Resets workflow back to initial monitoring/detected state while preserving event history.
   */
  async resetWorkflow(): Promise<WorkflowStatus> {
    const fromState = this.currentState;
    this.currentState = 'CONJUNCTION_DETECTED';
    this.operatorApproved = false;
    this.burnExecuting = false;
    this.verificationStatus = 'PENDING';

    this.recordTransition(
      fromState,
      'CONJUNCTION_DETECTED',
      'WORKFLOW_RESET',
      'Operator initiated simulation workflow reset to Gate 5 / Conjunction Detected.',
      this.selectedSatelliteId,
      this.selectedConjunctionId
    );

    await this.recordLedgerEvent(
      'CONJUNCTION_DETECTED',
      'WORKFLOW_RESET',
      'Simulation workflow reset. Baseline scenario parameters preserved.',
      this.selectedSatelliteId,
      this.selectedConjunctionId
    );

    return this.getStatus();
  }

  private recordTransition(
    fromState: WorkflowState,
    toState: WorkflowState,
    eventType: WorkflowEventType,
    reason: string,
    satId: string,
    conjId: string,
    metadata?: Record<string, string | number | boolean>
  ) {
    const record: WorkflowTransitionRecord = {
      id: `WF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`,
      fromState,
      toState,
      timestamp: new Date().toISOString(),
      eventType,
      reason,
      associatedSatelliteId: satId,
      associatedConjunctionId: conjId,
      metadata
    };
    this.transitionHistory.unshift(record);
  }

  private async recordLedgerEvent(
    state: WorkflowState,
    eventType: WorkflowEventType,
    description: string,
    satId: string,
    conjId: string,
    metadata?: Record<string, string | number | boolean>
  ) {
    try {
      let severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS' = 'INFO';
      let title = `Workflow: ${state}`;

      if (eventType === 'AI_ASSESSMENT') {
        title = 'AI Flight Director Assessment Completed';
        severity = 'WARNING';
      } else if (eventType === 'DETERMINISTIC_ASSESSMENT') {
        title = 'Deterministic Rule-Based Assessment Completed';
        severity = 'WARNING';
      } else if (eventType === 'CANDIDATE_SAVED') {
        title = 'Collision Avoidance Candidate Staged';
        severity = 'INFO';
      } else if (eventType === 'OPERATOR_APPROVAL') {
        title = 'Operator Burn Authorization Sign-Off (Gate 5)';
        severity = 'SUCCESS';
      } else if (eventType === 'OPERATOR_DECLINED') {
        title = 'Operator Declined Burn Authorization';
        severity = 'WARNING';
      } else if (eventType === 'SIMULATED_EXECUTION') {
        title = 'Simulated Avoidance Maneuver Executed';
        severity = 'SUCCESS';
      } else if (eventType === 'VERIFICATION_COMPLETE') {
        title = 'Post-Maneuver Verification Cleared';
        severity = 'SUCCESS';
      } else if (eventType === 'VERIFICATION_BLOCKED') {
        title = 'Workflow Blocked: Prerequisite Not Satisfied';
        severity = 'CRITICAL';
      } else if (eventType === 'WORKFLOW_RESET') {
        title = 'Operator Reset Workflow Simulation';
        severity = 'INFO';
      }

      const event: OperationalEvent = {
        id: `EVT-WF-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
        category: 'CONJUNCTION',
        severity,
        title,
        description,
        associatedSatelliteId: satId,
        associatedConjunctionId: conjId,
        metadata,
        provenance: {
          source: 'SYNTHETIC_DEMO',
          provider: 'SOS-WORKFLOW-ENGINE',
          timestamp: new Date().toISOString(),
          isDeterministicDemo: true,
          confidenceScore: 1.0,
          notes: 'Phase 7 End-to-End Workflow Transition'
        }
      };

      // Add event to ScenarioRepository
      await scenarioRepository.addOperationalEvent(event);
    } catch (e) {
      console.warn('[WorkflowService] Could not append to scenario repository events:', e);
    }
  }
}

export const workflowService = new WorkflowService();
