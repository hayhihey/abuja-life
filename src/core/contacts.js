// Contact ledger: the "network_connections" vector. Contacts are people with a
// type, a tier (how senior) and an affinity (how warm). Favours burn affinity;
// check-ins rebuild it.

import { CONTACT_TYPES, FIRST_NAMES, LAST_NAMES, TITLES, GIG_USD, GIG_TITLES, GIG_CLIENTS } from '../data/careers.js';
import { clamp, nice } from './util.js';

let _n = 0;

export function makeContact(rng, type, tier = 1) {
  const titles = TITLES[Math.min(3, Math.max(1, tier))];
  const cfg = CONTACT_TYPES[type];
  return {
    id: `c${Date.now().toString(36)}${(_n++).toString(36)}${rng.int(0, 999)}`,
    name: `${rng.pick(titles)} ${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    type,
    tier,
    org: rng.pick(cfg.orgs),
    affinity: rng.int(45, 70),
    lastT: 0,
  };
}

/** Favour catalogue. `min` is the minimum affinity; `cost` is how much affinity it burns. */
export const FAVOURS = {
  civil_servant: [
    { id: 'gate_pass', label: 'Put my name at the gate', desc: 'A 24-hour gate pass for restricted buildings.', cost: 15, min: 25 },
    { id: 'push_file', label: 'Push my file upstairs', desc: 'Civil servants: promotion file +. Others: clout +.', cost: 20, min: 35, tier: 1 },
    { id: 'tender_whisper', label: 'Whisper about a tender', desc: 'Better odds on your next bid.', cost: 15, min: 30 },
  ],
  contractor: [
    { id: 'subcontract', label: 'Offer me a sub-contract', desc: 'A short job paid in cash.', cost: 18, min: 30 },
    { id: 'bid_partner', label: 'Partner on a bid', desc: 'Better odds on your next bid.', cost: 15, min: 35 },
  ],
  promoter: [
    { id: 'vip_table', label: 'Free VIP table tonight', desc: 'Skip the bar bill and double the networking pull at the lounge.', cost: 20, min: 35 },
  ],
  tech_founder: [
    { id: 'referral', label: 'Refer me to a client', desc: 'Instantly lands a better-paying gig.', cost: 20, min: 35 },
    { id: 'intro', label: 'Intro me to somebody', desc: 'Adds a new contact to your ledger.', cost: 12, min: 30 },
  ],
  dispatcher: [
    { id: 'free_ride', label: 'Free ride on a dispatch bike', desc: 'Your next trip costs nothing.', cost: 10, min: 25 },
    { id: 'tip_off', label: 'Tip-off on today\u2019s checkpoints', desc: 'Checkpoint odds drop sharply today.', cost: 10, min: 25 },
  ],
};

export function favoursFor(contact) {
  return (FAVOURS[contact.type] || []).filter((f) => !f.tier || contact.tier >= f.tier);
}

export function checkInCost(contact) {
  return nice(3000 + contact.tier * 4500, 500);
}

export const bump = (c, d) => { c.affinity = clamp(c.affinity + d); };

/** Contact-type mix for a given spot/occasion. */
export function randomContactType(rng, weights) {
  const entries = Object.entries(weights);
  return rng.weighted(entries, ([, w]) => w)?.[0] || 'dispatcher';
}

/** Spend a contact's goodwill. Returns { ok, msg|reason }. Call inside game.exclusive(). */
export async function callFavour(game, contactId, favourId) {
  const s = game.s;
  const c = s.contacts.find((x) => x.id === contactId);
  if (!c) return { ok: false, reason: 'Contact not found.' };
  const f = favoursFor(c).find((x) => x.id === favourId);
  if (!f) return { ok: false, reason: 'They cannot help with that.' };
  if (c.affinity < f.min) return { ok: false, reason: `${c.name} is not warm enough yet (needs ${f.min}+ affinity).` };
  const w = s.work;
  let msg;
  switch (f.id) {
    case 'gate_pass':
      s.inv.gatePassUntil = s.t + 1440; msg = `${c.name} puts your name at the gate: pass valid for 24 hours.`; break;
    case 'push_file':
      if (s.career.track === 'civil') { s.career.promoFile = clamp(s.career.promoFile + 6 + c.tier * 2, 0, 100); msg = `${c.name} slides your file to the top of the pile.`; } else { game.stat('clout', 1); msg = `${c.name} mentions your name in the right room.`; }
      break;
    case 'tender_whisper': case 'bid_partner':
      w.bidBoost = Math.max(w.bidBoost, 0.15); msg = `${c.name} shares what the agency really wants: bid odds up on your next tender.`; break;
    case 'subcontract': {
      if (s.energy < 12) return { ok: false, reason: 'You are too tired for site work.' };
      const pay = nice(game.rng.int(40000, 70000) * c.tier * (1 + (s.career.level - 1) * 0.5), 500);
      game.stat('energy', -12); await game.advance(180); game.earn(pay, { cash: true });
      msg = `Sub-contract done for ${c.org}: ₦${pay.toLocaleString()} in cash.`; break;
    }
    case 'vip_table':
      s.flags.vipTable = true; msg = `${c.name} reserves a VIP table on Wuse 2 tonight. It is on the house.`; break;
    case 'referral': {
      if (s.career.track !== 'tech') return { ok: false, reason: 'You are not freelancing right now.' };
      if (w.gigs.length >= 2) return { ok: false, reason: 'Finish your active projects first.' };
      const [lo, hi] = GIG_USD[s.career.level - 1];
      const gig = { id: `g${s.t}`, title: game.rng.pick(GIG_TITLES), client: game.rng.pick(GIG_CLIENTS), usd: nice(game.rng.int(lo, hi) * 1.25, 5), progress: 0, paid: 0 };
      w.gigs.push(gig); msg = `${c.name} refers you: "${gig.title}" for ${gig.client}, $${gig.usd}.`; break;
    }
    case 'intro': {
      const t = randomContactType(game.rng, { contractor: 2, civil_servant: 2, promoter: 1, tech_founder: 1, dispatcher: 1 });
      const n = makeContact(game.rng, t, Math.min(3, c.tier + (game.rng.chance(0.3) ? 1 : 0)));
      s.contacts.push(n); msg = `${c.name} introduces you to ${n.name} (${n.org}).`; break;
    }
    case 'free_ride':
      s.flags.freeRide = true; msg = `${c.name} sends a dispatch bike. Your next trip is free.`; break;
    case 'tip_off':
      s.flags.tipOff = true; msg = `${c.name} tips you on today's checkpoints. Roads should be gentler.`; break;
    default: return { ok: false, reason: 'Unknown favour.' };
  }
  c.affinity = clamp(c.affinity - f.cost);
  c.lastT = s.t;
  await game.advance(15);
  game.log(msg, 'good', '🤝');
  return { ok: true, msg };
}

/** Keep a contact warm with airtime, small chops and a dinner. */
export async function checkIn(game, contactId) {
  const c = game.s.contacts.find((x) => x.id === contactId);
  if (!c) return { ok: false, reason: 'Contact not found.' };
  const cost = checkInCost(c);
  if (!game.pay(cost)) return { ok: false, reason: `Need ₦${cost.toLocaleString()}.` };
  c.affinity = clamp(c.affinity + 12);
  c.lastT = game.s.t;
  game.stat('sanity', 1);
  await game.advance(30);
  game.log(`You check in on ${c.name}: airtime, small chops, long gist. Affinity up.`, 'info', '📞');
  return { ok: true };
}
