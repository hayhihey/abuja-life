// ============================================================================
// ABUJA LIFE — THREE.JS 3D OPEN-WORLD ENGINE (GTA FCT EDITION)
// ============================================================================
// Renders an interactive 3D Abuja Federal Capital Territory with:
// - 13 Districts mapped from src/data/world.js coordinates (d.x, d.y)
// - Iconic Landmarks: Aso Rock, National Mosque (Golden Dome + 4 Minarets),
//   NNPC Quad Towers, CBN Tower with spinning ₦ emblem, National Christian
//   Centre Spire, Abuja City Gate, Jabi Lake + Boats, Wuse 2 Neon Strip,
//   Mpape Quarry Lake, and Kubwa-CBD Metro Train.
// - Third-Person GTA Camera + WASD / Arrow / Touch Driving & Walking
// - GTA V Sky-Cam Satellite Swoop on District Commutes
// - Live 3D Multiplayer Avatars, Speech Bubbles & Naira Cash Rain
// ============================================================================

import * as THREE from 'three';
import { DISTRICTS, DISTRICT_BY_ID, EDGES } from '/src/data/world.js';
import {
  WeightedAStarRouter,
  SpatialHashGrid,
  OBBCollisionSolver,
  SteeringAgentController,
  ProceduralUrbanPlanner,
  LODBatchManager,
  AckermannPacejkaVehiclePhysics,
  SpringArmCameraController,
  HermiteNetworkInterpolator
} from '/engine-algorithms.js';

const WORLD_SCALE = 14; // Maps 0..100 -> -700..+700 units

export function map2DTo3D(x, y) {
  return {
    x: (x - 50) * WORLD_SCALE,
    z: (y - 50) * WORLD_SCALE
  };
}

export function map3DTo2D(wx, wz) {
  return {
    x: (wx / WORLD_SCALE) + 50,
    y: (wz / WORLD_SCALE) + 50
  };
}

export class AbujaWorld3D {
  constructor(containerEl, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks; // { onEnterDistrict(id), onSelectPlayer(player), onSelectDistrict(id), onStreetPunch(info) }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0xc8dff0, 0.00024);

    this.camera = new THREE.PerspectiveCamera(
      50,
      Math.max(1, containerEl.clientWidth) / Math.max(1, containerEl.clientHeight),
      0.5,
      1800
    );

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: false
      });
      this.webglAvailable = true;
    } catch (err) {
      console.warn('WebGL initialization failed, falling back to 2D tactical mode:', err);
      this.webglAvailable = false;
      this.container.innerHTML = `
        <div class="webgl-fallback-card">
          <div class="wfc-badge">🇳🇬 2D TACTICAL SIMULATION</div>
          <h3>WebGL Graphics Acceleration Unavailable</h3>
          <p>WebGL hardware rendering is unavailable or disabled in this browser. Abuja Life has seamlessly initialized in 2D Tactical Simulation Mode with all careers, economy, commute, and actions fully playable.</p>
        </div>
      `;
      throw err;
    }
    this._canvasW = Math.max(1, containerEl.clientWidth);
    this._canvasH = Math.max(1, containerEl.clientHeight);
    this.renderer.setSize(this._canvasW, this._canvasH);
    const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    this.isMobileDevice = isMobileDevice;
    this.maxAniso = Math.min(8, this.renderer.capabilities?.getMaxAnisotropy?.() || 4);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.25 : 1.6));
    // Graphics Fix #2: Soft PCF Shadows instead of jagged BasicShadowMap
    this.renderer.shadowMap.enabled = !isMobileDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // PBR tone mapping & color space for GTA-quality visuals
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Context loss resilience
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost - pausing render loop until restored.');
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored - restarting render loop.');
      this.animFrameId = requestAnimationFrame(this._animate);
    });

    // Clear container and mount canvas + 3D HTML overlay layer
    this.container.innerHTML = '';
    this.renderer.domElement.className = 'world3d-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'world3d-labels';
    this.container.appendChild(this.labelLayer);

    // State (High-precision performance timer replacing deprecated THREE.Clock)
    this.lastTime = performance.now();
    this.elapsedTime = 0;
    this.currentDistrictId = 'cbd';
    this._canvasW = Math.max(1, containerEl.clientWidth);
    this._canvasH = Math.max(1, containerEl.clientHeight);
    this._labelThrottle = 0;
    this._distVisThrottle = 0;
    this.weather = 'sunny';
    this.hourOfDay = 13;
    this.cameraMode = 'chase';
    this.cameraYaw = 0.25;
    this.cameraPitch = 0.38;
    this.cameraDistance = 18.5;
    this.isPointerDragging = false;
    this.lastPointer = { x: 0, y: 0 };

    // Shared procedural texture & material caches for ultra-fast loading
    this._duplexWallMatCache = new Map();
    this._duplexRoofMatCache = new Map();
    this._labelCache = new Map();
    this._cutawayRoofMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.45,
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    });

    // Core Algorithm Engines (#1, #2, #3, #7, #8, #9, #10)
    this.router = new WeightedAStarRouter(DISTRICT_BY_ID, EDGES, WORLD_SCALE);
    this.spatialGrid = new SpatialHashGrid(36);
    this.obbSolver = new OBBCollisionSolver(this.spatialGrid);
    this.lodBatcher = new LODBatchManager(THREE);
    this.vehiclePhysics = new AckermannPacejkaVehiclePhysics();
    this.springCamera = new SpringArmCameraController(13.5);
    this.netInterp = new HermiteNetworkInterpolator(0.28);

    // Player 3D controller state (starts on foot in 3rd-person Nigeria GTA style)
    const startD = DISTRICT_BY_ID.cbd || DISTRICTS[0];
    const startPos = map2DTo3D(startD.x, startD.y);
    this.playerPos = new THREE.Vector3(startPos.x, 0, startPos.z + 10);
    this.playerHeading = Math.PI;
    this.playerSpeed = 0;
    this.playerVel = { x: 0, z: 0 };
    this.inVehicle = false;
    this.walkCycle = 0;
    this.punchTimer = 0;
    this.keys = { w: false, a: false, s: false, d: false, shift: false, handbrake: false };
    this.touchVector = { x: 0, y: 0 };

    // Instantly orient camera to player on startup so viewport is never blank
    const initHoriz = Math.cos(this.cameraPitch) * this.cameraDistance;
    const initVert = Math.sin(this.cameraPitch) * this.cameraDistance;
    this.camera.position.set(
      this.playerPos.x + Math.sin(this.cameraYaw) * initHoriz,
      Math.max(4.5, initVert + 2.0),
      this.playerPos.z + Math.cos(this.cameraYaw) * initHoriz
    );
    this.camera.lookAt(this.playerPos.x, 2.5, this.playerPos.z);

    // GTA Sky-Cam transition state
    this.skyCam = {
      active: false,
      elapsed: 0,
      duration: 2.2,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      targetDistrict: null
    };

    // Collections
    this.districtNodes = new Map();
    this.districtLabels = new Map();
    this.trafficCars = [];
    this.streetPedestrians = [];
    this.remotePlayers = new Map();
    this.nairaParticles = [];
    this.spinningMeshes = [];
    this.axleSpinningMeshes = [];
    this.windowMaterials = [];
    this.streetLightBulbs = [];
    this.streetLightPools = [];
    this.swayingTrees = [];
    this.roadPuddles = [];
    this.streetVendors = [];
    this.pursuitUnits = [];
    this.skidDecals = [];
    this.neonPulses = [];
    this.placedGridMeshes = [];
    this.gpsPathPoints = [];
    this.waterNormalMaps = [];
    this.allInteriorGroups = [];
    this.playerHeadlightBeams = [];
    this.rainSplashes = [];
    this.wantedStars = 0;
    this.gridPowerOnline = true;
    this.playerGenActive = false;
    this.driftSlip = 0;
    this.ragdollState = { active: false, timer: 0, vx: 0, vy: 0, vz: 0 };
    this.smartActionState = null;
    this.autoCabRide = null;
    this.buildGridMode = { active: false, group: null, ghost: null, tile: null, itemSpec: null, rotY: 0, snapX: 0, snapZ: 0 };
    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();
    this.collisionBoxes = [];

    // Shared procedural textures (Fixes #3, #9, #16, #44)
    this._contactShadowTex = this._createContactShadowTex();
    this._glowSpriteTex = this._createGlowSpriteTex();
    this._dustSpriteTex = this._createDustSpriteTex();

    // Graphics Fixes #1, #27, #28, #43: Real PMREM IBL, 360° Sky Dome + Clouds/Stars, Pooled Particles
    this._initEnvironmentIBL();
    this._initSkyDomeAndClouds();
    this._initLights();
    this._initParticlePool();
    this._buildTerrainAndWater();
    this._buildAsoRockAndHills();
    this._buildRoadNetwork();
    this._buildDistrictsAndSkyline();
    this._buildIconicLandmarks();
    this._buildStreetVendors();
    this._buildWuse2NightlifeNeons();
    this._initWeatherParticles();
    this._initGPSRouteRibbon();
    this._buildTrafficSwarm();
    this._buildStreetPedestrians();
    this._buildLocalPlayerRig();
    this.lodBatcher.commitBatches(this.scene); // Algorithm #7 + Fix #41: Commit InstancedMesh GPU batches!
    this._bindInputs();

    this._animate = this._animate.bind(this);
    this.animFrameId = requestAnimationFrame(this._animate);
  }

  // ── Algorithm #2 & #3: Spatial Hash + SAT Oriented Bounding Box (OBB) + Swept CCD ──
  _addCollisionBox(x, z, width, depth, label = 'building', rotY = 0, height = 14) {
    const obb = this.obbSolver.addOBB(x, z, width, depth, rotY, label, height);
    this.collisionBoxes.push(obb);
    return obb;
  }

  _resolveCollisions(pos, radius = 2.4, prevX = null, prevZ = null) {
    const px = prevX !== null ? prevX : this.playerPos.x;
    const pz = prevZ !== null ? prevZ : this.playerPos.z;
    const res = this.obbSolver.resolveSweptCircle(px, pz, pos, radius);
    return res.hit;
  }

  // Graphics Fix #43: Zero-Allocation Object-Pooled InstancedMesh Particle System
  _initParticlePool() {
    const MAX_PUFFS = 180;
    const puffGeo = new THREE.IcosahedronGeometry(0.32, 1);
    const puffMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });
    const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, MAX_PUFFS);
    puffMesh.frustumCulled = false;
    puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(puffMesh);

    const MAX_NOTES = 90;
    const noteGeo = new THREE.PlaneGeometry(3.0, 1.45);
    const noteMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const noteMesh = new THREE.InstancedMesh(noteGeo, noteMat, MAX_NOTES);
    noteMesh.frustumCulled = false;
    noteMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(noteMesh);

    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(0xffffff);
    const puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      puffMesh.setMatrixAt(i, zeroMat);
      puffMesh.setColorAt(i, white);
      puffs.push({ active: false, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, scale: 1, grow: 0, life: 0, maxLife: 1 });
    }
    const notes = [];
    for (let i = 0; i < MAX_NOTES; i++) {
      noteMesh.setMatrixAt(i, zeroMat);
      noteMesh.setColorAt(i, white);
      notes.push({ active: false, x: 0, y: -99, z: 0, vy: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0, life: 0 });
    }
    puffMesh.instanceMatrix.needsUpdate = true;
    noteMesh.instanceMatrix.needsUpdate = true;

    this._particlePool = {
      puffMesh,
      puffs,
      puffCursor: 0,
      noteMesh,
      notes,
      noteCursor: 0,
      dummy: new THREE.Object3D(),
      tmpColor: new THREE.Color()
    };
  }

  _emitPooledPuff({ x, y, z, vx = 0, vy = 1.4, vz = 0, scale = 1.0, grow = 0.8, life = 0.6, color = 0xf1f5f9 }) {
    if (this.lowPowerMode || !this._particlePool) return;
    const pool = this._particlePool;
    const idx = pool.puffCursor;
    pool.puffCursor = (pool.puffCursor + 1) % pool.puffs.length;
    const p = pool.puffs[idx];
    p.active = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.scale = scale; p.grow = grow;
    p.life = life; p.maxLife = life;
    pool.tmpColor.setHex(color);
    pool.puffMesh.setColorAt(idx, pool.tmpColor);
    if (pool.puffMesh.instanceColor) pool.puffMesh.instanceColor.needsUpdate = true;
  }

  _updateParticlePool(dt) {
    if (!this._particlePool) return;
    const pool = this._particlePool;
    const d = pool.dummy;
    let puffDirty = false;
    for (let i = 0; i < pool.puffs.length; i++) {
      const p = pool.puffs[i];
      if (!p.active) continue;
      puffDirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        d.position.set(0, -100, 0);
        d.scale.set(0, 0, 0);
        d.updateMatrix();
        pool.puffMesh.setMatrixAt(i, d.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const ratio = p.life / Math.max(0.05, p.maxLife);
      const s = p.scale * (1 + (1 - ratio) * p.grow) * Math.min(1, ratio * 2.2);
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(Math.max(0.001, s));
      d.updateMatrix();
      pool.puffMesh.setMatrixAt(i, d.matrix);
    }
    if (puffDirty) pool.puffMesh.instanceMatrix.needsUpdate = true;

    let noteDirty = false;
    for (let i = 0; i < pool.notes.length; i++) {
      const n = pool.notes[i];
      if (!n.active) continue;
      noteDirty = true;
      n.life -= dt;
      if (n.life <= 0 || n.y <= 0.35) {
        n.active = false;
        d.position.set(0, -100, 0);
        d.scale.set(0, 0, 0);
        d.updateMatrix();
        pool.noteMesh.setMatrixAt(i, d.matrix);
        continue;
      }
      n.y -= n.vy * dt;
      n.ax += n.rx * dt;
      n.az += n.rz * dt;
      d.position.set(n.x, n.y, n.z);
      d.rotation.set(n.ax, n.ay, n.az);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      pool.noteMesh.setMatrixAt(i, d.matrix);
    }
    if (noteDirty) pool.noteMesh.instanceMatrix.needsUpdate = true;
  }

  _spawnCollisionSparks(x, z) {
    if (this.lowPowerMode) return;
    for (let i = 0; i < 8; i++) {
      this._emitPooledPuff({
        x: x + (Math.random() - 0.5) * 1.8,
        y: 0.9 + Math.random() * 0.9,
        z: z + (Math.random() - 0.5) * 1.8,
        vx: (Math.random() - 0.5) * 9,
        vy: 3.5 + Math.random() * 3.5,
        vz: (Math.random() - 0.5) * 9,
        scale: 0.45,
        grow: 0.2,
        life: 0.36,
        color: Math.random() > 0.4 ? 0xfacc15 : 0xf97316
      });
    }
  }

  _triggerScreenShake(intensity = 0.5) {
    this._screenShakeIntensity = Math.min(1.5, (this._screenShakeIntensity || 0) + intensity);
  }

  // ── Graphics Fix #1: Real PMREM IBL Environment Map for Metallic & Glass PBR Reflections ──
  _initEnvironmentIBL() {
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(
        new THREE.SphereGeometry(40, 16, 12),
        new THREE.MeshBasicMaterial({
          side: THREE.BackSide,
          map: this._makeCanvasTex(256, 128, (ctx, W, H) => {
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0.0, '#1e40af');
            g.addColorStop(0.35, '#60a5fa');
            g.addColorStop(0.49, '#fde68a');
            g.addColorStop(0.51, '#b45309');
            g.addColorStop(0.7, '#4d7c0f');
            g.addColorStop(1.0, '#334155');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
            // Bright sun reflection hotspot for crisp metallic speculars
            ctx.fillStyle = '#fffbeb';
            ctx.beginPath();
            ctx.arc(W * 0.72, H * 0.34, 12, 0, Math.PI * 2);
            ctx.fill();
          })
        })
      );
      envScene.add(envSky);
      const rt = pmrem.fromScene(envScene, 0.04);
      this.scene.environment = rt.texture;
      this._envRenderTarget = rt;
      envSky.geometry.dispose();
      envSky.material.map?.dispose();
      envSky.material.dispose();
      pmrem.dispose();
    } catch (err) {
      console.warn('PMREM IBL skipped:', err);
    }
  }

  // ── Graphics Fix #27 & #28: 360° Procedural Sky Dome Shader + Sun/Moon + Clouds + Night Stars ──
  _initSkyDomeAndClouds() {
    this._skyUniforms = {
      uZenith: { value: new THREE.Color(0x1a3a6b) },
      uMidSky: { value: new THREE.Color(0x5da8d8) },
      uHorizon: { value: new THREE.Color(0xf0d8b0) },
      uGround: { value: new THREE.Color(0x6b4f2a) },
      uSunDir: { value: new THREE.Vector3(0.45, 0.72, 0.25).normalize() },
      uSunColor: { value: new THREE.Color(0xfff5d0) }
    };

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this._skyUniforms,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uMidSky;
        uniform vec3 uHorizon;
        uniform vec3 uGround;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vWorldDir;
        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = dir.y;
          vec3 col = h >= 0.0
            ? mix(uHorizon, mix(uMidSky, uZenith, pow(clamp(h, 0.0, 1.0), 0.55)), smoothstep(0.0, 0.45, h))
            : mix(uHorizon, uGround, smoothstep(0.0, -0.25, h));
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sunDot, 18.0) * 0.45;
          col += uSunColor * smoothstep(0.9965, 0.9992, sunDot) * 1.4;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(1320, 24, 16), skyMat);
    this.scene.add(this.skyDome);

    // Night Stars dome
    const starCount = 320;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const r = 1220;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xf8fafc, size: 5.5, transparent: true, opacity: 0.0, fog: false, depthWrite: false })
    );
    this.scene.add(this.starField);

    // Drifting Tropical Cumulus Cloud Layer
    const cloudTex = this._makeCanvasTex(128, 64, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      for (const [cx, cy, r] of [[38, 36, 22], [62, 28, 28], [88, 36, 22], [64, 40, 24]]) {
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    this.cloudGroup = new THREE.Group();
    const cloudGeo = new THREE.PlaneGeometry(160, 75);
    cloudGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(cloudGeo, cloudMat);
      const ang = (i / 14) * Math.PI * 2;
      const dist = 240 + (i % 3) * 210;
      c.position.set(Math.cos(ang) * dist, 240 + (i % 4) * 35, Math.sin(ang) * dist);
      c.scale.setScalar(0.85 + (i % 3) * 0.45);
      this.cloudGroup.add(c);
    }
    this.scene.add(this.cloudGroup);
  }

  // ── Procedural Texture Helpers & PBR Bump/Normal Generators (Fixes #3, #9, #23, #24, #44) ──
  _makeCanvasTex(w, h, drawFn, { repeatX = 1, repeatY = 1, aniso = false, srgb = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    if (repeatX > 1 || repeatY > 1) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    if (aniso && this.maxAniso) tex.anisotropy = this.maxAniso;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Graphics Fix #23: Converts a procedural grayscale height canvas into a Sobel tangent-space Normal Map.
   */
  _makeNormalMap(size, drawHeightFn, strength = 2.4, repeatX = 1, repeatY = 1) {
    const src = document.createElement('canvas');
    src.width = size;
    src.height = size;
    const sctx = src.getContext('2d');
    drawHeightFn(sctx, size, size);
    const sData = sctx.getImageData(0, 0, size, size).data;

    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const octx = out.getContext('2d');
    const oImg = octx.createImageData(size, size);
    const oData = oImg.data;

    const sample = (x, y) => {
      const wx = ((x % size) + size) % size;
      const wy = ((y % size) + size) % size;
      return sData[(wy * size + wx) * 4] / 255;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tl = sample(x - 1, y - 1), t = sample(x, y - 1), tr = sample(x + 1, y - 1);
        const l = sample(x - 1, y), r = sample(x + 1, y);
        const bl = sample(x - 1, y + 1), b = sample(x, y + 1), br = sample(x + 1, y + 1);
        const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
        const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
        let nx = -dX * strength;
        let ny = -dY * strength;
        let nz = 1.0;
        const inv = 1 / Math.hypot(nx, ny, nz);
        nx *= inv; ny *= inv; nz *= inv;
        const idx = (y * size + x) * 4;
        oData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        oData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        oData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        oData[idx + 3] = 255;
      }
    }
    octx.putImageData(oImg, 0, 0);
    const tex = new THREE.CanvasTexture(out);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    if (this.maxAniso) tex.anisotropy = this.maxAniso;
    tex.needsUpdate = true;
    return tex;
  }

  _createContactShadowTex() {
    return this._makeCanvasTex(64, 64, (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
      g.addColorStop(0.0, 'rgba(2, 6, 23, 0.72)');
      g.addColorStop(0.65, 'rgba(2, 6, 23, 0.34)');
      g.addColorStop(1.0, 'rgba(2, 6, 23, 0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }

  _createGlowSpriteTex() {
    return this._makeCanvasTex(64, 64, (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
      g.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
      g.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
      g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }

  _createDustSpriteTex() {
    return this._makeCanvasTex(32, 32, (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W / 2);
      g.addColorStop(0.0, 'rgba(253, 230, 138, 0.9)');
      g.addColorStop(0.6, 'rgba(251, 191, 36, 0.35)');
      g.addColorStop(1.0, 'rgba(251, 191, 36, 0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }

  /**
   * Procedural African fabric textures (Ankara African wax prints & metallic Brocade jacquard)
   */
  _createFabricTexture(pattern, primaryHex = 0x1e3a8a, accentHex = 0xfacc15) {
    const toHexStr = (c) => '#' + ('000000' + Number(c).toString(16)).slice(-6);
    const pCol = toHexStr(primaryHex);
    const aCol = toHexStr(accentHex);

    return this._makeCanvasTex(128, 128, (ctx, W, H) => {
      ctx.fillStyle = pCol;
      ctx.fillRect(0, 0, W, H);

      if (pattern === 'ankara') {
        ctx.fillStyle = aCol;
        for (let x = 16; x < W; x += 32) {
          for (let y = 16; y < H; y += 32) {
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x - 11, y - 11, 22, 22);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
            ctx.fillStyle = aCol;
          }
        }
      } else if (pattern === 'brocade' || pattern === 'senator') {
        ctx.fillStyle = aCol;
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < W; i += 16) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 8, H / 2);
          ctx.lineTo(i, H);
          ctx.lineTo(i - 8, H / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }
    });
  }

  _initLights() {
    this.ambientLight = new THREE.HemisphereLight(0x87ceeb, 0x4a7c40, 0.92);
    this.scene.add(this.ambientLight);

    // Main sun — dynamically positioned along true solar arc (Fixes #4, #5)
    this.sunLight = new THREE.DirectionalLight(0xfff5d0, 1.75);
    this.sunLight.position.set(160, 260, 90);
    this.sunLight.castShadow = !this.isMobileDevice;
    this._shadowMapRes = this.isMobileDevice ? 512 : 2048;
    this._shadowFrustumHalf = 140;
    this.sunLight.shadow.mapSize.width = this._shadowMapRes;
    this.sunLight.shadow.mapSize.height = this._shadowMapRes;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 750;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.025;
    const d = this._shadowFrustumHalf;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.skyFill = new THREE.DirectionalLight(0x94d0f5, 0.48);
    this.skyFill.position.set(-180, 200, -140);
    this.scene.add(this.skyFill);

    // Graphics Fix #6: Night-only city sodium glow (0.0 during daytime or NEPA blackouts)
    this.cityGlow = new THREE.PointLight(0xff9040, 0.0, 520, 1.6);
    this.cityGlow.position.set(0, 48, 0);
    this.scene.add(this.cityGlow);

    this.rimLight = new THREE.DirectionalLight(0xaee4ff, 0.28);
    this.rimLight.position.set(-50, 80, -400);
    this.scene.add(this.rimLight);
  }

  _buildTerrainAndWater() {
    // Graphics Fix #47: Clamp terrain ridges around all districts & road corridors so hills never bury roads
    const groundGeo = new THREE.PlaneGeometry(3400, 3400, 80, 80);
    groundGeo.rotateX(-Math.PI / 2);

    const districtCoords3D = DISTRICTS.map((d) => map2DTo3D(d.x, d.y));
    const roadCoords3D = EDGES.map((e) => {
      const a = DISTRICT_BY_ID[e.a];
      const b = DISTRICT_BY_ID[e.b];
      if (!a || !b) return null;
      return { a: map2DTo3D(a.x, a.y), b: map2DTo3D(b.x, b.y) };
    }).filter(Boolean);

    const distToSeg = (px, pz, ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az;
      const lenSq = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
      return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    };

    const pos = groundGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const colA = new THREE.Color(0x9a7b4f);
    const colB = new THREE.Color(0x4b7438);
    const tmpCol = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const distFromCenter = Math.hypot(vx, vz);

      // Compute nearest clearance to districts/roads
      let minClear = 999;
      for (let d = 0; d < districtCoords3D.length; d++) {
        const dc = Math.hypot(vx - districtCoords3D[d].x, vz - districtCoords3D[d].z);
        if (dc < minClear) minClear = dc;
      }
      if (minClear > 75) {
        for (let r = 0; r < roadCoords3D.length; r++) {
          const rc = distToSeg(vx, vz, roadCoords3D[r].a.x, roadCoords3D[r].a.z, roadCoords3D[r].b.x, roadCoords3D[r].b.z);
          if (rc < minClear) minClear = rc;
        }
      }

      if (distFromCenter > 650 && minClear > 85) {
        const blend = Math.min(1, (minClear - 85) / 110);
        const ridge = (Math.sin(vx * 0.007) * Math.cos(vz * 0.007) * 26 + Math.sin((vx + vz) * 0.015) * 8) * blend;
        pos.setY(i, Math.max(0, ridge));
      }

      // Macro savanna/grass vertex-color variation breaks up tiling seams (Fix #25)
      const grassMix = 0.5 + 0.5 * Math.sin(vx * 0.0045) * Math.cos(vz * 0.0045);
      tmpCol.copy(colA).lerp(colB, grassMix);
      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    // Graphics Fixes #23, #24, #25: Seamless 512x512 ground texture + Sobel Normal Map + Anisotropic Filtering
    const groundTex = this._makeCanvasTex(512, 512, (ctx, W, H) => {
      ctx.fillStyle = '#735a38';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 420; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const r = 4 + Math.random() * 18;
        ctx.fillStyle = i % 2 === 0
          ? `rgba(${90 + (Math.random() * 35 | 0)}, ${70 + (Math.random() * 25 | 0)}, ${32 + (Math.random() * 18 | 0)}, 0.42)`
          : `rgba(${45 + (Math.random() * 25 | 0)}, ${95 + (Math.random() * 45 | 0)}, ${35 + (Math.random() * 20 | 0)}, 0.45)`;
        for (const ox of [-W, 0, W]) {
          for (const oy of [-H, 0, H]) {
            if (x + ox + r < 0 || x + ox - r > W || y + oy + r < 0 || y + oy - r > H) continue;
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }, { repeatX: 28, repeatY: 28, aniso: true });

    const groundNormal = this._makeNormalMap(128, (ctx, W, H) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) {
        const v = 90 + (Math.random() * 80 | 0);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 3, 3);
      }
    }, 1.8, 28, 28);

    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      normalMap: groundNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Urban interlocking paving pad with PBR Normal Map & Polygon Offset (Fixes #22, #23, #24)
    const paveTex = this._makeCanvasTex(256, 256, (ctx, W, H) => {
      ctx.fillStyle = '#7c828d';
      ctx.fillRect(0, 0, W, H);
      const tw = 22, th = 11;
      for (let row = 0; row < H / th + 1; row++) {
        for (let col = 0; col < W / tw + 1; col++) {
          const ox = (row % 2) * (tw / 2);
          const x = col * tw - ox;
          const y = row * th;
          const shade = 128 + (Math.random() * 28 | 0);
          ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 8})`;
          ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);
        }
      }
    }, { repeatX: 16, repeatY: 16, aniso: true });

    const paveNormal = this._makeNormalMap(128, (ctx, W, H) => {
      ctx.fillStyle = '#303030';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#dcdcdc';
      const tw = 16, th = 8;
      for (let r = 0; r < H / th + 1; r++) {
        for (let c = 0; c < W / tw + 1; c++) {
          const ox = (r % 2) * (tw / 2);
          ctx.fillRect(c * tw - ox + 1, r * th + 1, tw - 2, th - 2);
        }
      }
    }, 2.2, 16, 16);

    const sandBase = new THREE.Mesh(
      new THREE.PlaneGeometry(1650, 1650).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: paveTex,
        normalMap: paveNormal,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.88,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    sandBase.position.y = 0.06;
    sandBase.receiveShadow = true;
    this.scene.add(sandBase);

    // Graphics Fix #26: Animated Scrolling Normal-Map Reflective Water (Jabi Lake & Mpape Quarry Lake)
    const waterNormal = this._makeNormalMap(128, (ctx, W, H) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 6) {
        for (let x = 0; x < W; x += 6) {
          const wave = Math.round(128 + Math.sin(x * 0.25 + y * 0.15) * 45 + Math.cos(y * 0.3) * 35);
          ctx.fillStyle = `rgb(${wave},${wave},${wave})`;
          ctx.fillRect(x, y, 6, 6);
        }
      }
    }, 1.4, 6, 6);
    this.waterNormalMaps.push(waterNormal);

    const jabiD = DISTRICT_BY_ID.jabi;
    const jabiPos = map2DTo3D(jabiD.x - 5, jabiD.y + 3);
    const lakeGeo = new THREE.CylinderGeometry(78, 82, 1.4, 48);
    this.lakeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      emissive: 0x003d5c,
      emissiveIntensity: 0.18,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.08,
      metalness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.92,
      envMapIntensity: 1.5
    });
    const jabiLake = new THREE.Mesh(lakeGeo, this.lakeMaterial);
    jabiLake.position.set(jabiPos.x, 0.28, jabiPos.z);
    this.scene.add(jabiLake);

    // Soft foam shoreline ring
    const shoreMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      roughness: 0.7,
      transparent: true,
      opacity: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    const shore = new THREE.Mesh(new THREE.RingGeometry(77, 84, 48).rotateX(-Math.PI / 2), shoreMat);
    shore.position.set(jabiPos.x, 0.99, jabiPos.z);
    this.scene.add(shore);

    // Mpape Blue Quarry Crater Lake
    const mpapeD = DISTRICT_BY_ID.mpape;
    const mpapePos = map2DTo3D(mpapeD.x + 2, mpapeD.y - 3);
    const quarryLake = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 28, 1.8, 36),
      new THREE.MeshPhysicalMaterial({
        color: 0x06b6d4,
        emissive: 0x023e8a,
        emissiveIntensity: 0.22,
        normalMap: waterNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.06,
        metalness: 0.25,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.92,
        envMapIntensity: 1.6
      })
    );
    quarryLake.position.set(mpapePos.x, 1.2, mpapePos.z);
    this.scene.add(quarryLake);
  }

  _buildAsoRockAndHills() {
    // Graphics Fix #36: Sculpted Granite Monolith with Procedural Rock Normal Map & Strata Vertex Colors
    const graniteNormal = this._makeNormalMap(128, (ctx, W, H) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 4) {
        const band = 110 + Math.sin(y * 0.25) * 40;
        ctx.fillStyle = `rgb(${band|0},${band|0},${band|0})`;
        ctx.fillRect(0, y, W, 3);
      }
      for (let i = 0; i < 600; i++) {
        const v = 60 + (Math.random() * 140 | 0);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 4, 2);
      }
    }, 3.0, 5, 5);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      normalMap: graniteNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.06
    });

    const colorizeMonolith = (geo, maxH) => {
      const p = geo.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const baseGreen = new THREE.Color(0x3f6212);
      const midGranite = new THREE.Color(0x57534e);
      const crestGrey = new THREE.Color(0x78716c);
      const tmp = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const yNorm = Math.max(0, Math.min(1, (p.getY(i) + maxH * 0.5) / maxH));
        if (yNorm < 0.25) tmp.copy(baseGreen).lerp(midGranite, yNorm / 0.25);
        else tmp.copy(midGranite).lerp(crestGrey, (yNorm - 0.25) / 0.75);
        cols[i * 3] = tmp.r;
        cols[i * 3 + 1] = tmp.g;
        cols[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    };

    // Iconic Aso Rock Monolith towering east of Asokoro/Maitama (Subdivided sculpted ridges)
    const asoCoords = map2DTo3D(76, 40);
    const asoGeo = new THREE.ConeGeometry(138, 290, 26, 12);
    const p = asoGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const ang = Math.atan2(z, x);
      const ridge = 1 + 0.14 * Math.sin(ang * 5 + y * 0.02) + 0.08 * Math.cos(ang * 9 - y * 0.03);
      const ny = y > 88 ? 88 + (y - 88) * 0.35 : y;
      p.setXYZ(i, x * 1.28 * ridge, ny, z * 0.94 * ridge);
    }
    asoGeo.computeVertexNormals();
    colorizeMonolith(asoGeo, 290);
    const asoRock = new THREE.Mesh(asoGeo, rockMat);
    asoRock.position.set(asoCoords.x, 110, asoCoords.z);
    asoRock.castShadow = true;
    asoRock.receiveShadow = true;
    this.scene.add(asoRock);

    const hillSpecs = [
      { x: 46, y: 6, r: 85, h: 155 },  // Mpape Crush Rock ridge
      { x: 86, y: 52, r: 95, h: 130 }, // Guzape Hills
      { x: 24, y: 10, r: 75, h: 115 }, // Dawaki / Katampe Extension hill
      { x: 96, y: 74, r: 105, h: 170 } // Karu / Mararaba border hills
    ];

    for (const h of hillSpecs) {
      const pos = map2DTo3D(h.x, h.y);
      const geo = new THREE.IcosahedronGeometry(h.r, 2);
      const hp = geo.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const vx = hp.getX(i), vy = hp.getY(i), vz = hp.getZ(i);
        const n = 1 + 0.12 * Math.sin(vx * 0.06) * Math.cos(vz * 0.06);
        hp.setXYZ(i, vx * 1.2 * n, vy * (h.h / h.r), vz * 0.95 * n);
      }
      geo.computeVertexNormals();
      colorizeMonolith(geo, h.h * 2);
      const mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(pos.x, h.h * 0.28, pos.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  // Graphics Fix #49: Shared Cached Tree Materials & Fix #37 Canopy-Only Wind Sway + Contact Shadow
  _getTreeSharedAssets() {
    if (!this._sharedTreeAssets) {
      this._sharedTreeAssets = {
        palmTrunkMat: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 }),
        palmFrondMat: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.62, side: THREE.DoubleSide }),
        palmFrondLightMat: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.58, side: THREE.DoubleSide }),
        bougTrunkMat: new THREE.MeshStandardMaterial({ color: 0x473322, roughness: 0.9 }),
        bougLeafMat: new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.68 }),
        bougFlowerMats: new Map(),
        shadowMat: new THREE.MeshBasicMaterial({
          map: this._contactShadowTex,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2
        }),
        shadowGeo: new THREE.PlaneGeometry(5.6, 5.6).rotateX(-Math.PI / 2),
        palmTrunkGeo: new THREE.CylinderGeometry(0.19, 0.34, 10.2, 8),
        frondInnerGeo: new THREE.ConeGeometry(0.52, 2.3, 4).rotateX(Math.PI / 2),
        frondOuterGeo: new THREE.ConeGeometry(0.36, 2.2, 4).rotateX(Math.PI / 2),
        bougTrunkGeo: new THREE.CylinderGeometry(0.30, 0.46, 5.4, 8),
        canopyGeo: new THREE.IcosahedronGeometry(1.0, 1)
      };
    }
    return this._sharedTreeAssets;
  }

  _buildPalmTree(scale = 1) {
    const a = this._getTreeSharedAssets();
    const tree = new THREE.Group();

    // Baked soft radial contact shadow (Fix #3)
    const sh = new THREE.Mesh(a.shadowGeo, a.shadowMat);
    sh.position.y = 0.08;
    tree.add(sh);

    const trunk = new THREE.Mesh(a.palmTrunkGeo, a.palmTrunkMat);
    trunk.position.set(0.22, 5.1, 0);
    trunk.rotation.z = -0.05;
    tree.add(trunk);

    // Separate crownGroup so wind sways ONLY the canopy while trunk stays firmly rooted (Fix #37)
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0.45, 10.1, 0);
    for (let f = 0; f < 7; f++) {
      const ang = (f / 7) * Math.PI * 2;
      const frondPivot = new THREE.Group();
      frondPivot.rotation.y = ang;
      const fMat = f % 2 === 0 ? a.palmFrondMat : a.palmFrondLightMat;

      const inner = new THREE.Mesh(a.frondInnerGeo, fMat);
      inner.scale.set(1.0, 0.22, 1.0);
      inner.position.set(0, 0.15, 1.15);
      inner.rotation.x = -0.18;
      frondPivot.add(inner);

      const outer = new THREE.Mesh(a.frondOuterGeo, fMat);
      outer.scale.set(1.0, 0.18, 1.0);
      outer.position.set(0, -0.35, 3.05);
      outer.rotation.x = 0.42;
      frondPivot.add(outer);

      crownGroup.add(frondPivot);
    }
    tree.add(crownGroup);
    tree.userData = { crownGroup };
    tree.scale.setScalar(scale);
    return tree;
  }

  _buildBougainvilleaTree(scale = 1, flowerColor = 0xe11d48) {
    const a = this._getTreeSharedAssets();
    let flowerMat = a.bougFlowerMats.get(flowerColor);
    if (!flowerMat) {
      flowerMat = new THREE.MeshStandardMaterial({
        color: flowerColor,
        roughness: 0.52,
        emissive: flowerColor,
        emissiveIntensity: 0.22
      });
      a.bougFlowerMats.set(flowerColor, flowerMat);
    }

    const tree = new THREE.Group();
    const sh = new THREE.Mesh(a.shadowGeo, a.shadowMat);
    sh.position.y = 0.08;
    tree.add(sh);

    const trunk = new THREE.Mesh(a.bougTrunkGeo, a.bougTrunkMat);
    trunk.position.y = 2.7;
    tree.add(trunk);

    const crownGroup = new THREE.Group();
    crownGroup.position.y = 5.4;
    const canopyCoords = [
      [0, 0.4, 0, 2.4],
      [-1.3, -0.1, 0.8, 1.75],
      [1.3, 0.0, -0.6, 1.75],
      [0.5, 0.9, 1.1, 1.55]
    ];
    for (const [cx, cy, cz, cr] of canopyCoords) {
      const leafBlob = new THREE.Mesh(a.canopyGeo, a.bougLeafMat);
      leafBlob.position.set(cx, cy, cz);
      leafBlob.scale.setScalar(cr);
      crownGroup.add(leafBlob);

      const flowerBlob = new THREE.Mesh(a.canopyGeo, flowerMat);
      flowerBlob.position.set(cx * 1.12, cy + 0.16, cz * 1.12);
      flowerBlob.scale.setScalar(cr * 0.72);
      crownGroup.add(flowerBlob);
    }
    tree.add(crownGroup);
    tree.userData = { crownGroup };
    tree.scale.setScalar(scale);
    return tree;
  }

  _buildRoadNetwork() {
    this.roadSegments = [];

    // Graphics Fixes #23 & #24: High-Detail Asphalt Texture + Sobel Normal Map + Max Anisotropic Filtering
    const asphaltTex = this._makeCanvasTex(512, 512, (ctx, W, H) => {
      ctx.fillStyle = '#1f2430';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 6500; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const v = 28 + (Math.random() * 48 | 0);
        ctx.fillStyle = `rgba(${v},${v + 2},${v + 6},0.75)`;
        ctx.fillRect(x, y, 1 + (Math.random() * 2 | 0), 1 + (Math.random() * 2 | 0));
      }
      for (let j = 0; j < 26; j++) {
        const y = Math.random() * H;
        ctx.fillStyle = 'rgba(10, 14, 20, 0.32)';
        ctx.fillRect(0, y, W, 2 + Math.random() * 4);
      }
      for (let k = 0; k < 16; k++) {
        const ox = (W * 0.5) + (Math.random() - 0.5) * 60;
        const oy = Math.random() * H;
        ctx.beginPath();
        ctx.arc(ox, oy, 4 + Math.random() * 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8, 10, 14, 0.42)';
        ctx.fill();
      }
    }, { repeatX: 2, repeatY: 12, aniso: true });

    const asphaltNormal = this._makeNormalMap(128, (ctx, W, H) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 1600; i++) {
        const v = 70 + (Math.random() * 115 | 0);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
    }, 1.8, 2, 12);

    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      normalMap: asphaltNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      color: 0x262b38,
      roughness: 0.80,
      metalness: 0.08
    });
    this.roadMat = roadMat;

    const shoulderSandMat = new THREE.MeshStandardMaterial({
      color: 0xc4a882,
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x047857,
      emissiveIntensity: 0.25,
      roughness: 0.4
    });
    const stripeMat = new THREE.MeshBasicMaterial({
      color: 0xfafafa,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const yellowStripeMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x0a0f1a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const guardrailMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.28, metalness: 0.82 });
    const kerbBlackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    const kerbRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.65 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.38, metalness: 0.82 });
    const puddleMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.03,
      metalness: 0.85,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.76,
      polygonOffset: true,
      polygonOffsetFactor: -3
    });

    const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 11, 8);
    const armGeo = new THREE.BoxGeometry(2.6, 0.16, 0.16);
    const headGeo = new THREE.BoxGeometry(0.8, 0.22, 0.45);
    const bulbGeo = new THREE.BoxGeometry(0.65, 0.08, 0.35);
    const poolGeo = new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2);

    // Subtle elevation stagger (0.004m per edge) eliminates coplanar Z-fighting at road crossings (Fix #22)
    let edgeIdx = 0;
    for (const edge of EDGES) {
      const dA = DISTRICT_BY_ID[edge.a];
      const dB = DISTRICT_BY_ID[edge.b];
      if (!dA || !dB) continue;

      const pA = map2DTo3D(dA.x, dA.y);
      const pB = map2DTo3D(dB.x, dB.y);
      const yBase = 0.35 + (edgeIdx++ % 5) * 0.004;
      const vA = new THREE.Vector3(pA.x, yBase, pA.z);
      const vB = new THREE.Vector3(pB.x, yBase, pB.z);

      const diff = new THREE.Vector3().subVectors(vB, vA);
      const len = diff.length();
      const mid = new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5);
      const angle = Math.atan2(diff.x, diff.z);

      const isRail = edge.type === 'rail';
      const isExp = edge.type === 'expressway';
      const width = isRail ? 6 : isExp ? 16 : 11;

      if (!isRail) {
        const shoulderGeo = new THREE.BoxGeometry(width + 6.0, 0.22, len);
        const shoulder = new THREE.Mesh(shoulderGeo, shoulderSandMat);
        shoulder.position.set(mid.x, 0.14, mid.z);
        shoulder.rotation.y = angle;
        shoulder.receiveShadow = true;
        this.scene.add(shoulder);
      }

      const geo = new THREE.BoxGeometry(width, isRail ? 0.9 : 0.44, len);
      const mesh = new THREE.Mesh(geo, isRail ? railMat : roadMat);
      mesh.position.copy(mid);
      mesh.rotation.y = angle;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      if (!isRail) {
        const topY = yBase + 0.22;
        const stripeGeo = new THREE.PlaneGeometry(0.45, len * 0.90);
        stripeGeo.rotateX(-Math.PI / 2);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(mid.x, topY + 0.015, mid.z);
        stripe.rotation.y = angle;
        this.scene.add(stripe);

        if (isExp) {
          for (const ySide of [-1, 1]) {
            const yGeo = new THREE.PlaneGeometry(0.24, len * 0.88);
            yGeo.rotateX(-Math.PI / 2);
            const yLine = new THREE.Mesh(yGeo, yellowStripeMat);
            const yOff = ySide * (width * 0.42);
            yLine.position.set(mid.x + Math.cos(angle) * yOff, topY + 0.018, mid.z - Math.sin(angle) * yOff);
            yLine.rotation.y = angle;
            this.scene.add(yLine);
          }
        }

        // Graphics Fixes #21, #8 & #9: Properly Rotated Streetlights + Warm Night Asphalt Light Pools + Glow Halos
        if (len > 50) {
          const lanternGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
          const poolMat = new THREE.MeshBasicMaterial({
            map: this._glowSpriteTex,
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -3
          });
          this.streetLightPools.push(poolMat);

          for (const sFrac of [-0.34, 0.34]) {
            const alongZ = sFrac * len;
            const pSide = width * 0.5 + 1.8;
            const streetLightGroup = new THREE.Group();
            streetLightGroup.position.set(
              mid.x + Math.sin(angle) * alongZ + Math.cos(angle) * pSide,
              0,
              mid.z + Math.cos(angle) * alongZ - Math.sin(angle) * pSide
            );
            // Fix #21: Align streetlamp arm cleanly perpendicular over the roadway!
            streetLightGroup.rotation.y = angle;

            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 5.5;
            const arm = new THREE.Mesh(armGeo, poleMat);
            arm.position.set(-1.1, 10.8, 0);
            const lampHead = new THREE.Mesh(headGeo, poleMat);
            lampHead.position.set(-2.2, 10.7, 0);
            const lampBulb = new THREE.Mesh(bulbGeo, lanternGlowMat);
            lampBulb.position.set(-2.2, 10.55, 0);
            this.streetLightBulbs.push(lampBulb);

            // Warm additive ground light pool on the asphalt (Fix #8)
            const pool = new THREE.Mesh(poolGeo, poolMat);
            pool.position.set(-4.2, topY + 0.025, 0);

            streetLightGroup.add(pole, arm, lampHead, lampBulb, pool);
            this.scene.add(streetLightGroup);
          }

          const puddle = new THREE.Mesh(
            new THREE.CircleGeometry(width * 0.34, 18).rotateX(-Math.PI / 2),
            puddleMat
          );
          puddle.position.set(mid.x, topY + 0.022, mid.z);
          puddle.visible = false;
          this.scene.add(puddle);
          this.roadPuddles.push(puddle);
        }

        for (const laneSide of [-1, 1]) {
          const skidGeo = new THREE.PlaneGeometry(0.9, len * 0.86);
          skidGeo.rotateX(-Math.PI / 2);
          const skid = new THREE.Mesh(skidGeo, skidMat);
          const sOff = laneSide * (width * 0.24);
          skid.position.set(mid.x + Math.cos(angle) * sOff, topY + 0.012, mid.z - Math.sin(angle) * sOff);
          skid.rotation.y = angle;
          this.scene.add(skid);
        }

        if (isExp) {
          const railBeamGeo = new THREE.BoxGeometry(0.35, 0.55, len * 0.90);
          for (const side of [-1, 1]) {
            const gOff = side * (width * 0.5 + 1.25);
            const gBeam = new THREE.Mesh(railBeamGeo, guardrailMat);
            gBeam.position.set(mid.x + Math.cos(angle) * gOff, 1.1, mid.z - Math.sin(angle) * gOff);
            gBeam.rotation.y = angle;
            this.scene.add(gBeam);
          }
        }

        const kerbBeamGeo = new THREE.BoxGeometry(0.65, 0.42, len * 0.92);
        const kMat = isExp ? kerbRedMat : kerbBlackMat;
        for (const side of [-1, 1]) {
          const kerbBeam = new THREE.Mesh(kerbBeamGeo, kMat);
          const offsetSide = side * (width * 0.5 + 0.35);
          kerbBeam.position.set(mid.x + Math.cos(angle) * offsetSide, 0.42, mid.z - Math.sin(angle) * offsetSide);
          kerbBeam.rotation.y = angle;
          this.scene.add(kerbBeam);
        }

        if (len > 35) {
          for (const tFrac of [-0.25, 0.25]) {
            const alongZ = tFrac * len;
            const tree = (alongZ > 0)
              ? this._buildBougainvilleaTree(0.88, 0xe11d48)
              : this._buildPalmTree(0.92);
            const pSide = (tFrac > 0 ? 1 : -1) * (width * 0.5 + 3.4);
            tree.position.set(
              mid.x + Math.sin(angle) * alongZ + Math.cos(angle) * pSide,
              0.15,
              mid.z + Math.cos(angle) * alongZ - Math.sin(angle) * pSide
            );
            tree.rotation.y = tFrac * 4;
            this.scene.add(tree);
            this.swayingTrees.push(tree);
          }
        }
      }

      this.roadSegments.push({
        edge,
        vA,
        vB,
        len,
        angle,
        width,
        isRail
      });
    }

    // Graphics Fix #22: Smooth Circular Abuja Roundabout Caps over Every District Road Hub (Zero Intersection Z-Fighting)
    const hubCapGeo = new THREE.CylinderGeometry(11.5, 11.8, 0.16, 28);
    const hubRingGeo = new THREE.RingGeometry(4.2, 4.9, 28).rotateX(-Math.PI / 2);
    const hubIslandGeo = new THREE.CylinderGeometry(4.1, 4.3, 0.42, 24);
    const islandGrassMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 });

    for (const d of DISTRICTS) {
      const dp = map2DTo3D(d.x, d.y);
      const cap = new THREE.Mesh(hubCapGeo, roadMat);
      cap.position.set(dp.x, 0.51, dp.z);
      cap.receiveShadow = true;
      this.scene.add(cap);

      const island = new THREE.Mesh(hubIslandGeo, islandGrassMat);
      island.position.set(dp.x, 0.65, dp.z);
      this.scene.add(island);

      const ringLine = new THREE.Mesh(hubRingGeo, stripeMat);
      ringLine.position.set(dp.x, 0.60, dp.z);
      this.scene.add(ringLine);
    }
  }

  _buildNigerianDuplex(width, height, depth, wallHex, roofHex, winMat, worldMatrix = null) {
    const house = new THREE.Group();

    // Cached wall material with subtle stucco normal map (Fix #23)
    if (!this._stuccoNormal) {
      this._stuccoNormal = this._makeNormalMap(64, (ctx, W, H) => {
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 400; i++) {
          const v = 90 + (Math.random() * 80 | 0);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
        }
      }, 1.2, 2, 2);
    }

    let wallMat = this._duplexWallMatCache.get(wallHex);
    if (!wallMat) {
      const wallTex = this._makeCanvasTex(128, 128, (ctx, W, H) => {
        const r = (wallHex >> 16) & 0xff;
        const g = (wallHex >> 8) & 0xff;
        const b = wallHex & 0xff;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, W, H);
        for (let y = 0; y < H; y += 8) {
          const v = (Math.random() - 0.5) * 14;
          ctx.fillStyle = `rgba(${r + v | 0},${g + v | 0},${b + v | 0},0.18)`;
          ctx.fillRect(0, y, W, 2);
        }
      }, { repeatX: 2, repeatY: 1, aniso: true });
      wallMat = new THREE.MeshStandardMaterial({
        map: wallTex,
        normalMap: this._stuccoNormal,
        normalScale: new THREE.Vector2(0.3, 0.3),
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.04
      });
      this._duplexWallMatCache.set(wallHex, wallMat);
    }

    // Graphics Fix #14: Hollow 4-Wall Perimeter Construction (Never slices through interior sofa/bed on cutaway!)
    const wt = 0.48;
    const wallSpecs = [
      { w: width, d: wt, x: 0, z: depth * 0.5 - wt * 0.5 },
      { w: width, d: wt, x: 0, z: -(depth * 0.5 - wt * 0.5) },
      { w: wt, d: depth - wt * 2, x: -(width * 0.5 - wt * 0.5), z: 0 },
      { w: wt, d: depth - wt * 2, x: width * 0.5 - wt * 0.5, z: 0 }
    ];
    for (const ws of wallSpecs) {
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(ws.w, height, ws.d), wallMat);
      wMesh.position.set(ws.x, height * 0.5, ws.z);
      wMesh.castShadow = true;
      wMesh.receiveShadow = true;
      wMesh.userData = { isWall: true, origHeight: height, origPosY: height * 0.5 };
      house.add(wMesh);
    }

    if (!this._sharedDuplexMats) {
      this._sharedDuplexMats = {
        plinth: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.62 }),
        band: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.48, metalness: 0.04 }),
        frame: new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 }),
        sill: new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.6 }),
        balcSlab: new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.7 }),
        balcPost: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 }),
        acUnit: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.45, metalness: 0.4 }),
        pillar: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.55 }),
        wallPlaster: new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.85 }),
        wallCoping: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
        razorWire: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.9 }),
        gateIron: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.8 }),
        goldTrim: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.85 }),
        steel: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.8 }),
        geepee: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }),
        whiteStripe: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        genShed: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 }),
        genLouver: new THREE.MeshBasicMaterial({ color: 0x111827 }),
        dish: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.6 }),
        defaultGlass: new THREE.MeshStandardMaterial({
          color: 0x1a2940, roughness: 0.08, metalness: 0.92, envMapIntensity: 1.4
        })
      };
    }

    if (!this._sharedDuplexGeos) {
      this._sharedDuplexGeos = {
        frame: new THREE.BoxGeometry(1.85, 1.95, 0.22),
        pane: new THREE.BoxGeometry(1.48, 1.58, 0.25),
        sill: new THREE.BoxGeometry(1.95, 0.18, 0.38),
        balcPost: new THREE.BoxGeometry(0.1, 1.1, 0.1),
        acUnit: new THREE.BoxGeometry(1.6, 0.9, 0.55),
        pillar: new THREE.BoxGeometry(0.8, 2.8, 0.8),
        cap: new THREE.BoxGeometry(1.1, 0.35, 1.1),
        gatehouse: new THREE.BoxGeometry(2.4, 2.5, 2.4),
        ghRoof: new THREE.BoxGeometry(2.8, 0.2, 2.8),
        ghWindow: new THREE.BoxGeometry(1.0, 0.8, 0.1),
        waterLeg: new THREE.CylinderGeometry(0.08, 0.08, 6.2, 6),
        towerPlatform: new THREE.BoxGeometry(2.4, 0.2, 2.4),
        tank1: new THREE.CylinderGeometry(0.85, 0.85, 1.8, 12),
        whiteStripe: new THREE.CylinderGeometry(0.86, 0.86, 0.22, 12),
        genShed: new THREE.BoxGeometry(2.2, 1.6, 2.0),
        genLouver: new THREE.BoxGeometry(1.4, 0.7, 0.1),
        dishReflector: new THREE.CylinderGeometry(0.7, 0.2, 0.2, 12),
        dishPole: new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6)
      };
    }

    // White concrete plinth (ground slab)
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.6, 0.9, depth + 0.6),
      this._sharedDuplexMats.plinth
    );
    plinth.position.y = 0.45;
    house.add(plinth);

    // Cached pitched hip roof material with corrugated ridge normal map
    let roofMat = this._duplexRoofMatCache.get(roofHex);
    if (!roofMat) {
      const roofTex = this._makeCanvasTex(128, 32, (ctx, W, H) => {
        const r = (roofHex >> 16) & 0xff;
        const g = (roofHex >> 8) & 0xff;
        const b = roofHex & 0xff;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 8) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x, 0, 4, H);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(x + 4, 0, 4, H);
        }
      }, { repeatX: 4, repeatY: 1, aniso: true });
      roofMat = new THREE.MeshStandardMaterial({
        map: roofTex, color: 0xffffff, roughness: 0.48, metalness: 0.28
      });
      this._duplexRoofMatCache.set(roofHex, roofMat);
    }

    // Graphics Fix #29 & #13: Proportionally Scaled Rectangular Hip Roof + Non-Mutating origMat for Per-House Cutaway
    const maxDim = Math.max(width, depth);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(maxDim * 0.78, 4.4, 4),
      roofMat
    );
    roof.position.y = height + 2.2;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(width / maxDim, 1, depth / maxDim);
    roof.castShadow = true;
    roof.userData = { isRoof: true, origMat: roofMat };
    house.add(roof);

    // Graphics Fixes #29 & #41: 4-Sided Windows Batched into compact per-house InstancedMesh (hides cleanly on LOD cull & cutaway!)
    const m = this._sharedDuplexMats;
    const g = this._sharedDuplexGeos;
    const frameMat = m.frame;
    const glassMat = winMat || m.defaultGlass;
    const floors = [height * 0.28, height * 0.74];
    const cols = [-width * 0.28, 0, width * 0.28];
    const sideCols = [-depth * 0.22, depth * 0.22];

    const winTransforms = [];
    for (const fy of floors) {
      for (const cx of cols) {
        winTransforms.push([cx, fy, depth * 0.5 + 0.06, 0]);
        winTransforms.push([cx, fy, -(depth * 0.5 + 0.06), 0]);
      }
      for (const cz of sideCols) {
        winTransforms.push([width * 0.5 + 0.06, fy, cz, Math.PI / 2]);
        winTransforms.push([-(width * 0.5 + 0.06), fy, cz, Math.PI / 2]);
      }
    }

    const frameInst = new THREE.InstancedMesh(g.frame, frameMat, winTransforms.length);
    const paneInst = new THREE.InstancedMesh(g.pane, glassMat, winTransforms.length);
    const wDummy = new THREE.Object3D();
    for (let wi = 0; wi < winTransforms.length; wi++) {
      const [wx, wy, wz, wr] = winTransforms[wi];
      wDummy.position.set(wx, wy, wz);
      wDummy.rotation.set(0, wr, 0);
      wDummy.updateMatrix();
      frameInst.setMatrixAt(wi, wDummy.matrix);
      paneInst.setMatrixAt(wi, wDummy.matrix);
    }
    frameInst.instanceMatrix.needsUpdate = true;
    paneInst.instanceMatrix.needsUpdate = true;
    frameInst.userData = { isWindowBatch: true };
    paneInst.userData = { isWindowBatch: true };
    house.add(frameInst, paneInst);

    // Balcony on 2nd floor front face
    const balcSlab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 0.28, 1.8), m.balcSlab);
    balcSlab.position.set(0, height * 0.74 - 1.2, depth * 0.5 + 0.9);
    house.add(balcSlab);

    const acUnit = new THREE.Mesh(g.acUnit, m.acUnit);
    acUnit.position.set(width * 0.5 + 0.25, height * 0.7, 0);
    house.add(acUnit);

    // Compact authentic compound perimeter wall + sliding gate + GeePee overhead tank + Gen house
    const cW = width + 5.2;
    const cD = depth + 6.0;
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(cW, 2.7, 0.42), m.wallPlaster);
    backWall.position.set(0, 1.35, -cD * 0.5);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.7, cD), m.wallPlaster);
    leftWall.position.set(-cW * 0.5, 1.35, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.7, cD), m.wallPlaster);
    rightWall.position.set(cW * 0.5, 1.35, 0);
    const gatePanelL = new THREE.Mesh(new THREE.BoxGeometry(cW * 0.34, 2.5, 0.16), m.gateIron);
    gatePanelL.position.set(-cW * 0.18, 1.25, cD * 0.5);
    const gateTrimL = new THREE.Mesh(new THREE.BoxGeometry(cW * 0.34, 0.18, 0.22), m.goldTrim);
    gateTrimL.position.set(-cW * 0.18, 1.25, cD * 0.5);
    house.add(backWall, leftWall, rightWall, gatePanelL, gateTrimL);

    // Overhead GeePee Water Tank & Diesel Generator House
    const tank1 = new THREE.Mesh(g.tank1, m.geepee);
    tank1.position.set(-cW * 0.5 + 2.0, 5.2, -cD * 0.5 + 2.0);
    const towerStand = new THREE.Mesh(new THREE.BoxGeometry(1.7, 4.3, 1.7), m.steel);
    towerStand.position.set(-cW * 0.5 + 2.0, 2.15, -cD * 0.5 + 2.0);
    const genShed = new THREE.Mesh(g.genShed, m.genShed);
    genShed.position.set(cW * 0.5 - 2.0, 0.8, -cD * 0.5 + 2.0);
    house.add(tank1, towerStand, genShed);

    // Graphics Fix #42: Hide interior furniture while roof/walls are closed (0 wasted draw calls!)
    const interior = this._buildDuplexInteriorFurniture(width, depth);
    interior.visible = false;
    this.allInteriorGroups.push(interior);
    house.add(interior);

    return house;
  }

  _buildDuplexInteriorFurniture(width = 11, depth = 11) {
    const interior = new THREE.Group();
    interior.userData = { isInterior: true };

    if (!this._sharedInteriorMats) {
      this._sharedInteriorMats = {
        floorTile: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.25 }),
        rug: new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85 }),
        sofa: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 }),
        wood: new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.55 }),
        tvScreen: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
        bedSheet: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }),
        pillow: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
        stove: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.7 }),
        burnerGlow: new THREE.MeshBasicMaterial({ color: 0xf97316 })
      };
    }
    const im = this._sharedInteriorMats;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width - 1.0, depth - 1.0).rotateX(-Math.PI / 2), im.floorTile);
    floor.position.y = 0.96;
    interior.add(floor);

    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2).rotateX(-Math.PI / 2), im.rug);
    rug.position.set(-1.6, 0.99, 1.2);
    interior.add(rug);

    const sofaMain = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.2), im.sofa);
    sofaMain.position.set(-1.6, 1.45, 2.4);
    const sofaSide = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 2.4), im.sofa);
    sofaSide.position.set(-3.1, 1.45, 1.4);
    interior.add(sofaMain, sofaSide);

    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.6), im.wood);
    tvStand.position.set(-1.6, 1.35, -0.4);
    const tvPanel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.25, 0.1), im.tvScreen);
    tvPanel.position.set(-1.6, 2.35, -0.4);
    interior.add(tvStand, tvPanel);

    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, 3.2), im.wood);
    bedFrame.position.set(2.2, 1.35, -1.6);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 2.9), im.bedSheet);
    mattress.position.set(2.2, 1.85, -1.5);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 0.65), im.pillow);
    pillow.position.set(2.2, 2.08, -2.55);
    interior.add(bedFrame, mattress, pillow);

    const stoveBox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), im.stove);
    stoveBox.position.set(2.4, 1.55, 2.2);
    const burner = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12).rotateX(-Math.PI / 2), im.burnerGlow);
    burner.position.set(2.4, 2.18, 2.2);
    interior.add(stoveBox, burner);

    return interior;
  }

  _buildParkedKoropeVan(colorHex = 0xe2e8f0) {
    const van = new THREE.Group();
    const lowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.5, 6.8),
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.55 })
    );
    lowerBody.position.y = 1.25;
    lowerBody.castShadow = true;
    van.add(lowerBody);

    const upperCabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.35, 6.2),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.4 })
    );
    upperCabin.position.y = 2.6;
    van.add(upperCabin);

    const winBand = new THREE.Mesh(
      new THREE.BoxGeometry(3.28, 0.85, 5.6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.85 })
    );
    winBand.position.y = 2.65;
    van.add(winBand);

    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.45, 0.4), bumperMat);
    frontBumper.position.set(0, 0.7, 3.45);
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.45, 0.4), bumperMat);
    rearBumper.position.set(0, 0.7, -3.45);
    van.add(frontBumper, rearBumper);

    const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.45, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-1.65, 2.1], [1.65, 2.1], [-1.65, -2.1], [1.65, -2.1]]) {
      const wheel = new THREE.Mesh(wheelGeo, bumperMat);
      wheel.position.set(wx, 0.62, wz);
      van.add(wheel);
    }
    return van;
  }

  _buildMiniFootballPitch() {
    const pitch = new THREE.Group();
    const turf = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 26),
      new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1 })
    );
    turf.rotateX(-Math.PI / 2);
    turf.position.y = 0.25;
    turf.receiveShadow = true;
    pitch.add(turf);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, polygonOffset: true, polygonOffsetFactor: -2 });
    const midLine = new THREE.Mesh(new THREE.PlaneGeometry(16.8, 0.25), lineMat);
    midLine.rotateX(-Math.PI / 2);
    midLine.position.y = 0.27;
    pitch.add(midLine);

    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    for (const side of [-1, 1]) {
      const gz = side * 12.2;
      const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8), postMat);
      leftPost.position.set(-2.8, 1.6, gz);
      const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8), postMat);
      rightPost.position.set(2.8, 1.6, gz);
      const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.8, 8), postMat);
      crossbar.rotation.z = Math.PI / 2;
      crossbar.position.set(0, 3.2, gz);
      pitch.add(leftPost, rightPost, crossbar);
    }
    return pitch;
  }

  _buildDistrictsAndSkyline() {
    this.clickableDistrictMeshes = [];

    const glassTex = this._makeCanvasTex(256, 512, (ctx, W, H) => {
      ctx.fillStyle = '#0d1f35';
      ctx.fillRect(0, 0, W, H);
      const cols = 6, rows = 18;
      const cw = W / cols, rh = H / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = Math.random() > 0.36;
          const warm = Math.random() > 0.55;
          ctx.fillStyle = lit
            ? (warm
                ? `rgba(255, ${190 + (Math.random() * 50 | 0)}, ${90 + (Math.random() * 60 | 0)}, 0.92)`
                : `rgba(${160 + (Math.random() * 60 | 0)}, ${210 + (Math.random() * 40 | 0)}, 255, 0.88)`)
            : 'rgba(10, 20, 40, 0.95)';
          ctx.fillRect(c * cw + 3, r * rh + 3, cw - 6, rh - 6);
        }
      }
      ctx.strokeStyle = 'rgba(110,150,190,0.55)';
      ctx.lineWidth = 2;
      for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); ctx.stroke(); }
      for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(W, r * rh); ctx.stroke(); }
    }, { aniso: true });
    this._sharedGlassTex = glassTex;

    // Graphics Fix #30: Shared skyscraper glass material registered in windowMaterials for Night & NEPA Blackouts!
    const winLitMat = new THREE.MeshStandardMaterial({
      map: glassTex,
      color: 0xffffff,
      emissive: 0xfef3c0,
      emissiveMap: glassTex,
      emissiveIntensity: 0.24,
      roughness: 0.08,
      metalness: 0.88,
      envMapIntensity: 1.5
    });
    this.windowMaterials.push(winLitMat);

    const towerMat = new THREE.MeshStandardMaterial({
      map: glassTex,
      color: 0xdbeafe,
      emissive: 0xfef08a,
      emissiveMap: glassTex,
      emissiveIntensity: 0.28,
      roughness: 0.06,
      metalness: 0.9,
      envMapIntensity: 1.7
    });
    this.windowMaterials.push(towerMat);

    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.9 });
    const kerbBlackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    const kerbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.85 });
    const sandPadMat = new THREE.MeshStandardMaterial({ color: 0xd6bfa3, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -1 });
    const lowProxyMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 });
    const kerbGeo = new THREE.BoxGeometry(3.6, 0.55, 0.65);

    for (const d of DISTRICTS) {
      const id = d.id;
      const pos = map2DTo3D(d.x, d.y);
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);
      group.userData = { districtId: id, district: d };

      const isZone1 = d.zone === 1;
      const zoneColor = isZone1 ? 0xf59e0b : 0x10b981;

      // Graphics Fix #39: Grounded Subtle Compass Inlay Ring (replaces loud arcade neon ring + floating giant crystal)
      const ringGeo = new THREE.RingGeometry(11.6, 12.6, 36);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: zoneColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: -2
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.59;
      group.add(ring);

      // Grounded Abuja District Welcome Monument Pillar at Roundabout Center (replaces floating giant crystal!)
      const monument = new THREE.Group();
      const monBase = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 2.2, 8), kerbWhiteMat);
      monBase.position.y = 1.6;
      const monSpire = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 7.5, 6),
        new THREE.MeshStandardMaterial({ color: zoneColor, roughness: 0.28, metalness: 0.75 })
      );
      monSpire.position.y = 6.4;
      monument.add(monBase, monSpire);
      group.add(monument);

      const sandPad = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 0.22, 32), sandPadMat);
      sandPad.position.y = 0.10;
      sandPad.receiveShadow = true;
      group.add(sandPad);

      const pad = new THREE.Mesh(new THREE.BoxGeometry(52, 0.32, 52), padMat);
      pad.position.y = 0.21;
      pad.receiveShadow = true;
      group.add(pad);

      // Graphics Fix #48: Single Lightweight Hit-Proxy Cylinder per District (15 meshes total instead of 10,000!)
      const hitProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(44, 44, 24, 12),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitProxy.position.y = 12;
      hitProxy.userData = { districtId: id };
      this.clickableDistrictMeshes.push(hitProxy);
      group.add(hitProxy);

      // Algorithm #6 (ProceduralUrbanPlanner): District-specific zoning & parcel layout (Fix #38)
      const layout = ProceduralUrbanPlanner.generateDistrictLayout(d);
      const compoundGroup = new THREE.Group();

      // Algorithm #7 (InstancedMesh Batching): Queue compound kerbs into GPU InstancedMesh!
      for (let k = -5; k <= 5; k++) {
        const isEven = Math.abs(k) % 2 === 0;
        const kKey = isEven ? 'kerb_black' : 'kerb_white';
        const kMat = isEven ? kerbBlackMat : kerbWhiteMat;
        const mf = new THREE.Matrix4().makeTranslation(pos.x + k * 3.8, 0.45, pos.z + 14.5);
        const mb = new THREE.Matrix4().makeTranslation(pos.x + k * 3.8, 0.45, pos.z - 14.5);
        this.lodBatcher.queueInstance(kKey, kerbGeo, kMat, mf);
        this.lodBatcher.queueInstance(kKey, kerbGeo, kMat, mb);
      }

      // Manicured hedges
      for (const hx of [-16, 16]) {
        const hedge = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 20), hedgeMat);
        hedge.position.set(hx, 1.15, 0);
        compoundGroup.add(hedge);
      }

      // District-unique community props (Fix #38: No more clone-stamped football pitches in Asokoro/Maitama!)
      if (layout.hasFootballPitch) {
        const pitch = this._buildMiniFootballPitch();
        pitch.position.set(-24, 0, 12);
        compoundGroup.add(pitch);
      }
      if (layout.hasKoropePark) {
        const van1 = this._buildParkedKoropeVan(0xe2e8f0);
        van1.position.set(19, 0.2, 18);
        van1.rotation.y = -0.35;
        compoundGroup.add(van1);
      }

      // Concrete utility poles
      for (const [px, pz] of [[-14, 15], [14, 15]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 15, 8), poleMat);
        pole.position.set(px, 7.5, pz);
        compoundGroup.add(pole);
      }

      // Distant LOD low-poly silhouette proxy for Algorithm #7
      const lowProxy = new THREE.Group();
      lowProxy.visible = false;

      // Instantiate zoned parcels along urban street blocks
      for (let i = 0; i < layout.parcels.length; i++) {
        const parcel = layout.parcels[i];
        const bx = parcel.x;
        const bz = parcel.z;
        const bw = parcel.w;
        const bd = parcel.d;
        const bh = parcel.h;

        let building;
        const worldM = new THREE.Matrix4().compose(
          new THREE.Vector3(pos.x + bx, 0.2, pos.z + bz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), parcel.rot),
          new THREE.Vector3(1, 1, 1)
        );

        if (parcel.kind === 'skyscraper' || parcel.kind === 'commercial') {
          building = new THREE.Group();
          const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), towerMat);
          tower.position.y = bh * 0.5;
          tower.castShadow = true;
          tower.receiveShadow = true;
          building.add(tower);

          const lobby = new THREE.Mesh(new THREE.BoxGeometry(bw + 1.8, 4, bd + 1.8), kerbWhiteMat);
          lobby.position.y = 2;
          building.add(lobby);

          if (parcel.kind === 'skyscraper') {
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8, 6), poleMat);
            mast.position.y = bh + 4.0;
            const avLight = new THREE.Mesh(
              new THREE.SphereGeometry(0.45, 8, 6),
              new THREE.MeshBasicMaterial({ color: 0xff2020 })
            );
            avLight.position.y = bh + 8.3;
            const avHalo = new THREE.Sprite(
              new THREE.SpriteMaterial({ map: this._glowSpriteTex, color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false })
            );
            avHalo.position.y = bh + 8.3;
            avHalo.scale.set(4.5, 4.5, 1);
            building.add(mast, avLight, avHalo);
          }
        } else {
          building = this._buildNigerianDuplex(bw, bh, bd, parcel.wallHex, parcel.roofHex, winLitMat, worldM);
        }

        building.position.set(bx, 0.2, bz);
        building.rotation.y = parcel.rot;

        // Algorithm #3 (SAT OBB): Register exact rotated Oriented Bounding Box!
        this._addCollisionBox(pos.x + bx, pos.z + bz, bw + 4.5, bd + 4.5, `${id}_building_${i}`, parcel.rot, bh);

        // Graphics Fix #12: MERGE userData.districtId instead of overwriting isWall / isRoof!
        building.traverse((child) => {
          if (child.isMesh) {
            child.userData = child.userData || {};
            child.userData.districtId = id;
          }
        });
        compoundGroup.add(building);

        // Add 1-box distant LOD proxy silhouette
        const proxyBox = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), lowProxyMat);
        proxyBox.position.set(bx, bh * 0.5 + 0.2, bz);
        proxyBox.rotation.y = parcel.rot;
        lowProxy.add(proxyBox);
      }

      group.add(compoundGroup);
      group.add(lowProxy);
      this.scene.add(group);
      this.districtNodes.set(id, { group, ring, beacon: monument, pos, compoundGroup, lowProxy });

      // Register district into Algorithm #7 Frustum + 3-Tier LOD Manager
      this.lodBatcher.registerLOD({
        id,
        pos: new THREE.Vector3(pos.x, 10, pos.z),
        radius: 68,
        highGroup: compoundGroup,
        lowProxy
      });

      const label = document.createElement('button');
      label.type = 'button';
      label.className = `world3d-district-tag ${isZone1 ? 'zone-1' : 'zone-2'}`;
      label.innerHTML = `
        <span class="w3d-tag-sector">Z${d.zone}</span>
        <span class="w3d-tag-name">${d.short}</span>
      `;
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.callbacks.onSelectDistrict) {
          this.callbacks.onSelectDistrict(id);
        }
      });
      this.labelLayer.appendChild(label);
      this.districtLabels.set(id, label);
    }
  }

  _buildIconicLandmarks() {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.9
    });
    const whiteMarble = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.1
    });

    // 1. ABUJA NATIONAL MOSQUE (CBD West)
    const cbdD = DISTRICT_BY_ID.cbd;
    const cbdPos = map2DTo3D(cbdD.x, cbdD.y);
    const mosqueGroup = new THREE.Group();
    mosqueGroup.position.set(cbdPos.x - 42, 0, cbdPos.z - 28);

    const mosqueBase = new THREE.Mesh(new THREE.BoxGeometry(28, 16, 28), whiteMarble);
    mosqueBase.position.y = 8;
    mosqueGroup.add(mosqueBase);

    const goldenDome = new THREE.Mesh(
      new THREE.SphereGeometry(12.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      goldMat
    );
    goldenDome.position.y = 16;
    mosqueGroup.add(goldenDome);

    const minaretOffsets = [
      [-16, -16],
      [16, -16],
      [-16, 16],
      [16, 16]
    ];
    for (const [mx, mz] of minaretOffsets) {
      const minaret = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 48, 12), whiteMarble);
      minaret.position.set(mx, 24, mz);
      mosqueGroup.add(minaret);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.8, 7, 12), goldMat);
      spire.position.set(mx, 51, mz);
      mosqueGroup.add(spire);
    }
    this.scene.add(mosqueGroup);

    // 2. FOUR NNPC TOWERS (CBD North-East — textured glass curtain bands, Fix #40)
    const nnpcMat = new THREE.MeshStandardMaterial({
      map: this._sharedGlassTex || null,
      color: 0x334155,
      emissive: 0x38bdf8,
      emissiveMap: this._sharedGlassTex || null,
      emissiveIntensity: 0.2,
      roughness: 0.14,
      metalness: 0.85,
      envMapIntensity: 1.5
    });
    this.windowMaterials.push(nnpcMat);
    for (let t = 0; t < 4; t++) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 78, 16), nnpcMat);
      tower.position.set(cbdPos.x + 22 + t * 16, 39, cbdPos.z - 22);
      tower.castShadow = true;
      this.scene.add(tower);

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 4, 16), goldMat);
      crown.position.set(cbdPos.x + 22 + t * 16, 79, cbdPos.z - 22);
      this.scene.add(crown);
    }

    // 3. CBN HEADQUARTERS + SPINNING GOLDEN ₦ NAIRA ROOF BEACON (Fixes #30, #40)
    const cbnMat = new THREE.MeshStandardMaterial({
      map: this._sharedGlassTex || null,
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveMap: this._sharedGlassTex || null,
      emissiveIntensity: 0.3,
      roughness: 0.12,
      metalness: 0.88,
      envMapIntensity: 1.6
    });
    this.windowMaterials.push(cbnMat);
    const cbnTower = new THREE.Mesh(new THREE.BoxGeometry(22, 92, 16), cbnMat);
    cbnTower.position.set(cbdPos.x, 46, cbdPos.z + 26);
    cbnTower.castShadow = true;
    this.scene.add(cbnTower);

    const nairaCoin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2.2, 24), goldMat);
    nairaCoin.rotation.x = Math.PI / 2;
    nairaCoin.position.set(cbdPos.x, 102, cbdPos.z + 26);
    this.spinningMeshes.push(nairaCoin);
    this.scene.add(nairaCoin);

    // 4. ABUJA CITY GATE ARCHWAY (Airport Road between Lugbe & Garki)
    const lugbeD = DISTRICT_BY_ID.lugbe;
    const garkiD = DISTRICT_BY_ID.garki;
    const lugbePos = map2DTo3D(lugbeD.x, lugbeD.y);
    const garkiPos = map2DTo3D(garkiD.x, garkiD.y);
    const gateX = (garkiPos.x + lugbePos.x) * 0.5;
    const gateZ = (garkiPos.z + lugbePos.z) * 0.5;
    const gateGroup = new THREE.Group();
    gateGroup.position.set(gateX, 0, gateZ);

    const wingLeft = new THREE.Mesh(new THREE.ConeGeometry(8, 34, 4), whiteMarble);
    wingLeft.position.set(-16, 17, 0);
    wingLeft.rotation.z = -0.22;
    gateGroup.add(wingLeft);

    const wingRight = new THREE.Mesh(new THREE.ConeGeometry(8, 34, 4), whiteMarble);
    wingRight.position.set(16, 17, 0);
    wingRight.rotation.z = 0.22;
    gateGroup.add(wingRight);

    const gateBeam = new THREE.Mesh(
      new THREE.BoxGeometry(40, 4.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.4 })
    );
    gateBeam.position.set(0, 22, 0);
    gateGroup.add(gateBeam);
    this.scene.add(gateGroup);

    // 5. WUSE 2 NEON NIGHTLIFE ARCHES
    const wuseD = DISTRICT_BY_ID.wuse2;
    const wusePos = map2DTo3D(wuseD.x, wuseD.y);
    const neonColors = [0xec4899, 0x38bdf8, 0xfacc15];
    for (let n = 0; n < 3; n++) {
      const neonRing = new THREE.Mesh(
        new THREE.TorusGeometry(14, 0.9, 8, 24, Math.PI),
        new THREE.MeshBasicMaterial({ color: neonColors[n] })
      );
      neonRing.position.set(wusePos.x - 16 + n * 16, 1, wusePos.z);
      this.scene.add(neonRing);
    }

    // 6. ZUMA ROCK MONOLITH ("GATEWAY TO ABUJA" - North-West beyond Kubwa)
    const kubwaD = DISTRICT_BY_ID.kubwa;
    const kubwaPos = map2DTo3D(kubwaD.x, kubwaD.y);
    const zumaGroup = new THREE.Group();
    zumaGroup.position.set(kubwaPos.x - 75, 0, kubwaPos.z - 65);

    const zumaRockMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.88,
      metalness: 0.15,
      flatShading: true
    });
    const zumaMain = new THREE.Mesh(new THREE.DodecahedronGeometry(68, 1), zumaRockMat);
    zumaMain.scale.set(1.35, 1.85, 0.95);
    zumaMain.position.y = 48;
    zumaMain.castShadow = true;
    zumaGroup.add(zumaMain);

    // Subtle glowing natural "Human Face" etching on Zuma Rock's south cliff
    const faceGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 2), faceGlowMat);
    leftEye.position.set(-12, 68, 56);
    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 2), faceGlowMat);
    rightEye.position.set(12, 68, 56);
    const noseRidge = new THREE.Mesh(new THREE.BoxGeometry(2.8, 14, 2.5), faceGlowMat);
    noseRidge.position.set(0, 58, 58);
    zumaGroup.add(leftEye, rightEye, noseRidge);
    this.scene.add(zumaGroup);

    // 7. MPAPE CRUSHED ROCK BLUE LAGOON (Quarry Cliffs & Turquoise Water)
    const mpapeD = DISTRICT_BY_ID.mpape;
    const mpapePos = map2DTo3D(mpapeD.x, mpapeD.y);
    const lagoonGroup = new THREE.Group();
    lagoonGroup.position.set(mpapePos.x + 28, 0, mpapePos.z - 26);

    const lagoonWater = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 20, 1.2, 24),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 0.35,
        roughness: 0.15,
        metalness: 0.8
      })
    );
    lagoonWater.position.y = 0.7;
    lagoonGroup.add(lagoonWater);

    for (let c = 0; c < 7; c++) {
      const angle = (c / 7) * Math.PI * 1.35 - Math.PI * 0.2;
      const cliff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(11 + (c % 3) * 3, 0),
        zumaRockMat
      );
      cliff.scale.set(1, 2.1, 1);
      cliff.position.set(Math.cos(angle) * 22, 12, Math.sin(angle) * 22);
      lagoonGroup.add(cliff);
    }
    this.scene.add(lagoonGroup);

    // 8. MAGICLAND AMUSEMENT PARK FERRIS WHEEL (Fix #20: True Z-Axle Spin + 12 Spokes + 12 Gondola Cabins!)
    const ferrisGroup = new THREE.Group();
    ferrisGroup.position.set(gateX + 42, 0, gateZ - 14);

    const legLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 30, 8), whiteMarble);
    legLeft.position.set(-6, 14, 0);
    legLeft.rotation.z = -0.2;
    const legRight = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 30, 8), whiteMarble);
    legRight.position.set(6, 14, 0);
    legRight.rotation.z = 0.2;
    ferrisGroup.add(legLeft, legRight);

    const wheelAssembly = new THREE.Group();
    wheelAssembly.position.set(0, 26, 0);
    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(16, 0.85, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 0.45, roughness: 0.3 })
    );
    wheelAssembly.add(wheelRim);
    const spokeGeo = new THREE.CylinderGeometry(0.18, 0.18, 32, 6);
    const cabGeo = new THREE.BoxGeometry(1.9, 1.9, 1.9);
    const cabColors = [0xfacc15, 0x38bdf8, 0x4ade80, 0xf472b6];
    for (let sp = 0; sp < 6; sp++) {
      const spoke = new THREE.Mesh(spokeGeo, whiteMarble);
      spoke.rotation.z = (sp / 6) * Math.PI;
      wheelAssembly.add(spoke);
    }
    for (let cb = 0; cb < 12; cb++) {
      const a = (cb / 12) * Math.PI * 2;
      const cab = new THREE.Mesh(cabGeo, new THREE.MeshStandardMaterial({ color: cabColors[cb % cabColors.length], roughness: 0.35 }));
      cab.position.set(Math.cos(a) * 16, Math.sin(a) * 16, 0);
      wheelAssembly.add(cab);
    }
    this.axleSpinningMeshes.push(wheelAssembly);
    ferrisGroup.add(wheelAssembly);
    this.scene.add(ferrisGroup);

    // 9. MILLENNIUM PARK & MILLENNIUM TOWER SPIRE (Maitama / CBD Border)
    const maitamaD = DISTRICT_BY_ID.maitama;
    const maitamaPos = map2DTo3D(maitamaD.x, maitamaD.y);
    const milParkGroup = new THREE.Group();
    milParkGroup.position.set((maitamaPos.x + cbdPos.x) * 0.5 + 18, 0, (maitamaPos.z + cbdPos.z) * 0.5);

    const parkLawn = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 24, 0.7, 24),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 })
    );
    parkLawn.position.y = 0.35;
    milParkGroup.add(parkLawn);

    const milSpire = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, 115, 16),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.25,
        metalness: 0.85,
        roughness: 0.2
      })
    );
    milSpire.position.y = 57.5;
    milParkGroup.add(milSpire);
    this.scene.add(milParkGroup);

    // 10. ASO DRIVE PRESIDENTIAL BOULEVARD & GOLDEN VILLA ARCH (Asokoro / Maitama)
    const asokoroD = DISTRICT_BY_ID.asokoro;
    const asokoroPos = asokoroD ? map2DTo3D(asokoroD.x, asokoroD.y) : { x: 200, z: 120 };
    const asoDriveGroup = new THREE.Group();
    asoDriveGroup.position.set(asokoroPos.x - 18, 0, asokoroPos.z - 22);
    const asoPillarL = new THREE.Mesh(new THREE.BoxGeometry(3.2, 22, 3.2), whiteMarble);
    asoPillarL.position.set(-12, 11, 0);
    const asoPillarR = new THREE.Mesh(new THREE.BoxGeometry(3.2, 22, 3.2), whiteMarble);
    asoPillarR.position.set(12, 11, 0);
    const asoCrown = new THREE.Mesh(new THREE.BoxGeometry(30, 3.6, 4.2), goldMat);
    asoCrown.position.set(0, 23, 0);
    asoDriveGroup.add(asoPillarL, asoPillarR, asoCrown);
    this.scene.add(asoDriveGroup);

    // 11. JABI LAKE BOAT CLUB PIER & LUXURY YACHT (Jabi Waterfront)
    const jabiD = DISTRICT_BY_ID.jabi;
    if (jabiD) {
      const jabiPos = map2DTo3D(jabiD.x, jabiD.y);
      const boatClubGroup = new THREE.Group();
      boatClubGroup.position.set(jabiPos.x - 36, 0, jabiPos.z + 18);

      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(26, 1.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
      );
      pier.position.set(0, 1.4, 0);
      boatClubGroup.add(pier);

      // Luxury White Yacht on Jabi Lake
      const yachtHull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 4.6), whiteMarble);
      yachtHull.position.set(14, 1.8, 4);
      const yachtCabin = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 3.6), goldMat);
      yachtCabin.position.set(13, 3.8, 4);
      boatClubGroup.add(yachtHull, yachtCabin);
      this.scene.add(boatClubGroup);
    }

    // 12. LAGOS ISLAND: LEKKI-IKOYI CABLE LINK BRIDGE, LAGOON & EKO ATLANTIC TOWERS
    const lagosIslD = DISTRICT_BY_ID.lagos_island;
    const lagosMainD = DISTRICT_BY_ID.lagos_mainland;
    if (lagosIslD && lagosMainD) {
      const islPos = map2DTo3D(lagosIslD.x, lagosIslD.y);
      const mainPos = map2DTo3D(lagosMainD.x, lagosMainD.y);

      // Lagos Lagoon Water Expanse (Fix #26: Animated reflective water normalMap)
      const lagoonMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(85, 85, 0.8, 36),
        new THREE.MeshPhysicalMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.2,
          normalMap: this.waterNormalMaps[0] || null,
          normalScale: new THREE.Vector2(0.45, 0.45),
          roughness: 0.08,
          metalness: 0.28,
          clearcoat: 1.0,
          transparent: true,
          opacity: 0.92
        })
      );
      lagoonMesh.position.set((islPos.x + mainPos.x) * 0.5, 0.3, (islPos.z + mainPos.z) * 0.5 + 15);
      this.scene.add(lagoonMesh);

      // Iconic Lekki-Ikoyi Cable-Stayed Bridge Pylon, Suspended Deck & Cables (Fix #40)
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set((islPos.x + mainPos.x) * 0.5, 0, (islPos.z + mainPos.z) * 0.5);

      const bridgeDeck = new THREE.Mesh(
        new THREE.BoxGeometry(58, 1.4, 9.5),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
      );
      bridgeDeck.position.set(0, 4.5, 0);
      bridgeGroup.add(bridgeDeck);

      const pylon = new THREE.Mesh(new THREE.ConeGeometry(4.2, 68, 4), whiteMarble);
      pylon.position.set(0, 34, 0);
      bridgeGroup.add(pylon);

      const cableMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      for (let c = -3; c <= 3; c++) {
        if (c === 0) continue;
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 48, 6), cableMat);
        cable.position.set(c * 6, 26, 0);
        cable.rotation.z = c > 0 ? 0.42 : -0.42;
        bridgeGroup.add(cable);
      }
      this.scene.add(bridgeGroup);
    }

    // 13. MARKETWISHES.COM SMART SHOPPING CENTER & LOGISTICS MALL (Jabi Hub, Fix #30)
    if (jabiD) {
      const jabiPos = map2DTo3D(jabiD.x, jabiD.y);
      const mwGroup = new THREE.Group();
      mwGroup.position.set(jabiPos.x + 28, 0, jabiPos.z - 22);

      const mallMat = new THREE.MeshStandardMaterial({
        map: this._sharedGlassTex || null,
        color: 0x3b82f6,
        emissive: 0x7c3aed,
        emissiveIntensity: 0.35,
        metalness: 0.85,
        roughness: 0.16
      });
      this.windowMaterials.push(mallMat);
      const mallBase = new THREE.Mesh(new THREE.BoxGeometry(28, 16, 20), mallMat);
      mallBase.position.set(0, 8, 0);
      mwGroup.add(mallBase);

      const mwCrown = new THREE.Mesh(
        new THREE.OctahedronGeometry(4.5, 0),
        goldMat
      );
      mwCrown.position.set(0, 21, 0);
      this.spinningMeshes.push(mwCrown);
      mwGroup.add(mwCrown);

      this.scene.add(mwGroup);
    }

    // 14. IBB INTERNATIONAL GOLF COURSE & ASO ROCK PARK GREEN (Maitama Tourist Attraction)
    if (maitamaD) {
      const ibbGroup = new THREE.Group();
      ibbGroup.position.set(maitamaPos.x + 32, 0, maitamaPos.z - 26);
      const fairway = new THREE.Mesh(
        new THREE.CylinderGeometry(20, 22, 0.9, 24),
        new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.75 })
      );
      fairway.position.y = 0.45;
      const sandBunker = new THREE.Mesh(
        new THREE.CylinderGeometry(5.5, 6, 1.0, 16),
        new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.9 })
      );
      sandBunker.position.set(8, 0.5, 5);
      const flagPin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 12, 8), whiteMarble);
      flagPin.position.set(-4, 6, -3);
      ibbGroup.add(fairway, sandBunker, flagPin);
      this.scene.add(ibbGroup);
    }

    // 15. UNIVERSITY OF ABUJA & BAZE UNIVERSITY ACADEMIC CAMPUS
    const bazeGroup = new THREE.Group();
    bazeGroup.position.set(cbdPos.x - 70, 0, cbdPos.z - 85);
    const facultyMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 });
    const facultyBody = new THREE.Mesh(new THREE.BoxGeometry(32, 16, 20), facultyMat);
    facultyBody.position.y = 8;
    bazeGroup.add(facultyBody);

    for (let cp = -3; cp <= 3; cp++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 12, 10), whiteMarble);
      col.position.set(cp * 4.0, 6, 10.5);
      bazeGroup.add(col);
    }
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(16, 4.5, 4), whiteMarble);
    pediment.rotation.y = Math.PI / 4;
    pediment.position.set(0, 18, 10.5);
    bazeGroup.add(pediment);

    const clockTower = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 6), whiteMarble);
    clockTower.position.set(0, 20, 0);
    const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 16), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    clockFace.rotation.x = Math.PI / 2;
    clockFace.position.set(0, 22, 3.1);
    bazeGroup.add(clockTower, clockFace);

    const uniSignTex = this._makeCanvasTex(512, 128, (ctx, W, H) => {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎓 UNIVERSITY OF ABUJA & BAZE', W / 2, 54);
      ctx.fillStyle = '#ffffff';
      ctx.font = '22px sans-serif';
      ctx.fillText('FACULTY OF LAW, TECH & ADMINISTRATION', W / 2, 94);
    });
    const uniSign = new THREE.Mesh(new THREE.BoxGeometry(16, 3.0, 0.4), new THREE.MeshBasicMaterial({ map: uniSignTex }));
    uniSign.position.set(0, 14.5, 11);
    bazeGroup.add(uniSign);
    this.scene.add(bazeGroup);
    this._addCollisionBox(cbdPos.x - 70, cbdPos.z - 85, 34, 24, 'university_campus');

    // 16. NIGERIAN GENERAL ELECTION CAMPAIGN BILLBOARDS
    const billboardTex = this._makeCanvasTex(512, 256, (ctx, W, H) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      // APC banner left
      ctx.fillStyle = '#15803d';
      ctx.fillRect(0, 0, W / 3, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('VOTE APC 🧹', 15, 75);
      ctx.font = '15px sans-serif';
      ctx.fillText('Renewed Hope', 15, 110);

      // PDP banner middle
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(W / 3, 0, W / 3, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('VOTE PDP ☂️', W / 3 + 15, 75);
      ctx.font = '15px sans-serif';
      ctx.fillText('Power to People', W / 3 + 15, 110);

      // LP banner right
      ctx.fillStyle = '#ea580c';
      ctx.fillRect((2 * W) / 3, 0, W / 3, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('VOTE LP 👨‍👩‍👧', (2 * W) / 3 + 15, 75);
      ctx.font = '15px sans-serif';
      ctx.fillText('Forward Ever!', (2 * W) / 3 + 15, 110);
    });

    // Graphics Fix #40: Framed 2-Sided Lit Election Billboard (No mirrored back face, obeys scene lighting & fog)
    const bbGroup = new THREE.Group();
    bbGroup.position.set(cbdPos.x - 12, 0, cbdPos.z - 65);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.75 });
    const bbBacking = new THREE.Mesh(new THREE.BoxGeometry(20.6, 8.6, 0.65), frameMat);
    bbBacking.position.y = 10;
    const bbFaceMat = new THREE.MeshStandardMaterial({
      map: billboardTex,
      emissiveMap: billboardTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.45
    });
    const bbFront = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), bbFaceMat);
    bbFront.position.set(0, 10, 0.36);
    const bbBack = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), bbFaceMat);
    bbBack.position.set(0, 10, -0.36);
    bbBack.rotation.y = Math.PI;
    const bbPoleL = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 11, 8), frameMat);
    bbPoleL.position.set(-7, 5.5, 0);
    const bbPoleR = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 11, 8), frameMat);
    bbPoleR.position.set(7, 5.5, 0);
    bbGroup.add(bbBacking, bbFront, bbBack, bbPoleL, bbPoleR);
    this.scene.add(bbGroup);
    this._addCollisionBox(cbdPos.x - 12, cbdPos.z - 65, 20, 4, 'election_billboard', 0, 14);

    // Register Major Landmark Obstacle Collision Boxes
    this._addCollisionBox(cbdPos.x - 42, cbdPos.z - 28, 34, 34, 'national_mosque', 0, 32);
    this._addCollisionBox(cbdPos.x, cbdPos.z + 26, 26, 20, 'cbn_hq', 0, 92);
    for (let t = 0; t < 4; t++) {
      this._addCollisionBox(cbdPos.x + 22 + t * 16, cbdPos.z - 22, 14, 14, 'nnpc_tower_' + t, 0, 78);
    }
    this._addCollisionBox(gateX, gateZ, 36, 12, 'city_gate', 0, 26);
  }

  // Feature #13: 3D Street Vendors (Mai Suya Grill Spots, Roasted Corn Stands & OPay POS Kiosks)
  _buildStreetVendors() {
    this.streetVendors = [];
    const vendorDistricts = [
      { id: 'wuse2', type: 'suya', name: 'Maitama/Wuse 2 Yahuza Suya Spot', offset: { x: 14, z: 12 } },
      { id: 'cbd', type: 'pos', name: 'OPay / FirstMonie Fast POS Kiosk', offset: { x: -15, z: 14 } },
      { id: 'garki', type: 'corn', name: 'Mama Ngozi Roasted Corn & Ube Stand', offset: { x: 15, z: -12 } },
      { id: 'maitama', type: 'suya', name: 'Alhaji Musa Pepper Suya & Kilishi', offset: { x: -14, z: 13 } },
      { id: 'kubwa', type: 'pos', name: 'Kubwa Express POS & Airtime Kiosk', offset: { x: 14, z: 11 } },
      { id: 'nyanya', type: 'corn', name: 'Nyanya Bridge Roasted Corn & Pear', offset: { x: -13, z: 12 } },
      { id: 'jabi', type: 'suya', name: 'Jabi Waterfront Smoked Fish & Suya', offset: { x: 15, z: -13 } },
      { id: 'lugbe', type: 'pos', name: 'Airport Road OPay POS Umbrella', offset: { x: -14, z: -11 } }
    ];

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.8 });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const posYellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 });
    const opayGreenMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const vShadowMat = new THREE.MeshBasicMaterial({
      map: this._contactShadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const vShadowGeo = new THREE.PlaneGeometry(4.4, 3.6).rotateX(-Math.PI / 2);

    for (const v of vendorDistricts) {
      const d = DISTRICT_BY_ID[v.id];
      if (!d) continue;
      const basePos = map2DTo3D(d.x, d.y);
      const vx = basePos.x + v.offset.x;
      const vz = basePos.z + v.offset.z;
      const group = new THREE.Group();
      group.position.set(vx, 0, vz);

      // Soft baked contact shadow (Fix #3)
      const sh = new THREE.Mesh(vShadowGeo, vShadowMat);
      sh.position.y = 0.24;
      group.add(sh);

      if (v.type === 'suya') {
        const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 1.6), woodMat);
        table.position.y = 0.65;
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 2.6, 12).rotateZ(Math.PI / 2), steelMat);
        drum.position.set(0, 1.45, 0);
        const embers = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 1.1), emberMat);
        embers.position.set(0, 1.78, 0);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        lantern.position.set(1.2, 2.7, 0);
        const lanternHalo = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this._glowSpriteTex, color: 0xfde047, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        lanternHalo.position.set(1.2, 2.7, 0);
        lanternHalo.scale.set(2.4, 2.4, 1);
        group.add(table, drum, embers, lantern, lanternHalo);
      } else if (v.type === 'corn') {
        const stand = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.5), woodMat);
        stand.position.y = 0.6;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 8), steelMat);
        pole.position.y = 1.8;
        const umbrella = new THREE.Mesh(
          new THREE.ConeGeometry(2.4, 0.9, 12),
          new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.5 })
        );
        umbrella.position.y = 3.6;
        const emberTray = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.9), emberMat);
        emberTray.position.y = 1.28;
        group.add(stand, pole, umbrella, emberTray);
      } else {
        const booth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.0), posYellowMat);
        booth.position.y = 1.3;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 2.2), opayGreenMat);
        sign.position.y = 2.75;
        group.add(booth, sign);
      }

      this.scene.add(group);
      this.streetVendors.push({
        id: `${v.id}_${v.type}`,
        districtId: v.id,
        type: v.type,
        name: v.name,
        x: vx,
        z: vz,
        group
      });
    }
  }

  // Feature #17 + Graphics Fixes #9, #17, #18: Grounded Pylon Support + Volumetric Neon Glow Halos + Fixed Pulse
  _buildWuse2NightlifeNeons() {
    const spots = [
      { id: 'wuse2', title: '🪩 CLUB QUILOX ABUJA', sub: 'VIP LOUNGE & BOTTLE SERVICE', color: 0xec4899, glow: 0xf43f5e, dx: -16, dz: -12 },
      { id: 'wuse2', title: '🔥 HUSTLE & BUSTLE', sub: 'AFROBEATS NIGHTLIFE', color: 0x06b6d4, glow: 0x38bdf8, dx: 18, dz: -15 },
      { id: 'maitama', title: '🥂 TRANSCORP VIP CLUB', sub: 'EXECUTIVE LOUNGE', color: 0xfacc15, glow: 0xf59e0b, dx: 16, dz: 14 },
      { id: 'cbd', title: '💎 CENTRAL SKY LOUNGE', sub: 'ROOFTOP COCKTAILS', color: 0xa855f7, glow: 0xc084fc, dx: -18, dz: -14 }
    ];
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.85 });
    const pylonGeo = new THREE.CylinderGeometry(0.24, 0.3, 8.2, 8);

    for (const s of spots) {
      const d = DISTRICT_BY_ID[s.id];
      if (!d) continue;
      const basePos = map2DTo3D(d.x, d.y);
      const nx = basePos.x + s.dx;
      const nz = basePos.z + s.dz;

      const neonTex = this._makeCanvasTex(512, 160, (ctx, W, H) => {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#' + s.color.toString(16).padStart(6, '0');
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, W - 16, H - 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.title, W / 2, 68);
        ctx.fillStyle = '#' + s.glow.toString(16).padStart(6, '0');
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(s.sub, W / 2, 118);
      });

      const signGroup = new THREE.Group();
      signGroup.position.set(nx, 0, nz);

      // Fix #18: Grounded steel support pylons & steel signboard frame
      const pL = new THREE.Mesh(pylonGeo, pylonMat);
      pL.position.set(-4.6, 4.1, 0);
      const pR = new THREE.Mesh(pylonGeo, pylonMat);
      pR.position.set(4.6, 4.1, 0);
      const casing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 3.9, 0.55), pylonMat);
      casing.position.y = 7.5;
      const faceMat = new THREE.MeshBasicMaterial({ map: neonTex });
      const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.6), faceMat);
      frontFace.position.set(0, 7.5, 0.3);
      const backFace = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.6), faceMat);
      backFace.position.set(0, 7.5, -0.3);
      backFace.rotation.y = Math.PI;
      signGroup.add(pL, pR, casing, frontFace, backFace);

      // Fix #9: Additive HDR Neon Glow Halo Sprite around Signboard
      const glowMat = new THREE.SpriteMaterial({
        map: this._glowSpriteTex,
        color: s.glow,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const glowSprite = new THREE.Sprite(glowMat);
      glowSprite.position.set(0, 7.5, 0);
      glowSprite.scale.set(18, 9, 1);
      signGroup.add(glowSprite);

      // Volumetric ground neon light pool on the asphalt (Fix #22 polygonOffset)
      const poolMat = new THREE.MeshBasicMaterial({
        map: this._glowSpriteTex,
        color: s.color,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
      });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), poolMat);
      pool.position.y = 0.60;
      signGroup.add(pool);

      this.scene.add(signGroup);
      this.neonPulses.push({ poolMat, glowMat, baseColor: s.color, phase: Math.random() * Math.PI * 2 });
    }
  }

  // Feature #15 + Graphics Fix #44: World-Space Rain Streaks, Raindrop Ground Splash Ripples & Soft Circular Harmattan Dust
  _initWeatherParticles() {
    this.weatherGroup = new THREE.Group();
    this.scene.add(this.weatherGroup);

    // 1. World-Space Falling Rain Streak Lines
    const rainCount = 460;
    const rainPos = new Float32Array(rainCount * 6);
    for (let i = 0; i < rainCount; i++) {
      const rx = (Math.random() - 0.5) * 140;
      const ry = Math.random() * 58;
      const rz = (Math.random() - 0.5) * 140;
      const idx = i * 6;
      rainPos[idx] = rx;
      rainPos[idx + 1] = ry;
      rainPos[idx + 2] = rz;
      rainPos[idx + 3] = rx - 0.5;
      rainPos[idx + 4] = ry - 3.2;
      rainPos[idx + 5] = rz;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.58 });
    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.visible = false;
    this.rainLines.frustumCulled = false;
    this.weatherGroup.add(this.rainLines);

    // 1B. Animated Circular Ground Raindrop Splash Rings (Fix #44)
    const splashGeo = new THREE.RingGeometry(0.18, 0.34, 12).rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });
    this.rainSplashes = [];
    for (let i = 0; i < 24; i++) {
      const ring = new THREE.Mesh(splashGeo, splashMat);
      ring.visible = false;
      this.scene.add(ring);
      this.rainSplashes.push({ mesh: ring, life: Math.random(), maxLife: 0.45 + Math.random() * 0.25 });
    }

    // 2. Soft Radial Harmattan Saharan Dust Motes (Fix #44: Soft Alpha Sprite Texture instead of harsh WebGL squares!)
    const dustCount = 280;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 150;
      dustPos[i * 3 + 1] = 1 + Math.random() * 28;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      map: this._dustSpriteTex,
      color: 0xfde68a,
      size: 2.2,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    this.harmattanPoints = new THREE.Points(dustGeo, dustMat);
    this.harmattanPoints.visible = false;
    this.weatherGroup.add(this.harmattanPoints);
  }

  // Feature #6 + Algorithm #1: Weighted A* 3D GPS Route Navigation Ribbon
  _initGPSRouteRibbon() {
    this.gpsRouteGroup = new THREE.Group();
    this.scene.add(this.gpsRouteGroup);
  }

  setGPSRouteDestination(targetDistrictId) {
    if (!this.gpsRouteGroup) return;
    if (this.gpsTargetDistrict === targetDistrictId && this._gpsStartDistrict === this.currentDistrictId && this.gpsPathPoints.length > 0) {
      return;
    }
    this.gpsTargetDistrict = targetDistrictId;
    this._gpsStartDistrict = this.currentDistrictId;

    while (this.gpsRouteGroup.children.length > 0) {
      const ch = this.gpsRouteGroup.children[0];
      this.gpsRouteGroup.remove(ch);
      this._disposeObject3D(ch);
    }
    this.gpsPathPoints = [];
    if (!targetDistrictId || targetDistrictId === this.currentDistrictId) return;

    const startId = this.currentDistrictId || 'cbd';
    const isPeak = (this.hourOfDay >= 7 && this.hourOfDay <= 10) || (this.hourOfDay >= 16 && this.hourOfDay <= 19);
    const isWet = this.weather === 'rain' || this.weather === 'storm' || this.weather === 'downpour';

    // Algorithm #1: Weighted A* Pathfinding with traffic congestion & weather awareness
    let bestPath = this.router.findDistrictPath(startId, targetDistrictId, { isPeak, isWet, avoidRail: true });
    if (!bestPath || bestPath.length < 2) {
      bestPath = [startId, targetDistrictId];
    }

    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });

    for (let i = 0; i < bestPath.length; i++) {
      const d = DISTRICT_BY_ID[bestPath[i]];
      if (d) this.gpsPathPoints.push({ x: d.x, y: d.y, x2d: d.x, y2d: d.y, id: d.id });
      if (i < bestPath.length - 1) {
        const dA = DISTRICT_BY_ID[bestPath[i]];
        const dB = DISTRICT_BY_ID[bestPath[i + 1]];
        if (!dA || !dB) continue;
        const pA = map2DTo3D(dA.x, dA.y);
        const pB = map2DTo3D(dB.x, dB.y);
        const dx = pB.x - pA.x;
        const dz = pB.z - pA.z;
        const len = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        const segMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.7, len).rotateX(-Math.PI / 2),
          ribbonMat
        );
        segMesh.position.set((pA.x + pB.x) * 0.5, 0.62, (pA.z + pB.z) * 0.5);
        segMesh.rotation.y = angle;
        this.gpsRouteGroup.add(segMesh);
      }
    }
  }

  // Feature #7: Procedural 3D Police / VIO Hilux Pursuit Pickup Mesh with Flashing Lightbar
  _buildAmbientCarMesh(colorHex = 0x0f172a, type = 'police') {
    const carGroup = new THREE.Group();
    const w = 3.2;
    const h = 2.2;
    const l = 6.8;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.25,
      metalness: 0.75
    });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x020617,
      roughness: 0.15,
      metalness: 0.9
    });
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.75 });

    // Grounded soft contact shadow (Fix #3)
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.45, l * 1.18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this._contactShadowTex,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
      })
    );
    sh.position.y = 0.25;
    carGroup.add(sh);

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.58, l), bodyMat);
    body.position.y = h * 0.32 + 0.52;
    body.castShadow = true;
    carGroup.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, h * 0.46, l * 0.54), cabinMat);
    cabin.position.set(0, h * 0.78 + 0.45, -l * 0.04);
    carGroup.add(cabin);

    const wheels = [];
    const wOffX = w * 0.5;
    const wOffZ = l * 0.32;
    for (const [wx, wz] of [[-wOffX, wOffZ], [wOffX, wOffZ], [-wOffX, -wOffZ], [wOffX, -wOffZ]]) {
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wMesh.position.set(wx, 0.55, wz);
      carGroup.add(wMesh);
      wheels.push(wMesh);
    }
    carGroup.userData.wheels = wheels;

    if (type === 'police') {
      const beaconRed = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.35, 0.55),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      beaconRed.position.set(-0.48, h + 0.65, 0);
      carGroup.add(beaconRed);

      const beaconBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.35, 0.55),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
      );
      beaconBlue.position.set(0.48, h + 0.65, 0);
      carGroup.add(beaconBlue);
      carGroup.userData.policeBeacons = { red: beaconRed, blue: beaconBlue };
    }

    return carGroup;
  }

  _buildTrafficSwarm() {
    if (!this.roadSegments.length) return;

    // Build road-segment adjacency index by district node for smooth intersection transitions (Fix #46)
    this.roadSegmentsByDistrict = new Map();
    for (const seg of this.roadSegments) {
      if (seg.isRail) continue;
      if (!this.roadSegmentsByDistrict.has(seg.edge.a)) this.roadSegmentsByDistrict.set(seg.edge.a, []);
      if (!this.roadSegmentsByDistrict.has(seg.edge.b)) this.roadSegmentsByDistrict.set(seg.edge.b, []);
      this.roadSegmentsByDistrict.get(seg.edge.a).push(seg);
      this.roadSegmentsByDistrict.get(seg.edge.b).push(seg);
    }

    const vehiclePalettes = [
      { color: 0xf8fafc, cabin: 0x0f172a, trim: 0xef4444, w: 3.1, h: 1.55, l: 6.2, speed: 0.34, type: 'sports_coupe' },
      { color: 0xfacc15, cabin: 0x1e293b, trim: 0x111827, w: 2.8, h: 1.75, l: 5.4, speed: 0.24, type: 'taxi' },
      { color: 0x10b981, cabin: 0x0f172a, trim: 0xf8fafc, w: 2.8, h: 1.75, l: 5.4, speed: 0.26, type: 'taxi' },
      { color: 0x0f172a, cabin: 0x020617, trim: 0x38bdf8, w: 3.4, h: 2.35, l: 6.5, speed: 0.35, type: 'vip_suv' },
      { color: 0xeab308, cabin: 0x1c1917, trim: 0x111827, w: 2.1, h: 1.95, l: 3.4, speed: 0.17, type: 'keke' },
      { color: 0x1e3a8a, cabin: 0x0f172a, trim: 0xef4444, w: 3.2, h: 2.2, l: 6.8, speed: 0.38, type: 'police_patrol' },
      { color: 0x059669, cabin: 0x064e3b, trim: 0xfacc15, w: 4.2, h: 3.6, l: 18.0, speed: 0.42, type: 'train' }
    ];

    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.75 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const cShadowMat = new THREE.MeshBasicMaterial({
      map: this._contactShadowTex,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3
    });

    for (let i = 0; i < 46; i++) {
      const seg = this.roadSegments[i % this.roadSegments.length];
      // Graphics Fix #19: Select vehiclePalettes[6] (Abuja Metro Train) on rail tracks instead of police car!
      const spec = seg.isRail
        ? vehiclePalettes[6]
        : vehiclePalettes[i % (vehiclePalettes.length - 1)];

      const carGroup = new THREE.Group();
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: 0.22,
        metalness: 0.65,
        clearcoat: 0.6
      });
      const cabinMat = new THREE.MeshStandardMaterial({
        color: spec.cabin,
        roughness: 0.12,
        metalness: 0.9
      });

      const sh = new THREE.Mesh(new THREE.PlaneGeometry(spec.w * 1.45, spec.l * 1.18).rotateX(-Math.PI / 2), cShadowMat);
      sh.position.y = 0.25;
      carGroup.add(sh);

      const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h * 0.58, spec.l), bodyMat);
      body.position.y = spec.h * 0.32 + 0.52;
      carGroup.add(body);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.84, spec.h * 0.46, spec.l * 0.54), cabinMat);
      cabin.position.set(0, spec.h * 0.78 + 0.45, -spec.l * 0.04);
      carGroup.add(cabin);

      const wheels = [];
      if (!seg.isRail) {
        const wOffX = spec.w * 0.5;
        const wOffZ = spec.l * 0.32;
        for (const [wx, wz] of [[-wOffX, wOffZ], [wOffX, wOffZ], [-wOffX, -wOffZ], [wOffX, -wOffZ]]) {
          const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
          wMesh.position.set(wx, 0.55, wz);
          carGroup.add(wMesh);
          wheels.push(wMesh);
        }
      }
      carGroup.userData.wheels = wheels;

      if (spec.type === 'sports_coupe') {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(spec.w * 0.96, 0.14, 0.55),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
        );
        wing.position.set(0, spec.h * 0.75 + 0.55, -spec.l * 0.45);
        carGroup.add(wing);
      }

      const hl = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.82, 0.32, 0.25), headMat);
      hl.position.set(0, spec.h * 0.38 + 0.5, spec.l * 0.51);
      carGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.85, 0.32, 0.25), tailMat);
      tl.position.set(0, spec.h * 0.38 + 0.5, -spec.l * 0.51);
      carGroup.add(tl);

      if (spec.type === 'vip_suv') {
        const strobe = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.32, 0.55),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
        );
        strobe.position.set(0, spec.h + 0.65, 0);
        carGroup.add(strobe);
      }

      if (spec.type === 'police_patrol') {
        // Red & Blue flashing police lightbar
        const beaconRed = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.35, 0.55),
          new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        beaconRed.position.set(-0.48, spec.h + 0.65, 0);
        carGroup.add(beaconRed);

        const beaconBlue = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.35, 0.55),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
        );
        beaconBlue.position.set(0.48, spec.h + 0.65, 0);
        carGroup.add(beaconBlue);
        carGroup.userData.policeBeacons = { red: beaconRed, blue: beaconBlue };
      }

      this.scene.add(carGroup);
      this.trafficCars.push({
        group: carGroup,
        seg,
        t: Math.random(),
        dir: i % 2 === 0 ? 1 : -1,
        speed: spec.speed,
        type: spec.type,
        color: spec.color,
        laneOffset: seg.isRail ? 0 : (i % 2 === 0 ? 3.2 : -3.2)
      });
    }
  }

  _buildHumanoidRig({
    jacketColor = 0xf472b6,
    shirtColor = 0xf8fafc,
    pantsColor = 0x111827,
    shoeColor = 0xfacc15,
    skinColor = 0x6b3e26,
    hairColor = 0x090d16,
    hairstyle = 'fade',
    glasses = 'none',
    fabricPattern = 'solid',
    agbadaDrape = false,
    gender = 'male'
  } = {}) {
    const root = new THREE.Group();

    // Graphics Fix #3: Grounded soft radial contact shadow disc under feet
    if (this._contactShadowTex) {
      const footShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.15, 2.15).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          map: this._contactShadowTex,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3
        })
      );
      footShadow.position.y = 0.05;
      root.add(footShadow);
    }

    const fabTex = fabricPattern !== 'solid' && typeof this._createFabricTexture === 'function'
      ? this._createFabricTexture(fabricPattern, jacketColor, shirtColor)
      : null;

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.46, metalness: 0.08 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.82 });
    const jacketMat = new THREE.MeshStandardMaterial({
      color: fabTex ? 0xffffff : jacketColor,
      map: fabTex || null,
      roughness: 0.4,
      metalness: 0.1
    });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.48 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.58 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.32, metalness: 0.15 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x4a2518, roughness: 0.52 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.16 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.35, metalness: 0.3 });

    // --- 1. ATHLETIC ANATOMICAL TORSO (Tapered V-Shape Chest + Open Jacket + Fitted Inner Tee) ---
    const torso = new THREE.Group();
    torso.position.y = 2.68;

    // Sculpted upper chest & lats (smooth rounded cylinder tapered from shoulders to waist)
    const chestCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.54, 1.78, 18),
      jacketMat
    );
    chestCore.scale.set(1.08, 1.0, 0.64);
    chestCore.castShadow = true;
    torso.add(chestCore);

    // Optional Flowing Royal Agbada Drape & Gold Embroidery Panel
    if (agbadaDrape) {
      const drapeWing = new THREE.Mesh(
        new THREE.CylinderGeometry(1.18, 1.04, 2.08, 18),
        jacketMat
      );
      drapeWing.scale.set(1.12, 1.0, 0.52);
      drapeWing.position.y = -0.14;
      torso.add(drapeWing);

      const embroidery = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.95, 0.06),
        goldMat
      );
      embroidery.position.set(0, 0.24, 0.56);
      torso.add(embroidery);
    }

    // Inner fitted crew-neck shirt visible on front (+Z is forward)
    const frontTee = new THREE.Mesh(
      new THREE.CylinderGeometry(0.64, 0.51, 1.74, 16, 1, false, -0.55, 1.1),
      shirtMat
    );
    frontTee.scale.set(1.09, 1.0, 0.68);
    torso.add(frontTee);

    // Left & Right tailored jacket lapels framing the shirt
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 1.68, 0.12),
        jacketMat
      );
      lapel.position.set(side * 0.28, 0.02, 0.41);
      lapel.rotation.z = side * -0.04;
      torso.add(lapel);

      // Rounded deltoid shoulder caps for smooth human silhouette
      const deltoid = new THREE.Mesh(
        new THREE.SphereGeometry(0.31, 14, 12),
        jacketMat
      );
      deltoid.position.set(side * 0.78, 0.72, 0);
      deltoid.scale.set(1.05, 0.92, 0.88);
      torso.add(deltoid);
    }

    // Stylish jacket collar & gold Cuban chain around neck
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.075, 10, 20, Math.PI * 1.35),
      jacketMat
    );
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI * 0.82;
    collar.position.set(0, 0.88, -0.02);
    torso.add(collar);

    const goldChain = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.026, 8, 18),
      goldMat
    );
    goldChain.rotation.x = Math.PI / 2 + 0.22;
    goldChain.position.set(0, 0.82, 0.08);
    torso.add(goldChain);

    root.add(torso);

    // --- 2. SCULPTED PELVIS, HIPS & DESIGNER BELT ---
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.54, 0.44, 16),
      pantsMat
    );
    pelvis.scale.set(1.05, 1.0, 0.66);
    pelvis.position.y = 1.66;
    root.add(pelvis);

    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.575, 0.575, 0.12, 16),
      beltMat
    );
    belt.scale.set(1.06, 1.0, 0.67);
    belt.position.y = 1.82;
    root.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.08),
      goldMat
    );
    buckle.position.set(0, 1.82, 0.39);
    root.add(buckle);

    // --- 3. REALISTIC HUMAN HEAD, FACIAL FEATURES & NIGERIAN GROOM / HEADWEAR ---
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.25, 0.38, 14),
      skinMat
    );
    neck.position.y = 3.74;
    root.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 4.24;

    // Smooth anatomical cranium
    const cranium = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 22, 20),
      skinMat
    );
    cranium.scale.set(0.92, 1.08, 0.98);
    cranium.castShadow = true;
    headGroup.add(cranium);

    // Sculpted jawline & chin
    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 16, 14),
      skinMat
    );
    jaw.scale.set(0.88, 0.75, 0.92);
    jaw.position.set(0, -0.16, 0.06);
    headGroup.add(jaw);

    // Hair & Nigerian Cultural Headwear Variations (Fade, Afro, Locs, Gele Wrap, Fila Cap)
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.435, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    hairTop.scale.set(0.94, 1.06, 1.0);
    hairTop.position.y = 0.04;
    headGroup.add(hairTop);

    if (hairstyle === 'afro') {
      const afro = new THREE.Mesh(new THREE.SphereGeometry(0.58, 18, 16), hairMat);
      afro.position.set(0, 0.22, -0.04);
      headGroup.add(afro);
    } else if (hairstyle === 'locs' || hairstyle === 'braids') {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 1.5 + Math.PI * 0.25;
        const strand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.048, 0.036, hairstyle === 'braids' ? 0.85 : 0.68, 8),
          hairMat
        );
        strand.position.set(Math.cos(ang) * 0.36, -0.05, Math.sin(ang) * 0.36 - 0.05);
        strand.rotation.z = Math.cos(ang) * 0.18;
        headGroup.add(strand);
      }
    } else if (hairstyle === 'gele') {
      const geleMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.3, metalness: 0.25 });
      const geleCrown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.19, 12, 24), geleMat);
      geleCrown.rotation.x = Math.PI / 2 - 0.32;
      geleCrown.position.set(0, 0.38, -0.04);
      headGroup.add(geleCrown);
    } else if (hairstyle === 'fila') {
      const filaMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.38, metalness: 0.2 });
      const fila = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.42, 0.38, 18), filaMat);
      fila.position.set(0, 0.42, 0);
      fila.rotation.z = 0.16;
      headGroup.add(fila);
    } else {
      const hairCrown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.38, 0.18, 16),
        hairMat
      );
      hairCrown.scale.set(0.92, 1.0, 0.96);
      hairCrown.position.y = 0.38;
      headGroup.add(hairCrown);
    }

    // Optional Designer Sunglasses / Alhaji Aviators
    if (glasses && glasses !== 'none') {
      const isGoldFrame = glasses === 'aviator' || glasses === 'gold_rims';
      const lensMat = new THREE.MeshStandardMaterial({
        color: isGoldFrame ? 0x1e293b : 0x020617,
        metalness: 0.85,
        roughness: 0.12
      });
      for (const side of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.05), lensMat);
        lens.position.set(side * 0.15, 0.05, 0.42);
        headGroup.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.04), goldMat);
      bridge.position.set(0, 0.07, 0.43);
      headGroup.add(bridge);
    }

    // Realistic Eyes (Sclera + Dark Iris/Pupil) + Eyebrows
    for (const side of [-1, 1]) {
      const eyeWhite = new THREE.Mesh(
        new THREE.SphereGeometry(0.062, 10, 10),
        eyeWhiteMat
      );
      eyeWhite.scale.set(1.15, 0.82, 0.65);
      eyeWhite.position.set(side * 0.145, 0.04, 0.375);
      headGroup.add(eyeWhite);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.036, 8, 8),
        pupilMat
      );
      pupil.position.set(side * 0.145, 0.04, 0.408);
      headGroup.add(pupil);

      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.028, 0.04),
        hairMat
      );
      brow.position.set(side * 0.145, 0.125, 0.385);
      brow.rotation.z = side * -0.06;
      headGroup.add(brow);

      // Sculpted Human Ears
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 10, 10),
        skinMat
      );
      ear.scale.set(0.45, 1.15, 0.72);
      ear.position.set(side * 0.385, 0.0, -0.02);
      headGroup.add(ear);
    }

    // Nose bridge & tip
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.068, 0.18, 10),
      skinMat
    );
    nose.position.set(0, -0.03, 0.42);
    nose.rotation.x = Math.PI * 0.38;
    headGroup.add(nose);

    // Natural Lips & Clean Goatee/Mustache line (male characters only)
    const lips = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      lipMat
    );
    lips.scale.set(1.45, 0.52, 0.65);
    lips.position.set(0, -0.17, 0.385);
    headGroup.add(lips);

    if (gender !== 'female' && hairstyle !== 'gele' && hairstyle !== 'braids') {
      const chinBeard = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 10),
        hairMat
      );
      chinBeard.scale.set(0.95, 0.45, 0.85);
      chinBeard.position.set(0, -0.29, 0.25);
      headGroup.add(chinBeard);
    }

    root.add(headGroup);

    // --- 4. ARTICULATED HUMAN ARMS (Upper Arm + Elbow Pivot + Forearm & Sculpted Hand — Fix #35) ---
    const buildArm = (side) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.86, 3.42, 0);

      // Upper arm jacket sleeve
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.18, 0.74, 14),
        jacketMat
      );
      upperArm.position.y = -0.34;
      upperArm.castShadow = true;
      armPivot.add(upperArm);

      // Articulated Elbow Pivot (allows smooth natural forearm bend without seam gaps)
      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.72, 0);
      armPivot.add(elbowPivot);

      const elbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.175, 12, 10),
        jacketMat
      );
      elbowPivot.add(elbow);

      // Lower sleeve / forearm attached to elbowPivot
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.145, 0.62, 14),
        jacketMat
      );
      forearm.position.set(0, -0.30, 0.02);
      forearm.castShadow = true;
      elbowPivot.add(forearm);

      // Wristwatch on left wrist
      if (side === -1) {
        const watch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.155, 0.155, 0.08, 12),
          goldMat
        );
        watch.position.set(0, -0.54, 0.03);
        elbowPivot.add(watch);
      }

      // Sculpted human hand (palm + thumb)
      const palm = new THREE.Mesh(
        new THREE.SphereGeometry(0.155, 12, 10),
        skinMat
      );
      palm.scale.set(0.82, 1.18, 0.95);
      palm.position.set(0, -0.70, 0.04);
      elbowPivot.add(palm);

      return { armPivot, elbowPivot };
    };

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);
    const leftArmPivot = leftArm.armPivot;
    const rightArmPivot = rightArm.armPivot;
    const leftElbowPivot = leftArm.elbowPivot;
    const rightElbowPivot = rightArm.elbowPivot;
    root.add(leftArmPivot, rightArmPivot);

    // --- 5. ARTICULATED HUMAN LEGS (Thigh + Knee Pivot + Tapered Calf & Designer Sneakers — Fix #35) ---
    const buildLeg = (side) => {
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.34, 1.56, 0);

      // Sculpted thigh
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.21, 0.74, 14),
        pantsMat
      );
      thigh.position.y = -0.35;
      thigh.castShadow = true;
      legPivot.add(thigh);

      // Articulated Knee Pivot (natural knee flexion during walking & sprinting!)
      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.72, 0);
      legPivot.add(kneePivot);

      const knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.205, 12, 10),
        pantsMat
      );
      kneePivot.add(knee);

      // Tapered calf / ankle jeans
      const calf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.16, 0.68, 14),
        pantsMat
      );
      calf.position.y = -0.34;
      calf.castShadow = true;
      kneePivot.add(calf);

      // Contoured sneaker upper + rounded toe box + white midsole
      const shoeUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.24, 0.62),
        shoeMat
      );
      shoeUpper.position.set(0, -0.68, 0.08);
      kneePivot.add(shoeUpper);

      const toeCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 12, 10),
        shoeMat
      );
      toeCap.scale.set(1.0, 0.62, 1.15);
      toeCap.position.set(0, -0.70, 0.36);
      kneePivot.add(toeCap);

      const midsole = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.10, 0.82),
        soleMat
      );
      midsole.position.set(0, -0.79, 0.14);
      kneePivot.add(midsole);

      return { legPivot, kneePivot };
    };

    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);
    const leftLegPivot = leftLeg.legPivot;
    const rightLegPivot = rightLeg.legPivot;
    const leftKneePivot = leftLeg.kneePivot;
    const rightKneePivot = rightLeg.kneePivot;
    root.add(leftLegPivot, rightLegPivot);

    return {
      root,
      torso,
      headGroup,
      leftArmPivot,
      rightArmPivot,
      leftElbowPivot,
      rightElbowPivot,
      leftLegPivot,
      rightLegPivot,
      leftKneePivot,
      rightKneePivot
    };
  }

  _buildStreetPedestrians() {
    const npcOutfits = [
      { jacketColor: 0x16a34a, shirtColor: 0xffffff, pantsColor: 0x1e293b, shoeColor: 0xffffff, hairstyle: 'fila', fabricPattern: 'senator', agbadaDrape: true },
      { jacketColor: 0xeab308, shirtColor: 0x111827, pantsColor: 0x0f172a, shoeColor: 0xfacc15, hairstyle: 'gele', fabricPattern: 'ankara', gender: 'female' },
      { jacketColor: 0x2563eb, shirtColor: 0xf8fafc, pantsColor: 0x1e293b, shoeColor: 0xe2e8f0, hairstyle: 'fade', glasses: 'aviator' },
      { jacketColor: 0xdc2626, shirtColor: 0xfef08a, pantsColor: 0x111827, shoeColor: 0xffffff, hairstyle: 'braids', glasses: 'shades', gender: 'female' }
    ];
    const npcNames = [
      'Alhaji Musa', 'Amina Bello', 'Chinedu Okafor', 'Ngozi Eze',
      'Tunde Bakare', 'Zainab Danjuma', 'Emeka Nwosu', 'Halima Sule',
      'Sadiq Abubakar', 'Kemi Adeyemi', 'Umar Farouk', 'Bisi Balogun',
      'Ibrahim Garba', 'Chioma Nnaji', 'Segun Obasanjo', 'Fatima Lawal'
    ];

    for (let dIdx = 0; dIdx < DISTRICTS.length; dIdx++) {
      const d = DISTRICTS[dIdx];
      const basePos = map2DTo3D(d.x, d.y);
      for (let n = 0; n < 2; n++) {
        const idx = dIdx * 2 + n;
        const outfit = npcOutfits[(dIdx + n) % npcOutfits.length];
        const rig = this._buildHumanoidRig(outfit);
        const startX = basePos.x + (n === 0 ? 0 : -8);
        const startZ = basePos.z + (n === 0 ? 3 : -6);
        rig.root.position.set(startX, 0.2, startZ);
        this.scene.add(rig.root);

        const npcName = npcNames[idx % npcNames.length];
        const labelEl = document.createElement('div');
        labelEl.className = 'world3d-player-label npc-affinity-tag';
        labelEl.style.display = 'none';
        labelEl.style.pointerEvents = 'auto';
        labelEl.style.cursor = 'pointer';
        labelEl.innerHTML = `<span class="w3d-pl-name">🤝 ${npcName}</span><span class="w3d-pl-dist" style="color:#4ade80;">❤️ 50</span>`;
        this.labelLayer.appendChild(labelEl);

        const npcObj = {
          id: `ped_${idx}`,
          name: npcName,
          affinity: 50,
          banterText: '',
          banterUntil: 0,
          rig,
          labelEl,
          districtId: d.id,
          homeX: startX,
          homeZ: startZ,
          patrolRadius: 9 + n * 4,
          phase: (dIdx * 1.3 + n * 2.1),
          speed: 0.75 + (n * 0.2),
          knockedTimer: 0
        };

        labelEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.callbacks.onSelectNpc) {
            this.callbacks.onSelectNpc(npcObj, e.clientX, e.clientY);
          }
        });

        this.streetPedestrians.push(npcObj);
      }
    }
  }

  _buildWidebodySportsCar() {
    const car = new THREE.Group();

    // Graphics Fix #10: Real MeshPhysicalMaterial with Clearcoat so setCarWrap clearcoat works & car gleams under IBL!
    const paintMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.16,
      metalness: 0.65,
      clearcoat: 0.88,
      clearcoatRoughness: 0.10
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x090d16,
      roughness: 0.06,
      metalness: 0.92,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.32,
      metalness: 0.55
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.20,
      metalness: 0.88
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.82
    });
    const wheelWellMat = new THREE.MeshStandardMaterial({
      color: 0x05070b,
      roughness: 0.95
    });
    const redStripeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const cyanStripeMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    // Fix #33: Dynamic brake-light glow material (flares bright crimson when braking/handbraking)
    const tailGlowMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      roughness: 0.2
    });
    const amberGlowMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const headLightMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });

    // Graphics Fix #16: Soft radial contact shadow & radial underglow cleanly above asphalt with polygonOffset
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 11.2),
      new THREE.MeshBasicMaterial({
        map: this._contactShadowTex,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.25;
    car.add(shadowPlane);

    const underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 10.4),
      new THREE.MeshBasicMaterial({
        map: this._glowSpriteTex,
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    );
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = 0.24;
    car.add(underglow);

    // Chassis Group: Suspended body (position.y stays near 0 + bounce, NEVER +1.38 — Fix #11!)
    const chassisGroup = new THREE.Group();
    car.add(chassisGroup);

    // 1. Sculpted Lower Widebody Chassis + Recessed Wheel Wells (Fix #33)
    const mainChassis = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.32, 9.2),
      paintMat
    );
    mainChassis.position.set(0, 1.38, 0);
    mainChassis.castShadow = true;
    chassisGroup.add(mainChassis);

    // Sculpted Hood Slope (+Z front)
    const hoodSlope = new THREE.Mesh(
      new THREE.BoxGeometry(4.05, 0.28, 3.0),
      paintMat
    );
    hoodSlope.position.set(0, 2.02, 2.85);
    hoodSlope.rotation.x = 0.08;
    chassisGroup.add(hoodSlope);

    // Recessed Dark Wheel-Well Arches + Split Flared Fenders so tires never clip through solid fenders (Fix #33)
    for (const side of [-1, 1]) {
      // Mid door widebody flare between front & rear wheels
      const midFlare = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 1.05, 3.55),
        paintMat
      );
      midFlare.position.set(side * 2.24, 1.24, 0);
      midFlare.castShadow = true;
      chassisGroup.add(midFlare);

      // Front & rear fender brow over wheels
      for (const wz of [2.85, -2.85]) {
        const brow = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.36, 1.95),
          paintMat
        );
        brow.position.set(side * 2.24, 1.72, wz);
        chassisGroup.add(brow);

        const wellLiner = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 0.95, 0.65, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2),
          wheelWellMat
        );
        wellLiner.position.set(side * 2.05, 0.85, wz);
        chassisGroup.add(wellLiner);
      }

      // Carbon fiber side skirt lip
      const sideSkirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, 3.7),
        carbonMat
      );
      sideSkirt.position.set(side * 2.28, 0.72, 0);
      chassisGroup.add(sideSkirt);
    }

    // 2. Aerodynamic Fastback Cabin with Sloped Front & Rear Windshields (Fix #33)
    const cabinCore = new THREE.Mesh(
      new THREE.BoxGeometry(3.55, 1.18, 3.3),
      glassMat
    );
    cabinCore.position.set(0, 2.52, -0.35);
    chassisGroup.add(cabinCore);

    const frontWindshield = new THREE.Mesh(
      new THREE.BoxGeometry(3.48, 0.12, 1.75),
      glassMat
    );
    frontWindshield.position.set(0, 2.52, 1.68);
    frontWindshield.rotation.x = 0.68;
    chassisGroup.add(frontWindshield);

    const rearWindow = new THREE.Mesh(
      new THREE.BoxGeometry(3.48, 0.12, 1.95),
      glassMat
    );
    rearWindow.position.set(0, 2.54, -2.42);
    rearWindow.rotation.x = -0.58;
    chassisGroup.add(rearWindow);

    const roofPanel = new THREE.Mesh(
      new THREE.BoxGeometry(3.48, 0.14, 3.35),
      paintMat
    );
    roofPanel.position.set(0, 3.16, -0.35);
    chassisGroup.add(roofPanel);

    // Shark-fin roof antenna
    const sharkFin = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.45, 4),
      carbonMat
    );
    sharkFin.position.set(0, 3.38, -1.65);
    sharkFin.rotation.x = -0.25;
    chassisGroup.add(sharkFin);

    // Side wing mirrors
    for (const side of [-1, 1]) {
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.22, 0.28),
        paintMat
      );
      mirror.position.set(side * 2.15, 2.25, 1.35);
      chassisGroup.add(mirror);
    }

    // 3. Carbon GT Rear Wing Spoiler on Dual Struts (toggled off on SUVs/G-Wagon — Fix #32)
    const sportWingGroup = new THREE.Group();
    const wingBlade = new THREE.Mesh(
      new THREE.BoxGeometry(4.45, 0.14, 0.72),
      carbonMat
    );
    wingBlade.position.set(0, 2.72, -4.18);
    wingBlade.rotation.x = 0.08;
    sportWingGroup.add(wingBlade);

    for (const side of [-1, 1]) {
      const wingEndplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.42, 0.82),
        carbonMat
      );
      wingEndplate.position.set(side * 2.22, 2.72, -4.18);
      sportWingGroup.add(wingEndplate);

      const wingStrut = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.68, 0.38),
        carbonMat
      );
      wingStrut.position.set(side * 1.15, 2.34, -4.05);
      sportWingGroup.add(wingStrut);
    }
    chassisGroup.add(sportWingGroup);

    // Modular SUV / Prado / G-Wagon G63 Body Kit (Fix #32: distinct vehicle geometry per vehicle tier!)
    const suvBodyKit = new THREE.Group();
    suvBodyKit.visible = false;
    const suvCabinExt = new THREE.Mesh(new THREE.BoxGeometry(3.68, 1.25, 2.4), glassMat);
    suvCabinExt.position.set(0, 2.55, -2.5);
    const suvRoofExt = new THREE.Mesh(new THREE.BoxGeometry(3.58, 0.16, 2.65), paintMat);
    suvRoofExt.position.set(0, 3.22, -2.55);
    const roofRailL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 5.2), carbonMat);
    roofRailL.position.set(-1.55, 3.36, -1.2);
    const roofRailR = roofRailL.clone();
    roofRailR.position.x = 1.55;
    const spareWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.38, 16).rotateX(Math.PI / 2), tireMat);
    spareWheel.position.set(0, 2.05, -4.78);
    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.72, 0.26), carbonMat);
    bullBar.position.set(0, 1.32, 4.76);
    suvBodyKit.add(suvCabinExt, suvRoofExt, roofRailL, roofRailR, spareWheel, bullBar);
    chassisGroup.add(suvBodyKit);

    // Graphics Fix #31: Detailed First-Person Cockpit Interior (Dashboard, Digital Gauges, A-Pillars & Rotating Steering Wheel)
    const cockpitGroup = new THREE.Group();
    cockpitGroup.visible = false;
    const dashBoard = new THREE.Mesh(
      new THREE.BoxGeometry(3.25, 0.55, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75 })
    );
    dashBoard.position.set(0, 2.08, 1.52);
    cockpitGroup.add(dashBoard);

    const gaugePanel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9 })
    );
    gaugePanel.position.set(0.45, 2.28, 1.03);
    gaugePanel.rotation.y = Math.PI;
    cockpitGroup.add(gaugePanel);

    const infotain = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    infotain.position.set(-0.35, 2.24, 1.03);
    infotain.rotation.y = Math.PI;
    cockpitGroup.add(infotain);

    const steeringWheel = new THREE.Group();
    steeringWheel.position.set(0.48, 2.24, 0.96);
    const swRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.038, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 })
    );
    const swSpoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.05, 0.04),
      rimMat
    );
    const swHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 })
    );
    steeringWheel.add(swRim, swSpoke, swHub);
    cockpitGroup.add(steeringWheel);

    for (const side of [-1, 1]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.32, 0.16), carbonMat);
      aPillar.position.set(side * 1.56, 2.68, 1.48);
      aPillar.rotation.x = 0.56;
      cockpitGroup.add(aPillar);
    }
    chassisGroup.add(cockpitGroup);

    // 4. Aggressive Rear Fascia Taillights & Bumpers
    for (const side of [-1, 1]) {
      const outerTail = new THREE.Mesh(
        new THREE.BoxGeometry(1.38, 0.36, 0.18),
        tailGlowMat
      );
      outerTail.position.set(side * 1.42, 1.72, -4.62);
      chassisGroup.add(outerTail);

      const innerTail = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.18, 0.20),
        amberGlowMat
      );
      innerTail.position.set(side * 1.35, 1.70, -4.64);
      chassisGroup.add(innerTail);
    }

    // Rear License Plate ("ABJ-01VB")
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.36, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    plate.position.set(0, 1.56, -4.63);
    chassisGroup.add(plate);

    const rearRedStripe = new THREE.Mesh(
      new THREE.BoxGeometry(4.35, 0.12, 0.16),
      redStripeMat
    );
    rearRedStripe.position.set(0, 1.16, -4.63);
    chassisGroup.add(rearRedStripe);

    const rearCyanStripe = new THREE.Mesh(
      new THREE.BoxGeometry(3.85, 0.10, 0.16),
      cyanStripeMat
    );
    rearCyanStripe.position.set(0, 1.02, -4.63);
    chassisGroup.add(rearCyanStripe);

    // Carbon Rear Diffuser & Quad Exhaust Tips
    const rearDiffuser = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.38, 0.35),
      carbonMat
    );
    rearDiffuser.position.set(0, 0.76, -4.52);
    chassisGroup.add(rearDiffuser);

    const exhaustGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.45, 12);
    exhaustGeo.rotateX(Math.PI / 2);
    for (const ex of [-1.45, -1.12, 1.12, 1.45]) {
      const pipe = new THREE.Mesh(exhaustGeo, rimMat);
      pipe.position.set(ex, 0.72, -4.68);
      chassisGroup.add(pipe);
    }

    // 5. Front Kidney Grille & Angel-Eye LED Headlights & Time-of-Day Projector Cones (Fix #7)
    const frontGrille = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.68, 0.22),
      carbonMat
    );
    frontGrille.position.set(0, 1.28, 4.62);
    chassisGroup.add(frontGrille);

    this.playerHeadlightBeams = [];
    for (const side of [-1, 1]) {
      const headLamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.34, 0.22),
        headLightMat
      );
      headLamp.position.set(side * 1.55, 1.52, 4.62);
      chassisGroup.add(headLamp);

      // Forward Xenon Light Projector Beams (toggled on only at dusk/night/rain/blackout — Fix #7!)
      const beamGeo = new THREE.ConeGeometry(1.4, 18, 12, 1, true);
      beamGeo.rotateX(Math.PI / 2);
      beamGeo.translate(0, 0, 9);
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      beam.position.set(side * 1.55, 1.44, 4.62);
      beam.visible = false;
      chassisGroup.add(beam);
      this.playerHeadlightBeams.push(beam);
    }

    // 6. 4 Deep-Dish Alloy Wheels with Rotating Rims & Red Brembo Calipers
    const tireGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.58, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const alloyGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.62, 14);
    alloyGeo.rotateZ(Math.PI / 2);

    const wheels = [];
    const buildWheelAssembly = (isLeft) => {
      const assembly = new THREE.Group();
      const wheelRoll = new THREE.Group();

      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      wheelRoll.add(tire);

      const alloy = new THREE.Mesh(alloyGeo, rimMat);
      wheelRoll.add(alloy);

      for (let sp = 0; sp < 5; sp++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.56, 0.08, 0.10),
          rimMat
        );
        spoke.rotation.x = (sp * Math.PI * 2) / 5;
        spoke.position.x = isLeft ? -0.05 : 0.05;
        wheelRoll.add(spoke);
      }
      assembly.add(wheelRoll);
      wheels.push(wheelRoll);

      const caliper = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.26, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.25 })
      );
      caliper.position.set(isLeft ? 0.04 : -0.04, 0.35, 0.18);
      assembly.add(caliper);

      return assembly;
    };

    const frontLeftPivot = new THREE.Group();
    frontLeftPivot.position.set(-2.12, 0.78, 2.85);
    frontLeftPivot.add(buildWheelAssembly(true));
    car.add(frontLeftPivot);

    const frontRightPivot = new THREE.Group();
    frontRightPivot.position.set(2.12, 0.78, 2.85);
    frontRightPivot.add(buildWheelAssembly(false));
    car.add(frontRightPivot);

    const rearLeftAssembly = buildWheelAssembly(true);
    rearLeftAssembly.position.set(-2.12, 0.78, -2.85);
    car.add(rearLeftAssembly);

    const rearRightAssembly = buildWheelAssembly(false);
    rearRightAssembly.position.set(2.12, 0.78, -2.85);
    car.add(rearRightAssembly);

    car.userData = {
      paintMat,
      glassMat,
      trimMat: rearRedStripe.material,
      tailGlowMat,
      chassisGroup,
      cockpitGroup,
      steeringWheel,
      sportWingGroup,
      suvBodyKit,
      wheels,
      frontLeftPivot,
      frontRightPivot,
      underglow
    };

    return car;
  }

  _buildPlumbob() {
    const group = new THREE.Group();
    group.position.set(0, 5.8, 0);

    // Classic Sims Diamond (Bipyramid / Octahedron)
    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x15803d,
      emissiveIntensity: 0.72,
      roughness: 0.12,
      metalness: 0.42,
      transparent: true,
      opacity: 0.94
    });

    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.48, 0),
      diamondMat
    );
    diamond.scale.set(0.68, 1.48, 0.68);
    diamond.castShadow = true;
    group.add(diamond);

    // Glowing Inner Prism Core
    const inner = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.26, 0),
      new THREE.MeshBasicMaterial({ color: 0x86efac })
    );
    inner.scale.set(0.68, 1.48, 0.68);
    group.add(inner);

    // Outer faint aura ring
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    aura.rotation.x = -Math.PI / 2;
    group.add(aura);

    group.userData = { diamond, inner, aura, diamondMat };
    return group;
  }

  updatePlumbobMotive(score = 80) {
    if (!this.plumbob?.userData?.diamondMat) return;
    const mat = this.plumbob.userData.diamondMat;
    const innerMat = this.plumbob.userData.inner.material;
    const auraMat = this.plumbob.userData.aura.material;

    if (score >= 65) {
      mat.color.setHex(0x22c55e);
      mat.emissive.setHex(0x15803d);
      innerMat.color.setHex(0x86efac);
      auraMat.color.setHex(0x4ade80);
    } else if (score >= 38) {
      mat.color.setHex(0xf59e0b);
      mat.emissive.setHex(0xb45309);
      innerMat.color.setHex(0xfde68a);
      auraMat.color.setHex(0xfbbf24);
    } else {
      mat.color.setHex(0xef4444);
      mat.emissive.setHex(0x991b1b);
      innerMat.color.setHex(0xfecaca);
      auraMat.color.setHex(0xf87171);
    }
  }

  _spawnExhaustNitro(left = true) {
    if (this.lowPowerMode) return;
    const carHeading = this.playerHeading;
    const exOffset = left ? -1.25 : 1.25;
    const px = this.playerPos.x + Math.sin(carHeading) * -4.7 + Math.cos(carHeading) * exOffset;
    const pz = this.playerPos.z + Math.cos(carHeading) * -4.7 - Math.sin(carHeading) * exOffset;
    // Graphics Fix #43: Zero-GC pooled particle emission
    this._emitPooledPuff({
      x: px,
      y: 0.74 + Math.random() * 0.14,
      z: pz,
      vx: -Math.sin(carHeading) * 3.5,
      vy: 0.65,
      vz: -Math.cos(carHeading) * 3.5,
      scale: 0.65 + Math.random() * 0.35,
      grow: 0.9,
      life: 0.32,
      color: Math.random() > 0.4 ? 0x06b6d4 : 0x38bdf8
    });
  }

  _initThoughtBubble() {
    if (this.thoughtBubbleGroup) return;
    const group = new THREE.Group();
    group.visible = false;
    group.position.set(0, 7.2, 0);

    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const dot1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), dotMat);
    dot1.position.set(0.35, -0.65, 0);
    const dot2 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), dotMat);
    dot2.position.set(0.55, -0.32, 0);
    group.add(dot1, dot2);

    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 160;
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    const planeMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.5), planeMat);
    plane.position.set(0.7, 0.45, 0);
    group.add(plane);

    group.userData = { canvas, tex, plane, timer: null };
    this.thoughtBubbleGroup = group;
    if (this.playerGroup) this.playerGroup.add(group);
  }

  showThoughtBubble(emoji = '💡', text = 'Thinking...', durationMs = 3500) {
    if (!this.thoughtBubbleGroup) this._initThoughtBubble();
    const bg = this.thoughtBubbleGroup;
    if (!bg) return;

    const ud = bg.userData;
    const ctx = ud.canvas.getContext('2d');
    const W = ud.canvas.width;
    const H = ud.canvas.height;

    ctx.clearRect(0, 0, W, H);

    const r = 24;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(8, 8, W - 16, H - 16, r);
    } else {
      ctx.rect(8, 8, W - 16, H - 16);
    }
    ctx.fill();
    ctx.stroke();

    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 60, H / 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const maxTxtW = W - 130;
    let dispText = text;
    if (ctx.measureText(dispText).width > maxTxtW) {
      while (dispText.length > 3 && ctx.measureText(dispText + '...').width > maxTxtW) {
        dispText = dispText.slice(0, -1);
      }
      dispText += '...';
    }
    ctx.fillText(dispText, 115, H / 2);

    ud.tex.needsUpdate = true;
    bg.visible = true;
    bg.scale.set(0.1, 0.1, 0.1);

    const startTime = performance.now();
    const anim = () => {
      const now = performance.now();
      const progress = Math.min(1, (now - startTime) / 180);
      const scale = THREE.MathUtils.lerp(0.1, 1.0, Math.sin(progress * Math.PI * 0.5));
      bg.scale.set(scale, scale, scale);
      if (progress < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);

    if (ud.timer) clearTimeout(ud.timer);
    ud.timer = setTimeout(() => {
      bg.visible = false;
    }, durationMs);
  }

  _buildLocalPlayerRig() {
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.copy(this.playerPos);
    this.playerGroup.rotation.y = this.playerHeading;

    // Subtle ground indicator ring under player
    const ringGeo = new THREE.RingGeometry(1.1, 1.45, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.playerRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
    );
    this.playerRing.position.y = 0.24;
    this.playerGroup.add(this.playerRing);

    // Dynamic 3D Sims Plumbob Emerald Diamond (rotates and reacts to player needs)
    this.plumbob = this._buildPlumbob();
    this.plumbob.position.y = this.inVehicle ? 4.3 : 5.8;
    this.playerGroup.add(this.plumbob);

    // Dynamic 3D Sims Thought Bubble for autonomous AI and motive needs
    this._initThoughtBubble();

    // Player Widebody Sports Car (visible when inVehicle === true, matching user screenshot)
    this.playerVehicleMesh = this._buildWidebodySportsCar();
    this.playerVehicleMesh.visible = this.inVehicle;
    this.playerGroup.add(this.playerVehicleMesh);

    // Articulated Realistic 3rd-Person Nigeria GTA Human Character
    this.playerHuman = this._buildHumanoidRig(this.playerLook || {});
    this.playerPedMesh = this.playerHuman.root;
    this.playerPedMesh.position.y = 0.2;
    this.playerPedMesh.visible = !this.inVehicle;
    this.playerGroup.add(this.playerPedMesh);

    this.scene.add(this.playerGroup);
  }

  _disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.geometry && typeof child.geometry.dispose === 'function') {
        child.geometry.dispose();
      }
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
          if (typeof m.dispose === 'function') m.dispose();
        }
      }
    });
  }

  /** Rebuild the player's avatar with a new look (skin, hair, outfit colours). */
  setPlayerLook(look = {}) {
    this.playerLook = { ...(this.playerLook || {}), ...look };
    if (!this.playerGroup) return;
    if (this.playerPedMesh) {
      this.playerGroup.remove(this.playerPedMesh);
      this._disposeObject3D(this.playerPedMesh);
    }
    this.playerHuman = this._buildHumanoidRig(this.playerLook);
    this.playerPedMesh = this.playerHuman.root;
    this.playerPedMesh.position.y = 0.2;
    this.playerPedMesh.visible = !this.inVehicle;
    this.playerGroup.add(this.playerPedMesh);
  }

  triggerStreetPunch() {
    if (this.inVehicle) {
      this.toggleVehicleMode();
    }
    this.punchTimer = 0.42;

    // Check if any street pedestrian is nearby to knock down (like Image 4!)
    let hitNpc = null;
    let bestDist = 14;
    for (const npc of this.streetPedestrians) {
      const dist = Math.hypot(
        npc.rig.root.position.x - this.playerPos.x,
        npc.rig.root.position.z - this.playerPos.z
      );
      if (dist < bestDist) {
        bestDist = dist;
        hitNpc = npc;
      }
    }

    if (hitNpc) {
      hitNpc.knockedTimer = 4.2;
      // Push NPC slightly away along player heading
      hitNpc.rig.root.position.x += Math.sin(this.playerHeading) * 2.4;
      hitNpc.rig.root.position.z += Math.cos(this.playerHeading) * 2.4;
      this.spawnNairaRain(10);
      // Punch impact shake & haptic feedback
      this._triggerScreenShake(0.5);
      if (typeof navigator?.vibrate === 'function') {
        try { navigator.vibrate(60); } catch (e) {}
      }
    }

    if (this.callbacks.onStreetPunch) {
      this.callbacks.onStreetPunch({ hitNpc: Boolean(hitNpc), districtId: this.currentDistrictId });
    }
    return Boolean(hitNpc);
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') this.keys.w = true;
      if (k === 's' || e.key === 'ArrowDown') this.keys.s = true;
      if (k === 'a' || e.key === 'ArrowLeft') this.keys.a = true;
      if (k === 'd' || e.key === 'ArrowRight') this.keys.d = true;
      if (k === 'shift') this.keys.shift = true;
      if (k === 'f') this.toggleVehicleMode();
      if (k === 'v') this.cycleCameraMode();
      if (k === 'c') {
        this.cameraMode = 'dollhouse';
        this.cameraDistance = 46;
        this.cameraPitch = 0.62;
        this.cameraYaw = Math.PI / 4;
        if (typeof this.options.onCycleCamera === 'function') {
          this.options.onCycleCamera(this.cameraMode);
        }
      }
      if (k === 'e') {
        e.preventDefault();
        const handled = typeof this.options.onContextInteract === 'function' ? this.options.onContextInteract() : false;
        if (!handled) {
          this.triggerStreetPunch();
        }
      }
      if (k === ' ') {
        e.preventDefault();
        if (this.inVehicle) {
          this.keys.handbrake = true;
        } else {
          this.triggerStreetPunch();
        }
      }
      if (k === 'r' && this.buildGridMode?.active) {
        e.preventDefault();
        this.rotateBuildPreview();
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') this.keys.w = false;
      if (k === 's' || e.key === 'ArrowDown') this.keys.s = false;
      if (k === 'a' || e.key === 'ArrowLeft') this.keys.a = false;
      if (k === 'd' || e.key === 'ArrowRight') this.keys.d = false;
      if (k === 'shift') this.keys.shift = false;
      if (e.key === ' ') this.keys.handbrake = false;
    });

    const canvas = this.renderer.domElement;
    let downPos = { x: 0, y: 0 };
    const activePointers = new Map();
    let initialPinchDist = null;
    let initialCameraDist = null;

    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        this.isPointerDragging = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        downPos = { x: e.clientX, y: e.clientY };
      } else if (activePointers.size === 2) {
        // Point 1 Fix: Multi-touch pinch-to-zoom gesture for mobile
        this.isPointerDragging = false;
        const pts = Array.from(activePointers.values());
        initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialCameraDist = this.cameraDistance;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Feature #3: Interactive 1m x 1m Build & Buy Grid raycast snapping
      if (this.buildGridMode?.active && this.buildGridMode.ghost && !this.isPointerDragging) {
        const rect = canvas.getBoundingClientRect();
        this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointerNDC, this.camera);
        const ray = this.raycaster.ray;
        if (Math.abs(ray.direction.y) > 0.001) {
          const t = -ray.origin.y / ray.direction.y;
          if (t > 0 && t < 400) {
            const gx = Math.round(ray.origin.x + ray.direction.x * t);
            const gz = Math.round(ray.origin.z + ray.direction.z * t);
            this.buildGridMode.ghost.position.set(gx, 0.25, gz);
            if (this.buildGridMode.tile) {
              this.buildGridMode.tile.position.set(gx, 0.22, gz);
            }
          }
        }
      }

      if (activePointers.size === 2 && initialPinchDist) {
        // Compute pinch distance ratio and zoom smoothly
        const pts = Array.from(activePointers.values());
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const factor = initialPinchDist / Math.max(1, currentDist);
        this.cameraDistance = Math.max(10, Math.min(360, initialCameraDist * factor));
        return;
      }

      if (!this.isPointerDragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.cameraYaw -= dx * 0.0065;
      this.cameraPitch = Math.max(0.08, Math.min(1.15, this.cameraPitch + dy * 0.005));
    });

    const onPointerEnd = (e) => {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        initialPinchDist = null;
      }
      if (activePointers.size === 0) {
        if (this.isPointerDragging) {
          this.isPointerDragging = false;
          const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
          if (moved < 6) {
            this._handleCanvasClick(e);
          }
        }
      }
    };

    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(10, Math.min(360, this.cameraDistance + e.deltaY * 0.06));
    }, { passive: false });

    window.addEventListener('resize', () => this.resize());
  }

  _handleCanvasClick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    // Feature #3: If 3D Build & Buy Grid Mode is active, tap places object at snapped grid tile
    if (this.buildGridMode?.active) {
      const ray = this.raycaster.ray;
      if (Math.abs(ray.direction.y) > 0.001) {
        const t = -ray.origin.y / ray.direction.y;
        if (t > 0 && t < 400) {
          const gx = Math.round(ray.origin.x + ray.direction.x * t);
          const gz = Math.round(ray.origin.z + ray.direction.z * t);
          if (this.buildGridMode.ghost) this.buildGridMode.ghost.position.set(gx, 0.25, gz);
          if (this.buildGridMode.tile) this.buildGridMode.tile.position.set(gx, 0.22, gz);
          this.placeBuildPreview();
          return;
        }
      }
    }

    const hits = this.raycaster.intersectObjects(this.clickableDistrictMeshes, false);
    if (hits.length > 0) {
      const districtId = hits[0].object.userData?.districtId;
      if (districtId && this.callbacks.onSelectDistrict) {
        this.callbacks.onSelectDistrict(districtId);
      }
    }
  }

  resize() {
    if (!this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this._canvasW = w;
    this._canvasH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  onResize() {
    this.resize();
  }

  toggleVehicleMode() {
    this.inVehicle = !this.inVehicle;
    this.playerVehicleMesh.visible = this.inVehicle;
    this.playerPedMesh.visible = !this.inVehicle;
    if (this.plumbob) {
      this.plumbob.position.y = this.inVehicle ? 4.3 : 5.8;
    }
    if (this.cameraMode === 'chase') {
      this.cameraDistance = this.inVehicle ? 26 : 15.5;
      this.cameraPitch = this.inVehicle ? 0.24 : 0.20;
    }
    if (typeof this.options?.onToggleVehicle === 'function') {
      this.options.onToggleVehicle(this.inVehicle);
    }
    return this.inVehicle;
  }

  // Feature #18 & #1: Multi-Perspective Camera (Chase, Cockpit, Bumper, Sims Dollhouse Cutaway, Helicopter)
  cycleCameraMode() {
    if (this.cameraMode === 'chase') {
      this.cameraMode = 'cockpit';
      this.cycleWallCutaway('up');
    } else if (this.cameraMode === 'cockpit') {
      this.cameraMode = 'bumper';
      this.cycleWallCutaway('up');
    } else if (this.cameraMode === 'bumper') {
      this.cameraMode = 'dollhouse';
      this.cameraDistance = 42;
      this.cameraPitch = 0.64; // 45° classic Sims isometric cutaway angle
      this.cameraYaw = Math.PI / 4;
      this.cycleWallCutaway('cutaway');
    } else if (this.cameraMode === 'dollhouse') {
      this.cameraMode = 'helicopter';
      this.cameraDistance = 195;
      this.cameraPitch = 0.78;
      this.cycleWallCutaway('up');
    } else {
      this.cameraMode = 'chase';
      this.cameraDistance = this.inVehicle ? 26 : 15.5;
      this.cameraPitch = this.inVehicle ? 0.24 : 0.20;
      this.cycleWallCutaway('up');
    }
    if (typeof this.options?.onCycleCamera === 'function') {
      this.options.onCycleCamera(this.cameraMode);
    }
    return this.cameraMode;
  }

  cycleWallCutaway(forcedMode) {
    const modes = ['up', 'cutaway', 'down'];
    if (forcedMode && modes.includes(forcedMode)) {
      this.wallCutawayMode = forcedMode;
    } else {
      const idx = modes.indexOf(this.wallCutawayMode || 'up');
      this.wallCutawayMode = modes[(idx + 1) % modes.length];
    }

    const mode = this.wallCutawayMode;
    const isCutaway = mode === 'cutaway';
    const isDown = mode === 'down';

    // Graphics Fixes #13 & #42: Never mutate shared roof materials! Swap local roof material & toggle nearby interiors cleanly.
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const wp = new THREE.Vector3();

    this.scene.traverse((obj) => {
      if (!obj.userData) return;
      if (obj.userData.isRoof) {
        if (!obj.userData.origMat && obj.material !== this._cutawayRoofMat) {
          obj.userData.origMat = obj.material;
        }
        obj.getWorldPosition(wp);
        const isLocal = Math.hypot(wp.x - px, wp.z - pz) < 75 || this.cameraMode === 'dollhouse';
        if (mode === 'up' || !isLocal) {
          obj.visible = true;
          if (obj.userData.origMat) obj.material = obj.userData.origMat;
        } else if (isCutaway) {
          obj.visible = true;
          obj.material = this._cutawayRoofMat;
        } else {
          obj.visible = false;
        }
      } else if (obj.userData.isWindowBatch) {
        obj.getWorldPosition(wp);
        const isLocal = Math.hypot(wp.x - px, wp.z - pz) < 75 || this.cameraMode === 'dollhouse';
        obj.visible = (!isLocal || mode === 'up');
      } else if (obj.userData.isWall && obj.userData.origHeight) {
        obj.getWorldPosition(wp);
        const isLocal = Math.hypot(wp.x - px, wp.z - pz) < 75 || this.cameraMode === 'dollhouse';
        if (!isLocal || mode === 'up') {
          obj.scale.y = 1.0;
          obj.position.y = obj.userData.origPosY || (obj.userData.origHeight * 0.5);
        } else if (isDown) {
          obj.scale.y = 0.08;
          obj.position.y = (obj.userData.origPosY || obj.position.y) * 0.08;
        } else if (isCutaway) {
          obj.scale.y = 0.30;
          obj.position.y = (obj.userData.origPosY || obj.position.y) * 0.30;
        }
      }
    });

    // Show interior furniture ONLY when nearby AND in cutaway/down mode (Fix #42)
    if (this.allInteriorGroups) {
      for (let i = 0; i < this.allInteriorGroups.length; i++) {
        const ig = this.allInteriorGroups[i];
        if (mode === 'up') {
          ig.visible = false;
        } else {
          ig.getWorldPosition(wp);
          ig.visible = Math.hypot(wp.x - px, wp.z - pz) < 78;
        }
      }
    }

    return this.wallCutawayMode;
  }

  pickContextAtScreen(clientX, clientY) {
    if (!this.renderer || !this.camera) return { type: 'ground' };
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    // 1. Check player avatar
    if (this.playerGroup) {
      const pHits = this.raycaster.intersectObject(this.playerGroup, true);
      if (pHits.length > 0 && pHits[0].distance < 450) {
        return { type: 'player', point: pHits[0].point };
      }
    }

    // 2. Check remote players / multiplayer avatars
    if (this.remotePlayers && this.remotePlayers.size > 0) {
      for (const [id, rp] of this.remotePlayers.entries()) {
        const rHits = this.raycaster.intersectObject(rp.group, true);
        if (rHits.length > 0) {
          return { type: 'npc', id, username: rp.data?.name || rp.name || 'FCT Resident', point: rHits[0].point };
        }
      }
    }

    // 2B. Check street pedestrians
    if (this.streetPedestrians && this.streetPedestrians.length > 0) {
      for (let i = 0; i < this.streetPedestrians.length; i++) {
        const npc = this.streetPedestrians[i];
        if (!npc.rig?.root?.visible) continue;
        const nHits = this.raycaster.intersectObject(npc.rig.root, true);
        if (nHits.length > 0) {
          return { type: 'npc', id: `ped_${i}`, username: 'Abuja Pedestrian', point: nHits[0].point };
        }
      }
    }

    // 3. Check player houses / compounds
    if (this.playerHouseEntries && this.playerHouseEntries.size > 0) {
      for (const [distId, entry] of this.playerHouseEntries.entries()) {
        const hHits = this.raycaster.intersectObject(entry.group, true);
        if (hHits.length > 0) {
          return { type: 'house', districtId: distId, stage: entry.stage, point: hHits[0].point };
        }
      }
    }

    // 4. Check district buildings
    if (this.clickableDistrictMeshes && this.clickableDistrictMeshes.length > 0) {
      const distHits = this.raycaster.intersectObjects(this.clickableDistrictMeshes, false);
      if (distHits.length > 0) {
        return {
          type: 'district',
          districtId: distHits[0].object.userData?.districtId,
          point: distHits[0].point
        };
      }
    }

    return { type: 'ground' };
  }

  toggleLowPowerMode() {
    this.lowPowerMode = !this.lowPowerMode;
    this.renderer.setPixelRatio(this.lowPowerMode ? 0.85 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.lowPowerMode;
    this.sunLight.castShadow = !this.lowPowerMode;
    // Hide half of ambient traffic in low-power mode to keep mobile GPUs cool
    this.trafficCars.forEach((c, idx) => {
      c.group.visible = this.lowPowerMode ? idx % 2 === 0 : true;
    });
    return this.lowPowerMode;
  }

  flyToDistrict(districtId, immediate = false) {
    const d = DISTRICT_BY_ID[districtId];
    if (!d) return;
    const target3D = map2DTo3D(d.x, d.y);
    const destVec = new THREE.Vector3(target3D.x, 0, target3D.z + 10);

    this.currentDistrictId = districtId;

    for (const [id, node] of this.districtNodes.entries()) {
      const active = id === districtId;
      const distObj = DISTRICT_BY_ID[id];
      node.ring.material.color.setHex(active ? 0x38bdf8 : (distObj?.zone === 1 ? 0xf59e0b : 0x10b981));
      node.ring.scale.setScalar(active ? 1.18 : 1.0);
    }

    if (immediate || this.playerPos.distanceTo(destVec) < 18) {
      this.playerPos.copy(destVec);
      this.playerGroup.position.copy(destVec);
      return;
    }

    this.skyCam.active = true;
    this.skyCam.elapsed = 0;
    this.skyCam.duration = 2.1;
    this.skyCam.from.copy(this.playerPos);
    this.skyCam.to.copy(destVec);
    this.skyCam.targetDistrict = districtId;
  }

  setEnvironment(hour = 12, weather = 'sunny') {
    this.hourOfDay = hour;
    this.weather = weather;

    const isNight = hour >= 20 || hour < 6;
    const isDusk = (hour >= 18 && hour < 20) || (hour >= 6 && hour < 7);
    const isWet = weather === 'storm' || weather === 'downpour' || weather === 'rain';
    const isHarmattan = weather === 'harmattan' || weather === 'dry';

    // Graphics Fix #5: True solar arc computed from hourOfDay (6:00 sunrise East -> 12:30 zenith -> 19:00 sunset West)
    if (!this._sunDir) this._sunDir = new THREE.Vector3(0.45, 0.72, 0.25).normalize();
    if (!isNight) {
      const dayFrac = Math.max(0.02, Math.min(0.98, (hour - 6) / 13));
      const elev = Math.sin(dayFrac * Math.PI) * 1.15 + 0.12;
      const azim = (dayFrac - 0.5) * Math.PI * 0.92;
      this._sunDir.set(
        -Math.sin(azim) * Math.cos(elev),
        Math.sin(elev),
        Math.cos(azim) * Math.cos(elev) * 0.45 + 0.22
      ).normalize();
    } else {
      // Gentle moonlight angle overhead at night
      this._sunDir.set(-0.35, 0.75, -0.25).normalize();
    }

    // Graphics Fix #27 & #28: Zero CanvasTexture VRAM leak! Update 360° Sky Dome Shader uniforms in place.
    const u = this._skyUniforms;
    let fogHex = 0xbae6fd;
    let fogDensity = 0.00032;

    if (isHarmattan) {
      fogHex = isNight ? 0x1e293b : 0xf3d59b;
      fogDensity = 0.00062;
      if (u) {
        u.uZenith.value.setHex(isNight ? 0x0f172a : 0xb48447);
        u.uMidSky.value.setHex(isNight ? 0x1e293b : 0xd9a86c);
        u.uHorizon.value.setHex(fogHex);
        u.uGround.value.setHex(isNight ? 0x0f172a : 0x855a2c);
        u.uSunColor.value.setHex(isNight ? 0x94a3b8 : 0xfde68a);
      }
    } else if (isWet) {
      fogHex = isNight ? 0x0f172a : 0x7c8ea0;
      fogDensity = 0.00068;
      if (u) {
        u.uZenith.value.setHex(isNight ? 0x090d16 : 0x334155);
        u.uMidSky.value.setHex(isNight ? 0x1e293b : 0x64748b);
        u.uHorizon.value.setHex(fogHex);
        u.uGround.value.setHex(0x1e293b);
        u.uSunColor.value.setHex(0xcbd5e1);
      }
    } else if (isNight) {
      fogHex = 0x0b1224;
      fogDensity = 0.00046;
      if (u) {
        u.uZenith.value.setHex(0x020617);
        u.uMidSky.value.setHex(0x0b1530);
        u.uHorizon.value.setHex(0x172554);
        u.uGround.value.setHex(0x020617);
        u.uSunColor.value.setHex(0xcbd5e1);
      }
    } else if (isDusk) {
      fogHex = 0xfb923c;
      fogDensity = 0.00040;
      if (u) {
        u.uZenith.value.setHex(0x1e1b4b);
        u.uMidSky.value.setHex(0xbe185d);
        u.uHorizon.value.setHex(0xfb923c);
        u.uGround.value.setHex(0x451a03);
        u.uSunColor.value.setHex(0xfdba74);
      }
    } else {
      fogHex = 0xcfe8f8;
      fogDensity = 0.00028;
      if (u) {
        u.uZenith.value.setHex(0x1a3a6b);
        u.uMidSky.value.setHex(0x5da8d8);
        u.uHorizon.value.setHex(0xf0d8b0);
        u.uGround.value.setHex(0x6b4f2a);
        u.uSunColor.value.setHex(0xfff5d0);
      }
    }
    if (u) u.uSunDir.value.copy(this._sunDir);

    if (!this._reusableBgColor) this._reusableBgColor = new THREE.Color(fogHex);
    this._reusableBgColor.setHex(fogHex);
    this.scene.background = this._reusableBgColor;
    if (this.scene.fog?.color?.setHex) this.scene.fog.color.setHex(fogHex);
    if (this.scene.fog) this.scene.fog.density = fogDensity;

    if (this.starField?.material) {
      this.starField.material.opacity = isNight && !isWet ? 0.92 : (isDusk && !isWet ? 0.28 : 0.0);
    }
    if (this.cloudGroup) {
      this.cloudGroup.visible = !isNight;
    }

    this.sunLight.intensity = isNight ? 0.42 : (isWet ? 0.95 : (isDusk ? 1.45 : 1.85));
    this.sunLight.color.setHex(isDusk ? 0xf97316 : isNight ? 0x93c5fd : isWet ? 0xdbeafe : 0xfff8dc);
    if (this.ambientLight) {
      this.ambientLight.intensity = isNight ? 0.42 : (isDusk ? 0.72 : 0.94);
    }

    // Graphics Fix #6: City sodium glow light active ONLY at dusk/night when NEPA grid is online
    if (this.cityGlow) {
      this.cityGlow.intensity = (isNight || isDusk) && this.gridPowerOnline !== false ? 0.95 : 0.0;
    }

    // Graphics Fix #7: Car headlight beams switch on automatically at night, dusk, heavy rain, or blackout
    const lightsOn = isNight || isDusk || isWet || this.gridPowerOnline === false;
    if (this.playerHeadlightBeams) {
      for (const beam of this.playerHeadlightBeams) {
        beam.visible = lightsOn;
      }
    }

    if (this.roadMat) {
      this.roadMat.roughness = isWet ? 0.14 : 0.88;
      this.roadMat.metalness = isWet ? 0.58 : 0.05;
    }

    // Feature #15 + Fix #44: Falling Rain Streaks, Ground Splashes, Reflective Puddles & Harmattan Dust
    if (this.rainLines) this.rainLines.visible = isWet;
    if (this.rainSplashes) {
      for (const sp of this.rainSplashes) sp.mesh.visible = isWet;
    }
    if (this.harmattanPoints) this.harmattanPoints.visible = isHarmattan;
    if (this.roadPuddles) {
      for (const puddle of this.roadPuddles) {
        puddle.visible = isWet;
      }
    }

    const gridOn = this.gridPowerOnline !== false;
    const powerFactor = gridOn ? 1.0 : 0.04;
    for (const mat of this.windowMaterials) {
      mat.emissiveIntensity = (isNight ? 0.85 : isDusk ? 0.45 : 0.14) * powerFactor;
    }
    if (this.streetLightBulbs) {
      for (const bulb of this.streetLightBulbs) {
        if (bulb.material) {
          bulb.material.color.setHex(!gridOn ? 0x1e293b : (isNight || isDusk ? 0xfef08a : 0x94a3b8));
        }
      }
    }
    // Graphics Fix #8: Warm asphalt streetlamp light pools glow at dusk/night when NEPA grid is online
    if (this.streetLightPools) {
      const poolOpacity = (isNight || isDusk) && gridOn ? 0.42 : 0.0;
      for (const pool of this.streetLightPools) {
        if (pool.material) pool.material.opacity = poolOpacity;
      }
    }
  }

  // Feature #16: NEPA / AEDC Power Blackouts & Compound Generator Switchover
  setPowerGridState(gridOnline = true, playerGenRunning = false) {
    const changed = this.gridPowerOnline !== gridOnline || this.playerGenActive !== playerGenRunning;
    this.gridPowerOnline = Boolean(gridOnline);
    this.playerGenActive = Boolean(playerGenRunning);
    if (!changed) return;

    const isNight = this.hourOfDay >= 20 || this.hourOfDay < 6;
    const isDusk = (this.hourOfDay >= 18 && this.hourOfDay < 20) || (this.hourOfDay >= 6 && this.hourOfDay < 7);
    const powerFactor = this.gridPowerOnline ? 1.0 : 0.04;

    if (this.cityGlow) {
      this.cityGlow.intensity = (isNight || isDusk) && this.gridPowerOnline ? 0.95 : 0.0;
    }
    if (this.playerHeadlightBeams) {
      const lightsOn = isNight || isDusk || !this.gridPowerOnline || this.weather === 'rain' || this.weather === 'storm' || this.weather === 'downpour';
      for (const beam of this.playerHeadlightBeams) beam.visible = lightsOn;
    }
    for (const mat of this.windowMaterials) {
      mat.emissiveIntensity = (isNight ? 0.85 : isDusk ? 0.45 : 0.14) * powerFactor;
    }
    if (this.streetLightBulbs) {
      for (const bulb of this.streetLightBulbs) {
        if (bulb.material) {
          bulb.material.color.setHex(!this.gridPowerOnline ? 0x1e293b : (isNight || isDusk ? 0xfef08a : 0x94a3b8));
        }
      }
    }
    if (this.streetLightPools) {
      const poolOpacity = (isNight || isDusk) && this.gridPowerOnline ? 0.42 : 0.0;
      for (const pool of this.streetLightPools) {
        if (pool.material) pool.material.opacity = poolOpacity;
      }
    }
    // Keep player's owned compound glowing bright if generator or solar is running during a blackout!
    if (this.playerHouseEntries) {
      for (const entry of this.playerHouseEntries.values()) {
        if (entry.wallsMat) {
          const hasLocalPower = this.gridPowerOnline || this.playerGenActive;
          entry.wallsMat.emissive = new THREE.Color(hasLocalPower ? 0xfef08a : 0x000000);
          entry.wallsMat.emissiveIntensity = hasLocalPower && isNight ? 0.28 : 0.0;
        }
      }
    }
  }

  // Feature #2 + Algorithm #1: Physical Smart-Object Animations with Local A* Obstacle-Avoiding Pathfinding
  performSmartObjectAnimation(actionType = 'cook', label = 'Cooking Indomie...', durationMs = 3000) {
    if (this.inVehicle) {
      this.toggleVehicleMode();
    }
    const sec = Math.max(1.2, durationMs / 1000);
    // Calculate target furniture waypoint inside nearby owned house or local offset
    let targetPos = null;
    let waypoints = null;
    if (this.playerHouseEntries && this.playerHouseEntries.size > 0) {
      const localEntry = this.playerHouseEntries.get(this.currentDistrictId) || Array.from(this.playerHouseEntries.values())[0];
      if (localEntry && Math.hypot(localEntry.group.position.x - this.playerPos.x, localEntry.group.position.z - this.playerPos.z) < 40) {
        const offsets = {
          cook: { x: 2.5, z: -2.0 },
          sleep: { x: 2.2, z: 1.5 },
          tv: { x: -2.2, z: -0.6 },
          gen: { x: -4.2, z: 4.2 }
        };
        const off = offsets[actionType] || { x: 0, z: 0 };
        targetPos = {
          x: localEntry.group.position.x + off.x,
          z: localEntry.group.position.z + off.z
        };
        // Algorithm #1: Compute obstacle-avoiding local A* waypoint path to furniture
        waypoints = this.router.findLocalWaypointPath(
          this.playerPos.x,
          this.playerPos.z,
          targetPos.x,
          targetPos.z,
          (wx, wz) => this.obbSolver.isPointBlocked(wx, wz, 0.9),
          2.0,
          72
        );
        this.cycleWallCutaway('cutaway');
      }
    }
    const emojiMap = {
      cook: '🍜',
      sleep: '😴',
      shower: '🚿',
      tv: '📺',
      gen: '⚡',
      pray: '🤲🏾'
    };
    const emoji = emojiMap[actionType] || '✨';
    this.smartActionState = {
      active: true,
      type: actionType,
      timer: sec,
      maxTimer: sec,
      label,
      emoji,
      targetPos,
      waypoints: waypoints || (targetPos ? [targetPos] : [])
    };
    this.showThoughtBubble(emoji, `${label} (0%)`, durationMs);
  }

  // Feature #3: Interactive 3D Build & Buy 1m×1m Placement Grid
  _createBuildGridMesh(itemType = 'generator') {
    const group = new THREE.Group();
    if (itemType === 'generator') {
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.6, 1.3),
        new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.35 })
      );
      canopy.position.y = 0.8;
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 })
      );
      pipe.position.set(0.8, 1.9, 0);
      group.add(canopy, pipe);
    } else if (itemType === 'solar') {
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x475569 })
      );
      stand.position.y = 0.8;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.14, 2.1),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.15 })
      );
      panel.position.y = 1.65;
      panel.rotation.x = 0.28;
      group.add(stand, panel);
    } else if (itemType === 'tank') {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 3.2, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x334155, wireframe: true })
      );
      tower.position.y = 1.6;
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 2.2, 14),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3 })
      );
      tank.position.y = 4.2;
      group.add(tower, tank);
    } else if (itemType === 'suya') {
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 1.9, 12),
        new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.6 })
      );
      drum.rotation.z = Math.PI / 2;
      drum.position.y = 1.1;
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.15, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xf97316 })
      );
      glow.position.y = 1.65;
      group.add(drum, glow);
    } else {
      // Royal Outdoor Lounge Sofa / Gazebo
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.65, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
      );
      base.position.y = 0.35;
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.75, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.5 })
      );
      back.position.set(0, 0.9, -0.5);
      group.add(base, back);
    }
    group.userData = { itemType };
    return group;
  }

  toggleBuildBuyGridMode(itemType = 'generator', forceState = null) {
    const nextActive = typeof forceState === 'boolean' ? forceState : !this.buildGridMode.active;
    this.buildGridMode.active = nextActive;
    this.buildGridMode.itemType = itemType || this.buildGridMode.itemType || 'generator';

    if (!nextActive) {
      if (this.buildGridMode.group) {
        this.scene.remove(this.buildGridMode.group);
        this._disposeObject3D(this.buildGridMode.group);
        this.buildGridMode.group = null;
      }
      if (this.buildGridMode.ghost) {
        this.scene.remove(this.buildGridMode.ghost);
        this._disposeObject3D(this.buildGridMode.ghost);
        this.buildGridMode.ghost = null;
      }
      if (this.buildGridMode.tile) {
        this.scene.remove(this.buildGridMode.tile);
        this._disposeObject3D(this.buildGridMode.tile);
        this.buildGridMode.tile = null;
      }
      return false;
    }

    // Switch to Sims Dollhouse Cutaway view for effortless lot building!
    this.cameraMode = 'dollhouse';
    this.cameraDistance = 38;
    this.cameraPitch = 0.66;
    this.cycleWallCutaway('cutaway');

    if (!this.buildGridMode.group) {
      const gridHelper = new THREE.GridHelper(24, 24, 0x4ade80, 0x38bdf8);
      gridHelper.position.set(Math.round(this.playerPos.x), 0.21, Math.round(this.playerPos.z));
      this.scene.add(gridHelper);
      this.buildGridMode.group = gridHelper;
    } else {
      this.buildGridMode.group.position.set(Math.round(this.playerPos.x), 0.21, Math.round(this.playerPos.z));
    }

    if (!this.buildGridMode.tile) {
      const tileGeo = new THREE.RingGeometry(1.1, 1.5, 4);
      tileGeo.rotateX(-Math.PI / 2);
      tileGeo.rotateY(Math.PI / 4);
      const tile = new THREE.Mesh(
        tileGeo,
        new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide })
      );
      tile.position.set(Math.round(this.playerPos.x + 3), 0.22, Math.round(this.playerPos.z + 3));
      this.scene.add(tile);
      this.buildGridMode.tile = tile;
    }

    this.setBuildPreviewItem(this.buildGridMode.itemType);
    return true;
  }

  setBuildPreviewItem(itemType = 'generator') {
    this.buildGridMode.itemType = itemType;
    const prevPos = this.buildGridMode.ghost
      ? this.buildGridMode.ghost.position.clone()
      : new THREE.Vector3(Math.round(this.playerPos.x + 3), 0.25, Math.round(this.playerPos.z + 3));
    if (this.buildGridMode.ghost) {
      this.scene.remove(this.buildGridMode.ghost);
      this._disposeObject3D(this.buildGridMode.ghost);
    }
    const ghost = this._createBuildGridMesh(itemType);
    ghost.position.copy(prevPos);
    ghost.rotation.y = this.buildGridMode.rotY || 0;
    ghost.traverse((c) => {
      if (c.material) {
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.72;
      }
    });
    this.scene.add(ghost);
    this.buildGridMode.ghost = ghost;
  }

  rotateBuildPreview() {
    this.buildGridMode.rotY = ((this.buildGridMode.rotY || 0) + Math.PI / 2) % (Math.PI * 2);
    if (this.buildGridMode.ghost) {
      this.buildGridMode.ghost.rotation.y = this.buildGridMode.rotY;
    }
  }

  placeBuildPreview() {
    if (!this.buildGridMode.active || !this.buildGridMode.ghost) return null;
    const itemType = this.buildGridMode.itemType || 'generator';
    const placed = this._createBuildGridMesh(itemType);
    placed.position.copy(this.buildGridMode.ghost.position);
    placed.rotation.y = this.buildGridMode.rotY || 0;
    this.scene.add(placed);
    this.placedGridMeshes.push(placed);

    // Offset ghost slightly to next grid cell for rapid placement
    this.buildGridMode.ghost.position.x += 3;
    if (this.buildGridMode.tile) this.buildGridMode.tile.position.x += 3;

    if (typeof this.callbacks.onPlaceGridObject === 'function') {
      this.callbacks.onPlaceGridObject({
        itemType,
        x: placed.position.x,
        z: placed.position.z,
        districtId: this.currentDistrictId
      });
    }
    return placed;
  }

  // Feature #4: Emotional Emote Bubbles & Mood Aura VFX (Stink waves vs Gold Steeze sparks)
  updatePlayerMoodVFX(mood = {}) {
    this.playerMoodState = {
      hygiene: mood.hygiene ?? 80,
      steeze: mood.steeze ?? 80,
      sanity: mood.sanity ?? 80,
      energy: mood.energy ?? 80
    };
  }

  // Feature #5: NPC Social Interaction Wheel & Relationship Affinity
  findNearestPedestrian(maxDist = 11) {
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < this.streetPedestrians.length; i++) {
      const npc = this.streetPedestrians[i];
      if (!npc.rig?.root?.visible) continue;
      const d = Math.hypot(npc.rig.root.position.x - this.playerPos.x, npc.rig.root.position.z - this.playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    return best;
  }

  interactWithPedestrian(npcOrId, actionType = 'banter') {
    let npc = typeof npcOrId === 'object' ? npcOrId : null;
    if (!npc && typeof npcOrId === 'string') {
      const idx = parseInt(npcOrId.replace('ped_', ''), 10);
      if (!Number.isNaN(idx)) npc = this.streetPedestrians[idx];
    }
    if (!npc) npc = this.findNearestPedestrian(18);
    if (!npc) return null;

    // Turn pedestrian to face player
    const dx = this.playerPos.x - npc.rig.root.position.x;
    const dz = this.playerPos.z - npc.rig.root.position.z;
    npc.rig.root.rotation.y = Math.atan2(dx, dz);

    const replies = {
      banter: [
        'Omo! Abuja sun hot today o, how far na?',
        'Chairman! Nothing spoil, we dey push inside FCT!',
        'Abeg who get connection for Maitama plot?'
      ],
      flirt: [
        'Awwn! Your steeze reach 100% wallahi 😍',
        'See fine Senator outfit! Make we link up for Wuse 2 ❤️',
        'Oya drop your 9jaChat handle na! ✨'
      ],
      spray: [
        'TWALE CHAIRMAN!! Original Odogwu of Abuja! 💸🔥',
        'Na you biko!! Fresh mint Naira notes! 🙌🏾',
        'Blessings on your compound! You too much! 💰'
      ],
      negotiate: [
        'Okay boss, I go link you with my guy for Ministry 🤝',
        'Deal sealed! No wahala, I gat your back for FCT.',
        'Sharp! Make we run the package together 📈'
      ]
    };

    const deltaMap = { banter: 8, flirt: 14, spray: 22, negotiate: 10 };
    const tagMap = { banter: 'Friend 💚', flirt: 'Crush ❤️', spray: 'Odogwu 💸', negotiate: 'Connect 🤝' };
    const delta = deltaMap[actionType] || 8;
    const tag = tagMap[actionType] || 'Friend 💚';
    npc.affinity = Math.max(0, Math.min(100, (npc.affinity || 50) + delta));
    const pool = replies[actionType] || replies.banter;
    npc.banterText = pool[Math.floor(Math.random() * pool.length)];
    npc.banterTimer = 5.5;

    if (npc.labelEl) {
      const heartIcon = npc.affinity >= 75 ? '💖' : npc.affinity >= 50 ? '❤️' : '🤝';
      npc.labelEl.innerHTML = `
        <div style="color:#4ade80;font-weight:900;font-size:11px;text-shadow:0 2px 6px #000;margin-bottom:2px;">+${delta} ${tag}</div>
        <div class="w3d-speech-bubble" style="background:rgba(15,23,42,0.95);border:1px solid #4ade80;color:#fef08a;padding:3px 7px;border-radius:6px;margin-bottom:3px;font-size:10px;white-space:nowrap;">${npc.banterText}</div>
        <span class="w3d-dist-name" style="font-size:10px">${heartIcon} ${npc.name} • ❤️ ${npc.affinity}</span>
      `;
    }

    if (actionType === 'spray') {
      this.spawnNairaRain(14);
    }
    return { npc, affinity: npc.affinity, reply: npc.banterText };
  }

  // Feature #13: Find Nearest 3D Street Vendor (Mai Suya, Roasted Corn, OPay POS)
  findNearestVendor(maxDist = 11.5) {
    if (!this.streetVendors) return null;
    let best = null;
    let bestD = maxDist;
    for (const v of this.streetVendors) {
      const d = Math.hypot(v.x - this.playerPos.x, v.z - this.playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  // Feature #8: Vehicle Carjacking & Green Cab Hailing
  findNearestTrafficVehicle(maxDist = 13) {
    if (!this.trafficCars) return null;
    let best = null;
    let bestD = maxDist;
    for (const c of this.trafficCars) {
      if (!c.group.visible) continue;
      const d = Math.hypot(c.group.position.x - this.playerPos.x, c.group.position.z - this.playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  hailOrCommandeerVehicle(car, mode = 'cab', targetDistrictId = null) {
    if (!car) car = this.findNearestTrafficVehicle(18);
    if (mode === 'hijack') {
      if (car) {
        this.playerPos.set(car.group.position.x, 0, car.group.position.z);
        this.playerHeading = car.group.rotation.y;
        if (car.color) this.setCarWrap(car.color, 'metallic');
      }
      if (!this.inVehicle) this.toggleVehicleMode();
      this._triggerScreenShake(0.6);
      this.showThoughtBubble('🚘', 'Commandeered FCT Ride!', 2800);
      return true;
    }

    // Green Cab Automated Ride
    const destId = targetDistrictId || this.gpsTargetDistrict || 'wuse2';
    const d = DISTRICT_BY_ID[destId] || DISTRICT_BY_ID.wuse2;
    this.setCarWrap(0x059669, 'metallic'); // Abuja Green Cab livery
    if (!this.inVehicle) this.toggleVehicleMode();
    this.showThoughtBubble('🚕', `Abuja Green Cab → ${d.short}`, 3200);
    this.flyToDistrict(destId, false);
    return true;
  }

  // Feature #7: 5-Star Wanted Level with Active 3D Police / VIO Hilux Pursuits
  updateWantedPursuitLevel(stars = 0) {
    const clamped = Math.max(0, Math.min(5, Math.floor(stars)));
    this.wantedStars = clamped;
    const desiredUnits = clamped === 0 ? 0 : Math.min(3, Math.ceil(clamped / 1.6));

    while (this.pursuitUnits.length > desiredUnits) {
      const u = this.pursuitUnits.pop();
      this.scene.remove(u.group);
      this._disposeObject3D(u.group);
    }

    while (this.pursuitUnits.length < desiredUnits) {
      const idx = this.pursuitUnits.length;
      const group = this._buildAmbientCarMesh(0x0f172a, 'police');
      const angle = (idx * Math.PI * 2) / 3 + Math.random();
      group.position.set(
        this.playerPos.x + Math.cos(angle) * 58,
        0,
        this.playerPos.z + Math.sin(angle) * 58
      );
      this.scene.add(group);
      this.pursuitUnits.push({
        group,
        speed: 44 + idx * 6,
        flankOffset: (idx - 1) * 6.5,
        heading: 0
      });
    }
  }

  // Feature #11: Stumble & Ragdoll Tumble Physics on High-Speed Impact
  triggerPlayerRagdoll(dirX = 0, dirZ = 1, force = 16) {
    if (this.inVehicle) return;
    const len = Math.max(0.01, Math.hypot(dirX, dirZ));
    this.ragdollState = {
      active: true,
      timer: 1.35,
      vx: (dirX / len) * force,
      vy: 8.5,
      vz: (dirZ / len) * force
    };
    this._triggerScreenShake(0.75);
    this.showThoughtBubble('💫', 'Omo! High-Speed Tumble!', 2200);
  }

  // Feature #9 + Fixes #15 & #43: Zero-GC Pooled Tire Smoke & Raised Asphalt Skid Decals
  _spawnTireSmoke() {
    if (this.lowPowerMode) return;
    const h = this.playerHeading || 0;
    for (const side of [-1.9, 1.9]) {
      const px = this.playerPos.x + Math.sin(h) * -2.9 + Math.cos(h) * side;
      const pz = this.playerPos.z + Math.cos(h) * -2.9 - Math.sin(h) * side;
      this._emitPooledPuff({
        x: px,
        y: 0.52,
        z: pz,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 1.35 + Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 1.2,
        scale: 0.95 + Math.random() * 0.55,
        grow: 1.35,
        life: 0.58,
        color: 0xe2e8f0
      });
    }
  }

  _spawnSkidDecal() {
    if (this.lowPowerMode) return;
    if (!this._sharedSkidGeo) {
      this._sharedSkidGeo = new THREE.PlaneGeometry(0.42, 1.55);
      this._sharedSkidMat = new THREE.MeshBasicMaterial({
        color: 0x090d16,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4
      });
    }
    const h = this.playerHeading || 0;
    for (const side of [-1.85, 1.85]) {
      const mark = new THREE.Mesh(this._sharedSkidGeo, this._sharedSkidMat);
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = -h;
      const px = this.playerPos.x + Math.sin(h) * -2.85 + Math.cos(h) * side;
      const pz = this.playerPos.z + Math.cos(h) * -2.85 - Math.sin(h) * side;
      // Graphics Fix #15: Placed cleanly above asphalt deck (y = 0.592) so tire skids are never buried!
      mark.position.set(px, 0.592, pz);
      this.scene.add(mark);
      this.skidDecals.push(mark);
    }
    while (this.skidDecals.length > 64) {
      const old = this.skidDecals.shift();
      this.scene.remove(old);
    }
  }

  setWeatherPreset(preset = 'sunny') {
    const presets = {
      sunny: { hour: 13, weather: 'sunny' },
      rain: { hour: 15, weather: 'downpour' },
      harmattan: { hour: 10, weather: 'harmattan' },
      sunset: { hour: 18.5, weather: 'sunny' },
      night: { hour: 22, weather: 'dry' }
    };
    const p = presets[preset] || presets.sunny;
    this.weatherPreset = preset;
    this.setEnvironment(p.hour, p.weather);
    return preset;
  }

  spawnNairaRain(count = 28) {
    if (!this._particlePool) return;
    // Graphics Fix #43: Zero-GC pooled Naira notes in InstancedMesh!
    const pool = this._particlePool;
    const noteColors = [0x38bdf8, 0xa855f7, 0x10b981, 0xfacc15];
    const spawnCount = Math.min(count, pool.notes.length);
    for (let i = 0; i < spawnCount; i++) {
      const idx = pool.noteCursor;
      pool.noteCursor = (pool.noteCursor + 1) % pool.notes.length;
      const n = pool.notes[idx];
      n.active = true;
      n.x = this.playerPos.x + (Math.random() - 0.5) * 24;
      n.y = 14 + Math.random() * 22;
      n.z = this.playerPos.z + (Math.random() - 0.5) * 24;
      n.vy = 5.5 + Math.random() * 4.5;
      n.rx = (Math.random() - 0.5) * 4.2;
      n.ry = (Math.random() - 0.5) * 3.0;
      n.rz = (Math.random() - 0.5) * 4.2;
      n.ax = Math.random() * Math.PI;
      n.ay = Math.random() * Math.PI;
      n.az = Math.random() * Math.PI;
      n.life = 3.2;
      pool.tmpColor.setHex(noteColors[i % noteColors.length]);
      pool.noteMesh.setColorAt(idx, pool.tmpColor);
    }
    if (pool.noteMesh.instanceColor) pool.noteMesh.instanceColor.needsUpdate = true;
  }

  syncRemotePlayers(playersList = [], localPlayerId = '') {
    const seenIds = new Set();

    for (const p of playersList) {
      if (!p.id || p.id === localPlayerId) continue;
      seenIds.add(p.id);

      const d = DISTRICT_BY_ID[p.district] || DISTRICT_BY_ID.wuse2;
      const px = typeof p.x === 'number' ? p.x : d.x;
      const py = typeof p.y === 'number' ? p.y : d.y;
      const pos3D = map2DTo3D(px, py);

      let entry = this.remotePlayers.get(p.id);
      if (!entry) {
        const group = new THREE.Group();
        group.position.set(pos3D.x, 0, pos3D.z);

        const color = p.isBot ? 0xf59e0b : 0xec4899;
        const avatarRig = this._buildHumanoidRig({
          jacketColor: color,
          shirtColor: 0xffffff,
          pantsColor: 0x111827,
          shoeColor: 0xfacc15
        });
        avatarRig.root.position.y = 0.2;
        group.add(avatarRig.root);

        const halo = new THREE.Mesh(
          new THREE.RingGeometry(1.6, 2.2, 24),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
        );
        halo.rotateX(-Math.PI / 2);
        halo.position.y = 0.35;
        group.add(halo);

        this.scene.add(group);

        const labelEl = document.createElement('div');
        labelEl.className = `world3d-player-tag ${p.isBot ? 'is-bot' : 'is-human'}`;
        labelEl.innerHTML = `
          <div class="w3d-speech-bubble" hidden></div>
          <div class="w3d-player-pill">
            <span class="w3d-p-dot"></span>
            <span class="w3d-p-name"></span>
            <span class="w3d-p-district"></span>
          </div>
        `;
        labelEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.callbacks.onSelectPlayer && entry) {
            this.callbacks.onSelectPlayer(entry.data);
          }
        });
        this.labelLayer.appendChild(labelEl);

        entry = {
          id: p.id,
          group,
          humanRig: avatarRig,
          targetPos: new THREE.Vector3(pos3D.x, 0, pos3D.z),
          labelEl,
          bubbleEl: labelEl.querySelector('.w3d-speech-bubble'),
          nameEl: labelEl.querySelector('.w3d-p-name'),
          distEl: labelEl.querySelector('.w3d-p-district'),
          bubbleTimeout: null,
          data: p
        };
        this.remotePlayers.set(p.id, entry);
      }

      entry.data = p;
      entry.targetPos.set(pos3D.x, 0, pos3D.z);
      // Algorithm #10: Feed authoritative snapshot into Cubic Hermite Spline Interpolator
      this.netInterp.pushSnapshot(p.id, pos3D.x, pos3D.z, this.elapsedTime);
      entry.nameEl.textContent = p.name;
      entry.distEl.textContent = (DISTRICT_BY_ID[p.district]?.short || p.district || '').toUpperCase();
    }

    for (const [id, entry] of this.remotePlayers.entries()) {
      if (!seenIds.has(id)) {
        clearTimeout(entry.bubbleTimeout);
        this.netInterp.remove(id);
        this.scene.remove(entry.group);
        this._disposeObject3D(entry.group);
        entry.labelEl.remove();
        this.remotePlayers.delete(id);
      }
    }
  }

  showPlayerSpeechBubble(playerId, playerName, text) {
    let target = this.remotePlayers.get(playerId);
    if (!target) {
      for (const entry of this.remotePlayers.values()) {
        if (entry.data.name === playerName) {
          target = entry;
          break;
        }
      }
    }
    if (!target || !target.bubbleEl) return;

    target.bubbleEl.textContent = text;
    target.bubbleEl.hidden = false;
    clearTimeout(target.bubbleTimeout);
    target.bubbleTimeout = setTimeout(() => {
      if (target.bubbleEl) target.bubbleEl.hidden = true;
    }, 6500);
  }

  getPlayer2DCoords() {
    return map3DTo2D(this.playerPos.x, this.playerPos.z);
  }

  _animate() {
    this.animFrameId = requestAnimationFrame(this._animate);
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.lastTime || now)) / 1000));
    this.lastTime = now;
    this.elapsedTime += dt;

    for (const m of this.spinningMeshes) {
      m.rotation.y += dt * 1.4;
    }

    // Graphics Fix #20: Rotate horizontal-axle meshes (Magicland Ferris Wheel) on Z-axis
    if (this.axleSpinningMeshes) {
      for (const m of this.axleSpinningMeshes) {
        m.rotation.z += dt * 0.42;
      }
    }

    // Graphics Fix #26: Scroll water normal-map UVs for live rippling lakes
    if (this.waterNormalMaps) {
      for (const nm of this.waterNormalMaps) {
        nm.offset.x = (nm.offset.x + dt * 0.045) % 1;
        nm.offset.y = (nm.offset.y + dt * 0.028) % 1;
      }
    }

    // Keep 360° Sky Dome, Night Stars & Drifting Clouds centered over player (Fix #27)
    if (this.skyDome) this.skyDome.position.set(this.playerPos.x, 0, this.playerPos.z);
    if (this.starField) this.starField.position.set(this.playerPos.x, 0, this.playerPos.z);
    if (this.cloudGroup && this.cloudGroup.visible) {
      this.cloudGroup.position.set(this.playerPos.x, 0, this.playerPos.z);
      this.cloudGroup.rotation.y += dt * 0.005;
    }

    // Graphics Fixes #34 & #46: Smooth traffic intersection transitions & rolling 3D wheels
    for (const car of this.trafficCars) {
      const segLen = Math.max(10, car.seg.vA.distanceTo(car.seg.vB));
      const dtT = (dt * car.speed * 22 * car.dir) / segLen;
      car.t += dtT;

      if (car.t > 1 || car.t < 0) {
        const arrivedNode = car.t > 1 ? car.seg.edge.b : car.seg.edge.a;
        const candidates = !car.seg.isRail && this.roadSegmentsByDistrict
          ? this.roadSegmentsByDistrict.get(arrivedNode)
          : null;
        if (candidates && candidates.length > 1) {
          const others = candidates.filter((s) => s !== car.seg);
          const nextSeg = others[Math.floor(Math.random() * others.length)] || candidates[0];
          car.seg = nextSeg;
          if (nextSeg.edge.a === arrivedNode) {
            car.t = 0.01;
            car.dir = 1;
          } else {
            car.t = 0.99;
            car.dir = -1;
          }
          car.laneOffset = car.dir > 0 ? 3.2 : -3.2;
        } else {
          // Rail trains & dead-end spurs bounce smoothly instead of popping
          car.dir = -car.dir;
          car.t = Math.max(0.01, Math.min(0.99, car.t));
          if (!car.seg.isRail) car.laneOffset = -car.laneOffset;
        }
      }

      const { vA, vB, angle } = car.seg;
      car.group.position.lerpVectors(vA, vB, car.t);
      car.group.position.x += Math.cos(angle) * car.laneOffset;
      car.group.position.z -= Math.sin(angle) * car.laneOffset;
      car.group.rotation.y = car.dir > 0 ? angle : angle + Math.PI;

      // Distance culling for traffic cars
      const distCar = Math.hypot(car.group.position.x - this.playerPos.x, car.group.position.z - this.playerPos.z);
      car.group.visible = distCar < 220;

      // Graphics Fix #34: Spin visible traffic car wheels proportionally to travel speed
      if (car.group.visible && car.group.userData?.wheels?.length) {
        const wDelta = (car.speed * 22 * dt) / 0.55;
        const wList = car.group.userData.wheels;
        for (let wi = 0; wi < wList.length; wi++) {
          wList[wi].rotation.x += wDelta;
        }
      }

      // Police / Security Patrol flashing lights animation
      if (car.group.visible && car.group.userData?.policeBeacons) {
        const flashPhase = (this.elapsedTime * 8) % 2;
        const pb = car.group.userData.policeBeacons;
        if (pb.red?.material) pb.red.material.color.setHex(flashPhase < 1 ? 0xff0000 : 0x450a0a);
        if (pb.blue?.material) pb.blue.material.color.setHex(flashPhase >= 1 ? 0x0066ff : 0x082f49);
      }

      // Feature #11: High-speed traffic impact ragdoll check when player is on foot
      if (!this.inVehicle && !this.ragdollState?.active && distCar < 3.6 && car.speed > 0.3) {
        const pushX = this.playerPos.x - car.group.position.x;
        const pushZ = this.playerPos.z - car.group.position.z;
        this.triggerPlayerRagdoll(pushX, pushZ, 18);
      }
    }

    // Feature #7 + Algorithm #4: Reynolds Steering Behaviors (Obstacle-Avoiding PIT/Flank Police Pursuit + Separation)
    if (this.pursuitUnits && this.pursuitUnits.length > 0) {
      const flashPhase = (this.elapsedTime * 11) % 2;
      let minPoliceDist = 999;
      const peerPositions = this.pursuitUnits.map((pu) => ({ x: pu.group.position.x, z: pu.group.position.z }));

      for (let i = 0; i < this.pursuitUnits.length; i++) {
        const u = this.pursuitUnits[i];
        const trueDist = Math.hypot(this.playerPos.x - u.group.position.x, this.playerPos.z - u.group.position.z);
        if (trueDist < minPoliceDist) minPoliceDist = trueDist;

        const steered = SteeringAgentController.computePursuitSteering(
          {
            x: u.group.position.x,
            z: u.group.position.z,
            speed: u.speed,
            heading: u.heading,
            flankAngle: this.elapsedTime * 1.1 + i * 2.1,
            flankOffset: u.flankOffset
          },
          this.playerPos,
          this.playerVel,
          peerPositions,
          this.obbSolver,
          dt
        );
        u.group.position.x = steered.x;
        u.group.position.z = steered.z;
        u.heading = steered.heading;
        u.group.rotation.y = steered.heading;

        // Spin police pursuit Hilux wheels (Fix #34)
        const pSpeed = Math.hypot(steered.vx, steered.vz);
        if (u.group.userData?.wheels?.length) {
          const wd = (pSpeed * dt) / 0.55;
          for (const w of u.group.userData.wheels) w.rotation.x += wd;
        }

        if (trueDist <= 5.2 && this.inVehicle && Math.random() < 0.04) {
          this._triggerScreenShake(0.35);
          this._spawnCollisionSparks(this.playerPos.x, this.playerPos.z);
        }
        const pb = u.group.userData?.policeBeacons;
        if (pb) {
          if (pb.red?.material) pb.red.material.color.setHex(flashPhase < 1 ? 0xff0000 : 0x450a0a);
          if (pb.blue?.material) pb.blue.material.color.setHex(flashPhase >= 1 ? 0x0066ff : 0x082f49);
        }
      }

      // 3.5s Box-In Arrest/Checkpoint Trigger OR 45s Line-of-Sight Evasion Cooldown
      if (minPoliceDist < 7.5 && Math.abs(this.playerSpeed || 0) < 12) {
        this._policeBoxInTimer = (this._policeBoxInTimer || 0) + dt;
        this._policeEvasionTimer = 0;
        if (this._policeBoxInTimer >= 3.5) {
          this._policeBoxInTimer = 0;
          if (typeof this.callbacks.onPoliceBoxedIn === 'function') {
            this.callbacks.onPoliceBoxedIn();
          }
        }
      } else if (minPoliceDist > 34) {
        this._policeBoxInTimer = 0;
        this._policeEvasionTimer = (this._policeEvasionTimer || 0) + dt;
        if (this._policeEvasionTimer >= 45) {
          this._policeEvasionTimer = 0;
          if (typeof this.callbacks.onWantedEvaded === 'function') {
            this.callbacks.onWantedEvaded();
          }
        }
      } else {
        this._policeBoxInTimer = Math.max(0, (this._policeBoxInTimer || 0) - dt * 0.5);
      }
    }

    // Feature #15 + Fix #44: World-Space Rain Streaks + Expanding Ground Splash Ripples + Lightning
    if (this.rainLines && this.rainLines.visible) {
      // Snap rain volume on 8m world grid to avoid streaks "gluing" to player camera movement
      const snapX = Math.floor(this.playerPos.x / 8) * 8;
      const snapZ = Math.floor(this.playerPos.z / 8) * 8;
      this.rainLines.position.set(snapX, 0, snapZ);
      const posAttr = this.rainLines.geometry.attributes.position;
      const arr = posAttr.array;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= 95 * dt;
        arr[i + 4] -= 95 * dt;
        if (arr[i + 4] < 0) {
          const ny = 60 + Math.random() * 18;
          arr[i + 1] = ny;
          arr[i + 4] = ny - 3.6;
        }
      }
      posAttr.needsUpdate = true;

      // Animate expanding raindrop splash rings on wet asphalt
      if (this.rainSplashes && !this.lowPowerMode) {
        for (let i = 0; i < this.rainSplashes.length; i++) {
          const sp = this.rainSplashes[i];
          sp.life -= dt;
          if (sp.life <= 0) {
            sp.life = sp.maxLife;
            sp.mesh.position.set(
              this.playerPos.x + (Math.random() - 0.5) * 48,
              0.595,
              this.playerPos.z + (Math.random() - 0.5) * 48
            );
            sp.mesh.scale.setScalar(0.3);
          } else {
            const p = 1 - sp.life / sp.maxLife;
            sp.mesh.scale.setScalar(0.3 + p * 2.1);
          }
        }
      }

      // Occasional tropical lightning sky flash during heavy downpours
      if (this.sunLight && Math.random() < 0.005) {
        this.sunLight.intensity = 3.6;
        setTimeout(() => {
          if (this.sunLight) this.sunLight.intensity = (this.hourOfDay >= 20 || this.hourOfDay < 6) ? 0.42 : 0.95;
        }, 110);
      }
    }

    if (this.harmattanPoints && this.harmattanPoints.visible) {
      this.harmattanPoints.position.set(
        this.playerPos.x + Math.sin(this.elapsedTime * 0.5) * 6,
        Math.cos(this.elapsedTime * 0.4) * 1.5,
        this.playerPos.z + Math.cos(this.elapsedTime * 0.5) * 6
      );
      this.harmattanPoints.rotation.y += dt * 0.12;
    }

    // Graphics Fix #37: Sway ONLY the canopy crownGroup so tree trunks stay solidly rooted!
    if (this.swayingTrees && !this.lowPowerMode) {
      const windAmp = (this.weather === 'harmattan' || this.weather === 'storm' || this.weather === 'downpour') ? 0.12 : 0.035;
      const windFreq = (this.weather === 'harmattan' || this.weather === 'storm') ? 3.8 : 1.6;
      for (let i = 0; i < this.swayingTrees.length; i++) {
        const tr = this.swayingTrees[i];
        const target = tr.userData?.crownGroup || tr;
        target.rotation.z = Math.sin(this.elapsedTime * windFreq + i * 0.7) * windAmp;
      }
    }

    // Feature #17 + Fix #17: Animate Wuse 2 Volumetric Neon Pulse (poolMat + glowMat!)
    if (this.neonPulses) {
      const isNightOrDusk = this.hourOfDay >= 18 || this.hourOfDay < 7;
      const gridOn = this.gridPowerOnline !== false;
      for (let i = 0; i < this.neonPulses.length; i++) {
        const np = this.neonPulses[i];
        const pulse = 0.72 + Math.sin(this.elapsedTime * 4.2 + i * 1.3) * 0.24;
        if (np.poolMat) np.poolMat.opacity = gridOn ? (isNightOrDusk ? 0.45 : 0.16) * pulse : 0.0;
        if (np.glowMat) np.glowMat.opacity = gridOn ? (isNightOrDusk ? 0.78 : 0.35) * pulse : 0.0;
      }
    }

    // Feature #13 + Fix #43: Zero-GC Pooled Street Vendor Charcoal Smoke
    if (this.streetVendors && !this.lowPowerMode && Math.random() < 0.28) {
      for (const v of this.streetVendors) {
        if (v.type !== 'suya' && v.type !== 'corn') continue;
        if (Math.hypot(v.x - this.playerPos.x, v.z - this.playerPos.z) < 95) {
          this._emitPooledPuff({
            x: v.x + (Math.random() - 0.5) * 0.8,
            y: 1.9,
            z: v.z + (Math.random() - 0.5) * 0.8,
            vx: (Math.random() - 0.5) * 0.4,
            vy: 2.1,
            vz: (Math.random() - 0.5) * 0.4,
            scale: 0.9,
            grow: 1.4,
            life: 1.15,
            color: 0xd6d3d1
          });
        }
      }
    }

    // Feature #4 + Fix #43: Zero-GC Pooled Mood Aura VFX (Green Stink Clouds vs Gold Steeze Sparks)
    if (this.playerMoodState && !this.lowPowerMode && Math.random() < 0.2) {
      if (this.playerMoodState.hygiene < 35) {
        this._emitPooledPuff({
          x: this.playerPos.x + (Math.random() - 0.5) * 1.4,
          y: 2.2 + Math.random() * 1.4,
          z: this.playerPos.z + (Math.random() - 0.5) * 1.4,
          vy: 1.5,
          scale: 0.75,
          grow: 1.1,
          life: 0.85,
          color: 0x84cc16
        });
      } else if (this.playerMoodState.steeze >= 75) {
        this._emitPooledPuff({
          x: this.playerPos.x + (Math.random() - 0.5) * 2.2,
          y: 1.8 + Math.random() * 2.4,
          z: this.playerPos.z + (Math.random() - 0.5) * 2.2,
          vy: 1.6,
          scale: 0.55,
          grow: 0.3,
          life: 0.7,
          color: 0xfacc15
        });
      }
    }

    // Animate street pedestrians with Algorithm #4 Flee Steering & Fix #35 Knee/Elbow Flexion
    for (const npc of this.streetPedestrians) {
      const distNpc = Math.hypot(npc.homeX - this.playerPos.x, npc.homeZ - this.playerPos.z);
      if (distNpc > 180) {
        npc.rig.root.visible = false;
        continue;
      }
      npc.rig.root.visible = true;
      if (npc.banterTimer > 0) {
        npc.banterTimer = Math.max(0, npc.banterTimer - dt);
        if (npc.banterTimer === 0 && npc.labelEl) {
          const heartIcon = npc.affinity >= 75 ? '💖' : npc.affinity >= 50 ? '❤️' : '🤝';
          npc.labelEl.innerHTML = `<span class="w3d-dist-name" style="font-size:10px">${heartIcon} ${npc.name} • ❤️ ${npc.affinity}</span>`;
        }
      }
      if (npc.knockedTimer > 0) {
        npc.knockedTimer -= dt;
        npc.rig.root.rotation.x = -Math.PI / 2.1;
        npc.rig.root.position.y = 0.55;
      } else if (npc.banterTimer > 0) {
        // Pause walking while chatting with player
        npc.rig.root.rotation.x = 0;
        npc.rig.root.position.y = 0.2;
        npc.rig.leftLegPivot.rotation.x = 0;
        npc.rig.rightLegPivot.rotation.x = 0;
        if (npc.rig.leftKneePivot) npc.rig.leftKneePivot.rotation.x = 0;
        if (npc.rig.rightKneePivot) npc.rig.rightKneePivot.rotation.x = 0;
        npc.rig.rightArmPivot.rotation.x = -0.45 + Math.sin(this.elapsedTime * 6) * 0.25;
        if (npc.rig.rightElbowPivot) npc.rig.rightElbowPivot.rotation.x = -0.55;
      } else {
        npc.rig.root.rotation.x = 0;
        npc.rig.root.position.y = 0.2;

        // Algorithm #4: Pedestrians leap/flee out of the way of speeding player vehicles!
        let nx, nz, walkRate = 6;
        const fleeVec = (this.inVehicle && Math.abs(this.playerSpeed) > 16)
          ? SteeringAgentController.flee(npc.rig.root.position.x, npc.rig.root.position.z, this.playerPos.x, this.playerPos.z, 13, 15)
          : { fleeing: false, vx: 0, vz: 0 };

        if (fleeVec.fleeing) {
          nx = npc.rig.root.position.x + fleeVec.vx * dt;
          nz = npc.rig.root.position.z + fleeVec.vz * dt;
          npc.phase += dt * 3.2;
          walkRate = 10;
        } else {
          npc.phase += dt * npc.speed;
          nx = npc.homeX + Math.sin(npc.phase) * npc.patrolRadius;
          nz = npc.homeZ + Math.cos(npc.phase * 0.7) * (npc.patrolRadius * 0.6);
        }

        const dx = nx - npc.rig.root.position.x;
        const dz = nz - npc.rig.root.position.z;
        npc.rig.root.position.set(nx, 0.2, nz);
        if (Math.hypot(dx, dz) > 0.005) {
          npc.rig.root.rotation.y = Math.atan2(dx, dz);
        }

        const swing = Math.sin(npc.phase * walkRate) * 0.55;
        npc.rig.leftLegPivot.rotation.x = swing;
        npc.rig.rightLegPivot.rotation.x = -swing;
        npc.rig.leftArmPivot.rotation.x = -swing * 0.8;
        npc.rig.rightArmPivot.rotation.x = swing * 0.8;
        // Graphics Fix #35: Natural knee & elbow flexion
        if (npc.rig.leftKneePivot) npc.rig.leftKneePivot.rotation.x = Math.max(0, -swing * 0.85);
        if (npc.rig.rightKneePivot) npc.rig.rightKneePivot.rotation.x = Math.max(0, swing * 0.85);
        if (npc.rig.leftElbowPivot) npc.rig.leftElbowPivot.rotation.x = -0.25 - Math.abs(swing) * 0.45;
        if (npc.rig.rightElbowPivot) npc.rig.rightElbowPivot.rotation.x = -0.25 - Math.abs(swing) * 0.45;
      }
    }

    if (this.skyCam.active) {
      this.skyCam.elapsed += dt;
      const u = Math.min(1, this.skyCam.elapsed / this.skyCam.duration);
      const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

      this.playerPos.lerpVectors(this.skyCam.from, this.skyCam.to, ease);
      this.playerGroup.position.copy(this.playerPos);

      const altitudeArc = Math.sin(u * Math.PI) * 280;
      const camPos = new THREE.Vector3(
        this.playerPos.x + Math.sin(this.cameraYaw) * (this.cameraDistance + altitudeArc * 0.35),
        12 + altitudeArc,
        this.playerPos.z + Math.cos(this.cameraYaw) * (this.cameraDistance + altitudeArc * 0.35)
      );
      this.camera.position.copy(camPos);
      this.camera.lookAt(this.playerPos.x, 3.8, this.playerPos.z);

      if (u >= 1) {
        this.skyCam.active = false;
      }
    } else {
      this._updatePlayerDriving(dt);
    }

    // Animate Sims 3D Plumbob Diamond above player avatar
    if (this.plumbob) {
      this.plumbob.rotation.y += dt * 2.2;
      const t = this.elapsedTime;
      const baseHeight = this.inVehicle ? 4.3 : 5.8;
      this.plumbob.position.y = baseHeight + Math.sin(t * 3.2) * 0.12;
      const pulse = 1.0 + Math.sin(t * 4.0) * 0.05;
      this.plumbob.scale.set(pulse, pulse, pulse);
    }

    if (this.thoughtBubbleGroup && this.thoughtBubbleGroup.visible) {
      this.thoughtBubbleGroup.quaternion.copy(this.camera.quaternion);
      const bob = Math.sin(this.elapsedTime * 3.0) * 0.08;
      this.thoughtBubbleGroup.position.y = (this.inVehicle ? 5.8 : 7.2) + bob;
    }

    // Algorithm #10: Cubic Hermite Spline Entity Interpolation & Dead Reckoning for Remote Players
    for (const entry of this.remotePlayers.values()) {
      const sample = this.netInterp.sample(entry.id, this.elapsedTime);
      let isMoving = false;
      if (sample) {
        entry.group.position.set(sample.x, 0, sample.z);
        entry.group.rotation.y = sample.heading;
        isMoving = sample.isMoving;
      } else {
        const dist = entry.group.position.distanceTo(entry.targetPos);
        entry.group.position.lerp(entry.targetPos, Math.min(1, dt * 4.5));
        isMoving = dist > 0.08;
      }
      if (entry.humanRig) {
        const swing = isMoving ? Math.sin(this.elapsedTime * 9) * 0.55 : 0;
        if (entry.humanRig.leftLegPivot) entry.humanRig.leftLegPivot.rotation.x = swing;
        if (entry.humanRig.rightLegPivot) entry.humanRig.rightLegPivot.rotation.x = -swing;
        if (entry.humanRig.leftKneePivot) entry.humanRig.leftKneePivot.rotation.x = Math.max(0, -swing * 0.85);
        if (entry.humanRig.rightKneePivot) entry.humanRig.rightKneePivot.rotation.x = Math.max(0, swing * 0.85);
        if (entry.humanRig.leftArmPivot) entry.humanRig.leftArmPivot.rotation.x = -swing * 0.7;
        if (entry.humanRig.rightArmPivot) entry.humanRig.rightArmPivot.rotation.x = swing * 0.7;
      }
    }

    // Graphics Fix #43: Update Zero-GC Object-Pooled InstancedMesh Particle System
    this._updateParticlePool(dt);

    // Legacy particle array cleanup (kept safe if any external caller adds to nairaParticles)
    for (let i = this.nairaParticles.length - 1; i >= 0; i--) {
      const p = this.nairaParticles[i];
      p.life -= dt;
      p.mesh.position.y -= p.vy * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.z += p.rz * dt;
      if (p.mesh.material && p.mesh.material.transparent) {
        p.mesh.material.opacity = Math.max(0, p.life * 1.8);
      }
      if (p.life <= 0 || p.mesh.position.y <= 0.3) {
        this.scene.remove(p.mesh);
        this._disposeObject3D(p.mesh);
        this.nairaParticles.splice(i, 1);
      }
    }

    // Algorithm #7: Frustum Culling & 3-Tier LOD update (runs every 6 frames)
    if (!this._distVisThrottle || ++this._distVisThrottle >= 6) {
      this._distVisThrottle = 0;
      this._updateDistrictVisibility();
    }

    // Graphics Fixes #4 & #5: Snap sunLight target to shadow-map texel grid along true solar arc (zero shadow shimmer!)
    if (this.sunLight) {
      const sunDir = this._sunDir || new THREE.Vector3(0.45, 0.72, 0.25).normalize();
      const texelSize = ((this._shadowFrustumHalf || 140) * 2) / (this._shadowMapRes || 1024);
      const snapX = Math.round(this.playerPos.x / texelSize) * texelSize;
      const snapZ = Math.round(this.playerPos.z / texelSize) * texelSize;
      this.sunLight.target.position.set(snapX, 0, snapZ);
      this.sunLight.position.set(
        snapX + sunDir.x * 320,
        Math.max(55, sunDir.y * 320),
        snapZ + sunDir.z * 320
      );
      this.sunLight.target.updateMatrixWorld();
    }

    // Projected 2D HTML tags updated every 2nd frame to eliminate DOM reflow bottlenecks
    if (++this._labelThrottle % 2 === 0) {
      this._updateProjectedLabels();
    }

    this.renderer.render(this.scene, this.camera);
  }

  _updatePlayerDriving(dt) {
    // Camera-relative input vectors
    const forwardInput = (this.keys.w ? 1 : 0) - (this.keys.s ? 1 : 0) - this.touchVector.y;
    const rightInput = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0) + this.touchVector.x;

    const maxSpeed = this.inVehicle ? (this.keys.shift ? 132 : 88) : (this.keys.shift ? 40 : 25);
    const inputMag = Math.min(1, Math.hypot(forwardInput, rightInput));
    const isWet = this.weather === 'rain' || this.weather === 'storm' || this.weather === 'downpour';

    let phys = null;
    if (this.inVehicle) {
      // Algorithm #8: Ackermann Bicycle-Model Steering + Pacejka "Magic Formula" Lateral Tire Slip Physics
      let throttle = 0;
      let steerInput = 0;

      if (inputMag > 0.04) {
        const fwdX = -Math.sin(this.cameraYaw);
        const fwdZ = -Math.cos(this.cameraYaw);
        const rightX = Math.cos(this.cameraYaw);
        const rightZ = -Math.sin(this.cameraYaw);
        const moveX = fwdX * forwardInput + rightX * rightInput;
        const moveZ = fwdZ * forwardInput + rightZ * rightInput;
        const targetHeading = Math.atan2(moveX, moveZ);

        let diff = (targetHeading - (this.playerHeading || 0)) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) > 2.35) {
          throttle = -inputMag; // Brake / Reverse
          steerInput = Math.max(-1, Math.min(1, rightInput));
        } else {
          throttle = inputMag;
          steerInput = Math.max(-1, Math.min(1, -diff * 1.45));
        }
      }

      phys = this.vehiclePhysics.step({
        throttle,
        steerInput,
        handbrake: Boolean(this.keys.handbrake),
        boost: Boolean(this.keys.shift),
        isWet,
        heading: this.playerHeading || 0,
        dt
      });

      this.playerHeading = phys.heading;
      this.playerSpeed = phys.speed;
      this.driftSlip = phys.slipAngle;
      this.playerVel.x = dt > 0.0001 ? phys.dx / dt : 0;
      this.playerVel.z = dt > 0.0001 ? phys.dz / dt : 0;

      if (Math.abs(phys.dx) > 1e-4 || Math.abs(phys.dz) > 1e-4) {
        const prevX = this.playerPos.x;
        const prevZ = this.playerPos.z;
        const nextPos = { x: prevX + phys.dx, z: prevZ + phys.dz };
        const hitObstacle = this._resolveCollisions(nextPos, 3.2, prevX, prevZ);

        this.playerPos.x = Math.max(-680, Math.min(680, nextPos.x));
        this.playerPos.z = Math.max(-680, Math.min(680, nextPos.z));

        if (hitObstacle && Math.abs(this.playerSpeed) > 14) {
          this.vehiclePhysics.vx = -this.vehiclePhysics.vx * 0.28;
          this.vehiclePhysics.vz *= 0.2;
          this.playerSpeed = this.vehiclePhysics.vx;
          this._spawnCollisionSparks(this.playerPos.x, this.playerPos.z);
          if (typeof navigator?.vibrate === 'function') {
            try { navigator.vibrate([40, 30, 80]); } catch (e) {}
          }
          this._triggerScreenShake(0.8);
        }

        this.playerGroup.position.copy(this.playerPos);
        this.playerGroup.rotation.y = this.playerHeading;

        // Gently follow behind vehicle when steering while driving forward
        if (Math.abs(forwardInput) > 0.1 && this.cameraMode === 'chase') {
          this.cameraYaw -= rightInput * dt * 0.95;
        }
        this.walkCycle += dt * (this.keys.shift ? 16 : 10);
        this._checkDistrictProximity();
      } else {
        this.walkCycle *= 0.85;
      }
    } else if (inputMag > 0.04) {
      // On-foot responsive camera-relative locomotion + Swept OBB CCD collision
      const fwdX = -Math.sin(this.cameraYaw);
      const fwdZ = -Math.cos(this.cameraYaw);
      const rightX = Math.cos(this.cameraYaw);
      const rightZ = -Math.sin(this.cameraYaw);

      const moveX = fwdX * forwardInput + rightX * rightInput;
      const moveZ = fwdZ * forwardInput + rightZ * rightInput;

      this.playerHeading = Math.atan2(moveX, moveZ);
      this.playerSpeed = maxSpeed * inputMag;

      const stepX = Math.sin(this.playerHeading) * this.playerSpeed * dt;
      const stepZ = Math.cos(this.playerHeading) * this.playerSpeed * dt;
      this.playerVel.x = stepX / Math.max(0.001, dt);
      this.playerVel.z = stepZ / Math.max(0.001, dt);

      const prevX = this.playerPos.x;
      const prevZ = this.playerPos.z;
      const nextPos = { x: prevX + stepX, z: prevZ + stepZ };

      const hitObstacle = this._resolveCollisions(nextPos, 1.2, prevX, prevZ);

      this.playerPos.x = Math.max(-680, Math.min(680, nextPos.x));
      this.playerPos.z = Math.max(-680, Math.min(680, nextPos.z));

      if (hitObstacle) {
        this.playerSpeed *= 0.45;
      }

      this.playerGroup.position.copy(this.playerPos);
      this.playerGroup.rotation.y = this.playerHeading;

      this.walkCycle += dt * (this.keys.shift ? 16 : 10);
      this._checkDistrictProximity();
    } else {
      this.playerSpeed *= 0.82;
      this.playerVel.x = 0;
      this.playerVel.z = 0;
      this.walkCycle *= 0.85;
    }

    // ── SUPERB SPORTS CAR DRIVING DYNAMICS (Fixes #11, #15, #31, #33 + Algorithm #8) ──
    if (this.inVehicle && this.playerVehicleMesh?.userData) {
      const ud = this.playerVehicleMesh.userData;
      const rollDelta = (this.playerSpeed * dt) / 0.78;

      // Continuous 3D alloy wheel rotation
      if (ud.wheels) {
        for (const w of ud.wheels) {
          w.rotation.x += rollDelta;
        }
      }

      // Algorithm #8: True Ackermann inner & outer front wheel steering angles
      if (phys?.wheelAngles) {
        if (ud.frontLeftPivot) ud.frontLeftPivot.rotation.y = phys.wheelAngles.left;
        if (ud.frontRightPivot) ud.frontRightPivot.rotation.y = phys.wheelAngles.right;
      }

      // Graphics Fix #31: Toggle Cockpit interior & rotate steering wheel dynamically
      if (ud.cockpitGroup) {
        ud.cockpitGroup.visible = (this.cameraMode === 'cockpit');
      }
      if (ud.steeringWheel) {
        ud.steeringWheel.rotation.z = -(this.vehiclePhysics.steerAngle || 0) * 2.4;
      }

      // Graphics Fix #33: Live brake-light emissive flare when braking or handbraking
      if (ud.tailGlowMat) {
        ud.tailGlowMat.emissiveIntensity = phys?.isBraking ? 2.6 : 0.78;
      }

      // Pacejka Drift tire smoke & raised skid decals (Fixes #15, #43)
      if (phys?.isDrifting) {
        if (Math.random() < 0.68) this._spawnTireSmoke();
        if (Math.random() < 0.52) this._spawnSkidDecal();
        if (typeof this.callbacks.onVehicleDrift === 'function' && Math.random() < 0.14) {
          this.callbacks.onVehicleDrift();
        }
      }

      // Graphics Fix #11: Grounded Chassis Suspension (position.y = road vibration ONLY — NEVER +1.38!)
      if (ud.chassisGroup) {
        const targetPitch = forwardInput > 0.1 ? -0.042 : (phys?.isBraking ? 0.046 : 0);
        const targetRoll = -(this.vehiclePhysics.steerAngle || 0) * (this.playerSpeed / 72) * 0.14;
        ud.chassisGroup.rotation.x = THREE.MathUtils.lerp(ud.chassisGroup.rotation.x, targetPitch, dt * 8);
        ud.chassisGroup.rotation.z = THREE.MathUtils.lerp(ud.chassisGroup.rotation.z, targetRoll, dt * 8);
        ud.chassisGroup.rotation.y = (this.driftSlip || 0) * 0.72;
        ud.chassisGroup.position.y = Math.abs(this.playerSpeed) > 2 ? Math.sin(this.walkCycle * 2) * 0.022 : 0;
      }

      // Pooled Nitro exhaust flame puffs when driving fast or boosting
      if (this.playerSpeed > 35 || (this.keys.shift && this.playerSpeed > 15)) {
        if (Math.random() > 0.35) {
          this._spawnExhaustNitro(Math.random() > 0.5);
        }
      }
    }

    // Feature #11: Ragdoll Tumble Physics when hit by car or high-speed impact
    if (this.ragdollState?.active) {
      this.ragdollState.timer -= dt;
      this.playerPos.x = Math.max(-680, Math.min(680, this.playerPos.x + this.ragdollState.vx * dt));
      this.playerPos.z = Math.max(-680, Math.min(680, this.playerPos.z + this.ragdollState.vz * dt));
      this.ragdollState.vx *= 0.92;
      this.ragdollState.vz *= 0.92;
      this.playerGroup.position.copy(this.playerPos);
      if (this.playerPedMesh) {
        this.playerPedMesh.position.y = 0.8 + Math.abs(Math.sin(this.ragdollState.timer * 7)) * 1.4;
        this.playerPedMesh.rotation.x += dt * 11;
        this.playerPedMesh.rotation.z = Math.sin(this.ragdollState.timer * 10) * 0.6;
      }
      if (this.ragdollState.timer <= 0) {
        this.ragdollState.active = false;
        if (this.playerPedMesh) {
          this.playerPedMesh.position.y = 0.2;
          this.playerPedMesh.rotation.set(0, 0, 0);
        }
      }
    }

    // Feature #2 + Algorithm #1: Smart-Object Local A* Waypoint Walk, Pose & Pooled Steam VFX
    if (this.smartActionState?.active && this.playerHuman) {
      this.smartActionState.timer -= dt;
      const st = this.smartActionState.type;
      const pct = Math.min(100, Math.max(0, Math.round((1 - this.smartActionState.timer / Math.max(0.1, this.smartActionState.maxTimer)) * 100)));

      if (this.smartActionState.waypoints && this.smartActionState.waypoints.length > 0) {
        const wp = this.smartActionState.waypoints[0];
        const dx = wp.x - this.playerPos.x;
        const dz = wp.z - this.playerPos.z;
        const dWay = Math.hypot(dx, dz);
        if (dWay > 0.6) {
          const step = Math.min(dWay, 14 * dt);
          this.playerPos.x += (dx / dWay) * step;
          this.playerPos.z += (dz / dWay) * step;
          this.playerHeading = Math.atan2(dx, dz);
          this.playerGroup.position.copy(this.playerPos);
          this.playerGroup.rotation.y = this.playerHeading;
        } else {
          this.smartActionState.waypoints.shift();
        }
      }

      if (Math.floor(this.elapsedTime * 4) !== this.smartActionState._lastPctTick) {
        this.smartActionState._lastPctTick = Math.floor(this.elapsedTime * 4);
        this.showThoughtBubble(this.smartActionState.emoji || '✨', `${this.smartActionState.label} (${pct}%)`, 1200);
      }

      if (st === 'sleep') {
        this.playerPedMesh.rotation.x = -Math.PI / 2.1;
        this.playerPedMesh.position.y = 1.05;
      } else if (st === 'cook' || st === 'gen') {
        this.playerHuman.leftArmPivot.rotation.x = -0.85 + Math.sin(this.elapsedTime * 8) * 0.35;
        this.playerHuman.rightArmPivot.rotation.x = -0.85 - Math.sin(this.elapsedTime * 8) * 0.35;
        if (this.playerHuman.leftElbowPivot) this.playerHuman.leftElbowPivot.rotation.x = -0.55;
        if (this.playerHuman.rightElbowPivot) this.playerHuman.rightElbowPivot.rotation.x = -0.55;
        if (Math.random() < 0.35) {
          // Graphics Fix #43: Zero-GC pooled steam particle
          this._emitPooledPuff({
            x: this.playerPos.x + (Math.random() - 0.5),
            y: 2.8,
            z: this.playerPos.z + (Math.random() - 0.5),
            vy: 1.9,
            scale: 0.72,
            grow: 1.2,
            life: 0.75,
            color: 0xf8fafc
          });
        }
      }
      if (this.smartActionState.timer <= 0) {
        this.smartActionState.active = false;
        if (this.playerPedMesh) {
          this.playerPedMesh.rotation.x = 0;
          this.playerPedMesh.position.y = 0.2;
        }
      }
    }

    // Feature #1: Auto-Slice Compound Roofs into Sims Cutaway View when inside Owned Compound Plot!
    if (!this.inVehicle && this.playerHouseEntries && this.playerHouseEntries.size > 0 && !this.buildGridMode?.active) {
      let insideOwnedPlot = false;
      for (const entry of this.playerHouseEntries.values()) {
        const dPlot = Math.hypot(entry.group.position.x - this.playerPos.x, entry.group.position.z - this.playerPos.z);
        if (dPlot < 13.5) {
          insideOwnedPlot = true;
          break;
        }
      }
      if (insideOwnedPlot && !this._autoCutawayInside) {
        this._autoCutawayInside = true;
        this.cycleWallCutaway('cutaway');
      } else if (!insideOwnedPlot && this._autoCutawayInside && this.cameraMode !== 'dollhouse') {
        this._autoCutawayInside = false;
        this.cycleWallCutaway('up');
      }
    }

    // ── SUPERB ARTICULATED HUMANOID AVATAR ANIMATION (Fix #35: Knee & Elbow Flexion) ──
    if (this.playerHuman && !this.ragdollState?.active && !this.smartActionState?.active) {
      const moving = Math.abs(this.playerSpeed) > 1.2;
      const isSprinting = this.keys.shift && Math.abs(this.playerSpeed) > 18;

      if (moving) {
        const strideScale = isSprinting ? 1.15 : 0.72;
        const legSwing = Math.sin(this.walkCycle) * strideScale;
        this.playerHuman.leftLegPivot.rotation.x = legSwing;
        this.playerHuman.rightLegPivot.rotation.x = -legSwing;
        this.playerHuman.leftArmPivot.rotation.x = -legSwing * 0.9;

        // Articulated Knee & Elbow Flexion (Fix #35)
        if (this.playerHuman.leftKneePivot) this.playerHuman.leftKneePivot.rotation.x = Math.max(0, -legSwing * (isSprinting ? 1.05 : 0.85));
        if (this.playerHuman.rightKneePivot) this.playerHuman.rightKneePivot.rotation.x = Math.max(0, legSwing * (isSprinting ? 1.05 : 0.85));
        if (this.playerHuman.leftElbowPivot) this.playerHuman.leftElbowPivot.rotation.x = (isSprinting ? -0.95 : -0.35) - Math.abs(legSwing) * 0.35;

        // Sprinting forward athletic lean
        const targetTorsoLean = isSprinting ? 0.25 : 0.05;
        this.playerHuman.torso.rotation.x = THREE.MathUtils.lerp(this.playerHuman.torso.rotation.x, targetTorsoLean, dt * 10);
        this.playerHuman.headGroup.rotation.x = isSprinting ? -0.14 : 0;
      } else {
        // Idle breathing and natural stance
        this.playerHuman.leftLegPivot.rotation.x = 0;
        this.playerHuman.rightLegPivot.rotation.x = 0;
        if (this.playerHuman.leftKneePivot) this.playerHuman.leftKneePivot.rotation.x = 0;
        if (this.playerHuman.rightKneePivot) this.playerHuman.rightKneePivot.rotation.x = 0;
        if (this.playerHuman.leftElbowPivot) this.playerHuman.leftElbowPivot.rotation.x = -0.14;
        if (this.playerHuman.rightElbowPivot) this.playerHuman.rightElbowPivot.rotation.x = -0.14;
        this.playerHuman.torso.rotation.x = 0;
        this.playerHuman.headGroup.rotation.x = 0;

        const breathe = Math.sin(this.elapsedTime * 2.5) * 0.025;
        this.playerHuman.torso.position.y = 2.68 + breathe;
        this.playerHuman.headGroup.position.y = 4.24 + breathe * 0.5;
        this.playerHuman.leftArmPivot.rotation.x = 0.08 + Math.sin(this.elapsedTime * 1.8) * 0.025;
        this.playerHuman.rightArmPivot.rotation.x = 0.08 - Math.sin(this.elapsedTime * 1.8) * 0.025;
      }

      if (this.punchTimer > 0) {
        this.punchTimer = Math.max(0, this.punchTimer - dt);
        this.playerHuman.rightArmPivot.rotation.x = -Math.PI * 0.62;
        this.playerHuman.rightArmPivot.rotation.z = -0.25;
        if (this.playerHuman.rightElbowPivot) this.playerHuman.rightElbowPivot.rotation.x = -0.35;
        this.playerHuman.torso.rotation.y = 0.32;
      } else if (moving) {
        const legSwing = Math.sin(this.walkCycle) * (isSprinting ? 1.15 : 0.72);
        this.playerHuman.rightArmPivot.rotation.x = legSwing * 0.9;
        this.playerHuman.rightArmPivot.rotation.z = 0;
        if (this.playerHuman.rightElbowPivot) this.playerHuman.rightElbowPivot.rotation.x = (isSprinting ? -0.95 : -0.35) - Math.abs(legSwing) * 0.35;
        this.playerHuman.torso.rotation.y = 0;
      } else {
        this.playerHuman.rightArmPivot.rotation.z = 0;
        this.playerHuman.torso.rotation.y = 0;
      }
    }

    // Feature #18 + Fix #31: First-Person Cockpit (with dashboard/steering wheel) & Low Bumper Camera Modes
    if (this.cameraMode === 'cockpit' || this.cameraMode === 'bumper') {
      const heading = this.playerHeading || 0;
      const fwdOffset = this.cameraMode === 'bumper' ? (this.inVehicle ? 4.8 : 1.1) : (this.inVehicle ? 0.05 : 0.35);
      const sideOffset = this.cameraMode === 'cockpit' && this.inVehicle ? 0.45 : 0;
      const camY = this.cameraMode === 'bumper' ? (this.inVehicle ? 1.35 : 2.6) : (this.inVehicle ? 2.65 : 4.35);
      const desiredCam = new THREE.Vector3(
        this.playerPos.x + Math.sin(heading) * fwdOffset + Math.cos(heading) * sideOffset,
        camY,
        this.playerPos.z + Math.cos(heading) * fwdOffset - Math.sin(heading) * sideOffset
      );
      if (this._screenShakeIntensity > 0.001) {
        desiredCam.x += (Math.random() - 0.5) * this._screenShakeIntensity;
        desiredCam.y += (Math.random() - 0.5) * this._screenShakeIntensity;
        this._screenShakeIntensity = THREE.MathUtils.lerp(this._screenShakeIntensity, 0, dt * 6.5);
      }
      this.camera.position.lerp(desiredCam, Math.min(1, dt * 22));
      this.camera.lookAt(
        this.playerPos.x + Math.sin(heading) * 38,
        camY - 0.25,
        this.playerPos.z + Math.cos(heading) * 38
      );
      return;
    }

    // Algorithm #9 + Fix #45: Critically Damped Spring-Arm Camera with Real OBB Wall Occlusion!
    const horizDist = Math.cos(this.cameraPitch) * this.cameraDistance;
    const vertDist = Math.sin(this.cameraPitch) * this.cameraDistance;
    const minCamHeight = this.inVehicle ? 4.8 : 3.2;
    const lookTargetY = this.inVehicle ? 2.8 : 3.4;

    const pivot = { x: this.playerPos.x, y: lookTargetY, z: this.playerPos.z };
    const desiredCam = {
      x: this.playerPos.x + Math.sin(this.cameraYaw) * horizDist,
      y: Math.max(minCamHeight, vertDist + 1.5),
      z: this.playerPos.z + Math.cos(this.cameraYaw) * horizDist
    };

    const allowOcclusion = this.cameraMode === 'chase';
    const smoothed = this.springCamera.update(
      pivot,
      desiredCam,
      allowOcclusion ? this.obbSolver : null,
      dt,
      minCamHeight
    );

    if (this._screenShakeIntensity > 0.001) {
      smoothed.x += (Math.random() - 0.5) * this._screenShakeIntensity * 1.4;
      smoothed.y += (Math.random() - 0.5) * this._screenShakeIntensity * 1.1;
      smoothed.z += (Math.random() - 0.5) * this._screenShakeIntensity * 1.4;
      this._screenShakeIntensity = THREE.MathUtils.lerp(this._screenShakeIntensity, 0, dt * 6.5);
    }

    this.camera.position.set(smoothed.x, smoothed.y, smoothed.z);
    this.camera.lookAt(this.playerPos.x, lookTargetY, this.playerPos.z);
  }

  _checkDistrictProximity() {
    let closestId = null;
    let closestDist = 42;

    for (const [id, node] of this.districtNodes.entries()) {
      const dist = Math.hypot(this.playerPos.x - node.pos.x, this.playerPos.z - node.pos.z);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }

    if (closestId && closestId !== this.currentDistrictId) {
      this.currentDistrictId = closestId;
      for (const [id, node] of this.districtNodes.entries()) {
        const active = id === closestId;
        const distObj = DISTRICT_BY_ID[id];
        node.ring.material.color.setHex(
          active ? 0x38bdf8 : (distObj?.zone === 1 ? 0xf59e0b : 0x10b981)
        );
      }
      if (this.callbacks.onEnterDistrict) {
        this.callbacks.onEnterDistrict(closestId);
      }
    }
  }

  _updateDistrictVisibility() {
    // Algorithm #7: Hierarchical Frustum Culling + 3-Tier LOD Proxy Swapping
    const forceAllHigh = this.cameraMode === 'helicopter' || this.skyCam.active;
    this.lodBatcher.update(this.camera, this.playerPos, this.currentDistrictId, {
      lowPowerMode: this.lowPowerMode,
      forceAllHigh
    });
  }

  // Graphics Fix #32: Distinct vehicle body-kit geometry & ride stance per Abuja vehicle tier!
  setPlayerVehicleAppearance(carId = 'corolla') {
    if (!this.playerVehicleMesh) return;
    const palette = {
      along:   { body: 0x059669, cabin: 0x1e293b, trim: 0xfacc15, isSuv: false, sx: 0.94, sy: 0.96, sz: 0.94 },
      corolla: { body: 0xf8fafc, cabin: 0x090d16, trim: 0xef4444, isSuv: false, sx: 1.00, sy: 1.00, sz: 1.00 },
      rx350:   { body: 0xe2e8f0, cabin: 0x090d16, trim: 0xfacc15, isSuv: true,  sx: 1.04, sy: 1.12, sz: 1.02 },
      prado:   { body: 0x0f172a, cabin: 0x020617, trim: 0x10b981, isSuv: true,  sx: 1.08, sy: 1.22, sz: 1.06 },
      g63:     { body: 0x111827, cabin: 0x000000, trim: 0xf59e0b, isSuv: true,  sx: 1.12, sy: 1.28, sz: 1.08 }
    };
    const cfg = palette[carId] || palette.corolla;
    const ud = this.playerVehicleMesh.userData;
    if (ud?.paintMat) ud.paintMat.color.setHex(cfg.body);
    if (ud?.glassMat) ud.glassMat.color.setHex(cfg.cabin);
    if (ud?.trimMat) ud.trimMat.color.setHex(cfg.trim);
    if (ud?.sportWingGroup) ud.sportWingGroup.visible = !cfg.isSuv;
    if (ud?.suvBodyKit) ud.suvBodyKit.visible = cfg.isSuv;
    if (ud?.chassisGroup) {
      ud.chassisGroup.scale.set(cfg.sx, cfg.sy, cfg.sz);
    }
  }

  setCarWrap(colorHex, finish = 'metallic') {
    if (!this.playerVehicleMesh?.userData) return;
    const ud = this.playerVehicleMesh.userData;
    if (!ud.paintMat) return;
    const col = typeof colorHex === 'string' ? parseInt(colorHex.replace('#', ''), 16) : colorHex;
    ud.paintMat.color.setHex(col);
    if (finish === 'matte') {
      ud.paintMat.roughness = 0.85;
      ud.paintMat.metalness = 0.05;
      ud.paintMat.clearcoat = 0.0;
    } else if (finish === 'chrome') {
      ud.paintMat.roughness = 0.06;
      ud.paintMat.metalness = 0.96;
      ud.paintMat.clearcoat = 1.0;
    } else { // metallic
      ud.paintMat.roughness = 0.28;
      ud.paintMat.metalness = 0.82;
      ud.paintMat.clearcoat = 0.8;
    }
  }

  syncPlayerHouses(plots = []) {
    if (!this.playerHouseEntries) this.playerHouseEntries = new Map();
    const seen = new Set();

    for (const plot of plots) {
      if (!plot || !plot.district) continue;
      seen.add(plot.district);
      const d = DISTRICT_BY_ID[plot.district];
      if (!d) continue;

      let entry = this.playerHouseEntries.get(plot.district);
      const pos3D = map2DTo3D(d.x + 2.6, d.y - 2.4);

      if (entry && entry.stage !== plot.stage) {
        this.scene.remove(entry.group);
        this._disposeObject3D(entry.group);
        entry.labelEl.remove();
        this.playerHouseEntries.delete(plot.district);
        entry = null;
      }

      if (!entry) {
        const group = new THREE.Group();
        group.position.set(pos3D.x, 0, pos3D.z);

        // Glowing plot perimeter pad
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(16, 0.8, 16),
          new THREE.MeshStandardMaterial({
            color: plot.stage >= 5 ? 0x065f46 : 0x78350f,
            roughness: 0.7
          })
        );
        pad.position.y = 0.4;
        group.add(pad);

        // Stage >= 1: Concrete German Floor Foundation
        if (plot.stage >= 1) {
          const slab = new THREE.Mesh(
            new THREE.BoxGeometry(12.5, 1.8, 12.5),
            new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 })
          );
          slab.position.y = 1.3;
          group.add(slab);
        }

        // Stage >= 2: Hollow 4-Wall Perimeter Duplex Shell + Sims Interior Furniture (Fixes #14, #42)
        let wallsMat = null;
        if (plot.stage >= 2) {
          const wallH = plot.stage >= 3 ? 11 : 6;
          const wallColor = plot.stage >= 5 ? 0xfef3c7 : plot.stage >= 4 ? 0xe2e8f0 : 0x94a3b8;
          wallsMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.45 });
          const wallT = 0.55;
          const span = 11.2;
          const wy = 2.0 + wallH / 2;
          const wallSpecs = [
            { w: span, d: wallT, x: 0, z: -span / 2 + wallT / 2 },
            { w: span, d: wallT, x: 0, z: span / 2 - wallT / 2 },
            { w: wallT, d: span - wallT * 2, x: -span / 2 + wallT / 2, z: 0 },
            { w: wallT, d: span - wallT * 2, x: span / 2 - wallT / 2, z: 0 }
          ];
          for (const ws of wallSpecs) {
            const wMesh = new THREE.Mesh(new THREE.BoxGeometry(ws.w, wallH, ws.d), wallsMat);
            wMesh.position.set(ws.x, wy, ws.z);
            wMesh.castShadow = true;
            wMesh.userData = { isWall: true, origHeight: wallH, origPosY: wy };
            group.add(wMesh);
          }

          // Feature #1 + Fix #42: Sims Interior Furniture hidden until cutaway/dollhouse mode!
          const interior = this._buildDuplexInteriorFurniture(10.0, 10.0);
          interior.position.y = 2.25;
          interior.visible = this.wallCutawayMode && this.wallCutawayMode !== 'up';
          group.add(interior);
          if (this.allInteriorGroups) this.allInteriorGroups.push(interior);
        }

        // Stage >= 3: Pitched Gerard Stone-Coated Roof with origMat for non-destructive cutaway (Fix #13)
        if (plot.stage >= 3) {
          const roofMat = new THREE.MeshStandardMaterial({
            color: plot.stage >= 5 ? 0x7f1d1d : 0x334155,
            roughness: 0.35,
            metalness: 0.4
          });
          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(9.4, 5.2, 4),
            roofMat
          );
          roof.position.y = 15.6;
          roof.rotation.y = Math.PI / 4;
          roof.userData = { isRoof: true, origMat: roofMat };
          group.add(roof);
        }

        // Stage >= 4: Rooftop Solar Array & Perimeter Fence
        if (plot.stage >= 4) {
          const solar = new THREE.Mesh(
            new THREE.BoxGeometry(5.5, 0.4, 3.5),
            new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.4 })
          );
          solar.position.set(0, 14.5, 2.5);
          group.add(solar);
        }

        // Stage 5: Golden Mansion Beacon Halo
        if (plot.stage >= 5) {
          const halo = new THREE.Mesh(
            new THREE.RingGeometry(9.2, 10.6, 28),
            new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
          );
          halo.rotateX(-Math.PI / 2);
          halo.position.y = 0.9;
          group.add(halo);
        }

        this.scene.add(group);

        const labelEl = document.createElement('div');
        labelEl.className = 'world3d-district-label is-current';
        labelEl.style.borderColor = plot.stage >= 5 ? '#4ade80' : '#facc15';
        labelEl.innerHTML = `
          <span class="w3d-zone-dot" style="background:${plot.stage >= 5 ? '#4ade80' : '#facc15'}"></span>
          <span class="w3d-dist-name">${plot.stage >= 5 ? `🏡 YOUR ${d.short.toUpperCase()} MANSION` : `🏗️ YOUR ${d.short.toUpperCase()} SITE (${plot.stage * 20}%)`}</span>
        `;
        labelEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.callbacks.onSelectDistrict) {
            this.callbacks.onSelectDistrict(plot.district);
          }
        });
        this.labelLayer.appendChild(labelEl);

        entry = {
          district: plot.district,
          stage: plot.stage,
          group,
          wallsMat,
          labelEl
        };
        this.playerHouseEntries.set(plot.district, entry);
      }
    }

    for (const [distId, entry] of this.playerHouseEntries.entries()) {
      if (!seen.has(distId)) {
        this.scene.remove(entry.group);
        this._disposeObject3D(entry.group);
        entry.labelEl.remove();
        this.playerHouseEntries.delete(distId);
      }
    }
  }

  // Graphics Fix #50: Diff-cached DOM label projector eliminates per-frame layout/style thrashing!
  _applyCachedLabelStyle(el, key, display, transform = '') {
    let prev = this._labelCache.get(key);
    if (!prev) {
      prev = { display: '', transform: '' };
      this._labelCache.set(key, prev);
    }
    if (prev.display !== display) {
      el.style.display = display;
      prev.display = display;
    }
    if (display !== 'none' && prev.transform !== transform) {
      el.style.transform = transform;
      prev.transform = transform;
    }
  }

  _updateProjectedLabels() {
    const w = this._canvasW || this.renderer.domElement.clientWidth || 800;
    const h = this._canvasH || this.renderer.domElement.clientHeight || 600;
    if (!w || !h) return;

    if (!this._tmpProjVec) this._tmpProjVec = new THREE.Vector3();
    const tempV = this._tmpProjVec;

    for (const [id, label] of this.districtLabels.entries()) {
      const node = this.districtNodes.get(id);
      if (!node) continue;
      const key = `d_${id}`;
      const distToPlayer = Math.hypot(node.pos.x - this.playerPos.x, node.pos.z - this.playerPos.z);
      if (this.cameraMode !== 'helicopter' && distToPlayer > 380) {
        this._applyCachedLabelStyle(label, key, 'none');
        continue;
      }
      tempV.set(node.pos.x, this.cameraMode === 'helicopter' ? 54 : 18, node.pos.z);
      tempV.project(this.camera);

      if (tempV.z > 1) {
        this._applyCachedLabelStyle(label, key, 'none');
        continue;
      }
      const x = Math.round((tempV.x * 0.5 + 0.5) * w);
      const y = Math.round((-(tempV.y * 0.5) + 0.5) * h);
      this._applyCachedLabelStyle(label, key, 'inline-flex', `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0)`);
      label.classList.toggle('is-current', id === this.currentDistrictId);
    }

    for (const entry of this.remotePlayers.values()) {
      const key = `rp_${entry.id}`;
      tempV.copy(entry.group.position);
      tempV.y += 5.8;
      tempV.project(this.camera);

      if (tempV.z > 1) {
        this._applyCachedLabelStyle(entry.labelEl, key, 'none');
        continue;
      }
      const x = Math.round((tempV.x * 0.5 + 0.5) * w);
      const y = Math.round((-(tempV.y * 0.5) + 0.5) * h);
      this._applyCachedLabelStyle(entry.labelEl, key, 'flex', `translate(-50%, -100%) translate3d(${x}px, ${y}px, 0)`);
    }

    // Feature #5: Project NPC Affinity & Pidgin Banter Badges above nearby Street Pedestrians
    if (this.streetPedestrians) {
      for (const npc of this.streetPedestrians) {
        const key = `npc_${npc.id}`;
        if (!npc.labelEl || !npc.rig?.root?.visible) {
          if (npc.labelEl) this._applyCachedLabelStyle(npc.labelEl, key, 'none');
          continue;
        }
        const dNpc = Math.hypot(npc.rig.root.position.x - this.playerPos.x, npc.rig.root.position.z - this.playerPos.z);
        if (dNpc > 46 && (!npc.banterTimer || npc.banterTimer <= 0)) {
          this._applyCachedLabelStyle(npc.labelEl, key, 'none');
          continue;
        }
        tempV.copy(npc.rig.root.position);
        tempV.y += 5.4;
        tempV.project(this.camera);
        if (tempV.z > 1) {
          this._applyCachedLabelStyle(npc.labelEl, key, 'none');
          continue;
        }
        const x = Math.round((tempV.x * 0.5 + 0.5) * w);
        const y = Math.round((-(tempV.y * 0.5) + 0.5) * h);
        npc.labelEl.style.flexDirection = 'column';
        npc.labelEl.style.alignItems = 'center';
        this._applyCachedLabelStyle(npc.labelEl, key, 'inline-flex', `translate(-50%, -100%) translate3d(${x}px, ${y}px, 0)`);
      }
    }

    if (this.playerHouseEntries) {
      for (const entry of this.playerHouseEntries.values()) {
        const key = `house_${entry.district}`;
        tempV.copy(entry.group.position);
        tempV.y += 18;
        tempV.project(this.camera);

        if (tempV.z > 1) {
          this._applyCachedLabelStyle(entry.labelEl, key, 'none');
          continue;
        }
        const x = Math.round((tempV.x * 0.5 + 0.5) * w);
        const y = Math.round((-(tempV.y * 0.5) + 0.5) * h);
        this._applyCachedLabelStyle(entry.labelEl, key, 'inline-flex', `translate(-50%, -100%) translate3d(${x}px, ${y}px, 0)`);
      }
    }
  }
}
