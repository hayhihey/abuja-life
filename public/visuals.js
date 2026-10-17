// ============================================================================
// ABUJA LIFE — VISUAL ARTWORK, REALISTIC NAIRA BANKNOTES & GTA ILLUSTRATION ENGINE
// ============================================================================
// Generates high-DPI SVG artwork & data URIs for:
// 1. Authentic-looking Nigerian Naira (₦) banknotes (₦1000, ₦500, ₦200, ₦100)
//    with CBN crests, security threads, watermark portraits, serial numbers,
//    Zuma Rock / Eagle motifs, and physical cash bundle stacks.
// 2. GTA-style stylized vector illustrations for all 13 Abuja districts & landmarks.
// 3. GTA-style character avatars for career tracks & FCT contacts.
// ============================================================================

/**
 * Format Naira cleanly with symbol and optional compact k/M
 */
export function formatNairaFull(amount) {
  const n = Math.round(Number(amount) || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}₦${Math.abs(n).toLocaleString('en-NG')}`;
}

/**
 * Break a Naira amount into physical CBN banknote bundles and loose notes
 */
export function breakdownNairaNotes(amount) {
  const abs = Math.max(0, Math.floor(Number(amount) || 0));
  const n1000 = Math.floor(abs / 1000);
  const rem1000 = abs % 1000;
  const n500 = Math.floor(rem1000 / 500);
  const rem500 = rem1000 % 500;
  const n200 = Math.floor(rem500 / 200);
  const n100 = Math.floor((rem500 % 200) / 100);

  // Standard CBN bank strap = 100 notes (₦100,000 for ₦1,000 strap)
  const bundles100k = Math.floor(n1000 / 100);
  const loose1000 = n1000 % 100;

  return {
    total: abs,
    bundles100k,
    n1000,
    loose1000,
    n500,
    n200,
    n100
  };
}

/**
 * Render an authentic-looking Nigerian Naira banknote SVG (1000, 500, 200, 100)
 */
export function renderNairaNoteSVG(denom = 1000, opts = {}) {
  const themes = {
    1000: {
      denom: '1000',
      words: 'ONE THOUSAND NAIRA',
      bg1: '#1a3850',
      bg2: '#2d5c7f',
      bg3: '#0f2335',
      accent: '#eab308',
      guilloche: '#60a5fa',
      foil: '#fde047',
      serialPrefix: 'ABJ-94',
      landmark: 'CBN HEADQUARTERS • ABUJA',
      portraitLabel: 'ALVAN IKOKU & A. MAI-BORNU'
    },
    500: {
      denom: '500',
      words: 'FIVE HUNDRED NAIRA',
      bg1: '#3b2149',
      bg2: '#6b3b82',
      bg3: '#24122e',
      accent: '#f59e0b',
      guilloche: '#c084fc',
      foil: '#fcd34d',
      serialPrefix: 'FCT-52',
      landmark: 'OFFSHORE RIG & TRADE',
      portraitLabel: 'DR. NNAMDI AZIKIWE'
    },
    200: {
      denom: '200',
      words: 'TWO HUNDRED NAIRA',
      bg1: '#134e3a',
      bg2: '#1f7a5c',
      bg3: '#092e22',
      accent: '#fbbf24',
      guilloche: '#34d399',
      foil: '#fde68a',
      serialPrefix: 'Mait-21',
      landmark: 'AGRICULTURAL PYRAMID',
      portraitLabel: 'SIR AHMADU BELLO'
    },
    100: {
      denom: '100',
      words: 'ONE HUNDRED NAIRA',
      bg1: '#522823',
      bg2: '#8a443c',
      bg3: '#331613',
      accent: '#38bdf8',
      guilloche: '#fb7185',
      foil: '#fef08a',
      serialPrefix: 'WUS-10',
      landmark: 'ZUMA ROCK • FCT GATEWAY',
      portraitLabel: 'CHIEF OBAFEMI AWOLOWO'
    }
  };

  const t = themes[denom] || themes[1000];
  const serial = opts.serial || `${t.serialPrefix}882104`;
  const width = opts.width || 280;
  const height = opts.height || 132;
  const uid = `naira_${denom}_${Math.random().toString(36).slice(2, 7)}`;

  return `
  <svg class="naira-note-svg denom-${denom}" viewBox="0 0 320 150" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${uid}_bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${t.bg1}"/>
        <stop offset="52%" stop-color="${t.bg2}"/>
        <stop offset="100%" stop-color="${t.bg3}"/>
      </linearGradient>
      <linearGradient id="${uid}_foil" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fff7ed"/>
        <stop offset="25%" stop-color="${t.foil}"/>
        <stop offset="50%" stop-color="#ca8a04"/>
        <stop offset="75%" stop-color="${t.foil}"/>
        <stop offset="100%" stop-color="#854d0e"/>
      </linearGradient>
      <pattern id="${uid}_grid" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M 8 0 L 0 8 M 0 0 L 8 8" stroke="${t.guilloche}" stroke-width="0.35" stroke-opacity="0.22"/>
      </pattern>
      <radialGradient id="${uid}_seal" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${t.bg3}" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Outer linen paper border -->
    <rect x="2" y="2" width="316" height="146" rx="8" fill="#f3EFE6" stroke="#d6cfc2" stroke-width="1.5"/>
    <!-- Inner printed currency face -->
    <rect x="7" y="7" width="306" height="136" rx="5" fill="url(#${uid}_bg)"/>
    <rect x="7" y="7" width="306" height="136" rx="5" fill="url(#${uid}_grid)"/>

    <!-- Intricate Guilloche Waves -->
    <path d="M 7 95 Q 85 60 160 95 T 313 90" fill="none" stroke="${t.guilloche}" stroke-width="1.2" stroke-opacity="0.35"/>
    <path d="M 7 103 Q 85 68 160 103 T 313 98" fill="none" stroke="${t.accent}" stroke-width="0.9" stroke-opacity="0.3"/>
    <path d="M 7 45 Q 110 80 210 40 T 313 50" fill="none" stroke="${t.guilloche}" stroke-width="0.8" stroke-opacity="0.25"/>

    <!-- Ornate Inner Frame -->
    <rect x="12" y="12" width="296" height="126" rx="3" fill="none" stroke="${t.accent}" stroke-width="1" stroke-opacity="0.55" stroke-dasharray="6 2"/>

    <!-- Holographic Windowed Security Thread -->
    <rect x="222" y="7" width="9" height="136" fill="#0f172a" fill-opacity="0.45"/>
    <rect x="223.5" y="12" width="6" height="18" fill="url(#${uid}_foil)" rx="1"/>
    <rect x="223.5" y="42" width="6" height="18" fill="url(#${uid}_foil)" rx="1"/>
    <rect x="223.5" y="72" width="6" height="18" fill="url(#${uid}_foil)" rx="1"/>
    <rect x="223.5" y="102" width="6" height="18" fill="url(#${uid}_foil)" rx="1"/>
    <text x="226.5" y="24" font-size="4.5" font-family="monospace" font-weight="900" fill="#1e293b" text-anchor="middle">CBN</text>
    <text x="226.5" y="54" font-size="4.5" font-family="monospace" font-weight="900" fill="#1e293b" text-anchor="middle">₦</text>
    <text x="226.5" y="84" font-size="4.5" font-family="monospace" font-weight="900" fill="#1e293b" text-anchor="middle">CBN</text>

    <!-- Portrait Medallion & Statesman Silhouette (Left) -->
    <circle cx="64" cy="78" r="42" fill="url(#${uid}_seal)" stroke="${t.accent}" stroke-width="1" stroke-opacity="0.5"/>
    <circle cx="64" cy="78" r="35" fill="#0b1520" fill-opacity="0.55" stroke="${t.guilloche}" stroke-width="0.8" stroke-dasharray="2 2"/>
    <!-- Statesman Bust Vector -->
    <path d="M 42 108 C 42 90, 86 90, 86 108 Z" fill="${t.guilloche}" fill-opacity="0.45" stroke="#f8fafc" stroke-width="0.8"/>
    <circle cx="64" cy="70" r="13" fill="${t.guilloche}" fill-opacity="0.5" stroke="#f8fafc" stroke-width="0.8"/>
    <!-- Traditional Cap -->
    <path d="M 50 64 L 54 51 L 75 53 L 78 64 Z" fill="${t.accent}" fill-opacity="0.75" stroke="#fef08a" stroke-width="0.7"/>
    <text x="64" y="128" font-size="5" font-family="sans-serif" letter-spacing="0.5" fill="#e2e8f0" opacity="0.8" text-anchor="middle">${t.portraitLabel}</text>

    <!-- Central Bank of Nigeria Header & Eagle Crest -->
    <g transform="translate(105, 16)">
      <!-- Coat of Arms Eagle Silhouette -->
      <path d="M 8 10 L 14 4 L 18 8 L 22 4 L 28 10 L 20 14 L 16 14 Z" fill="${t.foil}"/>
      <rect x="13" y="13" width="10" height="9" rx="2" fill="#10b981" stroke="#f8fafc" stroke-width="0.7"/>
      <path d="M 13 17 L 18 20 L 23 17" fill="none" stroke="#ffffff" stroke-width="1.2"/>
      <text x="34" y="12" font-size="9.2" font-family="Georgia, serif" font-weight="900" fill="#ffffff" letter-spacing="0.9">CENTRAL BANK</text>
      <text x="34" y="22" font-size="8.2" font-family="Georgia, serif" font-weight="700" fill="${t.foil}" letter-spacing="1.4">OF NIGERIA</text>
    </g>

    <!-- Central Landmark Watermark (Zuma Rock / CBN Tower) -->
    <g transform="translate(116, 52)" opacity="0.88">
      <path d="M 8 46 L 22 14 L 38 8 L 54 16 L 66 46 Z" fill="${t.bg3}" fill-opacity="0.6" stroke="${t.guilloche}" stroke-width="1"/>
      <rect x="28" y="16" width="18" height="30" fill="${t.accent}" fill-opacity="0.3" stroke="${t.foil}" stroke-width="0.8"/>
      <line x1="33" y1="16" x2="33" y2="46" stroke="${t.foil}" stroke-width="0.5" opacity="0.6"/>
      <line x1="41" y1="16" x2="41" y2="46" stroke="${t.foil}" stroke-width="0.5" opacity="0.6"/>
      <text x="37" y="56" font-size="5" font-family="monospace" fill="#cbd5e1" text-anchor="middle">${t.landmark}</text>
    </g>

    <!-- Top-Left Denomination -->
    <text x="20" y="34" font-size="19" font-family="Impact, 'Arial Black', sans-serif" font-weight="900" fill="#ffffff" stroke="${t.bg3}" stroke-width="0.8">₦${t.denom}</text>

    <!-- Bottom-Right Big Metallic Denomination -->
    <text x="298" y="124" font-size="28" font-family="Impact, 'Arial Black', sans-serif" font-weight="900" fill="url(#${uid}_foil)" stroke="#0f172a" stroke-width="1" text-anchor="end">₦${t.denom}</text>
    <text x="297" y="134" font-size="6.2" font-family="sans-serif" font-weight="800" fill="#f8fafc" letter-spacing="0.8" text-anchor="end">${t.words}</text>

    <!-- Serial Numbers (Top-Right & Bottom-Left Vertical/Horizontal) -->
    <text x="296" y="28" font-size="8.5" font-family="'Courier New', monospace" font-weight="700" fill="#fca5a5" letter-spacing="1" text-anchor="end">${serial}</text>
    <text x="115" y="132" font-size="8" font-family="'Courier New', monospace" font-weight="700" fill="#f8fafc" letter-spacing="1">${serial}</text>

    <!-- Holographic Gold Foil Patch (Right Side) -->
    <polygon points="256,46 274,38 292,46 292,68 274,78 256,68" fill="url(#${uid}_foil)" fill-opacity="0.85" stroke="#ffffff" stroke-width="0.7"/>
    <text x="274" y="62" font-size="11" font-family="Georgia, serif" font-weight="900" fill="#0f172a" text-anchor="middle">₦</text>
  </svg>`;
}

/**
 * Generate a rich SVG illustration for each Abuja district or landmark
 * Styled with GTA V / Vice-to-Abuja loading screen vector aesthetics
 */
export function renderDistrictIllustrationSVG(districtId) {
  const scenes = {
    maitama: {
      title: 'MAITAMA DISTRICT',
      subtitle: 'MINISTERIAL HILL • EMBASSY ROW',
      skyTop: '#0f172a',
      skyBot: '#f59e0b',
      sunColor: '#fde047',
      accent: '#10b981',
      silhouette: 'mansion_palms'
    },
    asokoro: {
      title: 'ASOKORO VILLA PRECINCT',
      subtitle: 'ASO ROCK FORTRESS • STATE HOUSE GATE',
      skyTop: '#1e1b4b',
      skyBot: '#fb7185',
      sunColor: '#fef08a',
      accent: '#f43f5e',
      silhouette: 'aso_rock'
    },
    wuse2: {
      title: 'WUSE 2 • ADETOKUNBO ADEMOLA',
      subtitle: 'VIP LOUNGES • SHAWARMA & V12 EXOTICS',
      skyTop: '#090d16',
      skyBot: '#ec4899',
      sunColor: '#38bdf8',
      accent: '#f43f5e',
      silhouette: 'neon_nightlife'
    },
    cbd: {
      title: 'CENTRAL BUSINESS DISTRICT',
      subtitle: 'NNPC TOWERS • CBN HQ • NATIONAL MOSQUE',
      skyTop: '#0c4a6e',
      skyBot: '#eab308',
      sunColor: '#fef9c3',
      accent: '#eab308',
      silhouette: 'cbd_skyline'
    },
    garki: {
      title: 'GARKI AREA 1 TO 11',
      subtitle: 'FEDERAL SECRETARIAT • OLD PARADE GROUND',
      skyTop: '#1e293b',
      skyBot: '#38bdf8',
      sunColor: '#fde047',
      accent: '#60a5fa',
      silhouette: 'secretariat'
    },
    jabi: {
      title: 'JABI LAKE WATERFRONT',
      subtitle: 'BOAT CLUB • MALL • TECH HUBS',
      skyTop: '#064e3b',
      skyBot: '#2dd4bf',
      sunColor: '#fde047',
      accent: '#34d399',
      silhouette: 'jabi_lake'
    },
    utako: {
      title: 'UTAKO MOTOR PARK & MARKET',
      subtitle: 'INTERSTATE TERMINALS • LOGISTICS YARDS',
      skyTop: '#31102f',
      skyBot: '#f97316',
      sunColor: '#fed7aa',
      accent: '#fb923c',
      silhouette: 'transport_hub'
    },
    guzape: {
      title: 'GUZAPE HILLS',
      subtitle: 'TERRACED CLIFF MANSIONS • PANORAMIC FCT VIEW',
      skyTop: '#1e1b4b',
      skyBot: '#a855f7',
      sunColor: '#fde047',
      accent: '#c084fc',
      silhouette: 'hill_villas'
    },
    lugbe: {
      title: 'LUGBE • AIRPORT ROAD CORRIDOR',
      subtitle: 'CITY GATE • ESTATE CLUSTERS • CHECKPOINTS',
      skyTop: '#3f2e1e',
      skyBot: '#f59e0b',
      sunColor: '#fef08a',
      accent: '#fbbf24',
      silhouette: 'city_gate'
    },
    kubwa: {
      title: 'KUBWA SATELLITE TOWN',
      subtitle: 'METRO RAIL STATION • GADO NASKO ROAD',
      skyTop: '#0f172a',
      skyBot: '#22c55e',
      sunColor: '#bbf7d0',
      accent: '#4ade80',
      silhouette: 'metro_rail'
    },
    nyanya: {
      title: 'NYANYA / MARARABA BORDER',
      subtitle: 'KEFFI EXPRESSWAY CHOKEPOINT • OKADA SWARMS',
      skyTop: '#450a0a',
      skyBot: '#ea580c',
      sunColor: '#fca5a5',
      accent: '#f87171',
      silhouette: 'expressway_jam'
    },
    mpape: {
      title: 'MPAPE CRUSH ROCK',
      subtitle: 'BLUE QUARRY LAKE • CLIFFSIDE TIN ROOFS',
      skyTop: '#164e63',
      skyBot: '#f97316',
      sunColor: '#fde047',
      accent: '#22d3ee',
      silhouette: 'quarry_cliff'
    },
    dawaki: {
      title: 'DAWAKI HILLSIDE ESTATES',
      subtitle: 'KUBWA EXPRESSWAY OVERLOOK • BOREHOLE TANKS',
      skyTop: '#1e293b',
      skyBot: '#10b981',
      sunColor: '#fde047',
      accent: '#34d399',
      silhouette: 'hill_villas'
    },
    lagos_island: {
      title: 'LAGOS ISLAND • LEKKI & VI',
      subtitle: 'LEKKI-IKOYI BRIDGE • EKO ATLANTIC • BANANA ISLAND',
      skyTop: '#0c4a6e',
      skyBot: '#ec4899',
      sunColor: '#fde047',
      accent: '#38bdf8',
      silhouette: 'jabi_lake'
    },
    lagos_mainland: {
      title: 'LAGOS MAINLAND • OSHODI & IKEJA',
      subtitle: 'YELLOW DANFO PARKS • BABA ALAYE • COMPUTER VILLAGE',
      skyTop: '#451a03',
      skyBot: '#eab308',
      sunColor: '#f97316',
      accent: '#facc15',
      silhouette: 'expressway_jam'
    }
  };

  const s = scenes[districtId] || scenes.cbd;
  const uid = `scn_${districtId}_${Math.random().toString(36).slice(2, 6)}`;

  let foregroundArt = '';
  if (s.silhouette === 'cbd_skyline') {
    foregroundArt = `
      <!-- Aso Rock Distant -->
      <path d="M 280 150 Q 350 45 430 150 Z" fill="#0f172a" opacity="0.65"/>
      <!-- National Mosque Golden Dome & Minarets -->
      <rect x="38" y="62" width="6" height="88" fill="#1e293b"/>
      <rect x="116" y="62" width="6" height="88" fill="#1e293b"/>
      <path d="M 52 130 Q 80 72 108 130 Z" fill="#eab308"/>
      <!-- Four NNPC Towers -->
      <rect x="150" y="52" width="22" height="98" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
      <rect x="178" y="46" width="22" height="104" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
      <rect x="206" y="54" width="22" height="96" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
      <rect x="234" y="60" width="22" height="90" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
      <!-- CBN Glass HQ -->
      <polygon points="280,150 288,42 335,55 342,150" fill="#0284c7" fill-opacity="0.7" stroke="#fde047" stroke-width="1"/>
    `;
  } else if (s.silhouette === 'neon_nightlife') {
    foregroundArt = `
      <!-- Neon Lounges & Palm Trees -->
      <rect x="25" y="74" width="85" height="76" rx="4" fill="#090d16" stroke="#ec4899" stroke-width="1.5"/>
      <text x="67" y="98" font-size="11" font-family="Impact, sans-serif" fill="#f43f5e" text-anchor="middle" letter-spacing="1.5">HUSTLE &amp; VIBE</text>
      <rect x="135" y="58" width="95" height="92" rx="4" fill="#090d16" stroke="#38bdf8" stroke-width="1.5"/>
      <text x="182" y="84" font-size="10" font-family="Impact, sans-serif" fill="#38bdf8" text-anchor="middle" letter-spacing="1">CLUB TRANSCORP</text>
      <!-- Luxury G-Wagon Silhouette -->
      <rect x="250" y="112" width="95" height="28" rx="4" fill="#111827" stroke="#eab308" stroke-width="1.2"/>
      <rect x="262" y="95" width="60" height="20" rx="2" fill="#1f2937" stroke="#eab308" stroke-width="1"/>
      <circle cx="272" cy="142" r="9" fill="#000" stroke="#fde047" stroke-width="2"/>
      <circle cx="324" cy="142" r="9" fill="#000" stroke="#fde047" stroke-width="2"/>
    `;
  } else if (s.silhouette === 'aso_rock') {
    foregroundArt = `
      <!-- Massive Aso Rock Monolith -->
      <path d="M 90 150 C 130 28, 260 18, 340 150 Z" fill="#1c1917" stroke="#fb7185" stroke-width="1.2"/>
      <path d="M 155 150 L 195 55 L 245 150 Z" fill="#292524" opacity="0.6"/>
      <!-- White Presidential Villa Domes & Columns -->
      <rect x="45" y="102" width="120" height="48" fill="#f8fafc" stroke="#eab308" stroke-width="1"/>
      <path d="M 75 102 Q 105 68 135 102 Z" fill="#10b981"/>
      <!-- Convoy SUVs -->
      <rect x="220" y="122" width="52" height="20" rx="3" fill="#090d16" stroke="#ef4444" stroke-width="1"/>
      <circle cx="232" cy="120" r="3" fill="#ef4444"/>
      <circle cx="238" cy="120" r="3" fill="#3b82f6"/>
    `;
  } else if (s.silhouette === 'jabi_lake') {
    foregroundArt = `
      <!-- Lake Reflection & Speedboats -->
      <rect x="0" y="112" width="400" height="48" fill="#042f2e" opacity="0.85"/>
      <path d="M 20 128 L 380 128" stroke="#fde047" stroke-width="1.5" stroke-dasharray="12 6"/>
      <!-- Jabi Mall -->
      <rect x="35" y="75" width="135" height="40" fill="#0f172a" stroke="#2dd4bf" stroke-width="1.2"/>
      <!-- Yacht / Speedboat -->
      <polygon points="220,122 285,122 272,132 208,132" fill="#f8fafc" stroke="#38bdf8" stroke-width="1"/>
      <polygon points="240,122 255,95 270,122" fill="#fde047" opacity="0.9"/>
    `;
  } else if (s.silhouette === 'city_gate') {
    foregroundArt = `
      <!-- Abuja City Gate Archway -->
      <path d="M 70 150 L 95 62 L 130 85 L 130 150 Z" fill="#f8fafc" stroke="#eab308" stroke-width="1.2"/>
      <path d="M 270 150 L 245 62 L 210 85 L 210 150 Z" fill="#f8fafc" stroke="#eab308" stroke-width="1.2"/>
      <rect x="90" y="78" width="160" height="12" fill="#10b981"/>
      <text x="170" y="87" font-size="7" font-family="sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">WELCOME TO ABUJA</text>
    `;
  } else {
    foregroundArt = `
      <!-- Highway Overpass, Palms & Abuja Hills -->
      <path d="M 0 150 Q 95 75 210 150 T 400 130 L 400 150 Z" fill="#0f172a" opacity="0.75"/>
      <rect x="35" y="82" width="48" height="68" fill="#111827" stroke="${s.accent}" stroke-width="1"/>
      <rect x="95" y="68" width="58" height="82" fill="#090d16" stroke="${s.accent}" stroke-width="1"/>
      <rect x="170" y="92" width="65" height="58" fill="#111827" stroke="#eab308" stroke-width="0.9"/>
      <rect x="260" y="76" width="80" height="74" fill="#090d16" stroke="${s.accent}" stroke-width="1"/>
    `;
  }

  return `
  <svg class="gta-district-banner" viewBox="0 0 400 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${uid}_sky" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${s.skyTop}"/>
        <stop offset="100%" stop-color="${s.skyBot}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="160" fill="url(#${uid}_sky)"/>
    <!-- Retro GTA Sun Disc -->
    <circle cx="315" cy="64" r="38" fill="${s.sunColor}" opacity="0.82"/>
    <!-- Sun Scanlines -->
    <rect x="270" y="68" width="90" height="3" fill="${s.skyBot}" opacity="0.6"/>
    <rect x="270" y="76" width="90" height="4" fill="${s.skyBot}" opacity="0.7"/>
    <rect x="270" y="85" width="90" height="6" fill="${s.skyBot}" opacity="0.8"/>

    ${foregroundArt}

    <!-- Ground Asphalt Strip -->
    <rect x="0" y="144" width="400" height="16" fill="#05080f"/>
    <line x1="0" y1="152" x2="400" y2="152" stroke="#eab308" stroke-width="1.5" stroke-dasharray="16 10"/>

    <!-- GTA V Comic Corner Frame Overlay -->
    <rect x="10" y="10" width="235" height="36" rx="4" fill="#05080f" fill-opacity="0.78" stroke="${s.accent}" stroke-width="1.2"/>
    <text x="18" y="26" font-size="11.5" font-family="Impact, 'Arial Black', sans-serif" fill="#ffffff" letter-spacing="1">${s.title}</text>
    <text x="18" y="39" font-size="7.2" font-family="monospace" font-weight="700" fill="${s.accent}" letter-spacing="0.8">${s.subtitle}</text>
  </svg>`;
}

/**
 * Render a stylized GTA Character Portrait SVG for career tracks or NPCs
 */
export function renderCharacterAvatarSVG(type = 'contractor', size = 56) {
  const styles = {
    civil_service: { bg: '#064e3b', accent: '#10b981', cap: '#eab308', glasses: false, suit: '#1e293b', label: 'MINISTRY' },
    contractor:    { bg: '#451a03', accent: '#f59e0b', cap: '#dc2626', glasses: true,  suit: '#f8fafc', label: 'MOGUL' },
    tech_nomad:    { bg: '#0c4a6e', accent: '#38bdf8', cap: '#6366f1', glasses: true,  suit: '#0f172a', label: 'FOUNDER' },
    street_hustle: { bg: '#3b0764', accent: '#c084fc', cap: '#22c55e', glasses: false, suit: '#ca8a04', label: 'BOSS' }
  };
  const st = styles[type] || styles.contractor;
  return `
  <svg viewBox="0 0 80 80" width="${size}" height="${size}" class="gta-avatar-svg" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="76" height="76" rx="12" fill="${st.bg}" stroke="${st.accent}" stroke-width="2.5"/>
    <circle cx="40" cy="40" r="28" fill="#000" fill-opacity="0.25"/>
    <!-- Shoulders / Agbada or Suit -->
    <path d="M 14 74 C 14 54, 66 54, 66 74 Z" fill="${st.suit}" stroke="${st.accent}" stroke-width="1.2"/>
    <!-- Gold Chain -->
    <path d="M 30 58 Q 40 69 50 58" fill="none" stroke="#eab308" stroke-width="2"/>
    <!-- Head -->
    <circle cx="40" cy="36" r="14" fill="#8d5524" stroke="#111827" stroke-width="1.5"/>
    <!-- Traditional Fila / Cap -->
    <path d="M 25 30 L 29 16 L 54 19 L 55 30 Z" fill="${st.cap}" stroke="#111827" stroke-width="1.2"/>
    ${st.glasses ? `
      <rect x="29" y="32" width="9" height="6" rx="1" fill="#090d16" stroke="#eab308" stroke-width="1"/>
      <rect x="42" y="32" width="9" height="6" rx="1" fill="#090d16" stroke="#eab308" stroke-width="1"/>
      <line x1="38" y1="34" x2="42" y2="34" stroke="#eab308" stroke-width="1.2"/>
    ` : `
      <circle cx="34" cy="35" r="2" fill="#090d16"/>
      <circle cx="46" cy="35" r="2" fill="#090d16"/>
    `}
    <path d="M 35 43 Q 40 46 45 43" fill="none" stroke="#111827" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}
