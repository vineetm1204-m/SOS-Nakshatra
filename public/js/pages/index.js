/**
 * SOS Mission Control Controller (index.js)
 * Manages dashboard metrics, conjunction alert triage, orbital canvas, and selected satellite telemetry.
 */
import { ApiClient, formatMissDistance, formatRelativeVelocity, formatProbability, formatCountdown, formatUtcTimestamp } from '../api.js';
import { store } from '../state.js';
import { OrbitCanvasVisualizer } from '../components/orbit-canvas.js';

class MissionControlController {
  constructor() {
    this.canvasVisualizer = null;
    this.tcaInterval = null;
    this.conjunctions = [];
    this.satellites = [];
    this.events = [];
    this.selectedSatellite = null;
  }

  async init() {
    this.initCanvas();
    this.initEventListeners();
    await this.loadAllData();
    this.startTcaTicker();
  }

  initCanvas() {
    const canvasEl = document.getElementById('orbit-canvas');
    const fallbackEl = document.getElementById('orbit-canvas-fallback');
    if (canvasEl) {
      this.canvasVisualizer = new OrbitCanvasVisualizer(canvasEl, fallbackEl);
    }
  }

  initEventListeners() {
    // Mode switcher buttons for canvas
    const btnPlane = document.getElementById('btn-viz-plane');
    const btnEncounter = document.getElementById('btn-viz-encounter');
    const btnFallback = document.getElementById('btn-viz-fallback');

    if (btnPlane && btnEncounter) {
      btnPlane.addEventListener('click', () => {
        btnPlane.classList.add('active');
        btnEncounter.classList.remove('active');
        this.canvasVisualizer?.setMode('ORBITAL_PLANE');
      });

      btnEncounter.addEventListener('click', () => {
        btnEncounter.classList.add('active');
        btnPlane.classList.remove('active');
        this.canvasVisualizer?.setMode('ENCOUNTER_ZOOM');
      });
    }

    if (btnFallback) {
      btnFallback.addEventListener('click', () => {
        if (this.canvasVisualizer?.hasError) {
          this.canvasVisualizer.hasError = false;
          document.getElementById('orbit-canvas-fallback').style.display = 'none';
          this.canvasVisualizer.startAnimation();
          btnFallback.textContent = 'SIMULATE FALLBACK';
        } else {
          this.canvasVisualizer?.showFallback('Operator requested manual simulation of hardware acceleration fallback.');
          btnFallback.textContent = 'RESTORE VIZ';
        }
      });
    }

    // Featured Conjunction Workflow CTA
    const featuredCta = document.getElementById('btn-open-featured-workflow');
    if (featuredCta) {
      featuredCta.addEventListener('click', () => {
        const featured = this.conjunctions.find(c => c.isFeaturedScenario) || this.conjunctions[0];
        if (featured) {
          store.setSelectedConjunction(featured.id);
          store.setSelectedSatellite(featured.primarySatelliteId);
          window.location.href = `conjunction.html?id=${encodeURIComponent(featured.id)}`;
        }
      });
    }

    // Refresh telemetry action
    const btnRefresh = document.getElementById('btn-refresh-telemetry');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        btnRefresh.classList.add('btn-loading');
        this.loadAllData().finally(() => btnRefresh.classList.remove('btn-loading'));
      });
    }

    // Filter alerts buttons
    const filterBtns = document.querySelectorAll('.alert-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        this.renderConjunctionAlerts(filter);
      });
    });

    // Subscribe to state updates (e.g. from nav header or other components)
    store.subscribe((event, payload) => {
      if (event === 'satelliteChanged') {
        this.selectSatellite(payload);
      }
    });
  }

  async loadAllData() {
    try {
      this.canvasVisualizer?.showLoading(true);

      const [summaryRes, conjRes, satsRes, eventsRes] = await Promise.all([
        ApiClient.getFleetSummary().catch(() => null),
        ApiClient.getConjunctions().catch(() => ({ data: [] })),
        ApiClient.getSatellites().catch(() => ({ data: [] })),
        ApiClient.getEvents({ limit: 6 }).catch(() => ({ data: [] }))
      ]);

      if (summaryRes?.data) {
        this.renderMetrics(summaryRes.data);
      }

      this.conjunctions = conjRes?.data || [];
      this.satellites = satsRes?.data || [];
      this.events = eventsRes?.data || [];

      this.renderFeaturedBanner();
      this.renderConjunctionAlerts();
      this.renderOperationalEvents();

      // Set initial selected satellite from state
      const targetSatId = store.getState().selectedSatelliteId || 'SAT-LEO-02';
      this.selectSatellite(targetSatId);

      this.canvasVisualizer?.showLoading(false);
    } catch (err) {
      console.error('[SOS Dashboard Error]:', err);
      this.canvasVisualizer?.showFallback(`Failed to connect to backend telemetry feed: ${err.message}`);
    }
  }

  renderMetrics(summary) {
    const elTracked = document.getElementById('metric-total-tracked');
    const elNominal = document.getElementById('metric-operational');
    const elAlerts = document.getElementById('metric-conjunctions');
    const elCritical = document.getElementById('metric-critical-alerts');
    const elManeuvers = document.getElementById('metric-pending-maneuvers');
    const elFuel = document.getElementById('metric-fuel-nominal');

    if (elTracked) elTracked.textContent = summary.totalSatellites;
    if (elNominal) elNominal.textContent = summary.operationalCount;
    if (elAlerts) elAlerts.textContent = summary.activeConjunctionsCount;
    if (elCritical) elCritical.textContent = summary.criticalRiskCount;
    if (elManeuvers) elManeuvers.textContent = summary.pendingManeuversCount;
    if (elFuel) elFuel.textContent = `${Math.round((summary.fuelNominalCount / summary.totalSatellites) * 100)}%`;
  }

  renderFeaturedBanner() {
    const featured = this.conjunctions.find(c => c.isFeaturedScenario) || this.conjunctions[0];
    const bannerEl = document.getElementById('featured-conjunction-banner');
    if (!bannerEl || !featured) return;

    bannerEl.style.display = 'flex';
    const textEl = bannerEl.querySelector('.featured-alert-text');
    if (textEl) {
      textEl.innerHTML = `
        <h3>
          <span class="status-dot critical"></span>
          CRITICAL CONJUNCTION DETECTED: ${featured.code}
        </h3>
        <p>
          Target: <strong>${featured.primarySatelliteName}</strong> (${featured.primarySatelliteId}) vs 
          <strong>${featured.secondaryObjectName}</strong>. 
          Total Miss: <span class="mono" style="color: #ffd54f;">${formatMissDistance(featured.missDistanceKm.total)}</span> | 
          Rel Velocity: <span class="mono">${formatRelativeVelocity(featured.relativeVelocityKmS)}</span> | 
          Collision Prob: <span class="mono" style="color: #ff526b;">${formatProbability(featured.collisionProbability)}</span>
        </p>
      `;
    }
  }

  renderConjunctionAlerts(filter = 'ALL') {
    const container = document.getElementById('conjunction-alerts-table-body');
    if (!container) return;

    let items = [...this.conjunctions];
    if (filter === 'CRITICAL') {
      items = items.filter(c => c.riskLevel === 'CRITICAL');
    } else if (filter === 'ACTIVE') {
      items = items.filter(c => c.status !== 'CLEARED');
    }

    if (items.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">
            No conjunction alerts matching the selected filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = items.map(c => {
      const riskBadgeClass = c.riskLevel === 'CRITICAL' ? 'badge-critical' : (c.riskLevel === 'WATCH' ? 'badge-warning' : 'badge-nominal');
      const isSelected = store.getState().selectedConjunctionId === c.id;

      return `
        <tr class="${isSelected ? 'selected' : ''}" data-conj-id="${c.id}" data-sat-id="${c.primarySatelliteId}">
          <td>
            <span class="badge ${riskBadgeClass}">${c.riskLevel}</span>
          </td>
          <td>
            <strong>${c.code}</strong>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${c.id}</div>
          </td>
          <td>
            <strong>${c.primarySatelliteName}</strong>
            <div style="font-size: 0.7rem; color: var(--color-cyan);">${c.primarySatelliteId}</div>
          </td>
          <td>
            <span style="color: #ffd54f;">${c.secondaryObjectName}</span>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${c.secondaryObjectType}</div>
          </td>
          <td class="mono" style="font-weight: 700; color: ${c.missDistanceKm.total < 0.5 ? '#ff526b' : 'inherit'}">
            ${formatMissDistance(c.missDistanceKm.total)}
          </td>
          <td class="mono countdown-cell" data-tca="${c.tca}">
            ${formatCountdown(c.timeToTcaSeconds)}
          </td>
          <td>
            <a href="conjunction.html?id=${encodeURIComponent(c.id)}" class="btn btn-secondary btn-sm" title="Inspect Conjunction Event">
              INSPECT →
            </a>
          </td>
        </tr>
      `;
    }).join('');

    // Row click listeners
    container.querySelectorAll('tr[data-conj-id]').forEach(row => {
      row.addEventListener('click', (e) => {
        // Prevent re-trigger if clicking the anchor directly
        if (e.target.tagName === 'A') return;
        const conjId = row.dataset.conjId;
        const satId = row.dataset.satId;
        container.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        store.setSelectedConjunction(conjId);
        store.setSelectedSatellite(satId);
      });
    });
  }

  selectSatellite(satId) {
    const sat = this.satellites.find(s => s.id === satId) || this.satellites[0];
    if (!sat) return;

    this.selectedSatellite = sat;
    store.setSelectedSatellite(sat.id);

    // Render Satellite Telemetry Card
    const nameEl = document.getElementById('sat-card-name');
    const noradEl = document.getElementById('sat-card-norad');
    const statusBadge = document.getElementById('sat-card-status-badge');
    const altEl = document.getElementById('sat-card-altitude');
    const incEl = document.getElementById('sat-card-inclination');
    const periodEl = document.getElementById('sat-card-period');
    const velEl = document.getElementById('sat-card-velocity');
    const contactEl = document.getElementById('sat-card-contact');
    const fuelText = document.getElementById('sat-card-fuel-text');
    const fuelBar = document.getElementById('sat-card-fuel-bar');

    if (nameEl) nameEl.textContent = sat.name;
    if (noradEl) noradEl.textContent = `NORAD: ${sat.noradId} | INT: ${sat.internationalDesignator} | CLASS: ${sat.orbitClass}`;
    
    if (statusBadge) {
      statusBadge.textContent = sat.operationalStatus;
      statusBadge.className = `badge ${sat.operationalStatus === 'CRITICAL_RISK' ? 'badge-critical' : (sat.operationalStatus === 'DEGRADED' ? 'badge-warning' : 'badge-nominal')}`;
    }

    if (altEl) altEl.textContent = `${sat.orbit.altitudeKm.toFixed(1)} km`;
    if (incEl) incEl.textContent = `${sat.orbit.inclinationDeg.toFixed(2)}°`;
    if (periodEl) periodEl.textContent = `${sat.orbit.orbitalPeriodMinutes.toFixed(1)} min`;
    if (velEl) velEl.textContent = `7.52 km/s`;
    if (contactEl) contactEl.textContent = sat.lastContact;

    // Fuel calculations
    const fuelPct = Math.min(100, Math.max(0, (sat.remainingFuelKg / sat.fuelCapacityKg) * 100));
    if (fuelText) fuelText.textContent = `${sat.remainingFuelKg.toFixed(1)} / ${sat.fuelCapacityKg.toFixed(1)} kg (${fuelPct.toFixed(0)}%)`;
    if (fuelBar) {
      fuelBar.style.width = `${fuelPct}%`;
      fuelBar.className = `propellant-bar-fill ${fuelPct < 25 ? 'critical' : (fuelPct < 50 ? 'low' : '')}`;
    }

    // Subsystems
    this.renderSubsystemStatus('subsystem-power', sat.subsystems.power);
    this.renderSubsystemStatus('subsystem-propulsion', sat.subsystems.propulsion);
    this.renderSubsystemStatus('subsystem-adcs', sat.subsystems.adcs);
    this.renderSubsystemStatus('subsystem-comms', sat.subsystems.comms);
  }

  renderSubsystemStatus(elementId, status) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const badgeClass = status === 'NOMINAL' || status === 'LOCKED' || status === 'ONLINE' ? 'badge-nominal' : (status === 'CHARGING' || status === 'REORIENTING' ? 'badge-warning' : 'badge-critical');
    el.innerHTML = `<span class="badge ${badgeClass}">${status}</span>`;
  }

  renderOperationalEvents() {
    const container = document.getElementById('events-log-container');
    if (!container) return;

    if (this.events.length === 0) {
      container.innerHTML = `
        <div class="state-container">
          <div class="state-title">No Recent Events</div>
          <div class="state-desc">Event audit log is empty.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = this.events.map(e => {
      const severityClass = e.severity === 'CRITICAL' ? 'critical' : (e.severity === 'WARNING' ? 'warning' : (e.severity === 'SUCCESS' ? 'nominal' : 'cyan'));
      return `
        <div style="padding: 9px 0; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 10px; align-items: flex-start;">
          <span class="status-dot ${severityClass}" style="margin-top: 5px;"></span>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 0.8rem; color: #fff;">${e.title}</strong>
              <span class="mono" style="font-size: 0.68rem; color: var(--text-muted);">${formatUtcTimestamp(e.timestamp)}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${e.description}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  startTcaTicker() {
    this.tcaInterval = setInterval(() => {
      document.querySelectorAll('.countdown-cell[data-tca]').forEach(el => {
        const tcaIso = el.dataset.tca;
        if (tcaIso) {
          const diffSeconds = Math.floor((new Date(tcaIso).getTime() - Date.now()) / 1000);
          el.textContent = formatCountdown(diffSeconds);
        }
      });
    }, 1000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new MissionControlController();
  controller.init();
});
