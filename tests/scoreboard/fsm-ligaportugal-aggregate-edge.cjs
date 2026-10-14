const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1280, height: 720 } });
    await page.evaluate(() => {
      state.fsmTheme = 'ligaportugal'; state.colors.homeText = '#ffffff'; state.colors.awayText = '#000000';
      state.homeScore = state.awayScore = 0; state.aggHomeBase = state.aggAwayBase = 1;
      autoApplyTemplateByLeagueId(94, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink);
    for (const scale of [60, 100, 150]) {
      for (const enabled of [true, false]) {
        await page.evaluate(({ scale, enabled }) => {
          state.boardScale = scale; state.aggEnabled = enabled; render(); fsmBoardRender();
        }, { scale, enabled });
        await settle(page);
        const edge = await page.locator('.scoreboard-main').evaluate(main => ({
          display: getComputedStyle(main, '::after').display,
          borders: ['totalScoreLeft', 'totalScoreRight'].map(id => getComputedStyle(document.getElementById(id).parentElement).boxShadow)
        }));
        assert.equal(edge.display, enabled ? 'none' : 'block');
        if (enabled) {
          assert(edge.borders[0].includes('rgb(255, 255, 255) 1px'));
          assert(edge.borders[1].includes('rgb(0, 0, 0) -1px'));
        }
      }
    }
    await page.evaluate(() => { state.boardScale = 100; state.aggEnabled = true; render(); fsmBoardRender(); });
    await settle(page);
    await page.locator('#boardStageInner').screenshot({ path: 'screenshots/tests/ligaportugal-aggregate-edge.png' });
    console.log('PASS Liga Portugal aggregate edges and toggle at 60/100/150%');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
