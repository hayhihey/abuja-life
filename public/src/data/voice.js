// Narrative voice: Abuja headlines, gossip and flavour lines.
// Authentic Nigerian English, kept readable. {placeholders} are filled by the caller.

export const HEADLINES = {
  crackdown: [
    'Operation Clean Road: VIO and FRSC men dey on {road} today. Carry your papers.',
    'Task force don land {road} - roadworthiness checks till evening.',
    'FRSC says "zero tolerance" on {road} this morning. Hold your particulars.',
  ],
  convoy: [
    'Heavy motorcade movement around the Three Arms Zone. Expect a long hold-up.',
    'Diplomatic convoy for today: roads near the Villa go "tight" after 2pm.',
    'VIP movement announced. Police outriders already cleaning the road.',
  ],
  flood: [
    'Rain don soak the FCT - {road} is waterlogged.',
    'Flash flood warning: {road} dey underwater. Plan alternate routes.',
  ],
  rain: ['Heavy clouds over Abuja. Umbrella and patience, both.', 'Rain dey fall since morning. Roads go slow.'],
  harmattan: ['Harmattan haze over the FCT. Dry throat, dusty cars.', 'Dust and cold mornings. Abuja bundled up.'],
  hot: ['Hot, dry day. Generators dey hum across the estates.', 'Heat don come. Fans and NEPA, please.'],
  fuel: ['Fuel queues return at some stations. Marketers say "supply issues".', 'Pump price creeping up again. Taxi fares follow.'],
  generic: [
    'Civil servants say the file is "on the director\u2019s table". Again.',
    'Wuse 2 lounges promise a big weekend. Promoters already on the phone.',
    'Satellite town marathon begins: Nyanya to Garki, 45 minutes if God wills.',
    'Landlords across Maitama reportedly demanding two years upfront.',
    'Another power-grid hiccup: estates reach for the generator.',
    'Contractors grumble over unpaid certificates. Same story, new quarter.',
    'Jabi Lake joggers out early, traffic out earlier.',
    'Lugbe residents hope for a clear Airport Road. Hope is free.',
  ],
};

export const AVATARS = ['🧑🏾', '👩🏾', '🧔🏾', '👩🏾‍💼', '🧑🏾‍💻', '👨🏾‍🔧'];

export const RANKS = [
  { min: 0, title: 'JJC (Johnny-Just-Come)' },
  { min: 300, title: 'Settled Abuja Resident' },
  { min: 700, title: 'Wuse Regular' },
  { min: 1300, title: 'Somebody Dey Know You' },
  { min: 2200, title: 'Oga / Madam at the Top' },
  { min: 3500, title: 'Maitama Royalty' },
];

export function rankFor(score) {
  let r = RANKS[0];
  for (const x of RANKS) if (score >= x.min) r = x;
  return r.title;
}

export const OFFICE_QUIPS = [
  'You sign the register, then wait for the file to find its way upstairs.',
  'The director is "in a meeting". You catch up on three WhatsApp groups.',
  'Power goes out at the secretariat; everybody moves to the corridor.',
  'You carry one file from Room 14 to Room 22. That is the day.',
  'Tea is served at 11. The memo is served never.',
];

export const HUSTLE_QUIPS = [
  'You shout "Oga, na only ₦500!" until your voice goes.',
  'A customer haggles for twenty minutes, then buys one sachet.',
  'Lunch crowd hits. For one hour, you are a god.',
  'You dodge the task-force pickup and find a better corner.',
  'Rain scatters the buyers, but the okada boys are buying biscuits.',
];

export const LOUNGE_QUIPS = [
  'The DJ drops an Amapiano remix and the whole room calls for "one more round".',
  'Somebody introduces you as "my guy from the Ministry". You just smile.',
  'A man in a babariga orders for the table and asks about your business.',
];
