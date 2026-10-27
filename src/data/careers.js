// Career definitions, starting presets and procedural content templates.
// Balance numbers live here so designers can tune without touching engine code.

export const TRACKS = {
  civil: {
    id: 'civil', name: 'Civil Service', icon: '🏛️',
    tagline: 'Steady salary, slow file. Protocol is the real currency.',
    perks: 'Guaranteed monthly salary, housing allowance, strong networking.',
    risks: 'Slow promotions without lobbying. Deployment letters can drop any morning.',
    levels: [
      { title: 'GL 08 Officer', salary: 160_000 },
      { title: 'GL 12 Principal Officer', salary: 330_000 },
      { title: 'GL 15 Deputy Director', salary: 720_000 },
      { title: 'Director / Permanent Secretary', salary: 1_600_000 },
    ],
  },
  contractor: {
    id: 'contractor', name: 'Contractor / Vendor', icon: '📦',
    tagline: 'Tenders, bids and supply runs. Big margins, bigger delays on payment.',
    perks: 'Huge upside, procurement access, powerful contacts.',
    risks: 'Upfront capital and collateral. Invoices can sit on a director\u2019s table for weeks.',
    levels: [
      { title: 'Vendor (Supply Kit)' },
      { title: 'Registered Contractor' },
      { title: 'Prime Contractor' },
      { title: 'Tier-1 Federal Contractor' },
    ],
  },
  tech: {
    id: 'tech', name: 'Tech & Creative Nomad', icon: '💻',
    tagline: 'Dollar milestones, naira expenses, and NEPA that never reads your calendar.',
    perks: 'FX income, flexible location, founder network.',
    risks: 'Power cuts, ISP downtime, FX swings, and pricey cafe habits.',
    levels: [
      { title: 'Freelancer' },
      { title: 'Remote Specialist' },
      { title: 'Senior Remote Lead' },
      { title: 'Founder / Agency Principal' },
    ],
  },
  trader: {
    id: 'trader', name: 'Street Trader & Transport', icon: '🛺',
    tagline: 'Quick daily cash, daily levies, and a task force that knows your corner.',
    perks: 'Cash every shift, tiny entry cost, loyal street network.',
    risks: 'Task-force raids, union levies, fuel prices, thin margins.',
    levels: [
      { title: 'Kiosk Hawker' },
      { title: 'Kiosk Owner' },
      { title: 'Keke / Taxi Operator' },
      { title: 'Park Manager (Fleet Owner)' },
    ],
  },
};

export const TRACK_IDS = Object.keys(TRACKS);

/** Where a civil servant can be posted (district + landmark id from world.js). */
export const CIVIL_POSTINGS = [
  { org: 'FCDA', district: 'garki', spot: 'fed_secretariat' },
  { org: 'Fed. Ministry', district: 'wuse2', spot: 'wuse_secretariat' },
  { org: 'NNPC', district: 'cbd', spot: 'nnpc_towers' },
  { org: 'CBN', district: 'cbd', spot: 'cbn_hq' },
  { org: 'NCDC', district: 'jabi', spot: 'ncdc_hq' },
];

/** Per-track starting kit. `rentDays` is how long the prepaid rent still has to run. */
export const START_PRESETS = {
  civil: {
    district: 'kubwa', cash: 90_000, bank: 420_000, clout: 12, energy: 90, sanity: 70, heat: 0,
    rentDays: 110, contacts: ['civil_servant', 'civil_servant', 'dispatcher'],
    blurb: 'Posted to a federal agency, living in Kubwa, riding the train to work.',
  },
  contractor: {
    district: 'lugbe', cash: 150_000, bank: 1_600_000, clout: 8, energy: 90, sanity: 70, heat: 0,
    rentDays: 140, contacts: ['contractor', 'civil_servant', 'dispatcher'],
    blurb: 'A supply kit, a small float and a plan to catch your first tender.',
  },
  tech: {
    district: 'dawaki', cash: 60_000, bank: 520_000, clout: 6, energy: 90, sanity: 72, heat: 0,
    rentDays: 90, contacts: ['tech_founder', 'tech_founder', 'promoter'],
    blurb: 'Laptop, UPS, and a landlord who swears the light will be stable.',
  },
  trader: {
    district: 'nyanya', cash: 120_000, bank: 130_000, clout: 4, energy: 95, sanity: 70, heat: 1,
    rentDays: 100, contacts: ['dispatcher', 'dispatcher'],
    blurb: 'A shop in Nyanya, initial trade float, goods in stock, and an early morning hustle.',
  },
};

/** Promotion requirements (index = current level - 1). */
export const PROMO = {
  civil: [
    { clout: 12, contacts: 4, daysWorked: 20, fee: 0 },
    { clout: 28, contacts: 8, daysWorked: 60, fee: 0 },
    { clout: 48, contacts: 12, daysWorked: 120, fee: 0 },
  ],
  contractor: [
    { clout: 14, completed: 2, fee: 150_000 },
    { clout: 32, completed: 5, fee: 1_200_000 },
    { clout: 52, completed: 9, fee: 8_000_000 },
  ],
  tech: [
    { clout: 8, completed: 3, fee: 250_000 },
    { clout: 20, completed: 8, fee: 1_500_000 },
    { clout: 38, completed: 16, fee: 9_000_000 },
  ],
  trader: [
    { clout: 3, profit: 100_000, fee: 150_000 }, // kiosk permit + structure
    { clout: 10, vehicle: true, fee: 0 }, // need wheels for taxi work
    { clout: 24, fleet: 2, fee: 1_500_000 }, // park permit + union dues
  ],
};

/** Cost to enter a track from another one. */
export const SWITCH_COST = { civil: 200_000, contractor: 600_000, tech: 400_000, trader: 40_000 };
export const SWITCH_CLOUT = { civil: 15, contractor: 0, tech: 0, trader: 0 };

// ---------------------------------------------------------------- tenders
export const TENDER_CAPITAL = [350_000, 2_500_000, 15_000_000, 80_000_000];
export const TENDER_AGENCIES = ['FCDA', 'NNPC', 'CBN', 'NCDC', 'FIRS', 'Fed. Min. of Works', 'NITDA', 'FRSC', 'Fed. Min. of Education'];
export const TENDER_TITLES = [
  ['Supply of office chairs & desks', 'Stationery & toner for registry', 'Branded water & refreshments', 'Cleaning & janitorial consumables'],
  ['Fuel & lubricant supply for fleet', 'ICT peripherals for 40 offices', 'Staff uniform & PPE supply', 'Conference logistics & catering'],
  ['Drainage & road-marking, Phase II', 'ICT equipment: 300 laptops', 'Perimeter fencing, district school', 'Streetlight maintenance, 3 corridors'],
  ['Fleet of 120 utility vehicles', 'Secretariat block refurbishment', 'Bulk fuel depot logistics', 'National ID card kit supply'],
];

// ---------------------------------------------------------------- tech gigs
export const GIG_USD = [[50, 110], [200, 450], [600, 1400], [2000, 4500]];
export const GIG_CLIENTS = ['Berlin fintech', 'Toronto SaaS team', 'London design studio', 'Dubai logistics startup', 'Austin ad agency', 'Lagos scale-up', 'Nairobi health-tech', 'Amsterdam e-commerce brand'];
export const GIG_TITLES = ['Landing page rebuild', 'Mobile app bug sprint', 'Brand identity pack', 'Data dashboard', 'Short video campaign', 'API integration', 'Product copy & SEO', 'UX audit'];

// ---------------------------------------------------------------- trader economy
export const TRADER = {
  profitBase: [6500, 11500, 34000, 0], // gross per shift by level (L4 earns from fleet)
  stockPerShift: [20, 25, 0, 0],
  levy: [1200, 2000, 3000, 5000], // daily union levy
  wholesale: 160,
  retail: 195,
  vehicleCost: { car: 5_500_000, keke: 2_400_000 },
  fleetUnitCost: 2_400_000,
  fleetDaily: 5500,
};

// ---------------------------------------------------------------- contacts
export const CONTACT_TYPES = {
  contractor: { label: 'Contractor', icon: '🧱', orgs: ['Zenith Builders', 'Gwari Supply Co.', 'Capital Haulage', 'Apex Procurement', 'Unity Projects'] },
  civil_servant: { label: 'Civil Servant', icon: '🗂️', orgs: ['FCDA', 'NNPC', 'CBN', 'NCDC', 'FIRS', 'Fed. Ministry'] },
  promoter: { label: 'Club Promoter', icon: '🎧', orgs: ['Lounge 77', 'Afterglow Events', 'Wuse Nights', 'Velvet Room'] },
  tech_founder: { label: 'Tech Founder', icon: '🚀', orgs: ['PayBridge', 'Savannah Labs', 'Kito Logistics', 'Lakeside Studio'] },
  dispatcher: { label: 'Logistics Dispatcher', icon: '🚚', orgs: ['Park Union', 'SwiftRun Dispatch', 'Kubwa Riders', 'Mararaba Haulage'] },
};

export const FIRST_NAMES = ['Chinedu', 'Aisha', 'Tunde', 'Ngozi', 'Musa', 'Folake', 'Emeka', 'Hauwa', 'Sani', 'Bukola', 'Ifeanyi', 'Zainab', 'Yakubu', 'Chioma', 'Abubakar', 'Bisi', 'Danjuma', 'Amaka', 'Garba', 'Kemi', 'Obinna', 'Maryam', 'Segun', 'Halima', 'Ebuka', 'Fatima'];
export const LAST_NAMES = ['Okonkwo', 'Bello', 'Adeyemi', 'Ibrahim', 'Eze', 'Lawal', 'Danladi', 'Nwosu', 'Abdullahi', 'Ogunleye', 'Gambo', 'Okeke', 'Yusuf', 'Obi', 'Salihu', 'Balogun', 'Usman', 'Okoro', 'Mohammed', 'Akpan'];
export const TITLES = { 1: ['Mr.', 'Mrs.', 'Mallam', 'Madam'], 2: ['Engr.', 'Barr.', 'Alhaji', 'Hajiya'], 3: ['Chief', 'Dr.', 'Sen.', 'Hon.'] };

export const RIVAL_NAMES = [
  ['Chief Emeka \u201cAso\u201d Okonkwo', 'contractor', 5200], ['Hajiya Zainab Lawal', 'civil', 4300], ['Barr. Tunde Ogunleye', 'civil', 3600],
  ['Engr. Danjuma Gambo', 'contractor', 3900], ['Amaka \u201cWuse\u201d Eze', 'tech', 2600], ['Mallam Sani Usman', 'trader', 1500],
  ['Kemi Balogun', 'tech', 2200], ['Obinna \u201cKeke\u201d Obi', 'trader', 1300], ['Dr. Fatima Mohammed', 'civil', 3100],
];
