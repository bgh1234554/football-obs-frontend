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
        // 은색 테두리처럼 글자색과 비슷한 장식이 글자로 잡히지 않게 측정할 때만 글자를 자홍색으로 칠한다.
        const marker = await page.addStyleTag({ content: '.fsm-board .team-name .text { color: #ff00ff !important; -webkit-text-fill-color: #ff00ff !important; }' });
        const screenshot = (await page.screenshot()).toString('base64');
        await marker.evaluate(node => node.remove());
        const measurements = await page.evaluate(async screenshot => {
          const img = new Image(); img.src = 'data:image/png;base64,' + screenshot; await img.decode();
          const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
          const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
          const pixels = context.getImageData(0, 0, img.width, img.height).data;
          return [...document.querySelectorAll('.team-name .text')].map(text => {
            const r = text.getBoundingClientRect(), card = text.closest('.teams-left,.teams-right'), c = card.getBoundingClientRect(), style = getComputedStyle(card);
            const scale = c.height / card.offsetHeight;
            const rgb = [255, 0, 255];
            const top = c.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * scale;
            const bottom = c.bottom - (parseFloat(style.borderBottomWidth) + parseFloat(style.paddingBottom) + (style.boxShadow !== 'none' || document.querySelector('.fsm-board').dataset.fsmTheme === 'kleague' ? 1 : 0)) * scale; // K리그는 경계선 1px을 가상 요소로 그림
            let first = Infinity, last = -Infinity;
            for (let y = Math.ceil(top); y < Math.floor(bottom); y++) {
              for (let x = Math.ceil(r.left); x < Math.floor(r.right); x++) {
                const index = (y * img.width + x) * 4;
                if (rgb.every((value, channel) => Math.abs(pixels[index + channel] - value) < 65)) {
                  first = Math.min(first, y); last = Math.max(last, y);
                }
              }
            }
            return { name: text.textContent, font: getComputedStyle(text).fontSize, error: (first + last + 1) / 2 - (top + bottom) / 2 };
          });
        }, screenshot);
        for (const value of measurements) assert(Math.abs(value.error) <= 1, JSON.stringify({ theme, scale, ...value }));
        // 글꼴 크기가 같으면 홈/원정 팀명의 세로 위치(기준선)가 같아야 한다. 팀명별 반 픽셀 반올림으로 1px 어긋나던 회귀 방지.
        if (measurements[0].font === measurements[1].font) assert(Math.abs(measurements[0].error - measurements[1].error) <= .5, JSON.stringify({ theme, scale, measurements }));
        console.log('PASS strip-theme visible text centering', theme, scale, JSON.stringify(measurements));
      }
      measuredThemes.add(theme);
    }
    assert(measuredThemes.size > 0, 'At least one strip-edge theme must be measured');
    assert(measuredThemes.has('unl'), 'Nations League (unl) must be measured');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
