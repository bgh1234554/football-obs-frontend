// 실행: node tests/events/events-period-boundaries.cjs
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

// 경기 1583654: 하프타임/후반 폴링 이후에도 45분 페널티 골은 전반 골입니다.
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

// 하프타임 이후 수신만으로는 판단할 수 없으므로, 최초 로딩과 지연 수신 모두 기본값을 전반으로 둡니다.
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
// 폴링마다 다시 판단하며, 근거 이벤트가 사라지거나 순서가 바뀌면 추정을 취소합니다.
assert.deepEqual(readDecision('neighbors', '2H', [lateSub, stoppage, secondHalf]), { after: false, reason: 'default-before', key: 4600 });
assert.equal(readDecision('neighbors', '2H', bracketed).after, true);
assert.equal(readDecision('neighbors', '2H', [stoppage, lateSub]).after, false);
assert.equal(JSON.stringify(bracketed), bracketedOriginal, 'Inference must not reorder source arrays');
// 주변 이벤트가 다른 시점을 가리켜도 먼저 확인된 전반 기록을 우선합니다.
readDecision('observed-proof', '1H', [lateSub]);
assert.deepEqual(readDecision('observed-proof', '2H', bracketed), { after: false, reason: 'observed-before', key: 4500 });
const before45 = { ...early, elapsed: 44, playerId: 90 };
assert.equal(readDecision('before-neighbors', 'HT', [before45, lateSub, stoppage]).reason, 'neighbors-before');
// 판단 근거가 없거나 순서가 모호하거나 다음 구간 이벤트가 멀리 있으면 보수적으로 처리합니다.
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
// 주변 이벤트의 시각이 같더라도 카드와 골을 구간 사이 이벤트로 분류하지 않습니다.
for (const target of [late, { ...late, type: 'Goal', detail: 'Penalty' }]) {
  assert.equal(readDecision(`type-${target.type}`, '2H', [stoppage, target, secondHalf], target).key, 4500);
}
// 숨긴 행 때문에 원본 순서의 근거를 잃지 않아야 하며, 편집한 행에는 API 기반 추정을 적용하지 않습니다.
const hiddenData = { ...fixture('raw-hidden', '2H', [lateSub]), _rawEvents: bracketed };
const rawObs = evObserveBoundaryEvents(hiddenData);
assert.equal(evSortKey(lateSub, new Set([45]), rawObs), 4600);
assert.equal(evSortKey({ ...lateSub, _evEdited: true }, new Set([45]), rawObs), 4500);
// 추가시간 누락과 0의 차이, 번역된 이름, 수정된 도움 정보로 새 관측 기록을 만들지 않습니다.
const corrected = { ...early, extra: 0, playerName: 'Renamed', assistId: 999 };
const observed = evObserveBoundaryEvents(fixture('live', '2H', [corrected]));
assert.equal(evSortKey(corrected, new Set([45]), observed), 4500);
// 화면에서 표시 ID나 이름을 다시 연결해도 원본 서명으로 동일한 이벤트를 식별합니다.
const rawSig = JSON.stringify(['home', 'Card', 'Yellow Card', '', 45, 0, 70, 'Original', 0, '']);
render(fixture('raw', '1H', [{ ...early, playerId: 70, _hideSig: rawSig }]));
const remapped = { ...early, playerId: 700, _hideSig: rawSig };
assert.equal(evSortKey(remapped, new Set([45]), evObserveBoundaryEvents(fixture('raw', 'HT', [remapped]))), 4500);
// 늦게 수정된 추가시간은 수신 시각보다 강한 근거이며, 이후 추가시간이 누락되어도 유지합니다.
assert.equal(readDecision('correction', '2H', bracketed).after, true);
render(fixture('correction', '2H', [{ ...lateSub, extra: 2 }]));
assert.deepEqual(readDecision('correction', '2H', bracketed), { after: false, reason: 'added-time', key: 4500 });
// 새 경기에는 이전 카드의 근거가 없으므로 보수적인 기본값을 사용합니다.
assert.equal(evSortKey(early, new Set([45]), evObserveBoundaryEvents(fixture('cold', 'HT', [early]))), 4500);
// 경기 전환과 새로고침으로 확인된 전반 이벤트 기록이 지워지지 않습니다.
render(fixture('live', '1H', [early]));
const reloaded = load();
assert.equal(reloaded.evSortKey(early, new Set([45]), reloaded.evObserveBoundaryEvents(fixture('live', 'HT', [early]))), 4500);
// 이벤트 패널이 보이지 않아도 분류 필터와 렌더링 전에 이벤트를 관측해야 합니다.
context.applyEventsPanel(fixture('hidden-panel', '1H', [early]));
assert.equal(evSortKey(early, new Set([45]), evObserveBoundaryEvents(fixture('hidden-panel', 'HT', [early]))), 4500);
// 연장전 구간에도 같은 기록 정책을 적용하되, 일반 경기 종료 전 90분 이벤트는 유지합니다.
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
// 주변 이벤트가 그럴듯해도 일반 경기 종료에서는 90분 경계 구간을 활성화하지 않습니다.
assert.equal(readDecision('no-et', 'FT', bracketed.map(ev => ({ ...ev, elapsed: ev.elapsed + 45 })), { ...lateSub, elapsed: 90 }, 90).key, 9000);
// v1에서는 경계 이전으로 확인된 기록만 이전하고, 하프타임 수신 시각에 따른 기존 추정은 버립니다.
storage.delete('obs.events.boundary-history.v2');
storage.set('obs.events.boundary-history.v1', JSON.stringify([['migrate', { observations: { [keyOf(sub)]: false, [keyOf(lateSub)]: true } }]]));
const migrated = load();
const migratedObs = migrated.evObserveBoundaryEvents(fixture('migrate', '2H', [sub, lateSub]));
assert.equal(migratedObs[keyOf(sub)].reason, 'observed-before');
assert.equal(migratedObs[keyOf(lateSub)].reason, 'default-before');
// 저장 기록은 크기를 제한하고 선택적으로 사용하며, 손상된 JSON이 렌더링을 막지 않도록 합니다.
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
// 경과 시간이 누락된 BT도 정규시간 종료로 처리하고, 추가시간을 연장전으로 해석하지 않습니다.
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
