// Player state: a plain JSON-serialisable object. No methods, no DOM, no clock logic.
// Everything the engine mutates lives here so saves are just JSON.stringify.

import { DISTRICT_BY_ID } from '../data/world.js';
import { CIVIL_POSTINGS, START_PRESETS, TRADER, TRACKS } from '../data/careers.js';
import { RNG } from './rng.js';
import { makeContact } from './contacts.js';
import { START_T, dayNumber } from './clock.js';
import { rankFor } from '../data/voice.js';
import { uid } from './util.js';

import { NIGERIAN_LIFESTYLES, GENDERS } from '../data/lifestyles.js';

export const SAVE_VERSION = 1;

export function newState({
  name = 'Abuja Newcomer',
  track = 'civil',
  seed = (Date.now() >>> 0),
  avatar = '🧑🏾',
  gender = 'male',
  age = 26,
  lifeStage = 'adult',
  lifestyle = null,
  prevProperty = 'default'
} = {}) {
  const P = START_PRESETS[track] || START_PRESETS.civil;
  const L = lifestyle ? NIGERIAN_LIFESTYLES[lifestyle] : null;
  const rng = new RNG(seed);
  const startDistrict = L ? L.district : P.district;
  const D = DISTRICT_BY_ID[startDistrict] || DISTRICT_BY_ID[P.district];
  const day = dayNumber(START_T);

  const gInfo = GENDERS[gender] || GENDERS.male;

  // Determine starting plots & vehicles if a Nigerian lifestyle or previous property was selected
  let initialPlots = {};
  let initialCar = 'along';
  let initialOwnedCars = ['along'];
  let initialSolar = false;

  if (L) {
    initialCar = L.defaultCar || 'along';
    if (initialCar !== 'along') initialOwnedCars.push(initialCar);
    initialSolar = Boolean(L.defaultSolar);
    if (L.defaultPlots) {
      for (const [k, v] of Object.entries(L.defaultPlots)) {
        initialPlots[k] = { ...v, boughtDay: day, lastRentCollection: 0, lastShortletDay: 0 };
      }
    }
  }

  if (prevProperty === 'none') {
    initialPlots = {};
    initialCar = 'along';
    initialOwnedCars = ['along'];
    initialSolar = false;
  } else if (prevProperty === 'kubwa_starter') {
    initialPlots = {
      kubwa: { district: 'kubwa', stage: 3, name: 'Kubwa Extension Plot', cofo: true, boughtDay: day, lastRentCollection: 0, lastShortletDay: 0 }
    };
    initialCar = 'corolla';
    if (!initialOwnedCars.includes('corolla')) initialOwnedCars.push('corolla');
  } else if (prevProperty === 'jabi_shortlet') {
    initialPlots = {
      jabi: { district: 'jabi', stage: 5, name: 'Jabi Lakefront Terrace', cofo: true, boughtDay: day, lastRentCollection: 0, lastShortletDay: 0 }
    };
    initialCar = 'rx350';
    if (!initialOwnedCars.includes('rx350')) initialOwnedCars.push('rx350');
    initialSolar = true;
  } else if (prevProperty === 'maitama_empire') {
    initialPlots = {
      maitama: { district: 'maitama', stage: 5, name: 'Maitama Minister’s Hill', cofo: true, boughtDay: day, lastRentCollection: 0, lastShortletDay: 0 },
      wuse2: { district: 'wuse2', stage: 5, name: 'Wuse 2 Adetokunbo Plot', cofo: true, boughtDay: day, lastRentCollection: 0, lastShortletDay: 0 }
    };
    initialCar = 'g63';
    for (const c of ['prado', 'g63', 'rx350']) {
      if (!initialOwnedCars.includes(c)) initialOwnedCars.push(c);
    }
    initialSolar = true;
  }

  const hasCompletedHome = Object.values(initialPlots).some((p) => p.stage >= 5);

  const s = {
    v: SAVE_VERSION,
    meta: {
      id: uid('p'),
      name,
      avatar: gInfo.icon || avatar,
      gender: gInfo.id,
      age: Number(age) || 26,
      lifeStage,
      lifestyle: L ? L.id : 'standard',
      caliber: L ? L.caliber : 'Standard FCT Citizen',
      slangTag: L ? L.slangTag : 'We Move • FCT Hustle',
      seed,
      created: Date.now()
    },
    t: START_T,

    // ---- the six vectors
    cash: L ? L.cash : P.cash,
    bank: L ? L.bank : P.bank, // funds_ngn = cash + bank
    clout: L ? L.clout : P.clout, // clout_protocol
    energy: P.energy, // energy_stamina
    sanity: P.sanity, // sanity_stress
    heat: P.heat, // legal_heat
    contacts: P.contacts.map((type) => makeContact(rng, type, 1)), // network_connections

    loc: { district: startDistrict, spot: null },
    home: {
      district: startDistrict,
      rent: D.rent,
      paidUntilDay: day + (hasCompletedHome ? 3650 : P.rentDays),
      shock: null,
      evictions: 0,
    },

    career: {
      track, level: 1, daysWorked: 0, attendance: 0, lastWorkDay: 0, promoFile: 0,
      posting: track === 'civil' ? { ...rng.pick(CIVIL_POSTINGS) } : null,
      kiosk: null, // trader L2 location
      since: day,
    },

    social: {
      steeze: L ? L.steeze : 70,
      composure: L ? L.composure : 75,
      courses: [],
      bae: null,
      plots: initialPlots,
      car: initialCar,
      ownedCars: initialOwnedCars,
      solarInstalled: initialSolar
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

const PLOT_VALUATION = { kubwa: 1500000, lugbe: 2200000, dawaki: 3000000, jabi: 5500000, wuse2: 8500000, guzape: 11000000, maitama: 16000000, asokoro: 21000000, lagos_island: 24000000 };
const CAR_VALUATION = { along: 0, corolla: 1200000, rx350: 4800000, prado: 9500000, g63: 15000000 };

export function netWorth(s) {
  const pending = s.work.receivables.reduce((a, r) => a + r.amount * 0.8, 0);
  const vehicle = s.vehicle.kind ? (TRADER.vehicleCost[s.vehicle.kind] || 0) * 0.55 : 0;
  const fleet = s.work.fleet * TRADER.fleetUnitCost * 0.5;
  let realEstateVal = 0;
  if (s.social?.plots) {
    for (const p of Object.values(s.social.plots)) {
      const base = PLOT_VALUATION[p.district] || 1500000;
      realEstateVal += base * (0.3 + (p.stage || 0) * 0.25);
    }
  }
  let garageVal = 0;
  if (Array.isArray(s.social?.ownedCars)) {
    for (const c of s.social.ownedCars) {
      garageVal += CAR_VALUATION[c] || 0;
    }
  }
  return Math.round(s.cash + s.bank + s.work.frozen + pending + vehicle + fleet + realEstateVal + garageVal);
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
