const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => { state.boardScale = 100; state.fsmTheme = 'unl'; applyTheme('unl', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    for (const id of ['homeLogo', 'awayLogo']) {
      assert.equal(await page.locator(`#${id}`).evaluate(img => getComputedStyle(img).getPropertyValue('--fsm-logo-angle')), '180deg');
    }
    for (const [color, rgb, light] of [
      ['#000000', [0, 0, 0], true], ['#303030', [48, 48, 48], true],
      ['#0066cc', [0, 102, 204], false], ['#cc2020', [204, 32, 32], false],
      ['#ffffff', [255, 255, 255], false]
    ]) {
      await page.evaluate(color => {
        state.colors.homeBg = state.colors.awayBg = color;
        render(); fsmBoardRender();
      }, color);
      await settle(page);
      await page.locator('#homeLogo').evaluate(img => img.decode());
      for (const side of ['left', 'right']) {
        const geometry = await page.locator(`#team-logo-${side}`).evaluate(box => {
          const img = box.querySelector('img'), a = box.getBoundingClientRect(), b = img.getBoundingClientRect();
          return { width: a.width - b.width, height: a.height - b.height,
            x: a.x - b.x, y: a.y - b.y, fit: getComputedStyle(img).objectFit,
            border: getComputedStyle(box).borderTopWidth };
        });
        assert.equal(geometry.fit, 'fill');
        assert.equal(geometry.border, '0px');
        for (const key of ['width', 'height', 'x', 'y']) assert(Math.abs(geometry[key]) < .1, JSON.stringify(geometry));
        const png = await page.locator(`#team-logo-${side}`).screenshot();
        const counts = await page.evaluate(async ({ base64, rgb, light }) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
          const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let base = 0, shaded = 0;
          // 경계의 안티앨리어싱을 제외하고 두 면의 실제 합성 색을 확인합니다.
          const expected = rgb.map(v => light ? v + (255 - v) * .2 : v * .65);
          for (let i = 0; i < pixels.length; i += 4) {
            if (rgb.every((v, j) => Math.abs(pixels[i + j] - v) <= 2)) base++;
            if (expected.every((v, j) => Math.abs(pixels[i + j] - v) <= 2)) shaded++;
          }
          return { base, shaded };
        }, { base64: png.toString('base64'), rgb, light });
        assert(counts.base > 20 && counts.shaded > 20, JSON.stringify({ color, side, counts }));
      }
      console.log('PASS UNL original and shaded colors', color);
    }
    await page.evaluate(() => {
      state.colors.homeBg = '#0066cc'; state.colors.awayBg = '#202020';
      state.homeName = '크로아티아'; state.awayName = '스페인';
      render(); fsmBoardRender();
    });
    await settle(page);
    await page.locator('#boardStageInner').screenshot({ path: 'screenshots/tests/fsm-unl-colors.png' });
    await page.evaluate(() => applyTheme('pl', null));
    await page.waitForFunction(() => !pendingThemeLink);
    assert.equal(await page.locator('#homeLogo').evaluate(img => img.style.mixBlendMode), '');
    assert.equal(await page.locator('#homeLogo').evaluate(img => img.style.filter), '');
    assert.notEqual(await page.locator('#awayLogo').evaluate(img => getComputedStyle(img).getPropertyValue('--fsm-logo-angle')), '180deg');
    console.log('PASS UNL blend reset on theme change');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
