const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      state.homeName = 'Home'; state.awayName = 'Away';
      Object.assign(state.colors, { homeBg: '#008040', awayBg: '#204080' });
    });
    const select = async theme => {
      await page.evaluate(theme => { state.fsmTheme = theme; autoApplyTemplateByLeagueId(39, null); render(); }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await settle(page);
    };
    for (const scale of [60, 100, 150]) {
      await page.evaluate(scale => { state.boardScale = scale; render(); }, scale);
      // 이전 세로 띠 테마가 남긴 인라인 팀색이 내셔널리그에서 숨겨졌다가 다시 노출되던 경로입니다.
      await select('rpl');
      assert.equal(await page.locator('#homeColor').evaluate(el => getComputedStyle(el).display), 'block');
      await select('nationalleague');
      assert.equal(await page.locator('#homeColor').evaluate(el => getComputedStyle(el).display), 'none');
      await select('facup');
      const result = await page.evaluate(() => ['home', 'away'].map(side => {
        const card = document.getElementById(side + 'Card');
        const stripe = document.getElementById(side + 'Color');
        const style = getComputedStyle(card);
        return { display: getComputedStyle(stripe).display, bottom: style.borderBottomColor,
          border: style.borderBottomWidth, stripeHeight: stripe.getBoundingClientRect().height };
      }));
      result.forEach((entry, i) => {
        assert.equal(entry.display, 'none', `FA Cup hidden vertical stripe ${scale}/${i}`);
        assert.equal(entry.stripeHeight, 0);
        assert.equal(entry.border, '5px');
        assert.equal(entry.bottom, i ? 'rgb(32, 64, 128)' : 'rgb(0, 128, 64)');
      });
    }
    await page.locator('#board').screenshot({ path: 'screenshots/tests/fsm-facup-transition.png' });
    console.log('PASS RPL -> National League -> FA Cup: no leaked vertical stripes, horizontal team colors preserved at 60/100/150%');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
