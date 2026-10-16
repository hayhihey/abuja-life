# Abuja Life: FCT Social Simulation & Economy Engine

> An interactive, browser-first social life simulation and economy engine set in Nigeria’s Federal Capital Territory (FCT). Capturing the sharp contrasts, prestige politics, civil service bureaucracy, startup hustle, and satellite town commutes that define living in Abuja.

---

## 1. Quickstart & Verification

```bash
# 1. Run the headless simulation test suite (35 automated assertions)
npm test

# 2. Start the game server
npm start
# Server boots on: http://localhost:3000
```

Open `http://localhost:3000` in any modern web browser on desktop or mobile.

---

## 2. Architectural Overview

```
abuja life/
├── package.json               # Zero-dependency manifest (ES modules)
├── server.mjs                 # Lightweight Node.js server + FCT social/gist API
├── tests/
│   └── sim.mjs                # Headless engine test suite (35 assertions)
├── src/
│   ├── core/
│   │   ├── util.js            # Pure math & naira formatting helpers (₦, clamp)
│   │   ├── rng.js             # Seeded reproducible mulberry32 RNG
│   │   ├── clock.js           # 30-day Abuja months, rush hours, seasons
│   │   ├── state.js           # Decoupled JSON-serializable player state & scores
│   │   ├── game.js            # Game kernel, hybrid turn/real-time loops & decisions
│   │   ├── economy.js         # Hourly power/ISP ticks, midnight tickers (salary, fuel, FX)
│   │   ├── housing.js         # Upfront rents, 2-Year Rent Shock, evictions, relocations
│   │   ├── travel.js          # Dijkstra routing over road graph, corridor risks, mode quotes
│   │   ├── events.js          # Procedural encounters (VIO, convoys, floods, raids, black tax)
│   │   ├── actions.js         # Declarative Hustle Deck actions
│   │   ├── careers.js         # Promotion criteria & track switching
│   │   └── contacts.js        # Network ledger, affinity, and 1-click political favours
│   └── data/
│       ├── world.js           # 13 Districts (Zone 1 & 2), 24 road corridors & landmarks
│       ├── careers.js         # 4 Career tracks, tenders, gigs, trader metrics
│       └── voice.js           # Authentic Abuja vernacular, headlines, quips, and ranks
└── public/
    ├── index.html             # Mobile-first glassmorphic UI layout & modals
    ├── style.css              # Custom dark-mode design system with Abuja prestige accents
    └── app.js                 # Frontend application controller & SVG map renderer
```

---

## 3. Core Mechanics & The Six Player State Vectors

Every citizen tracks 6 primary dynamic state vectors:
1. `funds_ngn`: Cash in pocket and Bank balance. Separated because bribes, POS queues, and informal markets require physical notes, while rent and tenders draw from the bank.
2. `clout_protocol`: Social standing and political prestige. Dictates access to restricted gates (NNPC, CBN, Transcorp lobby, Villa roads), promotion speed, and bargaining power.
3. `energy_stamina`: Drains through shifts, long commutes, and late nights. Recovers via rest and sleep.
4. `sanity_stress`: Buffeted by traffic gridlock, NEPA power cuts, landlord notices, and checkpoint shake-downs.
5. `network_connections`: Contact Rolodex of contractors, civil servants, club promoters, tech founders, and dispatchers. Each contact possesses an affinity meter and unlocks political/commercial favours.
6. `legal_heat`: Attention from VIO, FRSC, and environmental task forces. Rises from bribery, driving without valid papers, and illegal hawking.

---

## 4. Map & Spatial Taxonomy

- **Zone 1 (City Centre)**: High-rent luxury districts and power corridors:
  - *Maitama & Asokoro*: Embassies, diplomatic missions, political lobbying houses, Villa checkpoints.
  - *Wuse 2 & Garki*: Lounges, shawarma joints, boutiques, Federal Secretariats, VIO head office.
  - *Central Business District (CBD)*: National Mosque, Christian Centre, NNPC Towers, CBN HQ, BPP tender desk.
  - *Jabi & Utako*: Lake recreation, tech co-working spaces, NCDC headquarters, long-distance motor parks.
  - *Guzape*: Hilltop views and luxury residential developments.

- **Zone 2 (The Satellite Belts)**: High-density commuter starter towns:
  - *Lugbe & Airport Road*: Dense estates, intense road check delays.
  - *Kubwa*: Train link commute to CBD, starter civil service homes.
  - *Nyanya / Mararaba Corridor*: Arterial choke-point traffic, 24/7 wholesale market trading.
  - *Mpape*: Cliffside views, quarry hubs, wholesale artisanal supplies.
  - *Dawaki*: Freelance housing off the Gwarinpa bypass.

---

## 5. Socioeconomic Career Tracks

1. **The Civil Service Track (GL 08 → Permanent Secretary)**:
   - Monthly guaranteed salary credited on the 25th (subject to attendance).
   - Ministry postings across FCDA, Fed. Secretariat, NNPC, CBN, or NCDC.
   - File chasing through the bureaucracy and director lobbying.
2. **The Contractor / Vendor Track**:
   - BPP procurement tenders across federal agencies.
   - Bid styles: Straight bid, Add a "processing" fee (adds heat), or use an inside contact.
   - Capital and collateral upfront; multi-day delivery runs; payment delays on director's table.
3. **The Tech & Creative Nomad**:
   - USD milestone gigs with global clients.
   - Dependent on FX rates, co-working desks, and home generator fuel during NEPA outages.
4. **Street Trader & Transport Operator**:
   - Daily cash hawking in Zone 1 vs. licensed kiosks.
   - Keke / taxi shifts on FCT corridors; park manager fleet building with daily driver remittances.
   - Union levy arrears and task-force raids.

---

## 6. Procedural Encounters & Disasters

- **VIO / FRSC Crackdowns**: Document inspection on Shehu Shagari Way and Airport Road. Choose to show valid papers, settle cash, or name-drop a senior director.
- **VIP Convoy Gridlock**: Outriders freeze expressways for diplomatic motorcades. Divert through inner roads, flash protocol access, or wait it out.
- **Rain Season Flash Floods**: Low-lying bridges (Lokogoma/Galadimawa crossings) submerge during heavy rains, forcing costly bypasses.
- **The 2-Year Rent Shock**: Landlords demanding 1-2 years rent upfront with short deadlines. Negotiate down with clout, beg for extensions, pay upfront, or face eviction to Mararaba.
- **Nightlife Networking**: Spend big at Wuse 2 lounges to convert cash into senior contractor and director contacts.
