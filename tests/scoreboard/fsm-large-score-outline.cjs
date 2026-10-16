const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const themes = await page.evaluate(() => Object.keys(FSM_THEMES));
    const outlined = new Set();
    for (const theme of themes) {
      await page.evaluate(theme => {
        state.homeName = 'HOME'; state.awayName = 'AWAY'; state.homeScore = 2; state.awayScore = 4;
        Object.assign(state.colors, { homeBg: '#ffffff', awayBg: '#ffffff', homeText: '#000000', awayText: '#000000' });
        applyTheme(theme, null);
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      for (const scale of [75, 100]) for (const aggregate of [false, true]) {
        await page.evaluate(({ scale, aggregate }) => {
          state.boardScale = scale; state.aggEnabled = aggregate;
          render(); fsmBoardRender(); reapplyBoardScale();
        }, { scale, aggregate });
        await settle(page);
        const scores = await page.locator('.score-left,.score-right').evaluateAll(nodes => nodes.map(node => {
          const c = getComputedStyle(node);
          return { size: parseFloat(getComputedStyle(node.parentElement).fontSize), color: c.color, stroke: c.webkitTextStrokeWidth, strokeColor: c.webkitTextStrokeColor, order: c.paintOrder };
        }));
        for (const score of scores) {
          const large = score.size >= 60 && score.color === 'rgb(255, 255, 255)';
          assert.equal(score.stroke, large ? '1px' : '0px', JSON.stringify({ theme, scale, aggregate, score }));
          if (large) {
            outlined.add(theme);
            assert.equal(score.strokeColor, 'rgb(0, 0, 0)');
            assert(score.order.startsWith('stroke'));
          }
        }
        const totals = await page.locator('.total').evaluateAll(nodes => nodes.map(node => {
          const c = getComputedStyle(node);
          return { stroke: c.webkitTextStrokeWidth, color: c.webkitTextStrokeColor, order: c.paintOrder };
        }));
        for (const total of totals) {
          assert.equal(total.stroke, outlined.has(theme) ? '1px' : '0px', JSON.stringify({ theme, aggregate, total }));
          if (outlined.has(theme)) {
            assert.equal(total.color, 'rgb(0, 0, 0)');
            assert(total.order.startsWith('stroke'));
          }
        }
      }
      if (['romanian', 'uzbek', 'jleague'].includes(theme)) {
        await page.locator('#board').screenshot({ path: `screenshots/tests/large-score-outline-${theme}.png` });
      }
    }
    assert.deepEqual([...outlined].sort(), ['belarus', 'jleague', 'pl', 'romanian', 'saudi', 'turkishcup', 'uzbek']);
    assert.deepEqual(errors, []);
    console.log('PASS large white main and aggregate score outlines across all themes, both sides, 75/100% and aggregate on/off; ordinary scores remain unchanged');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
