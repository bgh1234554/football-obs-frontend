require('../tactics/helpers');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      activatePage('main-small');
      window.testFixture = { matchInfo: { fixtureId: 100, homeTeamId: 1, awayTeamId: 2, homeTeamName: '크리스탈 팰리스', homeTeamNameShort: '팰리스', awayTeamName: '노팅엄 포레스트', awayTeamNameShort: '노팅엄' }, events: [] };
      window._eventsLastData = window.testFixture;
      window.calls = [];
      fetchTeamFixtures = async (id, period) => {
        window.calls.push([id, period]);
        const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="17" fill="#60a5fa"/></svg>');
        const matches = Array.from({ length: 5 }, (_, i) => ({ fixtureId: 200 + i, status: period === 'last' ? 'FT' : 'NS', homeTeamId: i % 2 ? 99 : id, awayTeamId: i % 2 ? id : 99, homeTeamName: '맨체스터 유나이티드', homeTeamNameShort: '맨유', awayTeamName: '울버햄프턴 원더러스', awayTeamNameShort: '울브스', homeTeamLogo: logo, awayTeamLogo: logo, homeScore: period === 'last' ? i % 3 : null, awayScore: period === 'last' ? 1 : null, date: '2026-10-10T18:00:00Z' }));
        if (id === 2 && period === 'last') Object.assign(matches[0], { homePenaltyScore: 4, awayPenaltyScore: 3 });
        // 선택 경기 ID와 달라도 오늘 경기는 최근 목록에서 제외해야 한다.
        if (period === 'last') matches.unshift({ ...matches[0], fixtureId: 999, date: new Date().toISOString(), homeScore: 99, awayScore: 99 });
        return { matches };
      };
      applyEventsPanel(window.testFixture, { animate: false });
    });
    const panel = page.locator('.lp-events-s [data-team-fixtures-panel]');
    await page.locator('.lp-events-s [data-events-panel] [data-small-panel-mode="fixtures"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.lp-events-s .tf-card').length === 10);
    assert.equal(await panel.isVisible(), true);
    assert.equal(await panel.locator('.tf-result').count(), 10);
    assert.equal(await panel.locator('.hth-score').filter({ hasText: '99' }).count(), 0);
    assert.equal(await panel.locator('.tf-loss').count() > 0, true);
    await page.evaluate(() => {
      const el = document.querySelector('.lp-events-s');
      el.style.height = '400px';
      el.style.flex = '0 0 400px';
    });
    assert.equal(await panel.locator('.tf-body').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true);
    const checkHalves = async locator => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await locator.locator('.tf-team').evaluateAll(teams => teams.map(team => {
        const rect = team.getBoundingClientRect();
        const label = team.querySelector('.dp-side-name').getBoundingClientRect();
        return { height: rect.height, labelOffset: label.top - rect.top, labelHeight: label.height };
      }));
      assert(Math.abs(geometry[0].height - geometry[1].height) < 1, JSON.stringify(geometry));
      assert(Math.abs(geometry[0].labelOffset - geometry[1].labelOffset) < 1, JSON.stringify(geometry));
      assert.equal(geometry[0].labelHeight, geometry[1].labelHeight);
      console.log('Equal halves:', geometry.map(item => item.height));
    };
    await checkHalves(panel);
    await page.evaluate(() => setSetting('teamName', 'short'));
    assert.equal(await panel.locator('.dp-side-name').first().innerText(), '팰리스');
    assert.equal(await panel.locator('.tf-opponent').first().innerText(), '울브스 (H)');
    await page.evaluate(() => setSetting('teamName', 'long'));
    assert.equal(await panel.locator('.dp-side-name').first().innerText(), '크리스탈 팰리스');
    await page.screenshot({ path: 'screenshots/tests/team-fixtures-preview.png' });
    await panel.getByTitle('다음 페이지', { exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.lp-events-s .tf-card').length === 10 && document.querySelectorAll('.lp-events-s .tf-result').length === 0);
    assert.equal(await panel.locator('.tf-result').count(), 0);
    assert.equal(await panel.locator('.tf-score').first().innerText(), '03:00');
    await checkHalves(panel);
    await panel.getByTitle('이전 페이지', { exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.lp-events-s .tf-result').length === 10);
    assert.equal(await page.evaluate(() => calls.length), 4);
    await page.evaluate(() => { activatePage('main'); lpStatShowTeamFixturesPage(0); });
    const bigPanel = page.locator('.lp-stat [data-team-fixtures-panel]');
    await page.waitForFunction(() => document.querySelectorAll('.lp-stat .tf-result').length === 10);
    assert.equal(await bigPanel.isVisible(), true);
    await checkHalves(bigPanel);
    await bigPanel.getByTitle('다음 페이지', { exact: true }).click();
    assert.equal(await page.evaluate(() => _lpStatCycle.mode), 'fixtures');
    assert.equal(await page.evaluate(() => lpStatAvailableModes().filter(mode => mode === 'fixtures').length), 1);
    assert.match(await page.locator('.lp-stat-cycle-btn').getAttribute('title'), /최근·예정 경기/);
    assert.equal(await bigPanel.locator('.tf-result').count(), 0);
    await checkHalves(bigPanel);
    await page.screenshot({ path: 'screenshots/tests/team-fixtures-big-preview.png' });
    await page.evaluate(() => lpStatCycleNext());
    assert.equal(await bigPanel.isVisible(), false);
    await page.evaluate(() => {
      setSetting('statCycleModeHth', 'off');
      setSetting('statsAutoSwipeSec', 2.5);
      setSetting('statCycleAuto', 'on');
      lpStatShowTeamFixturesPage(0);
    });
    await page.waitForFunction(() => _lpStatCycle.mode === 'fixtures' && _lpStatCycle.fixturesPage === 1, null, { timeout: 6000 });
    assert.equal(await bigPanel.locator('.ev-title').innerText(), '다음 5경기');
    await page.evaluate(() => { setSetting('statCycleAuto', 'off'); setSetting('statCycleModeHth', 'on'); });
    await page.evaluate(() => activatePage('main-small'));
    assert.equal(await panel.locator('.tf-result').count(), 10);
    await page.evaluate(() => { applyEventsPanel(testFixture, { animate: false }); scoreaxisStandingsUpdateSmallVisibility(); });
    assert.equal(await panel.isVisible(), true);
    await panel.locator('[data-small-panel-mode="events"]').click();
    assert.equal(await panel.isVisible(), false);
    await page.evaluate(() => { teamFixturesShow(testFixture); applyEventsPanel(null); });
    await page.waitForTimeout(50);
    assert.equal(await panel.locator('.tf-card').count(), 0);
    await page.evaluate(() => {
      fetchTeamFixtures = (id, period) => new Promise(resolve => { window.lateResolve = resolve; });
      teamFixturesShow({ matchInfo: { fixtureId: 300, homeTeamId: 3, awayTeamId: 4 } });
      applyEventsPanel(null);
      window.lateResolve({ matches: [{ fixtureId: 301, homeTeamId: 3, awayTeamId: 9 }] });
    });
    assert.equal(await panel.isVisible(), false);
    assert.equal(await panel.locator('.tf-card').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS team fixture cards, pages, cache, manual selection and stale response reset');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
