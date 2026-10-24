/**
 * SOS Shared Navigation Header & Status Strip Component
 * Reusable aerospace operations navbar and telemetry status bar.
 */
import { store } from '../state.js';
import { ApiClient } from '../api.js';

class SosNavHeader extends HTMLElement {
  connectedCallback() {
    this.render();
    this.startClock();
    this.initListeners();
    this.loadActiveAlertBadge();
  }

  disconnectedCallback() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.unsubscribe) this.unsubscribe();
  }

  render() {
    const currentPath = window.location.pathname.toLowerCase();
    
    const navItems = [
      { path: 'index.html', label: 'Mission Control', id: 'nav-mc' },
      { path: 'tracking.html', label: 'Fleet / Tracking', id: 'nav-fleet' },
      { path: 'conjunction.html', label: 'Conjunction Analysis', id: 'nav-conj', badge: '1' },
      { path: 'maneuvers.html', label: 'Maneuver Planner', id: 'nav-maneuvers' },
      { path: 'autopilot.html', label: 'Flight Director', id: 'nav-autopilot' },
      { path: 'history.html', label: 'Event History', id: 'nav-history' },
      { path: 'settings.html', label: 'Settings / Data Sources', id: 'nav-settings' }
    ];

    const state = store.getState();

    this.innerHTML = `
      <header class="sos-navbar">
        <div class="brand-section">
          <a href="index.html" class="brand-logo" title="Safe Orbit for Satellites">
            <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9" stroke="var(--color-cyan)"/>
              <ellipse cx="12" cy="12" rx="10" ry="4" stroke="var(--color-cyan)" stroke-dasharray="2 2" transform="rotate(-30 12 12)"/>
              <circle cx="12" cy="12" r="2.5" fill="var(--color-nominal)"/>
            </svg>
            <span class="brand-title">SOS</span>
          </a>
          <span class="brand-tagline">Conjunction Ops & Safety</span>
        </div>

        <nav class="nav-links" aria-label="Main Navigation">
          ${navItems.map(item => {
            const isActive = currentPath.endsWith(item.path) || (currentPath === '/' && item.path === 'index.html');
            return `
              <a href="${item.path}" 
                 id="${item.id}"
                 class="nav-item ${isActive ? 'active' : ''}" 
                 ${isActive ? 'aria-current="page"' : ''}>
                <span>${item.label}</span>
                ${item.badge ? `<span class="nav-badge" id="nav-badge-conj">${item.badge}</span>` : ''}
              </a>
            `;
          }).join('')}
        </nav>

        <div class="nav-hud">
          <div class="hud-item">
            <span class="hud-label">UTC Operations Time</span>
            <span class="hud-value" id="hud-utc-clock">--:--:-- UTC</span>
          </div>

          <div class="hud-item">
            <span class="hud-label">Source Provenance</span>
            <button class="mode-badge demo" id="hud-mode-toggle" title="Click to toggle data simulation mode">
              DEMO DATA (SSN-SIM)
            </button>
          </div>
        </div>
      </header>

      <div class="sos-status-strip">
        <div class="status-strip-left">
          <span class="status-strip-item">
            <span class="status-dot critical"></span>
            <strong>CONJUNCTION ACTIVE:</strong> CONJ-2026-084 [TCA T-04h 18m]
          </span>
          <span class="status-strip-item">
            <strong>FOCUS ASSET:</strong> <span id="strip-sat-name">SENTINEL-X (SAT-LEO-02)</span>
          </span>
        </div>
        <div class="status-strip-right">
          <span class="status-strip-item">
            <strong>WORKFLOW:</strong> <span class="badge badge-cyan" id="strip-workflow-badge">MONITORING</span>
          </span>
          <span class="status-strip-item">
            <strong>SPACE WEATHER:</strong> F10.7=138.2 | AP=4 (QUIET)
          </span>
          <span class="status-strip-item">
            <strong>STATION LOCK:</strong> SVALBARD KSAT (NOMINAL)
          </span>
        </div>
      </div>
    `;
  }

  startClock() {
    const clockEl = this.querySelector('#hud-utc-clock');
    const update = () => {
      const now = new Date();
      const iso = now.toISOString().replace('T', ' ').substring(0, 19);
      if (clockEl) {
        clockEl.textContent = `${iso} UTC`;
      }
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }

  initListeners() {
    const toggleBtn = this.querySelector('#hud-mode-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const state = store.getState();
        const nextMode = state.dataMode === 'DEMO' ? 'LIVE_SIMULATED' : 'DEMO';
        store.setDataMode(nextMode);
        toggleBtn.textContent = nextMode === 'DEMO' ? 'DEMO DATA (SSN-SIM)' : 'LIVE TELEMETRY (SIM)';
        toggleBtn.className = `mode-badge ${nextMode === 'DEMO' ? 'demo' : 'live'}`;
      });
    }

    // Subscribe to state updates
    this.unsubscribe = store.subscribe((event, payload) => {
      if (event === 'satelliteChanged') {
        this.updateActiveSatDisplay(payload);
      } else if (event === 'workflowStateChanged') {
        this.updateWorkflowDisplay(payload);
      }
    });

    this.updateActiveSatDisplay(store.getState().selectedSatelliteId);
    this.updateWorkflowDisplay(store.getState().workflowState);

    // Initial sync with backend workflow status
    ApiClient.getWorkflowStatus().then(res => {
      if (res?.data?.currentState) {
        store.setWorkflowState(res.data.currentState);
      }
    }).catch(() => {});
  }

  updateWorkflowDisplay(state) {
    const badge = this.querySelector('#strip-workflow-badge');
    if (!badge || !state) return;
    badge.textContent = state;
    if (state === 'SIMULATED_MANEUVER_EXECUTING') {
      badge.className = 'badge badge-warning';
    } else if (state === 'POST_MANEUVER_VERIFICATION_COMPLETE' || state === 'CLOSED') {
      badge.className = 'badge badge-nominal';
    } else if (state === 'FAILED_OR_BLOCKED') {
      badge.className = 'badge badge-critical';
    } else if (state === 'AWAITING_OPERATOR_APPROVAL') {
      badge.className = 'badge badge-warning';
    } else {
      badge.className = 'badge badge-cyan';
    }
  }

  async updateActiveSatDisplay(satId) {
    const satNameEl = this.querySelector('#strip-sat-name');
    if (!satNameEl) return;
    try {
      const { data } = await ApiClient.getSatelliteById(satId);
      if (data) {
        satNameEl.textContent = `${data.name} (${data.id})`;
      }
    } catch {
      satNameEl.textContent = satId;
    }
  }

  async loadActiveAlertBadge() {
    try {
      const { data } = await ApiClient.getConjunctions();
      const criticalCount = data.filter(c => c.riskLevel === 'CRITICAL' && c.status !== 'CLEARED').length;
      const badge = this.querySelector('#nav-badge-conj');
      if (badge) {
        badge.textContent = criticalCount;
        badge.style.display = criticalCount > 0 ? 'inline-block' : 'none';
      }
    } catch {
      // offline fallback
    }
  }
}

customElements.define('sos-nav-header', SosNavHeader);
