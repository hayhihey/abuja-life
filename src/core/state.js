// Player state: a plain JSON-serialisable object. No methods, no DOM, no clock logic.
// Everything the engine mutates lives here so saves are just JSON.stringify.

import { DISTRICT_BY_ID } from '../data/world.js';
import { CIVIL_POSTINGS, START_PRESETS, TRADER, TRACKS } from '../data/careers.js';
import { RNG } from './rng.js';
import { makeContact } from './contacts.js';
import { START_T, dayNumber } from './clock.js';
import { rankFor } from '../data/voice.js';
import { uid } from './util.js';

export const SAVE_VERSION = 1;

export function newState({ name = 'Abuja Newcomer', track = 'civil', seed = (Date.now() >>> 0), avatar = '🧑🏾' } = {}) {
  const P = START_PRESETS[track];
  const rng = new RNG(seed);
  const D = DISTRICT_BY_ID[P.district];
  const day = dayNumber(START_T);

  const s = {
    v: SAVE_VERSION,
    meta: { id: uid('p'), name, avatar, seed, created: Date.now() },
    t: START_T,

    // ---- the six vectors
    cash: P.cash, bank: P.bank, // funds_ngn = cash + bank
    clout: P.clout, // clout_protocol
    energy: P.energy, // energy_stamina
    sanity: P.sanity, // sanity_stress
    heat: P.heat, // legal_heat
    contacts: P.contacts.map((type) => makeContact(rng, type, 1)), // network_connections

    loc: { district: P.district, spot: null },
    home: {
      district: P.district, rent: D.rent, paidUntilDay: day + P.rentDays, shock: null, evictions: 0,
    },

    career: {
      track, level: 1, daysWorked: 0, attendance: 0, lastWorkDay: 0, promoFile: 0,
      posting: track === 'civil' ? { ...rng.pick(CIVIL_POSTINGS) } : null,
      kiosk: null, // trader L2 location
      since: day,
    },

    vehicle: { kind: null, docsUntilDay: 0 },
    inv: { gatePassUntil: 0, genFuel: 0, generator: false, sharpUntil: 0, hangover: false },

    work: {
      tenders: [], contracts: [], receivables: [], gigs: [], completed: 0, totalProfit: 0,
      stock: track === 'trader' ? 100 : 0, levyArrears: 0, frozen: 0, fleet: 0, lastCollectDay: day,
      tenderRefreshDay: 0, bidBoost: 0,
    },

    market: {
      fuel: 900, fx: 1550, floods: {}, fuelSpikeUntilDay: 0,
      today: { day, weather: 'sunny', headline: '', crackdownEdge: null, convoyDay: false },
    },
    outages: { power: {}, isp: {} },
    flags: { tipOff: false, vipTable: false, freeRide: false, layLow: false, protocolFavours: 0 },
    stats: { trips: 0, actions: 0, bribes: 0, shocksSurvived: 0, detentions: 0, burnouts: 0, peakNet: 0 },
    log: [],
    rngState: rng.s,
  };
  return s;
}

// ---------------------------------------------------------------- selectors
export const fundsOf = (s) => s.cash + s.bank;

export function netWorth(s) {
  const pending = s.work.receivables.reduce((a, r) => a + r.amount * 0.8, 0);
  const vehicle = s.vehicle.kind ? (TRADER.vehicleCost[s.vehicle.kind] || 0) * 0.55 : 0;
  const fleet = s.work.fleet * TRADER.fleetUnitCost * 0.5;
  return Math.round(s.cash + s.bank + s.work.frozen + pending + vehicle + fleet);
}

/** The single "how are you doing in Abuja" number (drives rank and the street board). */
export function abujaScore(s) {
  const v =
    netWorth(s) / 60_000 + s.clout * 8 + s.contacts.length * 9 + (s.career.level - 1) * 120 - s.heat * 2;
  return Math.max(0, Math.round(v));
}

export const rankOf = (s) => rankFor(abujaScore(s));
export const levelInfo = (s) => TRACKS[s.career.track].levels[s.career.level - 1];
export const currentDay = (s) => dayNumber(s.t);
