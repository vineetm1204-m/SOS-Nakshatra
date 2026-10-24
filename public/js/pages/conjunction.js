/**
 * SOS Conjunction Analysis Controller (conjunction.js)
 * Implements encounter geometry canvas, formal CARA risk rules, and recommended directives.
 */
import { ApiClient, formatMissDistance, formatRelativeVelocity, formatProbability, formatCountdown, formatUtcTimestamp } from '../api.js';
import { store } from '../state.js';

class ConjunctionPageController {
  constructor() {
    this.conjunctions = [];
    this.activeConjunction = null;
    this.countdownTimer = null;
    this.canvasCtx = null;
  }

  async init() {
    this.initCanvas();
    this.initEventListeners();
    await this.loadConjunctions();
    this.startCountdown();
  }

  initCanvas() {
    const canvas = document.getElementById('encounter-plane-canvas');
    if (canvas) {
      this.canvasCtx = canvas.getContext('2d');
      this.resizeCanvas(canvas);
      window.addEventListener('resize', () => {
        this.resizeCanvas(canvas);
        if (this.activeConjunction) {
          this.renderEncounterCanvas(this.activeConjunction);
        }
      });
    }
  }

  resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    if (this.canvasCtx) {
      this.canvasCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
  }

  initEventListeners() {
    const refreshBtn = document.getElementById('btn-refresh-conjunctions');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadConjunctions());
    }

    const btnPlanner = document.getElementById('btn-proceed-to-planner');
    if (btnPlanner) {
      btnPlanner.addEventListener('click', () => {
        if (this.activeConjunction) {
          store.setSelectedConjunction(this.activeConjunction.id);
          store.setSelectedSatellite(this.activeConjunction.primarySatelliteId);
        }
      });
    }

    const btnDirector = document.getElementById('btn-consult-flight-director');
    if (btnDirector) {
      btnDirector.addEventListener('click', () => {
        if (this.activeConjunction) {
          store.setSelectedConjunction(this.activeConjunction.id);
          store.setSelectedSatellite(this.activeConjunction.primarySatelliteId);
        }
      });
    }
  }

  async loadConjunctions() {
    try {
      const res = await ApiClient.getConjunctions();
      this.conjunctions = res?.data || [];

      const urlParams = new URLSearchParams(window.location.search);
      const queryId = urlParams.get('id');
      const targetId = queryId || store.getState().selectedConjunctionId || this.conjunctions[0]?.id;

      this.renderEventButtons();
      this.selectConjunction(targetId);
    } catch (err) {
      console.error('[SOS Conjunction Error]:', err);
    }
  }

  renderEventButtons() {
    const container = document.getElementById('conj-event-buttons');
    if (!container) return;

    container.innerHTML = this.conjunctions.map(c => {
      const isSelected = this.activeConjunction?.id === c.id;
      const riskClass = c.riskLevel === 'CRITICAL' ? 'badge-critical' : (c.riskLevel === 'WATCH' ? 'badge-warning' : 'badge-nominal');

      return `
        <button class="filter-btn ${isSelected ? 'active' : ''}" data-conj-id="${c.id}">
          <span class="badge ${riskClass}" style="margin-right: 4px;">${c.riskLevel}</span>
          ${c.code}
        </button>
      `;
    }).join('');

    container.querySelectorAll('button[data-conj-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectConjunction(btn.dataset.conjId);
      });
    });
  }

  selectConjunction(id) {
    const conj = this.conjunctions.find(c => c.id === id) || this.conjunctions[0];
    if (!conj) return;

    this.activeConjunction = conj;
    store.setSelectedConjunction(conj.id);
    store.setSelectedSatellite(conj.primarySatelliteId);

    // Update active button state
    document.querySelectorAll('#conj-event-buttons button').forEach(b => {
      b.classList.toggle('active', b.dataset.conjId === conj.id);
    });

    // Update Banner Badge
    const badgeEl = document.getElementById('active-conj-risk-badge');
    if (badgeEl) {
      badgeEl.textContent = `${conj.riskLevel} RISK (${conj.status})`;
      badgeEl.className = `badge ${conj.riskLevel === 'CRITICAL' ? 'badge-critical' : (conj.riskLevel === 'WATCH' ? 'badge-warning' : 'badge-nominal')}`;
    }

    // Update Primary Metrics
    document.getElementById('conj-metric-miss').textContent = formatMissDistance(conj.missDistanceKm.total);
    
    // Explicit Pc or Insufficient Covariance Notice
    const pcEl = document.getElementById('conj-metric-pc');
    if (conj.collisionProbability !== null) {
      pcEl.textContent = formatProbability(conj.collisionProbability);
      pcEl.style.color = conj.collisionProbability >= 1e-4 ? '#ff526b' : 'inherit';
    } else {
      pcEl.textContent = 'Pc UNAVAILABLE';
      pcEl.style.color = 'var(--text-muted)';
      pcEl.style.fontSize = '1.1rem';
    }

    document.getElementById('conj-metric-vrel').textContent = formatRelativeVelocity(conj.relativeVelocityKmS);
    document.getElementById('conj-metric-tca-iso').textContent = `Epoch: ${formatUtcTimestamp(conj.tca)}`;

    // Update RIC Coordinate Breakdowns
    document.getElementById('vector-radial').textContent = `${Math.round(conj.missDistanceKm.radial * 1000)} m`;
    document.getElementById('vector-in-track').textContent = `${Math.round(conj.missDistanceKm.inTrack * 1000)} m`;
    document.getElementById('vector-cross-track').textContent = `${Math.round(conj.missDistanceKm.crossTrack * 1000)} m`;

    // Risk Classification Rule & Rationale
    const ruleNameEl = document.getElementById('risk-rule-name');
    const ruleTypeEl = document.getElementById('risk-rule-type');
    const notesEl = document.getElementById('conj-covariance-notes');
    const nextStepEl = document.getElementById('recommended-next-step-text');

    if (conj.collisionProbability !== null && conj.collisionProbability >= 1e-4) {
      if (ruleNameEl) ruleNameEl.textContent = 'CARA_PC_REDLINE';
      if (ruleTypeEl) ruleTypeEl.textContent = 'FORMAL PROBABILITY';
      if (notesEl) notesEl.textContent = 'Formal collision probability exceeds NASA/ESA critical threshold (1.0e-04). Akella-Alfriend 2D B-plane encounter integration with validated Gaussian covariance.';
      if (nextStepEl) nextStepEl.textContent = 'Collision avoidance maneuver plan mandated. Uplink decision required prior to T-02h 00m deadline.';
    } else if (conj.missDistanceKm.total <= 0.5) {
      if (ruleNameEl) ruleNameEl.textContent = 'GEOMETRIC_MISS_DISTANCE_CRITICAL';
      if (ruleTypeEl) ruleTypeEl.textContent = 'HEURISTIC PROXIMITY';
      if (notesEl) notesEl.textContent = 'Classified critical based on geometric proximity penetration (< 500m threshold). Full covariance modeling underway.';
      if (nextStepEl) nextStepEl.textContent = 'Prepare avoidance maneuver draft. Monitor next tracking pass for covariance update.';
    } else if (conj.status === 'CLEARED') {
      if (ruleNameEl) ruleNameEl.textContent = 'NOMINAL_CLEARANCE';
      if (ruleTypeEl) ruleTypeEl.textContent = 'CLEARED EVENT';
      if (notesEl) notesEl.textContent = 'Encounter past TCA. Tracked miss distance confirmed safe clearance.';
      if (nextStepEl) nextStepEl.textContent = 'No operational action required. Event archived in mission ledger.';
    } else {
      if (ruleNameEl) ruleNameEl.textContent = 'GEOMETRIC_MISS_DISTANCE_WATCH';
      if (ruleTypeEl) ruleTypeEl.textContent = 'SCREENING ENVELOPE';
      if (notesEl) notesEl.textContent = 'Object in passive observation window. Miss distance exceeds critical threshold.';
      if (nextStepEl) nextStepEl.textContent = 'Maintain passive ground station pass tracking. No maneuver required at this epoch.';
    }

    // Object Profiles
    document.getElementById('conj-event-code').textContent = conj.id;
    document.getElementById('pair-primary-name').textContent = conj.primarySatelliteName;
    document.getElementById('pair-primary-id').textContent = `Protected Satellite ID: ${conj.primarySatelliteId} | NORAD: 49211 | TYPE: PAYLOAD`;
    document.getElementById('pair-secondary-name').textContent = conj.secondaryObjectName;
    document.getElementById('pair-secondary-id').textContent = `Intersecting Body: ${conj.secondaryObjectId} (${conj.secondaryObjectType})`;

    // Provenance
    document.getElementById('provenance-source').textContent = conj.provenance.source;
    document.getElementById('provenance-provider').textContent = conj.provenance.provider;
    document.getElementById('provenance-confidence').textContent = `${(conj.provenance.confidenceScore * 100).toFixed(1)}%`;
    document.getElementById('provenance-covariance-status').textContent = conj.collisionProbabilityConfidence;

    // Render Canvas Geometry
    this.renderEncounterCanvas(conj);
  }

  renderEncounterCanvas(conj) {
    if (!this.canvasCtx) return;
    const canvas = document.getElementById('encounter-plane-canvas');
    if (!canvas) return;

    const ctx = this.canvasCtx;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // Tactical Background Grid
    ctx.strokeStyle = '#0d131f';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Coordinate Crosshairs (RIC: Radial vs In-Track)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx, height - 10);
    ctx.moveTo(10, cy);
    ctx.lineTo(width - 10, cy);
    ctx.stroke();

    // Axis Labels
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('+RADIAL (UP)', cx + 6, 20);
    ctx.fillText('-RADIAL (DOWN)', cx + 6, height - 15);
    ctx.fillText('+IN-TRACK (VELOCITY)', width - 150, cy - 6);

    // Primary Protected Satellite at origin (0, 0)
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 10, cy - 10, 20, 20);

    ctx.fillStyle = '#f8fafc';
    ctx.fillText(conj.primarySatelliteName, cx - 35, cy + 22);

    // Secondary Object Position (Mapped in meters)
    const radialMeters = conj.missDistanceKm.radial * 1000;
    const inTrackMeters = conj.missDistanceKm.inTrack * 1000;

    const scale = 0.55; // pixels per meter
    const secX = cx + (inTrackMeters * scale);
    const secY = cy - (radialMeters * scale); // screen Y inverted

    // 3-Sigma Covariance Ellipse (if high confidence)
    if (conj.collisionProbabilityConfidence === 'HIGH') {
      ctx.strokeStyle = 'rgba(255, 51, 75, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(secX, secY, 48, 24, Math.PI / 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 51, 75, 0.12)';
      ctx.fill();
      ctx.setLineDash([]);
    }

    // Vector line from primary to secondary
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(secX, secY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Secondary Object Marker
    ctx.fillStyle = '#ff334b';
    ctx.beginPath();
    ctx.arc(secX, secY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ff334b';
    ctx.strokeRect(secX - 6, secY - 6, 12, 12);

    // Annotations
    ctx.fillStyle = '#ffd54f';
    ctx.fillText(`${formatMissDistance(conj.missDistanceKm.total)} TOTAL MISS`, (cx + secX) / 2 - 20, (cy + secY) / 2 - 8);

    ctx.fillStyle = '#ff526b';
    ctx.fillText(conj.secondaryObjectName.substring(0, 24), secX + 12, secY + 4);
  }

  startCountdown() {
    this.countdownTimer = setInterval(() => {
      if (!this.activeConjunction) return;
      const diffSeconds = Math.floor((new Date(this.activeConjunction.tca).getTime() - Date.now()) / 1000);
      const el = document.getElementById('conj-metric-tca');
      if (el) el.textContent = formatCountdown(diffSeconds);
    }, 1000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new ConjunctionPageController();
  controller.init();
});
