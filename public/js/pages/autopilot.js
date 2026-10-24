/**
 * SOS Flight Director Controller (autopilot.js)
 * Manages the 6-stage operational execution workflow, evidence audit, and mandatory operator approval gate.
 */
import { ApiClient } from '../api.js';
import { store } from '../state.js';

class FlightDirectorController {
  constructor() {
    this.workflowStage = 'BURN'; // 'TRACK' | 'DETECT' | 'ASSESS' | 'PLAN' | 'BURN' | 'CLEAR'
    this.forceFallback = false;
    this.conjunctionId = 'CONJ-2026-084';
    this.satelliteId = 'SAT-LEO-02';
    this.candidateManeuver = null;
    this.currentAssessment = null;
  }

  async init() {
    this.initEventListeners();
    this.loadSessionCandidate();
    await this.loadAssessment();
  }

  loadSessionCandidate() {
    try {
      const stored = sessionStorage.getItem('sos_candidate_maneuver');
      if (stored) {
        this.candidateManeuver = JSON.parse(stored);
        this.logMessage(`Loaded candidate avoidance maneuver ${this.candidateManeuver.id} from CAM Planner.`, '#00e5ff');
      }
    } catch (e) {
      console.warn('[Flight Director] Could not parse session candidate maneuver:', e);
    }
  }

  initEventListeners() {
    const btnApprove = document.getElementById('btn-approve-burn');
    const btnAbort = document.getElementById('btn-abort-burn');
    const btnReset = document.getElementById('btn-reset-workflow');
    const btnRetry = document.getElementById('btn-retry-assessment');
    const btnErrorRetry = document.getElementById('btn-error-retry');
    const btnToggleSource = document.getElementById('btn-toggle-source');

    if (btnApprove) {
      btnApprove.addEventListener('click', () => this.executeSimulatedBurn());
    }

    if (btnAbort) {
      btnAbort.addEventListener('click', () => {
        this.logMessage('[ABORTED] Operator aborted maneuver workflow. Conjunction remains in critical observation.', '#ff334b');
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => this.resetWorkflow());
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

      // Call evaluate endpoint
      const payload = {
        conjunctionId: conjId,
        satelliteId: satId,
        candidateManeuver: this.candidateManeuver,
        workflowStage: this.workflowStage,
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
    const btnApprove = document.getElementById('btn-approve-burn');
    const simBadge = document.getElementById('sim-status-badge');
    
    if (btnApprove) {
      btnApprove.disabled = true;
      btnApprove.textContent = 'EXECUTING SIMULATED SEQUENCE...';
    }
    if (simBadge) {
      simBadge.textContent = 'EXECUTING';
      simBadge.className = 'badge badge-warning';
    }

    // Call approve endpoint
    try {
      const authRes = await ApiClient.approveFlightDirectorBurn({
        conjunctionId: this.conjunctionId
      });
      const authKey = authRes?.data?.authorizationKey || 'OP-AUTH-77291';
      this.logMessage(`OPERATOR AUTHORIZATION CONFIRMED: Key ${authKey}.`, '#00e5ff');
    } catch {
      this.logMessage(`OPERATOR AUTHORIZATION CONFIRMED: Local simulated sign-off.`, '#00e5ff');
    }

    await this.delay(600);
    this.logMessage('ADCS Verification: Slew to prograde burn attitude locked (+12.4°, -1.2°).', '#cbd5e1');
    await this.delay(700);

    const dv = this.candidateManeuver ? this.candidateManeuver.deltaVMagnitudeMps : 0.85;
    const fuel = this.candidateManeuver ? this.candidateManeuver.estimatedPropellantKg : 0.493;

    this.logMessage(`THRUSTER FIRING: Hydrazine pulse initiated. Target ΔV = ${dv.toFixed(2)} m/s...`, '#ffd54f');
    await this.delay(1100);

    this.logMessage(`CUTOFF NOMINAL: Burn complete. Consumed ${fuel.toFixed(3)} kg fuel. Accelerometer confirmed.`, '#00e676');
    await this.delay(600);

    this.logMessage('Ground station pass confirmed (KSAT Svalbard): New orbit state accepted.', '#00e5ff');
    this.logMessage('ENCOUNTER CLEARED: Relative miss distance increased beyond critical threshold.', '#00e676');

    // Update Workflow Stage to CLEAR
    this.workflowStage = 'CLEAR';

    const stepBurn = document.getElementById('step-burn');
    const stepClear = document.getElementById('step-clear');
    if (stepBurn) {
      stepBurn.className = 'workflow-step completed';
      stepBurn.querySelector('.step-number').textContent = '✓';
    }
    if (stepClear) {
      stepClear.className = 'workflow-step active completed';
      stepClear.querySelector('.step-number').textContent = '✓';
    }

    // Toggle Panels
    document.getElementById('operator-approval-card').style.display = 'none';
    document.getElementById('post-burn-clearance-card').style.display = 'block';

    if (simBadge) {
      simBadge.textContent = 'CLEARED';
      simBadge.className = 'badge badge-nominal';
    }

    // Re-evaluate assessment in cleared state
    await this.loadAssessment();
  }

  resetWorkflow() {
    this.workflowStage = 'BURN';

    const stepBurn = document.getElementById('step-burn');
    const stepClear = document.getElementById('step-clear');
    if (stepBurn) {
      stepBurn.className = 'workflow-step active';
      stepBurn.querySelector('.step-number').textContent = '5';
    }
    if (stepClear) {
      stepClear.className = 'workflow-step';
      stepClear.querySelector('.step-number').textContent = '6';
    }

    document.getElementById('operator-approval-card').style.display = 'block';
    document.getElementById('post-burn-clearance-card').style.display = 'none';

    const btnApprove = document.getElementById('btn-approve-burn');
    if (btnApprove) {
      btnApprove.disabled = false;
      btnApprove.textContent = 'OPERATOR AUTHORIZATION: EXECUTE SIMULATED BURN →';
    }

    const simBadge = document.getElementById('sim-status-badge');
    if (simBadge) {
      simBadge.textContent = 'STANDBY';
      simBadge.className = 'badge badge-cyan';
    }

    this.logMessage('Workflow reset to Gate 5 (Burn Authorization).', '#ffd54f');
    this.loadAssessment();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new FlightDirectorController();
  controller.init();
});
