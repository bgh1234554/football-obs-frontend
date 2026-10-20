const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const backgrounds = await page.evaluate(() => {
      const dark = { color: getSetting('bgColor'), preset: getSetting('bgPreset') };
      setSetting('uiMode', 'light');
      const light = { color: getSetting('bgColor'), preset: getSetting('bgPreset') };
      setSetting('bgColor', '#adc4d0'); setSetting('bgPreset', 'sky-glass');
      setSetting('uiMode', 'dark');
      const restoredDark = { color: getSetting('bgColor'), preset: getSetting('bgPreset') };
      setSetting('uiMode', 'light');
      const restoredLight = { color: getSetting('bgColor'), preset: getSetting('bgPreset') };
      setSetting('bgColor', light.color); setSetting('bgPreset', light.preset);
      setSetting('uiMode', 'dark');
      return { dark, light, restoredDark, restoredLight };
    });
    assert.notEqual(backgrounds.dark.color, backgrounds.light.color);
    assert.notEqual(backgrounds.dark.preset, backgrounds.light.preset);
    assert.deepEqual(backgrounds.restoredDark, backgrounds.dark);
    assert.deepEqual(backgrounds.restoredLight, { color: '#adc4d0', preset: 'sky-glass' });
    const fixture = JSON.parse(fs.readFileSync('tests/fixtures/1637598-lineup.json', 'utf8'));
    await page.evaluate(async fixture => {
      fetchFixture = async () => structuredClone(fixture);
      await fetchAndApplyFixtureData(fixture.matchInfo.fixtureId, { silent: true }); clearPolling();
      setSetting('bgPreset', 'ivory-paper'); setSetting('panelAlpha', 0);
    }, fixture);
    const injuryModes = await page.evaluate(() => {
      const samples = [
        { playerId: 987001, name: '부상 선수', number: 1, reason: 'Muscle Injury', type: 'Missing Fixture' },
        { playerId: 987002, name: '의심 선수', number: 2, reason: 'Questionable', type: 'Questionable' }
      ];
      const result = { menus: {}, yellowToken: {}, warningName: {} };
      for (const mode of ['dark', 'light']) {
        setSetting('uiMode', mode);
        const list = document.querySelector('#injuryPanel .dp-list');
        const token = document.createElement('span');
        token.style.color = 'var(--info-yellow-text)'; list.append(token);
        result.yellowToken[mode] = getComputedStyle(token).color; token.remove();
        list.innerHTML = buildInjuryListHtml(samples, true, { inlineReason: true });
        lineupPanelState.lastEffectiveData = { ...lineupPanelState.lastEffectiveData, homeInjuries: samples };
        result[mode] = [...list.querySelectorAll('.ic-reason, .dp-icon')].map(node => {
          const style = getComputedStyle(node); return { color: style.color, stroke: parseFloat(style.webkitTextStrokeWidth) };
        });
        result.menus[mode] = samples.map(sample => {
          list.querySelector(`[data-player-id="${sample.playerId}"]`).click();
          const style = getComputedStyle(document.querySelector('.pm-injury-reason'));
          const item = { color: style.color, stroke: parseFloat(style.webkitTextStrokeWidth) };
          pmHideAll(); return item;
        });
        const warning = document.createElement('span');
        warning.className = 'dp-item-name is-yellow'; list.append(warning);
        result.warningName[mode] = getComputedStyle(warning).color; warning.remove();
      }
      setSetting('uiMode', 'dark');
      applyLineupPanels(lineupPanelState.lastFixture);
      return result;
    });
    assert(injuryModes.dark.length > 0);
    assert.equal(injuryModes.light[0].color, injuryModes.dark[0].color, '빨간 부상 의미색은 유지합니다.');
    assert.equal(injuryModes.light[0].stroke, 0, '빨간 사유에도 외곽선을 추가하지 않습니다.');
    assert.equal(injuryModes.light.at(-1).stroke, 0, '노란 사유의 외곽선은 제거합니다.');
    assert.equal(injuryModes.menus.light[0].color, injuryModes.menus.dark[0].color);
    assert.equal(injuryModes.menus.light[0].stroke, 0);
    assert.equal(injuryModes.menus.light[1].color, injuryModes.light.at(-1).color, '메뉴와 명단의 노란 사유는 같은 색입니다.');
    assert.equal(injuryModes.menus.light[1].stroke, 0);
    for (const mode of ['dark', 'light']) {
      assert.equal(injuryModes[mode].at(-1).color, injuryModes.yellowToken[mode], '출전 불확실 사유는 패널의 노란 의미색을 따릅니다.');
      assert.equal(injuryModes.warningName[mode], injuryModes.yellowToken[mode], '경고 선수 이름도 같은 노란 의미색을 따릅니다.');
    }
    // 이후 저장·갤러리 검사는 양쪽 모드에 같은 배경을 명시적으로 고른 상태로 진행한다.
    await page.evaluate(() => { setSetting('lightBgPreset', 'ivory-paper'); });
    const openSettings = async () => {
      await page.locator('#settingsGearBtn').evaluate(button => button.click());
      await page.locator('[data-sp-tab="background"]').click();
    };
    const surface = () => page.evaluate(() => {
      const panel = document.querySelector('.layout-small .lp-events-s');
      const style = getComputedStyle(panel);
      const text = getComputedStyle(panel.querySelector('.ev-text'));
      return { bg: style.backgroundColor, text: text.color, ratio: teamColorContrastRatio(text.color, style.backgroundColor) };
    });
    const identity = () => page.evaluate(() => ({
      storedColor: getSetting('panelColor'), preset: getSetting('bgPreset'),
      colors: JSON.stringify(state.colors),
      score: getComputedStyle(document.querySelector('.fsm-board .team-score')).backgroundColor,
      pitchSurface: getComputedStyle(document.querySelector('.lp-lineup')).backgroundColor
    }));
    assert.equal(await page.evaluate(() => getSetting('uiMode')), 'dark');
    await page.evaluate(() => activatePage('main-small'));
    const before = await identity();
    const dark = await surface();
    await openSettings();
    await page.locator('[data-settings-select="uiMode"]').selectOption('light');
    await page.evaluate(() => setSetting('bgColor', '#adc4d0'));
    await page.locator('[data-bg-clear="color"]').click();
    assert.equal(await page.evaluate(() => getSetting('bgColor')), backgrounds.light.color, '단색 초기화는 현재 모드의 기본색으로 돌아갑니다.');
    assert.equal(await page.locator('html').getAttribute('data-ui-mode'), 'light');
    const fileAlignment = await page.locator('.sp-background-image-row').evaluate(row => {
      const a = row.querySelector('.sp-row-label').getBoundingClientRect();
      const b = row.querySelector('.sp-bg-preset-control').getBoundingClientRect();
      return Math.abs(a.top + a.height / 2 - b.top - b.height / 2);
    });
    assert(fileAlignment < 1, '배경 이미지의 현재 선택·변경·해제 버튼은 설명 영역 가운데에 있어야 합니다.');
    const light = await surface();
    assert.notEqual(light.bg, dark.bg);
    assert(light.ratio >= 4.5, '밝은 패널의 일반 이벤트 글자는 충분한 대비가 있어야 합니다.');
    assert.deepEqual(await identity(), before, '모드는 저장한 기준색·배경 선택·팀색·점수판을 덮어쓰지 않습니다.');
    await page.locator('[data-sp-tab="lineup"]').click();
    const activeContrasts = await page.locator('.sp-radio-btn.is-active:visible').evaluateAll(buttons => buttons.map(button => {
      const s = getComputedStyle(button); return teamColorContrastRatio(s.color, s.backgroundColor);
    }));
    assert(activeContrasts.every(ratio => ratio >= 4.5), '선택된 설정 버튼의 글자도 배경과 구분되어야 합니다.');
    await page.locator('[data-sp-tab="events"]').click();
    const colorPreset = page.locator('#panelColorPreset');
    const panelColors = await colorPreset.locator('option').evaluateAll(options => options.map(option => option.value).filter(value => value !== 'custom'));
    for (const color of panelColors) {
      await colorPreset.selectOption(color);
      assert.equal(await page.evaluate(() => getSetting('panelColor')), color);
      const result = await surface();
      assert(result.ratio >= 4.5, '모든 패널 프리셋에서 일반 이벤트 글자를 읽을 수 있어야 합니다.');
    }
    await colorPreset.selectOption(before.storedColor);
    await page.locator('[data-sp-tab="background"]').click();
    const pitch = await page.evaluate(() => {
      const initial = getSetting('lineupPitchTone');
      setSetting('lineupPitchTone', 'blue'); setSetting('uiMode', 'dark');
      const dark = getSetting('lineupPitchTone');
      setSetting('uiMode', 'light'); const restored = getSetting('lineupPitchTone');
      setSetting('lineupPitchTone', 'green');
      return { initial, dark, restored, lineup: document.documentElement.style.getPropertyValue('--lp-pitch-bg'), tactics: document.documentElement.style.getPropertyValue('--td-pitch-bg') };
    });
    assert.equal(pitch.initial, 'green'); assert.equal(pitch.dark, 'black'); assert.equal(pitch.restored, 'blue');
    assert.equal(pitch.lineup, pitch.tactics, '라인업과 전술판은 같은 모드의 피치 선택을 사용합니다.');
    await page.screenshot({ path: 'screenshots/tests/ui-mode-settings-light.png' });

    await page.locator('#settingsBgPresetOpen').click();
    const gallery = page.locator('#backgroundPicker');
    assert.equal(await gallery.locator('h3').first().textContent(), '어두운 배경');
    const offAlignment = await gallery.locator('[data-bg-choice="off"]').evaluate(button => {
      const a = button.firstElementChild.getBoundingClientRect(), b = button.lastElementChild.getBoundingClientRect();
      return Math.abs(a.top + a.height / 2 - b.top - b.height / 2);
    });
    assert(offAlignment < 1, '사용 안 함의 아이콘과 텍스트는 세로 가운데를 맞춥니다.');
    await gallery.locator('[data-bg-choice="stadium"]').click();
    assert.equal(await page.evaluate(() => getSetting('bgPreset')), before.preset, '미리보기는 실제 설정을 바꾸지 않습니다.');
    await page.screenshot({ path: 'screenshots/tests/background-gallery-light.png' });
    const preview = gallery.locator('.bg-picker-preview-image');
    await preview.dblclick();
    await page.waitForFunction(() => document.fullscreenElement || document.querySelector('#backgroundPicker').classList.contains('is-preview-fullscreen'));
    assert.equal(await preview.evaluate(node => getComputedStyle(node).backgroundSize), 'contain', '전체화면에서는 배경 전체를 잘리지 않게 보여줍니다.');
    assert.equal(await page.evaluate(() => getSetting('bgPreset')), before.preset);
    await page.screenshot({ path: 'screenshots/tests/background-preview-fullscreen.png' });
    await gallery.locator('.bg-picker-preview-exit').click();
    await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('#backgroundPicker').classList.contains('is-preview-fullscreen'));
    assert.equal(await gallery.evaluate(dialog => dialog.open), true);
    // 전체화면 API가 없는 OBS 환경의 대체 보기와 Esc 단계도 검사한다.
    await preview.evaluate(node => { node.requestFullscreen = () => Promise.reject(new Error('unsupported')); });
    await preview.dblclick();
    await page.waitForFunction(() => document.querySelector('#backgroundPicker').classList.contains('is-preview-fullscreen'));
    await page.keyboard.press('Escape');
    assert.equal(await gallery.evaluate(dialog => dialog.open), true);
    assert.equal(await gallery.evaluate(dialog => dialog.classList.contains('is-preview-fullscreen')), false);
    await preview.evaluate(node => { delete node.requestFullscreen; });
    await page.keyboard.press('Escape');
    assert.equal(await gallery.evaluate(dialog => dialog.open), false);
    assert.equal(await page.evaluate(() => isSettingsOpen()), true, 'Esc는 갤러리만 닫습니다.');
    await page.locator('#settingsCloseBtn').click();
    for (const layout of ['main-big', 'main-small']) {
      await page.evaluate(layout => activatePage(layout), layout); await settle(page);
      await page.screenshot({ path: `screenshots/tests/ui-mode-light-${layout}.png` });
    }
    await page.reload();
    assert.equal(await page.evaluate(() => getSetting('uiMode')), 'light');
    assert.equal(await page.locator('html').getAttribute('data-ui-mode'), 'light');

    // 여러 색상 계열을 밝은 톤으로 바꾸더라도 원래 선택색은 정확히 복원해야 합니다.
    for (const color of ['#102a56', '#431f2a', '#17382b', '#111111', '#fafafa']) {
      const result = await page.evaluate(color => {
        setSetting('panelColor', color); setSetting('uiMode', 'dark');
        const dark = getComputedStyle(document.documentElement).getPropertyValue('--info-panel-rgb');
        setSetting('uiMode', 'light');
        const light = getComputedStyle(document.documentElement).getPropertyValue('--info-panel-rgb');
        setSetting('uiMode', 'dark');
        return { dark, light, restored: getComputedStyle(document.documentElement).getPropertyValue('--info-panel-rgb'), stored: getSetting('panelColor') };
      }, color);
      assert.equal(result.dark, result.restored); assert.equal(result.stored, color);
      assert.notEqual(result.dark, result.light);
    }
    await openSettings();
    await page.locator('#settingsBgPresetOpen').click();
    await page.screenshot({ path: 'screenshots/tests/background-gallery-dark.png' });
    await page.locator('[data-bg-choice="sky-glass"]').click();
    await page.locator('#backgroundPickerApply').click();
    assert.equal(await page.evaluate(() => getSetting('bgPreset')), 'sky-glass');
    assert.equal(await page.locator('#settingsBgPresetName').textContent(), '스카이 글라스');
    const selectedBeforeClear = await page.evaluate(() => [getSetting('bgTeamDirection'), getSetting('bgImageUrl'), getSetting('bgImageData')]);
    await page.locator('#settingsBgPresetClear').click();
    assert.equal(await page.evaluate(() => getSetting('bgPreset')), 'off');
    assert.equal(await page.locator('#settingsBgPresetClear').isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => [getSetting('bgTeamDirection'), getSetting('bgImageUrl'), getSetting('bgImageData')]), selectedBeforeClear);
    assert.equal(await page.locator('#settingsBgPresetName').textContent(), '사용 안 함');
    // 투명도는 모드별로 보존하고, 무드는 같은 팀색으로 서로 다른 밝기의 바탕을 만든다.
    const modes = await page.evaluate(() => {
      setSetting('panelAlpha', 37); setSetting('bgTeamDirection', 'mood'); setSetting('lightBgPreset', 'off');
      const dark = document.documentElement.style.getPropertyValue('--bg-image');
      setSetting('uiMode', 'light'); const lightAlpha = getSetting('panelAlpha');
      const light = document.documentElement.style.getPropertyValue('--bg-image');
      setSetting('panelAlpha', 12); setSetting('uiMode', 'dark'); const darkAlpha = getSetting('panelAlpha');
      setSetting('uiMode', 'light'); return { dark, light, lightAlpha, darkAlpha, restored: getSetting('panelAlpha') };
    });
    assert.notEqual(modes.dark, modes.light); assert(modes.light.includes('radial-gradient'));
    assert.equal(modes.lightAlpha, 25); assert.equal(modes.darkAlpha, 37); assert.equal(modes.restored, 12);
    await page.locator('#settingsCloseBtn').click();
    await page.evaluate(() => setSetting('panelAlpha', 0));
    await page.screenshot({ path: 'screenshots/tests/ui-mode-light-mood.png' });
    await page.setViewportSize({ width: 740, height: 760 });
    await openSettings(); await page.locator('#settingsBgPresetOpen').click();
    const fits = await gallery.evaluate(dialog => { const r = dialog.getBoundingClientRect(); return r.width <= innerWidth && r.height <= innerHeight; });
    assert(fits, '작은 화면에서도 배경 갤러리는 화면 안에 있어야 합니다.');
    await page.screenshot({ path: 'screenshots/tests/background-gallery-narrow.png' });
    await page.keyboard.press('Escape');
    await page.locator('#settingsCloseBtn').click();
    await page.setViewportSize({ width: 1920, height: 1080 });
    // 분리 창도 같은 팔레트를 쓰고 모드 변경을 원래 창에 즉시 반영해야 합니다.
    await page.context().route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.resolve(url.pathname === '/' ? 'overlay_dashboard.html' : '.' + decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.evaluate(() => setSetting('popoutModals', 'on'));
    await page.locator('.float-hamburger').click();
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#settingsGearBtn').click()]);
    await popup.waitForLoadState();
    await popup.locator('[data-sp-tab="background"]').click();
    await popup.locator('[data-settings-select="uiMode"]').selectOption('dark');
    await page.waitForFunction(() => document.documentElement.dataset.uiMode === 'dark');
    await popup.locator('[data-settings-select="uiMode"]').selectOption('light');
    await page.waitForFunction(() => document.documentElement.dataset.uiMode === 'light');
    await popup.locator('#settingsBgPresetOpen').click();
    await popup.screenshot({ path: 'screenshots/tests/background-gallery-popout.png' });
    assert.equal(await popup.locator('#backgroundPicker').evaluate(dialog => dialog.open), true);
    await popup.keyboard.press('Escape');
    assert.equal(popup.isClosed(), false);
    assert.equal(await popup.locator('#backgroundPicker').evaluate(dialog => dialog.open), false);
    await popup.close();
    await verifyEventPalette(page, fixture);
    await verifyStatsOutlines(page, fixture);
    await verifyComponentColorPairs(page, fixture);
    await verifyTransparentPanelText(page, fixture);
    assert.deepEqual(errors, []);
    console.log('PASS UI modes, tonal panel colors, contrast, identity preservation, persistence, gallery preview/apply/cancel');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

/** 모드와 무관하게 투명도를 높여도 정보 패널 글자에 그림자를 추가하지 않는다. */
async function verifyTransparentPanelText(page, fixture) {
  await page.evaluate(fixture => {
    setSetting('popoutModals', 'off'); setSetting('panelColor', '#0b1220');
    setSetting('bgPreset', 'off'); setSetting('bgTeamDirection', 'off');
    applyLineupPanels(fixture); applyEventsPanel(fixture, { animate: false }); applyStatsPanel(fixture);
  }, fixture);
  for (const mode of ['dark', 'light']) {
    for (const layout of ['main-small', 'main-big']) {
      for (const alpha of [25, 70, 85, 100]) {
        const result = await page.evaluate(({ mode, layout, alpha }) => {
          setSetting('uiMode', mode); setSetting('panelAlpha', alpha); activatePage(layout);
          const selector = '#benchPanel .dp-item-name, #benchPanel .dp-side-name, #injuryPanel .dp-item-name, #injuryPanel .dp-side-name, .lp-events-s .ev-text-name, .lp-stat .ev-text-name, .lp-stat-s .st-val';
          return [...document.querySelectorAll(selector)].map(node => ({ cls: node.className, shadow: getComputedStyle(node).textShadow }));
        }, { mode, layout, alpha });
        assert(result.length > 0);
        assert(result.every(item => item.shadow === 'none'), `${mode}/${layout}/${alpha}: 정보 패널에 글자 그림자를 붙이지 않습니다.`);
      }
    }
  }
}

/** 실제 행 렌더러로 모든 이벤트 분기의 배지·이름·사유·시간을 검증한다. */
async function verifyEventPalette(page, fixture) {
  const cases = [
    ['Goal', 'Normal Goal'], ['Goal', 'Normal Goal', { assistName: '도움 선수', assistId: 9001 }],
    ['Goal', 'Own Goal'], ['Goal', 'Penalty'], ['Goal', 'Missed Penalty'],
    ['Card', 'Yellow Card'], ['Card', 'Red Card'], ['Card', 'Red Card', { _isCumulativeRed: true }],
    ['subst', 'Substitution', { assistName: '들어온 선수', assistId: 9001 }],
    ['subst', 'Substitution', { playerId: 0, assistId: 0, playerName: null, assistName: null }],
    ['subst', 'Substitution', { playerId: 0, assistId: 0, assistName: '직접 연결 선수' }],
    ['Var', 'Goal cancelled - Offside'], ['Var', 'Penalty cancelled'],
    ['Var', 'Goal Confirmed'], ['Var', 'Penalty confirmed'], ['Var', 'Card upgrade confirmed'],
    ['Var', 'Review'], ['Other', 'Other event'],
    ['Goal', 'Penalty', { elapsed: 90, comments: 'Penalty Shootout' }],
    ['Goal', 'Missed Penalty', { elapsed: 90, comments: 'Penalty Shootout' }]
  ];
  const failures = [];
  for (const mode of ['dark', 'light']) {
    for (const layout of ['main-small', 'main-big']) {
      for (const alpha of [0, 25]) {
        for (const panelColor of ['#0b1220', '#ffffff', '#7c2d12', '#0f766e']) {
          const result = await page.evaluate(({ mode, layout, alpha, cases, fixture, panelColor }) => {
            setSetting('uiMode', mode); setSetting('panelColor', panelColor); setSetting('panelAlpha', alpha);
            setSetting('bgPreset', 'off'); setSetting('bgTeamDirection', 'off'); setSetting('bgAlpha', 0);
            activatePage(layout);
            const panel = document.querySelector(layout === 'main-small' ? '.layout-small .lp-events-s' : '.layout-big .lp-stat');
            // 카메라 뷰의 통계/이벤트 전환 컨테이너 안에도 같은 이벤트 행을 렌더한다.
            const host = document.createElement('div'); host.className = 'ev-list'; host.dataset.eventPaletteProbe = '';
            panel.append(host);
            const events = cases.map(([type, detail, extra], i) => ({ elapsed: i + 1, extra: null,
              side: i % 2 ? 'away' : 'home', playerId: 8000 + i, playerName: '선수 이름',
              type, detail, comments: '판정 사유', ...extra }));
            events.forEach((event, i) => { const row = evCreateRow(event, fixture); row.dataset.caseIndex = i; host.append(row); });
            const bad = [];
            for (const node of host.querySelectorAll('.ev-label, .ev-time, .ev-text-name, .ev-text-in, .ev-text-out, .ev-comment, .ev-text-assist, .ev-subst-fix-btn')) {
              const style = getComputedStyle(node);
              // IN은 사용자가 지정한 의미색을 유지한다. 사유·편집 버튼은 일반 대비 검사에 포함한다.
              if (node.closest('.ev-text-in') && !node.matches('.ev-comment, .ev-subst-fix-btn')) continue;
              const background = teamPanelBackground(node);
              const contrast = Math.max(teamColorContrastRatio(style.color, background),
                parseFloat(style.webkitTextStrokeWidth) > 0 ? teamColorContrastRatio(style.webkitTextStrokeColor, background) : 0);
              if (contrast < 4.5) bad.push({ case: node.closest('.ev-row').dataset.caseIndex, class: node.className,
                text: node.textContent, color: style.color, background, contrast });
            }
            const labels = [...host.querySelectorAll('.ev-label')].map(node => node.textContent);
            const icons = [...host.querySelectorAll('.ev-icon')].map(node => node.className);
            const inStyles = [...host.querySelectorAll('.ev-text-in')].map(node => ({
              color: getComputedStyle(node).color,
              nameColor: node.querySelector('.ev-text-name') ? getComputedStyle(node.querySelector('.ev-text-name')).color : null,
              stroke: parseFloat(getComputedStyle(node).webkitTextStrokeWidth),
            }));
            host.remove();
            return { bad, labels, icons, inStyles };
          }, { mode, layout, alpha, cases, fixture, panelColor });
          assert.equal(result.labels.length, cases.length);
          assert.equal(result.icons.length, cases.length);
          assert(result.inStyles.every(item => item.nameColor === null || item.color === item.nameColor), 'IN 문구와 이름은 같은 색을 유지합니다.');
          assert(result.inStyles.every(item => item.stroke === 0), '지정한 IN 텍스트에 외곽선을 추가하지 않습니다.');
          failures.push(...result.bad.map(item => ({ mode, layout, alpha, panelColor, ...item })));
        }
      }
    }
  }
  fs.writeFileSync('screenshots/tests/event-palette-results.json', JSON.stringify({ cases, failures }, null, 2));
  assert.deepEqual(failures, [], '모든 이벤트 종류의 배지·시간·선수·사유가 실제 합성 배경에서 읽혀야 합니다.');
}

/** 테두리는 모드와 무관하게 실제 표시 표면과 팀색의 유사도로 결정한다. */
async function verifyStatsOutlines(page, fixture) {
  const results = await page.evaluate(fixture => {
    activatePage('main-small');
    const data = { ...fixture, teamStats: ['home', 'away'].map((side, i) => ({ side,
      ...Object.fromEntries(window.STATS_CONFIG.order.map((key, j) => [key, (i + j) % 2 ? 1 : 2])) })) };
    applyStatsPanel(data);
    const panel = document.querySelector('.layout-small [data-stat-panel]');
    const read = () => [...panel.querySelectorAll('.st-bar-home, .st-val-home.is-emphasized')].map(el => getComputedStyle(el).boxShadow);
    const result = [];
    const zero = stCreateRow({ label: '퇴장', homeVal: 0, awayVal: 0 }, data, teamPanelBackground(panel));
    panel.append(zero);
    const zeroShadows = [...zero.querySelectorAll('.st-bar-home, .st-bar-away')].map(el => getComputedStyle(el).boxShadow);
    zero.remove();
    result.push({ zeroShadows });
    for (const mode of ['dark', 'light']) {
      setSetting('uiMode', mode); setSetting('panelAlpha', 0); setSetting('panelColor', '#0b1220');
      setSetting('bgPreset', 'off'); setSetting('bgTeamDirection', 'off');
      const color = getComputedStyle(panel.closest('.lp')).backgroundColor;
      state.colors.homeBg = color; state.colors.homeText = teamColorReadableText(color);
      document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key: 'homeBg' } }));
      const matching = read();
      setSetting('uiMode', mode === 'dark' ? 'light' : 'dark'); setSetting('panelAlpha', 0);
      const switched = read();
      const switchedBackground = teamPanelBackground(panel);
      // 완전 투명 패널은 body::before의 단색과 비교해야 한다.
      setSetting('bgPreset', 'off'); setSetting('bgTeamDirection', 'off'); setSetting('bgColor', '#354b62'); setSetting('panelAlpha', 100);
      state.colors.homeBg = '#354b62'; state.colors.homeText = '#ffffff';
      document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key: 'homeBg' } }));
      result.push({ mode, matching, switched, switchedBackground, color, transparent: read(), background: teamPanelBackground(panel) });
    }
    return result;
  }, fixture);
  fs.writeFileSync('screenshots/tests/stats-outline-results.json', JSON.stringify(results, null, 2));
  for (const result of results) {
    if (result.zeroShadows) { assert(result.zeroShadows.every(shadow => shadow.includes('inset')), '0:0 중립 막대도 패널에 묻히면 테두리가 필요합니다.'); continue; }
    assert(result.matching.length > 0);
    assert(result.matching.every(shadow => shadow.includes('inset')), `${result.mode}: 비슷한 팀색은 테두리가 필요합니다.`);
    assert(result.switched.every(shadow => !shadow.includes('inset')), `${result.mode}: 모드 전환 후 대비가 충분하면 이전 테두리를 제거합니다.`);
    assert(result.transparent.every(shadow => shadow.includes('inset')), '투명 패널도 실제 페이지 단색과 비슷하면 테두리가 필요합니다.');
  }
}

/** 컴포넌트 자체의 표면색과 글자색은 모드 전환 후에도 함께 읽혀야 한다. */
async function verifyComponentColorPairs(page, fixture) {
  const results = [];
  await page.evaluate(() => setSetting('popoutModals', 'off'));
  if (await page.locator('body').evaluate(body => body.classList.contains('sidebar-open'))) {
    await page.locator('#sidebarClose').click();
  }
  for (const mode of ['dark', 'light']) {
    await page.evaluate(({ mode, fixture }) => {
      setSetting('uiMode', mode); setSetting('panelColor', '#0b1220'); setSetting('panelAlpha', 25);
      setSetting('bgPreset', 'off'); setSetting('bgTeamDirection', 'off'); activatePage('main-small');
      fetchTeamFixtures = async id => ({ matches: Array.from({ length: 5 }, (_, i) => ({
        fixtureId: 200 + i, date: '2025-10-01T12:00:00Z', status: 'FT',
        homeTeamId: id, awayTeamId: 999, homeTeamName: '홈 팀', awayTeamName: '원정 팀',
        homeScore: i % 3, awayScore: 1,
      })) });
      applyEventsPanel(fixture, { animate: false });
    }, { mode, fixture });
    await page.locator('.lp-events-s [data-events-panel] [data-small-panel-mode="fixtures"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.lp-events-s .tf-card').length === 10);
    const wins = await page.locator('.lp-events-s .tf-win').evaluateAll(nodes => nodes.map(node => ({
      color: getComputedStyle(node).color, contrast: teamColorContrastRatio(getComputedStyle(node).color, teamPanelBackground(node)),
    })));
    assert(wins.length > 0 && wins.every(item => item.contrast >= 4.5), '승리 배지의 글자는 배지 배경과 대비가 충분해야 합니다.');
    await page.locator('.lp-events-s').screenshot({ path: `screenshots/tests/color-pairs-${mode}-fixtures.png` });
    await page.locator('.lp-events-s [data-team-fixtures-panel] [data-small-panel-mode="events"]').click();
    await page.evaluate(() => {
      const event = { type: 'Card', detail: 'Yellow Card', side: 'home',
        elapsed: 25, playerId: 123, playerName: '검증 선수', _evEdited: true };
      event._hideSig = evHideSignature(event);
      evEditOpen(event);
    });
    const reset = page.locator('.ev-subst-picker-reset');
    assert.equal(await reset.isEnabled(), true);
    const resetContrast = () => reset.evaluate(node => teamColorContrastRatio(getComputedStyle(node).color, teamPanelBackground(node)));
    const regular = await resetContrast();
    await reset.hover(); const hovered = await resetContrast();
    assert(regular >= 4.5 && hovered >= 4.5, '활성 초기화 버튼은 기본·호버 상태에서 모두 읽혀야 합니다.');
    await page.locator('.ev-subst-picker-modal').screenshot({ path: `screenshots/tests/color-pairs-${mode}-event-edit.png` });
    await page.locator('.ev-subst-picker-close').click();
    await page.evaluate(async () => {
      fetchPlayerStats = async () => ({ player: { name: '검증 선수' }, statistics: {
        '2026': [{ league: { name: '리그' }, team: { name: '팀' }, games: { appearences: 10 }, cards: { yellow: 2, yellowred: 1, red: 1 } }],
      } });
      await pmShowSeasonStats(123, { name: '검증 선수', number: 9 });
    });
    const cards = await page.locator('.pm-card-y, .pm-card-yr, .pm-card-r').evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node);
      // 누적 퇴장 배지는 현재 그라디언트 양 끝과 비교하고 특정 팔레트를 고정하지 않는다.
      const surfaces = style.backgroundImage.match(/rgba?\([^)]+\)/g) || [teamPanelBackground(node)];
      return { color: style.color, contrast: Math.min(...surfaces.map(background => teamColorContrastRatio(style.color, background))) };
    }));
    assert(cards.length > 0 && cards.every(item => item.contrast >= 4.5), '경고·퇴장 배지의 숫자는 모드 본문색과 별도로 읽혀야 합니다.');
    await page.locator('.pm-modal').screenshot({ path: `screenshots/tests/color-pairs-${mode}-season.png` });
    await page.evaluate(() => pmHideAll());
    results.push({ mode, wins, regular, hovered, cards });
  }
  const brightPanel = await page.evaluate(() => {
    setSetting('uiMode', 'dark'); setSetting('panelColor', '#ffffff'); setSetting('panelAlpha', 0);
    const host = document.querySelector('#injuryPanel .dp-list');
    host.innerHTML = buildInjuryListHtml([{ playerId: 987001, name: '부상 선수', reason: 'Muscle Injury', type: 'Missing Fixture' }], true, { inlineReason: true });
    return { tone: document.documentElement.dataset.infoTone, stroke: parseFloat(getComputedStyle(host.querySelector('.ic-reason')).webkitTextStrokeWidth) };
  });
  assert.equal(brightPanel.tone, 'light');
  assert.equal(brightPanel.stroke, 0, '어두운 UI에서 밝은 패널을 골라도 사유 외곽선을 추가하지 않습니다.');
  // 외부 네트워크 대신 실제 프레임 생성 경로에 로컬 표를 넣어 모드 동기화를 검사한다.
  await page.evaluate(fixture => {
    window._paletteOriginalEmbeds = window.resolveScoreaxisStandingsEmbeds;
    window.resolveScoreaxisStandingsEmbeds = () => [{ country: '검증', scoreaxisLeagueName: '리그',
      embedCode: '<div class="scoreaxis-widget" style="height:120px;overflow:auto"><div style="height:500px">순위표</div></div>' }];
    setSetting('uiMode', 'dark'); setSetting('panelColor', '#0b1220');
    scoreaxisStandingsShowForFixture(fixture);
  }, fixture);
  await page.waitForFunction(() => document.querySelector('.lp-events-s .scoreaxis-standings-frame')?.contentDocument?.getElementById('scoreaxisHostOverrides'));
  const frameStyles = [];
  for (const mode of ['dark', 'light']) {
    await page.evaluate(mode => setSetting('uiMode', mode), mode);
    await settle(page);
    frameStyles.push(await page.locator('.lp-events-s .scoreaxis-standings-frame').evaluate(frame => {
      const doc = frame.contentDocument;
      const thumb = getComputedStyle(doc.querySelector('.scoreaxis-widget'), '::-webkit-scrollbar-thumb');
      return { scheme: getComputedStyle(doc.documentElement).colorScheme, thumb: thumb.backgroundColor, border: thumb.borderTopColor };
    }));
  }
  assert.equal(frameStyles[0].scheme, 'dark'); assert.equal(frameStyles[1].scheme, 'light');
  assert.notEqual(frameStyles[0].thumb, frameStyles[1].thumb, '순위표 프레임의 손잡이도 표면 밝기에 맞춰 바뀌어야 합니다.');
  assert(frameStyles.every(item => item.border === 'rgba(0, 0, 0, 0)'), '밝은 스크롤바에 고정된 어두운 테두리를 남기지 않습니다.');
  await page.evaluate(() => {
    window.resolveScoreaxisStandingsEmbeds = window._paletteOriginalEmbeds;
    scoreaxisStandingsReset();
  });
  fs.writeFileSync('screenshots/tests/component-color-pairs.json', JSON.stringify({ results, brightPanel, frameStyles }, null, 2));
}
