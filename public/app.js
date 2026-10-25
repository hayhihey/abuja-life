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
import { AbujaAfrobeatsEngine } from '/music.js';
import { initUIExtras } from '/ui-extras.js';
import { ABUJA_INSTITUTIONS, COURSE_BY_ID } from '/src/data/education.js';
import { enrollInCourse, attendLecture } from '/src/core/education.js';
import { calculateTaxAssessment, payTaxesAndIssueTCC } from '/src/core/tax.js';
import { POLITICAL_PARTIES, ELECTIVE_OFFICES, RALLY_VENUES } from '/src/data/elections.js';
import { MEGA_ESTATES, HOUSING_UNIT_BY_ID } from '/src/data/mega_housing.js';

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

export function getPlayerLookFromState(s) {
  if (!s || !s.meta) return {};
  const gender = s.meta.gender || 'male';
  const lifestyle = s.meta.lifestyle || 'alhaji';
  const trackId = s.career?.track || 'contractor';

  if (lifestyle === 'baddie' || gender === 'female') {
    return {
      skinColor: 0x6e432a,
      hairColor: 0x1c1917,
      hairstyle: 'braids',
      jacketColor: 0xf472b6,
      shirtColor: 0xfdf2f8,
      pantsColor: 0x1e1b4b,
      shoeColor: 0xf43f5e,
      glasses: 'sunglasses',
      fabricPattern: 'solid',
      agbadaDrape: false
    };
  }
  if (lifestyle === 'alhaji' || trackId === 'contractor') {
    return {
      skinColor: 0x593122,
      hairColor: 0x0a0a0a,
      hairstyle: 'fade',
      jacketColor: 0xffffff,
      shirtColor: 0xf8fafc,
      pantsColor: 0xffffff,
      shoeColor: 0x854d0e,
      glasses: 'gold_rims',
      fabricPattern: 'senator',
      agbadaDrape: true
    };
  }
  if (lifestyle === 'techbro' || trackId === 'tech') {
    return {
      skinColor: 0x4a2818,
      hairColor: 0x0f172a,
      hairstyle: 'fade',
      jacketColor: 0x3b82f6,
      shirtColor: 0x0f172a,
      pantsColor: 0x334155,
      shoeColor: 0xffffff,
      glasses: 'none',
      fabricPattern: 'solid',
      agbadaDrape: false
    };
  }
  return {
    skinColor: 0x502b1c,
    hairColor: 0x1f2937,
    hairstyle: 'fade',
    jacketColor: 0x15803d,
    shirtColor: 0xf0fdf4,
    pantsColor: 0x166534,
    shoeColor: 0x78350f,
    glasses: 'none',
    fabricPattern: 'ankara',
    agbadaDrape: trackId === 'civil'
  };
}

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
    this.afrobeats = new AbujaAfrobeatsEngine();
    this.netState = 'connecting';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimer = null;
    this.currentContextAction = null;

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
    // Check if launched directly from standalone signup.html with ?start=1
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('start') === '1') {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem('abuja_saved_citizen_profile') || 'null');
      } catch (_) {}
      if (saved && saved.name) {
        this.game.s.meta.name = saved.name;
        if (saved.region && DISTRICT_BY_ID[saved.region]) this.game.s.loc.district = saved.region;
        if (saved.trackId) this.game.s.career.track = saved.trackId;
        if (saved.lifestyle) this.game.s.meta.lifestyle = saved.lifestyle;
        this.game.s.meta.originConfigured = true;
        const m = document.getElementById('new-char-modal');
        if (m) { m.hidden = true; m.style.display = 'none'; }
        this._saveGame();
        this._renderAll();
      } else {
        this._openNewCharModal();
      }
    } else {
      if (!this.game?.s?.meta?.originConfigured) {
        this._openNewCharModal();
      } else {
        const m = document.getElementById('new-char-modal');
        if (m) { m.hidden = true; m.style.display = 'none'; }
      }
    }
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

    if (!loaded) {
      let savedProfile = null;
      try {
        savedProfile = JSON.parse(localStorage.getItem('abuja_saved_citizen_profile') || 'null');
      } catch (_) {}

      if (savedProfile && savedProfile.name) {
        const stObj = LIFE_STAGES[savedProfile.lifeStage] || LIFE_STAGES.adult;
        loaded = Game.create({
          name: savedProfile.name,
          track: savedProfile.trackId || 'contractor',
          gender: savedProfile.gender || 'male',
          age: stObj.defaultAge || 28,
          lifeStage: savedProfile.lifeStage || 'adult',
          lifestyle: savedProfile.lifestyle || 'alhaji',
          prevProperty: savedProfile.prevProperty || 'default'
        }, hooks);
      } else {
        loaded = Game.create({ name: 'Alhaji Musa', track: 'contractor', lifestyle: 'alhaji' }, hooks);
      }
    }

    this.game = loaded;
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

  exportSaveGame() {
    try {
      const data = this.game.serialize();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const citizenName = (this.game?.s?.meta?.name || 'citizen').replace(/[^a-z0-9_-]/gi, '_');
      a.href = url;
      a.download = `abuja_life_save_${citizenName}_day${this.game?.s?.t?.day || 1}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast('💾 Save game exported successfully!');
    } catch (err) {
      console.error('Export save failed:', err);
      this.showToast('⚠️ Failed to export save game');
    }
  }

  importSaveGame(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = JSON.parse(text);
        if (!parsed || !parsed.meta) {
          throw new Error('Invalid save game structure');
        }
        localStorage.setItem(STORAGE_KEY, text);
        this.showToast('💾 Save imported! Reloading Abuja simulation…');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        console.error('Import save failed:', err);
        alert('⚠️ Invalid or corrupted Abuja Life save file.');
      }
    };
    reader.readAsText(file);
  }

  resetSaveGame() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('abuja_saved_citizen_profile');
      sessionStorage.removeItem(PLAYER_ID_KEY);
      this.showToast('🔄 Game reset. Starting fresh in Abuja…');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('Reset save failed:', err);
      window.location.reload();
    }
  }

  _syncDriveButtons(inCar) {
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
      },
      onToggleVehicle: (inVehicle) => {
        this._syncDriveButtons(inVehicle);
      },
      onCycleCamera: (camMode) => {
        const camBtn = document.getElementById('btn-toggle-cam');
        if (camBtn) {
          camBtn.textContent = camMode === 'helicopter' ? '🚁 Chopper Cam (V)' : (camMode === 'dollhouse' ? '🏠 Dollhouse (V)' : '🎥 3rd-Person (V)');
        }
      },
      onContextInteract: () => {
        if (typeof this.currentContextAction === 'function') {
          this.currentContextAction();
          return true;
        }
        return false;
      }
    });

    this.world3d.flyToDistrict(this.game.s.loc.district, true);
    this.world3d.setPlayerLook(getPlayerLookFromState(this.game.s));
    this.world3d.setEnvironment(Clock.hourOf(this.game.s.t), this.game.s.market.today.weather);
    if (this.game.s.social?.plots) {
      this.world3d.syncPlayerHouses(Object.values(this.game.s.social.plots));
    }
    if (this.game.s.social?.car) {
      this.world3d.setPlayerVehicleAppearance(this.game.s.social.car);
    }
    setTimeout(() => {
      if (this.world3d) this.world3d.resize();
    }, 120);
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

    let lastRadarTime = 0;
    const drawRadar = (time) => {
      requestAnimationFrame(drawRadar);
      if (typeof document !== 'undefined' && document.hidden) return;
      if (time - lastRadarTime < 100) return;
      lastRadarTime = time;
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

      this._updateContextualPrompt();
    };

    requestAnimationFrame(drawRadar);
  }

  _updateContextualPrompt() {
    const promptEl = document.getElementById('hud-context-prompt');
    const labelEl = document.getElementById('hcp-label');
    const subEl = document.getElementById('hcp-sub');
    const iconEl = document.getElementById('hcp-icon');
    if (!promptEl || !labelEl) return;

    if (!this.world3d || this.world3d.lowPowerMode || !this.game?.s) {
      promptEl.hidden = true;
      this.currentContextAction = null;
      return;
    }

    const curDistId = this.game.s.loc.district;
    const curDist = DISTRICT_BY_ID[curDistId];
    if (!curDist) {
      promptEl.hidden = true;
      this.currentContextAction = null;
      return;
    }

    // 1. In Vehicle -> prompt to step out
    if (this.world3d.inVehicle) {
      promptEl.hidden = false;
      if (iconEl) iconEl.textContent = '🚶🏾';
      labelEl.textContent = 'Step Out of Sports Car';
      if (subEl) subEl.textContent = 'Press F or Tap to Walk';
      this.currentContextAction = () => {
        const inCar = this.world3d.toggleVehicleMode();
        this._syncDriveButtons(inCar);
      };
      return;
    }

    // 2. Near Compound / Plot
    const userPlots = this.game.s.social?.plots || {};
    const localPlot = userPlots[curDistId];
    if (localPlot && localPlot.progress > 0) {
      promptEl.hidden = false;
      if (iconEl) iconEl.textContent = '🏠';
      labelEl.textContent = `Your Compound (${localPlot.duplexType || 'Duplex'})`;
      if (subEl) subEl.textContent = 'Press E or Tap to Manage Home';
      this.currentContextAction = () => {
        this.switchTab('home', 'tab-sims');
      };
      return;
    }

    // 3. Near Primary District Landmark Spot
    const landmarks = curDist.landmarks || [];
    if (landmarks.length > 0) {
      const lm = landmarks[0];
      promptEl.hidden = false;
      if (iconEl) iconEl.textContent = lm.icon || '📍';
      labelEl.textContent = `Explore ${lm.name}`;
      if (subEl) subEl.textContent = 'Press E or Tap to View Moves';
      this.currentContextAction = () => {
        this.switchTab('explore', 'tab-actions');
        this.showToast(`📍 At ${lm.name}! Available district moves opened.`);
      };
      return;
    }

    promptEl.hidden = true;
    this.currentContextAction = null;
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
    this._renderProfileTab();
  }

  _renderProfileTab() {
    if (!this.game?.s) return;
    const s = this.game.s;
    const nameEl = document.getElementById('profile-pane-name');
    const detailsEl = document.getElementById('profile-pane-details');
    if (nameEl) {
      nameEl.textContent = s.meta.name || 'Citizen';
    }
    if (detailsEl) {
      const curDist = DISTRICT_BY_ID[s.loc.district]?.name || s.loc.district;
      const trackName = TRACKS[s.career.track]?.name || s.career.track;
      const nw = formatNairaFull(netWorth(s));
      const ls = NIGERIAN_LIFESTYLES[s.meta.lifestyle]?.caliber || 'Standard Resident';
      detailsEl.textContent = `${trackName} • ${s.meta.age || 26} yrs • Based in ${curDist} • Caliber: ${ls} • Net Worth: ${nw}`;
    }
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
    // Fallback polling for serverless deployments
    setInterval(() => {
      fetch('/api/players')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.players)) {
            this._updateOnlinePlayers(data.players);
          }
        })
        .catch(() => {});
    }, 16000);

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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // On Vercel serverless deployments, SSE connections are forcibly terminated by serverless timeouts.
    // Operating in resilient polling mode prevents stream reconnection storms.
    const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (isVercel) {
      this._setNetworkState('live');
      this._fetchInitialMultiplayerState();
      return;
    }

    try {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.eventSource = new EventSource('/api/stream');

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this._setNetworkState('live');
      };

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const backoff = Math.min(16000, 1000 * Math.pow(2, this.reconnectAttempts - 1));
          this._setNetworkState('reconnecting', this.reconnectAttempts);
          this.reconnectTimer = setTimeout(() => {
            this._connectEventStream();
          }, backoff);
        } else {
          // Bounded retries: gracefully operate in Single-Player Simulation Mode
          this._setNetworkState('offline');
          if (!this.onlinePlayers || !this.onlinePlayers.length) {
            this._updateOnlinePlayers(this._getSimulatedCitizens());
          }
        }
      };

      this.eventSource.addEventListener('init', (e) => {
        this.reconnectAttempts = 0;
        this._setNetworkState('live');
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
      this._setNetworkState('offline');
      if (!this.onlinePlayers || !this.onlinePlayers.length) {
        this._updateOnlinePlayers(this._getSimulatedCitizens());
      }
    }
  }

  _setNetworkState(state, info = null) {
    this.netState = state;
    const pill = document.getElementById('net-status-pill');
    const dot = document.getElementById('net-status-dot');
    const text = document.getElementById('net-status-text');
    const resyncBtn = document.getElementById('btn-force-resync');
    if (!pill) return;

    pill.dataset.status = state;
    pill.hidden = false;

    if (state === 'live') {
      if (dot) dot.textContent = '🟢';
      if (text) text.textContent = 'FCT Live Connected';
      if (resyncBtn) resyncBtn.hidden = true;
      setTimeout(() => {
        if (this.netState === 'live') pill.hidden = true;
      }, 3500);
    } else if (state === 'reconnecting') {
      if (dot) dot.textContent = '⏳';
      if (text) text.textContent = `FCT Network Reconnecting (${info || 1}/${this.maxReconnectAttempts})…`;
      if (resyncBtn) {
        resyncBtn.hidden = false;
        resyncBtn.textContent = 'Re-sync';
      }
    } else if (state === 'offline') {
      if (dot) dot.textContent = '🟡';
      if (text) text.textContent = 'Single-Player Simulation Mode';
      if (resyncBtn) {
        resyncBtn.hidden = false;
        resyncBtn.textContent = 'Go Online';
      }
    } else if (state === 'syncing') {
      if (dot) dot.textContent = '🔄';
      if (text) text.textContent = 'Synchronizing FCT state…';
      if (resyncBtn) {
        resyncBtn.hidden = false;
        resyncBtn.textContent = 'Syncing…';
      }
    }
  }

  _forceNetworkResync() {
    this.reconnectAttempts = 0;
    this._setNetworkState('syncing');
    this._fetchInitialMultiplayerState();
    this._sendHeartbeat();
    this._connectEventStream();
    this.showToast('📡 Synchronizing FCT Network...');
    setTimeout(() => {
      if (this.netState === 'syncing') {
        this._setNetworkState('live');
        this.showToast('✅ FCT Network resynced cleanly!');
      }
    }, 1200);
  }

  _getSimulatedCitizens() {
    const s = this.game.s;
    const selfUser = {
      id: this.playerId,
      name: s.meta.name,
      career: TRACKS[s.career.track]?.name || s.career.track,
      district: s.loc.district,
      clout: Math.round(s.clout),
      netWorth: netWorth(s),
      isHuman: true,
      isBot: false
    };
    const defaultBots = [
      { id: 'bot_emeka', name: 'Chief Emeka "Aso" Okonkwo', career: 'Contractor / Vendor', district: 'maitama', clout: 88, netWorth: 185000000, isHuman: false, isBot: true },
      { id: 'bot_zainab', name: 'Hajiya Zainab Lawal', career: 'Civil Service', district: 'asokoro', clout: 92, netWorth: 42000000, isHuman: false, isBot: true },
      { id: 'bot_danjuma', name: 'Engr. Danjuma Gambo', career: 'Contractor / Vendor', district: 'guzape', clout: 74, netWorth: 68000000, isHuman: false, isBot: true },
      { id: 'bot_tunde_san', name: 'Barr. Tunde Ogunleye (SAN)', career: 'Senior Advocate', district: 'cbd', clout: 80, netWorth: 31000000, isHuman: false, isBot: true },
      { id: 'bot_amaka', name: 'Amaka "Wuse" Eze', career: 'Tech & Creative Nomad', district: 'wuse2', clout: 45, netWorth: 24500000, isHuman: false, isBot: true },
      { id: 'bot_sani', name: 'Mallam Sani Usman', career: 'Street Trader & Transport', district: 'utako', clout: 32, netWorth: 14000000, isHuman: false, isBot: true },
      { id: 'bot_kemi', name: 'Kemi Balogun', career: 'Tech & Creative Nomad', district: 'jabi', clout: 38, netWorth: 16800000, isHuman: false, isBot: true }
    ];
    return [selfUser, ...defaultBots];
  }

  _sendHeartbeat(force = false) {
    if (!this.game || !this.game.s) return;
    const now = Date.now();
    const s = this.game.s;
    const curD = DISTRICT_BY_ID[s.loc.district] || DISTRICT_BY_ID.cbd;
    const coords = this.world3d
      ? this.world3d.getPlayer2DCoords()
      : { x: curD.x, y: curD.y };

    const hash = `${s.loc.district}_${Math.round(coords.x)}_${Math.round(coords.y)}_${s.funds}_${s.clout}`;
    if (!force && this._lastHeartbeatHash === hash && (now - (this._lastHeartbeatTime || 0)) < 15000) {
      return;
    }
    this._lastHeartbeatTime = now;
    this._lastHeartbeatHash = hash;

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
    if (!Array.isArray(players) || !players.length) {
      players = this._getSimulatedCitizens();
    }
    this.onlinePlayers = players;
    const totalCount = players.length;
    const humanCount = players.filter((p) => p.isHuman).length || 1;
    const botCount = totalCount - humanCount;
    const curDist = this.game?.s?.loc?.district || 'cbd';
    const districtCount = players.filter((p) => p.district === curDist).length;

    const pill = document.getElementById('hud-online-pill');
    if (pill) {
      pill.hidden = false;
      pill.textContent = `● ${totalCount} CITIZENS (${humanCount} Live • ${botCount} Autonomous)`;
      pill.title = `${districtCount} in ${DISTRICT_BY_ID[curDist]?.short || curDist} district`;
    }

    const mpCount = document.getElementById('mp-online-count');
    if (mpCount) mpCount.textContent = totalCount;

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
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;

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

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.origText = submitBtn.textContent;
        submitBtn.textContent = '⚖️ Filing Suit...';
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
        .then((data) => {
          if (defInput) defInput.value = '';
          if (data.ok) {
            this.showToast(`⚖️ Suit filed at Maitama High Court against ${defendant}! (+2 Clout)`);
          } else {
            this.showToast(`⚠️ ${data.error || 'High Court rejected suit'}`);
          }
          this._renderHUD();
        })
        .catch(() => {
          this.showToast('⚠️ Network error filing lawsuit');
        })
        .finally(() => {
          setTimeout(() => {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = submitBtn.dataset.origText || 'File Suit';
            }
          }, 2000);
        });
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

    const syncDriveButtons = (inCar) => this._syncDriveButtons(inCar);

    const handleToggleDrive = () => {
      if (!this.world3d) return;
      const inCar = this.world3d.toggleVehicleMode();
      syncDriveButtons(inCar);
      this.showToast(inCar ? '🏎️ Entered Widebody Sports Coupe! Use Joystick or WASD to drive.' : '🚶🏾 Stepped out onto the street walkway.');
    };

    document.getElementById('btn-toggle-drive')?.addEventListener('click', handleToggleDrive);
    document.getElementById('btn-mobile-drive')?.addEventListener('click', handleToggleDrive);

    // Contextual 3D Interaction Button & HUD Prompt
    const triggerContextAct = () => {
      if (typeof this.currentContextAction === 'function') {
        this.currentContextAction();
      }
    };
    document.getElementById('btn-context-act')?.addEventListener('click', triggerContextAct);
    document.getElementById('hud-context-prompt')?.addEventListener('click', (e) => {
      if (e.target.id !== 'btn-context-act') triggerContextAct();
    });

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
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;

      const sel = document.getElementById('wire-recipient-select');
      const amtInput = document.getElementById('wire-amount-input');
      const noteInput = document.getElementById('wire-note-input');

      const toId = sel?.value;
      const toName = sel?.selectedOptions[0]?.dataset.name || 'FCT Player';
      const amount = Math.round(Number(amtInput?.value) || 0);
      const note = noteInput?.value.trim() || 'Abuja Protocol Support';

      if (!toId) {
        this.showToast('⚠️ Please select a recipient from the FCT network.');
        return;
      }
      if (toId === this.playerId) {
        this.showToast('⚠️ Cannot wire Naira to your own wallet.');
        return;
      }
      if (amount < 500) {
        this.showToast('⚠️ Minimum CBN transfer is ₦500.');
        return;
      }
      if (amount > 50000000) {
        this.showToast('⚠️ Maximum transfer per wire is ₦50,000,000.');
        return;
      }
      if (!this.game.canAfford(amount)) {
        this.showToast('⚠️ Insufficient Naira balance for this transfer!');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.origText = submitBtn.textContent;
        submitBtn.textContent = '💸 Wiring...';
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
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.ok) {
            this.showToast(`⚠️ Transfer warning: ${data.error || 'Server error'}`);
          }
        })
        .catch(() => {
          this.showToast('⚠️ Network issue during wire transfer');
        })
        .finally(() => {
          setTimeout(() => {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = submitBtn.dataset.origText || 'Execute Wire';
            }
          }, 2000);
        });

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
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;

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

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.origText = submitBtn.textContent;
        submitBtn.textContent = '📋 Escrowing...';
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
        })
        .finally(() => {
          setTimeout(() => {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = submitBtn.dataset.origText || 'Escrow & Assign Task';
            }
          }, 2000);
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

    // Profile Pillar Quick Civic Buttons
    document.getElementById('btn-profile-recreate')?.addEventListener('click', () => {
      this._openNewCharModal();
    });
    document.getElementById('btn-profile-open-vault')?.addEventListener('click', () => {
      this.openNairaVaultModal();
    });
    document.getElementById('btn-profile-open-edu')?.addEventListener('click', () => {
      this._openEducationModal();
    });
    document.getElementById('btn-profile-open-tax')?.addEventListener('click', () => {
      this._openTaxModal();
    });
    document.getElementById('btn-profile-open-election')?.addEventListener('click', () => {
      this._openElectionModal();
    });

    // Save Game Backup & Recovery (Export / Import / Reset)
    document.getElementById('btn-export-save')?.addEventListener('click', () => {
      this.exportSaveGame();
    });
    document.getElementById('file-import-save')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.importSaveGame(file);
    });
    document.getElementById('btn-reset-save')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset your Abuja Life simulation? This cannot be undone.')) {
        this.resetSaveGame();
      }
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

    // Toggle Brief History expanded details on sign-up card
    document.getElementById('btn-toggle-history-details')?.addEventListener('click', () => {
      const exp = document.getElementById('abuja-history-expanded');
      const btn = document.getElementById('btn-toggle-history-details');
      if (exp) {
        const isHidden = exp.style.display === 'none';
        exp.style.display = isHidden ? 'block' : 'none';
        if (btn) btn.textContent = isHidden ? 'Hide ▴' : 'Chronicles ▾';
      }
    });

    // History Modal Open & Close Triggers
    document.getElementById('btn-top-history')?.addEventListener('click', () => {
      const modal = document.getElementById('abuja-history-modal');
      if (modal) modal.hidden = false;
    });
    document.getElementById('btn-close-history-modal')?.addEventListener('click', () => {
      const modal = document.getElementById('abuja-history-modal');
      if (modal) modal.hidden = true;
      if (this.world3d) this.world3d.resize();
    });
    document.getElementById('btn-history-play-now')?.addEventListener('click', () => {
      const modal = document.getElementById('abuja-history-modal');
      if (modal) modal.hidden = true;
      if (this.world3d) this.world3d.resize();
    });

    document.getElementById('btn-cancel-new-char')?.addEventListener('click', (e) => {
      e?.preventDefault?.();
      const modal = document.getElementById('new-char-modal');
      if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
      }
      if (this.game?.s?.meta) {
        this.game.s.meta.originConfigured = true;
      }
      this._saveGame();
      if (this.world3d) this.world3d.resize();
      this.showToast('▶️ Resumed saved citizen in 3D Abuja!');
    });
    document.getElementById('new-char-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const modal = document.getElementById('new-char-modal');
      if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
      }
      try {
        const name = document.getElementById('char-name-input')?.value?.trim() || 'Alhaji Musa';
        const email = document.getElementById('char-email-input')?.value?.trim() || 'resident@abujalife.ng';
        const region = document.getElementById('char-region-select')?.value || 'cbd';
        const trackId = document.getElementById('char-occupation-select')?.value || 'contractor';
        const gender = document.getElementById('char-gender-select')?.value || 'male';
        const lifeStage = document.getElementById('char-lifestage-select')?.value || 'adult';
        const stObj = LIFE_STAGES[lifeStage] || LIFE_STAGES.adult;
        const ageVal = stObj.defaultAge || 28;
        const lifestyle = document.getElementById('char-lifestyle-select')?.value || 'alhaji';
        const propMode = document.getElementById('char-prev-prop-select')?.value || 'default';

        // Persist sign-up details in browser localStorage
        try {
          const password = document.getElementById('char-password-input')?.value || 'abujalife2026';
          localStorage.setItem('abuja_saved_citizen_profile', JSON.stringify({
            name, email, region, trackId, gender, lifeStage, lifestyle, prevProperty: propMode, password
          }));
        } catch (_) {}

        const chosenDistrict = (region && DISTRICT_BY_ID[region]) ? region : 'cbd';
        this.game = Game.create({
          name,
          track: trackId,
          gender,
          age: ageVal,
          lifeStage,
          lifestyle,
          prevProperty: propMode
        }, {
          decide: (decision) => this._promptDecisionModal(decision)
        });

        this.game.s.meta.originConfigured = true;
        this._ensureExtendedPlayerState();
        this._initGameListenersAfterReset();
        this.lastFunds = this.game.funds();

        if (this.world3d) {
          try {
            this.world3d.resize();
            this.world3d.flyToDistrict(this.game.s.loc.district);
            this.world3d.setPlayerLook(getPlayerLookFromState(this.game.s));
            this.world3d.syncPlayerHouses(Object.values(this.game.s.social.plots || {}));
            if (this.game.s.social.car && typeof this.world3d.setPlayerVehicleAppearance === 'function') {
              this.world3d.setPlayerVehicleAppearance(this.game.s.social.car);
            }
            this.world3d.spawnNairaRain(35);
          } catch (wErr) {
            console.warn('3D world update warning on character creation:', wErr);
          }
        }

        const ls = NIGERIAN_LIFESTYLES[lifestyle] || NIGERIAN_LIFESTYLES.alhaji;
        this.game.log(
          `Started Abuja Life as ${name} (${GENDERS[gender]?.short || 'Citizen'}, ${ageVal} yrs) • Caliber: ${ls.name} (${ls.caliber})!`,
          'good',
          '🇳🇬'
        );

        this._renderAll();
        this._saveGame();
        this._sendHeartbeat();
        if (this.world3d) this.world3d.resize();
        this.showToast(`🇳🇬 Welcome to 3D Abuja, ${name}! Caliber: ${ls.name.split(' (')[0]} (${formatNairaFull(netWorth(this.game.s))} Worth)`);
      } catch (err) {
        console.error('Error completing character sign-up:', err);
        this._renderAll();
      }
    });

    // Top-Nav Icon Pills & Modals
    document.getElementById('btn-top-edu')?.addEventListener('click', () => this._openEducationModal());
    document.getElementById('btn-close-education')?.addEventListener('click', () => {
      const m = document.getElementById('education-modal');
      if (m) m.hidden = true;
    });

    document.getElementById('btn-top-tax')?.addEventListener('click', () => this._openTaxModal());
    document.getElementById('btn-close-tax')?.addEventListener('click', () => {
      const m = document.getElementById('tax-modal');
      if (m) m.hidden = true;
    });

    document.getElementById('btn-top-election')?.addEventListener('click', () => this._openElectionModal());
    document.getElementById('btn-close-election')?.addEventListener('click', () => {
      const m = document.getElementById('election-modal');
      if (m) m.hidden = true;
    });

    document.getElementById('btn-top-mega-housing')?.addEventListener('click', () => this._openMegaHousingModal());
    document.getElementById('btn-close-mega-housing')?.addEventListener('click', () => {
      const m = document.getElementById('mega-housing-modal');
      if (m) m.hidden = true;
    });

    // Afrobeats Synthesizer Radio Controls
    const updateAfrobeatsStatus = () => {
      const playing = this.afrobeats.isPlaying;
      const st = this.afrobeats.getCurrentStation();
      const topLabel = document.getElementById('top-music-label');
      if (topLabel) {
        topLabel.textContent = playing ? `▶ ${st.name.split(' ')[0]}` : st.name.split(' ')[0];
        topLabel.style.color = playing ? '#4ade80' : '#c7d2fe';
      }
      const topBtn = document.getElementById('btn-top-music');
      if (topBtn) topBtn.classList.toggle('active', playing);

      const elStatus = document.getElementById('election-music-status');
      if (elStatus) {
        elStatus.textContent = `${st.name} • ${st.style} (${playing ? '🔊 Playing' : '⏸ Paused'})`;
      }
      const togBtn = document.getElementById('btn-toggle-afrobeats');
      if (togBtn) {
        togBtn.textContent = playing ? '⏸ Pause Nigerian Beat' : '▶️ Play Nigerian Beat';
        togBtn.style.background = playing ? '#dc2626' : '#10b981';
      }
    };

    document.getElementById('btn-top-music')?.addEventListener('click', () => {
      this.afrobeats.toggle();
      updateAfrobeatsStatus();
      this.showToast(this.afrobeats.isPlaying ? '🎶 Afrobeats Synth Radio Live!' : '⏸ Afrobeats Paused');
    });

    document.getElementById('btn-toggle-afrobeats')?.addEventListener('click', () => {
      this.afrobeats.toggle();
      updateAfrobeatsStatus();
    });

    document.getElementById('btn-switch-station')?.addEventListener('click', () => {
      const st = this.afrobeats.cycleStation();
      updateAfrobeatsStatus();
      this.showToast(`📻 Tuned to ${st.name} (${st.style})`);
    });

    // 1-Tap Quick Start Preset Persona Buttons (in #new-char-modal)
    document.querySelectorAll('[data-modal-persona]').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.getAttribute('data-modal-persona');
        this._launchPresetPersona(key);
      });
    });

    // Naija Quick Play Dock Buttons
    document.getElementById('nqd-btn-chop')?.addEventListener('click', () => this.quickChopLife());
    document.getElementById('nqd-btn-spray')?.addEventListener('click', () => this.quickSprayCash());
    document.getElementById('nqd-btn-hustle')?.addEventListener('click', () => this.quickHustle());
    document.getElementById('nqd-btn-cruise')?.addEventListener('click', () => this.openQuickCruiseModal());
    document.getElementById('nqd-btn-radio')?.addEventListener('click', () => {
      this.quickCycleRadio();
      updateAfrobeatsStatus();
    });
    document.getElementById('nqd-btn-gen')?.addEventListener('click', () => this.quickToggleGenerator());
    document.getElementById('nqd-btn-party')?.addEventListener('click', () => {
      this.quickOwambeParty();
      updateAfrobeatsStatus();
    });

    // Quick Cruise Modal controls
    document.getElementById('btn-close-cruise-modal')?.addEventListener('click', () => {
      const m = document.getElementById('quick-cruise-modal');
      if (m) m.hidden = true;
    });

    document.querySelectorAll('.quick-cruise-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dest = btn.getAttribute('data-cruise-dest');
        this.executeQuickCruise(dest);
      });
    });

    // Ergonomic Global Keyboard Shortcuts (Keys 1 - 7)
    this._initQuickShortcuts(updateAfrobeatsStatus);
  }

  _initQuickShortcuts(updateAfrobeatsStatus) {
    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (e.key === '1') {
        e.preventDefault();
        this.quickChopLife();
      } else if (e.key === '2') {
        e.preventDefault();
        this.quickSprayCash();
      } else if (e.key === '3') {
        e.preventDefault();
        this.quickHustle();
      } else if (e.key === '4') {
        e.preventDefault();
        this.openQuickCruiseModal();
      } else if (e.key === '5') {
        e.preventDefault();
        this.quickCycleRadio();
        if (typeof updateAfrobeatsStatus === 'function') updateAfrobeatsStatus();
      } else if (e.key === '6') {
        e.preventDefault();
        this.quickToggleGenerator();
      } else if (e.key === '7') {
        e.preventDefault();
        this.quickOwambeParty();
        if (typeof updateAfrobeatsStatus === 'function') updateAfrobeatsStatus();
      }
    });
  }

  _launchPresetPersona(key) {
    const PERSONAS = {
      obinna: {
        name: 'Chief Obinna',
        email: 'obinna@maitama.ng',
        region: 'maitama',
        trackId: 'contractor',
        lifestyle: 'alhaji',
        gender: 'male',
        lifeStage: 'adult',
        prevProperty: 'default',
        password: 'abujalife2026'
      },
      chioma: {
        name: 'Chioma Gold',
        email: 'chioma@wuse2.ng',
        region: 'wuse2',
        trackId: 'tech',
        lifestyle: 'baddie',
        gender: 'female',
        lifeStage: 'young_adult',
        prevProperty: 'default',
        password: 'abujalife2026'
      },
      tunde: {
        name: 'Tunde Ade',
        email: 'tunde@fintech.ng',
        region: 'jabi',
        trackId: 'tech',
        lifestyle: 'techbro',
        gender: 'male',
        lifeStage: 'young_adult',
        prevProperty: 'default',
        password: 'abujalife2026'
      },
      musa: {
        name: 'Alhaji Musa',
        email: 'musa@wusemarket.ng',
        region: 'garki',
        trackId: 'trader',
        lifestyle: 'hustler',
        gender: 'male',
        lifeStage: 'adult',
        prevProperty: 'default',
        password: 'abujalife2026'
      }
    };

    const p = PERSONAS[key] || PERSONAS.obinna;
    const modal = document.getElementById('new-char-modal');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }

    try {
      localStorage.setItem('abuja_saved_citizen_profile', JSON.stringify(p));
    } catch (_) {}

    const stObj = LIFE_STAGES[p.lifeStage] || LIFE_STAGES.adult;
    this.game = Game.create({
      name: p.name,
      track: p.trackId,
      gender: p.gender,
      age: stObj.defaultAge || 28,
      lifeStage: p.lifeStage,
      lifestyle: p.lifestyle,
      prevProperty: p.prevProperty
    }, {
      decide: (decision) => this._promptDecisionModal(decision)
    });

    if (p.region && DISTRICT_BY_ID[p.region]) {
      this.game.s.loc.district = p.region;
    }
    this.game.s.meta.originConfigured = true;
    this._ensureExtendedPlayerState();
    this._initGameListenersAfterReset();
    this.lastFunds = this.game.funds();

    if (this.world3d) {
      try {
        this.world3d.resize();
        this.world3d.flyToDistrict(this.game.s.loc.district);
        this.world3d.setPlayerLook(getPlayerLookFromState(this.game.s));
        this.world3d.syncPlayerHouses(Object.values(this.game.s.social.plots || {}));
        if (typeof this.world3d.setPlayerVehicleAppearance === 'function') {
          this.world3d.setPlayerVehicleAppearance(this.game.s.social.car || 'along');
        }
        this.world3d.spawnNairaRain(35);
      } catch (err) {
        console.warn('3D world update warning on preset persona launch:', err);
      }
    }

    const ls = NIGERIAN_LIFESTYLES[p.lifestyle] || NIGERIAN_LIFESTYLES.alhaji;
    this.game.log(`Spawned in Abuja as ${p.name} • ${ls.name}!`, 'good', '🇳🇬');
    this.showToast(`🇳🇬 Welcome to 3D Abuja, ${p.name}! Caliber: ${ls.caliber} (${formatNairaFull(netWorth(this.game.s))} Worth)`);
    this._renderAll();
    this._saveGame();
    this._sendHeartbeat();
  }

  // --------------------------------------------------------------------------
  // NIGERIAN QUICK PLAY ACTIONS (FAST, FUN & AUTHENTIC VIBE)
  // --------------------------------------------------------------------------
  quickChopLife() {
    const cost = 2500;
    if (!this.game.canAfford(cost)) {
      return this.showToast('⚠️ Sapa alert! Need ₦2,500 to chop suya/mama put!');
    }
    this.game.pay(cost);
    if (this.afrobeats?.playSfx) {
      this.afrobeats.playSfx('suya_sizzle');
      setTimeout(() => this.afrobeats.playSfx('chop_life'), 250);
    }
    this.game.stat('energy', 18);
    this.game.stat('sanity', 10);
    if (this.game.s.sims?.motives) {
      this.game.s.sims.motives.hunger = Math.min(100, (this.game.s.sims.motives.hunger || 50) + 40);
      this.game.s.sims.motives.energy = Math.min(100, (this.game.s.sims.motives.energy || 50) + 20);
    }
    if (this.world3d?.showThoughtBubble) {
      this.world3d.showThoughtBubble('🍗', 'Chop Life Sweet!', 3000);
    }
    this.game.log('Chopped spicy roadside Abuja suya & cold drink (+Hunger, +Energy).', 'good', '🍗');
    this.showToast('🍗 Chop life before life chop you! 🥩 (+Hunger, +18 Energy, +10 Sanity)');
    this._renderAll();
  }

  quickSprayCash() {
    const amount = 5000;
    if (!this.game.canAfford(amount)) {
      return this.showToast('⚠️ Sapa! Need ₦5,000 cash in hand to spray!');
    }
    this.game.pay(amount);
    if (this.afrobeats?.playSfx) {
      this.afrobeats.playSfx('spray_cash');
    }
    if (this.world3d?.spawnNairaRain) {
      this.world3d.spawnNairaRain(32);
    }
    if (this.world3d?.showThoughtBubble) {
      this.world3d.showThoughtBubble('💸', 'OPOR! E Choke!', 3200);
    }
    this.game.stat('clout', 8);
    if (this.game.s.social) {
      this.game.s.social.steeze = Math.min(100, (this.game.s.social.steeze || 80) + 4);
    }
    this.game.log(`Sprayed ${formatNairaFull(amount)} in crisp CBN notes! People dey shout "Odogwu!"`, 'good', '💸');
    this.showToast('💸 Opor! E choke! Cash dey rain for Abuja! 💸 (+8 Clout, +4 Steeze)');
    this._renderAll();
  }

  quickHustle() {
    const track = this.game.s.career.track || 'contractor';
    let reward = 45000;
    let label = 'Street Hustle';
    if (track === 'contractor') {
      reward = 65000;
      label = 'Supplied building blocks to Maitama site';
    } else if (track === 'tech') {
      reward = 70000;
      label = 'Delivered remote Flutter/Node API gig for Lagos startup';
    } else if (track === 'trader') {
      reward = 50000;
      label = 'Sold 2 cartons of gadgets at Banex Plaza';
    } else {
      reward = 40000;
      label = 'Processed official departmental clearance allowance';
    }

    this.game.earn(reward, { cash: true });
    if (this.afrobeats?.playSfx) {
      this.afrobeats.playSfx('bank_alert');
    }
    if (this.world3d?.showThoughtBubble) {
      this.world3d.showThoughtBubble('💰', `+${formatNairaFull(reward)} Alert!`, 3200);
    }
    this.game.advance(30);
    this.game.stat('energy', -10);
    this.game.log(`Completed quick hustle: ${label}! Earned ${formatNairaFull(reward)}.`, 'good', '💼');
    this.showToast(`💰 CREDIT ALERT: +${formatNairaFull(reward)}! ${label}! Soft work!`);
    this._renderAll();
  }

  openQuickCruiseModal() {
    const modal = document.getElementById('quick-cruise-modal');
    if (modal) {
      modal.hidden = false;
      if (this.afrobeats?.playSfx) this.afrobeats.playSfx('taxi_horn');
    }
  }

  executeQuickCruise(dest) {
    if (!dest || !DISTRICT_BY_ID[dest]) return;
    const modal = document.getElementById('quick-cruise-modal');
    if (modal) modal.hidden = true;

    const fare = dest === 'lagos_island' ? 15000 : 1000;
    if (this.game.canAfford(fare)) {
      this.game.pay(fare);
    }

    if (this.afrobeats?.playSfx) {
      this.afrobeats.playSfx('taxi_horn');
    }

    this.game.arrive(dest);
    if (this.world3d) {
      this.world3d.flyToDistrict(dest);
    }

    const dName = DISTRICT_BY_ID[dest].name;
    const banter = [
      `🚕 Green Cab arrived at ${dName}! Driver: "Oga, we don land! Have a blessed day!" 🚕💨`,
      `🚕 Zoomed to ${dName} with zero go-slow! Conductor: "Drop your change well!" 🚕💨`,
      `🚕 Smooth cruise into ${dName}! "Abuja expressway clear die today!" 🚕💨`
    ];
    const b = banter[Math.floor(Math.random() * banter.length)];
    this.showToast(b);
    this._renderAll();
  }

  quickCycleRadio() {
    if (!this.afrobeats) return;
    if (!this.afrobeats.isPlaying) this.afrobeats.play();
    const st = this.afrobeats.cycleStation();
    const topLabel = document.getElementById('top-music-label');
    if (topLabel) {
      topLabel.textContent = `▶ ${st.name.split(' ')[0]}`;
      topLabel.style.color = '#4ade80';
    }
    this.showToast(`📻 Tuned to ${st.name} • ${st.style} (${st.vibe})`);
  }

  quickToggleGenerator() {
    const s = this.game.s;
    if (!s.sims) s.sims = { installedObjects: [], utilities: {} };
    if (!s.sims.utilities) s.sims.utilities = {};

    const isRunning = Boolean(s.sims.utilities.generatorRunning);
    s.sims.utilities.generatorRunning = !isRunning;

    if (!isRunning) {
      if (this.afrobeats?.playSfx) this.afrobeats.playSfx('generator');
      if (this.world3d?.showThoughtBubble) this.world3d.showThoughtBubble('⚡', 'Gen Humming!', 3000);
      this.showToast('⚡ I-Pass-My-Neighbor generator humming! Constant 240V in compound!');
      this.game.log('Switched on compound generator. Estate power active.', 'info', '⚡');
    } else {
      if (this.afrobeats?.playSfx) this.afrobeats.playSfx('up_nepa');
      if (this.world3d?.showThoughtBubble) this.world3d.showThoughtBubble('💡', 'UP NEPA!', 3500);
      this.showToast('💡 UP NEPA! National grid restored! Generator turned off!');
      this.game.log('Up NEPA! Public power returned to Abuja feeder line.', 'good', '💡');
    }
    this._renderAll();
  }

  quickOwambeParty() {
    if (this.afrobeats?.playSfx) {
      this.afrobeats.playSfx('party_horn');
    }
    if (this.afrobeats && !this.afrobeats.isPlaying) {
      this.afrobeats.play();
    }
    if (this.world3d?.spawnNairaRain) {
      this.world3d.spawnNairaRain(48);
    }
    if (this.world3d?.showThoughtBubble) {
      this.world3d.showThoughtBubble('🎉', 'OWAMBE LIVE!', 3500);
    }
    this.game.stat('sanity', 18);
    this.game.stat('clout', 12);
    if (this.game.s.sims?.motives) {
      this.game.s.sims.motives.fun = Math.min(100, (this.game.s.sims.motives.fun || 50) + 35);
    }
    this.game.log('Rocked an impromptu Owambe street party! Live Afrobeats booming, crowd dancing!', 'good', '💃');
    this.showToast('🎉 Owambe is LIVE! Gbedu wey dey enter body! 💃🕺 (+Fun, +12 Clout, +18 Sanity)');
    this._renderAll();
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

  switchTab(tabId, subTargetId = null) {
    const ALIAS_MAP = {
      actions: { pillar: 'explore', target: 'tab-actions' },
      commute: { pillar: 'explore', target: 'tab-commute' },
      career: { pillar: 'work', target: 'tab-career' },
      housing: { pillar: 'home', target: 'tab-housing' },
      sims: { pillar: 'home', target: 'tab-sims' },
      network: { pillar: 'social', target: 'tab-network' },
      court: { pillar: 'social', target: 'tab-court' },
      multiplayer: { pillar: 'social', target: 'tab-multiplayer' },
      feed: { pillar: 'social', target: 'tab-feed' },
      shop: { pillar: 'lifestyle', target: 'tab-shop' },
      games: { pillar: 'lifestyle', target: 'tab-games' },
      profile: { pillar: 'profile', target: 'tab-profile' },
      vault: { pillar: 'profile', target: 'tab-profile' },
      explore: { pillar: 'explore', target: 'tab-actions' },
      work: { pillar: 'work', target: 'tab-career' },
      home: { pillar: 'home', target: 'tab-sims' },
      social: { pillar: 'social', target: 'tab-multiplayer' },
      lifestyle: { pillar: 'lifestyle', target: 'tab-shop' }
    };

    const mapping = ALIAS_MAP[tabId] || { pillar: tabId, target: `tab-${tabId}` };
    const pillar = mapping.pillar;
    const targetPaneId = subTargetId || mapping.target;

    this.activeTab = pillar;
    const deck = document.getElementById('command-deck-panel');
    if (deck) deck.classList.remove('is-drawer-closed');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (backdrop) backdrop.hidden = window.innerWidth > 768;

    // Highlight pillar button in deck-tabs
    document.querySelectorAll('.deck-tabs .tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === pillar);
    });
    // Highlight dock icon
    document.querySelectorAll('.gta-dock-icon[data-dock-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.dockTab === pillar);
    });

    // Render and sync Sub-Navigation tabs for active pillar
    this._renderSubNav(pillar, targetPaneId);

    // Show only the target pane among tab-panes
    document.querySelectorAll('.tab-pane').forEach((p) => {
      const isMatch = p.id === targetPaneId;
      p.classList.toggle('active', isMatch);
      p.style.display = isMatch ? 'block' : 'none';
    });

    if (pillar === 'social' || tabId === 'multiplayer') {
      if (this.unreadByChannel[this.chatChannel]) {
        this.unreadByChannel[this.chatChannel] = 0;
      }
      this._updateUnreadBadges();
      this._renderChatMessages();
    }
  }

  _renderSubNav(pillar, activeTargetId) {
    const subNav = document.getElementById('deck-sub-nav');
    if (!subNav) return;

    const SUB_NAV_CONFIG = {
      explore: [
        { id: 'tab-actions', label: '📍 District Moves' },
        { id: 'tab-commute', label: '🛣️ Corridors & Travel' }
      ],
      work: [
        { id: 'tab-career', label: '💼 Careers & Tenders' }
      ],
      home: [
        { id: 'tab-sims', label: '🪫 Motives & Compound' },
        { id: 'tab-housing', label: '🏡 AGIS Land & Leases' }
      ],
      social: [
        { id: 'tab-multiplayer', label: '💬 Multiplayer Chat' },
        { id: 'tab-network', label: '🤝 Contacts & Tasks' },
        { id: 'tab-court', label: '⚖️ FCT High Court' },
        { id: 'tab-feed', label: '📰 Civic Feed' }
      ],
      lifestyle: [
        { id: 'tab-shop', label: '🛍️ Market & Suya' },
        { id: 'tab-games', label: '🎲 Whot & Ludo' }
      ],
      profile: [
        { id: 'tab-profile', label: '👤 Citizen Passport & Civics' }
      ]
    };

    const items = SUB_NAV_CONFIG[pillar] || [];
    if (items.length <= 1) {
      subNav.style.display = 'none';
      subNav.innerHTML = '';
      return;
    }

    subNav.style.display = 'flex';
    subNav.innerHTML = items.map((item) => `
      <button type="button" class="sub-tab-btn ${item.id === activeTargetId ? 'active' : ''}" data-sub-target="${item.id}">
        ${item.label}
      </button>
    `).join('');

    subNav.querySelectorAll('.sub-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.subTarget;
        this.switchTab(pillar, targetId);
      });
    });
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
    if (!modal) return;

    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('abuja_saved_citizen_profile') || 'null');
    } catch (_) {}

    const nameInp = document.getElementById('char-name-input');
    const emailInp = document.getElementById('char-email-input');
    const regionSel = document.getElementById('char-region-select');
    const pwdInp = document.getElementById('char-password-input');
    const occSel = document.getElementById('char-occupation-select');
    const genderSel = document.getElementById('char-gender-select');
    const stageSel = document.getElementById('char-lifestage-select');
    const lifestyleSel = document.getElementById('char-lifestyle-select');
    const propSel = document.getElementById('char-prev-prop-select');
    const passportCard = document.getElementById('char-passport-preview');

    if (nameInp) {
      nameInp.value = (saved && saved.name) ? saved.name : (this.game.s.meta.name || 'Alhaji Musa');
    }
    if (emailInp) emailInp.value = (saved && saved.email) ? saved.email : 'resident@abujalife.ng';
    if (regionSel && saved && saved.region) regionSel.value = saved.region;
    if (pwdInp) pwdInp.value = (saved && saved.password) ? saved.password : 'abujalife2026';

    // 1. Clean Occupation Dropdown
    if (occSel) {
      const activeTrack = (saved && saved.trackId) || this.game.s.career.track || 'contractor';
      occSel.innerHTML = Object.values(TRACKS).map((tr) => `
        <option value="${tr.id}" ${tr.id === activeTrack ? 'selected' : ''}>
          ${tr.icon} ${tr.name} (${tr.field})
        </option>
      `).join('');
    }

    // 2. Clean Gender Dropdown
    if (genderSel) {
      const activeGender = (saved && saved.gender) || this.game.s.meta.gender || 'male';
      genderSel.innerHTML = Object.values(GENDERS).map((g) => `
        <option value="${g.id}" ${g.id === activeGender ? 'selected' : ''}>
          ${g.label}
        </option>
      `).join('');
    }

    // 3. Clean Life Stage Dropdown
    if (stageSel) {
      const activeStage = (saved && saved.lifeStage) || this.game.s.meta.lifeStage || 'adult';
      stageSel.innerHTML = Object.values(LIFE_STAGES).map((st) => `
        <option value="${st.id}" ${st.id === activeStage ? 'selected' : ''}>
          ${st.label} (${st.defaultAge} yrs)
        </option>
      `).join('');
    }

    // 4. Clean Nigerian Lifestyle Caliber Dropdown
    if (lifestyleSel) {
      const activeLifestyle = (saved && saved.lifestyle) || this.game.s.meta.lifestyle || 'alhaji';
      lifestyleSel.innerHTML = Object.values(NIGERIAN_LIFESTYLES).map((ls) => `
        <option value="${ls.id}" ${ls.id === activeLifestyle ? 'selected' : ''}>
          ${ls.name.split(' (')[0]} • ${ls.worthLabel}
        </option>
      `).join('');
    }

    // 5. Clean Starting Accommodation & Ride Dropdown
    if (propSel) {
      const activeProp = (saved && saved.prevProperty) || 'default';
      propSel.innerHTML = Object.values(PREVIOUS_PROPERTY_OPTIONS).map((p) => `
        <option value="${p.id}" ${p.id === activeProp ? 'selected' : ''}>
          ${p.label.split(' (')[0]}
        </option>
      `).join('');
    }

    // Unified Reactive Citizen Passport & Preview Card
    const updatePassportPreview = () => {
      const name = nameInp?.value?.trim() || 'Citizen';
      const tr = TRACKS[occSel?.value] || TRACKS.contractor;
      const g = GENDERS[genderSel?.value] || GENDERS.male;
      const st = LIFE_STAGES[stageSel?.value] || LIFE_STAGES.adult;
      const ls = NIGERIAN_LIFESTYLES[lifestyleSel?.value] || NIGERIAN_LIFESTYLES.alhaji;

      if (passportCard) {
        passportCard.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.12); padding-bottom:8px; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">${g.id === 'female' ? '👩🏾' : '👨🏾'}</span>
              <div>
                <div style="font-size:14px; font-weight:800; color:#fff;">${name}</div>
                <div style="font-size:11px; color:#94a3b8;">${g.label} • ${st.label} (${st.defaultAge} yrs)</div>
              </div>
            </div>
            <span style="font-size:11px; font-weight:700; background:rgba(16,185,129,0.2); color:#4ade80; border:1px solid rgba(74,222,128,0.4); padding:3px 8px; border-radius:999px;">
              ${ls.caliber}
            </span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:6px; font-size:11px;">
            <div style="background:rgba(15,23,42,0.6); padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
              <span style="color:#94a3b8;">💼 Career Track:</span>
              <div style="font-weight:700; color:#38bdf8;">${tr.icon} ${tr.name}</div>
            </div>
            <div style="background:rgba(15,23,42,0.6); padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
              <span style="color:#94a3b8;">💰 Starting Liquid:</span>
              <div style="font-weight:700; color:#4ade80; font-family:var(--font-mono);">${formatNairaFull(ls.cash + ls.bank)}</div>
            </div>
            <div style="background:rgba(15,23,42,0.6); padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
              <span style="color:#94a3b8;">🚗 Starting Ride:</span>
              <div style="font-weight:700; color:#fde047;">${(ls.defaultCar || 'corolla').toUpperCase()}</div>
            </div>
            <div style="background:rgba(15,23,42,0.6); padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
              <span style="color:#94a3b8;">✨ Steeze / Composure:</span>
              <div style="font-weight:700; color:#f472b6;">${ls.steeze}% / ${ls.composure}%</div>
            </div>
          </div>
          <div style="font-size:11px; color:#cbd5e1; margin-top:8px; font-style:italic;">
            "${ls.slangTag}"
          </div>
        `;
      }

      // Update Live Character Avatar Hero Box
      const heroSvgCont = document.getElementById('char-avatar-svg-container');
      const heroName = document.getElementById('char-hero-name');
      const heroTrack = document.getElementById('char-hero-track');
      const heroVibe = document.getElementById('char-hero-vibe');
      if (heroSvgCont) {
        heroSvgCont.innerHTML = renderCharacterAvatarSVG(AVATAR_MAP[tr.id] || 'contractor', 80);
      }
      if (heroName) heroName.textContent = name;
      if (heroTrack) heroTrack.textContent = `${tr.icon} ${tr.name} • ${st.label}`;
      if (heroVibe) heroVibe.textContent = `Caliber: ${ls.caliber} • ${ls.slangTag}`;

      // Update 3D Character Rig in Real-Time behind the card
      if (this.world3d) {
        this.world3d.setPlayerLook(getPlayerLookFromState({
          meta: { gender: g.id, lifestyle: lifestyleSel?.value || ls.id },
          career: { track: tr.id }
        }));
      }

      // Auto-save selections to browser localStorage so choices persist across refresh
      try {
        localStorage.setItem('abuja_saved_citizen_profile', JSON.stringify({
          name,
          email: emailInp?.value || 'resident@abujalife.ng',
          region: regionSel?.value || 'cbd',
          trackId: occSel?.value || 'contractor',
          gender: genderSel?.value || 'male',
          lifeStage: stageSel?.value || 'adult',
          lifestyle: lifestyleSel?.value || 'alhaji',
          prevProperty: propSel?.value || 'default',
          password: pwdInp?.value || 'abujalife2026'
        }));
      } catch (_) {}
    };

    if (nameInp) nameInp.oninput = updatePassportPreview;
    if (occSel) occSel.onchange = updatePassportPreview;
    if (genderSel) genderSel.onchange = updatePassportPreview;
    if (stageSel) stageSel.onchange = updatePassportPreview;
    if (lifestyleSel) {
      lifestyleSel.onchange = () => {
        const ls = NIGERIAN_LIFESTYLES[lifestyleSel.value] || NIGERIAN_LIFESTYLES.alhaji;
        if (ls.recommendedTrack && occSel && TRACKS[ls.recommendedTrack]) {
          occSel.value = ls.recommendedTrack;
        }
        updatePassportPreview();
      };
    }
    if (propSel) propSel.onchange = updatePassportPreview;

    updatePassportPreview();

    const cancelBtn = document.getElementById('btn-cancel-new-char');
    if (cancelBtn) {
      cancelBtn.textContent = this.game.s.meta.originConfigured
        ? `▶️ Continue as ${this.game.s.meta.name}`
        : '⚡ Quick Start Default Citizen';
    }

    modal.hidden = false;
    modal.style.display = 'flex';
  }

  _closeModalById(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = true;
  }

  _openEducationModal() {
    const modal = document.getElementById('education-modal');
    if (!modal) return;
    modal.hidden = false;

    const s = this.game.s;
    const edu = s.education || (s.education = { enrolledCourseId: null, progressDays: 0, completedDegrees: [] });
    const cur = edu.enrolledCourseId ? COURSE_BY_ID[edu.enrolledCourseId] : null;
    const done = edu.completedDegrees || [];

    const banner = document.getElementById('education-status-banner');
    if (banner) {
      const degrees = done.length
        ? done.map((id) => `<span class="meta-pill pos">🎓 ${COURSE_BY_ID[id]?.title || id}</span>`).join(' ')
        : '<span style="color:#94a3b8;font-size:12px;">No degrees yet. Enrol below to begin.</span>';
      if (cur) {
        const pct = Math.min(100, Math.round(((edu.progressDays || 0) / cur.durationDays) * 100));
        banner.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <span style="font-size:11px;color:#60a5fa;font-weight:700;">ACTIVE ENROLMENT</span>
              <h4 style="margin:2px 0 0;color:#fff;font-size:14px;">${cur.title}</h4>
              <span style="font-size:12px;color:#94a3b8;">${cur.institutionName} • ${edu.progressDays || 0}/${cur.durationDays} modules (${pct}%)</span>
            </div>
            <button type="button" id="btn-attend-lecture-action" class="btn-primary" style="padding:10px 16px;font-weight:700;">📖 Attend Lecture</button>
          </div>
          <div style="height:6px;background:#1e293b;border-radius:3px;margin-top:8px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${degrees}</div>`;
        document.getElementById('btn-attend-lecture-action')?.addEventListener('click', () => {
          const res = attendLecture(this.game.s);
          this.showToast(res.message);
          if (res.graduated) {
            this.game.log(res.message, 'good', '🎓');
            if (this.world3d) this.world3d.spawnNairaRain(30);
          }
          this._renderAll();
          this._openEducationModal();
        });
      } else {
        banner.innerHTML = `
          <div style="font-size:11px;color:#94a3b8;font-weight:700;">ACADEMIC STANDING</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">${degrees}</div>`;
      }
    }

    const listEl = document.getElementById('education-institutions-list');
    if (!listEl) return;
    listEl.innerHTML = ABUJA_INSTITUTIONS.map((inst) => `
      <div style="background:#090d16;border:1px solid var(--border-subtle);border-radius:10px;padding:12px;">
        <div style="border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:8px;margin-bottom:8px;">
          <strong style="color:#fff;font-size:13.5px;">${inst.icon} ${inst.name}</strong>
          <div style="font-size:11px;color:#38bdf8;">📍 ${inst.campus} • ${inst.type}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${inst.desc}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">
          ${inst.courses.map((c) => {
            const isCur = edu.enrolledCourseId === c.id;
            const isDone = done.includes(c.id);
            const btn = isDone
              ? '<button class="btn-xs" disabled style="width:100%;opacity:.7;padding:9px;">✅ Completed</button>'
              : isCur
                ? '<button class="btn-xs" disabled style="width:100%;padding:9px;">🔵 Currently enrolled</button>'
                : `<button type="button" class="btn-xs btn-enroll-course" data-id="${c.id}" style="width:100%;background:#2563eb;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:700;">🎓 Enrol — ${formatNairaFull(c.tuition)}</button>`;
            return `
              <div style="background:rgba(15,23,42,.8);border:1px solid ${isCur ? '#3b82f6' : 'rgba(255,255,255,.08)'};border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;">
                <div>
                  <strong style="color:#fff;font-size:12.5px;">${c.title}</strong>
                  <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">${c.desc}</div>
                  <div style="font-size:10.5px;color:#4ade80;margin-top:4px;">+${c.bonusSalaryPercent}% salary • +${c.cloutBonus} Clout • +${c.steezeBonus} Steeze • ${c.durationDays} modules</div>
                </div>
                ${btn}
              </div>`;
          }).join('')}
        </div>
      </div>`).join('');

    listEl.querySelectorAll('.btn-enroll-course').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (edu.enrolledCourseId) {
          this.showToast('⚠️ Finish your current course before enrolling in another.');
          return;
        }
        const res = enrollInCourse(this.game.s, btn.dataset.id);
        this.showToast(res.message);
        if (res.success) this.game.log(res.message, 'good', '🎓');
        this._renderAll();
        this._openEducationModal();
      });
    });
  }

  _openTaxModal() {
    const modal = document.getElementById('tax-modal');
    if (!modal) return;
    modal.hidden = false;

    const a = calculateTaxAssessment(this.game.s);
    const box = document.getElementById('tax-assessment-box');
    if (box) {
      box.innerHTML = `
        <div style="background:#090d16;border:1px solid var(--border-subtle);border-radius:10px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px;margin-bottom:10px;">
            <div>
              <strong style="color:#fff;font-size:14px;">Tax Clearance Certificate (TCC)</strong>
              <div style="font-size:11.5px;color:#94a3b8;">Taxpayer ID: <strong>${a.firsTaxId}</strong></div>
            </div>
            <span class="card-badge" style="${a.hasValidTCC ? 'background:rgba(16,185,129,.2);color:#4ade80;' : 'background:rgba(239,68,68,.2);color:#f87171;'}">
              ${a.hasValidTCC ? `✅ Valid until Day ${a.tccExpiresDay}` : '⚠️ No valid TCC'}
            </span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;">
            <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">💼 Liquid funds assessed</span><strong style="color:#fff;">${formatNairaFull(a.netIncome)}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">📊 Progressive PAYE (this cycle)</span><span style="color:#f87171;">${formatNairaFull(a.cyclePaye)}</span></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">🏡 Luxury property &amp; vehicle levy</span><span style="color:#f87171;">${formatNairaFull(a.luxuryTax)}</span></div>
            <div style="height:1px;background:rgba(255,255,255,.1);"></div>
            <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;"><span style="color:#facc15;">Total due</span><span style="color:#4ade80;">${formatNairaFull(a.totalDue)}</span></div>
            <div style="font-size:11px;color:#94a3b8;">Total taxes paid so far: ${formatNairaFull(this.game.s.tax?.totalTaxesPaid || 0)}</div>
          </div>
        </div>`;
    }

    const payBtn = document.getElementById('btn-pay-taxes-action');
    if (payBtn) {
      payBtn.textContent = `💳 Pay ${formatNairaFull(a.totalDue)} & get 14-day TCC`;
      payBtn.onclick = () => {
        const res = payTaxesAndIssueTCC(this.game.s);
        this.showToast(res.message);
        if (res.success) this.game.log(res.message, 'good', '📜');
        this._renderAll();
        this._openTaxModal();
      };
    }
  }

  _openElectionModal() {
    const modal = document.getElementById('election-modal');
    if (!modal) return;
    modal.hidden = false;

    const s = this.game.s;
    const el = s.elections || (s.elections = { party: null, campaignClout: 0, office: null, voterRegistered: true, ralliesAttended: 0 });

    const refreshMusic = () => {
      const st = this.afrobeats.getCurrentStation?.() || { name: 'WAZOBIA 99.5 FM' };
      const playing = !!this.afrobeats.isPlaying;
      const status = document.getElementById('election-music-status');
      if (status) status.textContent = `${st.name} ${playing ? '• 🔊 Playing' : '• ⏸ Paused'}`;
      const tog = document.getElementById('btn-toggle-afrobeats');
      if (tog) tog.textContent = playing ? '⏸ Pause Nigerian Beat' : '▶️ Play Nigerian Beat';
    };
    refreshMusic();

    const grid = document.getElementById('election-parties-grid');
    if (grid) {
      grid.innerHTML = POLITICAL_PARTIES.map((p) => {
        const member = el.party === p.id;
        return `
          <div style="background:#090d16;border:1.5px solid ${member ? p.colorHex : 'var(--border-subtle)'};border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="card-badge" style="background:${p.bgBadge};color:${p.textColor};font-weight:800;">${p.acronym}</span>
                <span style="font-size:10.5px;color:#94a3b8;">${p.symbol}</span>
              </div>
              <h4 style="margin:6px 0 2px;color:#fff;font-size:13px;">${p.name}</h4>
              <p style="font-size:11px;color:#38bdf8;margin:0 0 4px;font-style:italic;">"${p.slogan}"</p>
              <p style="font-size:11px;color:#cbd5e1;margin:0;line-height:1.35;">${p.ideology}</p>
              <p style="font-size:10.5px;color:#4ade80;margin:4px 0 0;">🎵 ${p.themeSong} • ${p.rallyAdvantage}</p>
            </div>
            ${member
              ? `<button class="btn-xs" disabled style="width:100%;background:${p.colorHex};color:#fff;border:none;padding:10px;font-weight:700;">✅ Member</button>`
              : `<button type="button" class="btn-xs btn-join-party" data-id="${p.id}" style="width:100%;border:1px solid ${p.colorHex};color:${p.textColor};padding:10px;font-weight:700;">Join ${p.acronym}</button>`}
          </div>`;
      }).join('');
      grid.querySelectorAll('.btn-join-party').forEach((btn) => {
        btn.addEventListener('click', () => {
          const party = POLITICAL_PARTIES.find((x) => x.id === btn.dataset.id);
          if (!party) return;
          el.party = party.id;
          this.game.stat('clout', 4);
          this.game.log(`Registered as a card-carrying member of ${party.name}.`, 'good', '🗳️');
          this.showToast(`🗳️ Joined ${party.acronym} — "${party.slogan}" (+4 Clout)`);
          this._renderAll();
          this._openElectionModal();
        });
      });
    }

    const rallies = document.getElementById('rally-venues-list');
    if (rallies) {
      const RALLY_COST = 15000;
      rallies.innerHTML = RALLY_VENUES.map((v) => `
        <div style="background:rgba(15,23,42,.8);border:1px solid var(--border-subtle);border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="color:#fff;font-size:12.5px;">🏟️ ${v.name}</strong>
            <div style="font-size:11px;color:#94a3b8;">📍 ${v.district} • ${v.capacity.toLocaleString()} capacity</div>
            <div style="font-size:11px;color:#cbd5e1;">${v.desc}</div>
          </div>
          <button type="button" class="btn-xs btn-attend-rally" data-id="${v.id}" style="background:#ea580c;color:#fff;border:none;padding:10px 14px;font-weight:700;border-radius:6px;">🎉 Attend (${formatNairaFull(RALLY_COST)})</button>
        </div>`).join('');
      rallies.querySelectorAll('.btn-attend-rally').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = RALLY_VENUES.find((x) => x.id === btn.dataset.id);
          if (!v) return;
          if (!this.game.canAfford(RALLY_COST)) {
            this.showToast(`⚠️ Need ${formatNairaFull(RALLY_COST)} for rally logistics.`);
            return;
          }
          this.game.pay(RALLY_COST);
          this.game.stat('clout', el.party ? 8 : 4);
          this.game.stat('sanity', 15);
          el.ralliesAttended = (el.ralliesAttended || 0) + 1;
          el.campaignClout = (el.campaignClout || 0) + 5;
          if (!this.afrobeats.isPlaying) this.afrobeats.toggle();
          if (this.world3d) this.world3d.spawnNairaRain(40);
          this.game.log(`Rocked the rally at ${v.name}!`, 'good', '🎉');
          this.showToast(`🎉 Rally at ${v.name}! Afrobeats booming • +Clout +Sanity`);
          this._renderAll();
          refreshMusic();
        });
      });
    }

    const tog = document.getElementById('btn-toggle-afrobeats');
    if (tog) tog.onclick = () => { this.afrobeats.toggle(); refreshMusic(); };
    const sw = document.getElementById('btn-switch-station');
    if (sw) sw.onclick = () => { this.afrobeats.cycleStation?.(); refreshMusic(); };
  }

  _openMegaHousingModal() {
    const modal = document.getElementById('mega-housing-modal');
    if (!modal) return;
    modal.hidden = false;

    const dir = document.getElementById('mega-estates-directory');
    if (!dir) return;
    dir.innerHTML = MEGA_ESTATES.map((est) => `
      <div style="background:#090d16;border:1px solid var(--border-subtle);border-radius:10px;padding:12px;">
        <div style="border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:8px;margin-bottom:8px;">
          <strong style="color:#fff;font-size:13.5px;">${est.icon} ${est.name}</strong>
          <div style="font-size:11px;color:#38bdf8;">📍 ${est.district} • ${est.type} • ${est.totalUnits.toLocaleString()} units</div>
          <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">${(est.amenities || []).map((x) => `<span class="meta-pill">${x}</span>`).join('')}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;">
          ${est.units.map((u) => `
            <div style="background:rgba(15,23,42,.8);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:6px;">
              <div>
                <strong style="color:#fff;font-size:12.5px;">${u.title}</strong>
                <div style="font-size:11px;color:#facc15;">Rent ${formatNairaFull(u.rentMonthly)}/mo • Buy ${formatNairaFull(u.buyPrice)}</div>
                <div style="font-size:10.5px;color:#94a3b8;">Sleeps ${u.maxOccupants} • Comfort +${u.comfortBuff}</div>
              </div>
              <div style="display:flex;gap:6px;">
                <button type="button" class="btn-xs btn-rent-mega" data-est="${est.id}" data-unit="${u.id}" style="flex:1;background:#10b981;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:700;">Rent</button>
                <button type="button" class="btn-xs btn-buy-mega" data-est="${est.id}" data-unit="${u.id}" style="flex:1;background:#2563eb;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:700;">Buy</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('');

    const find = (btn) => {
      const est = MEGA_ESTATES.find((e) => e.id === btn.dataset.est);
      const unit = est?.units.find((x) => x.id === btn.dataset.unit);
      return { est, unit };
    };
    const settle = (mode, btn) => {
      const { est, unit } = find(btn);
      if (!est || !unit) return;
      const price = mode === 'buy' ? unit.buyPrice : unit.rentMonthly;
      if (!this.game.canAfford(price)) {
        this.showToast(`⚠️ Need ${formatNairaFull(price)}.`);
        return;
      }
      this.game.pay(price);
      this.game.s.social.megaHome = { estate: est.name, unit: unit.title, mode };
      this.game.stat('clout', mode === 'buy' ? 12 : 3);
      this.game.stat('sanity', mode === 'buy' ? 30 : 12);
      const msg = mode === 'buy' ? `Bought ${unit.title} at ${est.name}!` : `Rented ${unit.title} at ${est.name}.`;
      this.game.log(msg, 'good', '🏙️');
      this.showToast(`🏙️ ${msg}`);
      this._renderAll();
    };
    dir.querySelectorAll('.btn-rent-mega').forEach((b) => b.addEventListener('click', () => settle('rent', b)));
    dir.querySelectorAll('.btn-buy-mega').forEach((b) => b.addEventListener('click', () => settle('buy', b)));
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
  try {
    initUIExtras(window.abujaApp);
  } catch (err) {
    console.warn('UI extras failed to initialise:', err);
  }
});

