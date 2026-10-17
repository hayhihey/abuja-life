// ============================================================================
// ABUJA LIFE: NIGERIAN GENERAL ELECTIONS, POLITICAL PARTIES & RALLIES
// APC, PDP, LP, SDP, Eagles Square Mega Rallies & Campaign Street Parties
// ============================================================================

export const POLITICAL_PARTIES = [
  {
    id: 'apc',
    name: 'All Progressives Congress (APC)',
    acronym: 'APC',
    slogan: 'Progress & Renewed Hope',
    symbol: '🧹 Broom',
    colorHex: '#16a34a',
    bgBadge: 'rgba(22, 163, 74, 0.2)',
    textColor: '#4ade80',
    headquarters: 'Blantyre Street, Wuse 2, Abuja',
    ideology: 'Ruling Coalition • Federal Bureaucracy & Infrastructure Projects',
    rallyAdvantage: 'High Federal Contract Access & Security Protocol',
    themeSong: 'Asiwaju Gbedu'
  },
  {
    id: 'pdp',
    name: 'Peoples Democratic Party (PDP)',
    acronym: 'PDP',
    slogan: 'Power to the People!',
    symbol: '☂️ Umbrella',
    colorHex: '#dc2626',
    bgBadge: 'rgba(220, 38, 38, 0.2)',
    textColor: '#f87171',
    headquarters: 'Wadata Plaza, Wuse Zone 5, Abuja',
    ideology: 'Traditional Establishment • Private Concessions & State Governors',
    rallyAdvantage: 'Extensive Chieftaincy & Grassroots Godfather Network',
    themeSong: 'Power Flowing Owambe'
  },
  {
    id: 'lp',
    name: 'Labour Party (LP)',
    acronym: 'LP',
    slogan: 'Forward Ever, Backward Never!',
    symbol: '👨‍👩‍👧 Family & Wheels',
    colorHex: '#ea580c',
    bgBadge: 'rgba(234, 88, 12, 0.2)',
    textColor: '#fb923c',
    headquarters: 'Utako Commercial District, Abuja',
    ideology: 'Youth Vanguard • Tech Innovators, Civil Servants & Transparency',
    rallyAdvantage: 'High Youth Engagement, Viral Social Steeze & Digital Clout',
    themeSong: 'Obidient Anthem Amapiano'
  },
  {
    id: 'sdp',
    name: 'Social Democratic Party (SDP)',
    acronym: 'SDP',
    slogan: 'Progress, Unity and Justice',
    symbol: '🐴 White Stallion Horse',
    colorHex: '#0284c7',
    bgBadge: 'rgba(2, 132, 199, 0.2)',
    textColor: '#38bdf8',
    headquarters: 'Central Business District, Abuja',
    ideology: 'Centrist Reformers • Judicial Independence & Technocrats',
    rallyAdvantage: 'Balanced Moderate Clout & Legal Support',
    themeSong: 'Stallion Victory Beat'
  }
];

export const ELECTIVE_OFFICES = [
  {
    id: 'councillor',
    title: 'FCT Area Council Representative',
    level: 1,
    minClout: 25,
    campaignFundReq: 250000,
    dailySalary: 65000,
    perks: 'Exempt from local district checkpoint tolls. +10 Daily Clout.'
  },
  {
    id: 'chairman',
    title: 'Abuja Municipal Area Council (AMAC) Chairman',
    level: 2,
    minClout: 50,
    campaignFundReq: 1200000,
    dailySalary: 220000,
    perks: 'Controls AMAC land allocations, revenue checkpoints, and VIP security.'
  },
  {
    id: 'senator',
    title: 'Distinguished Senator Representing FCT Abuja',
    level: 3,
    minClout: 85,
    campaignFundReq: 5000000,
    dailySalary: 650000,
    perks: 'National Assembly red chamber seat, diplomatic passport, federal siren convoy escort.'
  }
];

export const RALLY_VENUES = [
  {
    id: 'eagles_square',
    name: 'Eagles Square Parade Grounds',
    district: 'cbd',
    capacity: 25000,
    desc: 'The national epicenter for political inaugurations, party congresses, and thunderous speeches.'
  },
  {
    id: 'millennium_park_grounds',
    name: 'Millennium Park Great Lawn',
    district: 'maitama',
    capacity: 15000,
    desc: 'Open-air youth rally and live Afrobeats campaign concerts under the trees.'
  },
  {
    id: 'old_parade_ground',
    name: 'Old Parade Ground Stadium, Garki',
    district: 'garki',
    capacity: 20000,
    desc: 'Historic stadium filled with brass bands, masquerades, and cheering grassroots voters.'
  }
];
