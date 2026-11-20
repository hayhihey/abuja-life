// Economic tickers and the daily "bulletin". All functions take the Game instance.
// dailyTick fires every midnight, hourlyTick every hour of game time.

import { clamp, nice } from './util.js';
import * as Clock from './clock.js';
import { DISTRICTS, DISTRICT_BY_ID, EDGE_BY_ID, FLOOD_EDGES, CHECKPOINT_EDGES } from '../data/world.js';
import { TRACKS, TRADER, TENDER_AGENCIES, TENDER_CAPITAL, TENDER_TITLES } from '../data/careers.js';
import { HEADLINES } from '../data/voice.js';
import { rentWatch } from './housing.js';
import { rollEvents } from './events.js';

/** Pump price including any scarcity spike. */
export function fuelPrice(game) {
  const m = game.s.market;
  return Math.round(m.fuel * (game.day < m.fuelSpikeUntilDay ? 1.3 : 1));
}

// ---------------------------------------------------------------- hourly
export function hourlyTick(game) {
  const s = game.s;
  const storm = s.market.today.weather === 'storm' ? 2.5 : 1;
  const awake = true;
  for (const id of new Set([s.home.district, s.loc.district])) {
    const D = DISTRICT_BY_ID[id];
    if (!game.isPowerOut(id) && game.rng.chance((1 - D.power) * 0.06 * storm)) {
      s.outages.power[id] = s.t + game.rng.int(2, 9) * 60;
      if (awake && (id === s.loc.district || id === s.home.district)) {
        game.log(`NEPA don take light in ${D.name}. Generators start to hum.`, 'warn', '🔌');
      }
    }
    if (!game.isIspDown(id) && game.rng.chance((1 - D.isp) * 0.04)) {
      s.outages.isp[id] = s.t + game.rng.int(1, 6) * 60;
      if (id === s.loc.district || id === s.home.district) game.log(`Network down in ${D.name}. ISP says "we are working on it".`, 'warn', '📶');
    }
  }

  // Point 33 Fix: Natural police heat cooldown during peaceful play
  if (s.heat > 0) {
    s.heat = Math.max(0, s.heat - 1.5);
  }
}

// ---------------------------------------------------------------- tenders
export function genTenders(game) {
  const s = game.s;
  const L = s.career.track === 'contractor' ? s.career.level : 1;
  const out = [];
  const siteChoices = DISTRICTS.filter((d) => d.id !== 'cbd');
  for (let i = 0; i < 4; i++) {
    const tier = game.rng.weighted([Math.max(1, L - 1), L, Math.min(4, L + 1)], (x) => (x === L ? 3 : 1.5));
    const capital = nice(TENDER_CAPITAL[tier - 1] * game.rng.float(0.7, 1.4), 1000);
    const margin = game.rng.float(0.2, 0.38);
    out.push({
      id: `t${game.day}_${i}_${game.rng.int(100, 999)}`,
      agency: game.rng.pick(TENDER_AGENCIES),
      title: game.rng.pick(TENDER_TITLES[tier - 1]),
      tier, capital,
      collateral: nice(capital * 0.2, 1000),
      payout: nice(capital * (1 + margin), 1000),
      fee: nice(capital * 0.02, 500),
      cloutReq: [0, 12, 30, 50][tier - 1],
      competition: +game.rng.float(0, 0.2).toFixed(2),
      deliveries: tier + 1,
      deadlineDays: 10 + tier * 4,
      invoiceDelay: game.rng.int(5, 25),
      site: game.rng.pick(siteChoices).id,
      expiresDay: game.day + game.rng.int(3, 6),
    });
  }
  s.work.tenders = out;
  s.work.tenderRefreshDay = game.day;
  return out;
}

export function refreshTendersIfStale(game) {
  const w = game.s.work;
  w.tenders = w.tenders.filter((t) => t.expiresDay >= game.day);
  if (w.tenders.length < 2 || game.day - w.tenderRefreshDay >= 3) genTenders(game);
}

// ---------------------------------------------------------------- the day's bulletin
export function startDay(game, { initial = false } = {}) {
  const s = game.s;
  const t = s.t;
  const m = Clock.monthOf(t);
  const today = s.market.today;
  const rng = game.rng;

  // weather
  let weather = 'sunny';
  if (Clock.isRainySeason(m)) {
    const wet = Clock.isHeavyRains(m) ? 0.55 : 0.35;
    if (rng.chance(wet)) weather = rng.chance(0.28) ? 'storm' : 'rain';
    else weather = rng.chance(0.5) ? 'cloudy' : 'sunny';
  } else if (m >= 10 || m <= 1) weather = rng.chance(0.6) ? 'harmattan' : 'sunny';
  else if (m === 2) weather = 'hot';

  // floods on low-lying crossings
  s.market.floods = Object.fromEntries(Object.entries(s.market.floods).filter(([, until]) => until > t));
  const flooded = [];
  if (weather === 'rain' || weather === 'storm') {
    for (const id of FLOOD_EDGES) {
      if (rng.chance(weather === 'storm' ? 0.5 : 0.22)) {
        s.market.floods[id] = Clock.startOfDay(game.day) + rng.int(18, 32) * 60;
        flooded.push(id);
      }
    }
  }

  // enforcement & convoys
  const crackdownEdge = rng.chance(0.28) ? rng.pick(CHECKPOINT_EDGES) : null;
  const convoyDay = Clock.isWeekday(t) && rng.chance(0.22);

  // headline: most urgent first
  let headline;
  if (crackdownEdge) headline = rng.pick(HEADLINES.crackdown).replace('{road}', EDGE_BY_ID[crackdownEdge].name);
  else if (flooded.length) headline = rng.pick(HEADLINES.flood).replace('{road}', EDGE_BY_ID[flooded[0]].name);
  else if (convoyDay) headline = rng.pick(HEADLINES.convoy);
  else if (game.day < s.market.fuelSpikeUntilDay) headline = rng.pick(HEADLINES.fuel);
  else if (weather === 'rain' || weather === 'storm') headline = rng.pick(HEADLINES.rain);
  else if (weather === 'harmattan') headline = rng.pick(HEADLINES.harmattan);
  else if (weather === 'hot') headline = rng.pick(HEADLINES.hot);
  else headline = rng.pick(HEADLINES.generic);

  Object.assign(today, { day: game.day, weather, headline, crackdownEdge, convoyDay });
  refreshTendersIfStale(game);
  if (!initial) game.log(headline, 'info', '📰');
  else game.log(headline, 'info', '📰');
  game.emit('bulletin', today);
}

// ---------------------------------------------------------------- daily
export async function dailyTick(game) {
  const s = game.s;
  const t = s.t;
  const day = game.day;
  const dom = Clock.domOf(t);
  const rng = game.rng;
  const track = s.career.track;

  // per-day flags
  s.flags.tipOff = false;
  const laidLow = s.flags.layLow;
  s.flags.layLow = false;

  // cost of living (food, data, transport odds and ends)
  const living = game.home.living;
  const paid = game.drain(living);
  if (paid < living) {
    game.stat('sanity', -8);
    game.stat('energy', -8);
    game.log('Money too short for food and data. You skip meals.', 'bad', '🍚');
  }

  // market drift
  const mk = s.market;
  mk.fx = clamp(Math.round(mk.fx + (1550 - mk.fx) * 0.03 + rng.float(-35, 35) + (rng.chance(0.02) ? rng.float(-120, 160) : 0)), 1100, 2400);
  if ((day - 1) % 7 === 0) {
    mk.fuel = clamp(Math.round(mk.fuel * rng.float(0.96, 1.05) + (900 - mk.fuel) * 0.08), 700, 1600);
  }

  // network upkeep
  for (const c of s.contacts) {
    if (t - c.lastT > 7 * 1440) c.affinity = clamp(c.affinity - 0.25);
  }

  // trader levies
  if (track === 'trader') {
    const levy = TRADER.levy[s.career.level - 1];
    const took = game.drain(levy);
    if (took < levy) {
      s.work.levyArrears += levy - took;
      game.log(`Union levy short by ${levy - took}. Arrears dey grow.`, 'warn', '🧾');
    }
  }

  // payroll / daily allowance
  if (track === 'civil') {
    // Point 26 Fix: Daily civil service duty & transit voucher on weekdays so players stay solvent
    if (Clock.isWeekday(t)) {
      const dailyVoucher = Math.round((TRACKS.civil.levels[s.career.level - 1].salary || 120000) * 0.022);
      game.earn(dailyVoucher, { cash: true });
      game.log(`Civil Service duty & transport allowance credited: ₦${dailyVoucher.toLocaleString()}.`, 'good', '💼');
    }
    if (dom === 25) {
      const base = TRACKS.civil.levels[s.career.level - 1].salary;
      const frac = Math.min(1, (s.career.attendance || 16) / 16);
      const salary = Math.round(base * frac);
      const allowance = frac >= 0.6 ? Math.round(base * 0.15) : 0;
      game.earn(salary + allowance);
      game.log(`Salary credited: ₦${(salary + allowance).toLocaleString()} (${Math.round(frac * 100)}% attendance${allowance ? ', incl. housing allowance' : ''}).`,
        frac < 1 ? 'warn' : 'good', '💳');
      s.career.attendance = 0;
    }
  }
  if (track === 'tech' && dom === 1) {
    const bill = 35_000;
    game.drain(bill);
    game.log('Monthly data & ISP plan debited: ₦35,000.', 'info', '📶');
  }

  // contract deadlines and invoices
  const w = s.work;
  for (const c of [...w.contracts]) {
    if (c.status === 'delivering' && day > c.dueDay) {
      w.frozen -= c.collateral;
      s.clout = clamp(s.clout - 5);
      w.contracts = w.contracts.filter((x) => x.id !== c.id);
      game.log(`Missed delivery on "${c.title}". Agency forfeits your collateral.`, 'bad', '📉');
    }
  }
  for (const r of [...w.receivables]) {
    if (r.dueDay > day) continue;
    const p = clamp(0.5 + s.clout * 0.004 + (r.chase || 0), 0.2, 0.92);
    if (rng.chance(p)) {
      game.earn(r.amount + r.collateral);
      w.frozen -= r.collateral;
      w.completed++;
      w.totalProfit += r.amount - r.capital;
      s.clout = clamp(s.clout + 2 + s.career.level);
      w.receivables = w.receivables.filter((x) => x.id !== r.id);
      w.contracts = w.contracts.filter((x) => x.id !== r.contractId);
      game.log(`Payment cleared: "${r.title}" - ₦${r.amount.toLocaleString()} plus collateral back.`, 'good', '✅');
    } else {
      r.dueDay += rng.int(6, 18);
      r.chase = 0;
      game.stat('sanity', -3);
      game.log(`"${r.title}" payment slipped again - file on the director\u2019s table.`, 'warn', '🗄️');
    }
  }

  // reputation and heat drift
  s.clout = clamp(s.clout + 0.03 * game.home.prestige - (s.clout > 20 ? 0.07 : 0));
  s.heat = clamp(s.heat - 1.5 - (laidLow ? 3 : 0));
  s.inv.hangover = false;

  // housing: rent notices, shocks, evictions
  await rentWatch(game);

  // new day: weather, floods, headline, then procedural events
  startDay(game);
  await rollEvents(game, 'dawn');
}
