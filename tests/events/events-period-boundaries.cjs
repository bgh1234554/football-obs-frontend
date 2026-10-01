// Run: node tests/events/events-period-boundaries.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = new Map();
const root = path.resolve(process.argv[2] || path.join(__dirname, '../..'));
const source = ['js/core/event-time.js', 'js/panels/events-panel.js']
  .map(file => path.join(root, file)).filter(file => fs.existsSync(file))
  .map(file => fs.readFileSync(file, 'utf8')).join('\n');
function load() {
  const context = vm.createContext({
    window: {}, document: { addEventListener() {}, querySelectorAll() { return []; } },
    localStorage: { getItem() { return null; } },
    sessionStorage: { getItem(key) { return storage.get(key); }, setItem(key, value) { storage.set(key, value); } },
  });
  vm.runInContext(source, context);
  return context;
}
const context = load();
const { evSortKey, evBuildPeriodMarkers, evActiveBoundaryElapsedSet, evMergeWithPeriodMarkers, evObserveBoundaryEvents } = context;
const fixture = (id, status, events, elapsed = 45) => ({ matchInfo: { fixtureId: id, status, elapsed }, events });
function render(data, api = context) {
  const observations = api.evObserveBoundaryEvents(data);
  const active = api.evActiveBoundaryElapsedSet(data.matchInfo, data.events);
  const processed = api.evProcess(data.events);
  return api.evMergeWithPeriodMarkers(processed, api.evBuildPeriodMarkers(data.matchInfo, processed), active, observations);
}

// Fixture 1583654: the 45' penalty is still a first-half goal, even after HT/2H polling.
const events = [
  { elapsed: 3, extra: null, side: 'away', playerId: 291649, playerName: '반데르송', assistId: 506275, type: 'Goal', detail: 'Normal Goal', comments: null },
  { elapsed: 28, extra: null, side: 'home', playerId: 348568, playerName: 'A. 치르카티', type: 'Goal', detail: 'Normal Goal', comments: null },
  { elapsed: 33, extra: null, side: 'home', playerId: 6904, playerName: 'C. 멧칼프', assistId: 348568, type: 'Goal', detail: 'Normal Goal', comments: null },
  { elapsed: 40, extra: null, side: 'away', playerId: 22224, playerName: 'G. 마갈량이스', type: 'Card', detail: 'Yellow Card', comments: 'Roughing' },
  { elapsed: 45, extra: null, side: 'away', playerId: 1496, playerName: '하피냐', type: 'Goal', detail: 'Penalty', comments: null },
];
const original = JSON.stringify(events);
for (const status of ['HT', '2H', 'FT']) {
  const info = { status, elapsed: status === 'FT' ? 90 : 45 };
  const items = render({ matchInfo: { ...info, fixtureId: '1583654' }, events: events.slice().reverse() });
  const halftime = items.findIndex(item => item.marker?.label === '하프타임');
  const goal = items.findIndex(item => item.ev?.playerId === 1496);
  assert(halftime >= 0 && goal > halftime, `${status}: the 45' penalty must appear below halftime in newest-first order`);
}
const allBoundaries = new Set([45, 90, 105, 120]);
for (const elapsed of allBoundaries) {
  for (const detail of ['Normal Goal', 'Penalty', 'Own Goal', 'Missed Penalty']) {
    for (const extra of [null, undefined, '', 0, 4]) {
      const goal = { elapsed, extra, type: 'Goal', detail };
      assert.equal(evSortKey(goal), elapsed * 100 + Number(extra || 0));
    }
  }
  for (const type of ['subst', 'Card']) {
    assert.equal(evSortKey({ elapsed, extra: null, type }, allBoundaries), elapsed === 45 && type === 'subst' ? 4600 : elapsed * 100);
    assert.equal(evSortKey({ elapsed, extra: 4, type }), elapsed * 100 + 4);
    assert.equal(evSortKey({ elapsed, extra: null, type }, new Set()), elapsed * 100);
  }
}

// Receipt after HT alone is not evidence: both cold loads and late arrivals default to 1H.
const early = { elapsed: 45, extra: null, type: 'Card', detail: 'Yellow Card', side: 'home', playerId: 10, playerName: 'Early' };
const late = { ...early, playerId: 20, playerName: 'Late' };
const sub = { ...early, type: 'subst', detail: 'Substitution 1', playerId: 30 };
const lateSub = { ...sub, playerId: 40 };
const stoppage = { ...early, playerId: 50, extra: 4 };
const secondHalf = { ...early, playerId: 60, elapsed: 46 };
render(fixture('live', '1H', [early, sub, stoppage]));
for (const status of ['HT', '2H', 'FT']) {
  const items = render(fixture('live', status, [early, late, sub, lateSub, stoppage, secondHalf]));
  const marker = items.findIndex(item => item.marker?.label === '하프타임');
  for (const id of [10, 20, 30, 40, 50]) assert(items.findIndex(item => item.ev?.playerId === id) > marker, `${id}: preserve proven 1H`);
  assert(items.findIndex(item => item.ev?.playerId === 60) < marker, '46 minute event is after HT');
}

const keyOf = context.evBoundaryEventKey;
function readDecision(id, status, raw, target = lateSub, elapsed = 46) {
  const data = fixture(id, status, raw, elapsed);
  const obs = evObserveBoundaryEvents(data);
  return { ...obs[keyOf(target)], key: evSortKey(target, evActiveBoundaryElapsedSet(data.matchInfo, raw), obs) };
}
const bracketed = [stoppage, lateSub, secondHalf];
const bracketedOriginal = JSON.stringify(bracketed);
assert.deepEqual(readDecision('neighbors', 'HT', [stoppage, lateSub]), { after: false, reason: 'default-before', key: 4600 });
assert.deepEqual(readDecision('neighbors', '2H', bracketed), { after: true, reason: 'neighbors-after', key: 4600 });
assert.deepEqual(readDecision('reversed', 'FT', bracketed.slice().reverse()), { after: true, reason: 'neighbors-after', key: 4600 });
// Reevaluate at every poll: disappearance/reordering of supporting events revokes a guess.
assert.deepEqual(readDecision('neighbors', '2H', [lateSub, stoppage, secondHalf]), { after: false, reason: 'default-before', key: 4600 });
assert.equal(readDecision('neighbors', '2H', bracketed).after, true);
assert.equal(readDecision('neighbors', '2H', [stoppage, lateSub]).after, false);
assert.equal(JSON.stringify(bracketed), bracketedOriginal, 'Inference must not reorder source arrays');
// The earlier 1H observation wins over apparently convincing neighbors.
readDecision('observed-proof', '1H', [lateSub]);
assert.deepEqual(readDecision('observed-proof', '2H', bracketed), { after: false, reason: 'observed-before', key: 4500 });
const before45 = { ...early, elapsed: 44, playerId: 90 };
assert.equal(readDecision('before-neighbors', 'HT', [before45, lateSub, stoppage]).reason, 'neighbors-before');
// Unsupported/ambiguous order and distant next-period events stay conservative.
for (const [id, raw] of [
  ['no-extra-anchor', [before45, lateSub, secondHalf]],
  ['no-right', [stoppage, lateSub]],
  ['no-left', [lateSub, secondHalf]],
  ['distant', [stoppage, lateSub, { ...secondHalf, elapsed: 80 }]],
  ['mixed-order', [secondHalf, before45, stoppage, lateSub, { ...secondHalf, elapsed: 47 }]],
  ['invalid-time', [stoppage, lateSub, { ...secondHalf, elapsed: 'bad' }]],
  ['different-boundary-in-cluster', [stoppage, { ...lateSub, elapsed: 90 }, lateSub, secondHalf]],
  ['unoriented', [lateSub, { ...lateSub, playerId: 41 }]],
]) assert.equal(readDecision(id, 'FT', raw).after, false, id);
const anotherSub = { ...lateSub, playerId: 41 };
for (const target of [lateSub, anotherSub]) {
  assert.equal(readDecision('cluster', '2H', [stoppage, lateSub, anotherSub, secondHalf], target).after, true);
}
assert.equal(readDecision('still-1h', '1H', bracketed).after, false);
// Cards and goals do not become interval events even with the same neighboring timestamps.
for (const target of [late, { ...late, type: 'Goal', detail: 'Penalty' }]) {
  assert.equal(readDecision(`type-${target.type}`, '2H', [stoppage, target, secondHalf], target).key, 4500);
}
// Hidden rows must not remove raw ordering evidence; edited rows must not inherit an API guess.
const hiddenData = { ...fixture('raw-hidden', '2H', [lateSub]), _rawEvents: bracketed };
const rawObs = evObserveBoundaryEvents(hiddenData);
assert.equal(evSortKey(lateSub, new Set([45]), rawObs), 4600);
assert.equal(evSortKey({ ...lateSub, _evEdited: true }, new Set([45]), rawObs), 4500);
// Missing vs zero extra, translated names and corrected assists must not create new observations.
const corrected = { ...early, extra: 0, playerName: 'Renamed', assistId: 999 };
const observed = evObserveBoundaryEvents(fixture('live', '2H', [corrected]));
assert.equal(evSortKey(corrected, new Set([45]), observed), 4500);
// Raw signature preserves identity even if display ID/name are remapped by the UI.
const rawSig = JSON.stringify(['home', 'Card', 'Yellow Card', '', 45, 0, 70, 'Original', 0, '']);
render(fixture('raw', '1H', [{ ...early, playerId: 70, _hideSig: rawSig }]));
const remapped = { ...early, playerId: 700, _hideSig: rawSig };
assert.equal(evSortKey(remapped, new Set([45]), evObserveBoundaryEvents(fixture('raw', 'HT', [remapped]))), 4500);
// A late extra correction is stronger evidence than arrival time; retain it if extra disappears again.
assert.equal(readDecision('correction', '2H', bracketed).after, true);
render(fixture('correction', '2H', [{ ...lateSub, extra: 2 }]));
assert.deepEqual(readDecision('correction', '2H', bracketed), { after: false, reason: 'added-time', key: 4500 });
// A fresh fixture has no evidence about old cards: use the conservative default.
assert.equal(evSortKey(early, new Set([45]), evObserveBoundaryEvents(fixture('cold', 'HT', [early]))), 4500);
// Fixture switching and reloads do not erase known first-half events.
render(fixture('live', '1H', [early]));
const reloaded = load();
assert.equal(reloaded.evSortKey(early, new Set([45]), reloaded.evObserveBoundaryEvents(fixture('live', 'HT', [early]))), 4500);
// Observation must happen even with no visible event panel (before category filtering/rendering).
context.applyEventsPanel(fixture('hidden-panel', '1H', [early]));
assert.equal(evSortKey(early, new Set([45]), evObserveBoundaryEvents(fixture('hidden-panel', 'HT', [early]))), 4500);
// Apply the same history policy to extra-time intervals, while keeping 90' before ordinary FT.
for (const [elapsed, before, after] of [[90, '2H', 'ET1'], [105, 'ET1', 'ET2'], [120, 'ET2', 'PSO']]) {
  const ev = { ...sub, elapsed };
  render(fixture(`et-${elapsed}`, before, [ev], elapsed));
  const newSub = { ...ev, playerId: 99 };
  const data = fixture(`et-${elapsed}`, after, [{ ...stoppage, elapsed }, ev, newSub, { ...secondHalf, elapsed: elapsed + 1 }], elapsed);
  const obs = evObserveBoundaryEvents(data);
  const active = evActiveBoundaryElapsedSet(data.matchInfo, data.events);
  assert.equal(evSortKey(ev, active, obs), elapsed * 100);
  assert.equal(evSortKey(newSub, active, obs), elapsed * 100 + 51);
}
// Ordinary FT must never enable the 90-minute interval even with plausible neighbors.
assert.equal(readDecision('no-et', 'FT', bracketed.map(ev => ({ ...ev, elapsed: ev.elapsed + 45 })), { ...lateSub, elapsed: 90 }, 90).key, 9000);
// Migrate only proven before-boundary facts from v1; its old HT-arrival guesses are discarded.
storage.delete('obs.events.boundary-history.v2');
storage.set('obs.events.boundary-history.v1', JSON.stringify([['migrate', { observations: { [keyOf(sub)]: false, [keyOf(lateSub)]: true } }]]));
const migrated = load();
const migratedObs = migrated.evObserveBoundaryEvents(fixture('migrate', '2H', [sub, lateSub]));
assert.equal(migratedObs[keyOf(sub)].reason, 'observed-before');
assert.equal(migratedObs[keyOf(lateSub)].reason, 'default-before');
// Storage is bounded and optional; broken JSON must not prevent rendering.
for (let i = 0; i < 20; i += 1) render(fixture(`bounded-${i}`, '1H', [early]));
assert(JSON.parse(storage.get('obs.events.boundary-history.v2')).length <= 12);
storage.set('obs.events.boundary-history.v2', 'invalid');
assert.doesNotThrow(() => render(fixture('broken-storage', 'HT', [early]), load()));
const noStorage = vm.createContext({ window: {}, document: { addEventListener() {}, querySelectorAll() { return []; } } });
vm.runInContext(source, noStorage);
assert.doesNotThrow(() => render(fixture('no-storage', '1H', [early]), noStorage));
const firstHalf = { status: '1H', elapsed: 45 };
assert.equal(evBuildPeriodMarkers(firstHalf, events).length, 0);
assert.equal(evSortKey(events[4]), 4500);
assert.equal(evSortKey({ elapsed: 90, extra: null, type: 'subst' }, evActiveBoundaryElapsedSet({ status: 'FT', elapsed: 90 })), 9000);
const shootout = { elapsed: 45, extra: null, type: 'Goal', detail: 'Penalty', comments: 'Penalty Shootout' };
assert.equal(evSortKey(shootout), 12100);
assert.equal(JSON.stringify(events), original, 'Sorting must not modify source events');
// BT with missing elapsed still ends regulation; added time must not imply extra time.
for (const elapsed of [0, null, undefined, 90]) {
  const info = { status: 'BT', elapsed };
  const raw = [{ elapsed: 90, extra: 15, type: 'Card' }];
  assert.equal(context.evBreakElapsed(info, raw), 90);
  assert.deepEqual(Array.from(evBuildPeriodMarkers(info, raw), m => m.label), ['하프타임', '후반종료']);
  assert.deepEqual(Array.from(evActiveBoundaryElapsedSet(info, raw)), [45, 90]);
}
assert.equal(context.evBreakElapsed({ status: 'BT', elapsed: 105 }), 105);
assert.equal(context.evBreakElapsed({ status: 'FT', elapsed: 90 }), null);
assert.deepEqual(Array.from(evBuildPeriodMarkers({ status: 'BT', elapsed: 0 }, [{ elapsed: 101 }]), m => m.label), ['하프타임', '후반종료', '연장 전반 종료']);
console.log('PASS: fixture 1583654, conservative defaults, neighbor inference/retraction, reverse/malformed order, clusters, raw/edited events, history priority/migration, reloads, extra time, FT and shootouts.');
