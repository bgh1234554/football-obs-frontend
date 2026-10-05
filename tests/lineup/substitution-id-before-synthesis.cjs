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

// Truly missing IN players must still be synthesized, even with automatic linking disabled.
manualEntry = null;
autoLink = 'off';
const missing = structuredClone(fixture);
missing.events = [{ side: 'away', type: 'subst', elapsed: 85, playerId: 53918, assistId: 999999, assistName: 'Unknown newcomer' }];
const effective = context.buildEffectiveFixtureData(missing);
assert(effective.awayLineup.substitutes.some(p => p.playerId === 999999 && p.name === 'Unknown newcomer'));
console.log('Substitution ID reconciliation before synthesis: passed');
