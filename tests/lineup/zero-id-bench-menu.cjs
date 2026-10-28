const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { viewport: { width: 1920, height: 1080 }, dpr: 1, platform: 'Win32' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/1637598-lineup.json'), 'utf8'));
    fixture.homeLineup.substitutes = [{ playerId: 0, name: 'Pavel Egorov', origName: 'Pavel Egorov', number: 86 }];
    fixture.awayLineup.substitutes = [{ playerId: 0, name: 'Pavel Egorov', origName: 'Pavel Egorov', number: 87 }];
    fixture.events = [];
    await page.evaluate(async fixture => {
      setSetting('statCycleAuto', 'off');
      fetchFixture = async () => structuredClone(fixture);
      await fetchAndApplyFixtureData(fixture.matchInfo.fixtureId, { silent: true });
      clearPolling();
    }, fixture);
    // 양 팀에 같은 이름이 있어도 클릭한 쪽의 선수와 연결해야 한다.
    for (const layout of ['main-big', 'main-small']) {
      for (const [side, number] of [['home', 86], ['away', 87]]) {
        await page.evaluate(({ layout, side }) => {
          activatePage(layout);
          if (layout === 'main-big') {
            _lpStatCycle.mode = `bench_${side}`;
            lpStatUpdateVisibility();
          }
        }, { layout, side });
        await settle(page);
        const selector = layout === 'main-big'
          ? `.layout-big [data-bench-${side}-panel] .dp-item[data-player-id="0"] .dp-item-name`
          : `#benchPanel [data-bench-side="${side}"] .dp-item[data-player-id="0"] .dp-item-name`;
        await page.locator(selector).click();
        await page.locator('#pirIdInput').waitFor();
        assert.equal((await page.locator('#pirPopup .pm-num').innerText()).trim(), String(number), `${layout}/${side} must resolve the clicked side`);
        assert((await page.locator('#pirPopup .pm-name').innerText()).includes('Pavel Egorov'));
        assert.equal(await page.locator('#pirFetch').isVisible(), true);
        assert.equal(await page.locator('#pirBtnNick').isVisible(), true);
        await page.locator('#pirCancel').click();
        assert.equal(await page.locator('#pirPopup').count(), 0);
      }
    }
    // 실제 ID 0 선수 클릭 → 검색 → 후보 선택 → 저장 후 경기 전환·새로고침을 확인합니다.
    await page.route('**/api/players/search**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ players: [{ id: 555001, name: '연결된 선수', fullName: '연결된 선수 전체 이름', photoUrl: '' }], page: 1, totalPages: 1 }),
    }));
    await page.evaluate(() => activatePage('main-small'));
    await page.locator('#benchPanel [data-bench-side="home"] .dp-item[data-player-id="0"] .dp-item-name').click();
    await page.locator('#pirIdInput').fill('Pavel');
    await page.locator('#pirFetch').click();
    await page.locator('.ps-result').first().click();
    await page.locator('#pirSave').click();
    const load = async id => page.evaluate(async ({ fixture, id }) => {
      fetchFixture = async requested => { const next = structuredClone(fixture); next.matchInfo.fixtureId = String(requested); return next; };
      await fetchAndApplyFixtureData(id, { silent: true }); clearPolling();
      return {
        home: lineupPanelState.lastEffectiveData.homeLineup.substitutes[0].playerId,
        away: lineupPanelState.lastEffectiveData.awayLineup.substitutes[0].playerId,
      };
    }, { fixture, id });
    const id = String(fixture.matchInfo.fixtureId);
    assert.deepEqual(await load(id), { home: 555001, away: 0 });
    assert.deepEqual(await load(String(Number(id) + 1)), { home: 0, away: 0 });
    assert.deepEqual(await load(id), { home: 555001, away: 0 });
    await page.reload();
    assert.deepEqual(await load(id), { home: 555001, away: 0 });
    assert.deepEqual(errors, []);
    console.log('PASS: zero-ID bench menu opens by actual clicks in big/small layouts for both sides, including identical names.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
