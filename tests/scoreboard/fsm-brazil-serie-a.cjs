const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const dpr of [1, 1.25]) {
      const page = await openPage(browser, { dpr, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
      await page.route('**/leagues/BrazilSerieA.svg', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 70"><path fill="gold" d="M0 0H64V70H0Z"/></svg>' }));
      await page.evaluate(() => {
        state.fsmTheme = 'auto'; state.homeName = 'HOME'; state.awayName = 'AWAY';
        state.homeScore = 1; state.awayScore = 2; state.extra = 1; state.extraShown = true;
        Object.assign(state.colors, { homeBg: '#ff2020', awayBg: '#2070df', homeText: '#ffffff', awayText: '#ffffff' });
        autoApplyTemplateByLeagueId(71, null); render();
      });
      await page.waitForFunction(() => !pendingThemeLink && document.querySelector('.epl-lion').naturalWidth > 0);
      await page.evaluate(() => document.fonts.ready);
      for (const scale of [60, 75, 100, 150]) {
        for (const position of ['left', 'center', 'right']) {
          const samples = [];
          for (const enabled of [false, true]) {
            await page.evaluate(({ scale, position, enabled }) => {
              state.boardScale = scale; state.boardPosition = position; state.aggEnabled = enabled;
              state.aggHomeBase = 1; state.aggAwayBase = 1; render(); fsmBoardRender();
            }, { scale, position, enabled });
            await settle(page);
            const m = await page.evaluate(() => {
              const rect = s => document.querySelector(s).getBoundingClientRect();
              const style = s => getComputedStyle(document.querySelector(s));
              const main = rect('.scoreboard-main'), logo = rect('.epl-lion'), center = rect('.score-div');
              const scale = main.width / document.querySelector('.scoreboard-main').offsetWidth, cx = (center.left + center.right) / 2;
              const color = s => [style(s).backgroundColor, style(s).color];
              return { theme: _currentTheme, colors: ['#team-score-left', '#team-score-right', '.time', '.extra-time', '.teams-left', '.score-div'].map(color),
                logoTop: (main.top - logo.top) / scale, logoBottom: (main.bottom - logo.bottom) / scale,
                tops: [main.top, center.top, rect('.time').top],
                offsets: ['#team-score-left', '#team-score-right'].map(s => (rect(s).left - cx) / scale),
                totals: [...document.querySelectorAll('.total-score')].map(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]),
                gradient: style('.div-background').backgroundImage, strips: ['#homeColor', '#awayColor'].map(s => [style(s).backgroundImage, rect(s).width / scale, rect(s).height / scale]) };
            });
            assert.equal(m.theme, 'brazilseriea');
            m.colors.slice(0, 2).forEach(pair => assert.deepEqual(pair, ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']));
            assert.deepEqual(m.colors[2], ['rgb(19, 20, 40)', 'rgb(255, 255, 255)']);
            assert.deepEqual(m.colors[3], ['rgb(199, 255, 0)', 'rgb(19, 20, 40)']);
            assert.deepEqual(m.colors[4], ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']);
            assert.equal(m.colors[5][0], 'rgb(199, 255, 0)');
            assert(Math.abs(m.logoTop - 24) < .1); assert(Math.abs(m.logoBottom - 2) < .1);
            assert(m.gradient.includes('rgb(62, 85, 137)') && m.gradient.includes('rgb(60, 169, 178)'));
            m.strips.forEach(strip => { assert(strip[0].includes('50%')); assert(Math.abs(strip[1] - 8) < .1); assert(Math.abs(strip[2] - 48) < .1); });
            if (enabled) m.totals.forEach(pair => assert.deepEqual(pair, m.colors[0]));
            // 75%의 네 연결부에서 뒤 배경과 같은 색의 세로 균열이 생기지 않는지 픽셀을 검사합니다.
            if (scale === 75) {
              const png = await page.locator('#board').screenshot();
              const gaps = await page.evaluate(async base64 => {
                const origin = document.querySelector('#board').getBoundingClientRect();
                const main = document.querySelector('.scoreboard-main').getBoundingClientRect();
                const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
                const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
                const factor = img.width / origin.width;
                const center = document.querySelector('.score-div').getBoundingClientRect();
                const edges = [document.querySelector('#homeCard').getBoundingClientRect().right, center.left, center.right, document.querySelector('#awayCard').getBoundingClientRect().left];
                return edges.map(edge => {
                  const x = Math.floor((edge - origin.left) * factor);
                  let backgroundPixels = 0;
                  for (let y = Math.ceil((main.top - origin.top + 2) * factor); y < (main.bottom - origin.top - 6) * factor; y++) {
                    const p = ctx.getImageData(x, y, 1, 1).data;
                    if (p[0] === 17 && p[1] === 24 && p[2] === 39) backgroundPixels++;
                  }
                  return backgroundPixels;
                });
              }, png.toString('base64'));
              assert(gaps.every(n => n === 0), `75% panel cracks ${dpr}/${position}/${enabled}: ${gaps}`);
            }
            samples.push(m);
          }
          ['tops', 'offsets'].forEach(key => samples[1][key].forEach((v, i) => assert(Math.abs(v - samples[0][key][i]) < .1)));
        }
      }
      await page.evaluate(() => { state.fsmTheme = 'brazilseriea'; autoApplyTemplateByLeagueId(39, null); render(); });
      await page.waitForFunction(() => !pendingThemeLink);
      assert.equal(await page.evaluate(() => _currentTheme), 'brazilseriea');
      await page.close();
    }
    console.log('PASS Brazil Serie A auto/manual, continuous gradient, LaLiga strips, upward logo, aggregate geometry and 75% seams at DPR 1/1.25');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
