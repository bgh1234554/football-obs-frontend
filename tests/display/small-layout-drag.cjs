const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const data = JSON.parse(fs.readFileSync(process.env.FIXTURE_DRAG_DATA || path.join(__dirname, '../fixtures/1637598-lineup.json'), 'utf8'));
    await page.evaluate(async data => {
      fetchFixture = async () => data;
      await fetchAndApplyFixtureData(String(data.matchInfo.fixtureId || '1507079'));
      clearPolling(); activatePage('main-small'); resetAllLayoutSizes();
    }, data);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const original = window.stRerenderActivePanels;
      window.dragRenders = 0;
      window.stRerenderActivePanels = (...args) => { window.dragRenders++; return original(...args); };
    });
    for (const handle of ['.lp-small-col-resize', '.lp-small-col-resize-end']) {
      await page.evaluate(() => { resetAllLayoutSizes(); });
      await page.waitForTimeout(100);
      const box = await page.locator('.layout-small ' + handle).boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.evaluate(() => { window.dragRenders = 0; });
      for (let step = 1; step <= 20; step++) await page.mouse.move(x + step * 3, y);
      const during = await page.evaluate(() => window.dragRenders);
      await page.mouse.up();
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => window.dragRenders);
      console.log(JSON.stringify({ handle, during, after }));
      assert.equal(during, 0, '가로 드래그 중 스탯 전체 재렌더를 반복하지 않는다');
      if (handle === '.lp-small-col-resize') assert(after >= 1 && after <= 2, '드래그 종료 후 최종 폭으로 스탯을 갱신한다');
      else assert.equal(after, 0, '스탯 폭이 유지되는 오른쪽 경계는 스탯을 다시 그리지 않는다');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
