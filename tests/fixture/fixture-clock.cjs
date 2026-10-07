// Run: node tests/fixture/fixture-clock.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../..');
const override = process.argv[3] ? path.resolve(process.argv[3]) : null;
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const relative = decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname).slice(1);
      const file = override && relative === 'js/core/fixture.js' ? override : path.join(root, relative);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/', { waitUntil: 'load' });
    const results = await page.evaluate(async () => {
      clearPolling();
      state.manualMode = false;
      const fixture = (status, elapsed, fixtureId = 987654) => ({ matchInfo: { fixtureId, status, elapsed, homeTeamName: '홈', awayTeamName: '원정', homeScore: 0, awayScore: 0 }, events: [], playerStats: [] });
      const originalFetch = fetchFixture;
      const originalPersist = persist;
      const originalSetClock = window.setClockSeconds;
      let saved;
      persist = () => { saved = { seconds: state.seconds, running: state.running }; originalPersist(); };
      const results = [];
      const read = () => ({ seconds: state.seconds, running: state.running, lastTick: state.lastRunningTickMs, clock: el.clock.textContent, half: state.half, markers: [...document.querySelectorAll('.ev-period-marker')].map(row => row.textContent), saved });
      const running = seconds => { setClockSeconds(seconds); startClockTimer(); };
      const poll = async (data, options = { silent: true }) => {
        fetchFixture = async () => data;
        const applied = await fetchAndApplyFixtureData(data.matchInfo.fixtureId, options);
        clearPolling();
        if (!applied) throw new Error('Fixture response was not applied');
      };
      try {
        for (const status of ['1H', '2H', 'ET1', 'ET2', 'NS']) {
          await poll(fixture('FT', 90), {});
          await poll(fixture(status, 30, 987655), {});
          results.push({ name: `FT to another ${status} fixture`, expected: 0, ...read() });
        }
        running(3333);
        await poll(fixture('2H', 60), {});
        results.push({ name: 'switch fixture while clock is running', expected: 0, ...read() });
        await poll(fixture('HT', 45));
        await poll(fixture('1H', 20, 987655));
        results.push({ name: 'HT to another live fixture via silent fetch', expected: 0, ...read() });
        running(3333);
        await poll(fixture('1H', 21, 987655), {});
        const sameFixtureRefreshPreserved = state.running && state.seconds === 3333;

        _lastFixtureData = fixture('1H', 47);
        running(47 * 60 + 32);
        await poll(fixture('HT', 45));
        results.push({ name: '1H to HT while running', expected: 2700, ...read() });
        running(46 * 60);
        await poll(fixture('HT', 45));
        results.push({ name: 'repeated HT polling', expected: 2700, ...read() });
        setClockSeconds(12);
        await poll(fixture('HT', 45, 987655));
        results.push({ name: 'load another HT fixture while paused', expected: 2700, ...read() });

        _lastFixtureData = fixture('2H', 97);
        running(97 * 60 + 12);
        await poll(fixture('FT', 90));
        results.push({ name: '2H to FT while running', expected: 5400, ...read() });
        setClockSeconds(0);
        await poll(fixture('FT', 90));
        results.push({ name: 'repeated FT while paused', expected: 5400, ...read() });
        for (const status of ['AET', 'PEN']) {
          running(122 * 60);
          await poll(fixture(status, 120));
          results.push({ name: `FT alias ${status}`, expected: 7200, ...read() });
        }
        for (const status of ['PSO', 'P', 'FT', 'AET', 'PEN']) {
          for (const elapsed of [90, 120, 0, null, undefined]) {
            running(123 * 60);
            await poll(fixture(status, elapsed, 200000 + results.length), {});
            results.push({ name: `cold ${status} load elapsed ${elapsed}`, expected: elapsed > 90 ? 7200 : 5400, ...read() });
          }
        }
        running(94 * 60);
        await poll(fixture('BT', 90));
        results.push({ name: '90 minute break before extra time', expected: 5400, ...read() });
        activatePage('main-small');
        for (const elapsed of [0, null, undefined, 90]) {
          running(45 * 60);
          const bt = fixture('BT', elapsed, 1642011);
          bt.events = [{ elapsed: 90, extra: 2, side: 'away', type: 'Card', detail: 'Yellow Card', playerName: 'Shuto Nagano' }];
          await poll(bt);
          results.push({ name: `BT elapsed ${elapsed}: 90+2 event evidence`, expected: 5400, expectedHalf: '2', expectedMarker: '후반종료', ...read() });
        }
        await poll(fixture('BT', 0, 1642012));
        results.push({ name: 'cold BT load without events', expected: 5400, expectedHalf: '2', expectedMarker: '후반종료', ...read() });
        await poll(fixture('BT', 105, 1642012));
        results.push({ name: 'extra-time half break', expected: 6300, expectedHalf: 'ET1', expectedMarker: '연장 전반 종료', ...read() });
        for (const [minute, boundary, half, marker] of [[101, 105, 'ET1', '연장 전반 종료'], [118, 120, 'ET2', '연장 후반 종료']]) {
          const bt = fixture('BT', 0, 1642012);
          bt.events = [{ elapsed: minute, side: 'home', type: 'Card', detail: 'Yellow Card', playerName: 'Extra Time Player' }];
          await poll(bt);
          results.push({ name: `BT 0 with ${minute}-minute evidence`, expected: boundary * 60, expectedHalf: half, expectedMarker: marker, ...read() });
        }
        await poll(fixture('BT', 0, 1642013));
        results.push({ name: 'another fixture does not inherit extra-time break', expected: 5400, expectedHalf: '2', expectedMarker: '후반종료', ...read() });

        running(46 * 60 + 10);
        _lastFixtureData = fixture('HT', 45);
        document.dispatchEvent(new CustomEvent('settings:change', { detail: { category: 'teamName' } }));
        const settingsPreserved = state.running && state.seconds === 2770;
        const livePreserved = [];
        for (const status of ['1H', '2H', 'ET1', 'ET2']) {
          _lastFixtureData = fixture(status, 55);
          running(3333);
          await poll(fixture(status, 55));
          livePreserved.push(state.running && state.seconds === 3333);
        }
        for (const elapsed of [90, 120]) {
          const pso = fixture('PSO', elapsed);
          _lastFixtureData = pso;
          running((elapsed + 3) * 60);
          await poll(pso, { silent: false });
          results.push({ name: `same-fixture PSO refresh elapsed ${elapsed}`, expected: elapsed * 60, ...read() });
        }
        state.manualMode = true;
        running(1234);
        await fetchAndApplyFixtureData(987654, { silent: true });
        const manualPreserved = state.running && state.seconds === 1234;
        state.manualMode = false;
        window.setClockSeconds = undefined;
        await poll(fixture('HT', 45));
        results.push({ name: 'fallback without timer helper', expected: 2700, ...read() });
        await poll(fixture('2H', 60, 987655), {});
        results.push({ name: 'switch fixture without timer helper', expected: 0, ...read() });
        window.setClockSeconds = originalSetClock;

        // A delayed earlier response must not overwrite a newer half-time response.
        let resolveOld;
        fetchFixture = () => new Promise(resolve => { resolveOld = resolve; });
        const oldRequest = fetchAndApplyFixtureData(987654, { silent: true });
        await poll(fixture('HT', 45));
        resolveOld(fixture('FT', 90));
        await oldRequest;
        results.push({ name: 'stale response ignored', expected: 2700, ...read() });
        syncRunningClockToNow(Date.now() + 10000);
        results.push({ name: 'stopped clock stays fixed', expected: 2700, ...read() });
        return { results, settingsPreserved, livePreserved, manualPreserved, sameFixtureRefreshPreserved };
      } finally {
        fetchFixture = originalFetch;
        persist = originalPersist;
        window.setClockSeconds = originalSetClock;
        clearPolling();
        pauseClockTimer();
      }
    });
    for (const result of results.results) {
      assert.equal(result.seconds, result.expected, result.name);
      assert.equal(result.running, false, result.name);
      assert.equal(result.lastTick, 0, result.name);
      assert.equal(result.clock, `${String(result.expected / 60).padStart(2, '0')}:00`, result.name);
      if (result.expectedHalf) assert.equal(result.half, result.expectedHalf, result.name);
      if (result.expectedMarker) {
        assert(result.markers.includes(result.expectedMarker), `${result.name}: ${result.markers}`);
        assert(!result.markers.includes('풀타임'), `${result.name}: BT is not FT`);
      }
      assert.deepEqual(result.saved, { seconds: result.expected, running: false }, result.name);
    }
    assert(results.settingsPreserved, 'settings must preserve manual clock edits');
    assert(results.livePreserved.every(Boolean), 'live polling must preserve running clocks');
    assert(results.manualPreserved, 'manual mode must skip fixture updates');
    assert(results.sameFixtureRefreshPreserved, 'manual refresh of the same live fixture must preserve the clock');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${results.results.length} fixture clock cases, rendered/persisted values, live polling, manual refresh, manual mode, settings reapply and stale response handling.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
