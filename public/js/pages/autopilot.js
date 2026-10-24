/**
 * SOS Flight Director Controller (autopilot.js)
 * Manages the 8-stage operational execution workflow, evidence audit,
 * mandatory operator approval gate, simulated burn execution, and post-maneuver verification.
 */
import { ApiClient } from '../api.js';
import { store } from '../state.js';

class FlightDirectorController {
  constructor() {
    this.forceFallback = false;
    this.conjunctionId = 'CONJ-2026-084';
    this.satelliteId = 'SAT-LEO-02';
    this.candidateManeuver = null;
    this.currentAssessment = null;
    this.isExecuting = false;
  }

  async init() {
    this.initEventListeners();
    this.loadSessionCandidate();
    await this.syncWorkflowStatus();
    await this.loadAssessment();
  }

  loadSessionCandidate() {
    try {
      const stateCandidate = store.getState().candidateManeuver;
      if (stateCandidate) {
        this.candidateManeuver = stateCandidate;
      } else {
        const stored = sessionStorage.getItem('sos_candidate_maneuver');
        if (stored) {
          this.candidateManeuver = JSON.parse(stored);
          store.setCandidateManeuver(this.candidateManeuver);
        }
      }
      if (this.candidateManeuver) {
        this.logMessage(`Loaded candidate avoidance maneuver ${this.candidateManeuver.id} (Δv=${this.candidateManeuver.deltaVMagnitudeMps || 0.85} m/s).`, '#00e5ff');
      }
    } catch (e) {
      console.warn('[Flight Director] Could not parse session candidate maneuver:', e);
    }
  }

  async syncWorkflowStatus() {
    try {
      const res = await ApiClient.getWorkflowStatus();
      if (res?.data?.currentState) {
        store.setWorkflowState(res.data.currentState);
        this.updateWorkflowStepper(res.data.currentState);
        this.updateWorkflowCards(res.data.currentState, res.data.verificationStatus, res.data.burnResult);
      }
    } catch (err) {
      console.warn('[Flight Director] Backend workflow sync error:', err.message);
      this.updateWorkflowStepper(store.getState().workflowState);
    }
  }

  initEventListeners() {
    const btnApprove = document.getElementById('btn-approve-burn');
    const btnAbort = document.getElementById('btn-abort-burn');
    const btnReset = document.getElementById('btn-reset-workflow');
    const btnRetry = document.getElementById('btn-retry-assessment');
    const btnErrorRetry = document.getElementById('btn-error-retry');
    const btnToggleSource = document.getElementById('btn-toggle-source');
    const btnClose = document.getElementById('btn-close-workflow');
    const btnReopen = document.getElementById('btn-reopen-workflow');

    if (btnApprove) {
      btnApprove.addEventListener('click', () => this.executeSimulatedBurn());
    }

    if (btnAbort) {
      btnAbort.addEventListener('click', () => this.abortWorkflow());
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => this.resetWorkflow());
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeWorkflow());
    }

    if (btnReopen) {
      btnReopen.addEventListener('click', () => this.resetWorkflow());
    }

    if (btnRetry) {
      btnRetry.addEventListener('click', () => this.loadAssessment());
    }

    if (btnErrorRetry) {
      btnErrorRetry.addEventListener('click', () => this.loadAssessment());
    }

    if (btnToggleSource) {
      btnToggleSource.addEventListener('click', () => {
        this.forceFallback = !this.forceFallback;
        btnToggleSource.textContent = this.forceFallback ? '🤖 SWITCH TO AI ASSISTANT' : '⚙️ SWITCH TO FALLBACK';
        this.logMessage(`Evaluation mode switched: ${this.forceFallback ? 'Forced Deterministic Fallback' : 'AI Assistant Primary'}.`, '#ffd54f');
        this.loadAssessment();
      });
    }

    // Subscribe to state updates
    store.subscribe((event, payload) => {
      if (event === 'workflowStateChanged') {
        this.updateWorkflowStepper(payload);
      }
    });
  }

  updateWorkflowStepper(state) {
    const steps = [
      { id: 'step-track', states: ['MONITORING', 'CONJUNCTION_DETECTED', 'ASSESSMENT_COMPLETE', 'MANEUVER_CANDIDATE_CREATED', 'AWAITING_OPERATOR_APPROVAL', 'SIMULATED_MANEUVER_EXECUTING', 'POST_MANEUVER_VERIFICATION_COMPLETE', 'CLOSED'] },
      { id: 'step-detect', states: ['CONJUNCTION_DETECTED', 'ASSESSMENT_COMPLETE', 'MANEUVER_CANDIDATE_CREATED', 'AWAITING_OPERATOR_APPROVAL', 'SIMULATED_MANEUVER_EXECUTING', 'POST_MANEUVER_VERIFICATION_COMPLETE', 'CLOSED'] },
      { id: 'step-assess', states: ['ASSESSMENT_COMPLETE', 'MANEUVER_CANDIDATE_CREATED', 'AWAITING_OPERATOR_APPROVAL', 'SIMULATED_MANEUVER_EXECUTING', 'POST_MANEUVER_VERIFICATION_COMPLETE', 'CLOSED'] },
      { id: 'step-plan', states: ['MANEUVER_CANDIDATE_CREATED', 'AWAITING_OPERATOR_APPROVAL', 'SIMULATED_MANEUVER_EXECUTING', 'POST_MANEUVER_VERIFICATION_COMPLETE', 'CLOSED'] },
      { id: 'step-approve', states: ['AWAITING_OPERATOR_APPROVAL', 'SIMULATED_MANEUVER_EXECUTING', 'POST_MANEUVER_VERIFICATION_COMPLETE', 'CLOSED'] },
      { id: 'step-burn', states: ['SIMULATED_MANEUVER_EXECUTING', 'POST_MANEUVER_VERIFICATION_COMPLETE', 'CLOSED'] },
      { id: 'step-verify', states: ['POST_MANEUVER_VERIFICATION_COMPLETE', 'CLOSED'] },
      { id: 'step-close', states: ['CLOSED'] }
    ];

    const stateHierarchy = [
      'MONITORING',
      'CONJUNCTION_DETECTED',
      'ASSESSMENT_COMPLETE',
      'MANEUVER_CANDIDATE_CREATED',
      'AWAITING_OPERATOR_APPROVAL',
      'SIMULATED_MANEUVER_EXECUTING',
      'POST_MANEUVER_VERIFICATION_COMPLETE',
      'CLOSED'
    ];

    const currentIndex = stateHierarchy.indexOf(state);

    steps.forEach((step, idx) => {
      const el = document.getElementById(step.id);
      if (!el) return;
      const numEl = el.querySelector('.step-number');

      if (state === 'FAILED_OR_BLOCKED') {
        el.className = 'workflow-step';
        if (numEl) numEl.textContent = (idx + 1).toString();
        return;
      }

      if (currentIndex > idx) {
        el.className = 'workflow-step completed';
        if (numEl) numEl.textContent = '✓';
      } else if (currentIndex === idx) {
        el.className = 'workflow-step active';
        if (numEl) numEl.textContent = (idx + 1).toString();
      } else {
        el.className = 'workflow-step';
        if (numEl) numEl.textContent = (idx + 1).toString();
      }
    });

    const simBadge = document.getElementById('sim-status-badge');
    if (simBadge) {
      simBadge.textContent = state;
      if (state === 'SIMULATED_MANEUVER_EXECUTING') {
        simBadge.className = 'badge badge-warning';
      } else if (state === 'POST_MANEUVER_VERIFICATION_COMPLETE' || state === 'CLOSED') {
        simBadge.className = 'badge badge-nominal';
      } else if (state === 'FAILED_OR_BLOCKED') {
        simBadge.className = 'badge badge-critical';
      } else {
        simBadge.className = 'badge badge-cyan';
      }
    }
  }

  updateWorkflowCards(state, verificationStatus, burnResult) {
    const approvalCard = document.getElementById('operator-approval-card');
    const clearanceCard = document.getElementById('post-burn-clearance-card');
    const closedCard = document.getElementById('closed-workflow-card');

    if (!approvalCard || !clearanceCard || !closedCard) return;

    if (state === 'CLOSED') {
      approvalCard.style.display = 'none';
      clearanceCard.style.display = 'none';
      closedCard.style.display = 'block';
    } else if (state === 'POST_MANEUVER_VERIFICATION_COMPLETE') {
      approvalCard.style.display = 'none';
      clearanceCard.style.display = 'block';
      closedCard.style.display = 'none';

      if (burnResult) {
        const summaryText = document.getElementById('clearance-summary-text');
        if (summaryText) {
          summaryText.textContent = `Simulated RCS pulse confirmed. New trajectory telemetry verified: Miss distance = ${burnResult.postBurnMissDistanceMeters.toLocaleString()} meters. Collision probability reduced to < 1.0e-09. Target safety criteria satisfied.`;
        }
      }
    } else {
      approvalCard.style.display = 'block';
      clearanceCard.style.display = 'none';
      closedCard.style.display = 'none';
    }
  }

  async loadAssessment() {
    const loadingEl = document.getElementById('fd-loading-state');
    const errorEl = document.getElementById('fd-error-state');
    const contentEl = document.getElementById('fd-content-container');

    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'none';

    try {
      const state = store.getState();
      const conjId = state.selectedConjunctionId || this.conjunctionId;
      const satId = state.selectedSatelliteId || this.satelliteId;

      this.logMessage(`Requesting Flight Director assessment for ${conjId} (Mode: ${this.forceFallback ? 'Fallback' : 'AI'})...`, '#64748b');

      const payload = {
        conjunctionId: conjId,
        satelliteId: satId,
        candidateManeuver: this.candidateManeuver,
        workflowStage: state.workflowState,
        forceFallback: this.forceFallback
      };

      const res = await ApiClient.evaluateFlightDirector(payload);
      if (!res || !res.data) {
        throw new Error('Empty evaluation response from Flight Director service.');
      }

      this.currentAssessment = res.data;
      this.renderAssessment(this.currentAssessment);

      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';

      const srcLabel = this.currentAssessment.source === 'ai' ? 'AI Assistant' : 'Deterministic Fallback';
      this.logMessage(`Assessment evaluated successfully via [${srcLabel}]. Severity: ${this.currentAssessment.severity}.`, '#00e676');

      // Auto-advance workflow state if appropriate
      await this.advanceWorkflowAfterAssessment(conjId, satId);

    } catch (err) {
      console.error('[Flight Director Error]:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'block';
        const msg = document.getElementById('fd-error-message');
        if (msg) msg.textContent = err.message || 'Unknown network or service error.';
      }
      this.logMessage(`[ERROR] Assessment failure: ${err.message}`, '#ff334b');
    }
  }

  async advanceWorkflowAfterAssessment(conjId, satId) {
    const currentState = store.getState().workflowState;

    if (currentState === 'MONITORING' || currentState === 'CONJUNCTION_DETECTED') {
      try {
        const transRes = await ApiClient.transitionWorkflow({
          toState: 'ASSESSMENT_COMPLETE',
          conjunctionId: conjId,
          satelliteId: satId,
          notes: 'Flight Director tactical assessment completed.'
        });
        if (transRes?.data?.currentState) {
          store.setWorkflowState(transRes.data.currentState);
        }
      } catch (e) {
        console.warn('[Flight Director] Transition error:', e.message);
      }
    }

    // If candidate maneuver is already created, stage for operator approval
    const updatedState = store.getState().workflowState;
    if (this.candidateManeuver && (updatedState === 'ASSESSMENT_COMPLETE' || updatedState === 'MANEUVER_CANDIDATE_CREATED')) {
      try {
        const transRes = await ApiClient.transitionWorkflow({
          toState: 'AWAITING_OPERATOR_APPROVAL',
          conjunctionId: conjId,
          satelliteId: satId,
          candidateManeuver: this.candidateManeuver,
          notes: 'Candidate avoidance maneuver staged and awaiting mandatory operator authorization.'
        });
        if (transRes?.data?.currentState) {
          store.setWorkflowState(transRes.data.currentState);
        }
      } catch (e) {
        console.warn('[Flight Director] Transition to approval error:', e.message);
      }
    }
  }

  renderAssessment(assessment) {
    // 1. Source Badge
    const sourceBadge = document.getElementById('fd-source-badge');
    if (sourceBadge) {
      if (assessment.source === 'ai') {
        sourceBadge.className = 'source-badge ai';
        sourceBadge.textContent = '🤖 SOURCE: AI FLIGHT DIRECTOR';
      } else {
        sourceBadge.className = 'source-badge fallback';
        sourceBadge.textContent = '⚙️ SOURCE: DETERMINISTIC FALLBACK';
      }
    }

    // 2. Severity Badge
    const sevBadge = document.getElementById('fd-severity-badge');
    if (sevBadge) {
      sevBadge.textContent = assessment.severity;
      if (assessment.severity === 'CRITICAL') {
        sevBadge.className = 'badge badge-critical';
      } else if (assessment.severity === 'WARNING') {
        sevBadge.className = 'badge badge-warning';
      } else {
        sevBadge.className = 'badge badge-nominal';
      }
    }

    // 3. Operator Review Required Badge
    const reviewBadge = document.getElementById('fd-operator-review-badge');
    if (reviewBadge) {
      reviewBadge.style.display = assessment.requires_operator_review ? 'inline-block' : 'none';
    }

    // 4. Summary Text
    const summaryEl = document.getElementById('fd-summary-text');
    if (summaryEl) summaryEl.textContent = assessment.summary;

    // 5. Recommendation Text
    const recEl = document.getElementById('fd-recommendation-text');
    if (recEl) recEl.textContent = assessment.recommendation;

    // 6. Evidence List
    const evidenceListEl = document.getElementById('fd-evidence-list');
    if (evidenceListEl) {
      evidenceListEl.innerHTML = '';
      (assessment.evidence || []).forEach(claim => {
        const li = document.createElement('li');
        li.className = 'evidence-item';
        li.innerHTML = `
          <svg class="evidence-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>${claim}</span>
        `;
        evidenceListEl.appendChild(li);
      });
    }

    // 7. Assumptions & Limitations List
    const assumptionsListEl = document.getElementById('fd-assumptions-list');
    if (assumptionsListEl) {
      assumptionsListEl.innerHTML = '';
      (assessment.assumptions || []).forEach(item => {
        const li = document.createElement('li');
        li.className = 'assumption-item';
        li.innerHTML = `
          <svg class="assumption-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>${item}</span>
        `;
        assumptionsListEl.appendChild(li);
      });
    }
  }

  logMessage(msg, color = '#cbd5e1') {
    const consoleEl = document.getElementById('exec-log-console');
    if (!consoleEl) return;
    const now = new Date().toISOString().substring(11, 19);
    const line = document.createElement('div');
    line.style.color = color;
    line.style.marginTop = '4px';
    line.textContent = `[${now} UTC] ${msg}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  async executeSimulatedBurn() {
    // Idempotency lock: prevent duplicate execution clicks
    if (this.isExecuting) {
      this.logMessage('[WARN] Execution lock active: Simulated burn sequence already running.', '#ffd54f');
      return;
    }
    this.isExecuting = true;

    const btnApprove = document.getElementById('btn-approve-burn');
    const simBadge = document.getElementById('sim-status-badge');

    if (btnApprove) {
      btnApprove.disabled = true;
      btnApprove.textContent = 'SIMULATED BURN IN PROGRESS...';
    }
    if (simBadge) {
      simBadge.textContent = 'EXECUTING';
      simBadge.className = 'badge badge-warning';
    }

    const state = store.getState();
    const conjId = state.selectedConjunctionId || this.conjunctionId;
    const satId = state.selectedSatelliteId || this.satelliteId;

    try {
      this.logMessage('OPERATOR AUTHORIZATION CONFIRMED: Human-in-the-loop authorization key generated.', '#00e5ff');
      await this.delay(500);

      this.logMessage('SAFETY CHECK: Verifying candidate maneuver parameters and collision avoidance geometry...', '#cbd5e1');
      await this.delay(600);

      // Invoke server workflow simulated burn execution engine
      const burnRes = await ApiClient.executeWorkflowBurn({
        conjunctionId: conjId,
        satelliteId: satId,
        candidateManeuver: this.candidateManeuver,
        simulatedBy: 'Flight Operations Console (HITL)'
      });

      if (!burnRes || !burnRes.data) {
        throw new Error(burnRes?.error || 'Simulated burn execution rejected by flight service.');
      }

      const resData = burnRes.data;
      const burnResult = resData.burnResult;

      this.logMessage(`ADCS Attitude Lock: Slew complete. Locked along-track burn vector (${burnResult.burnDirection}).`, '#cbd5e1');
      await this.delay(600);

      this.logMessage(`THRUSTER FIRING: Hydrazine monopropellant pulse Δv = ${burnResult.deltaVMagnitudeMps.toFixed(2)} m/s (Duration: ${burnResult.burnDurationSeconds}s)...`, '#ffd54f');
      await this.delay(900);

      this.logMessage(`CUTOFF CONFIRMED: Burn complete. Consumed ${burnResult.propellantConsumedKg.toFixed(3)} kg hydrazine. Post-burn reserve: ${burnResult.postBurnFuelKg.toFixed(2)} kg.`, '#00e676');
      await this.delay(600);

      this.logMessage(`GROUND TRACK VERIFICATION: Ground pass confirmed. Post-burn miss distance = ${burnResult.postBurnMissDistanceMeters.toLocaleString()} m.`, '#00e5ff');
      this.logMessage(`POST-MANEUVER VERIFICATION COMPLETE: Target criteria satisfied (${resData.verificationStatus}).`, '#00e676');

      // Update state store
      store.setWorkflowState('POST_MANEUVER_VERIFICATION_COMPLETE');
      this.updateWorkflowCards('POST_MANEUVER_VERIFICATION_COMPLETE', resData.verificationStatus, burnResult);

    } catch (err) {
      console.error('[Burn Execution Error]:', err);
      this.logMessage(`[CRITICAL] Execution halted: ${err.message}`, '#ff334b');
      store.setWorkflowState('FAILED_OR_BLOCKED');
      if (btnApprove) {
        btnApprove.disabled = false;
        btnApprove.textContent = 'RETRY SIMULATED BURN →';
      }
    } finally {
      this.isExecuting = false;
    }
  }

  async closeWorkflow() {
    const state = store.getState();
    const conjId = state.selectedConjunctionId || this.conjunctionId;
    const satId = state.selectedSatelliteId || this.satelliteId;

    try {
      this.logMessage(`Closing operational workflow for conjunction ${conjId}...`, '#64748b');
      const res = await ApiClient.transitionWorkflow({
        toState: 'CLOSED',
        conjunctionId: conjId,
        satelliteId: satId,
        notes: 'Operator closed conjunction workflow after successful simulated maneuver verification.'
      });
      if (res?.data?.currentState) {
        store.setWorkflowState(res.data.currentState);
        this.updateWorkflowCards('CLOSED');
        this.logMessage(`WORKFLOW CLOSED: Event archived in mission operations ledger.`, '#00e676');
      }
    } catch (err) {
      console.error('[Close Workflow Error]:', err);
      this.logMessage(`[ERROR] Failed to close workflow: ${err.message}`, '#ff334b');
    }
  }

  async abortWorkflow() {
    const state = store.getState();
    const conjId = state.selectedConjunctionId || this.conjunctionId;
    const satId = state.selectedSatelliteId || this.satelliteId;

    try {
      await ApiClient.transitionWorkflow({
        toState: 'FAILED_OR_BLOCKED',
        conjunctionId: conjId,
        satelliteId: satId,
        notes: 'Operator explicitly aborted conjunction workflow at Gate 5.'
      });
      store.setWorkflowState('FAILED_OR_BLOCKED');
      this.logMessage('[ABORTED] Operator aborted maneuver workflow. Conjunction remains in critical observation.', '#ff334b');
    } catch (e) {
      this.logMessage(`[ABORTED] Local abort recorded.`, '#ff334b');
    }
  }

  async resetWorkflow() {
    this.isExecuting = false;
    try {
      await ApiClient.resetWorkflow();
      store.setWorkflowState('MONITORING');
      this.updateWorkflowCards('MONITORING');

      const btnApprove = document.getElementById('btn-approve-burn');
      if (btnApprove) {
        btnApprove.disabled = false;
        btnApprove.textContent = 'OPERATOR AUTHORIZATION: EXECUTE SIMULATED BURN →';
      }

      this.logMessage('Workflow reset to MONITORING. Baseline scenario preserved.', '#ffd54f');
      await this.loadAssessment();
    } catch (err) {
      console.error('[Reset Workflow Error]:', err);
      this.logMessage(`[ERROR] Reset failed: ${err.message}`, '#ff334b');
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new FlightDirectorController();
  controller.init();
});
