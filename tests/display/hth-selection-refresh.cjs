const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1440, height: 900 } });
    await page.evaluate(() => {
      activatePage('main-small');
      window.testEvents = [{ time: { elapsed: 10 }, team: { id: 1 }, player: { id: 100, name: 'Player' }, type: 'Goal', detail: 'Normal Goal' }];
      fetchFixture = async id => ({ matchInfo: { fixtureId: id, status: 'FT', elapsed: 90, homeTeamId: 1, awayTeamId: 2, homeTeamName: 'Home', awayTeamName: 'Away', homeScore: 1, awayScore: 0 }, events: structuredClone(window.testEvents), playerStats: [], homeInjuries: [], awayInjuries: [] });
      setFixtureId('100');
      document.getElementById('panel-fixture-load-btn').click();
    });
    await page.waitForFunction(() => window._eventsLastData?.events?.length === 1);
    await page.evaluate(() => { clearPolling(); hthRenderStatus('상대전적'); hthSetMode('hth'); });
    for (const addEvent of [false, true]) {
      await page.evaluate(addEvent => {
        if (addEvent) window.testEvents.push({ ...window.testEvents[0], time: { elapsed: 20 }, type: 'Card', detail: 'Yellow Card' });
        document.getElementById('panel-fixture-load-btn').click();
      }, addEvent);
      await page.waitForFunction(count => window._eventsLastData?.events?.length === count, addEvent ? 2 : 1);
      // 동일한 이벤트를 다시 조회한 경우에도 화면 반영까지 기다린다.
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => _hthState.mode), 'hth');
      assert.equal(await page.locator('.lp-events-s [data-hth-panel]').evaluate(el => el.style.display), '');
      assert.equal(await page.locator('.lp-events-s [data-events-panel]').evaluate(el => el.style.display), 'none');
    }
    await page.evaluate(() => hthSetMode('events'));
    assert.equal(await page.locator('.lp-events-s [data-events-panel]').evaluate(el => el.style.display), '');
    const automaticModes = await page.evaluate(() => {
      hthReset();
      hthSetMode('hth', { automatic: true });
      hthAutoSwitch([]);
      const before = _hthState.mode;
      hthAutoSwitch(window.testEvents);
      const after = _hthState.mode;
      hthSetMode('hth', { automatic: true });
      hthSetMode('hth');
      hthAutoSwitch(window.testEvents);
      return [before, after, _hthState.mode];
    });
    assert.deepEqual(automaticModes, ['hth', 'events', 'hth']);
    console.log('PASS manual HTH selection survives repeated and new events; manual return works');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
