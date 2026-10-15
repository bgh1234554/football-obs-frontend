const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    // 배포 전에도 원형 로고의 배치와 돌출을 독립적으로 검증합니다.
    await page.route('**/leagues/UzbekSuperLeague.svg', route => route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="white"/><circle cx="50" cy="50" r="40" fill="#021D3D"/></svg>' }));
    await page.evaluate(() => {
      state.fsmTheme = 'auto'; state.homeName = 'ANDIJON'; state.awayName = 'QIZILQUM';
      state.homeScore = 0; state.awayScore = 0; state.extra = 3; state.extraShown = true;
      state.homeLogo = state.awayLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="navy"/></svg>');
      Object.assign(state.colors, { homeBg: '#ff2020', homeText: '#ffffff', awayBg: '#2080ff', awayText: '#ffffff' });
      autoApplyTemplateByLeagueId(369, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink && document.querySelector('.epl-lion').naturalWidth > 0);
    await page.evaluate(() => document.fonts.ready);
    for (const scale of [60, 75, 100, 150]) {
      for (const position of ['left', 'center', 'right']) {
        const samples = [];
        for (const enabled of [false, true, false]) {
          await page.evaluate(({ scale, position, enabled }) => {
            state.boardScale = scale; state.boardPosition = position; state.aggEnabled = enabled;
            state.aggHomeBase = 1; state.aggAwayBase = 2; render(); fsmBoardRender();
          }, { scale, position, enabled });
          await settle(page);
          const m = await page.evaluate(() => {
            const main = document.querySelector('.scoreboard-main'), r = main.getBoundingClientRect();
            const scale = r.width / main.offsetWidth;
            const center = document.querySelector('.score-div').getBoundingClientRect();
            const cx = (center.left + center.right) / 2;
            const style = s => getComputedStyle(document.querySelector(s));
            return { theme: _currentTheme, tops: [r.top, center.top, document.querySelector('.time').getBoundingClientRect().top],
              offsets: ['#team-score-left', '#team-score-right', '#homeColor', '#awayColor'].map(s => (document.querySelector(s).getBoundingClientRect().left - cx) / scale),
              circle: ['width', 'height', 'backgroundColor', 'borderRadius'].map(p => getComputedStyle(document.querySelector('.score-div'), '::before')[p]),
              logoBoxes: ['#team-logo-left', '#team-logo-right'].map(s => style(s).backgroundColor),
              gradient: style('.div-background').backgroundImage, extra: [style('.extra-time').backgroundImage, style('.extra-time').color],
              radius: document.querySelector('#board').style.getPropertyValue('--cnl-radius'),
              paths: [...document.querySelectorAll('.cnl-curve path')].map(p => p.getAttribute('d')),
              score: [style('#team-score-left').fontSize, style('#team-score-left').fontFamily],
              logoOnTop: document.elementsFromPoint(cx, r.bottom + 3 * scale).some(el => el.matches('.score-div, .epl-lion')) &&
                !document.elementFromPoint(cx, r.bottom + 3 * scale)?.matches('.time'),
              totals: [...document.querySelectorAll('.total-score')].map(el => { const t = el.getBoundingClientRect(); return [(t.left + t.right) / 2 - cx, t.width]; }) };
          });
          assert.equal(m.theme, 'uzbek');
          assert.deepEqual(m.circle, ['64px', '64px', 'rgb(2, 29, 61)', '50%']);
          assert.deepEqual(m.logoBoxes, ['rgb(245, 245, 245)', 'rgb(245, 245, 245)']);
          assert(m.gradient.includes('rgb(1, 146, 79)') && m.gradient.includes('rgb(0, 100, 61)'));
          assert(m.extra[0].includes('rgb(0, 56, 119)') && m.extra[0].includes('rgb(1, 40, 83)'));
          assert.equal(m.extra[1], 'rgb(255, 255, 255)');
          assert.equal(m.radius, '32px'); assert.equal(m.score[0], '64px'); assert(m.score[1].includes('Pretendard-Medium'));
          assert(m.logoOnTop, 'logo circle must paint above timer');
          assert.equal(m.paths.length, 2); assert(m.paths.every(p => p.includes('A39 39') && p.includes('A32 32')));
          if (enabled) { assert(m.totals[0][0] < m.offsets[0] * scale / 100); assert(m.totals[1][0] > m.offsets[1] * scale / 100); }
          samples.push(m);
        }
        samples.slice(1).forEach(m => ['tops', 'offsets'].forEach(key => m[key].forEach((v, i) => assert(Math.abs(v - samples[0][key][i]) < .1, `stable ${scale}/${position}/${key}/${i}`))));
      }
    }
    await page.evaluate(() => { state.fsmTheme = 'uzbek'; state.boardScale = 100; state.boardPosition = 'center'; autoApplyTemplateByLeagueId(39, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-uzbek.png' });
    await page.evaluate(() => { state.fsmTheme = 'rpl'; autoApplyTemplateByLeagueId(235, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    await settle(page);
    assert(await page.locator('.cnl-curve').evaluateAll(curves => curves.length === 2 && curves.every(el => getComputedStyle(el).display === 'none')));
    console.log('PASS Uzbek auto/manual, fixed circular logo and inner team arcs, gradients, Romanian score style, aggregate spacing at four scales and three positions');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
