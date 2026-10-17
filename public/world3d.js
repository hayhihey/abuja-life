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
    // Procedural Nigeria afternoon sky gradient (deep azure zenith → hazy tropical horizon haze)
    this.scene.background = this._makeSkyTexture();
    this.scene.fog = new THREE.FogExp2(0xc8dff0, 0.00026);

    this.camera = new THREE.PerspectiveCamera(
      50,
      Math.max(1, containerEl.clientWidth) / Math.max(1, containerEl.clientHeight),
      0.5,
      3200
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true
    });
    this.renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // PBR tone mapping & color space for GTA-quality visuals
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Clear container and mount canvas + 3D HTML overlay layer
    this.container.innerHTML = '';
    this.renderer.domElement.className = 'world3d-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'world3d-labels';
    this.container.appendChild(this.labelLayer);

    // State
    this.clock = new THREE.Clock();
    this.currentDistrictId = 'cbd';
    this.weather = 'sunny';
    this.hourOfDay = 13;
    this.cameraMode = 'chase'; // 'chase' | 'helicopter'
    this.cameraYaw = 0.25;
    this.cameraPitch = 0.22;
    this.cameraDistance = 15.5; // Close-up 3rd-person Nigeria GTA camera
    this.isPointerDragging = false;
    this.lastPointer = { x: 0, y: 0 };

    // Player 3D controller state (starts on foot in 3rd-person Nigeria GTA style)
    const startD = DISTRICT_BY_ID.cbd || DISTRICTS[0];
    const startPos = map2DTo3D(startD.x, startD.y);
    this.playerPos = new THREE.Vector3(startPos.x, 0, startPos.z + 10);
    this.playerHeading = Math.PI;
    this.playerSpeed = 0;
    this.inVehicle = false;
    this.walkCycle = 0;
    this.punchTimer = 0;
    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.touchVector = { x: 0, y: 0 };

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
    this.windowMaterials = [];
    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();
    this.collisionBoxes = [];

    this._initLights();
    this._buildTerrainAndWater();
    this._buildAsoRockAndHills();
    this._buildRoadNetwork();
    this._buildDistrictsAndSkyline();
    this._buildIconicLandmarks();
    this._buildTrafficSwarm();
    this._buildStreetPedestrians();
    this._buildLocalPlayerRig();
    this._bindInputs();

    this._animate = this._animate.bind(this);
    this.animFrameId = requestAnimationFrame(this._animate);
  }

  // ── Collision Resolution System (Prevents Car/Ped Entering Buildings) ──
  _addCollisionBox(x, z, width, depth, label = 'building') {
    this.collisionBoxes.push({
      x,
      z,
      hw: (width * 0.5) + 0.5,
      hd: (depth * 0.5) + 0.5,
      label
    });
  }

  _resolveCollisions(pos, radius = 2.4) {
    let hit = false;
    for (let i = 0; i < this.collisionBoxes.length; i++) {
      const b = this.collisionBoxes[i];
      const minX = b.x - b.hw - radius;
      const maxX = b.x + b.hw + radius;
      const minZ = b.z - b.hd - radius;
      const maxZ = b.z + b.hd + radius;

      if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
        hit = true;
        const penLeft = pos.x - minX;
        const penRight = maxX - pos.x;
        const penBack = pos.z - minZ;
        const penFront = maxZ - pos.z;

        const minPen = Math.min(penLeft, penRight, penBack, penFront);
        if (minPen === penLeft) pos.x = minX;
        else if (minPen === penRight) pos.x = maxX;
        else if (minPen === penBack) pos.z = minZ;
        else pos.z = maxZ;
      }
    }
    return hit;
  }

  _spawnCollisionSparks(x, z) {
    if (this.lowPowerMode) return;
    for (let i = 0; i < 7; i++) {
      const spGeo = new THREE.SphereGeometry(0.14, 4, 4);
      const spMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xfacc15 : 0xf97316 });
      const sp = new THREE.Mesh(spGeo, spMat);
      sp.position.set(x + (Math.random() - 0.5) * 1.8, 0.8 + Math.random() * 0.9, z + (Math.random() - 0.5) * 1.8);
      this.scene.add(sp);
      this.nairaParticles.push({
        mesh: sp,
        life: 0.32,
        vy: 1.8 + Math.random() * 2.2,
        rx: Math.random() * 6,
        rz: Math.random() * 6
      });
    }
  }

  // ── Procedural Texture Helpers ───────────────────────────────────────────────
  /**
   * Creates a THREE.CanvasTexture by drawing on a 2D canvas.
   * @param {number} w - Width in pixels
   * @param {number} h - Height in pixels
   * @param {function} drawFn - (ctx, W, H) => void
   */
  _makeCanvasTex(w, h, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Procedural Nigeria afternoon sky — deep cobalt zenith fading to warm tropical haze horizon.
   */
  _makeSkyTexture() {
    return this._makeCanvasTex(4, 512, (ctx, W, H) => {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0.0,  '#1a3a6b');  // Deep cobalt zenith
      grad.addColorStop(0.2,  '#2563be');  // Rich midday blue
      grad.addColorStop(0.5,  '#5da8d8');  // Warm atmospheric blue
      grad.addColorStop(0.72, '#a7cfe8');  // Hazy horizon mid-blue
      grad.addColorStop(0.88, '#d4e8f4');  // Tropical horizon haze
      grad.addColorStop(0.96, '#f0d8b0');  // Warm golden horizon glow
      grad.addColorStop(1.0,  '#e8c87a');  // Hot horizon (Nigerian savanna heat)
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    });
  }

  _initLights() {
    // Tropical sky hemisphere — warm Nigerian sun from above, green-earth bounce from below
    this.ambientLight = new THREE.HemisphereLight(0x87ceeb, 0x4a7c40, 1.2);
    this.scene.add(this.ambientLight);

    // Main sun — warm golden Nigerian afternoon at ~2pm angle
    this.sunLight = new THREE.DirectionalLight(0xfff5d0, 2.4);
    this.sunLight.position.set(320, 520, 180);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 1800;
    this.sunLight.shadow.bias = -0.0003;
    const d = 620;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // Sky fill — blue atmospheric scatter from opposite side (softens harsh shadows)
    this.skyFill = new THREE.DirectionalLight(0x94d0f5, 0.55);
    this.skyFill.position.set(-180, 200, -140);
    this.scene.add(this.skyFill);

    // Warm city ambient glow — orange sodium light from street lamps below
    this.cityGlow = new THREE.PointLight(0xff9040, 1.1, 780, 1.4);
    this.cityGlow.position.set(0, 55, 0);
    this.scene.add(this.cityGlow);

    // Rim light for depth — subtle cool backlight to separate foreground from background
    this.rimLight = new THREE.DirectionalLight(0xaee4ff, 0.3);
    this.rimLight.position.set(-50, 80, -400);
    this.scene.add(this.rimLight);
  }

  _buildTerrainAndWater() {
    // --- Procedural laterite earth + tropical grass ground ---
    const groundGeo = new THREE.PlaneGeometry(3400, 3400, 64, 64);
    groundGeo.rotateX(-Math.PI / 2);

    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const distFromCenter = Math.hypot(vx, vz);
      if (distFromCenter > 620) {
        const ridge = Math.sin(vx * 0.008) * Math.cos(vz * 0.008) * 28;
        pos.setY(i, Math.max(0, ridge));
      }
    }
    groundGeo.computeVertexNormals();

    // Canvas ground texture — laterite red + tropical grass patches
    const groundTex = this._makeCanvasTex(512, 512, (ctx, W, H) => {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0,   '#6b4f2a');
      grad.addColorStop(0.3, '#7a5c34');
      grad.addColorStop(0.6, '#4a7c40');
      grad.addColorStop(1,   '#3d6b36');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // Random dirt patches
      for (let i = 0; i < 180; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const r = 4 + Math.random() * 18;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${100 + Math.random()*40|0}, ${75 + Math.random()*30|0}, ${25 + Math.random()*20|0}, 0.6)`;
        ctx.fill();
      }
      // Grass tufts
      for (let i = 0; i < 120; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        ctx.fillStyle = `rgba(45, ${100 + Math.random()*55|0}, ${35 + Math.random()*20|0}, 0.7)`;
        ctx.fillRect(x, y, 2 + Math.random() * 4, 6 + Math.random() * 8);
      }
    });
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(18, 18);

    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.92,
      metalness: 0.02,
      color: 0xb8956a
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Urban paving pad — interlocking stone style
    const paveTex = this._makeCanvasTex(256, 256, (ctx, W, H) => {
      ctx.fillStyle = '#8a8f9a';
      ctx.fillRect(0, 0, W, H);
      const tw = 22, th = 11;
      for (let row = 0; row < H / th + 1; row++) {
        for (let col = 0; col < W / tw + 1; col++) {
          const ox = (row % 2) * (tw / 2);
          const x = col * tw - ox;
          const y = row * th;
          const shade = 130 + Math.random() * 30 | 0;
          ctx.fillStyle = `rgb(${shade}, ${shade - 5}, ${shade - 10})`;
          ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);
        }
      }
    });
    paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping;
    paveTex.repeat.set(8, 8);

    const sandBase = new THREE.Mesh(
      new THREE.PlaneGeometry(1650, 1650).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.88, metalness: 0.05 })
    );
    sandBase.position.y = 0.09;
    sandBase.receiveShadow = true;
    this.scene.add(sandBase);

    // Jabi Lake water body — animated reflective surface
    const jabiD = DISTRICT_BY_ID.jabi;
    const jabiPos = map2DTo3D(jabiD.x - 5, jabiD.y + 3);
    const lakeGeo = new THREE.CylinderGeometry(78, 82, 1.6, 40);
    this.lakeMaterial = new THREE.MeshStandardMaterial({
      color: 0x006994,
      emissive: 0x003d5c,
      emissiveIntensity: 0.25,
      roughness: 0.08,
      metalness: 0.95,
      envMapIntensity: 1.2
    });
    const jabiLake = new THREE.Mesh(lakeGeo, this.lakeMaterial);
    jabiLake.position.set(jabiPos.x, 0.3, jabiPos.z);
    this.scene.add(jabiLake);

    // Lake shore foam ring
    const shoreMat = new THREE.MeshStandardMaterial({ color: 0xc8e6f0, roughness: 0.9, transparent: true, opacity: 0.65 });
    const shore = new THREE.Mesh(new THREE.CylinderGeometry(83, 87, 0.3, 40), shoreMat);
    shore.position.set(jabiPos.x, 0.55, jabiPos.z);
    this.scene.add(shore);

    // Mpape Blue Quarry Crater Lake
    const mpapeD = DISTRICT_BY_ID.mpape;
    const mpapePos = map2DTo3D(mpapeD.x + 2, mpapeD.y - 3);
    const quarryLake = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 28, 2, 28),
      new THREE.MeshStandardMaterial({
        color: 0x0077b6,
        emissive: 0x023e8a,
        emissiveIntensity: 0.4,
        roughness: 0.06,
        metalness: 0.95
      })
    );
    quarryLake.position.set(mpapePos.x, 1.5, mpapePos.z);
    this.scene.add(quarryLake);
  }

  _buildAsoRockAndHills() {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x57534e,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true
    });

    // Iconic Aso Rock Monolith towering east of Asokoro/Maitama
    const asoCoords = map2DTo3D(76, 40);
    const asoGeo = new THREE.ConeGeometry(135, 290, 9, 4);
    const p = asoGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 90) {
        p.setY(i, 90 + (y - 90) * 0.45);
      }
      p.setX(i, p.getX(i) * 1.25 + Math.sin(y * 0.1) * 8);
    }
    asoGeo.computeVertexNormals();
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
      const geo = new THREE.DodecahedronGeometry(h.r, 1);
      geo.scale(1.2, h.h / h.r, 0.95);
      const mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(pos.x, h.h * 0.35, pos.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  _buildPalmTree(scale = 1) {
    const tree = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.65, side: THREE.DoubleSide });

    // Segmented slightly curved tropical palm trunk
    for (let s = 0; s < 5; s++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28 - s * 0.03, 0.32 - s * 0.03, 2.2, 8),
        trunkMat
      );
      seg.position.set(s * 0.12, s * 2.0 + 1.1, 0);
      seg.rotation.z = -s * 0.03;
      seg.castShadow = true;
      tree.add(seg);
    }

    // Crown of 7 arching green palm fronds
    const crownY = 10.2;
    const crownX = 0.48;
    for (let f = 0; f < 7; f++) {
      const ang = (f / 7) * Math.PI * 2;
      const frondPivot = new THREE.Group();
      frondPivot.position.set(crownX, crownY, 0);
      frondPivot.rotation.y = ang;

      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 4.2), frondMat);
      leaf.position.set(0, -0.35, 2.0);
      leaf.rotation.x = 0.38;
      frondPivot.add(leaf);
      tree.add(frondPivot);
    }

    tree.scale.setScalar(scale);
    return tree;
  }

  _buildBougainvilleaTree(scale = 1, flowerColor = 0xe11d48) {
    const tree = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x473322, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.65 });
    const flowerMat = new THREE.MeshStandardMaterial({
      color: flowerColor,
      roughness: 0.52,
      emissive: flowerColor,
      emissiveIntensity: 0.32
    });

    // Twisted tropical trunk with branches
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.46, 5.4, 10),
      trunkMat
    );
    trunk.position.y = 2.7;
    trunk.castShadow = true;
    tree.add(trunk);

    // Lush canopy spheres with vibrant blossom clusters
    const canopyCoords = [
      [0, 5.8, 0, 2.5],
      [-1.3, 5.3, 0.8, 1.8],
      [1.3, 5.4, -0.6, 1.8],
      [0.5, 6.3, 1.1, 1.6],
      [-0.7, 6.4, -0.9, 1.7]
    ];
    for (const [cx, cy, cz, cr] of canopyCoords) {
      const leafBlob = new THREE.Mesh(
        new THREE.SphereGeometry(cr, 12, 10),
        leafMat
      );
      leafBlob.position.set(cx, cy, cz);
      leafBlob.castShadow = true;
      tree.add(leafBlob);

      // Vibrant blossom pops
      const flowerBlob = new THREE.Mesh(
        new THREE.SphereGeometry(cr * 0.72, 10, 8),
        flowerMat
      );
      flowerBlob.position.set(cx * 1.12, cy + 0.15, cz * 1.12);
      tree.add(flowerBlob);
    }

    tree.scale.setScalar(scale);
    return tree;
  }

  _buildRoadNetwork() {
    this.roadSegments = [];

    // Canvas asphalt texture with aggregate speckle
    const asphaltTex = this._makeCanvasTex(256, 256, (ctx, W, H) => {
      ctx.fillStyle = '#1e2230';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 3000; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const v = 20 + Math.random() * 30 | 0;
        ctx.fillStyle = `rgba(${v},${v},${v+5},0.6)`;
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    });
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(2, 8);

    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      color: 0x2a2e3a,
      roughness: 0.88,
      metalness: 0.05
    });
    const shoulderSandMat = new THREE.MeshStandardMaterial({
      color: 0xc4a882,
      roughness: 0.96
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x047857,
      emissiveIntensity: 0.25,
      roughness: 0.4
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfafafa });
    const skidMat = new THREE.MeshBasicMaterial({ color: 0x0a0f1a, transparent: true, opacity: 0.38 });
    const guardrailMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.28, metalness: 0.82 });
    const kerbBlackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    const kerbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
    const kerbRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.65 });

    for (const edge of EDGES) {
      const dA = DISTRICT_BY_ID[edge.a];
      const dB = DISTRICT_BY_ID[edge.b];
      if (!dA || !dB) continue;

      const pA = map2DTo3D(dA.x, dA.y);
      const pB = map2DTo3D(dB.x, dB.y);
      const vA = new THREE.Vector3(pA.x, 0.35, pA.z);
      const vB = new THREE.Vector3(pB.x, 0.35, pB.z);

      const diff = new THREE.Vector3().subVectors(vB, vA);
      const len = diff.length();
      const mid = new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5);
      const angle = Math.atan2(diff.x, diff.z);

      const isRail = edge.type === 'rail';
      const isExp = edge.type === 'expressway';
      const width = isRail ? 6 : isExp ? 16 : 11;

      // Sandy earth road shoulder
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
        // Center lane divider + side edge white lines + subtle tire skid tracks (like Image 1)
        const stripeGeo = new THREE.PlaneGeometry(0.42, len * 0.94);
        stripeGeo.rotateX(-Math.PI / 2);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(mid.x, 0.62, mid.z);
        stripe.rotation.y = angle;
        this.scene.add(stripe);

        for (const laneSide of [-1, 1]) {
          const skidGeo = new THREE.PlaneGeometry(0.9, len * 0.88);
          skidGeo.rotateX(-Math.PI / 2);
          const skid = new THREE.Mesh(skidGeo, skidMat);
          const sOff = laneSide * (width * 0.24);
          skid.position.set(
            mid.x + Math.cos(angle) * sOff,
            0.61,
            mid.z - Math.sin(angle) * sOff
          );
          skid.rotation.y = angle;
          this.scene.add(skid);
        }

        // Steel W-beam highway guardrails on expressways
        if (isExp) {
          const railBeamGeo = new THREE.BoxGeometry(0.35, 0.55, len * 0.92);
          for (const side of [-1, 1]) {
            const gOff = side * (width * 0.5 + 1.25);
            const gBeam = new THREE.Mesh(railBeamGeo, guardrailMat);
            gBeam.position.set(
              mid.x + Math.cos(angle) * gOff,
              1.1,
              mid.z - Math.sin(angle) * gOff
            );
            gBeam.rotation.y = angle;
            this.scene.add(gBeam);
          }
        }

        // Iconic alternating painted Nigerian street kerbs + roadside palm trees
        const kerbCount = Math.min(36, Math.floor(len / 8));
        const kerbSegLen = len / Math.max(1, kerbCount);
        const kerbGeo = new THREE.BoxGeometry(0.68, 0.62, kerbSegLen * 0.92);
        for (let k = 0; k < kerbCount; k++) {
          const frac = (k + 0.5) / kerbCount - 0.5;
          const alongZ = frac * len;
          const kMat = k % 2 === 0 ? (isExp ? kerbRedMat : kerbBlackMat) : kerbWhiteMat;
          for (const side of [-1, 1]) {
            const kerb = new THREE.Mesh(kerbGeo, kMat);
            const offsetSide = side * (width * 0.5 + 0.35);
            kerb.position.set(
              mid.x + Math.sin(angle) * alongZ + Math.cos(angle) * offsetSide,
              0.52,
              mid.z + Math.cos(angle) * alongZ - Math.sin(angle) * offsetSide
            );
            kerb.rotation.y = angle;
            this.scene.add(kerb);
          }

          // Line avenues with alternating tropical palms and blooming bougainvillea trees
          if (k % 5 === 0) {
            const isBougainvillea = Math.floor(k / 5) % 2 === 1;
            const tree = isBougainvillea
              ? this._buildBougainvilleaTree(0.85 + (k % 3) * 0.12, (k % 4 === 1 ? 0xe11d48 : 0xd946ef))
              : this._buildPalmTree(0.9 + (k % 3) * 0.15);
            const pSide = (k % 2 === 0 ? 1 : -1) * (width * 0.5 + 3.4);
            tree.position.set(
              mid.x + Math.sin(angle) * alongZ + Math.cos(angle) * pSide,
              0.15,
              mid.z + Math.cos(angle) * alongZ - Math.sin(angle) * pSide
            );
            tree.rotation.y = k * 1.1;
            this.scene.add(tree);
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
  }

  _buildNigerianDuplex(width, height, depth, wallHex, roofHex, winMat) {
    const house = new THREE.Group();

    // Canvas wall texture — painted render with horizontal striation + colour variation
    const wallTex = this._makeCanvasTex(256, 256, (ctx, W, H) => {
      // Base wall plaster colour
      const r = (wallHex >> 16) & 0xff;
      const g = (wallHex >> 8) & 0xff;
      const b = wallHex & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, W, H);
      // Subtle horizontal render stripes
      for (let y = 0; y < H; y += 6 + (y % 3)) {
        const v = (Math.random() - 0.5) * 14;
        ctx.fillStyle = `rgba(${r+v|0},${g+v|0},${b+v|0},0.18)`;
        ctx.fillRect(0, y, W, 2 + Math.random() * 2);
      }
      // Faint weathering patches
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.06})`;
        ctx.fillRect(Math.random()*W, Math.random()*H, 10+Math.random()*30, 5+Math.random()*15);
      }
    });
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(2, 1);

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex, color: 0xffffff, roughness: 0.72, metalness: 0.04
    });

    // Main 2-storey painted plaster body
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    body.position.y = height * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // White concrete plinth (ground slab)
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.6, 0.9, depth + 0.6),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.62 })
    );
    plinth.position.y = 0.45;
    house.add(plinth);

    // White horizontal floor fascia bands (1st & 2nd floor dividers)
    for (const bandY of [height * 0.52, height * 0.97]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.5, 0.55, depth + 0.5),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.48, metalness: 0.04 })
      );
      band.position.y = bandY;
      house.add(band);
    }

    // Pitched hip roof — corrugated aluzinc aluminum sheets (canvas texture)
    const roofTex = this._makeCanvasTex(256, 64, (ctx, W, H) => {
      const r = (roofHex >> 16) & 0xff;
      const g = (roofHex >> 8) & 0xff;
      const b = roofHex & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, W, H);
      // Corrugation ridges
      for (let x = 0; x < W; x += 8) {
        ctx.fillStyle = `rgba(255,255,255,0.12)`;
        ctx.fillRect(x, 0, 4, H);
        ctx.fillStyle = `rgba(0,0,0,0.1)`;
        ctx.fillRect(x + 4, 0, 4, H);
      }
    });
    roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
    roofTex.repeat.set(4, 1);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(width, depth) * 0.8, 4.8, 4),
      new THREE.MeshStandardMaterial({ map: roofTex, color: 0xffffff, roughness: 0.48, metalness: 0.28 })
    );
    roof.position.y = height + 2.4;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);

    // Window glass — tinted, slightly emissive (some lit at night)
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
    const glassMat = winMat || new THREE.MeshStandardMaterial({
      color: 0x1a2940, roughness: 0.08, metalness: 0.92,
      envMapIntensity: 1.4
    });
    const floors = [height * 0.28, height * 0.74];
    const cols = [-width * 0.28, 0, width * 0.28];

    for (const fy of floors) {
      for (const cx of cols) {
        for (const side of [-1, 1]) {
          // Outer frame
          const frame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.95, 0.22), frameMat);
          frame.position.set(cx, fy, side * (depth * 0.5 + 0.07));
          house.add(frame);
          // Glass pane
          const pane = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.58, 0.25), glassMat);
          pane.position.set(cx, fy, side * (depth * 0.5 + 0.09));
          house.add(pane);
          // Window sill concrete ledge
          const sill = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.18, 0.38), new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.6 }));
          sill.position.set(cx, fy - 0.9, side * (depth * 0.5 + 0.18));
          house.add(sill);
        }
      }
    }

    // Balcony on 2nd floor front face (concrete slab + railing posts)
    const balcSlab = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.55, 0.28, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.7 })
    );
    balcSlab.position.set(0, height * 0.74 - 1.2, depth * 0.5 + 0.9);
    house.add(balcSlab);
    // Railing posts
    for (let rp = -2; rp <= 2; rp++) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.1, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 })
      );
      post.position.set(rp * (width * 0.55 / 5), height * 0.74 - 0.65, depth * 0.5 + 0.9);
      house.add(post);
    }

    // AC unit box on side wall
    const acUnit = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.9, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.45, metalness: 0.4 })
    );
    acUnit.position.set(width * 0.5 + 0.25, height * 0.7, 0);
    house.add(acUnit);

    // Security gate pillars at entrance
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.55 });
    for (const px of [-width * 0.36, width * 0.36]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.8, 0.8), pillarMat);
      pillar.position.set(px, 1.4, depth * 0.5 + 0.5);
      house.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 1.1), pillarMat);
      cap.position.set(px, 2.95, depth * 0.5 + 0.5);
      house.add(cap);
    }

    // ── AUTHENTIC NIGERIAN COMPOUND ELEMENTS ─────────────────────────────
    const wallPlasterMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.85 });
    const wallCopingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const razorWireMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.9 });
    const gateIronMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.8 });
    const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.85 });

    const cW = width + 5.5;
    const cD = depth + 6.5;

    // Back compound wall with razor wire
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(cW, 2.8, 0.45), wallPlasterMat);
    backWall.position.set(0, 1.4, -cD * 0.5);
    const backCoping = new THREE.Mesh(new THREE.BoxGeometry(cW + 0.2, 0.2, 0.65), wallCopingMat);
    backCoping.position.set(0, 2.9, -cD * 0.5);
    const backRazor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, cW, 8), razorWireMat);
    backRazor.rotation.z = Math.PI / 2;
    backRazor.position.set(0, 3.15, -cD * 0.5);
    house.add(backWall, backCoping, backRazor);

    // Left compound wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.8, cD), wallPlasterMat);
    leftWall.position.set(-cW * 0.5, 1.4, 0);
    const leftCoping = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, cD + 0.2), wallCopingMat);
    leftCoping.position.set(-cW * 0.5, 2.9, 0);
    const leftRazor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, cD, 8), razorWireMat);
    leftRazor.rotation.x = Math.PI / 2;
    leftRazor.position.set(-cW * 0.5, 3.15, 0);
    house.add(leftWall, leftCoping, leftRazor);

    // Right compound wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.8, cD), wallPlasterMat);
    rightWall.position.set(cW * 0.5, 1.4, 0);
    const rightCoping = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, cD + 0.2), wallCopingMat);
    rightCoping.position.set(cW * 0.5, 2.9, 0);
    const rightRazor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, cD, 8), razorWireMat);
    rightRazor.rotation.x = Math.PI / 2;
    rightRazor.position.set(cW * 0.5, 3.15, 0);
    house.add(rightWall, rightCoping, rightRazor);

    // Front Sliding Black & Gold Iron Gate
    const gatePanelL = new THREE.Mesh(new THREE.BoxGeometry(cW * 0.32, 2.6, 0.15), gateIronMat);
    gatePanelL.position.set(-cW * 0.18, 1.3, cD * 0.5);
    const gateTrimL = new THREE.Mesh(new THREE.BoxGeometry(cW * 0.32, 0.18, 0.2), goldTrimMat);
    gateTrimL.position.set(-cW * 0.18, 1.3, cD * 0.5);
    house.add(gatePanelL, gateTrimL);

    // Security Gateman Gatehouse at entrance
    const gatehouse = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.5, 2.4), wallPlasterMat);
    gatehouse.position.set(cW * 0.5 - 1.5, 1.25, cD * 0.5 - 1.5);
    const ghRoof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), wallCopingMat);
    ghRoof.position.set(cW * 0.5 - 1.5, 2.6, cD * 0.5 - 1.5);
    const ghWindow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.1), glassMat);
    ghWindow.position.set(cW * 0.5 - 1.5, 1.5, cD * 0.5 - 0.25);
    house.add(gatehouse, ghRoof, ghWindow);

    // Overhead Steel Scaffolding Water Tank Tower with twin GeePee tanks
    const waterTower = new THREE.Group();
    waterTower.position.set(-cW * 0.5 + 2.2, 0, -cD * 0.5 + 2.2);
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 6.2, 6);
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.8 });
    for (const lx of [-0.85, 0.85]) {
      for (const lz of [-0.85, 0.85]) {
        const leg = new THREE.Mesh(legGeo, steelMat);
        leg.position.set(lx, 3.1, lz);
        waterTower.add(leg);
      }
    }
    const towerPlatform = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 2.4), steelMat);
    towerPlatform.position.y = 6.2;
    waterTower.add(towerPlatform);

    // Black cylindrical GeePee tank
    const geepeeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 });
    const tank1 = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.8, 16), geepeeMat);
    tank1.position.set(0, 7.2, 0);
    const whiteStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.22, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    whiteStripe.position.set(0, 7.3, 0);
    waterTower.add(tank1, whiteStripe);
    house.add(waterTower);

    // External Soundproof Diesel Generator House
    const genShed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.0), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 }));
    genShed.position.set(cW * 0.5 - 2.0, 0.8, -cD * 0.5 + 2.0);
    const genLouver = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.1), new THREE.MeshBasicMaterial({ color: 0x111827 }));
    genLouver.position.set(cW * 0.5 - 2.0, 0.9, -cD * 0.5 + 3.05);
    house.add(genShed, genLouver);

    // Rooftop DSTV Satellite Dish
    const dishGroup = new THREE.Group();
    dishGroup.position.set(width * 0.3, height + 0.6, depth * 0.4);
    const dishMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.6 });
    const dishReflector = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.2, 0.2, 16), dishMat);
    dishReflector.rotation.x = Math.PI / 3;
    const dishPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), steelMat);
    dishPole.position.y = 0.4;
    dishGroup.add(dishPole, dishReflector);
    house.add(dishGroup);

    return house;
  }

  _buildParkedKoropeVan(colorHex = 0xe2e8f0) {
    const van = new THREE.Group();
    // Silver/white Nigerian minibus body (like Image 4)
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

    // Dark tinted passenger window band
    const winBand = new THREE.Mesh(
      new THREE.BoxGeometry(3.28, 0.85, 5.6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.85 })
    );
    winBand.position.y = 2.65;
    van.add(winBand);

    // Black front/rear bumpers & 4 tires
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
    // Lush green 5-aside turf pad (matching Image 5)
    const turf = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 26),
      new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.85 })
    );
    turf.rotateX(-Math.PI / 2);
    turf.position.y = 0.26;
    turf.receiveShadow = true;
    pitch.add(turf);

    // White touchline border & halfway line
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const midLine = new THREE.Mesh(new THREE.PlaneGeometry(16.8, 0.25), lineMat);
    midLine.rotateX(-Math.PI / 2);
    midLine.position.y = 0.29;
    pitch.add(midLine);

    // Two white football goalposts at North & South ends
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

    // Glass curtain-wall texture for CBD towers — grid of lit + dark office windows
    const glassTex = this._makeCanvasTex(256, 512, (ctx, W, H) => {
      // Dark glass base
      ctx.fillStyle = '#0d1f35';
      ctx.fillRect(0, 0, W, H);
      const cols = 6, rows = 18;
      const cw = W / cols, rh = H / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = Math.random() > 0.38;
          const warm = Math.random() > 0.6;
          if (lit) {
            ctx.fillStyle = warm
              ? `rgba(255, ${185 + Math.random()*50|0}, ${80 + Math.random()*60|0}, 0.9)`
              : `rgba(${160+Math.random()*60|0}, ${210+Math.random()*40|0}, 255, 0.85)`;
          } else {
            ctx.fillStyle = `rgba(10, 20, 40, 0.95)`;
          }
          ctx.fillRect(c * cw + 2, r * rh + 2, cw - 4, rh - 4);
        }
      }
      // Mullion grid lines
      ctx.strokeStyle = 'rgba(100,140,180,0.5)';
      ctx.lineWidth = 1.5;
      for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c*cw, 0); ctx.lineTo(c*cw, H); ctx.stroke(); }
      for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r*rh); ctx.lineTo(W, r*rh); ctx.stroke(); }
    });

    const winLitMat = new THREE.MeshStandardMaterial({
      map: glassTex,
      color: 0xffffff,
      emissive: 0xfef3c0,
      emissiveIntensity: 0.18,
      roughness: 0.08,
      metalness: 0.92,
      envMapIntensity: 1.6
    });
    this.windowMaterials.push(winLitMat);

    const duplexWallColors = [0xfed7aa, 0xfde68a, 0xfdba74, 0xfef3c7, 0xe2e8f0];
    const duplexRoofColors = [0x5c2415, 0x7c2d12, 0x451a03, 0x334155];
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.9 });
    const kerbBlackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    const kerbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.85 });

    for (const d of DISTRICTS) {
      const id = d.id;
      const pos = map2DTo3D(d.x, d.y);
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);
      group.userData = { districtId: id, district: d };

      const isZone1 = d.zone === 1;
      const zoneColor = isZone1 ? 0xf59e0b : 0x10b981;

      const ringGeo = new THREE.RingGeometry(42, 45, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: zoneColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.35;
      group.add(ring);

      // Sandy earth outer compound pad + gray interlocking stone inner courtyard (matching Nigeria GTA screenshots)
      const sandPad = new THREE.Mesh(
        new THREE.CylinderGeometry(41, 41, 0.25, 32),
        new THREE.MeshStandardMaterial({ color: 0xd6bfa3, roughness: 0.95 })
      );
      sandPad.position.y = 0.12;
      sandPad.receiveShadow = true;
      group.add(sandPad);

      const padGeo = new THREE.BoxGeometry(52, 0.36, 52);
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        roughness: 0.82
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.y = 0.2;
      pad.receiveShadow = true;
      pad.userData = { districtId: id };
      this.clickableDistrictMeshes.push(pad);
      group.add(pad);

      // Black-and-white painted curb stones (kerbs) framing the compound walkway
      for (let k = -6; k <= 6; k++) {
        const kMat = Math.abs(k) % 2 === 0 ? kerbBlackMat : kerbWhiteMat;
        const kFront = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 0.65), kMat);
        kFront.position.set(k * 3.8, 0.45, 14.5);
        const kBack = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 0.65), kMat);
        kBack.position.set(k * 3.8, 0.45, -14.5);
        group.add(kFront, kBack);
      }

      // Manicured green hedges along the compound walkway (matching Images 3, 4 & 5)
      for (const hx of [-16, 16]) {
        const hedge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.1, 22), hedgeMat);
        hedge.position.set(hx, 1.2, 0);
        hedge.castShadow = true;
        group.add(hedge);
      }

      // Mini Football Turf with White Goalposts + Parked Korope Minibus + Utility Poles
      const pitch = this._buildMiniFootballPitch();
      pitch.position.set(-24, 0, 12);
      group.add(pitch);

      const van1 = this._buildParkedKoropeVan(0xe2e8f0);
      van1.position.set(19, 0.2, 18);
      van1.rotation.y = -0.35;
      group.add(van1);

      const van2 = this._buildParkedKoropeVan(0xfacc15);
      van2.position.set(-19, 0.2, -18);
      van2.rotation.y = 0.45;
      group.add(van2);

      // Concrete utility poles
      for (const [px, pz] of [[-14, 15], [14, 15], [14, -15]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 15, 8), poleMat);
        pole.position.set(px, 7.5, pz);
        pole.castShadow = true;
        group.add(pole);
      }

      // Surround district with buildings: CBD gets glass skyscrapers, others get Nigerian duplexes
      const bCount = 10;
      for (let i = 0; i < bCount; i++) {
        const ang = (i / bCount) * Math.PI * 2 + 0.25;
        const rad = 28 + (i % 2) * 13;
        const bx = Math.cos(ang) * rad;
        const bz = Math.sin(ang) * rad;

        const bw = 12 + (i % 3) * 2.5;
        const bd = 10 + ((i + 1) % 2) * 3;
        const wallHex = duplexWallColors[i % duplexWallColors.length];
        const roofHex = duplexRoofColors[i % duplexRoofColors.length];

        let building;
        if (id === 'cbd' && i < 4) {
          // Glass curtain-wall commercial tower for CBD
          const bh = 38 + i * 12;
          const towerMat = new THREE.MeshStandardMaterial({
            map: glassTex,
            color: 0xffffff,
            roughness: 0.05,
            metalness: 0.95,
            envMapIntensity: 1.8
          });
          building = new THREE.Group();
          // Main tower body
          const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), towerMat);
          tower.position.y = bh * 0.5;
          tower.castShadow = true;
          tower.receiveShadow = true;
          building.add(tower);
          // Concrete base lobby
          const lobby = new THREE.Mesh(new THREE.BoxGeometry(bw + 2, 4, bd + 2),
            new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.6 }));
          lobby.position.y = 2;
          building.add(lobby);
          // Rooftop helipad disc
          const heli = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.3, bw * 0.3, 0.4, 16),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 }));
          heli.position.y = bh + 0.5;
          building.add(heli);
          // "H" helipad marking
          const hMark = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.22, bw * 0.22),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
          hMark.rotation.x = -Math.PI / 2;
          hMark.position.y = bh + 0.65;
          building.add(hMark);
          // Antenna mast
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0xb0b8c8, roughness: 0.3, metalness: 0.9 }));
          mast.position.y = bh + 4.5;
          building.add(mast);
          // Red aviation warning light
          const avLight = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.2 }));
          avLight.position.y = bh + 8.8;
          building.add(avLight);
        } else {
          const bh = 10.5 + (i % 2) * 2.5 + (id === 'maitama' ? 5 : 0);
          building = this._buildNigerianDuplex(bw, bh, bd, wallHex, roofHex, winLitMat);
        }

        building.position.set(bx, 0.2, bz);
        building.rotation.y = -ang + Math.PI / 2;
        this._addCollisionBox(pos.x + bx, pos.z + bz, bw + 6, bd + 6, `${id}_building_${i}`);
        building.traverse((child) => {
          if (child.isMesh) {
            child.userData = { districtId: id };
            this.clickableDistrictMeshes.push(child);
          }
        });
        group.add(building);
      }

      const beaconGeo = new THREE.OctahedronGeometry(4.5, 0);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: zoneColor,
        emissive: zoneColor,
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.8
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = id === 'cbd' ? 115 : 54;
      beacon.userData = { districtId: id };
      this.clickableDistrictMeshes.push(beacon);
      this.spinningMeshes.push(beacon);
      group.add(beacon);

      this.scene.add(group);
      this.districtNodes.set(id, { group, ring, beacon, pos });

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

    // 2. FOUR NNPC TOWERS (CBD North-East)
    const nnpcMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.25,
      metalness: 0.85
    });
    for (let t = 0; t < 4; t++) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 78, 12), nnpcMat);
      tower.position.set(cbdPos.x + 22 + t * 16, 39, cbdPos.z - 22);
      tower.castShadow = true;
      this.scene.add(tower);

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 4, 12), goldMat);
      crown.position.set(cbdPos.x + 22 + t * 16, 79, cbdPos.z - 22);
      this.scene.add(crown);
    }

    // 3. CBN HEADQUARTERS + SPINNING GOLDEN ₦ NAIRA ROOF BEACON
    const cbnTower = new THREE.Mesh(
      new THREE.BoxGeometry(22, 92, 16),
      new THREE.MeshStandardMaterial({
        color: 0x0369a1,
        emissive: 0x075985,
        emissiveIntensity: 0.3,
        roughness: 0.15,
        metalness: 0.9
      })
    );
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

    // 8. MAGICLAND AMUSEMENT PARK FERRIS WHEEL (Near Abuja City Gate)
    const ferrisGroup = new THREE.Group();
    ferrisGroup.position.set(gateX + 42, 0, gateZ - 14);

    const legLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 30, 8), whiteMarble);
    legLeft.position.set(-6, 14, 0);
    legLeft.rotation.z = -0.2;
    const legRight = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 30, 8), whiteMarble);
    legRight.position.set(6, 14, 0);
    legRight.rotation.z = 0.2;
    ferrisGroup.add(legLeft, legRight);

    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(16, 0.9, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    wheelRim.position.set(0, 26, 0);
    this.spinningMeshes.push(wheelRim);
    ferrisGroup.add(wheelRim);
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

      // Lagos Lagoon Water Expanse
      const lagoonMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(85, 85, 0.8, 32),
        new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.35,
          roughness: 0.15,
          metalness: 0.85
        })
      );
      lagoonMesh.position.set((islPos.x + mainPos.x) * 0.5, 0.3, (islPos.z + mainPos.z) * 0.5 + 15);
      this.scene.add(lagoonMesh);

      // Iconic Lekki-Ikoyi Cable-Stayed Bridge Pylon & Glowing Cables
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set((islPos.x + mainPos.x) * 0.5, 0, (islPos.z + mainPos.z) * 0.5);

      const pylon = new THREE.Mesh(new THREE.ConeGeometry(4.2, 68, 4), whiteMarble);
      pylon.position.set(0, 34, 0);
      bridgeGroup.add(pylon);

      const cableMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      for (let c = -3; c <= 3; c++) {
        if (c === 0) continue;
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 48, 6), cableMat);
        cable.position.set(c * 6, 24, 0);
        cable.rotation.z = c > 0 ? 0.42 : -0.42;
        bridgeGroup.add(cable);
      }
      this.scene.add(bridgeGroup);
    }

    // 13. MARKETWISHES.COM SMART SHOPPING CENTER & LOGISTICS MALL (Jabi Hub)
    if (jabiD) {
      const jabiPos = map2DTo3D(jabiD.x, jabiD.y);
      const mwGroup = new THREE.Group();
      mwGroup.position.set(jabiPos.x + 28, 0, jabiPos.z - 22);

      // Indigo-Violet Modern Glass Mall Atrium (MarketWishes brand colors #1e3a8a -> #7c3aed)
      const mallBase = new THREE.Mesh(
        new THREE.BoxGeometry(28, 16, 20),
        new THREE.MeshStandardMaterial({
          color: 0x3b82f6,
          emissive: 0x7c3aed,
          emissiveIntensity: 0.45,
          metalness: 0.85,
          roughness: 0.2
        })
      );
      mallBase.position.set(0, 8, 0);
      mwGroup.add(mallBase);

      // Golden Rotating MarketWishes Crown Sign on Rooftop
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

    const bbGroup = new THREE.Group();
    bbGroup.position.set(cbdPos.x - 12, 0, cbdPos.z - 65);
    const bbBoard = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 0.5), new THREE.MeshBasicMaterial({ map: billboardTex }));
    bbBoard.position.y = 10;
    const bbPoleL = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 11, 8), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    bbPoleL.position.set(-7, 5.5, 0);
    const bbPoleR = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 11, 8), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    bbPoleR.position.set(7, 5.5, 0);
    bbGroup.add(bbBoard, bbPoleL, bbPoleR);
    this.scene.add(bbGroup);
    this._addCollisionBox(cbdPos.x - 12, cbdPos.z - 65, 20, 4, 'election_billboard');

    // Register Major Landmark Obstacle Collision Boxes
    this._addCollisionBox(cbdPos.x - 42, cbdPos.z - 28, 34, 34, 'national_mosque');
    this._addCollisionBox(cbdPos.x, cbdPos.z + 26, 26, 20, 'cbn_hq');
    for (let t = 0; t < 4; t++) {
      this._addCollisionBox(cbdPos.x + 22 + t * 16, cbdPos.z - 22, 14, 14, 'nnpc_tower_' + t);
    }
    this._addCollisionBox(gateX, gateZ, 36, 12, 'city_gate');
  }

  _buildTrafficSwarm() {
    if (!this.roadSegments.length) return;

    const vehiclePalettes = [
      { color: 0xf8fafc, cabin: 0x0f172a, trim: 0xef4444, w: 3.1, h: 1.55, l: 6.2, speed: 0.34, type: 'sports_coupe' },
      { color: 0xfacc15, cabin: 0x1e293b, trim: 0x111827, w: 2.8, h: 1.75, l: 5.4, speed: 0.24, type: 'taxi' },
      { color: 0x10b981, cabin: 0x0f172a, trim: 0xf8fafc, w: 2.8, h: 1.75, l: 5.4, speed: 0.26, type: 'taxi' },
      { color: 0x0f172a, cabin: 0x020617, trim: 0x38bdf8, w: 3.4, h: 2.35, l: 6.5, speed: 0.35, type: 'vip_suv' },
      { color: 0xeab308, cabin: 0x1c1917, trim: 0x111827, w: 2.1, h: 1.95, l: 3.4, speed: 0.17, type: 'keke' },
      { color: 0x059669, cabin: 0x064e3b, trim: 0xfacc15, w: 4.2, h: 3.6, l: 18.0, speed: 0.42, type: 'train' }
    ];

    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.75 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    for (let i = 0; i < 46; i++) {
      const seg = this.roadSegments[i % this.roadSegments.length];
      const spec = seg.isRail
        ? vehiclePalettes[5]
        : vehiclePalettes[i % (vehiclePalettes.length - 1)];

      const carGroup = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.22,
        metalness: 0.72
      });
      const cabinMat = new THREE.MeshStandardMaterial({
        color: spec.cabin,
        roughness: 0.15,
        metalness: 0.9
      });

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w, spec.h * 0.58, spec.l),
        bodyMat
      );
      body.position.y = spec.h * 0.32 + 0.52;
      carGroup.add(body);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w * 0.84, spec.h * 0.46, spec.l * 0.54),
        cabinMat
      );
      cabin.position.set(0, spec.h * 0.78 + 0.45, -spec.l * 0.04);
      carGroup.add(cabin);

      if (!seg.isRail) {
        const wOffX = spec.w * 0.5;
        const wOffZ = spec.l * 0.32;
        for (const [wx, wz] of [[-wOffX, wOffZ], [wOffX, wOffZ], [-wOffX, -wOffZ], [wOffX, -wOffZ]]) {
          const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
          wMesh.position.set(wx, 0.55, wz);
          carGroup.add(wMesh);
        }
      }

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

      this.scene.add(carGroup);
      this.trafficCars.push({
        group: carGroup,
        seg,
        t: Math.random(),
        dir: i % 2 === 0 ? 1 : -1,
        speed: spec.speed,
        laneOffset: seg.isRail ? 0 : (i % 2 === 0 ? 3.2 : -3.2)
      });
    }
  }

  _buildHumanoidRig({
    jacketColor = 0xf472b6,
    shirtColor = 0xf8fafc,
    pantsColor = 0x111827,
    shoeColor = 0xfacc15,
    skinColor = 0x6b3e26
  } = {}) {
    const root = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.52, metalness: 0.06 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.85 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.42, metalness: 0.08 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.62 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.35, metalness: 0.12 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x4a2518, roughness: 0.55 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.88, roughness: 0.18 });
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

    // --- 3. REALISTIC HUMAN HEAD, FACIAL FEATURES & NIGERIAN TAPER FADE HAIRCUT ---
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

    // Crisp Nigerian Taper Fade / Afro Sponge Twist Top + Hairline
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.435, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    hairTop.scale.set(0.94, 1.06, 1.0);
    hairTop.position.y = 0.04;
    headGroup.add(hairTop);

    const hairCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.38, 0.18, 16),
      hairMat
    );
    hairCrown.scale.set(0.92, 1.0, 0.96);
    hairCrown.position.y = 0.38;
    headGroup.add(hairCrown);

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

    // Natural Lips & Clean Goatee/Mustache line
    const lips = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      lipMat
    );
    lips.scale.set(1.45, 0.52, 0.65);
    lips.position.set(0, -0.17, 0.385);
    headGroup.add(lips);

    const chinBeard = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      hairMat
    );
    chinBeard.scale.set(0.95, 0.45, 0.85);
    chinBeard.position.set(0, -0.29, 0.25);
    headGroup.add(chinBeard);

    root.add(headGroup);

    // --- 4. ARTICULATED HUMAN ARMS (Rounded Upper Arm, Elbow, Forearm & Sculpted Hand) ---
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

      // Elbow joint sphere
      const elbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.175, 12, 10),
        jacketMat
      );
      elbow.position.y = -0.72;
      armPivot.add(elbow);

      // Lower sleeve / forearm with slight natural forward bend
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.145, 0.62, 14),
        jacketMat
      );
      forearm.position.set(0, -1.02, 0.04);
      forearm.rotation.x = 0.08;
      forearm.castShadow = true;
      armPivot.add(forearm);

      // Wristwatch on left wrist
      if (side === -1) {
        const watch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.155, 0.155, 0.08, 12),
          goldMat
        );
        watch.position.set(0, -1.26, 0.06);
        armPivot.add(watch);
      }

      // Sculpted human hand (palm + thumb)
      const palm = new THREE.Mesh(
        new THREE.SphereGeometry(0.155, 12, 10),
        skinMat
      );
      palm.scale.set(0.82, 1.18, 0.95);
      palm.position.set(0, -1.42, 0.07);
      armPivot.add(palm);

      return armPivot;
    };

    const leftArmPivot = buildArm(-1);
    const rightArmPivot = buildArm(1);
    root.add(leftArmPivot, rightArmPivot);

    // --- 5. ARTICULATED HUMAN LEGS (Thigh, Knee, Tapered Calf & Detailed Designer Sneakers) ---
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

      // Rounded knee joint
      const knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.205, 12, 10),
        pantsMat
      );
      knee.position.y = -0.72;
      legPivot.add(knee);

      // Tapered calf / ankle jeans
      const calf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.16, 0.68, 14),
        pantsMat
      );
      calf.position.y = -1.06;
      calf.castShadow = true;
      legPivot.add(calf);

      // Contoured sneaker upper + rounded toe box + white midsole + tongue
      const shoeUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.24, 0.62),
        shoeMat
      );
      shoeUpper.position.set(0, -1.40, 0.08);
      legPivot.add(shoeUpper);

      const toeCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 12, 10),
        shoeMat
      );
      toeCap.scale.set(1.0, 0.62, 1.15);
      toeCap.position.set(0, -1.42, 0.36);
      legPivot.add(toeCap);

      const midsole = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.10, 0.82),
        soleMat
      );
      midsole.position.set(0, -1.51, 0.14);
      legPivot.add(midsole);

      return legPivot;
    };

    const leftLegPivot = buildLeg(-1);
    const rightLegPivot = buildLeg(1);
    root.add(leftLegPivot, rightLegPivot);

    return {
      root,
      torso,
      headGroup,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot
    };
  }

  _buildStreetPedestrians() {
    const npcOutfits = [
      { jacketColor: 0x16a34a, shirtColor: 0xffffff, pantsColor: 0x1e293b, shoeColor: 0xffffff },
      { jacketColor: 0xeab308, shirtColor: 0x111827, pantsColor: 0x0f172a, shoeColor: 0xfacc15 },
      { jacketColor: 0x2563eb, shirtColor: 0xf8fafc, pantsColor: 0x1e293b, shoeColor: 0xe2e8f0 },
      { jacketColor: 0xdc2626, shirtColor: 0xfef08a, pantsColor: 0x111827, shoeColor: 0xffffff }
    ];

    for (let dIdx = 0; dIdx < DISTRICTS.length; dIdx++) {
      const d = DISTRICTS[dIdx];
      const basePos = map2DTo3D(d.x, d.y);
      for (let n = 0; n < 2; n++) {
        const outfit = npcOutfits[(dIdx + n) % npcOutfits.length];
        const rig = this._buildHumanoidRig(outfit);
        const startX = basePos.x + (n === 0 ? 0 : -8);
        const startZ = basePos.z + (n === 0 ? 3 : -6);
        rig.root.position.set(startX, 0.2, startZ);
        this.scene.add(rig.root);

        this.streetPedestrians.push({
          rig,
          districtId: d.id,
          homeX: startX,
          homeZ: startZ,
          patrolRadius: 9 + n * 4,
          phase: (dIdx * 1.3 + n * 2.1),
          speed: 0.75 + (n * 0.2),
          knockedTimer: 0
        });
      }
    }
  }

  _buildWidebodySportsCar() {
    const car = new THREE.Group();

    // Primary paint materials (stored on userData so setPlayerVehicleAppearance can recolor dynamically)
    const paintMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // Pearl White Widebody default matching reference screenshot
      roughness: 0.16,
      metalness: 0.65
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.08,
      metalness: 0.95
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
    const redStripeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const cyanStripeMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const tailGlowMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const amberGlowMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const headLightMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });

    // Soft dark ground contact shadow underneath the car
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 10.4),
      new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.55 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.22;
    car.add(shadowPlane);

    // Modern Cyan Neon Chassis Underglow
    const underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 9.2),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = 0.15;
    car.add(underglow);

    // Chassis Group: Suspended body with pitch & roll dynamics
    const chassisGroup = new THREE.Group();
    car.add(chassisGroup);

    // 1. Sculpted Lower Widebody Chassis
    const mainChassis = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 1.32, 9.2),
      paintMat
    );
    mainChassis.position.set(0, 1.38, 0);
    mainChassis.castShadow = true;
    chassisGroup.add(mainChassis);

    // Flared Widebody Wheel Arches / Side Fenders (Front & Rear)
    for (const side of [-1, 1]) {
      const fenderFlare = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 1.12, 8.6),
        paintMat
      );
      fenderFlare.position.set(side * 2.28, 1.24, 0);
      fenderFlare.castShadow = true;
      chassisGroup.add(fenderFlare);

      // Carbon fiber side skirt lip
      const sideSkirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, 6.2),
        carbonMat
      );
      sideSkirt.position.set(side * 2.32, 0.72, 0);
      chassisGroup.add(sideSkirt);
    }

    // 2. Aerodynamic Fastback Cabin & Tinted Windows
    const cabinCore = new THREE.Mesh(
      new THREE.BoxGeometry(3.65, 1.28, 4.9),
      glassMat
    );
    cabinCore.position.set(0, 2.52, -0.35);
    chassisGroup.add(cabinCore);

    const roofPanel = new THREE.Mesh(
      new THREE.BoxGeometry(3.45, 0.14, 3.6),
      paintMat
    );
    roofPanel.position.set(0, 3.18, -0.35);
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

    // 3. Carbon GT Rear Wing Spoiler on Dual Struts
    const wingBlade = new THREE.Mesh(
      new THREE.BoxGeometry(4.45, 0.14, 0.72),
      carbonMat
    );
    wingBlade.position.set(0, 2.72, -4.18);
    wingBlade.rotation.x = 0.08;
    chassisGroup.add(wingBlade);

    for (const side of [-1, 1]) {
      const wingEndplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.42, 0.82),
        carbonMat
      );
      wingEndplate.position.set(side * 2.22, 2.72, -4.18);
      chassisGroup.add(wingEndplate);

      const wingStrut = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.68, 0.38),
        carbonMat
      );
      wingStrut.position.set(side * 1.15, 2.34, -4.05);
      chassisGroup.add(wingStrut);
    }

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

    // 5. Front Kidney Grille & Angel-Eye LED Headlights & Projector Cones (+Z is forward)
    const frontGrille = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.68, 0.22),
      carbonMat
    );
    frontGrille.position.set(0, 1.28, 4.62);
    chassisGroup.add(frontGrille);

    for (const side of [-1, 1]) {
      const headLamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.34, 0.22),
        headLightMat
      );
      headLamp.position.set(side * 1.55, 1.52, 4.62);
      chassisGroup.add(headLamp);

      // Forward Xenon Light Projector Beams
      const beamGeo = new THREE.ConeGeometry(1.5, 20, 12, 1, true);
      beamGeo.rotateX(Math.PI / 2);
      beamGeo.translate(0, 0, 10);
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      beam.position.set(side * 1.55, 1.48, 4.62);
      chassisGroup.add(beam);
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
    frontLeftPivot.position.set(-2.22, 0.78, 2.85);
    frontLeftPivot.add(buildWheelAssembly(true));
    car.add(frontLeftPivot);

    const frontRightPivot = new THREE.Group();
    frontRightPivot.position.set(2.22, 0.78, 2.85);
    frontRightPivot.add(buildWheelAssembly(false));
    car.add(frontRightPivot);

    const rearLeftAssembly = buildWheelAssembly(true);
    rearLeftAssembly.position.set(-2.22, 0.78, -2.85);
    car.add(rearLeftAssembly);

    const rearRightAssembly = buildWheelAssembly(false);
    rearRightAssembly.position.set(2.22, 0.78, -2.85);
    car.add(rearRightAssembly);

    car.userData = {
      paintMat,
      glassMat,
      trimMat: rearRedStripe.material,
      chassisGroup,
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
    const puffGeo = new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 6, 6);
    const puffMat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.4 ? 0x06b6d4 : 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    const puff = new THREE.Mesh(puffGeo, puffMat);
    const carHeading = this.playerHeading;
    const exOffset = left ? -1.25 : 1.25;
    const px = this.playerPos.x + Math.sin(carHeading) * -4.7 + Math.cos(carHeading) * exOffset;
    const pz = this.playerPos.z + Math.cos(carHeading) * -4.7 - Math.sin(carHeading) * exOffset;
    puff.position.set(px, 0.72 + Math.random() * 0.15, pz);
    this.scene.add(puff);
    this.nairaParticles.push({
      mesh: puff,
      life: 0.35,
      vy: -0.4,
      rx: Math.random() * 4,
      rz: Math.random() * 4
    });
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

    // Player Widebody Sports Car (visible when inVehicle === true, matching user screenshot)
    this.playerVehicleMesh = this._buildWidebodySportsCar();
    this.playerVehicleMesh.visible = this.inVehicle;
    this.playerGroup.add(this.playerVehicleMesh);

    // Articulated Realistic 3rd-Person Nigeria GTA Human Character
    this.playerHuman = this._buildHumanoidRig({
      jacketColor: 0xf472b6,
      shirtColor: 0xf8fafc,
      pantsColor: 0x111827,
      shoeColor: 0xfacc15,
      skinColor: 0x6b3e26
    });
    this.playerPedMesh = this.playerHuman.root;
    this.playerPedMesh.position.y = 0.2;
    this.playerPedMesh.visible = !this.inVehicle;
    this.playerGroup.add(this.playerPedMesh);

    this.scene.add(this.playerGroup);
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
      }
      if (k === ' ' || k === 'e') {
        e.preventDefault();
        this.triggerStreetPunch();
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') this.keys.w = false;
      if (k === 's' || e.key === 'ArrowDown') this.keys.s = false;
      if (k === 'a' || e.key === 'ArrowLeft') this.keys.a = false;
      if (k === 'd' || e.key === 'ArrowRight') this.keys.d = false;
      if (k === 'shift') this.keys.shift = false;
    });

    const canvas = this.renderer.domElement;
    let downPos = { x: 0, y: 0 };

    canvas.addEventListener('pointerdown', (e) => {
      this.isPointerDragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      downPos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isPointerDragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.cameraYaw -= dx * 0.0065;
      this.cameraPitch = Math.max(0.08, Math.min(1.15, this.cameraPitch + dy * 0.005));
    });

    window.addEventListener('pointerup', (e) => {
      if (!this.isPointerDragging) return;
      this.isPointerDragging = false;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved < 6) {
        this._handleCanvasClick(e);
      }
    });

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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
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
    return this.inVehicle;
  }

  cycleCameraMode() {
    if (this.cameraMode === 'chase') {
      this.cameraMode = 'dollhouse';
      this.cameraDistance = 46;
      this.cameraPitch = 0.62; // 45° classic Sims isometric angle
      this.cameraYaw = Math.PI / 4;
    } else if (this.cameraMode === 'dollhouse') {
      this.cameraMode = 'helicopter';
      this.cameraDistance = 195;
      this.cameraPitch = 0.78;
    } else {
      this.cameraMode = 'chase';
      this.cameraDistance = this.inVehicle ? 26 : 15.5;
      this.cameraPitch = this.inVehicle ? 0.24 : 0.20;
    }
    return this.cameraMode;
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

    // Keep bright tropical Nigeria GTA daytime look clearly visible, with atmospheric tint for night/harmattan
    const isNight = hour >= 20 || hour < 6;
    const isDusk = (hour >= 18 && hour < 20) || (hour >= 6 && hour < 7);

    if (weather === 'harmattan' || weather === 'dry') {
      this.scene.background.setHex(isNight ? 0x334155 : 0xfde68a);
      this.scene.fog.color.setHex(isNight ? 0x334155 : 0xfef3c7);
      this.scene.fog.density = 0.00055;
    } else if (weather === 'storm' || weather === 'downpour') {
      this.scene.background.setHex(0x64748b);
      this.scene.fog.color.setHex(0x94a3b8);
      this.scene.fog.density = 0.00065;
    } else if (isNight) {
      this.scene.background.setHex(0x1e293b);
      this.scene.fog.color.setHex(0x1e293b);
      this.scene.fog.density = 0.00045;
    } else if (isDusk) {
      this.scene.background.setHex(0x7dd3fc);
      this.scene.fog.color.setHex(0xfed7aa);
      this.scene.fog.density = 0.00038;
    } else {
      this.scene.background.setHex(0x7dd3fc);
      this.scene.fog.color.setHex(0xbae6fd);
      this.scene.fog.density = 0.00032;
    }

    this.sunLight.intensity = isNight ? 0.95 : isDusk ? 1.35 : 1.75;
    this.sunLight.color.setHex(isDusk ? 0xfdba74 : isNight ? 0x93c5fd : 0xfffbeb);

    for (const mat of this.windowMaterials) {
      mat.emissiveIntensity = isNight ? 0.85 : 0.22;
    }
  }

  spawnNairaRain(count = 28) {
    const noteColors = [0x38bdf8, 0xa855f7, 0x10b981, 0xfacc15];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(3.2, 1.5);
      const mat = new THREE.MeshBasicMaterial({
        color: noteColors[i % noteColors.length],
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        this.playerPos.x + (Math.random() - 0.5) * 24,
        14 + Math.random() * 22,
        this.playerPos.z + (Math.random() - 0.5) * 24
      );
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.scene.add(mesh);
      this.nairaParticles.push({
        mesh,
        vy: 6 + Math.random() * 5,
        rx: (Math.random() - 0.5) * 4,
        rz: (Math.random() - 0.5) * 4,
        life: 3.2
      });
    }
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
      entry.nameEl.textContent = p.name;
      entry.distEl.textContent = (DISTRICT_BY_ID[p.district]?.short || p.district || '').toUpperCase();
    }

    for (const [id, entry] of this.remotePlayers.entries()) {
      if (!seenIds.has(id)) {
        this.scene.remove(entry.group);
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
    const dt = Math.min(0.05, this.clock.getDelta());

    for (const m of this.spinningMeshes) {
      m.rotation.y += dt * 1.4;
    }

    for (const car of this.trafficCars) {
      car.t += dt * car.speed * 0.12 * car.dir;
      if (car.t > 1) car.t = 0;
      if (car.t < 0) car.t = 1;

      const { vA, vB, angle } = car.seg;
      car.group.position.lerpVectors(vA, vB, car.t);
      car.group.position.x += Math.cos(angle) * car.laneOffset;
      car.group.position.z -= Math.sin(angle) * car.laneOffset;
      car.group.rotation.y = car.dir > 0 ? angle : angle + Math.PI;
    }

    // Animate street pedestrians walking along compounds (or knocked down like Image 4)
    for (const npc of this.streetPedestrians) {
      if (npc.knockedTimer > 0) {
        npc.knockedTimer -= dt;
        npc.rig.root.rotation.x = -Math.PI / 2.1;
        npc.rig.root.position.y = 0.55;
      } else {
        npc.rig.root.rotation.x = 0;
        npc.rig.root.position.y = 0.2;
        npc.phase += dt * npc.speed;
        const nx = npc.homeX + Math.sin(npc.phase) * npc.patrolRadius;
        const nz = npc.homeZ + Math.cos(npc.phase * 0.7) * (npc.patrolRadius * 0.6);
        const dx = nx - npc.rig.root.position.x;
        const dz = nz - npc.rig.root.position.z;
        npc.rig.root.position.set(nx, 0.2, nz);
        npc.rig.root.rotation.y = Math.atan2(dx, dz);

        const swing = Math.sin(npc.phase * 6) * 0.55;
        npc.rig.leftLegPivot.rotation.x = swing;
        npc.rig.rightLegPivot.rotation.x = -swing;
        npc.rig.leftArmPivot.rotation.x = -swing * 0.8;
        npc.rig.rightArmPivot.rotation.x = swing * 0.8;
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
      const t = this.clock.elapsedTime;
      const baseHeight = this.inVehicle ? 4.3 : 5.8;
      this.plumbob.position.y = baseHeight + Math.sin(t * 3.2) * 0.12;
      const pulse = 1.0 + Math.sin(t * 4.0) * 0.05;
      this.plumbob.scale.set(pulse, pulse, pulse);
    }

    for (const entry of this.remotePlayers.values()) {
      entry.group.position.lerp(entry.targetPos, Math.min(1, dt * 4.5));
    }

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
        this.nairaParticles.splice(i, 1);
      }
    }

    this._updateProjectedLabels();
    this.renderer.render(this.scene, this.camera);
  }

  _updatePlayerDriving(dt) {
    // Camera-relative vectors:
    // Camera sits at playerPos + (sin(yaw), cos(yaw)) * dist looking at playerPos.
    // Screen-Forward = (-sin(yaw), -cos(yaw)), Screen-Right = (+cos(yaw), -sin(yaw)).
    const forwardInput = (this.keys.w ? 1 : 0) - (this.keys.s ? 1 : 0) - this.touchVector.y;
    const rightInput = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0) + this.touchVector.x;

    const maxSpeed = this.inVehicle ? (this.keys.shift ? 135 : 88) : (this.keys.shift ? 40 : 25);
    const inputMag = Math.min(1, Math.hypot(forwardInput, rightInput));

    if (inputMag > 0.04) {
      const fwdX = -Math.sin(this.cameraYaw);
      const fwdZ = -Math.cos(this.cameraYaw);
      const rightX = Math.cos(this.cameraYaw);
      const rightZ = -Math.sin(this.cameraYaw);

      const moveX = fwdX * forwardInput + rightX * rightInput;
      const moveZ = fwdZ * forwardInput + rightZ * rightInput;

      const targetHeading = Math.atan2(moveX, moveZ);
      this.playerHeading = targetHeading;
      this.playerSpeed = maxSpeed * inputMag;

      const stepX = Math.sin(this.playerHeading) * this.playerSpeed * dt;
      const stepZ = Math.cos(this.playerHeading) * this.playerSpeed * dt;

      const nextPos = {
        x: this.playerPos.x + stepX,
        z: this.playerPos.z + stepZ
      };

      const pr = this.inVehicle ? 3.2 : 1.2;
      const hitObstacle = this._resolveCollisions(nextPos, pr);

      this.playerPos.x = Math.max(-680, Math.min(680, nextPos.x));
      this.playerPos.z = Math.max(-680, Math.min(680, nextPos.z));

      if (hitObstacle) {
        if (this.inVehicle && this.playerSpeed > 14) {
          this.playerSpeed = -this.playerSpeed * 0.28;
          this._spawnCollisionSparks(this.playerPos.x, this.playerPos.z);
        } else {
          this.playerSpeed *= 0.45;
        }
      }

      this.playerGroup.position.copy(this.playerPos);
      this.playerGroup.rotation.y = this.playerHeading;

      // Gently steer chase camera behind vehicle/character when turning left/right while moving forward
      if (this.inVehicle && Math.abs(forwardInput) > 0.1) {
        this.cameraYaw -= rightInput * dt * 0.95;
      }

      this.walkCycle += dt * (this.keys.shift ? 16 : 10);
      this._checkDistrictProximity();
    } else {
      this.playerSpeed *= 0.82;
      this.walkCycle *= 0.85;
    }

    // ── SUPERB SPORTS CAR DRIVING DYNAMICS ──────────────────────────────────
    if (this.inVehicle && this.playerVehicleMesh?.userData) {
      const ud = this.playerVehicleMesh.userData;
      const rollDelta = (this.playerSpeed * dt) / 0.78;
      const rollDir = forwardInput >= -0.05 ? 1 : -1;

      // Continuous 3D alloy wheel rotation
      if (ud.wheels) {
        for (const w of ud.wheels) {
          w.rotation.x += rollDelta * rollDir;
        }
      }

      // Smooth steering of front wheels into turns
      const targetSteer = rightInput * -0.42;
      if (ud.frontLeftPivot) ud.frontLeftPivot.rotation.y = THREE.MathUtils.lerp(ud.frontLeftPivot.rotation.y, targetSteer, dt * 10);
      if (ud.frontRightPivot) ud.frontRightPivot.rotation.y = THREE.MathUtils.lerp(ud.frontRightPivot.rotation.y, targetSteer, dt * 10);

      // Chassis suspension pitch (squat on accel, dive on brake) & roll into turns
      if (ud.chassisGroup) {
        const targetPitch = forwardInput > 0.1 ? -0.045 : (forwardInput < -0.1 ? 0.038 : 0);
        const targetRoll = rightInput * (this.playerSpeed / 75) * 0.06;
        ud.chassisGroup.rotation.x = THREE.MathUtils.lerp(ud.chassisGroup.rotation.x, targetPitch, dt * 8);
        ud.chassisGroup.rotation.z = THREE.MathUtils.lerp(ud.chassisGroup.rotation.z, targetRoll, dt * 8);
        ud.chassisGroup.position.y = 1.38 + (this.playerSpeed > 2 ? Math.sin(this.walkCycle * 2) * 0.025 : 0);
      }

      // Nitro exhaust flame puffs when driving fast or boosting
      if (this.playerSpeed > 35 || (this.keys.shift && this.playerSpeed > 15)) {
        if (Math.random() > 0.35) {
          this._spawnExhaustNitro(Math.random() > 0.5);
        }
      }
    }

    // ── SUPERB HUMANOID AVATAR ANIMATION ────────────────────────────────────
    if (this.playerHuman) {
      const moving = this.playerSpeed > 1.2;
      const isSprinting = this.keys.shift && this.playerSpeed > 18;

      if (moving) {
        const strideScale = isSprinting ? 1.15 : 0.72;
        const legSwing = Math.sin(this.walkCycle) * strideScale;
        this.playerHuman.leftLegPivot.rotation.x = legSwing;
        this.playerHuman.rightLegPivot.rotation.x = -legSwing;
        this.playerHuman.leftArmPivot.rotation.x = -legSwing * 0.9;

        // Sprinting forward athletic lean
        const targetTorsoLean = isSprinting ? 0.25 : 0.05;
        this.playerHuman.torso.rotation.x = THREE.MathUtils.lerp(this.playerHuman.torso.rotation.x, targetTorsoLean, dt * 10);
        this.playerHuman.headGroup.rotation.x = isSprinting ? -0.14 : 0;
      } else {
        // Idle breathing and natural stance
        this.playerHuman.leftLegPivot.rotation.x = 0;
        this.playerHuman.rightLegPivot.rotation.x = 0;
        this.playerHuman.torso.rotation.x = 0;
        this.playerHuman.headGroup.rotation.x = 0;

        const breathe = Math.sin(this.clock.elapsedTime * 2.5) * 0.025;
        this.playerHuman.torso.position.y = 2.68 + breathe;
        this.playerHuman.headGroup.position.y = 4.24 + breathe * 0.5;
        this.playerHuman.leftArmPivot.rotation.x = 0.08 + Math.sin(this.clock.elapsedTime * 1.8) * 0.025;
        this.playerHuman.rightArmPivot.rotation.x = 0.08 - Math.sin(this.clock.elapsedTime * 1.8) * 0.025;
      }

      if (this.punchTimer > 0) {
        this.punchTimer = Math.max(0, this.punchTimer - dt);
        this.playerHuman.rightArmPivot.rotation.x = -Math.PI * 0.62;
        this.playerHuman.rightArmPivot.rotation.z = -0.25;
        this.playerHuman.torso.rotation.y = 0.32;
      } else if (moving) {
        const legSwing = Math.sin(this.walkCycle) * (isSprinting ? 1.15 : 0.72);
        this.playerHuman.rightArmPivot.rotation.x = legSwing * 0.9;
        this.playerHuman.rightArmPivot.rotation.z = 0;
        this.playerHuman.torso.rotation.y = 0;
      } else {
        this.playerHuman.rightArmPivot.rotation.z = 0;
        this.playerHuman.torso.rotation.y = 0;
      }
    }

    const horizDist = Math.cos(this.cameraPitch) * this.cameraDistance;
    const vertDist = Math.sin(this.cameraPitch) * this.cameraDistance;
    const minCamHeight = this.inVehicle ? 6.2 : 3.6;
    const lookTargetY = this.inVehicle ? 3.2 : 3.5;

    const desiredCam = new THREE.Vector3(
      this.playerPos.x + Math.sin(this.cameraYaw) * horizDist,
      Math.max(minCamHeight, vertDist + 1.5),
      this.playerPos.z + Math.cos(this.cameraYaw) * horizDist
    );
    this.camera.position.lerp(desiredCam, Math.min(1, dt * 10));
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

  setPlayerVehicleAppearance(carId = 'corolla') {
    if (!this.playerVehicleMesh) return;
    const palette = {
      along: { body: 0xe2e8f0, cabin: 0x1e293b, trim: 0xef4444 },
      corolla: { body: 0xf8fafc, cabin: 0x090d16, trim: 0xef4444 },
      rx350: { body: 0xf1f5f9, cabin: 0x090d16, trim: 0xfacc15 },
      prado: { body: 0x0f172a, cabin: 0x020617, trim: 0x10b981 },
      g63: { body: 0x111827, cabin: 0x000000, trim: 0xf59e0b }
    };
    const cfg = palette[carId] || palette.corolla;
    const ud = this.playerVehicleMesh.userData;
    if (ud?.paintMat) ud.paintMat.color.setHex(cfg.body);
    if (ud?.glassMat) ud.glassMat.color.setHex(cfg.cabin);
    if (ud?.trimMat) ud.trimMat.color.setHex(cfg.trim);
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

        // Stage >= 2: Hollow Blockwork Walls / Duplex Shell
        if (plot.stage >= 2) {
          const wallH = plot.stage >= 3 ? 11 : 6;
          const wallColor = plot.stage >= 5 ? 0xfef3c7 : plot.stage >= 4 ? 0xe2e8f0 : 0x94a3b8;
          const walls = new THREE.Mesh(
            new THREE.BoxGeometry(11.2, wallH, 11.2),
            new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.45 })
          );
          walls.position.y = 2.0 + wallH / 2;
          walls.castShadow = true;
          group.add(walls);
        }

        // Stage >= 3: Pitched Gerard Stone-Coated Roof
        if (plot.stage >= 3) {
          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(9.4, 5.2, 4),
            new THREE.MeshStandardMaterial({
              color: plot.stage >= 5 ? 0x7f1d1d : 0x334155,
              roughness: 0.35,
              metalness: 0.4
            })
          );
          roof.position.y = 15.6;
          roof.rotation.y = Math.PI / 4;
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
          labelEl
        };
        this.playerHouseEntries.set(plot.district, entry);
      }
    }

    for (const [distId, entry] of this.playerHouseEntries.entries()) {
      if (!seen.has(distId)) {
        this.scene.remove(entry.group);
        entry.labelEl.remove();
        this.playerHouseEntries.delete(distId);
      }
    }
  }

  _updateProjectedLabels() {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    if (!w || !h) return;

    const tempV = new THREE.Vector3();

    for (const [id, label] of this.districtLabels.entries()) {
      const node = this.districtNodes.get(id);
      if (!node) continue;
      tempV.set(node.pos.x, this.cameraMode === 'helicopter' ? 54 : 18, node.pos.z);
      tempV.project(this.camera);

      if (tempV.z > 1) {
        label.style.display = 'none';
        continue;
      }
      const x = (tempV.x * 0.5 + 0.5) * w;
      const y = (-(tempV.y * 0.5) + 0.5) * h;
      label.style.display = 'inline-flex';
      label.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      label.classList.toggle('is-current', id === this.currentDistrictId);
    }

    for (const entry of this.remotePlayers.values()) {
      tempV.copy(entry.group.position);
      tempV.y += 5.8;
      tempV.project(this.camera);

      if (tempV.z > 1) {
        entry.labelEl.style.display = 'none';
        continue;
      }
      const x = (tempV.x * 0.5 + 0.5) * w;
      const y = (-(tempV.y * 0.5) + 0.5) * h;
      entry.labelEl.style.display = 'flex';
      entry.labelEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }

    if (this.playerHouseEntries) {
      for (const entry of this.playerHouseEntries.values()) {
        tempV.copy(entry.group.position);
        tempV.y += 18;
        tempV.project(this.camera);

        if (tempV.z > 1) {
          entry.labelEl.style.display = 'none';
          continue;
        }
        const x = (tempV.x * 0.5 + 0.5) * w;
        const y = (-(tempV.y * 0.5) + 0.5) * h;
        entry.labelEl.style.display = 'inline-flex';
        entry.labelEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }
  }
}
