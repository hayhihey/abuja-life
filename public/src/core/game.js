// Game kernel. Owns the state object, the RNG, the time-advance loop and the
// decision bridge to the UI. Systems (economy, events, actions, travel) are
// plain modules that receive the Game instance; the Game never imports the UI.
//
// Hybrid time model:
//   * Turn-based: every player action/trip calls advance(minutes).
//   * Real-time: the UI may call advance() from a timer ("let time run").
//   * Tickers: hourly (power/ISP) and daily (rent, salary, levies, FX, fuel)
//     fire automatically whenever the clock crosses those boundaries.

import { RNG } from './rng.js';
import { clamp, ngn } from './util.js';
import * as Clock from './clock.js';
import { DISTRICT_BY_ID, LANDMARK_INDEX } from '../data/world.js';
import { newState, fundsOf, SAVE_VERSION } from './state.js';
import { dailyTick, hourlyTick, startDay } from './economy.js';
import { rollEvents } from './events.js';
import { ACTIONS_BY_ID } from './actions.js';
import { tickSimsState } from './sims.js';

export class Game {
  constructor(state, hooks = {}) {
    this.s = state;
    this.rng = new RNG(0);
    this.rng.s = (state.rngState ?? state.meta.seed) >>> 0;
    this.hooks = hooks; // { decide(decision) => Promise<optionId> }
    this.listeners = new Set();
    this.locked = false;
    this._guard = false;
  }

  static create(opts, hooks) {
    const g = new Game(newState(opts), hooks);
    startDay(g, { initial: true });
    g.log(`Welcome to Abuja, ${g.s.meta.name}. Na your turn to make am.`, 'good', '🇳🇬');
    return g;
  }

  static load(json, hooks) {
    const s = typeof json === 'string' ? JSON.parse(json) : json;
    if (!s || s.v !== SAVE_VERSION) throw new Error('Incompatible save');
    return new Game(s, hooks);
  }

  serialize() {
    this.s.rngState = this.rng.s;
    return JSON.stringify(this.s);
  }

  // ------------------------------------------------------------ events bus
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) fn(type, data); }

  log(text, tone = 'info', icon = '') {
    const e = { t: this.s.t, text, tone, icon };
    this.s.log.unshift(e);
    if (this.s.log.length > 150) this.s.log.length = 150;
    this.emit('log', e);
  }

  // ------------------------------------------------------------ derived
  get day() { return Clock.dayNumber(this.s.t); }
  get district() { return DISTRICT_BY_ID[this.s.loc.district]; }
  get home() { return DISTRICT_BY_ID[this.s.home.district]; }
  funds() { return fundsOf(this.s); }
  canAfford(n) { return this.funds() >= n; }
  isPowerOut(districtId) { return (this.s.outages.power[districtId] || 0) > this.s.t; }
  isIspDown(districtId) { return (this.s.outages.isp[districtId] || 0) > this.s.t; }
  isSharp() { return this.s.inv.sharpUntil > this.s.t; }

  /** Output multiplier from fatigue, stress and hangovers. */
  eff() {
    const s = this.s;
    let e = 0.6 + 0.4 * (s.energy / 100);
    if (s.sanity < 25) e *= 0.85;
    if (s.inv.hangover) e *= 0.85;
    return e;
  }

  // ------------------------------------------------------------ money
  /** Spend naira. Small spends come out of cash first; big ones from the bank first. */
  pay(n, { cashOnly = false } = {}) {
    n = Math.round(n);
    if (n <= 0) return true;
    const s = this.s;
    if (cashOnly) {
      if (s.cash < n) return false;
      s.cash -= n;
    } else {
      if (s.cash + s.bank < n) return false;
      if (n < 20_000) {
        const c = Math.min(s.cash, n);
        s.cash -= c; s.bank -= n - c;
      } else {
        const b = Math.min(s.bank, n);
        s.bank -= b; s.cash -= n - b;
      }
    }
    this.emit('hud');
    return true;
  }

  /** Take whatever is available up to n (fines, levies). Returns amount actually taken. */
  drain(n) {
    n = Math.max(0, Math.min(Math.round(n), this.funds()));
    this.pay(n);
    return n;
  }

  earn(n, { cash = false } = {}) {
    n = Math.round(n);
    if (n <= 0) return;
    if (cash) this.s.cash += n; else this.s.bank += n;
    this.emit('hud');
  }

  stat(key, d) {
    this.s[key] = clamp(this.s[key] + d);
  }

  // ------------------------------------------------------------ decisions
  /** Ask the player to choose. Resolves to an option id. Defaults to first enabled option. */
  async ask(d) {
    const enabled = d.options.filter((o) => !o.disabled);
    if (!enabled.length) return d.options[0]?.id;
    let id;
    if (this.hooks.decide) id = await this.hooks.decide(d);
    else id = enabled[0].id;
    return d.options.some((o) => o.id === id && !o.disabled) ? id : enabled[0].id;
  }

  notify(title, body, icon = '📣') {
    return this.ask({ title, body, icon, options: [{ id: 'ok', label: 'Okay' }] });
  }

  // ------------------------------------------------------------ time loop
  /**
   * Advance the clock. Handles passive drain, hourly/daily tickers and survival
   * thresholds (collapse, burnout, detention). `sleeping` flips drain to recovery.
   */
  async advance(minutes, { sleeping = false, restRate = 1 } = {}) {
    let left = Math.max(0, Math.round(minutes));
    while (left > 0) {
      const s = this.s;
      const step = Math.min(left, 60 - (s.t % 60));
      const t0 = s.t;
      s.t += step;
      left -= step;

      const h = Clock.hourOf(t0);
      const atHome = s.loc.district === s.home.district;
      if (sleeping) {
        s.energy = clamp(s.energy + 0.16 * restRate * step);
        const sanityGain = atHome && this.isPowerOut(s.home.district) ? 0.012 : 0.03;
        s.sanity = clamp(s.sanity + sanityGain * restRate * step);
      } else {
        s.energy = clamp(s.energy - (h < 5 ? 0.035 : 0.012) * step);
        if (h < 5) s.sanity = clamp(s.sanity - 0.008 * step);
        if (atHome && this.isPowerOut(s.home.district)) s.sanity = clamp(s.sanity - 0.016 * step);
      }

      if (Math.floor(t0 / 60) !== Math.floor(s.t / 60)) hourlyTick(this);
      tickSimsState(this, step);
      if (Math.floor(t0 / 1440) !== Math.floor(s.t / 1440)) await dailyTick(this);
      await this._thresholds();
    }
    this.emit('time');
  }

  async _thresholds() {
    if (this._guard) return;
    const s = this.s;
    if (s.energy > 0 && s.sanity > 0 && s.heat < 100) return;
    this._guard = true;
    try {
      if (s.energy <= 0) await this._collapse();
      else if (s.sanity <= 0) await this._burnout();
      else if (s.heat >= 100) await this._detention();
    } finally { this._guard = false; }
  }

  async _collapse() {
    const s = this.s;
    const away = s.loc.district !== s.home.district;
    let lost = 0;
    if (away && this.rng.chance(0.25)) lost = Math.min(s.cash, Math.round(s.cash * 0.15));
    s.cash -= lost;
    await this.notify('You slept off',
      `Body say "enough". You dozed off in ${this.district.name} and woke up hours later.` +
      (lost ? ` Somebody lifted ${ngn(lost)} from your pocket.` : ''), '😵');
    await this.advance(300, { sleeping: true, restRate: 0.7 });
    s.sanity = clamp(s.sanity - 8);
    this.log('Collapsed from exhaustion. Five hours gone.', 'bad', '😵');
  }

  async _burnout() {
    const s = this.s;
    s.stats.burnouts++;
    const cost = this.drain(s.bank * 0.03);
    await this.notify('Burnout',
      `Too much hold-up, too many files. You switch off the phone and stay down for two days. It costs you ${ngn(cost)}.`, '🪫');
    s.loc = { district: s.home.district, spot: null };
    await this.advance(2 * 1440, { sleeping: true, restRate: 0.8 });
    s.sanity = Math.max(s.sanity, 50);
    s.energy = Math.max(s.energy, 80);
    this.log('Burnout week. You are back, slower but intact.', 'warn', '🪫');
  }

  async _detention() {
    const s = this.s;
    s.stats.detentions++;
    const fine = this.drain(Math.max(20_000, this.funds() * 0.12));
    await this.notify('Picked up by the task force',
      `Too much attention. You spend a day at the station and pay ${ngn(fine)} before they let you go. Clout takes a knock.`, '🚓');
    await this.advance(1440);
    s.clout = clamp(s.clout - 6);
    s.heat = 35;
    this.log('Detained for a day. Heat reset, clout dented.', 'bad', '🚓');
  }

  // ------------------------------------------------------------ places
  hasAccess(landmark) {
    const s = this.s;
    const g = landmark.gate;
    if (!g) return true;
    if (s.career.track === 'civil' && s.career.posting?.spot === landmark.id) return true;
    if (s.inv.gatePassUntil > s.t) return true;
    return s.clout >= g.clout;
  }

  async goToSpot(spotId) {
    const s = this.s;
    if (spotId === null) { s.loc.spot = null; this.emit('loc'); return true; }
    const L = LANDMARK_INDEX[spotId];
    if (!L || L.district.id !== s.loc.district) return false;
    if (L.landmark.gate && !this.hasAccess(L.landmark)) {
      const g = L.landmark.gate;
      const id = await this.ask({
        title: g.label, icon: '🚧',
        body: `${L.landmark.name} is restricted. You need Protocol ${g.clout}+ (you have ${Math.floor(s.clout)}) or a gate pass.`,
        options: [
          { id: 'plead', label: 'Plead with the orderly', sub: 'Clout-based roll · 20 min' },
          { id: 'settle', label: 'Drop something small (₦5,000 cash)', sub: 'Gets you in, adds heat', disabled: s.cash < 5000, reason: 'Not enough cash' },
          { id: 'leave', label: 'Turn back' },
        ],
      });
      if (id === 'leave') return false;
      if (id === 'settle') {
        this.pay(5000, { cashOnly: true });
        s.heat = clamp(s.heat + 4);
        s.stats.bribes++;
        this.log(`You "settled" the gate man at ${g.label}.`, 'warn', '💵');
      } else {
        await this.advance(20);
        const p = clamp(0.12 + (s.clout / g.clout) * 0.35, 0.1, 0.7);
        if (!this.rng.chance(p)) {
          s.sanity = clamp(s.sanity - 3);
          this.log(`"Oga, no pass, no entry." ${g.label} turns you back.`, 'bad', '🚫');
          return false;
        }
        this.log('You talk your way past the gate.', 'good', '🗣️');
      }
    }
    await this.advance(10);
    s.loc.spot = spotId;
    this.emit('loc');
    return true;
  }

  arrive(districtId) {
    this.s.loc = { district: districtId, spot: null };
    this.emit('loc');
  }

  // ------------------------------------------------------------ actions
  /** Run a registered action by id. Handles costs, time, events and locking. */
  async runAction(id, params = {}) {
    if (this.locked) return { ok: false, reason: 'busy' };
    const a = ACTIONS_BY_ID[id];
    if (!a) return { ok: false, reason: 'unknown action' };
    const s = this.s;
    if (!a.where(this, params)) return { ok: false, reason: 'unavailable here' };
    const why = a.check ? a.check(this, params) : null;
    if (why) { this.log(why, 'warn', '⚠️'); return { ok: false, reason: why }; }
    const c = { min: 0, energy: 0, sanity: 0, ngn: 0, ...(a.cost ? a.cost(this, params) : {}) };
    if (c.energy > s.energy) { this.log('Too tired for that. Rest first.', 'warn', '🥱'); return { ok: false, reason: 'tired' }; }
    if (c.ngn > this.funds()) { this.log(`You need ${ngn(c.ngn)} for that.`, 'warn', '💸'); return { ok: false, reason: 'funds' }; }

    this.locked = true;
    this.emit('lock', true);
    try {
      if (c.ngn) this.pay(c.ngn);
      s.energy = clamp(s.energy - c.energy);
      s.sanity = clamp(s.sanity - c.sanity);
      if (c.min) await this.advance(c.min);
      await a.run(this, params);
      s.stats.actions++;
      if (!a.noEvents) await rollEvents(this, 'action', { action: a });
      const net = Math.max(s.stats.peakNet, 0);
      s.stats.peakNet = net;
      this.emit('action', { id });
      return { ok: true };
    } finally {
      this.locked = false;
      this.emit('lock', false);
      this.emit('hud');
    }
  }

  /** Lock-guarded wrapper for non-action flows (trips, housing, careers). */
  async exclusive(fn) {
    if (this.locked) return undefined;
    this.locked = true;
    this.emit('lock', true);
    try { return await fn(); } finally {
      this.locked = false;
      this.emit('lock', false);
      this.emit('hud');
    }
  }
}
