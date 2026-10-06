// 초안 실행: node tests/events/event-time-controls.cjs tools/event-timing-draft
// 현재 코드 실행: node tests/events/event-time-controls.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const draftRoot = path.resolve(process.argv[2] || root);
const added = { side: 'away', teamId: 6, elapsed: 45, extra: 4, playerId: 11, playerName: 'Added', type: 'Card', detail: 'Yellow Card' };
const sub = { ...added, extra: null, playerId: 12, playerName: 'Out', assistId: 13, assistName: 'In', type: 'subst', detail: 'Substitution 1' };
const next = { ...added, elapsed: 46, extra: null, playerId: 14, playerName: 'Next' };
const fixture = {
  matchInfo: { fixtureId: 1583654, status: '2H', elapsed: 46, homeTeamId: 20, awayTeamId: 6, homeTeamName: '호주', awayTeamName: '브라질', homeScore: 2, awayScore: 2 },
  homeLineup: { formation: '4-3-3', startXi: [], substitutes: [] },
  awayLineup: { formation: '4-3-3', startXi: [{ playerId: 11, name: 'Added', grid: '1:1' }, { playerId: 12, name: 'Out', grid: '2:1' }, { playerId: 14, name: 'Next', grid: '2:2' }], substitutes: [{ playerId: 13, name: 'In', pos: 'D' }] },
  playerStats: [], events: [added, sub, next],
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const relative = decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname);
      const candidate = path.join(draftRoot, relative);
      const file = fs.existsSync(candidate) ? candidate : path.join(root, relative);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    const poll = async (data = fixture) => page.evaluate(async data => {
      clearPolling();
      state.manualMode = false;
      fetchFixture = async () => structuredClone(data);
      if (!await fetchAndApplyFixtureData(data.matchInfo.fixtureId, { silent: true })) throw new Error('Fixture failed');
      clearPolling();
      activatePage('main-small');
    }, data);
    const read = () => page.evaluate(() => {
      const data = window._eventsLastData;
      const context = evBuildTimeContext(data);
      const event = data.events.find(ev => ev.type === 'subst');
      const card = data.events.find(ev => ev.extra === 4);
      const time = evResolveEventTime(event, context);
      const host = [...document.querySelectorAll('[data-events-panel]')].find(el => el.getClientRects().length);
      const row = host.querySelector('.ev-row-subst');
      const lineups = ttCollectLineupEvents(data.events, data);
      return {
        time, editorKey: evEditTimeKey(event), timelineKey: lineups.away[0]._timeKey,
        at45: ttReconstructLineupAtTime(data.awayLineup, lineups.away, 45).startXi.map(p => p.playerId),
        atHT: ttReconstructLineupAtTime(data.awayLineup, lineups.away, 45.51).startXi.map(p => p.playerId),
        candidates: evAvailablePlayers(card, 'away', 'onPitch').map(p => p.playerId),
        period: row.dataset.eventPeriod, reason: row.dataset.eventTimeReason,
        title: row.querySelector('.ev-time').title,
        aria: row.querySelector('.ev-time').getAttribute('aria-label'),
        stored: evHideGetEntry(data.matchInfo.fixtureId),
        event, scores: [data.matchInfo.homeScore, data.matchInfo.awayScore],
        stops: tacticsTimelineState.stopTimes,
      };
    });
    const open = async () => {
      await page.locator('[data-events-panel]:visible .ev-row-subst').click();
      await page.getByRole('button', { name: '구간 설정', exact: true }).click();
      await page.locator('.ev-period-modal').waitFor();
    };
    const choose = async value => {
      await open();
      await page.locator(`.ev-period-modal [data-period="${value}"]`).click();
      await page.locator('.ev-period-modal').getByRole('button', { name: '저장', exact: true }).click();
    };
    await poll();
    let result = await read();
    assert.equal(result.time.period, '2H');
    assert.equal(result.editorKey, 4600);
    assert.equal(result.timelineKey, 46);
    assert(result.at45.includes(12) && !result.at45.includes(13));
    assert(result.atHT.includes(12) && !result.atHT.includes(13));
    assert(result.candidates.includes(12) && !result.candidates.includes(13));
    assert.equal(result.period, '2H');
    assert.match(result.title, /후반 시작 교체/);
    assert.match(result.aria, /후반/);
    assert(result.stops.includes(46));
    await open();
    await page.locator('.ev-period-modal [data-period="1H"]').click();
    assert.match(await page.locator('.ev-period-status').textContent(), /전반.*직접 지정/);
    assert.deepEqual((await read()).stored.periods, {}); // preview is not committed
    const labelsFit = await page.locator('.ev-period-modal [data-period]').evaluateAll(buttons => buttons.every(button => {
      const style = getComputedStyle(button);
      return button.clientHeight >= parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.fontSize);
    }));
    assert(labelsFit, 'period labels must not be clipped vertically');
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.locator('.ev-period-modal').screenshot({ path: path.join(root, 'screenshots/event-time-period-draft.png') });
    await page.locator('.ev-period-modal').getByRole('button', { name: '취소', exact: true }).click();
    assert.equal((await read()).period, '2H');
    await choose('1H');
    result = await read();
    assert.equal(result.period, '1H');
    assert.equal(result.editorKey, 4500);
    assert.equal(result.timelineKey, 45);
    assert(result.at45.includes(13) && !result.at45.includes(12));
    assert(result.candidates.includes(13) && !result.candidates.includes(12));
    assert.match(result.title, /직접 지정/);
    assert.equal(result.event.elapsed, 45);
    assert.equal(result.event.extra, null);
    assert.deepEqual(result.scores, [2, 2]);
    await poll();
    assert.equal((await read()).period, '1H');
    await page.reload();
    await poll();
    assert.equal((await read()).period, '1H');
    await choose('2H');
    result = await read();
    assert.equal(result.timelineKey, 46);
    assert.equal(result.editorKey, 4600);
    assert.equal(result.period, '2H');
    assert(result.atHT.includes(12));
    await choose('HT');
    assert.equal((await read()).reason, 'manual');
    await choose('');
    result = await read();
    assert.equal(result.period, '2H');
    assert.equal(result.reason, 'halftime-substitution');
    assert.deepEqual(result.stored.periods, {});

    // 명확한 전반 근거가 없으면 순서가 바뀌어도 후반 기본값을 유지합니다.
    await poll({ ...fixture, events: [sub, added, next] });
    result = await read();
    assert.equal(result.period, '2H');
    assert.equal(result.timelineKey, 46);
    assert(result.candidates.includes(12));
    await poll();
    assert.equal((await read()).period, '2H');

    const unit = await page.evaluate(() => {
      const check = (condition, label) => { if (!condition) throw new Error(label); };
      const data = window._eventsLastData;
      const event = data.events.find(ev => ev.type === 'subst');
      const id = String(data.matchInfo.fixtureId);
      const entry = evHideGetEntry(id);
      entry.edits[event._hideSig] = { patch: { playerName: 'Edited Out' }, editedAt: Date.now() };
      evHideSetEntry(id, entry);
      evPeriodSave(id, event, '2H');
      evPeriodSave(id, event, '');
      check(evHideGetEntry(id).edits[event._hideSig].patch.playerName === 'Edited Out', 'auto keeps player edits');
      evPeriodSave(id, event, 'HT');
      const other = evHideApplyToFixtureData({ ...data, matchInfo: { ...data.matchInfo, fixtureId: 999999 } });
      check(!other.events.find(e => e.type === 'subst')._eventPeriod, 'fixture isolation');
      const corrected = evHideApplyToFixtureData({ ...data, _rawEvents: data._rawEvents.map(e => e.type === 'subst' ? { ...e, extra: 2 } : e) });
      check(!corrected.events.find(e => e.type === 'subst')._eventPeriod, 'raw correction removes manual override');
      check(!Object.keys(evHideGetEntry(id).periods).length, 'stale manual record removed');
      for (const elapsed of [45, 90, 105, 120]) {
        const sample = { ...event, elapsed };
        const [before, interval, after] = evTimePeriodOptions(sample);
        for (const [period, key] of [[before, elapsed * 100], [interval, elapsed * 100 + 51], [after, (elapsed + 1) * 100]]) {
          const resolved = evResolveEventTime({ ...sample, _eventPeriod: period });
          check(resolved.sortKey === key && resolved.reason === 'manual' && resolved.period === period, `boundary ${elapsed} ${period}`);
        }
        check(evResolveEventTime({ ...sample, extra: 4 }).period === before, 'added time before');
        check(evResolveEventTime({ ...sample, _eventPeriod: 'bad' }).period === before, 'invalid override ignored');
      }
      check(!evTimePeriodOptions({ ...event, elapsed: 44 }).length, 'ordinary minute no override');
      const shootout = { ...event, type: 'Goal', detail: 'Penalty', comments: 'Penalty Shootout', _eventPeriod: '1H' };
      check(!evTimePeriodOptions(shootout).length && evResolveEventTime(shootout).period === 'PSO', 'shootout keeps period');
      const red = { ...event, type: 'Card', detail: 'Red Card', extra: 4 };
      const timeline = ttCollectLineupEvents([red, event], data);
      check(timeline.away[0]._timeKey === 45.04 && timeline.away[1]._timeKey === 46, 'added time and second-half start distinct');
      check(evTimelinePositionLabel(45.04) === '45+4′' && evTimelinePositionLabel(45.51) === '하프타임', 'labels readable');
      check(ttReconstructLineupAtTime(data.awayLineup, timeline.away, 45).startXi.some(p => p.playerId === event.playerId), '45-minute stop must not apply added-time red');
      check(ttReconstructLineupAtTime(data.awayLineup, timeline.away, 45.04).startXi.some(p => p._emptySlot), 'red applies at added-time stop');
      return true;
    });
    assert(unit);
    await poll();
    await choose('1H');
    // 브라우저 슬라이더도 같은 후반 시작 기준을 사용합니다.
    await choose('');
    const slider = await page.evaluate(() => {
      const slider = document.getElementById('tactics-time-slider');
      slider.value = String(tacticsTimelineState.stopTimes.indexOf(46) + 1);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      return { time: tacticsTimelineState.currentElapsed, label: document.getElementById('tactics-time-current')?.textContent };
    });
    assert.equal(slider.time, 46);
    assert.equal(slider.label, '46′');
    assert.deepEqual(errors, []);
    console.log('PASS: shared period/lineup/candidate decisions, modal preview/cancel/save/auto, polling/reload, fixture isolation, edit preservation, stale cleanup, all boundaries, shootouts, added-time stops and real slider.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
