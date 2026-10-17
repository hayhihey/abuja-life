// ============================================================================
// ABUJA LIFE: MULTIPLAYER MEGA-HOUSING & RESIDENTIAL COMPLEXES
// Accommodating Thousands of Online Players in Abuja Estates & High-Rise Towers
// ============================================================================

export const MEGA_ESTATES = [
  {
    id: 'aso_rock_towers',
    name: 'Aso Rock Panoramic Luxury High-Rise Towers',
    district: 'cbd',
    type: 'High-Rise Residential Skyscraper',
    totalUnits: 500,
    icon: '🏙️',
    amenities: [
      '24/7 Automated Dual 1000kVA Cummins Generators (Zero NEPA Outages)',
      'Underground Secure Multi-Level Parking Garage',
      'Rooftop Infinity Swimming Pool & Sky Lounge',
      'Private High-Speed Fiber Internet & Intercom',
      'MOPOL Armed Security Checkpoint & Access Card Turnstiles'
    ],
    units: [
      { id: 'aso_studio', title: 'Studio Executive Suite', rentMonthly: 850000, buyPrice: 45000000, maxOccupants: 2, comfortBuff: 25 },
      { id: 'aso_2bed', title: '2-Bedroom Luxury Penthouse View', rentMonthly: 1750000, buyPrice: 95000000, maxOccupants: 4, comfortBuff: 45 },
      { id: 'aso_penthouse', title: 'Diplomatic Presidential Penthouse', rentMonthly: 4500000, buyPrice: 280000000, maxOccupants: 8, comfortBuff: 70 }
    ]
  },
  {
    id: 'gwarinpa_mega_estate',
    name: 'Gwarinpa Phase 2 Federal Mega-Estate',
    district: 'gwarinpa',
    type: 'Gated Residential Community Estate',
    totalUnits: 1200,
    icon: '🏘️',
    amenities: [
      'Estate Borehole Submersible Water Plant & Massive Overhead Reservoir',
      'Gated Security Boom Barrier with Armed Estate Guards',
      'Children Playground & Neighborhood Suya Strip',
      'Estate Electric Transformer with Dedicated Phase Stabilizer'
    ],
    units: [
      { id: 'gwarinpa_1bed', title: '1-Bedroom Room & Parlour (Self-Contain)', rentMonthly: 180000, buyPrice: 16000000, maxOccupants: 2, comfortBuff: 15 },
      { id: 'gwarinpa_3bed', title: '3-Bedroom Wing of Semi-Detached Duplex', rentMonthly: 450000, buyPrice: 42000000, maxOccupants: 5, comfortBuff: 35 },
      { id: 'gwarinpa_detached', title: '4-Bedroom Fully Detached Compound House', rentMonthly: 850000, buyPrice: 75000000, maxOccupants: 7, comfortBuff: 50 }
    ]
  },
  {
    id: 'wuse_palms_suites',
    name: 'Wuse 2 Royal Palms Commercial & Residential Suites',
    district: 'wuse2',
    type: 'Boutique Serviced Apartments',
    totalUnits: 350,
    icon: '🌴',
    amenities: [
      'Walking Distance to Banex Plaza, Wuse 2 Lounges & Cafes',
      '24/7 Solar Inverter System with Lithium Battery Bank',
      'On-site Laundry, Gym & Shawarma Grill Terrace',
      'CCTV Surveillance Network'
    ],
    units: [
      { id: 'wuse_compact', title: 'Executive Serviced Studio', rentMonthly: 380000, buyPrice: 32000000, maxOccupants: 2, comfortBuff: 25 },
      { id: 'wuse_2bed_deluxe', title: '2-Bedroom Luxury Serviced Flat', rentMonthly: 780000, buyPrice: 68000000, maxOccupants: 4, comfortBuff: 40 }
    ]
  },
  {
    id: 'kubwa_campus_village',
    name: 'Kubwa Corpers, Students & Youth Village',
    district: 'kubwa',
    type: 'Student & Creative Hub Community',
    totalUnits: 800,
    icon: '🎓',
    amenities: [
      'Affordable Community Living for University Students & NYSC Corpers',
      'Shared Generator Fuel Cooperative (7pm to 12am Nightly Power)',
      'Community Borehole Standpipe & Football Field',
      'Express Train Shuttle Station Nearby'
    ],
    units: [
      { id: 'kubwa_shared', title: 'Student Shared Double Room', rentMonthly: 35000, buyPrice: 3500000, maxOccupants: 2, comfortBuff: 8 },
      { id: 'kubwa_studio', title: 'Single Youth Self-Contain', rentMonthly: 65000, buyPrice: 6500000, maxOccupants: 2, comfortBuff: 14 }
    ]
  }
];

export const HOUSING_UNIT_BY_ID = {};
for (const est of MEGA_ESTATES) {
  for (const u of est.units) {
    HOUSING_UNIT_BY_ID[u.id] = { ...u, estateId: est.id, estateName: est.name, district: est.district };
  }
}
