const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [], prompts = [];
    let accept = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => {
      prompts.push(dialog.message());
      assert.equal(dialog.type(), 'confirm');
      if (accept) await dialog.accept(); else await dialog.dismiss();
    });
    await page.evaluate(() => {
      setSetting('popoutModals', 'off');
      document.getElementById('settingsGearBtn').click();
    });
    await page.locator('[data-sp-tab="background"]').click();
    const hex = page.locator('[data-settings-text="bgColor"]');
    const commitHex = value => hex.evaluate((input, value) => {
      input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await commitHex('#00ff00');
    assert.equal(prompts.length, 1);
    assert(prompts[0].includes('그린스크린 모드 ON을 권장'));
    assert(prompts[0].includes('팀컬러·평점·교체 표시·이벤트·전술판'));
    assert(prompts[0].includes('투명도는 0%'));
    assert.equal(await page.evaluate(() => getSetting('greenscreen')), 'off');
    assert.equal(await page.evaluate(() => getSetting('bgColor')), '#00ff00');
    accept = true;
    await page.evaluate(() => { setSetting('panelAlpha', 35); setSetting('pitchAlpha', 40); setSetting('tacticsAlpha', 45); });
    const picker = page.locator('[data-settings-color="bgColor"]');
    await picker.evaluate(input => { input.value = '#20ee20'; input.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(prompts.length, 2);
    assert.equal(await page.evaluate(() => getSetting('greenscreen')), 'on');
    assert.deepEqual(await page.evaluate(() => ['--panel-alpha','--lp-pitch-alpha','--td-pitch-alpha'].map(key => document.documentElement.style.getPropertyValue(key))), ['1','1','1']);
    assert.equal(await page.evaluate(() => getSetting('bgColor')), '#20ee20');
    await commitHex('#00ff00'); assert.equal(prompts.length, 2, 'Already ON must not prompt');
    await page.evaluate(() => setSetting('greenscreen', 'off'));
    for (const value of ['#008000', '#80ff80', '#ffff00', '#00ffff', '#ff00ff', '#111827']) await commitHex(value);
    assert.equal(prompts.length, 2, 'Ordinary colors must not prompt');
    await page.evaluate(() => setSetting('bgImageUrl', 'https://example.invalid/background.png'));
    await commitHex('#00ff00'); assert.equal(prompts.length, 2, 'Image background must not prompt');
    await page.evaluate(() => { setSetting('bgImageUrl', ''); setSetting('bgImageData', 'data:image/png;base64,AA=='); });
    await commitHex('#10ff10'); assert.equal(prompts.length, 2, 'Uploaded image background must not prompt');
    await page.evaluate(() => { setSetting('bgImageData', ''); setSetting('bgAlpha', 100); });
    await commitHex('#00ff00'); assert.equal(prompts.length, 2, 'Fully transparent background must not prompt');
    await page.evaluate(() => { setSetting('bgAlpha', 0); setSetting('bgColor', '#111827'); });
    assert.equal(prompts.length, 2, 'Programmatic setting changes must not prompt');
    await page.locator('#settingsBgColorFormat').click();
    const rgb = page.locator('[data-bg-rgb]');
    await rgb.evaluateAll(inputs => {
      [0, 255, 0].forEach((value, i) => { inputs[i].value = value; inputs[i].dispatchEvent(new Event('input', { bubbles: true })); });
    });
    assert.equal(prompts.length, 2, 'RGB preview must not interrupt typing');
    await rgb.nth(2).evaluate(input => input.dispatchEvent(new Event('change', { bubbles: true })));
    assert.equal(prompts.length, 3);
    assert.equal(await page.evaluate(() => getSetting('greenscreen')), 'on');
    await page.reload();
    assert.equal(await page.evaluate(() => getSetting('greenscreen')), 'on');
    assert.equal(prompts.length, 3, 'Reload must not prompt');
    assert.deepEqual(errors, []);
    console.log('PASS: green background recommendation via HEX/picker/RGB, accept/decline, active background checks, chroma opacity and persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
