const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    assert.equal(await page.evaluate(() => getSetting('bgPreset')), 'stadium', '새 설정의 기본 배경은 야간 경기장입니다.');
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/1637598-lineup.json'), 'utf8'));
    await page.evaluate(async fixture => {
      fetchFixture = async () => structuredClone(fixture);
      await fetchAndApplyFixtureData(fixture.matchInfo.fixtureId, { silent: true }); clearPolling();
      setSetting('bgImageUrl', ''); setSetting('bgImageData', ''); setSetting('bgTeamDirection', 'horizontal');
    }, fixture);
    const background = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--bg-image'));
    const openSettings = async () => {
      await page.locator('#settingsGearBtn').evaluate(button => button.click());
      await page.locator('[data-sp-tab="background"]').click();
    };
    for (const layout of ['main-big', 'main-small']) {
      await page.evaluate(layout => activatePage(layout), layout);
      for (const preset of ['stadium', 'abstract', 'emerald', 'charcoal', 'burgundy']) {
        await openSettings();
        await page.locator('[data-settings-select="bgPreset"]').selectOption(preset);
        assert.equal(await page.evaluate(() => getSetting('bgPreset')), preset);
        await page.locator('#settingsCloseBtn').click();
        await settle(page);
        const value = await background();
        assert(value.includes('url('));
        // CSS에 경로만 들어간 상태가 아니라 실제 이미지 디코딩까지 확인합니다.
        await page.evaluate(async () => {
          const paintedImage = getComputedStyle(document.body, '::before').backgroundImage;
          const img = new Image(); img.src = paintedImage.match(/url\("([^"]+)"\)/)[1];
          await img.decode();
          if (!img.naturalWidth) throw new Error('기본 배경 이미지 로딩 실패');
        });
        assert.equal(await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundSize), 'cover');
        await page.screenshot({ path: `screenshots/tests/background-${preset}-${layout}.png` });
      }
      await openSettings();
      await page.locator('[data-settings-select="bgPreset"]').selectOption('off');
      await page.locator('[data-settings-select="bgTeamDirection"]').selectOption('mood');
      await page.locator('#settingsCloseBtn').click();
      assert((await background()).includes('radial-gradient'));
      await page.screenshot({ path: `screenshots/tests/background-team-${layout}.png` });
    }
    const before = await background();
    await page.evaluate(() => { state.colors.homeBg = '#ef4422'; state.colors.awayBg = '#2255ee'; render(); });
    assert.notEqual(await background(), before, '팀 컬러 무드는 현재 팀 색상을 따라야 합니다.');
    await page.evaluate(() => setSetting('bgPreset', 'stadium'));
    assert((await background()).includes('stadium-night.webp'), '이미지 배경이 무드보다 우선해야 합니다.');

    // 상위 설정을 지워도 하위 선택은 보존되어 정해진 순서대로 다시 드러납니다.
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=';
    await page.evaluate(pixel => { setSetting('bgImageData', pixel); }, pixel);
    assert((await background()).includes(pixel));
    await page.evaluate(() => setSetting('bgImageUrl', 'https://example.com/custom.png'));
    assert((await background()).includes('https://example.com/custom.png'));
    await page.evaluate(() => setSetting('bgImageUrl', ''));
    assert((await background()).includes(pixel));
    await page.evaluate(() => setSetting('bgImageData', ''));
    assert((await background()).includes('stadium-night.webp'));
    await page.evaluate(() => setSetting('bgPreset', 'off'));
    assert((await background()).includes('radial-gradient'));
    await page.evaluate(() => setSetting('bgTeamDirection', 'horizontal'));
    assert((await background()).startsWith('linear-gradient(to right'));
    await page.evaluate(() => setSetting('bgTeamDirection', 'off'));
    assert.equal(await background(), 'none');

    await page.evaluate(() => setSetting('bgPreset', 'abstract'));
    await page.reload();
    assert.equal(await page.evaluate(() => getSetting('bgPreset')), 'abstract');
    assert((await background()).includes('navy-mint.webp'));
    await openSettings();
    assert.equal(await page.locator('[data-settings-select="bgPreset"]').inputValue(), 'abstract');
    assert(await page.evaluate(() => {
      const file = document.getElementById('settingsBgImageFile');
      const preset = document.querySelector('[data-settings-select="bgPreset"]');
      const teams = document.querySelector('[data-settings-select="bgTeamDirection"]');
      return !!(file.compareDocumentPosition(preset) & Node.DOCUMENT_POSITION_FOLLOWING)
        && !!(preset.compareDocumentPosition(teams) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), '기본 배경 선택은 파일 첨부와 팀 컬러 배경 사이에 있어야 합니다.');
    assert.equal(await page.evaluate(() => isValidSetting('bgPreset', 'unknown')), false);
    assert.equal(await page.evaluate(() => isValidSetting('bgPreset', 'team')), false);
    // 이전 무드 선택은 새 항목으로 옮기며 다음 새로고침에도 같은 모습이어야 합니다.
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
      saved.bgPreset = 'team'; saved.bgTeamDirection = 'vertical';
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(saved));
    });
    for (let reload = 0; reload < 2; reload++) {
      await page.reload();
      assert.deepEqual(await page.evaluate(() => [getSetting('bgPreset'), getSetting('bgTeamDirection')]), ['off', 'mood']);
      assert((await background()).includes('radial-gradient'));
    }
    console.log('PASS background preset UI, image decoding, both layouts, team colors, full priority chain, reload persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
