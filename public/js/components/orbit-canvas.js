/**
 * SOS Orbital Canvas Visualizer
 * Real-time 2D Canvas orbital projection engine with altitude rings, satellite tracks, and encounter reticle.
 */

export class OrbitCanvasVisualizer {
  constructor(canvasEl, fallbackEl) {
    this.canvas = canvasEl;
    this.fallback = fallbackEl;
    this.ctx = canvasEl ? canvasEl.getContext('2d') : null;
    this.mode = 'ORBITAL_PLANE'; // 'ORBITAL_PLANE' | 'ENCOUNTER_ZOOM'
    this.animationFrame = null;
    this.angle = 0;
    this.isLoading = false;
    this.hasError = false;

    this.init();
  }

  init() {
    if (!this.canvas || !this.ctx) {
      this.showFallback('HTML5 Canvas context unavailable on this display.');
      return;
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.startAnimation();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = rect.height * (window.devicePixelRatio || 1);
    if (this.ctx) {
      this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
  }

  setMode(mode) {
    this.mode = mode;
  }

  showLoading(loading = true) {
    this.isLoading = loading;
    if (this.fallback) {
      this.fallback.style.display = loading ? 'flex' : 'none';
      if (loading) {
        this.fallback.innerHTML = `
          <div class="state-container loading">
            <div class="spinner"></div>
            <div class="state-title">PROPAGATING ORBITAL TRAJECTORIES</div>
            <div class="state-desc">Loading ephemeris and covariance matrices for fleet...</div>
          </div>
        `;
      }
    }
  }

  showFallback(message) {
    this.hasError = true;
    if (this.fallback) {
      this.fallback.style.display = 'flex';
      this.fallback.innerHTML = `
        <div class="state-container">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-critical)" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div class="state-title" style="margin-top: 10px;">Visualization Fallback Active</div>
          <div class="state-desc">${message || 'Orbital hardware acceleration unavailable.'}</div>
          <button class="btn btn-secondary btn-sm" id="btn-canvas-retry">RETRY INITIALIZATION</button>
        </div>
      `;
      const retryBtn = this.fallback.querySelector('#btn-canvas-retry');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.hasError = false;
          this.fallback.style.display = 'none';
          this.startAnimation();
        });
      }
    }
  }

  startAnimation() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

    const animate = () => {
      this.angle += 0.008;
      this.render();
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  destroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  }

  render() {
    if (!this.ctx || this.hasError || this.isLoading) return;

    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // Draw Tactical Background Grid
    ctx.strokeStyle = '#0d131f';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (this.mode === 'ENCOUNTER_ZOOM') {
      this.renderEncounterZoom(ctx, cx, cy);
      return;
    }

    // --- Mode: Orbital Plane View ---
    const earthRadius = Math.min(width, height) * 0.18;

    // Altitude Range Rings
    const leoRadius = earthRadius * 1.5;
    const meoRadius = earthRadius * 2.1;

    // MEO Ring
    ctx.strokeStyle = '#182232';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, meoRadius, 0, Math.PI * 2);
    ctx.stroke();

    // LEO Ring (Sentinel-X operational band)
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, leoRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Earth Sphere Representation
    ctx.setLineDash([]);
    const earthGrad = ctx.createRadialGradient(cx - earthRadius * 0.3, cy - earthRadius * 0.3, earthRadius * 0.1, cx, cy, earthRadius);
    earthGrad.addColorStop(0, '#102238');
    earthGrad.addColorStop(0.8, '#0b1626');
    earthGrad.addColorStop(1, '#050c18');

    ctx.fillStyle = earthGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
    ctx.fill();

    // Earth Atmosphere Glow
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Earth Graticule Lines
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, earthRadius * 0.9, earthRadius * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Primary Satellite Orbit (SENTINEL-X: Polar LEO, Inclination ~97 deg)
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, leoRadius * 0.98, leoRadius * 1.15, -Math.PI / 10, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary Debris Orbit (COSMOS-2251 Debris: Crossing Plane)
    ctx.strokeStyle = 'rgba(255, 51, 75, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, leoRadius * 1.12, leoRadius * 0.94, Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();

    // Current Positions along orbit
    const satAngle = this.angle;
    const satX = cx + Math.cos(satAngle) * (leoRadius * 0.98) * Math.cos(-Math.PI / 10) - Math.sin(satAngle) * (leoRadius * 1.15) * Math.sin(-Math.PI / 10);
    const satY = cy + Math.cos(satAngle) * (leoRadius * 0.98) * Math.sin(-Math.PI / 10) + Math.sin(satAngle) * (leoRadius * 1.15) * Math.cos(-Math.PI / 10);

    const debAngle = this.angle + 1.25;
    const debX = cx + Math.cos(debAngle) * (leoRadius * 1.12) * Math.cos(Math.PI / 4) - Math.sin(debAngle) * (leoRadius * 0.94) * Math.sin(Math.PI / 4);
    const debY = cy + Math.cos(debAngle) * (leoRadius * 1.12) * Math.sin(Math.PI / 4) + Math.sin(debAngle) * (leoRadius * 0.94) * Math.cos(Math.PI / 4);

    // Conjunction Warning Intersection Reticle
    const interX = cx + 88;
    const interY = cy - 65;

    ctx.strokeStyle = 'rgba(255, 51, 75, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(interX, interY, 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 51, 75, 0.2)';
    ctx.beginPath();
    ctx.arc(interX, interY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Conjunction label
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ff526b';
    ctx.fillText('TCA CONJUNCTION NODE [184m]', interX + 22, interY - 4);

    // Draw Sentinel-X Spacecraft Marker
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(satX, satY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Spacecraft Target Box
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(satX - 8, satY - 8, 16, 16);

    ctx.fillStyle = '#f8fafc';
    ctx.fillText('SENTINEL-X (680km)', satX + 12, satY + 4);

    // Draw Debris Marker
    ctx.fillStyle = '#ff334b';
    ctx.beginPath();
    ctx.arc(debX, debY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ff334b';
    ctx.strokeRect(debX - 6, debY - 6, 12, 12);
    ctx.fillText('COSMOS-2251 DEBRIS', debX + 10, debY + 4);

    // Range & Reference annotations
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('LEO ALTITUDE SHELL (680 KM)', cx - leoRadius, cy + leoRadius + 14);
    ctx.fillText('FRAME: ECI (EARTH-CENTERED INERTIAL)', 14, height - 12);
  }

  renderEncounterZoom(ctx, cx, cy) {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Tactical CW / Hill Frame encounter geometry
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;

    // Crosshairs (Radial vs In-Track)
    ctx.beginPath();
    ctx.moveTo(cx, 20);
    ctx.lineTo(cx, height - 20);
    ctx.moveTo(20, cy);
    ctx.lineTo(width - 20, cy);
    ctx.stroke();

    // Axis Labels
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('+RADIAL (UP)', cx + 8, 30);
    ctx.fillText('+IN-TRACK (VELOCITY VECTOR)', width - 170, cy - 8);

    // Sentinel-X at origin (0, 0)
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.strokeRect(cx - 12, cy - 12, 24, 24);
    ctx.fillText('PRIMARY: SENTINEL-X (ORIGIN)', cx + 16, cy + 4);

    // Debris at miss-distance encounter vector (-42m radial, +165m in-track)
    const scale = 0.8; // px per meter
    const debX = cx + (165 * scale);
    const debY = cy - (-42 * scale);

    // Covariance Uncertainty Ellipse (3-Sigma)
    ctx.strokeStyle = 'rgba(255, 51, 75, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.ellipse(debX, debY, 45, 22, Math.PI / 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 51, 75, 0.15)';
    ctx.fill();

    // Debris point
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff334b';
    ctx.beginPath();
    ctx.arc(debX, debY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Miss Distance Vector line
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(debX, debY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vector Annotations
    ctx.fillStyle = '#ffd54f';
    ctx.fillText('TOTAL MISS DISTANCE: 184m (CRITICAL)', cx + 40, cy - 40);
    ctx.fillStyle = '#ff526b';
    ctx.fillText('3-SIGMA COVARIANCE ELLIPSE', debX - 40, debY + 36);
    ctx.fillStyle = '#64748b';
    ctx.fillText('FRAME: HILL (RIC: RADIAL / IN-TRACK / CROSS-TRACK)', 14, height - 12);
  }
}
