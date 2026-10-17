// ============================================================================
// ABUJA LIFE — THE SIMS CORE SIMULATION ENGINE & SMART OBJECT ECOSYSTEM
// ============================================================================
// Adapts Will Wright / Maxis Sims mechanics to the Federal Capital Territory:
// - 8 Motives: Hunger, Energy, Comfort, Fun, Hygiene, Social, Bladder, Room/Environment
// - Smart Autonomous Objects broadcasting interactions & utility AI scoring
// - Domestic Infrastructure: AEDC Grid / Gen / Solar Inverter + Borehole / Overhead Tank
// - Estate HOA Politics: Monthly dues, gate curfew, WhatsApp group, Chairman elections
// - Build & Buy Catalog: Perimeter security, generators, Turkish velvet, Suya grills
// - Skill Progression: Cooking, Mechanical, Charisma, Logic (1-10)
// ============================================================================

import { clamp, ngn } from './util.js';

export const MOTIVE_NAMES = [
  'hunger',
  'energy',
  'comfort',
  'fun',
  'hygiene',
  'social',
  'bladder',
  'environment'
];

export const MOTIVE_CONFIG = {
  hunger:      { label: 'Hunger',      icon: '🍗', decayPerHour: 3.2, defaultWeight: 1.5, lowWarning: 'Starving! Grab some Jollof or Suya sharp sharp.' },
  energy:      { label: 'Energy',      icon: '⚡', decayPerHour: 2.8, defaultWeight: 1.4, lowWarning: 'Exhausted! You need sleep or steady AC breeze.' },
  comfort:     { label: 'Comfort',     icon: '🛋️', decayPerHour: 2.0, defaultWeight: 1.0, lowWarning: 'Body is aching. Sit on good sofa or rest.' },
  fun:         { label: 'Fun',         icon: '🎮', decayPerHour: 2.2, defaultWeight: 1.1, lowWarning: 'Boredom is catching you! Listen to Afrobeat or play Whot.' },
  hygiene:     { label: 'Hygiene',     icon: '🚿', decayPerHour: 2.0, defaultWeight: 1.2, lowWarning: 'Sweaty and dusty. Need borehole shower.' },
  social:      { label: 'Social',      icon: '💬', decayPerHour: 1.8, defaultWeight: 1.1, lowWarning: 'Feeling lonely. Check Estate WhatsApp or call Bae.' },
  bladder:     { label: 'Bladder',     icon: '🚽', decayPerHour: 3.5, defaultWeight: 1.6, lowWarning: 'Tension! Locate a toilet before embarrassment.' },
  environment: { label: 'Environment', icon: '🏡', decayPerHour: 1.2, defaultWeight: 0.9, lowWarning: 'Compound looks rough. Clear Harmattan dust or start gen.' },
};

export const SKILL_NAMES = ['cooking', 'mechanical', 'charisma', 'logic'];

// ----------------------------------------------------------------------------
// Initial Sims State Factory
// ----------------------------------------------------------------------------
export function initSimsState(opts = {}) {
  return {
    motives: {
      hunger: 85,
      energy: 90,
      comfort: 80,
      fun: 75,
      hygiene: 88,
      social: 70,
      bladder: 85,
      environment: 80,
      ...opts.motives
    },
    skills: {
      cooking: 1,
      mechanical: 1,
      charisma: 1,
      logic: 1,
      xp: { cooking: 0, mechanical: 0, charisma: 0, logic: 0 },
      ...opts.skills
    },
    utilities: {
      gridAvailable: true,
      generatorRunning: false,
      genFuelLiters: 12, // 12 liters petrol/diesel
      genFuelCapacity: 30,
      tankWaterLiters: 1200, // Overhead tank out of 2000L
      tankCapacity: 2000,
      boreholeWorking: true,
      waterFilterInstalled: false,
      solarBatteryCharge: 100, // 0..100%
      solarInstalled: false,
      atsInstalled: false, // Automatic Transfer Switch
      dustLevel: 10, // Harmattan dust accumulation (0..100)
      lastPumpDay: 1,
      ...opts.utilities
    },
    estate: {
      name: opts.estateName || 'Peace & Unity Residential Close',
      monthlyDues: 45000,
      duesPaidUntilDay: 30,
      visitorAccessCode: 'ABJ-8841',
      accessPermitted: true,
      chairmanStanding: 50, // 0..100 reputation with HOA
      curfewHour: 23, // 11 PM
      dieselPoolHours: 6, // 6 hours central estate gen
      activeNotices: [],
      ...opts.estate
    },
    installedObjects: [
      'bed_orthopedic',
      'gas_cooker',
      'toilet_ceramic',
      'shower_cubicle',
      'turkish_velvet_sofa',
      'gen_tiger',
      'overhead_tank_2000l',
      ...(opts.installedObjects || [])
    ],
    activeAction: null, // { objectId, interactionId, startT, endT, label }
    autonomousMode: true,
  };
}

// ----------------------------------------------------------------------------
// Build & Buy Catalog: Abuja Domestic Architecture
// ----------------------------------------------------------------------------
export const BUILD_BUY_CATALOG = [
  // POWER INFRASTRUCTURE
  {
    id: 'gen_tiger',
    name: '0.9 kVA Small Petrol Gen ("I-pass-my-neighbor")',
    category: 'power',
    cost: 120000,
    desc: 'Powers basic bulbs, TV and standing fan. High noise and fumes; manual pull cord.',
    specs: { kva: 0.9, fuelType: 'petrol', fuelPerHour: 0.8, noise: -12, maxAcHp: 0 },
    icon: '🔌'
  },
  {
    id: 'gen_soundproof',
    name: '10 kVA Soundproof Silent Diesel Generator',
    category: 'power',
    cost: 3800000,
    desc: 'Runs entire house + 2 Air Conditioners smoothly. Low noise, heavy duty.',
    specs: { kva: 10.0, fuelType: 'diesel', fuelPerHour: 1.5, noise: -2, maxAcHp: 3.5 },
    icon: '🔋'
  },
  {
    id: 'solar_inverter_5kva',
    name: '5 kVA Hybrid Solar Inverter + Lithium Battery',
    category: 'power',
    cost: 4500000,
    desc: 'Silent, 24/7 continuous electricity. Zero fuel cost. Runs on sunlight.',
    specs: { kva: 5.0, fuelType: 'solar', fuelPerHour: 0, noise: 0, maxAcHp: 1.5 },
    icon: '☀️'
  },
  {
    id: 'ats_transfer_switch',
    name: 'Automatic Transfer Switch (ATS Panel)',
    category: 'power',
    cost: 350000,
    desc: 'Automatically cranks generator within 5 seconds of NEPA blackout.',
    specs: { autoSwitch: true },
    icon: '⚡'
  },

  // WATER INFRASTRUCTURE
  {
    id: 'overhead_tank_2000l',
    name: 'Overhead 2,000L Plastic Geepee Tank + Steel Stanchion',
    category: 'water',
    cost: 450000,
    desc: 'Stores 2,000 liters of water. Provides pressurized gravity-fed domestic flow.',
    specs: { capacityLiters: 2000 },
    icon: '🚰'
  },
  {
    id: 'industrial_water_filter',
    name: 'Industrial Borehole Water Filter & Softener',
    category: 'water',
    cost: 380000,
    desc: 'Eliminates brown borehole water events. Protects pipes and gives crystal clear water.',
    specs: { pureWater: true },
    icon: '🧼'
  },

  // SECURITY & ACCESS
  {
    id: 'electric_fence_razor',
    name: 'Concertina Razor Wire + High Voltage Electric Fence',
    category: 'security',
    cost: 650000,
    desc: 'Boosts compound environment security. Deters burglars and trespassers.',
    specs: { securityBonus: 25, environmentBonus: 10 },
    icon: '🛡️'
  },
  {
    id: 'automated_sliding_gate',
    name: 'Automated Motorized Sliding Gate + Remote Fob',
    category: 'security',
    cost: 1200000,
    desc: 'Drive straight into your compound without waiting or honking for the gateman.',
    specs: { securityBonus: 20, gateSpeed: 'instant' },
    icon: '🚪'
  },

  // COMFORT & APPLIANCES
  {
    id: 'split_ac_2hp',
    name: '2.0 HP Dual-Inverter Split Air Conditioner',
    category: 'comfort',
    cost: 550000,
    desc: 'Rapid tropical room chilling. Heavy comfort restore. Requires stable power.',
    specs: { comfortBonus: 35, requiresKva: 2.5 },
    icon: '❄️'
  },
  {
    id: 'turkish_velvet_sofa',
    name: 'Royal Turkish Velvet Living Room Sectional',
    category: 'comfort',
    cost: 2800000,
    desc: 'Plush imported royal gold velvet sofa. Maximum comfort and high social clout.',
    specs: { comfortBonus: 40, statusBonus: 25 },
    icon: '🛋️'
  },
  {
    id: 'bed_orthopedic',
    name: 'King-Size Orthopedic Spring Mattress & Teak Bedframe',
    category: 'comfort',
    cost: 750000,
    desc: 'Restores Energy and Comfort rapidly during night sleep.',
    specs: { energyRate: 2.2, comfortRate: 1.8 },
    icon: '🛏️'
  },

  // KITCHEN & SOCIAL
  {
    id: 'gas_cooker',
    name: '4-Burner Glass-Top Gas Cooker & Electric Oven',
    category: 'kitchen',
    cost: 260000,
    desc: 'Prepares delicious authentic Nigerian meals: Jollof rice, Egusi, Pounded Yam.',
    specs: { cookingSpeed: 1.5 },
    icon: '🍳'
  },
  {
    id: 'suya_grill_outdoor',
    name: 'Outdoor Charcoal Suya & Asun Drum Grill',
    category: 'kitchen',
    cost: 85000,
    desc: 'Roast peppered Suya, Asun and Kilishi. Unlocks weekend compound hangout parties.',
    specs: { funBonus: 25, socialBonus: 30 },
    icon: '🥩'
  },
  {
    id: 'study_laptop',
    name: 'MacBook Pro M3 + Dual 4K Monitor Workstation',
    category: 'study',
    cost: 1850000,
    desc: 'High-speed coding, remote gigs, and contract tender document preparation.',
    specs: { logicBonus: 20, codingSpeed: 2.0 },
    icon: '💻'
  },
  {
    id: 'toilet_ceramic',
    name: 'Ceramic Dual-Flush Water Closet',
    category: 'sanitary',
    cost: 110000,
    desc: 'Essential for relieving Bladder. Consumes 12 liters of water per flush.',
    specs: { waterPerFlush: 12 },
    icon: '🚽'
  },
  {
    id: 'shower_cubicle',
    name: 'Tempered Glass Rainfall Shower Cubicle',
    category: 'sanitary',
    cost: 320000,
    desc: 'Hot rainfall shower. Restores Hygiene and Comfort. Consumes 35 liters.',
    specs: { waterPerUse: 35 },
    icon: '🚿'
  }
];

export const CATALOG_BY_ID = Object.fromEntries(BUILD_BUY_CATALOG.map(c => [c.id, c]));

// ----------------------------------------------------------------------------
// Smart Object Interactions (Broadcasted Action Descriptors)
// ----------------------------------------------------------------------------
export const SMART_OBJECT_INTERACTIONS = {
  bed_orthopedic: [
    {
      id: 'sleep_restful',
      label: 'Sleep Soundly (8 Hours)',
      durationMin: 480,
      needDeltas: { energy: +85, comfort: +45, bladder: -35, hunger: -25 },
      requires: { power: false },
      desc: 'Rest and regenerate energy for the next Abuja hustle day.'
    },
    {
      id: 'power_nap',
      label: 'Quick Power Nap (45 Mins)',
      durationMin: 45,
      needDeltas: { energy: +25, comfort: +15 },
      requires: { power: false },
      desc: 'Short recharge between traffic commutes and meetings.'
    }
  ],

  gas_cooker: [
    {
      id: 'cook_jollof',
      label: 'Cook Smoky Party Jollof Rice',
      durationMin: 50,
      needDeltas: { hunger: +65, fun: +15, energy: -8 },
      skills: { cooking: 18 },
      requires: { waterLiters: 15 },
      costNgn: 4500,
      desc: 'Classic Nigerian party jollof with fried plantain (dodo).'
    },
    {
      id: 'cook_egusi',
      label: 'Pound Yam & Cook Egusi Soup',
      durationMin: 60,
      needDeltas: { hunger: +80, comfort: +20, energy: -14 },
      skills: { cooking: 25 },
      requires: { waterLiters: 20 },
      costNgn: 6500,
      desc: 'Hot pounded yam with assorted meat and stockfish.'
    },
    {
      id: 'quick_indomie',
      label: 'Make Spicy Indomie Noodles & Fried Egg',
      durationMin: 15,
      needDeltas: { hunger: +35, energy: -3 },
      skills: { cooking: 5 },
      requires: { waterLiters: 8 },
      costNgn: 1200,
      desc: 'Quick late-night Abuja bachelor hustle meal.'
    }
  ],

  suya_grill_outdoor: [
    {
      id: 'roast_suya',
      label: 'Roast Peppered Beef Suya & Sliced Onions',
      durationMin: 40,
      needDeltas: { hunger: +55, fun: +30, social: +25 },
      skills: { cooking: 15, charisma: 10 },
      costNgn: 5000,
      desc: 'Hot spicy suya roasted over red hot charcoal embers.'
    },
    {
      id: 'compound_suya_party',
      label: 'Host Compound Weekend Asun & Suya Hangout',
      durationMin: 90,
      needDeltas: { hunger: +70, fun: +50, social: +60, energy: -15 },
      skills: { charisma: 35, cooking: 20 },
      costNgn: 28000,
      desc: 'Invite estate neighbors and friends. Boosts clout and estate reputation.'
    }
  ],

  split_ac_2hp: [
    {
      id: 'blast_ac',
      label: 'Turn on 16°C Chilling Breeze (1 Hr)',
      durationMin: 60,
      needDeltas: { comfort: +35, environment: +30 },
      requires: { power: true, minKva: 2.0 },
      desc: 'Cool down tropical Abuja heat in comfort.'
    }
  ],

  turkish_velvet_sofa: [
    {
      id: 'watch_dstv',
      label: 'Watch Premier League & Afrobeat on DStv',
      durationMin: 60,
      needDeltas: { fun: +35, comfort: +25, energy: +10 },
      requires: { power: true },
      desc: 'Relax on royal gold velvet cushions with cold Chapman.'
    },
    {
      id: 'dust_harmattan_sofa',
      label: 'Wipe Harmattan Dust off Furniture',
      durationMin: 25,
      needDeltas: { environment: +25, energy: -6 },
      skills: { mechanical: 5 },
      desc: 'Clean the white and gold velvet fabric from dry northern dust.'
    }
  ],

  toilet_ceramic: [
    {
      id: 'use_toilet',
      label: 'Use Restroom & Flush',
      durationMin: 8,
      needDeltas: { bladder: +95, comfort: +10 },
      requires: { waterLiters: 12 },
      desc: 'Relieve bladder and restore physical peace.'
    }
  ],

  shower_cubicle: [
    {
      id: 'take_shower',
      label: 'Take Refreshing Shower',
      durationMin: 20,
      needDeltas: { hygiene: +90, comfort: +25, energy: +10 },
      requires: { waterLiters: 35 },
      desc: 'Wash away the day’s heat and street dust.'
    }
  ],

  gen_tiger: [
    {
      id: 'start_tiger_gen',
      label: 'Pull Starter Cord (Run 0.9kVA Tiger Gen)',
      durationMin: 10,
      needDeltas: { energy: -5 },
      skills: { mechanical: 8 },
      desc: 'Start petrol generator to provide emergency light and fans.'
    },
    {
      id: 'refuel_gen',
      label: 'Pour 5 Litres Petrol into Tank',
      durationMin: 10,
      needDeltas: { energy: -4 },
      costNgn: 4500, // 5L @ ₦900
      desc: 'Replenish petrol reserves using yellow jerry can.'
    }
  ],

  gen_soundproof: [
    {
      id: 'toggle_diesel_gen',
      label: 'Start 10 kVA Soundproof Diesel Gen',
      durationMin: 5,
      needDeltas: {},
      desc: 'Switch on heavy silent diesel power plant.'
    }
  ],

  solar_inverter_5kva: [
    {
      id: 'check_solar_panels',
      label: 'Inspect Solar Inverter & Battery Bank',
      durationMin: 15,
      needDeltas: { environment: +15 },
      skills: { mechanical: 12, logic: 10 },
      desc: 'Check lithium battery charge and daily solar kilowatt harvest.'
    }
  ],

  overhead_tank_2000l: [
    {
      id: 'pump_borehole_water',
      label: 'Turn on Submersible Borehole Pump',
      durationMin: 30,
      needDeltas: { energy: -5 },
      requires: { power: true },
      desc: 'Pump 1,000L fresh water from underground aquifer into overhead tank.'
    }
  ],

  study_laptop: [
    {
      id: 'remote_code_sprint',
      label: 'Work on US Remote Tech Sprint',
      durationMin: 90,
      needDeltas: { fun: -10, energy: -18, social: -8 },
      skills: { logic: 28 },
      requires: { power: true },
      rewardNgn: 45000,
      desc: 'Earn foreign exchange remote dollars converted to Naira.'
    },
    {
      id: 'study_civil_exam',
      label: 'Review Federal Civil Service Directorate Rules',
      durationMin: 60,
      needDeltas: { fun: -12, energy: -12 },
      skills: { charisma: 20, logic: 15 },
      desc: 'Study PSR (Public Service Rules) for upcoming promotion interview.'
    }
  ]
};

// ----------------------------------------------------------------------------
// Sims Simulation Motive & Utility Tick Loop (Runs every hour / advance)
// ----------------------------------------------------------------------------
export function tickSimsState(game, elapsedMinutes = 60) {
  const s = game.s;
  if (!s.sims) {
    s.sims = initSimsState({
      estateName: `${game.district?.name || 'Abuja'} Residents Association`
    });
  }

  const sims = s.sims;
  const hours = elapsedMinutes / 60;
  const weather = s.market?.today?.weather || 'sunny';
  const harmattan = weather === 'harmattan';
  const isNight = game.isPowerOut(s.loc.district);

  // 1. Motive Decay
  for (const [motive, cfg] of Object.entries(MOTIVE_CONFIG)) {
    let decay = cfg.decayPerHour * hours;

    // Environmental modifiers
    if (motive === 'comfort' && isNight && !sims.utilities.generatorRunning && !sims.utilities.solarInstalled) {
      decay *= 1.45; // Heat debuff without power
    }
    if (motive === 'environment' && harmattan) {
      decay *= 1.8; // Harmattan dust degrades room aura
      sims.utilities.dustLevel = clamp(sims.utilities.dustLevel + 4 * hours, 0, 100);
    }
    if (motive === 'hygiene' && harmattan) {
      decay *= 1.35;
    }

    sims.motives[motive] = clamp(sims.motives[motive] - decay, 0, 100);
  }

  // 2. Power & Generator Fuel Consumption
  if (sims.utilities.generatorRunning) {
    const isDiesel = sims.installedObjects.includes('gen_soundproof');
    const burnRate = isDiesel ? 1.5 : 0.8; // Liters per hour
    sims.utilities.genFuelLiters = Math.max(0, sims.utilities.genFuelLiters - burnRate * hours);
    if (sims.utilities.genFuelLiters <= 0) {
      sims.utilities.generatorRunning = false;
      game.log('Generator sputtered and stopped: Out of fuel! Buy fuel sharp.', 'warn', '⛽');
    }
  }

  // Automatic Transfer Switch (ATS) logic:
  if (sims.utilities.atsInstalled && game.isPowerOut(s.home.district)) {
    if (!sims.utilities.generatorRunning && sims.utilities.genFuelLiters > 1) {
      sims.utilities.generatorRunning = true;
      game.log('ATS Panel automatically engaged soundproof diesel generator.', 'good', '⚡');
    }
  }

  // 3. Water Tank Baseline Depletion (evaporation/standby)
  if (sims.utilities.tankWaterLiters > 0) {
    sims.utilities.tankWaterLiters = Math.max(0, sims.utilities.tankWaterLiters - 2 * hours);
  }

  // 4. Estate Levy Check
  if (game.day > sims.estate.duesPaidUntilDay && sims.estate.accessPermitted) {
    sims.estate.accessPermitted = false;
    sims.estate.activeNotices.push({
      day: game.day,
      text: 'Defaulted on Estate Security & Diesel Levy! Main gate access barred.'
    });
    game.log(`Estate gate barrier down! Pay your ₦${sims.estate.monthlyDues.toLocaleString()} monthly levy to restore access.`, 'bad', '🚫');
  }

  return sims;
}

// ----------------------------------------------------------------------------
// Utility AI: Score & Choose Smart Object Interactions
// ----------------------------------------------------------------------------
export function evaluateAutonomousActions(game) {
  const sims = game.s.sims;
  if (!sims) return [];

  const candidates = [];
  const powerActive = !game.isPowerOut(game.s.loc.district) || sims.utilities.generatorRunning || sims.utilities.solarInstalled;

  for (const objId of sims.installedObjects) {
    const interactions = SMART_OBJECT_INTERACTIONS[objId] || [];
    for (const action of interactions) {
      // Check resource prerequisites
      if (action.requires?.power && !powerActive) continue;
      if (action.requires?.waterLiters && sims.utilities.tankWaterLiters < action.requires.waterLiters) continue;

      // Calculate utility score based on lowest motives
      let score = 0;
      if (action.needDeltas) {
        for (const [motive, delta] of Object.entries(action.needDeltas)) {
          if (delta > 0) {
            const current = sims.motives[motive] ?? 50;
            const weight = MOTIVE_CONFIG[motive]?.defaultWeight || 1.0;
            const needUrgency = Math.max(0, 100 - current);
            score += (needUrgency / 100) * delta * weight;
          }
        }
      }

      candidates.push({
        objectId: objId,
        interaction: action,
        score: Math.round(score * 10) / 10
      });
    }
  }

  // Sort highest utility first
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ----------------------------------------------------------------------------
// Execute Smart Object Action
// ----------------------------------------------------------------------------
export function runSmartObjectAction(game, objectId, interactionId) {
  const sims = game.s.sims;
  if (!sims) return { ok: false, reason: 'Sims state not initialized' };

  const interactions = SMART_OBJECT_INTERACTIONS[objectId] || [];
  const action = interactions.find(i => i.id === interactionId);
  if (!action) return { ok: false, reason: 'Interaction not found' };

  const powerActive = !game.isPowerOut(game.s.loc.district) || sims.utilities.generatorRunning || sims.utilities.solarInstalled;
  if (action.requires?.power && !powerActive) {
    return { ok: false, reason: 'No electricity! Start your generator or wait for NEPA.' };
  }

  if (action.requires?.waterLiters && sims.utilities.tankWaterLiters < action.requires.waterLiters) {
    return { ok: false, reason: `Dry pipes! Overhead tank is empty. Run borehole pump first.` };
  }

  if (action.costNgn && !game.canAfford(action.costNgn)) {
    return { ok: false, reason: `Insufficient funds. Need ₦${action.costNgn.toLocaleString()}.` };
  }

  // Pay costs
  if (action.costNgn) {
    game.pay(action.costNgn);
  }
  if (action.requires?.waterLiters) {
    sims.utilities.tankWaterLiters = Math.max(0, sims.utilities.tankWaterLiters - action.requires.waterLiters);
  }

  // Generator on/off special handling
  if (interactionId === 'start_tiger_gen' || interactionId === 'toggle_diesel_gen') {
    sims.utilities.generatorRunning = !sims.utilities.generatorRunning;
    game.log(sims.utilities.generatorRunning ? 'Generator started! Electricity flowing through compound.' : 'Generator turned off.', 'good', '🔌');
  }

  if (interactionId === 'pump_borehole_water') {
    sims.utilities.tankWaterLiters = Math.min(sims.utilities.tankCapacity, sims.utilities.tankWaterLiters + 1000);
    game.log('Borehole pumped 1,000 Liters into the overhead tank!', 'good', '🚰');
  }

  if (interactionId === 'refuel_gen') {
    sims.utilities.genFuelLiters = Math.min(sims.utilities.genFuelCapacity, sims.utilities.genFuelLiters + 10);
    game.log('Added 10 Liters fuel to generator tank.', 'good', '⛽');
  }

  // Apply Need Deltas
  if (action.needDeltas) {
    for (const [motive, delta] of Object.entries(action.needDeltas)) {
      sims.motives[motive] = clamp((sims.motives[motive] || 50) + delta, 0, 100);
    }
  }

  // Skill progression
  if (action.skills) {
    for (const [skill, xpGained] of Object.entries(action.skills)) {
      sims.skills.xp[skill] = (sims.skills.xp[skill] || 0) + xpGained;
      const currentLevel = sims.skills[skill] || 1;
      const threshold = currentLevel * 100;
      if (sims.skills.xp[skill] >= threshold && currentLevel < 10) {
        sims.skills[skill] = currentLevel + 1;
        sims.skills.xp[skill] -= threshold;
        game.log(`🎉 Skill Level Up! ${skill.toUpperCase()} is now Level ${sims.skills[skill]}!`, 'good', '⭐');
      }
    }
  }

  // Monetary reward
  if (action.rewardNgn) {
    game.s.bank += action.rewardNgn;
    game.log(`Earned ₦${action.rewardNgn.toLocaleString()} into bank account!`, 'good', '💰');
  }

  game.advance(action.durationMin || 30);
  game.log(`${action.label} completed.`, 'info', '✅');
  game.emit('hud');
  return { ok: true, action };
}

// ----------------------------------------------------------------------------
// Build & Buy Mode Purchasing
// ----------------------------------------------------------------------------
export function buyCatalogItem(game, itemId) {
  const item = CATALOG_BY_ID[itemId];
  if (!item) return { ok: false, reason: 'Item not found in catalog' };

  const sims = game.s.sims;
  if (!sims) return { ok: false, reason: 'Sims state not initialized' };

  if (sims.installedObjects.includes(itemId)) {
    return { ok: false, reason: 'Already installed in your compound!' };
  }

  if (!game.canAfford(item.cost)) {
    return { ok: false, reason: `Need ₦${item.cost.toLocaleString()} to purchase ${item.name}.` };
  }

  game.pay(item.cost);
  sims.installedObjects.push(itemId);

  // Apply immediate infrastructure benefits
  if (itemId === 'solar_inverter_5kva') {
    sims.utilities.solarInstalled = true;
    sims.utilities.solarBatteryCharge = 100;
  }
  if (itemId === 'ats_transfer_switch') {
    sims.utilities.atsInstalled = true;
  }
  if (itemId === 'industrial_water_filter') {
    sims.utilities.waterFilterInstalled = true;
  }

  game.log(`Purchased & Installed: ${item.name} for ₦${item.cost.toLocaleString()}!`, 'good', item.icon || '📦');
  game.emit('hud');
  return { ok: true, item };
}

// ----------------------------------------------------------------------------
// Pay Estate Monthly Maintenance Dues
// ----------------------------------------------------------------------------
export function payEstateLevy(game) {
  const sims = game.s.sims;
  if (!sims) return { ok: false, reason: 'No sims state' };

  const dues = sims.estate.monthlyDues;
  if (!game.canAfford(dues)) {
    return { ok: false, reason: `Insufficient funds. Need ₦${dues.toLocaleString()} for estate levy.` };
  }

  game.pay(dues);
  sims.estate.duesPaidUntilDay = game.day + 30;
  sims.estate.accessPermitted = true;
  sims.estate.chairmanStanding = Math.min(100, sims.estate.chairmanStanding + 15);
  sims.estate.visitorAccessCode = `ABJ-${game.rng.int(1000, 9999)}`;

  game.log(`Paid ₦${dues.toLocaleString()} Estate Monthly Dues. Gate access restored, visitor code: ${sims.estate.visitorAccessCode}`, 'good', '🎟️');
  game.emit('hud');
  return { ok: true };
}
