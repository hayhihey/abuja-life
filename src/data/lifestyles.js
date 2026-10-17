// ============================================================================
// NIGERIAN LIFESTYLE ARCHETYPES, SLANG CALIBERS, LIFE STAGES & PREVIOUS ASSETS
// ============================================================================

export const GENDERS = {
  male: {
    id: 'male',
    label: '👨🏾 Male (Odogwu / Alhaji / Guy)',
    short: 'Male',
    icon: '👨🏾',
    pronoun: 'Chief'
  },
  female: {
    id: 'female',
    label: '👩🏾 Female (Baddie / Alhajia / Baby Girl)',
    short: 'Female',
    icon: '👩🏾',
    pronoun: 'Queen'
  }
};

export const LIFE_STAGES = {
  child: {
    id: 'child',
    label: '🧒🏾 Child / Teen (8–17 yrs)',
    defaultAge: 14,
    minAge: 8,
    maxAge: 17,
    desc: 'Start as an Abuja school kid (Maitama Nepo Pikin or Satellite Town Prodigy). Collect pocket money, learn skills early, and age up into adulthood!'
  },
  young_adult: {
    id: 'young_adult',
    label: '🧑🏾‍🎓 Gen-Z / Young Adult (18–25 yrs)',
    defaultAge: 22,
    minAge: 18,
    maxAge: 25,
    desc: 'Peak TikTok, NYSC Kubwa Camp, Baze Uni, Soft-Life Baddie & Tech Bro era. High energy and viral Steeze.'
  },
  adult: {
    id: 'adult',
    label: '👔 Prime Adult (26–44 yrs)',
    defaultAge: 31,
    minAge: 26,
    maxAge: 44,
    desc: 'Full Abuja power player: Federal Secretariat ministries, BPP contracts, Wuse 2 nightlife, and Maitama real estate.'
  },
  elder: {
    id: 'elder',
    label: '👑 VIP Elder / Chairman (45–70 yrs)',
    defaultAge: 52,
    minAge: 45,
    maxAge: 70,
    desc: 'Alhaji / Alhajia / Cash Madam / PermSec caliber. Maximum Composure & Protocol respect at every FCT checkpoint.'
  }
};

export const NIGERIAN_LIFESTYLES = {
  alhaji: {
    id: 'alhaji',
    name: '🕌 Alhaji / Alhajia (Oil & Hajj VIP)',
    slangTag: 'Big Aza • 100% Composure • Maitama Landlord',
    caliber: '💎 Tier S • Ultra-High Worth',
    worthLabel: '₦28,500,000+ Net Worth',
    cash: 1500000,
    bank: 5000000,
    clout: 48,
    steeze: 95,
    composure: 98,
    district: 'maitama',
    recommendedTrack: 'contractor',
    defaultCar: 'prado',
    defaultSolar: true,
    defaultPlots: {
      maitama: { district: 'maitama', stage: 5, name: 'Maitama Minister’s Hill', cofo: true }
    },
    desc: 'Known across Abuja as "Alhaji / Alhajia". You start with a completed Maitama Duplex Mansion (C-of-O sealed), a 2024 Toyota Prado TXL, 10kVA Solar, and ₦6.5M liquid Naira ready to spray or fund federal tenders.'
  },
  os_baddie: {
    id: 'os_baddie',
    name: '💅 OS / Soft-Life Baddie (Wuse 2 Queen)',
    slangTag: 'Soft Life • Heavy Billing • Shortlet & Lexus RX',
    caliber: '✨ Tier A+ • Luxury Soft-Life',
    worthLabel: '₦14,800,000+ Net Worth',
    cash: 800000,
    bank: 2000000,
    clout: 38,
    steeze: 99,
    composure: 90,
    district: 'wuse2',
    recommendedTrack: 'tech',
    defaultCar: 'rx350',
    defaultSolar: true,
    defaultPlots: {
      jabi: { district: 'jabi', stage: 5, name: 'Jabi Lakefront Terrace', cofo: true }
    },
    desc: '"I cannot come and kill myself!" Curated Instagram & TikTok aesthetic, VIP tables at Wuse 2 lounges, a completed Jabi Waterfront Shortlet Duplex, a Lexus RX 350, and 2x payout on "Send Billing / Drop Aza" moves.'
  },
  odogwu: {
    id: 'odogwu',
    name: '🦅 Odogwu Paranran / Dorime Chairman',
    slangTag: 'Dorime! • Sound The Alarm • G-Wagon Steeze',
    caliber: '🔥 Tier A • High-Roller Baller',
    worthLabel: '₦22,000,000+ Net Worth',
    cash: 1200000,
    bank: 3000000,
    clout: 36,
    steeze: 96,
    composure: 86,
    district: 'wuse2',
    recommendedTrack: 'contractor',
    defaultCar: 'g63',
    defaultSolar: false,
    defaultPlots: {
      wuse2: { district: 'wuse2', stage: 4, name: 'Wuse 2 Adetokunbo Plot', cofo: true }
    },
    desc: 'When you walk into a Wuse 2 club, the DJ plays "Ameno (Dorime)" and the sirens come out. Starts with a Mercedes-AMG G63 Brabus, a roofed Wuse 2 Duplex site, and ₦4.2M cash/bank.'
  },
  nepo_baby: {
    id: 'nepo_baby',
    name: '👶🏼 Nepo Baby / Minister’s Pikin',
    slangTag: 'Daddy’s Aza • Diplomatic Pass • Zero Sapa',
    caliber: '👑 Tier A • Generational Wealth',
    worthLabel: '₦16,500,000+ Net Worth',
    cash: 700000,
    bank: 2500000,
    clout: 44,
    steeze: 92,
    composure: 94,
    district: 'maitama',
    recommendedTrack: 'civil',
    defaultCar: 'rx350',
    defaultSolar: true,
    defaultPlots: {
      jabi: { district: 'jabi', stage: 5, name: 'Jabi Lakefront Terrace', cofo: true }
    },
    desc: '"Do you know who my dad is?" Raised between Maitama British School and Asokoro Villa. Starts with a Jabi Duplex, Lexus RX 350, diplomatic immunity, and can collect recurring family allowance.'
  },
  tech_steeze: {
    id: 'tech_steeze',
    name: '💻 Tech Bro / Creator Star (FX Aza)',
    slangTag: 'Clock It! • Remote USD • Starlink & Steeze',
    caliber: '⚡ Tier B+ • Dollar Earner',
    worthLabel: '₦4,200,000+ Net Worth',
    cash: 350000,
    bank: 1100000,
    clout: 22,
    steeze: 88,
    composure: 84,
    district: 'jabi',
    recommendedTrack: 'tech',
    defaultCar: 'corolla',
    defaultSolar: true,
    defaultPlots: {
      lugbe: { district: 'lugbe', stage: 2, name: 'Lugbe Airport Road Estate', cofo: true }
    },
    desc: 'Earning foreign exchange from Jabi cafes & co-working hubs. Starts with ₦1.45M, a reliable Toyota Corolla "Muscle", 10kVA Solar, and a Lugbe plot at German Floor stage.'
  },
  corper_allawee: {
    id: 'corper_allawee',
    name: '🪖 NYSC Corper ("Allawee" Hustler)',
    slangTag: 'Corper Shun! • ₦77k Allawee • Kubwa Camp',
    caliber: '🌱 Tier C • Youth Graduate Starter',
    worthLabel: '₦210,000 Net Worth',
    cash: 60000,
    bank: 150000,
    clout: 12,
    steeze: 74,
    composure: 78,
    district: 'kubwa',
    recommendedTrack: 'civil',
    defaultCar: 'along',
    defaultSolar: false,
    defaultPlots: {},
    desc: 'Fresh out of NYSC Kubwa Orientation Camp in white tennis shoes and khaki. Posting to a CBD Ministry PPA while hustling on the side.'
  },
  sapa_trenches: {
    id: 'sapa_trenches',
    name: '🔥 Sapa / Trenches ("No Gree For Anybody")',
    slangTag: 'Urgent 2k • 0% Fear • 100% Street Grind',
    caliber: '🪨 Tier D • Zero-to-Billionaire',
    worthLabel: '₦45,000 Cash in Hand',
    cash: 25000,
    bank: 20000,
    clout: 4,
    steeze: 62,
    composure: 70,
    district: 'mararaba',
    recommendedTrack: 'trader',
    defaultCar: 'along',
    defaultSolar: false,
    defaultPlots: {},
    desc: '"Sapa nice one, Everywhere Go First Blurr, but No Gree For Anybody!" Start from the Mararaba expressway trenches with ₦45k and build an Abuja empire from scratch.'
  }
};

export const PREVIOUS_PROPERTY_OPTIONS = {
  default: {
    id: 'default',
    label: '✨ Use Selected Lifestyle’s Default Properties & Ride',
    desc: 'Automatically equips the houses, land plots, C-of-O, and vehicles that match your chosen Nigerian Lifestyle Caliber.'
  },
  none: {
    id: 'none',
    label: '🎒 No Previous Properties (Start Renting Only)',
    desc: 'Start with zero real estate and public "Along" transport—even if you picked a wealthy lifestyle.'
  },
  kubwa_starter: {
    id: 'kubwa_starter',
    label: '🧱 Inherited Kubwa Land Plot (Stage 3 Walled) + Corolla Muscle',
    desc: 'Start with a half-built 3-bedroom bungalow in Kubwa Extension and a clean 2014 Toyota Corolla "Muscle".'
  },
  jabi_shortlet: {
    id: 'jabi_shortlet',
    label: '🏨 Completed Jabi Waterfront Shortlet Duplex + Lexus RX 350',
    desc: 'Start as an Airbnb/Shortlet landlord in Jabi with a completed Stage 5 Duplex and a Lexus RX 350.'
  },
  maitama_empire: {
    id: 'maitama_empire',
    label: '🏰 Maitama Mansion + Wuse 2 Duplex + G-Wagon & Prado Convoy',
    desc: 'Old-money FCT portfolio: Completed Maitama Mansion, Completed Wuse 2 Duplex, 10kVA Solar, Prado VXR & AMG G-Wagon.'
  }
};

export const NIGERIAN_SLANG_DICTIONARY = [
  { term: 'Steeze', meaning: 'Effortless style + ease; aura and drip when walking into Transcorp or Wuse 2.' },
  { term: 'Composure', meaning: 'Maintaining maximum calm and dignity even when VIO stops you or AEDC takes light.' },
  { term: 'Send Your Aza', meaning: 'Drop your bank account number for an instant Naira credit alert.' },
  { term: 'Alhaji / Alhajia', meaning: 'Big-money patron, oil & gas VIP, or generous baller sponsoring the soft life.' },
  { term: 'OS / Soft Life Baddie', meaning: 'High-maintenance luxury queen living in Wuse 2/Jabi shortlets with zero stress.' },
  { term: 'Dorime', meaning: 'Club siren & sparkler parade when expensive bottles (Azul / Ace of Spades) are ordered.' },
  { term: 'Oblee', meaning: 'High-voltage partying, Detty December vibes, and maximum enjoyment.' },
  { term: 'Billing / Urgent 2k', meaning: 'Sending financial requests ("bills") to a partner, Alhaji, or contact.' },
  { term: 'No Gree For Anybody', meaning: 'Refusing to be intimidated or cheated in Abuja traffic, business, or politics.' },
  { term: 'Clock It', meaning: 'Spotting the undeniable truth or flexing a verified achievement.' },
  { term: 'Ganusi', meaning: 'Hovering at an ICC Owambe or VIP table for free small-chops and jollof.' },
  { term: 'Sapa / Shege', meaning: 'Severe broke-ness after paying 2-year Abuja upfront rent.' }
];
