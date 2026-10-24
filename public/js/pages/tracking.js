/**
 * SOS Fleet Tracking Controller (tracking.js)
 */
import { ApiClient } from '../api.js';
import { store } from '../state.js';

class TrackingPageController {
  constructor() {
    this.satellites = [];
    this.activeOrbitFilter = 'ALL';
    this.searchQuery = '';
  }

  async init() {
    this.initEventListeners();
    await this.loadFleet();
  }

  initEventListeners() {
    const orbitBtns = document.querySelectorAll('.fleet-orbit-btn');
    orbitBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        orbitBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeOrbitFilter = btn.dataset.orbit;
        this.renderTable();
      });
    });

    const searchInput = document.getElementById('fleet-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTable();
      });
    }

    const clearBtn = document.getElementById('btn-clear-search');
    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.renderTable();
      });
    }

    const refreshBtn = document.getElementById('btn-refresh-fleet');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadFleet();
      });
    }

    store.subscribe((event, payload) => {
      if (event === 'satelliteChanged') {
        this.renderSatelliteDetails(payload);
        this.highlightSelectedRow(payload);
      }
    });
  }

  async loadFleet() {
    try {
      const res = await ApiClient.getSatellites();
      this.satellites = res?.data || [];
      const badge = document.getElementById('fleet-count-badge');
      if (badge) badge.textContent = `${this.satellites.length} Tracked`;

      this.renderTable();
      const currentSatId = store.getState().selectedSatelliteId || this.satellites[0]?.id;
      this.renderSatelliteDetails(currentSatId);
      this.highlightSelectedRow(currentSatId);
    } catch (err) {
      console.error('[SOS Tracking Error]:', err);
      const tbody = document.getElementById('fleet-table-body');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 30px;">
              <div class="state-container">
                <div class="state-title" style="color: var(--color-critical);">Fleet Telemetry Unavailable</div>
                <div class="state-desc">${err.message}</div>
                <button class="btn btn-secondary btn-sm" id="btn-tracking-retry">RETRY</button>
              </div>
            </td>
          </tr>
        `;
        document.getElementById('btn-tracking-retry')?.addEventListener('click', () => this.loadFleet());
      }
    }
  }

  renderTable() {
    const tbody = document.getElementById('fleet-table-body');
    if (!tbody) return;

    let filtered = [...this.satellites];

    if (this.activeOrbitFilter !== 'ALL') {
      filtered = filtered.filter(s => s.orbitClass === this.activeOrbitFilter);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(s => 
        s.name.toLowerCase().includes(this.searchQuery) || 
        s.id.toLowerCase().includes(this.searchQuery) || 
        String(s.noradId).includes(this.searchQuery)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">
            No satellites match the current filters.
          </td>
        </tr>
      `;
      return;
    }

    const selectedSatId = store.getState().selectedSatelliteId;

    tbody.innerHTML = filtered.map(s => {
      const isSelected = s.id === selectedSatId;
      const statusClass = s.operationalStatus === 'CRITICAL_RISK' ? 'badge-critical' : (s.operationalStatus === 'DEGRADED' ? 'badge-warning' : 'badge-nominal');
      const fuelPct = Math.round((s.remainingFuelKg / s.fuelCapacityKg) * 100);

      return `
        <tr class="${isSelected ? 'selected' : ''}" data-sat-id="${s.id}">
          <td><span class="badge ${statusClass}">${s.operationalStatus}</span></td>
          <td>
            <strong>${s.name}</strong>
            <div style="font-size: 0.7rem; color: var(--color-cyan);">${s.id}</div>
          </td>
          <td class="mono">${s.noradId}</td>
          <td><span class="badge badge-neutral">${s.orbitClass}</span></td>
          <td class="mono">${s.orbit.altitudeKm.toFixed(1)} km</td>
          <td class="mono">
            ${s.remainingFuelKg.toFixed(1)} kg (${fuelPct}%)
          </td>
          <td style="font-size: 0.72rem; color: var(--text-secondary);">${s.lastContact}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-select-sat" data-sat-id="${s.id}">
              ${isSelected ? 'SELECTED' : 'SELECT'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-sat-id]').forEach(row => {
      row.addEventListener('click', (e) => {
        const satId = row.dataset.satId;
        store.setSelectedSatellite(satId);
        this.highlightSelectedRow(satId);
        this.renderSatelliteDetails(satId);
      });
    });
  }

  highlightSelectedRow(satId) {
    const tbody = document.getElementById('fleet-table-body');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(row => {
      const matches = row.dataset.satId === satId;
      row.classList.toggle('selected', matches);
      const btn = row.querySelector('.btn-select-sat');
      if (btn) btn.textContent = matches ? 'SELECTED' : 'SELECT';
    });
  }

  renderSatelliteDetails(satId) {
    const sat = this.satellites.find(s => s.id === satId);
    const container = document.getElementById('focus-sat-details');
    const badge = document.getElementById('focus-sat-status-badge');
    if (!container) return;

    if (!sat) {
      container.innerHTML = `
        <div class="state-container">
          <div class="state-title">Satellite Not Found</div>
          <div class="state-desc">Unable to find satellite telemetry for ID: ${satId}</div>
        </div>
      `;
      return;
    }

    if (badge) {
      badge.textContent = sat.operationalStatus;
      badge.className = `badge ${sat.operationalStatus === 'CRITICAL_RISK' ? 'badge-critical' : (sat.operationalStatus === 'DEGRADED' ? 'badge-warning' : 'badge-nominal')}`;
    }

    const fuelPct = Math.round((sat.remainingFuelKg / sat.fuelCapacityKg) * 100);

    container.innerHTML = `
      <div class="telemetry-hud-card">
        <div>
          <h2 class="sat-title">${sat.name} (${sat.callsign})</h2>
          <div class="sat-norad">ID: ${sat.id} | NORAD: ${sat.noradId} | COSPAR: ${sat.internationalDesignator}</div>
        </div>

        <div>
          <span class="metric-label" style="display: block; margin-bottom: 6px;">Propulsion &amp; Mass Budget</span>
          <div class="propellant-gauge">
            <div class="propellant-label-row">
              <span>${sat.propellantType} FUEL (Isp: ${sat.ispSeconds}s)</span>
              <span class="mono">${sat.remainingFuelKg.toFixed(1)} / ${sat.fuelCapacityKg.toFixed(1)} kg (${fuelPct}%)</span>
            </div>
            <div class="propellant-bar-track">
              <div class="propellant-bar-fill ${fuelPct < 25 ? 'critical' : (fuelPct < 50 ? 'low' : '')}" style="width: ${fuelPct}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              <span>Total Mass: ${sat.massKg} kg</span>
              <span>Dry Mass: ${sat.dryMassKg} kg</span>
            </div>
          </div>
        </div>

        <div>
          <span class="metric-label" style="display: block; margin-bottom: 6px;">Subsystem Health Matrix</span>
          <div class="subsystem-grid">
            <div class="subsystem-item">
              <span class="subsystem-name">Power / Battery</span>
              <span class="badge ${sat.subsystems.power === 'NOMINAL' ? 'badge-nominal' : 'badge-warning'}">${sat.subsystems.power}</span>
            </div>
            <div class="subsystem-item">
              <span class="subsystem-name">Propulsion</span>
              <span class="badge ${sat.subsystems.propulsion === 'NOMINAL' ? 'badge-nominal' : 'badge-warning'}">${sat.subsystems.propulsion}</span>
            </div>
            <div class="subsystem-item">
              <span class="subsystem-name">ADCS Attitude</span>
              <span class="badge ${sat.subsystems.adcs === 'LOCKED' ? 'badge-nominal' : 'badge-warning'}">${sat.subsystems.adcs}</span>
            </div>
            <div class="subsystem-item">
              <span class="subsystem-name">TT&amp;C Comms</span>
              <span class="badge ${sat.subsystems.comms === 'ONLINE' ? 'badge-nominal' : 'badge-warning'}">${sat.subsystems.comms}</span>
            </div>
          </div>
        </div>

        <div>
          <span class="metric-label" style="display: block; margin-bottom: 6px;">Keplerian Orbit Elements</span>
          <table class="orbital-elements-table">
            <tbody>
              <tr><td>Semi-Major Axis (a)</td><td>${sat.orbit.semiMajorAxisKm.toFixed(2)} km</td></tr>
              <tr><td>Eccentricity (e)</td><td>${sat.orbit.eccentricity.toFixed(5)}</td></tr>
              <tr><td>Inclination (i)</td><td>${sat.orbit.inclinationDeg.toFixed(2)}°</td></tr>
              <tr><td>RAAN (Ω)</td><td>${sat.orbit.raanDeg.toFixed(1)}°</td></tr>
              <tr><td>Arg of Perigee (ω)</td><td>${sat.orbit.argOfPerigeeDeg.toFixed(1)}°</td></tr>
              <tr><td>True Anomaly (ν)</td><td>${sat.orbit.trueAnomalyDeg.toFixed(1)}°</td></tr>
              <tr><td>Orbital Period</td><td>${sat.orbit.orbitalPeriodMinutes.toFixed(1)} min</td></tr>
              <tr><td>Telemetry Provenance</td><td style="color: var(--color-cyan);">${sat.provenance.source}</td></tr>
            </tbody>
          </table>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <a href="conjunction.html" class="btn btn-primary btn-sm" style="flex: 1;">
            CHECK CONJUNCTIONS →
          </a>
          <a href="maneuvers.html" class="btn btn-secondary btn-sm" style="flex: 1;">
            PLAN MANEUVER →
          </a>
        </div>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new TrackingPageController();
  controller.init();
});
