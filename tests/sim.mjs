import { Game } from '../src/core/game.js';
import { TRACK_IDS } from '../src/data/careers.js';
import { planTrip, executeTrip } from '../src/core/travel.js';
import { listActions } from '../src/core/actions.js';
import { renew, renewalQuote } from '../src/core/housing.js';
import { callFavour, checkIn, favoursFor } from '../src/core/contacts.js';
import { promotionReqs, promote } from '../src/core/careers.js';
import { netWorth, abujaScore, rankOf } from '../src/core/state.js';

console.log('--- ABUJA LIFE: HEADLESS ENGINE VALIDATION ---');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  // Test 1: Instantiation of each track
  for (const track of TRACK_IDS) {
    const game = Game.create({ name: `Test ${track}`, track, seed: 12345 });
    assert(game.s.career.track === track, `Initialises track: ${track}`);
    assert(game.funds() > 0, `Starting funds exist for ${track}: ₦${game.funds().toLocaleString()}`);
    assert(game.s.contacts.length > 0, `Initial contacts created for ${track}`);
    assert(game.day === 1, `Starts on day 1`);
  }

  // Test 2: Hybrid tick / advance
  const g = Game.create({
    name: 'Alhaji Tester',
    track: 'civil',
    seed: 42
  }, {
    decide: async (d) => {
      // Pick first non-disabled option
      const opt = d.options.find(o => !o.disabled);
      return opt ? opt.id : d.options[0]?.id;
    }
  });

  const t0 = g.s.t;
  await g.advance(120);
  assert(g.s.t === t0 + 120, `Advanced 120 minutes of game time`);

  // Test 3: Travel planning & execution
  const routes = planTrip(g, 'cbd');
  assert(routes.length > 0, `Generated route(s) from ${g.s.loc.district} to CBD`);
  const r0 = routes[0];
  const tripResult = await executeTrip(g, r0, 'bus');
  assert(tripResult.ok, `Executed trip to CBD via ${r0.label}`);
  assert(g.s.loc.district === 'cbd', `Player is now in CBD`);

  // Test 4: Landmarks & Spot visit
  const visited = await g.goToSpot('national_mosque');
  assert(visited, `Visited National Mosque in CBD`);
  assert(g.s.loc.spot === 'national_mosque', `Player spot is set to national_mosque`);

  // Test 5: Actions listing
  const actions = listActions(g);
  assert(actions.length > 0, `Discovered ${actions.length} valid actions in CBD at National Mosque`);

  // Test 6: Worship action
  const worshipRes = await g.runAction('worship');
  assert(worshipRes.ok, `Performed worship action`);

  // Test 7: Multi-day advance to test economic tickers (rent, salary, fuel, market)
  const dayBefore = g.day;
  await g.advance(1440 * 3); // 3 days
  assert(g.day === dayBefore + 3, `Advanced 3 full days with midnight tickers`);
  assert(g.s.market.fx > 1000, `FX market is running: ₦${g.s.market.fx}/$`);
  assert(g.s.market.fuel > 500, `Fuel price ticker is running: ₦${g.s.market.fuel}/L`);

  // Test 8: Contacts & Favours
  const c = g.s.contacts[0];
  if (c) {
    const fList = favoursFor(c);
    assert(Array.isArray(fList), `Retrieved favours for contact ${c.name}`);
    await checkIn(g, c.id);
    assert(c.affinity > 0, `Checked in with contact: affinity now ${c.affinity}`);
  }

  // Test 9: Score, Net Worth & Ranking
  const nw = netWorth(g.s);
  const sc = abujaScore(g.s);
  const rk = rankOf(g.s);
  assert(nw > 0, `Net worth calculated: ₦${nw.toLocaleString()}`);
  assert(sc >= 0, `Abuja score: ${sc}`);
  assert(typeof rk === 'string', `Rank title assigned: "${rk}"`);

  // Test 10: Serialization & Deserialization
  const savedJson = g.serialize();
  assert(typeof savedJson === 'string' && savedJson.length > 100, `Serialized game state to JSON`);
  const loadedGame = Game.load(savedJson, g.hooks);
  assert(loadedGame.s.meta.name === g.s.meta.name, `Loaded game maintains player name`);
  assert(loadedGame.s.t === g.s.t, `Loaded game maintains clock position`);

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
