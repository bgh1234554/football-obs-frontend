// 실행: node tests/display/fixture-poll-status.cjs
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
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    const result = await page.evaluate(async () => {
      state.manualMode = false;
      const data = { matchInfo: { fixtureId: '100', status: 'FT', elapsed: 90, homeTeamName: 'Home', awayTeamName: 'Away' }, events: [], playerStats: [] };
      fetchFixture = async () => data;
      await fetchAndApplyFixtureData('100');
      clearPolling();
      // 실제 새로고침 버튼의 위임 클릭 경로에서 요청 직후와 완료 후 표시를 검사한다.
      let finish;
      fetchFixture = () => new Promise(resolve => { finish = resolve; });
      document.querySelector('.lp-force-refresh-btn').click();
      const started = $('fixture-poll-status').textContent;
      finish(data);
      await new Promise(resolve => setTimeout(resolve, 0));
      clearPolling();
      const succeeded = $('fixture-poll-status').textContent;
      // 일정의 선택 경기와 송출 경기가 달라도 마지막 조회 기록을 유지한다.
      setFixtureId('200', { persist: false });
      const visible = $('fixture-poll-status').textContent === '성공' && !$('fixture-poll-match').hidden;
      fetchFixture = async () => { throw new Error('의도한 조회 실패'); };
      await fetchAndApplyFixtureData('100', { silent: true });
      clearPolling();
      const failed = $('fixture-poll-status').textContent;
      return { started, succeeded, visible, failed };
    });
    assert.deepEqual(result, { started: '조회 중', succeeded: '성공', visible: true, failed: '실패' });
    const overlapping = await page.evaluate(async () => {
      const originalRecord = recordRecentFixture;
      const originalFetch = fetchFixture;
      let finish, newer, inProgress;
      const data = { matchInfo: { fixtureId: '100', status: 'FT', elapsed: 90, homeTeamName: 'Home', awayTeamName: 'Away' }, events: [], playerStats: [] };
      try {
        fetchFixture = async () => data;
        recordRecentFixture = () => {
          fetchFixture = () => new Promise(resolve => { finish = resolve; });
          newer = fetchAndApplyFixtureData('100', { silent: true });
          inProgress = lastFixturePoll;
        };
        await fetchAndApplyFixtureData('100');
        const preserved = lastFixturePoll === inProgress && $('fixture-poll-status').textContent === '조회 중';
        finish(data);
        await newer;
        return { preserved, status: lastFixturePoll.status, sameTime: lastFixturePoll.at === inProgress.at };
      } finally {
        recordRecentFixture = originalRecord;
        fetchFixture = originalFetch;
        clearPolling();
      }
    });
    assert.deepEqual(overlapping, { preserved: true, status: '성공', sameTime: true });
    // 화면 프레임 처리가 밀린 동안 여러 응답이 와도 DOM은 최신 데이터를 유지해야 한다.
    const delayedFrames = await page.evaluate(async () => {
      const originalRaf = window.requestAnimationFrame;
      const originalFetch = fetchFixture;
      const frames = [];
      try {
        window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
        for (const [status, score] of [['2H', 1], ['2H', 2], ['FT', 3]]) {
          fetchFixture = async () => ({
            matchInfo: { fixtureId: '100', status, elapsed: 90, homeScore: score, awayScore: 0, homeTeamName: 'Home', awayTeamName: 'Away' },
            events: [{ type: 'Goal', detail: 'Normal Goal', elapsed: 89, side: 'home', playerName: `최신득점자${score}`, playerId: score }], playerStats: []
          });
          await fetchAndApplyFixtureData('100', { silent: true });
          clearPolling();
        }
        const snapshot = () => ({
          score: $('homeScore').textContent,
          status: _lastFixtureData.matchInfo.status,
          lineupStatus: lineupPanelState.lastFixture.matchInfo.status,
          eventStatus: window._eventsLastData.matchInfo.status,
          statsStatus: statsLastFixtureData.matchInfo.status,
          latestEvent: [...document.querySelectorAll('[data-events-panel]')].every(panel => panel.textContent.includes('최신득점자3'))
        });
        const before = snapshot();
        // 복귀 때 실행되는 예전 프레임 콜백이 최신 점수·이벤트를 되돌리는지도 검사한다.
        for (let pass = 0; pass < 3; pass++) {
          const batch = frames.splice(0);
          batch.forEach(callback => callback(performance.now()));
        }
        return { before, after: snapshot() };
      } finally {
        window.requestAnimationFrame = originalRaf;
        fetchFixture = originalFetch;
        clearPolling();
      }
    });
    const latest = { score: '3', status: 'FT', lineupStatus: 'FT', eventStatus: 'FT', statsStatus: 'FT', latestEvent: true };
    assert.deepEqual(delayedFrames, { before: latest, after: latest });
    await page.evaluate(() => {
      document.body.classList.add('sidebar-open');
      setFixtureId('100');
      lastFixturePoll = { fixtureId: '100', at: Date.now(), status: '성공' };
      renderLastFixturePoll();
    });
    await page.waitForTimeout(250);
    const fits = await page.evaluate(() => {
      const card = document.querySelector('.fixture-poll-card').getBoundingClientRect();
      return ['fixture-poll-clock', 'fixture-poll-status'].every(id => {
        const rect = document.getElementById(id).getBoundingClientRect();
        return rect.left >= card.left - 1 && rect.right <= card.right + 1 && rect.height < 30;
      });
    });
    assert.equal(fits, true, '시각과 상태 배지가 메뉴 너비 안에서 한 줄로 표시되어야 한다');
    if (process.argv.includes('--screenshot')) {
      await page.locator('#sidebarNav').screenshot({ path: path.join(process.env.TEMP, 'fixture-poll-sidebar.png') });
    }
    assert.deepEqual(errors, []);
    console.log('PASS manual refresh, success/failure, preview selection and sidebar layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
