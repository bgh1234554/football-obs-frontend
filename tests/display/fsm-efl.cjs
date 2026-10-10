const assert = require('node:assert/strict');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      state.homeName = 'Home Team'; state.awayName = 'Away Team';
      state.homeScore = 0; state.awayScore = 0; state.extra = 4; state.extraShown = true; state.boardScale = 100;
      Object.assign(state.colors, { homeBg: '#ffffff', homeText: '#123456', awayBg: '#a02030', awayText: '#ffe080' });
    });
    const select = async (theme, leagueId) => {
      await page.evaluate(({ theme, leagueId }) => {
        state.fsmTheme = leagueId ? 'auto' : theme;
        autoApplyTemplateByLeagueId(leagueId || 39, 'http://localhost/unused-logo.png'); render();
      }, { theme, leagueId });
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
    };
    const measure = () => page.evaluate(() => {
      const read = selector => {
        const el = document.querySelector(selector), s = getComputedStyle(el), r = el.getBoundingClientRect();
        return { bg: s.backgroundColor, color: s.color, display: s.display, width: r.width, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const line = selector => { const s = getComputedStyle(document.querySelector(selector), '::after'); return { color: s.backgroundColor, width: s.width, content: s.content }; };
      return { theme: _currentTheme, home: read('.teams-left'), away: read('.teams-right'), homeName: read('#homeName'), awayName: read('#awayName'),
        homeScore: read('#team-score-left'), awayScore: read('#team-score-right'), center: read('.score-div'), logo: read('.epl-lion'),
        hyphen: read('.hipen'), teamLogo: read('.team-logo'), timer: read('.time'), extra: read('.extra-time'),
        lines: [line('#team-score-left'), line('#team-score-right')] };
    });
    for (const [id, theme, extra] of [[40, 'eflchampionship', 'rgb(182, 155, 66)'], [41, 'eflleagueone', 'rgb(127, 131, 132)'], [42, 'eflleaguetwo', 'rgb(204, 9, 53)']]) {
      await select(theme, id);
      const m = await measure();
      assert.equal(m.theme, theme);
      for (const key of ['homeScore', 'awayScore', 'center']) {
        assert.equal(m[key].bg, 'rgb(228, 228, 228)'); assert.equal(m[key].color, 'rgb(6, 5, 113)');
        assert(Math.abs(m[key].top - m.center.top) < .1); assert(Math.abs(m[key].bottom - m.center.bottom) < .1);
      }
      assert(Math.abs(m.homeScore.right - m.center.left) < .1);
      assert(Math.abs(m.awayScore.left - m.center.right) < .1);
      assert.equal(m.center.width, 24); assert.equal(m.logo.display, 'none'); assert.equal(m.hyphen.display, 'flex');
      assert.equal(m.teamLogo.bg, 'rgb(228, 228, 228)');
      assert.equal(m.timer.bg, extra); assert.equal(m.timer.color, 'rgb(255, 255, 255)');
      assert.equal(m.extra.bg, 'rgb(6, 5, 113)'); assert.equal(m.extra.color, 'rgb(228, 228, 228)'); assert.notEqual(m.extra.display, 'none');
      assert.equal(m.home.bg, 'rgb(255, 255, 255)'); assert.equal(m.away.bg, 'rgb(160, 32, 48)');
      assert.equal(m.homeName.color, 'rgb(18, 52, 86)'); assert.equal(m.awayName.color, 'rgb(255, 224, 128)');
      m.lines.forEach(line => assert.deepEqual(line, { color: 'rgb(153, 155, 154)', width: '1px', content: '""' }));
      assert.equal(await page.locator(`#fsmThemeSelect option[value="${theme}"]`).count(), 1);
      await page.locator('#board').screenshot({ path: path.join(tmpdir(), `fsm-${theme}.png`) });
      await select(theme);
      assert.equal((await measure()).theme, theme);
      for (const scale of [60, 100, 150]) {
        await page.evaluate(scale => { state.boardScale = scale; state.homeName = '아주 긴 축구 클럽 이름 Football Club'; state.awayName = 'Away'; state.homeScore = 10; state.awayScore = 12; render(); fsmBoardRender(); }, scale);
        await settle(page);
        const fits = await page.evaluate(() => ['homeCard', 'awayCard'].map(id => {
          const card = document.getElementById(id), name = card.querySelector('.team-name'), text = name.querySelector('.text');
          const r = text.getBoundingClientRect(), n = name.getBoundingClientRect();
          const score = document.getElementById(id === 'homeCard' ? 'team-score-left' : 'team-score-right').getBoundingClientRect();
          return r.width <= n.width + 1 && (id === 'homeCard' ? r.right <= score.left + 1 : r.left >= score.right - 1);
        }));
        assert(fits.every(Boolean), JSON.stringify({ theme, scale, fits }));
      }
      await page.evaluate(() => { state.boardScale = 100; state.homeName = 'Home Team'; state.awayName = 'Away Team'; state.homeScore = 0; state.awayScore = 0; render(); });
    }
    for (const theme of ['fnl', 'fnl2a', 'fnl2b']) {
      await select(theme);
      const m = await measure();
      assert.equal(m.center.width, 70); assert.notEqual(m.logo.display, 'none'); assert.equal(m.hyphen.display, 'none');
      m.lines.forEach(line => assert.deepEqual(line, { color: 'rgb(0, 0, 0)', width: '1px', content: '""' }));
    }
    await select('pl');
    assert.equal((await measure()).lines[0].content, 'none');
    assert.deepEqual(errors, []);
    console.log('PASS EFL auto/manual themes, colors, compact score geometry, separators, long names, scales and theme switching');
    console.log(`Screenshots: ${path.join(tmpdir(), 'fsm-eflchampionship.png')}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
