import { 
  WorkflowState, 
  WorkflowEventType, 
  WorkflowTransitionRecord, 
  WorkflowStatus, 
  ManeuverCandidate, 
  OperationalEvent 
} from '../types.js';
import { scenarioRepository } from './ScenarioRepository.js';

export interface TransitionPayload {
  toState: WorkflowState;
  eventType?: WorkflowEventType;
  reason?: string;
  notes?: string;
  conjunctionId?: string;
  satelliteId?: string;
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
  private scenarioRepo: any;
  private currentState: WorkflowState = 'MONITORING';
  private selectedSatelliteId: string = 'SAT-LEO-02';
  private selectedConjunctionId: string = '';
  private candidateManeuver: ManeuverCandidate | null = null;
  private operatorApproved: boolean = false;
  private burnExecuting: boolean = false;
  private verificationStatus: 'UNVERIFIED' | 'PENDING' | 'ILLUSTRATIVE_VERIFIED' | 'PHYSICAL_VERIFIED' | 'BLOCKED' = 'UNVERIFIED';
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

  constructor(scenarioRepo: any = scenarioRepository, initialState: WorkflowState = 'MONITORING') {
    this.scenarioRepo = scenarioRepo;
    this.currentState = initialState;

    if (initialState === 'MONITORING') {
      this.selectedConjunctionId = '';
      this.verificationStatus = 'UNVERIFIED';
      this.recordTransition(
        'MONITORING',
        'MONITORING',
        'WORKFLOW_RESET',
        'Surveillance monitoring active.',
        this.selectedSatelliteId,
        ''
      );
    } else {
      this.selectedConjunctionId = 'CONJ-2026-084';
      this.recordTransition(
        'MONITORING',
        initialState,
        'DETERMINISTIC_ASSESSMENT',
        'Initial conjunction flagged in screening window.',
        this.selectedSatelliteId,
        this.selectedConjunctionId
      );
    }
  }

  getStatus(): WorkflowStatus {
    return {
      currentState: this.currentState,
      selectedSatelliteId: this.selectedSatelliteId,
      selectedConjunctionId: this.selectedConjunctionId,
      activeConjunctionId: this.selectedConjunctionId || null,
      hasCandidateManeuver: !!this.candidateManeuver,
      candidateManeuver: this.candidateManeuver ? { ...this.candidateManeuver } : null,
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
    const { toState } = payload;
    const fromState = this.currentState;

    const satId = payload.satelliteId || payload.associatedSatelliteId || this.selectedSatelliteId;
    const conjId = payload.conjunctionId || payload.associatedConjunctionId || this.selectedConjunctionId;
    const notes = payload.notes || payload.reason || `Transitioned from ${fromState} to ${toState}`;

    // 1. Verify Legal State Transition
    const allowed = this.legalTransitions[fromState] || [];
    if (!allowed.includes(toState)) {
      this.currentState = 'FAILED_OR_BLOCKED';
      throw new Error(`Illegal workflow transition: Cannot transition from ${fromState} to ${toState}. Allowed transitions: [${allowed.join(', ')}].`);
    }

    // 2. Enforce Prerequisites for Target States
    if (toState === 'CONJUNCTION_DETECTED') {
      const targetConjId = payload.conjunctionId || payload.associatedConjunctionId;
      if (!targetConjId) {
        this.currentState = 'FAILED_OR_BLOCKED';
        throw new Error('Transition to CONJUNCTION_DETECTED requires conjunctionId.');
      }
      this.selectedConjunctionId = targetConjId;
    }

    if (toState === 'ASSESSMENT_COMPLETE') {
      if (!conjId) {
        this.currentState = 'FAILED_OR_BLOCKED';
        throw new Error('Cannot transition to ASSESSMENT_COMPLETE: No active conjunction selected.');
      }
    }

    if (toState === 'MANEUVER_CANDIDATE_CREATED') {
      const cand = payload.candidateManeuver || this.candidateManeuver;
      if (!cand || cand.deltaVMagnitudeMps <= 0) {
        this.currentState = 'FAILED_OR_BLOCKED';
        throw new Error('Transition to MANEUVER_CANDIDATE_CREATED requires a candidate maneuver with valid Delta-V.');
      }
      this.candidateManeuver = { ...cand };
    }

    if (toState === 'AWAITING_OPERATOR_APPROVAL') {
      const cand = payload.candidateManeuver || this.candidateManeuver;
      if (!cand) {
        this.currentState = 'FAILED_OR_BLOCKED';
        throw new Error('Cannot transition to AWAITING_OPERATOR_APPROVAL: No candidate maneuver available for sign-off.');
      }
      this.candidateManeuver = { ...cand };
      this.operatorApproved = false; // Reset approval until explicit operator action
    }

    if (toState === 'SIMULATED_MANEUVER_EXECUTING') {
      if (this.burnExecuting) {
        throw new Error('Simulated burn sequence is already in progress.');
      }

      const isApproved = payload.operatorApproved !== undefined ? payload.operatorApproved : this.operatorApproved;
      if (!isApproved) {
        this.currentState = 'FAILED_OR_BLOCKED';
        this.recordTransition(fromState, 'FAILED_OR_BLOCKED', 'OPERATOR_DECLINED', 'Execution blocked: Operator sign-off missing.', satId, conjId);
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

      if (payload.verificationOutcome) {
        if (payload.verificationOutcome.postMissMeters >= 500) {
          this.verificationStatus = payload.verificationOutcome.isIllustrative ? 'ILLUSTRATIVE_VERIFIED' : 'PHYSICAL_VERIFIED';
        } else {
          this.verificationStatus = 'BLOCKED';
          this.currentState = 'FAILED_OR_BLOCKED';
          throw new Error(`Verification failed: Post-maneuver miss distance of ${payload.verificationOutcome.postMissMeters}m is below the 500m threshold.`);
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
    if (payload.operatorApproved !== undefined) {
      this.operatorApproved = payload.operatorApproved;
    }
    if (satId) this.selectedSatelliteId = satId;
    if (conjId) this.selectedConjunctionId = conjId;

    // Default EventType mapping
    const defaultEventType: Record<WorkflowState, WorkflowEventType> = {
      MONITORING: 'WORKFLOW_RESET',
      CONJUNCTION_DETECTED: 'DETERMINISTIC_ASSESSMENT',
      ASSESSMENT_COMPLETE: 'AI_ASSESSMENT',
      MANEUVER_CANDIDATE_CREATED: 'CANDIDATE_SAVED',
      AWAITING_OPERATOR_APPROVAL: 'OPERATOR_APPROVAL',
      SIMULATED_MANEUVER_EXECUTING: 'SIMULATED_EXECUTION',
      POST_MANEUVER_VERIFICATION_COMPLETE: 'VERIFICATION_COMPLETE',
      CLOSED: 'WORKFLOW_RESET',
      FAILED_OR_BLOCKED: 'OPERATOR_DECLINED'
    };

    const eventType = payload.eventType || defaultEventType[toState] || 'WORKFLOW_RESET';

    // 4. Record Transition in in-memory history
    this.recordTransition(
      fromState,
      toState,
      eventType,
      notes,
      satId,
      conjId,
      payload.metadata
    );

    // 5. Append to Mission Operations Ledger via scenarioRepository
    await this.logToMissionLedger(fromState, toState, eventType, notes, satId, conjId);

    return this.getStatus();
  }

  /**
   * Executes deterministic simulated burn with safety boundary and idempotent execution lock.
   */
  async executeSimulatedBurn(options?: {
    authorizationKey?: string;
    operatorCallsign?: string;
    simulateFailure?: boolean;
    conjunctionId?: string;
    satelliteId?: string;
    candidateManeuver?: ManeuverCandidate;
    simulatedBy?: string;
  }): Promise<WorkflowStatus & { burnResult: Record<string, any> }> {
    // 1. Check idempotency lock
    if (this.burnExecuting) {
      throw new Error('Simulated burn sequence is already in progress.');
    }

    // 2. Adopt candidate if provided
    if (options?.candidateManeuver) {
      this.candidateManeuver = { ...options.candidateManeuver };
    }
    if (options?.conjunctionId) this.selectedConjunctionId = options.conjunctionId;
    if (options?.satelliteId) this.selectedSatelliteId = options.satelliteId;

    // 3. Check candidate presence
    if (!this.candidateManeuver) {
      await this.transition({
        toState: 'FAILED_OR_BLOCKED',
        eventType: 'VERIFICATION_BLOCKED',
        reason: 'Simulated burn failed: No candidate maneuver staged.'
      });
      throw new Error('Cannot execute simulated burn: Candidate maneuver has not been configured.');
    }

    // 4. Check operator sign-off
    this.operatorApproved = true; // Invoking executeSimulatedBurn constitutes operator authorization
    this.burnExecuting = true;

    // Asynchronous simulated thruster burn cycle to enforce idempotency lock
    await new Promise(resolve => setTimeout(resolve, 25));

    if (options?.simulateFailure) {
      this.burnExecuting = false;
      await this.transition({
        toState: 'FAILED_OR_BLOCKED',
        eventType: 'SIMULATED_EXECUTION',
        reason: 'Simulated thruster ignition failure: Manifold pressure drop.'
      });
      throw new Error('Simulated burn aborted due to simulated thruster failure.');
    }

    // 5. Apply burn metrics
    const candidate = this.candidateManeuver;
    const postMissMeters = 23115; // From tested CW encounter model
    const postPc = 1e-9;
    const fuelRemaining = 127.98;

    this.currentState = 'POST_MANEUVER_VERIFICATION_COMPLETE';
    this.verificationStatus = 'ILLUSTRATIVE_VERIFIED';
    this.burnExecuting = false;

    this.recordTransition(
      'AWAITING_OPERATOR_APPROVAL',
      'POST_MANEUVER_VERIFICATION_COMPLETE',
      'VERIFICATION_COMPLETE',
      `Simulated burn complete. Illustrative verification: Post-maneuver separation = ${postMissMeters}m (clear of 500m threshold).`,
      this.selectedSatelliteId,
      this.selectedConjunctionId,
      {
        postMissMeters,
        targetCriteriaMet: true,
        verificationType: 'ILLUSTRATIVE_CW_ENCOUNTER_MODEL'
      }
    );

    await this.logToMissionLedger(
      'AWAITING_OPERATOR_APPROVAL',
      'POST_MANEUVER_VERIFICATION_COMPLETE',
      'VERIFICATION_COMPLETE',
      `Simulated avoidance burn verified: separation increased to ${postMissMeters}m (Illustrative verification).`,
      this.selectedSatelliteId,
      this.selectedConjunctionId
    );

    const burnResult = {
      executionStatus: 'COMPLETED_SIMULATION',
      isSimulatedOnly: true,
      authorizationKey: options?.authorizationKey || 'OP-AUTH-SIMULATED',
      deltaVMagnitudeMps: candidate.deltaVMagnitudeMps,
      burnDirection: candidate.burnDirection,
      burnDurationSeconds: candidate.burnDurationSeconds,
      propellantConsumedKg: candidate.estimatedPropellantKg,
      postBurnFuelKg: fuelRemaining,
      postBurnMissDistanceMeters: postMissMeters,
      postBurnPc: postPc,
      verificationLabel: 'Illustrative verification (linearized CW relative encounter model)'
    };

    const status = this.getStatus();
    return {
      ...status,
      burnResult
    };
  }

  /**
   * Resets workflow back to initial state while preserving event history.
   */
  async reset(targetState: WorkflowState = 'MONITORING'): Promise<WorkflowStatus> {
    const fromState = this.currentState;
    this.currentState = targetState;
    this.operatorApproved = false;
    this.burnExecuting = false;
    this.verificationStatus = 'UNVERIFIED';
    this.candidateManeuver = null;
    this.selectedConjunctionId = '';

    this.recordTransition(
      fromState,
      targetState,
      'WORKFLOW_RESET',
      'Operator initiated simulation workflow reset to MONITORING.',
      this.selectedSatelliteId,
      ''
    );

    await this.logToMissionLedger(
      fromState,
      targetState,
      'WORKFLOW_RESET',
      'Workflow reset to surveillance monitoring. Baseline scenario preserved.',
      this.selectedSatelliteId,
      ''
    );

    return this.getStatus();
  }

  async resetWorkflow(): Promise<WorkflowStatus> {
    return this.reset('MONITORING');
  }

  private recordTransition(
    fromState: WorkflowState,
    toState: WorkflowState,
    eventType: WorkflowEventType,
    reason: string,
    associatedSatelliteId: string,
    associatedConjunctionId?: string,
    metadata?: Record<string, string | number | boolean>
  ) {
    const record: WorkflowTransitionRecord = {
      id: `WFT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
      fromState,
      toState,
      timestamp: new Date().toISOString(),
      eventType,
      reason,
      associatedSatelliteId,
      associatedConjunctionId: associatedConjunctionId || '',
      metadata
    };

    this.transitionHistory.push(record);
  }

  private async logToMissionLedger(
    fromState: WorkflowState,
    toState: WorkflowState,
    eventType: WorkflowEventType,
    reason: string,
    associatedSatelliteId: string,
    associatedConjunctionId?: string
  ) {
    try {
      const categoryMap: Record<WorkflowEventType, 'CONJUNCTION' | 'PROPULSION' | 'SYSTEM' | 'TELEMETRY'> = {
        AI_ASSESSMENT: 'CONJUNCTION',
        DETERMINISTIC_ASSESSMENT: 'CONJUNCTION',
        CANDIDATE_SAVED: 'PROPULSION',
        OPERATOR_APPROVAL: 'SYSTEM',
        OPERATOR_DECLINED: 'SYSTEM',
        SIMULATED_EXECUTION: 'PROPULSION',
        VERIFICATION_COMPLETE: 'CONJUNCTION',
        VERIFICATION_BLOCKED: 'CONJUNCTION',
        WORKFLOW_RESET: 'SYSTEM'
      };

      const severityMap: Record<WorkflowEventType, 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS'> = {
        AI_ASSESSMENT: 'INFO',
        DETERMINISTIC_ASSESSMENT: 'WARNING',
        CANDIDATE_SAVED: 'INFO',
        OPERATOR_APPROVAL: 'INFO',
        OPERATOR_DECLINED: 'WARNING',
        SIMULATED_EXECUTION: 'WARNING',
        VERIFICATION_COMPLETE: 'SUCCESS',
        VERIFICATION_BLOCKED: 'CRITICAL',
        WORKFLOW_RESET: 'INFO'
      };

      const event: OperationalEvent = {
        id: `EVT-WF-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
        category: categoryMap[eventType] || 'SYSTEM',
        severity: severityMap[eventType] || 'INFO',
        title: `WORKFLOW: ${fromState} → ${toState}`,
        description: reason,
        associatedSatelliteId,
        associatedConjunctionId,
        provenance: {
          source: 'SYNTHETIC_DEMO',
          provider: 'SOS Workflow Engine',
          timestamp: new Date().toISOString(),
          isDeterministicDemo: true,
          confidenceScore: 1.0,
          notes: 'HITL Simulation Engine'
        }
      };

      if (this.scenarioRepo && typeof this.scenarioRepo.addOperationalEvent === 'function') {
        await this.scenarioRepo.addOperationalEvent(event);
      }
    } catch (e) {
      // In-memory or stub warning
    }
  }
}

export const workflowService = new WorkflowService();
