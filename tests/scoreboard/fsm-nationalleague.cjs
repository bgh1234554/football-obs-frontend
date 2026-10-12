const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const dpr = Number(process.env.FSM_TEST_DPR || 1);
    const page = await openPage(browser, { dpr, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      state.homeName = 'York City'; state.awayName = 'Southend United';
      state.homeScore = 2; state.awayScore = 1; state.extraShown = true; state.extra = 4;
      state.boardScale = 100;
      Object.assign(state.colors, { homeBg: '#aa0011', homeText: '#ffffff', awayBg: '#003377', awayText: '#ffee00' });
    });
    /** 테마와 리그 ID로 점수판을 전환하고 로딩·재렌더가 끝날 때까지 기다린다. */
    const select = async (theme, id) => {
      await page.evaluate(({ theme, id }) => { state.fsmTheme = theme; autoApplyTemplateByLeagueId(id, null); render(); }, { theme, id });
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(async () => { await document.fonts.ready; fsmBoardRender(); reapplyBoardScale(); });
      await settle(page);
    };
    /** 점수판 주요 요소의 사각형과 배경색/글자색을 측정한다. */
    const measure = () => page.evaluate(() => {
      const selectors = ['#homeCard', '#awayCard', '#homeName', '#awayName', '#team-score-left', '.score-div', '#team-score-right', '.team-logo', '.time', '.extra-time'];
      return selectors.map(q => {
        const n = document.querySelector(q), r = n.getBoundingClientRect(), s = getComputedStyle(n);
        return { rect: [r.x, r.y, r.width, r.height], bg: s.backgroundColor, ink: s.color };
      });
    });
    await select('eflchampionship', 40);
    const efl = await measure();
    for (const id of [43, 50, 51, 984, 985]) {
      await select('auto', id);
      assert.equal(await page.evaluate(() => _currentTheme), 'nationalleague');
      const actual = await measure();
      actual.forEach((item, i) => {
        assert(Math.abs(item.rect[3] - efl[i].rect[3]) < .1);
        assert(Math.abs(item.rect[2] - efl[i].rect[2] - (i === 5 ? -12 : 0)) < .1);
      });
      for (const i of [0, 1, 2, 3, 7]) {
        assert.equal(actual[i].bg, efl[i].bg); assert.equal(actual[i].ink, efl[i].ink);
      }
      for (const i of [4, 5, 6, 9]) {
        assert.equal(actual[i].bg, i === 9 ? 'rgb(253, 251, 3)' : 'rgba(0, 0, 0, 0)'); assert.equal(actual[i].ink, 'rgb(0, 0, 0)');
      }
      assert.equal(actual[8].bg, 'rgb(0, 0, 0)'); assert.equal(actual[8].ink, 'rgb(255, 255, 255)');
      const line = await page.locator('.score-div').evaluate(n => {
        const s = getComputedStyle(n, '::after'); return [s.width, s.height, s.backgroundColor, s.content];
      });
      assert.deepEqual(line, ['1px', '32px', 'rgb(145, 135, 0)', '""']);
      assert.equal(await page.locator('.hipen').evaluate(n => getComputedStyle(n).display), 'none');
    }
    await select('nationalleague', 39);
    assert.equal(await page.evaluate(() => _currentTheme), 'nationalleague');
    for (const scale of [75, 100]) {
      await page.evaluate(scale => { state.boardScale = scale; reapplyBoardScale(); }, scale);
      await settle(page);
      const joins = await page.evaluate(() => {
        const a = document.querySelector('#team-score-left').getBoundingClientRect();
        const b = document.querySelector('.score-div').getBoundingClientRect();
        const c = document.querySelector('#team-score-right').getBoundingClientRect();
        return [a.right - b.left, b.right - c.left, a.top - b.top, b.bottom - c.bottom];
      });
      assert(joins.every(value => Math.abs(value) < .1), JSON.stringify(joins));
      const spacing = await page.evaluate(() => {
        const a = document.querySelector('#homeScore').getBoundingClientRect();
        const b = document.querySelector('#awayScore').getBoundingClientRect();
        const center = document.querySelector('.score-div').getBoundingClientRect();
        const unit = center.height / 48;
        return { width: center.width / unit, digitDistance: ((b.left + b.right - a.left - a.right) / 2) / unit };
      });
      assert(Math.abs(spacing.width - 12) < .1 && Math.abs(spacing.digitDistance - 56) < .1, JSON.stringify(spacing));
      const samples = await page.locator('.score-div').evaluate(n => {
        const r = n.getBoundingClientRect();
        return [r.left, r.right].flatMap(x => [-1, 0, 1].map(offset => [Math.floor(x * devicePixelRatio) + offset, Math.floor((r.top + r.height / 2) * devicePixelRatio)]));
      });
      const png = await page.screenshot();
      const pixels = await page.evaluate(async ({ png, samples }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        return samples.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3));
      }, { png: png.toString('base64'), samples });
      assert(pixels.every(rgb => JSON.stringify(rgb) === '[253,251,3]'), JSON.stringify({ scale, dpr, pixels }));
      await page.locator('#boardStageInner').screenshot({ path: path.resolve(`screenshots/tests/nationalleague-${scale}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS National League/North/South/playoffs mapping, palette, vertical separator spacing, 75%/100% and manual selection');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
