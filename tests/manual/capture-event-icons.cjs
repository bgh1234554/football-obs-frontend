// Actual application screenshots with synthetic fixture data, not a mockup.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
const output = path.resolve(__dirname, '../../screenshots/event-icons/review');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1400 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      activatePage('main-small');
      setSetting('statCycleAuto', 'off'); setSetting('greenscreen', 'off'); setSetting('subReflect', 'off');
      setSetting('lineupNode', 'circle'); setSetting('lineupPitchTone', 'black');
      const names = ['주장', '골 1회', '골 2회', '도움 1회', '도움 2회', '자책골 1회', '자책골 2회', '골 · 자책골', '옐로카드', '경고누적 퇴장', '레드카드'];
      const roster = (offset, labels) => Array.from({ length: 11 }, (_, i) => ({ playerId: offset + i, number: i + 1,
        name: labels?.[i] || `선수 ${i + 1}`, pos: i ? 'M' : 'G', grid: buildManualGridValues('4-4-2')[i] }));
      const event = (type, detail, playerId, extra = {}) => ({ type, detail, playerId,
        playerName: names[playerId - 100] || `선수 ${playerId}`, side: 'home', elapsed: 10, ...extra });
      window.reviewFixture = {
        matchInfo: { fixtureId: 'icon-capture-review', status: '2H', elapsed: 85,
          homeTeamId: 1, awayTeamId: 2, homeTeamName: '아이콘 테스트', awayTeamName: '상대팀' },
        homeLineup: { formation: '4-4-2', startXi: roster(100, names), substitutes: [] },
        awayLineup: { formation: '4-4-2', startXi: roster(200), substitutes: [] },
        playerStats: [], homeInjuries: [{ playerId: 999, name: '출장정지 카드', reason: 'Suspended' }], awayInjuries: [],
        events: [event('Goal', 'Normal Goal', 101, { assistId: 103, assistName: names[3] }),
          event('Goal', 'Normal Goal', 102, { elapsed: 15, assistId: 104, assistName: names[4] }),
          event('Goal', 'Normal Goal', 102, { elapsed: 20, assistId: 104, assistName: names[4] }),
          event('Goal', 'Own Goal', 105, { elapsed: 25 }), event('Goal', 'Own Goal', 106, { elapsed: 30 }),
          event('Goal', 'Own Goal', 106, { elapsed: 35 }), event('Goal', 'Normal Goal', 107, { elapsed: 40 }),
          event('Goal', 'Own Goal', 107, { elapsed: 42 }), event('Card', 'Yellow Card', 108, { elapsed: 50 }),
          event('Card', 'Yellow Card', 109, { elapsed: 55 }), event('Card', 'Second Yellow Card', 109, { elapsed: 60 }),
          event('Card', 'Red Card', 110, { elapsed: 65 })],
      };
      // Rating payload mirrors the app's playerStats DTO.
      reviewFixture.playerStats = [...reviewFixture.homeLineup.startXi, ...reviewFixture.awayLineup.startXi]
        .map(p => ({ playerId: p.playerId, rating: 7.2, captain: p.playerId === 100 }));
      applyLineupPanels(reviewFixture);
      state.redHome = 2; state.redAway = 1; renderRedCards();
    });
    await settle(page); await page.evaluate(() => document.fonts.ready);
    // Use the app's resize handle so the review captures have readable event labels.
    const handle = await page.locator('#page-main-small .lp-small-col-resize').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 210, handle.y + handle.height / 2, { steps: 10 });
    await page.mouse.up(); await settle(page);
    const pitch = page.locator('#lineupPanel .dp-lineup-pitch');
    const box = await pitch.boundingBox();
    await page.screenshot({ path: path.join(output, 'pitch-all.png'), clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height / 2 + 16 } });
    for (const key of ['goal', 'own-goal', 'assist', 'yellow-card', 'red-card', 'cumulative-red']) {
      assert(await pitch.locator(`.football-icon-${key}`).count(), `Pitch missing ${key}`);
    }
    await page.evaluate(() => {
      const cases = [
        ['Goal', 'Normal Goal', '일반 골'], ['Goal', 'Own Goal', '자책골'],
        ['Goal', 'Penalty', 'PK 골'], ['Goal', 'Missed Penalty', 'PK 실축'],
        ['Card', 'Yellow Card', '옐로카드'], ['Card', 'Red Card', '레드카드'],
        ['Card', 'Second Yellow Card', '경고누적 퇴장'], ['subst', 'Substitution 1', '교체 OUT'],
        ['Var', 'Review', 'VAR 검토'], ['Var', 'Goal Confirmed', 'VAR 골 인정'],
        ['Var', 'Goal cancelled', 'VAR 골 취소'], ['Var', 'Penalty confirmed', 'VAR PK 인정'],
        ['Var', 'Penalty cancelled', 'VAR PK 취소'],
      ];
      window.reviewEvents = { ...reviewFixture, events: cases.map(([type, detail, playerName], i) => ({
        type, detail, playerName, playerId: 300 + i, side: 'home', elapsed: 85 - i,
        ...(type === 'subst' ? { assistId: 400, assistName: '교체 IN' } : {}),
      })) };
      applyEventsPanel(reviewEvents, { animate: false });
    });
    await settle(page);
    const events = page.locator('#page-main-small [data-events-panel]');
    const required = ['goal', 'own-goal', 'pk-goal', 'pk-miss', 'yellow-card', 'red-card', 'cumulative-red', 'subst', 'var', 'var-confirm', 'var-cancel'];
    const coverage = await events.evaluate((host, keys) => {
      const list = host.querySelector('.ev-list'), clip = list.getBoundingClientRect();
      return keys.map(key => ({ key, visible: [...host.querySelectorAll(`.football-icon-${key}`)].some(el => {
        const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= clip.top && r.bottom <= clip.bottom;
      }) }));
    }, required);
    assert(coverage.every(item => item.visible), JSON.stringify(coverage));
    await events.screenshot({ path: path.join(output, 'events-all-off.png') });
    await page.locator('#board').screenshot({ path: path.join(output, 'scoreboard-cards.png') });
    await page.evaluate(() => { setSetting('greenscreenIntensity', 'purple'); setSetting('greenscreen', 'on'); });
    await settle(page);
    await events.screenshot({ path: path.join(output, 'events-all-chroma.png') });
    await page.evaluate(() => { setSetting('greenscreen', 'off'); setSetting('lineupPitchTone', 'white'); });
    await settle(page);
    await page.screenshot({ path: path.join(output, 'pitch-white.png'), clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height / 2 + 16 } });
    await page.evaluate(() => { setSetting('lineupPitchTone', 'black'); activatePage('tactics');
      applyTacticsTimeline(reviewEvents); document.querySelector('#tactics-show-ball').checked = true; tacticsRenderTokens(); });
    await settle(page);
    await page.locator('#tactics-main-area').screenshot({ path: path.join(output, 'tactics.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: actual pitch (6 icon types), event panel (all 11 icon types visible), chroma, white pitch, scoreboard and tactics screenshots');
    console.log(output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
