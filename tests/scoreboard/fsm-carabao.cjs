const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      state.fsmTheme = 'carabao';
      Object.assign(state.colors, { homeBg: '#a02030', homeText: '#ffe080', awayBg: '#123456', awayText: '#ffffff' });
      state.homeName = 'Home Team'; state.awayName = 'Away Team';
      state.homeScore = 2; state.awayScore = 1;
      autoApplyTemplateByLeagueId(48, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => document.fonts.ready);
    for (const scale of [60, 100, 150]) {
      await page.evaluate(scale => {
        state.boardScale = scale; state.aggEnabled = true;
        state.half = 'PK'; state.pk = { home: ['G', 'M'], away: ['G'] };
        render(); fsmBoardRender();
      }, scale);
      await settle(page);
      const actual = await page.evaluate(() => {
        const style = selector => getComputedStyle(document.querySelector(selector));
        return {
          names: ['#homeName', '#awayName'].map(s => style(s).color),
          rings: ['#team-logo-left', '#team-logo-right'].map(s => {
            const ring = getComputedStyle(document.querySelector(s), '::before');
            return [ring.width, ring.height, ring.borderRadius, ring.borderTopColor];
          }),
          colors: ['.time', '.pso-main', '.total-score'].map(s => [style(s).backgroundColor, style(s).color]),
          aggregate: document.querySelector('#board').dataset.fsmAggregate
        };
      });
      assert.deepEqual(actual.names, ['rgb(255, 224, 128)', 'rgb(255, 255, 255)']);
      assert.deepEqual(actual.rings, [
        ['48px', '48px', '50%', 'rgb(160, 32, 48)'],
        ['48px', '48px', '50%', 'rgb(18, 52, 86)']
      ]);
      assert.equal(actual.aggregate, 'true');
      actual.colors.forEach(pair => assert.deepEqual(pair, ['rgb(0, 143, 94)', 'rgb(255, 255, 255)']));
    }
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-carabao.png' });
    await page.evaluate(() => {
      state.homeLogo = state.awayLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="magenta" d="M0 0H40V40H0Z"/></svg>');
    });
    for (const scale of [60, 100, 150]) {
      await page.evaluate(scale => { state.boardScale = scale; render(); fsmBoardRender(); }, scale);
      await page.evaluate(() => Promise.all([...document.querySelectorAll('.carabao-logo-clip img')].map(img => img.decode())));
      const clipped = await page.evaluate(() => [...document.querySelectorAll('.carabao-logo-clip')].map(clip => {
        const img = clip.querySelector('img');
        img.style.pointerEvents = 'auto';
        img.style.transform = 'translate(-40%, -60%) scale(3)';
        const r = clip.getBoundingClientRect();
        const hit = (x, y) => document.elementsFromPoint(x, y).includes(img);
        return { center: hit(r.left + r.width / 2, r.top + r.height / 2),
          top: hit(r.left + r.width * .03, r.top + r.height * .03),
          bottom: hit(r.right - r.width * .03, r.bottom - r.height * .03),
          outside: hit(r.left + r.width / 2, r.top - 2), rect: [r.x,r.y,r.width,r.height],
          overflow: getComputedStyle(clip).overflow, radius:getComputedStyle(clip).borderRadius };
      }));
      assert(clipped.every(c => c.center && !c.top && !c.bottom && !c.outside), `circular clipping ${scale}: ${JSON.stringify(clipped)}`);
    }
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-carabao-clipping.png' });
    await page.evaluate(() => { state.fsmTheme = 'seriea'; autoApplyTemplateByLeagueId(135, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    assert.equal(await page.locator('.carabao-logo-clip').count(), 0);
    assert.equal(await page.locator('.team-logo > img').count(), 2);
    console.log('PASS Carabao circular logos, team colors, timer/PSO/aggregate palette at 60/100/150%');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
