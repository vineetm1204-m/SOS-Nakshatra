/**
 * SOS Settings Controller (settings.js)
 * Manages configuration updates, threshold redlines, and data source status.
 */
import { ApiClient } from '../api.js';
import { store } from '../state.js';

class SettingsController {
  constructor() {
    this.currentSettings = null;
  }

  async init() {
    this.initEventListeners();
    await this.loadSettings();
  }

  initEventListeners() {
    const form = document.getElementById('settings-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSettings();
      });
    }

    const restoreBtn = document.getElementById('btn-restore-defaults');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        document.getElementById('setting-data-mode').value = 'DEMO';
        document.getElementById('setting-crit-miss').value = '0.5';
        document.getElementById('setting-warn-miss').value = '2.0';
        document.getElementById('setting-crit-pc').value = '0.0001';
        document.getElementById('setting-operator-callsign').value = 'OPS-ALPHA-LEAD';
        this.saveSettings('Defaults successfully restored.');
      });
    }
  }

  async loadSettings() {
    try {
      const res = await ApiClient.getSettings();
      this.currentSettings = res?.data;
      if (this.currentSettings) {
        document.getElementById('setting-data-mode').value = this.currentSettings.dataMode || 'DEMO';
        document.getElementById('setting-crit-miss').value = this.currentSettings.criticalMissDistanceThresholdKm || 0.5;
        document.getElementById('setting-warn-miss').value = this.currentSettings.warningMissDistanceThresholdKm || 2.0;
        document.getElementById('setting-crit-pc').value = this.currentSettings.criticalCollisionProbabilityThreshold || 0.0001;
        document.getElementById('setting-operator-callsign').value = this.currentSettings.operatorCallsign || 'OPS-ALPHA-LEAD';
      }
    } catch (err) {
      console.error('[SOS Settings Error]:', err);
    }
  }

  async saveSettings(customMessage) {
    const dataMode = document.getElementById('setting-data-mode').value;
    const criticalMiss = parseFloat(document.getElementById('setting-crit-miss').value);
    const warningMiss = parseFloat(document.getElementById('setting-warn-miss').value);
    const criticalPc = parseFloat(document.getElementById('setting-crit-pc').value);
    const operatorCallsign = document.getElementById('setting-operator-callsign').value.trim();

    const payload = {
      dataMode,
      criticalMissDistanceThresholdKm: criticalMiss,
      warningMissDistanceThresholdKm: warningMiss,
      criticalCollisionProbabilityThreshold: criticalPc,
      operatorCallsign
    };

    try {
      const btn = document.getElementById('btn-save-settings');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'SAVING CONFIGURATION...';
      }

      await ApiClient.updateSettings(payload);
      store.setDataMode(dataMode);

      this.showAlert(customMessage || 'Operational settings successfully updated and broadcast to all consoles.', 'nominal');
    } catch (err) {
      this.showAlert(`Failed to update settings: ${err.message}`, 'critical');
    } finally {
      const btn = document.getElementById('btn-save-settings');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'SAVE OPERATIONAL CONFIGURATION';
      }
    }
  }

  showAlert(message, type = 'nominal') {
    const banner = document.getElementById('settings-alert-banner');
    if (!banner) return;

    banner.style.display = 'block';
    banner.textContent = message;

    if (type === 'nominal') {
      banner.style.background = 'rgba(0, 230, 118, 0.15)';
      banner.style.border = '1px solid var(--color-nominal)';
      banner.style.color = '#00e676';
    } else {
      banner.style.background = 'rgba(255, 51, 75, 0.15)';
      banner.style.border = '1px solid var(--color-critical)';
      banner.style.color = '#ff526b';
    }

    setTimeout(() => {
      banner.style.display = 'none';
    }, 4500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new SettingsController();
  controller.init();
});
