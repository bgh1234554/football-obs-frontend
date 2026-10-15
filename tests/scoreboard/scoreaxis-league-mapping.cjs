const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/data/scoreaxis-standings-embed-map.js'), 'utf8'), context);
const resolve = context.window.resolveScoreaxisStandingsEmbeds;
const cases = [
  [169, 'Super League China'],
  [307, 'Pro League Saudi Arabia'],
  [504, 'King Cup Saudi Arabia'],
  [369, 'Super League Uzbekistan'],
  [50, 'National League North/South England'],
  [51, 'National League North/South England'],
  [984, 'National League North/South England'],
  [985, 'National League North/South England'],
  [1166, 'FIFA Club World Cup'],
];
for (const [id, name] of cases) {
  for (const input of [id, String(id), { matchInfo: { leagueId: id } }, { league: { id } }]) {
    const entries = resolve(input);
    assert.equal(entries.length, 1, `league ${id}`);
    assert.equal(entries[0].scoreaxisLeagueName, name);
    assert.match(entries[0].embedCode, /https:\/\/widgets\.scoreaxis\.com\/api\/football\/league-table\//);
  }
}
// 기존 그룹 선택 및 미지원 대회 처리를 유지합니다.
assert.equal(resolve({ leagueId: 5, leagueName: 'UEFA Nations League', round: 'League B' })[0].scoreaxisLeagueName, 'UEFA Nations League B');
assert.equal(resolve(15)[0].embedCode, resolve(1166)[0].embedCode);
assert.equal(resolve(987654321).length, 0);
const unmatched = fs.readFileSync(path.join(root, 'docs/scoreaxis-unmatched-leagues.csv'), 'utf8');
assert(!unmatched.includes('"Uzbekistan","Super League Uzbekistan",'));
assert(!unmatched.includes('"England","National League North/South England",'));
console.log('PASS Scoreaxis mapped leagues, combined competition IDs, fixture shapes and unmatched list');
