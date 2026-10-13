const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let delay = 0;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname.slice(1)));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      const wait = delay === 1000
        ? (/[\\/]init\.js$/.test(file) ? delay : 0)
        : (/result_style_|\.(woff|ttf)$/.test(file) ? delay : 0);
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      await route.fulfill({ body: fs.readFileSync(file), contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(() => {
      window.scoreTransitions = [];
      document.addEventListener('transitionrun', event => {
        if (event.target.matches('.team-score, .score-div')) window.scoreTransitions.push(event.propertyName);
      });
    });
    await page.goto('http://localhost/');
    const themes = await page.evaluate(() => Object.keys(FSM_THEMES));
    const failures = [];
    for (delay of [0, 150, 1000]) {
      for (const theme of themes) {
        await page.evaluate(theme => {
          state.manualMode = true; state.fsmTheme = theme;
          state.homeScore = 2; state.awayScore = 1; persist();
        }, theme);
        await page.reload();
        await page.waitForFunction(() => !pendingThemeLink && !document.querySelector('.fsm-starting, .fsm-entering'));
        const transitions = await page.evaluate(() => window.scoreTransitions);
        if (transitions.length) failures.push({ theme, delay, transitions });
        assert.deepEqual((await page.locator('.team-score').allTextContents()).map(text => text.trim()), ['2', '1']);
      }
    }
    assert.deepEqual(failures, [], 'Reload must settle score styles before enabling transitions');
    await page.evaluate(() => applyTheme('default', null));
    await page.waitForFunction(() => !pendingThemeLink);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { window.scoreTransitions = []; applyTheme('pl', null); });
    await page.waitForFunction(() => window.scoreTransitions.includes('font-size'));
    console.log(`PASS ${themes.length * 3} reload cases: no accidental score transitions; EPL theme switch retains enlargement`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
