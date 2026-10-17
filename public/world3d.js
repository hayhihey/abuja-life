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
    this.scene.background = new THREE.Color(0x7dd3fc);
    this.scene.fog = new THREE.FogExp2(0xbae6fd, 0.00032);

    this.camera = new THREE.PerspectiveCamera(
      50,
      Math.max(1, containerEl.clientWidth) / Math.max(1, containerEl.clientHeight),
      0.5,
      3200
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

  _initLights() {
    this.ambientLight = new THREE.HemisphereLight(0xe0f2fe, 0x4d7c0f, 1.15);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.75);
    this.sunLight.position.set(280, 480, 220);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 1600;
    const d = 550;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    this.cityGlow = new THREE.PointLight(0xfef08a, 0.85, 650);
    this.cityGlow.position.set(0, 65, 0);
    this.scene.add(this.cityGlow);
  }

  _buildTerrainAndWater() {
    // Lush Nigerian tropical green grass terrain matching Nigeria GTA screenshots
    const groundGeo = new THREE.PlaneGeometry(3400, 3400, 48, 48);
    groundGeo.rotateX(-Math.PI / 2);

    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const distFromCenter = Math.hypot(vx, vz);
      if (distFromCenter > 620) {
        const ridge = Math.sin(vx * 0.008) * Math.cos(vz * 0.008) * 26;
        pos.setY(i, Math.max(0, ridge));
      }
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4d7c0f,
      roughness: 0.9,
      metalness: 0.02
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Subtle sandy laterite earth shoulders across urban FCT zone
    const sandGeo = new THREE.PlaneGeometry(1650, 1650);
    sandGeo.rotateX(-Math.PI / 2);
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0x65a30d,
      roughness: 0.95,
      metalness: 0.02
    });
    const sandBase = new THREE.Mesh(sandGeo, sandMat);
    sandBase.position.y = 0.08;
    sandBase.receiveShadow = true;
    this.scene.add(sandBase);

    // Jabi Lake water body
    const jabiD = DISTRICT_BY_ID.jabi;
    const jabiPos = map2DTo3D(jabiD.x - 5, jabiD.y + 3);
    const lakeGeo = new THREE.CylinderGeometry(78, 82, 1.2, 36);
    this.lakeMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.2,
      roughness: 0.18,
      metalness: 0.75
    });
    const jabiLake = new THREE.Mesh(lakeGeo, this.lakeMaterial);
    jabiLake.position.set(jabiPos.x, 0.3, jabiPos.z);
    this.scene.add(jabiLake);

    // Mpape Blue Quarry Crater Lake
    const mpapeD = DISTRICT_BY_ID.mpape;
    const mpapePos = map2DTo3D(mpapeD.x + 2, mpapeD.y - 3);
    const quarryLake = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 28, 2, 24),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 0.3,
        roughness: 0.15,
        metalness: 0.8
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

  _buildRoadNetwork() {
    this.roadSegments = [];
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x262930,
      roughness: 0.78,
      metalness: 0.08
    });
    const shoulderSandMat = new THREE.MeshStandardMaterial({
      color: 0xd6bfa3,
      roughness: 0.95
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x047857,
      emissiveIntensity: 0.25,
      roughness: 0.4
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const skidMat = new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.45 });
    const guardrailMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.75 });
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

          // Line avenues with tropical palm trees every ~40 units
          if (k % 5 === 0) {
            const palm = this._buildPalmTree(0.9 + (k % 3) * 0.15);
            const pSide = (k % 2 === 0 ? 1 : -1) * (width * 0.5 + 3.2);
            palm.position.set(
              mid.x + Math.sin(angle) * alongZ + Math.cos(angle) * pSide,
              0.15,
              mid.z + Math.cos(angle) * alongZ - Math.sin(angle) * pSide
            );
            palm.rotation.y = k * 1.1;
            this.scene.add(palm);
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

    // Main 2-storey painted plaster body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.65, metalness: 0.05 })
    );
    body.position.y = height * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // White horizontal floor fascia band between ground & 1st floor
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.35, 0.45, depth + 0.35),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
    );
    band.position.y = height * 0.52;
    house.add(band);

    // Pitched hip roof (dark brown / terracotta aluminum roofing sheets)
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(width, depth) * 0.78, 4.4, 4),
      new THREE.MeshStandardMaterial({ color: roofHex, roughness: 0.55, metalness: 0.2 })
    );
    roof.position.y = height + 2.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);

    // Framed windows on front & back facades (2 rows × 3 columns like Nigeria GTA screenshots)
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const glassMat = winMat || new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.8 });
    const floors = [height * 0.28, height * 0.74];
    const cols = [-width * 0.28, 0, width * 0.28];

    for (const fy of floors) {
      for (const cx of cols) {
        for (const side of [-1, 1]) {
          const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.8, 0.18), frameMat);
          frame.position.set(cx, fy, side * (depth * 0.5 + 0.06));
          house.add(frame);

          const pane = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.45, 0.22), glassMat);
          pane.position.set(cx, fy, side * (depth * 0.5 + 0.08));
          house.add(pane);
        }
      }
    }

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

    const winLitMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0xfef08a,
      emissiveIntensity: 0.22,
      roughness: 0.25,
      metalness: 0.75
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

      // Surround district with authentic 2-storey Nigerian residential duplexes (and towers in CBD)
      const bCount = 10;
      for (let i = 0; i < bCount; i++) {
        const ang = (i / bCount) * Math.PI * 2 + 0.25;
        const rad = 28 + (i % 2) * 12;
        const bx = Math.cos(ang) * rad;
        const bz = Math.sin(ang) * rad;

        const bw = 12 + (i % 3) * 2;
        const bd = 10 + ((i + 1) % 2) * 2;
        const bh = (id === 'cbd' && i < 3) ? 32 + i * 10 : 10.5 + (i % 2) * 2.5;
        const wallHex = duplexWallColors[i % duplexWallColors.length];
        const roofHex = duplexRoofColors[i % duplexRoofColors.length];

        const duplex = this._buildNigerianDuplex(bw, bh, bd, wallHex, roofHex, winLitMat);
        duplex.position.set(bx, 0.2, bz);
        duplex.rotation.y = -ang + Math.PI / 2;
        duplex.traverse((child) => {
          if (child.isMesh) {
            child.userData = { districtId: id };
            this.clickableDistrictMeshes.push(child);
          }
        });
        group.add(duplex);
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
      roughness: 0.22,
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
      new THREE.PlaneGeometry(5.6, 10.2),
      new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.52 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.26;
    car.add(shadowPlane);

    // 1. Sculpted Lower Widebody Chassis
    const mainChassis = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 1.32, 9.2),
      paintMat
    );
    mainChassis.position.set(0, 1.38, 0);
    mainChassis.castShadow = true;
    car.add(mainChassis);

    // Flared Widebody Wheel Arches / Side Fenders (Front & Rear)
    for (const side of [-1, 1]) {
      const fenderFlare = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 1.12, 8.6),
        paintMat
      );
      fenderFlare.position.set(side * 2.28, 1.24, 0);
      fenderFlare.castShadow = true;
      car.add(fenderFlare);

      // Carbon fiber side skirt lip
      const sideSkirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, 6.2),
        carbonMat
      );
      sideSkirt.position.set(side * 2.32, 0.72, 0);
      car.add(sideSkirt);
    }

    // 2. Aerodynamic Fastback Cabin & Tinted Windows
    const cabinCore = new THREE.Mesh(
      new THREE.BoxGeometry(3.65, 1.28, 4.9),
      glassMat
    );
    cabinCore.position.set(0, 2.52, -0.35);
    car.add(cabinCore);

    const roofPanel = new THREE.Mesh(
      new THREE.BoxGeometry(3.45, 0.14, 3.6),
      paintMat
    );
    roofPanel.position.set(0, 3.18, -0.35);
    car.add(roofPanel);

    // Shark-fin roof antenna (like reference screenshot)
    const sharkFin = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.45, 4),
      carbonMat
    );
    sharkFin.position.set(0, 3.38, -1.65);
    sharkFin.rotation.x = -0.25;
    car.add(sharkFin);

    // Side wing mirrors
    for (const side of [-1, 1]) {
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.22, 0.28),
        paintMat
      );
      mirror.position.set(side * 2.15, 2.25, 1.35);
      car.add(mirror);
    }

    // 3. Carbon GT Rear Wing Spoiler on Dual Struts (exact match to screenshot)
    const wingBlade = new THREE.Mesh(
      new THREE.BoxGeometry(4.45, 0.14, 0.72),
      carbonMat
    );
    wingBlade.position.set(0, 2.72, -4.18);
    wingBlade.rotation.x = 0.08;
    car.add(wingBlade);

    for (const side of [-1, 1]) {
      const wingEndplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.42, 0.82),
        carbonMat
      );
      wingEndplate.position.set(side * 2.22, 2.72, -4.18);
      car.add(wingEndplate);

      const wingStrut = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.68, 0.38),
        carbonMat
      );
      wingStrut.position.set(side * 1.15, 2.34, -4.05);
      car.add(wingStrut);
    }

    // 4. Aggressive Rear Fascia: Wrap-Around LED Taillights + Red & Cyan M-Stripe Bumper + Diffuser + Quad Exhausts
    for (const side of [-1, 1]) {
      const outerTail = new THREE.Mesh(
        new THREE.BoxGeometry(1.38, 0.36, 0.18),
        tailGlowMat
      );
      outerTail.position.set(side * 1.42, 1.72, -4.62);
      car.add(outerTail);

      const innerTail = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.18, 0.20),
        amberGlowMat
      );
      innerTail.position.set(side * 1.35, 1.70, -4.64);
      car.add(innerTail);
    }

    // Rear License Plate ("ABJ-01VB")
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.36, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    plate.position.set(0, 1.56, -4.63);
    car.add(plate);

    // Signature Red + Cyan Horizontal Rear Bumper Trim Stripes (from user screenshot)
    const rearRedStripe = new THREE.Mesh(
      new THREE.BoxGeometry(4.35, 0.12, 0.16),
      redStripeMat
    );
    rearRedStripe.position.set(0, 1.16, -4.63);
    car.add(rearRedStripe);

    const rearCyanStripe = new THREE.Mesh(
      new THREE.BoxGeometry(3.85, 0.10, 0.16),
      cyanStripeMat
    );
    rearCyanStripe.position.set(0, 1.02, -4.63);
    car.add(rearCyanStripe);

    // Carbon Rear Diffuser & Quad Exhaust Tips
    const rearDiffuser = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.38, 0.35),
      carbonMat
    );
    rearDiffuser.position.set(0, 0.76, -4.52);
    car.add(rearDiffuser);

    const exhaustGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.45, 12);
    exhaustGeo.rotateX(Math.PI / 2);
    for (const ex of [-1.45, -1.12, 1.12, 1.45]) {
      const pipe = new THREE.Mesh(exhaustGeo, rimMat);
      pipe.position.set(ex, 0.72, -4.68);
      car.add(pipe);
    }

    // 5. Front Kidney Grille & Angel-Eye LED Headlights (+Z is forward)
    const frontGrille = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.68, 0.22),
      carbonMat
    );
    frontGrille.position.set(0, 1.28, 4.62);
    car.add(frontGrille);

    for (const side of [-1, 1]) {
      const headLamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.34, 0.22),
        headLightMat
      );
      headLamp.position.set(side * 1.55, 1.52, 4.62);
      car.add(headLamp);
    }

    // 6. 4 Deep-Dish Alloy Wheels with Tires & Red Brembo Brake Calipers
    const tireGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.58, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const alloyGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.62, 14);
    alloyGeo.rotateZ(Math.PI / 2);

    const wheelCoords = [
      [-2.22, 0.78, 2.85],
      [2.22, 0.78, 2.85],
      [-2.22, 0.78, -2.85],
      [2.22, 0.78, -2.85]
    ];
    for (const [wx, wy, wz] of wheelCoords) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.position.set(wx, wy, wz);
      car.add(tire);

      const alloy = new THREE.Mesh(alloyGeo, rimMat);
      alloy.position.set(wx, wy, wz);
      car.add(alloy);
    }

    car.userData = {
      paintMat,
      glassMat,
      trimMat: rearRedStripe.material
    };

    return car;
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
    if (this.cameraMode === 'chase') {
      this.cameraDistance = this.inVehicle ? 26 : 15.5;
      this.cameraPitch = this.inVehicle ? 0.24 : 0.20;
    }
    return this.inVehicle;
  }

  cycleCameraMode() {
    this.cameraMode = this.cameraMode === 'chase' ? 'helicopter' : 'chase';
    this.cameraDistance = this.cameraMode === 'helicopter' ? 195 : (this.inVehicle ? 26 : 15.5);
    this.cameraPitch = this.cameraMode === 'helicopter' ? 0.78 : (this.inVehicle ? 0.24 : 0.20);
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

    for (const entry of this.remotePlayers.values()) {
      entry.group.position.lerp(entry.targetPos, Math.min(1, dt * 4.5));
    }

    for (let i = this.nairaParticles.length - 1; i >= 0; i--) {
      const p = this.nairaParticles[i];
      p.life -= dt;
      p.mesh.position.y -= p.vy * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.z += p.rz * dt;
      if (p.life <= 0 || p.mesh.position.y <= 0.5) {
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
    // Therefore Screen-Forward = (-sin(yaw), -cos(yaw)) and Screen-Right = (+cos(yaw), -sin(yaw)).
    const forwardInput = (this.keys.w ? 1 : 0) - (this.keys.s ? 1 : 0) - this.touchVector.y;
    const rightInput = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0) + this.touchVector.x;

    const maxSpeed = this.inVehicle ? (this.keys.shift ? 132 : 86) : (this.keys.shift ? 38 : 24);
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

      this.playerPos.x += Math.sin(this.playerHeading) * this.playerSpeed * dt;
      this.playerPos.z += Math.cos(this.playerHeading) * this.playerSpeed * dt;

      this.playerPos.x = Math.max(-680, Math.min(680, this.playerPos.x));
      this.playerPos.z = Math.max(-680, Math.min(680, this.playerPos.z));

      this.playerGroup.position.copy(this.playerPos);
      this.playerGroup.rotation.y = this.playerHeading;

      // Gently steer chase camera behind vehicle/character when turning left/right while moving forward
      if (this.inVehicle && Math.abs(forwardInput) > 0.1) {
        this.cameraYaw -= rightInput * dt * 0.95;
      }

      this.walkCycle += dt * (this.keys.shift ? 15 : 10);
      this._checkDistrictProximity();
    } else {
      this.playerSpeed *= 0.82;
      this.walkCycle *= 0.85;
    }

    // Animate 3rd-person humanoid limbs (walking stride + street punch right hook)
    if (this.playerHuman) {
      const moving = this.playerSpeed > 1.2;
      const legSwing = moving ? Math.sin(this.walkCycle) * 0.72 : 0;
      this.playerHuman.leftLegPivot.rotation.x = legSwing;
      this.playerHuman.rightLegPivot.rotation.x = -legSwing;
      this.playerHuman.leftArmPivot.rotation.x = -legSwing * 0.85;

      if (this.punchTimer > 0) {
        this.punchTimer = Math.max(0, this.punchTimer - dt);
        this.playerHuman.rightArmPivot.rotation.x = -Math.PI * 0.58;
        this.playerHuman.rightArmPivot.rotation.z = -0.22;
        this.playerHuman.torso.rotation.y = 0.28;
      } else {
        this.playerHuman.rightArmPivot.rotation.x = legSwing * 0.85;
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
