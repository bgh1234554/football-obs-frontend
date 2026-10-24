const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  const screenshotDir = mkdtempSync(path.join(tmpdir(), "fsm-logo-trim-"));
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    for (const existingManual of ['', 'custom-home']) {
      const transition = await page.evaluate(existingManual => {
        state.manualMode = false;
        state.homeLogo = 'current-home'; state.awayLogo = 'current-away';
        state.homeLogoManual = existingManual; state.awayLogoManual = '';
        const originalConfirm = window.confirm;
        window.confirm = () => true;
        try { el.manualModeToggle.checked = true; toggleManualMode(); }
        finally { window.confirm = originalConfirm; }
        const saved = JSON.parse(localStorage.getItem(SKEY));
        return { logos: [state.homeLogo, state.awayLogo], manual: [saved.homeLogoManual, saved.awayLogoManual] };
      }, existingManual);
      const expected = [existingManual || 'current-home', 'current-away'];
      assert.deepEqual(transition.logos, expected, 'manual transition preserves current logos and explicit manual choices');
      assert.deepEqual(transition.manual, expected, 'inherited logos survive state restoration');
    }
    // 빈 슬롯에서도 양쪽 로고를 교체하고, 자동 갱신과 경기 전환의 범위를 확인합니다.
    for (const manual of [true, false]) {
      await page.evaluate(manual => {
        state.manualMode = manual;
        state.homeLogo = state.awayLogo = '';
        state.homeLogoUpload = state.awayLogoUpload = '';
        _lastFixtureData = { matchInfo: { fixtureId: 123, homeTeamLogo: '', awayTeamLogo: '' }, events: [] };
        render();
      }, manual);
      for (const [side, slot] of [['home', 'left'], ['away', 'right']]) {
        let chooserCount = 0;
        const onChooser = () => chooserCount++;
        page.on('filechooser', onChooser);
        await page.locator(`#team-logo-${slot}`).click();
        assert.equal(await page.locator('#scoreboardLogoMenu').isVisible(), true);
        assert.equal(chooserCount, 0, 'logo click opens only the menu');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#scoreboardLogoMenu').count(), 0);
        await page.locator(`#team-logo-${slot}`).focus();
        await page.keyboard.press('Enter');
        const chooser = page.waitForEvent('filechooser');
        await page.locator('[data-logo-action="upload"]').click();
        await (await chooser).setFiles({ name: `${side}.svg`, mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="35" fill="red"/></svg>') });
        page.off('filechooser', onChooser);
        await page.waitForFunction(side => state[side + 'Logo'].startsWith('data:image/'), side);
        assert.equal(await page.evaluate(side => document.getElementById(side + 'Logo').getAttribute('src') === state[side + 'Logo'], side), true);
        assert.equal(await page.evaluate(side => {
          const saved = JSON.parse(localStorage.getItem(SKEY));
          return state.manualMode ? saved[side + 'LogoManual'] === state[side + 'Logo'] : saved[side + 'LogoUpload'].url === state[side + 'Logo'];
        }, side), true);
      }
      if (!manual) {
        assert.equal(await page.evaluate(() => {
          reapplyFixtureLogos();
          return ['home', 'away'].every(side => state[side + 'Logo'] === state[side + 'LogoUpload'].url);
        }), true, 'same-fixture refresh preserves uploads');
        await page.locator('#team-logo-left').click();
        await page.locator('[data-logo-action="restore"]').click();
        assert.equal(await page.evaluate(() => state.homeLogo), '', 'restore only the clicked side');
        assert(await page.evaluate(() => state.awayLogo.startsWith('data:image/')));
        assert.equal(await page.evaluate(() => {
          const next = { matchInfo: { fixtureId: 124, homeTeamLogo: 'next-home', awayTeamLogo: 'next-away' }, events: [] };
          applyFixtureToState(next, { resetRunning: false });
          return state.homeLogo === 'next-home' && state.awayLogo === 'next-away';
        }), true, 'another fixture uses its own logos');
      }
      console.log('PASS scoreboard logo upload, persistence and scope:', manual ? 'manual' : 'automatic');
    }
    await page.evaluate(() => { state.manualMode = false; state.homeLogoUpload = state.awayLogoUpload = ''; });
    await page.evaluate(() => {
      // 전용 원형 슬롯이 있는 테마는 바깥 팀 칸 전체를 채우는 디자인이 아니다.
      window.logoTrimTestFrame = img => {
        const style = getComputedStyle(img);
        const theme = img.closest('.fsm-board').dataset.fsmTheme;
        const size = parseFloat(style.getPropertyValue(`--${theme}-logo-size`));
        const box = getComputedStyle(img.parentElement);
        return Number.isFinite(size) ? [size, size]
          : [parseFloat(box.getPropertyValue('--fsm-logo-width')), parseFloat(box.getPropertyValue('--fsm-logo-height'))];
      };
      const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="40" y="15" width="80" height="40" fill="blue"/></svg>');
      state.homeLogo = logo; state.awayLogo = logo;
      state.homeLogoScale = 1; state.awayLogoScale = 1;
      state.homeLogoX = state.homeLogoY = state.awayLogoX = state.awayLogoY = 0;
      render();
    });
    await page.waitForFunction(() => document.getElementById('homeLogo').classList.contains('logo-trimmed'));
    for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES).filter(t => t !== 'unl'))) { // 네이션스리그는 로고 이미지를 숨기는 디자인
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => { render(); fsmBoardRender(); });
      await settle(page);
      const metrics = await page.evaluate(() => ['homeLogo', 'awayLogo'].map(id => {
        const img = document.getElementById(id), image = img.getBoundingClientRect(), box = img.parentElement;
        const rect = box.getBoundingClientRect(), style = getComputedStyle(box);
        const scale = document.querySelector('.scoreboard-main').getBoundingClientRect().width / document.querySelector('.scoreboard-main').offsetWidth;
        const offsetX = _currentTheme === 'unl' ? 0 : (parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)) * scale / 2;
        const offsetY = _currentTheme === 'unl' ? 0 : (parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)) * scale / 2;
        const [frameWidth, frameHeight] = window.logoTrimTestFrame(img);
        return {
          x: image.x + image.width * .4 - (rect.x + rect.width / 2 + offsetX),
          y: image.y + image.height * .35 - (rect.y + rect.height / 2 + offsetY),
          width: image.width * .4, expected: Math.min(frameWidth / 82, frameHeight / 42) * scale * 80,
          boxTransform: style.transform, imageTransform: getComputedStyle(img).transform,
        };
      }));
      for (const value of metrics) {
        assert(Math.abs(value.x) < 1 && Math.abs(value.y) < 1, JSON.stringify({ theme, value }));
        assert(Math.abs(value.width - value.expected) < 1, JSON.stringify({ theme, value }));
        if (theme === 'unl') {
          assert(value.boxTransform.startsWith('matrix(0.707'), value.boxTransform);
          assert(value.imageTransform.startsWith('matrix(0.707107, -0.707107'), value.imageTransform);
        }
      }
      console.log('PASS trim fit and center', theme);
    }
    // 장식으로 바뀌는 테마에는 이전 엠블럼의 내부 채움과 여백 보정이 남지 않아야 한다.
    await page.evaluate(() => {
      const ring = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path fill="black" fill-rule="evenodd" d="M10 10h60v60H10zM20 20v40h40V20z"/></svg>');
      state.homeLogo = state.awayLogo = ring;
      render();
    });
    await page.waitForFunction(() => ['homeLogo', 'awayLogo'].every(id => document.getElementById(id).classList.contains('logo-filled')));
    await page.evaluate(() => { applyTheme('unl', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => { render(); fsmBoardRender(); });
    await settle(page);
    for (const id of ['homeLogo', 'awayLogo']) {
      const decoration = await page.locator('#' + id).evaluate(img => ({
        filled: img.classList.contains('logo-filled'), trimmed: img.classList.contains('logo-trimmed'),
        background: img.style.backgroundImage,
      }));
      assert.deepEqual(decoration, { filled: false, trimmed: false, background: '' });
    }
    await page.locator('.scoreboard-main').screenshot({ path: path.join(screenshotDir, 'fsm-unl-logo-trim.png') });
    await page.evaluate(() => applyTheme('default', null));
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => {
      state.homeLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="blue"/></svg>');
      render();
    });
    await page.waitForFunction(() => !document.getElementById('homeLogo').classList.contains('logo-trimmed'));
    assert.equal(await page.locator('#homeLogo').evaluate(img => img.style.getPropertyValue('--logo-trim-width-factor')), '');
    console.log('PASS stale trim cleared on logo replacement');
    for (const [width, height] of [[200, 100], [150, 100], [100, 100], [100, 200]]) {
      await page.evaluate(([width, height]) => {
        const logo = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="blue"/></svg>`);
        state.homeLogo = logo; state.awayLogo = logo; render();
      }, [width, height]);
      await page.waitForFunction(ratio => Math.abs(parseFloat(document.getElementById('homeLogo').style.getPropertyValue('--logo-fit-aspect')) - ratio) < .001, width / height);
      for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES).filter(t => t !== 'unl'))) { // 네이션스리그는 로고 이미지를 숨기는 디자인
        await page.evaluate(theme => applyTheme(theme, null), theme);
        await page.waitForFunction(() => !pendingThemeLink);
        await page.evaluate(() => { render(); fsmBoardRender(); });
        await settle(page);
        const sizes = await page.evaluate(() => ['homeLogo', 'awayLogo'].map(id => {
          const img = document.getElementById(id), s = getComputedStyle(img);
          const [boxWidth, boxHeight] = window.logoTrimTestFrame(img);
          return { width: parseFloat(s.width), height: parseFloat(s.height), boxWidth, boxHeight };
        }));
        for (const size of sizes) {
          const factor = Math.min(size.boxWidth / width, size.boxHeight / height);
          assert(Math.abs(size.width - width * factor) < .1 && Math.abs(size.height - height * factor) < .1, JSON.stringify({ theme, width, height, size }));
        }
      }
      console.log('PASS full-bleed logo fit across all themes', width, height);
    }
    // 로고 픽셀 분석은 Web Worker(logo-trim-worker.js)에서 한다(2026-10-17, 처음 보는 로고마다 메인 스레드가
    // 약 100ms 멈춰 테마 전환이 끊기던 문제). PNG는 Worker가 직접 받아 디코딩하고, SVG는 메인 스레드가 그린
    // 비트맵을 넘긴다. 두 경우 모두 메인 스레드 경로와 같은 경계·채우기 마스크가 나와야 하고 실패 경고가 없어야 한다.
    const workerWarnings = [];
    page.on('console', message => { if (message.text().includes('Worker 분석 실패')) workerWarnings.push(message.text()); });
    const ring = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 120; c.height = 80;
      const g = c.getContext('2d'); g.fillStyle = '#c00'; g.fillRect(20, 10, 80, 60); g.clearRect(35, 22, 50, 36);
      return c.toDataURL('image/png');
    });
    const svgRing = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><path fill-rule="evenodd" fill="#c00" d="M20 10h80v60H20zM35 22v36h50V22z"/></svg>');
    for (const logo of [ring, svgRing]) {
      const result = await page.evaluate(async logo => {
        LogoTrim.clearCache();
        const img = document.createElement('img');
        await new Promise(resolve => { LogoTrim.render(img, logo, ready => { if (ready) resolve(); }); setTimeout(resolve, 8000); });
        await new Promise(resolve => setTimeout(resolve, 50));
        const pixels = async src => {
          const bitmap = await createImageBitmap(await (await fetch(src)).blob());
          const c = new OffscreenCanvas(bitmap.width, bitmap.height), g = c.getContext('2d');
          g.drawImage(bitmap, 0, 0);
          return Array.from(g.getImageData(0, 0, bitmap.width, bitmap.height).data);
        };
        const fill = img.style.backgroundImage.match(/url\("(.*)"\)/)?.[1];
        // 메인 스레드 경로와 같은 순서(그리기 -> 경계 -> 채우기 마스크)로 기대값을 만든다.
        const source = new Image(); source.src = logo; await source.decode();
        const svg = logo.startsWith('data:image/svg');
        const scale = svg ? Math.max(1, 1024 / Math.max(source.naturalWidth, source.naturalHeight)) : 1;
        const width = Math.ceil(source.naturalWidth * scale), height = Math.ceil(source.naturalHeight * scale);
        const draw = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(source, 0, 0, w, h); return g.getImageData(0, 0, w, h); };
        const bounds = LogoTrimAnalysis.findBounds(draw(width, height));
        const geometry = LogoTrimAnalysis.fillGeometry(bounds);
        const mask = LogoTrimAnalysis.buildFillMask(draw(geometry.width, geometry.height), geometry.minArea);
        return { bounds: LogoTrim.getCachedBounds(logo), expectedBounds: bounds,
          fillPixels: fill ? await pixels(fill) : null, expectedFill: mask ? Array.from(mask.data) : null };
      }, logo);
      assert.deepEqual(result.bounds, result.expectedBounds, 'worker bounds match main-thread analysis');
      assert(result.expectedFill, 'ring logo has an enclosed fill area');
      assert.deepEqual(result.fillPixels, result.expectedFill, 'worker fill mask matches main-thread analysis');
    }
    assert(page.workers().some(worker => worker.url().endsWith('/js/core/logo-trim-worker.js')), 'logo analysis runs in a Web Worker');
    assert.deepEqual(workerWarnings, [], 'worker analysis did not fall back to the main thread');
    console.log('PASS worker logo analysis matches main-thread result (png, svg)');
  } finally { await browser.close(); rmSync(screenshotDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
