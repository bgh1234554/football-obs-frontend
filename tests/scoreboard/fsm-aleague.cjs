const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.route('**/leagues/ALeagueMen.svg', route => route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22.98 23.24"><rect width="22.98" height="23.24" fill="white"/></svg>' }));
    await page.evaluate(() => {
      state.fsmTheme = 'auto'; state.homeName = 'MELBOURNE CITY'; state.awayName = 'SYDNEY FC';
      state.homeScore = 2; state.awayScore = 1; state.extra = 3; state.extraShown = true;
      Object.assign(state.colors, { homeBg: '#2080ff', homeText: '#ffe080', awayBg: '#e02030', awayText: '#40df80' });
      state.homeLogo = state.awayLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="navy"/></svg>');
      autoApplyTemplateByLeagueId(188, null); render();
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
            const rect = s => document.querySelector(s).getBoundingClientRect();
            const style = s => getComputedStyle(document.querySelector(s));
            const main = rect('.scoreboard-main'), logo = rect('.epl-lion'), center = rect('.score-div');
            const scale = main.width / document.querySelector('.scoreboard-main').offsetWidth, cx = (center.left + center.right) / 2;
            const read = s => [style(s).backgroundColor, style(s).color];
            return { theme: _currentTheme, radius: parseFloat(document.querySelector('#board').style.getPropertyValue('--cnl-radius')),
              central: ['#team-score-left', '#team-score-right', '.score-div'].map(read),
              names: ['.teams-left', '.teams-right'].map(s => [style(s).backgroundColor, getComputedStyle(document.querySelector(s + ' .team-name')).color]),
              strips: ['.teams-left', '.teams-right'].map(s => getComputedStyle(document.querySelector(s), '::after').backgroundImage),
              clip: ['#team-score-left', '#team-score-right'].map(s => style(s).clipPath),
              totals: [...document.querySelectorAll('.total-score')].map(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color, getComputedStyle(el).clipPath]),
              clock: read('.time'), extra: read('.extra-time'), top: (main.top - logo.top) / scale, bottom: (main.bottom - logo.bottom) / scale, logoAspect: logo.width / logo.height,
              tops: [main.top, center.top, rect('.time').top],
              gaps: ['#team-score-left', '#team-score-right'].map(s => (rect(s).left - cx) / scale),
              hiddenCurves: [...document.querySelectorAll('.cnl-curve')].every(el => getComputedStyle(el).display === 'none') };
          });
          assert.equal(m.theme, 'aleague');
          assert.equal(m.radius, enabled ? 110 : 82);
          m.central.forEach(pair => assert.deepEqual(pair, ['rgb(20, 25, 147)', 'rgb(255, 255, 255)']));
          m.names.forEach(pair => assert.deepEqual(pair, ['rgb(255, 255, 255)', 'rgb(21, 20, 59)']));
          assert.equal(m.strips[0], 'linear-gradient(to right, rgb(32, 128, 255) 50%, rgb(255, 224, 128) 50%)');
          assert.equal(m.strips[1], 'linear-gradient(to right, rgb(224, 32, 48) 50%, rgb(64, 223, 128) 50%)');
          m.clip.forEach(clip => assert(enabled ? clip === 'none' : clip.startsWith('circle(82px')));
          if (enabled) m.totals.forEach(t => { assert.deepEqual(t.slice(0, 2), m.central[0]); assert(t[2].startsWith('circle(110px')); });
          assert.deepEqual(m.clock, ['rgb(54, 64, 205)', 'rgb(255, 255, 255)']);
          assert.deepEqual(m.extra, ['rgb(216, 72, 103)', 'rgb(255, 255, 255)']);
          assert(Math.abs(m.top - 14) < .1); assert(Math.abs(m.bottom) < .1);
          assert(Math.abs(m.logoAspect - 22.98 / 23.24) < .001); assert(m.hiddenCurves);
          if (scale === 100 && position === 'center') {
            const png = await page.locator('#board').screenshot();
            const ends = await page.evaluate(async base64 => {
              const origin = document.querySelector('#board').getBoundingClientRect();
              const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
              const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
              const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
              return ['#homeCard', '#awayCard'].map((selector, i) => {
                const r = document.querySelector(selector).getBoundingClientRect();
                const x = i ? r.left - 1 : r.right + 1;
                return [...ctx.getImageData(Math.floor(x - origin.left), Math.floor(r.bottom - origin.top - 2), 1, 1).data];
              });
            }, png.toString('base64'));
            assert.deepEqual(ends, [[255, 224, 128, 255], [224, 32, 48, 255]], 'two-color strips must reach the circular score edge on both sides');
          }
          samples.push(m);
        }
        samples.slice(1).forEach(m => ['tops', 'gaps'].forEach(key => m[key].forEach((v, i) => assert(Math.abs(v - samples[0][key][i]) < .1))));
      }
    }
    await page.evaluate(() => { state.fsmTheme = 'aleague'; state.boardScale = 100; state.boardPosition = 'center'; autoApplyTemplateByLeagueId(39, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-aleague.png' });
    console.log('PASS A-League auto/manual, CNL circle/aggregate logic, upward-only logo, horizontal two-color strips, exact palette at four scales and three positions');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
