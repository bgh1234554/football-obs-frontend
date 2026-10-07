const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      if (/result_style_(EPL|CL)\.css$/.test(file)) await new Promise(resolve => setTimeout(resolve, 500));
      return route.fulfill({ body: fs.readFileSync(file), contentType: {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff'
      }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    for (const leagueId of [39, 2, 3, 17, 5, 4, 61, 135, 292, 1, null]) {
      await page.evaluate(leagueId => {
        state.manualMode = true;
        state.leagueId = leagueId;
        state.homeName = 'Arsenal'; state.awayName = 'Chelsea';
        state.homeScore = 2; state.awayScore = 1;
        persist();
      }, leagueId);
      await page.reload({ waitUntil: 'domcontentloaded' });
      if ([39, 2].includes(leagueId)) {
        assert.equal(await page.locator('#board').evaluate(board => getComputedStyle(board).visibility), 'hidden');
      }
      await page.waitForFunction(() => !document.querySelector('.fsm-starting'));
      const initial = await page.locator('#board').evaluate(board => ({
        width: board.offsetWidth, height: board.offsetHeight,
        duration: getComputedStyle(board).animationDuration,
        transition: getComputedStyle(board.querySelector('.scoreboard-main')).transitionProperty
      }));
      assert.equal(initial.duration, leagueId === 39 ? '0.4s' : '0.9s');
      assert(!initial.transition.split(', ').includes('width'));
      await page.waitForTimeout(parseFloat(initial.duration) * 400);
      await page.screenshot({ path: `tests/display/startup-${leagueId}-entering.png` });
      await page.waitForFunction(() => !document.querySelector('.fsm-entering'));
      const final = await page.locator('#board').evaluate(board => ({ width: board.offsetWidth, height: board.offsetHeight }));
      assert.deepEqual(final, { width: initial.width, height: initial.height });
      await page.screenshot({ path: `tests/display/startup-${leagueId}-ready.png` });
      console.log('PASS restored theme, smooth entrance and stable geometry:', leagueId);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.fsm-starting'));
    assert.equal(await page.locator('#board').evaluate(board => getComputedStyle(board).animationName), 'none');
    // Existing manual-mode startup issue in the unrelated tactics timeline.
    assert.deepEqual(errors.filter(error => error !== 'tacticsTimelineState.events.home is not iterable'), []);
    if (errors.length) console.log('Existing tactics timeline startup error:', errors[0]);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
