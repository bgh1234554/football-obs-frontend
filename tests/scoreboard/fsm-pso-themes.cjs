const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const themes = await page.evaluate(() => Object.keys(FSM_THEMES));
    for (const theme of themes) {
      await page.evaluate(theme => {
        state.half = 'PK'; state.homeName = 'HOME'; state.awayName = 'AWAY';
        state.extra = 4; state.extraShown = true;
        applyTheme(theme, null); render();
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      for (const scale of [60, 75, 100, 125, 150]) {
        for (const count of [0, 5, 8, 20]) {
          await page.evaluate(({ scale, count }) => {
            state.boardScale = scale;
            state.pk.home = Array.from({ length: count }, (_, i) => i % 2 ? 'M' : 'G');
            state.pk.away = Array.from({ length: Math.max(0, count - 1) }, () => 'G');
            render(); fsmBoardRender();
          }, { scale, count });
          await settle(page);
          const m = await page.evaluate(() => {
            const board = document.querySelector('#board');
            const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
            const panel = document.querySelector('.pso-main'), label = document.querySelector('.pso-middle');
            const s = getComputedStyle(panel), ink = getComputedStyle(label).color;
            const hit = el => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return el.contains(h); };
            return {
              panel: rect(panel), clock: rect(document.querySelector('.time')), status: rect(document.querySelector('.pso-status')),
              timerHidden: getComputedStyle(document.querySelector('.scoreboard-timer')).visibility,
              labelVisible: hit(label), contrast: teamColorContrastRatio(s.backgroundColor, ink),
              bg: s.backgroundColor, ink,
              timer: { bg: getComputedStyle(document.querySelector('.time')).backgroundColor, ink: getComputedStyle(document.querySelector('.time')).color },
              circles: [...document.querySelectorAll('.pso-circle')].map(el => ({ ...rect(el), visible: hit(el), widthBeforeScale: el.offsetWidth, border: getComputedStyle(el).borderColor })),
              counts: ['#pso-left', '#pso-right'].map(sel => document.querySelectorAll(sel + ' li').length),
              scale: board.getBoundingClientRect().width / board.offsetWidth,
            };
          });
          const context = JSON.stringify({ theme, scale, count, m });
          assert.equal(m.timerHidden, 'hidden', context);
          assert(Math.abs(m.status.top - m.clock.top) < .1, context);
          assert(m.panel.bottom >= m.clock.bottom - .1, context);
          // EFL은 사용자가 지정한 타이머 색상과의 일치를 아래에서 검증한다.
          if (!theme.startsWith('efl')) assert(m.contrast >= 3, context);
          assert(m.labelVisible, context);
          assert.deepEqual(m.counts, [Math.max(5, count), Math.max(5, count - 1)]);
          for (const circle of m.circles) {
            assert(circle.visible, context);
            assert(circle.left >= m.panel.left - .1 && circle.right <= m.panel.right + .1, context);
            assert(circle.top >= m.panel.top - .1 && circle.bottom <= m.panel.bottom + .1, context);
            assert(circle.widthBeforeScale >= 18, context);
            assert.equal(circle.border, m.ink, context);
          }
          if (theme.startsWith('efl') || theme === 'fnl2a') assert.deepEqual({ bg: m.bg, ink: m.ink }, m.timer);
        }
      }
      await page.evaluate(() => { state.half = '2'; render(); fsmBoardRender(); });
      assert.equal(await page.locator('.pso-status').evaluate(el => getComputedStyle(el).display), 'none');
      assert.equal(await page.locator('.scoreboard-timer').evaluate(el => getComputedStyle(el).visibility), 'visible');
      console.log('PASS', theme);
    }
    assert.deepEqual(errors, []);
    console.log('PASS all PSO themes, 5 scales, empty/5/8/20 attempts, timer coverage, readable labels and EFL colors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
