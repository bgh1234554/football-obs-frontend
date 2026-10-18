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
    assert.deepEqual(errors, []);
    console.log('PASS: zero-ID bench menu opens by actual clicks in big/small layouts for both sides, including identical names.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
