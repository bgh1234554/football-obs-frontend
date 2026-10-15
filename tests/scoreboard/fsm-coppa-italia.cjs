const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.route('**/football-obs-logo-cdn/leagues/CoppaItalia.svg', async route => {
      await route.fulfill({ response: await route.fetch() });
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      state.homeName = '인터 밀란'; state.awayName = '유벤투스';
      state.homeScore = 2; state.awayScore = 1;
      state.extra = 4; state.extraShown = true;
      state.half = '2H'; state.aggEnabled = false;
      state.homeLogo = state.awayLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="navy"/></svg>');
    });
    const select = async (theme, id) => {
      await page.evaluate(({ theme, id }) => {
        state.fsmTheme = theme;
        autoApplyTemplateByLeagueId(id, null); render();
      }, { theme, id });
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
    };
    const measure = () => page.evaluate(() => {
      const main = document.querySelector('.scoreboard-main').getBoundingClientRect();
      return ['.teams-left', '.teams-right', '#team-score-left', '#team-score-right', '.score-div', '.team-logo', '.time', '.extra-time'].map(selector => {
        const el = document.querySelector(selector), s = getComputedStyle(el), r = el.getBoundingClientRect();
        return { bg: s.backgroundColor, image: s.backgroundImage, color: s.color, transform: s.transform,
          geometry: [r.left - main.left, r.top - main.top, r.width, r.height] };
      });
    });
    for (const scale of [60, 100, 150]) {
      await page.evaluate(scale => { state.boardScale = scale; render(); }, scale);
      await select('seriea', 135);
      const original = await measure();
      await select('auto', 137);
      await page.waitForFunction(() => document.querySelector('.epl-lion').naturalWidth > 0);
      const coppa = await measure();
      coppa.forEach((entry, i) => {
        if (i === 4) return;
        entry.geometry.forEach((n, j) => assert(Math.abs(n - original[i].geometry[j]) < 1, `geometry ${scale}/${i}/${j}`));
        assert.equal(entry.transform, original[i].transform);
      });
      [0, 1].forEach(i => assert.equal(coppa[i].bg, 'rgb(165, 41, 49)'));
      [2, 3, 7].forEach(i => {
        assert.equal(coppa[i].bg, 'rgb(255, 255, 255)');
        assert.equal(coppa[i].color, 'rgb(102, 23, 41)');
      });
      assert.equal(coppa[4].bg, 'rgb(255, 255, 255)');
      assert.equal(coppa[4].geometry[3], coppa[2].geometry[3]);
      assert.equal(coppa[6].bg, 'rgb(102, 23, 41)');
      assert.equal(coppa[6].color, 'rgb(255, 255, 255)');
      assert(await page.evaluate(() => {
        const img = document.querySelector('.epl-lion');
        return _currentTheme === 'coppaitalia' && img.complete && img.naturalWidth > 0 && img.src === 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CoppaItalia.svg';
      }));
      const logoGap = await page.evaluate(() => {
        const main = document.querySelector('.scoreboard-main');
        const scale = main.getBoundingClientRect().width / main.offsetWidth;
        return (document.querySelector('#team-score-left').getBoundingClientRect().bottom -
          document.querySelector('.epl-lion').getBoundingClientRect().bottom) / scale;
      });
      assert(Math.abs(logoGap - 2) < .1, `logo bottom gap: ${logoGap}`);
    }
    await select('coppaitalia', 39);
    await page.evaluate(() => { state.boardScale = 100; render(); fsmBoardRender(); });
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-coppa-italia.png' });
    for (const scale of [60, 75, 100, 150]) {
      for (const position of ['left', 'center', 'right']) {
      await page.evaluate(position => { state.boardPosition = position; render(); }, position);
      const tops = [];
      const inner = [];
      for (const enabled of [false, true, false]) {
        await page.evaluate(({ scale, enabled }) => {
          state.boardScale = scale; state.aggEnabled = enabled;
          render(); fsmBoardRender();
        }, { scale, enabled });
        await settle(page);
        tops.push(await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect();
          return ['.scoreboard-main', '#team-score-left', '.epl-lion', '.time'].map(s => rect(s).top);
        }));
        inner.push(await page.evaluate(() => {
          const logo = document.querySelector('.epl-lion').getBoundingClientRect();
          const center = (logo.left + logo.right) / 2;
          return ['#homeScore', '#awayScore'].map(selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return (r.left + r.right) / 2 - center;
          });
        }));
      }
      tops.slice(1).forEach(values => values.forEach((top, i) => assert(Math.abs(top - tops[0][i]) < .1, `aggregate toggle ${scale}/${i}: ${top} vs ${tops[0][i]}`)));
      inner.slice(1).forEach(values => values.forEach((x, i) => assert(Math.abs(x - inner[0][i]) < .1, `inner spacing ${scale}/${position}/${i}: ${x} vs ${inner[0][i]}`)));
      }
    }
    await page.evaluate(() => { state.boardScale = 100; state.boardPosition = 'center'; state.aggEnabled = true; render(); fsmBoardRender(); });
    await settle(page);
    const aggregateImage = await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-coppa-italia-aggregate.png' });
    const finish = await page.evaluate(async base64 => {
      const board = document.querySelector('#board'), origin = board.getBoundingClientRect();
      const card = document.querySelector('#awayCard').getBoundingClientRect();
      const main = document.querySelector('.scoreboard-main').getBoundingClientRect();
      const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixel = [...ctx.getImageData(Math.floor(card.left - origin.left - 2), Math.floor(main.bottom - origin.top - 2), 1, 1).data];
      const primary = board.style.getPropertyValue('--fsm-away-primary-color');
      ctx.fillStyle = primary; ctx.fillRect(0, 0, 1, 1);
      return { pixel, expected: [...ctx.getImageData(0, 0, 1, 1).data] };
    }, aggregateImage.toString('base64'));
    assert.deepEqual(finish.pixel, finish.expected, 'away aggregate diagonal must continue the lower team-color strip');
    await page.evaluate(() => {
      state.aggEnabled = true; state.aggHomeBase = 1; state.aggAwayBase = 0;
      state.half = 'PK'; state.pk = { home: ['G', 'M'], away: ['G'] };
      render(); fsmBoardRender();
    });
    await settle(page);
    const extra = await page.evaluate(() => {
      const board = document.querySelector('#board'), total = getComputedStyle(board.querySelector('.total-score'));
      return { agg: board.dataset.fsmAggregate, pso: board.style.getPropertyValue('--fsm-pso-background'),
        bg: total.backgroundColor, ink: total.color, transform: total.transform };
    });
    assert.equal(extra.agg, 'true');
    assert.equal(extra.pso.toLowerCase(), '#661729');
    assert.equal(extra.bg, 'rgb(102, 23, 41)');
    assert.equal(extra.ink, 'rgb(255, 255, 255)');
    assert.notEqual(extra.transform, 'none');
    assert.deepEqual(errors, []);
    console.log('PASS Coppa Italia auto/manual, logo, exact palette, Serie A geometry at 60/100/150%, aggregate and PSO');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
