// Procedural Abuja events. Each event declares the trigger it listens to and a
// probability function; run() may ask the player to decide via game.ask().
//
// Triggers:
//   segment - every road segment of a trip   ctx: { edge, mode, minutes }
//   arrive  - after arriving in a district    ctx: { district }
//   action  - after any player action         ctx: { action }
//   dawn    - every midnight rollover         ctx: {}

import { clamp, ngn, nice } from './util.js';
import * as Clock from './clock.js';
import { DISTRICT_BY_ID } from '../data/world.js';
import { CIVIL_POSTINGS } from '../data/careers.js';
import { makeContact, randomContactType } from './contacts.js';

const docsValid = (g) => g.s.vehicle.docsUntilDay >= g.day;

export const EVENTS = [
  // ------------------------------------------------------------------ roads
  {
    id: 'vio_check', triggers: ['segment'],
    p(g, { edge, mode }) {
      if (mode !== 'car' || !edge.tags.includes('checkpoint')) return 0;
      const t = g.s.market.today;
      let p = 0.1 * (t.crackdownEdge === edge.id ? 3.2 : 1) * (1 + g.s.heat / 100);
      if (g.s.flags.tipOff) p *= 0.4;
      return clamp(p, 0, 0.7);
    },
    async run(g, { edge }) {
      const s = g.s;
      const ok = docsValid(g);
      const amt = nice(g.rng.int(3000, 10000), 500);
      const id = await g.ask({
        title: 'VIO / FRSC checkpoint', icon: '🚓',
        body: `Officers wave you down on ${edge.name}. "Oga, particulars!" ${ok ? 'Your papers are valid.' : 'Your vehicle papers have EXPIRED.'}`,
        options: [
          { id: 'show', label: 'Show your papers', sub: ok ? 'Usually smooth. Sometimes they find a "problem"' : 'Fine and possible impound' },
          { id: 'settle', label: `Settle ${ngn(amt)} cash`, sub: 'Fast. Adds heat and costs clout', disabled: s.cash < amt, reason: 'No cash on you' },
          { id: 'argue', label: 'Name-drop and argue', sub: 'Clout-based roll' },
        ],
      });
      if (id === 'settle') {
        g.pay(amt, { cashOnly: true });
        if (g.rng.chance(0.15)) g.drain(amt);
        s.heat = clamp(s.heat + 4); s.clout = clamp(s.clout - 1); s.stats.bribes++;
        await g.advance(3);
        g.log(`You "settled" at the checkpoint. ${ngn(amt)} gone.`, 'warn', '💵');
      } else if (id === 'argue') {
        const p = clamp(0.2 + s.clout * 0.008 + (g.isSharp() ? 0.1 : 0), 0.1, 0.75);
        if (g.rng.chance(p)) { s.clout = clamp(s.clout + 0.5); await g.advance(8); g.log('You name-drop an uncle at the Ministry. They wave you on.', 'good', '🗣️'); } else {
          const fine = g.drain(nice(g.rng.int(10000, 20000), 500));
          await g.advance(25); s.sanity = clamp(s.sanity - 6); s.heat = clamp(s.heat + 5);
          g.log(`Argument lost. ${ngn(fine)} fine and 25 minutes.`, 'bad', '🚓');
        }
      } else if (ok) {
        await g.advance(10);
        if (g.rng.chance(0.3)) { const f = g.drain(nice(g.rng.int(6000, 15000), 500)); g.log(`They find a missing hazard triangle. ${ngn(f)} fine.`, 'warn', '🚓'); } else g.log('Papers check out. They let you go.', 'info', '✅');
      } else {
        const f = g.drain(45000);
        s.heat = clamp(s.heat + 8);
        await g.advance(20);
        g.log(`Expired papers: ${ngn(f)} fine.`, 'bad', '🚓');
        if (g.rng.chance(0.25)) {
          const f2 = g.drain(80000); s.clout = clamp(s.clout - 2); await g.advance(180);
          g.log(`Vehicle impounded. ${ngn(f2)} and three hours to retrieve it.`, 'bad', '🚨');
        }
      }
    },
  },
  {
    id: 'holdup', triggers: ['segment'],
    p(g, { edge, mode }) {
      if (mode === 'car' || !edge.tags.includes('checkpoint')) return 0;
      return g.s.market.today.crackdownEdge === edge.id ? 0.35 : 0.1;
    },
    async run(g) {
      const m = g.rng.int(8, 20);
      await g.advance(m);
      g.stat('sanity', -3);
      g.log(`Checkpoint hold-up: security men inspecting every boot. +${m} min.`, 'warn', '🚧');
    },
  },
  {
    id: 'convoy', triggers: ['segment'],
    p(g, { edge }) {
      if (!edge.tags.includes('convoy')) return 0;
      let p = 0.07 * (Clock.isPeak(g.s.t) ? 1.4 : 1);
      if (g.s.market.today.convoyDay) p *= 3;
      return p;
    },
    async run(g, { edge }) {
      const s = g.s;
      const divert = nice(g.rng.int(2500, 6000), 500);
      const id = await g.ask({
        title: 'VIP convoy', icon: '🚨',
        body: `Police outriders push everybody to the shoulder on ${edge.name}. A motorcade is passing, and nobody knows for how long.`,
        options: [
          { id: 'wait', label: 'Wait it out', sub: '+30 min, sanity hit' },
          { id: 'divert', label: `Divert through inner roads (${ngn(divert)})`, sub: '+15 min, smaller sanity hit', disabled: !g.canAfford(divert), reason: 'Cannot afford' },
          { id: 'protocol', label: 'Flash your protocol', sub: 'Needs Protocol 35+', disabled: s.clout < 35, reason: 'Not enough clout' },
        ],
      });
      if (id === 'divert') { g.pay(divert); await g.advance(15); g.stat('sanity', -3); g.log(`Detoured around the motorcade. ${ngn(divert)}, +15 min.`, 'info', '↪️'); } else if (id === 'protocol') {
        await g.advance(8); s.clout = clamp(s.clout + 0.5); g.log('A protocol officer waves you through the gap. Small perks of status.', 'good', '🎫');
      } else { await g.advance(30); g.stat('sanity', -6); g.log('Motorcade passes after 30 minutes. Abuja patience.', 'warn', '🚨'); }
    },
  },
  {
    id: 'downpour', triggers: ['segment'],
    p(g) {
      const w = g.s.market.today.weather;
      return (w === 'rain' || w === 'storm') && Clock.hourIn(g.s.t, 12, 20) ? 0.08 : 0;
    },
    async run(g, { mode }) {
      const m = g.rng.int(10, 25);
      await g.advance(m);
      g.stat('sanity', -2);
      if (mode === 'bus') g.stat('energy', -3);
      g.log(`Sudden downpour: roads flood and wipers fight for life. +${m} min.`, 'warn', '🌧️');
    },
  },

  // ------------------------------------------------------------------ arrival
  {
    id: 'nightlife_invite', triggers: ['arrive'],
    p(g, { district }) { return district.id === 'wuse2' && Clock.hourIn(g.s.t, 18, 3) ? 0.28 : 0; },
    async run(g) {
      const s = g.s;
      const cost = nice(25000 + s.career.level * 10000, 1000);
      const id = await g.ask({
        title: 'A promoter flags you down', icon: '🎧',
        body: 'A promoter you half-know leans out of a Range Rover: "Oga, I get a table for you tonight. Come and meet people."',
        options: [
          { id: 'go', label: `Take the table (${ngn(cost)})`, sub: 'Networking chance, energy cost', disabled: !g.canAfford(cost), reason: 'Cannot afford' },
          { id: 'pass', label: 'Maybe next time' },
        ],
      });
      if (id !== 'go') return;
      g.pay(cost);
      await g.advance(120);
      s.energy = clamp(s.energy - 8); s.sanity = clamp(s.sanity + 4);
      if (g.rng.chance(0.4 + s.clout / 200)) {
        const c = makeContact(g.rng, g.rng.pick(['contractor', 'civil_servant', 'promoter']), g.rng.chance(0.3) ? 2 : 1);
        s.contacts.push(c);
        g.log(`At the promoter\u2019s table you meet ${c.name} (${c.org}).`, 'good', '🤝');
      } else g.log('Good night, loud music, no business cards exchanged.', 'info', '🎶');
    },
  },
  {
    id: 'street_encounter', triggers: ['arrive'],
    p() { return 0.06; },
    async run(g, { district }) {
      const city = district.zone === 1;
      const type = randomContactType(g.rng, city ? { civil_servant: 3, contractor: 2, tech_founder: 1 } : { dispatcher: 3, promoter: 1, contractor: 1 });
      const c = makeContact(g.rng, type, 1);
      g.s.contacts.push(c);
      g.log(`You bump into ${c.name} (${c.org}) in ${district.name}. Numbers exchanged.`, 'good', '🤝');
    },
  },
  {
    id: 'stop_and_search', triggers: ['arrive'],
    p(g) { return g.s.heat >= 60 ? (g.s.heat - 55) / 100 * 0.4 : 0; },
    async run(g) {
      await g.advance(45);
      const f = g.drain(15000);
      g.stat('sanity', -4); g.s.heat = clamp(g.s.heat - 10);
      g.log(`Task force stop-and-search. ${ngn(f)} "processing" and 45 minutes lost. Heat drops a bit.`, 'bad', '🚔');
    },
  },

  // ------------------------------------------------------------------ after action
  {
    id: 'task_force_raid', triggers: ['action'],
    p(g, { action }) {
      const s = g.s;
      if (action.id !== 'hustle_shift' || g.district.zone !== 1 || s.career.level > 2) return 0;
      return clamp(0.14 * (1 + s.heat / 100) * (s.flags.tipOff ? 0.4 : 1), 0, 0.5);
    },
    async run(g) {
      const s = g.s;
      const amt = nice(g.rng.int(6000, 15000), 500);
      const id = await g.ask({
        title: 'Task force raid', icon: '🚔',
        body: 'Environmental task-force men swoop on your corner. "Who gave you permission to sell here?"',
        options: [
          { id: 'run', label: 'Grab what you can and run', sub: 'Lose stock, no fine' },
          { id: 'settle', label: `Settle ${ngn(amt)} cash`, sub: 'Keep your stock, add heat', disabled: s.cash < amt, reason: 'No cash on you' },
          { id: 'plead', label: 'Plead and show your union card', sub: 'Clout-based roll' },
        ],
      });
      if (id === 'settle') { g.pay(amt, { cashOnly: true }); s.heat = clamp(s.heat + 3); s.stats.bribes++; g.log(`You "settled" the task force with ${ngn(amt)}.`, 'warn', '💵'); } else if (id === 'plead' && g.rng.chance(clamp(0.25 + s.clout * 0.01, 0.1, 0.7))) {
        g.log('Union card plus a friendly officer: warning only.', 'good', '🪪');
      } else if (id === 'plead') {
        const lost = Math.round(s.work.stock * 0.4); s.work.stock -= lost; const f = g.drain(8000); s.heat = clamp(s.heat + 6);
        g.log(`Plea failed: ${lost} units of stock confiscated and ${ngn(f)} fine.`, 'bad', '🚔');
      } else {
        const lost = Math.round(s.work.stock * 0.5); s.work.stock -= lost; s.heat = clamp(s.heat + 2);
        g.log(`You run. ${lost} units of stock left on the pavement.`, 'bad', '🏃🏾');
      }
    },
  },

  // ------------------------------------------------------------------ dawn
  {
    id: 'transfer_letter', triggers: ['dawn'],
    p(g) { return g.s.career.track === 'civil' ? 0.015 : 0; },
    async run(g) {
      const s = g.s;
      const options = CIVIL_POSTINGS.filter((p) => p.spot !== s.career.posting.spot);
      const next = g.rng.pick(options);
      const where = DISTRICT_BY_ID[next.district].name;
      const id = await g.ask({
        title: 'Deployment letter', icon: '✉️',
        body: `A letter lands on your desk: you are transferred to ${next.org}, ${where}, effective immediately. "In the interest of service."`,
        options: [
          { id: 'accept', label: 'Accept the posting', sub: 'New office, new commute' },
          { id: 'appeal', label: 'Appeal through a contact', sub: 'Clout and senior contacts help' },
        ],
      });
      if (id === 'appeal') {
        const senior = s.contacts.some((c) => c.type === 'civil_servant' && c.tier >= 2);
        if (g.rng.chance(clamp(0.3 + s.clout * 0.008 + (senior ? 0.15 : 0), 0.15, 0.85))) {
          g.log('Your appeal works: the letter "gets lost" on the way to registry.', 'good', '🗂️'); return;
        }
        s.sanity = clamp(s.sanity - 5);
        g.log('Appeal rejected. The transfer stands.', 'bad', '✉️');
      }
      s.career.posting = { ...next };
      g.log(`Posted to ${next.org}, ${where}. Pack your files.`, 'warn', '🧳');
    },
  },
  {
    id: 'black_tax', triggers: ['dawn'],
    p(g) { return g.funds() >= 150000 ? 0.035 : 0; },
    async run(g) {
      const s = g.s;
      const amt = nice(clamp(g.funds() * 0.1, 20000, 250000), 5000);
      const id = await g.ask({
        title: 'Family WhatsApp group', icon: '📱',
        body: `Urgent: a cousin's school fees, a medical bill and "a small something for Mama". The ask: ${ngn(amt)}.`,
        options: [
          { id: 'full', label: `Send ${ngn(amt)}`, sub: 'Family peace' },
          { id: 'half', label: `Send ${ngn(amt / 2)}`, sub: 'Some grumbling' },
          { id: 'ignore', label: 'Seen, no reply', sub: 'Sanity hit' },
        ],
      });
      if (id === 'full') { g.drain(amt); s.sanity = clamp(s.sanity + 2); g.log(`You send ${ngn(amt)} home. Blessings flow.`, 'info', '🙏🏾'); } else if (id === 'half') { g.drain(amt / 2); s.sanity = clamp(s.sanity - 1); g.log(`You send ${ngn(amt / 2)}. "God will do the rest."`, 'info', '📱'); } else { s.sanity = clamp(s.sanity - 7); g.log('You leave them on read. The guilt is heavy.', 'bad', '📵'); }
    },
  },
  {
    id: 'fuel_scarcity', triggers: ['dawn'],
    p(g) { return g.day >= g.s.market.fuelSpikeUntilDay ? 0.03 : 0; },
    async run(g) {
      const d = g.rng.int(5, 9);
      g.s.market.fuelSpikeUntilDay = g.day + d;
      g.log(`Fuel scarcity: pump prices jump 30% for about ${d} days. Fares follow.`, 'warn', '⛽');
    },
  },
  {
    id: 'estate_levy', triggers: ['dawn'],
    p(g) { return g.home.prestige >= 3 ? 0.03 : 0; },
    async run(g) {
      const amt = nice(g.s.home.rent * 0.03, 5000);
      const paid = g.drain(amt);
      g.stat('sanity', -3);
      g.log(`Estate security & service charge: ${ngn(paid)}. Neighbours sign the petition, you sign the cheque.`, 'warn', '🏘️');
    },
  },
  {
    id: 'levy_boys', triggers: ['dawn'],
    p(g) { return g.s.career.track === 'trader' && g.s.work.levyArrears > 0 ? 0.35 : 0; },
    async run(g) {
      const s = g.s;
      const owe = s.work.levyArrears;
      const id = await g.ask({
        title: 'Union boys at your corner', icon: '🧢',
        body: `"Oga, park levy. You dey owe ${ngn(owe)}."`,
        options: [
          { id: 'pay', label: `Pay ${ngn(owe)}`, sub: 'Clears the debt, +clout in the park', disabled: !g.canAfford(owe), reason: 'Not enough funds' },
          { id: 'negotiate', label: 'Negotiate', sub: 'Clout-based. Half if it works' },
          { id: 'dodge', label: 'Dodge them', sub: 'Debt grows and they may take stock' },
        ],
      });
      if (id === 'pay') { g.pay(owe); s.work.levyArrears = 0; s.clout = clamp(s.clout + 1); g.log('Levy cleared. The park boys nod.', 'good', '🧾'); } else if (id === 'negotiate' && g.rng.chance(clamp(0.3 + s.clout * 0.01, 0.15, 0.75))) {
        const half = Math.round(owe / 2); const paid = g.drain(half); s.work.levyArrears = Math.max(0, owe - half);
        g.log(`You settle for half (${ngn(paid)}). Remaining debt stays.`, 'info', '🤝');
      } else {
        s.work.levyArrears = Math.round(owe * 1.25); s.sanity = clamp(s.sanity - 4); s.clout = clamp(s.clout - 2);
        if (g.rng.chance(0.25)) { const lost = Math.min(30, s.work.stock); s.work.stock -= lost; g.log(`They carry away ${lost} units of stock.`, 'bad', '🧢'); }
        g.log('The union boys are not impressed. Debt grows.', 'bad', '🧢');
      }
    },
  },
  {
    id: 'tender_leak', triggers: ['dawn'],
    p(g) {
      return g.s.career.track === 'contractor' && g.s.contacts.some((c) => c.type === 'civil_servant' && c.affinity >= 30) ? 0.06 : 0;
    },
    async run(g) {
      const s = g.s;
      const cost = nice(15000 + s.career.level * 12000, 1000);
      const id = await g.ask({
        title: 'A tip from the Ministry', icon: '📞',
        body: `A civil-servant friend whispers that a spec was "adjusted" to suit the right bidder. For ${ngn(cost)} he can make sure you see it first.`,
        options: [
          { id: 'buy', label: `Pay ${ngn(cost)} for the whisper`, sub: 'Bid odds +15% on your next bid', disabled: !g.canAfford(cost), reason: 'Cannot afford' },
          { id: 'no', label: 'Decline', sub: 'Keep your hands clean' },
        ],
      });
      if (id === 'buy') { g.pay(cost); s.work.bidBoost = Math.max(s.work.bidBoost, 0.15); s.heat = clamp(s.heat + 3); g.log('You now know exactly what the agency wants to see.', 'info', '🔍'); }
    },
  },
];

const BY_TRIGGER = {};
for (const e of EVENTS) for (const t of e.triggers) (BY_TRIGGER[t] ||= []).push(e);

/** Roll the event table for a trigger. Dawn may fire two events, others one. */
export async function rollEvents(game, trigger, ctx = {}) {
  const pool = game.rng.shuffle(BY_TRIGGER[trigger] || []);
  const max = trigger === 'dawn' ? 2 : 1;
  let fired = 0;
  for (const ev of pool) {
    const p = ev.p(game, ctx);
    if (p > 0 && game.rng.chance(p)) {
      await ev.run(game, ctx);
      if (++fired >= max) break;
    }
  }
  return fired;
}
