// Run: node tests/display/stats-height.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const near = (a, b, label) => assert(Math.abs(a - b) < 1.1, `${label}: ${a} vs ${b}`);

async function seed(page, mode) {
  await page.evaluate(mode => {
    activatePage(mode);
    setSetting('bigPanelLinked', 'on');
    const keys = STATS_CONFIG.order.filter(key => !['expectedGoals', 'goalsPrevented'].includes(key));
    applyStatsPanel({ teamStats: ['home', 'away'].map((side, i) => ({
      side, ...Object.fromEntries(keys.map(key => [key, i + 1])),
    })) });
    applyStoredBigPanelHeights();
    applySmallStatsHeight();
  }, mode);
  await frames(page);
}

async function read(page) {
  return page.evaluate(() => {
    const outer = document.querySelector('.page.active .lp-stat, .page.active .lp-stat-s');
    const body = outer.querySelector('[data-stat-panel]');
    const rows = [...body.querySelectorAll('.st-row')];
    const box = body.querySelector('.st-page').getBoundingClientRect();
    return {
      height: getDisplayLayoutRect(outer).height,
      count: rows.length, pages: body.querySelectorAll('.st-dot').length,
      clipped: rows.some(row => row.getBoundingClientRect().bottom > box.bottom + 0.5),
      saved: localStorage.getItem('obs.smallLayout.statsHeightRatio.v1'),
    };
  });
}

async function drag(page, selector, delta, cancel = false) {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const scale = await page.evaluate(() => document.body.getBoundingClientRect().width / document.body.offsetWidth);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + delta * scale, { steps: 4 });
  if (cancel) await page.locator(selector).dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await frames(page);
}

async function checkScrollingAndOwnGoals(page) {
  await seed(page, 'main-small');
  await drag(page, '.lp-small-stats-height-resize', -180);
  await page.evaluate(() => {
    const fixture = {
      matchInfo: { fixtureId: 'own-goal-test', homeTeamId: 1, awayTeamId: 2, homeTeamName: '홈', awayTeamName: '원정' },
      events: Array.from({ length: 20 }, (_, i) => ({ type: 'Goal', detail: 'Normal Goal', elapsed: i + 1, playerId: 101, playerName: '득점 선수', teamId: 1, side: 'home' })),
    };
    applyEventsPanel(fixture, { animate: false });
    applyHthPanel({ matches: Array.from({ length: 10 }, () => ({ date: '2025-01-01', homeTeamName: '홈', awayTeamName: '원정', homeScore: 2, awayScore: 1 })) }, fixture);
  });
  for (const mode of ['events', 'hth']) {
    await page.evaluate(mode => { _hthState.mode = mode; hthUpdateVisibility(); }, mode);
    await frames(page);
    const metrics = await page.evaluate(mode => {
      const list = document.querySelector(`.lp-events-s [data-${mode}-panel] .ev-list`);
      list.scrollTop = list.scrollHeight;
      return { overflow: list.scrollHeight > list.clientHeight, scrolled: list.scrollTop > 0,
        width: getComputedStyle(list).scrollbarWidth, display: getComputedStyle(list, '::-webkit-scrollbar').display };
    }, mode);
    assert.deepEqual(metrics, { overflow: true, scrolled: true, width: 'thin', display: 'block' }, mode);
    // A short list uses overflow:auto, so there is no scrollbar when everything fits.
    const fits = await page.evaluate(mode => {
      const list = document.querySelector(`.lp-events-s [data-${mode}-panel] .ev-list`);
      while (list.children.length > 1) list.lastElementChild.remove();
      return list.scrollHeight <= list.clientHeight;
    }, mode);
    assert(fits, `${mode} short list fits`);
  }
  await page.evaluate(() => {
    _hthState.mode = 'events'; hthUpdateVisibility();
    resetAllLayoutSizes();
    const lineup = offset => ({ formation: '4-3-3', startXi: Array.from({ length: 11 }, (_, i) => ({ playerId: offset + i, name: `선수 ${offset + i}`, number: i + 1, grid: `${i === 0 ? 1 : i < 5 ? 2 : i < 8 ? 3 : 4}:${i === 0 ? 1 : i < 5 ? i : i < 8 ? i - 4 : i - 7}`, pos: i === 0 ? 'G' : 'M' })), substitutes: [{ playerId: offset + 11, name: '교체 선수', number: 12 }] });
    const fixture = { matchInfo: { fixtureId: 'own-goal-test', homeTeamId: 1, awayTeamId: 2, homeTeamName: '홈', awayTeamName: '원정' }, homeLineup: lineup(100), awayLineup: lineup(200), events: [
      { type: 'Goal', detail: 'Own Goal', playerId: 201, playerName: '선수 201', side: 'home', teamId: 1, elapsed: 32 },
      { type: 'subst', playerId: 201, assistId: 211, playerName: '선수 201', assistName: '교체 선수', side: 'away', teamId: 2, elapsed: 80 },
    ], playerStats: [], homeInjuries: [], awayInjuries: [] };
    setSetting('subReflect', 'off');
    applyLineupPanels(fixture);
  });
  await frames(page);
  assert.equal(await page.locator('.layout-small .dp-lineup-node[data-player-id="201"] .dp-node-count-og').count(), 1, 'own goal initially on pitch');
  await page.evaluate(() => setSetting('subReflect', 'on'));
  await frames(page);
  const row = page.locator('#benchPanel .dp-item[data-player-id="201"]');
  assert.equal(await row.locator('.dp-sub-marker.is-out').count(), 1, 'scorer moved to bench');
  assert.equal(await row.locator('.dp-event-own-goal-count').textContent(), '1');
  assert.equal(await row.locator('.dp-event-own-goal-count').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(211, 47, 47)');
  assert.equal(await page.locator('.layout-big [data-bench-away-panel] .dp-item[data-player-id="201"] .dp-event-own-goal').count(), 1, 'big cycle roster uses own goal badge');
  const mixed = await page.evaluate(() => {
    const el = document.createElement('div');
    el.innerHTML = lpBuildGoalsAssistsHtml({ goals: [{}], ownGoals: [{}, {}], assists: [{}] });
    return { normal: el.querySelectorAll('.dp-event-goal:not(.dp-event-own-goal)').length,
      own: el.querySelector('.dp-event-own-goal-count').textContent,
      assists: el.querySelectorAll('.dp-event-assist').length };
  });
  assert.deepEqual(mixed, { normal: 1, own: '2', assists: 1 });
  console.log('PASS: event/HTH overflow scrollbars; own goal survives substitution in both bench views');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      const page = await browser.newPage({ viewport: { width: 1920 / dpr, height: 960 / dpr }, deviceScaleFactor: dpr });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'localhost') return route.abort();
        const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
      });
      await page.goto('http://localhost/');
      for (const mode of ['main-big', 'main-small']) {
        await seed(page, mode);
        let current = await read(page);
        assert.equal(current.count, 9, `${mode} default: ${JSON.stringify(current)}`);
        assert.equal(current.pages, 2);
        assert(!current.clipped, `${mode} rows fit`);
        await page.locator('.page.active [data-stat-panel] .st-arrow-next').click();
        assert.equal((await read(page)).count, 8, '17 stats split into 9 + 8');
        await page.locator('.page.active [data-stat-panel] .st-arrow-prev').click();
        const intervals = await page.evaluate(() => {
          const captured = [];
          const original = window.setInterval;
          window.setInterval = (callback, ms) => { captured.push(ms); return original(callback, ms); };
          try {
            setSetting('statsAutoSwipeSec', 9);
            setSetting('statsAutoSwipe', 'on');
            const panel = document.querySelector('.page.active [data-stat-panel]');
            stRenderPanel(panel, statsLastFixtureData);
            const first = captured.at(-1);
            panel.querySelector('.st-arrow-next').click();
            const second = captured.at(-1);
            setSetting('statsAutoSwipe', 'off');
            panel.querySelector('.st-arrow-prev').click();
            return [first, second];
          } finally { window.setInterval = original; }
        });
        assert.deepEqual(intervals, [9000, 8000], '9-item timing baseline');
      }
      const handle = '.lp-small-stats-height-resize';
      const initial = await read(page);
      await drag(page, handle, 80);
      let current = await read(page);
      near(current.height, initial.height - 80, 'downward drag shrinks stats');
      assert(current.count < 9 && !current.clipped);
      assert(current.saved);
      const resized = current;
      await page.reload();
      await seed(page, 'main-small');
      near((await read(page)).height, resized.height, 'reload restores height');
      await drag(page, handle, -50, true);
      near((await read(page)).height, resized.height, 'cancel restores height');
      assert.equal((await read(page)).saved, resized.saved);
      await page.locator(handle).dblclick();
      near((await read(page)).height, initial.height, 'double click restores 9 rows');
      assert.equal((await read(page)).count, 9);
      assert.equal((await read(page)).saved, null);
      await page.locator(handle).press('ArrowUp');
      near((await read(page)).height, initial.height + 10, 'keyboard expands stats');
      await page.evaluate(() => resetAllLayoutSizes());
      await frames(page);
      assert.equal((await read(page)).count, 9);
      assert.equal((await read(page)).saved, null);
      await drag(page, handle, -5000);
      assert(!(await read(page)).clipped, 'large drag remains bounded');
      await page.locator(handle).press('Enter');
      await seed(page, 'main-big');
      const big = await read(page);
      await drag(page, '.lp-big-stat-edge-top', 80);
      near((await read(page)).height, big.height - 80, 'big panel drag');
      await page.locator('.lp-big-stat-edge-top').dblclick();
      await frames(page);
      assert.equal((await read(page)).count, 9, 'big reset');
      await page.evaluate(() => { setSetting('bigPanelLinked', 'off'); applyStoredBigPanelHeights(); stRerenderActivePanels(); });
      assert.equal((await read(page)).count, 9, 'independent big default');
      if (dpr === 1) await checkScrollingAndOwnGoals(page);
      assert(errors.every(message => message === 'jQuery is not defined'), errors.join('\n'));
      console.log(`PASS ${dpr * 100}%: 9/8 rows, timing, big/small drag, bounds, cancellation, persistence, reset`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
