/**
 * SOS Conjunction Analysis Controller (conjunction.js)
 */
import { ApiClient, formatMissDistance, formatRelativeVelocity, formatProbability, formatCountdown, formatUtcTimestamp } from '../api.js';
import { store } from '../state.js';

class ConjunctionPageController {
  constructor() {
    this.conjunctions = [];
    this.activeConjunction = null;
    this.countdownTimer = null;
  }

  async init() {
    this.initEventListeners();
    await this.loadConjunctions();
    this.startCountdown();
  }

  initEventListeners() {
    const refreshBtn = document.getElementById('btn-refresh-conjunctions');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadConjunctions());
    }

    // Connect workflow buttons to store
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

      // Determine initial selection: check URL param, then store, then first item
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
        const id = btn.dataset.conjId;
        this.selectConjunction(id);
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
      badgeEl.textContent = `${conj.riskLevel} RISK: ${conj.status}`;
      badgeEl.className = `badge ${conj.riskLevel === 'CRITICAL' ? 'badge-critical' : (conj.riskLevel === 'WATCH' ? 'badge-warning' : 'badge-nominal')}`;
    }

    // Update Primary Metrics
    document.getElementById('conj-metric-miss').textContent = formatMissDistance(conj.missDistanceKm.total);
    document.getElementById('conj-metric-pc').textContent = formatProbability(conj.collisionProbability);
    document.getElementById('conj-metric-vrel').textContent = formatRelativeVelocity(conj.relativeVelocityKmS);
    document.getElementById('conj-metric-tca-iso').textContent = `Epoch: ${formatUtcTimestamp(conj.tca)}`;

    // Update RIC Coordinate Breakdowns
    document.getElementById('vector-radial').textContent = `${Math.round(conj.missDistanceKm.radial * 1000)} m`;
    document.getElementById('vector-in-track').textContent = `${Math.round(conj.missDistanceKm.inTrack * 1000)} m`;
    document.getElementById('vector-cross-track').textContent = `${Math.round(conj.missDistanceKm.crossTrack * 1000)} m`;

    // Notes & Covariance
    document.getElementById('conj-covariance-notes').textContent = conj.notes || 'Covariance matrix screening complete.';

    // Object Profiles
    document.getElementById('conj-event-code').textContent = conj.id;
    document.getElementById('pair-primary-name').textContent = conj.primarySatelliteName;
    document.getElementById('pair-primary-id').textContent = `Protected Satellite ID: ${conj.primarySatelliteId}`;
    document.getElementById('pair-secondary-name').textContent = conj.secondaryObjectName;
    document.getElementById('pair-secondary-id').textContent = `Intersecting Body: ${conj.secondaryObjectId} (${conj.secondaryObjectType})`;

    // Provenance
    document.getElementById('provenance-source').textContent = conj.provenance.source;
    document.getElementById('provenance-provider').textContent = conj.provenance.provider;
    document.getElementById('provenance-confidence').textContent = `${(conj.provenance.confidenceScore * 100).toFixed(1)}%`;
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
