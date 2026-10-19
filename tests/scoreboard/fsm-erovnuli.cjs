const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    // 배포 전인 로고도 실제 저장소 파일로 렌더링합니다.
    await page.route('**/leagues/ErovnuliLiga.svg', route => route.fulfill({
      contentType: 'image/svg+xml', body: fs.readFileSync(path.resolve(__dirname, '../../../football-obs-logo-cdn/leagues/ErovnuliLiga.svg'))
    }));
    await page.evaluate(() => {
      state.fsmTheme = 'auto'; state.homeName = '디나모 트빌리시'; state.awayName = '디나모 바투미';
      state.homeScore = 2; state.awayScore = 1; state.extra = 4; state.extraShown = true;
      autoApplyTemplateByLeagueId(327, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('.epl-lion').naturalWidth > 0);
    for (const scale of [75, 100, 150]) {
      for (const aggregate of [false, true]) {
        await page.evaluate(({ scale, aggregate }) => {
          state.boardScale = scale; state.aggEnabled = aggregate;
          state.aggHomeBase = 1; state.aggAwayBase = 2; render(); fsmBoardRender();
        }, { scale, aggregate });
        await settle(page);
        const m = await page.evaluate(() => {
          const main = document.querySelector('.scoreboard-main').getBoundingClientRect();
          const logo = document.querySelector('.epl-lion').getBoundingClientRect();
          const colors = selector => { const s = getComputedStyle(document.querySelector(selector)); return [s.backgroundColor, s.color]; };
          return { theme: _currentTheme, main: { top: main.top, bottom: main.bottom }, logo: { top: logo.top, bottom: logo.bottom },
            teams: colors('#homeCard'), score: colors('#team-score-left'), time: colors('.time'), extra: colors('.extra-time'),
            total: colors('.total-score'), totalVisible: getComputedStyle(document.querySelector('.total-score')).display !== 'none' };
        });
        assert.equal(m.theme, 'erovnuli');
        assert.equal(m.teams[0], 'rgb(54, 43, 109)');
        assert.deepEqual(m.score, ['rgb(255, 255, 255)', 'rgb(54, 43, 109)']);
        assert.deepEqual(m.time, ['rgb(6, 166, 205)', 'rgb(255, 255, 255)']);
        assert.deepEqual(m.extra, ['rgb(234, 32, 140)', 'rgb(255, 255, 255)']);
        assert(m.logo.top >= m.main.top - .5 && m.logo.bottom <= m.main.bottom + .5, '로고가 점수판 높이 안에 있어야 합니다.');
        assert.equal(m.totalVisible, aggregate);
        if (aggregate) assert.deepEqual(m.total, ['rgb(54, 43, 109)', 'rgb(255, 255, 255)']);
      }
    }
    await page.evaluate(() => { state.boardScale = 100; state.aggEnabled = false; render(); });
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-erovnuli.png' });
    await page.evaluate(() => { state.half = 'PK'; state.pk.home = ['G', 'M', 'G']; state.pk.away = ['G', 'G']; render(); fsmBoardRender(); });
    await settle(page);
    const pso = await page.evaluate(() => {
      const panel = getComputedStyle(document.querySelector('.pso-main'));
      const number = getComputedStyle(document.querySelector('.pso-middle'));
      return [panel.backgroundColor, panel.color, number.color];
    });
    assert.deepEqual(pso, ['rgb(54, 43, 109)', 'rgb(255, 255, 255)', 'rgb(255, 255, 255)']);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-erovnuli-pso.png' });
    console.log('PASS erovnuli palette, logo bounds, aggregate at 75/100/150%, PSO palette');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
