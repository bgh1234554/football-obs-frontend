const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      document.querySelectorAll('style').forEach(style => {
        if (style.textContent.includes('* { transition: none !important; animation: none !important; }')) style.remove();
      });
      state.homeName = '\uBD81\uC544\uC77C\uB79C\uB4DC'; state.awayName = '\uC870\uC9C0\uC544'; render();
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES).filter(theme => theme !== 'pl'))) {
      await page.evaluate(() => applyTheme('pl', null));
      await page.waitForFunction(() => !pendingThemeLink);
      await page.waitForTimeout(500);
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const initial = await page.locator('.scoreboard-main').evaluate(el => parseFloat(el.style.width));
      await page.waitForTimeout(1000);
      const settled = await page.evaluate(() => {
        fsmBoardRender();
        return parseFloat(document.querySelector('.scoreboard-main').style.width);
      });
      assert(Math.abs(initial - settled) < 1, JSON.stringify({ theme, initial, settled }));
      console.log('PASS stable transition width', theme, initial);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
