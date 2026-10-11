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
        // 경기 데이터 없이도 각 피치의 크기 규칙과 최초 폭 잠금을 재현한다.
        const panel = document.querySelector('.layout-big .lp-lineup');
        _lineupClearWidthOverride(panel);
        _lineupClearHeightOverride(panel);
        panel.classList.toggle('dp-mode-split', split === 'on');
        syncBigLineupFullscreenGeometry();
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
      const panel = page.locator('.layout-big .lp-lineup');
      const before = await panel.boundingBox();
      // 초기 폭 잠금 상태에서도 위쪽 엣지를 먼저 건드리지 않고 축소한다.
      await page.evaluate(() => syncBigLineupFullscreenGeometry());
      assert(await panel.evaluate(el => el.classList.contains('lp-width-locked')));
      const corner = await handle.boundingBox();
      await page.mouse.move(corner.x + 4, corner.y + 4);
      await page.mouse.down();
      await page.mouse.move(corner.x - 56, corner.y + 104, { steps: 8 });
      const during = await panel.boundingBox();
      assert(during.width < before.width - 10, '드래그 중 너비도 즉시 줄어야 함');
      assert(during.height < before.height - 10, '드래그 중 높이도 즉시 줄어야 함');
      await page.mouse.up();
      await page.waitForTimeout(350);
      const after = await panel.boundingBox();
      assert(after.width < before.width - 10);
      assert(after.height < before.height - 10);
      assert(Math.abs(after.width / after.height - before.width / before.height) < 0.005, '피치 비율 유지');
    }
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.lineupFitCalls = [];
      const original = window.fitLineupNamePills;
      window.fitLineupNamePills = (...args) => {
        lineupFitCalls.push(document.body.classList.contains('lp-lineup-resizing'));
        return original(...args);
      };
      // 드래그 시작 전에 예약된 ResizeObserver 작업도 차단해야 한다.
      setSetting('lineupScale', 85);
    });
    await settle(page);
    const corner = await page.locator('.layout-big .lp-lineup-resize').boundingBox();
    await page.mouse.move(corner.x + 4, corner.y + 4);
    await page.mouse.down();
    await page.waitForTimeout(200);
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(corner.x - (i % 2 ? 30 : 60), corner.y + (i % 2 ? 40 : 100), { steps: 4 });
      await page.waitForTimeout(200);
    }
    assert(!await page.evaluate(() => lineupFitCalls.includes(true)), '왕복 드래그 중 이름 재배치 금지');
    await page.evaluate(() => { lineupFitCalls = []; });
    await page.mouse.up();
    await page.waitForTimeout(350);
    assert.deepEqual(await page.evaluate(() => lineupFitCalls), [false], '종료 후 최종 이름 재배치 1회');
    console.log('PASS combined/split corner geometry, drag cleanup and deferred name fitting');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
