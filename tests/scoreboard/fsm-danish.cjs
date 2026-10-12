const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
const output = path.resolve('screenshots/tests');
const logo = 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/DanishSuperliga.svg';

(async () => {
  const browser = await chromium.launch();
  try {
    for (const dpr of [1, 1.25, 2]) {
      const page = await openPage(browser, { dpr, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // 실제 로고가 준비된 로컬 검증에서는 다운로드한 원본을 사용합니다.
      const localLogo = path.join(output, 'danish-logo.svg');
      if (fs.existsSync(localLogo)) await page.route(logo, route => route.fulfill({ body: fs.readFileSync(localLogo), contentType: 'image/svg+xml' }));
      for (const source of ['rpl', 'jleague', 'danish']) {
        await page.evaluate(source => { state.fsmTheme = source; autoApplyTemplateByLeagueId(119, null); render(); }, source);
        await page.waitForFunction(() => !pendingThemeLink);
        await page.evaluate(() => {
          state.fsmTheme = 'auto'; state.homeName = 'Lyngby BK'; state.awayName = 'FC Midtjylland';
          state.homeScore = 1; state.awayScore = 1; state.manualMode = true; state.seconds = 5579;
          state.extraShown = true; state.extra = 3;
          Object.assign(state.colors, { homeBg: '#0077bb', homeText: '#ffffff', awayBg: '#ee3300', awayText: '#111111' });
          autoApplyTemplateByLeagueId(119, null); render();
        });
        await page.waitForFunction(() => !pendingThemeLink && _currentTheme === 'danish');
        await page.evaluate(async () => { await document.fonts.ready; fsmBoardRender(); });
        await settle(page);
        assert.equal(await page.locator('.epl-lion').getAttribute('src'), logo);
        const colors = await page.evaluate(() => {
          const s = (q, pseudo) => getComputedStyle(document.querySelector(q), pseudo);
          return { score: [s('.team-score').backgroundColor, s('.team-score').color],
            logo: s('.score-div').backgroundColor, name: s('.team-name').color,
            gradient: s('.teams-left').backgroundImage,
            clock: [s('.time', '::before').backgroundColor, s('.time').color],
            extra: [s('.extra-time', '::before').backgroundColor, s('.extra-time').color],
            fill: s('#homeColor .danish-triangle-fill').fill, stroke: s('#homeColor .danish-triangle-edge').stroke };
        });
        assert.deepEqual(colors.score, ['rgb(200, 240, 99)', 'rgb(0, 0, 0)']);
        assert.equal(colors.logo, colors.score[0]); assert.equal(colors.name, colors.score[1]);
        assert.equal(colors.gradient, 'linear-gradient(rgb(239, 243, 228), rgb(231, 238, 236))');
        assert.deepEqual(colors.clock, ['rgb(189, 229, 94)', 'rgb(0, 0, 0)']);
        assert.deepEqual(colors.extra, ['rgb(17, 20, 38)', 'rgb(255, 255, 255)']);
        assert.equal(colors.fill, 'rgb(0, 119, 187)'); assert.equal(colors.stroke, 'rgb(255, 255, 255)');
        assert.equal(await page.locator('.danish-triangle').count(), 2);
        for (const scale of [100, 75]) {
          await page.evaluate(scale => { state.boardScale = scale; reapplyBoardScale(); }, scale);
          await settle(page);
          const geometry = await page.evaluate(() => {
            const r = q => { const b = document.querySelector(q).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
            return { home: r('#homeColor'), away: r('#awayColor'), hs: r('#team-score-left'), as: r('#team-score-right'), clock: r('.time'), extra: r('.extra-time'), logo: r('.epl-lion'),
              names: ['#homeName', '#awayName'].map(r),
              cards: ['#homeCard', '#awayCard'].map(r),
              texts: ['#team-text-left', '#team-text-right'].map(r) };
          });
          const near = (a, b) => assert(Math.abs(a - b) < .1, JSON.stringify(geometry));
          near(geometry.home.right, geometry.hs.left); near(geometry.away.left, geometry.as.right);
          near(geometry.clock.left, geometry.hs.left); near(geometry.clock.right, geometry.as.right);
          near(geometry.clock.right, geometry.extra.left); near(geometry.clock.top, geometry.hs.bottom);
          near(geometry.home.width / geometry.home.height, .3);
          assert(geometry.logo.height > geometry.hs.height);
          near(geometry.logo.bottom, geometry.hs.bottom);
          // 양쪽 삼각형의 사선을 타이머 아래까지 연장한 점이 사다리꼴 꼭짓점과 일치해야 합니다.
          const unit = geometry.hs.height / 48;
          near(geometry.home.left + (geometry.clock.bottom - geometry.home.top) * .3, geometry.clock.left + 9.6 * unit);
          near(geometry.away.right - (geometry.clock.bottom - geometry.away.top) * .3, geometry.clock.right - 9.6 * unit);
          assert(geometry.names[0].right <= geometry.home.left + .1);
          assert(geometry.names[1].left >= geometry.away.right - .1);
          near((geometry.texts[0].left + geometry.texts[0].right) / 2, (geometry.cards[0].left + geometry.home.left) / 2);
          near((geometry.texts[1].left + geometry.texts[1].right) / 2, (geometry.away.right + geometry.cards[1].right) / 2);
          if (source === 'danish') {
            const png = await page.screenshot();
            const slopes = await page.evaluate(async ({ png, g, dpr }) => {
              const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
              const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
              const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
              const fit = (r, rgb) => {
                const points = [];
                for (let y = Math.ceil((r.top + r.height * .2) * dpr); y < (r.top + r.height * .7) * dpr; y++) {
                  for (let x = Math.floor((r.left - 1) * dpr); x < (r.left + 16 * g.hs.height / 48) * dpr; x++) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    if (rgb.every((c, i) => Math.abs(c - pixel[i]) < 25)) { points.push([x, y]); break; }
                  }
                }
                if (points.length < 5) return null;
                const meanX = points.reduce((n, p) => n + p[0], 0) / points.length;
                const meanY = points.reduce((n, p) => n + p[1], 0) / points.length;
                return points.reduce((n, p) => n + (p[0] - meanX) * (p[1] - meanY), 0) / points.reduce((n, p) => n + (p[1] - meanY) ** 2, 0);
              };
              return [fit(g.home, [0, 119, 187]), fit(g.clock, [189, 229, 94])];
            }, { png: png.toString('base64'), g: geometry, dpr });
            assert(slopes.every(s => s !== null && Math.abs(s - .3) < .075), JSON.stringify({ dpr, scale, slopes }));
          }
          if (source === 'danish') await page.locator('#boardStageInner').screenshot({ path: path.join(output, `danish-${dpr}-${scale}.png`) });
        }
      }
      await page.evaluate(() => {
        state.homeName = '미트윌란'; state.awayName = '쾨벤하운';
        state.colors.homeBg = '#ffffff'; state.colors.awayBg = '#ffffff';
        state.colors.homeText = '#111111'; state.colors.awayText = '#111111';
        render();
      });
      await settle(page);
      await page.locator('#boardStageInner').screenshot({ path: path.join(output, `danish-korean-${dpr}-75.png`) });
      await page.evaluate(() => { state.extraShown = false; render(); });
      assert.equal(await page.locator('#extra').evaluate(n => getComputedStyle(n, '::before').display), 'none');
      await page.evaluate(() => { state.fsmTheme = 'jleague'; autoApplyTemplateByLeagueId(98, null); render(); });
      await page.waitForFunction(() => !pendingThemeLink && _currentTheme === 'jleague');
      assert.equal(await page.locator('.danish-triangle').first().evaluate(n => getComputedStyle(n).display), 'none');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS Danish colors, SVG triangles, shared slope/joins, 75%/100%, DPR 1/1.25/2 and theme transitions');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
