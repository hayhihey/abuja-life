// Declarative action registry. An action is data + small functions:
//   where(g)          - is it ever visible right now (place/track)?
//   check(g, params)  - null if usable, otherwise a human reason (shown disabled)
//   cost(g, params)   - { min, energy, sanity, ngn } paid up-front by Game.runAction
//   run(g, params)    - the effect; may call g.ask() for decisions
//   instances(g)      - optional: several param sets (e.g. one per active contract)
//
// The UI never knows individual actions; it renders listActions(game).

import { clamp, ngn, nice } from './util.js';
import * as Clock from './clock.js';
import { LANDMARK_INDEX, DISTRICT_BY_ID } from '../data/world.js';
import { GIG_CLIENTS, GIG_TITLES, GIG_USD, TRADER } from '../data/careers.js';
import { OFFICE_QUIPS, HUSTLE_QUIPS, LOUNGE_QUIPS } from '../data/voice.js';
import { makeContact, randomContactType } from './contacts.js';
import { fuelPrice, refreshTendersIfStale } from './economy.js';

// ------------------------------------------------------------ helpers
const spotKind = (g) => (g.s.loc.spot ? LANDMARK_INDEX[g.s.loc.spot]?.landmark : null)?.kind ?? null;
const atKind = (g, ...kinds) => kinds.includes(spotKind(g));
const isTrack = (g, t) => g.s.career.track === t;
const today = (g) => Clock.dayNumber(g.s.t);
const atHome = (g) => g.s.loc.district === g.s.home.district;
const docsOk = (g) => g.s.vehicle.kind && g.s.vehicle.docsUntilDay >= today(g);

function gainContact(g, type, tier, text) {
  const c = makeContact(g.rng, type, tier);
  g.s.contacts.push(c);
  g.log(`${text} ${c.name} (${c.org}) joins your ledger.`, 'good', '🤝');
  return c;
}

export function atPosting(g) {
  const p = g.s.career.posting;
  return isTrack(g, 'civil') && p && g.s.loc.district === p.district && g.s.loc.spot === p.spot;
}

/** Connectivity for remote work: co-working, cafe, or home (with light or a generator). */
export function connectivity(g) {
  const s = g.s;
  const k = spotKind(g);
  const d = s.loc.district;
  if (k === 'cowork') return { ok: true, fee: 4000, where: 'co-working space' };
  if (k === 'cafe') {
    if (g.isIspDown(d)) return { ok: false, reason: 'Cafe network is down. Try a co-working space.' };
    return { ok: true, fee: 2500, where: 'cafe' };
  }
  if (d === s.home.district && !s.loc.spot) {
    if (g.isIspDown(d)) return { ok: false, reason: 'Home network is down. Find a hub or cafe.' };
    if (g.isPowerOut(d) && !(s.inv.generator && s.inv.genFuel >= 1)) return { ok: false, reason: 'No light at home. Buy generator fuel or go to a hub.' };
    return { ok: true, fee: 0, where: 'home', gen: g.isPowerOut(d) };
  }
  return { ok: false, reason: 'Go home, or to a cafe or co-working space.' };
}

const best = (g, type) => g.s.contacts.filter((c) => c.type === type).sort((a, b) => b.affinity - a.affinity)[0];

// ------------------------------------------------------------ tenders
export function bidChance(g, t, style) {
  const s = g.s;
  let p = 0.25 + Math.min(0.3, s.clout * 0.004) + Math.min(0.12, s.contacts.length * 0.006) + s.work.bidBoost + (g.isSharp() ? 0.04 : 0) - t.competition;
  if (s.clout < t.cloutReq) p -= (t.cloutReq - s.clout) * 0.01;
  if (style === 'processing') p += 0.18;
  if (style === 'inside') p += 0.2;
  return clamp(p, 0.05, 0.88);
}

async function tenderFlow(g) {
  const s = g.s;
  const w = s.work;
  const L = s.career.level;
  const list = w.tenders.slice(0, 4);
  if (!list.length) { g.log('The board is empty. Check again tomorrow.', 'info', '📑'); return; }
  const options = list.map((t) => {
    const need = t.capital + t.collateral + t.fee;
    return {
      id: t.id, label: `${t.agency}: ${t.title}`,
      sub: `Tier ${t.tier} · capital ${ngn(t.capital)} + collateral ${ngn(t.collateral)} · pays ${ngn(t.payout)} · invoice ~${t.invoiceDelay}d · odds ~${Math.round(bidChance(g, t, 'straight') * 100)}%`,
      disabled: t.tier > L || !g.canAfford(need), reason: t.tier > L ? 'Needs a higher contractor level' : `Need ${ngn(need)}`,
    };
  });
  options.push({ id: 'leave', label: 'Leave the desk' });
  const id = await g.ask({ title: 'Tender board', icon: '📑', body: 'Fresh notices pinned this morning. Bid fee is non-refundable. Capital and collateral leave your account when you win.', options });
  if (id === 'leave') return;
  const t = list.find((x) => x.id === id);

  const proc = nice(t.payout * 0.06, 500);
  const insider = best(g, 'civil_servant');
  const need = t.capital + t.collateral + t.fee;
  const style = await g.ask({
    title: `Bid: ${t.title}`, icon: '✍️',
    body: `${t.agency} wants it done in ${t.deadlineDays} days. How do you play it?`,
    options: [
      { id: 'straight', label: `Straight bid (fee ${ngn(t.fee)})`, sub: `Odds ~${Math.round(bidChance(g, t, 'straight') * 100)}%` },
      { id: 'processing', label: `Add a "processing" fee (${ngn(proc)})`, sub: `Odds ~${Math.round(bidChance(g, t, 'processing') * 100)}% · adds heat`, disabled: !g.canAfford(need + proc), reason: 'Cannot afford' },
      { id: 'inside', label: 'Use an inside contact', sub: `Odds ~${Math.round(bidChance(g, t, 'inside') * 100)}% · burns affinity`, disabled: !insider || insider.affinity < 30, reason: 'Need a warm civil-servant contact' },
    ],
  });
  g.pay(t.fee + (style === 'processing' ? proc : 0));
  if (style === 'processing') { s.heat = clamp(s.heat + 6); s.clout = clamp(s.clout - 1); s.stats.bribes++; }
  if (style === 'inside') insider.affinity = clamp(insider.affinity - 15);
  const p = bidChance(g, t, style);
  w.bidBoost = 0;
  w.tenders = w.tenders.filter((x) => x.id !== t.id);
  if (!g.rng.chance(p)) {
    s.clout = clamp(s.clout + 0.2);
    g.log(`Bid lost: "${t.title}" goes to a better-connected vendor. Fee gone.`, 'warn', '📉');
    return;
  }
  g.pay(t.capital + t.collateral);
  w.frozen += t.collateral;
  w.contracts.push({
    id: `k${t.id}`, title: t.title, agency: t.agency, tier: t.tier, capital: t.capital, collateral: t.collateral, payout: t.payout,
    deliveriesLeft: t.deliveries, dueDay: today(g) + t.deadlineDays, site: t.site, invoiceDelay: t.invoiceDelay, status: 'delivering',
  });
  g.log(`Bid WON: "${t.title}" - ${t.deliveries} supply runs to ${DISTRICT_BY_ID[t.site].name} within ${t.deadlineDays} days.`, 'good', '🏆');
}

// ------------------------------------------------------------ lounge nights
const LOUNGE = [
  { id: 'lounge_bar', name: 'Stand at the bar', icon: '🍹', ngn: 15000, min: 120, energy: 10, tier: 0, clout: 0.2, sanity: 3, chance: 0.22 },
  { id: 'lounge_table', name: 'Take a table', icon: '🥂', ngn: 80000, min: 180, energy: 14, tier: 1, clout: 0.8, sanity: 5, chance: 0.5 },
  { id: 'lounge_vip', name: 'VIP bottle table', icon: '🍾', ngn: 250000, min: 240, energy: 16, tier: 2, clout: 2.5, sanity: 6, chance: 0.8 },
];

async function loungeNight(g, L) {
  const s = g.s;
  const vip = L.tier === 2 && s.flags.vipTable;
  if (vip) s.flags.vipTable = false;
  const sharp = g.isSharp() ? 0.1 : 0;
  const p = L.chance + s.clout / 250 + sharp + (vip ? 0.15 : 0);
  s.clout = clamp(s.clout + L.clout);
  s.sanity = clamp(s.sanity + L.sanity);
  g.log(g.rng.pick(LOUNGE_QUIPS), 'info', L.icon);
  if (g.rng.chance(p)) {
    const t = L.tier === 0 ? 1 : L.tier === 1 ? (g.rng.chance(0.4) ? 2 : 1) : g.rng.chance(0.2) ? 3 : g.rng.chance(0.55) ? 2 : 1;
    const type = randomContactType(g.rng, { contractor: 3, civil_servant: 2, promoter: 2, tech_founder: 1 });
    gainContact(g, type, t, 'Between rounds, you meet');
  } else g.log('Lots of handshakes, no real business.', 'info', '🎶');
  const h = Clock.hourOf(s.t);
  if (L.tier >= 1 && (h < 5 || h >= 23)) { s.inv.hangover = true; g.log('It will be a rough morning. Hangover loading.', 'warn', '🥴'); }
  if (s.vehicle.kind && g.rng.chance(0.08 * (L.tier + 1))) { s.heat = clamp(s.heat + 5); g.log('FRSC breathalyser on the drive back. They let you go with a stern lecture.', 'warn', '🚓'); }
}

// ------------------------------------------------------------ the registry
export const ACTIONS = [
  // ============================================================ Everyday
  {
    id: 'sleep', group: 'Everyday', name: 'Sleep until morning', icon: '🛏️', noEvents: true,
    desc: (g) => (g.isPowerOut(g.s.home.district) ? 'No light, but you must sleep.' : 'Recover energy and sanity. Back at ~06:00.'),
    where: (g) => atHome(g),
    check: (g) => (g.s.energy > 92 && g.s.sanity > 85 ? 'You are not sleepy.' : null),
    cost: () => ({ min: 0 }),
    async run(g) {
      let m = Clock.minutesUntilHour(g.s.t, 6);
      if (m < 120) m = 480;
      m = Math.min(m, 600);
      await g.advance(m, { sleeping: true });
      g.log(`You wake at ${Clock.clockStr(g.s.t)}. Another day in Abuja.`, 'info', '☀️');
    },
  },
  {
    id: 'rest', group: 'Everyday', name: 'Rest at home (90 min)', icon: '🛋️', noEvents: true,
    desc: () => 'A light rest to claw back energy.', where: (g) => atHome(g), cost: () => ({ min: 0 }),
    async run(g) { await g.advance(90, { sleeping: true, restRate: 0.55 }); g.log('You rest for an hour and a half.', 'info', '🛋️'); },
  },
  {
    id: 'lay_low', group: 'Everyday', name: 'Lay low (switch off phone)', icon: '🤫',
    desc: () => 'Stay off the radar. Legal heat drops faster.', where: (g) => atHome(g), cost: () => ({ min: 120 }),
    async run(g) { g.s.heat = clamp(g.s.heat - 6); g.s.flags.layLow = true; g.stat('sanity', 2); g.log('You lay low. The heat cools a little.', 'info', '🤫'); },
  },
  {
    id: 'eat', group: 'Everyday', name: 'Get something to eat', icon: '🍛',
    desc: (g) => (g.district.zone === 1 ? 'A proper lunch spot.' : 'Mama-put and a cold drink.'),
    where: () => true, cost: (g) => ({ min: 30, ngn: nice(g.district.living * 0.3, 100) }),
    async run(g) { g.stat('energy', 10); g.stat('sanity', 2); g.log('Hot food, cold drink, small peace.', 'info', '🍛'); },
  },
  {
    id: 'shawarma', group: 'Everyday', name: 'Shawarma and a cold drink', icon: '🌯',
    desc: () => 'Wuse 2 institution. Strangers talk in the queue.', where: (g) => atKind(g, 'shawarma'), cost: () => ({ min: 25, ngn: 4500 }),
    async run(g) {
      g.stat('energy', 12); g.stat('sanity', 4);
      g.log('Extra pepper, extra sauce. Life is good for twenty-five minutes.', 'good', '🌯');
      if (g.rng.chance(0.08)) gainContact(g, randomContactType(g.rng, { civil_servant: 2, promoter: 2, tech_founder: 1 }), 1, 'In the queue, you chat with');
    },
  },
  {
    id: 'atm_withdraw', group: 'Money', name: 'Withdraw ₦50k cash (POS queue)', icon: '🏧',
    desc: () => 'Cash is king at checkpoints and with the union boys.', where: () => true,
    check: (g) => (g.s.bank < 10000 ? 'Not enough in the bank.' : null), cost: () => ({ min: 25, ngn: 100 }),
    async run(g) { const n = Math.min(g.s.bank, 50000); g.s.bank -= n; g.s.cash += n; g.stat('sanity', -1); g.log(`Withdrew ${ngn(n)}. The network almost failed twice.`, 'info', '🏧'); },
  },
  {
    id: 'atm_deposit', group: 'Money', name: 'Deposit cash (keep ₦5k)', icon: '🏦',
    desc: () => 'Move cash into the bank so it cannot be "settled" away.', where: () => true,
    check: (g) => (g.s.cash < 20000 ? 'Carry at least ₦20k to bother.' : null), cost: () => ({ min: 25 }),
    async run(g) { const n = g.s.cash - 5000; g.s.cash -= n; g.s.bank += n; g.log(`Deposited ${ngn(n)}.`, 'info', '🏦'); },
  },
  {
    id: 'buy_generator', group: 'Money', name: 'Buy a generator (₦180k)', icon: '🔋',
    desc: () => 'Keeps the lights on at home. Needs fuel.', where: (g) => atKind(g, 'market') && !g.s.inv.generator,
    cost: () => ({ min: 60, ngn: 180000 }),
    async run(g) { g.s.inv.generator = true; g.s.inv.genFuel += 6; g.log('Generator bought, with six litres of fuel. NEPA, do your worst.', 'good', '🔋'); },
  },
  {
    id: 'buy_fuel', group: 'Money', name: 'Buy generator fuel (₦12k)', icon: '⛽',
    desc: () => '+4 litres for the generator.', where: (g) => atKind(g, 'market') && g.s.inv.generator, cost: () => ({ min: 30, ngn: 12000 }),
    async run(g) { g.s.inv.genFuel += 4; g.log('Jerrycan filled.', 'info', '⛽'); },
  },
  {
    id: 'buy_vehicle', group: 'Money', name: (g, p) => `Buy a ${p.kind === 'keke' ? 'keke (tricycle)' : 'used car'} (${ngn(TRADER.vehicleCost[p.kind])})`, icon: '🚗',
    desc: () => 'Your own ride: faster, but VIO and fuel come along.', where: (g) => atKind(g, 'carmart') && !g.s.vehicle.kind,
    instances: () => [{ kind: 'car' }, { kind: 'keke' }],
    cost: (g, p) => ({ min: 180, energy: 8, ngn: TRADER.vehicleCost[p.kind] }),
    async run(g, p) { g.s.vehicle = { kind: p.kind, docsUntilDay: today(g) + 180 }; g.log(`You drive off in your new ${p.kind === 'keke' ? 'keke' : 'car'}. Papers valid for six months.`, 'good', '🔑'); },
  },
  {
    id: 'renew_papers', group: 'Money', name: 'Renew vehicle papers (₦25k)', icon: '🪪',
    desc: () => 'Roadworthiness and licence: valid for a year.', where: (g) => atKind(g, 'vio'),
    check: (g) => (!g.s.vehicle.kind ? 'You do not own a vehicle.' : null), cost: () => ({ min: 90, ngn: 25000, sanity: 3 }),
    async run(g) { g.s.vehicle.docsUntilDay = today(g) + 360; g.s.heat = clamp(g.s.heat - 5); g.log('Papers renewed after three counters and one "dash".', 'good', '🪪'); },
  },
  {
    id: 'gate_pass', group: 'Network', name: 'Request a gate pass (₦15k)', icon: '🎫',
    desc: () => 'A 24-hour pass for restricted buildings.', where: (g) => atKind(g, 'protocol'),
    check: (g) => (g.s.clout < 10 ? 'Protocol office wants Protocol 10+.' : null), cost: () => ({ min: 45, ngn: 15000 }),
    async run(g) { g.s.inv.gatePassUntil = g.s.t + 1440; g.log('Pass issued: valid for the next 24 hours.', 'good', '🎫'); },
  },

  // ============================================================ Places & social
  {
    id: 'worship', group: 'Place', name: 'Pray and reflect', icon: '🙏🏾',
    desc: () => 'Quiet minutes in a calm space.', where: (g) => atKind(g, 'mosque', 'church'), cost: () => ({ min: 40 }),
    async run(g) { g.stat('sanity', 6); g.log('Peace of mind, if only for a moment.', 'good', '🙏🏾'); },
  },
  {
    id: 'service', group: 'Place', name: 'Attend the service', icon: '🕊️',
    desc: (g) => (spotKind(g) === 'mosque' ? 'Friday Jumat prayers (12:00-15:00).' : 'Sunday service (08:00-12:00).'),
    where: (g) => atKind(g, 'mosque', 'church'),
    check: (g) => {
      const k = spotKind(g); const t = g.s.t;
      if (k === 'mosque' && !(Clock.dowOf(t) === 4 && Clock.hourIn(t, 12, 15))) return 'Jumat prayers: Fridays, 12:00-15:00.';
      if (k === 'church' && !(Clock.dowOf(t) === 6 && Clock.hourIn(t, 8, 12))) return 'Service: Sundays, 08:00-12:00.';
      return null;
    },
    cost: () => ({ min: 90 }),
    async run(g) {
      g.stat('sanity', 8); g.stat('clout', 0.6);
      g.log('Good message, good company, full compound.', 'good', '🕊️');
      if (g.rng.chance(0.3)) gainContact(g, randomContactType(g.rng, { civil_servant: 2, contractor: 2, dispatcher: 1 }), 1, 'After the service, you get talking with');
    },
  },
  {
    id: 'park_chill', group: 'Place', name: 'Chill & enjoy the breeze', icon: '🌳',
    desc: () => 'Fresh air, scenic Abuja views, and a chilled bottle of zobo.', where: (g) => atKind(g, 'recreation', 'crushed_rock', 'amusement', 'zuma'), cost: () => ({ min: 90, ngn: 2000 }),
    async run(g) {
      g.stat('sanity', 10); g.stat('energy', 4);
      g.log('A breeze, a view, and no one asking for a file.', 'good', '🌳');
      if (g.s.loc.spot === 'jabi_lake' && Clock.hourIn(g.s.t, 16, 20) && g.rng.chance(0.1)) gainContact(g, 'tech_founder', 1, 'Jogging by the lake, you meet');
    },
  },
  {
    id: 'banex_flip', group: 'Work', name: 'Flip UK-used iPhones & MacBooks at Banex (₦40k)', icon: '📱',
    desc: () => 'Hustle at Banex Plaza, Abuja\u2019s undisputed gadget capital. High daily turnover.',
    where: (g) => atKind(g, 'banex'),
    cost: () => ({ min: 120, energy: 14, ngn: 40000 }),
    async run(g) {
      if (g.rng.chance(0.78)) {
        const payout = nice(g.rng.int(58000, 86000), 1000);
        g.earn(payout, { cash: true });
        g.stat('clout', 0.8);
        g.log(`Clean UK-used iPhone 15 Pro & MacBook deal closed at Banex Plaza! You pocket ${ngn(payout)}.`, 'good', '📱');
      } else {
        g.earn(40000, { cash: true });
        g.log('Tough bargaining at Banex today. You sold at cost price, but made a solid gadget plug.', 'info', '📱');
        if (g.rng.chance(0.4)) gainContact(g, 'tech_founder', 1, 'At a Banex repair counter, you link up with');
      }
    },
  },
  {
    id: 'area1_kilishi_pack', group: 'Place', name: 'Buy Area 1 Fiery Beef Kilishi Pack (₦9k)', icon: '🥩',
    desc: () => 'Abuja\u2019s legendary sun-dried beef coated in spicy yaji peanut paste. Boosts energy, sanity & contact affinity!',
    where: (g) => atKind(g, 'kilishi'),
    cost: () => ({ min: 40, ngn: 9000 }),
    async run(g) {
      g.stat('energy', 16); g.stat('sanity', 12); g.stat('clout', 0.5);
      for (const c of g.s.contacts) c.affinity = clamp((c.affinity || 50) + 4, 0, 100);
      g.log('Freshly roasted Area 1 Kilishi wrapped in brown paper! Shared parcels with your contacts (+4 Affinity all round).', 'good', '🥩');
    },
  },
  {
    id: 'arts_village_tour', group: 'Place', name: 'Patronise Abuja Arts & Crafts Village (₦22k)', icon: '🎭',
    desc: () => 'Thatched huts opposite Hilton: Nok terracotta, Hausa leather, Benin bronze & Ankara art.',
    where: (g) => atKind(g, 'crafts'),
    cost: () => ({ min: 90, energy: 6, ngn: 22000 }),
    async run(g) {
      g.stat('clout', 2.2); g.stat('sanity', 9);
      g.log('Picked up handcrafted bronze & leather pieces at the Arts & Crafts Village.', 'good', '🎭');
      if (g.rng.chance(0.38)) gainContact(g, randomContactType(g.rng, { civil_servant: 2, contractor: 2, promoter: 1 }), 2, 'Admiring a Nok sculpture, you strike up a chat with');
    },
  },
  {
    id: 'icc_summit', group: 'Network', name: 'Attend ECOWAS / AfCFTA MICE Summit at ICC (₦35k)', icon: '🎙️',
    desc: () => 'Abuja is West Africa\u2019s conference capital. Rub shoulders with delegates, directors, and investors.',
    where: (g) => atKind(g, 'conference'),
    cost: () => ({ min: 150, energy: 14, ngn: 35000 }),
    async run(g) {
      g.stat('clout', 3.2); g.stat('sanity', 4);
      g.log('Lanyard on neck, espresso in hand at the International Conference Centre plenary.', 'good', '🎙️');
      if (g.rng.chance(0.65)) gainContact(g, randomContactType(g.rng, { civil_servant: 3, contractor: 3, tech_founder: 2 }), g.rng.chance(0.35) ? 3 : 2, 'During the VIP communiqué break, you exchange cards with');
    },
  },
  {
    id: 'magicland_rides', group: 'Place', name: 'Ferris Wheel & Rollercoaster at Magicland (₦7.5k)', icon: '🎡',
    desc: () => 'Unwind at Wonderland/Magicland by Abuja City Gate. Best stress relief in the FCT.',
    where: (g) => atKind(g, 'amusement'),
    cost: () => ({ min: 120, energy: 8, ngn: 7500 }),
    async run(g) {
      g.stat('sanity', 22); g.stat('clout', 0.6);
      g.log('Top of the Magicland Ferris Wheel overlooking the Abuja City Gate skyline! Stress wiped clean.', 'good', '🎡');
    },
  },
  {
    id: 'crushed_rock_hike', group: 'Place', name: 'Hike & Shoot Content at Mpape Crushed Rock Lagoon (₦5k)', icon: '🏞️',
    desc: () => 'Abuja\u2019s viral abandoned stone quarry with emerald-blue rainwater cliffs.',
    where: (g) => atKind(g, 'crushed_rock'),
    cost: () => ({ min: 120, energy: 14, ngn: 5000 }),
    async run(g) {
      g.stat('sanity', 18); g.stat('clout', 1.6);
      g.log('Sunrise hike above Mpape Crushed Rock\u2019s turquoise lagoon! The drone shots go viral on Abuja Twitter.', 'good', '🏞️');
      if (g.rng.chance(0.4)) gainContact(g, randomContactType(g.rng, { promoter: 3, tech_founder: 2 }), 1, 'At the quarry cliff edge, you meet');
    },
  },
  {
    id: 'zuma_rock_tour', group: 'Place', name: 'Excursion to Zuma Rock Monolith (₦6k)', icon: '🗿',
    desc: () => 'Stand before the 725m igneous monolith ("Gateway to Abuja") featured on the ₦100 note.',
    where: (g) => atKind(g, 'zuma'),
    cost: () => ({ min: 110, energy: 10, ngn: 6000 }),
    async run(g) {
      g.stat('sanity', 16); g.stat('clout', 1.2);
      g.log('Gazing up at the natural face etched into Zuma Rock along the Kaduna-Abuja corridor. Majestic!', 'good', '🗿');
    },
  },
  {
    id: 'nysc_mammy_market', group: 'Work', name: 'Trade & Network at NYSC Kubwa Camp Mammy Market (₦12k)', icon: '🪖',
    desc: () => 'Supply white-on-white kits, waist pouches & cold drinks to fresh FCT Youth Corpers.',
    where: (g) => atKind(g, 'nysc'),
    cost: () => ({ min: 150, energy: 15, ngn: 12000 }),
    async run(g) {
      const rev = nice(g.rng.int(22000, 34000), 500);
      g.earn(rev, { cash: true });
      g.stat('sanity', 4);
      g.log(`Brisk business at NYSC Kubwa Orientation Camp Mammy Market! Cleared ${ngn(rev)} while the bugle blew.`, 'good', '🪖');
      if (g.rng.chance(0.35)) gainContact(g, randomContactType(g.rng, { dispatcher: 2, tech_founder: 2, civil_servant: 1 }), 1, 'By the parade ground, you connect with');
    },
  },
  {
    id: 'baze_exec_seminar', group: 'Network', name: 'Attend Baze University Executive Seminar (₦20k)', icon: '🎓',
    desc: () => 'Network with young senators, founders, and lecturers at Jabi\u2019s premier private campus.',
    where: (g) => atKind(g, 'university'),
    cost: () => ({ min: 120, energy: 10, ngn: 20000 }),
    async run(g) {
      g.stat('clout', 2.2);
      if (isTrack(g, 'civil')) g.s.career.promoFile = clamp(g.s.career.promoFile + 5, 0, 100);
      g.log('Executive roundtable at Baze University Jabi complete. Sharp insights and high-powered classmates.', 'good', '🎓');
      if (g.rng.chance(0.45)) gainContact(g, randomContactType(g.rng, { civil_servant: 2, contractor: 2, tech_founder: 2 }), 2, 'After the lecture in Jabi, you link up with');
    },
  },
  {
    id: 'shop_sharp', group: 'Place', name: 'Get sharp: agbada and fresh kicks (₦120k)', icon: '👔',
    desc: () => 'Look the part: better bids, lounges, and arguments for 5 days.', where: (g) => atKind(g, 'boutique'),
    check: (g) => (g.isSharp() ? 'You are already looking sharp.' : null), cost: () => ({ min: 120, ngn: 120000 }),
    async run(g) { g.s.inv.sharpUntil = g.s.t + 5 * 1440; g.stat('clout', 1); g.log('Fresh from the boutique. People look twice.', 'good', '👔'); },
  },
  {
    id: 'power_lunch', group: 'Network', name: 'Power lunch at the lobby (₦45k)', icon: '🍸',
    desc: () => 'See and be seen: clout and a decent chance at a senior contact.', where: (g) => atKind(g, 'lobby'),
    cost: () => ({ min: 90, ngn: 45000 }),
    async run(g) {
      g.stat('clout', 1.2); g.stat('sanity', 2);
      if (g.rng.chance(0.4)) gainContact(g, randomContactType(g.rng, { contractor: 3, civil_servant: 3, tech_founder: 1 }), 2, 'Over lunch, you meet');
      else g.log('A long lunch, a lot of name-dropping.', 'info', '🍸');
    },
  },
  {
    id: 'diplomatic_reception', group: 'Network', name: 'Attend a diplomatic reception (₦60k)', icon: '🥂',
    desc: () => 'Evening only. High clout, high-tier contacts.', where: (g) => atKind(g, 'diplomatic'),
    check: (g) => (!Clock.hourIn(g.s.t, 17, 23) ? 'Receptions run 17:00-23:00.' : null), cost: () => ({ min: 180, energy: 18, ngn: 60000 }),
    async run(g) {
      g.stat('clout', 3); g.stat('sanity', 3);
      if (g.rng.chance(0.7)) gainContact(g, randomContactType(g.rng, { civil_servant: 3, contractor: 2, tech_founder: 1 }), g.rng.chance(0.3) ? 3 : 2, 'Between canapés, you meet');
      else g.log('Polite conversations, no phone numbers.', 'info', '🥂');
    },
  },
  ...LOUNGE.map((L) => ({
    id: L.id, group: 'Network', name: L.name, icon: L.icon,
    desc: (g) => (L.tier === 2 && g.s.flags.vipTable ? 'Free tonight: a promoter friend covers the bill.' : `Wuse 2 nightlife. ${ngn(L.ngn)} for a shot at contacts.`),
    where: (g) => atKind(g, 'nightlife'),
    check: (g) => {
      if (!Clock.hourIn(g.s.t, 17, 4)) return 'Lounges open from 17:00 to 04:00.';
      if (L.tier === 2 && !g.s.flags.vipTable && g.s.clout < 15) return 'VIP tables need Protocol 15+ or a promoter\u2019s invite.';
      return null;
    },
    cost: (g) => ({ min: L.min, energy: L.energy, ngn: L.tier === 2 && g.s.flags.vipTable ? 0 : L.ngn }),
    run: (g) => loungeNight(g, L),
  })),
  {
    id: 'youth_joint', group: 'Network', name: 'Hang at the youth joint (₦6k)', icon: '🎶',
    desc: () => 'Cheap, loud, full of connectors.', where: (g) => atKind(g, 'youthjoint'),
    check: (g) => (!Clock.hourIn(g.s.t, 17, 3) ? 'Opens in the evening.' : null), cost: () => ({ min: 120, energy: 8, ngn: 6000 }),
    async run(g) {
      g.stat('sanity', 5);
      if (g.rng.chance(0.4)) gainContact(g, randomContactType(g.rng, { dispatcher: 3, promoter: 2, tech_founder: 1 }), 1, 'Music loud, you shout over it with');
      else g.log('Good vibes, small talk, sore ears.', 'info', '🎶');
    },
  },

  // ============================================================ Civil service
  {
    id: 'attend_office', group: 'Work', name: 'Attend office (full shift)', icon: '🗂️',
    desc: (g) => `${g.s.career.posting?.org ?? 'Office'}: sign in, queue, file. Builds attendance and the promo file.`,
    where: (g) => atPosting(g),
    check: (g) => {
      const t = g.s.t;
      if (!Clock.isWeekday(t)) return 'Weekend: the secretariat is shut.';
      if (!Clock.hourIn(t, 7, 11)) return 'Resumption window is 07:00-11:00.';
      if (g.s.career.lastWorkDay === today(g)) return 'You have already attended today.';
      return null;
    },
    cost: () => ({ min: 360, energy: 26, sanity: 3 }),
    async run(g) {
      const c = g.s.career;
      c.daysWorked++; c.attendance++; c.lastWorkDay = today(g);
      c.promoFile = clamp(c.promoFile + 0.7 * g.eff());
      g.stat('clout', 0.25);
      g.log(g.rng.pick(OFFICE_QUIPS), 'info', '🗂️');
      if (g.rng.chance(0.22)) gainContact(g, 'civil_servant', g.rng.chance(0.25) ? 2 : 1, 'In the corridor you get talking with');
    },
  },
  {
    id: 'chase_file', group: 'Work', name: 'Chase the file (₦2k "for the messenger")', icon: '📂',
    desc: () => 'Follow your promotion file from desk to desk.', where: (g) => atPosting(g),
    check: (g) => {
      if (!Clock.isWeekday(g.s.t) || !Clock.hourIn(g.s.t, 8, 16)) return 'Offices are open weekdays 08:00-16:00.';
      return g.s.career.promoFile >= 100 ? 'The file is already complete. Apply for promotion.' : null;
    },
    cost: () => ({ min: 90, energy: 10, sanity: 4, ngn: 2000 }),
    async run(g) {
      const c = g.s.career;
      if (g.rng.chance(0.15)) { c.promoFile = clamp(c.promoFile + 0.5); g.stat('sanity', -2); g.log('"Director is out of station." Come back tomorrow.', 'warn', '🗄️'); return; }
      const senior = g.s.contacts.some((x) => x.type === 'civil_servant' && x.tier >= 2) ? 2 : 0;
      const gain = g.rng.int(3, 7) * g.eff() + senior;
      c.promoFile = clamp(c.promoFile + gain, 0, 100);
      g.log(`File moves up two desks (+${gain.toFixed(1)}).`, 'good', '📂');
    },
  },
  {
    id: 'lobby_director', group: 'Work', name: (g) => `Lobby a director (${ngn(80000 * g.s.career.level)})`, icon: '🗝️',
    desc: () => 'Expensive, effective, and slightly risky.', where: (g) => isTrack(g, 'civil') && atKind(g, 'lobbyists'),
    cost: (g) => ({ min: 120, energy: 8, ngn: 80000 * g.s.career.level }),
    async run(g) {
      const c = g.s.career;
      c.promoFile = clamp(c.promoFile + g.rng.int(8, 14));
      g.stat('clout', 1); g.s.heat = clamp(g.s.heat + 2);
      g.log('A word in the right ear, a gift in the right hand. The file jumps.', 'good', '🗝️');
      if (g.rng.chance(0.06)) { g.s.heat = clamp(g.s.heat + 10); g.stat('clout', -3); g.log('Somebody talks. Your name appears in a petition.', 'bad', '📣'); }
    },
  },

  // ============================================================ Contractor
  {
    id: 'browse_tenders', group: 'Work', name: 'Browse the tender board', icon: '📑',
    desc: () => 'Fresh tenders posted every few days. Bid fee is non-refundable.', where: (g) => isTrack(g, 'contractor') && atKind(g, 'tenders'),
    cost: () => ({ min: 30 }),
    async run(g) { refreshTendersIfStale(g); await tenderFlow(g); },
  },
  {
    id: 'supply_run', group: 'Work', name: (g, p) => `Supply run: ${g.s.work.contracts.find((c) => c.id === p.id)?.title ?? 'contract'}`, icon: '🚚',
    desc: (g, p) => { const c = g.s.work.contracts.find((x) => x.id === p.id); return c ? `${c.deliveriesLeft} run(s) left · due day ${c.dueDay}` : ''; },
    where: (g) => isTrack(g, 'contractor') && g.s.work.contracts.some((c) => c.status === 'delivering' && c.site === g.s.loc.district),
    instances: (g) => g.s.work.contracts.filter((c) => c.status === 'delivering' && c.site === g.s.loc.district).map((c) => ({ id: c.id })),
    check: (g, p) => (g.s.work.contracts.find((c) => c.id === p.id && c.status === 'delivering') ? null : 'No such delivery.'),
    cost: (g, p) => { const c = g.s.work.contracts.find((x) => x.id === p.id); return { min: 180, energy: 22, ngn: c ? nice(c.capital * 0.005, 500) : 0 }; },
    async run(g, p) {
      const w = g.s.work;
      const c = w.contracts.find((x) => x.id === p.id);
      c.deliveriesLeft--;
      if (c.deliveriesLeft > 0) { g.log(`Delivery made. ${c.deliveriesLeft} run(s) to go on "${c.title}".`, 'info', '🚚'); return; }
      c.status = 'invoiced';
      w.receivables.push({ id: `r${c.id}`, contractId: c.id, title: c.title, agency: c.agency, amount: c.payout, collateral: c.collateral, capital: c.capital, dueDay: today(g) + c.invoiceDelay, chase: 0 });
      g.log(`All deliveries done. Invoice submitted to ${c.agency}: payment expected in ~${c.invoiceDelay} days.`, 'good', '🧾');
    },
  },
  {
    id: 'chase_payment', group: 'Work', name: (g, p) => `Chase payment: ${g.s.work.receivables.find((r) => r.id === p.id)?.title ?? 'invoice'}`, icon: '📬',
    desc: () => 'Walk the invoice through the agency. Speeds up payment and improves the odds.',
    where: (g) => isTrack(g, 'contractor') && ['cbd', 'garki'].includes(g.s.loc.district) && g.s.work.receivables.length > 0,
    instances: (g) => g.s.work.receivables.map((r) => ({ id: r.id })),
    check: (g, p) => { const r = g.s.work.receivables.find((x) => x.id === p.id); return !r ? 'No such invoice.' : r.dueDay <= today(g) + 1 ? 'Already due: payment pending.' : null; },
    cost: () => ({ min: 120, energy: 10, sanity: 4, ngn: 3000 }),
    async run(g, p) {
      const r = g.s.work.receivables.find((x) => x.id === p.id);
      const cut = g.rng.int(3, 6);
      r.dueDay = Math.max(today(g) + 1, r.dueDay - cut);
      r.chase = Math.min(0.3, (r.chase || 0) + 0.15);
      g.stat('clout', 0.2);
      g.log(`You walk the invoice through three offices. Due date moves ${cut} days closer.`, 'good', '📬');
      if (g.rng.chance(0.18)) gainContact(g, 'civil_servant', 1, 'A desk officer takes pity:');
    },
  },

  // ============================================================ Tech
  {
    id: 'find_gig', group: 'Work', name: 'Pitch for a new project', icon: '📨',
    desc: (g) => { const c = connectivity(g); return c.ok ? `Online from ${c.where}${c.fee ? ` (${ngn(c.fee)})` : ''}.` : c.reason; },
    where: (g) => isTrack(g, 'tech'),
    check: (g) => (g.s.work.gigs.length >= 2 ? 'Finish your active projects first.' : connectivity(g).ok ? null : connectivity(g).reason),
    cost: (g) => ({ min: 90, energy: 8, ngn: connectivity(g).fee || 0 }),
    async run(g) {
      const s = g.s; const L = s.career.level;
      if (g.rng.chance(clamp(0.55 + s.clout * 0.003, 0.3, 0.85))) {
        const [lo, hi] = GIG_USD[L - 1];
        const gig = { id: `g${s.t}`, title: g.rng.pick(GIG_TITLES), client: g.rng.pick(GIG_CLIENTS), usd: nice(g.rng.int(lo, hi), 5), progress: 0, paid: 0 };
        s.work.gigs.push(gig);
        g.log(`Pitch lands: "${gig.title}" for ${gig.client}, $${gig.usd} in 3 milestones.`, 'good', '📨');
      } else g.log('Pitches sent. Two read, one "we will get back to you".', 'info', '📨');
    },
  },
  {
    id: 'deep_work', group: 'Work', name: 'Deep-work sprint (3h)', icon: '⌨️',
    desc: (g) => { const c = connectivity(g); return c.ok ? `Working from ${c.where}${c.fee ? ` (${ngn(c.fee)})` : ''}.` : c.reason; },
    where: (g) => isTrack(g, 'tech'),
    check: (g) => (!g.s.work.gigs.length ? 'No active project. Pitch first.' : connectivity(g).ok ? null : connectivity(g).reason),
    cost: (g) => ({ min: 180, energy: 24, sanity: 3, ngn: connectivity(g).fee || 0 }),
    async run(g) {
      const s = g.s; const w = s.work;
      const conn = connectivity(g);
      if (conn.gen) s.inv.genFuel = Math.max(0, s.inv.genFuel - 1.5);
      const gig = [...w.gigs].sort((a, b) => b.progress - a.progress)[0];
      const before = gig.progress;
      gig.progress = clamp(gig.progress + g.rng.int(12, 20) * g.eff(), 0, 100);
      const marks = [34, 67, 100]; const split = [0.3, 0.3, 0.4];
      for (let i = gig.paid; i < 3; i++) {
        if (gig.progress >= marks[i]) {
          const usd = gig.usd * split[i];
          const pay = Math.round(usd * s.market.fx);
          g.earn(pay); gig.paid = i + 1;
          g.log(`Milestone ${i + 1}/3 cleared: $${Math.round(usd)} = ${ngn(pay)} at ₦${s.market.fx}/$.`, 'good', '💵');
        }
      }
      if (gig.progress >= 100) {
        w.gigs = w.gigs.filter((x) => x.id !== gig.id); w.completed++; g.stat('clout', 1 + s.career.level * 0.5);
        g.log(`"${gig.title}" shipped. ${gig.client} leaves a five-star review.`, 'good', '🚀');
      } else if (gig.progress === before) g.log('A sprint with little to show for it.', 'info', '⌨️');
    },
  },
  {
    id: 'pitch_founders', group: 'Network', name: 'Founders\u2019 meetup (₦3k)', icon: '🚀',
    desc: () => 'Meet builders at the hub.', where: (g) => atKind(g, 'cowork'), cost: () => ({ min: 120, energy: 8, ngn: 3000 }),
    async run(g) {
      g.stat('sanity', 2);
      if (g.rng.chance(0.55)) gainContact(g, 'tech_founder', g.rng.chance(0.25) ? 2 : 1, 'At the meetup you click with');
      else { g.stat('clout', 0.3); g.log('Good demos, nobody hiring.', 'info', '🚀'); }
    },
  },

  // ============================================================ Trader & transport
  {
    id: 'restock', group: 'Work', name: (g) => `Restock supplies (${ngn(Math.round((100 - g.s.work.stock) * (LANDMARK_INDEX[g.s.loc.spot]?.landmark.wholesale ? TRADER.wholesale : TRADER.retail)))})`, icon: '📦',
    desc: (g) => (LANDMARK_INDEX[g.s.loc.spot]?.landmark.wholesale ? 'Wholesale prices here.' : 'Retail prices: cheaper at Mpape or Mararaba.'),
    where: (g) => isTrack(g, 'trader') && g.s.career.level <= 2 && atKind(g, 'market'),
    check: (g) => (g.s.work.stock >= 80 ? 'Stock is still nearly full.' : null),
    cost: (g) => ({ min: 60, energy: 6, ngn: Math.round((100 - g.s.work.stock) * (LANDMARK_INDEX[g.s.loc.spot]?.landmark.wholesale ? TRADER.wholesale : TRADER.retail)) }),
    async run(g) { g.s.work.stock = 100; g.log('Bags loaded. Stock back to 100.', 'good', '📦'); },
  },
  {
    id: 'hustle_shift', group: 'Work', name: 'Hustle a shift (4h)', icon: '🛍️',
    desc: (g) => (g.s.career.level === 1 ? 'Mobile hawking: strong in Zone 1, but the task force knows.' : `Run your kiosk in ${DISTRICT_BY_ID[g.s.career.kiosk]?.short ?? '?'}.`),
    where: (g) => isTrack(g, 'trader') && g.s.career.level <= 2 && (g.s.career.level === 1 || g.s.loc.district === g.s.career.kiosk),
    check: (g) => {
      const need = TRADER.stockPerShift[g.s.career.level - 1];
      if (g.s.work.stock < need) return `Not enough stock (need ${need}). Restock at a market.`;
      return Clock.hourIn(g.s.t, 6, 20) ? null : 'The street is quiet. Try again by morning.';
    },
    cost: () => ({ min: 240, energy: 26, sanity: 3 }),
    async run(g) {
      const s = g.s; const L = s.career.level; const D = g.district;
      const need = TRADER.stockPerShift[L - 1];
      const w = s.market.today.weather;
      const weather = w === 'storm' ? 0.6 : w === 'rain' ? 0.8 : 1;
      const gross = Math.round(TRADER.profitBase[L - 1] * D.footfall * (Clock.isPeak(s.t) ? 1.25 : 1) * weather * g.eff() * g.rng.float(0.8, 1.25));
      s.work.stock -= need;
      s.cash += gross;
      s.work.totalProfit += gross - need * 170;
      if (D.zone === 1 && L === 1) s.heat = clamp(s.heat + 1);
      g.stat('clout', 0.1);
      g.log(`${g.rng.pick(HUSTLE_QUIPS)} You clear ${ngn(gross)}.`, 'good', '🛍️');
    },
  },
  {
    id: 'new_kiosk', group: 'Work', name: 'Move kiosk permit here (₦80k)', icon: '🏪',
    desc: () => 'Relocate your kiosk to this district.', where: (g) => isTrack(g, 'trader') && g.s.career.level === 2 && g.s.loc.district !== g.s.career.kiosk,
    cost: () => ({ min: 120, ngn: 80000 }),
    async run(g) { g.s.career.kiosk = g.s.loc.district; g.log(`Permit stamped: your kiosk now stands in ${g.district.name}.`, 'good', '🏪'); },
  },
  {
    id: 'drive_route', group: 'Work', name: 'Drive a taxi shift (4.5h)', icon: '🚕',
    desc: (g) => `Fuel runs about ${ngn(Math.round(15 * fuelPrice(g) * (g.s.vehicle.kind === 'keke' ? 0.7 : 1)))} a shift.`,
    where: (g) => isTrack(g, 'trader') && g.s.career.level >= 3,
    check: (g) => {
      if (!g.s.vehicle.kind) return 'You need a vehicle: buy one at Garki Car Mart.';
      if (!docsOk(g)) return 'Vehicle papers expired. Renew at the VIO office.';
      return Clock.hourIn(g.s.t, 5, 22) ? null : 'Too late: passengers are scarce.';
    },
    cost: (g) => ({ min: 270, energy: 28, sanity: 5, ngn: Math.round(15 * fuelPrice(g) * (g.s.vehicle.kind === 'keke' ? 0.7 : 1)) }),
    async run(g) {
      const s = g.s; const D = g.district;
      const w = s.market.today.weather;
      const gross = Math.round(TRADER.profitBase[2] * D.footfall * (Clock.isPeak(s.t) ? 1.2 : 1) * (w === 'rain' ? 1.15 : 1) * g.eff() * g.rng.float(0.85, 1.2));
      s.cash += gross;
      s.work.totalProfit += gross;
      g.log(`A full day on the road: ${ngn(gross)} in fares.`, 'good', '🚕');
      if (g.rng.chance(0.1 * (1 + s.heat / 100))) { const f = g.drain(nice(g.rng.int(5000, 12000), 500)); s.heat = clamp(s.heat + 2); g.log(`FRSC flags you down. ${ngn(f)} for a "missing particular".`, 'warn', '🚓'); }
    },
  },
  {
    id: 'collect_remittance', group: 'Work', name: 'Collect fleet remittance', icon: '💰',
    desc: (g) => `${g.s.work.fleet} unit(s) on the road.`, where: (g) => isTrack(g, 'trader') && g.s.career.level >= 4 && atKind(g, 'transport'),
    check: (g) => (!g.s.work.fleet ? 'You have no fleet units yet. Buy one at the car mart.' : today(g) - g.s.work.lastCollectDay < 1 ? 'Already collected today.' : null),
    cost: () => ({ min: 60, energy: 6 }),
    async run(g) {
      const w = g.s.work;
      const days = Math.min(7, today(g) - w.lastCollectDay);
      let amt = Math.round(w.fleet * TRADER.fleetDaily * days * 0.85 * g.rng.float(0.9, 1.1));
      g.earn(amt, { cash: true });
      w.totalProfit += amt;
      w.lastCollectDay = today(g);
      g.log(`Drivers remit ${ngn(amt)} for ${days} day(s), after the park\u2019s cut.`, 'good', '💰');
      if (g.rng.chance(0.12)) { const f = g.drain(40000); g.log(`A unit breaks down. Mechanic bill: ${ngn(f)}.`, 'warn', '🔧'); }
    },
  },
  {
    id: 'buy_fleet_unit', group: 'Money', name: `Buy a fleet unit (${ngn(TRADER.fleetUnitCost)})`, icon: '🛺',
    desc: () => 'Another keke on the road earns every day.', where: (g) => isTrack(g, 'trader') && g.s.career.level >= 4 && atKind(g, 'carmart'),
    check: (g) => (g.s.work.fleet >= 6 ? 'Your fleet is at capacity (6).' : null), cost: () => ({ min: 120, energy: 6, ngn: TRADER.fleetUnitCost }),
    async run(g) { g.s.work.fleet++; g.log(`Fleet grows to ${g.s.work.fleet} unit(s).`, 'good', '🛺'); },
  },

  // ============================================================ Nigerian Slangs, Lifestyles & Child/Age Progression
  {
    id: 'billing_aza', group: 'Money',
    name: (g) => (g.s.meta?.lifestyle === 'os_baddie' || g.s.meta?.lifestyle === 'nepo_baby' ? '💅 Send Heavy Soft-Life Billing ("Drop Aza")' : '📱 Drop Your Aza / Request "Urgent 2k" Billing'),
    icon: '💸',
    desc: () => ' Nigerian X/TikTok classic: drop your Aza or send a strategic "billing" text to your Abuja sponsors & network.',
    where: () => true,
    check: (g) => (g.s.flags.lastBillingDay === today(g) ? 'You already billed your contacts today. Maintain your composure till tomorrow!' : null),
    cost: () => ({ min: 30, energy: 4 }),
    async run(g) {
      g.s.flags.lastBillingDay = today(g);
      const ls = g.s.meta?.lifestyle || 'standard';
      const steeze = g.s.social?.steeze || 70;
      const mult = ls === 'os_baddie' ? 2.6 : ls === 'nepo_baby' ? 2.3 : ls === 'alhaji' ? 2.0 : 1.0;
      if (g.rng.chance(0.82)) {
        const base = nice(g.rng.int(12000, 45000) * mult * (0.7 + steeze / 140), 1000);
        g.earn(base, { bank: true });
        g.stat('sanity', 8);
        g.log(`"Send your Aza!" Credit alert just entered: +${ngn(base)} from your Abuja sponsor. Soft life!`, 'good', '💸');
      } else {
        g.log('"No Gree For Anybody!" Your contact read the billing message and replied with "Sapa dey my side too o."', 'info', '📱');
      }
    },
  },
  {
    id: 'tiktok_steeze_vlog', group: 'Network', name: '🕺🏾 Shoot TikTok "Steeze & Composure" Abuja Vlog (₦3k)', icon: '📱',
    desc: () => 'Film a viral fit-check & Abuja lifestyle reel for TikTok, Instagram & X ("100% Steeze, 0% Shalaye").',
    where: () => true,
    cost: () => ({ min: 60, energy: 8, ngn: 3000 }),
    async run(g) {
      if (!g.s.social) g.s.social = { steeze: 75, composure: 75 };
      g.s.social.steeze = clamp((g.s.social.steeze || 70) + 6, 0, 100);
      g.s.social.composure = clamp((g.s.social.composure || 70) + 4, 0, 100);
      const payout = nice(g.rng.int(15000, 58000) * (1 + g.s.clout / 60), 500);
      g.earn(payout, { bank: true });
      g.stat('clout', 1.6);
      g.stat('sanity', 6);
      g.log(`Your Abuja TikTok reel went viral ("Maximum Steeze & Composure! Clock it!"). Brand deal & creator payout: +${ngn(payout)}!`, 'good', '🕺🏾');
    },
  },
  {
    id: 'dorime_alarm', group: 'Nightlife', name: '🍾 Sound the Alarm! "DORIME" Club Shutdown (₦120k)', icon: '🚨',
    desc: () => 'Order Azul & Ace of Spades with club sirens, sparkler girls, and "Ameno Dorime" blasting in Wuse 2!',
    where: (g) => atKind(g, 'nightlife'),
    cost: () => ({ min: 150, energy: 16, ngn: 120000 }),
    async run(g) {
      if (!g.s.social) g.s.social = { steeze: 80, composure: 80 };
      g.s.social.steeze = clamp((g.s.social.steeze || 75) + 10, 0, 100);
      g.stat('clout', 5.5);
      g.stat('sanity', 18);
      g.log('🚨 DORIME INTERIMO ADAPARE! Sirens blaring across the Wuse 2 VIP section as sparklers light up your table!', 'good', '🍾');
      gainContact(g, randomContactType(g.rng, { contractor: 4, promoter: 3, civil_servant: 2 }), 3, 'Impressed by your Odogwu composure, a VIP sends over their card:');
    },
  },
  {
    id: 'child_pocket_money', group: 'Money', name: '🎒 Collect Daddy & Mummy’s Pocket Money Allowance', icon: '🧒🏾',
    desc: () => 'Available while you are a Child/Teen (<18 yrs). Collect your family school & weekend allowance!',
    where: (g) => (g.s.meta?.age || 26) < 18,
    check: (g) => (g.s.flags.lastAllowanceDay === today(g) ? 'You already collected pocket money today!' : null),
    cost: () => ({ min: 20 }),
    async run(g) {
      g.s.flags.lastAllowanceDay = today(g);
      const ls = g.s.meta?.lifestyle || 'standard';
      const amt = ls === 'alhaji' || ls === 'nepo_baby' ? 95000 : ls === 'sapa_trenches' ? 8000 : 30000;
      g.earn(amt, { cash: true });
      g.stat('sanity', 10);
      g.log(`Collected ${ngn(amt)} pocket money allowance! Time to flex at Jabi Mall or save for your future.`, 'good', '🎒');
    },
  },
  {
    id: 'age_up_birthday', group: 'Place',
    name: (g) => {
      const curAge = g.s.meta?.age || 22;
      return curAge < 18
        ? `🎂 Celebrate Birthday (Age ${curAge} → ${curAge + 1} yrs)`
        : `🎂 Celebrate Abuja Birthday Bash (Age ${curAge} → ${curAge + 1} yrs)`;
    },
    icon: '🎂',
    desc: () => 'Advance your character’s age by +1 Year, boost your Composure & Clout, and unlock new adult milestones!',
    where: () => true,
    cost: () => ({ min: 60, ngn: 5000 }),
    async run(g) {
      if (!g.s.meta.age) g.s.meta.age = 22;
      g.s.meta.age += 1;
      const newAge = g.s.meta.age;
      if (newAge < 18) g.s.meta.lifeStage = 'child';
      else if (newAge <= 25) g.s.meta.lifeStage = 'young_adult';
      else if (newAge <= 44) g.s.meta.lifeStage = 'adult';
      else g.s.meta.lifeStage = 'elder';

      g.stat('clout', 2);
      g.stat('sanity', 14);
      if (newAge === 18) {
        g.earn(75000, { bank: true });
        g.log(`🎓 Happy 18th Birthday! You are officially an Adult in Abuja! Received ${ngn(75000)} graduation gift!`, 'good', '🎂');
      } else {
        g.log(`🎂 Happy Birthday! You turned ${newAge} years old in Abuja (+2 Protocol Clout, +14 Sanity)!`, 'good', '🎂');
      }
    },
  },
];

export const ACTIONS_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

const call = (v, g, p) => (typeof v === 'function' ? v(g, p) : v);

/** Everything the player can see right now, with disabled reasons and costs. */
export function listActions(g) {
  const out = [];
  for (const a of ACTIONS) {
    if (!a.where(g)) continue;
    const insts = a.instances ? a.instances(g) : [undefined];
    for (const p of insts) {
      const cost = { min: 0, energy: 0, sanity: 0, ngn: 0, ...(a.cost ? a.cost(g, p) : {}) };
      let reason = a.check ? a.check(g, p) : null;
      if (!reason && cost.energy > g.s.energy) reason = 'Too tired.';
      if (!reason && cost.ngn > g.funds()) reason = `Need ${ngn(cost.ngn)}.`;
      out.push({ id: a.id, params: p, group: a.group, icon: a.icon, name: call(a.name, g, p), desc: a.desc ? a.desc(g, p) : '', cost, reason });
    }
  }
  return out;
}
