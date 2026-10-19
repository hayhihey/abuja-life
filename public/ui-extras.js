// ============================================================================
// ABUJA LIFE — UI EXTRAS
//  • Style Studio (character & wardrobe customiser, African hairstyles, Ankara fabrics, car wrap)
//  • Context-aware Radial pie menu (NPC interaction, Smart compound, general simulation)
//  • Ambient city soundscape (52Hz generator hum, traffic, night crickets, horns)
//  • Autopilot AI engine (Autonomous Sims free-will mode)
//  • Quick dock with touch targets & wall cutaway toggle
// ============================================================================

import { evaluateAutonomousActions, runSmartObjectAction } from '/src/core/sims.js';

const LOOK_KEY = 'abuja_life_look_v1';

const SKIN_TONES = [
  { id: 'honey', hex: 0xb07a52, name: 'Honey' },
  { id: 'caramel', hex: 0x8d5a3b, name: 'Caramel' },
  { id: 'brown', hex: 0x6b3e26, name: 'Brown' },
  { id: 'deep', hex: 0x4a2a1a, name: 'Deep' },
  { id: 'ebony', hex: 0x2f1b12, name: 'Ebony' }
];

const HAIR_COLORS = [
  { id: 'black', hex: 0x090d16, name: 'Black' },
  { id: 'brown', hex: 0x3b2418, name: 'Dark Brown' },
  { id: 'gold', hex: 0xc9a227, name: 'Gold' },
  { id: 'burgundy', hex: 0x6b1230, name: 'Burgundy' },
  { id: 'grey', hex: 0x9ca3af, name: 'Silver' }
];

const HAIRSTYLES = [
  { id: 'fade', name: 'Taper Fade', icon: '💈' },
  { id: 'afro', name: 'Afro Sponge', icon: '🦁' },
  { id: 'locs', name: 'Dreadlocks', icon: '🪮' },
  { id: 'braids', name: 'Box Braids', icon: '✨' },
  { id: 'gele', name: 'Gele Wrap', icon: '👑' },
  { id: 'fila', name: 'Fila Cap', icon: '🎩' }
];

const GLASSES = [
  { id: 'none', name: 'None', icon: '👀' },
  { id: 'aviator', name: 'Alhaji Aviators', icon: '🕶️' },
  { id: 'shades', name: 'Dark Shades', icon: '😎' }
];

const FABRIC_PATTERNS = [
  { id: 'solid', name: 'Plain Crisp', icon: '⚪' },
  { id: 'ankara', name: 'Wax Ankara', icon: '🎨' },
  { id: 'brocade', name: 'Gold Brocade', icon: '✨' }
];

const CAR_WRAPS = [
  { id: '#f8fafc', name: 'Ice White', hex: '#f8fafc' },
  { id: '#090d16', name: 'Abuja Onyx', hex: '#090d16' },
  { id: '#facc15', name: 'Royal Gold', hex: '#facc15' },
  { id: '#10b981', name: 'FCT Emerald', hex: '#10b981' },
  { id: '#ef4444', name: 'Pepper Red', hex: '#ef4444' },
  { id: '#06b6d4', name: 'Neon Cyan', hex: '#06b6d4' },
  { id: '#94a3b8', name: 'Maitama Silver', hex: '#94a3b8' }
];

const CAR_FINISHES = [
  { id: 'metallic', name: 'Gloss Metallic' },
  { id: 'matte', name: 'Matte Stealth' },
  { id: 'chrome', name: 'Mirror Chrome' }
];

// Outfit presets inspired by Nigerian everyday and formal fashion
const OUTFITS = [
  { id: 'agbada', name: 'Agbada (Royal)', icon: '👑', jacketColor: 0xf8fafc, shirtColor: 0xfacc15, pantsColor: 0xf1f5f9, shoeColor: 0x78350f },
  { id: 'kaftan', name: 'Senator Kaftan', icon: '🧥', jacketColor: 0x1e3a8a, shirtColor: 0x1e3a8a, pantsColor: 0x1e3a8a, shoeColor: 0x111827 },
  { id: 'ankara', name: 'Ankara Print', icon: '🎨', jacketColor: 0xea580c, shirtColor: 0x16a34a, pantsColor: 0x7c2d12, shoeColor: 0xfacc15 },
  { id: 'corporate', name: 'Corporate Suit', icon: '💼', jacketColor: 0x1f2937, shirtColor: 0xf8fafc, pantsColor: 0x111827, shoeColor: 0x0f172a },
  { id: 'street', name: 'Street Drip', icon: '🧢', jacketColor: 0xf472b6, shirtColor: 0xf8fafc, pantsColor: 0x111827, shoeColor: 0xfacc15 },
  { id: 'jersey', name: 'Super Eagles Jersey', icon: '⚽', jacketColor: 0x15803d, shirtColor: 0xf8fafc, pantsColor: 0x15803d, shoeColor: 0xf8fafc },
  { id: 'corper', name: 'NYSC Corper', icon: '🎖️', jacketColor: 0x65a30d, shirtColor: 0xf8fafc, pantsColor: 0xf8fafc, shoeColor: 0xf8fafc }
];

function loadLook() {
  try {
    return JSON.parse(localStorage.getItem(LOOK_KEY)) || {
      skin: 'brown',
      hair: 'black',
      outfit: 'street',
      hairstyle: 'fade',
      glasses: 'none',
      fabricPattern: 'solid',
      agbadaDrape: false,
      carColor: '#f8fafc',
      carFinish: 'metallic'
    };
  } catch {
    return {
      skin: 'brown',
      hair: 'black',
      outfit: 'street',
      hairstyle: 'fade',
      glasses: 'none',
      fabricPattern: 'solid',
      agbadaDrape: false,
      carColor: '#f8fafc',
      carFinish: 'metallic'
    };
  }
}

function lookToRig(sel) {
  const skin = SKIN_TONES.find((s) => s.id === sel.skin) || SKIN_TONES[2];
  const hair = HAIR_COLORS.find((h) => h.id === sel.hair) || HAIR_COLORS[0];
  const o = OUTFITS.find((x) => x.id === sel.outfit) || OUTFITS[4];
  return {
    skinColor: skin.hex,
    hairColor: hair.hex,
    jacketColor: o.jacketColor,
    shirtColor: o.shirtColor,
    pantsColor: o.pantsColor,
    shoeColor: o.shoeColor,
    hairstyle: sel.hairstyle || 'fade',
    glasses: sel.glasses || 'none',
    fabricPattern: sel.fabricPattern || 'solid',
    agbadaDrape: Boolean(sel.agbadaDrape || sel.outfit === 'agbada')
  };
}

const hexCss = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;

// ----------------------------------------------------------------------------
// Ambient soundscape (procedural Web Audio, zero downloads)
// ----------------------------------------------------------------------------
class AmbientCity {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.nodes = [];
    this.timer = null;
  }

  _noiseBuffer(ctx) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  start() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    if (!this.ctx) this.ctx = new Ctx();
    const ctx = this.ctx;
    if (ctx.state === 'suspended') ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    this.master.connect(ctx.destination);

    // Distant traffic: low-passed noise
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(ctx);
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const tg = ctx.createGain();
    tg.gain.value = 0.22;
    noise.connect(lp).connect(tg).connect(this.master);
    noise.start();

    // Petrol generator hum (sawtooth with tremolo)
    const gen = ctx.createOscillator();
    gen.type = 'sawtooth';
    gen.frequency.value = 52;
    const gg = ctx.createGain();
    gg.gain.value = 0.045;
    const trem = ctx.createOscillator();
    trem.frequency.value = 11;
    const tremAmt = ctx.createGain();
    tremAmt.gain.value = 0.02;
    trem.connect(tremAmt).connect(gg.gain);
    const glp = ctx.createBiquadFilter();
    glp.type = 'lowpass';
    glp.frequency.value = 220;
    gen.connect(glp).connect(gg).connect(this.master);
    gen.start();
    trem.start();

    this.nodes = [noise, gen, trem];

    // Random events: crickets (night-ish), distant horn
    this.timer = setInterval(() => {
      if (!this.on) return;
      const r = Math.random();
      if (r < 0.55) this._cricket();
      else if (r < 0.8) this._horn();
    }, 1800);

    this.on = true;
    return true;
  }

  _cricket() {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = 4300 + Math.random() * 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + i * 0.09);
      g.gain.linearRampToValueAtTime(0.012, t0 + i * 0.09 + 0.02);
      g.gain.linearRampToValueAtTime(0, t0 + i * 0.09 + 0.06);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.09);
      o.stop(t0 + i * 0.09 + 0.08);
    }
  }

  _horn() {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 400 + Math.random() * 120;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.03, t0 + 0.03);
    g.gain.linearRampToValueAtTime(0, t0 + 0.28);
    o.connect(f).connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.32);
  }

  stop() {
    this.on = false;
    clearInterval(this.timer);
    if (this.master) this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    const nodes = this.nodes;
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch {} }), 600);
    this.nodes = [];
  }

  toggle() {
    if (this.on) this.stop();
    else this.start();
    return this.on;
  }
}

// ----------------------------------------------------------------------------
// UI builder & Integration
// ----------------------------------------------------------------------------
export function initUIExtras(app) {
  const ambient = new AmbientCity();
  let look = loadLook();

  const applyLook = () => {
    if (app.world3d && typeof app.world3d.setPlayerLook === 'function') {
      app.world3d.setPlayerLook(lookToRig(look));
      if (typeof app.world3d.setCarWrap === 'function' && look.carColor) {
        app.world3d.setCarWrap(look.carColor, look.carFinish || 'metallic');
      }
      return true;
    }
    return false;
  };

  let tries = 0;
  const wait = setInterval(() => {
    if (applyLook() || ++tries > 40) clearInterval(wait);
  }, 500);

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    .ux-dock{position:fixed;left:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:60}
    .ux-dock button{width:46px;height:46px;border-radius:14px;border:1.5px solid rgba(255,255,255,.2);background:rgba(9,13,22,.86);backdrop-filter:blur(8px);color:#fff;font-size:22px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.45);transition:transform .15s,background .15s;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
    .ux-dock button:hover,.ux-dock button:active{transform:scale(1.1);background:rgba(16,185,129,.4)}
    .ux-dock button.on{background:rgba(16,185,129,.6);border-color:#4ade80}
    .ux-tip{position:absolute;left:56px;white-space:nowrap;background:#0f172a;color:#e2e8f0;font-size:11px;font-weight:600;padding:4px 8px;border-radius:6px;pointer-events:none;opacity:0;transition:opacity .15s;border:1px solid rgba(255,255,255,.15);box-shadow:0 4px 12px rgba(0,0,0,.5)}
    .ux-dock .wrap{position:relative}
    .ux-dock .wrap:hover .ux-tip{opacity:1}
    .ux-pie{position:fixed;inset:0;z-index:200;background:rgba(2,6,23,.55);backdrop-filter:blur(3px);display:none}
    .ux-pie.open{display:block}
    .ux-pie-center{position:absolute;width:82px;height:82px;margin:-41px 0 0 -41px;border-radius:50%;background:#0f172a;border:2.5px solid #4ade80;color:#4ade80;font-weight:800;font-size:11.5px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;line-height:1.2;box-shadow:0 0 20px rgba(74,222,128,.35)}
    .ux-pie-item{position:absolute;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;background:rgba(15,23,42,.95);border:1.5px solid rgba(255,255,255,.22);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:10.5px;font-weight:700;cursor:pointer;opacity:0;transform:scale(.3);transition:transform .22s cubic-bezier(.2,1.4,.4,1),opacity .18s,background .12s;touch-action:manipulation;box-shadow:0 6px 18px rgba(0,0,0,.45)}
    .ux-pie.open .ux-pie-item{opacity:1;transform:scale(1)}
    .ux-pie-item span{font-size:24px;line-height:1}
    .ux-pie-item:hover,.ux-pie-item:active{background:rgba(16,185,129,.55);border-color:#4ade80}
    .ux-modal{position:fixed;inset:0;z-index:210;background:rgba(2,6,23,.75);display:none;align-items:center;justify-content:center;padding:12px}
    .ux-modal.open{display:flex}
    .ux-card{background:#0b1220;border:1px solid rgba(255,255,255,.14);border-radius:18px;width:min(580px,100%);max-height:92vh;overflow:auto;padding:18px;color:#e2e8f0;box-shadow:0 24px 64px rgba(0,0,0,.7)}
    .ux-card h2{margin:0 0 4px;font-size:19px;color:#fff}
    .ux-card h4{margin:14px 0 6px;font-size:12px;letter-spacing:.06em;color:#94a3b8;text-transform:uppercase}
    .ux-row{display:flex;flex-wrap:wrap;gap:8px}
    .ux-sw{width:42px;height:42px;border-radius:50%;border:3px solid transparent;cursor:pointer;touch-action:manipulation;transition:transform .12s}
    .ux-sw:hover{transform:scale(1.08)}
    .ux-sw.sel{border-color:#4ade80;box-shadow:0 0 0 2px #0b1220 inset}
    .ux-chip{padding:8px 12px;border-radius:10px;border:1.5px solid rgba(255,255,255,.15);background:#111a2e;color:#e2e8f0;font-size:12px;font-weight:600;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;gap:6px;transition:all .12s}
    .ux-chip:hover{background:#1e293b}
    .ux-chip.sel{border-color:#4ade80;background:rgba(16,185,129,.2);color:#fff}
    .ux-close{float:right;background:none;border:none;color:#94a3b8;font-size:22px;cursor:pointer}
    .ux-done{margin-top:16px;width:100%;padding:13px;border:none;border-radius:10px;background:#10b981;color:#fff;font-weight:800;font-size:14px;cursor:pointer}
    @media(max-width:768px){.ux-dock{left:8px;top:auto;bottom:185px;transform:none}.ux-dock button{width:40px;height:40px;font-size:18px}.ux-tip{display:none}}
  `;
  document.head.appendChild(style);

  // ---- Autopilot Free-Will AI Engine ----
  let autopilotActive = false;
  let autopilotTimer = null;

  const runAutopilotTick = () => {
    if (!autopilotActive || !app.game) return;
    const s = app.game.s;
    if (!s) return;

    const sims = s.sims;
    const candidates = typeof evaluateAutonomousActions === 'function' ? evaluateAutonomousActions(app.game) : [];

    if (candidates && candidates.length > 0) {
      const top = candidates[0];
      const act = top.interaction;
      if (app.world3d && typeof app.world3d.showThoughtBubble === 'function') {
        app.world3d.showThoughtBubble(act.icon || '💡', act.label, 3200);
      }
      const res = runSmartObjectAction(app.game, top.objectId, top.actionId);
      if (res && res.ok) {
        app.showToast(`🤖 Autopilot: ${act.label}`);
        app._renderAll();
      }
    } else if (sims?.motives) {
      const m = sims.motives;
      if (m.hunger < 55 && app.game.canAfford(2500)) {
        if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('🥩', 'Buying Suya...', 3000);
        app.game.pay(2500);
        app.game.stat('energy', 14);
        m.hunger = Math.min(100, m.hunger + 35);
        app.showToast('🤖 Autopilot: Bought Suya (+Hunger, +Energy)');
        app._renderAll();
      } else if (m.energy < 40) {
        if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('😴', 'Taking 1h Nap...', 3000);
        app.game.advance(60);
        app.game.stat('energy', 20);
        m.energy = Math.min(100, m.energy + 30);
        app.showToast('🤖 Autopilot: 1h Power Nap (+Energy)');
        app._renderAll();
      } else if (m.fun < 45) {
        if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('🎵', 'Afrobeats Vibe...', 3000);
        m.fun = Math.min(100, m.fun + 25);
        app.game.stat('sanity', 10);
        app.showToast('🤖 Autopilot: Afrobeats Music (+Fun, +Sanity)');
        app._renderAll();
      }
    }
  };

  const toggleAutopilot = () => {
    autopilotActive = !autopilotActive;
    if (autopilotActive) {
      autopilotTimer = setInterval(runAutopilotTick, 8000);
      runAutopilotTick();
      if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('🤖', 'Autopilot ON', 2500);
      app.showToast('🤖 Autopilot AI Engaged — Sims will autonomously satisfy needs!');
    } else {
      clearInterval(autopilotTimer);
      autopilotTimer = null;
      if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('🎮', 'Manual Mode', 2500);
      app.showToast('🎮 Manual Control Restored.');
    }
    document.getElementById('ux-btn-auto')?.classList.toggle('on', autopilotActive);
    return autopilotActive;
  };

  // ---- Quick dock ----
  const dock = document.createElement('div');
  dock.className = 'ux-dock';
  dock.innerHTML = `
    <div class="wrap"><button id="ux-btn-pie" aria-label="Quick actions">⭕</button><span class="ux-tip">Quick Actions (tap / hold map)</span></div>
    <div class="wrap"><button id="ux-btn-auto" aria-label="Autopilot AI">🤖</button><span class="ux-tip">Autopilot AI (Free-Will Mode)</span></div>
    <div class="wrap"><button id="ux-btn-cut" aria-label="Cutaway Walls">🏠</button><span class="ux-tip">Cutaway Walls (Up/Half/Down)</span></div>
    <div class="wrap"><button id="ux-btn-style" aria-label="Style Studio">🎨</button><span class="ux-tip">Style Studio & Car Wrap</span></div>
    <div class="wrap"><button id="ux-btn-amb" aria-label="City ambience">🔊</button><span class="ux-tip">City Ambience</span></div>
  `;
  document.body.appendChild(dock);

  // ---- Style Studio modal ----
  const studio = document.createElement('div');
  studio.className = 'ux-modal';
  document.body.appendChild(studio);

  const renderStudio = () => {
    studio.innerHTML = `
      <div class="ux-card">
        <button class="ux-close" id="ux-studio-close" aria-label="Close">✕</button>
        <h2>🎨 Style Studio & Car Wrap</h2>
        <div style="font-size:12px;color:#94a3b8">Customize skin, hair, cultural headwear, fabrics & vehicle wrap live in 3D.</div>

        <h4>Skin tone</h4>
        <div class="ux-row">${SKIN_TONES.map((s) => `<div class="ux-sw ${look.skin === s.id ? 'sel' : ''}" data-k="skin" data-v="${s.id}" title="${s.name}" style="background:${hexCss(s.hex)}"></div>`).join('')}</div>

        <h4>Hair colour</h4>
        <div class="ux-row">${HAIR_COLORS.map((s) => `<div class="ux-sw ${look.hair === s.id ? 'sel' : ''}" data-k="hair" data-v="${s.id}" title="${s.name}" style="background:${hexCss(s.hex)}"></div>`).join('')}</div>

        <h4>African Grooming & Headwear</h4>
        <div class="ux-row">${HAIRSTYLES.map((h) => `<div class="ux-chip ${(look.hairstyle || 'fade') === h.id ? 'sel' : ''}" data-k="hairstyle" data-v="${h.id}">${h.icon} ${h.name}</div>`).join('')}</div>

        <h4>Designer Eyewear</h4>
        <div class="ux-row">${GLASSES.map((g) => `<div class="ux-chip ${(look.glasses || 'none') === g.id ? 'sel' : ''}" data-k="glasses" data-v="${g.id}">${g.icon} ${g.name}</div>`).join('')}</div>

        <h4>Attire Preset</h4>
        <div class="ux-row">${OUTFITS.map((o) => `<div class="ux-chip ${look.outfit === o.id ? 'sel' : ''}" data-k="outfit" data-v="${o.id}">${o.icon} ${o.name}</div>`).join('')}</div>

        <h4>Fabric Material Pattern</h4>
        <div class="ux-row">${FABRIC_PATTERNS.map((f) => `<div class="ux-chip ${(look.fabricPattern || 'solid') === f.id ? 'sel' : ''}" data-k="fabricPattern" data-v="${f.id}">${f.icon} ${f.name}</div>`).join('')}</div>

        <h4>Sports Car Wrap Color</h4>
        <div class="ux-row">${CAR_WRAPS.map((c) => `<div class="ux-sw ${(look.carColor || '#f8fafc') === c.hex ? 'sel' : ''}" data-k="carColor" data-v="${c.hex}" title="${c.name}" style="background:${c.hex}"></div>`).join('')}</div>

        <h4>Car Finish</h4>
        <div class="ux-row">${CAR_FINISHES.map((f) => `<div class="ux-chip ${(look.carFinish || 'metallic') === f.id ? 'sel' : ''}" data-k="carFinish" data-v="${f.id}">${f.name}</div>`).join('')}</div>

        <button class="ux-done" id="ux-studio-done">Save & Exit Studio</button>
      </div>`;

    studio.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener('click', () => {
        look = { ...look, [el.dataset.k]: el.dataset.v };
        localStorage.setItem(LOOK_KEY, JSON.stringify(look));
        applyLook();
        renderStudio();
      });
    });

    const close = () => studio.classList.remove('open');
    studio.querySelector('#ux-studio-close').onclick = close;
    studio.querySelector('#ux-studio-done').onclick = () => {
      close();
      app.showToast('🎨 Custom style & car wrap saved!');
    };
  };

  studio.addEventListener('click', (e) => {
    if (e.target === studio) studio.classList.remove('open');
  });

  const openStudio = () => {
    closePie();
    renderStudio();
    studio.classList.add('open');
  };

  // ---- Context-Aware Radial pie menu ----
  const pie = document.createElement('div');
  pie.className = 'ux-pie';
  document.body.appendChild(pie);

  const click = (id) => () => document.getElementById(id)?.click();

  let pieOpen = false;
  function closePie() {
    pieOpen = false;
    pie.classList.remove('open');
  }

  function openPie(x, y, context = null) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const R = Math.min(w, h) < 520 ? 108 : 134;
    const cx = Math.min(Math.max(x, R + 50), w - R - 50);
    const cy = Math.min(Math.max(y, R + 50), h - R - 50);

    let items = [];

    if (context?.type === 'npc') {
      items = [
        {
          icon: '👋',
          label: 'Greet',
          run: () => {
            app.game.stat('clout', 3);
            if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('👋', `How far, ${context.username || 'bro'}!`);
            app.showToast(`👋 Greeted ${context.username || 'neighbor'} (+3 Clout)`);
            app._renderAll();
          }
        },
        {
          icon: '💸',
          label: 'Spray ₦',
          run: () => {
            if (!app.game.canAfford(1000)) return app.showToast('⚠️ Need ₦1,000 cash to spray!');
            app.game.pay(1000);
            app.game.stat('clout', 8);
            if (app.world3d?.spawnNairaRain) app.world3d.spawnNairaRain(18);
            if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('💸', 'Spraying Naira!');
            app.showToast(`💸 Sprayed ₦1,000 on ${context.username || 'player'}! (+8 Clout)`);
            app._renderAll();
          }
        },
        { icon: '🎴', label: 'Whot Game', run: click('btn-top-whot') },
        { icon: '💬', label: 'DM Chat', run: () => app.openDeckTab('multiplayer') },
        { icon: '🎨', label: 'Style', run: openStudio }
      ];
    } else if (context?.type === 'house') {
      items = [
        {
          icon: '🏠',
          label: 'Cutaway',
          run: () => {
            const mode = app.world3d ? app.world3d.cycleWallCutaway() : 'up';
            app.showToast(`🏠 Wall Cutaway: ${mode.toUpperCase()}`);
          }
        },
        {
          icon: '🛒',
          label: 'Build/Buy',
          run: () => {
            document.querySelector('[data-subtab="catalog"]')?.click();
            app.openDeckTab('sims');
          }
        },
        {
          icon: '⚡',
          label: 'Gen/Power',
          run: () => {
            const s = app.game.s;
            const sims = s.sims;
            if (!sims?.utilities) return app.showToast('No compound utilities installed yet.');
            const genObj = sims.installedObjects.find((id) => id.startsWith('gen_')) || 'gen_tiger';
            const actionId = sims.utilities.generatorRunning ? 'turn_off_gen' : 'turn_on_gen';
            const res = runSmartObjectAction(app.game, genObj, actionId);
            app.showToast(res.ok ? (sims.utilities.generatorRunning ? '⚡ Generator humming!' : 'Generator stopped.') : `⚠️ ${res.reason}`);
            app._renderAll();
          }
        },
        {
          icon: '💧',
          label: 'Pump Water',
          run: () => {
            const res = runSmartObjectAction(app.game, 'overhead_tank_2000l', 'pump_borehole_water');
            app.showToast(res.ok ? '💧 Borehole pumped 1,000L into Geepee tank!' : `⚠️ ${res.reason}`);
            app._renderAll();
          }
        },
        { icon: '🎨', label: 'Style', run: openStudio }
      ];
    } else {
      // General simulation pie items
      items = [
        { icon: '🏎️', label: 'Car / Walk', run: click('btn-toggle-drive') },
        { icon: '🤖', label: 'Autopilot', run: toggleAutopilot },
        {
          icon: '🏠',
          label: 'Cutaway',
          run: () => {
            const mode = app.world3d ? app.world3d.cycleWallCutaway() : 'up';
            app.showToast(`🏠 Wall Cutaway: ${mode.toUpperCase()}`);
          }
        },
        {
          icon: '🌤️',
          label: 'Weather',
          run: () => {
            const presets = ['sunny', 'rain', 'harmattan', 'sunset', 'night'];
            const cur = app.world3d?.weatherPreset || 'sunny';
            const next = presets[(presets.indexOf(cur) + 1) % presets.length];
            app.world3d?.setWeatherPreset(next);
            app.showToast(`🌤️ Weather: ${next.toUpperCase()}`);
          }
        },
        {
          icon: '🥩',
          label: 'Eat Suya',
          run: () => {
            const cost = 2500;
            if (!app.game.canAfford(cost)) return app.showToast('⚠️ Need ₦2,500 for suya!');
            app.game.pay(cost);
            app.game.stat('energy', 12);
            app.game.stat('sanity', 6);
            if (app.game.s.sims?.motives) app.game.s.sims.motives.hunger = Math.min(100, (app.game.s.sims.motives.hunger || 50) + 35);
            if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('🥩', 'Tasty Abuja Suya!');
            app.showToast('🥩 Suya & pepper — +12 Energy, +6 Sanity');
            app._renderAll();
          }
        },
        {
          icon: '😴',
          label: 'Nap 1h',
          run: async () => {
            await app.game.advance(60);
            app.game.stat('energy', 18);
            if (app.game.s.sims?.motives) app.game.s.sims.motives.energy = Math.min(100, (app.game.s.sims.motives.energy || 50) + 25);
            if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('😴', 'Rested!');
            app.showToast('😴 Quick nap — +18 Energy');
            app._renderAll();
          }
        },
        { icon: '🗺️', label: 'GPS Map', run: () => app.openNigeriaGPSModal() },
        { icon: '🎨', label: 'Style', run: openStudio }
      ];
    }

    pie.innerHTML = `<div class="ux-pie-center" style="left:${cx}px;top:${cy}px">CLOSE</div>`;
    items.forEach((it, i) => {
      const a = (-Math.PI / 2) + (i / items.length) * Math.PI * 2;
      const el = document.createElement('div');
      el.className = 'ux-pie-item';
      el.style.left = `${cx + Math.cos(a) * R}px`;
      el.style.top = `${cy + Math.sin(a) * R}px`;
      el.style.transitionDelay = `${i * 22}ms`;
      el.innerHTML = `<span>${it.icon}</span>${it.label}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        closePie();
        it.run();
      });
      pie.appendChild(el);
    });
    pie.classList.add('open');
    pieOpen = true;
  }

  pie.addEventListener('click', closePie);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePie();
      studio.classList.remove('open');
    }
  });

  document.getElementById('ux-btn-pie').addEventListener('click', () => {
    pieOpen ? closePie() : openPie(window.innerWidth / 2, window.innerHeight / 2);
  });
  document.getElementById('ux-btn-auto').addEventListener('click', toggleAutopilot);
  document.getElementById('ux-btn-cut').addEventListener('click', () => {
    const mode = app.world3d ? app.world3d.cycleWallCutaway() : 'up';
    app.showToast(`🏠 Walls: ${mode.toUpperCase()}`);
  });
  document.getElementById('ux-btn-style').addEventListener('click', openStudio);
  const ambBtn = document.getElementById('ux-btn-amb');
  ambBtn.addEventListener('click', () => {
    const on = ambient.toggle();
    ambBtn.classList.toggle('on', on);
    app.showToast(on ? '🔊 City ambience: 52Hz gen, traffic & night crickets' : '🔇 City ambience off');
  });

  // Long-press / right-click on the 3D viewport opens the contextual radial menu
  const vp = document.getElementById('world3d-viewport');
  if (vp) {
    let pressTimer = null;
    let sx = 0;
    let sy = 0;

    vp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const ctx = app.world3d?.pickContextAtScreen ? app.world3d.pickContextAtScreen(e.clientX, e.clientY) : null;
      openPie(e.clientX, e.clientY, ctx);
    });

    vp.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        const ctx = app.world3d?.pickContextAtScreen ? app.world3d.pickContextAtScreen(sx, sy) : null;
        openPie(sx, sy, ctx);
      }, 550);
    });

    const cancel = () => clearTimeout(pressTimer);
    vp.addEventListener('pointerup', cancel);
    vp.addEventListener('pointercancel', cancel);
    vp.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel();
    });
  }
}
