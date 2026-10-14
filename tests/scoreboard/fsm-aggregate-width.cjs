const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    for (const theme of ['rpl', 'bundes2']) {
      await page.evaluate(theme => {
        state.fsmTheme = theme;
        state.homeName = '레닌그라데츠';
        state.awayName = '루키 에네르기야 벨리키예 루키 축구 클럽';
        state.aggHomeBase = 1; state.aggAwayBase = 1;
        autoApplyTemplateByLeagueId(39, null); render();
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      const measurements = [];
      for (const enabled of [false, true, false]) {
        await page.evaluate(enabled => { state.aggEnabled = enabled; render(); fsmBoardRender(); }, enabled);
        await settle(page);
        measurements.push(await page.evaluate(() => ({
          width: parseFloat(document.querySelector('.scoreboard-main').style.width),
          aggregate: [...document.querySelectorAll('.total-score')].reduce((sum, n) => sum + n.offsetWidth, 0),
          font: parseFloat(getComputedStyle(document.querySelector('#awayName .text')).fontSize)
        })));
      }
      const [before, enabled, after] = measurements;
      assert.equal(before.width, 1080, theme);
      assert.equal(enabled.width, before.width + enabled.aggregate, theme);
      assert(enabled.font >= before.font, JSON.stringify({ theme, measurements }));
      assert.deepEqual(after, before, theme);
      console.log('PASS aggregate maximum width and team-name space:', theme);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
