const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      document.querySelectorAll('style').forEach(style => {
        if (style.textContent.includes('* { transition: none !important; animation: none !important; }')) style.remove();
      });
      state.manualMode = true; state.half = 'PK'; state.boardScale = 75;
      state.pk.home = ['G', 'M']; state.pk.away = ['G'];
    });
    const themes = process.env.FSM_PSO_TRANSITION_THEMES?.split(',') || await page.evaluate(() => Object.keys(FSM_THEMES));
    const switchTheme = async theme => {
      await page.evaluate(theme => { state.fsmTheme = theme; autoApplyTemplateByLeagueId(39, null); render(); }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const result = await page.evaluate(async () => {
        const samples = [];
        const start = performance.now();
        do {
          await new Promise(resolve => requestAnimationFrame(resolve));
          const timer = document.querySelector('.time').getBoundingClientRect();
          const pso = document.querySelector('.pso-status').getBoundingClientRect();
          samples.push(pso.top - timer.top);
        } while (performance.now() - start < 1000);
        return { theme: _currentTheme, maxError: Math.max(...samples.map(Math.abs)) };
      });
      assert.equal(result.theme, theme);
      assert(result.maxError < .1, JSON.stringify(result));
    };
    for (const theme of themes.filter(theme => theme !== 'er24')) {
      await switchTheme(theme);
      await switchTheme('er24');
      console.log('PASS', theme, '-> er24 with transitions enabled');
    }
    await page.evaluate(() => persist());
    await page.reload();
    await page.waitForFunction(() => _currentTheme === 'er24' && !pendingThemeLink && document.querySelector('#board').dataset.fsmPso === 'true' && !document.querySelector('#board').classList.contains('fsm-starting'));
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const error = await page.evaluate(() => document.querySelector('.pso-status').getBoundingClientRect().top - document.querySelector('.time').getBoundingClientRect().top);
    assert(Math.abs(error) < .1, String(error));
    console.log('PASS PSO position remains aligned during theme transitions and after reload');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
