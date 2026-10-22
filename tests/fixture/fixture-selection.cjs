// 실행: node tests/fixture/fixture-selection.cjs
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
    const widgetRequests = [];
    const fixtureRequests = [];
    const widgetUrl = 'https://obs-scoreline-overlay.b-cdn.net/fixtures?date=2026-10-23&timezone=Asia%2FSeoul';
    const loadedFixture = JSON.parse(fs.readFileSync(path.join(root, 'json/juveparma.json'), 'utf8').replace(/^\uFEFF/, ''));
    loadedFixture.matchInfo = { ...loadedFixture.matchInfo, fixtureId: '1581547', status: 'FT', kickoffAt: '2020-01-01T00:00:00Z' };
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'widgets.api-sports.io') return route.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'window.testWidgetFetch = window.fetch;' });
      if (['obs-scoreline-overlay.b-cdn.net', 'alternate-widget.example'].includes(url.hostname)) {
        widgetRequests.push(url.href);
        return route.fulfill({ json: { results: 1, response: [{ fixture: { id: 1581547 } }] }, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.hostname === 'football-obs-backend.onrender.com') {
        fixtureRequests.push(url.pathname);
        return route.fulfill({ json: loadedFixture, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
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
      // 일정에서 다른 경기를 미리보기해도 실제 송출 경기의 폴링 시각은 계속 보여야 한다.
      const pollTime = document.getElementById('fixture-last-polled').textContent;
      if (!pollTime.includes('성공')) throw new Error(`폴링 성공 시각 누락: ${pollTime}`);
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
      const afterPending = { selected: currentFixtureId, recent: lastSeenFixtureId, active: activeFixtureId };
      const displayed = selectedEls.map(el => el.textContent);
      const pendingEmpty = fetchAndApplyFixtureData('500');
      widget.setAttribute('data-game-id', '600');
      await new Promise(resolve => setTimeout(resolve, 0));
      finish(null);
      await pendingEmpty;
      const afterChangedEmpty = { selected: currentFixtureId, recent: lastSeenFixtureId, displayed: selectedEls.map(el => el.textContent) };
      fetchFixture = async () => null;
      await fetchAndApplyFixtureData('600');
      const afterUnchangedEmpty = { selected: currentFixtureId, displayed: selectedEls.map(el => el.textContent) };
      return { afterPoll, recentInput, requested, afterPending, displayed, afterChangedEmpty, afterUnchangedEmpty };
    });
    assert.deepEqual(result.afterPoll, { selected: '200', recent: '200', active: '100', saved: '100' });
    assert.equal(result.recentInput, '200');
    assert.deepEqual(result.requested, ['200']);
    assert.deepEqual(result.afterPending, { selected: '400', recent: '400', active: '300' });
    assert.ok(result.displayed.every(id => id === '400'));
    assert.equal(result.afterChangedEmpty.selected, '600');
    assert.equal(result.afterChangedEmpty.recent, '600');
    assert.ok(result.afterChangedEmpty.displayed.every(id => id === '600'));
    assert.equal(result.afterUnchangedEmpty.selected, null);
    assert.ok(result.afterUnchangedEmpty.displayed.every(id => id === '-'));
    assert.deepEqual(errors, []);
    console.log('PASS: polling, recent selection, load button, and late responses preserve the latest fixture selection');

    // 실제 통신 함수를 복원한 새 화면에서 위젯 차단과 불러오기 버튼을 함께 확인한다.
    await page.reload();
    widgetRequests.length = 0; fixtureRequests.length = 0;
    await page.evaluate(async url => {
      activatePage('schedule');
      await testWidgetFetch(new URL(url));
      const preview = document.createElement('api-sports-widget');
      preview.dataset.type = 'game'; preview.dataset.gameId = '1581547';
      gameTarget.append(preview);
    }, widgetUrl);
    await page.waitForFunction(() => !document.getElementById('panel-fixture-load-btn').disabled);
    await page.locator('#panel-fixture-load-btn').click();
    await page.waitForFunction(() => activeFixtureId === '1581547' && !_mainShowBtnBusy);
    assert.ok(fixtureRequests.includes('/api/fixtures/1581547'), 'load button still reaches the backend after leaving schedule');
    assert.equal(await page.evaluate(() => document.getElementById('page-schedule').classList.contains('active')), false);
    const beforeBlocked = widgetRequests.length;
    const cached = await page.evaluate(async url => {
      const bodies = [];
      const existingScore = state.homeScore;
      for (const tab of ['main-small', 'main-big', 'theme', 'tactics', 'about']) {
        // 기존 경기를 유지한 채 일정에 들어갔다가 새 경기 로딩 없이 각 화면으로 돌아온다.
        activatePage('schedule');
        await testWidgetFetch(url);
        activatePage(tab);
        bodies.push(await (await testWidgetFetch(new Request(url))).json());
        if (activeFixtureId !== '1581547' || state.homeScore !== existingScore) throw new Error('기존 경기 상태가 바뀌었습니다.');
      }
      return bodies.every(body => body.response[0]?.fixture.id === 1581547);
    }, widgetUrl);
    assert.equal(cached, true, 'inactive widget preserves its loaded data');
    assert.equal(widgetRequests.length, beforeBlocked + 5, 'only the five schedule visits send requests; all return tabs block widget traffic without a new load');
    await page.evaluate(async url => { activatePage('schedule'); await testWidgetFetch(url); }, widgetUrl);
    assert.equal(widgetRequests.length, beforeBlocked + 6, 'returning to schedule resumes widget requests');
    await page.locator('#panel-fixture-load-btn').click();
    await page.waitForFunction(() => !_mainShowBtnBusy);
    assert.equal(fixtureRequests.filter(url => url === '/api/fixtures/1581547').length, 2, 'load button works again after returning to schedule');
    const beforeHidden = widgetRequests.length;
    const hiddenFixture = await page.evaluate(async url => {
      activatePage('schedule');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      try {
        await testWidgetFetch(url);
        // 브라우저 숨김 차단도 위젯에만 적용하고 백엔드 경기 갱신은 유지한다.
        return (await fetchFixture('1581547')).matchInfo.fixtureId;
      } finally { delete document.hidden; }
    }, widgetUrl);
    assert.equal(widgetRequests.length, beforeHidden, 'hidden browser tab blocks widget even when schedule is selected');
    assert.equal(hiddenFixture, '1581547', 'backend fixture fetch remains available in a hidden browser tab');
    await page.evaluate(async url => { await testWidgetFetch(url); }, widgetUrl);
    assert.equal(widgetRequests.length, beforeHidden + 1, 'visible schedule resumes requests after browser tab return');
    const beforeConfigChange = widgetRequests.length;
    await page.evaluate(async () => {
      const config = document.querySelector('api-sports-widget[data-type="config"]');
      const original = config.getAttribute('data-url-football');
      try {
        config.setAttribute('data-url-football', 'https://alternate-widget.example/');
        activatePage('main-small');
        await testWidgetFetch('https://alternate-widget.example/fixtures?date=2026-10-23');
        activatePage('schedule');
        await testWidgetFetch('https://alternate-widget.example/fixtures?date=2026-10-23');
      } finally { config.setAttribute('data-url-football', original); }
    });
    assert.equal(widgetRequests.length, beforeConfigChange + 1, 'blocking follows the widget configured API URL');
    // 5분을 넘겨 복귀하면 실제 새로고침한 뒤에도 일정 화면과 불러오기가 동작해야 한다.
    await Promise.all([
      page.waitForEvent('load'),
      page.evaluate(() => {
        activatePage('main-small');
        const now = Date.now();
        Date.now = () => now + 301000;
        activatePage('schedule');
      }),
    ]);
    await page.waitForFunction(() => document.getElementById('page-schedule').classList.contains('active'));
    await page.waitForFunction(() => !document.getElementById('panel-fixture-load-btn').disabled);
    const beforeReloadLoad = fixtureRequests.length;
    await page.locator('#panel-fixture-load-btn').click();
    await page.waitForFunction(() => activeFixtureId === '1581547' && !_mainShowBtnBusy);
    assert.ok(fixtureRequests.length > beforeReloadLoad, 'load button works after stale schedule reload');
    assert.deepEqual(errors, []);
    console.log('PASS: schedule widget requests stop outside schedule while selection, backend loading and return loading work');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
