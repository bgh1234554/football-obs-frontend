const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      state.colors.homeBg = '#00c424'; state.colors.homeText = '#ffffff';
      state.pk.home = ['G', 'M']; state.half = 'PK';
      state.colors.pkGoal = '#00c424'; state.colors.pkMiss = '#aa1122';
      applyTheme('ligue2', null);
    });
    await page.waitForFunction(() => !pendingThemeLink);
    for (const mode of ['strong', 'moderate', 'mild', 'natural', 'off']) {
      await page.evaluate(mode => {
        setSetting('greenscreen', mode === 'off' ? 'off' : 'on');
        if (mode !== 'off') setSetting('greenscreenIntensity', mode);
        render(); fsmBoardRender();
      }, mode);
      await settle(page);
      const values = await page.evaluate(() => {
        const rgb = value => { const el = document.createElement('span'); el.style.color = value; return el.style.color; };
        return {
          strip: getComputedStyle(document.querySelector('.teams-left')).borderBottomColor,
          team: rgb(chromaSafe('#00c424')),
          fixed: getComputedStyle(document.querySelector('.score-div')).backgroundColor,
          expectedFixed: rgb(chromaSafe('#00fcd0')),
          pk: [...document.querySelectorAll('#pso-left li')].slice(0, 2).map(el => el.style.backgroundColor),
          saved: state.colors.homeBg,
        };
      });
      assert.equal(values.strip, values.team, mode);
      assert.equal(values.fixed, values.expectedFixed, mode);
      assert.equal(values.pk[0], values.team, mode);
      assert.equal(values.pk[1], 'rgb(170, 17, 34)');
      assert.equal(values.saved, '#00c424');
    }
    await page.evaluate(() => { applyTheme('fnl', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => { setSetting('greenscreen', 'on'); render(); fsmBoardRender(); });
    assert.equal(await page.locator('#team-score-left').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 199, 178)');
    await page.locator('#inPkGoalHex').evaluate(el => { el.value = '#2266dd'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.reload();
    assert.equal(await page.evaluate(() => state.colors.pkGoal), '#2266dd');
    console.log('PASS 4 chroma presets/OFF, strip and fixed-theme colors, PK colors, mint preservation and HEX persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
