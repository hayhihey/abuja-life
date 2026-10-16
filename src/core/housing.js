// Housing: annual-upfront rent, the landlord's "2-Year Rent Shock", eviction to the
// satellite belt, and relocation (agency + legal fees included - this is Abuja).

import { clamp, ngn, nice } from './util.js';
import { DISTRICT_BY_ID, DISTRICTS } from '../data/world.js';
import { START_T } from './clock.js';

export const YEAR = 360; // game days in a rent year (12 x 30)
export const AGENT_FEE = 0.2; // agency + legal on a fresh tenancy

export const daysLeft = (game) => game.s.home.paidUntilDay - game.day;

export function renewalQuote(game, years = 1) {
  const h = game.s.home;
  const rent = h.shock ? h.shock.newRent : h.rent;
  return { rent, total: Math.round(rent * years * (years === 2 ? 0.96 : 1)) };
}

export function moveQuote(game, districtId, years = 1) {
  const D = DISTRICT_BY_ID[districtId];
  const rent = D.rent;
  const base = Math.round(rent * years * (years === 2 ? 0.96 : 1));
  const fee = Math.round(rent * AGENT_FEE);
  return { rent, fee, total: base + fee };
}

/** Pay rent ahead. Works any time; extends from the later of today and current expiry. */
export function renew(game, years = 1) {
  const s = game.s;
  const q = renewalQuote(game, years);
  if (!game.pay(q.total)) return { ok: false, reason: `You need ${ngn(q.total)} for ${years} year(s).` };
  const h = s.home;
  h.rent = q.rent;
  h.paidUntilDay = Math.max(h.paidUntilDay, game.day) + YEAR * years;
  if (h.shock) s.stats.shocksSurvived++;
  h.shock = null;
  game.stat('sanity', 4);
  game.log(`Rent paid: ${ngn(q.total)} for ${years} year(s). Landlord finally smiles.`, 'good', '🔑');
  return { ok: true };
}

export async function moveTo(game, districtId, years = 1) {
  const s = game.s;
  const D = DISTRICT_BY_ID[districtId];
  if (!D?.housing) return { ok: false, reason: 'Nobody rents homes there.' };
  if (districtId === s.home.district) return { ok: false, reason: 'You already live there.' };
  const q = moveQuote(game, districtId, years);
  if (!game.pay(q.total)) return { ok: false, reason: `You need ${ngn(q.total)} (rent + 20% agent & legal fees).` };
  await game.advance(180);
  s.home = { district: districtId, rent: D.rent, paidUntilDay: game.day + YEAR * years, shock: null, evictions: s.home.evictions };
  game.arrive(districtId);
  game.stat('sanity', 5);
  game.log(`You move into ${D.name}. ${ngn(q.total)} gone, but the address is yours.`, 'good', '🏠');
  return { ok: true };
}

/** Extended deadline, shock creation and eviction all run from the midnight ticker. */
export async function rentWatch(game) {
  const s = game.s;
  const h = s.home;
  const day = game.day;
  const left = h.paidUntilDay - day;

  if (h.shock) {
    if (day >= h.shock.deadlineDay) { await settleOrEvict(game); return; }
    game.stat('sanity', -2);
    game.log(`Landlord notice: ${ngn(h.shock.newRent * h.shock.years)} due in ${h.shock.deadlineDay - day} day(s).`, 'warn', '📜');
    return;
  }
  if (left <= 21) {
    const rng = game.rng;
    h.shock = {
      years: rng.chance(0.45) ? 2 : 1,
      newRent: nice(h.rent * rng.float(1.08, 1.3), 5000),
      deadlineDay: Math.max(day + 3, h.paidUntilDay),
      extended: false,
    };
    await rentShockDecision(game);
  } else if (left <= 30) {
    game.stat('sanity', -1);
    game.log(`Rent runs out in ${left} days. Start saving.`, 'warn', '📜');
  }
}

async function rentShockDecision(game) {
  const s = game.s;
  const h = s.home;
  const sh = h.shock;
  const D = DISTRICT_BY_ID[h.district];
  let first = true;
  let rounds = 0;

  while (h.shock && rounds++ < 6) {
    const total = sh.newRent * sh.years;
    const id = await game.ask({
      title: first ? 'The Rent Shock' : 'Landlord still waiting',
      icon: '🏚️',
      body: `Your ${D.name} landlord has "reviewed" the rent to ${ngn(sh.newRent)} a year and wants ${sh.years} year(s) upfront: ${ngn(total)}. ` +
        `Deadline in ${sh.deadlineDay - game.day} day(s). Fail and you are out - to the satellite belt.`,
      options: [
        { id: 'pay', label: `Pay ${sh.years} year(s): ${ngn(total)}`, sub: 'Settle it and sleep easy', disabled: !game.canAfford(total), reason: 'Not enough funds yet' },
        { id: 'negotiate', label: 'Negotiate down to 1 year', sub: 'Clout and a friendly contact help. One try only', disabled: sh.years === 1 || sh.negotiated },
        { id: 'plead', label: 'Beg for 5 more days', sub: 'Once only', disabled: sh.extended },
        { id: 'move', label: 'Move somewhere cheaper', sub: 'Pick a new place' },
        { id: 'later', label: 'I will sort it before the deadline', sub: 'Risky. Notices will keep coming' },
      ],
    });
    first = false;

    if (id === 'pay') { renew(game, sh.years); return; }
    if (id === 'negotiate') {
      sh.negotiated = true;
      const civil = s.contacts.some((c) => c.type === 'civil_servant' && c.tier >= 2);
      const p = clamp(0.22 + s.clout * 0.005 + (civil ? 0.1 : 0) + (game.isSharp() ? 0.05 : 0), 0.1, 0.8);
      if (game.rng.chance(p)) { sh.years = 1; game.log('Landlord softens: one year upfront will do.', 'good', '🤝'); } else {
        game.stat('sanity', -4);
        game.log('Landlord refuses: "Na two years or nothing."', 'bad', '🙅🏾');
      }
      continue;
    }
    if (id === 'plead') {
      sh.extended = true;
      if (game.rng.chance(clamp(0.35 + s.clout * 0.004, 0.2, 0.8))) {
        sh.deadlineDay += 5;
        game.log('Landlord gives you five more days. Not one more.', 'info', '⏳');
      } else {
        game.stat('sanity', -3);
        game.log('Landlord is not moved. Deadline stands.', 'bad', '🙅🏾');
      }
      continue;
    }
    if (id === 'move') {
      const done = await chooseNewHome(game);
      if (done) return;
      continue;
    }
    return; // 'later'
  }
}

/** Second-step picker used by the shock flow. Returns true when the player relocated. */
async function chooseNewHome(game) {
  const s = game.s;
  const cur = DISTRICT_BY_ID[s.home.district];
  const options = DISTRICTS.filter((d) => d.housing && d.id !== cur.id && d.rent < s.home.shock.newRent)
    .sort((a, b) => b.rent - a.rent)
    .slice(0, 5)
    .map((d) => {
      const q = moveQuote(game, d.id, 1);
      return { id: d.id, label: `${d.name} - ${ngn(q.total)}`, sub: `1 yr rent ${ngn(q.rent)} + 20% agent/legal`, disabled: !game.canAfford(q.total), reason: 'Cannot afford' };
    });
  options.push({ id: 'back', label: 'Back', sub: 'Let me think again' });
  const pick = await game.ask({ title: 'Where to?', icon: '🧳', body: 'Cheaper address, longer commute. Choose carefully.', options });
  if (pick === 'back') return false;
  const r = await moveTo(game, pick, 1);
  return r.ok;
}

async function settleOrEvict(game) {
  const s = game.s;
  const sh = s.home.shock;
  if (game.canAfford(sh.newRent * sh.years)) { renew(game, sh.years); game.stat('sanity', -6); return; }
  if (game.canAfford(sh.newRent)) { renew(game, 1); game.stat('sanity', -8); return; }
  await evict(game);
}

export async function evict(game) {
  const s = game.s;
  const from = DISTRICT_BY_ID[s.home.district];
  const D = DISTRICT_BY_ID.nyanya;
  s.stats.shocksSurvived += 0;
  s.home = { district: D.id, rent: D.rent, paidUntilDay: game.day + 90, shock: null, evictions: s.home.evictions + 1 };
  s.clout = clamp(s.clout - Math.max(2, from.prestige * 2));
  s.sanity = clamp(s.sanity - 25);
  s.loc = { district: D.id, spot: null };
  game.log(`Evicted from ${from.name}. You pack into a Mararaba room with your cousin.`, 'bad', '📦');
  await game.notify('Evicted',
    `The landlord changed the locks in ${from.name}. You end up in Nyanya / Mararaba, covered by a cousin for the next 90 days. Clout and sanity take a hit. Start rebuilding.`, '📦');
}

export function startDayOfGame() { return START_T; }
