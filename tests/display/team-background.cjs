const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      state.colors.homeBg = '#ff0000'; state.colors.awayBg = '#0000ff';
      setSetting('bgColor', '#112233'); setSetting('bgImageUrl', 'https://example.com/bg.png');
      setSetting('popoutModals', 'off'); openSettingsPopup(); applySettingsTab('background'); render(); persist();
    });
    const image = () => page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
    assert((await image()).includes('example.com/bg.png'));
    await page.locator('[data-settings-select="bgTeamDirection"]').selectOption('horizontal');
    assert.equal(await image(), 'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))');
    await page.screenshot({ path: 'screenshots/team-background-settings.png' });
    await page.locator('[data-settings-select="bgTeamDirection"]').selectOption('vertical');
    assert.equal(await image(), 'linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))');
    await page.evaluate(() => { state.colors.homeBg = '#00ffff'; render(); persist(); setSetting('bgAlpha', 50); });
    assert.equal(await image(), 'linear-gradient(rgba(0, 255, 255, 0.5), rgba(0, 0, 255, 0.5))');
    await page.reload();
    assert.equal(await page.evaluate(() => getSetting('bgTeamDirection')), 'vertical');
    assert((await image()).includes('rgba(0, 255, 255, 0.5)'));
    await page.evaluate(() => setSetting('bgTeamDirection', 'off'));
    assert((await image()).includes('example.com/bg.png'));
    assert.equal(await page.evaluate(() => getSetting('bgColor')), '#112233');
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
      saved.bgTeamColors = 'on'; saved.bgTeamDirection = 'vertical';
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(saved));
    });
    await page.reload();
    assert.equal(await page.evaluate(() => getSetting('bgTeamDirection')), 'vertical');
    assert.deepEqual(errors, []);
    console.log('PASS team background toggle, directions, live colors, alpha, reload and original background restoration');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
