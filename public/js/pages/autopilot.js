/**
 * SOS Flight Director Controller (autopilot.js)
 * Manages the 6-stage operational execution workflow and operator approval gate.
 */
import { ApiClient } from '../api.js';
import { store } from '../state.js';

class FlightDirectorController {
  constructor() {
    this.stage = 'BURN'; // 'BURN' | 'CLEAR'
    this.assessment = null;
  }

  async init() {
    this.initEventListeners();
    await this.loadAssessment();
  }

  async loadAssessment() {
    try {
      const state = store.getState();
      const conjId = state.selectedConjunctionId || 'CONJ-2026-084';
      const res = await ApiClient.getFlightDirectorAssessment(conjId);
      if (res?.data) {
        this.assessment = res.data;
        const textEl = document.getElementById('fd-assessment-text');
        if (textEl) {
          textEl.textContent = this.assessment.summary;
        }
      }
    } catch (err) {
      console.warn('[Flight Director] Using default assessment:', err.message);
    }
  }

  initEventListeners() {
    const btnApprove = document.getElementById('btn-approve-burn');
    const btnAbort = document.getElementById('btn-abort-burn');
    const btnReset = document.getElementById('btn-reset-workflow');

    if (btnApprove) {
      btnApprove.addEventListener('click', () => this.executeSimulatedBurn());
    }

    if (btnAbort) {
      btnAbort.addEventListener('click', () => {
        this.logMessage('[ABORTED] Operator aborted maneuver plan. Conjunction remains in WARNING state.', '#ff334b');
        alert('Maneuver plan aborted by operator. Alert remains under observation.');
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => this.resetWorkflow());
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
      btnApprove.textContent = 'EXECUTING SIMULATED BURN SEQUENCE...';
    }
    if (simBadge) {
      simBadge.textContent = 'EXECUTING';
      simBadge.className = 'badge badge-warning';
    }

    this.logMessage('OPERATOR SIGN-OFF CONFIRMED. Authorization key: OP-AUTH-88219.', '#00e5ff');
    await this.delay(700);

    this.logMessage('Attitude Control: Slew to +In-Track burn attitude (+12.4°, -1.2°). ADCS locked.', '#cbd5e1');
    await this.delay(800);

    this.logMessage('Propulsion: Thruster manifold pressurization verified (22.8 bar).', '#cbd5e1');
    await this.delay(800);

    this.logMessage('IGNITION: Pulse initiated. Delivering ΔV = 0.85 m/s over 3.4 seconds...', '#ffd54f');
    await this.delay(1200);

    this.logMessage('CUTOFF: Thruster cutoff nominal. Consumed 0.49 kg Hydrazine. Remaining: 128.01 kg.', '#00e676');
    await this.delay(800);

    this.logMessage('Svalbard KSAT telemetry lock confirmed: Accelerometer delta verified.', '#00e5ff');
    await this.delay(700);

    this.logMessage('POST-MANEUVER ORBIT DETERMINATION: Miss distance increased to 2,450 meters.', '#00e676');
    this.logMessage('CLEARANCE: Conjunction S-2026-084 promoted to CLEARED. Risk reduced by 99.98%.', '#00e676');

    // Update UI Workflow Stepper
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

    const fdBadge = document.getElementById('fd-threat-badge');
    if (fdBadge) {
      fdBadge.textContent = 'CONJUNCTION CLEARED';
      fdBadge.className = 'badge badge-nominal';
    }

    if (simBadge) {
      simBadge.textContent = 'CLEARED';
      simBadge.className = 'badge badge-nominal';
    }
  }

  resetWorkflow() {
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

    const fdBadge = document.getElementById('fd-threat-badge');
    if (fdBadge) {
      fdBadge.textContent = 'INTERVENTION REQUIRED';
      fdBadge.className = 'badge badge-critical';
    }

    const simBadge = document.getElementById('sim-status-badge');
    if (simBadge) {
      simBadge.textContent = 'STANDBY';
      simBadge.className = 'badge badge-cyan';
    }

    this.logMessage('Workflow reset to Gate 5 (Burn Authorization).', '#ffd54f');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new FlightDirectorController();
  controller.init();
});
