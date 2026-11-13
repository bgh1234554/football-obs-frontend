const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
let manualEntry = null;
let autoLink = 'on';
const context = {
  window: {}, document: { addEventListener() {} }, console,
  localStorage: { getItem: () => null },
  getSetting: () => autoLink,
  getFixtureIdFromData: data => data.matchInfo.fixtureId,
  getManualEntry: () => manualEntry,
  cloneLineup: lineup => structuredClone(lineup),
  cloneInjuries: injuries => structuredClone(injuries || []),
  applyManualCaptainToFixture() {},
};
vm.createContext(context);
for (const file of ['js/lineup/lineup-events.js', 'js/player/player-id-resolve.js', 'js/lineup/lineup-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
context.applyInferredFormationsToFixtureData = data => data;
context.applyManualCaptainToFixture = () => {};
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/1637598-lineup.json'), 'utf8'));
const original = JSON.stringify(fixture);

for (manualEntry of [null, { refereeName: 'Manual referee' }]) {
  const effective = context.buildEffectiveFixtureData(fixture);
  const lineup = context.lpApplySubReflectToLineup(effective.awayLineup, 'away', effective.events);
  assert.equal(lineup.startXi.length, 11);
  assert.equal(lineup.substitutes.length, fixture.awayLineup.substitutes.length);
  for (const [id, number, rating] of [[377140, 14, 6.5], [280675, 8, 6.3]]) {
    const player = lineup.startXi.find(p => p.playerId === id);
    assert(player, `Canonical player ${id} must be on the pitch`);
    assert.equal(player.number, number);
    assert(player.photoUrl);
    assert.equal(context.lpBuildRatingMap(effective.playerStats).get(String(id)), rating);
    assert(!lineup.substitutes.some(p => p.playerId === id));
  }
  assert(![...lineup.startXi, ...lineup.substitutes].some(p => [542858, 542841].includes(p.playerId)));
  const ratings = context.lpBuildRatingMap(effective.playerStats);
  assert.equal(lineup.substitutes.filter(p => ratings.has(String(p.playerId))).length, 9);
  assert.equal(JSON.stringify(fixture), original, 'Rendering must not mutate the response');
}

// 자동 연결이 꺼져 있어도 실제로 누락된 교체 투입 선수는 생성해야 합니다.
manualEntry = null;
autoLink = 'off';
const missing = structuredClone(fixture);
missing.events = [{ side: 'away', type: 'subst', elapsed: 85, playerId: 53918, assistId: 999999, assistName: 'Unknown newcomer' }];
const effective = context.buildEffectiveFixtureData(missing);
assert(effective.awayLineup.substitutes.some(p => p.playerId === 999999 && p.name === 'Unknown newcomer'));
console.log('Substitution ID reconciliation before synthesis: passed');

// ID가 없는 선수도 같은 팀의 스탯을 찾되, 실제 ID나 원본 데이터를 만들거나 바꾸지 않는다.
{
  autoLink = 'on';
  const stats = [
    { side: 'home', playerId: 0, playerName: 'A. Altihar', playerNameKoLong: 'Ayman Altihar', rating: '8.1' },
    { side: 'away', playerId: 0, playerName: 'A. Altihar', playerNameKoLong: 'Ayman Altihar', rating: '6.93', number: 1, position: 'G', minutes: 65 },
    { side: 'away', playerId: 0, playerName: 'H. Elhouni', playerNameKoLong: 'Hamdou Elhouni', rating: '7.82' },
  ];
  const before = JSON.stringify(stats);
  const find = (player, side = 'away', rows = stats) => context.lpFindPlayerMatchStats(rows, player.playerId, side, player);
  assert.equal(find({ playerId: 0, name: 'Ayman Altihar' }).rating, '6.93');
  assert.equal(find({ playerId: 0, name: 'Ayman Altihar' }, 'home').rating, '8.1');
  assert.equal(find({ playerId: 0, name: 'H. Elhouny' }).rating, '7.82', 'Unique fuzzy names must resolve');
  assert.equal(find({ playerId: 0, name: 'Unknown person' }), null);
  assert.equal(find({ playerId: 0, name: 'Ayman Altihar' }, ''), null, 'Zero IDs require a team');
  const duplicate = [...stats, { ...stats[1], number: 12, position: 'F', minutes: 22, rating: '7.1' }];
  assert.equal(find({ playerId: 0, name: 'Ayman Altihar' }, 'away', duplicate), null);
  for (const info of [{ number: 1 }, { pos: 'GK' }, { minutes: 65 }]) {
    assert.equal(find({ playerId: 0, name: 'Ayman Altihar', ...info }, 'away', duplicate).rating, '6.93');
  }
  const fuzzyDuplicate = [...stats, { ...stats[2], playerName: 'H. Elhouni', rating: '6.2' }];
  assert.equal(context.lpFindPlayerMatchStatCandidates(fuzzyDuplicate, 0, 'away', { name: 'H. Elhouny' }).length, 2);
  assert.equal(find({ playerId: 0, name: 'H. Elhouny' }, 'away', fuzzyDuplicate), null);
  autoLink = 'off';
  assert.equal(find({ playerId: 0, name: 'H. Elhouny' }), null);
  assert.equal(find({ playerId: 0, name: 'Ayman Altihar' }).rating, '6.93', 'Exact identity works without fuzzy linking');
  const withId = [...stats, { ...stats[1], playerId: 123, rating: '9.0' }];
  assert.equal(find({ playerId: 123, name: 'H. Elhouni' }, 'away', withId).rating, '9.0', 'Real ID takes priority');
  assert.equal(JSON.stringify(stats), before);
  console.log('Zero-ID match stats: team/name matching, fuzzy ambiguity and additional evidence passed');
}
