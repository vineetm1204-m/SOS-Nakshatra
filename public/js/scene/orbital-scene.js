/**
 * SOS 3D Orbital Scene Visualizer
 * Aerospace-grade interactive 3D Earth, orbit trajectories, and conjunction encounter visualizer.
 * Built with Three.js WebGL and photorealistic NASA Blue Marble Earth surface texture integration.
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
    this.earthMesh = null;
    this.earthMat = null;
    this.cloudMesh = null;
    this.satellitesGroup = null;
    this.orbitsGroup = null;
    this.maneuverGroup = null;
    this.raycaster = null;
    this.mouse = null;
    this.animationFrameId = null;
    this.isDisposed = false;
    this.showManeuverPreview = false;
    this.selectedSatId = store.getState().selectedSatelliteId || 'SAT-LEO-02';
    this.loadedTextures = [];
    this.textureStatus = 'INITIALIZING'; // 'INITIALIZING' | 'LOADING' | 'SURFACE_LOADED' | 'FALLBACK'

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
    // Deep black space background matching reference image
    this.scene.background = new THREE.Color(0x020306);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    
    // Set color management for Three.js
    if (this.renderer.outputColorSpace !== undefined && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (this.renderer.outputEncoding !== undefined && THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

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

    // Balanced Photorealistic Lighting Setup
    // 1. Soft global ambient illumination so the unlit hemisphere retains visible landmasses
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.48);
    this.scene.add(ambientLight);

    // 2. Key directional sunlight source highlighting continental topography & ocean glint
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.45);
    sunLight.position.set(50, 25, 35);
    this.scene.add(sunLight);

    // 3. Deep-space celestial fill light for realistic planetary contrast
    const deepSpaceFillLight = new THREE.DirectionalLight(0x283b52, 0.35);
    deepSpaceFillLight.position.set(-45, -15, -30);
    this.scene.add(deepSpaceFillLight);

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
    const radius = EARTH_SCENE_RADIUS; // 6.378 scene units (WGS-84 scaled to 1 unit = 1000 km)

    // 1. Earth Sphere Core (Equirectangular UV sphere with 64x64 segments for smooth curvature)
    const earthGeo = new THREE.SphereGeometry(radius, 64, 64);
    this.earthMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, // Natural surface coloration when textured
      emissive: 0x010308,
      specular: 0x223344,
      shininess: 25,
      wireframe: false
    });
    this.earthMesh = new THREE.Mesh(earthGeo, this.earthMat);
    this.earthGroup.add(this.earthMesh);

    // 2. Graticule Lines (Parallels and Meridians - subtle aesthetic overlay)
    const graticuleMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.10
    });

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
    const equatorMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.28 });
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
      opacity: 0.25
    });
    const axisLine = new THREE.Line(axisGeo, axisMat);
    axisLine.computeLineDistances();
    this.earthGroup.add(axisLine);

    // 4. Atmospheric Rayleigh Rim Glow
    const atmosGeo = new THREE.SphereGeometry(radius * 1.025, 48, 48);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x00b4d8,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    this.earthGroup.add(new THREE.Mesh(atmosGeo, atmosMat));

    // 5. Asynchronously Load High-Resolution NASA Blue Marble Earth Textures
    this.loadEarthTextures();
  }

  loadEarthTextures() {
    const THREE = this.three;
    const loader = new THREE.TextureLoader();
    this.textureStatus = 'LOADING';

    const configureTexture = (tex) => {
      if (THREE.SRGBColorSpace) {
        tex.colorSpace = THREE.SRGBColorSpace;
      } else if (THREE.sRGBEncoding) {
        tex.encoding = THREE.sRGBEncoding;
      }
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      this.loadedTextures.push(tex);
      return tex;
    };

    // 1. Primary Day Surface Texture (NASA Blue Marble 2048x1024 equirectangular)
    loader.load(
      '/assets/textures/earth-day.jpg',
      (dayTex) => {
        if (this.isDisposed || !this.earthMat) return;
        configureTexture(dayTex);
        this.earthMat.map = dayTex;
        this.earthMat.color.setHex(0xffffff); // Natural surface illumination
        this.earthMat.needsUpdate = true;
        this.textureStatus = 'SURFACE_LOADED';
        this.updateTextureStatusBadge('EARTH: PHOTOREALISTIC HD');
      },
      undefined,
      (err) => {
        console.warn('[SOS 3D Orbital Scene] earth-day.jpg texture load error; retaining procedural aerospace globe:', err);
        if (this.earthMat) {
          this.earthMat.color.setHex(0x081324);
          this.earthMat.needsUpdate = true;
        }
        this.textureStatus = 'FALLBACK';
        this.updateTextureStatusBadge('EARTH: PROCEDURAL GLOBE');
      }
    );

    // 2. Specular Water Mask (Reflective oceans, matte landmasses)
    loader.load(
      '/assets/textures/earth-specular.jpg',
      (specTex) => {
        if (this.isDisposed || !this.earthMat) return;
        this.loadedTextures.push(specTex);
        this.earthMat.specularMap = specTex;
        this.earthMat.specular.setHex(0x334455);
        this.earthMat.shininess = 30;
        this.earthMat.needsUpdate = true;
      },
      undefined,
      () => {
        // Optional specular map - silent fallback if missing
      }
    );

    // 3. Tangent Normal Map (Topographic mountain relief and ocean bathymetry)
    loader.load(
      '/assets/textures/earth-normal.jpg',
      (normTex) => {
        if (this.isDisposed || !this.earthMat) return;
        this.loadedTextures.push(normTex);
        this.earthMat.normalMap = normTex;
        this.earthMat.normalScale = new THREE.Vector2(0.85, 0.85);
        this.earthMat.needsUpdate = true;
      },
      undefined,
      () => {
        // Optional normal map - silent fallback if missing
      }
    );

    // 4. Atmospheric Cloud Layer (Drifting semi-transparent clouds at r * 1.008)
    loader.load(
      '/assets/textures/earth-clouds.png',
      (cloudTex) => {
        if (this.isDisposed || !this.earthGroup) return;
        this.loadedTextures.push(cloudTex);
        const radius = EARTH_SCENE_RADIUS;
        const cloudGeo = new THREE.SphereGeometry(radius * 1.008, 48, 48);
        const cloudMat = new THREE.MeshPhongMaterial({
          map: cloudTex,
          transparent: true,
          opacity: 0.80,
          blending: THREE.NormalBlending,
          depthWrite: false
        });
        this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        this.earthGroup.add(this.cloudMesh);
      },
      undefined,
      () => {
        // Optional cloud layer - silent fallback if missing
      }
    );
  }

  updateTextureStatusBadge(label) {
    const badge = document.getElementById('legend-earth-texture');
    if (badge) {
      badge.textContent = label;
    }
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

      // 2. Render Satellite Mesh Node
      const trueAnomaly = obj.orbit.trueAnomalyDeg || 0;
      const initialEci = obj.stateVector ? obj.stateVector.position : { x: 0, y: 0, z: 0 };
      const scenePos = transformEciToScene(initialEci.x, initialEci.y, initialEci.z);

      const satNode = this.buildSatelliteMarker(obj);
      satNode.position.set(scenePos.x, scenePos.y, scenePos.z);
      this.satellitesGroup.add(satNode);
      this.satelliteMeshes.set(obj.id, satNode);

      // Selected ring highlight
      if (obj.id === this.selectedSatId) {
        this.addSelectionRing(satNode);
      }
    }

    // 3. Render Conjunction Node Marker (if available)
    if (featuredConj) {
      this.buildConjunctionMarker(featuredConj);
    }

    // 4. Render Candidate Post-Maneuver Orbit Trajectory
    if (scenario.candidateManeuver && scenario.postManeuverProjection) {
      this.buildCandidateManeuverPath(scenario);
    }
  }

  buildSatelliteMarker(sat) {
    const THREE = this.three;
    const group = new THREE.Group();
    group.userData = { id: sat.id, name: sat.name, type: sat.objectType };

    const isProtected = sat.id === 'SAT-LEO-02';
    const isDebris = sat.objectType === 'DEBRIS';

    let color = 0x00e5ff; // Cyan
    if (isDebris) color = 0xff334b; // Red
    else if (!isProtected) color = 0x94a3b8; // Slate

    // Marker diamond/cube shape
    const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.8,
      emissive: color,
      emissiveIntensity: 0.35
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 4;
    mesh.rotation.z = Math.PI / 4;
    group.add(mesh);

    // Outer beacon pulse ring
    const ringGeo = new THREE.RingGeometry(0.5, 0.58, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    return group;
  }

  addSelectionRing(satNode) {
    const THREE = this.three;
    const ringGeo = new THREE.RingGeometry(0.85, 0.95, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'selectionRing';
    satNode.add(ring);
  }

  buildConjunctionMarker(conjunction) {
    const THREE = this.three;
    // Mark encounter TCA point along Sentinel-X orbit
    const sat1 = this.satelliteMeshes.get(conjunction.primarySatelliteId);
    if (!sat1) return;

    const markerGeo = new THREE.OctahedronGeometry(0.55, 0);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xff334b,
      wireframe: true,
      transparent: true,
      opacity: 0.9
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(sat1.position);
    this.satellitesGroup.add(marker);
  }

  buildCandidateManeuverPath(scenario) {
    const THREE = this.three;
    const primary = scenario.trackableObjects.find(o => o.id === 'SAT-LEO-02');
    if (!primary || !primary.orbit) return;

    // Projected post-burn orbit: apogee raised by along-track +V burn
    const postBurnOrbit = {
      ...primary.orbit,
      semiMajorAxisKm: primary.orbit.semiMajorAxisKm + 2.45,
      altitudeKm: primary.orbit.altitudeKm + 2.45
    };

    const points = sampleOrbitPath(postBurnOrbit, 128);
    const threePoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z));

    const geo = new THREE.BufferGeometry().setFromPoints(threePoints);
    const mat = new THREE.LineDashedMaterial({
      color: 0x00e676, // Nominal green for cleared path
      dashSize: 0.4,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.85
    });
    const postLine = new THREE.Line(geo, mat);
    postLine.computeLineDistances();
    this.maneuverGroup.add(postLine);
    this.maneuverGroup.visible = this.showManeuverPreview;
  }

  toggleManeuverPreview() {
    this.showManeuverPreview = !this.showManeuverPreview;
    if (this.maneuverGroup) {
      this.maneuverGroup.visible = this.showManeuverPreview;
    }
    return this.showManeuverPreview;
  }

  setupControls() {
    const dom = this.container;

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
      this.cameraDistance = Math.max(9.0, Math.min(48.0, this.cameraDistance + e.deltaY * 0.02));
      this.updateCameraPosition();
    }, { passive: false });
  }

  setupRaycasting() {
    const THREE = this.three;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.container.addEventListener('click', (e) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const interactiveMeshes = [];
      this.satelliteMeshes.forEach(group => {
        interactiveMeshes.push(...group.children);
      });

      const intersects = this.raycaster.intersectObjects(interactiveMeshes);
      if (intersects.length > 0) {
        const parentGroup = intersects[0].object.parent;
        if (parentGroup && parentGroup.userData?.id) {
          store.selectSatellite(parentGroup.userData.id);
        }
      }
    });
  }

  updateCameraPosition() {
    if (!this.camera) return;
    const r = this.cameraDistance;
    const phi = this.currentRotation.x;
    const theta = this.currentRotation.y;

    this.camera.position.x = r * Math.cos(phi) * Math.sin(theta);
    this.camera.position.y = r * Math.sin(phi);
    this.camera.position.z = r * Math.cos(phi) * Math.cos(theta);
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

      // Slow realistic axial rotation of the Earth and graticule
      if (this.earthGroup) {
        this.earthGroup.rotation.y += 0.00035;
      }

      // Dynamic differential atmospheric cloud drift
      if (this.cloudMesh) {
        this.cloudMesh.rotation.y += 0.0005;
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
    // Dispose loaded textures
    if (this.loadedTextures) {
      this.loadedTextures.forEach(t => {
        try { t.dispose(); } catch {}
      });
      this.loadedTextures = [];
    }
    // Dispose materials and geometry
    if (this.earthMat) {
      try { this.earthMat.dispose(); } catch {}
    }
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
