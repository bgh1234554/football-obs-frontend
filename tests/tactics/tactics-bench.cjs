const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('./helpers');
const fixture = require('../fixtures/1637598-lineup.json');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(data => {
      data.matchInfo.status = 'FT'; data.events = [];
      for (const side of ['home', 'away']) {
        const out = data[`${side}Lineup`].startXi[0], incoming = data[`${side}Lineup`].substitutes[0];
        data.events.push({ side, type: 'subst', detail: 'Substitution 1', elapsed: 60,
          playerId: out.playerId, playerName: out.name, assistId: incoming.playerId, assistName: incoming.name });
      }
      window.benchTestFixture = structuredClone(data);
      applyLineupPanels(data); applyTacticsTimeline(data); activatePage('tactics');
    }, structuredClone(fixture));
    await settle(page);
    const open = async side => {
      const label = page.locator(`.td-team-label-${side}`);
      if (await label.getAttribute('aria-expanded') !== 'true') await label.click();
      await settle(page);
      assert.equal(await page.locator(`#tactics-bench-${side}`).getAttribute('aria-hidden'), 'false');
      assert(await page.evaluate(side => {
        const list = document.querySelector(`#tactics-bench-${side} .td-bench-list`);
        const other = document.querySelector(`#tactics-bench-${side === 'home' ? 'away' : 'home'} .td-bench-list`);
        return getComputedStyle(list).scrollbarWidth === 'thin'
          && getComputedStyle(list).scrollbarColor === getComputedStyle(other).scrollbarColor;
      }, side), 'both benches use the same subtle scrollbar');
    };
    await open('home');
    await page.screenshot({ path: 'screenshots/tests/tactics-bench-home.png' });
    const tray = page.locator('#tactics-bench-home');
    assert.equal(await tray.locator('.td-bench-token').count(), fixture.homeLineup.substitutes.length);
    const first = tray.locator('.td-bench-token').first();
    const origin = await first.boundingBox();
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(origin.x + origin.width / 2 + 3, origin.y + origin.height / 2 + 3);
    assert.equal(await tray.evaluate(el => el.classList.contains('is-dragging-outside')), false, 'tray remains visible while dragging inside');
    const pitch = await page.locator('#tactics-pitch').boundingBox();
    await page.mouse.move(pitch.x + pitch.width / 2, pitch.y + pitch.height / 2);
    assert.equal(await tray.evaluate(el => el.classList.contains('is-dragging-outside')), true, 'tray hides after the token leaves its bounds');
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('.td-bench-ghost'));
    assert.equal(await tray.getAttribute('aria-hidden'), 'false', 'invalid drop reopens tray');
    assert.equal(await page.evaluate(() => tacticsBenchState.changes.length), 0);
    await page.waitForTimeout(320);
    await page.mouse.click(pitch.x + pitch.width / 2, pitch.y + pitch.height / 2);
    assert.equal(await tray.getAttribute('aria-hidden'), 'true', 'outside click closes the tray');
    await open('home');

    for (const side of ['home', 'away']) {
      await page.waitForTimeout(320);
      if (side === 'away') await open(side);
      const source = page.locator(`#tactics-bench-${side} .td-bench-token`).first();
      const target = page.locator(`.tactics-token[data-team="${side}"][data-idx="${side === 'home' ? 4 : 15}"]`);
      const key = await source.getAttribute('data-key');
      const targetKey = await target.evaluate(token => tacticsState.lineup[token.dataset.team].players[Number(token.dataset.idx) % 11]._benchKey);
      const before = await page.evaluate(side => JSON.parse(JSON.stringify(tacticsState[`${side}Positions`])), side);
      const from = await source.boundingBox(), to = await target.boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 }); await page.mouse.up();
      await settle(page);
      assert(await page.evaluate(({ side, key }) => tacticsState.lineup[side].players.some(player => player?._benchKey === key), { side, key }));
      assert(await page.evaluate(({ side, targetKey }) => tacticsState.lineup[side].bench.some(player => tacticsBenchPlayerKey(player) === targetKey), { side, targetKey }));
      assert.deepEqual(await page.evaluate(side => tacticsState[`${side}Positions`], side), before, 'swap preserves user positions');
      const replay = await page.evaluate(({ side, key, targetKey }) => {
        const keys = () => tacticsState.lineup[side].players.map(player => player?._benchKey || null);
        const manual = keys();
        tacticsTimelineState.currentElapsed = 60; ttApplyTimelineToTactics(60);
        const official = keys();
        const expected = buildTacticsPlayers(ttBuildFixtureAtTime(60)[`${side}Lineup`]).map(player => player?._benchKey || null);
        tacticsTimelineState.currentElapsed = 0; ttApplyTimelineToTactics(0);
        const back = keys();
        applyLineupPanels(structuredClone(benchTestFixture)); applyTacticsTimeline(structuredClone(benchTestFixture));
        return { manual, official, expected, back, refreshed: keys() };
      }, { side, key, targetKey });
      assert.deepEqual(replay.official, replay.expected, 'official incoming player takes the scheduled outgoing slot and restores the other starter');
      assert.deepEqual(replay.back, replay.manual, 'rewinding restores the manual scenario');
      assert.deepEqual(replay.refreshed, replay.manual, 'same-fixture polling preserves the manual scenario');
    }

    await open('home');
    const resetBefore = await page.evaluate(() => ({
      positions: structuredClone(tacticsState.homePositions),
      away: tacticsState.lineup.away.players.map(player => player?._benchKey || null),
      elapsed: tacticsTimelineState.currentElapsed
    }));
    await page.locator('#tactics-bench-home .td-bench-reset').click();
    const resetAfter = await page.evaluate(() => ({
      positions: tacticsState.homePositions,
      away: tacticsState.lineup.away.players.map(player => player?._benchKey || null),
      elapsed: tacticsTimelineState.currentElapsed,
      home: tacticsState.lineup.home.players.map(player => player?._benchKey || null),
      expected: buildTacticsPlayers(ttBuildFixtureAtTime(tacticsTimelineState.currentElapsed).homeLineup).map(player => player?._benchKey || null),
      remaining: tacticsBenchState.changes.map(change => change.side)
    }));
    assert.deepEqual(resetAfter.home, resetAfter.expected, 'reset restores the current official lineup');
    for (const key of ['positions', 'away', 'elapsed']) assert.deepEqual(resetAfter[key], resetBefore[key], `reset preserves ${key}`);
    assert(resetAfter.remaining.every(side => side === 'away'));
    assert(await page.locator('#tactics-bench-home .td-bench-reset').isDisabled());
    const icons = await page.locator('#tactics-bench-home .td-bench-actions button').evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect(), icon = button.querySelector('svg').getBoundingClientRect();
      return { y: box.y, height: box.height, dx: icon.x + icon.width / 2 - box.x - box.width / 2,
        dy: icon.y + icon.height / 2 - box.y - box.height / 2 };
    }));
    assert(Math.abs(icons[0].y - icons[1].y) < 1 && icons[0].height === icons[1].height);
    assert(icons.every(icon => Math.abs(icon.dx) < 1 && Math.abs(icon.dy) < 1));

    await page.evaluate(() => tacticsToggleOrientation()); await settle(page);
    for (const side of ['home', 'away']) {
      await open(side);
      await page.evaluate(() => setSetting('tacticsNameSize', 21));
      await settle(page);
      const geometry = await page.evaluate(side => {
        tacticsBenchLayout();
        const pitch = document.getElementById('tactics-pitch').getBoundingClientRect();
        const panel = document.getElementById(`tactics-bench-${side}`).getBoundingClientRect();
        const list = document.querySelector(`#tactics-bench-${side} .td-bench-list`);
        return { inside: panel.left >= pitch.left - 1 && panel.right <= pitch.right + 1 && panel.top >= pitch.top - 1 && panel.bottom <= pitch.bottom + 1,
          lower: panel.top > pitch.top + pitch.height / 2,
          extraHeight: list.scrollHeight - list.clientHeight, overflowY: getComputedStyle(list).overflowY };
      }, side);
      assert(geometry.inside, JSON.stringify({ side, geometry }));
      assert.equal(geometry.lower, side === 'home');
      assert(geometry.extraHeight <= 1, JSON.stringify(geometry));
      assert.equal(geometry.overflowY, 'hidden');
      await page.screenshot({ path: `screenshots/tests/tactics-bench-vertical-${side}.png` });
      await page.keyboard.press('Escape');
    }
    await page.screenshot({ path: 'screenshots/tests/tactics-bench-vertical.png' });
    await page.evaluate(() => {
      const next = structuredClone(benchTestFixture); next.matchInfo.fixtureId++;
      applyLineupPanels(next); applyTacticsTimeline(next);
    });
    assert.equal(await page.evaluate(() => tacticsBenchState.changes.length), 0, 'fixture changes clear manual swaps');
    assert.deepEqual(errors, []);
    console.log('PASS bench trays, outside-only hide, invalid-drop return, swaps, official timeline reconciliation, rewind, polling and vertical layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
