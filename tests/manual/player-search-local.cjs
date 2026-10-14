// 실행 전 프론트 정적 서버(기본 5501)와 신규 검색 API를 포함한 Spring 서버(8080)를 실행한다.
// 실제 공급자 검색을 호출하므로 자동 전체 테스트에서는 제외한다.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // 검증 스크린샷 저장으로 Live Server가 테스트 도중 화면을 새로고침하지 않도록 한다.
    await page.routeWebSocket('**', socket => socket.close());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const frontend = process.env.FRONTEND_URL || 'http://127.0.0.1:5501/overlay_dashboard.html';
    await page.goto(`${frontend}?apiBase=http://127.0.0.1:8080`);
    await page.evaluate(() => {
      const lineup = { formation: '4-4-2', startXi: Array.from({ length: 10 }, (_, i) => ({ playerId: i === 0 ? 0 : 100 + i, name: `API ${i}`, origName: `API ${i}`, grid: buildManualGridValues('4-4-2')[i] })), substitutes: [] };
      window.searchLocalFixture = { matchInfo: { fixtureId: 'search-local-live', homeTeamId: 1, awayTeamId: 2, homeTeamName: 'Home', awayTeamName: 'Away' }, homeLineup: structuredClone(lineup), awayLineup: lineup, events: [], playerStats: [], homeInjuries: [], awayInjuries: [] };
      applyLineupPanels(structuredClone(window.searchLocalFixture));
      pirShowMenu('away', 'API 0', 500, 350);
    });
    await page.locator('#pirIdInput').fill('German Iva');
    await page.locator('#pirFetch').click();
    await page.locator('.ps-result').first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.ps-result').count(), 2);
    const englishName = await page.locator('.ps-result').first().innerText();
    assert(englishName.includes('German Iván'), englishName);
    assert(!englishName.includes('Ã'), 'Names must decode UTF-8 correctly');
    await page.locator('#pirPopup').screenshot({ path: path.resolve('screenshots/player-search-live.png') });
    await page.locator('.ps-result').first().click();
    assert.equal(await page.locator('#pirIdInput').inputValue(), '227171');
    await page.locator('#pirCancel').click();
    const paging = await page.evaluate(async () => {
      const search = createPlayerSearch({ onChange: () => {}, onSelect: () => {} });
      await search.search(' Iva');
      if (!search.state.pages.has(1)) throw new Error(search.state.message);
      const first = { count: search.state.pages.get(1).length, total: search.state.totalPages };
      for (let i = 0; i < 50; i++) await search.move(1);
      return { first, current: search.state.rawPage, screen: search.state.screenPage, secondCount: search.state.pages.get(2)?.length };
    });
    assert.equal(paging.first.count, 250);
    assert(paging.first.total > 1);
    assert.equal(paging.current, 2);
    assert.equal(paging.screen, 51);
    assert(paging.secondCount > 0);
    await page.evaluate(() => { applyLineupPanels(structuredClone(window.searchLocalFixture)); openManualPanel('lineup', 'away'); });
    assert.equal(await page.locator('.dp-grid-slot-edit').count(), 1, JSON.stringify(await page.evaluate(() => ({ fixture: lineupPanelState.lastFixture.matchInfo.fixtureId, count: lineupPanelState.lastFixture.awayLineup.startXi.length, modal: lineupPanelState.manualModal, grid: lineupPanelState.gridState?.slotPlayerIds }))));
    await page.locator('.dp-grid-slot-edit').click();
    await page.locator('[data-field="playerId"]').fill('5075');
    await page.locator('.dp-grid-slot-search').click();
    await page.locator('.ps-result').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.ps-result').count(), 1);
    await page.locator('.ps-result').click();
    assert.equal(await page.locator('[data-field="playerId"]').inputValue(), '5075');
    assert((await page.locator('[data-field="name"]').inputValue()).length > 0);
    await page.locator('.dp-grid-slot-apply[data-photo="replace"]').click();
    await page.locator('#manualPanelSave').click();
    assert.equal(await page.evaluate(() => getManualEntry('search-local-live').away.lineup.manualSlots[0].playerId), 5075);
    assert.deepEqual(errors, []);
    console.log('PASS: local frontend → Spring 8080 → API-Football; name/ID search, Unicode, 250-result boundary, raw page 2, candidate selection and manual slot save.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
