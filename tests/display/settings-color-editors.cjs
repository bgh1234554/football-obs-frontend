const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => { setSetting('popoutModals', 'off'); document.getElementById('settingsGearBtn').click(); });
    await page.locator('[data-sp-tab="lineup"]').click();
    assert.equal(await page.locator('[data-color-editor]').count(), 9);
    await page.locator('[data-sp-tab="events"]').click();
    await page.locator('#panelColorPreset').selectOption('#102a56');
    assert.equal(await page.evaluate(() => getSetting('panelColor')), '#102a56');
    assert.equal(await page.locator('[data-color-editor="panelColor"] [data-color-hex]').inputValue(), '#102a56');
    await page.locator('[data-sp-tab="lineup"]').click();
    for (const category of await page.locator('[data-color-editor]').evaluateAll(nodes => nodes.map(node => node.dataset.colorEditor))) {
      const editor = page.locator(`[data-color-editor="${category}"]`);
      await editor.locator('[data-color-hex]').evaluate(input => { input.value = '#123456'; input.dispatchEvent(new Event('change', { bubbles: true })); });
      assert.equal(await page.evaluate(key => getSetting(key), category), '#123456');
      await editor.locator('button').evaluate(button => button.click());
      assert(await editor.locator('[data-color-hex]').evaluate(input => input.hidden));
      const channels = editor.locator('[data-color-channel]');
      assert.deepEqual(await channels.evaluateAll(inputs => inputs.map(input => input.value)), ['18', '52', '86']);
      await channels.nth(0).evaluate(input => { input.value = '96'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.equal(await page.evaluate(key => getSetting(key), category), '#603456');
      await channels.nth(1).evaluate(input => { input.value = '300'; input.dispatchEvent(new Event('change', { bubbles: true })); });
      assert.equal(await channels.nth(1).inputValue(), '52');
    }
    const first = page.locator('[data-color-editor="ratingColorBelow6"]');
    await first.locator('[data-color-channel="0"]').focus();
    await page.keyboard.press('Tab');
    assert(await first.locator('[data-color-channel="1"]').evaluate(input => input === document.activeElement));
    await settle(page);
    await page.locator('.sp-modal').screenshot({ path: 'tests/display/settings-rating-color-editors.png' });
    await page.locator('[data-sp-tab="events"]').click();
    assert.equal(await page.locator('#panelColorPreset').inputValue(), 'custom');
    await settle(page);
    await page.locator('.sp-modal').screenshot({ path: 'tests/display/settings-panel-color-editors.png' });
    await page.locator('#panelColorResetBtn').click();
    assert.equal(await page.locator('#panelColorPreset').inputValue(), '#0b1220');
    assert.equal(await page.locator('[data-color-editor="panelColor"] [data-color-channel="0"]').inputValue(), '11');
    await page.reload();
    assert.equal(await page.evaluate(() => getSetting('ratingColorBelow6')), '#603456');
    assert.deepEqual(errors, []);
    console.log('PASS all color editors: HEX/RGB, independent values, invalid input, Tab, reset and persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
