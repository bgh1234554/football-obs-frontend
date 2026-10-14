const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      state.homeName = 'HOME'; state.awayName = 'AWAY';
      state.aggEnabled = true; state.aggHomeBase = 1; state.aggAwayBase = 2;
      applyTheme('facup', null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => document.fonts.ready);
    for (const scale of [60, 100, 150]) {
      for (const half of ['1', 'PK', '2']) {
        await page.evaluate(({ scale, half }) => {
          state.boardScale = scale; state.half = half;
          state.pk.home = ['G', 'M', 'G']; state.pk.away = ['M', 'G'];
          render(); fsmBoardRender();
        }, { scale, half });
        await settle(page);
        // 합계 숫자는 컨테이너와 별개이므로 실제 표시 요소에서 각각 색을 읽는다.
        const actual = await page.evaluate(() => {
          const read = (bg, ink) => ({ background: getComputedStyle(bg).backgroundColor, ink: getComputedStyle(ink).color });
          const time = document.querySelector('.time');
          return {
            timer: read(time, time),
            totals: [...document.querySelectorAll('.total-score')].map(el => read(el, el.querySelector('.total'))),
            pso: read(document.querySelector('.pso-main'), document.querySelector('.pso-middle')),
          };
        });
        assert.deepEqual(actual.timer, { background: 'rgb(237, 28, 36)', ink: 'rgb(255, 255, 255)' });
        actual.totals.forEach(total => assert.deepEqual(total, actual.timer, JSON.stringify({ scale, half, actual })));
        if (half === 'PK') assert.deepEqual(actual.pso, actual.timer);
      }
    }
    console.log('PASS: FA Cup aggregate and PSO match timer colors at three scales and after PSO transitions.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
