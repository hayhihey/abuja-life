// ============================================================================
// ABUJA LIFE: GRAND THEFT PROTOCOL — MAIN 3D CLIENT & MULTIPLAYER CONTROLLER
// ============================================================================

import { Game } from '/src/core/game.js';
import { netWorth, levelInfo } from '/src/core/state.js';
import * as Clock from '/src/core/clock.js';
import { listActions } from '/src/core/actions.js';
import { planTrip, executeTrip, availableModes } from '/src/core/travel.js';
import { promotionReqs, promote, switchTrack, switchReason } from '/src/core/careers.js';
import { daysLeft, renewalQuote, moveQuote, renew, moveTo } from '/src/core/housing.js';
import { favoursFor, callFavour, checkIn, checkInCost } from '/src/core/contacts.js';
import { DISTRICTS, DISTRICT_BY_ID, EDGES, LANDMARK_INDEX } from '/src/data/world.js';
import { TRACKS, START_PRESETS } from '/src/data/careers.js';
import {
  GENDERS,
  LIFE_STAGES,
  NIGERIAN_LIFESTYLES,
  PREVIOUS_PROPERTY_OPTIONS,
  NIGERIAN_SLANG_DICTIONARY
} from '/src/data/lifestyles.js';
import {
  NIGERIA_ENCYCLOPEDIA_INFO,
  MARKETWISHES_INFO,
  MARKETWISHES_CATEGORIES,
  MARKETWISHES_CATALOG,
  NIGERIA_TOURIST_ATTRACTIONS
} from '/src/data/tourism_and_shopping.js';
import {
  formatNairaFull,
  breakdownNairaNotes,
  renderNairaNoteSVG,
  renderDistrictIllustrationSVG,
  renderCharacterAvatarSVG
} from '/visuals.js';
import { AbujaWorld3D } from '/world3d.js';
import {
  MOTIVE_CONFIG,
  BUILD_BUY_CATALOG,
  CATALOG_BY_ID,
  SMART_OBJECT_INTERACTIONS,
  evaluateAutonomousActions,
  runSmartObjectAction,
  buyCatalogItem,
  payEstateLevy
} from '/src/core/sims.js';

const STORAGE_KEY = 'abuja_life_save_v3';
const PLAYER_ID_KEY = 'abuja_life_player_id';

function getOrCreatePlayerId() {
  let pid = sessionStorage.getItem(PLAYER_ID_KEY);
  if (!pid) {
    pid = `player_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
    sessionStorage.setItem(PLAYER_ID_KEY, pid);
  }
  return pid;
}

const LOCAL_PLAYER_ID = getOrCreatePlayerId();

const RADIO_STATIONS = [
  { name: 'WAZOBIA 99.5 FM ABUJA', tagline: 'Traffic hold-up along Airport Road • Mind your particulars o!' },
  { name: 'COOL 96.9 FM MAITAMA', tagline: 'Afrobeats & Amapiano VIP Drive • Wuse 2 lounges open till 4 AM' },
  { name: 'CAPITAL 92.9 FM CBD', tagline: 'Federal Secretariat Bulletin • BPP procurement tenders open today' },
  { name: 'HUMAN RIGHTS 101.1 FM', tagline: 'Berekete Family Live • Landlords & 2-year rent debate in Lugbe' },
  { name: 'VISION 92.1 FM ASOKORO', tagline: 'Diplomatic Protocol & Monetary Policy • CBN Naira liquidity update' }
];

const AVATAR_MAP = {
  civil: 'civil_service',
  contractor: 'contractor',
  tech: 'tech_nomad',
  trader: 'street_hustle'
};

class AbujaClientApp {
  constructor() {
    this.playerId = LOCAL_PLAYER_ID;
    this.radioIndex = 0;
    this.activeTab = 'actions';
    this.chatChannel = 'global';
    this.dmTarget = null;
    this.onlinePlayers = [];
    this.chatMessages = [];
    this.chatRenderLimit = 50;
    this.hasMoreChatHistory = false;
    this.unreadByChannel = { global: 0, district: 0, dm: 0 };
    this.unreadByThread = {};
    this.connectedPlayerIds = new Set();
    this.courtCases = [];
    this.policyPolls = [];
    this.playerTasks = [];
    this.votedPolls = new Set();
    this.lastFunds = null;
    this.selectedStarterTrack = 'contractor';
    this.selectedGender = 'male';
    this.selectedLifeStage = 'adult';
    this.selectedAge = 28;
    this.selectedLifestyle = 'alhaji';
    this.selectedPrevProp = 'default';
    this.selectedCommuteDest = 'cbd';
    this.selectedMwCategory = 'all';
    this.selectedTourismZone = 'all';
    this.showNigeriaAlmanac = false;
    this.realTimeTimer = null;
    this.simSpeed = 1;
    this.whotState = null;
    this.ludoState = null;

    this._initGame();
    this._ensureExtendedPlayerState();
    try {
      this._init3DWorld();
    } catch (err) {
      console.error('3D World init warning:', err);
    }
    this._init2DMap();
    this._bindUIEvents();
    this._renderAll();
    // Always start from the Nigerian Citizen Sign-Up & Lifestyle Caliber Creator screen on load
    this._openNewCharModal();
    this._initMultiplayerBridge();
    this._startRadarLoop();
    this.startRealTime(1);
  }

  _ensureExtendedPlayerState() {
    const s = this.game.s;
    if (!s.meta.gender) s.meta.gender = 'male';
    if (!s.meta.age) s.meta.age = 26;
    if (!s.meta.lifeStage) s.meta.lifeStage = s.meta.age < 18 ? 'child' : s.meta.age <= 25 ? 'young_adult' : 'adult';
    if (!s.meta.lifestyle) s.meta.lifestyle = 'alhaji';
    if (!s.meta.caliber) s.meta.caliber = NIGERIAN_LIFESTYLES[s.meta.lifestyle]?.caliber || 'Standard FCT Citizen';
    if (!s.meta.slangTag) s.meta.slangTag = NIGERIAN_LIFESTYLES[s.meta.lifestyle]?.slangTag || 'Steeze & Composure';

    if (!s.social) {
      s.social = {
        steeze: 82,
        composure: 85,
        courses: [],
        bae: null,
        plots: {},
        car: 'along',
        ownedCars: ['along'],
        solarInstalled: false,
        mwInventory: [],
        mwPoints: 200,
        mwVendor: false,
        lastMwVendorDay: 0,
        visitedAttractions: [],
        dailyHustle: {
          day: this.game.day,
          streak: 1,
          movesCount: 0,
          commuted: false,
          socialized: false,
          rewarded: false
        }
      };
    }
    if (typeof s.social.steeze !== 'number') s.social.steeze = 80;
    if (typeof s.social.composure !== 'number') s.social.composure = 82;
    if (!s.social.plots) s.social.plots = {};
    if (!s.social.car) s.social.car = 'along';
    if (!Array.isArray(s.social.ownedCars)) s.social.ownedCars = ['along'];
    if (!Array.isArray(s.social.mwInventory)) s.social.mwInventory = [];
    if (typeof s.social.mwPoints !== 'number') s.social.mwPoints = 200;
    if (typeof s.social.mwVendor !== 'boolean') s.social.mwVendor = false;
    if (typeof s.social.lastMwVendorDay !== 'number') s.social.lastMwVendorDay = 0;
    if (!Array.isArray(s.social.visitedAttractions)) s.social.visitedAttractions = [];
    if (!s.social.dailyHustle || s.social.dailyHustle.day !== this.game.day) {
      const prevStreak = s.social?.dailyHustle?.rewarded ? (s.social.dailyHustle.streak || 1) + 1 : (s.social?.dailyHustle?.streak || 1);
      s.social.dailyHustle = {
        day: this.game.day,
        streak: prevStreak,
        movesCount: 0,
        commuted: false,
        socialized: false,
        rewarded: false
      };
    }
  }

  _recordDailyProgress(type) {
    this._ensureExtendedPlayerState();
    const dh = this.game.s.social.dailyHustle;
    if (type === 'move') dh.movesCount = (dh.movesCount || 0) + 1;
    if (type === 'commute') dh.commuted = true;
    if (type === 'social') dh.socialized = true;

    if (!dh.rewarded && dh.movesCount >= 2 && dh.commuted && dh.socialized) {
      dh.rewarded = true;
      const bonus = 15000 + (dh.streak - 1) * 3000;
      this.game.earn(bonus, { cash: true });
      this.game.stat('clout', 4);
      this.game.log(`Completed Today's Abuja Hustle (Day ${dh.streak} Streak)! Bonus: ${formatNairaFull(bonus)} + 4 Protocol.`, 'good', '🔥');
      if (this.world3d) this.world3d.spawnNairaRain(32);
      this.showToast(`🔥 Daily Hustle Complete! +${formatNairaFull(bonus)} & +4 Protocol!`);
    }
    this._renderDailyHustleBox();
  }

  // --------------------------------------------------------------------------
  // 1. INITIALIZE CORE SIMULATION ENGINE
  // --------------------------------------------------------------------------
  _initGame() {
    const hooks = {
      decide: (decision) => this._promptDecisionModal(decision)
    };

    let loaded = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loaded = Game.load(raw, hooks);
    } catch (_) {}

    this.game = loaded || Game.create({ name: 'Tunde', track: 'civil' }, hooks);
    this.lastFunds = this.game.funds();

    this.game.on((type, data) => {
      if (type === 'hud') {
        this._renderHUD();
        this._saveGame();
      } else if (type === 'loc') {
        const curDist = this.game.s.loc.district;
        if (this.world3d) {
          this.world3d.flyToDistrict(curDist);
        }
        this._recordDailyProgress('commute');
        this._renderDistrictBanner();
        this._renderActionsTab();
        this._renderCommuteTab();
        this._render2DMapHighlight();
        this._sendHeartbeat();
      } else if (type === 'time') {
        this._ensureExtendedPlayerState();
        this._renderClockAndWeather();
        if (this.world3d) {
          this.world3d.setEnvironment(Clock.hourOf(this.game.s.t), this.game.s.market.today.weather);
        }
      } else if (type === 'log') {
        if (data && data.text) {
          this.showToast(`${data.icon || '📣'} ${data.text}`);
        }
        this._renderFeedTab();
      } else if (type === 'action') {
        this._recordDailyProgress('move');
        this._renderAll();
      }
    });
  }

  _saveGame() {
    try {
      localStorage.setItem(STORAGE_KEY, this.game.serialize());
    } catch (_) {}
  }

  startRealTime(speed = 1) {
    this.simSpeed = speed;
    if (this.realTimeTimer) clearInterval(this.realTimeTimer);
    const intervalMs = Math.max(200, Math.round(1200 / speed));
    this.realTimeTimer = setInterval(() => {
      if (!this.game.locked) {
        this.game.advance(1).then(() => {
          this._renderHUD();
        });
      }
    }, intervalMs);
  }

  stopRealTime() {
    if (this.realTimeTimer) {
      clearInterval(this.realTimeTimer);
      this.realTimeTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // 2. INITIALIZE THREE.JS 3D ABUJA WORLD
  // --------------------------------------------------------------------------
  _init3DWorld() {
    const viewport = document.getElementById('world3d-viewport');
    if (!viewport) return;

    this.world3d = new AbujaWorld3D(viewport, {
      onEnterDistrict: (districtId) => {
        if (districtId && districtId !== this.game.s.loc.district && !this.game.locked) {
          this.game.arrive(districtId);
          const dName = DISTRICT_BY_ID[districtId]?.name || districtId;
          this.game.log(`Entered ${dName} street corridor.`, 'info', '🚶🏾');
        }
      },
      onSelectDistrict: (districtId) => {
        if (!districtId) return;
        if (districtId === this.game.s.loc.district) {
          this.openDeckTab('actions');
          this.showToast(`📍 Currently on ${DISTRICT_BY_ID[districtId].name} street`);
        } else {
          this.selectedCommuteDest = districtId;
          this.openDeckTab('commute');
          this._renderCommuteTab();
          this.showToast(`🛣️ Route planner set to ${DISTRICT_BY_ID[districtId].name}`);
        }
      },
      onSelectPlayer: (player) => {
        if (!player) return;
        this.openDeckTab('multiplayer');
        this.openDirectMessage(player.id, player.name);
      },
      onStreetPunch: ({ hitNpc, districtId }) => {
        if (hitNpc) {
          const dropCash = 2500;
          this.game.earn(dropCash, { cash: true });
          this.game.stat('clout', 1);
          this._renderHUD();
          this.showToast(`👊🏾 Street Knockout in ${DISTRICT_BY_ID[districtId]?.short || 'FCT'}! Rival dropped ₦2,500 cash! (+1 Clout)`);
        } else {
          this.showToast('👊🏾 Street Punch! Walk up to any street rival on the walkway and press Space / Punch!');
        }
      }
    });

    this.world3d.flyToDistrict(this.game.s.loc.district, true);
    this.world3d.setEnvironment(Clock.hourOf(this.game.s.t), this.game.s.market.today.weather);
    if (this.game.s.social?.plots) {
      this.world3d.syncPlayerHouses(Object.values(this.game.s.social.plots));
    }
    if (this.game.s.social?.car) {
      this.world3d.setPlayerVehicleAppearance(this.game.s.social.car);
    }
  }

  // --------------------------------------------------------------------------
  // 3. OPTIONAL 2D VECTOR MAP OVERLAY
  // --------------------------------------------------------------------------
  _init2DMap() {
    const routesG = document.getElementById('map-routes');
    const nodesG = document.getElementById('map-nodes');
    if (!routesG || !nodesG) return;

    routesG.innerHTML = '';
    nodesG.innerHTML = '';

    for (const e of EDGES) {
      const a = DISTRICT_BY_ID[e.a];
      const b = DISTRICT_BY_ID[e.b];
      if (!a || !b) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x);
      line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x);
      line.setAttribute('y2', b.y);
      line.setAttribute('stroke', e.type === 'rail' ? '#10b981' : '#475569');
      line.setAttribute('stroke-width', e.type === 'expressway' ? '1.1' : '0.65');
      if (e.type === 'rail') line.setAttribute('stroke-dasharray', '1.5 1');
      routesG.appendChild(line);
    }

    for (const d of DISTRICTS) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'map-node');
      g.dataset.id = d.id;
      g.style.cursor = 'pointer';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', d.x);
      circle.setAttribute('cy', d.y);
      circle.setAttribute('r', d.zone === 1 ? '2.6' : '2.1');
      circle.setAttribute('fill', d.zone === 1 ? '#f59e0b' : '#10b981');
      circle.setAttribute('stroke', '#090d16');
      circle.setAttribute('stroke-width', '0.6');

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', d.x);
      txt.setAttribute('y', d.y - 3.4);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', '#f8fafc');
      txt.setAttribute('font-size', '2.5');
      txt.setAttribute('font-weight', '700');
      txt.textContent = d.short;

      g.appendChild(circle);
      g.appendChild(txt);
      g.addEventListener('click', () => {
        if (d.id !== this.game.s.loc.district) {
          this.selectedCommuteDest = d.id;
          this.openDeckTab('commute');
          this._renderCommuteTab();
        }
      });
      nodesG.appendChild(g);
    }

    this._render2DMapHighlight();
  }

  _render2DMapHighlight() {
    const cur = this.game.s.loc.district;
    document.querySelectorAll('#map-nodes .map-node circle').forEach((c) => {
      const id = c.parentElement.dataset.id;
      if (id === cur) {
        c.setAttribute('stroke', '#38bdf8');
        c.setAttribute('stroke-width', '1.4');
      } else {
        c.setAttribute('stroke', '#090d16');
        c.setAttribute('stroke-width', '0.6');
      }
    });
  }

  // --------------------------------------------------------------------------
  // 4. REAL NIGERIA STREET GPS MAP & CIRCULAR GTA RADAR RENDERER
  // --------------------------------------------------------------------------
  _getNigeriaDistrictGPS(districtId) {
    const GPS_TABLE = {
      cbd: { lat: 9.0579, lng: 7.4951, street: 'SHEHU SHAGARI WAY • CBD' },
      wuse2: { lat: 9.0787, lng: 7.4813, street: 'ADETOKUNBO ADEMOLA CRES • WUSE 2' },
      maitama: { lat: 9.0882, lng: 7.4934, street: 'AGUIYI IRONSI ST • MAITAMA' },
      asokoro: { lat: 9.0465, lng: 7.5255, street: 'ASO DRIVE • ASOKORO' },
      garki: { lat: 9.0312, lng: 7.4898, street: 'TAFAWA BALEWA WAY • GARKI' },
      jabi: { lat: 9.0642, lng: 7.4245, street: 'BALA SOKOTO WAY • JABI LAKE' },
      utako: { lat: 9.0685, lng: 7.4418, street: 'OBAFEMI AWOLOWO WAY • UTAKO' },
      guzape: { lat: 9.0076, lng: 7.5082, street: 'HASSAN MUSA KATSINA ST • GUZAPE' },
      lugbe: { lat: 8.9830, lng: 7.3814, street: 'AIRPORT ROAD • LUGBE' },
      kubwa: { lat: 9.1538, lng: 7.3220, street: 'GADO NASKO RD • KUBWA' },
      dawaki: { lat: 9.1245, lng: 7.3982, street: 'MURTALA MOHAMMED EXP • DAWAKI' },
      mpape: { lat: 9.1288, lng: 7.4910, street: 'MPAPE CRUSH ROCK RD • MPAPE' },
      nyanya: { lat: 9.0205, lng: 7.5750, street: 'ABUJA-KEFFI EXP • NYANYA' },
      lagos_island: { lat: 6.4312, lng: 3.4526, street: 'ADMIRALTY WAY • LEKKI / VI LAGOS' },
      lagos_mainland: { lat: 6.5965, lng: 3.3421, street: 'OBAFEMI AWOLOWO WAY • IKEJA LAGOS' }
    };
    return GPS_TABLE[districtId] || GPS_TABLE.cbd;
  }

  _initNigeriaGPSRadar() {
    const radarEl = document.getElementById('gta-leaflet-radar');
    if (!radarEl || !window.L || this.leafletRadarMap) return;

    try {
      const startGps = this._getNigeriaDistrictGPS(this.game.s.loc.district);
      this.leafletRadarMap = window.L.map(radarEl, {
        center: [startGps.lat, startGps.lng],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false
      });

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.leafletRadarMap);

      this.leafletRadarReady = true;
    } catch (err) {
      this.leafletRadarReady = false;
    }
  }

  openNigeriaGPSModal() {
    const modal = document.getElementById('nigeria-gps-modal');
    if (!modal) return;
    modal.hidden = false;

    const chipsEl = document.getElementById('nigeria-gps-street-chips');
    if (chipsEl) {
      chipsEl.innerHTML = DISTRICTS.map((d) => {
        const gps = this._getNigeriaDistrictGPS(d.id);
        const isCur = d.id === this.game.s.loc.district;
        return `
          <button type="button" class="btn-xs btn-gps-jump" data-id="${d.id}" style="${isCur ? 'border-color:#4ade80; color:#4ade80; background:rgba(16,185,129,0.2);' : ''}">
            📍 ${d.short}: ${gps.street.split(' • ')[0]}
          </button>
        `;
      }).join('');

      chipsEl.querySelectorAll('.btn-gps-jump').forEach((btn) => {
        btn.addEventListener('click', () => {
          const distId = btn.dataset.id;
          if (!distId) return;
          this.game.arrive(distId);
          if (this.world3d) this.world3d.flyToDistrict(distId);
          this._renderAll();
          modal.hidden = true;
          const gps = this._getNigeriaDistrictGPS(distId);
          this.showToast(`🛰️ GPS Navigated to ${gps.street}!`);
        });
      });
    }

    const mapContainer = document.getElementById('nigeria-full-gps-map');
    if (mapContainer && window.L) {
      if (!this.fullNigeriaMap) {
        const curGps = this._getNigeriaDistrictGPS(this.game.s.loc.district);
        this.fullNigeriaMap = window.L.map(mapContainer, {
          center: [curGps.lat, curGps.lng],
          zoom: 13
        });
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap Nigeria Streets'
        }).addTo(this.fullNigeriaMap);

        for (const d of DISTRICTS) {
          const gps = this._getNigeriaDistrictGPS(d.id);
          const marker = window.L.marker([gps.lat, gps.lng]).addTo(this.fullNigeriaMap);
          marker.bindPopup(`
            <div style="font-family:Inter,sans-serif; color:#0f172a; min-width:160px;">
              <strong>${d.name}</strong><br/>
              <span style="font-size:11px; color:#047857; font-weight:700;">🛣️ ${gps.street}</span><br/>
              <span style="font-size:11px; color:#475569;">${d.blurb}</span>
            </div>
          `);
          marker.on('click', () => {
            this.game.arrive(d.id);
            if (this.world3d) this.world3d.flyToDistrict(d.id);
            this._renderAll();
            this.showToast(`🛰️ GPS Street Route: Arrived at ${gps.street}!`);
          });
        }
      } else {
        setTimeout(() => {
          this.fullNigeriaMap.invalidateSize();
          const curGps = this._getNigeriaDistrictGPS(this.game.s.loc.district);
          this.fullNigeriaMap.setView([curGps.lat, curGps.lng], 14);
        }, 80);
      }
    }
  }

  _startRadarLoop() {
    const canvas = document.getElementById('gta-radar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    this._initNigeriaGPSRadar();

    const drawRadar = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const curD = this.game.district || DISTRICT_BY_ID.cbd;
      const pCoords = this.world3d
        ? this.world3d.getPlayer2DCoords()
        : { x: curD.x, y: curD.y };

      // Pan live Leaflet Nigeria Street GPS map as player walks/drives in 3D
      const baseGps = this._getNigeriaDistrictGPS(curD.id);
      const dLon = (pCoords.x - curD.x) * 0.00055;
      const dLat = -(pCoords.y - curD.y) * 0.00055;
      const liveLat = baseGps.lat + dLat;
      const liveLng = baseGps.lng + dLon;

      if (this.leafletRadarReady && this.leafletRadarMap) {
        if (!this._lastRadarPan || Math.hypot(liveLat - this._lastRadarPan.lat, liveLng - this._lastRadarPan.lng) > 0.00003) {
          this.leafletRadarMap.setView([liveLat, liveLng], 16, { animate: false });
          this._lastRadarPan = { lat: liveLat, lng: liveLng };
        }
      } else {
        // Fallback street background if offline
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 0, w, h);
      }

      const scale = 2.4;
      const toRadarX = (x) => w / 2 + (x - pCoords.x) * scale;
      const toRadarY = (y) => h / 2 + (y - pCoords.y) * scale;

      // Subtle GTA route lines overlay
      ctx.strokeStyle = 'rgba(124, 58, 237, 0.55)';
      ctx.lineWidth = 3;
      for (const e of EDGES) {
        const a = DISTRICT_BY_ID[e.a];
        const b = DISTRICT_BY_ID[e.b];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(toRadarX(a.x), toRadarY(a.y));
        ctx.lineTo(toRadarX(b.x), toRadarY(b.y));
        ctx.stroke();
      }

      for (const d of DISTRICTS) {
        const rx = toRadarX(d.x);
        const ry = toRadarY(d.y);
        if (rx < -10 || rx > w + 10 || ry < -10 || ry > h + 10) continue;

        ctx.fillStyle = d.id === this.game.s.loc.district
          ? '#2563eb'
          : (d.zone === 1 ? '#d97706' : '#059669');
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rx, ry, d.id === this.game.s.loc.district ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      for (const p of this.onlinePlayers) {
        if (p.id === this.playerId) continue;
        const d = DISTRICT_BY_ID[p.district] || DISTRICT_BY_ID.wuse2;
        const px = typeof p.x === 'number' ? p.x : d.x;
        const py = typeof p.y === 'number' ? p.y : d.y;
        const rx = toRadarX(px);
        const ry = toRadarY(py);
        if (rx < 0 || rx > w || ry < 0 || ry > h) continue;

        ctx.fillStyle = p.isBot ? '#f59e0b' : '#ec4899';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rx, ry, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Center GTA Player Arrow on the Nigerian street map
      ctx.save();
      ctx.translate(w / 2, h / 2);
      const heading = this.world3d ? -this.world3d.playerHeading : 0;
      ctx.rotate(heading);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6.5, 6.5);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6.5, 6.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      requestAnimationFrame(drawRadar);
    };

    requestAnimationFrame(drawRadar);
  }

  // --------------------------------------------------------------------------
  // 5. RENDER GTA HUD, REALISTIC NAIRA WALLET & TABS
  // --------------------------------------------------------------------------
  _renderAll() {
    this._renderHUD();
    this._renderClockAndWeather();
    this._renderDistrictBanner();
    this._renderDailyHustleBox();
    this._renderActionsTab();
    this._renderCommuteTab();
    this._renderShopAndTourismTab();
    this._renderCareerTab();
    this._renderHousingTab();
    this._renderSimsTab();
    this._renderNetworkTab();
    this._renderLifestyleTab();
    this._renderCourtTab();
    this._renderFeedTab();
  }

  _renderHUD() {
    this._ensureExtendedPlayerState();
    const s = this.game.s;
    const trackObj = TRACKS[s.career.track] || TRACKS.civil;
    const lvlObj = levelInfo(s);

    const avatarSlot = document.getElementById('hud-avatar-slot');
    if (avatarSlot) {
      avatarSlot.innerHTML = renderCharacterAvatarSVG(AVATAR_MAP[s.career.track] || 'contractor', 42);
    }
    document.getElementById('hud-player-name').textContent = s.meta.name;
    document.getElementById('hud-career-badge').textContent = `${lvlObj.title} • ${trackObj.name}`;

    const gInfo = GENDERS[s.meta.gender] || GENDERS.male;
    const ageVal = s.meta.age || 26;
    const stageTag = ageVal < 18 ? 'Teen/Child' : ageVal <= 25 ? 'Gen-Z' : ageVal >= 45 ? 'Elder VIP' : 'Adult';
    const ageGenderEl = document.getElementById('hud-age-gender-pill');
    if (ageGenderEl) {
      ageGenderEl.textContent = `${gInfo.icon} ${ageVal}y • ${stageTag}`;
    }

    const lsObj = NIGERIAN_LIFESTYLES[s.meta.lifestyle];
    const steezeVal = Math.round(s.social?.steeze ?? 80);
    const compVal = Math.round(s.social?.composure ?? 82);
    const calEl = document.getElementById('hud-caliber-pill');
    if (calEl) {
      calEl.textContent = `${lsObj ? lsObj.name.split(' (')[0] : '✨ Citizen'} • Steeze ${steezeVal}% • Composure ${compVal}%`;
    }

    // Realistic Naira Wallet & Animated Cash Delta
    const currentFunds = Math.round(this.game.funds());
    const fundsEl = document.getElementById('hud-funds-val');
    if (fundsEl) fundsEl.textContent = formatNairaFull(currentFunds);

    if (this.lastFunds !== null && currentFunds !== this.lastFunds) {
      const diff = currentFunds - this.lastFunds;
      const deltaEl = document.getElementById('hud-funds-delta');
      if (deltaEl) {
        deltaEl.textContent = diff > 0 ? `+${formatNairaFull(diff)}` : formatNairaFull(diff);
        deltaEl.className = `cash-delta-popup ${diff > 0 ? 'show-pos' : 'show-neg'}`;
        clearTimeout(this._deltaTimer);
        this._deltaTimer = setTimeout(() => {
          deltaEl.className = 'cash-delta-popup';
        }, 2400);
      }
      this.lastFunds = currentFunds;
    }

    // Physical Naira Banknote Breakdown
    const bd = breakdownNairaNotes(currentFunds);
    const topDenom = currentFunds >= 1000 ? 1000 : currentFunds >= 500 ? 500 : 200;
    const miniNoteSlot = document.getElementById('hud-naira-note-art');
    if (miniNoteSlot) {
      miniNoteSlot.innerHTML = renderNairaNoteSVG(topDenom, { width: 96, height: 45 });
    }

    const bundlePill = document.getElementById('hud-naira-bundles');
    if (bundlePill) {
      bundlePill.textContent = `Cash ${formatNairaFull(s.cash)} • Bank ${formatNairaFull(s.bank)}`;
    }

    const breakdownText = document.getElementById('nvs-breakdown-text');
    if (breakdownText) {
      breakdownText.textContent =
        `${bd.bundles100k}×₦100k Straps • ${bd.n1000.toLocaleString()}×₦1,000 Notes (Cash: ${formatNairaFull(s.cash)})`;
    }
    const fanEl = document.getElementById('nvs-notes-fan');
    if (fanEl && !fanEl.hasChildNodes()) {
      const notesToShow = [1000, 500, 200];
      fanEl.innerHTML = notesToShow
        .map((d) => `<div class="fan-note-item">${renderNairaNoteSVG(d, { width: 78, height: 36 })}</div>`)
        .join('');
    }

    // 5-Star Wanted Heat Level
    const heat = Math.round(s.heat);
    document.getElementById('hud-heat-val').textContent = `${heat}%`;
    const activeStars = heat >= 85 ? 5 : heat >= 65 ? 4 : heat >= 45 ? 3 : heat >= 22 ? 2 : heat >= 8 ? 1 : 0;
    const starsBox = document.getElementById('hud-wanted-stars');
    if (starsBox) {
      starsBox.classList.toggle('flashing', activeStars >= 3);
      const starSpans = starsBox.querySelectorAll('.star');
      starSpans.forEach((st, idx) => {
        st.classList.toggle('active', idx < activeStars);
      });
    }

    // Bottom-Left GTA Radar 3-Segment Bars (Sanity, Energy, Clout)
    document.getElementById('hud-sanity-bar').style.width = `${Math.min(100, Math.max(0, s.sanity))}%`;
    document.getElementById('hud-energy-bar').style.width = `${Math.min(100, Math.max(0, s.energy))}%`;
    document.getElementById('hud-clout-bar').style.width = `${Math.min(100, Math.max(0, s.clout))}%`;

    document.getElementById('hud-sanity-val').textContent = Math.round(s.sanity);
    document.getElementById('hud-energy-val').textContent = Math.round(s.energy);
    document.getElementById('hud-clout-val').textContent = Math.round(s.clout);
    document.getElementById('hud-network-val').textContent = s.contacts.length;

    // Synchronize 3D Sims Plumbob Emerald Diamond above player avatar with 8 motives
    if (this.world3d && s.sims?.motives) {
      const motives = Object.values(s.sims.motives);
      const avg = motives.reduce((a, b) => a + b, 0) / Math.max(1, motives.length);
      const minMotive = Math.min(...motives);
      const score = minMotive < 30 ? minMotive : avg;
      this.world3d.updatePlumbobMotive(score);
    }
  }

  _renderClockAndWeather() {
    const s = this.game.s;
    const clockEl = document.getElementById('hud-clock');
    const classicClockEl = document.getElementById('gta-classic-clock');
    const weatherEl = document.getElementById('hud-weather');
    if (clockEl) {
      clockEl.textContent = `Day ${this.game.day} • ${Clock.dateStr(s.t)} • ${Clock.clockStr(s.t)}`;
    }
    if (classicClockEl) {
      classicClockEl.textContent = Clock.clockStr(s.t);
    }
    if (weatherEl) {
      const w = s.market.today.weather;
      const labels = {
        sunny: '☀️ Sunny FCT Sky',
        dry: '🌫️ Harmattan Haze',
        rain: '🌧️ Abuja Rain',
        storm: '⛈️ Tropical Flash Storm'
      };
      weatherEl.textContent = `${labels[w] || '☀️ Clear'} • Fuel ₦${s.market.fuel}/L`;
    }
  }

  _renderDistrictBanner() {
    const loc = this.game.s.loc.district;
    const spot = this.game.s.loc.spot;
    const d = DISTRICT_BY_ID[loc] || DISTRICT_BY_ID.cbd;

    const artEl = document.getElementById('district-art-banner');
    if (artEl) {
      artEl.innerHTML = renderDistrictIllustrationSVG(loc);
    }

    const sectorEl = document.getElementById('banner-sector-tag');
    if (sectorEl) {
      sectorEl.textContent = `Zone ${d.zone} • ${d.zone === 1 ? 'City Centre' : 'Satellite Belt'}`;
      sectorEl.className = `sector-pill ${d.zone === 1 ? 'zone-1' : 'zone-2'}`;
    }

    document.getElementById('banner-district-name').textContent = d.name;
    document.getElementById('banner-district-vibe').textContent = d.blurb;

    const gpsLabel = document.getElementById('radar-gps-label');
    if (gpsLabel) {
      const gpsInfo = this._getNigeriaDistrictGPS(loc);
      const streetShort = gpsInfo.street.split(' • ')[0];
      gpsLabel.textContent = spot
        ? `GPS • ${(LANDMARK_INDEX[spot]?.landmark?.name || streetShort).toUpperCase()}`
        : `GPS • ${streetShort}`;
    }

    const lmContainer = document.getElementById('banner-landmarks');
    if (lmContainer) {
      const streetChip = `
        <button type="button" class="landmark-chip btn-spot-chip ${!spot ? 'active-spot' : ''}" data-spot="">
          🛣️ Street Level
        </button>
      `;
      const chips = (d.landmarks || []).map((lm) => `
        <button type="button" class="landmark-chip btn-spot-chip ${spot === lm.id ? 'active-spot' : ''}" data-spot="${lm.id}">
          ${lm.icon} ${lm.name} ${lm.gate ? `🔒${lm.gate.clout}` : ''}
        </button>
      `);
      lmContainer.innerHTML = streetChip + chips.join('');

      lmContainer.querySelectorAll('.btn-spot-chip').forEach((btn) => {
        btn.style.cursor = 'pointer';
        if (btn.classList.contains('active-spot')) {
          btn.style.borderColor = '#facc15';
          btn.style.color = '#fde047';
        }
        btn.addEventListener('click', async () => {
          const targetSpot = btn.dataset.spot || null;
          await this.game.goToSpot(targetSpot);
          this._renderDistrictBanner();
          this._renderActionsTab();
        });
      });
    }
  }

  // --------------------------------------------------------------------------
  // TAB 1: DISTRICT HUSTLE & LANDMARK ACTIONS
  // --------------------------------------------------------------------------
  _renderActionsTab() {
    const list = document.getElementById('actions-list');
    if (!list) return;
    const d = this.game.district;
    const spotId = this.game.s.loc.spot;
    const spotObj = spotId ? LANDMARK_INDEX[spotId]?.landmark : null;

    document.getElementById('actions-pane-title').textContent = spotObj
      ? `${spotObj.icon} ${spotObj.name} (${d.short})`
      : `Moves in ${d.name} (Street Level)`;

    // Spot quick-switcher bar inside Actions tab so players can enter landmarks easily
    const spotButtonsHtml = `
      <div class="game-card" style="border-color: rgba(56, 189, 248, 0.4);">
        <div class="card-top">
          <span class="card-title">📍 Enter Landmark / Spot in ${d.short}</span>
          <span class="card-badge">${spotObj ? spotObj.name : 'On Street'}</span>
        </div>
        <div class="meta-pills" style="gap:6px; margin-top:4px;">
          <button class="btn-secondary btn-enter-spot" data-spot="" style="${!spotId ? 'border-color:#facc15;color:#fde047;' : ''}">
            🛣️ Street
          </button>
          ${(d.landmarks || []).map((lm) => `
            <button class="btn-secondary btn-enter-spot" data-spot="${lm.id}" style="${spotId === lm.id ? 'border-color:#facc15;color:#fde047;' : ''}">
              ${lm.icon} ${lm.name} ${lm.gate ? `(Gate ${lm.gate.clout})` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const actions = listActions(this.game);
    const cardsHtml = actions.map((act, idx) => {
      const pills = [];
      if (act.cost.min) pills.push(`<span class="meta-pill">⏱️ ${act.cost.min}m</span>`);
      if (act.cost.energy) pills.push(`<span class="meta-pill neg">⚡ -${act.cost.energy}</span>`);
      if (act.cost.ngn) pills.push(`<span class="meta-pill neg">💸 ${formatNairaFull(act.cost.ngn)}</span>`);

      return `
        <div class="game-card">
          <div class="card-top">
            <span class="card-title">${act.icon} ${act.name}</span>
            <span class="card-badge">${act.group.toUpperCase()}</span>
          </div>
          <p class="card-desc">${act.desc}</p>
          <div class="card-meta-row">
            <div class="meta-pills">${pills.join('')}</div>
            <button class="btn-primary btn-exec-action" data-idx="${idx}" ${act.reason ? 'disabled' : ''}>
              ${act.reason ? act.reason : 'Execute Move'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    list.innerHTML = spotButtonsHtml + cardsHtml;

    list.querySelectorAll('.btn-enter-spot').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sp = btn.dataset.spot || null;
        await this.game.goToSpot(sp);
        this._renderDistrictBanner();
        this._renderActionsTab();
      });
    });

    list.querySelectorAll('.btn-exec-action').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = actions[Number(btn.dataset.idx)];
        if (!act) return;
        await this.game.runAction(act.id, act.params);
        this._renderAll();
      });
    });
  }

  // --------------------------------------------------------------------------
  // TAB 2: COMMUTE & HIGHWAY CORRIDORS (3D GTA SKY-CAM)
  // --------------------------------------------------------------------------
  _renderCommuteTab() {
    const list = document.getElementById('commute-list');
    if (!list) return;

    const cur = this.game.s.loc.district;
    const otherDistricts = DISTRICTS.filter((d) => d.id !== cur);
    if (!otherDistricts.some((d) => d.id === this.selectedCommuteDest)) {
      this.selectedCommuteDest = otherDistricts[0]?.id || 'cbd';
    }

    const destSelectorHtml = `
      <div class="game-card">
        <div class="card-top">
          <span class="card-title">🧭 Select Destination District</span>
          <span class="card-badge">${Clock.isPeak(this.game.s.t) ? '🚦 RUSH HOUR' : '🛣️ CLEAR FLOW'}</span>
        </div>
        <div class="meta-pills" style="gap:6px; margin-top:4px;">
          ${otherDistricts.map((d) => `
            <button class="btn-secondary btn-pick-dest" data-dest="${d.id}" style="${d.id === this.selectedCommuteDest ? 'border-color:#38bdf8;color:#38bdf8;' : ''}">
              Z${d.zone} • ${d.short}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const routes = planTrip(this.game, this.selectedCommuteDest);
    const modes = availableModes(this.game);
    const destObj = DISTRICT_BY_ID[this.selectedCommuteDest];

    const routeCardsHtml = routes.map((r, rIdx) => `
      <div class="game-card">
        <div class="card-top">
          <span class="card-title">To ${destObj?.name}: ${r.label}</span>
          <span class="card-badge">${r.tags.join(' • ')}</span>
        </div>
        <p class="card-desc">Corridors: ${r.corridors.join(' → ')} ${r.risks.length ? `• ⚠️ ${r.risks.join(', ')}` : ''}</p>
        <div class="card-meta-row" style="gap:6px;">
          ${modes.map((m) => {
            const q = r.quotes[m.id];
            return `
              <button class="btn-primary btn-run-trip" data-ridx="${rIdx}" data-mode="${m.id}" style="flex:1;">
                ${m.icon} ${m.name} • ${q.minutes}m • ${formatNairaFull(q.cost)}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

    list.innerHTML = destSelectorHtml + routeCardsHtml;

    list.querySelectorAll('.btn-pick-dest').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCommuteDest = btn.dataset.dest;
        this._renderCommuteTab();
      });
    });

    list.querySelectorAll('.btn-run-trip').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const route = routes[Number(btn.dataset.ridx)];
        const modeId = btn.dataset.mode;
        if (!route) return;
        await this.game.exclusive(() => executeTrip(this.game, route, modeId));
        this._renderAll();
      });
    });
  }

  // --------------------------------------------------------------------------
  // TAB 3: CAREER PATHWAYS & PROCUREMENT TENDERS
  // --------------------------------------------------------------------------
  _renderCareerTab() {
    const summaryEl = document.getElementById('career-summary');
    const contractsEl = document.getElementById('contracts-list');
    const tracksEl = document.getElementById('tracks-list');
    if (!summaryEl || !contractsEl || !tracksEl) return;

    const s = this.game.s;
    const trackObj = TRACKS[s.career.track];
    const lvlObj = levelInfo(s);
    const reqs = promotionReqs(this.game);

    summaryEl.innerHTML = `
      <div class="card-top">
        <div>
          <span class="card-badge">${trackObj.icon} ${trackObj.name}</span>
          <h3 class="card-title" style="margin-top:4px;">${lvlObj.title} (Level ${s.career.level}/4)</h3>
        </div>
        <button id="btn-promote" class="btn-primary" ${reqs && reqs.ok ? '' : 'disabled'}>
          ${reqs ? `Promote → ${reqs.next}` : 'Max Rank Achieved'}
        </button>
      </div>
      <p class="card-desc">${trackObj.perks}</p>
      ${reqs ? `
        <div class="meta-pills">
          ${reqs.rows.map((r) => `<span class="meta-pill ${r.ok ? 'pos' : 'neg'}">${r.ok ? '✓' : '○'} ${r.label} (${r.have}/${r.need})</span>`).join('')}
        </div>
      ` : ''}
    `;

    summaryEl.querySelector('#btn-promote')?.addEventListener('click', () => {
      const res = promote(this.game);
      if (res.ok && this.world3d) this.world3d.spawnNairaRain(36);
      this.showToast(res.ok ? `🎉 Promoted to ${res.title}!` : `⚠️ ${res.reason}`);
      this._renderAll();
    });

    // Active Work / Contracts / Receivables / Gigs
    const w = s.work;
    const activeItems = [];

    for (const c of w.contracts) {
      activeItems.push(`
        <div class="game-card" style="border-color:#eab308;">
          <div class="card-top">
            <span class="card-title">🚚 Active Contract: ${c.title} (${c.agency})</span>
            <span class="card-badge">${c.deliveriesLeft} Runs Left</span>
          </div>
          <p class="card-desc">Deliver to <strong>${DISTRICT_BY_ID[c.site]?.name || c.site}</strong> by Day ${c.dueDay} • Payout: <strong style="color:#4ade80">${formatNairaFull(c.payout)}</strong></p>
        </div>
      `);
    }

    for (const r of w.receivables) {
      activeItems.push(`
        <div class="game-card" style="border-color:#10b981;">
          <div class="card-top">
            <span class="card-title">🧾 Pending Invoice: ${r.title} (${r.agency})</span>
            <span class="card-badge">Due Day ${r.dueDay}</span>
          </div>
          <p class="card-desc">Expected Settlement: <strong style="color:#4ade80">${formatNairaFull(r.amount)}</strong> (+ ${formatNairaFull(r.collateral)} collateral release)</p>
        </div>
      `);
    }

    for (const g of w.gigs) {
      activeItems.push(`
        <div class="game-card" style="border-color:#38bdf8;">
          <div class="card-top">
            <span class="card-title">💻 Remote Gig: ${g.title} (${g.client})</span>
            <span class="card-badge">${Math.round(g.progress)}% Complete</span>
          </div>
          <p class="card-desc">Contract Value: <strong>$${g.usd}</strong> (₦${s.market.fx}/$ FX Rate)</p>
        </div>
      `);
    }

    if (!activeItems.length) {
      activeItems.push(`
        <div class="game-card">
          <p class="card-desc">Tip: Visit <strong>BPP Procurement Desk (CBD)</strong> to bid on tenders, <strong>Secretariat</strong> for civil service shifts, <strong>Tech Hubs (Jabi/Utako)</strong> for FX gigs, or <strong>Markets</strong> for trading stock.</p>
        </div>
      `);
    }
    contractsEl.innerHTML = activeItems.join('');

    // Switch Career Track
    tracksEl.innerHTML = Object.values(TRACKS).map((tr) => {
      const why = switchReason(this.game, tr.id);
      return `
        <div class="game-card">
          <div class="card-top">
            <span class="card-title">${tr.icon} ${tr.name}</span>
            <span class="card-badge">${tr.id === s.career.track ? 'ACTIVE TRACK' : 'SWITCHABLE'}</span>
          </div>
          <p class="card-desc">${tr.tagline}</p>
          <div class="card-meta-row">
            <span class="meta-pill">Entry: ${tr.levels[0].title}</span>
            <button class="btn-secondary btn-switch-track" data-track="${tr.id}" ${why ? 'disabled' : ''}>
              ${why || 'Switch Track'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    tracksEl.querySelectorAll('.btn-switch-track').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = switchTrack(this.game, btn.dataset.track);
        this.showToast(res.ok ? `🔄 Switched to ${TRACKS[btn.dataset.track].name}!` : `⚠️ ${res.reason}`);
        this._renderAll();
        this._sendHeartbeat();
      });
    });
  }

  // --------------------------------------------------------------------------
  // TAB 4: HOUSING & 2-YEAR RENT CLOCK
  // --------------------------------------------------------------------------
  _renderHousingTab() {
    const statusBox = document.getElementById('housing-status-box');
    const list = document.getElementById('housing-list');
    if (!statusBox || !list) return;

    this._renderHouseBuilderSection();

    const h = this.game.s.home;
    const homeDist = DISTRICT_BY_ID[h.district] || DISTRICT_BY_ID.nyanya;
    const left = daysLeft(this.game);
    const quote1 = renewalQuote(this.game, 1);

    statusBox.innerHTML = `
      <div class="card-top">
        <div>
          <span class="card-badge">CURRENT RESIDENCE • ZONE ${homeDist.zone}</span>
          <h3 class="card-title" style="margin-top:4px;">${homeDist.name} Apartment</h3>
        </div>
        <button id="btn-renew-rent" class="btn-primary">
          Renew +1 Year (${formatNairaFull(quote1.total)})
        </button>
      </div>
      <div class="meta-pills">
        <span class="meta-pill ${left <= 30 ? 'neg' : 'pos'}">⏳ Rent Paid For: <strong>${left} Days</strong></span>
        <span class="meta-pill">⚡ Power Reliability: ${Math.round(homeDist.power * 100)}%</span>
        <span class="meta-pill pos">🏛️ Prestige Tier: ${homeDist.prestige}</span>
      </div>
    `;

    statusBox.querySelector('#btn-renew-rent')?.addEventListener('click', () => {
      const res = renew(this.game, 1);
      this.showToast(res.ok ? '🔑 Rent renewed for 1 year!' : `⚠️ ${res.reason}`);
      this._renderAll();
    });

    const residentialDistricts = DISTRICTS.filter((d) => d.housing);
    list.innerHTML = residentialDistricts.map((d) => {
      const isCurrent = d.id === h.district;
      const q = moveQuote(this.game, d.id, 1);
      return `
        <div class="game-card">
          <div class="card-top">
            <span class="card-title">${d.name}</span>
            <span class="card-badge">Zone ${d.zone} • Prestige ${d.prestige}</span>
          </div>
          <p class="card-desc">${d.blurb}</p>
          <div class="card-meta-row">
            <div class="meta-pills">
              <span class="meta-pill neg">Total Move-In (1yr + 20% Agency): ${formatNairaFull(q.total)}</span>
              <span class="meta-pill">⚡ Light: ${Math.round(d.power * 100)}%</span>
            </div>
            <button class="btn-secondary btn-move-house" data-dist="${d.id}" ${isCurrent ? 'disabled' : ''}>
              ${isCurrent ? 'Current Home' : 'Pay & Relocate'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-move-house').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = await this.game.exclusive(() => moveTo(this.game, btn.dataset.dist, 1));
        if (res && !res.ok) this.showToast(`⚠️ ${res.reason}`);
        this._renderAll();
      });
    });
  }

  _renderHouseBuilderSection() {
    const container = document.getElementById('house-builder-section');
    if (!container) return;
    this._ensureExtendedPlayerState();
    const plots = this.game.s.social.plots || {};

    const ABUJA_PLOTS = [
      { id: 'lugbe', name: 'Lugbe Airport Corridor (500sqm)', zone: 2, price: 120000, desc: 'High-density residential commuter belt. Fast rental yield.' },
      { id: 'kubwa', name: 'Kubwa Train Link District (600sqm)', zone: 2, price: 160000, desc: 'Starter homes and steady young-family tenant market.' },
      { id: 'dawaki', name: 'Dawaki Hillside Heights (650sqm)', zone: 2, price: 220000, desc: 'Scenic rocky quarry views and breezy residential plots.' },
      { id: 'jabi', name: 'Jabi Lakeview Commercial (800sqm)', zone: 1, price: 480000, desc: 'Prime Zone 1 waterfront corridor for tech founders, yacht club access, and shortlets.' },
      { id: 'guzape', name: 'Guzape Diplomatic Ridge (900sqm)', zone: 1, price: 850000, desc: 'Elite cliffside topography overlooking Asokoro. High political status.' },
      { id: 'maitama', name: 'Maitama Prime Residential Estate (1,200sqm)', zone: 1, price: 1500000, desc: 'Supreme FCT prestige. Diplomats, ministers, 24/7 power, apex status.' },
      { id: 'asokoro', name: 'Aso Drive Billionaire Boulevard (1,500sqm)', zone: 1, price: 1950000, desc: 'Presidential Villa corridor in Asokoro. Fortified compounds, governors, and zero NEPA blackouts.' },
      { id: 'lagos_island', name: 'Banana Island & Lekki Waterfront (1,400sqm)', zone: 1, price: 2200000, desc: 'Eko Atlantic & Ikoyi Link Bridge luxury waterfront. Highest shortlet & annual rent yields in Nigeria.' }
    ];

    const STAGE_NAMES = [
      '📜 Stage 0: Bare Land (FCDA Survey)',
      '🧱 Stage 1: Foundation & German Floor',
      '🏗️ Stage 2: Hollow Blockwork & Lintel Up',
      '🏠 Stage 3: Gerard Stone-Coated Roof & Parapet',
      '⚡ Stage 4: Solar Inverter & Industrial Borehole',
      '🏰 Stage 5: Completed Luxury Duplex / Mansion'
    ];

    const UPGRADE_COSTS = [80000, 140000, 200000, 180000, 240000];

    const RENT_PAYOUTS = {
      lugbe: 250000,
      kubwa: 320000,
      dawaki: 450000,
      jabi: 950000,
      guzape: 1500000,
      maitama: 2800000,
      asokoro: 3600000,
      lagos_island: 4200000
    };

    container.innerHTML = ABUJA_PLOTS.map((plotDef) => {
      const owned = plots[plotDef.id];
      const stage = owned ? (owned.stage || 0) : -1;
      const stageText = stage >= 0 ? STAGE_NAMES[stage] : 'Not Owned';
      const hasCofO = owned && owned.cofo;

      if (!owned) {
        return `
          <div class="game-card" style="border-left: 3px solid #64748b;">
            <div class="card-top">
              <span class="card-title">📜 ${plotDef.name}</span>
              <span class="card-badge">Zone ${plotDef.zone} • Land Price: ${formatNairaFull(plotDef.price)}</span>
            </div>
            <p class="card-desc">${plotDef.desc}</p>
            <div class="card-meta-row">
              <div class="meta-pills">
                <span class="meta-pill">📍 ${DISTRICT_BY_ID[plotDef.id]?.name}</span>
                <span class="meta-pill">🧱 5-Stage 3D Build</span>
              </div>
              <button class="btn-primary btn-buy-plot" data-id="${plotDef.id}" data-price="${plotDef.price}">
                🛒 Purchase Plot (${formatNairaFull(plotDef.price)})
              </button>
            </div>
          </div>
        `;
      }

      const nextCost = stage < 5 ? UPGRADE_COSTS[stage] : 0;
      const isMansion = stage >= 5;
      const isLivingHere = this.game.s.home.district === plotDef.id;
      const daysSinceRent = this.game.day - (owned.lastRentCollection || 0);
      const canCollectRent = isMansion && daysSinceRent >= 30;
      const rentAmount = RENT_PAYOUTS[plotDef.id] || 350000;

      const SHORTLET_RATES = {
        kubwa: 65000,
        lugbe: 80000,
        dawaki: 110000,
        jabi: 165000,
        guzape: 260000,
        wuse2: 240000,
        maitama: 380000,
        asokoro: 460000,
        lagos_island: 520000
      };
      const daysSinceShortlet = this.game.day - (owned.lastShortletDay || 0);
      const canHostShortlet = isMansion && daysSinceShortlet >= 3;
      const baseShortlet = SHORTLET_RATES[plotDef.id] || 95000;
      const shortletPayout = this.game.s.social.solarInstalled ? Math.round(baseShortlet * 1.25) : baseShortlet;

      return `
        <div class="game-card" style="border-left: 3px solid ${isMansion ? '#facc15' : '#10b981'}; background: ${isMansion ? 'rgba(234,179,8,0.06)' : 'rgba(16,185,129,0.04)'};">
          <div class="card-top">
            <div>
              <span class="card-title">${isMansion ? '🏰 ' : '🏗️ '}${plotDef.name}</span>
              <div style="font-size:11px; color:#4ade80; font-weight:600; margin-top:2px;">${stageText}</div>
            </div>
            <div style="text-align:right;">
              <span class="card-badge" style="background:${hasCofO ? '#065f46' : '#78350f'}; color:#fff;">
                ${hasCofO ? '✅ AGIS C-of-O Certified' : '⚠️ No C-of-O (Risk of FCDA Red-X)'}
              </span>
              ${isLivingHere ? '<span class="card-badge" style="background:#0284c7; color:#fff; margin-left:4px;">👑 Primary Residence</span>' : ''}
            </div>
          </div>
          <p class="card-desc">
            ${isMansion 
              ? 'Mansion fully completed! Rendered with golden halo & Gerard roof in 3D Abuja. Live rent-free, host VIP Shortlet/Airbnb guests every 3 days, or collect massive 2-year upfront rent.' 
              : 'Active building site rendered in 3D. Advance the construction stages or hire players in the Tasks tab to haul Mpape granite to advance automatically!'}
          </p>
          <div class="card-meta-row" style="flex-wrap:wrap; gap:8px;">
            <div class="meta-pills">
              <span class="meta-pill pos">Progress: ${stage * 20}%</span>
              ${!hasCofO ? `<button class="btn-xs btn-apply-cofo" data-id="${plotDef.id}" style="border-color:#f59e0b; color:#fbbf24;">🏛️ Get AGIS C-of-O (₦45,000)</button>` : ''}
              ${stage < 5 ? `<button class="btn-xs btn-hire-granite" data-id="${plotDef.id}" style="border-color:#38bdf8; color:#7dd3fc;">📋 Hire Player to Haul Granite</button>` : ''}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${stage < 5 ? `
                <button class="btn-primary btn-upgrade-plot" data-id="${plotDef.id}" data-cost="${nextCost}">
                  🔨 Advance Stage: ${STAGE_NAMES[stage + 1]?.split(':')[1] || 'Next'} (${formatNairaFull(nextCost)})
                </button>
              ` : `
                <button class="btn-secondary btn-movein-plot" data-id="${plotDef.id}" ${isLivingHere ? 'disabled' : ''}>
                  ${isLivingHere ? '👑 Living Rent-Free' : '🏰 Move In (Rent Free)'}
                </button>
                <button class="btn-primary btn-host-shortlet" data-id="${plotDef.id}" data-payout="${shortletPayout}" ${canHostShortlet ? '' : 'disabled'} style="background:linear-gradient(135deg,#0284c7,#0369a1);">
                  🏨 ${canHostShortlet ? `Host Shortlet / Airbnb (+${formatNairaFull(shortletPayout)})` : `Shortlet Checkout in ${Math.max(1, 3 - daysSinceShortlet)}d`}
                </button>
                <button class="btn-primary btn-collect-tenant-rent" data-id="${plotDef.id}" ${canCollectRent ? '' : 'disabled'}>
                  💰 ${canCollectRent ? `Collect 2-Yr Rent (+${formatNairaFull(rentAmount)})` : `2-Yr Rent in ${Math.max(1, 30 - daysSinceRent)}d`}
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind plot purchase
    container.querySelectorAll('.btn-buy-plot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const price = Number(btn.dataset.price);
        if (!this.game.canAfford(price)) {
          this.showToast('⚠️ Insufficient Naira balance to buy this FCT plot!');
          return;
        }
        this.game.pay(price);
        this.game.stat('clout', 5);
        plots[id] = {
          district: id,
          stage: 0,
          name: DISTRICT_BY_ID[id]?.name || id,
          cofo: false,
          boughtDay: this.game.day,
          lastRentCollection: 0,
          lastShortletDay: 0
        };
        this.game.s.social.plots = plots;
        this.game.log(`Purchased prime land plot in ${DISTRICT_BY_ID[id]?.name || id} for ${formatNairaFull(price)}!`, 'good', '📜');
        if (this.world3d) this.world3d.syncPlayerHouses(Object.values(plots));
        this.showToast(`🎉 Plot secured in ${DISTRICT_BY_ID[id]?.name || id}! Start construction now.`);
        this._renderAll();
      });
    });

    // Bind plot upgrade
    container.querySelectorAll('.btn-upgrade-plot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const cost = Number(btn.dataset.cost);
        const plot = plots[id];
        if (!plot) return;
        if (!this.game.canAfford(cost)) {
          this.showToast('⚠️ Insufficient Naira balance for this construction stage!');
          return;
        }
        this.game.pay(cost);
        plot.stage = Math.min(5, (plot.stage || 0) + 1);
        this.game.stat('clout', 4);
        this.game.log(`Completed construction stage on ${plot.name} site: ${STAGE_NAMES[plot.stage]}!`, 'good', '🔨');
        if (this.world3d) {
          this.world3d.syncPlayerHouses(Object.values(plots));
          if (plot.stage >= 5) this.world3d.spawnNairaRain(35);
        }
        if (plot.stage >= 5) {
          fetch('/api/house-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerName: this.game.s.meta.name,
              district: plot.district,
              mansionName: `${DISTRICT_BY_ID[plot.district]?.name || plot.district} Duplex Mansion`
            })
          }).catch(() => {});
          this.showToast(`🏰 Congratulations! Your ${plot.name} Duplex Mansion is COMPLETED!`);
        } else {
          this.showToast(`🔨 Construction advanced: ${STAGE_NAMES[plot.stage]}!`);
        }
        this._renderAll();
      });
    });

    // Bind AGIS C-of-O
    container.querySelectorAll('.btn-apply-cofo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const plot = plots[id];
        if (!plot || plot.cofo) return;
        const cofoCost = 45000;
        if (!this.game.canAfford(cofoCost)) {
          this.showToast('⚠️ Need ₦45,000 for AGIS official registration fee & surveyor stamping.');
          return;
        }
        this.game.pay(cofoCost);
        plot.cofo = true;
        this.game.stat('clout', 6);
        this.game.log(`AGIS Certificate of Occupancy (C-of-O) certified for ${plot.name}! Safe from FCDA Red-X demolition.`, 'good', '🏛️');
        this.showToast('🏛️ AGIS C-of-O Approved & Sealed! No FCDA demolition risk.');
        this._renderAll();
      });
    });

    // Hire player shortcut to haul granite
    container.querySelectorAll('.btn-hire-granite').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.switchTab('network');
        const sel = document.getElementById('task-type-select');
        if (sel) sel.value = 'haul_granite';
        const note = document.getElementById('task-note-input');
        if (note) note.value = `Deliver 30T Mpape granite to my ${DISTRICT_BY_ID[btn.dataset.id]?.name} site`;
        const form = document.getElementById('assign-task-form');
        if (form) form.scrollIntoView({ behavior: 'smooth' });
        this.showToast('📋 Ready to post Granite Haul task! Review reward and dispatch.');
      });
    });

    // Move in as landlord
    container.querySelectorAll('.btn-movein-plot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const plot = plots[id];
        if (!plot || plot.stage < 5) return;
        this.game.s.home.district = id;
        this.game.s.home.paidThrough = this.game.s.t + 3650 * 24 * 60; // 10 years free
        this.game.log(`Moved into your private ${DISTRICT_BY_ID[id]?.name} Duplex Mansion as Landlord! Free of rent.`, 'good', '👑');
        this.showToast(`👑 Welcome home! Living rent-free in ${DISTRICT_BY_ID[id]?.name}!`);
        this._renderAll();
      });
    });

    // Host Shortlet / Airbnb Guests (every 3 days)
    container.querySelectorAll('.btn-host-shortlet').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const payout = Number(btn.dataset.payout);
        const plot = plots[id];
        if (!plot || plot.stage < 5) return;
        const daysSince = this.game.day - (plot.lastShortletDay || 0);
        if (daysSince < 3) {
          this.showToast(`⏳ Shortlet guests are still checked in. Next booking opens in ${3 - daysSince} day(s).`);
          return;
        }
        plot.lastShortletDay = this.game.day;
        this.game.earn(payout, { bank: true });
        this.game.stat('clout', 2);
        this.game.log(`Hosted weekend diplomats & expats in your ${plot.name} Shortlet Apartment: +${formatNairaFull(payout)}!`, 'good', '🏨');
        if (this.world3d) this.world3d.spawnNairaRain(24);
        this.showToast(`🏨 Shortlet / Airbnb Booking Paid: +${formatNairaFull(payout)}!`);
        this._renderAll();
      });
    });

    // Collect 2-year upfront tenant rent
    container.querySelectorAll('.btn-collect-tenant-rent').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const plot = plots[id];
        if (!plot || plot.stage < 5) return;
        const daysSince = this.game.day - (plot.lastRentCollection || 0);
        if (daysSince < 30) {
          this.showToast(`⏳ Tenants already paid upfront. Next rent rollover in ${30 - daysSince} days.`);
          return;
        }
        const rentAmount = RENT_PAYOUTS[id] || 350000;
        plot.lastRentCollection = this.game.day;
        this.game.earn(rentAmount, { bank: true });
        this.game.stat('clout', 3);
        this.game.log(`Collected 2-year upfront tenant rent on ${plot.name}: +${formatNairaFull(rentAmount)}!`, 'good', '💰');
        if (this.world3d) this.world3d.spawnNairaRain(32);
        this.showToast(`💰 Tenant paid 2-year upfront rent: +${formatNairaFull(rentAmount)}!`);
        this._renderAll();
      });
    });
  }

  // --------------------------------------------------------------------------
  // THE SIMS: DOMESTIC SIMULATION, MOTIVES, SMART OBJECTS & BUILD/BUY
  // --------------------------------------------------------------------------
  _renderSimsTab() {
    const motivesGrid = document.getElementById('sims-motives-grid');
    const utilitiesRow = document.getElementById('sims-utilities-row');
    const smartObjectsList = document.getElementById('sims-smart-objects-list');
    const catalogGrid = document.getElementById('sims-catalog-grid');
    const estateContent = document.getElementById('sims-estate-content');
    if (!motivesGrid) return;

    if (!this.game.s.sims) {
      this.game.s.sims = {
        motives: { hunger: 85, energy: 90, comfort: 80, fun: 75, hygiene: 88, social: 70, bladder: 85, environment: 80 },
        skills: { cooking: 1, mechanical: 1, charisma: 1, logic: 1, xp: { cooking: 0, mechanical: 0, charisma: 0, logic: 0 } },
        utilities: { gridAvailable: true, generatorRunning: false, genFuelLiters: 12, genFuelCapacity: 30, tankWaterLiters: 1200, tankCapacity: 2000, boreholeWorking: true, waterFilterInstalled: false, solarBatteryCharge: 100, solarInstalled: false, atsInstalled: false, dustLevel: 10 },
        estate: { name: `${this.game.district?.name || 'Abuja'} Residents Association`, monthlyDues: 45000, duesPaidUntilDay: 30, visitorAccessCode: 'ABJ-8841', accessPermitted: true, chairmanStanding: 50, curfewHour: 23, dieselPoolHours: 6, activeNotices: [] },
        installedObjects: ['bed_orthopedic', 'gas_cooker', 'toilet_ceramic', 'shower_cubicle', 'turkish_velvet_sofa', 'gen_tiger', 'overhead_tank_2000l']
      };
    }

    const sims = this.game.s.sims;
    const weather = this.game.s.market?.today?.weather || 'sunny';
    const isHarmattan = weather === 'harmattan';
    const harmattanBadge = document.getElementById('sims-harmattan-badge');
    if (harmattanBadge) {
      harmattanBadge.textContent = isHarmattan
        ? `🌫️ Harmattan Dust: ${Math.round(sims.utilities.dustLevel || 10)}% (Wipe sofa!)`
        : `☀️ Weather: ${weather.toUpperCase()}`;
    }

    // 1. Render 8 Motives
    motivesGrid.innerHTML = Object.entries(MOTIVE_CONFIG).map(([key, cfg]) => {
      const val = Math.round(sims.motives[key] ?? 50);
      const barClass = val >= 60 ? 'motive-good' : val >= 30 ? 'motive-mid' : 'motive-low';
      return `
        <div class="sims-motive-card" title="${cfg.lowWarning}">
          <div class="sims-motive-header">
            <span>${cfg.icon} ${cfg.label}</span>
            <span style="color:${val < 30 ? '#ef4444' : '#94a3b8'};">${val}%</span>
          </div>
          <div class="sims-motive-bar-outer">
            <div class="sims-motive-bar-fill ${barClass}" style="width:${val}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // 2. Render Domestic Utilities (Power, Water, Estate)
    const isPowerOut = this.game.isPowerOut(this.game.s.loc.district);
    const hasGen = sims.installedObjects.includes('gen_tiger') || sims.installedObjects.includes('gen_soundproof');
    const isGenOn = sims.utilities.generatorRunning;
    const isSolar = sims.utilities.solarInstalled;
    const tankLiters = Math.round(sims.utilities.tankWaterLiters || 0);

    utilitiesRow.innerHTML = `
      <div class="sims-util-box">
        <span class="sims-util-label">⚡ Grid Electricity (AEDC)</span>
        <div class="sims-util-val" style="color:${isPowerOut ? '#f87171' : '#34d399'};">
          ${isPowerOut ? '❌ NEPA Blackout' : '✅ Grid Light Connected'}
        </div>
        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
          ${isSolar ? '☀️ 5kVA Solar Inverter Active (24/7)' : isGenOn ? `🔌 Generator Running (${sims.utilities.genFuelLiters.toFixed(1)}L Fuel)` : 'Standby'}
        </div>
        <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
          ${hasGen ? `
            <button type="button" class="btn-xs btn-toggle-gen" style="background:${isGenOn ? '#ef4444' : '#10b981'}; color:#fff;">
              ${isGenOn ? '🛑 Turn Off Gen' : '🔌 Start Generator'}
            </button>
            <button type="button" class="btn-xs btn-refuel-gen" style="background:rgba(245,158,11,0.2); border:1px solid #f59e0b; color:#fbbf24;">
              ⛽ Add 10L Fuel (₦9k)
            </button>
          ` : `
            <span style="font-size:10px; color:#f87171;">No generator installed</span>
          `}
        </div>
      </div>

      <div class="sims-util-box">
        <span class="sims-util-label">🚰 Water Supply (Borehole & Geepee)</span>
        <div class="sims-util-val" style="color:${tankLiters < 100 ? '#ef4444' : '#38bdf8'};">
          ${tankLiters} L / ${sims.utilities.tankCapacity} L
        </div>
        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
          ${sims.utilities.waterFilterInstalled ? '🧼 Industrial Filter: Crystal Pure' : '⚠️ Raw Borehole Water'}
        </div>
        <div style="margin-top:6px;">
          <button type="button" class="btn-xs btn-pump-water" style="background:#0284c7; color:#fff;">
            🚰 Run Borehole Pump (+1,000L)
          </button>
        </div>
      </div>

      <div class="sims-util-box">
        <span class="sims-util-label">🎟️ Estate Access & Curfew</span>
        <div class="sims-util-val" style="color:${sims.estate.accessPermitted ? '#34d399' : '#ef4444'};">
          ${sims.estate.accessPermitted ? `✅ Gate Code: ${sims.estate.visitorAccessCode}` : '🚫 Defaulted / Gate Barred'}
        </div>
        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
          Levy Paid Until: Day ${sims.estate.duesPaidUntilDay} (Curfew: ${sims.estate.curfewHour}:00)
        </div>
        <div style="margin-top:6px;">
          <button type="button" class="btn-xs btn-pay-estate-levy" style="background:#f59e0b; color:#000; font-weight:700;">
            💳 Pay Monthly Dues (${formatNairaFull(sims.estate.monthlyDues)})
          </button>
        </div>
      </div>
    `;

    // Event listeners for utilities buttons
    utilitiesRow.querySelector('.btn-toggle-gen')?.addEventListener('click', () => {
      const genObj = sims.installedObjects.includes('gen_soundproof') ? 'gen_soundproof' : 'gen_tiger';
      const actionId = genObj === 'gen_soundproof' ? 'toggle_diesel_gen' : 'start_tiger_gen';
      const res = runSmartObjectAction(this.game, genObj, actionId);
      this.showToast(res.ok ? (sims.utilities.generatorRunning ? '🔌 Generator humming!' : 'Generator stopped.') : `⚠️ ${res.reason}`);
      this._renderAll();
    });

    utilitiesRow.querySelector('.btn-refuel-gen')?.addEventListener('click', () => {
      const res = runSmartObjectAction(this.game, 'gen_tiger', 'refuel_gen');
      this.showToast(res.ok ? '⛽ Added 10L Petrol to Gen!' : `⚠️ ${res.reason}`);
      this._renderAll();
    });

    utilitiesRow.querySelector('.btn-pump-water')?.addEventListener('click', () => {
      const res = runSmartObjectAction(this.game, 'overhead_tank_2000l', 'pump_borehole_water');
      this.showToast(res.ok ? '🚰 Borehole pumped 1,000L into overhead Geepee tank!' : `⚠️ ${res.reason}`);
      this._renderAll();
    });

    utilitiesRow.querySelector('.btn-pay-estate-levy')?.addEventListener('click', () => {
      const res = payEstateLevy(this.game);
      this.showToast(res.ok ? `🎟️ Paid Estate Levy! New Access Code: ${sims.estate.visitorAccessCode}` : `⚠️ ${res.reason}`);
      this._renderAll();
    });

    // 3. Render Smart Objects & Utility AI Recommendations
    const aiCandidates = evaluateAutonomousActions(this.game);
    if (!aiCandidates.length) {
      smartObjectsList.innerHTML = `<div class="game-card"><p class="card-desc">No smart object interactions currently available. Check power or water supply.</p></div>`;
    } else {
      smartObjectsList.innerHTML = aiCandidates.slice(0, 8).map((cand, idx) => {
        const act = cand.interaction;
        const benefits = act.needDeltas ? Object.entries(act.needDeltas).map(([m, d]) => `${d > 0 ? '+' : ''}${d} ${m}`).join(', ') : '';
        const costStr = act.costNgn ? `Cost: ${formatNairaFull(act.costNgn)}` : act.rewardNgn ? `Earn: +${formatNairaFull(act.rewardNgn)}` : '';
        return `
          <div class="smart-action-item">
            <div class="smart-action-meta">
              <h4>${idx === 0 ? '⭐ ' : ''}${act.label}</h4>
              <p>${act.desc}</p>
              <div class="smart-action-badges">
                ${benefits ? `<span class="smart-badge badge-benefit">${benefits}</span>` : ''}
                ${costStr ? `<span class="smart-badge badge-cost">${costStr}</span>` : ''}
                <span class="smart-badge badge-score">Utility Score: ${cand.score}</span>
              </div>
            </div>
            <button type="button" class="btn-xs btn-primary btn-run-smart-action" data-obj="${cand.objectId}" data-act="${act.id}">
              ▶️ Run (${act.durationMin || 30}m)
            </button>
          </div>
        `;
      }).join('');

      smartObjectsList.querySelectorAll('.btn-run-smart-action').forEach((btn) => {
        btn.addEventListener('click', () => {
          const objId = btn.dataset.obj;
          const actId = btn.dataset.act;
          const res = runSmartObjectAction(this.game, objId, actId);
          this.showToast(res.ok ? `✅ ${res.action.label} completed!` : `⚠️ ${res.reason}`);
          this._renderAll();
        });
      });
    }

    // 4. Render Build & Buy Catalog
    const currentCatFilter = this.simsCatalogFilter || 'all';
    const filteredCatalog = currentCatFilter === 'all'
      ? BUILD_BUY_CATALOG
      : BUILD_BUY_CATALOG.filter(c => c.category === currentCatFilter);

    catalogGrid.innerHTML = filteredCatalog.map((item) => {
      const isInstalled = sims.installedObjects.includes(item.id);
      return `
        <div class="catalog-card">
          <div class="catalog-header">
            <div class="catalog-icon">${item.icon || '📦'}</div>
            <div class="catalog-info">
              <h4>${item.name}</h4>
              <span class="cat-price">${formatNairaFull(item.cost)}</span>
            </div>
          </div>
          <p class="catalog-desc">${item.desc}</p>
          <div>
            ${isInstalled ? `
              <span class="badge-xs" style="background:#10b981; color:#fff; display:block; text-align:center; padding:6px; border-radius:6px; font-weight:700;">
                ✓ Installed in Compound
              </span>
            ` : `
              <button type="button" class="btn-xs btn-primary btn-buy-catalog-item" data-id="${item.id}" style="width:100%;">
                🛒 Buy &amp; Install (${formatNairaFull(item.cost)})
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    catalogGrid.querySelectorAll('.btn-buy-catalog-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.id;
        const res = buyCatalogItem(this.game, itemId);
        this.showToast(res.ok ? `📦 Installed ${res.item.name} in your compound!` : `⚠️ ${res.reason}`);
        this._renderAll();
      });
    });

    // Catalog category filters
    document.querySelectorAll('#sims-catalog-filter-bar .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sims-catalog-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.simsCatalogFilter = btn.dataset.cat;
        this._renderSimsTab();
      });
    });

    // 5. Render Estate HOA & Community Politics
    estateContent.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="font-size:12px; color:#cbd5e1; line-height:1.4;">
          <strong>${sims.estate.name}</strong> • Monthly Resident Association Agenda:
        </div>
        <div class="form-row-2col">
          <div style="background:rgba(30,41,59,0.7); padding:8px 10px; border-radius:8px;">
            <div style="font-size:11px; font-weight:700; color:#fde047;">🗳️ Agenda 1: Estate Central Gen Hours</div>
            <p style="font-size:11px; color:#94a3b8; margin:2px 0 6px;">Increase central diesel pool run time from 4 hrs to 6 hrs daily?</p>
            <button type="button" class="btn-xs btn-hoa-vote" data-vote="gen_hours" style="background:#10b981; color:#fff;">Vote YES (Support)</button>
          </div>
          <div style="background:rgba(30,41,59,0.7); padding:8px 10px; border-radius:8px;">
            <div style="font-size:11px; font-weight:700; color:#fde047;">🗳️ Agenda 2: Dispatch Bike Curfew</div>
            <p style="font-size:11px; color:#94a3b8; margin:2px 0 6px;">Bar dispatch riders and kekes from inner closes after 9:00 PM?</p>
            <button type="button" class="btn-xs btn-hoa-vote" data-vote="curfew" style="background:#3b82f6; color:#fff;">Vote YES (Security)</button>
          </div>
        </div>
      </div>
    `;

    estateContent.querySelectorAll('.btn-hoa-vote').forEach((btn) => {
      btn.addEventListener('click', () => {
        sims.estate.chairmanStanding = Math.min(100, (sims.estate.chairmanStanding || 50) + 8);
        this.game.stat('clout', 2);
        this.showToast('🗳️ Vote recorded at Estate General Meeting! +8 HOA Standing, +2 Clout');
        btn.disabled = true;
        btn.textContent = '✓ Voted';
      });
    });
  }

  // --------------------------------------------------------------------------
  // TAB 5: NETWORK ROLODEX (NPCs + CONNECTED REAL PLAYERS)
  // --------------------------------------------------------------------------
  _renderNetworkTab() {
    this._renderP2PTasksSection();
    const list = document.getElementById('contacts-list');
    if (!list) return;

    const contacts = this.game.s.contacts || [];
    if (!contacts.length) {
      list.innerHTML = `<div class="game-card"><p class="card-desc">No contacts yet. Socialize in Wuse 2 or click "Connect" on live players in the Live Chat tab!</p></div>`;
      return;
    }

    list.innerHTML = contacts.map((c) => {
      const favs = favoursFor(c);
      const ciCost = checkInCost(c);
      return `
        <div class="game-card">
          <div class="card-top">
            <span class="card-title">${c.isRealPlayer ? '🟢 ' : '👤 '}${c.name}</span>
            <span class="card-badge">${c.org || 'FCT Network'} • Tier ${c.tier || 1} • Affinity ${Math.round(c.affinity || 50)}%</span>
          </div>
          <div class="card-meta-row" style="margin-top:4px;">
            <div class="meta-pills" style="gap:5px;">
              <button class="btn-secondary btn-checkin-contact" data-id="${c.id}">
                📞 Check-In (${formatNairaFull(ciCost)})
              </button>
              ${favs.map((f) => `
                <button class="btn-primary btn-favour-contact" data-cid="${c.id}" data-fid="${f.id}" ${c.affinity < f.min ? 'disabled' : ''} title="${f.desc}">
                  🤝 ${f.label}
                </button>
              `).join('')}
              ${c.isRealPlayer ? `
                <button class="btn-xs btn-dm-contact" data-id="${c.playerId || c.id}" data-name="${c.name}">💬 Direct Msg</button>
                <button class="btn-xs btn-wire-contact" data-id="${c.playerId || c.id}">💸 Wire ₦</button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-checkin-contact').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = await this.game.exclusive(() => checkIn(this.game, btn.dataset.id));
        if (res && !res.ok) this.showToast(`⚠️ ${res.reason}`);
        this._renderAll();
      });
    });

    list.querySelectorAll('.btn-favour-contact').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = await this.game.exclusive(() => callFavour(this.game, btn.dataset.cid, btn.dataset.fid));
        if (res && !res.ok) this.showToast(`⚠️ ${res.reason}`);
        this._renderAll();
      });
    });

    list.querySelectorAll('.btn-dm-contact').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.switchTab('multiplayer');
        this.openDirectMessage(btn.dataset.id, btn.dataset.name);
      });
    });

    list.querySelectorAll('.btn-wire-contact').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openNairaVaultModal(btn.dataset.id);
      });
    });
  }

  _renderP2PTasksSection() {
    const list = document.getElementById('p2p-tasks-list');
    const assigneeSel = document.getElementById('task-assignee-select');
    if (!list) return;

    // Populate assignee select with live online players
    if (assigneeSel) {
      const currentVal = assigneeSel.value;
      const others = this.onlinePlayers.filter((p) => p.id !== this.playerId);
      assigneeSel.innerHTML = `
        <option value="" data-name="Open to Any FCT Player">🌐 Open to Any FCT Player / Autonomous Worker</option>
        ${others.map((p) => `
          <option value="${p.id}" data-name="${p.name}">
            ${p.isBot ? '🤖 ' : '🟢 '}${p.name} (${DISTRICT_BY_ID[p.district]?.short || p.district})
          </option>
        `).join('')}
      `;
      if (currentVal) assigneeSel.value = currentVal;
    }

    if (!this.playerTasks.length) {
      list.innerHTML = `<div class="game-card"><p class="card-desc">No active tasks right now. Assign a task above or wait for residents to post paid errands!</p></div>`;
      return;
    }

    const openTasks = this.playerTasks.filter((t) => t.status === 'open');
    if (!openTasks.length) {
      list.innerHTML = `<div class="game-card"><p class="card-desc">All FCT tasks are currently completed. Post a new task above!</p></div>`;
      return;
    }

    list.innerHTML = openTasks.map((t) => {
      const isMine = t.creatorId === this.playerId;
      const distName = DISTRICT_BY_ID[t.district]?.name || t.district || 'Abuja';
      return `
        <div class="game-card" style="border-left: 3px solid ${isMine ? '#38bdf8' : '#10b981'};">
          <div class="card-top">
            <div>
              <span class="card-title">${t.title}</span>
              <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
                Posted by <strong>${t.creatorName}</strong> • Target: <strong>${t.assigneeName || 'Any FCT Player'}</strong>
              </div>
            </div>
            <div style="text-align:right;">
              <span class="card-badge" style="background:#065f46; color:#4ade80; font-weight:700; font-size:12px;">
                💰 ${formatNairaFull(t.reward)}
              </span>
              <div style="font-size:10px; color:#64748b; margin-top:2px;">📍 ${distName}</div>
            </div>
          </div>
          <div class="card-meta-row" style="margin-top:6px;">
            <div class="meta-pills">
              <span class="meta-pill pos">🎁 Employer Benefit: ${t.employerBenefit || 'Clout & Progress'}</span>
            </div>
            <div>
              ${isMine ? `
                <span class="card-badge" style="background:#1e293b; color:#94a3b8;">⏳ Your Escrow Task</span>
              ` : `
                <button class="btn-primary btn-execute-task" data-id="${t.id}" data-reward="${t.reward}">
                  ⚡ Accept & Execute Task (${formatNairaFull(t.reward)})
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-execute-task').forEach((btn) => {
      btn.addEventListener('click', () => {
        const taskId = btn.dataset.id;
        const task = this.playerTasks.find((x) => x.id === taskId);
        if (!task) return;

        btn.disabled = true;
        btn.textContent = '⏳ Executing in FCT...';

        fetch('/api/tasks/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            executorId: this.playerId,
            executorName: this.game.s.meta.name
          })
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok) {
              const reward = Number(task.reward) || 15000;
              this.game.earn(reward, { cash: true });
              this.game.stat('clout', 2);
              this._recordDailyProgress('move');
              this.game.log(`Executed task "${task.title}" for ${task.creatorName}! Earned ${formatNairaFull(reward)}.`, 'good', '📋');
              if (this.world3d) this.world3d.spawnNairaRain(25);
              this.showToast(`🎉 Task executed! Received ${formatNairaFull(reward)} cash payment!`);
              this._renderAll();
            } else {
              this.showToast(`⚠️ ${data.error || 'Failed to complete task'}`);
              this._renderP2PTasksSection();
            }
          })
          .catch(() => {
            this.showToast('⚠️ Network error executing task');
            this._renderP2PTasksSection();
          });
      });
    });
  }

  _handleCompletedPlayerTask(task) {
    if (!task) return;
    const found = this.playerTasks.find((t) => t.id === task.id);
    if (found) {
      found.status = 'completed';
      found.completedBy = task.completedBy;
    }
    this._renderP2PTasksSection();

    if (task.creatorId !== this.playerId) return;

    const type = task.taskType || 'push_file';
    const plots = this.game.s.social?.plots || {};

    if (type === 'haul_granite') {
      const incomplete = Object.values(plots).find((p) => p.stage < 5);
      if (incomplete) {
        incomplete.stage = Math.min(5, incomplete.stage + 1);
        this.game.stat('clout', 3);
        this.game.log(`Worker completed Mpape granite haul! ${incomplete.name} site advanced to Stage ${incomplete.stage}!`, 'good', '🪨');
        if (this.world3d) this.world3d.syncPlayerHouses(Object.values(plots));
      } else {
        this.game.stat('clout', 3);
        this.game.log(`Granite shipment delivered and stockpiled!`, 'good', '🪨');
      }
    } else if (type === 'push_file') {
      this.game.stat('clout', 6);
      this.game.log(`Your file was moved across the Director's table! (+6 Protocol Clout)`, 'good', '📄');
    } else if (type === 'clear_vio') {
      this.game.stat('heat', -35);
      this.game.log(`FCT VIO / FRSC heat cleared by your contact! (-35 Heat)`, 'good', '👮');
    } else if (type === 'shawarma_vip') {
      this.game.stat('energy', 25);
      this.game.stat('sanity', 20);
      this.game.log(`Wuse 2 VIP Shawarma delivered! Energy & Sanity boosted.`, 'good', '🌯');
    } else if (type === 'agis_cofo') {
      const unverified = Object.values(plots).find((p) => !p.cofo);
      if (unverified) {
        unverified.cofo = true;
        this.game.stat('clout', 8);
        this.game.log(`AGIS Certificate of Occupancy stamped for ${unverified.name}!`, 'good', '🏛️');
      } else {
        this.game.stat('clout', 8);
        this.game.log(`AGIS Land Registry priority pass verified! (+8 Clout)`, 'good', '🏛️');
      }
    }

    this.showToast(`🎉 ${task.executorName || 'A worker'} completed your task: ${task.title}!`);
    this._renderAll();
    this._saveGame();
  }

  // --------------------------------------------------------------------------
  // TODAY'S HUSTLE: DAILY MISSIONS & STREAK TRACKER
  // --------------------------------------------------------------------------
  _renderDailyHustleBox() {
    const box = document.getElementById('daily-hustle-box');
    if (!box) return;
    this._ensureExtendedPlayerState();
    const dh = this.game.s.social.dailyHustle;
    const movesDone = (dh.movesCount || 0) >= 2;
    const bonusAmt = 15000 + (dh.streak - 1) * 3000;

    box.innerHTML = `
      <div class="dh-top">
        <span class="dh-title">🎯 Today's Abuja Hustle ${dh.rewarded ? '• ✅ COMPLETED' : `• Reward: ${formatNairaFull(bonusAmt)} + 4🏛️`}</span>
        <span class="dh-streak">🔥 Day ${dh.streak} Streak</span>
      </div>
      <div class="dh-tasks-grid">
        <div class="dh-task-chip ${movesDone ? 'done' : ''}">
          <strong>${movesDone ? '✅' : '○'} 1. Street Moves</strong>
          <span>${Math.min(2, dh.movesCount || 0)}/2 District Hustles</span>
        </div>
        <div class="dh-task-chip ${dh.commuted ? 'done' : ''}">
          <strong>${dh.commuted ? '✅' : '○'} 2. Transit</strong>
          <span>${dh.commuted ? 'Corridor Crossed' : 'Commute / Drive'}</span>
        </div>
        <div class="dh-task-chip ${dh.socialized ? 'done' : ''}">
          <strong>${dh.socialized ? '✅' : '○'} 3. FCT Social</strong>
          <span>${dh.socialized ? 'Active in FCT' : 'Chat, Whot or Spray ₦'}</span>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // TAB 6: NAIJA WHOT / LUDO, SHORT COURSES, GARAGE & LIFESTYLE
  // --------------------------------------------------------------------------
  _renderLifestyleTab() {
    this._renderNigerianSlangSteezeHub();
    this._renderGarageAndLifestyle();
    this._renderCoursesList();
    this._renderBaeRelationshipBox();
  }

  _renderNigerianSlangSteezeHub() {
    const box = document.getElementById('nigerian-slang-steeze-box');
    if (!box) return;
    this._ensureExtendedPlayerState();
    const s = this.game.s;
    const gInfo = GENDERS[s.meta.gender] || GENDERS.male;
    const ls = NIGERIAN_LIFESTYLES[s.meta.lifestyle] || NIGERIAN_LIFESTYLES.alhaji;
    const age = s.meta.age || 26;
    const isChild = age < 18;
    const steeze = Math.min(100, Math.max(0, Math.round(s.social.steeze || 80)));
    const composure = Math.min(100, Math.max(0, Math.round(s.social.composure || 82)));
    const totalWorth = netWorth(s);

    box.innerHTML = `
      <div class="card-top" style="flex-wrap:wrap; gap:8px;">
        <div>
          <span class="card-badge" style="background:rgba(250,204,21,0.18); color:#fde047; border:1px solid rgba(250,204,21,0.4);">
            ${ls.caliber} • ${gInfo.icon} ${gInfo.short} (${age} yrs ${isChild ? '• 🧒🏾 Child/Teen' : '• Adult'})
          </span>
          <h3 class="card-title" style="margin-top:4px;">${ls.name}</h3>
          <div style="font-size:11px; color:#38bdf8; font-weight:600;">"${s.meta.slangTag || ls.slangTag}" • Total Net Worth: ${formatNairaFull(totalWorth)}</div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" id="btn-hub-customize-char" class="btn-secondary">👤 Change Gender / Age / Caliber</button>
          <button type="button" id="btn-hub-age-up" class="btn-primary">🎂 ${isChild ? `Grow Up (+1 Yr / Turn 18)` : `Birthday (+1 Yr)`}</button>
        </div>
      </div>

      <!-- Steeze & Composure Meters -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0;">
        <div style="background:rgba(15,23,42,0.85); padding:8px 10px; border-radius:8px; border:1px solid rgba(56,189,248,0.3);">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:700; color:#7dd3fc; margin-bottom:4px;">
            <span>✨ STEEZE (Drip, Aura &amp; Style)</span>
            <span>${steeze}%</span>
          </div>
          <div style="height:7px; background:#090d16; border-radius:4px; overflow:hidden;">
            <div style="width:${steeze}%; height:100%; background:linear-gradient(90deg,#38bdf8,#818cf8);"></div>
          </div>
        </div>
        <div style="background:rgba(15,23,42,0.85); padding:8px 10px; border-radius:8px; border:1px solid rgba(16,185,129,0.3);">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:700; color:#6ee7b7; margin-bottom:4px;">
            <span>🧘🏾 COMPOSURE (0% Fear, No Shalaye)</span>
            <span>${composure}%</span>
          </div>
          <div style="height:7px; background:#090d16; border-radius:4px; overflow:hidden;">
            <div style="width:${composure}%; height:100%; background:linear-gradient(90deg,#10b981,#facc15);"></div>
          </div>
        </div>
      </div>

      <!-- 1-Click Viral Nigerian TikTok / X / Instagram Lifestyle Actions -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(175px, 1fr)); gap:7px; margin-bottom:10px;">
        <button type="button" id="btn-slang-aza" class="btn-primary" style="font-size:11.5px; padding:8px;">
          💸 Drop Aza / Send Billing
        </button>
        <button type="button" id="btn-slang-oblee" class="btn-secondary" style="font-size:11.5px; padding:8px; border-color:#f43f5e; color:#fda4af;">
          🕺🏾 Oblee! Detty Rave (₦15k)
        </button>
        <button type="button" id="btn-slang-dorime" class="btn-secondary" style="font-size:11.5px; padding:8px; border-color:#eab308; color:#fde047;">
          🚨 Sound "DORIME" Siren (₦80k)
        </button>
        <button type="button" id="btn-slang-japa" class="btn-secondary" style="font-size:11.5px; padding:8px; border-color:#38bdf8; color:#7dd3fc;">
          🛂 Flex UK/US Visa Stamp (₦45k)
        </button>
      </div>

      <!-- Interactive Nigerian Slang Dictionary (Click to Flex in Live FCT Chat) -->
      <div style="font-size:10.5px; color:#94a3b8; margin-bottom:5px;">
        📱 <strong>Trending Naija TikTok / X Slangs</strong> (Click any slang to flex it on Live FCT Radio Chat):
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:5px;">
        ${NIGERIAN_SLANG_DICTIONARY.map((item) => `
          <button type="button" class="btn-xs btn-flex-slang" data-term="${item.term}" data-meaning="${item.meaning}" title="${item.meaning}" style="background:rgba(15,23,42,0.9); border-color:rgba(148,163,184,0.3);">
            🔥 ${item.term}
          </button>
        `).join('')}
      </div>
    `;

    box.querySelector('#btn-hub-customize-char')?.addEventListener('click', () => {
      this._openNewCharModal();
    });

    box.querySelector('#btn-hub-age-up')?.addEventListener('click', () => {
      if (!s.meta.age) s.meta.age = 22;
      if (s.meta.age < 18) {
        s.meta.age = 18;
        s.meta.lifeStage = 'young_adult';
        this.game.earn(75000, { bank: true });
        this.game.stat('clout', 5);
        this.game.log('🎓 Graduated to 18 Years Old (Young Adult)! Received ₦75,000 family graduation alert!', 'good', '🎂');
        this.showToast('🎓 You are now 18 (Young Adult)! +₦75,000 graduation gift & full Abuja access!');
      } else {
        s.meta.age += 1;
        s.meta.lifeStage = s.meta.age <= 25 ? 'young_adult' : s.meta.age <= 44 ? 'adult' : 'elder';
        this.game.stat('clout', 2);
        s.social.composure = Math.min(100, (s.social.composure || 80) + 3);
        this.game.log(`🎂 Celebrated your ${s.meta.age}th birthday in Abuja! (+2 Clout, +3% Composure)`, 'good', '🎂');
        this.showToast(`🎂 Happy ${s.meta.age}th Birthday! +2 Clout & +3% Composure!`);
      }
      this._renderAll();
      this._saveGame();
    });

    box.querySelector('#btn-slang-aza')?.addEventListener('click', () => {
      const todayNum = this.game.day;
      if (s.flags.lastHubBillingDay === todayNum) {
        this.showToast('⏳ You already dropped your Aza for billing today! Maintain composure till tomorrow.');
        return;
      }
      s.flags.lastHubBillingDay = todayNum;
      const mult = s.meta.lifestyle === 'os_baddie' ? 2.8 : s.meta.lifestyle === 'nepo_baby' ? 2.4 : s.meta.lifestyle === 'alhaji' ? 2.2 : 1.0;
      const payout = Math.round((15000 + Math.random() * 35000) * mult);
      this.game.earn(payout, { bank: true });
      this.game.stat('sanity', 10);
      this._recordDailyProgress('social');
      this.game.log(`"Send your Aza!" Received ${formatNairaFull(payout)} soft-life alert from your Abuja sponsor!`, 'good', '💸');
      if (this.world3d) this.world3d.spawnNairaRain(28);
      this.showToast(`💸 Aza Alert! +${formatNairaFull(payout)} credited!`);
      this._renderAll();
    });

    box.querySelector('#btn-slang-oblee')?.addEventListener('click', () => {
      const cost = 15000;
      if (!this.game.canAfford(cost)) {
        this.showToast('⚠️ Need ₦15,000 for Oblee Detty Rave!');
        return;
      }
      this.game.pay(cost);
      s.social.steeze = Math.min(100, (s.social.steeze || 80) + 8);
      this.game.stat('sanity', 25);
      this.game.stat('clout', 4);
      this._recordDailyProgress('social');
      this.game.log('🕺🏾 OBLEE! Partied till 5 AM in Wuse 2 with maximum Steeze & Composure (+8% Steeze, +25 Sanity, +4 Clout)!', 'good', '🕺🏾');
      if (this.world3d) this.world3d.spawnNairaRain(30);
      this.showToast('🕺🏾 OBLEE MODE! +8% Steeze, +25 Sanity, +4 Clout!');
      this._renderAll();
    });

    box.querySelector('#btn-slang-dorime')?.addEventListener('click', () => {
      const cost = 80000;
      if (!this.game.canAfford(cost)) {
        this.showToast('⚠️ Need ₦80,000 to sound the DORIME club alarm!');
        return;
      }
      this.game.pay(cost);
      s.social.steeze = Math.min(100, (s.social.steeze || 80) + 12);
      s.social.composure = Math.min(100, (s.social.composure || 80) + 8);
      this.game.stat('clout', 12);
      this.game.stat('sanity', 30);
      this._recordDailyProgress('social');
      this.game.log('🚨 DORIME INTERIMO ADAPARE! Shut down Wuse 2 VIP with Azul & police sirens! (+12 Clout, +12% Steeze)', 'good', '🚨');
      if (this.world3d) this.world3d.spawnNairaRain(50);
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: this.playerId,
          sender: s.meta.name,
          district: s.loc.district,
          channel: 'global',
          text: `🚨 DORIME! ${s.meta.name} (${ls.name.split(' (')[0]}) just shut down Wuse 2 VIP with Azul & sparklers! Steeze 100%! 🍾💸`
        })
      }).catch(() => {});
      this.showToast('🚨 DORIME! Sirens & Naira rain in 3D! +12 Clout, +12% Steeze!');
      this._renderAll();
    });

    box.querySelector('#btn-slang-japa')?.addEventListener('click', () => {
      const cost = 45000;
      if (!this.game.canAfford(cost)) {
        this.showToast('⚠️ Need ₦45,000 for priority UK/US Embassy Visa biometrics!');
        return;
      }
      this.game.pay(cost);
      s.social.steeze = Math.min(100, (s.social.steeze || 80) + 10);
      s.social.composure = Math.min(100, (s.social.composure || 80) + 10);
      this.game.stat('clout', 10);
      this.game.log('🛂 Stamped 5-Year Multiple Entry Visa at the Diplomatic Drive Embassy! International flex unlocked.', 'good', '🛂');
      this.showToast('🛂 5-Year Visa Stamped! +10 Clout, +10% Steeze & Composure!');
      this._renderAll();
    });

    box.querySelectorAll('.btn-flex-slang').forEach((btn) => {
      btn.addEventListener('click', () => {
        const term = btn.dataset.term;
        const meaning = btn.dataset.meaning;
        s.social.steeze = Math.min(100, (s.social.steeze || 80) + 1);
        this.showToast(`🔥 ${term}: ${meaning}`);
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderId: this.playerId,
            sender: s.meta.name,
            district: s.loc.district,
            channel: 'global',
            text: `🔥 "${term}!" — ${meaning} (Caliber: ${ls.name.split(' (')[0]})`
          })
        }).catch(() => {});
        this._renderHUD();
      });
    });
  }

  _renderGarageAndLifestyle() {
    const garageEl = document.getElementById('garage-list');
    const ritualsEl = document.getElementById('lifestyle-rituals-list');
    if (!garageEl || !ritualsEl) return;
    this._ensureExtendedPlayerState();

    const currentCar = this.game.s.social.car || 'along';
    const ownedCars = this.game.s.social.ownedCars || ['along'];

    const VEHICLES = [
      {
        id: 'along',
        name: '🚕 Green Along Taxi / Shared Cab',
        price: 0,
        speed: 'Standard Commute',
        perks: 'Everyday budget transit; typical Airport Road gridlock delay',
        desc: 'The classic FCT green taxi. Crammed 4-in-the-back, cheap, but hold-up will test your patience.'
      },
      {
        id: 'corolla',
        name: '🚗 Tokunbo Toyota Corolla Muscle',
        price: 180000,
        speed: '+30% Commute Speed',
        perks: '-15% Transit Sanity Loss • Reliable AC • Silver Metallic 3D Skin',
        desc: 'The official king of Abuja roads. Cheap maintenance, AC blasting, bypasses along stops.'
      },
      {
        id: 'rx350',
        name: '🚙 Lexus RX 350 V6 (Abuja Big Boy Edition)',
        price: 650000,
        speed: '+50% Commute Speed',
        perks: '+10 Protocol Clout • VIP Gate Access in Maitama/Asokoro • Pearl White 3D Skin',
        desc: 'The signature whip of Wuse 2 tech founders and government contractors. Instant respect at estate gates.'
      },
      {
        id: 'prado',
        name: '🚙 Toyota Land Cruiser Prado TXL V6',
        price: 1800000,
        speed: '+75% Commute Speed',
        perks: '+25 Clout • VIO & FRSC Checkpoint Immunity • Obsidian Black 3D Skin',
        desc: 'Federal Ministry official convoy spec. FRSC officers salute, checkpoints wave you through.'
      },
      {
        id: 'g63',
        name: '🏎️ Mercedes-AMG G63 Brabus (Asokoro Spec)',
        price: 4500000,
        speed: '+120% Instant Speed',
        perks: '+50 Clout • Dual Twin-Turbo V8 • Siren Convoy • Matte Golden-Black 3D Skin',
        desc: 'The ultimate apex predator of Abuja luxury. Shakes Shehu Shagari Way with brutal exhaust rumble.'
      }
    ];

    garageEl.innerHTML = VEHICLES.map((v) => {
      const isOwned = ownedCars.includes(v.id);
      const isCurrent = currentCar === v.id;
      return `
        <div class="game-card" style="border-left: 3px solid ${isCurrent ? '#38bdf8' : isOwned ? '#10b981' : '#64748b'};">
          <div class="card-top">
            <div>
              <span class="card-title">${v.name}</span>
              <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${v.speed}</div>
            </div>
            <div style="text-align:right;">
              <span class="card-badge" style="background:${isCurrent ? '#0284c7' : isOwned ? '#065f46' : '#1e293b'}; color:#fff;">
                ${isCurrent ? '⚡ Currently Driving' : isOwned ? '✓ In Your Garage' : formatNairaFull(v.price)}
              </span>
            </div>
          </div>
          <p class="card-desc">${v.desc}</p>
          <div class="card-meta-row">
            <div class="meta-pills">
              <span class="meta-pill pos">✨ ${v.perks}</span>
            </div>
            <div>
              ${isOwned ? `
                <button class="btn-secondary btn-drive-car" data-id="${v.id}" ${isCurrent ? 'disabled' : ''}>
                  ${isCurrent ? '🚘 Active Ride' : '🔑 Drive This Whip'}
                </button>
              ` : `
                <button class="btn-primary btn-buy-car" data-id="${v.id}" data-price="${v.price}">
                  🛒 Buy Whip (${formatNairaFull(v.price)})
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    garageEl.querySelectorAll('.btn-buy-car').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const price = Number(btn.dataset.price);
        if (!this.game.canAfford(price)) {
          this.showToast('⚠️ Insufficient Naira balance to buy this vehicle!');
          return;
        }
        this.game.pay(price);
        if (!ownedCars.includes(id)) ownedCars.push(id);
        this.game.s.social.ownedCars = ownedCars;
        this.game.s.social.car = id;
        const v = VEHICLES.find((x) => x.id === id);
        this.game.log(`Purchased ${v?.name || id} for ${formatNairaFull(price)}! Keys handed over.`, 'good', '🔑');
        if (this.world3d) {
          this.world3d.setPlayerVehicleAppearance(id);
          this.world3d.spawnNairaRain(20);
        }
        this.showToast(`🔑 Purchased & driving ${v?.name || id}! Vehicle appearance updated in 3D.`);
        this._renderAll();
      });
    });

    garageEl.querySelectorAll('.btn-drive-car').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.game.s.social.car = id;
        const v = VEHICLES.find((x) => x.id === id);
        if (this.world3d) this.world3d.setPlayerVehicleAppearance(id);
        this.game.log(`Switched active ride to ${v?.name || id}.`, 'info', '🚘');
        this.showToast(`🚘 Now cruising in ${v?.name || id}!`);
        this._renderAll();
      });
    });

    // RITUALS LIST
    const RITUALS = [
      {
        id: 'yahuza_suya',
        title: '🥩 Wuse 2 Yahuza Suya & Chill Night',
        cost: 8000,
        desc: 'Sizzle spiced beef suya, masa, and chilled zobo at the legendary Yahuza spot in Wuse 2.',
        perk: '+25 Sanity • +15 Energy • +2 Clout',
        run: () => {
          this.game.stat('sanity', 25);
          this.game.stat('energy', 15);
          this.game.stat('clout', 2);
          this.game.log('Chilled at Yahuza Suya in Wuse 2 with spicy pepper & onions! Stress melted away.', 'good', '🥩');
          this.showToast('🥩 Yahuza Suya hit the spot! +25 Sanity, +15 Energy, +2 Clout.');
        }
      },
      {
        id: 'jabi_boat_club',
        title: '⛵ Jabi Lake Boat Club VIP Cruise',
        cost: 35000,
        desc: 'Sunset speedboat ride on Jabi Lake with waterfront cocktails and networking with tech founders.',
        perk: '+40 Sanity • +8 Clout • Resets Stress',
        run: () => {
          this.game.stat('sanity', 40);
          this.game.stat('clout', 8);
          this.game.log('Cruised Jabi Lake waters at sunset. Networked with startup CEOs and diaspora tourists.', 'good', '⛵');
          this.showToast('⛵ Jabi Lake breeze recharged your soul! +40 Sanity & +8 Clout.');
        }
      },
      {
        id: 'asokoro_catfish',
        title: '🐟 Asokoro Hillside Bush Bar Point-and-Kill',
        cost: 18000,
        desc: 'Fresh grilled catfish pepper soup with plantain under the Asokoro rock canopy.',
        perk: '+30 Sanity • +10 Energy',
        run: () => {
          this.game.stat('sanity', 30);
          this.game.stat('energy', 10);
          this.game.log('Savoring hot point-and-kill catfish at Asokoro bush bar with cold drinks.', 'good', '🐟');
          this.showToast('🐟 Fresh catfish pepper soup enjoyed! +30 Sanity, +10 Energy.');
        }
      },
      {
        id: 'icc_owambe',
        title: '🎉 ICC / Banquet Hall Owambe Spraying',
        cost: 50000,
        desc: 'Spray crisp newly-minted Naira notes at a high-society Abuja wedding at ICC! Live 3D Naira rain.',
        perk: '+15 Protocol Clout • 3D Naira Rain • FCT Wire Broadcast',
        run: () => {
          this.game.stat('clout', 15);
          this.game.log(`Sprayed crisp ₦50,000 at ICC Owambe! The live band shouted your name!`, 'good', '🎉');
          if (this.world3d) this.world3d.spawnNairaRain(45);
          fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              senderId: this.playerId,
              sender: this.game.s.meta.name,
              district: 'cbd',
              channel: 'global',
              text: `🎉 Just sprayed crisp ₦50,000 at ICC Abuja banquet hall! "Chief, your level don pass ordinary!" 🍾💸`
            })
          }).catch(() => {});
          this.showToast('🎉 Owambe Spraying! Crisp Naira notes in the air! +15 Clout!');
        }
      },
      {
        id: 'area1_kilishi_box',
        title: '🥩 Area 1 Garki Fiery Beef Kilishi Gift Box',
        cost: 12000,
        desc: 'Send a brown-paper parcel of spicy groundnut-coated Area 1 Kilishi to a Ministry Director or enjoy with cold drinks.',
        perk: '+22 Sanity • +18 Energy • +4 Protocol Clout',
        run: () => {
          this.game.stat('sanity', 22);
          this.game.stat('energy', 18);
          this.game.stat('clout', 4);
          this.game.log('Picked up authentic Area 1 Garki spicy beef Kilishi parcel! Shared with ministry allies.', 'good', '🥩');
          this.showToast('🥩 Area 1 Kilishi Gift Box enjoyed! +22 Sanity, +18 Energy, +4 Clout.');
        }
      },
      {
        id: 'crushed_rock_drone',
        title: '🏞️ Mpape Crushed Rock Lagoon VIP Picnic & Drone Shoot',
        cost: 18500,
        desc: 'Private weekend picnic overlooking the turquoise rainwater quarry lake in Mpape with 4K drone photography.',
        perk: '+35 Sanity • +6 Clout • Viral Abuja Aesthetic',
        run: () => {
          this.game.stat('sanity', 35);
          this.game.stat('clout', 6);
          this.game.log('Hosted a scenic picnic & 4K drone shoot at Mpape Crushed Rock Blue Lagoon!', 'good', '🏞️');
          this.showToast('🏞️ Mpape Crushed Rock Blue Lagoon picnic! +35 Sanity, +6 Clout.');
        }
      },
      {
        id: 'solar_inverter',
        title: '⚡ 10kVA Felicity Solar & Lithium Inverter System',
        cost: 380000,
        desc: 'Permanent rooftop solar installation. Never experience blackout at home again, +25% Shortlet booking rates!',
        perk: this.game.s.social.solarInstalled ? '✅ INSTALLED (Immune to Blackouts • +25% Shortlet Rate)' : 'Permanent 100% Home Power • +25% Shortlet Yield',
        run: () => {
          this.game.s.social.solarInstalled = true;
          this.game.stat('clout', 10);
          this.game.log('Installed 10kVA Felicity Solar & Lithium system! Constant 24/7 power guaranteed at home.', 'good', '⚡');
          this.showToast('⚡ 10kVA Solar System Live! Immune to NEPA/AEDC blackouts for life!');
        }
      }
    ];

    ritualsEl.innerHTML = RITUALS.map((r) => {
      const isSolarInstalled = r.id === 'solar_inverter' && this.game.s.social.solarInstalled;
      return `
        <div class="game-card">
          <div class="card-top">
            <span class="card-title">${r.title}</span>
            <span class="card-badge">${isSolarInstalled ? '✅ Owned' : formatNairaFull(r.cost)}</span>
          </div>
          <p class="card-desc">${r.desc}</p>
          <div class="card-meta-row">
            <div class="meta-pills">
              <span class="meta-pill pos">${r.perk}</span>
            </div>
            <button class="btn-primary btn-do-ritual" data-id="${r.id}" ${isSolarInstalled ? 'disabled' : ''}>
              ${isSolarInstalled ? '✅ Installed' : `Indulge (${formatNairaFull(r.cost)})`}
            </button>
          </div>
        </div>
      `;
    }).join('');

    ritualsEl.querySelectorAll('.btn-do-ritual').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const r = RITUALS.find((x) => x.id === id);
        if (!r) return;
        if (!this.game.canAfford(r.cost)) {
          this.showToast(`⚠️ Need ${formatNairaFull(r.cost)} for this Abuja lifestyle ritual!`);
          return;
        }
        this.game.pay(r.cost);
        this._recordDailyProgress('social');
        r.run();
        this._renderAll();
      });
    });
  }

  _startWhotGame() {
    const stake = 5000;
    if (!this.game.canAfford(stake)) {
      this.showToast('⚠️ Need at least ₦5,000 stake to play Naija Whot!');
      return;
    }
    this.game.pay(stake);
    this._recordDailyProgress('social');

    const shapes = [
      { id: 'circle', sym: '●', name: 'Circle' },
      { id: 'triangle', sym: '▲', name: 'Triangle' },
      { id: 'cross', sym: '✚', name: 'Cross' },
      { id: 'square', sym: '■', name: 'Square' },
      { id: 'star', sym: '★', name: 'Star' }
    ];
    const nums = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14];
    const deck = [];
    for (const sh of shapes) {
      for (const n of nums) {
        deck.push({ shape: sh.id, sym: sh.sym, num: n });
      }
    }
    deck.push({ shape: 'whot', sym: '🃏', num: 20 });
    deck.push({ shape: 'whot', sym: '🃏', num: 20 });

    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    const playerHand = deck.splice(0, 5);
    const botHand = deck.splice(0, 5);
    let topCard = deck.pop();
    while (topCard.shape === 'whot') {
      deck.unshift(topCard);
      topCard = deck.pop();
    }

    this.whotState = {
      deck,
      playerHand,
      botHand,
      topCard,
      status: 'Your turn! Match shape (● ▲ ✚ ■ ★), number, or play WHOT 20.',
      finished: false
    };

    this._renderWhotStage();
  }

  _renderWhotStage() {
    const stage = document.getElementById('minigame-stage');
    if (!stage || !this.whotState) return;
    stage.hidden = false;
    const st = this.whotState;

    const canPlay = (c) =>
      !st.finished &&
      (c.shape === 'whot' || c.shape === st.topCard.shape || c.num === st.topCard.num);

    stage.innerHTML = `
      <div class="card-top">
        <span class="card-title">🃏 Wuse 2 Naija Whot! Table (Pot: ₦10,000)</span>
        <span class="card-badge">Opponent Cards: ${st.botHand.length} • Market: ${st.deck.length}</span>
      </div>
      <p class="card-desc" style="color:#fde047;">${st.status}</p>
      <div class="whot-table-row">
        <div style="text-align:center;">
          <div style="font-size:10px; color:#a7f3d0; margin-bottom:4px;">ACTIVE CALL CARD</div>
          <div class="whot-card" style="margin:0 auto; cursor:default;">
            <span class="wc-num">${st.topCard.num}</span>
            <span class="wc-shape">${st.topCard.sym}</span>
            <span class="wc-bot">${st.topCard.num}</span>
          </div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px; color:#a7f3d0; margin-bottom:4px;">GO TO MARKET</div>
          <button id="btn-whot-market" class="btn-secondary" ${st.finished ? 'disabled' : ''} style="height:94px; width:76px; font-weight:800;">
            📥 Draw<br/>Card
          </button>
        </div>
      </div>
      <div style="font-size:10.5px; text-align:center; color:#cbd5e1;">YOUR HAND (Click a glowing card to play):</div>
      <div class="whot-hand-row">
        ${st.playerHand.map((c, idx) => `
          <div class="whot-card ${canPlay(c) ? 'playable' : ''}" data-idx="${idx}">
            <span class="wc-num">${c.num}</span>
            <span class="wc-shape">${c.sym}</span>
            <span class="wc-bot">${c.num}</span>
          </div>
        `).join('')}
      </div>
    `;

    stage.querySelector('#btn-whot-market')?.addEventListener('click', () => {
      if (st.finished) return;
      if (st.deck.length > 0) {
        st.playerHand.push(st.deck.pop());
      }
      st.status = 'You drew from Market. Opponent is playing...';
      this._whotBotTurn();
    });

    stage.querySelectorAll('.whot-hand-row .whot-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        if (st.finished) return;
        const idx = Number(cardEl.dataset.idx);
        const card = st.playerHand[idx];
        if (!card || !canPlay(card)) {
          this.showToast('⚠️ Card must match active shape or number (or play WHOT 20)!');
          return;
        }
        st.playerHand.splice(idx, 1);
        st.topCard = card.shape === 'whot'
          ? { shape: st.playerHand[0]?.shape || 'circle', sym: st.playerHand[0]?.sym || '●', num: 20 }
          : card;

        if (st.playerHand.length === 0) {
          st.finished = true;
          st.status = '🎉 CHECK UP! You won the Wuse 2 Whot pot (+₦10,000 & +2 Clout)!';
          this.game.earn(10000, { cash: true });
          this.game.stat('clout', 2);
          this.game.stat('sanity', 6);
          this.game.log('Won ₦10,000 pot at the Wuse 2 Naija Whot table!', 'good', '🃏');
          if (this.world3d) this.world3d.spawnNairaRain(32);
          this._renderHUD();
          this._renderWhotStage();
          return;
        }

        // Special Nigerian Whot rules: 1 = Hold On (play again), 2 = Pick Two, 14 = General Market
        if (card.num === 1 || card.num === 8) {
          st.status = `🔥 Played ${card.num} (${card.num === 1 ? 'Hold On' : 'Suspension'})! Play again!`;
          this._renderWhotStage();
          return;
        }
        if (card.num === 2 && st.deck.length >= 2) {
          st.botHand.push(st.deck.pop(), st.deck.pop());
          st.status = '💥 PICK TWO! Opponent drew 2 cards. Your turn again!';
          this._renderWhotStage();
          return;
        }
        if (card.num === 14 && st.deck.length >= 1) {
          st.botHand.push(st.deck.pop());
          st.status = '📢 GENERAL MARKET! Opponent drew 1 card. Your turn again!';
          this._renderWhotStage();
          return;
        }

        this._whotBotTurn();
      });
    });
  }

  _whotBotTurn() {
    const st = this.whotState;
    if (!st || st.finished) return;

    const matchIdx = st.botHand.findIndex(
      (c) => c.shape === 'whot' || c.shape === st.topCard.shape || c.num === st.topCard.num
    );

    if (matchIdx >= 0) {
      const played = st.botHand.splice(matchIdx, 1)[0];
      st.topCard = played.shape === 'whot'
        ? { shape: 'star', sym: '★', num: 20 }
        : played;
      st.status = `Opponent played ${played.sym} ${played.num}. Your turn!`;

      if (st.botHand.length === 0) {
        st.finished = true;
        st.status = '😤 Opponent called CHECK UP first! Click "Play Whot" for a rematch.';
      }
    } else {
      if (st.deck.length > 0) st.botHand.push(st.deck.pop());
      st.status = 'Opponent went to Market! Your turn!';
    }
    this._renderWhotStage();
  }

  _startLudoGame() {
    const stake = 5000;
    if (!this.game.canAfford(stake)) {
      this.showToast('⚠️ Need at least ₦5,000 stake to roll Abuja Ludo!');
      return;
    }
    this.game.pay(stake);
    this._recordDailyProgress('social');

    const stage = document.getElementById('minigame-stage');
    if (!stage) return;
    stage.hidden = false;

    const pDie1 = 1 + Math.floor(Math.random() * 6);
    const pDie2 = 1 + Math.floor(Math.random() * 6);
    const bDie1 = 1 + Math.floor(Math.random() * 6);
    const bDie2 = 1 + Math.floor(Math.random() * 6);

    const pTotal = pDie1 + pDie2 + (pDie1 === 6 && pDie2 === 6 ? 4 : 0);
    const bTotal = bDie1 + bDie2;
    const won = pTotal >= bTotal;

    if (won) {
      this.game.earn(10000, { cash: true });
      this.game.stat('sanity', 5);
      this.game.stat('clout', 1);
      this.game.log(`Won ₦10,000 in Abuja Ludo Dice Duel (${pDie1}+${pDie2} vs ${bDie1}+${bDie2})!`, 'good', '🎲');
      if (this.world3d) this.world3d.spawnNairaRain(28);
    } else {
      this.game.log(`Lost ₦5,000 stake at the Jabi Ludo board (${pDie1}+${pDie2} vs ${bDie1}+${bDie2}).`, 'warn', '🎲');
    }

    stage.innerHTML = `
      <div class="card-top">
        <span class="card-title">🎲 Abuja Ludo High-Stakes Roll (Pot: ₦10,000)</span>
        <span class="card-badge">${won ? '🏆 YOU WON ₦10,000!' : '😤 CHOPPED BY OPPONENT'}</span>
      </div>
      <div class="ludo-dice-box">
        <div style="text-align:center;">
          <div style="font-size:10px; color:#6ee7b7; margin-bottom:4px;">YOUR ROLL (${pDie1 + pDie2})</div>
          <div style="display:flex; gap:6px;">
            <div class="ludo-die">${pDie1}</div>
            <div class="ludo-die">${pDie2}</div>
          </div>
        </div>
        <div style="font-family:var(--font-display); font-size:16px; color:#fde047;">VS</div>
        <div style="text-align:center;">
          <div style="font-size:10px; color:#f9a8d4; margin-bottom:4px;">CHIEF'S ROLL (${bDie1 + bDie2})</div>
          <div style="display:flex; gap:6px;">
            <div class="ludo-die">${bDie1}</div>
            <div class="ludo-die">${bDie2}</div>
          </div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:11.5px; color:#e2e8f0;">${won ? 'Double-six protocol blessed your seeds! +₦10,000 paid.' : 'Your seed got sent back to yard! Roll again?'}</span>
        <button id="btn-ludo-rematch" class="btn-primary">🎲 Roll Again (₦5,000)</button>
      </div>
    `;

    stage.querySelector('#btn-ludo-rematch')?.addEventListener('click', () => this._startLudoGame());
    this._renderHUD();
  }

  _renderCoursesList() {
    const el = document.getElementById('courses-list');
    if (!el) return;
    this._ensureExtendedPlayerState();
    const done = new Set(this.game.s.social.courses || []);

    const courses = [
      {
        id: 'bpp_procurement',
        title: '📜 BPP Federal Procurement & Tender Certification',
        org: 'National Institute for Policy & Strategic Studies',
        cost: 18000,
        clout: 8,
        cashBonus: 0,
        desc: 'Master Certificate of No Objection rules. Grants +8 Protocol Clout immediately to unlock high-tier tenders.'
      },
      {
        id: 'cloud_ai_bootcamp',
        title: '💻 Cloud DevOps & AI Engineering Executive Bootcamp',
        org: 'Jabi Tech Hub & Ventures Platform',
        cost: 25000,
        clout: 6,
        cashBonus: 45000,
        desc: 'Pass the technical sprint assessment. Grants +6 Clout and a ₦45,000 remote FX milestone signing grant!'
      },
      {
        id: 'fcda_land_registry',
        title: '🏛️ AGIS / FCDA Land Registry & C-of-O Law Diploma',
        org: 'Abuja Geographic Information Systems Academy',
        cost: 30000,
        clout: 12,
        cashBonus: 0,
        desc: 'Elite Abuja real estate & C-of-O verification credential. Grants +12 Protocol Clout & Maitama gate access.'
      },
      {
        id: 'baze_exec_mba',
        title: '🎓 Baze University Executive MBA & Public Policy Fellowship',
        org: 'Baze University Abuja (Jabi Campus)',
        cost: 48000,
        clout: 16,
        cashBonus: 0,
        desc: 'Study alongside senators, directors, and Abuja startup founders at Baze University. Grants +16 Protocol Clout.'
      },
      {
        id: 'nysc_kubwa_saed',
        title: '🪖 NYSC Kubwa Camp SAED SME Startup Grant Program',
        org: 'NYSC FCT Orientation Camp (Kubwa)',
        cost: 12000,
        clout: 5,
        cashBonus: 28000,
        desc: 'Complete the Kubwa Orientation Camp entrepreneurship pitch and receive a ₦28,000 FCT SME seed grant + 5 Clout!'
      }
    ];

    el.innerHTML = courses.map((c) => {
      const isDone = done.has(c.id);
      return `
        <div class="game-card" style="background:rgba(15,23,42,0.85);">
          <div class="card-top">
            <span class="card-title">${c.title}</span>
            <span class="card-badge">${isDone ? '✅ CERTIFIED' : formatNairaFull(c.cost)}</span>
          </div>
          <p class="card-desc">${c.desc}</p>
          <div class="card-meta-row">
            <span class="meta-pill pos">+${c.clout} Protocol Clout ${c.cashBonus ? `• +${formatNairaFull(c.cashBonus)} Grant` : ''}</span>
            <button class="btn-primary btn-enroll-course" data-id="${c.id}" ${isDone ? 'disabled' : ''}>
              ${isDone ? 'Diploma Earned' : `Enroll & Certify (${formatNairaFull(c.cost)})`}
            </button>
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.btn-enroll-course').forEach((btn) => {
      btn.addEventListener('click', () => {
        const course = courses.find((x) => x.id === btn.dataset.id);
        if (!course) return;
        if (!this.game.canAfford(course.cost)) {
          this.showToast(`⚠️ Need ${formatNairaFull(course.cost)} tuition to enroll!`);
          return;
        }
        this.game.pay(course.cost);
        if (course.cashBonus) this.game.earn(course.cashBonus, { cash: false });
        this.game.stat('clout', course.clout);
        this.game.s.social.courses.push(course.id);
        this.game.log(`Earned ${course.title} (+${course.clout} Clout)!`, 'good', '🎓');
        if (this.world3d) this.world3d.spawnNairaRain(26);
        this.showToast(`🎓 Certified in ${course.title}! (+${course.clout} Clout)`);
        this._renderAll();
      });
    });
  }

  _renderBaeRelationshipBox() {
    const box = document.getElementById('bae-relationship-box');
    if (!box) return;
    this._ensureExtendedPlayerState();
    const bae = this.game.s.social.bae;

    if (!bae) {
      const candidates = [
        ...this.onlinePlayers.filter((p) => p.id !== this.playerId).map((p) => ({ name: p.name, role: p.career || 'FCT Resident' })),
        { name: 'Amaka (Central Bank Analyst)', role: 'CBN HQ' },
        { name: 'Zainab (Maitama Architect)', role: 'FCDA Consultant' },
        { name: 'Chidi (Wuse 2 Lounge Owner)', role: 'Nightlife Mogul' }
      ];

      box.innerHTML = `
        <p class="card-desc">Single in the FCT? Ask a connected player or Abuja socialite to be your Bae for couple clout & sanity dates:</p>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <select id="bae-candidate-select" style="flex:1; background:#060a12; color:#fff; border:1px solid var(--border-subtle); border-radius:6px; padding:6px;">
            ${candidates.slice(0, 10).map((c) => `<option value="${c.name}">${c.name} (${c.role})</option>`).join('')}
          </select>
          <button id="btn-ask-bae" class="btn-primary">💍 Ask to be Bae (₦10,000 Gift)</button>
        </div>
      `;

      box.querySelector('#btn-ask-bae')?.addEventListener('click', () => {
        const sel = box.querySelector('#bae-candidate-select');
        const partnerName = sel?.value || 'Amaka';
        if (!this.game.canAfford(10000)) {
          this.showToast('⚠️ Need ₦10,000 for Wuse 2 gift box to propose!');
          return;
        }
        this.game.pay(10000);
        this.game.stat('clout', 5);
        this.game.stat('sanity', 15);
        this.game.s.social.bae = { name: partnerName, level: 1, dates: 0 };
        this._recordDailyProgress('social');

        fetch('/api/bae', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromName: this.game.s.meta.name,
            toName: partnerName,
            action: 'propose',
            spot: 'Wuse 2 Rooftop Lounge'
          })
        }).catch(() => {});

        if (this.world3d) this.world3d.spawnNairaRain(30);
        this.showToast(`💖 ${partnerName} said YES! You are now an official Abuja Power Couple!`);
        this._renderAll();
      });
    } else {
      box.innerHTML = `
        <div class="card-top">
          <span class="card-title">💑 Official FCT Bae: <strong style="color:#f9a8d4">${bae.name}</strong></span>
          <span class="card-badge">Couple Level ${bae.level} • ${bae.dates} Dates</span>
        </div>
        <div class="meta-pills" style="gap:6px; margin-top:6px;">
          <button class="btn-primary btn-bae-date" data-spot="Jabi Lake Boat Cruise" data-cost="8000">⛵ Jabi Boat Cruise (₦8,000)</button>
          <button class="btn-primary btn-bae-date" data-spot="Wuse 2 Suya & Rooftop" data-cost="15000">🥂 Wuse 2 Rooftop (₦15,000)</button>
          <button class="btn-secondary" id="btn-breakup-bae">💔 End Relationship</button>
        </div>
      `;

      box.querySelectorAll('.btn-bae-date').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cost = Number(btn.dataset.cost) || 8000;
          const spot = btn.dataset.spot;
          if (!this.game.canAfford(cost)) {
            this.showToast(`⚠️ Need ${formatNairaFull(cost)} for ${spot}!`);
            return;
          }
          this.game.pay(cost);
          bae.dates += 1;
          if (bae.dates % 2 === 0) bae.level += 1;
          this.game.stat('sanity', 22);
          this.game.stat('clout', 4);
          this._recordDailyProgress('social');

          fetch('/api/bae', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromName: this.game.s.meta.name,
              toName: bae.name,
              action: 'date',
              spot
            })
          }).catch(() => {});

          if (this.world3d) this.world3d.spawnNairaRain(24);
          this.showToast(`🥂 Romantic date with ${bae.name} at ${spot}! (+22 Sanity, +4 Clout)`);
          this._renderAll();
        });
      });

      box.querySelector('#btn-breakup-bae')?.addEventListener('click', () => {
        this.game.s.social.bae = null;
        this.showToast('💔 Back to single life in Abuja.');
        this._renderAll();
      });
    }
  }

  // --------------------------------------------------------------------------
  // TAB 7: LIVE FCT HIGH COURT (MAITAMA) & MINISTER POLICY POLLS
  // --------------------------------------------------------------------------
  _renderCourtTab() {
    this._renderCourtCases();
    this._renderPolicyPolls();
  }

  _renderCourtCases() {
    const list = document.getElementById('court-cases-list');
    if (!list) return;

    if (!this.courtCases.length) {
      list.innerHTML = `<div class="game-card"><p class="card-desc">Loading FCT High Court docket...</p></div>`;
      return;
    }

    list.innerHTML = this.courtCases.map((c) => {
      const isSettled = c.status === 'settled';
      return `
        <div class="game-card" style="border-color:${isSettled ? 'rgba(148,163,184,0.3)' : '#f59e0b'};">
          <div class="card-top">
            <span class="card-title">⚖️ ${c.plaintiff} vs. ${c.defendant}</span>
            <span class="card-badge">${isSettled ? '🔨 VERDICT DELIVERED' : `CLAIM: ${formatNairaFull(c.claimAmount)}`}</span>
          </div>
          <p class="card-desc">Charge: <strong>${c.charge}</strong> (${DISTRICT_BY_ID[c.district]?.name || 'Maitama'})</p>
          ${c.verdictText ? `<p class="card-desc" style="color:#4ade80; font-weight:700;">📜 ${c.verdictText}</p>` : ''}
          <div class="card-meta-row">
            <div class="meta-pills">
              <span class="meta-pill pos">👍 Plaintiff Jury: ${c.votesFor}</span>
              <span class="meta-pill neg">🛡️ Defense Jury: ${c.votesAgainst}</span>
            </div>
            ${!isSettled ? `
              <div style="display:flex; gap:5px;">
                <button class="btn-xs btn-court-vote" data-id="${c.id}" data-side="for">Vote Plaintiff</button>
                <button class="btn-xs btn-court-vote" data-id="${c.id}" data-side="against">Vote Defense</button>
                <button class="btn-primary btn-court-verdict" data-id="${c.id}" style="padding:4px 9px; font-size:11px;">🔨 Judge Ruling</button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-court-vote').forEach((btn) => {
      btn.addEventListener('click', () => {
        fetch('/api/court/verdict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: btn.dataset.id, action: 'vote', side: btn.dataset.side })
        }).catch(() => {});
        this.showToast('🗳️ Jury vote recorded at FCT High Court!');
      });
    });

    list.querySelectorAll('.btn-court-verdict').forEach((btn) => {
      btn.addEventListener('click', () => {
        fetch('/api/court/verdict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: btn.dataset.id, action: 'ruling' })
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok && data.caseItem) {
              const ci = data.caseItem;
              const myName = this.game.s.meta.name;
              if (ci.plaintiff === myName && ci.votesFor >= ci.votesAgainst) {
                this.game.earn(ci.claimAmount, { cash: false });
                this.game.stat('clout', 3);
                if (this.world3d) this.world3d.spawnNairaRain(35);
                this.showToast(`⚖️ You won your FCT High Court suit! +${formatNairaFull(ci.claimAmount)} awarded!`);
                this._renderHUD();
              } else {
                this.showToast(`🔨 High Court Ruling delivered: ${ci.verdictText}`);
              }
            }
          })
          .catch(() => {});
      });
    });
  }

  _renderPolicyPolls() {
    const list = document.getElementById('polls-list');
    if (!list) return;

    list.innerHTML = this.policyPolls.map((p) => {
      const total = (p.options || []).reduce((acc, o) => acc + (o.votes || 0), 0) || 1;
      const voted = this.votedPolls.has(p.id);
      return `
        <div class="game-card">
          <div class="card-top">
            <span class="card-title">🗳️ ${p.question}</span>
            <span class="card-badge">${total} FCT Votes</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:5px; margin-top:4px;">
            ${p.options.map((o, idx) => {
              const pct = Math.round(((o.votes || 0) / total) * 100);
              return `
                <button class="btn-secondary btn-vote-poll" data-pid="${p.id}" data-idx="${idx}" ${voted ? 'disabled' : ''} style="display:flex; justify-content:space-between; text-align:left;">
                  <span>${o.label}</span>
                  <strong style="color:#fde047;">${pct}% (${o.votes})</strong>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-vote-poll').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pollId = btn.dataset.pid;
        const optionIndex = Number(btn.dataset.idx);
        this.votedPolls.add(pollId);
        this.game.stat('clout', 1);
        fetch('/api/polls/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pollId, optionIndex })
        }).catch(() => {});
        this.showToast('🗳️ Policy vote cast! (+1 Protocol Clout)');
        this._renderHUD();
      });
    });
  }

  // --------------------------------------------------------------------------
  // TAB 8B: MARKETWISHES.COM SHOPPING CENTER & NIGERIAN TOURIST ATTRACTIONS
  // --------------------------------------------------------------------------
  _renderShopAndTourismTab() {
    this._renderMarketWishesHub();
    this._renderNigeriaTourismHub();
  }

  _renderMarketWishesHub() {
    const box = document.getElementById('marketwishes-hub-box');
    if (!box) return;
    this._ensureExtendedPlayerState();
    const s = this.game.s;
    const ownedSet = new Set(s.social.mwInventory || []);
    const mwPoints = Math.round(s.social.mwPoints || 0);
    const cashbackValue = mwPoints * 50; // 1 MW Point = ₦50 cashback
    const isVendor = Boolean(s.social.mwVendor);
    const canCollectVendor = isVendor && s.social.lastMwVendorDay !== this.game.day;

    const filteredItems = this.selectedMwCategory === 'all'
      ? MARKETWISHES_CATALOG
      : MARKETWISHES_CATALOG.filter((item) => item.category === this.selectedMwCategory);

    box.innerHTML = `
      <div class="career-summary-box" style="background:linear-gradient(135deg, rgba(30,58,138,0.85) 0%, rgba(124,58,237,0.75) 100%); border:1px solid rgba(167,139,250,0.65); margin-bottom:10px;">
        <div class="card-top" style="flex-wrap:wrap; gap:8px;">
          <div>
            <span class="card-badge" style="background:#facc15; color:#090d16; font-weight:800;">🛍️ OFFICIAL SHOPPING CENTER • JABI ABUJA HQ</span>
            <h3 class="card-title" style="margin-top:4px; font-size:16px;">${MARKETWISHES_INFO.name} (marketwishes.com)</h3>
            <p class="card-desc" style="color:#e2e8f0; margin-top:2px;">${MARKETWISHES_INFO.tagline}</p>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <a href="https://marketwishes.com" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="text-decoration:none; border-color:#facc15; color:#fde047; font-size:11.5px; padding:6px 10px;">
              🌐 Visit MarketWishes.com Live ↗
            </a>
            <button type="button" id="btn-mw-fly-jabi" class="btn-secondary" style="font-size:11.5px; padding:6px 10px;">
              📍 Go to Jabi Mall Spot
            </button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:8px; margin-top:8px;">
          <div style="background:rgba(9,13,22,0.65); border:1px solid rgba(250,204,21,0.4); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:10px; color:#fde047; font-weight:700;">🎁 MW LOYALTY POINTS</div>
              <div style="font-size:13px; font-weight:800; color:#fff;">${mwPoints.toLocaleString()} pts (${formatNairaFull(cashbackValue)})</div>
            </div>
            <button type="button" id="btn-redeem-mw-points" class="btn-primary" style="font-size:11px; padding:5px 9px;" ${mwPoints >= 100 ? '' : 'disabled'}>
              💸 Redeem ₦
            </button>
          </div>

          <div style="background:rgba(9,13,22,0.65); border:1px solid rgba(52,211,153,0.45); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:10px; color:#6ee7b7; font-weight:700;">🏪 VENDOR STOREFRONT</div>
              <div style="font-size:12px; font-weight:700; color:#fff;">${isVendor ? '✅ Active Nationwide Seller' : '🔒 Buy License Below (₦65k)'}</div>
            </div>
            ${isVendor ? `
              <button type="button" id="btn-collect-mw-vendor" class="btn-primary" style="font-size:11px; padding:5px 9px;" ${canCollectVendor ? '' : 'disabled'}>
                ${canCollectVendor ? '💰 Collect Daily Sales' : '✅ Paid Today'}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Category Filter Bar -->
        <div style="display:flex; gap:5px; flex-wrap:wrap; margin-top:10px;">
          ${MARKETWISHES_CATEGORIES.map((cat) => `
            <button type="button" class="btn-xs btn-mw-cat" data-cat="${cat.id}" style="${this.selectedMwCategory === cat.id ? 'background:#facc15; color:#090d16; font-weight:800; border-color:#facc15;' : 'background:rgba(15,23,42,0.8); color:#e2e8f0;'}">
              ${cat.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="cards-list">
        ${filteredItems.map((item) => {
          const alreadyOwned = !item.repeatable && ownedSet.has(item.id);
          const effPills = [];
          if (item.effects.energy) effPills.push(`<span class="meta-pill ${item.effects.energy > 0 ? 'pos' : 'neg'}">${item.effects.energy > 0 ? '+' : ''}${item.effects.energy}⚡ Energy</span>`);
          if (item.effects.sanity) effPills.push(`<span class="meta-pill pos">+${item.effects.sanity}🧠 Sanity</span>`);
          if (item.effects.clout) effPills.push(`<span class="meta-pill pos">+${item.effects.clout}🏛️ Clout</span>`);
          if (item.effects.steeze) effPills.push(`<span class="meta-pill pos">+${item.effects.steeze}% ✨ Steeze</span>`);
          if (item.effects.composure) effPills.push(`<span class="meta-pill pos">+${item.effects.composure}% 🧘🏾 Composure</span>`);
          if (item.effects.heat) effPills.push(`<span class="meta-pill pos">${item.effects.heat}🚨 Heat</span>`);

          return `
            <div class="game-card" style="border-left:3px solid ${alreadyOwned ? '#4ade80' : '#a78bfa'};">
              <div class="card-top">
                <span class="card-title">🛍️ ${item.name}</span>
                <span class="card-badge" style="background:${alreadyOwned ? '#065f46' : 'rgba(124,58,237,0.3)'}; color:#fff;">
                  ${alreadyOwned ? '✅ Owned in Inventory' : `${item.badge} • ${formatNairaFull(item.price)}`}
                </span>
              </div>
              <p class="card-desc">${item.desc}</p>
              <div class="card-meta-row" style="flex-wrap:wrap; gap:6px;">
                <div class="meta-pills">
                  ${effPills.join('')}
                </div>
                <button type="button" class="btn-primary btn-buy-mw-item" data-id="${item.id}" ${alreadyOwned ? 'disabled' : ''} style="background:linear-gradient(135deg,#7c3aed,#2563eb);">
                  ${alreadyOwned ? '✅ Purchased' : `🛒 Buy on MarketWishes (${formatNairaFull(item.price)})`}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Category filter click
    box.querySelectorAll('.btn-mw-cat').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMwCategory = btn.dataset.cat || 'all';
        this._renderMarketWishesHub();
      });
    });

    // Fly / Jump to Jabi MarketWishes Mall spot
    box.querySelector('#btn-mw-fly-jabi')?.addEventListener('click', () => {
      this.game.s.loc.district = 'jabi';
      this.game.s.loc.spot = 'marketwishes_hq';
      if (this.world3d) this.world3d.flyToDistrict('jabi', false);
      this.showToast('🛍️ Arrived at MarketWishes.com Smart Shopping Center in Jabi!');
      this._renderAll();
    });

    // Redeem MW Loyalty Points
    box.querySelector('#btn-redeem-mw-points')?.addEventListener('click', () => {
      const pts = Math.round(s.social.mwPoints || 0);
      if (pts < 100) {
        this.showToast('⚠️ Need at least 100 MW Points to redeem cashback!');
        return;
      }
      const rewardNgn = pts * 50;
      s.social.mwPoints = 0;
      this.game.earn(rewardNgn, { cash: true });
      this.game.log(`🎁 Redeemed ${pts} MarketWishes Loyalty Points for ${formatNairaFull(rewardNgn)} instant Naira cashback!`, 'good', '🛍️');
      if (this.world3d) this.world3d.spawnNairaRain(24);
      this.showToast(`💸 Redeemed ${pts} MW Points for ${formatNairaFull(rewardNgn)} cashback!`);
      this._renderAll();
      this._saveGame();
    });

    // Collect daily MarketWishes Vendor Store payout
    box.querySelector('#btn-collect-mw-vendor')?.addEventListener('click', () => {
      if (!s.social.mwVendor || s.social.lastMwVendorDay === this.game.day) return;
      s.social.lastMwVendorDay = this.game.day;
      const payout = 45000 + Math.floor(Math.random() * 45000);
      this.game.earn(payout, { bank: true });
      this.game.stat('clout', 2);
      s.social.mwPoints = (s.social.mwPoints || 0) + 180;
      this.game.log(`🏪 MarketWishes.com Vendor Payout: Nationwide customer orders delivered! Earned ${formatNairaFull(payout)} (+180 MW Points).`, 'good', '🛍️');
      if (this.world3d) this.world3d.spawnNairaRain(28);
      this.showToast(`🏪 MarketWishes Vendor Sales: +${formatNairaFull(payout)} wired to bank!`);
      this._renderAll();
      this._saveGame();
    });

    // Buy MarketWishes item
    box.querySelectorAll('.btn-buy-mw-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.id;
        const item = MARKETWISHES_CATALOG.find((x) => x.id === itemId);
        if (!item) return;

        if (!this.game.canAfford(item.price)) {
          this.showToast(`⚠️ Insufficient Naira! Need ${formatNairaFull(item.price)} to order ${item.name}.`);
          return;
        }

        this.game.pay(item.price);
        const eff = item.effects || {};
        if (eff.energy) this.game.stat('energy', eff.energy);
        if (eff.sanity) this.game.stat('sanity', eff.sanity);
        if (eff.clout) this.game.stat('clout', eff.clout);
        if (eff.heat) this.game.stat('heat', eff.heat);
        if (eff.steeze) s.social.steeze = Math.min(100, Math.max(0, (s.social.steeze || 80) + eff.steeze));
        if (eff.composure) s.social.composure = Math.min(100, Math.max(0, (s.social.composure || 80) + eff.composure));

        if (!item.repeatable && !s.social.mwInventory.includes(item.id)) {
          s.social.mwInventory.push(item.id);
        }
        if (item.unlocksVendor) {
          s.social.mwVendor = true;
        }
        if (item.installsSolar) {
          s.social.solarInstalled = true;
        }

        const earnedPts = Math.max(25, Math.round(item.price / 1000));
        s.social.mwPoints = (s.social.mwPoints || 0) + earnedPts;
        this._recordDailyProgress('social');

        this.game.log(`🛍️ Ordered "${item.name}" on MarketWishes.com for ${formatNairaFull(item.price)} (+${earnedPts} MW Loyalty Points)!`, 'good', '🛍️');
        if (this.world3d) this.world3d.spawnNairaRain(26);
        this.showToast(`🛍️ MarketWishes Delivery: ${item.name}! (+${earnedPts} MW Points)`);
        this._renderAll();
        this._saveGame();
      });
    });
  }

  _renderNigeriaTourismHub() {
    const box = document.getElementById('nigeria-tourism-hub-box');
    if (!box) return;
    this._ensureExtendedPlayerState();
    const s = this.game.s;
    const visited = new Set(s.social.visitedAttractions || []);

    const zones = [
      { id: 'all', label: '🇳🇬 All 36 States & FCT' },
      { id: 'North Central', label: '🏛️ North Central (FCT/Niger/Plateau)' },
      { id: 'South West', label: '🦁 South West (Lagos/Ogun/Osun/Oyo)' },
      { id: 'South South', label: '🌊 South South (Cross River/Rivers/Delta)' },
      { id: 'South East', label: '🏺 South East (Anambra/Enugu/Abia/Imo)' },
      { id: 'North West', label: '🐎 North West (Kano/Kaduna/Sokoto/Kebbi)' },
      { id: 'North East', label: '⛰️ North East (Bauchi/Taraba/Adamawa/Borno)' }
    ];

    const filteredStates = this.selectedTourismZone === 'all'
      ? NIGERIA_TOURIST_ATTRACTIONS
      : NIGERIA_TOURIST_ATTRACTIONS.filter((st) => st.zone === this.selectedTourismZone);

    box.innerHTML = `
      <div class="career-summary-box" style="border-color:rgba(16,185,129,0.55); margin-bottom:10px;">
        <div class="card-top" style="flex-wrap:wrap; gap:8px;">
          <div>
            <span class="card-badge" style="background:rgba(16,185,129,0.2); color:#6ee7b7;">🗺️ INFORMATION ON NIGERIA: TOURIST ATTRACTIONS</span>
            <h3 class="card-title" style="margin-top:4px;">Official Nigerian Tourist Centers &amp; Heritage Passport</h3>
            <p class="card-desc">Stamped Tourist Attractions &amp; States: <strong style="color:#4ade80;">${visited.size} / ${NIGERIA_TOURIST_ATTRACTIONS.length}</strong> • Tour any state's attractions for Sanity, Protocol Clout &amp; Steeze!</p>
          </div>
          <button type="button" id="btn-toggle-ng-almanac" class="btn-secondary" style="border-color:#38bdf8; color:#7dd3fc;">
            📖 ${this.showNigeriaAlmanac ? 'Hide' : 'Read'} "Information About Nigeria" Almanac
          </button>
        </div>

        ${this.showNigeriaAlmanac ? `
          <div style="background:rgba(9,13,22,0.85); border:1px solid rgba(56,189,248,0.35); border-radius:8px; padding:10px 12px; margin-top:8px; font-size:11.5px; line-height:1.45; color:#e2e8f0;">
            <div style="font-weight:800; color:#fde047; margin-bottom:4px;">🇳🇬 ${NIGERIA_ENCYCLOPEDIA_INFO.title}</div>
            <div>• <strong>Physical Coordinates:</strong> ${NIGERIA_ENCYCLOPEDIA_INFO.coordinates}</div>
            <div>• <strong>Borders &amp; Coastline:</strong> ${NIGERIA_ENCYCLOPEDIA_INFO.borders}</div>
            <div>• <strong>Climate &amp; Seasons:</strong> ${NIGERIA_ENCYCLOPEDIA_INFO.seasons}</div>
            <div>• <strong>Natural Resources:</strong> ${NIGERIA_ENCYCLOPEDIA_INFO.populationAndResources}</div>
            <div>• <strong>Ancient Art &amp; Culture:</strong> ${NIGERIA_ENCYCLOPEDIA_INFO.culturalHeritage}</div>
            <div>• <strong>Political Evolution:</strong> ${NIGERIA_ENCYCLOPEDIA_INFO.politicalStructure}</div>
            <div>• <strong>Official Currency:</strong> ${NIGERIA_ENCYCLOPEDIA_INFO.currency}</div>
          </div>
        ` : ''}

        <!-- Geopolitical Zone Filter Pills -->
        <div style="display:flex; gap:5px; flex-wrap:wrap; margin-top:10px;">
          ${zones.map((z) => `
            <button type="button" class="btn-xs btn-tourism-zone" data-zone="${z.id}" style="${this.selectedTourismZone === z.id ? 'background:#10b981; color:#090d16; font-weight:800; border-color:#10b981;' : ''}">
              ${z.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="cards-list">
        ${filteredStates.map((st) => {
          const isStamped = visited.has(st.state);
          return `
            <div class="game-card" style="border-left:3px solid ${isStamped ? '#facc15' : '#10b981'};">
              <div class="card-top">
                <div>
                  <span class="card-title">📍 ${st.state} Tourist Attractions</span>
                  <span class="card-badge" style="margin-left:6px;">${st.zone} Zone</span>
                </div>
                <span class="card-badge" style="background:${isStamped ? '#065f46' : 'rgba(30,41,59,0.9)'}; color:${isStamped ? '#fde047' : '#93c5fd'};">
                  ${isStamped ? '🛂 Passport Stamped' : `Excursion: ${formatNairaFull(st.cost)}`}
                </span>
              </div>
              <p class="card-desc" style="color:#cbd5e1; margin-bottom:6px;">${st.highlight}</p>
              <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
                ${st.attractions.map((attr) => `
                  <span class="landmark-chip" style="background:rgba(15,23,42,0.9); color:#a7f3d0; border-color:rgba(16,185,129,0.3);">🏛️ ${attr}</span>
                `).join('')}
              </div>
              <div class="card-meta-row" style="flex-wrap:wrap; gap:6px;">
                <div class="meta-pills">
                  <span class="meta-pill pos">+${st.sanity}🧠 Sanity</span>
                  <span class="meta-pill pos">+${st.clout}🏛️ Clout</span>
                  <span class="meta-pill pos">+${st.steeze}% ✨ Steeze</span>
                </div>
                <button type="button" class="btn-primary btn-tour-state" data-state="${st.state}">
                  ✈️ ${isStamped ? `Tour ${st.state} Again (${formatNairaFull(st.cost)})` : `Book Excursion to ${st.state} (${formatNairaFull(st.cost)})`}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    box.querySelector('#btn-toggle-ng-almanac')?.addEventListener('click', () => {
      this.showNigeriaAlmanac = !this.showNigeriaAlmanac;
      this._renderNigeriaTourismHub();
    });

    box.querySelectorAll('.btn-tourism-zone').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedTourismZone = btn.dataset.zone || 'all';
        this._renderNigeriaTourismHub();
      });
    });

    box.querySelectorAll('.btn-tour-state').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stateName = btn.dataset.state;
        const st = NIGERIA_TOURIST_ATTRACTIONS.find((x) => x.state === stateName);
        if (!st) return;

        if (!this.game.canAfford(st.cost)) {
          this.showToast(`⚠️ Need ${formatNairaFull(st.cost)} to book an excursion to ${st.state}!`);
          return;
        }

        this.game.pay(st.cost);
        this.game.stat('sanity', st.sanity);
        this.game.stat('clout', st.clout);
        s.social.steeze = Math.min(100, Math.max(0, (s.social.steeze || 80) + st.steeze));
        s.social.composure = Math.min(100, Math.max(0, (s.social.composure || 80) + 5));
        if (!s.social.visitedAttractions.includes(st.state)) {
          s.social.visitedAttractions.push(st.state);
        }
        if (st.featuredDistrict && DISTRICT_BY_ID[st.featuredDistrict]) {
          this.game.s.loc.district = st.featuredDistrict;
          if (this.world3d) this.world3d.flyToDistrict(st.featuredDistrict, false);
        }

        this._recordDailyProgress('move');
        const sampleSite = st.attractions[Math.floor(Math.random() * st.attractions.length)];
        this.game.log(`🗺️ Nigerian Tourism Excursion to ${st.state} (${sampleSite})! +${st.sanity}🧠 Sanity, +${st.clout}🏛️ Clout, +${st.steeze}% Steeze.`, 'good', '🗺️');
        if (this.world3d) this.world3d.spawnNairaRain(24);
        this.showToast(`📸 Stamped ${st.state} (${sampleSite}) in your Nigerian Tourism Passport!`);
        this._renderAll();
        this._saveGame();
      });
    });
  }

  // --------------------------------------------------------------------------
  // TAB 9: FCT CHRONICLE LOG
  // --------------------------------------------------------------------------
  _renderFeedTab() {
    const list = document.getElementById('feed-log-list');
    if (!list) return;
    const logs = this.game.s.log || [];
    list.innerHTML = logs.slice(0, 40).map((entry) => `
      <div class="feed-item">
        <strong>[Day ${Clock.dayNumber(entry.t)} • ${Clock.clockStr(entry.t)}]</strong> ${entry.icon || ''} ${entry.text}
      </div>
    `).join('');
  }

  // --------------------------------------------------------------------------
  // 6. REAL-TIME MULTIPLAYER BRIDGE (SSE + HIGH-UNREAD SAFE CHAT + COURT)
  // --------------------------------------------------------------------------
  _initMultiplayerBridge() {
    this._sendHeartbeat();
    setInterval(() => this._sendHeartbeat(), 8000);

    this._fetchInitialMultiplayerState();
    this._connectEventStream();
  }

  _fetchInitialMultiplayerState() {
    // Paginated chat fetch (fixes Shalom_HeyEliy's high-unread-count bug)
    fetch('/api/chat?limit=60')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages)) {
          this.chatMessages = data.messages;
          this.hasMoreChatHistory = Boolean(data.hasMore);
          this._recalculateInitialUnread();
          this._renderChatMessages();
        }
      })
      .catch(() => {});

    fetch('/api/players')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.players)) {
          this._updateOnlinePlayers(data.players);
        }
      })
      .catch(() => {});

    fetch('/api/court')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.cases)) {
          this.courtCases = data.cases;
          this._renderCourtCases();
        }
      })
      .catch(() => {});

    fetch('/api/polls')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.polls)) {
          this.policyPolls = data.polls;
          this._renderPolicyPolls();
        }
      })
      .catch(() => {});

    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.tasks)) {
          this.playerTasks = data.tasks;
          this._renderP2PTasksSection();
        }
      })
      .catch(() => {});
  }

  _connectEventStream() {
    try {
      if (this.eventSource) {
        this.eventSource.close();
      }
      this.eventSource = new EventSource('/api/stream');

      this.eventSource.onopen = () => {
        this._setNetworkGoSlow(false);
      };

      this.eventSource.onerror = () => {
        this._setNetworkGoSlow(true);
      };

      this.eventSource.addEventListener('init', (e) => {
        this._setNetworkGoSlow(false);
        const payload = JSON.parse(e.data);
        if (Array.isArray(payload.players)) this._updateOnlinePlayers(payload.players);
        if (Array.isArray(payload.chat)) {
          this.chatMessages = payload.chat;
          this._recalculateInitialUnread();
          this._renderChatMessages();
        }
        if (Array.isArray(payload.courtCases)) {
          this.courtCases = payload.courtCases;
          this._renderCourtCases();
        }
        if (Array.isArray(payload.polls)) {
          this.policyPolls = payload.polls;
          this._renderPolicyPolls();
        }
        if (Array.isArray(payload.tasks)) {
          this.playerTasks = payload.tasks;
          this._renderP2PTasksSection();
        }
      });

      this.eventSource.addEventListener('players', (e) => {
        const players = JSON.parse(e.data);
        if (Array.isArray(players)) this._updateOnlinePlayers(players);
      });

      this.eventSource.addEventListener('chat', (e) => {
        const msg = JSON.parse(e.data);
        this._handleIncomingChatMessage(msg);
      });

      this.eventSource.addEventListener('transfer', (e) => {
        const tx = JSON.parse(e.data);
        this._handleIncomingNairaTransfer(tx);
      });

      this.eventSource.addEventListener('connection', (e) => {
        const conn = JSON.parse(e.data);
        this._handleIncomingPlayerConnection(conn);
      });

      this.eventSource.addEventListener('court', (e) => {
        const cases = JSON.parse(e.data);
        if (Array.isArray(cases)) {
          this.courtCases = cases;
          this._renderCourtCases();
        }
      });

      this.eventSource.addEventListener('polls', (e) => {
        const polls = JSON.parse(e.data);
        if (Array.isArray(polls)) {
          this.policyPolls = polls;
          this._renderPolicyPolls();
        }
      });

      this.eventSource.addEventListener('tasks', (e) => {
        const tasks = JSON.parse(e.data);
        if (Array.isArray(tasks)) {
          this.playerTasks = tasks;
          this._renderP2PTasksSection();
        }
      });

      this.eventSource.addEventListener('task_completed', (e) => {
        const task = JSON.parse(e.data);
        this._handleCompletedPlayerTask(task);
      });

      this.eventSource.addEventListener('world_event', (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === 'naira_spray' && this.world3d) {
          this.world3d.spawnNairaRain(30);
        }
      });
    } catch (_) {
      this._setNetworkGoSlow(true);
    }
  }

  _setNetworkGoSlow(isSlow) {
    const pill = document.getElementById('net-status-pill');
    if (pill) pill.hidden = !isSlow;
  }

  _forceNetworkResync() {
    this._setNetworkGoSlow(false);
    this._fetchInitialMultiplayerState();
    this._connectEventStream();
    this.showToast('📡 FCT Network resynced cleanly!');
  }

  _sendHeartbeat() {
    const s = this.game.s;
    const curD = DISTRICT_BY_ID[s.loc.district] || DISTRICT_BY_ID.cbd;
    const coords = this.world3d
      ? this.world3d.getPlayer2DCoords()
      : { x: curD.x, y: curD.y };

    fetch('/api/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.playerId,
        name: s.meta.name,
        district: s.loc.district,
        career: TRACKS[s.career.track]?.name || s.career.track,
        clout: Math.round(s.clout),
        netWorth: netWorth(s),
        x: Number(coords.x.toFixed(2)),
        y: Number(coords.y.toFixed(2))
      })
    }).catch(() => {});
  }

  _updateOnlinePlayers(players) {
    this.onlinePlayers = players;
    const count = players.length;

    const pill = document.getElementById('hud-online-pill');
    if (pill) pill.textContent = `● ${count} ONLINE`;

    const mpCount = document.getElementById('mp-online-count');
    if (mpCount) mpCount.textContent = count;

    if (this.world3d) {
      this.world3d.syncRemotePlayers(players, this.playerId);
    }

    this._renderMultiplayerRoster();
    this._populateWireRecipients();
  }

  _renderMultiplayerRoster() {
    const container = document.getElementById('mp-players-list');
    if (!container) return;

    const others = this.onlinePlayers.filter((p) => p.id !== this.playerId);
    if (!others.length) {
      container.innerHTML = `<div class="mp-player-card"><span class="card-desc">Scanning FCT frequencies...</span></div>`;
      return;
    }

    container.innerHTML = others.map((p) => {
      const distName = DISTRICT_BY_ID[p.district]?.short || p.district;
      const isConnected = this.connectedPlayerIds.has(p.id);
      return `
        <div class="mp-player-card ${p.isBot ? 'is-bot' : 'is-human'}">
          <div class="mp-p-top">
            <span class="mp-p-name">${p.isBot ? '🤖 ' : '🟢 '}${p.name}</span>
            <span class="mp-p-loc">📍 ${distName}</span>
          </div>
          <div class="mp-p-worth">${formatNairaFull(p.netWorth || 0)} • 🏛️ ${p.clout || 10}</div>
          <div class="mp-p-actions">
            <button class="btn-secondary btn-mp-connect" data-id="${p.id}" data-name="${p.name}" data-district="${p.district}" data-career="${p.career}">
              ${isConnected ? '✓ Linked' : '🤝 Connect'}
            </button>
            <button class="btn-xs btn-mp-task" data-id="${p.id}" data-name="${p.name}">📋 Hire</button>
            <button class="btn-xs btn-mp-dm" data-id="${p.id}" data-name="${p.name}">💬 DM</button>
            <button class="btn-xs btn-mp-wire" data-id="${p.id}" data-name="${p.name}">💸 ₦</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-mp-connect').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.connectWithPlayer({
          id: btn.dataset.id,
          name: btn.dataset.name,
          district: btn.dataset.district,
          career: btn.dataset.career
        });
      });
    });

    container.querySelectorAll('.btn-mp-task').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        this.switchTab('network');
        const sel = document.getElementById('task-assignee-select');
        if (sel) sel.value = id;
        const form = document.getElementById('assign-task-form');
        if (form) form.scrollIntoView({ behavior: 'smooth' });
        this.showToast(`📋 Hiring ${name}! Fill reward and dispatch task.`);
      });
    });

    container.querySelectorAll('.btn-mp-dm').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openDirectMessage(btn.dataset.id, btn.dataset.name);
      });
    });

    container.querySelectorAll('.btn-mp-wire').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openNairaVaultModal(btn.dataset.id);
      });
    });
  }

  connectWithPlayer(targetPlayer) {
    if (!targetPlayer || !targetPlayer.id) return;
    if (this.connectedPlayerIds.has(targetPlayer.id)) {
      this.showToast(`🤝 Already linked with ${targetPlayer.name}!`);
      return;
    }

    this.connectedPlayerIds.add(targetPlayer.id);
    this._recordDailyProgress('social');

    const exists = this.game.s.contacts.some((c) => c.name === targetPlayer.name);
    if (!exists) {
      this.game.s.contacts.push({
        id: `mp_${targetPlayer.id}`,
        playerId: targetPlayer.id,
        name: targetPlayer.name,
        type: 'civil_servant',
        tier: 2,
        org: `FCT Player (${targetPlayer.career || 'Ally'})`,
        affinity: 75,
        lastT: this.game.s.t,
        isRealPlayer: true
      });
      this.game.stat('clout', 3);
      this.game.log(`Linked up with FCT player ${targetPlayer.name} (+3 Protocol).`, 'good', '🤝');
    }

    fetch('/api/connect-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromId: this.playerId,
        fromName: this.game.s.meta.name,
        toId: targetPlayer.id,
        toName: targetPlayer.name,
        district: this.game.s.loc.district
      })
    }).catch(() => {});

    this.showToast(`🤝 Connected with ${targetPlayer.name}! Added to your Rolodex (+3 Clout).`);
    this._renderAll();
    this._renderMultiplayerRoster();
  }

  _handleIncomingPlayerConnection(conn) {
    if (conn.toId !== this.playerId && conn.toName !== this.game.s.meta.name) return;
    if (this.connectedPlayerIds.has(conn.fromId)) return;

    this.connectedPlayerIds.add(conn.fromId);
    this.game.s.contacts.push({
      id: `mp_${conn.fromId}`,
      playerId: conn.fromId,
      name: conn.fromName,
      type: 'contractor',
      tier: 2,
      org: 'Connected FCT Player',
      affinity: 75,
      lastT: this.game.s.t,
      isRealPlayer: true
    });
    this.game.stat('clout', 2);
    this.showToast(`🤝 ${conn.fromName} connected with you on the FCT Network! (+2 Clout)`);
    this._renderAll();
  }

  _handleIncomingNairaTransfer(tx) {
    if (tx.toId === this.playerId || tx.toName === this.game.s.meta.name) {
      this.game.earn(tx.amount, { cash: true });
      this.game.log(`Received ${formatNairaFull(tx.amount)} CBN wire from ${tx.fromName} ("${tx.note}").`, 'good', '💸');
      if (this.world3d) this.world3d.spawnNairaRain(36);
      this._renderHUD();
      this._saveGame();
    }
  }

  // --------------------------------------------------------------------------
  // HIGH-UNREAD-COUNT SAFE PAGINATED CHAT (FIXES SHALOM_HEYELIY TWEET BUG)
  // --------------------------------------------------------------------------
  _recalculateInitialUnread() {
    // Simulate a realistic unread queue when player first opens the app so they can see the recovery bar in action
    const total = this.chatMessages.length;
    if (total > 0 && this.activeTab !== 'multiplayer') {
      this.unreadByChannel.global = Math.min(total, 12);
      const curDist = this.game.s.loc.district;
      this.unreadByChannel.district = this.chatMessages.filter((m) => m.district === curDist && m.channel !== 'dm').length;
      this.unreadByChannel.dm = this.chatMessages.filter((m) => m.channel === 'dm').length;
    }
    this._updateUnreadBadges();
  }

  _handleIncomingChatMessage(msg) {
    if (!msg || !msg.id) return;
    if (this.chatMessages.some((m) => m.id === msg.id)) return;
    this.chatMessages.push(msg);
    if (this.chatMessages.length > 250) this.chatMessages.shift();

    const senderName = msg.sender || msg.author || 'Citizen';
    if (this.world3d && msg.senderId !== this.playerId) {
      this.world3d.showPlayerSpeechBubble(msg.senderId, senderName, msg.text);
    }

    const preview = document.getElementById('quick-chat-preview');
    if (preview) {
      const distLabel = DISTRICT_BY_ID[msg.district]?.short || 'FCT';
      preview.innerHTML = `<strong style="color:#fde047">${senderName} [${distLabel}]:</strong> ${msg.text}`;
    }

    // Track unread counts per channel & thread when player isn't actively viewing that channel
    if (msg.senderId !== this.playerId) {
      if (msg.channel === 'dm') {
        if (this.activeTab !== 'multiplayer' || this.chatChannel !== 'dm') {
          this.unreadByChannel.dm = (this.unreadByChannel.dm || 0) + 1;
        }
        const peerKey = msg.senderId || senderName;
        this.unreadByThread[peerKey] = {
          id: msg.senderId,
          name: senderName,
          count: (this.unreadByThread[peerKey]?.count || 0) + 1
        };
      } else {
        if (this.activeTab !== 'multiplayer' || this.chatChannel !== 'global') {
          this.unreadByChannel.global = (this.unreadByChannel.global || 0) + 1;
        }
        if (msg.district === this.game.s.loc.district && (this.activeTab !== 'multiplayer' || this.chatChannel !== 'district')) {
          this.unreadByChannel.district = (this.unreadByChannel.district || 0) + 1;
        }
      }
    }

    this._updateUnreadBadges();
    this._renderChatMessages();
  }

  _updateUnreadBadges() {
    const gCount = this.unreadByChannel.global || 0;
    const dCount = this.unreadByChannel.district || 0;
    const dmCount = this.unreadByChannel.dm || 0;
    const totalUnread = gCount + dmCount;

    const tabBadge = document.getElementById('chat-unread-badge');
    if (tabBadge) {
      tabBadge.textContent = totalUnread > 0 ? `${totalUnread}` : 'LIVE';
      tabBadge.style.background = totalUnread > 0 ? '#ec4899' : '#10b981';
    }

    const setPill = (id, count) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.hidden = count <= 0;
      el.textContent = count > 99 ? '99+' : String(count);
    };
    setPill('unread-global', gCount);
    setPill('unread-district', dCount);
    setPill('unread-dm', dmCount);
    setPill('dock-chat-badge', totalUnread);

    const recoveryBar = document.getElementById('chat-unread-recovery-bar');
    const summaryEl = document.getElementById('chat-unread-summary');
    const olderBtn = document.getElementById('btn-load-older-chat');

    if (recoveryBar && summaryEl) {
      const showBar = totalUnread > 0 || this.hasMoreChatHistory || this.chatMessages.length > 25;
      recoveryBar.hidden = !showBar;
      summaryEl.textContent = totalUnread > 0
        ? `💬 ${totalUnread} unread messages waiting (Paginated & Zero-Freeze)`
        : `💬 ${this.chatMessages.length} messages synced cleanly`;
    }
    if (olderBtn) {
      olderBtn.hidden = !this.hasMoreChatHistory;
    }
  }

  markAllChatRead() {
    this.unreadByChannel = { global: 0, district: 0, dm: 0 };
    Object.keys(this.unreadByThread).forEach((k) => {
      if (this.unreadByThread[k]) this.unreadByThread[k].count = 0;
    });
    this._updateUnreadBadges();
    this._renderDMThreadsBar();
    this.showToast('✓ All unread FCT conversations marked as read!');
  }

  loadOlderChatMessages() {
    const oldest = this.chatMessages[0];
    if (!oldest) return;
    fetch(`/api/chat?limit=50&before=${encodeURIComponent(oldest.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          const existingIds = new Set(this.chatMessages.map((m) => m.id));
          const olderUnique = data.messages.filter((m) => !existingIds.has(m.id));
          this.chatMessages = [...olderUnique, ...this.chatMessages];
          this.chatRenderLimit += olderUnique.length;
          this.hasMoreChatHistory = Boolean(data.hasMore);
          this._updateUnreadBadges();
          this._renderChatMessages({ preserveScroll: true });
          this.showToast(`📜 Loaded ${olderUnique.length} older messages cleanly.`);
        } else {
          this.hasMoreChatHistory = false;
          this._updateUnreadBadges();
          this.showToast('📜 Reached the beginning of FCT chat history.');
        }
      })
      .catch(() => {});
  }

  _renderDMThreadsBar() {
    const bar = document.getElementById('mp-dm-threads');
    if (!bar) return;

    // Collect distinct DM peers from messages + connected players
    const peersMap = new Map();
    for (const m of this.chatMessages) {
      if (m.channel === 'dm') {
        const isMe = m.senderId === this.playerId;
        const pid = isMe ? (m.toId || m.targetId) : m.senderId;
        const pname = isMe ? (m.toName || 'FCT Player') : (m.sender || m.author);
        if (pid && pname && pid !== this.playerId) {
          peersMap.set(pid, { id: pid, name: pname });
        }
      }
    }
    for (const p of this.onlinePlayers) {
      if (p.id !== this.playerId && this.connectedPlayerIds.has(p.id)) {
        peersMap.set(p.id, { id: p.id, name: p.name });
      }
    }

    const peers = Array.from(peersMap.values());
    if (this.chatChannel !== 'dm' || peers.length === 0) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;
    const allPill = `
      <button type="button" class="dm-thread-pill ${!this.dmTarget ? 'active' : ''}" data-id="" data-name="">
        📬 All DMs
      </button>
    `;
    const threadPills = peers.map((peer) => {
      const uCount = this.unreadByThread[peer.id]?.count || 0;
      const isActive = this.dmTarget && (this.dmTarget.id === peer.id || this.dmTarget.name === peer.name);
      return `
        <button type="button" class="dm-thread-pill ${isActive ? 'active' : ''}" data-id="${peer.id}" data-name="${peer.name}">
          🔒 ${peer.name} ${uCount > 0 ? `(${uCount})` : ''}
        </button>
      `;
    }).join('');

    bar.innerHTML = allPill + threadPills;
    bar.querySelectorAll('.dm-thread-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.id;
        const tname = btn.dataset.name;
        if (!tid) {
          this.dmTarget = null;
          const dmBar = document.getElementById('mp-dm-target-bar');
          if (dmBar) dmBar.hidden = true;
          this._renderDMThreadsBar();
          this._renderChatMessages();
        } else {
          this.openDirectMessage(tid, tname);
        }
      });
    });
  }

  _renderChatMessages(opts = {}) {
    const box = document.getElementById('mp-chat-messages');
    if (!box) return;

    const myName = this.game.s.meta.name;
    const curDist = this.game.s.loc.district;

    const filtered = this.chatMessages.filter((m) => {
      if (this.chatChannel === 'global') return m.channel !== 'dm';
      if (this.chatChannel === 'district') return m.district === curDist && m.channel !== 'dm';
      if (this.chatChannel === 'dm') {
        if (!this.dmTarget) return m.channel === 'dm';
        const targetId = m.toId || m.targetId;
        const senderName = m.sender || m.author;
        return (
          m.channel === 'dm' &&
          (m.senderId === this.dmTarget.id ||
            targetId === this.dmTarget.id ||
            senderName === this.dmTarget.name ||
            m.toName === this.dmTarget.name)
        );
      }
      return true;
    });

    // Windowed slice so even 500+ unread messages render in <2ms without freezing the browser
    const windowed = filtered.slice(-this.chatRenderLimit);

    box.innerHTML = windowed.map((m) => {
      const senderName = m.sender || m.author || 'Citizen';
      const isSelf = m.senderId === this.playerId || senderName === myName;
      const isDM = m.channel === 'dm';
      const isSys = ['cbn_wire', 'fct_protocol', 'wuse_hype', 'fct_court', 'fct_love'].includes(m.senderId);
      const distShort = DISTRICT_BY_ID[m.district]?.short || m.district || 'FCT';
      const timeStr = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="chat-msg-bubble ${isSelf ? 'is-self' : ''} ${isDM ? 'is-dm' : ''} ${isSys ? 'is-system' : ''}">
          <div class="chat-msg-head">
            <span class="chat-sender" data-id="${m.senderId}" data-name="${senderName}">
              ${isDM ? '🔒 ' : ''}${senderName} ${m.toName ? `→ ${m.toName}` : ''}
            </span>
            <span class="chat-meta">📍 ${distShort} • ${timeStr}</span>
          </div>
          <div class="chat-text">${m.text}</div>
        </div>
      `;
    }).join('');

    if (!opts.preserveScroll) {
      box.scrollTop = box.scrollHeight;
    }

    this._renderDMThreadsBar();

    box.querySelectorAll('.chat-sender').forEach((el) => {
      el.addEventListener('click', () => {
        const sid = el.dataset.id;
        const sname = el.dataset.name;
        if (sid && sid !== this.playerId && !['cbn_wire', 'fct_protocol', 'wuse_hype', 'fct_court', 'fct_love'].includes(sid)) {
          this.openDirectMessage(sid, sname);
        }
      });
    });
  }

  openDirectMessage(targetId, targetName) {
    this.dmTarget = { id: targetId, name: targetName };
    this.chatChannel = 'dm';
    this.unreadByChannel.dm = 0;
    if (this.unreadByThread[targetId]) {
      this.unreadByThread[targetId].count = 0;
    }
    this._updateUnreadBadges();

    document.querySelectorAll('.mp-chan-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.channel === 'dm');
    });

    const dmBar = document.getElementById('mp-dm-target-bar');
    if (dmBar) {
      dmBar.hidden = false;
      document.getElementById('mp-dm-target-name').textContent = targetName;
    }

    this._renderChatMessages();
    document.getElementById('mp-chat-input')?.focus();
  }

  // --------------------------------------------------------------------------
  // 7. CBN PHYSICAL NAIRA VAULT & PEER-TO-PEER WIRE MODAL
  // --------------------------------------------------------------------------
  openNairaVaultModal(preselectPlayerId = '') {
    const modal = document.getElementById('naira-vault-modal');
    if (!modal) return;

    const funds = Math.round(this.game.funds());
    const bd = breakdownNairaNotes(funds);

    document.getElementById('vault-total-amount').textContent = formatNairaFull(funds);
    document.getElementById('vault-strap-summary').textContent =
      `Cash: ${formatNairaFull(this.game.s.cash)} • Bank: ${formatNairaFull(this.game.s.bank)} (${bd.bundles100k} × ₦100k Straps)`;

    const showcase = document.getElementById('vault-notes-showcase');
    if (showcase) {
      const denoms = [
        { d: 1000, count: bd.n1000 },
        { d: 500, count: bd.n500 },
        { d: 200, count: bd.n200 },
        { d: 100, count: bd.n100 }
      ];
      showcase.innerHTML = denoms.map((item) => `
        <div class="vault-note-slot">
          ${renderNairaNoteSVG(item.d, { width: 250, height: 116 })}
          <span class="vault-note-count">${item.count.toLocaleString()} × ₦${item.d}</span>
        </div>
      `).join('');
    }

    this._populateWireRecipients(preselectPlayerId);
    modal.hidden = false;
  }

  _populateWireRecipients(preselectId = '') {
    const sel = document.getElementById('wire-recipient-select');
    if (!sel) return;
    const others = this.onlinePlayers.filter((p) => p.id !== this.playerId);
    sel.innerHTML = others.map((p) => `
      <option value="${p.id}" data-name="${p.name}" ${p.id === preselectId ? 'selected' : ''}>
        ${p.name} (${DISTRICT_BY_ID[p.district]?.short || p.district} • ${formatNairaFull(p.netWorth || 0)})
      </option>
    `).join('');
  }

  // --------------------------------------------------------------------------
  // 8. UI EVENT BINDINGS & DECISION MODAL
  // --------------------------------------------------------------------------
  _bindUIEvents() {
    document.querySelectorAll('.deck-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    document.getElementById('btn-jump-chat')?.addEventListener('click', () => {
      this.switchTab('multiplayer');
    });

    document.getElementById('btn-force-resync')?.addEventListener('click', () => {
      this._forceNetworkResync();
    });

    document.getElementById('btn-mark-all-read')?.addEventListener('click', () => {
      this.markAllChatRead();
    });

    document.getElementById('btn-load-older-chat')?.addEventListener('click', () => {
      this.loadOlderChatMessages();
    });

    document.getElementById('btn-play-whot')?.addEventListener('click', () => {
      this._startWhotGame();
    });

    document.getElementById('btn-play-ludo')?.addEventListener('click', () => {
      this._startLudoGame();
    });

    // FCT High Court Lawsuit Filing Form
    document.getElementById('court-file-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const defInput = document.getElementById('court-defendant-input');
      const chargeSel = document.getElementById('court-charge-select');
      const claimInput = document.getElementById('court-claim-input');

      const defendant = defInput?.value.trim() || 'Abuja Landlord';
      const charge = chargeSel?.value || 'Illegal 2-Year Rent Hike';
      const claimAmount = Number(claimInput?.value) || 250000;
      const filingFee = 5000;

      if (!this.game.canAfford(filingFee)) {
        this.showToast('⚠️ Need ₦5,000 High Court filing fee!');
        return;
      }
      this.game.pay(filingFee);
      this.game.stat('clout', 2);
      this._recordDailyProgress('social');

      fetch('/api/court/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plaintiff: this.game.s.meta.name,
          defendant,
          charge,
          claimAmount,
          district: this.game.s.loc.district
        })
      })
        .then((r) => r.json())
        .then(() => {
          if (defInput) defInput.value = '';
          this.showToast(`⚖️ Suit filed at Maitama High Court against ${defendant}! (+2 Clout)`);
          this._renderHUD();
        })
        .catch(() => {});
    });

    document.getElementById('btn-cycle-radio')?.addEventListener('click', () => {
      this.radioIndex = (this.radioIndex + 1) % RADIO_STATIONS.length;
      const st = RADIO_STATIONS[this.radioIndex];
      document.getElementById('hud-radio-station').textContent = st.name;
      document.getElementById('hud-radio-ticker').textContent = st.tagline;
      this.showToast(`📻 Tuned to ${st.name}`);
    });

    document.getElementById('btn-pause')?.addEventListener('click', (e) => {
      if (this.realTimeTimer) {
        this.stopRealTime();
        e.currentTarget.textContent = '▶';
      } else {
        this.startRealTime(this.simSpeed);
        e.currentTarget.textContent = '⏸';
      }
    });

    document.querySelectorAll('.speed-btn[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn[data-speed]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mult = Number(btn.dataset.speed) || 1;
        this.startRealTime(mult);
      });
    });

    document.getElementById('btn-advance-hr')?.addEventListener('click', async () => {
      await this.game.advance(60);
      this._renderAll();
    });

    const syncDriveButtons = (inCar) => {
      const topBtn = document.getElementById('btn-toggle-drive');
      if (topBtn) {
        topBtn.textContent = inCar ? '🏎️ Sports Car (F)' : '🚶🏾 Walk Mode (F)';
        topBtn.classList.toggle('active', inCar);
      }
      const mobBtn = document.getElementById('btn-mobile-drive');
      const mobIco = document.getElementById('gmac-drive-ico');
      const mobLbl = document.getElementById('gmac-drive-lbl');
      if (mobBtn) mobBtn.classList.toggle('active', inCar);
      if (mobIco) mobIco.textContent = inCar ? '🚶🏾' : '🏎️';
      if (mobLbl) mobLbl.textContent = inCar ? 'EXIT CAR' : 'ENTER CAR';
    };

    const handleToggleDrive = () => {
      if (!this.world3d) return;
      const inCar = this.world3d.toggleVehicleMode();
      syncDriveButtons(inCar);
      this.showToast(inCar ? '🏎️ Entered Widebody Sports Coupe! Use Joystick or WASD to drive.' : '🚶🏾 Stepped out onto the street walkway.');
    };

    document.getElementById('btn-toggle-drive')?.addEventListener('click', handleToggleDrive);
    document.getElementById('btn-mobile-drive')?.addEventListener('click', handleToggleDrive);

    document.getElementById('btn-toggle-cam')?.addEventListener('click', (e) => {
      if (!this.world3d) return;
      const mode = this.world3d.cycleCameraMode();
      e.currentTarget.textContent = mode === 'helicopter' ? '🚁 Chopper Cam (V)' : (mode === 'dollhouse' ? '🏠 Dollhouse (V)' : '🎥 3rd-Person (V)');
    });

    document.getElementById('btn-toggle-dollhouse')?.addEventListener('click', () => {
      if (!this.world3d) return;
      this.world3d.cameraMode = 'dollhouse';
      this.world3d.cameraDistance = 46;
      this.world3d.cameraPitch = 0.62;
      this.world3d.cameraYaw = Math.PI / 4;
      this.showToast('🏠 The Sims 45° Isometric Dollhouse Camera Active! (Press C or V to cycle)');
      const camBtn = document.getElementById('btn-toggle-cam');
      if (camBtn) camBtn.textContent = '🏠 Dollhouse (V)';
    });

    document.getElementById('btn-open-sims-deck')?.addEventListener('click', () => {
      this.openDeckTab('sims');
    });

    document.getElementById('btn-toggle-2dmap')?.addEventListener('click', (e) => {
      const overlay = document.getElementById('map2d-overlay');
      if (!overlay) return;
      overlay.hidden = !overlay.hidden;
      e.currentTarget.classList.toggle('active', !overlay.hidden);
    });

    document.getElementById('btn-toggle-lowpower')?.addEventListener('click', (e) => {
      if (!this.world3d) return;
      const isLow = this.world3d.toggleLowPowerMode();
      e.currentTarget.textContent = isLow ? '❄️ON' : '❄️';
      e.currentTarget.classList.toggle('active', isLow);
      this.showToast(isLow ? '❄️ Cool Mode enabled (Battery Saver)' : '⚡ Full 60 FPS 3D rendering restored');
    });

    // Spray ₦5,000 Naira in 3D! (Shared by Top-Left Pill & Mobile Action Cluster)
    const triggerSprayNaira = () => {
      const sprayAmt = 5000;
      if (!this.game.canAfford(sprayAmt)) {
        this.showToast('⚠️ Need at least ₦5,000 to spray Naira!');
        return;
      }
      this.game.pay(sprayAmt);
      this.game.stat('clout', 2);
      this.game.stat('sanity', 4);
      this._recordDailyProgress('social');
      this.game.log(`Sprayed ${formatNairaFull(sprayAmt)} fresh CBN notes in ${this.game.district.short}! (+2 Protocol)`, 'good', '💸');

      if (this.world3d) this.world3d.spawnNairaRain(38);
      fetch('/api/spray', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: this.game.s.meta.name,
          district: this.game.s.loc.district,
          amount: sprayAmt
        })
      }).catch(() => {});

      this._renderHUD();
      this._saveGame();
    };

    document.getElementById('btn-spray-naira')?.addEventListener('click', triggerSprayNaira);
    document.getElementById('btn-mobile-spray')?.addEventListener('click', triggerSprayNaira);

    // Mobile 1-Tap Street Punch & Turbo Sprint Buttons
    document.getElementById('btn-mobile-punch')?.addEventListener('click', () => {
      if (this.world3d) {
        this.world3d.triggerStreetPunch();
        syncDriveButtons(this.world3d.inVehicle);
      }
    });

    const sprintBtn = document.getElementById('btn-mobile-sprint');
    if (sprintBtn) {
      let sprintLocked = false;
      sprintBtn.addEventListener('click', () => {
        sprintLocked = !sprintLocked;
        if (this.world3d) this.world3d.keys.shift = sprintLocked;
        sprintBtn.classList.toggle('active', sprintLocked);
      });
    }

    // On-screen WASD Directional Buttons (Right = 'd', Left = 'a')
    document.querySelectorAll('#gta-drive-pad .dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir;
      const start = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        if (this.world3d) this.world3d.keys[dir] = true;
      };
      const end = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        if (this.world3d) this.world3d.keys[dir] = false;
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointerleave', end);
      btn.addEventListener('pointercancel', end);
    });

    // Smooth 360° Touch Virtual Analog Joystick (#gta-analog-ring)
    const analogRing = document.getElementById('gta-analog-ring');
    const analogKnob = document.getElementById('gta-analog-knob');
    if (analogRing && analogKnob) {
      let joyActive = false;
      let joyPointerId = null;
      const maxRadius = 22;

      const updateJoystick = (clientX, clientY) => {
        const rect = analogRing.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(maxRadius, dist);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clamped;
        const ky = Math.sin(angle) * clamped;

        analogKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

        if (this.world3d) {
          // kx > 0 = dragging right -> touchVector.x > 0 (moves Screen Right)
          // ky < 0 = dragging up    -> touchVector.y < 0 (moves Screen Forward)
          this.world3d.touchVector.x = kx / maxRadius;
          this.world3d.touchVector.y = ky / maxRadius;
        }
      };

      const resetJoystick = () => {
        joyActive = false;
        joyPointerId = null;
        analogKnob.style.transform = 'translate(0px, 0px)';
        if (this.world3d) {
          this.world3d.touchVector.x = 0;
          this.world3d.touchVector.y = 0;
        }
      };

      analogRing.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        joyActive = true;
        joyPointerId = e.pointerId;
        analogRing.setPointerCapture?.(e.pointerId);
        updateJoystick(e.clientX, e.clientY);
      });

      analogRing.addEventListener('pointermove', (e) => {
        if (!joyActive || (joyPointerId !== null && e.pointerId !== joyPointerId)) return;
        e.preventDefault();
        e.stopPropagation();
        updateJoystick(e.clientX, e.clientY);
      });

      analogRing.addEventListener('pointerup', resetJoystick);
      analogRing.addEventListener('pointercancel', resetJoystick);
    }

    // Open / Close CBN Naira Vault Modal
    document.getElementById('btn-open-vault')?.addEventListener('click', () => this.openNairaVaultModal());
    document.getElementById('btn-quick-wire')?.addEventListener('click', () => this.openNairaVaultModal());
    document.getElementById('btn-close-vault')?.addEventListener('click', () => {
      document.getElementById('naira-vault-modal').hidden = true;
    });

    document.querySelectorAll('.preset-naira-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById('wire-amount-input');
        if (inp) inp.value = Number(btn.dataset.amt);
      });
    });

    // Submit Peer-to-Peer Naira Wire Form
    document.getElementById('vault-wire-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const sel = document.getElementById('wire-recipient-select');
      const amtInput = document.getElementById('wire-amount-input');
      const noteInput = document.getElementById('wire-note-input');

      const toId = sel.value;
      const toName = sel.selectedOptions[0]?.dataset.name || 'FCT Player';
      const amount = Math.round(Number(amtInput.value) || 0);
      const note = noteInput.value.trim() || 'Abuja Protocol Support';

      if (amount < 500) {
        this.showToast('⚠️ Minimum CBN transfer is ₦500.');
        return;
      }
      if (!this.game.canAfford(amount)) {
        this.showToast('⚠️ Insufficient Naira balance for this transfer!');
        return;
      }

      this.game.pay(amount);
      this.game.stat('clout', Math.min(6, Math.max(1, Math.floor(amount / 10000))));
      this._recordDailyProgress('social');
      this.game.log(`Wired ${formatNairaFull(amount)} to ${toName} ("${note}").`, 'good', '💸');

      fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromId: this.playerId,
          fromName: this.game.s.meta.name,
          toId,
          toName,
          amount,
          note
        })
      }).catch(() => {});

      if (this.world3d) this.world3d.spawnNairaRain(28);
      document.getElementById('naira-vault-modal').hidden = true;
      this._renderAll();
    });

    // Multiplayer Chat Channel Tabs & Form
    document.querySelectorAll('.mp-chan-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mp-chan-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.chatChannel = btn.dataset.channel;
        if (this.unreadByChannel[this.chatChannel]) {
          this.unreadByChannel[this.chatChannel] = 0;
        }
        this._updateUnreadBadges();
        const dmBar = document.getElementById('mp-dm-target-bar');
        if (dmBar) dmBar.hidden = this.chatChannel !== 'dm' || !this.dmTarget;
        this._renderChatMessages();
      });
    });

    document.getElementById('btn-clear-dm')?.addEventListener('click', () => {
      this.dmTarget = null;
      this.chatChannel = 'global';
      document.getElementById('mp-dm-target-bar').hidden = true;
      document.querySelectorAll('.mp-chan-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.channel === 'global');
      });
      this._renderChatMessages();
    });

    document.getElementById('mp-chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('mp-chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this._recordDailyProgress('social');

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: this.playerId,
          sender: this.game.s.meta.name,
          district: this.game.s.loc.district,
          channel: this.chatChannel,
          toId: this.chatChannel === 'dm' && this.dmTarget ? this.dmTarget.id : null,
          toName: this.chatChannel === 'dm' && this.dmTarget ? this.dmTarget.name : null,
          text
        })
      }).catch(() => {});
    });

    // 1-Click Quick Chat Chips & Inline Chat Form
    document.getElementById('quick-chat-inline-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('quick-chat-inline-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this._recordDailyProgress('social');

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: this.playerId,
          sender: this.game.s.meta.name,
          district: this.game.s.loc.district,
          channel: 'global',
          toId: null,
          toName: null,
          text
        })
      }).catch(() => {});
    });

    document.querySelectorAll('#chat-quick-chips .btn-quick-phrase').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.text;
        if (!text) return;
        this._recordDailyProgress('social');
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderId: this.playerId,
            sender: this.game.s.meta.name,
            district: this.game.s.loc.district,
            channel: 'global',
            toId: null,
            toName: null,
            text
          })
        }).catch(() => {});
      });
    });

    document.getElementById('btn-chat-open-task')?.addEventListener('click', () => {
      this.switchTab('network');
      const el = document.getElementById('assign-task-form');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });

    // Peer-to-Peer Paid Task Assignment Form
    document.getElementById('assign-task-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const assigneeSel = document.getElementById('task-assignee-select');
      const typeSel = document.getElementById('task-type-select');
      const rewardInp = document.getElementById('task-reward-input');
      const noteInp = document.getElementById('task-note-input');

      const assigneeId = assigneeSel?.value || null;
      const assigneeName = assigneeSel?.selectedOptions[0]?.dataset.name || 'Open to Any FCT Player';
      const taskType = typeSel?.value || 'push_file';
      const reward = Math.round(Number(rewardInp?.value) || 15000);
      const note = noteInp?.value.trim() || 'Abuja Priority Job';

      if (reward < 3000) {
        this.showToast('⚠️ Minimum task reward escrow is ₦3,000.');
        return;
      }
      if (!this.game.canAfford(reward)) {
        this.showToast('⚠️ Insufficient Naira balance to escrow this task reward!');
        return;
      }

      this.game.pay(reward);
      this._recordDailyProgress('social');
      this.game.log(`Escrowed ${formatNairaFull(reward)} for task "${note}".`, 'good', '📋');

      fetch('/api/tasks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId: this.playerId,
          creatorName: this.game.s.meta.name,
          assigneeId,
          assigneeName,
          taskType,
          reward,
          district: this.game.s.loc.district,
          note
        })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            this.showToast('📋 Task created & broadcasted to FCT network!');
            if (noteInp) noteInp.value = '';
            this._renderAll();
          } else {
            this.showToast(`⚠️ ${data.error || 'Failed to post task'}`);
          }
        })
        .catch(() => {
          this.showToast('⚠️ Network error posting task');
        });
    });

    // Floating GTA Icon Dock ("Make All The Others Like Icon")
    document.querySelectorAll('.gta-dock-icon[data-dock-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.dockTab;
        const deck = document.getElementById('command-deck-panel');
        const isClosed = deck?.classList.contains('is-drawer-closed');
        if (!isClosed && this.activeTab === tabId) {
          this.closeDeckDrawer();
        } else {
          this.openDeckTab(tabId);
        }
      });
    });

    document.getElementById('btn-close-deck')?.addEventListener('click', () => {
      this.closeDeckDrawer();
    });

    document.getElementById('mobile-drawer-backdrop')?.addEventListener('click', () => {
      this.closeDeckDrawer();
    });

    // Classic Top-Right Nigeria GTA Fist Icon (Street Punch / Knockdown)
    document.getElementById('btn-gta-fist')?.addEventListener('click', () => {
      if (this.world3d) {
        this.world3d.triggerStreetPunch();
      }
    });

    // Top-Right Cash Readout & Dock Vault Icon -> Open CBN Naira Vault
    document.getElementById('btn-classic-cash-vault')?.addEventListener('click', () => {
      this.openNairaVaultModal();
    });
    document.getElementById('btn-dock-vault')?.addEventListener('click', () => {
      this.openNairaVaultModal();
    });

    // Dock Profile Icon -> Citizen Sign-Up & Caliber Creator
    document.getElementById('btn-dock-profile')?.addEventListener('click', () => {
      this._openNewCharModal();
    });

    // Toggle Top-Left District Postcard Info Card
    document.getElementById('btn-toggle-district-card')?.addEventListener('click', () => {
      const card = document.getElementById('district-postcard-card');
      if (card) card.hidden = !card.hidden;
    });

    // Full Interactive Nigeria Street GPS Map Modal triggers
    document.getElementById('btn-dock-gps')?.addEventListener('click', () => {
      this.openNigeriaGPSModal();
    });
    document.getElementById('btn-radar-north')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openNigeriaGPSModal();
    });
    document.getElementById('btn-expand-gps-radar')?.addEventListener('dblclick', () => {
      this.openNigeriaGPSModal();
    });
    document.getElementById('btn-close-gps-modal')?.addEventListener('click', () => {
      const m = document.getElementById('nigeria-gps-modal');
      if (m) m.hidden = true;
    });
    document.getElementById('btn-gps-focus-abuja')?.addEventListener('click', () => {
      if (this.fullNigeriaMap) {
        this.fullNigeriaMap.setView([9.0642, 7.4813], 13);
      }
    });
    document.getElementById('btn-gps-focus-lagos')?.addEventListener('click', () => {
      if (this.fullNigeriaMap) {
        this.fullNigeriaMap.setView([6.4550, 3.4050], 12);
      }
    });

    // New Character & Nigerian Lifestyle Caliber Modal
    document.getElementById('btn-new-char')?.addEventListener('click', () => {
      this._openNewCharModal();
    });
    document.getElementById('btn-hud-profile')?.addEventListener('click', () => {
      this._openNewCharModal();
    });
    document.getElementById('btn-cancel-new-char')?.addEventListener('click', () => {
      this.game.s.meta.originConfigured = true;
      this._saveGame();
      document.getElementById('new-char-modal').hidden = true;
    });
    document.getElementById('new-char-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('char-name-input').value.trim() || 'Alhaji Musa';
      const trackId = TRACKS[this.selectedStarterTrack] ? this.selectedStarterTrack : 'contractor';
      const ageVal = Number(document.getElementById('char-age-input')?.value) || this.selectedAge || 26;
      const propMode = document.getElementById('char-prev-prop-select')?.value || this.selectedPrevProp || 'default';

      this.game = Game.create({
        name,
        track: trackId,
        gender: this.selectedGender || 'male',
        age: ageVal,
        lifeStage: ageVal < 18 ? 'child' : ageVal <= 25 ? 'young_adult' : ageVal <= 44 ? 'adult' : 'elder',
        lifestyle: this.selectedLifestyle || 'alhaji',
        prevProperty: propMode
      }, {
        decide: (decision) => this._promptDecisionModal(decision)
      });

      this.game.s.meta.originConfigured = true;
      this._ensureExtendedPlayerState();
      this._initGameListenersAfterReset();
      this.lastFunds = this.game.funds();
      document.getElementById('new-char-modal').hidden = true;

      if (this.world3d) {
        this.world3d.flyToDistrict(this.game.s.loc.district);
        this.world3d.syncPlayerHouses(Object.values(this.game.s.social.plots || {}));
        if (this.game.s.social.car && typeof this.world3d.setPlayerVehicleAppearance === 'function') {
          this.world3d.setPlayerVehicleAppearance(this.game.s.social.car);
        }
        this.world3d.spawnNairaRain(35);
      }

      const ls = NIGERIAN_LIFESTYLES[this.selectedLifestyle] || NIGERIAN_LIFESTYLES.alhaji;
      this.game.log(
        `Started Abuja Life as ${name} (${GENDERS[this.selectedGender]?.short || 'Citizen'}, ${ageVal} yrs) • Caliber: ${ls.name} (${ls.caliber})!`,
        'good',
        '🇳🇬'
      );

      this._renderAll();
      this._saveGame();
      this._sendHeartbeat();
      this.showToast(`🇳🇬 Welcome to 3D Abuja, ${name}! Caliber: ${ls.name.split(' (')[0]} (${formatNairaFull(netWorth(this.game.s))} Worth)`);
    });
  }

  _initGameListenersAfterReset() {
    this.game.on((type, data) => {
      if (type === 'hud') {
        this._renderHUD();
        this._saveGame();
      } else if (type === 'loc') {
        if (this.world3d) this.world3d.flyToDistrict(this.game.s.loc.district);
        this._recordDailyProgress('commute');
        this._renderDistrictBanner();
        this._renderActionsTab();
        this._renderCommuteTab();
        this._render2DMapHighlight();
        this._sendHeartbeat();
      } else if (type === 'time') {
        this._ensureExtendedPlayerState();
        this._renderClockAndWeather();
      } else if (type === 'log') {
        if (data && data.text) this.showToast(`${data.icon || '📣'} ${data.text}`);
        this._renderFeedTab();
      } else if (type === 'action') {
        this._recordDailyProgress('move');
        this._renderAll();
      }
    });
  }

  openDeckTab(tabId) {
    const deck = document.getElementById('command-deck-panel');
    if (deck) deck.classList.remove('is-drawer-closed');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (backdrop) backdrop.hidden = window.innerWidth > 768;
    this.switchTab(tabId);
  }

  closeDeckDrawer() {
    const deck = document.getElementById('command-deck-panel');
    if (deck) deck.classList.add('is-drawer-closed');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (backdrop) backdrop.hidden = true;
    document.querySelectorAll('.gta-dock-icon[data-dock-tab]').forEach((b) => {
      b.classList.remove('active');
    });
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    const deck = document.getElementById('command-deck-panel');
    if (deck) deck.classList.remove('is-drawer-closed');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (backdrop) backdrop.hidden = window.innerWidth > 768;

    document.querySelectorAll('.deck-tabs .tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.gta-dock-icon[data-dock-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.dockTab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach((p) => {
      p.classList.toggle('active', p.id === `tab-${tabId}`);
    });
    if (tabId === 'multiplayer') {
      if (this.unreadByChannel[this.chatChannel]) {
        this.unreadByChannel[this.chatChannel] = 0;
      }
      this._updateUnreadBadges();
      this._renderChatMessages();
    }
  }

  _promptDecisionModal(decision) {
    return new Promise((resolve) => {
      const modal = document.getElementById('encounter-modal');
      if (!modal || !decision) {
        resolve(decision?.options?.[0]?.id);
        return;
      }

      document.getElementById('encounter-title').textContent = `${decision.icon || '⚠️'} ${decision.title}`;
      document.getElementById('encounter-desc').textContent = decision.body || '';

      const choicesEl = document.getElementById('encounter-choices');
      choicesEl.innerHTML = (decision.options || []).map((opt) => `
        <button class="btn-secondary encounter-choice-btn" data-id="${opt.id}" ${opt.disabled ? 'disabled' : ''} style="text-align:left; padding:10px;">
          <div style="font-weight:700; color:#fff;">${opt.label}</div>
          ${opt.sub ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px;">${opt.sub}</div>` : ''}
          ${opt.disabled && opt.reason ? `<div style="font-size:10.5px; color:#fb7185; margin-top:2px;">${opt.reason}</div>` : ''}
        </button>
      `).join('');

      choicesEl.querySelectorAll('.encounter-choice-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          modal.hidden = true;
          resolve(btn.dataset.id);
        });
      });

      modal.hidden = false;
    });
  }

  _openNewCharModal() {
    const modal = document.getElementById('new-char-modal');
    const trackGrid = document.getElementById('starter-track-options');
    const genderGrid = document.getElementById('char-gender-options');
    const stageGrid = document.getElementById('char-lifestage-options');
    const lifestyleGrid = document.getElementById('starter-lifestyle-options');
    const propSelect = document.getElementById('char-prev-prop-select');
    const ageInput = document.getElementById('char-age-input');
    const ageDisplay = document.getElementById('char-age-display');
    const stageDesc = document.getElementById('char-lifestage-desc');
    const propDesc = document.getElementById('char-prev-prop-desc');
    if (!modal || !trackGrid) return;

    this.selectedGender = this.game.s.meta.gender || this.selectedGender || 'male';
    this.selectedAge = this.game.s.meta.age || this.selectedAge || 26;
    this.selectedLifeStage = this.game.s.meta.lifeStage || (this.selectedAge < 18 ? 'child' : 'adult');
    this.selectedLifestyle = this.game.s.meta.lifestyle && NIGERIAN_LIFESTYLES[this.game.s.meta.lifestyle]
      ? this.game.s.meta.lifestyle
      : (this.selectedLifestyle || 'alhaji');
    this.selectedStarterTrack = this.game.s.career.track || this.selectedStarterTrack || 'contractor';

    const nameInp = document.getElementById('char-name-input');
    if (nameInp) nameInp.value = this.game.s.meta.name || 'Alhaji Musa';

    // 1. Render Gender Selector
    if (genderGrid) {
      genderGrid.innerHTML = Object.values(GENDERS).map((g) => `
        <div class="track-option-card ${g.id === this.selectedGender ? 'selected' : ''}" data-gender="${g.id}" style="padding:8px;">
          <strong>${g.label}</strong>
        </div>
      `).join('');
      genderGrid.querySelectorAll('.track-option-card').forEach((card) => {
        card.addEventListener('click', () => {
          this.selectedGender = card.dataset.gender;
          genderGrid.querySelectorAll('.track-option-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          // Suggest an authentic Nigerian name if still default
          if (nameInp && ['Tunde', 'Citizen', 'Alhaji Musa', 'Baddie Zaynab'].includes(nameInp.value.trim())) {
            nameInp.value = this.selectedGender === 'female' ? 'Baddie Zaynab' : 'Alhaji Musa';
          }
        });
      });
    }

    // 2. Render Life Stage (Child/Teen vs Gen-Z vs Adult vs Elder) & Age Slider
    const updateAgeUI = (ageNum) => {
      this.selectedAge = ageNum;
      if (ageInput) ageInput.value = ageNum;
      let stKey = 'adult';
      if (ageNum < 18) stKey = 'child';
      else if (ageNum <= 25) stKey = 'young_adult';
      else if (ageNum <= 44) stKey = 'adult';
      else stKey = 'elder';
      this.selectedLifeStage = stKey;
      const stObj = LIFE_STAGES[stKey];
      if (ageDisplay) {
        ageDisplay.textContent = `${ageNum} Years Old (${ageNum < 18 ? '🧒🏾 Child / Teen' : ageNum <= 25 ? '🧑🏾‍🎓 Gen-Z Youth' : ageNum <= 44 ? '👔 Prime Adult' : '👑 Elder VIP'})`;
      }
      if (stageDesc && stObj) stageDesc.textContent = stObj.desc;
      if (stageGrid) {
        stageGrid.querySelectorAll('.track-option-card').forEach((c) => {
          c.classList.toggle('selected', c.dataset.stage === stKey);
        });
      }
    };

    if (stageGrid) {
      stageGrid.innerHTML = Object.values(LIFE_STAGES).map((st) => `
        <div class="track-option-card ${st.id === this.selectedLifeStage ? 'selected' : ''}" data-stage="${st.id}" style="padding:7px;">
          <strong style="font-size:11.5px;">${st.label}</strong>
        </div>
      `).join('');
      stageGrid.querySelectorAll('.track-option-card').forEach((card) => {
        card.addEventListener('click', () => {
          const st = LIFE_STAGES[card.dataset.stage];
          if (st) updateAgeUI(st.defaultAge);
        });
      });
    }

    if (ageInput) {
      ageInput.oninput = (e) => updateAgeUI(Number(e.target.value));
    }
    updateAgeUI(this.selectedAge);

    // 3. Render Nigerian Lifestyle Caliber Options (Alhaji, OS Baddie, Odogwu, Nepo Baby, Tech Bro, Corper, Sapa)
    if (lifestyleGrid) {
      lifestyleGrid.innerHTML = Object.values(NIGERIAN_LIFESTYLES).map((ls) => `
        <div class="track-option-card ${ls.id === this.selectedLifestyle ? 'selected' : ''}" data-lifestyle="${ls.id}" style="padding:9px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#fff; font-size:12px;">${ls.name}</strong>
          </div>
          <span style="font-size:10px; color:#facc15; font-weight:700;">${ls.caliber} • ${ls.worthLabel}</span>
          <span style="font-size:10.5px; color:#38bdf8;">"${ls.slangTag}"</span>
          <span style="font-size:10.5px; color:#cbd5e1; line-height:1.35;">${ls.desc}</span>
          <span style="font-family:var(--font-mono); font-size:10px; color:#4ade80;">
            Liquid: ${formatNairaFull(ls.cash + ls.bank)} • Steeze ${ls.steeze}% • Composure ${ls.composure}%
          </span>
        </div>
      `).join('');

      lifestyleGrid.querySelectorAll('.track-option-card').forEach((card) => {
        card.addEventListener('click', () => {
          this.selectedLifestyle = card.dataset.lifestyle;
          lifestyleGrid.querySelectorAll('.track-option-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          const lsObj = NIGERIAN_LIFESTYLES[this.selectedLifestyle];
          if (lsObj && lsObj.recommendedTrack) {
            this.selectedStarterTrack = lsObj.recommendedTrack;
            trackGrid.querySelectorAll('.track-option-card').forEach((tc) => {
              tc.classList.toggle('selected', tc.dataset.track === this.selectedStarterTrack);
            });
          }
        });
      });
    }

    // 4. Render Previous Properties & Garage Selector
    if (propSelect) {
      propSelect.innerHTML = Object.values(PREVIOUS_PROPERTY_OPTIONS).map((opt) => `
        <option value="${opt.id}" ${opt.id === this.selectedPrevProp ? 'selected' : ''}>${opt.label}</option>
      `).join('');
      const updatePropDesc = () => {
        const opt = PREVIOUS_PROPERTY_OPTIONS[propSelect.value] || PREVIOUS_PROPERTY_OPTIONS.default;
        this.selectedPrevProp = opt.id;
        if (propDesc) propDesc.textContent = opt.desc;
      };
      propSelect.onchange = updatePropDesc;
      updatePropDesc();
    }

    // 5. Render Career Tracks
    trackGrid.innerHTML = Object.values(TRACKS).map((tr) => `
      <div class="track-option-card ${tr.id === this.selectedStarterTrack ? 'selected' : ''}" data-track="${tr.id}" style="padding:8px;">
        <strong style="font-size:11.5px;">${tr.icon} ${tr.name}</strong>
        <span style="font-size:10.5px; color:#94a3b8;">${tr.tagline}</span>
      </div>
    `).join('');

    trackGrid.querySelectorAll('.track-option-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.selectedStarterTrack = card.dataset.track;
        trackGrid.querySelectorAll('.track-option-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    const cancelBtn = document.getElementById('btn-cancel-new-char');
    if (cancelBtn) {
      cancelBtn.textContent = this.game.s.meta.originConfigured
        ? `▶️ Continue as ${this.game.s.meta.name}`
        : '⚡ Quick Start Default Citizen';
    }

    modal.hidden = false;
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3800);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.abujaApp = new AbujaClientApp();
});

