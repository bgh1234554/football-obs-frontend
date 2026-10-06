// 실행: node tests/tactics/tactics-topbar-scale.cjs (Playwright 필요).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const screenshotDir = path.join(root, 'screenshots', 'display-viewport');
fs.mkdirSync(screenshotDir, { recursive: true });
const { near, settle, openPage, measurePage } = require('./helpers');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const entry of ['overlay_dashboard.html']) {
      const page = await openPage(browser, { dpr: 2, platform: 'Win32', uaPlatform: 'Windows', touch: false, mobile: false,
        viewport: { width: 1280, height: 800 }, url: `http://localhost/${entry}` });
      await measurePage(page, 'tactics');
      const slider = page.locator('#tactics-topbar-scale-slider');
      assert.equal(await slider.isVisible(), false);
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      const measure = () => page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        };
        return { bar: rect('#tactics-topbar'), button: rect('#btn-tactics-fullscreen'), pitch: rect('#tactics-pitch'),
          size: rect('.td-topbar-size-control'), alpha: rect('.td-alpha-control'),
          controls: [...document.querySelectorAll('#tactics-topbar button, #tactics-topbar input, #tactics-topbar select')]
            .filter(el => el.getBoundingClientRect().width).map(el => ({ id: el.id, right: el.getBoundingClientRect().right, bottom: el.getBoundingClientRect().bottom })) };
      });
      const before = await measure();
      const track = await slider.boundingBox();
      await page.mouse.move(track.x + 5, track.y + track.height / 2);
      await page.mouse.down();
      await page.mouse.move(track.x + track.width * .75, track.y + track.height / 2, { steps: 5 });
      await settle(page);
      const pending = Number(await slider.inputValue());
      assert(pending > 100, 'drag previews a larger value');
      assert.equal(await page.locator('[data-settings-slider-value="tacticsTopbarScale"]').textContent(), `${pending}%`);
      near((await measure()).bar.height, before.bar.height, 'bar stays still while dragging', .01);
      assert.equal(await page.evaluate(() => getSetting('tacticsTopbarScale')), 100, 'drag does not save early');
      await page.mouse.up();
      await settle(page);
      assert.equal(await page.evaluate(() => getSetting('tacticsTopbarScale')), pending, 'release commits value');
      assert.equal(Number(await page.locator('#tactics-topbar').evaluate(el => getComputedStyle(el).zoom)), pending / 100, 'release applies size');
      assert((await measure()).button.height > before.button.height, 'release enlarges button');
      await slider.focus();
      await slider.press('End');
      await settle(page);
      assert.equal(await slider.inputValue(), '200');
      assert.equal(await page.locator('[data-settings-slider-value="tacticsTopbarScale"]').textContent(), '200%');
      const after = await measure();
      near(after.button.width / before.button.width, 2, 'button width doubles', .03);
      near(after.button.height / before.button.height, 2, 'button height doubles', .03);
      assert(after.bar.height > before.bar.height, 'bar grows vertically');
      assert(after.size.right <= after.alpha.x + 1 && Math.abs(after.size.y - after.alpha.y) < 2, 'size immediately left of opacity');
      for (const viewport of [{ width: 1280, height: 800 }, { width: 800, height: 1280 }]) {
        await page.evaluate(() => document.exitFullscreen());
        await page.setViewportSize(viewport);
        await page.locator('#btn-tactics-fullscreen').click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        await settle(page);
        const m = await measure();
        assert(m.bar.right <= viewport.width + 1, 'bar fits viewport');
        for (const c of m.controls) {
          assert(c.right <= m.bar.right + 1 && c.bottom <= m.bar.bottom + 1, `control fits: ${c.id}`);
        }
        assert(m.pitch.height > 100, 'pitch remains visible');
        near(m.pitch.width / m.pitch.height, 105 / 68, 'pitch aspect preserved', .005);
        await page.screenshot({ path: path.join(screenshotDir, `topbar-200-${viewport.width}-${entry}.png`) });
      }
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForFunction(() => !document.fullscreenElement);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await settle(page);
      const names = page.locator('#tactics-show-names');
      const wasChecked = await names.isChecked();
      await names.click();
      assert.equal(await names.isChecked(), !wasChecked, 'enlarged checkbox responds to click');
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.equal(await slider.isVisible(), false);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.reload({ waitUntil: 'load' });
      await measurePage(page, 'tactics');
      assert.equal(await slider.inputValue(), '200', 'saved setting restored');
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      assert.equal(await page.locator('#tactics-topbar').evaluate(el => getComputedStyle(el).zoom), '2');
      await slider.focus();
      await slider.press('Home');
      assert.equal(await slider.inputValue(), '100');
      console.log(`PASS ${entry}: 100-200% scale, landscape/portrait, click hit area, opacity placement, pitch fit, persistence, reset`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
