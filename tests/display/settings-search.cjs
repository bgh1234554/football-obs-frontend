const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { viewport: { width: 1280, height: 1000 }, dpr: 1, platform: 'Win32' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => { clearPolling(); openSettingsPopup(); applySettingsTab('general'); });
    await page.getByRole('button', { name: '설정 검색', exact: true }).click();
    const search = page.getByRole('searchbox', { name: '설정 검색어' });
    const rowVisible = category => page.locator(`#settingsBackdrop [data-settings-slider="${category}"]`).isVisible();
    await search.fill('폰트');
    assert(await rowVisible('lineupNameSize'));
    assert(await rowVisible('eventNameSize'));
    assert(await rowVisible('eventSpotlightScale'));
    assert.equal(await page.locator('#settingsBackdrop [data-settings-cat="boardFlashSound"]').locator('..').isVisible(), false);
    await search.fill('사이즈');
    assert(await rowVisible('lineupTokenScale'));
    assert(await rowVisible('eventSpotlightScale'));
    const slider = page.locator('#settingsBackdrop [data-settings-slider="eventSpotlightScale"]');
    await slider.fill('150');
    assert.equal(await page.evaluate(() => getSetting('eventSpotlightScale')), 150, '검색 결과에서도 기존 설정 경로로 저장');
    await search.fill('알림음');
    assert(await page.getByRole('combobox', { name: '알림음 세트' }).isVisible());
    assert(await page.locator('#settingsBackdrop [data-settings-cat="boardFlashSound"]').locator('..').isVisible());
    await search.fill('없는설정검색어');
    assert.equal(await page.locator('#settingsSearchStatus').textContent(), '검색 결과가 없습니다.');
    await search.press('Escape');
    assert.equal(await search.inputValue(), '');
    assert(await page.locator('[data-sp-tab-section="general"]').isVisible());
    assert.equal(await page.locator('[data-sp-tab-section="lineup"]').isVisible(), false);
    await search.fill('폰트');
    await page.locator('[data-sp-tab="lineup"]').click();
    assert.equal(await search.inputValue(), '');
    assert(await page.locator('[data-sp-tab-section="lineup"]').isVisible());
    await search.fill('사이즈');
    await page.screenshot({ path: 'screenshots/tests/settings-search-size.png' });
    assert.deepEqual(errors, []);
    console.log('settings-search: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
