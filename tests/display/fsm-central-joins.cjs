const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    for (const theme of ['er24', 'unl', 'belgian']) {
      await page.evaluate(theme => { applyTheme(theme, null); render(); }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      for (const scale of [60, 75, 100, 125, 150]) {
        await page.evaluate(scale => { state.boardScale = scale; render(); fsmBoardRender(); }, scale);
        await settle(page);
        const measured = await page.evaluate(() => {
          const center = document.querySelector('.score-div');
          const read = (selector, pseudo) => {
            const s = getComputedStyle(document.querySelector(selector), pseudo);
            return { left: s.left, right: s.right, width: s.width };
          };
          return {
            home: read('#team-score-left', '::after'), away: read('#team-score-right', '::before'),
            homeWidth: document.querySelector('#team-score-left').offsetWidth,
            centerShadow: getComputedStyle(center).boxShadow,
            centerWidth: center.offsetWidth,
          };
        });
        if (theme === 'belgian') {
          assert.equal(measured.home.right, '0px');
          assert.equal(parseFloat(measured.home.left), measured.homeWidth - 1);
          assert.equal(measured.away.left, '0px');
          assert.equal(measured.home.width, '1px');
        } else {
          assert.notEqual(measured.centerShadow, 'none');
          assert(measured.centerShadow.includes('-1px'));
          if (theme === 'er24') assert.equal(measured.centerWidth, 37);
        }
      }
    }
    console.log('PASS Euro/Nations League joined backgrounds and Belgian inner score separators at 5 scales');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
