const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.waitForFunction(() => !document.querySelector('.fsm-starting, .fsm-entering'));
    for (const [theme, leagueId] of [['pl', 39], ['unl', 5], ['default', 999]]) {
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(leagueId => {
        window.testLeagueId = leagueId; window.entranceStarts = 0;
        document.querySelector('#board').onanimationstart = event => { if (event.animationName === 'fsm-board-enter') window.entranceStarts++; };
        fetchFixture = async id => ({ matchInfo: { fixtureId: id, leagueId: window.testLeagueId, status: 'FT', elapsed: 90,
          homeTeamName: `Home ${id}`, awayTeamName: 'Away', homeScore: 1, awayScore: 0 }, events: [], playerStats: [] });
      }, leagueId);
      const load = async (id, silent = false) => {
        await page.evaluate(async ({ id, silent }) => { await fetchAndApplyFixtureData(id, { silent }); clearPolling(); }, { id, silent });
      };
      const id = String(leagueId * 10);
      await load(id);
      await page.waitForFunction(() => window.entranceStarts === 1);
      await page.waitForFunction(() => !document.querySelector('.fsm-starting, .fsm-entering'));
      await load(String(Number(id) + 1));
      await page.waitForFunction(() => window.entranceStarts === 2);
      const before = await page.locator('#board').evaluate(node => ({ width: node.offsetWidth, height: node.offsetHeight }));
      await page.waitForTimeout(theme === 'pl' ? 150 : 300);
      await page.locator('#boardStageInner').screenshot({ path: `tests/fixture/entrance-${theme}.png` });
      await page.waitForFunction(() => !document.querySelector('.fsm-starting, .fsm-entering'));
      assert.deepEqual(await page.locator('#board').evaluate(node => ({ width: node.offsetWidth, height: node.offsetHeight })), before);
      await load(String(Number(id) + 1), true);
      await load(String(Number(id) + 1));
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.entranceStarts), 2);
      // A second new fixture during an entrance should restart it cleanly.
      await load(String(Number(id) + 2));
      await page.waitForFunction(() => window.entranceStarts === 3);
      await load(String(Number(id) + 3));
      await page.waitForFunction(() => window.entranceStarts === 4);
      await page.waitForFunction(() => !document.querySelector('.fsm-starting, .fsm-entering'));
      console.log('PASS', theme, 'new fixture entrance, stable size, no polling/reload replay, rapid loading');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
