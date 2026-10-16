const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
    await page.evaluate(() => { applyTheme('er24', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => document.fonts.ready);
    for (const names of [['로디나 모스크바', '스파르타크 모스크바'], ['토르페도 모스크바', '스파르타크 모스크바'], ['스파르타크 모스크바', '토르페도 모스크바'], ['토르페도 모스크바', '토르페도 모스크바']]) {
      for (const scale of [50, 75, 100]) {
        await page.evaluate(({ names, scale }) => {
          [state.homeName, state.awayName] = names; state.boardScale = scale;
          state.homeScore = 2; state.awayScore = 4; state.extraShown = true; state.extra = 1;
          state.colors.homeBg = '#00b4d8'; state.colors.awayBg = '#c5093f';
          render(); fsmBoardRender(); reapplyBoardScale();
        }, { names, scale });
        await settle(page);
        const png = PNG.sync.read(await page.screenshot());
        const boxes = await page.locator('.team-name .text').evaluateAll(nodes => nodes.map(node => {
          const text = node.getBoundingClientRect(), card = node.closest('.teams-left,.teams-right');
          const r = card.getBoundingClientRect(), c = getComputedStyle(card), scale = r.height / card.offsetHeight;
          const top = r.top + (parseFloat(c.borderTopWidth) + parseFloat(c.paddingTop)) * scale;
          const bottom = r.bottom - (parseFloat(c.borderBottomWidth) + parseFloat(c.paddingBottom) + (c.boxShadow !== 'none' ? 1 : 0)) * scale;
          return { name: node.textContent, left: text.left, right: text.right, top, bottom, transform: node.style.transform, font: getComputedStyle(node).fontSize };
        }));
        const result = boxes.map(box => {
          let first = Infinity, last = -Infinity;
          for (let y = Math.floor(box.top); y < Math.ceil(box.bottom); y++) for (let x = Math.floor(box.left); x < Math.ceil(box.right); x++) {
            const at = (y * png.width + x) * 4;
            if ([0, 1, 2].every(channel => png.data[at + channel] > 210)) { first = Math.min(first, y); last = Math.max(last, y); }
          }
          return { ...box, first, last, error: (first + last + 1 - box.top - box.bottom) / 2 };
        });
        console.log(JSON.stringify({ names, scale, result }));
        await page.locator('#boardStageInner').screenshot({ path: `screenshots/tests/euro-name-ink-${scale}.png` });
        // 양쪽 글자 높이를 합친 영역이 카드 가운데에 오고, 같은 글꼴 크기면 기준선도 같아야 합니다.
        const [home, away] = result;
        const union = (Math.min(home.first, away.first) + Math.max(home.last, away.last) + 1 - home.top - home.bottom) / 2;
        assert(Math.abs(union) <= 1, JSON.stringify(result));
        if (home.font === away.font) assert.equal(home.transform, away.transform, JSON.stringify(result));
        // 6px 팀컬러 줄 기준으로 위아래 여백이 반 픽셀 이내로 같아야 합니다(100%는 정확히 같음).
        result.forEach(r => assert(Math.abs(r.error) <= .5, JSON.stringify(r)));
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
