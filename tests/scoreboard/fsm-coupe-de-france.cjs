const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/football-obs-logo-cdn/leagues/CoupeDeFrance.svg', async route => {
      await route.fulfill({ response: await route.fetch() });
    });
    await page.evaluate(() => {
      state.fsmTheme = 'auto'; state.homeName = '파리 생제르맹'; state.awayName = '올랭피크 리옹';
      state.homeScore = 2; state.awayScore = 1; state.extra = 3; state.extraShown = true; state.half = '2H';
      Object.assign(state.colors, { homeBg: '#e04030', homeText: '#ffe080', awayBg: '#2080e0', awayText: '#ffffff' });
      state.homeLogo = state.awayLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="navy"/></svg>');
      autoApplyTemplateByLeagueId(66, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink && document.querySelector('.epl-lion').naturalWidth > 0);
    await page.evaluate(() => document.fonts.ready);
    for (const scale of [60, 75, 100, 150]) {
      for (const position of ['left', 'center', 'right']) {
        const samples = [];
        for (const enabled of [false, true, false]) {
          await page.evaluate(({ scale, position, enabled }) => {
            state.boardScale = scale; state.boardPosition = position; state.aggEnabled = enabled;
            state.aggHomeBase = 1; state.aggAwayBase = 0; render(); fsmBoardRender();
          }, { scale, position, enabled });
          await settle(page);
          const m = await page.evaluate(() => {
            const rect = s => document.querySelector(s).getBoundingClientRect();
            const style = s => getComputedStyle(document.querySelector(s));
            const main = rect('.scoreboard-main'), logo = rect('.epl-lion');
            const scale = main.width / document.querySelector('.scoreboard-main').offsetWidth;
            const center = (logo.left + logo.right) / 2;
            return { theme: _currentTheme, protrusion: [(main.top - logo.top) / scale, (logo.bottom - main.bottom) / scale],
              tops: ['.scoreboard-main', '.epl-lion', '.time'].map(s => rect(s).top),
              gaps: ['#homeScore', '#awayScore'].map(s => (rect(s).left + rect(s).right) / 2 - center),
              colors: ['#team-score-left', '#team-score-right', '.score-div', '.extra-time', '.teams-left', '.teams-right', '.time'].map(s => [style(s).backgroundColor, style(s).color]),
              chips: ['#homeColor', '#awayColor'].map(s => ({ width: parseFloat(style(s).width), display: style(s).display, bg: style(s).backgroundColor, edge: style(s).boxShadow })),
              border: style('.scoreboard-main').boxShadow, timerBorder: style('.time').boxShadow,
              logoURL: document.querySelector('.epl-lion').src };
          });
          assert.equal(m.theme, 'coupedefrance');
          assert.equal(m.logoURL, 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CoupeDeFrance.svg');
          m.protrusion.forEach(n => assert(Math.abs(n - 11) < .1, `symmetric hexagon: ${n}`));
          m.colors.slice(0, 4).forEach(pair => assert.deepEqual(pair, ['rgb(0, 1, 33)', 'rgb(255, 255, 255)']));
          m.colors.slice(4, 6).forEach(pair => assert.deepEqual(pair, ['rgb(6, 23, 104)', 'rgb(255, 255, 255)']));
          assert.deepEqual(m.colors[6], ['rgb(255, 255, 255)', 'rgb(16, 27, 54)']);
          m.chips.forEach(chip => { assert.equal(chip.width, 8); assert.equal(chip.display, 'block'); assert(chip.edge.includes('inset')); });
          assert.equal(m.chips[0].bg, 'rgb(224, 64, 48)'); assert.equal(m.chips[1].bg, 'rgb(32, 128, 224)');
          assert(m.border.includes('1.5px')); assert(m.timerBorder.includes('1.5px'));
          samples.push(m);
        }
        samples.slice(1).forEach(m => ['tops', 'gaps'].forEach(key => m[key].forEach((n, i) => assert(Math.abs(n - samples[0][key][i]) < .1, `${key}/${scale}/${position}`))));
      }
    }
    await page.evaluate(() => {
      state.fsmTheme = 'coupedefrance'; autoApplyTemplateByLeagueId(39, null);
      state.boardScale = 100; state.boardPosition = 'center'; state.aggEnabled = false; render(); fsmBoardRender();
    });
    await page.waitForFunction(() => !pendingThemeLink);
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-coupe-de-france.png' });
    assert.deepEqual(errors, []);
    console.log('PASS Coupe de France colors, vertical chips, symmetric hexagon, border, auto/manual, aggregate position and spacing at four scales and three alignments');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
