const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    const fixture = await page.evaluate(() => {
      const roster = offset => Array.from({ length: 11 }, (_, i) => ({ playerId: offset + i, number: i + 1, name: `선수 ${offset + i}`, pos: 'M', grid: buildManualGridValues('4-4-2')[i] }));
      const f = { matchInfo: { fixtureId: 'captain-test', homeTeamId: 1, awayTeamId: 2, homeTeamName: '홈', awayTeamName: '원정' }, homeLineup: { formation: '4-4-2', startXi: roster(100), substitutes: [{ playerId: 150, name: '교체 선수', number: 12 }] }, awayLineup: { formation: '4-4-2', startXi: roster(200), substitutes: [] }, events: [], playerStats: [], homeInjuries: [{ playerId: 999, name: '부상 선수' }], awayInjuries: [] };
      f.homeLineup.startXi[2] = { ...f.homeLineup.startXi[2], playerId: 0, name: '미확인 선수', origName: 'Unknown Player' };
      applyLineupPanels(f);
      return f;
    });
    const open = id => page.evaluate(id => { pmHideAll(); pmShowMenu(id, 800, 440); }, id);
    const captains = () => page.evaluate(() => ['home', 'away'].map(side => {
      const l = lineupPanelState.lastEffectiveData[`${side}Lineup`];
      return [...l.startXi, ...l.substitutes].filter(p => lpIsCaptain(p.playerId, p)).map(p => p.playerId);
    }));
    await open(100);
    assert.equal(await page.locator('#pmBtnCaptain').innerText(), '주장 지정');
    const buttons = await page.locator('#pmBtnIdLink, #pmBtnCaptain').evaluateAll(els => els.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
    assert.equal(buttons[0].y, buttons[1].y, 'Buttons must be adjacent on the same row');
    assert(buttons[1].x > buttons[0].x);
    await page.locator('#pmBtnCaptain').click();
    assert.deepEqual(await captains(), [[100], []]);
    assert.equal(await page.locator('#pmBtnCaptain').innerText(), '주장 해제');
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.locator('#pmPopup').screenshot({ path: path.join(root, 'screenshots/manual-captain-popup.png') });
    assert(await page.locator('[data-player-id="100"] .dp-lineup-captain-badge').count() > 0);
    await open(101);
    await page.locator('#pmBtnCaptain').click();
    await open(200);
    await page.locator('#pmBtnCaptain').click();
    assert.deepEqual(await captains(), [[101], [200]]);
    await page.reload();
    await page.evaluate(f => applyLineupPanels(f), fixture);
    assert.deepEqual(await captains(), [[101], [200]]);
    await page.evaluate(f => applyLineupPanels({ ...f, matchInfo: { ...f.matchInfo, fixtureId: 'other-match' } }), fixture);
    assert.deepEqual(await captains(), [[], []]);
    await page.evaluate(f => { f.playerStats = [{ playerId: 100, captain: true }]; applyLineupPanels(f); }, fixture);
    assert.deepEqual(await captains(), [[101], [200]], 'Manual selection takes precedence over API');
    await open(101);
    await page.locator('#pmBtnCaptain').click();
    assert.deepEqual(await captains(), [[100], [200]], 'Clearing restores API captain');
    await open(150);
    await page.locator('#pmBtnCaptain').click();
    assert.deepEqual(await captains(), [[150], [200]]);
    assert(await page.locator('[data-player-id="150"] .dp-roster-captain').count() > 0);
    await page.evaluate(() => { pmHideAll(); pirShowMenu('home', '미확인 선수', 800, 440); });
    await page.locator('#pmBtnCaptain').click();
    assert.deepEqual(await captains(), [[0], [200]]);
    await page.evaluate(() => {
      pirSetByKey(pirMakeNameKey('captain-test', 'home', '미확인 선수'), { playerId: 777, name: '연결된 선수' });
      rerenderLineupPanels();
    });
    assert.deepEqual(await captains(), [[777], [200]], 'ID linking preserves the captain');
    await open(777);
    assert.equal(await page.locator('#pmBtnCaptain').innerText(), '주장 해제');
    await page.locator('#pmBtnCaptain').click();
    assert.deepEqual(await captains(), [[100], [200]]);
    await open(999);
    assert.equal(await page.locator('#pmBtnCaptain').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: adjacent buttons, badge rendering, assignment/reassignment/removal, home/away and fixture isolation, reload persistence, API fallback, bench, zero-ID and ID-link preservation.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
