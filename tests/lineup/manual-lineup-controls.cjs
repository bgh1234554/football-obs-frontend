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
    await field('captain', 2).check();
    await field('captain', 1).check();
    assert.equal(await page.locator('[name^="lineup-captain-"]:checked').count(), 1);
    assert.equal(await field('captain', 2).isChecked(), false);
    // Partial rows must survive toggling, including unnamed players with stats.
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
    // Save while the movement UI is active: must save a full lineup, not API grid overrides.
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
    // Captain selection can be cleared and must stay cleared on reopen.
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    await field('captain', 5).uncheck();
    await page.locator('#manualPanelSave').click();
    assert.equal(await page.evaluate(() => getManualEntry('manual-controls-test').away.lineup.startXi.some(p => p.manualCaptain)), false);
    // Other forms and the existing API grid editor must not show the full-form toggle.
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
    assert.deepEqual(errors, []);
    console.log('PASS: full-form toggle, drag, formation changes, all stat fields, partial/duplicate names, save/cancel/reopen, captain badges and API grid compatibility.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
