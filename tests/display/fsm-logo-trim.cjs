const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  const screenshotDir = mkdtempSync(path.join(tmpdir(), "fsm-logo-trim-"));
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="40" y="15" width="80" height="40" fill="blue"/></svg>');
      state.homeLogo = logo; state.awayLogo = logo;
      state.homeLogoScale = 1; state.awayLogoScale = 1;
      state.homeLogoX = state.homeLogoY = state.awayLogoX = state.awayLogoY = 0;
      render();
    });
    await page.waitForFunction(() => document.getElementById('homeLogo').classList.contains('logo-trimmed'));
    for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES))) {
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => { render(); fsmBoardRender(); });
      await settle(page);
      const metrics = await page.evaluate(() => ['homeLogo', 'awayLogo'].map(id => {
        const img = document.getElementById(id), image = img.getBoundingClientRect(), box = img.parentElement;
        const rect = box.getBoundingClientRect(), style = getComputedStyle(box);
        const scale = document.querySelector('.scoreboard-main').getBoundingClientRect().width / document.querySelector('.scoreboard-main').offsetWidth;
        const offsetX = _currentTheme === 'unl' ? 0 : (parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)) * scale / 2;
        const offsetY = _currentTheme === 'unl' ? 0 : (parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)) * scale / 2;
        return {
          x: image.x + image.width * .4 - (rect.x + rect.width / 2 + offsetX),
          y: image.y + image.height * .35 - (rect.y + rect.height / 2 + offsetY),
          width: image.width * .4, expected: Math.min(parseFloat(style.getPropertyValue('--fsm-logo-width')) / 82, parseFloat(style.getPropertyValue('--fsm-logo-height')) / 42) * scale * 80,
          boxTransform: style.transform, imageTransform: getComputedStyle(img).transform,
        };
      }));
      for (const value of metrics) {
        assert(Math.abs(value.x) < 1 && Math.abs(value.y) < 1, JSON.stringify({ theme, value }));
        assert(Math.abs(value.width - value.expected) < 1, JSON.stringify({ theme, value }));
        if (theme === 'unl') {
          assert(value.boxTransform.startsWith('matrix(0.707'), value.boxTransform);
          assert(value.imageTransform.startsWith('matrix(0.707107, -0.707107'), value.imageTransform);
        }
      }
      console.log('PASS trim fit and center', theme);
    }
    await page.evaluate(() => { applyTheme('unl', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => { render(); fsmBoardRender(); });
    await settle(page);
    await page.locator('.scoreboard-main').screenshot({ path: path.join(screenshotDir, 'fsm-unl-logo-trim.png') });
    await page.evaluate(() => {
      state.homeLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="blue"/></svg>');
      render();
    });
    await page.waitForFunction(() => !document.getElementById('homeLogo').classList.contains('logo-trimmed'));
    assert.equal(await page.locator('#homeLogo').evaluate(img => img.style.getPropertyValue('--logo-trim-width-factor')), '');
    console.log('PASS stale trim cleared on logo replacement');
    for (const [width, height] of [[200, 100], [150, 100], [100, 100], [100, 200]]) {
      await page.evaluate(([width, height]) => {
        const logo = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="blue"/></svg>`);
        state.homeLogo = logo; state.awayLogo = logo; render();
      }, [width, height]);
      await page.waitForFunction(ratio => Math.abs(parseFloat(document.getElementById('homeLogo').style.getPropertyValue('--logo-fit-aspect')) - ratio) < .001, width / height);
      for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES))) {
        await page.evaluate(theme => applyTheme(theme, null), theme);
        await page.waitForFunction(() => !pendingThemeLink);
        await page.evaluate(() => { render(); fsmBoardRender(); });
        await settle(page);
        const sizes = await page.evaluate(() => ['homeLogo', 'awayLogo'].map(id => {
          const img = document.getElementById(id), s = getComputedStyle(img), box = getComputedStyle(img.parentElement);
          return { width: parseFloat(s.width), height: parseFloat(s.height), boxWidth: parseFloat(box.getPropertyValue('--fsm-logo-width')), boxHeight: parseFloat(box.getPropertyValue('--fsm-logo-height')) };
        }));
        for (const size of sizes) {
          const factor = Math.min(size.boxWidth / width, size.boxHeight / height);
          assert(Math.abs(size.width - width * factor) < .1 && Math.abs(size.height - height * factor) < .1, JSON.stringify({ theme, width, height, size }));
        }
      }
      console.log('PASS full-bleed logo fit across 17 themes', width, height);
    }
  } finally { await browser.close(); rmSync(screenshotDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
