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
    const modal = page.locator('.sp-modal');
    const stableBounds = await modal.boundingBox();
    const assertStable = async () => {
      const bounds = await modal.boundingBox();
      assert(Math.abs(bounds.height - stableBounds.height) < 1, '검색 결과와 무관하게 창 높이 유지');
      assert(Math.abs(bounds.y - stableBounds.y) < 1, '검색 중 창 위치 유지');
    };
    const rowVisible = category => page.locator(`#settingsBackdrop [data-settings-slider="${category}"]`).isVisible();
    await search.fill('폰트');
    await assertStable();
    assert(await rowVisible('lineupNameSize'));
    assert(await rowVisible('eventNameSize'));
    assert(await rowVisible('eventSpotlightScale'));
    assert.equal(await page.locator('#settingsBackdrop [data-settings-cat="boardFlashSound"]').locator('..').isVisible(), false);
    await search.fill('사이즈');
    await assertStable();
    assert(await rowVisible('lineupTokenScale'));
    assert(await rowVisible('eventSpotlightScale'));
    const slider = page.locator('#settingsBackdrop [data-settings-slider="eventSpotlightScale"]');
    await slider.fill('150');
    assert.equal(await page.evaluate(() => getSetting('eventSpotlightScale')), 150, '검색 결과에서도 기존 설정 경로로 저장');
    await search.fill('알림음');
    await assertStable();
    assert(await page.getByRole('combobox', { name: '알림음 세트' }).isVisible());
    assert(await page.locator('#settingsBackdrop [data-settings-cat="boardFlashSound"]').locator('..').isVisible());
    await search.fill('없는설정검색어');
    await assertStable();
    assert.equal(await page.locator('#settingsSearchStatus').textContent(), '검색 결과가 없습니다.');
    await search.press('Escape');
    await assertStable();
    assert.equal(await search.inputValue(), '');
    assert(await page.locator('[data-sp-tab-section="general"]').isVisible());
    assert.equal(await page.locator('[data-sp-tab-section="lineup"]').isVisible(), false);
    await search.fill('폰트');
    await page.locator('[data-sp-tab="lineup"]').click();
    assert.equal(await search.inputValue(), '');
    assert(await page.locator('[data-sp-tab-section="lineup"]').isVisible());
    await search.fill('사이즈');
    await page.screenshot({ path: 'screenshots/tests/settings-search-size.png' });
    for (const viewport of [{ width: 1280, height: 1000 }, { width: 600, height: 860 }]) {
      await page.setViewportSize(viewport);
      for (const mode of ['dark', 'light']) {
        await page.evaluate(mode => setSetting('uiMode', mode), mode);
        await search.fill('');
        const original = await modal.boundingBox();
        for (const query of ['폰트', '알림음', '없는설정검색어', '']) {
          await search.fill(query);
          const current = await modal.boundingBox();
          assert(Math.abs(current.height - original.height) < 1, `${mode} ${viewport.width}: 검색 중 높이 유지`);
          assert(current.y >= 0 && current.y + current.height <= viewport.height + 1, '화면 안에 설정 창 유지');
        }
        await search.fill('알림음');
        const field = await search.boundingBox(), clear = await page.locator('#settingsSearchClear').boundingBox();
        assert(field.x + field.width <= clear.x, '좁은 화면에서도 검색창과 지우기 버튼이 겹치지 않음');
        await modal.screenshot({ path: `screenshots/tests/settings-search-${mode}-${viewport.width}.png` });
      }
    }
    assert.deepEqual(errors, []);
    console.log('settings-search: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
