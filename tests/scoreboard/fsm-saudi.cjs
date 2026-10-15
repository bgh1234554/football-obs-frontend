const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    // 대회 로고 배포 상태와 독립적으로 흰 로고 칸과 텍스트·숫자 배치를 검증합니다.
    await page.route('**/leagues/SaudiProLeague.svg', route => route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><path fill="#273441" d="M5 5H55V35H5Z"/></svg>' }));
    await page.evaluate(() => {
      state.fsmTheme = 'auto'; state.homeName = 'AL HILAL'; state.awayName = 'AL NASSR';
      state.homeScore = 2; state.awayScore = 1; state.extra = 4; state.extraShown = true; state.half = '2H';
      Object.assign(state.colors, { homeBg: '#123456', homeText: '#ffffff', awayBg: '#ffe080', awayText: '#102030' });
      state.homeLogo = state.awayLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="navy"/></svg>');
      autoApplyTemplateByLeagueId(307, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink && document.querySelector('.epl-lion').naturalWidth > 0);
    await page.evaluate(() => document.fonts.ready);
    for (const scale of [60, 75, 100, 150]) {
      for (const position of ['left', 'center', 'right']) {
        const samples = [];
        for (const enabled of [false, true, false]) {
          await page.evaluate(({ scale, position, enabled }) => {
            state.boardScale = scale; state.boardPosition = position; state.aggEnabled = enabled;
            state.aggHomeBase = 10; state.aggAwayBase = 1; render(); fsmBoardRender();
          }, { scale, position, enabled });
          await settle(page);
          const m = await page.evaluate(() => {
            const main = document.querySelector('.scoreboard-main'), box = main.getBoundingClientRect();
            const scale = box.width / main.offsetWidth;
            const center = document.querySelector('.score-div').getBoundingClientRect(), cx = (center.left + center.right) / 2;
            const style = s => getComputedStyle(document.querySelector(s));
            const color = s => [style(s).backgroundColor, style(s).color];
            return { theme: _currentTheme, url: document.querySelector('.epl-lion').src,
              tops: [box.top, center.top, document.querySelector('.time').getBoundingClientRect().top],
              offsets: ['#team-score-left', '#team-score-right'].map(s => (document.querySelector(s).getBoundingClientRect().left - cx) / scale),
              home: color('.teams-left'), away: color('.teams-right'), names: [style('#homeName').color, style('#awayName').color],
              logo: style('.score-div').backgroundColor, score: [style('#team-score-left').fontSize, style('#team-score-left').fontFamily, style('#homeScore').transform],
              images: ['#team-score-left', '#team-score-right'].map(s => style(s).backgroundImage),
              total: [...document.querySelectorAll('.total-score')].map(el => [getComputedStyle(el).backgroundImage, getComputedStyle(el).color]),
              clock: color('.time'), extra: color('.extra-time'),
              radius: ['#team-logo-left', '#team-logo-right', '.teams-left', '.teams-right', '.time', '.extra-time'].map(s => [style(s).borderTopLeftRadius, style(s).borderTopRightRadius, style(s).borderBottomLeftRadius, style(s).borderBottomRightRadius]),
              fits: [...document.querySelectorAll('.team-name')].every(el => el.querySelector('.text').scrollWidth <= el.clientWidth - 48 + 1) };
          });
          assert.equal(m.theme, 'saudi');
          assert.equal(m.url, 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/SaudiProLeague.svg');
          assert.equal(m.home[0], 'rgb(18, 52, 86)'); assert.equal(m.away[0], 'rgb(255, 224, 128)');
          assert.deepEqual(m.names, ['rgb(255, 255, 255)', 'rgb(16, 32, 48)']);
          assert.equal(m.logo, 'rgb(255, 255, 255)');
          assert.equal(m.score[0], '64px'); assert(m.score[1].includes('Pretendard-Medium')); assert(m.score[2].includes('-4'));
          m.images.forEach(image => assert.equal(image, 'linear-gradient(rgb(39, 52, 65), rgb(21, 29, 43))'));
          if (enabled) m.total.forEach(pair => assert.deepEqual(pair, [m.images[0], 'rgb(255, 255, 255)']));
          assert.deepEqual(m.clock, ['rgb(20, 23, 34)', 'rgb(255, 255, 255)']);
          assert.deepEqual(m.extra, ['rgb(223, 58, 61)', 'rgb(255, 255, 255)']);
          assert.deepEqual(m.radius, [['12px', '0px', '0px', '0px'], ['0px', '12px', '0px', '0px'], ['0px', '0px', '0px', '12px'], ['0px', '0px', '12px', '0px'], ['0px', '0px', '8px', '8px'], ['0px', '0px', '8px', '8px']]);
          assert(m.fits);
          if (position === 'center' && scale === 100) {
            const png = await page.locator('#board').screenshot();
            const corners = await page.evaluate(async base64 => {
              const origin = document.querySelector('#board').getBoundingClientRect();
              const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
              const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
              const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
              const pixel = (x, y) => [...ctx.getImageData(Math.floor(x - origin.left), Math.floor(y - origin.top), 1, 1).data];
              return ['#homeCard', '#awayCard'].map((selector, i) => {
                const r = document.querySelector(selector).getBoundingClientRect();
                const edge = i ? r.left : r.right, inward = i ? 2 : -2;
                return [pixel(edge + inward, r.bottom - 2), pixel(edge - inward, r.bottom - 2)];
              });
            }, png.toString('base64'));
            corners.forEach(([corner, score]) => assert.deepEqual(corner, score, 'rounded team-name corner must continue score gradient'));
          }
          samples.push(m);
        }
        samples.slice(1).forEach(m => ['tops', 'offsets'].forEach(key => m[key].forEach((v, i) => assert(Math.abs(v - samples[0][key][i]) < .1, `stable ${scale}/${position}/${key}/${i}`))));
      }
    }
    await page.evaluate(() => { state.fsmTheme = 'saudi'; state.boardScale = 100; state.boardPosition = 'center'; autoApplyTemplateByLeagueId(39, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    await settle(page);
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-saudi.png' });
    await page.evaluate(() => { state.half = 'PK'; state.pk = { home: ['G', 'M'], away: ['G'] }; render(); fsmBoardRender(); });
    assert.deepEqual(await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.pso-main')); return [s.backgroundColor, s.color]; }), ['rgb(20, 23, 34)', 'rgb(255, 255, 255)']);
    console.log('PASS Saudi auto/manual, Uzbek scores and aggregate spacing, EFL team colors, mirrored corners, timer/extra/PSO at four scales and three positions');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
