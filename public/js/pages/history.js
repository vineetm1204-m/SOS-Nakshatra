/**
 * SOS Event History Controller (history.js)
 * Manages operational audit log filtering, searching, and CSV data export.
 */
import { ApiClient, formatUtcTimestamp } from '../api.js';

class EventHistoryController {
  constructor() {
    this.events = [];
    this.selectedSeverity = 'ALL';
    this.selectedCategory = 'ALL';
    this.searchQuery = '';
  }

  async init() {
    this.initEventListeners();
    await this.loadEvents();
  }

  initEventListeners() {
    // Severity Filter Buttons
    const sevBtns = document.querySelectorAll('.severity-btn');
    sevBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sevBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSeverity = btn.dataset.sev;
        this.renderTable();
      });
    });

    // Category Filter Buttons
    const catBtns = document.querySelectorAll('.category-btn');
    catBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        catBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCategory = btn.dataset.cat;
        this.renderTable();
      });
    });

    // Search Input
    const searchInput = document.getElementById('history-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTable();
      });
    }

    const clearBtn = document.getElementById('btn-clear-history-search');
    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.renderTable();
      });
    }

    // Export CSV Button
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCsv());
    }
  }

  async loadEvents() {
    try {
      const res = await ApiClient.getEvents();
      this.events = res?.data || [];
      const badge = document.getElementById('history-count-badge');
      if (badge) badge.textContent = `${this.events.length} Events`;
      this.renderTable();
    } catch (err) {
      console.error('[SOS History Error]:', err);
    }
  }

  renderTable() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    let filtered = [...this.events];

    if (this.selectedSeverity !== 'ALL') {
      filtered = filtered.filter(e => e.severity === this.selectedSeverity);
    }

    if (this.selectedCategory !== 'ALL') {
      filtered = filtered.filter(e => (e.category || '').toUpperCase() === this.selectedCategory);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(e => 
        e.title.toLowerCase().includes(this.searchQuery) ||
        e.description.toLowerCase().includes(this.searchQuery) ||
        (e.associatedSatelliteId && e.associatedSatelliteId.toLowerCase().includes(this.searchQuery)) ||
        (e.associatedConjunctionId && e.associatedConjunctionId.toLowerCase().includes(this.searchQuery))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">
            No operational events match the current filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      const sev = (e.severity || '').toUpperCase();
      const sevClass = sev === 'CRITICAL' ? 'badge-critical' : (sev === 'WARNING' ? 'badge-warning' : (sev === 'SUCCESS' || sev === 'NOMINAL' ? 'badge-nominal' : 'badge-cyan'));
      const obj = e.associatedConjunctionId || e.associatedSatelliteId || 'FLEET';

      return `
        <tr>
          <td><span class="badge ${sevClass}">${e.severity}</span></td>
          <td class="mono" style="font-size: 0.72rem;">${formatUtcTimestamp(e.timestamp)}</td>
          <td><span class="badge badge-neutral">${e.category}</span></td>
          <td><strong>${e.title}</strong></td>
          <td style="font-size: 0.75rem; color: var(--text-secondary); max-width: 400px;">${e.description}</td>
          <td><span class="mono" style="color: var(--color-cyan); font-size: 0.72rem;">${obj}</span></td>
          <td><span class="badge badge-neutral" style="font-size: 0.65rem;">${e.provenance.source}</span></td>
        </tr>
      `;
    }).join('');
  }

  exportCsv() {
    if (this.events.length === 0) {
      alert('No events available to export.');
      return;
    }

    const headers = ['Event ID', 'Timestamp (UTC)', 'Category', 'Severity', 'Title', 'Description', 'Associated Object', 'Provenance Source'];
    const rows = this.events.map(e => [
      `"${e.id}"`,
      `"${e.timestamp}"`,
      `"${e.category}"`,
      `"${e.severity}"`,
      `"${e.title.replace(/"/g, '""')}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.associatedConjunctionId || e.associatedSatelliteId || 'FLEET'}"`,
      `"${e.provenance.source}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sos_operational_audit_log_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new EventHistoryController();
  controller.init();
});
