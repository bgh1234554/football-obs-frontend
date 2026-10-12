const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const logo = 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/BelarusianPremierLeague.svg';
    await page.route(logo, route => route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(os.tmpdir(), 'fsm-Belarus.svg')) }));
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const previous of ['fnl', 'pl', 'jleague', 'rpl']) {
      await page.evaluate(t => applyTheme(t, null), previous);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => {
        state.fsmTheme = 'auto'; state.homeName = '네만'; state.awayName = '바테';
        Object.assign(state.colors, { homeBg: '#ffdd00', homeText: '#004b26', awayBg: '#ff0000', awayText: '#ffffff' });
        state.seconds = 2120; state.extra = 3; state.extraShown = true;
        state.homeScore = 0; state.awayScore = 0; state.redHome = 1; state.redAway = 0;
        autoApplyTemplateByLeagueId(116, null); render();
      });
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready); await settle(page);
      assert.equal(await page.evaluate(() => _currentTheme), 'belarus');
      assert.equal(await page.locator('.epl-lion').getAttribute('src'), logo);
      const colors = await page.evaluate(() => ['.time', '.extra-time', '.score-div', '#homeCard', '#homeName'].map(s => {
        const c = getComputedStyle(document.querySelector(s), s === '#homeCard' ? '::before' : null); return [c.backgroundColor, c.color];
      }));
      assert.deepEqual(colors[0], ['rgb(16, 233, 79)', 'rgb(0, 0, 0)']);
      assert.deepEqual(colors[1], ['rgb(35, 52, 52)', 'rgb(20, 235, 75)']);
      assert.equal(colors[2][0], 'rgb(35, 52, 52)');
      assert.equal(colors[3][0], 'rgb(255, 221, 0)');
      assert.equal(colors[4][1], 'rgb(0, 75, 38)');
    }
    await page.waitForTimeout(150);
    await page.locator('#boardStageInner').screenshot({ path: 'screenshots/tests/belarus.png' });
    for (const scale of [100, 75]) {
      await page.evaluate(scale => { state.boardScale = scale; reapplyBoardScale(); }, scale);
      await settle(page);
      await page.waitForTimeout(100);
      const geometry = await page.locator('#team-score-left').evaluate(n => {
        const r = n.getBoundingClientRect();
        const style = getComputedStyle(n), ratio = r.height / n.offsetHeight;
        const value = name => parseFloat(style.getPropertyValue('--fsm-belarus-' + name));
        return { bends: ['upper', 'lower'].map(name => {
          const y = value(name + '-y'), outer = value(name + '-outer'), inner = value(name + '-inner');
          return { deviceY: (r.top + y * ratio) * devicePixelRatio, y, outer, inner };
        }), paths: ['#team-score-left', '#team-score-right'].map(s => getComputedStyle(document.querySelector(s), '::before').clipPath) };
      });
      for (const bend of geometry.bends) {
        assert(Math.abs(bend.deviceY - Math.round(bend.deviceY)) < 1e-5, `${scale}%: bend must land on a device pixel`);
        assert(Math.abs(bend.inner - bend.outer - 5.46) < 1e-8);
        assert(Math.abs((bend.outer - 1.36) / bend.y - 1 / 12) < 1e-8);
      }
      assert.equal(geometry.paths[0], geometry.paths[1]);
      console.log('PASS', scale, 'pixel alignment, slope, bump width, shared mirrored path');
      await page.locator('#boardStageInner').screenshot({ path: `screenshots/tests/belarus-${scale}.png` });
    }
    for (const score of [0, 1, 8, 10]) {
      await page.evaluate(score => { state.homeScore = score; state.awayScore = score; render(); fsmBoardRender(); }, score);
      await settle(page);
      const fits = await page.locator('.team-score').evaluateAll(nodes => nodes.every(n => {
        const span = n.querySelector('span'), r = n.getBoundingClientRect(), s = span.getBoundingClientRect();
        return s.width <= r.width && s.height <= r.height;
      }));
      assert(fits, `score ${score} must fit`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS Belarus routing, theme transitions, colors, logo, score fit');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
