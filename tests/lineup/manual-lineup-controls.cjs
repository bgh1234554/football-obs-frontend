const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.evaluate(() => {
      const fixture = { matchInfo: { fixtureId: 'manual-controls-test', homeTeamId: 1, awayTeamId: 2, homeTeamName: '홈', awayTeamName: '대한민국' }, homeLineup: { startXi: [], substitutes: [] }, awayLineup: { startXi: [], substitutes: [] }, events: [], playerStats: [], homeInjuries: [], awayInjuries: [] };
      const names = ['김민정', '김혜리', '고유진', '노진영', '장슬기', '최유리', '정민영', '윤수정', '지소연', '현슬기', '김민지'];
      updateManualEntry('manual-controls-test', 'away', side => {
        side.lineup = { formation: '4-2-3-1', startXi: names.map((name, i) => ({ name, number: i + 1, _manual: true, grid: buildManualGridValues('4-2-3-1')[i] })) };
        return side;
      });
      applyLineupPanels(fixture);
      openManualPanel('lineup', 'away');
    });
    const field = (name, index) => page.locator(`[name="lineup-${name}-${index}"]`);
    const assertCardAlignment = async () => {
      const cards = await page.locator('.dp-manual-card-swatch > .football-icon').evaluateAll(icons => icons.map(icon => {
        const row = icon.closest('.dp-manual-row');
        const image = icon.getBoundingClientRect();
        const input = row.querySelector('.dp-input-mini').getBoundingClientRect();
        return Math.abs(image.y + image.height / 2 - input.y - input.height / 2);
      }));
      assert.equal(cards.length, 22);
      cards.forEach(delta => assert(delta < .5, `Manual card vertical offset: ${delta}px`));
    };
    await assertCardAlignment();
    for (const [name, label] of [['yellow', '경고(옐로카드)'], ['red', '퇴장(레드카드)']]) {
      assert.equal(await field(name, 1).getAttribute('aria-label'), label);
      assert.equal(await field(name, 1).locator('..').locator('.dp-manual-card-swatch').getAttribute('aria-hidden'), 'true');
    }
    const toggle = page.locator('#manualPanelGridToggle');
    assert(await toggle.isVisible());
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await field('name', 1).fill('같은 이름');
    await field('name', 2).fill('같은 이름');
    await field('number', 1).fill('21');
    await field('goals', 1).fill('2');
    await field('owngoals', 1).fill('1');
    await field('assists', 1).fill('3');
    await field('yellow', 1).check();
    await field('red', 1).check();
    await assertCardAlignment();
    fs.mkdirSync(path.join(root, 'screenshots/event-icons/review'), { recursive: true });
    await page.locator('#manualPanelBackdrop .dp-manual-modal').screenshot({ path: path.join(root, 'screenshots/event-icons/review/manual-card-alignment.png') });
    await field('captain', 2).check();
    await field('captain', 1).check();
    assert.equal(await page.locator('[name^="lineup-captain-"]:checked').count(), 1);
    assert.equal(await field('captain', 2).isChecked(), false);
    // 스탯만 있고 이름이 없는 선수를 포함해 미완성 행도 표시 전환 후 유지되어야 합니다.
    await field('name', 10).fill('');
    await field('number', 10).fill('99');
    await field('goals', 10).fill('4');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#manualLineupFullForm').isVisible(), false);
    assert.equal(await page.locator('#manualGridList .dp-roster-captain').count(), 1);
    await page.locator('.dp-grid-row[data-slot-index="1"]').dragTo(page.locator('.dp-grid-row[data-slot-index="8"]'));
    await page.locator('#manualGridFormation').selectOption('4-4-2');
    const movedIndex = await page.evaluate(() => lineupPanelState.gridState.slotPlayerIds.indexOf('manual-row-1'));
    const partialIndex = await page.evaluate(() => lineupPanelState.gridState.slotPlayerIds.indexOf('manual-row-10'));
    await toggle.click();
    assert.equal(await field('name', movedIndex).inputValue(), '같은 이름');
    assert.equal(await field('number', movedIndex).inputValue(), '21');
    assert.equal(await field('goals', movedIndex).inputValue(), '2');
    assert.equal(await field('owngoals', movedIndex).inputValue(), '1');
    assert.equal(await field('assists', movedIndex).inputValue(), '3');
    for (const flag of ['yellow', 'red', 'captain']) assert(await field(flag, movedIndex).isChecked());
    assert.equal(await field('number', partialIndex).inputValue(), '99');
    assert.equal(await field('goals', partialIndex).inputValue(), '4');
    assert.equal(await page.locator('#manualLineupFormation').inputValue(), '4-4-2');
    // 이동 화면이 활성화된 상태에서 저장하면 API 그리드 덮어쓰기 대신 전체 라인업을 저장해야 합니다.
    await toggle.click();
    await page.locator(`.dp-grid-row[data-slot-index="${movedIndex}"]`).dragTo(page.locator('.dp-grid-row[data-slot-index="5"]'));
    await page.locator('#manualPanelSave').click();
    const saved = await page.evaluate(() => getManualEntry('manual-controls-test').away.lineup);
    assert.equal(saved.formation, '4-4-2');
    assert(!saved.gridByPlayerId);
    const captain = saved.startXi.find(p => p.manualCaptain);
    assert(captain && captain.name === '같은 이름' && captain.number === '21');
    assert.equal(captain.manualGoals, 2);
    assert.equal(captain.manualOwnGoals, 1);
    assert.equal(captain.manualAssists, 3);
    assert(captain.manualYellow && captain.manualRed);
    const badge = await page.evaluate(() => {
      const players = buildEffectiveFixtureData(lineupPanelState.lastFixture).awayLineup.startXi;
      return players.map(p => buildLineupNameLabelHtml(p, p.name, 'dp-lineup-name')).join('');
    });
    assert.equal((badge.match(/dp-lineup-captain-badge/g) || []).length, 1);
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    assert(await field('captain', 5).isChecked(), JSON.stringify(await page.evaluate(() => ({ saved: getManualEntry('manual-controls-test').away.lineup, rows: [...document.querySelectorAll('[name^="lineup-captain-"]')].map(el => ({ name: el.name, checked: el.checked })), grids: buildManualGridValues('4-4-2') }))));
    assert.equal(await field('number', 5).inputValue(), '21');
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.locator('.dp-manual-modal').first().screenshot({ path: path.join(root, 'screenshots/manual-lineup-captain.png') });
    await toggle.click();
    await page.locator('.dp-manual-modal').first().screenshot({ path: path.join(root, 'screenshots/manual-lineup-move.png') });
    await page.locator('.dp-grid-row[data-slot-index="5"]').dragTo(page.locator('.dp-grid-row[data-slot-index="1"]'));
    await page.locator('#manualPanelCancel').click();
    assert.deepEqual(await page.evaluate(() => getManualEntry('manual-controls-test').away.lineup), saved);
    // 주장 선택을 해제할 수 있어야 하며 다시 열어도 해제 상태가 유지되어야 합니다.
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    await field('captain', 5).uncheck();
    await page.locator('#manualPanelSave').click();
    assert.equal(await page.evaluate(() => getManualEntry('manual-controls-test').away.lineup.startXi.some(p => p.manualCaptain)), false);
    // 다른 폼과 기존 API 그리드 편집기에는 전체 라인업 전환 버튼을 표시하지 않습니다.
    await page.evaluate(() => openManualPanel('bench', 'away'));
    assert.equal(await toggle.isVisible(), false);
    await page.locator('#manualPanelCancel').click();
    await page.evaluate(() => {
      const fixture = structuredClone(lineupPanelState.lastFixture);
      fixture.awayLineup = { formation: '4-4-2', startXi: Array.from({ length: 11 }, (_, i) => ({ playerId: 100 + i, name: `API ${i}`, number: i + 1, grid: buildManualGridValues('4-4-2')[i] })), substitutes: [] };
      applyLineupPanels(fixture);
      openManualPanel('lineup', 'away');
    });
    assert.equal(await toggle.isVisible(), false);
    assert(await page.locator('#manualGridList').isVisible());
    await page.locator('.dp-grid-row[data-slot-index="1"]').dragTo(page.locator('.dp-grid-row[data-slot-index="2"]'));
    await page.locator('#manualPanelSave').click();
    assert(await page.evaluate(() => !!getManualEntry('manual-controls-test').away.lineup.gridByPlayerId));
    // API 선발이 부족하면 빈 슬롯을 보충하고 이후 실제 명단으로 교체한다.
    await page.evaluate(() => {
      const fixture = structuredClone(lineupPanelState.lastFixture);
      fixture.matchInfo.fixtureId = 'missing-starter-test';
      fixture.awayLineup.startXi.pop();
      fixture.events = [];
      applyLineupPanels(fixture);
      openManualPanel('lineup', 'away');
    });
    await page.locator('.dp-grid-slot-edit').click();
    const slotInput = name => page.locator(`.dp-grid-slot-input[data-field="${name}"]`);
    await slotInput('name').fill('Missing Player');
    await slotInput('number').fill('99');
    await slotInput('playerId').fill('9999');
    await page.evaluate(() => {
      window.fetchPlayerStats = async pid => ({ player: { name: 'Missing Player', fullName: 'Missing Player', nationality: 'Test', age: 30, photoUrl: '/assets/test-player.png' } });
    });
    await page.locator('.dp-grid-slot-search').click();
    await page.locator('.dp-grid-slot-apply[data-photo="replace"]').waitFor();
    assert((await page.locator('.dp-grid-slot-preview').innerText()).includes('30세'));
    await page.locator('.dp-manual-modal').first().screenshot({ path: path.join(root, 'screenshots/manual-missing-slot-search.png') });
    await page.locator('.dp-grid-slot-apply[data-photo="replace"]').click();
    const alignment = await page.evaluate(() => {
      const row = document.querySelector('.has-slot-input');
      return { number: row.querySelector('[data-field="number"]').getBoundingClientRect().x, normal: document.querySelector('.dp-grid-num').getBoundingClientRect().x };
    });
    assert(Math.abs(alignment.number - alignment.normal) < 1);
    await page.locator('.dp-manual-modal').first().screenshot({ path: path.join(root, 'screenshots/manual-missing-slot.png') });
    await page.locator('#manualPanelSave').click();
    assert.equal(await page.evaluate(() => buildEffectiveFixtureData(lineupPanelState.lastFixture).awayLineup.startXi.find(p => p._manualSlot).playerId), 9999);
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    assert.equal(await slotInput('name').inputValue(), 'Missing Player');
    assert.equal(await slotInput('playerId').inputValue(), '9999');
    await slotInput('playerId').fill('');
    await page.locator('#manualPanelSave').click();
    const linked = await page.evaluate(() => {
      const fixture = structuredClone(lineupPanelState.lastFixture);
      fixture.events = [{ side: 'away', playerId: 9999, playerOrigName: 'M. Player', playerName: 'Missing Player', type: 'Goal' }];
      return buildEffectiveFixtureData(fixture).awayLineup.startXi.find(p => p._manualSlot);
    });
    assert.equal(linked.playerId, 9999);
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    await slotInput('name').fill('Cancelled');
    await page.locator('#manualPanelCancel').click();
    assert.equal(await page.evaluate(() => getManualEntry('missing-starter-test').away.lineup.manualSlots[0].name), 'Missing Player');
    const complete = await page.evaluate(() => {
      const fixture = structuredClone(lineupPanelState.lastFixture);
      fixture.awayLineup.startXi.push({ playerId: 8888, name: 'API replacement', grid: buildManualGridValues('4-4-2')[10] });
      return buildEffectiveFixtureData(fixture).awayLineup.startXi;
    });
    assert.equal(complete.length, 11);
    assert.equal(complete.find(p => p.name === 'API replacement').playerId, 8888);
    assert(!complete.some(p => p._manualSlot));
    // 빈자리를 중간으로 옮겨도 피치·전술판이 저장한 grid를 그대로 유지한다.
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    const source = await page.evaluate(() => lineupPanelState.gridState.slotPlayerIds.findIndex(key => !!lineupPanelState.gridState.players[key]?._manualSlot));
    await slotInput('name').fill('');
    await page.locator(`.dp-grid-row[data-slot-index="${source}"]`).dragTo(page.locator('.dp-grid-row[data-slot-index="7"]'));
    await page.locator('#manualPanelSave').click();
    const placement = await page.evaluate(() => {
      const lineup = buildEffectiveFixtureData(lineupPanelState.lastFixture).awayLineup;
      const grids = buildManualGridValues(lineup.formation);
      return { matches: getFormationAssignments(lineup).every(({ slot, player }) => grids[slot.originalIndex] === player.grid), empty: buildTacticsPlayers(lineup)[7] };
    });
    assert(placement.matches);
    assert.equal(placement.empty, null);
    assert.deepEqual(errors, []);
    console.log('PASS: full-form toggle, drag, formation changes, all stat fields, partial/duplicate names, save/cancel/reopen, captain badges and API grid compatibility.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
