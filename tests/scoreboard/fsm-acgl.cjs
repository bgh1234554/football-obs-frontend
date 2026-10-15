const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      state.homeName = 'FC 무르그하브'; state.awayName = '카스피 SC';
      state.homeScore = 2; state.awayScore = 1; state.extra = 3; state.extraShown = true; state.half = '2H';
      state.homeLogo = state.awayLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="navy"/></svg>');
    });
    const select = async (theme, id) => {
      await page.evaluate(({ theme, id }) => { state.fsmTheme = theme; autoApplyTemplateByLeagueId(id, null); render(); }, { theme, id });
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
    };
    const measure = () => page.evaluate(() => {
      const main = document.querySelector('.scoreboard-main').getBoundingClientRect();
      return ['.team-logo', '.teams-left', '.teams-right', '#team-score-left', '#team-score-right', '.score-div', '.time', '.extra-time'].map(s => {
        const el = document.querySelector(s), r = el.getBoundingClientRect(), css = getComputedStyle(el);
        return { rect: [r.left - main.left, r.top - main.top, r.width, r.height], image: css.backgroundImage, color: css.color };
      });
    });
    for (const scale of [60, 75, 100, 150]) {
      for (const enabled of [false, true]) {
        await page.evaluate(({ scale, enabled }) => { state.boardScale = scale; state.aggEnabled = enabled; render(); }, { scale, enabled });
        await select('acl2', 18);
        const baseline = await measure();
        await select('auto', 1132);
        const acgl = await measure();
        acgl.forEach((entry, i) => entry.rect.forEach((n, j) => assert(Math.abs(n - baseline[i].rect[j]) < .1, `ACL2 geometry ${scale}/${enabled}/${i}/${j}`)));
        assert(acgl[1].image.includes('rgb(72, 0, 43)'));
        assert(acgl[3].image.includes('rgb(255, 120, 75)'));
        assert(acgl[6].image.includes('rgb(72, 0, 43)'));
        assert.equal(acgl[6].color, 'rgb(255, 255, 255)');
        const m = await page.evaluate(() => {
          const read = s => { const c = getComputedStyle(document.querySelector(s)); return [c.backgroundImage, c.color]; };
          return { theme: _currentTheme, logo: getComputedStyle(document.querySelector('.epl-lion')).display,
            extra: read('.extra-time'), totals: [...document.querySelectorAll('.total-score')].map(el => [getComputedStyle(el).backgroundImage, getComputedStyle(el).color]) };
        });
        assert.equal(m.theme, 'acgl'); assert.equal(m.logo, 'none');
        assert.equal(m.extra[1], 'rgb(72, 0, 43)');
        assert(m.extra[0].includes('rgb(233, 223, 198)'));
        if (enabled) m.totals.forEach(pair => assert.deepEqual(pair, m.extra));
      }
    }
    await select('acgl', 39);
    await page.evaluate(() => { state.boardScale = 100; state.aggEnabled = false; render(); fsmBoardRender(); });
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-acgl.png' });
    await page.evaluate(() => { state.aggEnabled = true; render(); fsmBoardRender(); });
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-acgl-aggregate.png' });
    await page.evaluate(() => { state.half = 'PK'; state.pk = { home: ['G', 'M'], away: ['G'] }; render(); fsmBoardRender(); });
    assert.deepEqual(await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.pso-main')); return [s.backgroundColor, s.color]; }), ['rgb(255, 120, 75)', 'rgb(72, 0, 43)']);
    console.log('PASS ACGL auto/manual, ACL2 geometry at four scales, gradients, purple timer, cream extra/aggregate and PSO');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
