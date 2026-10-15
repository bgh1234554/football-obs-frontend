const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const dpr of [1, 1.25]) {
      const page = await openPage(browser, { dpr, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
      await page.route('**/leagues/SaudiKingsCup.png', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 70"><path fill="gold" d="M0 0H64V70H0Z"/></svg>' }));
      await page.evaluate(() => {
        state.fsmTheme = 'auto'; state.homeName = 'HOME'; state.awayName = 'AWAY';
        state.homeScore = 1; state.awayScore = 2; state.extra = 1; state.extraShown = true;
        Object.assign(state.colors, { homeBg: '#ff2020', awayBg: '#2070df', homeText: '#ffffff', awayText: '#ffffff' });
        autoApplyTemplateByLeagueId(504, null); render();
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
                teamBorders: ['.teams-left', '.teams-right'].map(s => [style(s).borderBottomColor, style(s).borderBottomWidth]) };
            });
            assert.equal(m.theme, 'saudikingscup');
            m.colors.slice(0, 2).forEach(pair => assert.deepEqual(pair, ['rgb(183, 153, 60)', 'rgb(34, 36, 42)']));
            assert.deepEqual(m.colors[2], ['rgb(34, 36, 42)', 'rgb(255, 255, 255)']);
            assert.deepEqual(m.colors[3], ['rgb(122, 93, 59)', 'rgb(55, 38, 28)']);
            assert.deepEqual(m.colors[4], ['rgb(19, 78, 26)', 'rgb(255, 255, 255)']);
            assert.equal(m.colors[5][0], 'rgb(10, 44, 16)');
            assert(Math.abs(m.logoTop - 24) < .1); assert(Math.abs(m.logoBottom - 2) < .1);
            assert.deepEqual(m.teamBorders, [['rgb(255, 32, 32)', '5px'], ['rgb(32, 112, 223)', '5px']]);
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
      await page.evaluate(() => { state.fsmTheme = 'saudikingscup'; autoApplyTemplateByLeagueId(39, null); render(); });
      await page.waitForFunction(() => !pendingThemeLink);
      assert.equal(await page.evaluate(() => _currentTheme), 'saudikingscup');
      await page.close();
    }
    console.log('PASS Saudi Kings Cup auto/manual, latest palette, upward-only logo, Ligue 1 team strips, aggregate spacing and 75% pixel seams at DPR 1/1.25');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
