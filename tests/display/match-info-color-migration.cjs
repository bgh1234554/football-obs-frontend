const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    for (const [saved, expected] of [['#ff9900', '#60A5FA'], ['#FF9900', '#60A5FA'], ['#123456', '#123456'], [null, '#60A5FA']]) {
      await page.evaluate(saved => {
        const settings = JSON.parse(localStorage.getItem('obs.settings.v3') || '{}');
        delete settings.matchInfoLabelColorRev;
        if (saved === null) delete settings.matchInfoLabelColor;
        else settings.matchInfoLabelColor = saved;
        localStorage.setItem('obs.settings.v3', JSON.stringify(settings));
      }, saved);
      await page.reload({ waitUntil: 'load' });
      const actual = await page.evaluate(() => ({
        value: getSetting('matchInfoLabelColor'), css: document.documentElement.style.getPropertyValue('--mi-label-color'),
        saved: JSON.parse(localStorage.getItem('obs.settings.v3')),
      }));
      assert.equal(actual.value, expected);
      assert.equal(actual.saved.matchInfoLabelColor, expected);
      assert.equal(actual.saved.matchInfoLabelColorRev, 1);
      assert.equal(actual.css.toLowerCase(), expected.toLowerCase());
    }
    await page.evaluate(() => setSetting('matchInfoLabelColor', '#ff9900'));
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.evaluate(() => getSetting('matchInfoLabelColor')), '#ff9900');
    await page.evaluate(() => document.getElementById('matchInfoLabelColorResetBtn').click());
    assert.equal(await page.evaluate(() => getSetting('matchInfoLabelColor')), '#60A5FA');
    console.log('PASS one-time old-orange migration, custom color preservation, persisted revision, explicit orange after migration and reset');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
