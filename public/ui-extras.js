// ============================================================================
// ABUJA LIFE — UI EXTRAS
//  • Style Studio (character & wardrobe customiser, persisted)
//  • Radial pie menu (long-press / right-click / ⭕ button)
//  • Ambient city soundscape (generator hum, traffic, night crickets, horns)
//  • Quick dock with large touch targets (mobile friendly)
// ============================================================================

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
    return JSON.parse(localStorage.getItem(LOOK_KEY)) || { skin: 'brown', hair: 'black', outfit: 'street' };
  } catch {
    return { skin: 'brown', hair: 'black', outfit: 'street' };
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
    shoeColor: o.shoeColor
  };
}

const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

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
// UI builder
// ----------------------------------------------------------------------------
export function initUIExtras(app) {
  const ambient = new AmbientCity();
  let look = loadLook();

  const applyLook = () => {
    if (app.world3d && typeof app.world3d.setPlayerLook === 'function') {
      app.world3d.setPlayerLook(lookToRig(look));
      return true;
    }
    return false;
  };
  // world3d may initialise slightly later than the app
  let tries = 0;
  const wait = setInterval(() => {
    if (applyLook() || ++tries > 40) clearInterval(wait);
  }, 500);

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    .ux-dock{position:fixed;right:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:60}
    .ux-dock button{width:48px;height:48px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(15,23,42,.82);backdrop-filter:blur(8px);color:#fff;font-size:22px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);transition:transform .15s,background .15s;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
    .ux-dock button:hover,.ux-dock button:active{transform:scale(1.1);background:rgba(16,185,129,.35)}
    .ux-dock button.on{background:rgba(16,185,129,.55);border-color:#4ade80}
    .ux-tip{position:absolute;right:56px;white-space:nowrap;background:#0f172a;color:#e2e8f0;font-size:11px;padding:4px 8px;border-radius:6px;pointer-events:none;opacity:0;transition:opacity .15s}
    .ux-dock .wrap{position:relative}
    .ux-dock .wrap:hover .ux-tip{opacity:1}
    .ux-pie{position:fixed;inset:0;z-index:200;background:rgba(2,6,23,.55);backdrop-filter:blur(3px);display:none}
    .ux-pie.open{display:block}
    .ux-pie-center{position:absolute;width:78px;height:78px;margin:-39px 0 0 -39px;border-radius:50%;background:#0f172a;border:2px solid #4ade80;color:#4ade80;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;line-height:1.2}
    .ux-pie-item{position:absolute;width:74px;height:74px;margin:-37px 0 0 -37px;border-radius:50%;background:rgba(15,23,42,.94);border:1.5px solid rgba(255,255,255,.2);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:10.5px;font-weight:700;cursor:pointer;opacity:0;transform:scale(.3);transition:transform .22s cubic-bezier(.2,1.4,.4,1),opacity .18s,background .12s;touch-action:manipulation}
    .ux-pie.open .ux-pie-item{opacity:1;transform:scale(1)}
    .ux-pie-item span{font-size:24px;line-height:1}
    .ux-pie-item:hover,.ux-pie-item:active{background:rgba(16,185,129,.55);border-color:#4ade80}
    .ux-modal{position:fixed;inset:0;z-index:210;background:rgba(2,6,23,.7);display:none;align-items:center;justify-content:center;padding:12px}
    .ux-modal.open{display:flex}
    .ux-card{background:#0b1220;border:1px solid rgba(255,255,255,.14);border-radius:16px;width:min(560px,100%);max-height:92vh;overflow:auto;padding:16px;color:#e2e8f0;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .ux-card h2{margin:0 0 4px;font-size:18px;color:#fff}
    .ux-card h4{margin:14px 0 6px;font-size:12px;letter-spacing:.06em;color:#94a3b8;text-transform:uppercase}
    .ux-row{display:flex;flex-wrap:wrap;gap:8px}
    .ux-sw{width:44px;height:44px;border-radius:50%;border:3px solid transparent;cursor:pointer;touch-action:manipulation}
    .ux-sw.sel{border-color:#4ade80;box-shadow:0 0 0 2px #0b1220 inset}
    .ux-chip{padding:9px 12px;border-radius:10px;border:1.5px solid rgba(255,255,255,.15);background:#111a2e;color:#e2e8f0;font-size:12.5px;font-weight:600;cursor:pointer;touch-action:manipulation}
    .ux-chip.sel{border-color:#4ade80;background:rgba(16,185,129,.2);color:#fff}
    .ux-close{float:right;background:none;border:none;color:#94a3b8;font-size:22px;cursor:pointer}
    .ux-done{margin-top:14px;width:100%;padding:12px;border:none;border-radius:10px;background:#10b981;color:#fff;font-weight:800;font-size:14px;cursor:pointer}
    @media(max-width:768px){.ux-dock{top:auto;bottom:230px;transform:none}.ux-dock button{width:44px;height:44px;font-size:20px}.ux-tip{display:none}}
  `;
  document.head.appendChild(style);

  // ---- Quick dock ----
  const dock = document.createElement('div');
  dock.className = 'ux-dock';
  dock.innerHTML = `
    <div class="wrap"><button id="ux-btn-pie" aria-label="Quick actions">⭕</button><span class="ux-tip">Quick Actions (hold on map)</span></div>
    <div class="wrap"><button id="ux-btn-style" aria-label="Style Studio">🎨</button><span class="ux-tip">Style Studio</span></div>
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
        <h2>🎨 Style Studio</h2>
        <div style="font-size:12px;color:#94a3b8">Changes appear on your character live. Saved automatically.</div>
        <h4>Skin tone</h4>
        <div class="ux-row">${SKIN_TONES.map((s) => `<div class="ux-sw ${look.skin === s.id ? 'sel' : ''}" data-k="skin" data-v="${s.id}" title="${s.name}" style="background:${hexCss(s.hex)}"></div>`).join('')}</div>
        <h4>Hair colour</h4>
        <div class="ux-row">${HAIR_COLORS.map((s) => `<div class="ux-sw ${look.hair === s.id ? 'sel' : ''}" data-k="hair" data-v="${s.id}" title="${s.name}" style="background:${hexCss(s.hex)}"></div>`).join('')}</div>
        <h4>Outfit</h4>
        <div class="ux-row">${OUTFITS.map((o) => `<div class="ux-chip ${look.outfit === o.id ? 'sel' : ''}" data-k="outfit" data-v="${o.id}">${o.icon} ${o.name}</div>`).join('')}</div>
        <button class="ux-done" id="ux-studio-done">Done</button>
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
      app.showToast('🎨 Style saved!');
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

  // ---- Radial pie menu ----
  const pie = document.createElement('div');
  pie.className = 'ux-pie';
  document.body.appendChild(pie);

  const click = (id) => () => document.getElementById(id)?.click();
  const PIE_ITEMS = [
    { icon: '🏎️', label: 'Car / Walk', run: click('btn-toggle-drive') },
    { icon: '💸', label: 'Spray ₦', run: click('btn-spray-naira') },
    { icon: '💬', label: 'Chat', run: () => app.openDeckTab('multiplayer') },
    { icon: '🗺️', label: 'GPS Map', run: () => app.openNigeriaGPSModal() },
    {
      icon: '🥩',
      label: 'Eat Suya',
      run: () => {
        const cost = 2500;
        if (!app.game.canAfford(cost)) return app.showToast('⚠️ Need ₦2,500 for suya!');
        app.game.pay(cost);
        app.game.stat('energy', 12);
        app.game.stat('sanity', 6);
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
        app.showToast('😴 Quick nap — +18 Energy');
        app._renderAll();
      }
    },
    { icon: '🎓', label: 'School', run: click('btn-top-edu') },
    { icon: '🎨', label: 'Style', run: openStudio }
  ];

  let pieOpen = false;
  function closePie() {
    pieOpen = false;
    pie.classList.remove('open');
  }
  function openPie(x, y) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const R = Math.min(w, h) < 520 ? 104 : 128;
    const cx = Math.min(Math.max(x, R + 50), w - R - 50);
    const cy = Math.min(Math.max(y, R + 50), h - R - 50);
    pie.innerHTML = `<div class="ux-pie-center" style="left:${cx}px;top:${cy}px">CLOSE</div>`;
    PIE_ITEMS.forEach((it, i) => {
      const a = (-Math.PI / 2) + (i / PIE_ITEMS.length) * Math.PI * 2;
      const el = document.createElement('div');
      el.className = 'ux-pie-item';
      el.style.left = `${cx + Math.cos(a) * R}px`;
      el.style.top = `${cy + Math.sin(a) * R}px`;
      el.style.transitionDelay = `${i * 25}ms`;
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
  document.getElementById('ux-btn-style').addEventListener('click', openStudio);
  const ambBtn = document.getElementById('ux-btn-amb');
  ambBtn.addEventListener('click', () => {
    const on = ambient.toggle();
    ambBtn.classList.toggle('on', on);
    app.showToast(on ? '🔊 City ambience: generators, traffic & night crickets' : '🔇 City ambience off');
  });

  // Long-press / right-click on the 3D viewport opens the pie at that point
  const vp = document.getElementById('world3d-viewport');
  if (vp) {
    let pressTimer = null;
    let sx = 0;
    let sy = 0;
    vp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openPie(e.clientX, e.clientY);
    });
    vp.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => openPie(sx, sy), 600);
    });
    const cancel = () => clearTimeout(pressTimer);
    vp.addEventListener('pointerup', cancel);
    vp.addEventListener('pointercancel', cancel);
    vp.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel();
    });
  }
}
