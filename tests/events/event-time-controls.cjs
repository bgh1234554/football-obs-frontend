require('../tactics/helpers');
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
    // 누락된 실축자·승부차기 키커와 VAR도 실제 행 메뉴에서 수정할 수 있다.
    const editableFixture = structuredClone(fixture);
    editableFixture.matchInfo.fixtureId = 1583655;
    editableFixture.matchInfo.status = 'PEN';
    editableFixture.matchInfo.elapsed = 120;
    editableFixture.matchInfo.awayPenaltyScore = 1;
    editableFixture.events = [
      { ...added, elapsed: 60, extra: null, type: 'Goal', detail: 'Missed Penalty', playerId: null, playerName: null },
      { ...sub, elapsed: 70 },
      { ...next, elapsed: 80, detail: 'Red Card' },
      { ...added, elapsed: 90, extra: null, type: 'Goal', detail: 'Missed Penalty', playerId: null, playerName: null },
      { ...added, elapsed: 120, extra: null, type: 'Goal', detail: 'Penalty', comments: 'Penalty Shootout', playerId: null, playerName: null },
      { ...added, elapsed: 121, extra: null, type: 'Goal', detail: 'Missed Penalty', comments: 'Penalty Shootout', playerId: null, playerName: null },
      { ...added, elapsed: 85, extra: null, type: 'Var', detail: 'Goal cancelled - Offside', playerId: null, playerName: null },
    ];
    await poll(editableFixture);
    const openEvent = async elapsed => {
      const row = page.locator('[data-events-panel]:visible .ev-row').filter({ has: page.locator('.ev-time', { hasText: `${elapsed}'` }) });
      await row.first().click();
      await page.getByRole('button', { name: '정보 수정', exact: true }).click();
      await page.locator('.ev-edit-modal').waitFor();
    };
    const modal = page.locator('.ev-edit-modal');
    const pickReason = async value => {
      await modal.locator('.ev-edit-reason-toggle').click();
      await modal.locator(`.ev-edit-reason-option[data-value="${value}"]`).click();
    };
    await openEvent(60);
    assert.match(await modal.textContent(), /Out/);
    assert(!/In/.test(await modal.textContent()), 'future substitute is unavailable');
    await modal.getByRole('button', { name: '취소', exact: true }).click();
    for (const elapsed of [90, 120, 121]) {
      await openEvent(elapsed);
      const text = await modal.textContent();
      assert.match(text, /In/);
      assert(!/\bOut\b|\bNext\b/.test(text), 'substituted and dismissed players are unavailable');
      await modal.locator('.ev-subst-picker-item').filter({ hasText: /In/ }).click();
      await modal.getByRole('button', { name: '확인', exact: true }).click();
      assert.equal(await page.evaluate(elapsed => window._eventsLastData.events.find(ev => ev.elapsed === elapsed).playerId, elapsed), 13);
    }
    await openEvent(120);
    await modal.getByRole('button', { name: '실축', exact: true }).click();
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => {
      const ev = window._eventsLastData.events.find(ev => ev.elapsed === 120);
      return [ev.detail, ev.comments, evHideGoalCredits([ev]).penAway];
    }), ['Missed Penalty', 'Penalty Shootout', 0]);
    assert.deepEqual(await page.evaluate(() => {
      const mi = window._eventsLastData.matchInfo;
      return [mi.homeScore, mi.awayScore, mi.awayPenaltyScore];
    }), [2, 2, 0]);
    await openEvent(120);
    await modal.getByRole('button', { name: '초기화', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.matchInfo.awayPenaltyScore), 1);
    await openEvent(85);
    await modal.getByRole('button', { name: 'PK 선언', exact: true }).click();
    await modal.locator('.ev-subst-picker-item').filter({ hasText: /In/ }).click();
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    await poll(editableFixture);
    assert.deepEqual(await page.evaluate(() => {
      const ev = window._eventsLastData.events.find(ev => ev.type === 'Var');
      return [ev.detail, ev.playerId];
    }), ['Penalty confirmed - Offside', 13]);
    await openEvent(85);
    await modal.locator('.ev-subst-picker-name').getByText('없음', { exact: true }).click();
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.type === 'Var').playerId), null);
    await openEvent(85);
    await modal.getByRole('button', { name: '초기화', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.type === 'Var').detail), 'Goal cancelled - Offside');
    // 인식된 판정을 일반 VAR로 바꿔도 덧붙은 사유는 남는다.
    await openEvent(85);
    assert.equal(await modal.locator('.ev-edit-reason').getAttribute('data-value'), 'Offside');
    await modal.getByRole('button', { name: 'VAR', exact: true }).click();
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.type === 'Var').detail), 'Offside');
    await openEvent(85);
    await modal.getByRole('button', { name: '초기화', exact: true }).click();
    editableFixture.events.find(ev => ev.type === 'Var').detail = 'Card upgrade';
    await poll(editableFixture);
    assert.equal(await page.evaluate(() => translateEventVarDetail('CARD UPGRADE')), '카드 변경');
    await openEvent(85);
    assert.equal(await modal.locator('.ev-edit-var-reason-row .is-active').textContent(), '카드 변경');
    assert.deepEqual(await modal.locator('.ev-edit-var-reason-row > button').allTextContents(), ['카드 변경', 'VAR']);
    assert.equal(await modal.locator('.ev-edit-reason').getAttribute('data-value'), '');
    assert(await modal.locator('.ev-edit-types button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth)), 'decision labels must fit without clipping');
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.type === 'Var').detail), 'Card upgrade');
    await openEvent(85);
    await modal.getByRole('button', { name: 'VAR', exact: true }).click();
    await pickReason('');
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => {
      const ev = window._eventsLastData.events.find(ev => ev.type === 'Var');
      return [ev.detail, evLabelKo(ev)];
    }), ['VAR', 'VAR']);
    editableFixture.events.find(ev => ev.type === 'Var').detail = 'Unknown review';
    await poll(editableFixture);
    await openEvent(85);
    assert.equal(await modal.locator('.ev-edit-var-reason-row .is-active').textContent(), 'VAR');
    assert.equal(await modal.locator('.ev-edit-reason').getAttribute('data-value'), 'Unknown review');
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.type === 'Var').detail), 'Unknown review');
    for (const [detail, label] of [['Card upheld', '카드 판정 유지'], ['Card upgrade', '카드 변경'], ['Card upgrade confirmed', '카드 변경'], ['Card reviewed', '카드 판정 검토 완료']]) {
      const varEvent = editableFixture.events.find(ev => ev.type === 'Var');
      varEvent.detail = detail;
      varEvent.comments = 'Violent conduct';
      await poll(editableFixture);
      const row = page.locator('[data-events-panel]:visible .ev-row').filter({ has: page.locator('.ev-time', { hasText: "85'" }) }).first();
      const upgrade = /^Card upgrade/.test(detail);
      assert.equal(await row.locator('.ev-label').textContent(), upgrade ? 'VAR 카드 변경' : 'VAR');
      assert.equal(await row.locator('.ev-icon-var-red').count(), 0);
      assert.equal(await row.evaluate(row => row.classList.contains('ev-bar-orange')), upgrade);
      assert.equal(await row.locator('.ev-comment').textContent(), `${label} · 폭력 행위`);
      await openEvent(85);
      assert.equal(await modal.locator('.ev-edit-var-reason-row .is-active').textContent(), upgrade ? '카드 변경' : 'VAR');
      assert.equal(await modal.locator('.ev-edit-reason').getAttribute('data-value'), upgrade ? '' : detail);
      await modal.getByRole('button', { name: '취소', exact: true }).click();
    }
    // VAR detail과 카드 comments를 별개로 수정하고 폴링에도 유지한다.
    const cardFixture = structuredClone(fixture);
    cardFixture.matchInfo.fixtureId = 1583656;
    cardFixture.events = [
      { ...added, elapsed: 45, extra: null, type: 'Var', detail: 'Card upgrade confirmed', comments: null },
      { ...added, elapsed: 63, extra: null, comments: 'Dissent' },
      { ...added, elapsed: 90, extra: 2, detail: 'Yellow Card', comments: 'Foul' },
      { ...added, elapsed: 90, extra: 2, detail: 'Red Card', comments: null },
    ];
    await poll(cardFixture);
    const cumulativeRow = page.locator('[data-events-panel]:visible .ev-row').filter({ hasText: 'Added' }).filter({ hasText: '경고 누적 퇴장' }).first();
    assert(await cumulativeRow.isVisible());
    assert.equal(await cumulativeRow.locator('.ev-label').textContent(), '경고 누적 퇴장');
    assert.equal(await cumulativeRow.locator('.ev-icon-cumulative-red').count(), 1);
    assert.equal(await cumulativeRow.locator('.ev-comment').count(), 0, 'cumulative dismissal is a card type, not a foul reason');
    await cumulativeRow.click();
    await page.getByRole('button', { name: '정보 수정', exact: true }).click();
    assert.equal(await modal.locator('.ev-edit-types .is-active').textContent(), '경고 누적 퇴장');
    await modal.locator('.ev-edit-reason-toggle').click();
    assert(!await modal.getByRole('option', { name: '경고 누적 퇴장', exact: true }).count());
    await modal.locator('.ev-edit-reason-option[data-value="Foul"]').click();
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    await poll(cardFixture);
    const cumulativeEvent = await page.evaluate(() => window._eventsLastData.events.find(ev => ev.playerId === 11 && ev.detail === 'Second Yellow Card'));
    assert.equal(cumulativeEvent.comments, 'Foul');
    assert.equal(await cumulativeRow.locator('.ev-comment').textContent(), '파울');
    assert.equal(await cumulativeRow.locator('.ev-icon-cumulative-red').count(), 1);
    // 원본과 값이 같은 Red Card라도 직접 퇴장으로 고친 기록은 남아 다시 누적으로 분류되지 않는다.
    await cumulativeRow.click();
    await page.getByRole('button', { name: '정보 수정', exact: true }).click();
    await modal.getByRole('button', { name: '퇴장', exact: true }).click();
    await pickReason('');
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    await poll(cardFixture);
    const directRedRow = page.locator('[data-events-panel]:visible .ev-row').filter({ has: page.locator('.ev-time', { hasText: "90+2'" }) }).first();
    assert.equal(await directRedRow.locator('.ev-label').textContent(), '퇴장');
    assert.equal(await directRedRow.locator('.ev-icon-cumulative-red').count(), 0);
    await directRedRow.click();
    await page.getByRole('button', { name: '정보 수정', exact: true }).click();
    assert.equal(await modal.locator('.ev-edit-types .is-active').textContent(), '퇴장');
    await modal.getByRole('button', { name: '초기화', exact: true }).click();
    assert.equal(await directRedRow.locator('.ev-label').textContent(), '경고 누적 퇴장');
    const cardReviewRow = page.locator('[data-events-panel]:visible .ev-row').filter({ hasText: '카드 변경' }).first();
    assert.equal(await cardReviewRow.locator('.ev-label').textContent(), 'VAR 카드 변경');
    assert.equal(await cardReviewRow.locator('.ev-comment').textContent(), '카드 변경');
    assert(await cardReviewRow.locator('.ev-comment').isVisible());
    await cardReviewRow.click();
    await page.getByRole('button', { name: '정보 수정', exact: true }).click();
    assert.equal(await modal.locator('.ev-edit-var-reason-row .is-active').textContent(), '카드 변경');
    assert.equal(await modal.locator('.ev-edit-var-types > button').count(), 4);
    assert(await modal.locator('.ev-edit-var-types > button').evaluateAll(buttons => {
      const boxes = buttons.map(button => button.getBoundingClientRect());
      return boxes.every(box => box.top === boxes[0].top)
        && buttons.every(button => button.scrollWidth <= button.clientWidth);
    }), 'four decisions share the first row');
    assert(await modal.locator('.ev-edit-var-reason-row').evaluate(row => {
      const button = row.querySelector('button').getBoundingClientRect();
      const select = row.querySelector('.ev-edit-reason-toggle').getBoundingClientRect();
      return button.right <= select.left && Math.abs(button.top - select.top) < 1;
    }), 'VAR button sits beside the reason dropdown');
    assert.equal(await modal.locator('.ev-edit-reason').getAttribute('data-value'), '');
    assert(await modal.locator('.ev-edit-reason-toggle').isDisabled());
    await modal.getByRole('button', { name: 'VAR', exact: true }).click();
    await modal.locator('.ev-edit-reason-toggle').click();
    const reasonLabels = await modal.getByRole('option').allTextContents();
    assert.equal(reasonLabels.length, new Set(reasonLabels).size, 'identical Korean reasons appear only once');
    assert.equal(reasonLabels.filter(label => label === '카드 변경').length, 0);
    await modal.locator('.ev-edit-reason-toggle').press('Escape');
    assert(await modal.isVisible(), 'Escape closes only the open reason menu');
    await pickReason('Card upheld');
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.locator('[data-events-panel]:visible .ev-comment').filter({ hasText: '카드 판정 유지' }).count(), 1);
    await page.locator('[data-events-panel]:visible .ev-row').filter({ hasText: '카드 판정 유지' }).click();
    await page.getByRole('button', { name: '정보 수정', exact: true }).click();
    await pickReason('');
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.type === 'Var' && ev.elapsed === 45).detail), 'VAR');
    await openEvent(63);
    assert.equal(await modal.locator('.ev-edit-reason').getAttribute('data-value'), 'Dissent');
    await modal.locator('.ev-edit-reason-toggle').click();
    assert(await modal.locator('.ev-edit-reason-menu').evaluate(menu => menu.scrollHeight > menu.clientHeight), 'card reasons scroll within the menu');
    const cardLabels = await modal.getByRole('option').allTextContents();
    assert(!cardLabels.includes('카드 판정 유지') && !cardLabels.includes('카드 판정 검토 완료'), 'VAR details never enter card comments');
    assert.deepEqual(cardLabels.slice(0, 2), ['없음', '파울']);
    assert(await modal.locator('.ev-edit-reason-menu').evaluate(menu => {
      const style = getComputedStyle(menu);
      const listStyle = getComputedStyle(document.querySelector('.ev-edit-modal .ev-subst-picker-list'));
      return style.scrollbarWidth === listStyle.scrollbarWidth
        && style.scrollbarColor === listStyle.scrollbarColor && style.colorScheme === listStyle.colorScheme;
    }), 'reason scrollbar matches the existing player list');
    assert.equal(cardLabels.length, new Set(cardLabels).size);
    assert(await modal.evaluate(modal => {
      const trigger = getComputedStyle(modal.querySelector('.ev-edit-reason-toggle'));
      const segment = getComputedStyle(modal.querySelector('.ev-edit-seg-btn'));
      const option = getComputedStyle(modal.querySelector('.ev-edit-reason-option'));
      return trigger.fontFamily === segment.fontFamily && trigger.fontSize === segment.fontSize
        && option.fontFamily === trigger.fontFamily && option.fontSize === trigger.fontSize;
    }), 'reason menus use the existing UI font');
    await modal.locator('.ev-edit-reason-option[data-value="Violent conduct"]').click();
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    await poll(cardFixture);
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.elapsed === 63).comments), 'Violent conduct');
    await openEvent(63);
    await pickReason('');
    await modal.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.elapsed === 63).comments), null);
    await openEvent(63);
    await modal.getByRole('button', { name: '초기화', exact: true }).click();
    assert.equal(await page.evaluate(() => window._eventsLastData.events.find(ev => ev.elapsed === 63).comments), 'Dissent');
    // 카드 변경 VAR만 있으면 실제 퇴장으로 집계하지 않는다.
    const reviewOnlyFixture = structuredClone(cardFixture);
    reviewOnlyFixture.matchInfo.fixtureId = 1583657;
    reviewOnlyFixture.events = reviewOnlyFixture.events.filter(event => event.type === 'Var');
    await poll(reviewOnlyFixture);
    const reviewOnlyRow = page.locator('.lp-events-s [data-events-panel] .ev-row:not(.ev-period-marker)').first();
    assert.equal(await reviewOnlyRow.locator('.ev-label').textContent(), 'VAR 카드 변경');
    assert.equal(await reviewOnlyRow.locator('.football-icon-var-card-change').count(), 1);
    assert.deepEqual(await page.evaluate(() => [state.redHome, state.redAway]), [0, 0]);
    assert.deepEqual(errors, []);
    console.log('PASS: shared periods, lineup candidates, modal controls, polling/reload, fixture isolation, boundaries, real slider, missed penalties, shootout kickers/results/scores, VAR decisions/optional player/reset.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
