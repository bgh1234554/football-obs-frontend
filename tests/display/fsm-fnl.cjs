const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  const screenshotDir = mkdtempSync(path.join(tmpdir(), "fsm-fnl-"));
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      state.fsmTheme = 'auto'; state.leagueId = 236;
      state.homeName = 'Home Team'; state.awayName = 'Away Team';
      state.homeScore = 2; state.awayScore = 1;
      state.colors.homeBg = '#ffffff'; state.colors.homeText = '#123456';
      state.colors.awayBg = '#a02030'; state.colors.awayText = '#ffe080';
      state.added = 4;
      autoApplyTemplateByLeagueId(236, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const measure = () => page.evaluate(() => {
      const style = selector => { const s = getComputedStyle(document.querySelector(selector)); return { bg: s.backgroundColor, color: s.color }; };
      return {
        theme: _currentTheme, logo: document.querySelector('.epl-lion').getAttribute('src'),
        home: style('.teams-left'), away: style('.teams-right'),
        homeName: style('.teams-left .team-name'), awayName: style('.teams-right .team-name'),
        homeScore: style('#team-score-left'), awayScore: style('#team-score-right'),
        logoBox: style('.score-div'), teamLogo: style('.team-logo'),
        time: style('.time'), extra: style('.extra-time'),
      };
    });
    const colors = await measure();
    assert.equal(colors.theme, 'fnl');
    assert(colors.logo.endsWith('/RussianFirstLeague.svg'));
    assert.equal(colors.home.bg, 'rgb(255, 255, 255)');
    assert.equal(colors.away.bg, 'rgb(160, 32, 48)');
    assert.equal(colors.homeName.color, 'rgb(18, 52, 86)');
    assert.equal(colors.awayName.color, 'rgb(255, 224, 128)');
    for (const key of ['homeScore', 'awayScore', 'extra']) assert.deepEqual(colors[key], { bg: 'rgb(0, 199, 178)', color: 'rgb(0, 0, 0)' });
    assert.deepEqual(colors.time, { bg: 'rgb(0, 0, 0)', color: 'rgb(0, 199, 178)' });
    assert.equal(colors.logoBox.bg, 'rgb(0, 0, 0)');
    assert.equal(colors.teamLogo.bg, 'rgb(255, 255, 255)');
    assert.equal(await page.locator('#fsmThemeSelect option[value="fnl"]').count(), 1);
    await page.locator('.scoreboard-main').screenshot({ path: path.join(screenshotDir, 'fsm-fnl.png') });
    for (const [leagueId, theme] of [[1025, 'fnl2a'], [1026, 'fnl2a'], [651, 'fnl2b'], [652, 'fnl2b'], [650, 'fnl2b'], [653, 'fnl2b']]) {
      await page.evaluate(leagueId => { state.fsmTheme = 'auto'; autoApplyTemplateByLeagueId(leagueId, null); render(); }, leagueId);
      await page.waitForFunction(() => !pendingThemeLink);
      await settle(page);
      const variant = await measure();
      const ink = theme === 'fnl2a' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
      assert.equal(variant.theme, theme);
      assert(variant.logo.endsWith(theme === 'fnl2a' ? '/RussianSecondLeagueA.svg' : '/RussianSecondLeagueB.svg'));
      for (const key of ['homeScore', 'awayScore', 'extra']) assert.deepEqual(variant[key], { bg: 'rgb(227, 29, 41)', color: ink });
      assert.deepEqual(variant.time, { bg: ink, color: 'rgb(227, 29, 41)' });
      assert.equal(variant.logoBox.bg, theme === 'fnl2b' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)');
      assert.equal(variant.homeName.color, 'rgb(18, 52, 86)');
      assert.equal(variant.awayName.color, 'rgb(255, 224, 128)');
      assert.equal(await page.locator(`#fsmThemeSelect option[value="${theme}"]`).count(), 1);
      const bounds = await page.evaluate(() => ['.score-div', '#team-score-left', '#team-score-right'].map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }));
      bounds.slice(1).forEach(rect => {
        assert(Math.abs(rect.top - bounds[0].top) < .1);
        assert(Math.abs(rect.bottom - bounds[0].bottom) < .1);
      });
    }
    for (const scale of [60, 100, 150]) {
      await page.evaluate(scale => { state.boardScale = scale; state.homeName = 'A very long football club name to test fitting'; render(); fsmBoardRender(); }, scale);
      await settle(page);
      const sizes = await page.evaluate(() => ['homeCard', 'awayCard'].map(id => {
        const name = document.getElementById(id).querySelector('.team-name');
        const text = name.querySelector('.text');
        return { width: name.getBoundingClientRect().width, text: text.getBoundingClientRect().width };
      }));
      assert(Math.abs(sizes[0].width - sizes[1].width) < 1);
      assert(sizes.every(size => size.text <= size.width + 1));
    }
    await page.evaluate(() => { state.fsmTheme = 'ligue1'; autoApplyTemplateByLeagueId(61, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => { state.fsmTheme = 'fnl'; autoApplyTemplateByLeagueId(39, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    assert.equal((await measure()).homeName.color, 'rgb(18, 52, 86)');
    console.log('PASS FNL automatic/manual theme, logo, colors, long names, scales and theme switching');
  } finally { await browser.close(); rmSync(screenshotDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
