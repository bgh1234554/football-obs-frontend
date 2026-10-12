const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
const output = path.resolve('screenshots/tests');
const logo = 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RomaniaLigaI.svg';

(async () => {
  const browser = await chromium.launch();
  try {
    for (const dpr of [1, 1.25, 2]) {
      const page = await openPage(browser, { dpr, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/resources/imgs/romanian-liga-i-cup.svg', route => route.fulfill({
        body: fs.readFileSync(path.resolve('resources/imgs/romanian-liga-i-cup.svg')), contentType: 'image/svg+xml'
      }));
      const localLogo = path.join(output, 'romanian-logo.svg');
      if (fs.existsSync(localLogo)) await page.route(logo, route => route.fulfill({ body: fs.readFileSync(localLogo), contentType: 'image/svg+xml' }));
      for (const source of ['fnl', 'pl', 'danish']) {
        await page.evaluate(source => { state.fsmTheme = source; autoApplyTemplateByLeagueId(283, null); render(); }, source);
        await page.waitForFunction(() => !pendingThemeLink);
        await page.evaluate(() => {
          state.fsmTheme = 'auto'; state.homeName = 'Farul Constanta'; state.awayName = 'FCSB';
          state.homeScore = 3; state.awayScore = 1; state.extraShown = true; state.extra = 3;
          Object.assign(state.colors, { homeBg: '#ffffff', homeText: '#003366', awayBg: '#ffe500', awayText: '#ffffff' });
          autoApplyTemplateByLeagueId(283, null); render();
        });
        await page.waitForFunction(() => !pendingThemeLink && _currentTheme === 'romanian');
        await page.evaluate(async () => { await document.fonts.ready; fsmBoardRender(); });
        await settle(page);
        assert.equal(await page.locator('.epl-lion').getAttribute('src'), 'resources/imgs/romanian-liga-i-cup.svg');
        await page.locator('.epl-lion').evaluate(n => n.decode());
        const styles = await page.evaluate(() => {
          const s = (q, pseudo) => getComputedStyle(document.querySelector(q), pseudo);
          return { home: [s('#homeCard').backgroundColor, s('#homeName').color, s('#homeCard').borderTop],
            away: [s('#awayCard').backgroundColor, s('#awayName').color, s('#awayCard').borderTop],
            logo: [s('.score-div', '::before').backgroundColor, s('.score-div', '::before').borderTop, s('.score-div', '::before').borderRadius],
            score: [s('.team-score').fontFamily, s('.team-score').fontSize, s('.team-score').color, s('.score-left').textShadow],
            clock: [s('.time').backgroundColor, s('.time').color, s('.time').borderRadius],
            extra: [s('.extra-time').backgroundColor, s('.extra-time').color, s('.extra-time').borderRadius],
            center: s('.score-div').backgroundImage, imageRadius: s('.epl-lion').borderRadius,
            corner: s('#team-logo-left').borderTopLeftRadius };
        });
        assert.deepEqual(styles.home, ['rgb(255, 255, 255)', 'rgb(0, 0, 0)', '2px solid rgb(0, 51, 102)']);
        assert.deepEqual(styles.away, ['rgb(255, 229, 0)', 'rgb(0, 0, 0)', '2px solid rgb(255, 255, 255)']);
        assert.deepEqual(styles.logo, ['rgb(255, 255, 255)', '2px solid rgb(194, 195, 192)', '50%']);
        assert.deepEqual(styles.score, ['Pretendard-Medium', '70px', 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0.45) 5px 0px 0px']);
        assert.deepEqual(styles.clock, ['rgb(234, 15, 10)', 'rgb(255, 255, 255)', '8px']);
        assert.deepEqual(styles.extra, ['rgb(255, 255, 255)', 'rgb(234, 15, 10)', '8px']);
        assert.equal(styles.corner, '8px');
        assert.equal(styles.imageRadius, '0px');
        assert.equal(styles.center, 'none');
        for (const scale of [100, 75]) {
          await page.evaluate(scale => { state.boardScale = scale; reapplyBoardScale(); }, scale);
          await settle(page);
          const g = await page.evaluate(() => {
            const r = q => { const b = document.querySelector(q).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
            const slot = r('.score-div'); const size = parseFloat(getComputedStyle(document.querySelector('.score-div'), '::before').width) * slot.height / 48; const circle = { width: size, height: size, left: (slot.left + slot.right - size) / 2, right: (slot.left + slot.right + size) / 2, bottom: (slot.top + slot.bottom + size) / 2 };
            return { circle, slot: r('.score-div'), home: r('#homeCard'), away: r('#awayCard'), score: r('#team-score-left'), clock: r('.time'), extra: r('.extra-time'),
              innerBorders: [getComputedStyle(document.querySelector('#homeCard')).borderRightWidth, getComputedStyle(document.querySelector('#awayCard')).borderLeftWidth],
              fit: ['#homeName', '#awayName'].every(q => { const n = document.querySelector(q); return n.querySelector('.text').scrollWidth <= n.clientWidth - 48 + 1; }) };
          });
          const unit = g.score.height / 48;
          assert(Math.abs(g.home.right - g.away.left) < .01, JSON.stringify(g));
          assert(Math.abs(g.home.right - (g.slot.left + g.slot.right) / 2) < .02, JSON.stringify(g));
          assert.deepEqual(g.innerBorders, ['0px', '0px']);
          assert(Math.abs(g.circle.width - g.circle.height) < .1);
          assert(Math.abs((g.slot.left - g.circle.left) / unit - 8) < .1);
          assert(Math.abs((g.circle.right - g.slot.right) / unit - 8) < .1);
          assert(Math.abs((g.clock.top - g.score.bottom) / unit - 6) < .1, JSON.stringify(g));
          assert(Math.abs((g.extra.left - g.clock.right) / unit - 6) < .1, JSON.stringify(g));
          assert(g.circle.bottom > g.clock.top, JSON.stringify(g));
          assert(g.fit);
          if (source === 'danish') await page.locator('#boardStageInner').screenshot({ path: path.join(output, `romanian-${dpr}-${scale}.png`) });
        }
      }
      await page.evaluate(() => { state.colors.homeBg = '#123456'; render(); });
      await settle(page);
      assert.equal(await page.locator('#homeName').evaluate(n => getComputedStyle(n).color), 'rgb(255, 255, 255)');
      await page.evaluate(() => { state.fsmTheme = 'romanian'; autoApplyTemplateByLeagueId(39, null); render(); });
      await page.waitForFunction(() => !pendingThemeLink && _currentTheme === 'romanian');
      assert.equal(await page.locator('#fsmThemeSelect option[value="romanian"]').count(), 1);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS Romanian palette, contrast, circle overlap/border, EPL scores, rounded corners, timer gaps, auto/manual and 75%/100% at DPR 1/1.25/2');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
