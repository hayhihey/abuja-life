// World model: districts, landmarks and the highway/inner-road graph.
// Pure data. Nothing in here knows about players. Coordinates are SVG units (0-100)
// for a stylised, roughly-geographic schematic of the FCT (north = up).
//
// Rents are annual and quoted the way Abuja landlords do: upfront, in full.
// `living` is the daily cost of food, airtime, data, fuel-for-gen and small things.
// `power` / `isp` are 0-1 reliability scores; satellites suffer far more outages.

/** Landmark kinds are what actions bind to (see core/actions.js). */
export const DISTRICTS = [
  {
    id: 'cbd', name: 'Central Business District', short: 'CBD', zone: 1, x: 50, y: 50,
    rent: null, living: 9000, power: 0.93, isp: 0.92, footfall: 1.3, prestige: 3, housing: false,
    blurb: 'Where Abuja decides things. Towers, ministries, the Mosque and the Christian Centre looking at each other across the Three Arms Zone.',
    landmarks: [
      { id: 'national_mosque', name: 'National Mosque', kind: 'mosque', icon: '🕌' },
      { id: 'christian_centre', name: 'National Christian Centre', kind: 'church', icon: '⛪' },
      { id: 'nnpc_towers', name: 'NNPC Towers', kind: 'govt', icon: '🏢', gate: { clout: 25, label: 'NNPC security desk' }, employer: 'NNPC' },
      { id: 'cbn_hq', name: 'Central Bank (CBN) HQ', kind: 'govt', icon: '🏦', gate: { clout: 25, label: 'CBN access control' }, employer: 'CBN' },
      { id: 'bpp_tenders', name: 'Procurement Bureau (BPP) Desk', kind: 'tenders', icon: '📑' },
    ],
  },
  {
    id: 'maitama', name: 'Maitama', short: 'Maitama', zone: 1, x: 60, y: 36,
    rent: 12_000_000, living: 14000, power: 0.97, isp: 0.95, footfall: 1.0, prestige: 5, housing: true,
    blurb: 'Embassies, ministers and old money behind high walls. Everybody here knows somebody - and wants you to know it.',
    landmarks: [
      { id: 'transcorp_lobby', name: 'Hotel Lobby (Power Lunch)', kind: 'lobby', icon: '🍸' },
      { id: 'embassy_row', name: 'Embassy Row', kind: 'diplomatic', icon: '🏛️', gate: { clout: 30, label: 'Embassy Row police post' } },
      { id: 'lobby_house', name: 'Lobbyists\u2019 House', kind: 'lobbyists', icon: '🗝️', gate: { clout: 15, label: 'Lobby house gateman' } },
      { id: 'millennium_park', name: 'Millennium Park', kind: 'recreation', icon: '🌳' },
    ],
  },
  {
    id: 'asokoro', name: 'Asokoro', short: 'Asokoro', zone: 1, x: 64, y: 58,
    rent: 9_500_000, living: 12000, power: 0.95, isp: 0.92, footfall: 0.8, prestige: 5, housing: true,
    blurb: 'Quiet, tight security, big names. The road to the Villa runs through here, so convoys do too.',
    landmarks: [
      { id: 'protocol_lodge', name: 'Protocol Lodge', kind: 'protocol', icon: '🎫' },
      { id: 'villa_gate', name: 'Villa Gate Road', kind: 'govt', icon: '🚧', gate: { clout: 40, label: 'Presidential Guard checkpoint' } },
    ],
  },
  {
    id: 'guzape', name: 'Guzape', short: 'Guzape', zone: 1, x: 78, y: 52,
    rent: 8_000_000, living: 11000, power: 0.9, isp: 0.9, footfall: 0.7, prestige: 4, housing: true,
    blurb: 'Hilltop mansions and new-money estates. Lovely views, long detours when the Lokogoma crossing floods.',
    landmarks: [
      { id: 'guzape_hilltop', name: 'Guzape Hilltop View', kind: 'recreation', icon: '⛰️' },
    ],
  },
  {
    id: 'wuse2', name: 'Wuse 2', short: 'Wuse 2', zone: 1, x: 44, y: 38,
    rent: 6_000_000, living: 10000, power: 0.9, isp: 0.93, footfall: 1.25, prestige: 3, housing: true,
    blurb: 'Lounges, shawarma, boutiques and the Wuse annex of the Federal Secretariat. Abuja\u2019s night drive starts here.',
    landmarks: [
      { id: 'lounge_strip', name: 'Lounge Strip', kind: 'nightlife', icon: '🍾' },
      { id: 'shawarma_corner', name: 'Shawarma Corner', kind: 'shawarma', icon: '🌯' },
      { id: 'boutique_row', name: 'Boutique Row', kind: 'boutique', icon: '👔' },
      { id: 'wuse_secretariat', name: 'Federal Secretariat (Wuse Annex)', kind: 'govt', icon: '🏛️', gate: { clout: 8, label: 'Secretariat reception' }, employer: 'Fed. Ministry' },
    ],
  },
  {
    id: 'jabi', name: 'Jabi', short: 'Jabi', zone: 1, x: 28, y: 36,
    rent: 4_500_000, living: 8500, power: 0.85, isp: 0.9, footfall: 1.1, prestige: 3, housing: true,
    blurb: 'Lake, mall, tech hub and NCDC. Joggers at dawn, founders at noon, traffic at six.',
    landmarks: [
      { id: 'jabi_lake', name: 'Jabi Lake Park', kind: 'recreation', icon: '🛶' },
      { id: 'jabi_hub', name: 'Jabi Tech Hub (co-working)', kind: 'cowork', icon: '💻' },
      { id: 'jabi_mall', name: 'Jabi Lake Mall Cafe', kind: 'cafe', icon: '☕' },
      { id: 'ncdc_hq', name: 'NCDC Headquarters', kind: 'govt', icon: '🧪', gate: { clout: 12, label: 'NCDC front desk' }, employer: 'NCDC' },
    ],
  },
  {
    id: 'utako', name: 'Utako', short: 'Utako', zone: 1, x: 36, y: 50,
    rent: 3_500_000, living: 7000, power: 0.82, isp: 0.88, footfall: 1.25, prestige: 2, housing: true,
    blurb: 'Long-distance buses, mama-put rows and a busy innovation hub. Everybody is either arriving or leaving.',
    landmarks: [
      { id: 'utako_park', name: 'Utako Motor Park', kind: 'transport', icon: '🚌' },
      { id: 'utako_hub', name: 'Utako Innovation Hub', kind: 'cowork', icon: '💡' },
    ],
  },
  {
    id: 'garki', name: 'Garki', short: 'Garki', zone: 1, x: 50, y: 68,
    rent: 3_000_000, living: 6500, power: 0.8, isp: 0.85, footfall: 1.2, prestige: 2, housing: true,
    blurb: 'Federal secretariat blocks, VIO office, car mart and the market. Paperwork capital of Nigeria.',
    landmarks: [
      { id: 'fed_secretariat', name: 'Federal Secretariat (FCDA)', kind: 'govt', icon: '🏛️', gate: { clout: 8, label: 'Secretariat reception' }, employer: 'FCDA' },
      { id: 'vio_office', name: 'VIO Office', kind: 'vio', icon: '🪪' },
      { id: 'car_mart', name: 'Garki Car Mart', kind: 'carmart', icon: '🚗' },
      { id: 'garki_market', name: 'Garki Market', kind: 'market', icon: '🛒' },
    ],
  },
  {
    id: 'lugbe', name: 'Lugbe', short: 'Lugbe', zone: 2, x: 62, y: 90,
    rent: 1_200_000, living: 3800, power: 0.62, isp: 0.7, footfall: 1.0, prestige: 1, housing: true,
    blurb: 'Airport Road hold-up capital. Dense estates, FRSC at every bend, and a lot of people with early alarms.',
    landmarks: [
      { id: 'airport_junction', name: 'Airport Road Junction', kind: 'transport', icon: '✈️' },
      { id: 'lugbe_market', name: 'Lugbe Market', kind: 'market', icon: '🛒' },
    ],
  },
  {
    id: 'kubwa', name: 'Kubwa', short: 'Kubwa', zone: 2, x: 12, y: 18,
    rent: 900_000, living: 3300, power: 0.6, isp: 0.7, footfall: 1.1, prestige: 1, housing: true,
    blurb: 'Civil servants\u2019 starter homes, a train link into town and a restless young crowd.',
    landmarks: [
      { id: 'kubwa_station', name: 'Kubwa Train Station', kind: 'transport', icon: '🚆' },
      { id: 'kubwa_market', name: 'Kubwa Market', kind: 'market', icon: '🛒' },
      { id: 'youth_joint', name: 'Kubwa Youth Joint', kind: 'youthjoint', icon: '🎶' },
    ],
  },
  {
    id: 'dawaki', name: 'Dawaki', short: 'Dawaki', zone: 2, x: 28, y: 20,
    rent: 700_000, living: 3000, power: 0.58, isp: 0.65, footfall: 0.8, prestige: 1, housing: true,
    blurb: 'Quiet estates off the Gwarinpa side. Cheap enough for freelancers, as long as the light holds.',
    landmarks: [
      { id: 'dawaki_cafe', name: 'Dawaki Estate Cafe', kind: 'cafe', icon: '☕' },
      { id: 'dawaki_market', name: 'Dawaki Market', kind: 'market', icon: '🛒' },
    ],
  },
  {
    id: 'mpape', name: 'Mpape', short: 'Mpape', zone: 2, x: 42, y: 14,
    rent: 600_000, living: 2600, power: 0.5, isp: 0.55, footfall: 0.9, prestige: 0, housing: true,
    blurb: 'Quarry views, cliffside houses and the artisans who supply half the city. Wholesale prices, hard roads.',
    landmarks: [
      { id: 'artisan_hub', name: 'Artisan Supply Hub', kind: 'market', icon: '🧱', wholesale: true },
      { id: 'quarry_view', name: 'Quarry Viewpoint', kind: 'recreation', icon: '⛰️' },
    ],
  },
  {
    id: 'nyanya', name: 'Nyanya / Mararaba', short: 'Nyanya', zone: 2, x: 90, y: 66,
    rent: 420_000, living: 2400, power: 0.45, isp: 0.55, footfall: 1.2, prestige: 0, housing: true,
    blurb: 'The choke-point. Markets that never close, rents that are actually survivable, and the Nyanya marathon every morning.',
    landmarks: [
      { id: 'nyanya_park', name: 'Nyanya Motor Park', kind: 'transport', icon: '🚐' },
      { id: 'mararaba_market', name: 'Mararaba Market', kind: 'market', icon: '🛒', wholesale: true },
    ],
  },
];

export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

export const LANDMARK_INDEX = {}; // landmarkId -> { district, landmark }
for (const d of DISTRICTS) for (const l of d.landmarks) LANDMARK_INDEX[l.id] = { district: d, landmark: l };

/**
 * Road graph (undirected). `type`: expressway | inner | rail.
 * `tags`: checkpoint (VIO/FRSC), convoy (VIP motorcades), flood (low-lying crossing),
 * gridlock (peak multiplier applies hard). `peak` is the rush-hour time multiplier.
 */
export const EDGES = [
  // --- Zone 1 inner grid
  { id: 'cbd-wuse2', a: 'cbd', b: 'wuse2', name: 'Shehu Shagari Way', type: 'inner', minutes: 10, peak: 1.5, tags: ['checkpoint', 'convoy'] },
  { id: 'cbd-garki', a: 'cbd', b: 'garki', name: 'Ahmadu Bello Way', type: 'inner', minutes: 12, peak: 1.4, tags: [] },
  { id: 'cbd-maitama', a: 'cbd', b: 'maitama', name: 'Ministers Hill Link', type: 'inner', minutes: 14, peak: 1.3, tags: ['convoy'] },
  { id: 'cbd-asokoro', a: 'cbd', b: 'asokoro', name: 'Asokoro Link', type: 'inner', minutes: 12, peak: 1.3, tags: ['convoy', 'checkpoint'] },
  { id: 'wuse2-maitama', a: 'wuse2', b: 'maitama', name: 'Aguiyi Ironsi Street', type: 'inner', minutes: 9, peak: 1.4, tags: ['convoy'] },
  { id: 'wuse2-jabi', a: 'wuse2', b: 'jabi', name: 'Jabi\u2013Wuse Expressway', type: 'expressway', minutes: 15, peak: 1.7, tags: ['gridlock'] },
  { id: 'jabi-utako', a: 'jabi', b: 'utako', name: 'Jabi Lake Underpass', type: 'inner', minutes: 8, peak: 1.6, tags: ['flood', 'gridlock'] },
  { id: 'utako-wuse2', a: 'utako', b: 'wuse2', name: 'Utako\u2013Wuse Link', type: 'inner', minutes: 12, peak: 1.4, tags: [] },
  { id: 'maitama-asokoro', a: 'maitama', b: 'asokoro', name: 'Diplomatic Drive', type: 'expressway', minutes: 14, peak: 1.2, tags: ['convoy', 'checkpoint'] },
  { id: 'asokoro-guzape', a: 'asokoro', b: 'guzape', name: 'Guzape Hills Road', type: 'inner', minutes: 12, peak: 1.2, tags: [] },
  { id: 'garki-asokoro', a: 'garki', b: 'asokoro', name: 'Garki\u2013Asokoro Road', type: 'inner', minutes: 10, peak: 1.3, tags: [] },
  { id: 'garki-wuse2', a: 'garki', b: 'wuse2', name: 'Moshood Abiola Way', type: 'inner', minutes: 13, peak: 1.5, tags: ['checkpoint'] },

  // --- Satellite corridors
  { id: 'garki-lugbe-x', a: 'garki', b: 'lugbe', name: 'Airport Road', type: 'expressway', minutes: 40, peak: 1.9, tags: ['checkpoint', 'gridlock'] },
  { id: 'garki-lugbe-i', a: 'garki', b: 'lugbe', name: 'Sauka Inner Link', type: 'inner', minutes: 58, peak: 1.3, tags: [] },
  { id: 'guzape-lugbe', a: 'guzape', b: 'lugbe', name: 'Lokogoma\u2013Galadimawa Crossing', type: 'inner', minutes: 35, peak: 1.3, tags: ['flood'] },
  { id: 'garki-nyanya-x', a: 'garki', b: 'nyanya', name: 'Nyanya\u2013Karu Expressway', type: 'expressway', minutes: 45, peak: 2.0, tags: ['gridlock', 'checkpoint'] },
  { id: 'garki-nyanya-i', a: 'garki', b: 'nyanya', name: 'Old Karu Road', type: 'inner', minutes: 62, peak: 1.3, tags: [] },
  { id: 'guzape-nyanya', a: 'guzape', b: 'nyanya', name: 'Karu\u2013Guzape Bypass', type: 'inner', minutes: 42, peak: 1.3, tags: ['flood'] },
  { id: 'kubwa-jabi-x', a: 'kubwa', b: 'jabi', name: 'Kubwa Expressway', type: 'expressway', minutes: 45, peak: 1.9, tags: ['checkpoint', 'gridlock'] },
  { id: 'kubwa-cbd-rail', a: 'kubwa', b: 'cbd', name: 'Kubwa Train Link', type: 'rail', minutes: 32, peak: 1.0, tags: [] },
  { id: 'kubwa-dawaki', a: 'kubwa', b: 'dawaki', name: 'Kubwa\u2013Dawaki Link', type: 'inner', minutes: 20, peak: 1.2, tags: [] },
  { id: 'dawaki-jabi', a: 'dawaki', b: 'jabi', name: 'Gwarinpa\u2013Jabi Road', type: 'inner', minutes: 30, peak: 1.5, tags: [] },
  { id: 'kubwa-mpape', a: 'kubwa', b: 'mpape', name: 'Mpape\u2013Kubwa Road', type: 'inner', minutes: 30, peak: 1.2, tags: ['flood'] },
  { id: 'mpape-maitama', a: 'mpape', b: 'maitama', name: 'Katampe Link', type: 'inner', minutes: 22, peak: 1.4, tags: [] },
  { id: 'mpape-wuse2', a: 'mpape', b: 'wuse2', name: 'Mpape\u2013Wuse Bypass', type: 'expressway', minutes: 26, peak: 1.5, tags: ['checkpoint'] },
];

export const EDGE_BY_ID = Object.fromEntries(EDGES.map((e) => [e.id, e]));

export const edgeOther = (e, id) => (e.a === id ? e.b : e.a);

/** Edges flagged as flood-prone, for the weather system. */
export const FLOOD_EDGES = EDGES.filter((e) => e.tags.includes('flood')).map((e) => e.id);
export const CHECKPOINT_EDGES = EDGES.filter((e) => e.tags.includes('checkpoint')).map((e) => e.id);
