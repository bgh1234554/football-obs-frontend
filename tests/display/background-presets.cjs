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
    const choosePreset = async preset => {
      await page.locator('#settingsBgPresetOpen').click();
      await page.locator(`[data-bg-choice="${preset}"]`).click();
      await page.locator('#backgroundPickerApply').click();
    };
    await openSettings();
    await page.locator('#settingsBgPresetOpen').click();
    const pickerHeight = await page.locator('#backgroundPicker').evaluate(el => el.getBoundingClientRect().height);
    const footerBeforeScroll = await page.locator('.bg-picker-footer').boundingBox();
    await page.locator('.bg-picker-list').hover();
    await page.mouse.wheel(0, 1800);
    await page.waitForFunction(() => document.querySelector('.bg-picker-list').scrollTop > 0);
    assert.deepEqual(await page.locator('.bg-picker-footer').boundingBox(), footerBeforeScroll, '목록을 스크롤해도 적용·취소 버튼은 움직이지 않습니다.');
    assert(await page.locator('.bg-picker-list').evaluate(list => list.getBoundingClientRect().bottom <= document.querySelector('.bg-picker-footer').getBoundingClientRect().top), '배경 목록은 하단 버튼을 침범하지 않습니다.');
    const originalBackground = await background();
    const imageUrl = 'http://localhost/resources/backgrounds/dark/stadium-night.webp';
    await page.locator('#backgroundPickerUrl').fill(imageUrl);
    await page.waitForFunction(() => !document.getElementById('backgroundPickerApply').disabled);
    assert.equal(await background(), originalBackground, 'URL 미리보기는 적용 전 실제 배경을 바꾸지 않습니다.');
    assert.equal(await page.locator('#backgroundPicker').evaluate(el => el.getBoundingClientRect().height), pickerHeight, '입력 방법에 따라 창 높이가 바뀌지 않습니다.');
    assert(await page.locator('[data-bg-choice="stadium"]').isVisible(), 'URL 입력 중에도 기본 배경을 고를 수 있습니다.');
    await page.locator('#backgroundPickerApply').click();
    assert.equal(await page.evaluate(() => getSetting('bgImageUrl')), imageUrl);
    await choosePreset('abstract');
    assert.equal(await page.evaluate(() => getSetting('bgImageUrl')), '', '기본 배경을 적용하면 URL이 덮어쓰지 않습니다.');
    await page.locator('#settingsBgPresetOpen').click();
    const imageFile = path.resolve('resources/backgrounds/dark/stadium-night.webp');
    await page.locator('#settingsBgImageFile').setInputFiles(imageFile);
    await page.waitForFunction(() => !document.getElementById('backgroundPickerApply').disabled);
    assert.equal(await page.evaluate(() => getSetting('bgImageData')), '', '파일 미리보기도 저장하지 않습니다.');
    await page.locator('#backgroundPicker [data-bg-picker-close]').last().click();
    assert.equal(await page.evaluate(() => getSetting('bgImageData')), '', '취소하면 첨부 이미지가 남지 않습니다.');
    await page.locator('#settingsBgPresetOpen').click();
    await page.locator('#settingsBgImageFile').setInputFiles(imageFile);
    await page.waitForFunction(() => !document.getElementById('backgroundPickerApply').disabled);
    await page.locator('#backgroundPickerApply').click();
    assert((await page.evaluate(() => getSetting('bgImageData'))).startsWith('data:image/'));
    await page.locator('#settingsBgPresetClear').click();
    assert.deepEqual(await page.evaluate(() => [getSetting('bgImageUrl'), getSetting('bgImageData'), getSetting('bgPreset')]), ['', '', 'off']);
    const rollback = await page.evaluate(() => {
      const before = JSON.stringify(settingsState);
      const originalSave = saveSettings;
      saveSettings = () => false;
      try {
        return { committed: commitBackgroundImage({ source: 'url', src: 'https://example.com/photo.jpg' }), unchanged: JSON.stringify(settingsState) === before };
      } finally { saveSettings = originalSave; }
    });
    assert.deepEqual(rollback, { committed: false, unchanged: true }, '저장 실패 시 기존 이미지 설정 전체를 유지합니다.');
    await page.locator('#settingsCloseBtn').click();
    const presets = await page.locator('[data-settings-select="bgPreset"] option').evaluateAll(options => options.map(option => option.value).filter(value => value !== 'off'));
    assert(presets.length > 0);
    assert.equal(new Set(presets).size, presets.length);
    assert.deepEqual([...presets].sort(), await page.evaluate(() => Object.keys(BACKGROUND_PRESET_IMAGES).sort()));
    for (const layout of ['main-big', 'main-small']) {
      await page.evaluate(layout => activatePage(layout), layout);
      for (const preset of presets) {
        await openSettings();
        await choosePreset(preset);
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
      await choosePreset('off');
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
      const file = document.getElementById('settingsBgPresetOpen');
      const preset = document.querySelector('[data-settings-select="bgPreset"]');
      const teams = document.querySelector('[data-settings-select="bgTeamDirection"]');
      return !!(file.compareDocumentPosition(preset) & Node.DOCUMENT_POSITION_FOLLOWING)
        && !!(preset.compareDocumentPosition(teams) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), '통합 배경 이미지 설정은 팀 컬러 배경보다 위에 있어야 합니다.');
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
