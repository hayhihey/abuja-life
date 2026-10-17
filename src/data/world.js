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
      { id: 'icc_conference', name: 'Intl Conference Centre (ICC / MICE)', kind: 'conference', icon: '🎙️' },
      { id: 'arts_village', name: 'Abuja Arts & Crafts Village', kind: 'crafts', icon: '🎭' },
    ],
  },
  {
    id: 'maitama', name: 'Maitama', short: 'Maitama', zone: 1, x: 60, y: 36,
    rent: 12_000_000, living: 14000, power: 0.97, isp: 0.95, footfall: 1.0, prestige: 5, housing: true,
    blurb: 'Embassies, ministers and old money behind high walls. Everybody here knows somebody - and wants you to know it.',
    landmarks: [
      { id: 'transcorp_lobby', name: 'Transcorp Hilton Lobby (Power Lunch)', kind: 'lobby', icon: '🍸' },
      { id: 'embassy_row', name: 'Embassy Row', kind: 'diplomatic', icon: '🏛️', gate: { clout: 30, label: 'Embassy Row police post' } },
      { id: 'lobby_house', name: 'Lobbyists\u2019 House', kind: 'lobbyists', icon: '🗝️', gate: { clout: 15, label: 'Lobby house gateman' } },
      { id: 'millennium_park', name: 'Millennium Park', kind: 'recreation', icon: '🌳' },
    ],
  },
  {
    id: 'asokoro', name: 'Asokoro & Aso Drive', short: 'Asokoro', zone: 1, x: 64, y: 58,
    rent: 9_500_000, living: 12000, power: 0.95, isp: 0.92, footfall: 0.8, prestige: 5, housing: true,
    blurb: 'Aso Drive billionaire mansions, intelligence headquarters, and the road to the Presidential Villa.',
    landmarks: [
      { id: 'aso_drive', name: 'Aso Drive Billionaire & Villa Boulevard', kind: 'asodrive', icon: '👑', gate: { clout: 20, label: 'Aso Drive Security Post' } },
      { id: 'protocol_lodge', name: 'Protocol Lodge', kind: 'protocol', icon: '🎫' },
      { id: 'villa_gate', name: 'Aso Rock Villa Gate', kind: 'govt', icon: '🚧', gate: { clout: 40, label: 'Presidential Guard checkpoint' } },
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
    blurb: 'Banex Plaza gadgets, Wuse Market, lounges, shawarma, boutiques and the Wuse annex of the Federal Secretariat.',
    landmarks: [
      { id: 'banex_plaza', name: 'Banex Plaza (Tech & Gadget Hub)', kind: 'banex', icon: '📱' },
      { id: 'wuse_market', name: 'Wuse Market', kind: 'market', icon: '🛍️' },
      { id: 'lounge_strip', name: 'Adetokunbo Ademola Lounge Strip', kind: 'nightlife', icon: '🍾' },
      { id: 'shawarma_corner', name: 'Yahuza Suya & Shawarma Corner', kind: 'shawarma', icon: '🌯' },
      { id: 'boutique_row', name: 'Boutique Row', kind: 'boutique', icon: '👔' },
      { id: 'wuse_secretariat', name: 'Federal Secretariat (Wuse Annex)', kind: 'govt', icon: '🏛️', gate: { clout: 8, label: 'Secretariat reception' }, employer: 'Fed. Ministry' },
    ],
  },
  {
    id: 'jabi', name: 'Jabi Lake & Waterfront', short: 'Jabi', zone: 1, x: 28, y: 36,
    rent: 4_500_000, living: 8500, power: 0.85, isp: 0.9, footfall: 1.1, prestige: 3, housing: true,
    blurb: 'Jabi Lake Waterfront, Boat Club jet-skis, Jabi Lake Mall, Baze University, tech hub and NCDC.',
    landmarks: [
      { id: 'jabi_lake', name: 'Jabi Lake Park & Waterfront Promenade', kind: 'recreation', icon: '🛶' },
      { id: 'jabi_boat_club', name: 'Jabi Boat Club (Jet-Ski & Yacht Cruise)', kind: 'jabi_lake_club', icon: '🛥️' },
      { id: 'jabi_hub', name: 'Jabi Tech Hub (co-working)', kind: 'cowork', icon: '💻' },
      { id: 'jabi_mall', name: 'Jabi Lake Mall Cafe', kind: 'cafe', icon: '☕' },
      { id: 'baze_uni', name: 'Baze University Campus', kind: 'university', icon: '🎓' },
      { id: 'ncdc_hq', name: 'NCDC Headquarters', kind: 'govt', icon: '🧪', gate: { clout: 12, label: 'NCDC front desk' }, employer: 'NCDC' },
    ],
  },
  {
    id: 'utako', name: 'Utako & Berger Junction', short: 'Utako', zone: 1, x: 36, y: 50,
    rent: 3_500_000, living: 7000, power: 0.82, isp: 0.88, footfall: 1.25, prestige: 2, housing: true,
    blurb: 'Interstate luxury buses, Berger Junction Agbero & Baba Alaye union callers, mama-put rows and innovation hubs.',
    landmarks: [
      { id: 'utako_park', name: 'Utako Motor Park', kind: 'transport', icon: '🚌' },
      { id: 'agbero_junction', name: 'Berger Junction Baba Alaye & Agbero Union Stand', kind: 'agbero_park', icon: '🗣️' },
      { id: 'utako_hub', name: 'Utako Innovation Hub', kind: 'cowork', icon: '💡' },
    ],
  },
  {
    id: 'garki', name: 'Garki', short: 'Garki', zone: 1, x: 50, y: 68,
    rent: 3_000_000, living: 6500, power: 0.8, isp: 0.85, footfall: 1.2, prestige: 2, housing: true,
    blurb: 'Area 1 Kilishi market, Federal Secretariat blocks, VIO office, car mart and AGIS land registry.',
    landmarks: [
      { id: 'area1_kilishi', name: 'Area 1 Kilishi & Suya Market', kind: 'kilishi', icon: '🥩' },
      { id: 'fed_secretariat', name: 'Federal Secretariat (FCDA)', kind: 'govt', icon: '🏛️', gate: { clout: 8, label: 'Secretariat reception' }, employer: 'FCDA' },
      { id: 'vio_office', name: 'VIO Office', kind: 'vio', icon: '🪪' },
      { id: 'car_mart', name: 'Garki Car Mart', kind: 'carmart', icon: '🚗' },
      { id: 'garki_market', name: 'Garki Market', kind: 'market', icon: '🛒' },
    ],
  },
  {
    id: 'lugbe', name: 'Lugbe & Airport Road', short: 'Lugbe', zone: 2, x: 62, y: 90,
    rent: 1_200_000, living: 3800, power: 0.62, isp: 0.7, footfall: 1.0, prestige: 1, housing: true,
    blurb: 'Airport Road hold-up capital, Abuja City Gate, Nnamdi Azikiwe Intl Airport (Lagos Flights) & Magicland.',
    landmarks: [
      { id: 'airport_junction', name: 'Airport Road / Nnamdi Azikiwe Terminal', kind: 'transport', icon: '✈️' },
      { id: 'magicland_park', name: 'Magicland Amusement Park (Wonderland)', kind: 'amusement', icon: '🎡' },
      { id: 'lugbe_market', name: 'Lugbe Market', kind: 'market', icon: '🛒' },
    ],
  },
  {
    id: 'kubwa', name: 'Kubwa', short: 'Kubwa', zone: 2, x: 12, y: 18,
    rent: 900_000, living: 3300, power: 0.6, isp: 0.7, footfall: 1.1, prestige: 1, housing: true,
    blurb: 'NYSC Orientation Camp, Abuja Light Rail train link, Zuma Rock gateway corridor and civil servants\u2019 starter homes.',
    landmarks: [
      { id: 'kubwa_station', name: 'Kubwa Light Rail Station', kind: 'transport', icon: '🚆' },
      { id: 'nysc_camp', name: 'NYSC Kubwa Orientation Camp', kind: 'nysc', icon: '🪖' },
      { id: 'zuma_gateway', name: 'Zuma Rock Monolith Viewpoint', kind: 'zuma', icon: '🗿' },
      { id: 'kubwa_market', name: 'Kubwa Market', kind: 'market', icon: '🛒' },
      { id: 'youth_joint', name: 'Kubwa Youth Joint', kind: 'youthjoint', icon: '🎶' },
    ],
  },
  {
    id: 'dawaki', name: 'Dawaki', short: 'Dawaki', zone: 2, x: 28, y: 20,
    rent: 700_000, living: 3000, power: 0.58, isp: 0.65, footfall: 0.8, prestige: 1, housing: true,
    blurb: 'Quiet estates off the Gwarinpa side and Kukwaba hills. Cheap enough for freelancers, as long as the light holds.',
    landmarks: [
      { id: 'dawaki_cafe', name: 'Dawaki Estate Cafe', kind: 'cafe', icon: '☕' },
      { id: 'dawaki_market', name: 'Dawaki Market', kind: 'market', icon: '🛒' },
    ],
  },
  {
    id: 'mpape', name: 'Mpape', short: 'Mpape', zone: 2, x: 42, y: 14,
    rent: 600_000, living: 2600, power: 0.5, isp: 0.55, footfall: 0.9, prestige: 0, housing: true,
    blurb: 'Famous Crushed Rock Blue Lagoon quarry, cliffside houses overlooking Maitama, and artisans supplying half the city.',
    landmarks: [
      { id: 'artisan_hub', name: 'Artisan Supply Hub', kind: 'market', icon: '🧱', wholesale: true },
      { id: 'quarry_view', name: 'Mpape Crushed Rock Blue Lagoon', kind: 'crushed_rock', icon: '🏞️' },
    ],
  },
  {
    id: 'nyanya', name: 'Nyanya / Mararaba', short: 'Nyanya', zone: 2, x: 90, y: 66,
    rent: 420_000, living: 2400, power: 0.45, isp: 0.55, footfall: 1.2, prestige: 0, housing: true,
    blurb: 'The choke-point. Agbero callers shouting "Area 1! Berger!", markets that never close, and the Nyanya marathon.',
    landmarks: [
      { id: 'nyanya_park', name: 'Nyanya Motor Park (Agbero & Baba Alaye Stand)', kind: 'agbero_park', icon: '🚐' },
      { id: 'mararaba_market', name: 'Mararaba Market', kind: 'market', icon: '🛒', wholesale: true },
    ],
  },
  // --- PROMINENT LAGOS STATE (EKO) SECTORS CONNECTED BY FLIGHT / INTERSTATE CORRIDOR ---
  {
    id: 'lagos_island', name: 'Lagos Island (Lekki, VI & Ikoyi)', short: 'Lekki / VI', zone: 1, x: 14, y: 84,
    rent: 15_000_000, living: 16000, power: 0.88, isp: 0.96, footfall: 1.45, prestige: 5, housing: true,
    blurb: 'Eko for Show! Lekki-Ikoyi Link Bridge, Banana Island billionaires, Eko Atlantic towers, and Victoria Island Dorime clubs.',
    landmarks: [
      { id: 'lekki_ikoyi_bridge', name: 'Lekki-Ikoyi Cable Link Bridge', kind: 'lagos_landmark', icon: '🌉' },
      { id: 'eko_atlantic', name: 'Eko Atlantic City & Victoria Island HQ', kind: 'eko_atlantic', icon: '🏙️' },
      { id: 'banana_island_gate', name: 'Banana Island Billionaire Gate (Ikoyi)', kind: 'asodrive', icon: '🏝️', gate: { clout: 30, label: 'Banana Island Private Security' } },
      { id: 'quilox_vi', name: 'Victoria Island VIP Nightlife Strip', kind: 'nightlife', icon: '🍾' },
    ],
  },
  {
    id: 'lagos_mainland', name: 'Lagos Mainland (Ikeja, Oshodi & Surulere)', short: 'Ikeja / Oshodi', zone: 2, x: 32, y: 88,
    rent: 2_800_000, living: 6500, power: 0.72, isp: 0.85, footfall: 1.55, prestige: 2, housing: true,
    blurb: 'No Gree For Anybody! Oshodi yellow Danfo parks, Baba Alaye & Agbero union headquarters, Computer Village Ikeja & Third Mainland Bridge.',
    landmarks: [
      { id: 'oshodi_agbero_park', name: 'Oshodi Transport Interchange (Agbero & Baba Alaye HQ)', kind: 'agbero_park', icon: '🗣️' },
      { id: 'computer_village', name: 'Ikeja Computer Village (Tech & Phone Hustle)', kind: 'banex', icon: '💻' },
      { id: 'afrika_shrine', name: 'New Afrika Shrine (Ikeja Afrobeats Lounge)', kind: 'nightlife', icon: '🎷' },
      { id: 'third_mainland', name: 'Third Mainland Lagoon Bridge', kind: 'lagos_landmark', icon: '🌊' },
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
  { id: 'cbd-asokoro', a: 'cbd', b: 'asokoro', name: 'Aso Drive / Three Arms Link', type: 'inner', minutes: 12, peak: 1.3, tags: ['convoy', 'checkpoint'] },
  { id: 'wuse2-maitama', a: 'wuse2', b: 'maitama', name: 'Aguiyi Ironsi Street', type: 'inner', minutes: 9, peak: 1.4, tags: ['convoy'] },
  { id: 'wuse2-jabi', a: 'wuse2', b: 'jabi', name: 'Jabi\u2013Wuse Expressway', type: 'expressway', minutes: 15, peak: 1.7, tags: ['gridlock'] },
  { id: 'jabi-utako', a: 'jabi', b: 'utako', name: 'Jabi Lake Underpass', type: 'inner', minutes: 8, peak: 1.6, tags: ['flood', 'gridlock'] },
  { id: 'utako-wuse2', a: 'utako', b: 'wuse2', name: 'Utako\u2013Wuse Link', type: 'inner', minutes: 12, peak: 1.4, tags: [] },
  { id: 'maitama-asokoro', a: 'maitama', b: 'asokoro', name: 'Aso Drive Boulevard', type: 'expressway', minutes: 14, peak: 1.2, tags: ['convoy', 'checkpoint'] },
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

  // --- Abuja <-> Lagos Jet & Highway Corridors + Third Mainland Bridge
  { id: 'lugbe-lagos-island', a: 'lugbe', b: 'lagos_island', name: 'Abuja\u2013Lagos Jet Flight (ABV \u2192 Victoria Island)', type: 'rail', minutes: 55, peak: 1.1, tags: [] },
  { id: 'lugbe-lagos-mainland', a: 'lugbe', b: 'lagos_mainland', name: 'Abuja\u2013Ikeja Express Corridor', type: 'expressway', minutes: 65, peak: 1.4, tags: ['checkpoint'] },
  { id: 'utako-lagos-mainland', a: 'utako', b: 'lagos_mainland', name: 'Utako\u2013Oshodi Luxury Night Bus Route', type: 'expressway', minutes: 70, peak: 1.5, tags: ['gridlock'] },
  { id: 'lagos-mainland-island', a: 'lagos_mainland', b: 'lagos_island', name: 'Third Mainland Bridge (Lagos Lagoon)', type: 'expressway', minutes: 18, peak: 1.8, tags: ['gridlock', 'checkpoint'] },
];

export const EDGE_BY_ID = Object.fromEntries(EDGES.map((e) => [e.id, e]));

export const edgeOther = (e, id) => (e.a === id ? e.b : e.a);

/** Edges flagged as flood-prone, for the weather system. */
export const FLOOD_EDGES = EDGES.filter((e) => e.tags.includes('flood')).map((e) => e.id);
export const CHECKPOINT_EDGES = EDGES.filter((e) => e.tags.includes('checkpoint')).map((e) => e.id);
