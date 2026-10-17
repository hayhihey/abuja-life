// Travel: route planning over the road graph, per-mode quotes and trip execution.
// A "decision" in the brief - expressway vs inner road, own car vs bus - is a
// route/mode pair chosen from planTrip(). Events (VIO, convoys) fire per segment.

import { EDGES, DISTRICT_BY_ID, edgeOther } from '../data/world.js';
import * as Clock from './clock.js';
import { fuelPrice } from './economy.js';
import { rollEvents } from './events.js';
import { ngn } from './util.js';

export const MODES = {
  bus: { id: 'bus', name: 'Bus / keke', icon: '🚌', time: 1.35, energy: 0.2, sanity: 0.055 },
  hail: { id: 'hail', name: 'Ride-hail', icon: '🚕', time: 1.05, energy: 0.07, sanity: 0.025 },
  car: { id: 'car', name: 'Own ride', icon: '🚗', time: 1.0, energy: 0.12, sanity: 0.045 },
};

const ADJ = {};
for (const e of EDGES) {
  (ADJ[e.a] ||= []).push(e);
  (ADJ[e.b] ||= []).push(e);
}

export function availableModes(game) {
  const m = [MODES.bus, MODES.hail];
  if (game.s.vehicle.kind) m.push({ ...MODES.car, name: game.s.vehicle.kind === 'keke' ? 'Own keke' : 'Own car' });
  return m;
}

/** Cost/time/strain of crossing one edge in a given mode at time t. */
export function quoteEdge(game, e, modeId, t) {
  const s = game.s;
  const mk = s.market;
  const flooded = (mk.floods[e.id] || 0) > t;
  if (e.type === 'rail') {
    const h = Clock.hourOf(t);
    return { minutes: e.minutes, cost: 1800, energy: e.minutes * 0.08, sanity: e.minutes * 0.01, flooded: false, blocked: h < 6 || h >= 20, rail: true };
  }
  const M = MODES[modeId];
  const w = mk.today.weather;
  const peak = Clock.isPeak(t);
  let mult = 1;
  if (peak) mult *= e.peak;
  if (w === 'rain') mult *= 1.15; else if (w === 'storm') mult *= 1.35;
  if (mk.today.convoyDay && e.tags.includes('convoy') && Clock.hourOf(t) >= 14) mult *= 1.25;
  if (flooded) mult *= 2.4;
  const minutes = Math.max(2, Math.round(e.minutes * mult * M.time));
  const price = fuelPrice(game);
  const idx = price / 900;
  const wet = w === 'rain' || w === 'storm';
  let cost;
  if (modeId === 'bus') cost = Math.max(300, minutes * 18 * idx);
  else if (modeId === 'hail') cost = Math.max(1500, minutes * 85 * idx * (peak ? 1.5 : 1) * (wet ? 1.35 : 1));
  else cost = minutes * (s.vehicle.kind === 'keke' ? 0.07 : 0.11) * price;
  if (flooded) cost += 3500;
  const gridlock = peak && e.tags.includes('gridlock') ? 1.8 : 1;
  return {
    minutes, cost: Math.round(cost / 50) * 50, energy: minutes * M.energy, sanity: minutes * M.sanity * gridlock, flooded, blocked: false,
  };
}

function dijkstra(game, from, to, t, allow) {
  const dist = {}; const prev = {}; const done = new Set();
  for (const id of Object.keys(DISTRICT_BY_ID)) dist[id] = Infinity;
  dist[from] = 0;
  for (;;) {
    let u = null; let best = Infinity;
    for (const id in dist) if (!done.has(id) && dist[id] < best) { best = dist[id]; u = id; }
    if (u === null || u === to) break;
    done.add(u);
    for (const e of ADJ[u] || []) {
      if (!allow(e)) continue;
      const q = quoteEdge(game, e, 'hail', t + dist[u]);
      if (q.blocked) continue;
      const v = edgeOther(e, u);
      const nd = dist[u] + q.minutes;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = { u, e }; }
    }
  }
  if (!isFinite(dist[to])) return null;
  const edges = [];
  for (let at = to; at !== from; at = prev[at].u) edges.unshift(prev[at].e);
  return edges;
}

const PROFILES = [
  { id: 'fast', tag: 'Fastest', allow: () => true },
  { id: 'inner', tag: 'Inner roads', allow: (e) => e.type !== 'expressway' },
  { id: 'safe', tag: 'Dodges checkpoints', allow: (e) => !e.tags.includes('checkpoint') },
];

/** Build up to three distinct route options with quotes for every available mode. */
export function planTrip(game, to) {
  const s = game.s;
  const from = s.loc.district;
  if (from === to) return [];
  const t = s.t;
  const modes = availableModes(game);
  const seen = new Map();
  for (const p of PROFILES) {
    const edges = dijkstra(game, from, to, t, p.allow);
    if (!edges) continue;
    const key = edges.map((e) => e.id).join('>');
    if (seen.has(key)) { seen.get(key).tags.push(p.tag); continue; }
    seen.set(key, { key, edges, tags: [p.tag], dest: to });
  }
  const today = s.market.today;
  return [...seen.values()].map((r) => {
    const quotes = {};
    for (const m of modes) {
      let clock = t; const q = { minutes: 0, cost: 0, energy: 0, sanity: 0 };
      for (const e of r.edges) {
        const x = quoteEdge(game, e, m.id, clock);
        q.minutes += x.minutes; q.cost += x.cost; q.energy += x.energy; q.sanity += x.sanity; clock += x.minutes;
      }
      quotes[m.id] = { ...q, minutes: Math.round(q.minutes), energy: Math.round(q.energy), sanity: Math.round(q.sanity) };
    }
    const risks = [];
    const has = (tag) => r.edges.some((e) => e.tags.includes(tag));
    if (r.edges.some((e) => e.id === today.crackdownEdge)) risks.push('Crackdown today');
    else if (has('checkpoint')) risks.push('VIO / FRSC');
    if (has('convoy')) risks.push(today.convoyDay ? 'Convoy day' : 'Convoy risk');
    if (r.edges.some((e) => (s.market.floods[e.id] || 0) > t)) risks.push('Flooded - detour');
    else if (has('flood') && ['rain', 'storm'].includes(today.weather)) risks.push('Flood risk');
    if (Clock.isPeak(t) && has('gridlock')) risks.push('Gridlock');
    if (r.edges.some((e) => e.type === 'rail')) risks.push('Train segment');
    const main = r.edges.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    return { ...r, label: `Via ${main.name}`, quotes, risks, corridors: r.edges.map((e) => e.name) };
  }).sort((a, b) => a.quotes.hail.minutes - b.quotes.hail.minutes);
}

export async function executeTrip(game, route, modeId) {
  const s = game.s;
  const q = route.quotes[modeId];
  if (!q) return { ok: false, reason: 'Mode unavailable' };
  const free = s.flags.freeRide;
  const cost = free ? 0 : q.cost;
  if (!game.canAfford(cost)) return { ok: false, reason: `Need ${ngn(cost)} for this trip.` };
  game.pay(cost);
  if (free) { s.flags.freeRide = false; game.log('A dispatcher friend carries you for free.', 'good', '🏍️'); }
  s.loc.spot = null;
  const from = DISTRICT_BY_ID[s.loc.district];
  const to = DISTRICT_BY_ID[route.dest];
  game.log(`${MODES[modeId].icon} ${from.short} -> ${to.short} via ${route.corridors.join(', ')}.`, 'info', '🧭');

  for (const e of route.edges) {
    const qq = quoteEdge(game, e, modeId, s.t);
    let minutes = Math.max(2, Math.round(qq.minutes * game.rng.float(0.92, 1.12)));
    if (qq.blocked) minutes += 30; // missed the last train: wait / alternative
    const scale = minutes / Math.max(1, qq.minutes);
    s.energy = Math.max(0, s.energy - qq.energy * scale);
    s.sanity = Math.max(0, s.sanity - qq.sanity * scale);
    await game.advance(minutes);
    await rollEvents(game, 'segment', { edge: e, mode: modeId, minutes });
  }
  game.arrive(route.dest);
  s.stats.trips++;
  game.log(`Arrived in ${to.name} at ${Clock.clockStr(s.t)}.`, 'info', '📍');
  await rollEvents(game, 'arrive', { district: to });
  game.emit('hud');
  return { ok: true };
}
