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
  formatNairaFull,
  breakdownNairaNotes,
  renderNairaNoteSVG,
  renderDistrictIllustrationSVG,
  renderCharacterAvatarSVG
} from '/visuals.js';
import { AbujaWorld3D } from '/world3d.js';

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
    this.selectedStarterTrack = 'civil';
    this.selectedCommuteDest = 'cbd';
    this.realTimeTimer = null;
    this.simSpeed = 1;
    this.whotState = null;
    this.ludoState = null;

    this._initGame();
    this._ensureExtendedPlayerState();
    this._init3DWorld();
    this._init2DMap();
    this._bindUIEvents();
    this._renderAll();
    this._initMultiplayerBridge();
    this._startRadarLoop();
    this.startRealTime(1);
  }

  _ensureExtendedPlayerState() {
    const s = this.game.s;
    if (!s.social) {
      s.social = {
        courses: [],
        bae: null,
        plots: {},
        car: 'along',
        ownedCars: ['along'],
        solarInstalled: false,
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
    if (!s.social.plots) s.social.plots = {};
    if (!s.social.car) s.social.car = 'along';
    if (!Array.isArray(s.social.ownedCars)) s.social.ownedCars = ['along'];
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
          this.game.log(`Drove into ${dName}.`, 'info', '🚙');
        }
      },
      onSelectDistrict: (districtId) => {
        if (!districtId) return;
        if (districtId === this.game.s.loc.district) {
          this.switchTab('actions');
          this.showToast(`📍 Currently in ${DISTRICT_BY_ID[districtId].name}`);
        } else {
          this.selectedCommuteDest = districtId;
          this.switchTab('commute');
          this._renderCommuteTab();
          this.showToast(`🛣️ Route planner set to ${DISTRICT_BY_ID[districtId].name}`);
        }
      },
      onSelectPlayer: (player) => {
        if (!player) return;
        this.switchTab('multiplayer');
        this.openDirectMessage(player.id, player.name);
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
          this.switchTab('commute');
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
  // 4. GTA V RADAR MINIMAP CANVAS RENDERER
  // --------------------------------------------------------------------------
  _startRadarLoop() {
    const canvas = document.getElementById('gta-radar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const drawRadar = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#06101e';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 26) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 26) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      const curD = this.game.district || DISTRICT_BY_ID.cbd;
      const pCoords = this.world3d
        ? this.world3d.getPlayer2DCoords()
        : { x: curD.x, y: curD.y };

      const scale = 2.2;
      const toRadarX = (x) => w / 2 + (x - pCoords.x) * scale;
      const toRadarY = (y) => h / 2 + (y - pCoords.y) * scale;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
      ctx.lineWidth = 2;
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
          ? '#38bdf8'
          : (d.zone === 1 ? '#f59e0b' : '#10b981');
        ctx.beginPath();
        ctx.arc(rx, ry, d.id === this.game.s.loc.district ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of this.onlinePlayers) {
        if (p.id === this.playerId) continue;
        const d = DISTRICT_BY_ID[p.district] || DISTRICT_BY_ID.wuse2;
        const px = typeof p.x === 'number' ? p.x : d.x;
        const py = typeof p.y === 'number' ? p.y : d.y;
        const rx = toRadarX(px);
        const ry = toRadarY(py);
        if (rx < 0 || rx > w || ry < 0 || ry > h) continue;

        ctx.fillStyle = p.isBot ? '#fbbf24' : '#ec4899';
        ctx.beginPath();
        ctx.arc(rx, ry, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(w / 2, h / 2);
      const heading = this.world3d ? -this.world3d.playerHeading : 0;
      ctx.rotate(heading);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5, 5);
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
    this._renderCareerTab();
    this._renderHousingTab();
    this._renderNetworkTab();
    this._renderLifestyleTab();
    this._renderCourtTab();
    this._renderFeedTab();
  }

  _renderHUD() {
    const s = this.game.s;
    const trackObj = TRACKS[s.career.track] || TRACKS.civil;
    const lvlObj = levelInfo(s);

    const avatarSlot = document.getElementById('hud-avatar-slot');
    if (avatarSlot) {
      avatarSlot.innerHTML = renderCharacterAvatarSVG(AVATAR_MAP[s.career.track] || 'contractor', 42);
    }
    document.getElementById('hud-player-name').textContent = s.meta.name;
    document.getElementById('hud-career-badge').textContent = `${lvlObj.title} • ${trackObj.name}`;

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
  }

  _renderClockAndWeather() {
    const s = this.game.s;
    const clockEl = document.getElementById('hud-clock');
    const weatherEl = document.getElementById('hud-weather');
    if (clockEl) {
      clockEl.textContent = `Day ${this.game.day} • ${Clock.dateStr(s.t)} • ${Clock.clockStr(s.t)}`;
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
      const spotName = spot ? LANDMARK_INDEX[spot]?.landmark?.name : 'Street Level';
      gpsLabel.textContent = `GPS • ${d.short.toUpperCase()} (${spotName})`;
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
      { id: 'jabi', name: 'Jabi Lakeview Commercial (800sqm)', zone: 1, price: 480000, desc: 'Prime Zone 1 waterfront corridor for tech founders and shortlets.' },
      { id: 'guzape', name: 'Guzape Diplomatic Ridge (900sqm)', zone: 1, price: 850000, desc: 'Elite cliffside topography overlooking Asokoro. High political status.' },
      { id: 'maitama', name: 'Maitama Prime Residential Estate (1,200sqm)', zone: 1, price: 1500000, desc: 'Supreme FCT prestige. Diplomats, ministers, 24/7 power, apex status.' }
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
      maitama: 2800000
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
        jabi: 165000,
        wuse2: 240000,
        maitama: 380000
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
    this._renderGarageAndLifestyle();
    this._renderCoursesList();
    this._renderBaeRelationshipBox();
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

    document.getElementById('btn-toggle-drive')?.addEventListener('click', (e) => {
      if (!this.world3d) return;
      const inCar = this.world3d.toggleVehicleMode();
      e.currentTarget.textContent = inCar ? '🚙 SUV Mode (F)' : '🚶 On Foot (F)';
      e.currentTarget.classList.toggle('active', inCar);
    });

    document.getElementById('btn-toggle-cam')?.addEventListener('click', (e) => {
      if (!this.world3d) return;
      const mode = this.world3d.cycleCameraMode();
      e.currentTarget.textContent = mode === 'helicopter' ? '🚁 Chopper Cam (V)' : '🎥 Chase Cam (V)';
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
      e.currentTarget.textContent = isLow ? '❄️ Cool Mode: ON' : '❄️ Cool Mode';
      e.currentTarget.classList.toggle('active', isLow);
      this.showToast(isLow ? '❄️ Cool Mode enabled (30 FPS & 1x DPI battery saver)' : '⚡ Full 60 FPS 3D rendering restored');
    });

    // Spray ₦5,000 Naira in 3D!
    document.getElementById('btn-spray-naira')?.addEventListener('click', () => {
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
    });

    // On-screen WASD Driving Pad
    document.querySelectorAll('#gta-drive-pad .dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir;
      const start = (e) => {
        e.preventDefault();
        if (this.world3d) this.world3d.keys[dir] = true;
      };
      const end = (e) => {
        e.preventDefault();
        if (this.world3d) this.world3d.keys[dir] = false;
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointerleave', end);
    });

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

    // New Character Modal
    document.getElementById('btn-new-char')?.addEventListener('click', () => {
      this._openNewCharModal();
    });
    document.getElementById('btn-cancel-new-char')?.addEventListener('click', () => {
      document.getElementById('new-char-modal').hidden = true;
    });
    document.getElementById('new-char-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('char-name-input').value.trim() || 'Citizen';
      const trackId = TRACKS[this.selectedStarterTrack] ? this.selectedStarterTrack : 'civil';

      this.game = Game.create({ name, track: trackId }, {
        decide: (decision) => this._promptDecisionModal(decision)
      });
      this._ensureExtendedPlayerState();
      this._initGameListenersAfterReset();
      this.lastFunds = this.game.funds();
      document.getElementById('new-char-modal').hidden = true;
      if (this.world3d) this.world3d.flyToDistrict(this.game.s.loc.district);
      this._renderAll();
      this._saveGame();
      this._sendHeartbeat();
      this.showToast(`🇳🇬 Welcome to 3D Abuja, ${name}!`);
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

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.deck-tabs .tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabId);
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
    const grid = document.getElementById('starter-track-options');
    if (!modal || !grid) return;

    document.getElementById('char-name-input').value = this.game.s.meta.name;
    grid.innerHTML = Object.values(TRACKS).map((tr) => {
      const preset = START_PRESETS[tr.id];
      const startTotal = (preset?.cash || 0) + (preset?.bank || 0);
      return `
        <div class="track-option-card ${tr.id === this.selectedStarterTrack ? 'selected' : ''}" data-track="${tr.id}">
          <strong>${tr.icon} ${tr.name}</strong>
          <span style="font-size:11px; color:#94a3b8;">${tr.tagline}</span>
          <span style="font-family:var(--font-mono); font-size:10.5px; color:#4ade80;">Start Funds: ${formatNairaFull(startTotal)} (${DISTRICT_BY_ID[preset.district]?.short})</span>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.track-option-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.selectedStarterTrack = card.dataset.track;
        grid.querySelectorAll('.track-option-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

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

