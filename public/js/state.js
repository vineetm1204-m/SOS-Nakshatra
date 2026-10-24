/**
 * SOS Shared State Management
 * Synchronizes selected satellite, active conjunction scenario, and data mode across pages.
 */

const STORAGE_KEYS = {
  SATELLITE_ID: 'sos_selected_satellite_id',
  CONJUNCTION_ID: 'sos_selected_conjunction_id',
  DATA_MODE: 'sos_data_mode'
};

class StateStore {
  constructor() {
    this.state = {
      selectedSatelliteId: localStorage.getItem(STORAGE_KEYS.SATELLITE_ID) || 'SAT-LEO-02',
      selectedConjunctionId: localStorage.getItem(STORAGE_KEYS.CONJUNCTION_ID) || 'CONJ-2026-084',
      dataMode: localStorage.getItem(STORAGE_KEYS.DATA_MODE) || 'DEMO'
    };
    this.listeners = new Set();
  }

  getState() {
    return { ...this.state };
  }

  setSelectedSatellite(id) {
    if (!id || this.state.selectedSatelliteId === id) return;
    this.state.selectedSatelliteId = id;
    try {
      localStorage.setItem(STORAGE_KEYS.SATELLITE_ID, id);
    } catch {
      // storage unavailable fallback
    }
    this.notify('satelliteChanged', id);
  }

  setSelectedConjunction(id) {
    if (!id || this.state.selectedConjunctionId === id) return;
    this.state.selectedConjunctionId = id;
    try {
      localStorage.setItem(STORAGE_KEYS.CONJUNCTION_ID, id);
    } catch {
      // storage unavailable fallback
    }
    this.notify('conjunctionChanged', id);
  }

  setDataMode(mode) {
    if (this.state.dataMode === mode) return;
    this.state.dataMode = mode;
    try {
      localStorage.setItem(STORAGE_KEYS.DATA_MODE, mode);
    } catch {
      // storage unavailable fallback
    }
    this.notify('dataModeChanged', mode);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, payload) {
    for (const listener of this.listeners) {
      try {
        listener(event, payload, this.getState());
      } catch (err) {
        console.error('[SOS State Error]:', err);
      }
    }
  }
}

export const store = new StateStore();
