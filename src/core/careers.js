// Career progression: requirement checking, promotion and switching tracks.

import { clamp, ngn } from './util.js';
import { TRACKS, PROMO, SWITCH_COST, SWITCH_CLOUT, CIVIL_POSTINGS } from '../data/careers.js';
import { dayNumber } from './clock.js';

/** Requirement rows for the next level, each { label, ok, have, need }. null at max level. */
export function promotionReqs(game) {
  const s = game.s;
  const c = s.career;
  if (c.level >= 4) return null;
  const P = PROMO[c.track][c.level - 1];
  const rows = [];
  const add = (label, have, need) => rows.push({ label, have, need, ok: have >= need });
  add(`Protocol ${P.clout}+`, Math.floor(s.clout), P.clout);
  if (c.track === 'civil') {
    add(`${P.contacts} contacts`, s.contacts.length, P.contacts);
    add(`${P.daysWorked} days attended`, c.daysWorked, P.daysWorked);
    add('Promotion file 100%', Math.floor(c.promoFile), 100);
  } else if (c.track === 'contractor') {
    add(`${P.completed} contracts completed`, s.work.completed, P.completed);
  } else if (c.track === 'tech') {
    add(`${P.completed} projects shipped`, s.work.completed, P.completed);
  } else if (c.track === 'trader') {
    if (P.profit) add(`${ngn(P.profit)} lifetime profit`, Math.floor(s.work.totalProfit), P.profit);
    if (P.vehicle) add('Own a vehicle', s.vehicle.kind ? 1 : 0, 1);
    if (P.fleet) add(`${P.fleet} fleet units`, s.work.fleet, P.fleet);
  }
  if (P.fee) rows.push({ label: `Fees: ${ngn(P.fee)}`, have: Math.floor(game.funds()), need: P.fee, ok: game.canAfford(P.fee) });
  return { rows, fee: P.fee, ok: rows.every((r) => r.ok), next: TRACKS[c.track].levels[c.level].title };
}

export function promote(game) {
  const s = game.s;
  const c = s.career;
  const r = promotionReqs(game);
  if (!r) return { ok: false, reason: 'You are at the top.' };
  if (!r.ok) return { ok: false, reason: 'Requirements not met yet.' };
  if (r.fee) game.pay(r.fee);
  c.level++;
  c.promoFile = 0;
  if (c.track === 'trader' && c.level === 2) c.kiosk = s.loc.district;
  game.stat('clout', 3);
  game.stat('sanity', 8);
  const title = TRACKS[c.track].levels[c.level - 1].title;
  game.log(`PROMOTED: you are now ${title}.${c.track === 'trader' && c.level === 2 ? ` Your kiosk stands in ${game.district.name}.` : ''}`, 'good', '🎉');
  return { ok: true, title };
}

export function switchReason(game, track) {
  const s = game.s;
  const w = s.work;
  if (track === s.career.track) return 'Already your track.';
  if (w.contracts.length || w.receivables.length) return 'Close out your contracts and invoices first.';
  if (w.gigs.length) return 'Finish your active projects first.';
  if (s.clout < SWITCH_CLOUT[track]) return `Needs Protocol ${SWITCH_CLOUT[track]}+.`;
  if (!game.canAfford(SWITCH_COST[track])) return `Needs ${ngn(SWITCH_COST[track])}.`;
  return null;
}

export function switchTrack(game, track) {
  const s = game.s;
  const why = switchReason(game, track);
  if (why) return { ok: false, reason: why };
  game.pay(SWITCH_COST[track]);
  const day = dayNumber(s.t);
  s.career = {
    track, level: 1, daysWorked: 0, attendance: 0, lastWorkDay: 0, promoFile: 0,
    posting: track === 'civil' ? { ...game.rng.pick(CIVIL_POSTINGS) } : null,
    kiosk: null, since: day,
  };
  s.work.completed = 0;
  s.work.totalProfit = 0;
  s.work.stock = track === 'trader' ? 60 : 0;
  s.work.levyArrears = 0;
  s.work.bidBoost = 0;
  game.stat('sanity', 3);
  game.log(`New hustle: you are now in ${TRACKS[track].name}. Contacts and clout come with you.`, 'info', TRACKS[track].icon);
  return { ok: true };
}

export const clampPct = (v) => clamp(v, 0, 100);
