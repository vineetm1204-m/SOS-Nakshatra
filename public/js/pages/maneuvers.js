/**
 * SOS Maneuver Planner Controller (maneuvers.js)
 * Implements interactive Tsiolkovsky propellant calculation and avoidance trajectory projection.
 */
import { ApiClient } from '../api.js';
import { store } from '../state.js';

class ManeuverPlannerController {
  constructor() {
    this.selectedSatellite = null;
    this.selectedConjunction = null;
    this.burnDirection = 'ALONG_TRACK_POS';
    this.deltaVMps = 0.85;
    this.g0 = 9.80665; // Standard gravity m/s^2
  }

  async init() {
    this.initEventListeners();
    await this.loadContext();
    this.recalculate();
  }

  initEventListeners() {
    const dirBtns = document.querySelectorAll('.burn-dir-btn');
    dirBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        dirBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.burnDirection = btn.dataset.dir;
        this.recalculate();
      });
    });

    const slider = document.getElementById('delta-v-slider');
    const display = document.getElementById('slider-val-display');
    if (slider && display) {
      slider.addEventListener('input', (e) => {
        this.deltaVMps = parseFloat(e.target.value);
        display.textContent = `${this.deltaVMps.toFixed(2)} m/s`;
        this.recalculate();
      });
    }

    const btnSubmit = document.getElementById('btn-submit-to-flight-director');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => {
        // Save planned parameters in local session and redirect
        sessionStorage.setItem('sos_planned_deltav', this.deltaVMps.toString());
        sessionStorage.setItem('sos_planned_direction', this.burnDirection);
        window.location.href = 'autopilot.html';
      });
    }
  }

  async loadContext() {
    try {
      const state = store.getState();
      const [satRes, conjRes] = await Promise.all([
        ApiClient.getSatelliteById(state.selectedSatelliteId || 'SAT-LEO-02').catch(() => null),
        ApiClient.getConjunctionById(state.selectedConjunctionId || 'CONJ-2026-084').catch(() => null)
      ]);

      this.selectedSatellite = satRes?.data;
      this.selectedConjunction = conjRes?.data;

      const planConjCode = document.getElementById('plan-conj-code');
      const planSatName = document.getElementById('plan-sat-name');

      if (planConjCode && this.selectedConjunction) {
        planConjCode.textContent = `${this.selectedConjunction.code} (${this.selectedConjunction.id})`;
      }
      if (planSatName && this.selectedSatellite) {
        planSatName.textContent = `${this.selectedSatellite.name} (${this.selectedSatellite.id})`;
      }
    } catch (err) {
      console.error('[SOS Maneuver Planner Error]:', err);
    }
  }

  recalculate() {
    const sat = this.selectedSatellite || {
      massKg: 1250,
      dryMassKg: 1050,
      remainingFuelKg: 128.5,
      fuelCapacityKg: 200,
      ispSeconds: 220
    };

    const conj = this.selectedConjunction || {
      missDistanceKm: { total: 0.184 },
      collisionProbability: 0.00482
    };

    // Tsiolkovsky equation: Δm = m0 * (1 - e^(-ΔV / (Isp * g0)))
    const m0 = sat.massKg;
    const c = sat.ispSeconds * this.g0;
    const deltaM = m0 * (1 - Math.exp(-this.deltaVMps / c));
    const postBurnFuel = Math.max(0, sat.remainingFuelKg - deltaM);
    const postBurnMass = m0 - deltaM;
    const burnDuration = (deltaM / (0.14)).toFixed(1); // Approx thrust mass flow rate

    // Projected miss distance: baseline 184m + (~2600m per 1 m/s along-track over 4 hours)
    const factor = this.burnDirection.includes('ALONG_TRACK') ? 2650 : 1800;
    const projectedMissMeters = Math.round((conj.missDistanceKm.total * 1000) + (this.deltaVMps * factor));
    const projectedPc = Math.max(1e-8, conj.collisionProbability * Math.exp(-this.deltaVMps * 4.5));

    // Update UI
    const elMiss = document.getElementById('proj-miss-dist');
    const elPc = document.getElementById('proj-pc');
    const elFuelCost = document.getElementById('proj-fuel-cost');
    const elFuelText = document.getElementById('post-burn-fuel-text');
    const elFuelBar = document.getElementById('post-burn-fuel-bar');
    const elIsp = document.getElementById('plan-isp');
    const elMass = document.getElementById('plan-mass');
    const elPostMass = document.getElementById('plan-post-mass');
    const elDuration = document.getElementById('plan-burn-duration');

    if (elMiss) elMiss.textContent = `${projectedMissMeters.toLocaleString()} m`;
    if (elPc) elPc.textContent = projectedPc < 1e-4 ? '< 1.0e-07' : projectedPc.toExponential(2);
    if (elFuelCost) elFuelCost.textContent = `${deltaM.toFixed(2)} kg`;

    const fuelPct = Math.round((postBurnFuel / sat.fuelCapacityKg) * 100);
    if (elFuelText) elFuelText.textContent = `${postBurnFuel.toFixed(2)} / ${sat.fuelCapacityKg.toFixed(1)} kg (${fuelPct}%)`;
    if (elFuelBar) elFuelBar.style.width = `${fuelPct}%`;

    if (elIsp) elIsp.textContent = `${sat.ispSeconds.toFixed(1)} s`;
    if (elMass) elMass.textContent = `${m0.toFixed(1)} kg`;
    if (elPostMass) elPostMass.textContent = `${postBurnMass.toFixed(2)} kg`;
    if (elDuration) elDuration.textContent = `${burnDuration} seconds`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new ManeuverPlannerController();
  controller.init();
});
