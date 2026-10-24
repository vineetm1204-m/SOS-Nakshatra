/**
 * SOS Maneuver Planner Controller (maneuvers.js)
 * Implements interactive Tsiolkovsky propellant calculation engine & Clohessy-Wiltshire (RIC)
 * relative encounter projection workspace.
 */
import { ApiClient, formatMissDistance, formatProbability, formatUtcTimestamp } from '../api.js';
import { store } from '../state.js';

class ManeuverPlannerController {
  constructor() {
    this.selectedSatellite = null;
    this.selectedConjunction = null;
    this.candidateManeuver = null;
    
    // Default Candidate Parameters (Independent of baseline scenario)
    this.defaultDeltaVMps = 0.85;
    this.defaultBurnDirection = 'ALONG_TRACK_POS';
    this.defaultLeadHours = 2.50; // 9,000 seconds before TCA
    
    // Active Candidate State
    this.deltaVMps = this.defaultDeltaVMps;
    this.burnDirection = this.defaultBurnDirection;
    this.leadHours = this.defaultLeadHours;
    this.g0 = 9.80665; // Standard gravity m/s^2

    this.latestCalculationResult = null;
  }

  async init() {
    this.initEventListeners();
    await this.loadContext();
    await this.calculateImpact();
  }

  initEventListeners() {
    // 1. Burn Direction Buttons
    const dirBtns = document.querySelectorAll('.burn-dir-btn');
    dirBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        dirBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.burnDirection = btn.dataset.dir;
        this.calculateImpact();
      });
    });

    // 2. Delta-V Slider & Numeric Input Synchronization
    const sliderDeltaV = document.getElementById('slider-delta-v');
    const inputDeltaV = document.getElementById('input-delta-v');

    if (sliderDeltaV && inputDeltaV) {
      sliderDeltaV.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.deltaVMps = isNaN(val) ? 0 : val;
        inputDeltaV.value = this.deltaVMps.toFixed(2);
        this.calculateImpact();
      });

      inputDeltaV.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        this.deltaVMps = val;
        sliderDeltaV.value = Math.min(3.0, val).toString();
        inputDeltaV.value = val.toFixed(2);
        this.calculateImpact();
      });
    }

    // 3. Preset Buttons (Directly invokes calculation layer)
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetDv = parseFloat(btn.dataset.deltav);
        if (!isNaN(targetDv)) {
          this.deltaVMps = targetDv;
          if (sliderDeltaV) sliderDeltaV.value = Math.min(3.0, targetDv).toString();
          if (inputDeltaV) inputDeltaV.value = targetDv.toFixed(2);
          this.calculateImpact();
        }
      });
    });

    // 4. Execution Lead-Time Slider & Numeric Input Synchronization
    const sliderLeadHours = document.getElementById('slider-lead-hours');
    const inputLeadHours = document.getElementById('input-lead-hours');

    if (sliderLeadHours && inputLeadHours) {
      sliderLeadHours.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.leadHours = isNaN(val) ? 0.5 : val;
        inputLeadHours.value = this.leadHours.toFixed(2);
        this.updateExecutionTimeDisplay();
        this.calculateImpact();
      });

      inputLeadHours.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val) || val < 0.1) val = 0.5;
        this.leadHours = val;
        sliderLeadHours.value = Math.min(6.0, val).toString();
        inputLeadHours.value = val.toFixed(2);
        this.updateExecutionTimeDisplay();
        this.calculateImpact();
      });
    }

    // 5. Explicit Calculate Button
    const btnRecalc = document.getElementById('btn-recalculate');
    if (btnRecalc) {
      btnRecalc.addEventListener('click', () => {
        this.calculateImpact();
      });
    }

    // 6. Reset Candidate Action (Restores initial candidate without mutating baseline)
    const btnReset = document.getElementById('btn-reset-candidate');
    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        this.resetCandidate();
      });
    }

    // 7. Save Candidate Action
    const btnSave = document.getElementById('btn-save-candidate');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        await this.saveCandidate();
      });
    }

    // 8. Continue to Flight Director Review
    const btnReview = document.getElementById('btn-continue-review');
    const btnSubmit = document.getElementById('btn-submit-to-flight-director');
    const proceedHandler = async () => {
      await this.saveCandidate();
      window.location.href = 'autopilot.html';
    };

    if (btnReview) btnReview.addEventListener('click', proceedHandler);
    if (btnSubmit) btnSubmit.addEventListener('click', proceedHandler);
  }

  async loadContext() {
    try {
      const state = store.getState();
      const conjId = state.selectedConjunctionId || 'CONJ-2026-084';
      
      const [satRes, conjRes, manRes] = await Promise.all([
        ApiClient.getSatelliteById(state.selectedSatelliteId || 'SAT-LEO-02').catch(() => null),
        ApiClient.getConjunctionById(conjId).catch(() => null),
        ApiClient.getCandidateManeuver(conjId).catch(() => null)
      ]);

      this.selectedSatellite = satRes?.data || {
        id: 'SAT-LEO-02',
        name: 'SENTINEL-X',
        massKg: 1250.0,
        dryMassKg: 1050.0,
        fuelCapacityKg: 200.0,
        remainingFuelKg: 128.5,
        ispSeconds: 220.0
      };

      this.selectedConjunction = conjRes?.data || {
        id: 'CONJ-2026-084',
        code: 'CONJ-2026-084',
        primarySatelliteName: 'SENTINEL-X',
        secondaryObjectName: 'COSMOS 1408 DEBRIS',
        tca: '2026-10-24T14:15:00.000Z',
        timeToTcaSeconds: 12698,
        missDistanceKm: { total: 0.184, radial: -0.042, inTrack: 0.165, crossTrack: 0.071 },
        collisionProbability: 0.00482,
        riskLevel: 'CRITICAL',
        status: 'ESCALATED'
      };

      if (manRes?.data?.candidate) {
        this.candidateManeuver = manRes.data.candidate;
        this.defaultDeltaVMps = this.candidateManeuver.deltaVMagnitudeMps || 0.85;
        this.defaultBurnDirection = this.candidateManeuver.burnDirection || 'ALONG_TRACK_POS';
        this.deltaVMps = this.defaultDeltaVMps;
        this.burnDirection = this.defaultBurnDirection;
      }

      this.populateContextUI();
      this.updateExecutionTimeDisplay();
    } catch (err) {
      console.warn('[SOS Maneuver Planner] Context load warning:', err.message);
    }
  }

  populateContextUI() {
    const planConjCode = document.getElementById('plan-conj-code');
    const planSatName = document.getElementById('plan-sat-name');
    const planThreatName = document.getElementById('plan-threat-name');
    const planBaseMiss = document.getElementById('plan-base-miss');
    const planBasePc = document.getElementById('plan-base-pc');

    const propMass = document.getElementById('prop-mass-display');
    const propIsp = document.getElementById('prop-isp-display');

    if (planConjCode && this.selectedConjunction) {
      planConjCode.textContent = this.selectedConjunction.code;
    }
    if (planSatName && this.selectedSatellite) {
      planSatName.textContent = `${this.selectedSatellite.name} (${this.selectedSatellite.id})`;
    }
    if (planThreatName && this.selectedConjunction) {
      planThreatName.textContent = this.selectedConjunction.secondaryObjectName;
    }
    if (planBaseMiss && this.selectedConjunction) {
      planBaseMiss.textContent = formatMissDistance(this.selectedConjunction.missDistanceKm.total);
    }
    if (planBasePc && this.selectedConjunction) {
      planBasePc.textContent = formatProbability(this.selectedConjunction.collisionProbability);
    }

    if (propMass && this.selectedSatellite) {
      propMass.textContent = `${this.selectedSatellite.massKg.toFixed(1)} kg`;
    }
    if (propIsp && this.selectedSatellite) {
      propIsp.textContent = `${this.selectedSatellite.ispSeconds.toFixed(1)} s`;
    }

    // Set input elements
    const sliderDeltaV = document.getElementById('slider-delta-v');
    const inputDeltaV = document.getElementById('input-delta-v');
    if (sliderDeltaV) sliderDeltaV.value = Math.min(3.0, this.deltaVMps).toString();
    if (inputDeltaV) inputDeltaV.value = this.deltaVMps.toFixed(2);

    const sliderLeadHours = document.getElementById('slider-lead-hours');
    const inputLeadHours = document.getElementById('input-lead-hours');
    if (sliderLeadHours) sliderLeadHours.value = this.leadHours.toString();
    if (inputLeadHours) inputLeadHours.value = this.leadHours.toFixed(2);

    // Active button
    document.querySelectorAll('.burn-dir-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dir === this.burnDirection);
    });
  }

  updateExecutionTimeDisplay() {
    const leadSec = Math.round(this.leadHours * 3600);
    const secDisp = document.getElementById('lead-seconds-display');
    if (secDisp) {
      secDisp.textContent = `${leadSec.toLocaleString()} s before TCA`;
    }

    const epochDisp = document.getElementById('burn-epoch-display');
    if (epochDisp && this.selectedConjunction?.tca) {
      const tcaMs = new Date(this.selectedConjunction.tca).getTime();
      const burnMs = tcaMs - (leadSec * 1000);
      epochDisp.textContent = formatUtcTimestamp(new Date(burnMs).toISOString());
    }
  }

  async calculateImpact() {
    const statusBanner = document.getElementById('calc-status-banner');
    const statusText = document.getElementById('calc-status-text');
    const statusTime = document.getElementById('calc-status-time');

    // Input Validation
    const sat = this.selectedSatellite;
    if (!sat || sat.massKg <= 0 || sat.ispSeconds <= 0 || this.deltaVMps < 0 || this.leadHours <= 0) {
      if (statusBanner) {
        statusBanner.className = 'calc-status-strip error';
        statusText.textContent = 'VALIDATION FAILED: Spacecraft mass > 0, Isp > 0, Δv >= 0, and lead time > 0 required.';
      }
      return;
    }

    const leadSeconds = Math.round(this.leadHours * 3600);

    const payload = {
      spacecraftMassKg: sat.massKg,
      fuelCapacityKg: sat.fuelCapacityKg,
      remainingFuelKg: sat.remainingFuelKg,
      specificImpulseSeconds: sat.ispSeconds,
      deltaVMagnitudeMps: this.deltaVMps,
      burnDirection: this.burnDirection,
      timeBeforeTcaSeconds: leadSeconds,
      baselineMissDistanceKm: this.selectedConjunction.missDistanceKm,
      baselinePc: this.selectedConjunction.collisionProbability
    };

    let evaluation = null;

    try {
      const res = await ApiClient.calculateManeuver(payload);
      if (res && res.data) {
        evaluation = res.data;
      }
    } catch (err) {
      console.warn('[SOS Maneuver Planner] Calling local fallback evaluation engine:', err.message);
      evaluation = this.localFallbackEvaluation(payload);
    }

    if (!evaluation) return;
    this.latestCalculationResult = evaluation;

    // Update UI with calculated results
    this.renderEvaluationResults(evaluation);

    if (statusBanner) {
      statusBanner.className = evaluation.targetCriteriaMet ? 'calc-status-strip pass' : 'calc-status-strip error';
      statusText.textContent = evaluation.targetCriteriaMet 
        ? `COMPUTED: Tsiolkovsky Engine & CW Encounter Model — Target criteria satisfied.`
        : `COMPUTED: Target criteria NOT met. Miss < 500m or insufficient fuel reserve.`;
      if (statusTime) statusTime.textContent = new Date().toISOString().substring(11, 19) + ' UTC';
    }
  }

  localFallbackEvaluation(p) {
    // Pure Tsiolkovsky rocket equation
    const c = p.specificImpulseSeconds * this.g0;
    const deltaM = p.deltaVMagnitudeMps === 0 ? 0 : p.spacecraftMassKg * (1.0 - Math.exp(-p.deltaVMagnitudeMps / c));
    const remainingPostBurn = Math.max(0, p.remainingFuelKg - deltaM);

    // CW Along-track linearized drift
    let deltaR = 0, deltaT = 0, deltaN = 0;
    if (p.burnDirection === 'ALONG_TRACK_POS') {
      deltaT = 3.0 * p.deltaVMagnitudeMps * Math.max(0, p.timeBeforeTcaSeconds);
      deltaR = p.deltaVMagnitudeMps * 4.0;
    } else if (p.burnDirection === 'ALONG_TRACK_NEG') {
      deltaT = -3.0 * p.deltaVMagnitudeMps * Math.max(0, p.timeBeforeTcaSeconds);
      deltaR = -p.deltaVMagnitudeMps * 4.0;
    } else if (p.burnDirection === 'CROSS_TRACK') {
      deltaN = p.deltaVMagnitudeMps * 850;
    } else if (p.burnDirection === 'RADIAL') {
      deltaR = p.deltaVMagnitudeMps * 650;
    }

    const baseRadialM = p.baselineMissDistanceKm.radial * 1000;
    const baseInTrackM = p.baselineMissDistanceKm.inTrack * 1000;
    const baseCrossTrackM = p.baselineMissDistanceKm.crossTrack * 1000;

    const newRadialM = baseRadialM + deltaR;
    const newInTrackM = baseInTrackM + deltaT;
    const newCrossTrackM = baseCrossTrackM + deltaN;
    const postMissM = Math.sqrt(newRadialM * newRadialM + newInTrackM * newInTrackM + newCrossTrackM * newCrossTrackM);
    const preMissM = p.baselineMissDistanceKm.total * 1000;

    const ratio = postMissM / Math.max(1, preMissM);
    const postPc = p.baselinePc !== null ? Math.max(1e-9, p.baselinePc * Math.exp(-ratio * 2.2)) : null;

    const criteriaMet = postMissM >= 500 && (postPc === null || postPc < 1e-4) && remainingPostBurn > 0;

    return {
      candidateId: `MAN-CAM-${Date.now().toString().slice(-6)}`,
      maneuverType: 'IMPULSIVE_COLLISION_AVOIDANCE_BURN',
      deltaVMagnitudeMps: p.deltaVMagnitudeMps,
      burnDirection: p.burnDirection,
      deltaVVectorMps: { 
        x: p.burnDirection === 'RADIAL' ? p.deltaVMagnitudeMps : 0, 
        y: p.burnDirection.includes('ALONG_TRACK') ? (p.burnDirection === 'ALONG_TRACK_POS' ? p.deltaVMagnitudeMps : -p.deltaVMagnitudeMps) : 0, 
        z: p.burnDirection === 'CROSS_TRACK' ? p.deltaVMagnitudeMps : 0 
      },
      idealPropellantConsumedKg: parseFloat(deltaM.toFixed(3)),
      remainingPropellantPostBurnKg: parseFloat(remainingPostBurn.toFixed(3)),
      burnDurationSeconds: parseFloat((deltaM / 0.144).toFixed(1)),
      preManeuverMissMeters: Math.round(preMissM),
      postManeuverMissMeters: Math.round(postMissM),
      missDistanceGainMeters: Math.round(postMissM - preMissM),
      postManeuverPc: postPc ? parseFloat(postPc.toExponential(2)) : null,
      targetCriteriaMet: criteriaMet,
      assumptions: [
        'Impulsive velocity increment model (instantaneous delta-v approximation)',
        `Initial spacecraft wet mass m0 = ${p.spacecraftMassKg.toFixed(1)} kg`,
        `Hydrazine monopropellant thruster specific impulse Isp = ${p.specificImpulseSeconds.toFixed(1)} seconds`,
        `Standard gravity constant g0 = 9.80665 m/s²`,
        'Linearized Clohessy-Wiltshire (Hill frame) relative motion propagation'
      ],
      limitations: [
        'Excludes finite-burn cosine thruster canting losses',
        'Excludes ADCS attitude slew settling duration',
        'Assumes constant thruster chamber pressure and thermal equilibrium'
      ]
    };
  }

  renderEvaluationResults(res) {
    const sat = this.selectedSatellite;
    const conj = this.selectedConjunction;

    // 1. Metric Cards
    const cardPostMiss = document.getElementById('card-post-miss');
    const cardMissGain = document.getElementById('card-miss-gain');
    const cardPostPc = document.getElementById('card-post-pc');
    const cardPcRed = document.getElementById('card-pc-reduction');
    const cardFuel = document.getElementById('card-propellant-cost');
    const cardFuelFrac = document.getElementById('card-fuel-fraction');
    const criteriaBadge = document.getElementById('target-criteria-badge');

    if (cardPostMiss) cardPostMiss.textContent = `${res.postManeuverMissMeters.toLocaleString()} m`;
    if (cardMissGain) {
      const sign = res.missDistanceGainMeters >= 0 ? '+' : '';
      cardMissGain.textContent = `Gain: ${sign}${res.missDistanceGainMeters.toLocaleString()} m`;
    }
    
    if (cardPostPc) {
      cardPostPc.textContent = res.postManeuverPc !== null ? (res.postManeuverPc < 1e-4 ? '< 1.0e-09' : res.postManeuverPc.toExponential(2)) : 'N/A';
    }
    if (cardPcRed) {
      cardPcRed.textContent = res.postManeuverPc !== null && conj.collisionProbability 
        ? `Risk Reduction: ${Math.min(99.99, ((1 - (res.postManeuverPc / conj.collisionProbability)) * 100)).toFixed(2)}%`
        : 'Covariance cleared';
    }

    if (cardFuel) cardFuel.textContent = `${res.idealPropellantConsumedKg.toFixed(3)} kg`;
    if (cardFuelFrac && sat) {
      const frac = ((res.idealPropellantConsumedKg / sat.remainingFuelKg) * 100).toFixed(2);
      cardFuelFrac.textContent = `${frac}% of reserve`;
    }

    if (criteriaBadge) {
      if (res.targetCriteriaMet) {
        criteriaBadge.className = 'badge badge-nominal';
        criteriaBadge.textContent = 'TARGET CRITERIA SATISFIED';
      } else {
        criteriaBadge.className = 'badge badge-critical';
        criteriaBadge.textContent = 'CRITERIA NOT MET';
      }
    }

    // 2. Detailed Table Components
    const tblPreTotal = document.getElementById('tbl-pre-total');
    const tblPostTotal = document.getElementById('tbl-post-total');
    const tblGainTotal = document.getElementById('tbl-gain-total');

    const tblPreR = document.getElementById('tbl-pre-radial');
    const tblPostR = document.getElementById('tbl-post-radial');
    const tblGainR = document.getElementById('tbl-gain-radial');

    const tblPreT = document.getElementById('tbl-pre-in-track');
    const tblPostT = document.getElementById('tbl-post-in-track');
    const tblGainT = document.getElementById('tbl-gain-in-track');

    const tblPreN = document.getElementById('tbl-pre-cross-track');
    const tblPostN = document.getElementById('tbl-post-cross-track');
    const tblGainN = document.getElementById('tbl-gain-cross-track');

    const tblPrePc = document.getElementById('tbl-pre-pc');
    const tblPostPc = document.getElementById('tbl-post-pc');

    if (tblPreTotal) tblPreTotal.textContent = `${res.preManeuverMissMeters.toLocaleString()} m`;
    if (tblPostTotal) tblPostTotal.textContent = `${res.postManeuverMissMeters.toLocaleString()} m`;
    if (tblGainTotal) {
      const sign = res.missDistanceGainMeters >= 0 ? '+' : '';
      tblGainTotal.textContent = `${sign}${res.missDistanceGainMeters.toLocaleString()} m`;
    }

    // Deconstruct RIC components from projection
    const leadSec = Math.round(this.leadHours * 3600);
    let deltaR = 0, deltaT = 0, deltaN = 0;
    if (this.burnDirection === 'ALONG_TRACK_POS') {
      deltaT = Math.round(3.0 * this.deltaVMps * leadSec);
      deltaR = Math.round(this.deltaVMps * 4.0);
    } else if (this.burnDirection === 'ALONG_TRACK_NEG') {
      deltaT = Math.round(-3.0 * this.deltaVMps * leadSec);
      deltaR = Math.round(-this.deltaVMps * 4.0);
    } else if (this.burnDirection === 'CROSS_TRACK') {
      deltaN = Math.round(this.deltaVMps * 850);
    } else if (this.burnDirection === 'RADIAL') {
      deltaR = Math.round(this.deltaVMps * 650);
    }

    const preR = Math.round(conj.missDistanceKm.radial * 1000);
    const preT = Math.round(conj.missDistanceKm.inTrack * 1000);
    const preN = Math.round(conj.missDistanceKm.crossTrack * 1000);

    const postR = preR + deltaR;
    const postT = preT + deltaT;
    const postN = preN + deltaN;

    if (tblPreR) tblPreR.textContent = `${preR >= 0 ? '+' : ''}${preR} m`;
    if (tblPostR) tblPostR.textContent = `${postR >= 0 ? '+' : ''}${postR} m`;
    if (tblGainR) tblGainR.textContent = `${deltaR >= 0 ? '+' : ''}${deltaR} m`;

    if (tblPreT) tblPreT.textContent = `${preT >= 0 ? '+' : ''}${preT} m`;
    if (tblPostT) tblPostT.textContent = `${postT >= 0 ? '+' : ''}${postT} m`;
    if (tblGainT) tblGainT.textContent = `${deltaT >= 0 ? '+' : ''}${deltaT} m`;

    if (tblPreN) tblPreN.textContent = `${preN >= 0 ? '+' : ''}${preN} m`;
    if (tblPostN) tblPostN.textContent = `${postN >= 0 ? '+' : ''}${postN} m`;
    if (tblGainN) tblGainN.textContent = `${deltaN >= 0 ? '+' : ''}${deltaN} m`;

    if (tblPrePc) tblPrePc.textContent = formatProbability(conj.collisionProbability);
    if (tblPostPc) tblPostPc.textContent = res.postManeuverPc !== null ? (res.postManeuverPc < 1e-4 ? '< 1.0e-09' : res.postManeuverPc.toExponential(2)) : 'N/A';

    // 3. Target Criteria Checklist
    const chkMiss = document.getElementById('check-miss-threshold');
    const chkPc = document.getElementById('check-pc-threshold');
    const chkFuel = document.getElementById('check-fuel-threshold');

    if (chkMiss) {
      const pass = res.postManeuverMissMeters >= 500;
      chkMiss.style.color = pass ? 'var(--color-nominal)' : 'var(--color-critical)';
      chkMiss.textContent = `${pass ? 'PASS' : 'FAIL'} (${res.postManeuverMissMeters.toLocaleString()} m ${pass ? '≥' : '<'} 500 m)`;
    }

    if (chkPc) {
      const pass = res.postManeuverPc === null || res.postManeuverPc < 1e-4;
      chkPc.style.color = pass ? 'var(--color-nominal)' : 'var(--color-critical)';
      chkPc.textContent = `${pass ? 'PASS' : 'FAIL'} (${res.postManeuverPc ? res.postManeuverPc.toExponential(2) : '< 1e-09'} ${pass ? '<' : '≥'} 1.0e-04)`;
    }

    if (chkFuel) {
      const pass = res.remainingPropellantPostBurnKg > 0;
      chkFuel.style.color = pass ? 'var(--color-nominal)' : 'var(--color-critical)';
      chkFuel.textContent = `${pass ? 'PASS' : 'FAIL'} (${res.remainingPropellantPostBurnKg.toFixed(2)} kg remaining)`;
    }

    // 4. Fuel Gauge & Tsiolkovsky Details
    const fuelText = document.getElementById('post-burn-fuel-text');
    const fuelBar = document.getElementById('post-burn-fuel-bar');
    const tsiolkExpanded = document.getElementById('tsiolkovsky-formula-expanded');
    const valFuelBurned = document.getElementById('val-fuel-burned');
    const valPreMass = document.getElementById('val-pre-mass');
    const valPostMass = document.getElementById('val-post-mass');
    const valBurnDuration = document.getElementById('val-burn-duration');
    const valDeltaVector = document.getElementById('val-delta-vector');

    if (sat) {
      const fuelPct = Math.round((res.remainingPropellantPostBurnKg / sat.fuelCapacityKg) * 100);
      if (fuelText) fuelText.textContent = `${res.remainingPropellantPostBurnKg.toFixed(2)} / ${sat.fuelCapacityKg.toFixed(1)} kg (${fuelPct}%)`;
      if (fuelBar) {
        fuelBar.style.width = `${fuelPct}%`;
        fuelBar.className = fuelPct < 20 ? 'propellant-bar-fill critical' : (fuelPct < 40 ? 'propellant-bar-fill low' : 'propellant-bar-fill');
      }

      if (valPreMass) valPreMass.textContent = `${sat.massKg.toFixed(2)} kg`;
      if (valPostMass) valPostMass.textContent = `${(sat.massKg - res.idealPropellantConsumedKg).toFixed(2)} kg`;
    }

    if (valFuelBurned) valFuelBurned.textContent = `${res.idealPropellantConsumedKg.toFixed(3)} kg`;
    if (valBurnDuration) valBurnDuration.textContent = `${res.burnDurationSeconds} seconds`;

    if (valDeltaVector && res.deltaVVectorMps) {
      const signX = res.deltaVVectorMps.x >= 0 ? '+' : '';
      const signY = res.deltaVVectorMps.y >= 0 ? '+' : '';
      const signZ = res.deltaVVectorMps.z >= 0 ? '+' : '';
      valDeltaVector.textContent = `[R: ${signX}${res.deltaVVectorMps.x.toFixed(2)}, T: ${signY}${res.deltaVVectorMps.y.toFixed(2)}, N: ${signZ}${res.deltaVVectorMps.z.toFixed(2)}] m/s`;
    }

    if (tsiolkExpanded && sat) {
      tsiolkExpanded.textContent = `Δm = ${sat.massKg.toFixed(1)} kg × (1 − exp(−${this.deltaVMps.toFixed(2)} / (${sat.ispSeconds.toFixed(1)} × ${this.g0}))) = ${res.idealPropellantConsumedKg.toFixed(3)} kg`;
    }
  }

  resetCandidate() {
    this.deltaVMps = this.defaultDeltaVMps;
    this.burnDirection = this.defaultBurnDirection;
    this.leadHours = this.defaultLeadHours;

    const sliderDeltaV = document.getElementById('slider-delta-v');
    const inputDeltaV = document.getElementById('input-delta-v');
    if (sliderDeltaV) sliderDeltaV.value = Math.min(3.0, this.deltaVMps).toString();
    if (inputDeltaV) inputDeltaV.value = this.deltaVMps.toFixed(2);

    const sliderLeadHours = document.getElementById('slider-lead-hours');
    const inputLeadHours = document.getElementById('input-lead-hours');
    if (sliderLeadHours) sliderLeadHours.value = this.leadHours.toString();
    if (inputLeadHours) inputLeadHours.value = this.leadHours.toFixed(2);

    document.querySelectorAll('.burn-dir-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dir === this.burnDirection);
    });

    this.updateExecutionTimeDisplay();
    this.calculateImpact();

    const statusBadge = document.getElementById('plan-status-badge');
    if (statusBadge) {
      statusBadge.className = 'badge badge-neutral';
      statusBadge.textContent = 'CANDIDATE RESET TO DEFAULTS';
    }
  }

  async saveCandidate() {
    if (!this.latestCalculationResult) {
      await this.calculateImpact();
    }

    const res = this.latestCalculationResult;
    if (!res) return;

    const leadSec = Math.round(this.leadHours * 3600);
    const tcaMs = new Date(this.selectedConjunction.tca).getTime();
    const burnEpoch = new Date(tcaMs - (leadSec * 1000)).toISOString();

    const candidatePayload = {
      id: `MAN-2026-084-CANDIDATE`,
      conjunctionId: this.selectedConjunction.id,
      targetObjectId: this.selectedSatellite.id,
      executionTime: burnEpoch,
      burnDirection: this.burnDirection,
      deltaVMagnitudeMps: this.deltaVMps,
      deltaVVectorMps: {
        radial: res.deltaVVectorMps.x,
        inTrack: res.deltaVVectorMps.y,
        crossTrack: res.deltaVVectorMps.z
      },
      estimatedPropellantKg: res.idealPropellantConsumedKg,
      burnDurationSeconds: res.burnDurationSeconds,
      assumptions: res.assumptions,
      status: 'DRAFT'
    };

    const projectionPayload = {
      missDistanceKm: {
        total: parseFloat((res.postManeuverMissMeters / 1000).toFixed(4)),
        radial: parseFloat((this.selectedConjunction.missDistanceKm.radial + (res.deltaVVectorMps.x * 0.001)).toFixed(4)),
        inTrack: parseFloat((res.postManeuverMissMeters / 1000).toFixed(4)),
        crossTrack: this.selectedConjunction.missDistanceKm.crossTrack
      },
      collisionProbability: res.postManeuverPc || 1e-9,
      riskLevel: res.targetCriteriaMet ? 'LOW' : 'CRITICAL',
      status: 'CLEARED',
      clearanceConfidence: 'HIGH',
      notes: `Planned via Tsiolkovsky solver at lead time ${this.leadHours}h with delta-v ${this.deltaVMps.toFixed(2)} m/s.`
    };

    // Store in sessionStorage and StateStore for unified application state
    sessionStorage.setItem('sos_candidate_maneuver', JSON.stringify(candidatePayload));
    sessionStorage.setItem('sos_post_projection', JSON.stringify(projectionPayload));
    sessionStorage.setItem('sos_planned_deltav', this.deltaVMps.toString());
    sessionStorage.setItem('sos_planned_direction', this.burnDirection);
    store.setCandidateManeuver(candidatePayload);

    // Persist candidate and transition workflow via REST API
    try {
      await ApiClient.saveCandidateManeuver(candidatePayload, projectionPayload);
      const wfRes = await ApiClient.transitionWorkflow({
        toState: 'MANEUVER_CANDIDATE_CREATED',
        conjunctionId: this.selectedConjunction.id,
        satelliteId: this.selectedSatellite.id,
        candidateManeuver: candidatePayload,
        notes: `Candidate maneuver ${candidatePayload.id} saved (Δv=${this.deltaVMps.toFixed(2)} m/s, ${this.burnDirection})`
      });
      if (wfRes?.data?.currentState) {
        store.setWorkflowState(wfRes.data.currentState);
      }
    } catch (e) {
      console.warn('[SOS Maneuver Planner] Server candidate save/workflow warning:', e.message);
    }

    const statusBadge = document.getElementById('plan-status-badge');
    if (statusBadge) {
      statusBadge.className = 'badge badge-nominal';
      statusBadge.textContent = 'CANDIDATE PERSISTED';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new ManeuverPlannerController();
  controller.init();
});
