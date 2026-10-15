const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => { state.fsmTheme = 'rpl'; autoApplyTemplateByLeagueId(39, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    for (const manual of [false, true]) {
      await page.evaluate(manual => { state.manualMode = manual; render(); }, manual);
      for (const side of ['home', 'away']) {
        await page.locator('#' + side + 'Color').click({ force: true });
        await page.locator('[data-team-edit=color]').click();
        const dialog = page.locator('.team-color-dialog');
        assert(await dialog.isVisible());
        assert.equal(await dialog.locator('.theme-color-editor').count(), 2);
        assert.equal(await page.locator(`#themePanel [data-theme-color="${side}Bg"]`).count(), 1);
        assert.equal(await page.locator(`#themePanel [data-theme-color="${side}Text"]`).count(), 1);
        for (const suffix of ['Bg', 'Text']) {
          const key = side + suffix;
          const editor = dialog.locator(`[data-theme-color="${key}"]`);
          await editor.locator('input[type=text]').fill('#123456');
          await editor.locator('input[type=text]').dispatchEvent('change');
          assert.equal(await page.locator(`#themePanel [data-theme-color="${key}"] input[type=text]`).inputValue(), '#123456');
          const toggleBefore = await editor.locator('button').boundingBox();
          await editor.locator('button').click();
          const toggleAfter = await editor.locator('button').boundingBox();
          assert(Math.abs(toggleBefore.x - toggleAfter.x) < 1 && Math.abs(toggleBefore.y - toggleAfter.y) < 1);
          assert.deepEqual(await editor.locator('[data-color-channel]').evaluateAll(nodes => nodes.map(node => node.value)), ['18','52','86']);
          await editor.locator('[data-color-channel="0"]').fill('96');
          assert.equal(await page.evaluate(key => state.colors[key], key), '#603456');
          await editor.locator('[data-color-channel="1"]').fill('300');
          await editor.locator('[data-color-channel="1"]').dispatchEvent('change');
          assert.equal(await editor.locator('[data-color-channel="1"]').inputValue(), '52');
          await editor.locator('button').click();
        }
        await dialog.screenshot({ path: `screenshots/tests/team-color-${side}-${manual}.png` });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.team-color-dialog').matches(':popover-open'));
        await page.waitForFunction(() => !document.querySelector('.team-color-dialog .theme-color-editor'));
        assert.equal(await page.locator(`#themePanel [data-theme-color="${side}Bg"]`).count(), 1);
      }
    }
    for (const theme of ['eflchampionship', 'chinesesuperleague']) {
      await page.evaluate(theme => { state.homeName = 'Home Club'; state.awayName = 'Away Club'; state.fsmTheme = theme; autoApplyTemplateByLeagueId(39, null); render(); }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      for (const side of ['home', 'away']) {
        await page.locator('#' + side + 'Name').click();
        await page.locator('[data-team-edit="name"]').click();
        assert(await page.locator('#teamNickInput').isVisible());
        await page.locator('#teamNickCancel').click();
        await page.locator('#' + side + 'Name').click();
        await page.locator('[data-team-edit="color"]').click();
        assert(await page.locator('.team-color-dialog').isVisible());
        assert.equal(await page.locator(`.team-color-dialog [data-theme-color="${side}Bg"]`).count(), 1);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.team-color-dialog .theme-color-editor'));
      }
    }
    await page.locator('[data-theme-color="noteText"] button').evaluate(node => node.click());
    await page.evaluate(() => { state.colors.noteText = '#abcdef'; render(); });
    assert.deepEqual(await page.locator('[data-theme-color="noteText"] [data-color-channel]').evaluateAll(nodes => nodes.map(node => node.value)), ['171','205','239']);
    assert.deepEqual(errors, []);
    console.log('PASS team quick editors, manual mode, HEX/RGB, invalid input, restoration and render sync');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
