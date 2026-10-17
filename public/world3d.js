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
    this.callbacks = callbacks; // { onEnterDistrict(id), onSelectPlayer(player), onSelectDistrict(id) }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1528);
    this.scene.fog = new THREE.FogExp2(0x0b1528, 0.00095);

    this.camera = new THREE.PerspectiveCamera(
      52,
      Math.max(1, containerEl.clientWidth) / Math.max(1, containerEl.clientHeight),
      1,
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
    this.hourOfDay = 8;
    this.cameraMode = 'chase'; // 'chase' | 'helicopter'
    this.cameraYaw = 0.4;
    this.cameraPitch = 0.42;
    this.cameraDistance = 88;
    this.isPointerDragging = false;
    this.lastPointer = { x: 0, y: 0 };

    // Player 3D controller state
    const startD = DISTRICT_BY_ID.cbd || DISTRICTS[0];
    const startPos = map2DTo3D(startD.x, startD.y);
    this.playerPos = new THREE.Vector3(startPos.x, 0, startPos.z);
    this.playerHeading = 0;
    this.playerSpeed = 0;
    this.inVehicle = true;
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
    this._buildLocalPlayerRig();
    this._bindInputs();

    this._animate = this._animate.bind(this);
    this.animFrameId = requestAnimationFrame(this._animate);
  }

  _initLights() {
    this.ambientLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfef08a, 1.45);
    this.sunLight.position.set(320, 460, -240);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 50;
    this.sunLight.shadow.camera.far = 1600;
    const d = 550;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    this.cityGlow = new THREE.PointLight(0xf59e0b, 1.2, 650);
    this.cityGlow.position.set(0, 65, 0);
    this.scene.add(this.cityGlow);
  }

  _buildTerrainAndWater() {
    const groundGeo = new THREE.PlaneGeometry(3400, 3400, 48, 48);
    groundGeo.rotateX(-Math.PI / 2);

    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const distFromCenter = Math.hypot(vx, vz);
      if (distFromCenter > 580) {
        const ridge = Math.sin(vx * 0.008) * Math.cos(vz * 0.008) * 28;
        pos.setY(i, Math.max(0, ridge));
      }
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x121d24,
      roughness: 0.92,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(2200, 55, 0x1e3a5f, 0x162436);
    grid.position.y = 0.25;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);

    // Jabi Lake water body
    const jabiD = DISTRICT_BY_ID.jabi;
    const jabiPos = map2DTo3D(jabiD.x - 5, jabiD.y + 3);
    const lakeGeo = new THREE.CylinderGeometry(78, 82, 1.2, 36);
    this.lakeMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.25,
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
        emissiveIntensity: 0.35,
        roughness: 0.15,
        metalness: 0.8
      })
    );
    quarryLake.position.set(mpapePos.x, 1.5, mpapePos.z);
    this.scene.add(quarryLake);
  }

  _buildAsoRockAndHills() {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x292524,
      roughness: 0.88,
      metalness: 0.12,
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

  _buildRoadNetwork() {
    this.roadSegments = [];
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.1
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x047857,
      emissiveIntensity: 0.35,
      roughness: 0.4
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    for (const edge of EDGES) {
      const dA = DISTRICT_BY_ID[edge.a];
      const dB = DISTRICT_BY_ID[edge.b];
      if (!dA || !dB) continue;

      const pA = map2DTo3D(dA.x, dA.y);
      const pB = map2DTo3D(dB.x, dB.y);
      const vA = new THREE.Vector3(pA.x, 0.5, pA.z);
      const vB = new THREE.Vector3(pB.x, 0.5, pB.z);

      const diff = new THREE.Vector3().subVectors(vB, vA);
      const len = diff.length();
      const mid = new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5);
      const angle = Math.atan2(diff.x, diff.z);

      const isRail = edge.type === 'rail';
      const width = isRail ? 6 : edge.type === 'expressway' ? 15 : 9;

      const geo = new THREE.BoxGeometry(width, isRail ? 1.1 : 0.55, len);
      const mesh = new THREE.Mesh(geo, isRail ? railMat : roadMat);
      mesh.position.copy(mid);
      mesh.rotation.y = angle;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      if (!isRail) {
        const stripeGeo = new THREE.PlaneGeometry(0.65, len * 0.94);
        stripeGeo.rotateX(-Math.PI / 2);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(mid.x, 0.85, mid.z);
        stripe.rotation.y = angle;
        this.scene.add(stripe);
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

  _buildDistrictsAndSkyline() {
    this.clickableDistrictMeshes = [];

    const winLitMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0xfef08a,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.7
    });
    this.windowMaterials.push(winLitMat);

    for (const d of DISTRICTS) {
      const id = d.id;
      const pos = map2DTo3D(d.x, d.y);
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);
      group.userData = { districtId: id, district: d };

      const isZone1 = d.zone === 1;
      const zoneColor = isZone1 ? 0xf59e0b : 0x10b981;

      const ringGeo = new THREE.RingGeometry(36, 41, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: zoneColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.9;
      group.add(ring);

      const padGeo = new THREE.CylinderGeometry(35, 35, 0.8, 32);
      const padMat = new THREE.MeshStandardMaterial({
        color: isZone1 ? 0x1e293b : 0x27272a,
        roughness: 0.8
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.y = 0.4;
      pad.userData = { districtId: id };
      this.clickableDistrictMeshes.push(pad);
      group.add(pad);

      const bCount = isZone1 ? 14 : 18;
      for (let i = 0; i < bCount; i++) {
        const ang = (i / bCount) * Math.PI * 2 + (i % 2) * 0.22;
        const rad = 22 + (i % 3) * 18;
        const bx = Math.cos(ang) * rad;
        const bz = Math.sin(ang) * rad;

        let bw = 8 + (i % 4) * 3;
        let bd = 8 + ((i + 1) % 4) * 3;
        let bh = 12;
        let bColor = 0x334155;

        if (id === 'cbd') {
          bh = 36 + (i % 5) * 18;
          bColor = i % 2 === 0 ? 0x0f172a : 0x1e3a5f;
        } else if (id === 'wuse2') {
          bh = 22 + (i % 4) * 10;
          bColor = i % 2 === 0 ? 0x31102f : 0x1e1b4b;
        } else if (id === 'maitama' || id === 'asokoro' || id === 'guzape') {
          bh = 14 + (i % 3) * 6;
          bw = 13;
          bd = 11;
          bColor = 0xf8fafc;
        } else {
          bh = 8 + (i % 3) * 4.5;
          bColor = i % 2 === 0 ? 0x7c2d12 : 0x475569;
        }

        const bGeo = new THREE.BoxGeometry(bw, bh, bd);
        const bMat = new THREE.MeshStandardMaterial({
          color: bColor,
          roughness: 0.55,
          metalness: isZone1 ? 0.35 : 0.1
        });
        const bMesh = new THREE.Mesh(bGeo, bMat);
        bMesh.position.set(bx, bh / 2, bz);
        bMesh.castShadow = true;
        bMesh.receiveShadow = true;
        bMesh.userData = { districtId: id };
        this.clickableDistrictMeshes.push(bMesh);
        group.add(bMesh);

        if (bh >= 20) {
          const winStrip = new THREE.Mesh(
            new THREE.BoxGeometry(bw + 0.3, bh * 0.72, bd + 0.3),
            winLitMat
          );
          winStrip.position.set(bx, bh * 0.52, bz);
          group.add(winStrip);
        }

        if (id === 'maitama' || id === 'asokoro') {
          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(bw * 0.75, 5, 4),
            new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.7 })
          );
          roof.position.set(bx, bh + 2.5, bz);
          roof.rotation.y = Math.PI / 4;
          group.add(roof);
        }
      }

      const beaconGeo = new THREE.OctahedronGeometry(5.5, 0);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: zoneColor,
        emissive: zoneColor,
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.8
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = id === 'cbd' ? 115 : 64;
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
  }

  _buildTrafficSwarm() {
    if (!this.roadSegments.length) return;

    const vehiclePalettes = [
      { color: 0xfacc15, w: 2.8, h: 1.8, l: 5.2, speed: 0.22, type: 'taxi' },
      { color: 0x10b981, w: 2.8, h: 1.8, l: 5.2, speed: 0.25, type: 'taxi' },
      { color: 0x0f172a, w: 3.4, h: 2.5, l: 6.4, speed: 0.34, type: 'vip_suv' },
      { color: 0xf8fafc, w: 3.2, h: 2.3, l: 6.0, speed: 0.29, type: 'suv' },
      { color: 0xeab308, w: 2.2, h: 2.0, l: 3.4, speed: 0.16, type: 'keke' },
      { color: 0x059669, w: 4.2, h: 3.6, l: 18.0, speed: 0.42, type: 'train' }
    ];

    for (let i = 0; i < 46; i++) {
      const seg = this.roadSegments[i % this.roadSegments.length];
      const spec = seg.isRail
        ? vehiclePalettes[5]
        : vehiclePalettes[i % (vehiclePalettes.length - 1)];

      const carGroup = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w, spec.h, spec.l),
        new THREE.MeshStandardMaterial({
          color: spec.color,
          roughness: 0.35,
          metalness: 0.65
        })
      );
      body.position.y = spec.h * 0.5 + 0.6;
      carGroup.add(body);

      const headMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const hl = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.8, 0.4, 0.3), headMat);
      hl.position.set(0, spec.h * 0.5 + 0.5, spec.l * 0.51);
      carGroup.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.8, 0.4, 0.3), tailMat);
      tl.position.set(0, spec.h * 0.5 + 0.5, -spec.l * 0.51);
      carGroup.add(tl);

      if (spec.type === 'vip_suv') {
        const strobe = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.35, 0.6),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
        );
        strobe.position.set(0, spec.h + 0.8, 0);
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

  _buildLocalPlayerRig() {
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.copy(this.playerPos);

    const ringGeo = new THREE.RingGeometry(5.2, 6.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.playerRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
    );
    this.playerRing.position.y = 0.8;
    this.playerGroup.add(this.playerRing);

    this.playerVehicleMesh = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 2.2, 8.6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.85 })
    );
    chassis.position.y = 1.8;
    chassis.castShadow = true;
    this.playerVehicleMesh.add(chassis);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.7, 5.0),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.15, metalness: 0.9 })
    );
    cabin.position.set(0, 3.4, -0.4);
    this.playerVehicleMesh.add(cabin);

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.0, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xca8a04, emissiveIntensity: 0.5 })
    );
    grille.position.set(0, 1.8, 4.35);
    this.playerVehicleMesh.add(grille);

    this.playerGroup.add(this.playerVehicleMesh);

    this.playerPedMesh = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.5, 3.8, 12),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 })
    );
    torso.position.y = 2.4;
    this.playerPedMesh.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.6 })
    );
    head.position.y = 5.0;
    this.playerPedMesh.add(head);

    const filaCap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.05, 0.7, 12),
      new THREE.MeshStandardMaterial({ color: 0xfacc15 })
    );
    filaCap.position.y = 5.75;
    this.playerPedMesh.add(filaCap);

    this.playerPedMesh.visible = false;
    this.playerGroup.add(this.playerPedMesh);

    this.scene.add(this.playerGroup);
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
      this.cameraPitch = Math.max(0.18, Math.min(1.25, this.cameraPitch + dy * 0.005));
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
      this.cameraDistance = Math.max(38, Math.min(420, this.cameraDistance + e.deltaY * 0.12));
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
    return this.inVehicle;
  }

  cycleCameraMode() {
    this.cameraMode = this.cameraMode === 'chase' ? 'helicopter' : 'chase';
    this.cameraDistance = this.cameraMode === 'helicopter' ? 235 : 88;
    this.cameraPitch = this.cameraMode === 'helicopter' ? 0.85 : 0.42;
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
    const destVec = new THREE.Vector3(target3D.x, 0, target3D.z);

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

    const isNight = hour >= 19 || hour < 6;
    const isDusk = (hour >= 17 && hour < 19) || (hour >= 6 && hour < 7);

    if (weather === 'harmattan' || weather === 'dry') {
      this.scene.background.setHex(isNight ? 0x1c1917 : 0x78350f);
      this.scene.fog.color.setHex(isNight ? 0x1c1917 : 0x92400e);
      this.scene.fog.density = 0.0016;
    } else if (weather === 'storm' || weather === 'downpour') {
      this.scene.background.setHex(0x090d16);
      this.scene.fog.color.setHex(0x0f172a);
      this.scene.fog.density = 0.0016;
    } else if (isNight) {
      this.scene.background.setHex(0x050811);
      this.scene.fog.color.setHex(0x050811);
      this.scene.fog.density = 0.00095;
    } else if (isDusk) {
      this.scene.background.setHex(0x31102f);
      this.scene.fog.color.setHex(0x4c1d95);
      this.scene.fog.density = 0.0009;
    } else {
      this.scene.background.setHex(0x0c4a6e);
      this.scene.fog.color.setHex(0x0c4a6e);
      this.scene.fog.density = 0.00075;
    }

    this.sunLight.intensity = isNight ? 0.25 : isDusk ? 0.9 : 1.5;
    this.sunLight.color.setHex(isDusk ? 0xf97316 : isNight ? 0x38bdf8 : 0xfef08a);

    for (const mat of this.windowMaterials) {
      mat.emissiveIntensity = isNight ? 0.95 : 0.2;
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
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(3.8, 2.2, 7.2),
          new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.8 })
        );
        mesh.position.y = 1.6;
        group.add(mesh);

        const halo = new THREE.Mesh(
          new THREE.RingGeometry(4.2, 5.2, 24),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
        );
        halo.rotateX(-Math.PI / 2);
        halo.position.y = 0.7;
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

    if (this.skyCam.active) {
      this.skyCam.elapsed += dt;
      const u = Math.min(1, this.skyCam.elapsed / this.skyCam.duration);
      const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

      this.playerPos.lerpVectors(this.skyCam.from, this.skyCam.to, ease);
      this.playerGroup.position.copy(this.playerPos);

      const altitudeArc = Math.sin(u * Math.PI) * 340;
      const camPos = new THREE.Vector3(
        this.playerPos.x + Math.sin(this.cameraYaw) * (this.cameraDistance + altitudeArc * 0.4),
        48 + altitudeArc,
        this.playerPos.z + Math.cos(this.cameraYaw) * (this.cameraDistance + altitudeArc * 0.4)
      );
      this.camera.position.copy(camPos);
      this.camera.lookAt(this.playerPos.x, 8, this.playerPos.z);

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
    const forwardInput = (this.keys.w ? 1 : 0) - (this.keys.s ? 1 : 0) - this.touchVector.y;
    const turnInput = (this.keys.a ? 1 : 0) - (this.keys.d ? 1 : 0) - this.touchVector.x;

    const maxSpeed = this.inVehicle ? (this.keys.shift ? 135 : 88) : 34;

    if (Math.abs(forwardInput) > 0.05 || Math.abs(turnInput) > 0.05) {
      const inputAngle = Math.atan2(-turnInput, forwardInput);
      const targetHeading = this.cameraYaw + inputAngle + Math.PI;
      this.playerHeading = targetHeading;
      this.playerSpeed = maxSpeed * Math.min(1, Math.hypot(forwardInput, turnInput));

      this.playerPos.x += Math.sin(this.playerHeading) * this.playerSpeed * dt;
      this.playerPos.z += Math.cos(this.playerHeading) * this.playerSpeed * dt;

      this.playerPos.x = Math.max(-680, Math.min(680, this.playerPos.x));
      this.playerPos.z = Math.max(-680, Math.min(680, this.playerPos.z));

      this.playerGroup.position.copy(this.playerPos);
      this.playerGroup.rotation.y = this.playerHeading;

      this._checkDistrictProximity();
    } else {
      this.playerSpeed *= 0.85;
    }

    const horizDist = Math.cos(this.cameraPitch) * this.cameraDistance;
    const vertDist = Math.sin(this.cameraPitch) * this.cameraDistance;
    const desiredCam = new THREE.Vector3(
      this.playerPos.x + Math.sin(this.cameraYaw) * horizDist,
      Math.max(12, vertDist),
      this.playerPos.z + Math.cos(this.cameraYaw) * horizDist
    );
    this.camera.position.lerp(desiredCam, Math.min(1, dt * 8));
    this.camera.lookAt(this.playerPos.x, 6, this.playerPos.z);
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
      along: { body: 0x475569, cabin: 0x334155, trim: 0x94a3b8 },
      corolla: { body: 0x1e3a8a, cabin: 0x1e293b, trim: 0x38bdf8 },
      rx350: { body: 0x7c2d12, cabin: 0x1c1917, trim: 0xfacc15 },
      prado: { body: 0x090d16, cabin: 0x020617, trim: 0x10b981 },
      g63: { body: 0x111827, cabin: 0x000000, trim: 0xf59e0b }
    };
    const cfg = palette[carId] || palette.corolla;
    const children = this.playerVehicleMesh.children;
    if (children[0]?.material) children[0].material.color.setHex(cfg.body);
    if (children[1]?.material) children[1].material.color.setHex(cfg.cabin);
    if (children[2]?.material) children[2].material.color.setHex(cfg.trim);
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
      tempV.set(node.pos.x, id === 'cbd' ? 126 : 74, node.pos.z);
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
      tempV.y += 14;
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
        tempV.y += 22;
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
