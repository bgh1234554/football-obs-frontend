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
            /** 요소의 화면 사각형을 직렬화 가능한 객체로 읽는다. */
            const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
            const panel = document.querySelector('.pso-main'), label = document.querySelector('.pso-middle');
            const s = getComputedStyle(panel), ink = getComputedStyle(label).color;
            /** 요소 가운데 지점이 실제로 그 요소에 hit-test되는지. */
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
          // 루마니아 PSO는 숨겨진 40px 시계와 독립적으로 32px 기본 높이를 유지하고, 줄바꿈으로 늘어납니다.
          if (theme === 'romanian') {
            assert(m.panel.height >= 32 * m.scale - .1, context);
            if (count <= 5) assert(Math.abs(m.panel.height - 32 * m.scale) < .1, context);
          } else assert(m.panel.bottom >= m.clock.bottom - .1, context);
          // EFL과 라리가 2는 지정된 고정 색상 계약을 별도로 검증한다.
          // 라리가 2의 청록/흰색은 추가시간과 같은 의도된 팔레트다.
          if (!theme.startsWith('efl') && theme !== 'laliga2') assert(m.contrast >= 3, context);
          if (theme === 'laliga2') assert.deepEqual({ bg: m.bg, ink: m.ink }, { bg: 'rgb(0, 212, 214)', ink: 'rgb(255, 255, 255)' });
          assert(m.labelVisible, context);
          assert.deepEqual(m.counts, [Math.max(5, count), Math.max(5, count - 1)]);
          for (const circle of m.circles) {
            assert(circle.visible, context);
            assert(circle.left >= m.panel.left - .1 && circle.right <= m.panel.right + .1, context);
            assert(circle.top >= m.panel.top - .1 && circle.bottom <= m.panel.bottom + .1, context);
            assert(circle.widthBeforeScale >= 18, context);
            assert.equal(circle.border, m.ink, context);
          }
          if (theme === 'eflleaguetwo') assert.deepEqual({ bg: m.bg, ink: m.ink }, { bg: m.timer.ink, ink: m.timer.bg });
          else if (theme.startsWith('efl') || theme === 'fnl2a') assert.deepEqual({ bg: m.bg, ink: m.ink }, m.timer);
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
