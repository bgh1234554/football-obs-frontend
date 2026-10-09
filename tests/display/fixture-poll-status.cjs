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
        return rect.left >= card.left && rect.right <= card.right && rect.height < 30;
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
