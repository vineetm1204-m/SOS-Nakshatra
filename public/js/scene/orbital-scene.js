/**
 * SOS 3D Orbital Scene Visualizer
 * Aerospace-grade interactive 3D Earth, orbit trajectories, and conjunction encounter visualizer.
 * Built with Three.js WebGL and graceful 2D Canvas fallback.
 */

import { 
  EARTH_RADIUS_KM, 
  EARTH_SCENE_RADIUS, 
  transformEciToScene, 
  sampleOrbitPath 
} from './coordinates.js';
import { store } from '../state.js';

export class OrbitalSceneVisualizer {
  constructor(containerEl, fallbackEl) {
    this.container = containerEl;
    this.fallbackEl = fallbackEl;
    this.three = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.earthGroup = null;
    this.satellitesGroup = null;
    this.orbitsGroup = null;
    this.maneuverGroup = null;
    this.raycaster = null;
    this.mouse = null;
    this.animationFrameId = null;
    this.isDisposed = false;
    this.showManeuverPreview = false;
    this.selectedSatId = store.getState().selectedSatelliteId || 'SAT-LEO-02';

    // Camera control drag state
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.cameraDistance = 24.0;
    this.targetRotation = { x: 0.35, y: -0.6 };
    this.currentRotation = { x: 0.35, y: -0.6 };

    // Satellites tracking list for raycasting and selection
    this.satelliteMeshes = new Map();

    this.init();
  }

  async init() {
    try {
      // Dynamically import Three.js with offline/network resilience
      const THREE = await this.loadThreeJs();
      if (!THREE || !this.isWebGLAvailable()) {
        throw new Error('WebGL or 3D graphics hardware acceleration unavailable.');
      }
      this.three = THREE;
      this.setupScene();
      this.buildEarth();
      this.setupControls();
      this.setupRaycasting();
      this.startRenderLoop();
      this.subscribeState();
    } catch (err) {
      console.warn('[SOS 3D Orbital Scene] Fallback activated:', err.message);
      this.activateFallback(err.message);
    }
  }

  async loadThreeJs() {
    try {
      // Primary: Modern modular Three.js from fast CDN
      const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
      return mod;
    } catch {
      try {
        // Secondary CDN fallback
        const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js');
        return mod;
      } catch (e) {
        throw new Error('Failed to load Three.js graphics engine.');
      }
    }
  }

  isWebGLAvailable() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch {
      return false;
    }
  }

  setupScene() {
    const THREE = this.three;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060a);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.container.appendChild(this.renderer.domElement);

    // Coordinate Groups
    this.earthGroup = new THREE.Group();
    this.orbitsGroup = new THREE.Group();
    this.satellitesGroup = new THREE.Group();
    this.maneuverGroup = new THREE.Group();

    this.scene.add(this.earthGroup);
    this.scene.add(this.orbitsGroup);
    this.scene.add(this.satellitesGroup);
    this.scene.add(this.maneuverGroup);

    // Subtle Aerospace Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(50, 20, 30);
    this.scene.add(sunLight);

    // Window Resize Handler
    this.onResize = () => {
      if (!this.container || !this.renderer || !this.camera) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);
  }

  buildEarth() {
    const THREE = this.three;
    const radius = EARTH_SCENE_RADIUS; // 6.378 scene units

    // 1. Earth Sphere Core (Deep ocean navy)
    const earthGeo = new THREE.SphereGeometry(radius, 48, 48);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x081324,
      emissive: 0x030812,
      specular: 0x182a44,
      shininess: 12,
      wireframe: false
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.earthGroup.add(earthMesh);

    // 2. Graticule Lines (Parallels and Meridians)
    const graticuleMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.18
    });

    // Latitude rings (-60° to +60°)
    for (let lat = -60; lat <= 60; lat += 30) {
      const latRad = (lat * Math.PI) / 180;
      const ringRadius = radius * Math.cos(latRad);
      const ringY = radius * Math.sin(latRad);

      const circlePts = [];
      for (let theta = 0; theta <= Math.PI * 2; theta += Math.PI / 32) {
        circlePts.push(new THREE.Vector3(ringRadius * Math.cos(theta), ringY, ringRadius * Math.sin(theta)));
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
      const ringMesh = new THREE.Line(ringGeo, graticuleMat);
      this.earthGroup.add(ringMesh);
    }

    // Equator highlight (Thicker cyan)
    const equatorPts = [];
    for (let theta = 0; theta <= Math.PI * 2; theta += Math.PI / 32) {
      equatorPts.push(new THREE.Vector3(radius * Math.cos(theta), 0, radius * Math.sin(theta)));
    }
    const equatorGeo = new THREE.BufferGeometry().setFromPoints(equatorPts);
    const equatorMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45 });
    this.earthGroup.add(new THREE.Line(equatorGeo, equatorMat));

    // 3. Polar Axis Indicator
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -radius * 1.35, 0),
      new THREE.Vector3(0, radius * 1.35, 0)
    ]);
    const axisMat = new THREE.LineDashedMaterial({
      color: 0x00e5ff,
      dashSize: 0.4,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.35
    });
    const axisLine = new THREE.Line(axisGeo, axisMat);
    axisLine.computeLineDistances();
    this.earthGroup.add(axisLine);

    // 4. Atmospheric Rim Glow
    const atmosGeo = new THREE.SphereGeometry(radius * 1.025, 32, 32);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide
    });
    this.earthGroup.add(new THREE.Mesh(atmosGeo, atmosMat));
  }

  loadScenarioData(scenario) {
    if (!this.three || !this.scene) return;
    const THREE = this.three;

    // Clear existing orbits and satellites
    while (this.orbitsGroup.children.length > 0) {
      this.orbitsGroup.remove(this.orbitsGroup.children[0]);
    }
    while (this.satellitesGroup.children.length > 0) {
      this.satellitesGroup.remove(this.satellitesGroup.children[0]);
    }
    while (this.maneuverGroup.children.length > 0) {
      this.maneuverGroup.remove(this.maneuverGroup.children[0]);
    }
    this.satelliteMeshes.clear();

    const objects = scenario.trackableObjects || [];
    const featuredConj = scenario.featuredConjunction;

    // 1. Render Orbit Trajectories
    for (const obj of objects) {
      if (!obj.orbit) continue;

      const isThreatSat = obj.id === 'SAT-LEO-02';
      const isDebris = obj.objectType === 'DEBRIS';

      let orbitColor = 0x2e3b4e; // Neutral slate
      let opacity = 0.45;
      if (isThreatSat) {
        orbitColor = 0x00e5ff; // Cyan for protected asset
        opacity = 0.85;
      } else if (isDebris) {
        orbitColor = 0xff334b; // Red for collision debris
        opacity = 0.75;
      }

      const points = sampleOrbitPath(obj.orbit, 128);
      const threePoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z));

      const orbitGeo = new THREE.BufferGeometry().setFromPoints(threePoints);
      const orbitMat = new THREE.LineBasicMaterial({
        color: orbitColor,
        transparent: true,
        opacity: opacity
      });
      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      this.orbitsGroup.add(orbitLine);

      // 2. Render Spacecraft / Debris Markers
      const initialPos = transformEciToScene(
        obj.stateVector.positionVectorKm.x,
        obj.stateVector.positionVectorKm.y,
        obj.stateVector.positionVectorKm.z
      );

      const markerColor = isThreatSat ? 0x00e5ff : (isDebris ? 0xff334b : (obj.operationalStatus === 'DEGRADED' ? 0xffb300 : 0x00e676));
      const markerSize = isThreatSat ? 0.32 : 0.22;

      const markerGeo = new THREE.OctahedronGeometry(markerSize);
      const markerMat = new THREE.MeshBasicMaterial({ color: markerColor });
      const markerMesh = new THREE.Mesh(markerGeo, markerMat);
      markerMesh.position.set(initialPos.x, initialPos.y, initialPos.z);
      markerMesh.userData = { id: obj.id, name: obj.name, isThreat: isThreatSat };

      this.satellitesGroup.add(markerMesh);
      this.satelliteMeshes.set(obj.id, markerMesh);

      // Add selection ring if selected
      if (obj.id === this.selectedSatId) {
        this.addSelectionRing(markerMesh);
      }
    }

    // 3. Render Conjunction Node Marker & Relative Vector
    if (featuredConj) {
      this.renderConjunctionNode(featuredConj);
    }

    // 4. Render Post-Maneuver Candidate Trajectory (Toggleable)
    if (scenario.candidateManeuver) {
      this.renderCandidatePostManeuverOrbit(scenario);
    }
  }

  renderConjunctionNode(conj) {
    const THREE = this.three;
    // TCA Intersection Node Marker
    const sentinelMesh = this.satelliteMeshes.get('SAT-LEO-02');
    const debrisMesh = this.satelliteMeshes.get('DEB-1993-024CZ');

    if (sentinelMesh && debrisMesh) {
      // Connect with encounter vector line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        sentinelMesh.position,
        debrisMesh.position
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xffd54f,
        dashSize: 0.15,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.95
      });
      const relativeLine = new THREE.Line(lineGeo, lineMat);
      relativeLine.computeLineDistances();
      this.orbitsGroup.add(relativeLine);

      // Warning sphere at encounter midpoint
      const mid = new THREE.Vector3().addVectors(sentinelMesh.position, debrisMesh.position).multiplyScalar(0.5);
      const nodeGeo = new THREE.RingGeometry(0.3, 0.45, 16);
      const nodeMat = new THREE.MeshBasicMaterial({ color: 0xff334b, side: THREE.DoubleSide });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.copy(mid);
      nodeMesh.lookAt(this.camera.position);
      this.orbitsGroup.add(nodeMesh);
    }
  }

  renderCandidatePostManeuverOrbit(scenario) {
    const THREE = this.three;
    const sentinel = scenario.trackableObjects.find(o => o.id === 'SAT-LEO-02');
    if (!sentinel || !sentinel.orbit) return;

    // Post-burn orbit has slightly higher semi-major axis (+1.2 km altitude boost)
    const postOrbit = {
      ...sentinel.orbit,
      semiMajorAxisKm: sentinel.orbit.semiMajorAxisKm + 1.25,
      altitudeKm: sentinel.orbit.altitudeKm + 1.25
    };

    const points = sampleOrbitPath(postOrbit, 128);
    const threePoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z));

    const geo = new THREE.BufferGeometry().setFromPoints(threePoints);
    const mat = new THREE.LineDashedMaterial({
      color: 0x00e676, // Bright green for cleared post-burn orbit
      dashSize: 0.25,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.9
    });
    const postLine = new THREE.Line(geo, mat);
    postLine.computeLineDistances();
    postLine.name = 'postManeuverOrbitLine';
    postLine.visible = this.showManeuverPreview;

    this.maneuverGroup.add(postLine);
  }

  toggleManeuverPreview(show) {
    this.showManeuverPreview = typeof show === 'boolean' ? show : !this.showManeuverPreview;
    const line = this.maneuverGroup.getObjectByName('postManeuverOrbitLine');
    if (line) {
      line.visible = this.showManeuverPreview;
    }
    return this.showManeuverPreview;
  }

  addSelectionRing(mesh) {
    const THREE = this.three;
    const ringGeo = new THREE.RingGeometry(0.48, 0.58, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.name = 'selectionRing';
    ringMesh.lookAt(this.camera.position);
    mesh.add(ringMesh);
  }

  setupControls() {
    const dom = this.renderer.domElement;

    dom.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    dom.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      this.targetRotation.y += deltaX * 0.005;
      this.targetRotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.targetRotation.x + deltaY * 0.005));

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(9.0, Math.min(80.0, this.cameraDistance + e.deltaY * 0.02));
      this.updateCameraPosition();
    }, { passive: false });
  }

  setupRaycasting() {
    const THREE = this.three;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.renderer.domElement.addEventListener('click', (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.satellitesGroup.children);

      if (intersects.length > 0) {
        const satId = intersects[0].object.userData?.id;
        if (satId) {
          store.setSelectedSatellite(satId);
        }
      }
    });
  }

  updateCameraPosition() {
    const x = this.cameraDistance * Math.cos(this.currentRotation.x) * Math.sin(this.currentRotation.y);
    const y = this.cameraDistance * Math.sin(this.currentRotation.x);
    const z = this.cameraDistance * Math.cos(this.currentRotation.x) * Math.cos(this.currentRotation.y);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  resetCamera() {
    this.targetRotation = { x: 0.35, y: -0.6 };
    this.cameraDistance = 24.0;
  }

  focusSatellite(satId) {
    const mesh = this.satelliteMeshes.get(satId);
    if (!mesh) return;
    this.cameraDistance = 14.0;
    this.targetRotation.y = Math.atan2(mesh.position.x, mesh.position.z);
    this.targetRotation.x = Math.asin(mesh.position.y / mesh.position.length());
  }

  subscribeState() {
    this.unsubscribe = store.subscribe((event, payload) => {
      if (event === 'satelliteChanged') {
        this.selectedSatId = payload;
        // Update selection rings
        this.satelliteMeshes.forEach((mesh, id) => {
          const oldRing = mesh.getObjectByName('selectionRing');
          if (oldRing) mesh.remove(oldRing);
          if (id === payload) {
            this.addSelectionRing(mesh);
          }
        });
      }
    });
  }

  startRenderLoop() {
    const animate = () => {
      if (this.isDisposed) return;

      // Smooth camera interpolation
      this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.08;
      this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.08;
      this.updateCameraPosition();

      // Slow realistic axial rotation of the Earth graticule
      if (this.earthGroup) {
        this.earthGroup.rotation.y += 0.0004;
      }

      // Rotate selection rings to face camera
      this.satelliteMeshes.forEach(mesh => {
        const ring = mesh.getObjectByName('selectionRing');
        if (ring) ring.lookAt(this.camera.position);
      });

      this.renderer.render(this.scene, this.camera);
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  activateFallback(message) {
    if (this.fallbackEl) {
      this.fallbackEl.style.display = 'flex';
      this.fallbackEl.innerHTML = `
        <div class="state-container">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-critical)" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div class="state-title" style="margin-top: 10px;">WebGL 3D Rendering Fallback Active</div>
          <div class="state-desc">${message || '3D hardware graphics acceleration unavailable.'}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 6px;">2D Tactical Hill/CW Canvas remains operational.</div>
        </div>
      `;
    }
  }

  destroy() {
    this.isDisposed = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
    }
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
