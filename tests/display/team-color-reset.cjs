const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      sessionStorage.setItem('cached_fixture_data', JSON.stringify({ matchInfo: {
        fixtureId: 123, homePrimaryColor: '#112233', homeNumberColor: '#ffffff',
        awayPrimaryColor: '#aa0000', awayNumberColor: '#000000'
      } }));
      state.fsmTheme = 'unl'; autoApplyTemplateByLeagueId(5, null); render();
    });
    await page.waitForFunction(() => !pendingThemeLink);
    for (const side of ['home', 'away']) {
      await page.evaluate(() => commitThemeColors({ homeBg: '#123456', homeText: '#abcdef', awayBg: '#654321', awayText: '#fedcba' }));
      const before = await page.evaluate(() => ({ ...state.colors }));
      await page.locator(side === 'home' ? '#team-logo-left' : '#team-logo-right').click();
      await page.locator('[data-team-edit=color]').click();
      await page.locator('.team-color-dialog').getByText('초기화', { exact: true }).click();
      const after = await page.evaluate(() => ({ colors: state.colors, override: state.teamColorOverride }));
      const other = side === 'home' ? 'away' : 'home';
      assert.equal(after.colors[other + 'Bg'], before[other + 'Bg']);
      assert.equal(after.colors[other + 'Text'], before[other + 'Text']);
      assert.equal(after.colors[side + 'Bg'], side === 'home' ? '#112233' : '#aa0000');
      assert.equal(after.colors[side + 'Text'], side === 'home' ? '#ffffff' : '#000000');
      assert(after.override);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(() => resetFixtureTeamColors());
    assert.deepEqual(await page.evaluate(() => [state.colors.homeBg, state.colors.awayBg, state.teamColorOverride]), ['#112233', '#aa0000', false]);
    for (const side of ['home', 'away']) {
      await page.evaluate(side => {
        sessionStorage.setItem('cached_fixture_data', JSON.stringify({ matchInfo: { fixtureId: 123 } }));
        window.extractTeamColorsFromLogo = async () => ({ bg: '#ffcc00', text: '#eeeeee' });
        commitThemeColors({ homeBg: '#123456', homeText: '#abcdef', awayBg: '#654321', awayText: '#fedcba' });
        resetFixtureTeamColors(side);
      }, side);
      await page.waitForFunction(side => state.colors[side + 'Bg'] === '#ffcc00', side);
      const other = side === 'home' ? 'away' : 'home';
      assert.deepEqual(await page.evaluate(other => [state.colors[other + 'Bg'], state.colors[other + 'Text']], other),
        other === 'home' ? ['#123456', '#abcdef'] : ['#654321', '#fedcba']);
    }
    console.log('PASS scoped home/away popup reset, opposite custom colors retained, full reset, logo fallback');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

