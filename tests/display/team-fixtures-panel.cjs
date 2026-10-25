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
    assert.equal(await panel.locator('.tf-body').evaluate(el => getComputedStyle(el).overflowY === 'auto' && el.clientHeight > 0), true);
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
    await page.waitForFunction(() => calls.length === 6);
    assert.equal(await page.evaluate(() => calls.length), 6);
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
    // 확대해도 두 뷰의 5경기와 이전/다음 페이지 조작을 모두 유지한다.
    for (const view of ['main-big', 'main-small']) {
      await page.evaluate(view => {
        activatePage(view);
        if (view === 'main-big') lpStatShowTeamFixturesPage(0);
        else teamFixturesShow(testFixture);
      }, view);
      const current = view === 'main-big' ? bigPanel : panel;
      await page.waitForFunction(selector => document.querySelectorAll(`${selector} .tf-card`).length === 10,
        view === 'main-big' ? '.lp-stat' : '.lp-events-s');
      await current.locator('.ev-title').click();
      const popup = page.locator('.panel-font-popover');
      assert.equal(await popup.getAttribute('data-category'), 'teamFixturesNameSize');
      await popup.locator('input').evaluate(input => {
        input.value = '21'; input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.keyboard.press('Escape');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('input[data-settings-slider="teamFixturesNameSize"]').inputValue(), '21');
      await checkHalves(current);
      const cards = await current.locator('.tf-card').evaluateAll(cards => cards.map(card => {
        const name = card.querySelector('.tf-opponent');
        const score = card.querySelector('.tf-score');
        return { font: parseFloat(getComputedStyle(name).fontSize),
          nameBottom: name.getBoundingClientRect().bottom, scoreTop: score.getBoundingClientRect().top,
          reachable: card.offsetLeft + card.offsetWidth <= card.closest('.tf-content').scrollWidth + 1 };
      }));
      for (const card of cards) {
        assert(card.font > 13, JSON.stringify(card));
        assert(card.nameBottom <= card.scoreTop + 1, JSON.stringify(card));
        assert(card.reachable, JSON.stringify(card));
      }
      await current.getByTitle('다음 페이지', { exact: true }).click();
      await page.waitForFunction(selector => document.querySelector(`${selector} .ev-title`)?.textContent === '다음 5경기',
        view === 'main-big' ? '.lp-stat [data-team-fixtures-panel]' : '.lp-events-s [data-team-fixtures-panel]');
      await page.waitForFunction(selector => document.querySelectorAll(`${selector} .tf-card`).length === 10,
        view === 'main-big' ? '.lp-stat' : '.lp-events-s');
      assert.equal(await current.locator('.tf-card').count(), 10);
      assert(await current.locator('.tf-content').evaluateAll(areas => areas.every(area => getComputedStyle(area).overflow === 'visible')),
        'team sections must not create independent scroll areas');
      await page.screenshot({ path: `screenshots/tests/team-fixtures-font-${view}.png` });
      const scrolling = await current.locator('.tf-body').evaluateAll(areas => areas.map(area => {
        area.scrollTop = area.scrollHeight;
        area.scrollLeft = area.scrollWidth;
        return { top: area.scrollTop, left: area.scrollLeft,
          total: area.scrollHeight, height: area.clientHeight,
          width: area.clientWidth, totalWidth: area.scrollWidth };
      }));
      for (const area of scrolling) {
        assert(area.height > 0);
        if (area.total > area.height + 1) assert(area.top > 0, JSON.stringify(area));
        if (area.totalWidth > area.width + 1) assert(area.left > 0, JSON.stringify(area));
      }
      await current.locator('.ev-title').click();
      await popup.locator('.panel-font-reset').click();
      await page.keyboard.press('Escape');
      await current.getByTitle('이전 페이지', { exact: true }).click();
    }
    await page.evaluate(() => { activatePage('main-big'); lpStatShowTeamFixturesPage(1); });
    await page.evaluate(() => lpStatCycleNext());
    assert.equal(await bigPanel.isVisible(), false);
    await page.evaluate(() => {
      setSetting('teamFixturesNameSize', 21);
      setSetting('statCycleModeHth', 'off');
      setSetting('statsAutoSwipeSec', 2.5);
      setSetting('statCycleAuto', 'on');
      lpStatShowTeamFixturesPage(0);
    });
    await page.waitForFunction(() => {
      const body = document.querySelector('.lp-stat .tf-body');
      return _lpStatCycle.fixturesPage === 0 && body.scrollHeight > body.clientHeight && body.scrollTop > 5;
    });
    assert(await page.evaluate(() => {
      const body = _lpAuto.scrollEl;
      document.dispatchEvent(new Event('theme:colors-changed'));
      return body.isConnected && body === document.querySelector('.lp-stat .tf-body');
    }), 'rerender preserves the running scroll target');
    await page.waitForFunction(() => {
      const body = document.querySelector('.lp-stat .tf-body');
      return _lpStatCycle.fixturesPage === 0 && body.scrollTop >= body.scrollHeight - body.clientHeight - 1;
    });
    await page.waitForFunction(() => _lpStatCycle.mode === 'fixtures' && _lpStatCycle.fixturesPage === 1, null, { timeout: 6000 });
    assert.equal(await bigPanel.locator('.ev-title').innerText(), '다음 5경기');
    await page.evaluate(() => { setSetting('statCycleAuto', 'off'); setSetting('statCycleModeHth', 'on'); setSetting('teamFixturesNameSize', 11); });
    await page.evaluate(() => activatePage('main-small'));
    assert.equal(await panel.locator('.tf-result').count(), 10);
    await page.evaluate(() => { applyEventsPanel(testFixture, { animate: false }); scoreaxisStandingsUpdateSmallVisibility(); });
    assert.equal(await panel.isVisible(), true);
    await panel.locator('[data-small-panel-mode="events"]').click();
    assert.equal(await panel.isVisible(), false);
    await page.evaluate(() => { teamFixturesShow(testFixture); applyEventsPanel(null); });
    await page.waitForTimeout(50);
    assert.equal(await panel.locator('.tf-card').count(), 0);
    const shared = await page.evaluate(async () => {
      const resolvers = [];
      let count = 0;
      fetchTeamFixtures = () => {
        count++;
        return new Promise(resolve => resolvers.push(resolve));
      };
      const data = { matchInfo: { fixtureId: 400, homeTeamId: 5, awayTeamId: 6 } };
      const first = teamFixturesEnsure(data, 1);
      const second = teamFixturesEnsure(data, 1);
      const concurrentCount = count;
      resolvers.splice(0).forEach(resolve => resolve({ matches: [] }));
      await Promise.all([first, second]);
      const next = teamFixturesEnsure(data, 1);
      const refetchCount = count;
      resolvers.splice(0).forEach(resolve => resolve({ matches: [] }));
      await next;
      teamFixturesReset();
      return { concurrentCount, refetchCount };
    });
    assert.deepEqual(shared, { concurrentCount: 2, refetchCount: 4 });
    await page.evaluate(() => {
      fetchTeamFixtures = (id, period) => new Promise(resolve => { window.lateResolve = resolve; });
      teamFixturesShow({ matchInfo: { fixtureId: 300, homeTeamId: 3, awayTeamId: 4 } });
      applyEventsPanel(null);
      window.lateResolve({ matches: [{ fixtureId: 301, homeTeamId: 3, awayTeamId: 9 }] });
    });
    assert.equal(await panel.isVisible(), false);
    assert.equal(await panel.locator('.tf-card').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS team fixture cards, pages, refetch, manual selection and stale response reset');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
