const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const themes = await page.evaluate(() => Object.keys(FSM_THEMES));
    // 승인한 리그 포맷 목록을 고정해 클럽 전체로 지원 범위가 넓어지는 회귀를 막습니다.
    const supportedThemes = new Set([
      'default', 'cl', 'uel', 'uecl', 'acle', 'russiancup',
      'eflchampionship', 'eflleagueone', 'eflleaguetwo', 'nationalleague', 'laliga2',
      'bundes', 'bundes2', 'ligue1', 'ligue2', 'ligaportugal', 'eredivisie',
      'rpl', 'fnl', 'fnl2a', 'czech', 'romanian', 'belarus', 'kleague', 'jleague', 'unl', 'cnl'
    ]);
    for (const theme of themes) {
      await page.evaluate(theme => {
        state.fsmTheme = theme;
        state.homeName = 'Borussia Monchengladbach'; state.awayName = 'Spartak Moscow';
        state.homeScore = 2; state.awayScore = 1;
        state.aggHomeBase = 1; state.aggAwayBase = 3;
        autoApplyTemplateByLeagueId(39, null); render();
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      for (const scale of [60, 100, 150]) {
        for (const enabled of [true, false]) {
          await page.evaluate(({ scale, enabled }) => {
            state.boardScale = scale; state.aggEnabled = enabled; render(); fsmBoardRender();
          }, { scale, enabled });
          await settle(page);
          const m = await page.evaluate(() => {
            const totals = [...document.querySelectorAll('.total-score')];
            const scores = [...document.querySelectorAll('.team-score')];
            return {
              visible: totals.map(node => getComputedStyle(node).display !== 'none'),
              values: totals.map(node => node.textContent.trim()),
              colors: totals.map(node => { const style = getComputedStyle(node); return [style.backgroundColor, style.color]; }),
              timerColors: (() => { const style = getComputedStyle(document.querySelector('.time')); return [style.backgroundColor, style.color]; })(),
              boxes: totals.map((node, i) => {
                const r = node.getBoundingClientRect(), score = scores[i].getBoundingClientRect();
                // 기울어진 점수 칸의 사선 끝은 겹칠 수 있지만 숫자 중심은 서로 침범하지 않아야 합니다.
                const center = r.left + r.width / 2, scoreCenter = score.left + score.width / 2;
                return { width: r.width, height: r.height, separate: (center < score.left || center > score.right) && (scoreCenter < r.left || scoreCenter > r.right),
                  visible: document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).some(hit => node.contains(hit)) };
              }),
              fits: [...document.querySelectorAll('.team-name')].every(node => {
                const text = node.querySelector('.text'), style = getComputedStyle(node);
                return text.scrollWidth <= node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + 1;
              })
            };
          });
          const context = JSON.stringify({ theme, scale, enabled, m });
          const shouldShow = enabled && supportedThemes.has(theme);
          assert.deepEqual(m.visible, [shouldShow, shouldShow], context);
          if (shouldShow) {
            assert.deepEqual(m.values, ['3', '4'], context);
            if (theme.startsWith('efl')) m.colors.forEach(colors => assert.deepEqual(colors, m.timerColors, context));
            const expectedColors = {
              ligue1: ['rgb(8, 95, 255)', 'rgb(255, 255, 255)'],
              ligue2: ['rgb(0, 252, 208)', 'rgb(0, 0, 0)'],
              rpl: ['rgb(14, 42, 92)', 'rgb(255, 255, 255)'],
              czech: ['rgb(255, 255, 255)', 'rgb(24, 30, 115)'],
              romanian: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'],
              belarus: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']
            }[theme];
            if (expectedColors) m.colors.forEach(colors => assert.deepEqual(colors, expectedColors, context));
            assert(m.boxes.every(box => box.width > 0 && box.height > 0 && box.separate && box.visible), context);
            if (scale === 100) await page.locator('#boardStageInner').screenshot({ path: path.resolve(`screenshots/tests/aggregate-${theme}.png`) });
          }
          assert(m.fits, context);
        }
      }
      console.log('PASS aggregate visibility, totals, separation and name fit:', theme);
    }
    for (const theme of ['bundes', 'eredivisie', 'rpl', 'eflchampionship', 'eflleagueone', 'eflleaguetwo']) {
      await page.evaluate(theme => {
        state.fsmTheme = theme; state.boardScale = 100; state.aggEnabled = true;
        state.aggHomeBase = 100; autoApplyTemplateByLeagueId(39, null); render();
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => fsmBoardRender());
      assert.equal(await page.locator('#totalScoreLeft').textContent(), '102');
      await page.locator('#boardStageInner').screenshot({ path: path.resolve(`screenshots/tests/aggregate-${theme}.png`) });
    }
    // UNL의 장식 이미지는 다른 모든 테마로 전환할 때 원래 팀 로고로 돌아와야 합니다.
    for (const theme of themes.filter(theme => theme !== 'unl')) {
      await page.evaluate(() => applyTheme('unl', null));
      await page.waitForFunction(() => !pendingThemeLink);
      assert.equal(await page.locator('#homeLogo').getAttribute('src'), 'resources/imgs/UNL_shape.png');
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      assert(await page.evaluate(() => document.getElementById('homeLogo').getAttribute('src') === (state.homeLogo || null)), theme);
      assert.equal(await page.locator('#homeLogo').evaluate(node => node.style.filter), '');
    }
    assert.deepEqual(errors, []);
    console.log('PASS UNL decoration and logo restoration for every theme');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
