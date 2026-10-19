// Zero-dependency HTTP & Real-Time Multiplayer Server for "Abuja Life: GTA FCT Edition"
// Incorporates community fixes & viral features inspired by @Shalom_HeyEliy:
// - High-unread-count safe paginated chat (/api/chat) + normalized sender/author fields
// - Anti-scam staff impersonation filter & verified player badges
// - Live 3D player position & presence sync in 0..100 FCT map coordinates (/api/heartbeat)
// - Live FCT High Court docket & verdicts (/api/court)
// - "Ask to be Bae" relationship proposals & couple dates (/api/bae)
// - FCT Minister & CBN Policy Polls (/api/polls)
// - Peer-to-peer CBN Naira wire transfers (/api/transfer) & Naira spray (/api/spray)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// --- 1. District 2D Coordinates (0..100 matching src/data/world.js) ---
const DISTRICT_2D = {
  cbd:     { x: 50, y: 50 },
  maitama: { x: 60, y: 36 },
  asokoro: { x: 64, y: 58 },
  guzape:  { x: 78, y: 52 },
  wuse2:   { x: 44, y: 38 },
  jabi:    { x: 28, y: 36 },
  utako:   { x: 36, y: 50 },
  garki:   { x: 50, y: 68 },
  lugbe:   { x: 62, y: 90 },
  kubwa:   { x: 12, y: 18 },
  dawaki:  { x: 28, y: 20 },
  mpape:   { x: 42, y: 14 },
  nyanya:  { x: 90, y: 66 },
};

// --- 2. Prestige Leaderboard & Rivals ---
const prestigeBoard = [
  { id: 'bot_emeka', name: 'Chief Emeka "Aso" Okonkwo', avatar: '🧔🏾', track: 'contractor', career: 'Contractor / Vendor', district: 'maitama', score: 5400, netWorth: 185000000, clout: 88, blurb: 'Senior partner at Apex Procurement. Spotted at Transcorp daily.', isBot: true },
  { id: 'bot_zainab', name: 'Hajiya Zainab Lawal', avatar: '👩🏾‍💼', track: 'civil', career: 'Civil Service', district: 'asokoro', score: 4620, netWorth: 42000000, clout: 92, blurb: 'Permanent Secretary with files that never miss the mark.', isBot: true },
  { id: 'bot_danjuma', name: 'Engr. Danjuma Gambo', avatar: '👨🏾‍🔧', track: 'contractor', career: 'Contractor / Vendor', district: 'guzape', score: 3950, netWorth: 68000000, clout: 74, blurb: 'Road and bridge contractor. Always on the Kubwa corridor.', isBot: true },
  { id: 'bot_tunde_san', name: 'Barr. Tunde Ogunleye (SAN)', avatar: '⚖️', track: 'civil', career: 'Senior Advocate', district: 'cbd', score: 3600, netWorth: 31000000, clout: 80, blurb: 'Senior Advocate at FCT High Court Maitama. Undefeated in rent & tender disputes.', isBot: true },
  { id: 'bot_amaka', name: 'Amaka "Wuse" Eze', avatar: '👩🏾', track: 'tech', career: 'Tech & Creative Nomad', district: 'wuse2', score: 2850, netWorth: 24500000, clout: 45, blurb: 'Fintech product lead earning in USD and playing Whot at Wuse 2 lounges.', isBot: true },
  { id: 'bot_sani', name: 'Mallam Sani Usman', avatar: '🧑🏾', track: 'trader', career: 'Street Trader & Transport', district: 'utako', score: 1720, netWorth: 14000000, clout: 32, blurb: 'Controls 15 kekes across the Utako and Jabi lake routes.', isBot: true },
  { id: 'bot_kemi', name: 'Kemi Balogun', avatar: '👩🏾‍💻', track: 'tech', career: 'Tech & Creative Nomad', district: 'jabi', score: 2150, netWorth: 16800000, clout: 38, blurb: 'Creative agency director running remote sprints by Jabi Lake.', isBot: true },
];

// --- 3. Live Connected Players & Autonomous Citizens ---
const livePlayers = new Map();

for (const b of prestigeBoard) {
  const c = DISTRICT_2D[b.district] || { x: 50, y: 50 };
  livePlayers.set(b.id, {
    ...b,
    x: +(c.x + (Math.random() - 0.5) * 4).toFixed(2),
    y: +(c.y + (Math.random() - 0.5) * 4).toFixed(2),
    status: 'Roaming Abuja',
    isHuman: false,
    isBot: true,
    lastSeen: Date.now(),
  });
}

// --- 4. Helper to Normalize Chat Messages (Supports both author/sender schemas) ---
function createChatMessage({
  id,
  channel = 'global',
  senderId,
  authorId,
  sender,
  author,
  avatar = '🧑🏾',
  rank = 'Citizen',
  district = 'cbd',
  toId = null,
  targetId = null,
  toName = null,
  targetName = null,
  text = '',
  isBot = false,
  isSystem = false,
  verified = false,
}) {
  const finalSenderId = senderId || authorId || 'anon';
  let finalSender = String(sender || author || 'Abuja Citizen').slice(0, 40);

  // Anti-scam filter: prevent non-system users from impersonating official staff/admin
  if (!isSystem && /(admin|moderator|lagos\s*life\s*team|abuja\s*life\s*staff|official\s*support)/i.test(finalSender)) {
    finalSender = 'Citizen_' + finalSenderId.slice(-4);
  }

  let cleanText = String(text || '').slice(0, 280);
  if (!isSystem && /(send\s+your\s+password|drop\s+your\s+seed\s+phrase|dm\s+for\s+free\s+wallet\s+hack)/i.test(cleanText)) {
    cleanText = '[⚠️ Blocked by FCT Anti-Scam Shield: Never share passwords or fall for wallet multiplier scams.]';
  }

  const finalToId = toId || targetId || null;
  const finalToName = toName || targetName || null;
  const now = Date.now();

  return {
    id: id || ('m_' + now + '_' + Math.random().toString(36).slice(2, 7)),
    channel,
    senderId: finalSenderId,
    authorId: finalSenderId,
    sender: finalSender,
    author: finalSender,
    avatar,
    rank,
    district,
    toId: finalToId,
    targetId: finalToId,
    toName: finalToName,
    targetName: finalToName,
    text: cleanText,
    timestamp: now,
    ts: now,
    isBot,
    isSystem,
    verified,
  };
}

// --- 5. Chat History (Paginated & High-Unread-Count Safe) ---
const chatHistory = [
  createChatMessage({
    id: 'm_seed_1',
    channel: 'global',
    senderId: 'fct_protocol',
    sender: '🛡️ FCT Safety & Protocol',
    avatar: '🇳🇬',
    rank: 'Official Notice',
    district: 'cbd',
    text: 'Welcome to Abuja Life! Official staff will NEVER DM you for passwords or money. All Naira (₦) is strictly in-game simulation currency.',
    isSystem: true,
    verified: true,
  }),
  createChatMessage({
    id: 'm_seed_2',
    channel: 'global',
    senderId: 'bot_emeka',
    sender: 'Chief Emeka "Aso" Okonkwo',
    avatar: '🧔🏾',
    rank: 'Maitama Royalty',
    district: 'maitama',
    text: 'Any serious contractor with BPP clearance at CBD today? Need a partner on a Tier-2 road supply.',
    isBot: true,
  }),
  createChatMessage({
    id: 'm_seed_3',
    channel: 'global',
    senderId: 'bot_amaka',
    sender: 'Amaka "Wuse" Eze',
    avatar: '👩🏾',
    rank: 'Tech Founder',
    district: 'wuse2',
    text: 'Who dey Wuse 2 or Jabi for a game of Whot or Ludo? ₦10k table stakes ready!',
    isBot: true,
  }),
  createChatMessage({
    id: 'm_seed_4',
    channel: 'global',
    senderId: 'bot_tunde_san',
    sender: 'Barr. Tunde Ogunleye (SAN)',
    avatar: '⚖️',
    rank: 'Senior Advocate',
    district: 'cbd',
    text: 'FCT High Court Maitama is in session! If your landlord hit you with an unlawful eviction or someone breached a contract, file your suit in the Court tab.',
    isBot: true,
  }),
];

// --- 6. Live FCT High Court Docket (/api/court) ---
const courtCases = [
  {
    id: 'case_101',
    plaintiff: 'Amaka "Wuse" Eze',
    defendant: 'Dawaki Estate Landlord',
    charge: 'Unlawful 2-Year Upfront Rent Hike Without Notice + Transformer Neglect',
    claimAmount: 450000,
    lawyer: 'Barr. Tunde Ogunleye (SAN)',
    evidence: 'Signed tenancy receipt + 14 days NEPA outage log',
    votesFor: 18,
    votesAgainst: 3,
    status: 'In Session',
    verdict: null,
    ts: Date.now() - 180000,
  },
  {
    id: 'case_102',
    plaintiff: 'Mallam Sani Usman',
    defendant: 'Airport Road Task Force Officer',
    charge: 'Wrongful Impoundment of Keke with Valid Garki VIO Particulars',
    claimAmount: 120000,
    lawyer: 'Barr. Chidi Nwosu',
    evidence: 'Stamped VIO roadworthiness certificate #ABJ-8841',
    votesFor: 29,
    votesAgainst: 4,
    status: 'In Session',
    verdict: null,
    ts: Date.now() - 95000,
  },
];

// --- 7. Live FCT Minister & CBN Policy Polls (/api/polls) ---
const activePolls = [
  {
    id: 'poll_fuel_subsidy',
    question: '⛽ FCT Transport & Fuel Relief Bill: Cap Airport Road & Kubwa fares by 25%?',
    title: '⛽ FCT Transport & Fuel Relief Bill',
    desc: 'Should the FCT Administration subsidize commuter bus fares and cap Airport Road / Kubwa transport costs by 25%?',
    options: [
      { id: 'yes_subsidy', label: 'Yes — Slash Commute Fares & Fuel Strain', votes: 142 },
      { id: 'infra_fund', label: 'No — Channel Funds to Maitama/CBD Tenders', votes: 49 },
    ],
  },
  {
    id: 'poll_rent_cap',
    question: '🏠 Abuja Tenancy Reform: Enforce 1-Year Max Rent instead of 2-Year Upfront?',
    title: '🏠 Abuja Tenancy Reform (1-Year vs 2-Year Upfront Rent)',
    desc: 'Enforce strict 1-year maximum rent demands across Lugbe, Kubwa, Jabi, and Wuse 2?',
    options: [
      { id: 'cap_1yr', label: 'Enforce 1-Year Max Rent & Tenant Rebate', votes: 218 },
      { id: 'free_market', label: 'Keep Free-Market Landlord Pricing', votes: 31 },
    ],
  },
];

// --- 8. Player-to-Player Paid Tasks & Errands Marketplace (/api/tasks) ---
const playerTasks = [
  {
    id: 'task_seed_1',
    creatorId: 'bot_emeka',
    creatorName: 'Chief Emeka "Aso" Okonkwo',
    assigneeId: null,
    assigneeName: 'Open to Any FCT Player',
    taskType: 'haul_granite',
    title: '🪨 Deliver 30-Ton Mpape Crushed Granite to Guzape Duplex Site',
    district: 'mpape',
    reward: 35000,
    employerBenefit: '+25% House Construction Progress & +3 Clout',
    status: 'open',
    completedBy: null,
    ts: Date.now() - 240000,
  },
  {
    id: 'task_seed_2',
    creatorId: 'bot_zainab',
    creatorName: 'Hajiya Zainab Lawal',
    assigneeId: null,
    assigneeName: 'Open to Any FCT Player',
    taskType: 'push_file',
    title: '📄 Dispatch Stamped BPP Procurement Dossier to CBD Annex',
    district: 'cbd',
    reward: 25000,
    employerBenefit: '+6 Protocol Clout & Fast-Track File',
    status: 'open',
    completedBy: null,
    ts: Date.now() - 160000,
  },
  {
    id: 'task_seed_3',
    creatorId: 'bot_amaka',
    creatorName: 'Amaka "Wuse" Eze',
    assigneeId: null,
    assigneeName: 'Open to Any FCT Player',
    taskType: 'shawarma_vip',
    title: '🌯 VIP Wuse 2 Double-Sausage Shawarma & Zobo Delivery to Jabi Tech Hub',
    district: 'wuse2',
    reward: 15000,
    employerBenefit: '+25 Energy & +20 Sanity',
    status: 'open',
    completedBy: null,
    ts: Date.now() - 90000,
  },
  {
    id: 'task_seed_4',
    creatorId: 'bot_danjuma',
    creatorName: 'Engr. Danjuma Gambo',
    assigneeId: null,
    assigneeName: 'Open to Any FCT Player',
    taskType: 'agis_cofo',
    title: '🏛️ Follow Up AGIS Certificate of Occupancy (C-of-O) File in Garki',
    district: 'garki',
    reward: 45000,
    employerBenefit: 'AGIS C-of-O Verification + 8 Clout',
    status: 'open',
    completedBy: null,
    ts: Date.now() - 45000,
  },
];

const playerInbox = new Map();
const sseClients = new Set();

function pushInbox(targetId, event) {
  if (!playerInbox.has(targetId)) playerInbox.set(targetId, []);
  const q = playerInbox.get(targetId);
  q.push(event);
  if (q.length > 80) q.shift();
}

function broadcastSSE(eventType, payload, targetPlayerId = null) {
  const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    if (targetPlayerId && client.playerId !== targetPlayerId) continue;
    try {
      client.res.write(data);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

// Periodically animate autonomous citizens in 0..100 FCT coordinates & broadcast to SSE
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of livePlayers.entries()) {
    if (p.isHuman && now - p.lastSeen > 45000) {
      livePlayers.delete(id);
    } else if (p.isBot) {
      const base = DISTRICT_2D[p.district] || { x: 50, y: 50 };
      const angle = (now / 4500 + id.length * 1.7) % (Math.PI * 2);
      p.x = +(base.x + Math.cos(angle) * 2.8).toFixed(2);
      p.y = +(base.y + Math.sin(angle) * 2.8).toFixed(2);
      p.lastSeen = now;
    }
  }

  if (sseClients.size > 0) {
    broadcastSSE('players', Array.from(livePlayers.values()));
  }
}, 2500);

// Ambient FCT radio & citizen chatter
const BOT_CHATS = [
  { id: 'bot_emeka', district: 'maitama', text: 'Just roofed my second duplex in Guzape! Need someone to run an AGIS C-of-O errand — check the Paid Tasks board for ₦35k!' },
  { id: 'bot_amaka', district: 'wuse2', text: 'Who dey Wuse 2 tonight? Yahuza Suya + Naija Whot table is open! Drop a message if you need a quick gig.' },
  { id: 'bot_sani', district: 'utako', text: 'Airport Road hold-up dey ease small. If you need Mpape granite hauled to your Lugbe or Dawaki plot, assign me a task!' },
  { id: 'bot_zainab', district: 'cbd', text: 'Ministry budget allocation meeting wrapped up. Assign a file-push task if your tender is stuck on the Director’s table.' },
  { id: 'bot_tunde_san', district: 'cbd', text: 'Remember: before you build house in Abuja, get your FCDA Development Control approval so Red-X demolition squad no touch your fence!' },
];

setInterval(() => {
  if (sseClients.size === 0) return;
  if (Math.random() < 0.35) {
    const sample = BOT_CHATS[Math.floor(Math.random() * BOT_CHATS.length)];
    const bot = livePlayers.get(sample.id);
    if (!bot) return;
    const msg = createChatMessage({
      channel: 'global',
      senderId: bot.id,
      sender: bot.name,
      avatar: bot.avatar,
      rank: bot.career,
      district: bot.district,
      text: sample.text,
      isBot: true,
    });
    chatHistory.push(msg);
    if (chatHistory.length > 250) chatHistory.shift();
    broadcastSSE('chat', msg);
  }
}, 28000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin':  'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.basis': 'image/basis',
};

function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (_) {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

export async function requestHandler(req, res, overridePath = null) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = overridePath || req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || parsedUrl.pathname;

  if (pathname.includes('?')) {
    pathname = pathname.split('?')[0];
  }

  if (!pathname.startsWith('/api/') && pathname !== '/api') {
    const knownApi = [
      '/stream', '/heartbeat', '/chat', '/players', '/court',
      '/polls', '/tasks', '/transfer', '/spray', '/connect-player',
      '/house-event', '/whot', '/bae'
    ];
    if (knownApi.some((p) => pathname.startsWith(p))) {
      pathname = '/api' + pathname;
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- 1. SSE STREAM ENDPOINT (/api/stream) ---
  if (pathname === '/api/stream' && req.method === 'GET') {
    const playerId = parsedUrl.searchParams.get('playerId') || 'anon_' + Date.now();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const client = { playerId, res };
    sseClients.add(client);

    res.write(`event: init\ndata: ${JSON.stringify({
      players: Array.from(livePlayers.values()),
      chat: chatHistory.slice(-80),
      courtCases: courtCases.slice(0, 10),
      polls: activePolls,
      tasks: playerTasks.slice(0, 25),
    })}\n\n`);

    req.on('close', () => {
      sseClients.delete(client);
    });

    if (process.env.VERCEL) {
      setTimeout(() => {
        try {
          res.end();
          sseClients.delete(client);
        } catch (_) {}
      }, 9000);
    }
    return;
  }

  // --- 2. LIVE PLAYER HEARTBEAT & 3D POSITION SYNC (/api/heartbeat) ---
  if (pathname === '/api/heartbeat' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      if (data && data.id) {
        const existing = livePlayers.get(data.id) || {};
        const coord = DISTRICT_2D[data.district] || { x: 50, y: 50 };
        const updated = {
          id: data.id,
          name: String(data.name || existing.name || 'Abuja Citizen').slice(0, 40),
          avatar: data.avatar || existing.avatar || '🧑🏾',
          track: data.track || existing.track || 'civil',
          career: data.career || existing.career || 'Civil Service',
          district: data.district || existing.district || 'cbd',
          clout: Math.round(data.clout ?? existing.clout ?? 10),
          netWorth: Math.round(data.netWorth ?? existing.netWorth ?? 500000),
          score: Math.round(data.score ?? existing.score ?? 100),
          x: typeof data.x === 'number' ? data.x : (existing.x ?? coord.x),
          y: typeof data.y === 'number' ? data.y : (existing.y ?? coord.y),
          baeName: data.baeName || existing.baeName || null,
          houseSummary: data.houseSummary || existing.houseSummary || null,
          carName: data.carName || existing.carName || null,
          isHuman: true,
          isBot: false,
          lastSeen: Date.now(),
        };
        livePlayers.set(data.id, updated);
      }

      const inbox = playerInbox.get(data.id) || [];
      playerInbox.set(data.id, []);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        players: Array.from(livePlayers.values()),
        inbox,
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 3. GET ONLINE PLAYERS (/api/players) ---
  if (pathname === '/api/players' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: Array.from(livePlayers.values()) }));
    return;
  }

  // --- 4. HIGH-UNREAD-SAFE PAGINATED CHAT (/api/chat) ---
  if (pathname === '/api/chat' && req.method === 'GET') {
    const limit = Math.min(200, Math.max(10, Number(parsedUrl.searchParams.get('limit')) || 80));
    const beforeParam = parsedUrl.searchParams.get('before');
    const channel = parsedUrl.searchParams.get('channel') || null;

    let pool = chatHistory;
    if (beforeParam) {
      const idx = pool.findIndex((m) => m.id === beforeParam || String(m.timestamp) === beforeParam);
      if (idx > 0) {
        pool = pool.slice(0, idx);
      }
    }
    if (channel && channel !== 'all') {
      pool = pool.filter((m) => m.channel === channel);
    }
    const slice = pool.slice(-limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      chat: slice,
      messages: slice,
      totalCount: pool.length,
      hasMore: pool.length > slice.length,
    }));
    return;
  }

  if (pathname === '/api/chat' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body || !body.text) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Message text required' }));
        return;
      }

      const msg = createChatMessage({
        channel: body.channel || 'global',
        senderId: body.senderId || body.authorId,
        sender: body.sender || body.author,
        avatar: body.avatar || '🧑🏾',
        rank: body.rank || 'Citizen',
        district: body.district || 'cbd',
        toId: body.toId || body.targetId,
        toName: body.toName || body.targetName,
        text: body.text,
      });

      chatHistory.push(msg);
      if (chatHistory.length > 250) chatHistory.shift();

      if (msg.channel === 'dm' && msg.toId) {
        broadcastSSE('chat', msg, msg.toId);
        broadcastSSE('chat', msg, msg.senderId);
        pushInbox(msg.toId, { type: 'chat', msg });
      } else {
        broadcastSSE('chat', msg);
      }

      // Smart Contextual Reply from Online Residents so players can easily chat with everyone in FCT
      const bots = Array.from(livePlayers.values()).filter((p) => p.isBot);
      let responder = msg.toId ? livePlayers.get(msg.toId) : null;
      if (!responder || !responder.isBot) {
        const lower = msg.text.toLowerCase();
        responder =
          bots.find((b) => lower.includes(b.name.split(' ')[1]?.toLowerCase() || '___')) ||
          bots.find((b) => b.district === msg.district) ||
          bots[Math.floor(Math.random() * bots.length)];
      }

      if (responder && responder.isBot && !body.isSystem) {
        setTimeout(() => {
          const lower = msg.text.toLowerCase();
          let replyText;
          if (/(house|build|land|plot|duplex|mansion|c-of-o|agis|cement|granite)/i.test(lower)) {
            replyText = `Oga ${msg.sender}, land for ${responder.district.toUpperCase()} is appreciating fast! Get your AGIS C-of-O early and assign a granite task if you dey build duplex.`;
          } else if (/(task|errand|work|job|help|assign|run|deliver)/i.test(lower)) {
            replyText = `I'm active in ${responder.district.toUpperCase()}, ${msg.sender}! Post the task in the 📋 Paid Tasks tab or assign it to me — I'll execute sharp-sharp.`;
          } else if (/(contract|tender|bpp|file|director|secretariat)/i.test(lower)) {
            replyText = `${msg.sender}, BPP tenders at CBD are moving today. Make sure your Protocol Clout is high or hire someone to push your file!`;
          } else if (/(whot|ludo|suya|wuse|chill|party|bae|date)/i.test(lower)) {
            replyText = `Correct vibe ${msg.sender}! Meet us by Wuse 2 Yahuza Suya spot or Jabi Lake Boat Club tonight — Naira go rain!`;
          } else {
            const generalReplies = [
              `How far ${msg.sender}! ${responder.district.toUpperCase()} road is clear right now — what's the move today?`,
              `Sharp guy ${msg.sender}! Need a contact or someone to run an FCT task for you? Just drop the word.`,
              `Abuja level dey rise, ${msg.sender}! Let's link up in ${responder.district.toUpperCase()} and lock in this Naira.`,
            ];
            replyText = generalReplies[Math.floor(Math.random() * generalReplies.length)];
          }

          const reply = createChatMessage({
            channel: msg.channel === 'dm' ? 'dm' : msg.channel,
            senderId: responder.id,
            sender: responder.name,
            avatar: responder.avatar,
            rank: responder.career,
            district: responder.district,
            toId: msg.channel === 'dm' ? msg.senderId : null,
            toName: msg.channel === 'dm' ? msg.sender : null,
            text: replyText,
            isBot: true,
          });
          chatHistory.push(reply);
          if (chatHistory.length > 250) chatHistory.shift();
          broadcastSSE('chat', reply);
        }, 1100);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, msg }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 4B. PLAYER-TO-PLAYER PAID TASKS & ERRANDS (/api/tasks) ---
  if (pathname === '/api/tasks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, tasks: playerTasks }));
    return;
  }

  if (pathname === '/api/tasks/create' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const reward = Math.min(2000000, Math.max(3000, Math.round(Number(body.reward) || 15000)));
      const taskType = body.taskType || 'push_file';
      const benefitLabels = {
        push_file: '+6 Protocol Clout & Secretariat File Boost',
        haul_granite: '+25% House Construction Progress & +3 Clout',
        clear_vio: '-35 VIO/FRSC Legal Heat & Clean Particulars',
        shawarma_vip: '+25 Energy & +20 Sanity Refreshment',
        agis_cofo: 'AGIS Land File Verification & +8 Clout',
      };

      const newTask = {
        id: 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
        creatorId: body.creatorId || 'anon',
        creatorName: String(body.creatorName || 'Abuja Citizen').slice(0, 40),
        assigneeId: body.assigneeId || null,
        assigneeName: body.assigneeName || 'Open to Any FCT Player',
        taskType,
        title: String(body.title || 'Run Abuja Protocol Errand').slice(0, 120),
        district: body.district || 'cbd',
        reward,
        employerBenefit: benefitLabels[taskType] || '+5 Protocol Clout',
        status: 'open',
        completedBy: null,
        ts: Date.now(),
      };

      playerTasks.unshift(newTask);
      if (playerTasks.length > 35) playerTasks.pop();

      const announceMsg = createChatMessage({
        channel: 'global',
        senderId: newTask.creatorId,
        sender: newTask.creatorName,
        avatar: '📋',
        rank: 'Paid FCT Task Offer',
        district: newTask.district,
        text: `💼 NEW PAID TASK (₦${reward.toLocaleString()}): "${newTask.title}" → Assigned to: ${newTask.assigneeName}. Check 📋 Tasks or click to earn ₦${reward.toLocaleString()}!`,
        isSystem: false,
      });
      chatHistory.push(announceMsg);
      broadcastSSE('chat', announceMsg);
      broadcastSSE('tasks', playerTasks);

      // If assigned to an online bot resident (or open and a resident grabs it after 4.5s), auto-complete & trigger employer benefit!
      const assignedBot = newTask.assigneeId ? livePlayers.get(newTask.assigneeId) : null;
      const shouldBotExecute = (assignedBot && assignedBot.isBot) || (!newTask.assigneeId);
      if (shouldBotExecute) {
        const workerBot = (assignedBot && assignedBot.isBot)
          ? assignedBot
          : Array.from(livePlayers.values()).find((p) => p.isBot && p.district === newTask.district) ||
            Array.from(livePlayers.values()).find((p) => p.isBot);

        if (workerBot) {
          setTimeout(() => {
            if (newTask.status !== 'open') return;
            newTask.status = 'completed';
            newTask.completedBy = workerBot.name;
            newTask.completedById = workerBot.id;

            const doneMsg = createChatMessage({
              channel: 'global',
              senderId: workerBot.id,
              sender: workerBot.name,
              avatar: workerBot.avatar,
              rank: workerBot.career,
              district: newTask.district,
              text: `✅ Oga ${newTask.creatorName}, I have completed your task "${newTask.title}"! Collected ₦${newTask.reward.toLocaleString()} escrow — your ${newTask.employerBenefit} is delivered!`,
              isBot: true,
            });
            chatHistory.push(doneMsg);
            broadcastSSE('chat', doneMsg);
            broadcastSSE('tasks', playerTasks);
            broadcastSSE('task_completed', newTask);
          }, 4200);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, task: newTask, tasks: playerTasks }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/api/tasks/complete' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const t = playerTasks.find((x) => x.id === body.taskId);
      if (!t || t.status !== 'open') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Task already completed or not found' }));
        return;
      }

      t.status = 'completed';
      t.completedBy = String(body.workerName || 'Abuja Citizen').slice(0, 40);
      t.completedById = body.workerId || 'anon';

      const sysMsg = createChatMessage({
        channel: 'global',
        senderId: 'cbn_wire',
        sender: '📋 FCT Task Escrow Desk',
        avatar: '✅',
        rank: 'Escrow Payout',
        district: t.district,
        text: `⚡ ${t.completedBy} executed "${t.title}" for ${t.creatorName} and earned ₦${t.reward.toLocaleString()} cash!`,
        isSystem: true,
        verified: true,
      });
      chatHistory.push(sysMsg);
      broadcastSSE('chat', sysMsg);
      broadcastSSE('tasks', playerTasks);
      broadcastSSE('task_completed', t);

      // Replenish open bot tasks if low so players always have paid errands to run
      if (playerTasks.filter((x) => x.status === 'open').length < 3) {
        const templates = [
          { creatorId: 'bot_emeka', creatorName: 'Chief Emeka "Aso" Okonkwo', taskType: 'haul_granite', title: '🪨 Haul 200 Bags of Dangote Cement from Nyanya to Maitama Site', district: 'maitama', reward: 40000 },
          { creatorId: 'bot_zainab', creatorName: 'Hajiya Zainab Lawal', taskType: 'push_file', title: '📄 Stamp Ministerial Memo at Federal Secretariat Phase II', district: 'cbd', reward: 28000 },
          { creatorId: 'bot_kemi', creatorName: 'Kemi Balogun', taskType: 'shawarma_vip', title: '🌯 Deliver Starlink Router & Suya Platter to Jabi Lake Studio', district: 'jabi', reward: 18000 },
          { creatorId: 'bot_sani', creatorName: 'Mallam Sani Usman', taskType: 'clear_vio', title: '🛂 Renew Fleet Roadworthiness Papers at Mabushi VIO Office', district: 'utako', reward: 22000 },
        ];
        const pick = templates[Math.floor(Math.random() * templates.length)];
        playerTasks.unshift({
          id: 'task_' + Date.now().toString(36),
          ...pick,
          assigneeId: null,
          assigneeName: 'Open to Any FCT Player',
          employerBenefit: '+Protocol & Site Progress',
          status: 'open',
          completedBy: null,
          ts: Date.now(),
        });
        broadcastSSE('tasks', playerTasks);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, task: t, tasks: playerTasks }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 4C. HOUSE CONSTRUCTION & REAL ESTATE MILESTONE BROADCAST (/api/house-event) ---
  if (pathname === '/api/house-event' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const playerName = String(body.playerName || 'Abuja Landlord').slice(0, 40);
      const district = body.district || 'guzape';
      const stageName = String(body.stageName || 'Luxury Duplex').slice(0, 80);

      const sysMsg = createChatMessage({
        channel: 'global',
        senderId: 'fct_protocol',
        sender: '🏗️ FCDA & AGIS Property Wire',
        avatar: '🏡',
        rank: 'Land Registry',
        district,
        text: `🏡 LANDLORD ALERT: ${playerName} just completed "${stageName}" on their plot in ${district.toUpperCase()}!`,
        isSystem: true,
        verified: true,
      });
      chatHistory.push(sysMsg);
      broadcastSSE('chat', sysMsg);
      broadcastSSE('world_event', { type: 'naira_spray', playerName, district, amount: 25000 });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 5. LIVE FCT HIGH COURT ENDPOINTS (/api/court) ---
  if (pathname === '/api/court' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, cases: courtCases }));
    return;
  }

  if (pathname === '/api/court/file' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const claimAmount = Math.min(5000000, Math.max(10000, Math.round(Number(body.claimAmount) || 100000)));
      const newCase = {
        id: 'case_' + Date.now().toString(36),
        plaintiffId: body.plaintiffId || 'anon',
        plaintiff: String(body.plaintiff || 'Abuja Citizen').slice(0, 40),
        defendant: String(body.defendant || 'Abuja Landlord').slice(0, 40),
        charge: String(body.charge || 'Breach of Abuja Contract & Protocol').slice(0, 140),
        district: body.district || 'maitama',
        claimAmount,
        lawyer: body.lawyer || 'Barr. Tunde Ogunleye (SAN)',
        evidence: String(body.evidence || 'Sworn Affidavit & CBN Transfer Receipt').slice(0, 140),
        votesFor: 1,
        votesAgainst: 0,
        status: 'In Session',
        verdict: null,
        verdictText: null,
        ts: Date.now(),
      };
      courtCases.unshift(newCase);
      if (courtCases.length > 25) courtCases.pop();

      const sysMsg = createChatMessage({
        channel: 'global',
        senderId: 'fct_court',
        sender: '⚖️ FCT High Court Maitama',
        avatar: '👩🏾‍⚖️',
        rank: 'High Court Registrar',
        district: 'maitama',
        text: `NEW LAWSUIT FILED: ${newCase.plaintiff} v. ${newCase.defendant} for ₦${claimAmount.toLocaleString()} ("${newCase.charge}"). Jury & Judge voting open!`,
        isSystem: true,
        verified: true,
      });
      chatHistory.push(sysMsg);
      broadcastSSE('chat', sysMsg);
      broadcastSSE('court', courtCases);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, courtCase: newCase, caseItem: newCase, cases: courtCases }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/api/court/verdict' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const c = courtCases.find((x) => x.id === body.caseId);
      if (!c) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Case not found' }));
        return;
      }

      const voteSide = body.vote || body.side;
      if (voteSide === 'for') c.votesFor++;
      else if (voteSide === 'against') c.votesAgainst++;

      let settlement = 0;
      const wantRuling = body.requestRuling || body.action === 'ruling';
      if (wantRuling && c.status !== 'settled') {
        const won = c.votesFor >= c.votesAgainst || Math.random() < 0.65;
        c.status = 'settled';
        settlement = won ? c.claimAmount : 0;
        c.verdictText = won
          ? `JUDGMENT FOR PLAINTIFF: Court awards ₦${c.claimAmount.toLocaleString()} damages to ${c.plaintiff}!`
          : `CASE DISMISSED: Insufficient particulars presented before the Magistrate.`;
        c.verdict = c.verdictText;

        const sysMsg = createChatMessage({
          channel: 'global',
          senderId: 'fct_court',
          sender: '⚖️ FCT High Court Maitama',
          avatar: '🔨',
          rank: 'Chief Judge Ruling',
          district: 'maitama',
          text: `${c.verdictText} (${c.plaintiff} v. ${c.defendant})`,
          isSystem: true,
          verified: true,
        });
        chatHistory.push(sysMsg);
        broadcastSSE('chat', sysMsg);
      }

      broadcastSSE('court', courtCases);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, courtCase: c, caseItem: c, settlement, cases: courtCases }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 6. "ASK TO BE BAE" & RELATIONSHIP SYSTEM (/api/bae) ---
  if (pathname === '/api/bae' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const fromName = String(body.fromName || 'Abuja Citizen').slice(0, 40);
      const toName = String(body.toName || 'Abuja Crush').slice(0, 40);
      const action = body.action || 'propose';

      const text = action === 'date'
        ? `💖 ${fromName} & ${toName} just went on a VIP Couple Date at ${String(body.spot || 'Jabi Lake Boat Club')}! Love dey sweet for Abuja when Naira dey!`
        : `💍 ${fromName} just asked ${toName} to be their official Abuja Bae! 🥂❤️`;

      const sysMsg = createChatMessage({
        channel: 'global',
        senderId: 'fct_love',
        sender: '❤️ Abuja Love & Family Wire',
        avatar: '💍',
        rank: 'Relationship Registry',
        district: body.district || 'jabi',
        text,
        isSystem: true,
      });
      chatHistory.push(sysMsg);
      broadcastSSE('chat', sysMsg);
      broadcastSSE('bae_event', { fromId: body.fromId, fromName, toId: body.toId, toName, action });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, accepted: true, partnerName: toName, message: text }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 7. FCT MINISTER & CBN POLICY POLLS (/api/polls) ---
  if (pathname === '/api/polls' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, polls: activePolls }));
    return;
  }

  if (pathname === '/api/polls/vote' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const poll = activePolls.find((p) => p.id === body.pollId);
      if (poll) {
        const opt = typeof body.optionIndex === 'number'
          ? poll.options[body.optionIndex]
          : poll.options.find((o) => o.id === body.optionId);
        if (opt) opt.votes++;
      }
      broadcastSSE('polls', activePolls);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, polls: activePolls }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 8. PEER-TO-PEER NAIRA WIRE TRANSFER (/api/transfer) ---
  if (pathname === '/api/transfer' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const amount = Math.round(Number(body.amount) || 0);
      if (!body.fromId || !body.toId || amount <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid transfer details' }));
        return;
      }
      const target = livePlayers.get(body.toId);
      const tx = {
        id: 'tx_' + Date.now(),
        fromId: body.fromId,
        fromName: body.fromName || 'Abuja Citizen',
        toId: body.toId,
        toName: target?.name || body.toName || 'Citizen',
        amount,
        note: String(body.note || 'CBN Instant Transfer').slice(0, 80),
        ts: Date.now(),
      };

      broadcastSSE('transfer', tx);
      pushInbox(body.toId, { type: 'transfer', tx });

      const sysMsg = createChatMessage({
        channel: 'global',
        senderId: 'cbn_wire',
        sender: '🏦 CBN Instant Wire Alert',
        avatar: '💸',
        rank: 'CBN Treasury',
        district: 'cbd',
        text: `${tx.fromName} wired ₦${amount.toLocaleString()} to ${tx.toName} ("${tx.note}").`,
        isSystem: true,
        verified: true,
      });
      chatHistory.push(sysMsg);
      broadcastSSE('chat', sysMsg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, tx }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 9. PLAYER-TO-PLAYER CONNECTION / NETWORK LINK (/api/connect-player) ---
  if (pathname === '/api/connect-player' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.fromId || !body.toId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing player IDs' }));
        return;
      }
      const target = livePlayers.get(body.toId);
      const linkEvent = {
        id: 'link_' + Date.now(),
        fromId: body.fromId,
        fromName: body.fromName || 'Abuja Citizen',
        toId: body.toId,
        toName: target?.name || body.toName || 'Abuja Partner',
        district: body.district || 'cbd',
        ts: Date.now(),
      };

      broadcastSSE('connection', linkEvent);
      pushInbox(body.toId, { type: 'connection', link: linkEvent });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, link: linkEvent }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 10. NAIRA SPRAY PARTY EVENT (/api/spray) ---
  if (pathname === '/api/spray' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const amount = Math.round(Number(body.amount) || 5000);
      const playerName = body.playerName || body.author || 'Oga at the Top';
      const district = body.district || 'wuse2';

      broadcastSSE('world_event', { type: 'naira_spray', playerName, district, amount });

      const sysMsg = createChatMessage({
        channel: 'global',
        senderId: 'wuse_hype',
        sender: '🍾 Wuse 2 Hype MC',
        avatar: '💵',
        rank: 'Nightlife Wire',
        district,
        text: `🔥🔥 ${playerName} just sprayed crisp ₦1,000 notes (₦${amount.toLocaleString()}) in ${district.toUpperCase()}!`,
        isSystem: true,
      });
      chatHistory.push(sysMsg);
      broadcastSSE('chat', sysMsg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // --- 11. Vendor Three.js Serve ---
  if (pathname === '/vendor/three.module.js' || pathname === '/vendor/three.core.js') {
    const fileName = path.basename(pathname);
    const threePath = path.join(__dirname, 'node_modules', 'three', 'build', fileName);
    if (fs.existsSync(threePath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(threePath).pipe(res);
      return;
    }
  }

  // --- 11b. Vendor Three.js Addons (JSM) — serves node_modules/three/examples/jsm/ ---
  if (pathname.startsWith('/vendor/jsm/')) {
    const relPath = pathname.slice('/vendor/jsm/'.length);
    const addonPath = path.normalize(path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm', relPath));
    // Security: must stay inside jsm dir
    const jsmRoot = path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm');
    if (!addonPath.startsWith(jsmRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied');
      return;
    }
    if (fs.existsSync(addonPath) && fs.statSync(addonPath).isFile()) {
      const ext = path.extname(addonPath).toLowerCase();
      const ct = MIME_TYPES[ext] || 'application/javascript; charset=utf-8';
      res.writeHead(200, { 'Content-Type': ct });
      fs.createReadStream(addonPath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`JSM addon not found: ${relPath}`);
    return;
  }

  // --- 12. Static Files ---
  let filePath;
  if (pathname.startsWith('/src/')) {
    filePath = path.join(__dirname, pathname);
  } else if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'public', 'index.html');
  } else {
    filePath = path.join(__dirname, 'public', pathname);
  }

  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(normalizedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not Found: ${pathname}`);
      return;
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(normalizedPath).pipe(res);
  });
}

export default requestHandler;

if (!process.env.VERCEL) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`   ABUJA LIFE: GTA 3D EDITION RUNNING ON PORT ${PORT}`);
    console.log(`   URL: http://localhost:${PORT}`);
    console.log(`   Real-Time Multiplayer SSE & 3D FCT World Active`);
    console.log(`====================================================`);
  });
}
