// ============================================================================
// ABUJA LIFE — UI EXTRAS
//  • Style Studio (character & wardrobe customiser, African hairstyles, Ankara fabrics, car wrap)
//  • Context-aware Radial pie menu (NPC interaction, Smart compound, general simulation)
//  • Ambient city soundscape (52Hz generator hum, traffic, night crickets, horns)
//  • Autopilot AI engine (Autonomous Sims free-will mode)
//  • Quick dock with touch targets & wall cutaway toggle
// ============================================================================

import { evaluateAutonomousActions, planGOAPSequence, runSmartObjectAction } from '/src/core/sims.js';

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

function hasSavedLook() {
  try {
    return Boolean(localStorage.getItem(LOOK_KEY));
  } catch {
    return false;
  }
}

function loadLook(appState = null) {
  try {
    const saved = JSON.parse(localStorage.getItem(LOOK_KEY));
    if (saved) return saved;
  } catch {}
  const gender = appState?.meta?.gender || 'male';
  const lifestyle = appState?.meta?.lifestyle || 'alhaji';
  return {
    skin: 'brown',
    hair: 'black',
    outfit: lifestyle === 'alhaji' ? 'agbada' : lifestyle === 'baddie' ? 'street' : lifestyle === 'techbro' ? 'corporate' : 'ankara',
    hairstyle: gender === 'female' || lifestyle === 'baddie' ? 'braids' : 'fade',
    glasses: lifestyle === 'alhaji' ? 'aviator' : lifestyle === 'baddie' ? 'shades' : 'none',
    fabricPattern: lifestyle === 'alhaji' ? 'brocade' : lifestyle === 'hustler' ? 'ankara' : 'solid',
    agbadaDrape: lifestyle === 'alhaji',
    gender,
    carColor: '#f8fafc',
    carFinish: 'metallic'
  };
}

function lookToRig(sel, fallbackGender = 'male') {
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
    agbadaDrape: Boolean(sel.agbadaDrape || sel.outfit === 'agbada'),
    gender: sel.gender || fallbackGender
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
    this.ctx = window.__abujaSharedAudioCtx || (window.AudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null);
    if (!this.ctx) return false;
    window.__abujaSharedAudioCtx = this.ctx;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

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
    if (this.master && this.ctx) {
      try {
        this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
      } catch {}
    }
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
  let look = loadLook(app?.game?.s);

  const applyLook = () => {
    if (app.world3d && typeof app.world3d.setPlayerLook === 'function') {
      const fallbackGender = app?.game?.s?.meta?.gender || 'male';
      app.world3d.setPlayerLook(lookToRig(look, fallbackGender));
      if (typeof app.world3d.setCarWrap === 'function' && look.carColor) {
        app.world3d.setCarWrap(look.carColor, look.carFinish || 'metallic');
      }
      return true;
    }
    return false;
  };

  if (hasSavedLook()) {
    let tries = 0;
    const wait = setInterval(() => {
      if (applyLook() || ++tries > 40) clearInterval(wait);
    }, 500);
  }

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
    /* Feature #12: Diegetic 9jaPhone Smartphone UI */
    .ux-phone-fab{position:fixed;right:16px;bottom:148px;z-index:85;width:50px;height:50px;border-radius:16px;border:2px solid #4ade80;background:linear-gradient(145deg,#0f172a,#064e3b);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.6);transition:transform .18s}
    .ux-phone-fab:hover,.ux-phone-fab:active{transform:scale(1.08)}
    .ux-phone{position:fixed;right:16px;bottom:14px;width:310px;height:510px;max-height:86vh;background:#060b14;border:4px solid #334155;border-radius:32px;z-index:220;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.85);transform:translateY(115%);transition:transform .28s cubic-bezier(.2,1,.3,1);color:#f8fafc;font-family:inherit}
    .ux-phone.open{transform:translateY(0)}
    .ux-phone-notch{background:#020617;padding:7px 14px;display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,.07)}
    .ux-phone-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:6px 8px;background:#0b1324;border-bottom:1px solid rgba(255,255,255,.08)}
    .ux-phone-tab{padding:6px 2px;border-radius:9px;border:none;background:transparent;color:#94a3b8;font-size:10px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px}
    .ux-phone-tab span{font-size:16px}
    .ux-phone-tab.active{background:rgba(16,185,129,.22);color:#4ade80}
    .ux-phone-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
    .ux-phone-btn{padding:9px 11px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#111c33;color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;justify-content:space-between;align-items:center;text-align:left}
    .ux-phone-btn:hover,.ux-phone-btn:active{background:#1e293b;border-color:#4ade80}
    /* Feature #3: 3D Build & Buy Grid Toolbar */
    .ux-build-bar{position:fixed;top:54px;left:50%;transform:translateX(-50%);z-index:190;background:rgba(9,13,22,.94);border:1.5px solid #4ade80;border-radius:14px;padding:7px 10px;display:none;align-items:center;gap:6px;flex-wrap:wrap;box-shadow:0 12px 32px rgba(0,0,0,.65);max-width:96vw}
    .ux-build-bar.open{display:flex}
    .ux-build-bar button{padding:6px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#1e293b;color:#fff;font-size:11px;font-weight:700;cursor:pointer}
    .ux-build-bar button.active{background:#059669;border-color:#4ade80}
    @media(max-width:768px){.ux-dock{left:8px;top:auto;bottom:185px;transform:none}.ux-dock button{width:40px;height:40px;font-size:18px}.ux-tip{display:none}.ux-phone{right:8px;width:min(300px,94vw);height:460px}}
  `;
  document.head.appendChild(style);

  // ---- Autopilot Free-Will AI Engine ----
  let autopilotActive = false;
  let autopilotTimer = null;

  const runAutopilotTick = async () => {
    if (!autopilotActive || !app.game || app.game.locked) return;
    const s = app.game.s;
    if (!s) return;

    const sims = s.sims;
    const goapPlan = typeof planGOAPSequence === 'function' ? planGOAPSequence(app.game) : [];
    const candidates = goapPlan.length > 0
      ? goapPlan
      : (typeof evaluateAutonomousActions === 'function' ? evaluateAutonomousActions(app.game) : []);

    if (candidates && candidates.length > 0) {
      const top = candidates[0];
      const act = top.interaction;
      const animKind = top.objectId?.includes('bed') ? 'sleep' : top.objectId?.includes('gen') ? 'gen' : 'cook';
      if (app.world3d?.performSmartObjectAnimation) {
        app.world3d.performSmartObjectAnimation(animKind, act.label, 2800);
      } else if (app.world3d?.showThoughtBubble) {
        app.world3d.showThoughtBubble(act.icon || '💡', act.label, 3200);
      }
      const res = runSmartObjectAction(app.game, top.objectId, top.actionId || act.id);
      if (res && res.ok) {
        app.showToast(`🤖 GOAP Autopilot: ${top.reason ? `${top.reason} → ` : ''}${act.label}`);
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
        await app.game.advance(60, { sleeping: true });
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

  // ---- Quick dock (only create if not already unified inside #psp-supsub-drawer) ----
  if (!document.getElementById('ux-btn-pie')) {
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
  }

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
    if (!hasSavedLook()) {
      look = loadLook(app?.game?.s);
    }
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
      const npcId = context.id || null;
      const npcName = context.username || 'FCT Resident';
      items = [
        {
          icon: '🗣️',
          label: 'Banter',
          run: () => {
            app.afrobeats?.playPidginChirp('greet');
            const res = app.world3d?.interactWithPedestrian?.(npcId, 'banter');
            app.game.stat('clout', 3);
            app.game.stat('sanity', 4);
            if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('🗣️', `How far, ${npcName}!`);
            app.showToast(`🗣️ ${npcName}: "${res?.reply || 'Nothing spoil!'}" (❤️ ${res?.affinity || 58})`);
            app._renderAll();
          }
        },
        {
          icon: '😍',
          label: 'Flirt/Toast',
          run: () => {
            app.afrobeats?.playPidginChirp('flirt');
            const res = app.world3d?.interactWithPedestrian?.(npcId, 'flirt');
            app.game.stat('clout', 5);
            if (app.game.s.sims?.motives) app.game.s.sims.motives.social = Math.min(100, (app.game.s.sims.motives.social || 50) + 22);
            if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('😍', 'Steeze 100%!');
            app.showToast(`😍 ${npcName}: "${res?.reply || 'Your steeze choke!'}" (❤️ ${res?.affinity || 64})`);
            app._renderAll();
          }
        },
        {
          icon: '💸',
          label: 'Spray ₦2k',
          run: () => {
            if (!app.game.canAfford(2000)) return app.showToast('⚠️ Need ₦2,000 cash to spray!');
            app.game.pay(2000);
            app.game.stat('clout', 10);
            app.afrobeats?.playPidginChirp('steeze');
            const res = app.world3d?.interactWithPedestrian?.(npcId, 'spray');
            if (app.world3d?.spawnNairaRain) app.world3d.spawnNairaRain(18);
            if (app.world3d?.showThoughtBubble) app.world3d.showThoughtBubble('💸', 'Twale Odogwu!');
            app.showToast(`💸 Sprayed ₦2,000 on ${npcName}! (+10 Clout • ❤️ ${res?.affinity || 75})`);
            app._renderAll();
          }
        },
        {
          icon: '🤝',
          label: 'Negotiate',
          run: () => {
            app.afrobeats?.playPidginChirp('omo');
            const res = app.world3d?.interactWithPedestrian?.(npcId, 'negotiate');
            app.game.stat('network', 6);
            app.showToast(`🤝 ${npcName}: "${res?.reply || 'Make we run am!'}" (+6 Network)`);
            app._renderAll();
          }
        },
        {
          icon: '🎴',
          label: 'Whot Game',
          run: () => {
            app.switchTab('lifestyle', 'tab-games');
            app._startWhotGame?.();
          }
        },
        { icon: '📱', label: '9jaPhone', run: () => openPhone('chat') }
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
          icon: '📐',
          label: '3D Grid',
          run: () => toggleBuildGrid('generator')
        },
        {
          icon: '⚡',
          label: 'Gen/Power',
          run: () => {
            const s = app.game.s;
            const sims = s.sims;
            if (!sims?.utilities) return app.showToast('No compound utilities installed yet.');
            const genObj = sims.installedObjects.includes('gen_soundproof') ? 'gen_soundproof' : 'gen_tiger';
            const actionId = genObj === 'gen_soundproof' ? 'toggle_diesel_gen' : 'start_tiger_gen';
            const res = runSmartObjectAction(app.game, genObj, actionId);
            app.world3d?.performSmartObjectAnimation?.('gen', 'Checking Compound Gen...', 2400);
            app.showToast(res.ok ? (sims.utilities.generatorRunning ? '⚡ Generator humming!' : 'Generator stopped.') : `⚠️ ${res.reason}`);
            app._renderAll();
          }
        },
        {
          icon: '🍜',
          label: 'Cook Indomie',
          run: () => {
            app.world3d?.performSmartObjectAnimation?.('cook', 'Cooking Indomie & Egg...', 3200);
            app.game.stat('energy', 16);
            if (app.game.s.sims?.motives) app.game.s.sims.motives.hunger = Math.min(100, (app.game.s.sims.motives.hunger || 50) + 40);
            app.showToast('🍜 Cooked hot Indomie & Egg at compound stove! (+40 Hunger)');
            app._renderAll();
          }
        },
        {
          icon: '😴',
          label: 'Sleep Bed',
          run: async () => {
            app.world3d?.performSmartObjectAnimation?.('sleep', 'Sleeping in Royal Bed...', 3200);
            await app.game.advance(60, { sleeping: true });
            app.game.stat('energy', 25);
            if (app.game.s.sims?.motives) app.game.s.sims.motives.energy = Math.min(100, (app.game.s.sims.motives.energy || 50) + 45);
            app.showToast('😴 Slept in compound bed! (+25 Energy)');
            app._renderAll();
          }
        },
        { icon: '🎨', label: 'Style', run: openStudio }
      ];
    } else {
      // General simulation pie items
      items = [
        { icon: '📱', label: '9jaPhone', run: () => openPhone('opay') },
        { icon: '📻', label: 'Radio FM', run: () => openRadioWheel() },
        { icon: '📐', label: '3D Build', run: () => toggleBuildGrid('generator') },
        {
          icon: '🏠',
          label: 'Dollhouse',
          run: () => {
            const mode = app.world3d ? app.world3d.cycleWallCutaway() : 'up';
            app.showToast(`🏠 Sims Dollhouse Cutaway: ${mode.toUpperCase()}`);
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
            app.showToast(`🌤️ Abuja Weather: ${next.toUpperCase()}`);
          }
        },
        {
          icon: '🥨',
          label: 'Hawker Game',
          run: () => openTrafficHawkerGame()
        },
        {
          icon: '🚕',
          label: 'Hail Cab',
          run: () => {
            app.world3d?.hailOrCommandeerVehicle?.(null, 'cab', app.selectedCommuteDest || 'wuse2');
            app.showToast('🚕 Green Cab hailed! Cruising along GPS route.');
          }
        },
        { icon: '🎨', label: 'Wardrobe', run: openStudio }
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

  // ---- Feature #10: In-Car Nigerian Radio Station Wheel ----
  function openRadioWheel() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) < 520 ? 112 : 138;
    const stations = app.afrobeats?.stations || [
      { freq: '96.9 FM', name: 'Cool FM Abuja' },
      { freq: '99.5 FM', name: 'Wazobia FM (Pidgin)' },
      { freq: '98.3 FM', name: 'Hot FM Abuja' },
      { freq: '96.5 FM', name: 'Soundcity Radio' },
      { freq: '104.5 FM', name: 'Amapiano Log-Drum' }
    ];
    const icons = ['🎵', '🗣️', '🔥', '🎷', '🎹'];
    const items = stations.map((st, idx) => ({
      icon: icons[idx % icons.length],
      label: st.freq,
      run: () => {
        if (app.afrobeats) {
          const picked = app.afrobeats.selectStation(idx);
          app.afrobeats.setExteriorMuffle(!app.world3d?.inVehicle);
          const lbl = document.getElementById('top-music-label');
          if (lbl) lbl.textContent = picked.freq;
          app.showToast(`📻 Tuned to ${picked.name} (${picked.freq}) — ${picked.dj}`);
        }
      }
    }));
    items.push({
      icon: '🔇',
      label: 'Radio OFF',
      run: () => {
        if (app.afrobeats?.isPlaying) app.afrobeats.stop();
        const lbl = document.getElementById('top-music-label');
        if (lbl) lbl.textContent = 'Radio Off';
        app.showToast('🔇 Car Radio Muted');
      }
    });

    pie.innerHTML = `<div class="ux-pie-center" style="left:${cx}px;top:${cy}px">📻 FCT<br>RADIO</div>`;
    items.forEach((it, i) => {
      const a = (-Math.PI / 2) + (i / items.length) * Math.PI * 2;
      const el = document.createElement('div');
      el.className = 'ux-pie-item';
      el.style.left = `${cx + Math.cos(a) * R}px`;
      el.style.top = `${cy + Math.sin(a) * R}px`;
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

  // ---- Feature #3: Interactive 3D Build & Buy Placement Grid Toolbar ----
  const buildBar = document.createElement('div');
  buildBar.id = 'ux-build-bar';
  buildBar.className = 'ux-build-bar';
  document.body.appendChild(buildBar);

  function renderBuildBar() {
    const cur = app.world3d?.buildGridMode?.itemType || 'generator';
    const catalog = [
      { id: 'generator', label: '⚡ Mikano Gen (₦25k)' },
      { id: 'solar', label: '☀️ Solar Array (₦25k)' },
      { id: 'tank', label: '💧 Geepee Tank (₦25k)' },
      { id: 'suya', label: '🔥 Suya Grill (₦25k)' },
      { id: 'sofa', label: '🛋️ Royal Sofa (₦25k)' }
    ];
    buildBar.innerHTML = `
      <span style="font-size:11px;font-weight:800;color:#4ade80;padding:0 4px">📐 1m×1m 3D LOT GRID:</span>
      ${catalog.map((c) => `<button data-bitem="${c.id}" class="${cur === c.id ? 'active' : ''}">${c.label}</button>`).join('')}
      <button id="ux-build-rot" style="background:#0284c7">🔄 Rotate (R)</button>
      <button id="ux-build-place" style="background:#16a34a">✅ Place Here</button>
      <button id="ux-build-exit" style="background:#dc2626">✕ Exit</button>
    `;
    buildBar.querySelectorAll('[data-bitem]').forEach((btn) => {
      btn.onclick = () => {
        app.world3d?.setBuildPreviewItem?.(btn.dataset.bitem);
        renderBuildBar();
      };
    });
    buildBar.querySelector('#ux-build-rot').onclick = () => app.world3d?.rotateBuildPreview?.();
    buildBar.querySelector('#ux-build-place').onclick = () => {
      if (!app.game.canAfford(25000)) return app.showToast('⚠️ Need ₦25,000 cash to place 3D compound item!');
      app.game.pay(25000);
      app.game.stat('clout', 6);
      app.world3d?.placeBuildPreview?.();
      app.afrobeats?.playSfx?.('cash');
      app.showToast('✅ Placed 3D item on your compound lot! (+6 Clout)');
      app._renderAll();
    };
    buildBar.querySelector('#ux-build-exit').onclick = () => toggleBuildGrid(null, false);
  }

  function toggleBuildGrid(itemType = 'generator', forceState = null) {
    const active = app.world3d?.toggleBuildBuyGridMode?.(itemType, forceState);
    buildBar.classList.toggle('open', Boolean(active));
    if (active) {
      renderBuildBar();
      app.showToast('📐 3D Build Grid Active! Tap ground or [✅ Place Here] to drop furniture.');
    }
    return active;
  }

  // ---- Feature #14A: Go-Slow Traffic Hawker Mini-Game ----
  const miniModal = document.createElement('div');
  miniModal.className = 'ux-modal';
  document.body.appendChild(miniModal);

  let activeMiniGameCleanup = null;

  function openTrafficHawkerGame() {
    if (typeof activeMiniGameCleanup === 'function') activeMiniGameCleanup();
    let lane = 1; // 0 = Left, 1 = Middle, 2 = Right
    let earnings = 0;
    let timeLeft = 18;
    let active = true;
    let entities = [];

    const renderHawker = () => {
      miniModal.innerHTML = `
        <div class="ux-card" style="max-width:420px;text-align:center">
          <button class="ux-close" id="ux-hawk-close">✕</button>
          <h2>🥨 Go-Slow Traffic Hawker</h2>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">Weave through Mararaba-Nyanya traffic! Tap buyers (✋🏾) for ₦5,000 & dodge speeding cars (🚘)!</div>
          <div style="display:flex;justify-content:space-between;background:#111c33;padding:8px 12px;border-radius:10px;font-weight:800;font-size:13px;margin-bottom:10px">
            <span>⏱️ <span id="hawk-time">${timeLeft}</span>s</span>
            <span style="color:#4ade80">💰 Earned: ₦<span id="hawk-cash">${earnings.toLocaleString()}</span></span>
          </div>
          <div id="hawk-road" style="position:relative;height:230px;background:#1e293b;border:2px solid #475569;border-radius:12px;overflow:hidden;display:grid;grid-template-columns:repeat(3,1fr)">
            <div style="border-right:2px dashed rgba(255,255,255,.2)"></div>
            <div style="border-right:2px dashed rgba(255,255,255,.2)"></div>
            <div></div>
            <div id="hawk-entities" style="position:absolute;inset:0;pointer-events:none"></div>
            <div id="hawk-player" style="position:absolute;bottom:12px;left:${lane * 33.3 + 11}%;font-size:28px;transition:left .12s">🏃🏾‍♂️🧺</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px">
            <button class="ux-chip" id="hawk-l" style="justify-content:center">⬅️ Left Lane</button>
            <button class="ux-chip" id="hawk-m" style="justify-content:center">⬆️ Mid Lane</button>
            <button class="ux-chip" id="hawk-r" style="justify-content:center">➡️ Right Lane</button>
          </div>
        </div>
      `;
    };

    renderHawker();
    miniModal.classList.add('open');

    const setLane = (l) => {
      lane = l;
      const p = miniModal.querySelector('#hawk-player');
      if (p) p.style.left = `${lane * 33.3 + 11}%`;
    };
    miniModal.querySelector('#hawk-l').onclick = () => setLane(0);
    miniModal.querySelector('#hawk-m').onclick = () => setLane(1);
    miniModal.querySelector('#hawk-r').onclick = () => setLane(2);

    const stopGame = (msg) => {
      if (!active) return;
      active = false;
      activeMiniGameCleanup = null;
      clearInterval(loop);
      clearInterval(clock);
      miniModal.classList.remove('open');
      if (earnings > 0) {
        app.game.earn(earnings, { cash: true });
        app.game.stat('clout', 4);
        app.afrobeats?.playSfx?.('cash');
      }
      app.showToast(msg || `🥨 Traffic Hawking finished! Pocketed ₦${earnings.toLocaleString()}`);
      app._renderAll();
    };
    activeMiniGameCleanup = () => stopGame();
    miniModal.querySelector('#ux-hawk-close').onclick = () => stopGame();

    const loop = setInterval(() => {
      if (!active) return;
      if (Math.random() < 0.55) {
        entities.push({
          lane: Math.floor(Math.random() * 3),
          y: 0,
          type: Math.random() < 0.65 ? 'buyer' : 'car'
        });
      }
      const box = miniModal.querySelector('#hawk-entities');
      if (!box) return;
      box.innerHTML = '';
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        e.y += 18;
        if (e.y >= 175 && e.y <= 215 && e.lane === lane) {
          if (e.type === 'buyer') {
            earnings += 5000;
            app.afrobeats?.playSfx?.('cash');
            const cEl = miniModal.querySelector('#hawk-cash');
            if (cEl) cEl.textContent = earnings.toLocaleString();
          } else {
            earnings = Math.max(0, earnings - 2500);
            app.afrobeats?.playPidginChirp?.('wahala');
          }
          entities.splice(i, 1);
          continue;
        }
        if (e.y > 230) {
          entities.splice(i, 1);
          continue;
        }
        const d = document.createElement('div');
        d.style.cssText = `position:absolute;top:${e.y}px;left:${e.lane * 33.3 + 11}%;font-size:24px`;
        d.textContent = e.type === 'buyer' ? '✋🏾💵' : '🚘💨';
        box.appendChild(d);
      }
    }, 180);

    const clock = setInterval(() => {
      timeLeft -= 1;
      const tEl = miniModal.querySelector('#hawk-time');
      if (tEl) tEl.textContent = String(timeLeft);
      if (timeLeft <= 0) {
        stopGame(`🥨 Sold Gala & La Casera in go-slow! Earned ₦${earnings.toLocaleString()}!`);
      }
    }, 1000);
  }

  // ---- Feature #14B: VIO / Police Checkpoint Bribe Timing Slider ----
  function openBribeSliderGame() {
    if (typeof activeMiniGameCleanup === 'function') activeMiniGameCleanup();
    let pos = 50;
    let dir = 1;
    let active = true;

    miniModal.innerHTML = `
      <div class="ux-card" style="max-width:400px;text-align:center">
        <button class="ux-close" id="ux-bribe-close">✕</button>
        <h2>🚓 VIO / Checkpoint Negotiation</h2>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:12px">"Oga, wetin you carry for booth?" Hit the <b style="color:#4ade80">GREEN SWEET-MOUTH ZONE (40%–65%)</b> to settle checkpoint heat for ₦2,000!</div>
        <div style="position:relative;height:32px;background:linear-gradient(90deg,#ef4444 0%,#f59e0b 38%,#22c55e 40%,#22c55e 65%,#f59e0b 67%,#ef4444 100%);border-radius:16px;border:2px solid #fff;overflow:hidden;margin:16px 0">
          <div id="bribe-needle" style="position:absolute;top:0;bottom:0;left:50%;width:8px;background:#fff;box-shadow:0 0 10px #000"></div>
        </div>
        <button class="ux-done" id="ux-bribe-hit">🗣️ DROP "PURE WATER" SETTLEMENT (₦2,000)</button>
      </div>
    `;
    miniModal.classList.add('open');

    const anim = setInterval(() => {
      if (!active) return;
      pos += dir * 4.5;
      if (pos >= 96) { pos = 96; dir = -1; }
      if (pos <= 4) { pos = 4; dir = 1; }
      const needle = miniModal.querySelector('#bribe-needle');
      if (needle) needle.style.left = `${pos}%`;
    }, 30);

    const close = () => {
      active = false;
      activeMiniGameCleanup = null;
      clearInterval(anim);
      miniModal.classList.remove('open');
    };
    activeMiniGameCleanup = close;
    miniModal.querySelector('#ux-bribe-close').onclick = close;
    miniModal.querySelector('#ux-bribe-hit').onclick = () => {
      const won = pos >= 38 && pos <= 67;
      close();
      if (won) {
        if (app.game.canAfford(2000)) app.game.pay(2000);
        app.game.s.heat = 0;
        if (app.game.s.social) app.game.s.social.efccHeat = 0;
        app.world3d?.updateWantedPursuitLevel?.(0);
        app.afrobeats?.playPidginChirp?.('steeze');
        app.showToast('🤝 "Oga pass with steeze!" — Wanted Heat cleared to 0★!');
      } else {
        app.afrobeats?.playPidginChirp?.('wahala');
        app.showToast('🚨 Officer vexed! Missed the sweet-mouth zone (+10 Heat).');
        app.game.stat('heat', 10);
      }
      app._renderAll();
    };
  }

  // ---- Feature #12: Diegetic In-Game Smartphone (9jaPhone / Tecno Phantom) ----
  const phoneFab = document.createElement('button');
  phoneFab.id = 'ux-btn-phone';
  phoneFab.className = 'ux-phone-fab';
  phoneFab.title = 'Open 9jaPhone (OPay, 9jaChat, Bolt, CloutTok)';
  phoneFab.innerHTML = '📱';
  document.body.appendChild(phoneFab);

  const phoneEl = document.createElement('div');
  phoneEl.id = 'ux-9japhone';
  phoneEl.className = 'ux-phone';
  document.body.appendChild(phoneEl);

  let activePhoneApp = 'opay';

  function renderPhone(tab = activePhoneApp) {
    activePhoneApp = tab;
    const s = app.game?.s || {};
    const cash = Math.round(s.cash || 0);
    const bank = Math.round(s.bank || 0);
    const contacts = s.contacts || [];

    let bodyHtml = '';
    if (tab === 'opay') {
      bodyHtml = `
        <div style="background:linear-gradient(135deg,#059669,#047857);padding:12px;border-radius:14px">
          <div style="font-size:10px;opacity:.85">OPAY MICROFINANCE • ZERO FEE</div>
          <div style="font-size:19px;font-weight:900;margin:3px 0">₦${bank.toLocaleString()}</div>
          <div style="font-size:11px;opacity:.9">Pocket Cash: ₦${cash.toLocaleString()}</div>
        </div>
        <button class="ux-phone-btn" id="ph-dep-50k"><span>🏦 Save ₦50,000 to OPay</span><span>+Interest</span></button>
        <button class="ux-phone-btn" id="ph-wit-50k"><span>💵 Withdraw ₦50,000 Cash</span><span>Instant</span></button>
        <button class="ux-phone-btn" id="ph-dep-all"><span>🔒 Lock 50% Pocket Cash in Bank</span><span>Safe</span></button>
        <button class="ux-phone-btn" id="ph-bribe"><span>🚓 Settle VIO/EFCC Heat Slider</span><span>Mini-Game</span></button>
      `;
    } else if (tab === 'chat') {
      bodyHtml = `
        <div style="font-size:11px;color:#94a3b8;font-weight:700">9JACHAT • FCT CONTACTS (${contacts.length})</div>
        ${contacts.slice(0, 5).map((c) => `
          <div style="background:#111c33;padding:8px 10px;border-radius:10px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:12px;font-weight:800">${c.name}</div>
              <div style="font-size:10px;color:#94a3b8">${c.role || 'FCT Connect'} • ❤️ ${c.trust || 50}</div>
            </div>
            <button class="ux-chip" data-ph-checkin="${c.id}" style="padding:5px 8px;font-size:10px">📲 Ping</button>
          </div>
        `).join('') || '<div style="font-size:11px;color:#64748b">Walk up to Abuja pedestrians and tap Banter to build your network!</div>'}
        <button class="ux-phone-btn" id="ph-open-mp"><span>🌍 Open Live FCT Multiplayer Chat</span><span>💬</span></button>
      `;
    } else if (tab === 'bolt') {
      const dists = ['wuse2', 'maitama', 'asokoro', 'garki', 'jabi', 'cbd', 'lugbe', 'kubwa', 'nyanya'];
      bodyHtml = `
        <div style="font-size:11px;color:#4ade80;font-weight:800">🚕 BOLT FCT • GREEN CAB & GPS</div>
        <div style="font-size:10.5px;color:#94a3b8">Tap any district to draw the 3D purple GPS route & hail an automated Green Cab:</div>
        ${dists.map((dId) => `
          <button class="ux-phone-btn" data-ph-bolt="${dId}">
            <span>🚕 Ride to ${dId.toUpperCase()}</span>
            <span style="color:#4ade80">₦1,500</span>
          </button>
        `).join('')}
      `;
    } else if (tab === 'agis') {
      const plotsObj = s.social?.plots || {};
      const plotKeys = Object.keys(plotsObj);
      bodyHtml = `
        <div style="font-size:11px;color:#38bdf8;font-weight:800">🏛️ AGIS PORTAL • FCT LAND REGISTRY</div>
        <div style="font-size:10.5px;color:#94a3b8">Verified C-of-O Deeds & 3D Compound Plots (${plotKeys.length}):</div>
        ${plotKeys.map((distId) => {
          const pl = plotsObj[distId];
          return `
            <div style="background:#111c33;padding:8px 10px;border-radius:10px;border:1px solid rgba(56,189,248,.3)">
              <div style="font-size:12px;font-weight:800;color:#fff">📍 ${distId.toUpperCase()} PLOT • Stage ${pl.stage || 1}/5</div>
              <div style="font-size:10px;color:${pl.cofo ? '#4ade80' : '#facc15'}">${pl.cofo ? '✅ AGIS C-of-O Verified' : '⚠️ Pending C-of-O Approval'}</div>
            </div>
          `;
        }).join('') || '<div style="font-size:11px;color:#64748b">No FCT land plots registered yet. Visit AGIS Land Registry to acquire a plot!</div>'}
        <button class="ux-phone-btn" id="ph-agis-grid"><span>📐 Place 3D Items on Compound Lot</span><span>1m×1m Grid</span></button>
        <button class="ux-phone-btn" id="ph-agis-open"><span>🏗️ Open AGIS Land & House Builder</span><span>Deeds</span></button>
      `;
    } else {
      bodyHtml = `
        <div style="font-size:11px;color:#facc15;font-weight:800">🔥 CLOUTTOK & STREET ARCADE</div>
        <button class="ux-phone-btn" id="ph-clout-post"><span>📸 Post Abuja Lifestyle Flex</span><span>+Clout</span></button>
        <button class="ux-phone-btn" id="ph-hawker"><span>🥨 Play Go-Slow Traffic Hawker</span><span>Earn ₦₦</span></button>
        <button class="ux-phone-btn" id="ph-grid"><span>📐 Toggle 3D Lot Build Grid</span><span>Sims 3D</span></button>
        <button class="ux-phone-btn" id="ph-radio"><span>📻 Open In-Car FM Radio Wheel</span><span>5 Stations</span></button>
        <button class="ux-phone-btn" id="ph-wardrobe"><span>🎨 Open 3D Nigerian Wardrobe</span><span>Agbada/Fila</span></button>
      `;
    }

    phoneEl.innerHTML = `
      <div class="ux-phone-notch">
        <span>MTN-NG 5G 📶</span>
        <span>9jaPhone OS</span>
        <span id="ph-close" style="cursor:pointer;color:#f87171;font-size:13px">✕</span>
      </div>
      <div id="ux-phone-push" style="display:none;background:#065f46;color:#ecfdf5;padding:6px 10px;font-size:10.5px;font-weight:700;border-bottom:1px solid #34d399"></div>
      <div class="ux-phone-nav" style="grid-template-columns:repeat(5,1fr)">
        <button class="ux-phone-tab ${tab === 'opay' ? 'active' : ''}" data-phtab="opay"><span>💚</span>OPay</button>
        <button class="ux-phone-tab ${tab === 'chat' ? 'active' : ''}" data-phtab="chat"><span>💬</span>Chat</button>
        <button class="ux-phone-tab ${tab === 'bolt' ? 'active' : ''}" data-phtab="bolt"><span>🚕</span>Bolt</button>
        <button class="ux-phone-tab ${tab === 'agis' ? 'active' : ''}" data-phtab="agis"><span>🏛️</span>AGIS</button>
        <button class="ux-phone-tab ${tab === 'clout' ? 'active' : ''}" data-phtab="clout"><span>🔥</span>Apps</button>
      </div>
      <div class="ux-phone-body">${bodyHtml}</div>
    `;

    phoneEl.querySelector('#ph-close').onclick = () => phoneEl.classList.remove('open');
    phoneEl.querySelectorAll('[data-phtab]').forEach((b) => {
      b.onclick = () => renderPhone(b.dataset.phtab);
    });

    phoneEl.querySelector('#ph-dep-50k')?.addEventListener('click', () => {
      if ((app.game.s.cash || 0) < 50000) return app.showToast('⚠️ Need ₦50,000 pocket cash!');
      app.game.s.cash -= 50000;
      app.game.s.bank = (app.game.s.bank || 0) + 50000;
      app.afrobeats?.playSfx?.('cash');
      app.showToast('💚 Saved ₦50,000 into OPay Wallet!');
      app._renderAll();
      renderPhone('opay');
    });
    phoneEl.querySelector('#ph-wit-50k')?.addEventListener('click', () => {
      if ((app.game.s.bank || 0) < 50000) return app.showToast('⚠️ Need ₦50,000 in OPay bank!');
      app.game.s.bank -= 50000;
      app.game.earn(50000, { cash: true });
      app.afrobeats?.playSfx?.('cash');
      app.showToast('💵 Withdrew ₦50,000 cash from OPay!');
      app._renderAll();
      renderPhone('opay');
    });
    phoneEl.querySelector('#ph-dep-all')?.addEventListener('click', () => {
      const amt = Math.floor((app.game.s.cash || 0) * 0.5);
      if (amt < 1000) return app.showToast('⚠️ Pocket cash too low!');
      app.game.s.cash -= amt;
      app.game.s.bank = (app.game.s.bank || 0) + amt;
      app.showToast(`🔒 Locked ₦${amt.toLocaleString()} safely in OPay!`);
      app._renderAll();
      renderPhone('opay');
    });
    phoneEl.querySelector('#ph-bribe')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      openBribeSliderGame();
    });

    phoneEl.querySelectorAll('[data-ph-checkin]').forEach((btn) => {
      btn.onclick = () => {
        (app.checkInContact || app._checkInContact)?.call(app, btn.dataset.phCheckin);
        renderPhone('chat');
      };
    });
    phoneEl.querySelector('#ph-open-mp')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      app.openDeckTab?.('multiplayer');
    });

    phoneEl.querySelectorAll('[data-ph-bolt]').forEach((btn) => {
      btn.onclick = () => {
        const dest = btn.dataset.phBolt;
        if (!app.game.canAfford(1500)) return app.showToast('⚠️ Need ₦1,500 for Bolt Green Cab!');
        app.game.pay(1500);
        app.selectedCommuteDest = dest;
        app.game.arrive(dest);
        app._checkMissionProgress?.('commute');
        app.world3d?.setGPSRouteDestination?.(dest);
        app.world3d?.hailOrCommandeerVehicle?.(null, 'cab', dest);
        phoneEl.classList.remove('open');
        app.showToast(`🚕 Bolt Green Cab dispatched to ${dest.toUpperCase()}!`);
        app._renderAll();
      };
    });

    phoneEl.querySelector('#ph-clout-post')?.addEventListener('click', () => {
      const now = Date.now();
      if (app._lastCloutTokTime && now - app._lastCloutTokTime < 15000) {
        const rem = Math.ceil((15000 - (now - app._lastCloutTokTime)) / 1000);
        return app.showToast(`⏳ CloutTok algorithm cooling down (${rem}s left)!`);
      }
      app._lastCloutTokTime = now;
      app.game.stat('clout', 7);
      if (app.game.s.social) app.game.s.social.steeze = Math.min(100, (app.game.s.social.steeze || 60) + 8);
      app.afrobeats?.playPidginChirp?.('steeze');
      app.world3d?.showThoughtBubble?.('📸', 'Trending on CloutTok! 🔥', 3000);
      app.showToast('📸 CloutTok video went viral in Abuja! (+7 Clout, +8 Steeze)');
      app._renderAll();
    });
    phoneEl.querySelector('#ph-agis-grid')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      toggleBuildGrid('generator', true);
    });
    phoneEl.querySelector('#ph-agis-open')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      app.switchTab?.('home', 'tab-housing');
    });
    phoneEl.querySelector('#ph-hawker')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      openTrafficHawkerGame();
    });
    phoneEl.querySelector('#ph-grid')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      toggleBuildGrid('generator', true);
    });
    phoneEl.querySelector('#ph-radio')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      openRadioWheel();
    });
    phoneEl.querySelector('#ph-wardrobe')?.addEventListener('click', () => {
      phoneEl.classList.remove('open');
      openStudio();
    });
  }

  let pushTimer = null;
  function showPhoneNotification(icon = '💚', title = 'OPay Alert', text = 'Credit received!') {
    const pushEl = phoneEl.querySelector('#ux-phone-push');
    if (pushEl) {
      pushEl.style.display = 'block';
      pushEl.innerHTML = `${icon} <b>${title}:</b> ${text}`;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        if (pushEl) pushEl.style.display = 'none';
      }, 4500);
    }
  }

  function openPhone(tab = 'opay') {
    if (phoneEl.classList.contains('open') && activePhoneApp === tab) {
      phoneEl.classList.remove('open');
      return;
    }
    renderPhone(tab);
    phoneEl.classList.add('open');
  }

  phoneFab.addEventListener('click', () => openPhone(activePhoneApp));

  pie.addEventListener('click', closePie);
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'Escape') {
      if (typeof activeMiniGameCleanup === 'function') activeMiniGameCleanup();
      closePie();
      studio.classList.remove('open');
      phoneEl.classList.remove('open');
      miniModal.classList.remove('open');
    } else if (e.key.toLowerCase() === 'p') {
      openPhone(activePhoneApp);
    }
  });

  // Expose UI Extras API on app instance for seamless integration
  app.uiExtras = {
    openPhone,
    showPhoneNotification,
    openRadioWheel,
    openTrafficHawkerGame,
    openBribeSliderGame,
    toggleBuildGrid,
    openPie,
    openStudio
  };

  const closePspSubsDrawer = () => {
    const subDrawer = document.getElementById('psp-supsub-drawer');
    if (subDrawer) subDrawer.hidden = true;
  };

  document.getElementById('btn-sub-phone')?.addEventListener('click', () => {
    closePspSubsDrawer();
    openPhone('opay');
  });
  document.getElementById('btn-sub-socialwheel')?.addEventListener('click', () => {
    closePspSubsDrawer();
    const nearNpc = app.world3d?.findNearestPedestrian?.(40);
    openPie(window.innerWidth / 2, window.innerHeight / 2, {
      type: 'npc',
      id: nearNpc?.id || 'ped_0',
      username: nearNpc?.name || 'FCT Resident'
    });
  });
  document.getElementById('btn-sub-hawker')?.addEventListener('click', () => {
    closePspSubsDrawer();
    openTrafficHawkerGame();
  });
  document.getElementById('btn-sub-bribe')?.addEventListener('click', () => {
    closePspSubsDrawer();
    openBribeSliderGame();
  });
  document.getElementById('btn-sub-3dgrid')?.addEventListener('click', () => {
    closePspSubsDrawer();
    toggleBuildGrid('generator', true);
  });
  document.getElementById('btn-sub-weather')?.addEventListener('click', () => {
    const presets = ['sunny', 'rain', 'harmattan', 'sunset', 'night'];
    const cur = app.world3d?.weatherPreset || 'sunny';
    const next = presets[(presets.indexOf(cur) + 1) % presets.length];
    app.world3d?.setWeatherPreset?.(next);
    app.showToast(`🌤️ Abuja 3D Weather: ${next.toUpperCase()}`);
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
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      sx = e.clientX;
      sy = e.clientY;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        const ctx = app.world3d?.pickContextAtScreen ? app.world3d.pickContextAtScreen(sx, sy) : null;
        openPie(sx, sy, ctx);
      }, 950);
    });

    const cancel = () => clearTimeout(pressTimer);
    vp.addEventListener('pointerup', cancel);
    vp.addEventListener('pointercancel', cancel);
    vp.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6) cancel();
    });
  }
}
