// Run: node tests/fixture/fixture-selection.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/', { waitUntil: 'load' });
    const result = await page.evaluate(async () => {
      state.manualMode = false;
      clearPolling();
      const fixture = id => ({ matchInfo: { fixtureId: id, status: 'FT', elapsed: 90, homeTeamName: 'Home', awayTeamName: 'Away', homeScore: 0, awayScore: 0 }, events: [], playerStats: [] });
      fetchFixture = async id => fixture(id);
      await fetchAndApplyFixtureData('100');
      clearPolling();
      const widget = document.createElement('api-sports-widget');
      widget.setAttribute('data-type', 'game');
      widget.setAttribute('data-game-id', '200');
      gameTarget.appendChild(widget);
      await new Promise(resolve => setTimeout(resolve, 0));
      await fetchAndApplyFixtureData('100', { silent: true });
      clearPolling();
      const afterPoll = { selected: currentFixtureId, recent: lastSeenFixtureId, active: activeFixtureId, saved: localStorage.getItem('last_fixture_id') };
      document.getElementById('main-use-last-btn').click();
      const recentInput = mainInput.value;
      const requested = [];
      fetchFixture = async id => { requested.push(id); return fixture(id); };
      document.getElementById('panel-fixture-load-btn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      clearPolling();
      let finish;
      fetchFixture = () => new Promise(resolve => { finish = resolve; });
      const pending = fetchAndApplyFixtureData('300');
      widget.setAttribute('data-game-id', '400');
      await new Promise(resolve => setTimeout(resolve, 0));
      finish(fixture('300'));
      await pending;
      clearPolling();
      return { afterPoll, recentInput, requested, afterPending: { selected: currentFixtureId, recent: lastSeenFixtureId, active: activeFixtureId }, displayed: selectedEls.map(el => el.textContent) };
    });
    assert.deepEqual(result.afterPoll, { selected: '200', recent: '200', active: '100', saved: '100' });
    assert.equal(result.recentInput, '200');
    assert.deepEqual(result.requested, ['200']);
    assert.deepEqual(result.afterPending, { selected: '400', recent: '400', active: '300' });
    assert.ok(result.displayed.every(id => id === '400'));
    assert.deepEqual(errors, []);
    console.log('PASS: polling, recent selection, load button, and late responses preserve the latest fixture selection');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
