const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    for (const split of ['off', 'on']) {
      await page.evaluate(split => {
        activatePage('main-big');
        setSetting('splitLineup', split);
        setSetting('lineupScale', 85);
      }, split);
      await settle(page);
      const handle = page.locator('.layout-big .lp-lineup-resize');
      const box = await handle.boundingBox();
      assert(box && box.width === 32 && box.height === 32);
      // 이전 핸들 바깥이었던 경계에서도 대각선 조절이 시작되어야 한다.
      const x = box.x + 4, y = box.y + 4;
      const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, { x, y });
      assert.equal(target, 'lp-lineup-resize');
      await page.mouse.move(x, y);
      await page.mouse.down();
      assert(await page.evaluate(() => document.body.classList.contains('lp-lineup-resizing')));
      assert(!await page.evaluate(() => document.body.classList.contains('lp-lineup-h-resizing')));
      await page.mouse.move(x + 60, y - 60, { steps: 6 });
      await page.mouse.up();
      await settle(page);
      assert(await page.evaluate(() => Number(getSetting('lineupScale')) > 85));
      assert(!await page.evaluate(() => document.body.classList.contains('lp-lineup-resizing')));
    }
    console.log('PASS combined/split corner hit target, diagonal drag and cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
