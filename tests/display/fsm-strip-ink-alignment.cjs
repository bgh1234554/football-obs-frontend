const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      state.homeName = '\uBD81\uC544\uC77C\uB79C\uB4DC'; state.awayName = '\uC870\uC9C0\uC544';
      state.colors.homeBg = '#009900'; state.colors.awayBg = '#0055dd';
      applyTheme('unl', null);
    });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => document.fonts.ready);
    const measuredThemes = new Set();
    for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES))) {
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { render(); fsmBoardRender(); });
      if (await page.evaluate(() => document.querySelector('.fsm-board').dataset.fsmColorEdge !== 'strip')) continue;
      for (const scale of [50, 75, 100]) {
        await page.evaluate(scale => { state.boardScale = scale; initBoardScale(); render(); fsmBoardRender(); }, scale);
        await settle(page);
        const screenshot = (await page.screenshot()).toString('base64');
        const measurements = await page.evaluate(async screenshot => {
          const img = new Image(); img.src = 'data:image/png;base64,' + screenshot; await img.decode();
          const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
          const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
          const pixels = context.getImageData(0, 0, img.width, img.height).data;
          return [...document.querySelectorAll('.team-name .text')].map(text => {
            const r = text.getBoundingClientRect(), card = text.closest('.teams-left,.teams-right'), c = card.getBoundingClientRect(), style = getComputedStyle(card);
            const scale = c.height / card.offsetHeight;
            const rgb = getComputedStyle(text).color.match(/[\d.]+/g).slice(0, 3).map(Number);
            const top = c.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * scale;
            const bottom = c.bottom - (parseFloat(style.borderBottomWidth) + parseFloat(style.paddingBottom) + (style.boxShadow !== 'none' ? 1 : 0)) * scale;
            let first = Infinity, last = -Infinity;
            for (let y = Math.ceil(top); y < Math.floor(bottom); y++) {
              for (let x = Math.ceil(r.left); x < Math.floor(r.right); x++) {
                const index = (y * img.width + x) * 4;
                if (rgb.every((value, channel) => Math.abs(pixels[index + channel] - value) < 65)) {
                  first = Math.min(first, y); last = Math.max(last, y);
                }
              }
            }
            return { name: text.textContent, error: (first + last + 1) / 2 - (top + bottom) / 2 };
          });
        }, screenshot);
        for (const value of measurements) assert(Math.abs(value.error) <= 1, JSON.stringify({ theme, scale, ...value }));
        console.log('PASS strip-theme visible text centering', theme, scale, JSON.stringify(measurements));
      }
      measuredThemes.add(theme);
    }
    assert(measuredThemes.size > 0, 'At least one strip-edge theme must be measured');
    assert(measuredThemes.has('unl'), 'Nations League (unl) must be measured');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
