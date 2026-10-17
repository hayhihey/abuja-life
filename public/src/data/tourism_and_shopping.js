/**
 * @file src/data/tourism_and_shopping.js
 * Complete Nigerian Tourist Attractions Atlas (from the Executive Desk Diary reference pages)
 * + MarketWishes.com (https://marketwishes.com) E-Commerce & Shopping Center catalog.
 */

export const NIGERIA_ENCYCLOPEDIA_INFO = {
  title: 'INFORMATION ABOUT NIGERIA — OFFICIAL ALMANAC',
  coordinates: '10° North of the Equator, 8° East of the Greenwich Meridian (GMT+1)',
  borders: 'Gulf of Guinea (Bights of Benin & Bonny) to the South; Niger (North), Chad & Cameroon (East), Republic of Benin (West).',
  seasons: 'Dry Season (November – March, with Harmattan winds) & Rainy Season (April – October).',
  populationAndResources: 'Over 200+ million citizens (most populous Black nation on Earth). Rich in crude oil (OPEC & APPA member), natural gas (NLNG), coal, limestone, tin, iron ore, gold, bitumen, cocoa, palm produce, groundnuts, and cassava.',
  culturalHeritage: 'Over 2,000+ years of iron-smelting and sculpture including ancient Nok Terra-Cottas and Igbo-Ukwu bronze castings.',
  politicalStructure: 'Independence on October 1, 1960; Republic in 1963; 12 states in 1967; FCT Abuja & 19 states in 1976; 21 states in 1987; 30 states in 1991; 36 States + FCT across 6 Geopolitical Zones and 774 Local Government Areas (LGAs). Democratic governance continuously since May 29, 1999.',
  currency: 'Naira and Kobo (₦ / N:k) — 100 Kobo = ₦1.00, issued by the Central Bank of Nigeria (CBN).'
};

/**
 * MarketWishes.com (https://marketwishes.com) — Abuja-headquartered E-Commerce & Smart Shopping Mall
 */
export const MARKETWISHES_INFO = {
  name: 'MarketWishes.com Shopping Center',
  url: 'https://marketwishes.com',
  hq: 'Jabi Waterfront Commercial Hub, Abuja FCT (Nationwide Delivery across all 36 States)',
  tagline: 'Your Modern Shopping Destination — Electronics, Luxury Fashion, Home & Solar, Groceries & Digital Academy',
  features: [
    '⚡ Instant Abuja & Lagos Pay-on-Delivery + Nationwide Express Logistics',
    '🔒 256-Bit SSL Naira Checkout & MarketWishes Loyalty Cashback Points (MW Points)',
    '🏪 Open Your Own MarketWishes Vendor Storefront for Daily Passive Naira Income'
  ]
};

export const MARKETWISHES_CATEGORIES = [
  { id: 'all', label: '🛍️ All Deals' },
  { id: 'electronics', label: '📱 Tech & Gadgets' },
  { id: 'fashion', label: '👗 Naija Luxury & Steeze' },
  { id: 'home', label: '🏡 Home, Solar & Living' },
  { id: 'groceries', label: '🛒 Groceries & Refresh' },
  { id: 'auto', label: '🚙 Auto & Convoy Gear' },
  { id: 'digital', label: '📚 Digital Courses & Vendor' }
];

export const MARKETWISHES_CATALOG = [
  {
    id: 'mw_energy_pack',
    name: 'MarketWishes Express Shawarma, Zobo & Tiger-Nut Box',
    category: 'groceries',
    price: 18000,
    badge: '🔥 Hot Daily Deal',
    desc: 'Same-hour MarketWishes dispatch rider delivery in Abuja & Lagos. Restores stamina and cools FCT stress.',
    effects: { energy: 30, sanity: 18, clout: 1, steeze: 2, composure: 2 },
    repeatable: true
  },
  {
    id: 'mw_car_detailing_kit',
    name: 'Ceramic Car Coating, Tire Shine & Oud Cabin Diffuser',
    category: 'auto',
    price: 45000,
    badge: '🚙 Whip Glow',
    desc: 'Keep your Tokunbo Corolla or G-Wagon shining at Maitama and Victoria Island valets.',
    effects: { energy: 0, sanity: 8, clout: 4, steeze: 8, composure: 6 },
    repeatable: true
  },
  {
    id: 'mw_ecom_masterclass',
    name: 'MarketWishes Vendor & Dropshipping Storefront License',
    category: 'digital',
    price: 65000,
    badge: '🏪 Passive Income',
    desc: 'Launch your verified vendor store on marketwishes.com! Earns daily Naira payouts from nationwide orders.',
    effects: { energy: -5, sanity: 10, clout: 8, steeze: 6, composure: 10 },
    unlocksVendor: true,
    repeatable: false
  },
  {
    id: 'mw_skincare_perfume',
    name: 'Arabian Oud Perfume & Luxury Skin Glow Box',
    category: 'fashion',
    price: 68000,
    badge: '✨ Steeze Boost',
    desc: 'Smell like an Aso Drive billionaire or Lekki soft-life baddie before walking into Transcorp Hilton.',
    effects: { energy: 5, sanity: 12, clout: 6, steeze: 14, composure: 10 },
    repeatable: true
  },
  {
    id: 'mw_ringlight_studio',
    name: '4K Live-Shopping Ring Light & Wireless Creator Mic Kit',
    category: 'electronics',
    price: 85000,
    badge: '🎥 Creator Gear',
    desc: 'Stream live on MarketWishes Live, TikTok & Instagram from Wuse 2 or Lekki Phase 1.',
    effects: { energy: 0, sanity: 10, clout: 9, steeze: 11, composure: 6 },
    repeatable: false
  },
  {
    id: 'mw_groceries_hamper',
    name: '50kg Royal Stallion Rice, Oil & Monthly Provision Hamper',
    category: 'groceries',
    price: 95000,
    badge: '🌾 Zero Sapa',
    desc: 'Full household foodstuff supply delivered to your doorstep via MarketWishes Logistics.',
    effects: { energy: 45, sanity: 28, clout: 3, steeze: 4, composure: 12 },
    repeatable: true
  },
  {
    id: 'mw_senator_kaftan',
    name: 'Bespoke Abuja Senator Suit & Zanna Bukar Cap',
    category: 'fashion',
    price: 125000,
    badge: '👔 Protocol Fit',
    desc: 'Tailored cashmere Senator wear that opens doors at Federal Secretariat and Maitama lounges.',
    effects: { energy: 0, sanity: 8, clout: 11, steeze: 16, composure: 14 },
    repeatable: false
  },
  {
    id: 'mw_convoy_siren_tint',
    name: 'VIP Factory Tint, 4K Dashcam & Presidential Plate Frame',
    category: 'auto',
    price: 175000,
    badge: '🛡️ -20 Heat',
    desc: 'Upgrades your vehicle security and makes VIO/FRSC checkpoint officers salute and wave you through.',
    effects: { energy: 0, sanity: 10, clout: 9, steeze: 12, composure: 12, heat: -20 },
    repeatable: false
  },
  {
    id: 'mw_lace_agbada',
    name: 'Alhaji Grand 3-Piece Swiss Voile Lace Agbada',
    category: 'fashion',
    price: 450000,
    badge: '👑 Owambe King',
    desc: 'Heavy hand-embroidered Agbada for ICC weddings, Aso Drive parleys, and Eko Hotel galas.',
    effects: { energy: 0, sanity: 15, clout: 18, steeze: 25, composure: 20, heat: -10 },
    repeatable: false
  },
  {
    id: 'mw_massage_chair',
    name: 'Executive Zero-Gravity Full-Body Massage Chair',
    category: 'home',
    price: 540000,
    badge: '🧘‍♂️ Peak Recovery',
    desc: 'Melt away Abuja traffic and Lagos hustle stress inside your apartment every evening.',
    effects: { energy: 35, sanity: 32, clout: 10, steeze: 8, composure: 15 },
    repeatable: false
  },
  {
    id: 'mw_starlink_kit',
    name: 'Starlink Gen-3 High-Speed Satellite Internet Kit',
    category: 'electronics',
    price: 590000,
    badge: '🛰️ Zero Downtime',
    desc: 'High-speed low-orbit internet from MarketWishes Tech Store. Immune to local ISP fiber cuts.',
    effects: { energy: 5, sanity: 16, clout: 12, steeze: 10, composure: 12 },
    repeatable: false
  },
  {
    id: 'mw_baddie_luxury_bag',
    name: 'OS Designer Birkin-Style Tote, 30" Bone-Straight & Shades',
    category: 'fashion',
    price: 680000,
    badge: '💅 Soft Life 100%',
    desc: 'Unmatched luxury aesthetics for Jabi Boat Club, Banana Island, and Victoria Island rooftops.',
    effects: { energy: 0, sanity: 20, clout: 19, steeze: 26, composure: 18 },
    repeatable: false
  },
  {
    id: 'mw_ecoflow_inverter',
    name: 'MarketWishes 5kVA Lithium Solar Inverter Power Station',
    category: 'home',
    price: 750000,
    badge: '☀️ 24/7 Power',
    desc: 'Permanent rooftop solar & lithium backup. Activates 24/7 home power and +25% Shortlet payouts!',
    effects: { energy: 20, sanity: 25, clout: 14, steeze: 12, composure: 16 },
    installsSolar: true,
    repeatable: false
  },
  {
    id: 'mw_gold_chronograph',
    name: '18K Rose-Gold Executive Chronograph Wristwatch',
    category: 'fashion',
    price: 920000,
    badge: '⌚ Odogwu Timepiece',
    desc: 'Heavyweight timepiece from MarketWishes Luxury Vault. Commands instant respect in boardrooms.',
    effects: { energy: 0, sanity: 15, clout: 22, steeze: 24, composure: 22 },
    repeatable: false
  },
  {
    id: 'mw_iphone_16_pro_max',
    name: 'iPhone 16 Pro Max (1TB Desert Titanium — Factory Unlocked)',
    category: 'electronics',
    price: 1850000,
    badge: '📱 Flagship Status',
    desc: 'Verified Apple flagship with MarketWishes Buyer Protection warranty. Triple-camera steeze.',
    effects: { energy: 0, sanity: 22, clout: 24, steeze: 25, composure: 18 },
    repeatable: false
  },
  {
    id: 'mw_macbook_m3_max',
    name: 'MacBook Pro 16" M3 Max (64GB RAM Tech Mogul Workstation)',
    category: 'electronics',
    price: 2450000,
    badge: '💻 USD Engine',
    desc: 'Ultimate machine for closing Silicon Valley & Eko Atlantic contracts without lag.',
    effects: { energy: 10, sanity: 25, clout: 26, steeze: 20, composure: 22 },
    repeatable: false
  }
];

/**
 * Complete Nigerian Tourist Attractions Directory (Directly from the 4 Tourist Attractions Book Pages)
 * Organized by State & Geopolitical Zone, with playable excursion costs & rewards.
 */
export const NIGERIA_TOURIST_ATTRACTIONS = [
  {
    state: 'FCT (Abuja)',
    zone: 'North Central',
    featuredDistrict: 'maitama',
    cost: 15000,
    clout: 4,
    sanity: 22,
    steeze: 6,
    attractions: [
      'Abuja Amusement Park, Wuse',
      'Abuja Zoological Garden, Garki',
      'Aso Rock & Caves, Asokoro',
      'Zuma Rock (FCT–Niger Gateway)',
      'Aso Rock Park & Zoo',
      'IBB Golf Course, Maitama',
      'Jabi River & Dam'
    ],
    highlight: 'Explore Aso Rock & Caves in Asokoro, tee off at IBB Golf Course, unwind by Jabi River & Dam, or visit Abuja Amusement Park Wuse & Garki Zoo.'
  },
  {
    state: 'Lagos State',
    zone: 'South West',
    featuredDistrict: 'lagos_island',
    cost: 25000,
    clout: 5,
    sanity: 26,
    steeze: 8,
    attractions: [
      'Badagry Beach & First Storey Building in Nigeria (Badagry)',
      'Relics of Slavery, Black Heritage Museum & Whispering Palms (Badagry)',
      'Lekki Conservation Centre & Lekki Peninsula',
      'Lagos Bar Beach, Tarkwa Bay, Ibeshe Beach, Kamp Ikate & Eleko Beach',
      'Ikoyi Club Golf Course & Murtala Mohammed Botanical Garden',
      'Eko Tourist Beach Resort, La Campagne Tropicana & Hermitage Garden Resort',
      'National Museum Onikan, Tafawa Balewa Square (TBS) & Terra Kulture',
      'The National Theatre Iganmu, Jhalobia Recreation Park & Funtopia'
    ],
    highlight: 'Walk the canopy bridge at Lekki Conservation Centre, boat to Tarkwa Bay & La Campagne Tropicana, or tour the historic First Storey Building in Badagry.'
  },
  {
    state: 'Abia State',
    zone: 'South East',
    cost: 28000,
    clout: 4,
    sanity: 20,
    steeze: 5,
    attractions: [
      'Arochukwu Caves, Arochukwu',
      'National War Museum, Umuahia',
      'Azumini Blue River',
      'Museum of Colonial History, Aba',
      'Akwete Weaving Centre',
      'The Ohafia War Dancers',
      'The Pottery Works of Ishiagu'
    ],
    highlight: 'Cruise the crystal-clear Azumini Blue River, explore the historic Arochukwu Caves, and admire handwoven Akwete cloth.'
  },
  {
    state: 'Adamawa State',
    zone: 'North East',
    cost: 35000,
    clout: 5,
    sanity: 24,
    steeze: 6,
    attractions: [
      'Sukur UNESCO World Heritage Site',
      'Three Sisters Rock',
      'Koma Hills & Mandara Mountains',
      'Kiri Dam',
      'Modibbo Adama Tomb Monument',
      'Lamurde Hot Spring'
    ],
    highlight: 'Climb the ancient stone terraces of Sukur UNESCO World Heritage Site and behold the dramatic peaks of the Mandara Mountains.'
  },
  {
    state: 'Akwa Ibom State',
    zone: 'South South',
    cost: 32000,
    clout: 5,
    sanity: 25,
    steeze: 7,
    attractions: [
      'Ibeno Sand Beach & Blue River',
      'Oron Museum & National Museum, Uyo',
      'Amalgamation House & Lord Lugard Residence',
      'Mbo Forest Game Reserve',
      'Slave Masters Lodge & Presbyterian Church, Itu',
      'Mary Slessor House Tomb & Royal Nigeria Boat Yard',
      'Sculptural Women Monument'
    ],
    highlight: 'Relax along the endless Atlantic sands of Ibeno Beach and visit historic Amalgamation House.'
  },
  {
    state: 'Anambra State',
    zone: 'South East',
    cost: 28000,
    clout: 5,
    sanity: 22,
    steeze: 6,
    attractions: [
      'Ogbunike Caves (UNESCO Nominee)',
      'Obu Ofo-Nri Museum',
      'Igbo-Ukwu Bronzes Heritage Site',
      'Okpu Ana Natural Spring, Ukpor',
      'Egbe Cham & Aluminum Pot Molding'
    ],
    highlight: 'Descend the sacred steps into Ogbunike Caves and marvel at 9th-century Igbo-Ukwu bronze craftsmanship.'
  },
  {
    state: 'Bauchi State',
    zone: 'North East',
    cost: 30000,
    clout: 5,
    sanity: 28,
    steeze: 6,
    attractions: [
      'Yankari National Park',
      'Wikki Warm Spring, Yankari',
      'Tunga Dutse Rock Engravings',
      'Marshall Caves',
      'Sumu Wildlife Park'
    ],
    highlight: 'Spot elephants on safari in Yankari National Park and swim in the crystal-clear 31°C waters of Wikki Warm Spring.'
  },
  {
    state: 'Bayelsa State',
    zone: 'South South',
    cost: 30000,
    clout: 4,
    sanity: 21,
    steeze: 5,
    attractions: [
      'Oloibiri Oil Museum (First Crude Oil Well)',
      'Ox-Bow Lake, Yenagoa & Kaiama Market',
      'Mungo Park Residence',
      'Akassa Slave Transit Camp, Tunnel & Wildlife Forest',
      'Okpoama Beach, Mangrove Creeks & Apoi Creek Forest'
    ],
    highlight: 'Visit Nigeria’s historic first oil well at Oloibiri and unwind by the scenic Ox-Bow Lake in Yenagoa.'
  },
  {
    state: 'Benue State',
    zone: 'North Central',
    cost: 22000,
    clout: 4,
    sanity: 20,
    steeze: 5,
    attractions: [
      'Ushongo Hills & Ikyogen Hills',
      'Montane Game Reserve',
      'Enemabia Warm Spring',
      'Ikwe Holiday Resort'
    ],
    highlight: 'Breathe the cool mountain air of Ushongo Hills and soak in the natural Enemabia Warm Spring.'
  },
  {
    state: 'Borno State',
    zone: 'North East',
    cost: 34000,
    clout: 5,
    sanity: 22,
    steeze: 6,
    attractions: [
      'Lake Chad & Lake Chad Sanctuary',
      'Chad Basin National Park & Lake Tilla',
      'Gwoza Hills & Jaffy Falls',
      'Rabeh’s Fort, Dikwa & Shehu of Borno Palace',
      'Borno State Museum, Sanda Kyarimi Park Zoo & Durbar Festivals'
    ],
    highlight: 'Witness the royal pageantry of the Shehu of Borno Palace Durbar and historic Rabeh’s Fort in Dikwa.'
  },
  {
    state: 'Cross River State',
    zone: 'South South',
    cost: 38000,
    clout: 6,
    sanity: 30,
    steeze: 8,
    attractions: [
      'Obudu Cattle Ranch (Obudu Mountain Resort) & Cable Car',
      'Cross River National Park & Afi Mountain Wildlife Sanctuary',
      'Agbokim Waterfalls & Kwa Falls',
      'Tinapa Business Resort & Calabar Museum',
      'Ikom Monoliths, Cercopan & Calabar Drill Monkey Ranch',
      'Duke Town Church, Mary Slessor Building, The Obong Palace & Calabar Cenotaph'
    ],
    highlight: 'Ride the sky-high Cable Car into the clouds at Obudu Mountain Resort and behold the seven-stream Agbokim Waterfalls.'
  },
  {
    state: 'Delta State',
    zone: 'South South',
    cost: 28000,
    clout: 4,
    sanity: 23,
    steeze: 6,
    attractions: [
      'Source of Ethiope River & Abraka Turf & Country Club',
      'Chief Nana’s Palace & Living History Museum, Koko',
      'Gordon River Resort Abraka, Jamieson River & Kwale Game Reserve',
      'Mungo Park House & Lander Brothers’ Anchorage, Asaba',
      'Asaba Beach, Bomadi Beach Party Resort & Escravos Beach',
      'Royal Palace Idumuje-Ugboko & Olona Ranch Resort'
    ],
    highlight: 'Kayak the ultra-clear waters of the Ethiope River at Abraka Turf & Country Club and tour Chief Nana’s Palace in Koko.'
  },
  {
    state: 'Ebonyi State',
    zone: 'South East',
    cost: 25000,
    clout: 4,
    sanity: 20,
    steeze: 5,
    attractions: [
      'Uburu / Okposi Salt Lake & Abakaliki Green Lake',
      'Unwana & Ndibe Golden Sand Beaches',
      'Amanchore Cave & Spectacular Natural Rock Formations, Akpoha',
      'Abakaliki Golf Course & Fati Abubakar Park',
      'Ogbodu Conical Mound & Slave Market Route, Ezza'
    ],
    highlight: 'Stroll the golden sands of Unwana & Ndibe Beaches and see the ancient Akpoha rock formations.'
  },
  {
    state: 'Edo State',
    zone: 'South South',
    cost: 28000,
    clout: 5,
    sanity: 22,
    steeze: 6,
    attractions: [
      'Okomu National Park & Ogba Zoo, Benin City',
      'Ososo Hills & Somorika Hills',
      'Ramat Park, Okada Wonderland & Udo Tourist Centre',
      'Sand Beaches of Agenebode, Amahor Waterside & Sokponba Holiday Resort',
      'Lampese Crocodile Lake & Afuze Sport Resort'
    ],
    highlight: 'Trek through the rainforest canopy of Okomu National Park and climb the scenic Ososo & Somorika Hills.'
  },
  {
    state: 'Ekiti State',
    zone: 'South West',
    cost: 26000,
    clout: 4,
    sanity: 25,
    steeze: 6,
    attractions: [
      'Ikogosi Warm & Cold Spring Confluence & Erinta Falls',
      'Orole Hills & Olosunta Hills, Ikere-Ekiti',
      'Ewi’s Palace & Fajuyi Memorial Park, Ado-Ekiti',
      'Ipole-Iloro Waterfall, Ero Dam & Lake, Egbigbu Artificial Lake',
      'Erin Ayonigba Sacred Fish River, Osun River Source & Esa Cave'
    ],
    highlight: 'Experience the world-famous wonder where warm and cold springs meet side-by-side at Ikogosi Warm Spring.'
  },
  {
    state: 'Enugu State',
    zone: 'South East',
    cost: 27000,
    clout: 5,
    sanity: 24,
    steeze: 6,
    attractions: [
      'Nike Lake Holiday Resort & Enugu Museum',
      'Awhum Waterfall & Cave Monastery',
      'Milliken Hill, Silicon Hill & Ugwueme/Udi Hills',
      'Ezeagu Tourist Complex, Opi Lake Complex, Iheneke, Ani Ozalla & Ogelube Lakes',
      'Mmanwu Masquerade Festival & African Princess Resort'
    ],
    highlight: 'Unwind lakeside at Nike Lake Resort, hike Milliken Hill, and stand beneath the cascading Awhum Waterfall.'
  },
  {
    state: 'Gombe State',
    zone: 'North East',
    cost: 26000,
    clout: 4,
    sanity: 20,
    steeze: 5,
    attractions: [
      'Tula Highland Hills',
      'Dadin Kowa Dam & Lake',
      'Buba Yero (Babayaro) Tomb',
      'Tangale Dome-Shaped Rock / Hill'
    ],
    highlight: 'Admire the dramatic Tangale Dome Peak and panoramic views from the Tula Highland Hills.'
  },
  {
    state: 'Imo State',
    zone: 'South East',
    cost: 27000,
    clout: 5,
    sanity: 22,
    steeze: 6,
    attractions: [
      'Oguta Lake Resort (Blue & Muddy River Confluence)',
      'Mbari Cultural & Art Centre, Owerri',
      'Nekede Botanical Gardens & Amusement Park, Owerri',
      'Assumpta Cathedral & Ada Palm Plantation Complex'
    ],
    highlight: 'Take a boat cruise to the mysterious confluence of Oguta Lake and Urashi River and explore Mbari Art Centre.'
  },
  {
    state: 'Jigawa State',
    zone: 'North West',
    cost: 25000,
    clout: 4,
    sanity: 21,
    steeze: 5,
    attractions: [
      'Hadejia-Nguru Wetlands & Bird Sanctuary',
      'Baturiya Birds Sanctuary',
      'Birnin Kudu Neolithic Rock Paintings'
    ],
    highlight: 'Watch thousands of migratory birds across the Hadejia-Nguru Wetlands and inspect ancient Birnin Kudu rock art.'
  },
  {
    state: 'Kaduna State',
    zone: 'North West',
    cost: 24000,
    clout: 5,
    sanity: 23,
    steeze: 7,
    attractions: [
      'Fifth Chukker Polo & Country Resort',
      'Kagoro Hills & Kamuku National Park',
      'Queen Amina of Zaria’s Kingdom Walls & Emir of Zazzau’s Palace',
      'Kaduna National Museum, Arewa House, Gamji Park & Jacaranda Pottery'
    ],
    highlight: 'Attend a royal polo tournament at Fifth Chukker Resort and walk the ancient Zaria City Walls of Queen Amina.'
  },
  {
    state: 'Kano State',
    zone: 'North West',
    cost: 28000,
    clout: 6,
    sanity: 24,
    steeze: 7,
    attractions: [
      'Ancient Kano City Gates & Walls & Kurmi Market (Since 15th Century)',
      'Kofar Mata Indigo Dyeing Pits (Founded 1498)',
      'Kano Royal Durbar Festival & Kano State History Museum (Gidan Makama)',
      'Bagauda Lake, Tiga Dam, Falgore Game Reserve & Kano Zoo',
      'Minjibir Weaving Centre & Dawakin Tofa Pottery'
    ],
    highlight: 'Experience the 500-year-old Kofar Mata Indigo Dyeing Pits, Kurmi Market, and the grand Kano Durbar.'
  },
  {
    state: 'Katsina State',
    zone: 'North West',
    cost: 26000,
    clout: 5,
    sanity: 20,
    steeze: 5,
    attractions: [
      'Gobarau Minaret (15th-Century Mud Tower)',
      'Katsina City Gate',
      'Emirs’ Palaces in Katsina & Daura (Kusugu Well)',
      'Jibia Holiday Resort'
    ],
    highlight: 'Marvel at the 500-year-old Gobarau Minaret and visit the historic Royal Palaces of Katsina and Daura.'
  },
  {
    state: 'Kebbi State',
    zone: 'North West',
    cost: 30000,
    clout: 5,
    sanity: 23,
    steeze: 6,
    attractions: [
      'Argungu International Fishing & Cultural Festival',
      'Kanta Museum, Argungu',
      'Girmache Shrine, Zuru',
      'Tomb of Abdullahi Fodio, Gwandu'
    ],
    highlight: 'Join thousands of fishermen diving with gourds at the world-famous Argungu International Fishing Festival.'
  },
  {
    state: 'Kogi State',
    zone: 'North Central',
    cost: 19000,
    clout: 4,
    sanity: 21,
    steeze: 5,
    attractions: [
      'Confluence of River Niger & River Benue, Lokoja',
      'Mount Patti & Lord Lugard’s First Residence in Nigeria',
      'Iron of Liberty, World War Cenotaph & European Colonial Cemeteries',
      'Inikpi Statue, Idah'
    ],
    highlight: 'Stand atop Mount Patti in Lokoja overlooking the meeting point of River Niger and River Benue.'
  },
  {
    state: 'Kwara State',
    zone: 'North Central',
    cost: 24000,
    clout: 4,
    sanity: 23,
    steeze: 5,
    attractions: [
      'Owu Waterfalls (Highest Waterfall in West Africa)',
      'Esie Soapstone Images Museum',
      'Awon Mass Wedding Festival, Shao',
      'Egungun Festival'
    ],
    highlight: 'Feel the cool mist of the 120-meter Owu Waterfalls and inspect the mysterious Esie Soapstone Figures.'
  },
  {
    state: 'Niger State',
    zone: 'North Central',
    cost: 18000,
    clout: 4,
    sanity: 24,
    steeze: 5,
    attractions: [
      'Gurara Waterfalls',
      'Zuma Rock (The Gateway Monolith)',
      'Kainji Lake National Park',
      'Bida Brass & Glasswork Town'
    ],
    highlight: 'Picnic beside the thundering Gurara Waterfalls just outside Abuja and shop hand-forged Bida brassware.'
  },
  {
    state: 'Ogun State',
    zone: 'South West',
    cost: 25000,
    clout: 5,
    sanity: 23,
    steeze: 6,
    attractions: [
      'Olumo Rock, Abeokuta',
      'Alake of Egbaland Royal Palace & St. Peter’s Cathedral (First Church in Nigeria)',
      'Kemta Kampala Adire Tie-Dye Market'
    ],
    highlight: 'Ascend historic Olumo Rock in Abeokuta and shop authentic Adire fabrics at Kemta Market.'
  },
  {
    state: 'Ondo State',
    zone: 'South West',
    cost: 27000,
    clout: 5,
    sanity: 25,
    steeze: 6,
    attractions: [
      'Idanre Hills (680 Ancient Steps)',
      'Deji of Akure Royal Palace & Egungun Masquerade Festival',
      'Iho Eleru Cave Ashes (Isharun)',
      'Ebomi Lake Tourist Centre & Igbokoda Waterfront'
    ],
    highlight: 'Climb the 680 steps into the misty ancient hilltop civilization of Idanre Hills.'
  },
  {
    state: 'Osun State',
    zone: 'South West',
    cost: 26000,
    clout: 5,
    sanity: 25,
    steeze: 7,
    attractions: [
      'Osun-Osogbo Sacred Grove & Shrine (UNESCO World Heritage Site)',
      'Osun Cultural Festival & Ataoja Royal Palace',
      'Suzanne Wenger’s House, Nike Centre for Arts & Genesis Gallery, Osogbo',
      'Museum of Arts, African Heritage Gallery & Osogbo Metal Works'
    ],
    highlight: 'Walk among the sacred sculptures of the UNESCO-listed Osun-Osogbo Sacred Grove and Nike Art Centre.'
  },
  {
    state: 'Oyo State',
    zone: 'South West',
    cost: 25000,
    clout: 5,
    sanity: 23,
    steeze: 6,
    attractions: [
      'Cocoa House (First Skyscraper in West Africa) & Mapo Hall, Ibadan',
      'University of Ibadan Zoological & Botanical Gardens, Agodi Gardens',
      'Ibadan Trans Amusement Park, NTA Ibadan (First TV Station in Africa) & National Museum of Unity',
      'Old Oyo National Park & Alaafin’s Palace, Oyo'
    ],
    highlight: 'View Ibadan’s iconic brown rooftops from Mapo Hill & Cocoa House and relax in Agodi Gardens.'
  },
  {
    state: 'Plateau State',
    zone: 'North Central',
    cost: 25000,
    clout: 5,
    sanity: 27,
    steeze: 6,
    attractions: [
      'Shere Hills, Riyom Rock Formation & Kurang Volcanic Mountain',
      'Assop Waterfalls & Kura Waterfalls',
      'Jos Wildlife Park, Jos Zoo & Pandam Game Reserve & Lake',
      'Jos Museum, Museum of Traditional Nigerian Architecture (MOTNA), Mando Village & Panyam Fish Farm'
    ],
    highlight: 'Enjoy the cool temperate climate of Jos, photograph balancing Riyom Rock, and hike the Shere Hills.'
  },
  {
    state: 'Rivers State',
    zone: 'South South',
    cost: 32000,
    clout: 5,
    sanity: 24,
    steeze: 7,
    attractions: [
      'Finima Beach & Finima Nature Park, Bonny Island',
      'Statue of King Jaja of Opobo, Bonny/Opobo',
      'Port Harcourt Tourist Beach, Isaac Boro Park & Isaka Holiday Resort',
      'Port Harcourt Cultural Centre, Zoo, Upper Orashi & Biseni Forest Reserves'
    ],
    highlight: 'Sail to Bonny Island’s Finima Nature Park and unwind at the Port Harcourt Tourist Beach.'
  },
  {
    state: 'Sokoto State',
    zone: 'North West',
    cost: 30000,
    clout: 6,
    sanity: 22,
    steeze: 6,
    attractions: [
      'Sultan’s Palace, Sokoto',
      'Hubbaren Shehu (Tomb of Sheikh Usman Dan Fodio)',
      'Waziri Junaidu History & Culture Bureau & Sokoto Museum',
      'Gilbadi Rock Formation'
    ],
    highlight: 'Pay homage at the historic Sultan’s Palace and explore the Sokoto Caliphate archives.'
  },
  {
    state: 'Taraba State',
    zone: 'North East',
    cost: 36000,
    clout: 6,
    sanity: 30,
    steeze: 7,
    attractions: [
      'The Mambilla Plateau (Highland Tea Estates)',
      'Gashaka-Gumti National Park (Nigeria’s Largest National Park)',
      'Barup Waterfalls',
      'Marmara Crocodile Pond & Akwana Salt Village'
    ],
    highlight: 'Ascend to the misty green tea plantations of the Mambilla Plateau and trek Gashaka-Gumti National Park.'
  },
  {
    state: 'Yobe State',
    zone: 'North East',
    cost: 28000,
    clout: 4,
    sanity: 20,
    steeze: 5,
    attractions: [
      'Dufuna Canoe Site (8,000-Year-Old Ancient Boat — Oldest in Africa)',
      'Hadejia-Nguru Wetland & Bird Sanctuary',
      'Gujba Forest Reserve & Damaturu Monument'
    ],
    highlight: 'See the archaeological site of the 8,000-year-old Dufuna Canoe — Africa’s oldest discovered watercraft.'
  },
  {
    state: 'Zamfara State',
    zone: 'North West',
    cost: 26000,
    clout: 4,
    sanity: 20,
    steeze: 5,
    attractions: [
      'Kwatarkwashi Rock & Water Spring (Kwata Kwash)',
      'Kalale Hippopotamus Pond, Dan Gulbi',
      'Kanoma Hills, Kanoma'
    ],
    highlight: 'Marvel at the towering granite inselbergs of Kwatarkwashi Rock and spot hippos at Dan Gulbi.'
  }
];
