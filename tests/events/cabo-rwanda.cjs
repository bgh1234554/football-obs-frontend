const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'json/CaboVerdeRwanda.json'), 'utf8').replace(/^\uFEFF/, ''));
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    const result = await page.evaluate(f => {
      const original = JSON.stringify(f);
      // JSON에 교체 투입 정보가 없으므로 사용자가 제공한 교체 쌍을 재현합니다.
      for (const [minute, outName, inName] of [[45, 'A. Biramahire', 'E. Tatou Iradukunda'], [90, 'J. 미켈스', 'I. Nshuti'], [90, 'B. Mugisha', 'K. Muhire']]) {
        const ev = f.events.find(e => e.type === 'subst' && e.elapsed === minute && e.playerName === outName);
        evSetSubstOverride(f.matchInfo.fixtureId, ev, 'assist', { playerId: 0, name: inName });
      }
      setSetting('subReflect', 'on');
      setSetting('autoLinkPlayerIdByName', 'on');
      activatePage('main-small');
      applyLineupPanels(f);
      const merged = buildEffectiveFixtureData(f);
      applyEventsPanel(merged, { animate: false });
      const reflected = lineupPanelState.lastEffectiveData;
      const events = lpAggregatePlayerEvents(lpResolveSubstEventIdsForAggregation(merged));
      const key = (id, name) => lpEventPersonKey(id, 'away', name);
      const bon = events.get(key(335131));
      const gilbert = events.get(key(0, 'G. Mugisha'));
      const raw69 = f.events.find(e => e.elapsed === 69 && e.playerName === 'G. Mugisha');
      const fixed69 = merged.events.find(e => e.elapsed === 69 && e.playerName === 'G. Mugisha');
      const time = evResolveEventTime(merged.events.find(e => e.elapsed === 45 && e.type === 'subst'), evBuildTimeContext(merged));
      const panel = [...document.querySelectorAll('[data-events-panel]')].find(p => p.getClientRects().length);
      const rows = [...panel.querySelectorAll('.ev-list > .ev-row')].map(r => ({ text: r.textContent, period: r.dataset.eventPeriod }));
      const isolated = structuredClone(f);
      isolated.awayLineup.substitutes.find(p => p.number === 9).playerId = 987654;
      const distinct = buildEffectiveFixtureData(isolated).awayLineup.substitutes.some(p => p.playerId === 987654);
      const activeDuplicate = structuredClone(f);
      activeDuplicate.playerStats.find(p => p.side === 'away' && p.playerId === 0 && p.playerName === 'J. 미켈스').minutes = 10;
      const preservePlayed = buildEffectiveFixtureData(activeDuplicate).awayLineup.substitutes.some(p => p.number === 9);
      const sameSurname = lpFindLineupPlayerIndex([{ playerId: 1, name: 'B. Mugisha' }, { playerId: 0, name: 'G. Mugisha' }], { playerId: 1, playerName: 'G. Mugisha' });
      const ambiguous = lpFindLineupPlayerIndex([{ playerId: 1, name: 'Same' }, { playerId: 2, name: 'Same' }], { playerId: 0, playerName: 'Same' });
      const manualEvent = evPatchSubstEvents([raw69], String(f.matchInfo.fixtureId))[0];
      evSetSubstOverride(f.matchInfo.fixtureId, raw69, 'player', { playerId: 335131, name: 'B. Mugisha' });
      const manualResult = buildEffectiveFixtureData(f).events.find(e => e.elapsed === 69 && e.assistId === 351495);
      evClearSubstOverride(f.matchInfo.fixtureId, manualEvent, 'player');
      const linkedEvents = { matchInfo: { fixtureId: 'manual-link-scope' }, awayLineup: {
        startXi: [{ playerId: 335131, name: 'B. Mugisha' }, { playerId: 0, name: 'G. Mugisha' }],
        substitutes: [],
      }, events: [
        { side: 'away', type: 'subst', playerId: 335131, playerName: 'B. Mugisha' },
        { side: 'away', type: 'subst', playerId: 335131, playerName: 'G. Mugisha' },
      ] };
      lpReconcileConflictingEventIds(linkedEvents, { 'away:id:335131': { playerId: 335131, name: 'B. Mugisha' } });
      return {
        rawUnchanged: JSON.stringify(f) === original, raw69, fixed69, time, rows,
        starters: reflected.awayLineup.startXi.map(p => p.name), bench: reflected.awayLineup.substitutes.map(p => ({ name: p.name, id: p.playerId, number: p.number })),
        bon, gilbert, distinct, preservePlayed, sameSurname, ambiguous, manualResult,
        linkedEventIds: linkedEvents.events.map(e => e.playerId),
        duplicateCount: [...merged.awayLineup.startXi, ...merged.awayLineup.substitutes].filter(p => p.name === 'J. 미켈스').length,
      };
    }, fixture);
    assert(result.rawUnchanged);
    assert.equal(result.raw69.playerId, 335131);
    assert.equal(result.fixed69.playerId, 0);
    assert.equal(result.fixed69.playerOrigName, 'Gilbert Mugisha');
    assert.equal(result.bon.yellow.time.elapsed, 24);
    assert.equal(result.bon.subOut.time.elapsed, 90);
    assert.equal(result.bon.subOut.time.extra, 3);
    assert.equal(result.gilbert.subOut.time.elapsed, 69);
    assert.equal(result.gilbert.yellow, null);
    assert.equal(result.starters.length, 11);
    for (const name of ['K. Muhire', 'I. Nshuti', 'J. Kwizera', 'E. Tatou Iradukunda']) assert(result.starters.includes(name), name);
    assert(!result.starters.includes('G. Mugisha'));
    // 약칭이나 번역 이름이 같아도 동일 선수로 단정할 수 없으므로 20번과 9번을 모두 유지합니다.
    assert.equal(result.duplicateCount, 2);
    assert.equal(result.bench.filter(p => p.name === 'J. 미켈스').length, 2);
    assert(result.bench.some(p => p.number === 9 && p.id === 0));
    assert(result.distinct && result.preservePlayed);
    assert.equal(result.sameSurname, 1);
    assert.equal(result.ambiguous, -1);
    assert.equal(result.manualResult.playerId, 335131);
    assert.equal(result.manualResult.playerName, 'B. Mugisha');
    assert.deepEqual(result.linkedEventIds, [335131, 0]);
    assert.equal(result.time.period, '2H');
    assert.equal(result.time.sortKey, 4600);
    const ht = result.rows.findIndex(r => r.text.includes('하프타임'));
    const sub45 = result.rows.findIndex(r => r.text.includes('A. Biramahire'));
    assert(sub45 >= 0 && sub45 < ht, JSON.stringify(result.rows));
    assert.equal(result.rows[sub45].period, '2H');
    await page.screenshot({ path: path.join(root, 'screenshots/cabo-rwanda-fixed.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: CaboVerdeRwanda collision repair, 24/69/90+3 markers, final 11, both Mickels players preserved, ambiguous-name guard, manual precedence, immutable source, 45-minute second-half DOM order.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
