const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { viewport: { width: 1920, height: 1080 }, dpr: 1, platform: 'Win32' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    assert.deepEqual(await page.evaluate(() => [null, undefined, '', 'null', ' NULL ', 'undefined', 'G', 'd', ' M '].map(pmPosKo)),
      ['정보 없음', '정보 없음', '정보 없음', '정보 없음', '정보 없음', '정보 없음', 'GK', 'DF', 'MF']);
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/1637598-lineup.json'), 'utf8'));
    fixture.homeLineup.substitutes = [{ playerId: 0, name: 'Pavel Egorov', origName: 'Pavel Egorov', number: 86 }];
    fixture.awayLineup.substitutes = [{ playerId: 0, name: 'Pavel Egorov', origName: 'Pavel Egorov', number: 87 }];
    fixture.events = [];
    fixture.playerStats = [
      { side: 'home', playerId: 0, playerName: 'P. Egorov', playerNameKoLong: 'Pavel Egorov', rating: '6.9', minutes: 30, goals: 1, position: 'null' },
      { side: 'away', playerId: 0, playerName: 'P. Egorov', playerNameKoLong: 'Pavel Egorov', rating: '7.8', minutes: 61, goals: 2 },
    ];
    await page.evaluate(async fixture => {
      setSetting('statCycleAuto', 'off');
      fetchFixture = async () => structuredClone(fixture);
      await fetchAndApplyFixtureData(fixture.matchInfo.fixtureId, { silent: true });
      clearPolling();
    }, fixture);
    // 양 팀에 같은 이름이 있어도 클릭한 쪽의 선수와 연결해야 한다.
    for (const layout of ['main-big', 'main-small']) {
      for (const [side, number] of [['home', 86], ['away', 87]]) {
        await page.evaluate(({ layout, side }) => {
          activatePage(layout);
          if (layout === 'main-big') {
            _lpStatCycle.mode = `bench_${side}`;
            lpStatUpdateVisibility();
          }
        }, { layout, side });
        await settle(page);
        const rowSelector = layout === 'main-big'
          ? `.layout-big [data-bench-${side}-panel] .dp-item[data-player-id="0"]`
          : `#benchPanel [data-bench-side="${side}"] .dp-item[data-player-id="0"]`;
        assert.equal(await page.locator(`${rowSelector} .dp-rating`).innerText(), side === 'home' ? '6.9' : '7.8');
        const selector = layout === 'main-big'
          ? `.layout-big [data-bench-${side}-panel] .dp-item[data-player-id="0"] .dp-item-name`
          : `#benchPanel [data-bench-side="${side}"] .dp-item[data-player-id="0"] .dp-item-name`;
        await page.locator(selector).click();
        await page.locator('#pirIdInput').waitFor();
        assert.equal((await page.locator('#pirPopup .pm-num').innerText()).trim(), String(number), `${layout}/${side} must resolve the clicked side`);
        assert((await page.locator('#pirPopup .pm-name').innerText()).includes('Pavel Egorov'));
        assert.equal(await page.locator('#pirFetch').isVisible(), true);
        assert.equal(await page.locator('#pirBtnNick').isVisible(), true);
        await page.locator('#pirBtnMatch').click();
        assert((await page.locator('#pmBackdrop .pm-stat-table').innerText()).includes(side === 'home' ? '6.9' : '7.8'));
        const statText = await page.locator('#pmBackdrop .pm-stat-table').innerText();
        assert(statText.includes('정보 없음'));
        assert(!/\bnull\b/i.test(statText));
        await page.locator('#pmModalClose').click();
        assert.equal(await page.locator('#pirPopup').count(), 0);
      }
    }
    // 동명이인 후보는 평점을 임의로 붙이지 않고 실제 클릭으로 스탯 행을 선택한다.
    await page.evaluate(() => {
      const data = lineupPanelState.lastFixture;
      data.playerStats.push({ ...data.playerStats[0], rating: '8.2', minutes: 80 });
      rerenderLineupPanels();
      activatePage('main-small');
    });
    const homeRow = '#benchPanel [data-bench-side="home"] .dp-item[data-player-id="0"]';
    assert.equal(await page.locator(`${homeRow} .dp-rating`).count(), 0);
    await page.locator(`${homeRow} .dp-item-name`).click();
    await page.locator('#pirBtnMatch').click();
    assert.equal(await page.locator('[data-stat-choice]').count(), 2);
    assert((await page.locator('[data-stat-choice="1"]').innerText()).includes('80'));
    await page.locator('[data-stat-choice="1"]').click();
    assert((await page.locator('#pmBackdrop .pm-stat-table').innerText()).includes('8.2'));
    await page.locator('#pmModalClose').click();
    // 실제 ID 0 선수 클릭 → 검색 → 후보 선택 → 저장 후 경기 전환·새로고침을 확인합니다.
    await page.route('**/api/players/search**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ players: [{ id: 555001, name: '연결된 선수', fullName: '연결된 선수 전체 이름', photoUrl: '' }], page: 1, totalPages: 1 }),
    }));
    await page.evaluate(() => activatePage('main-small'));
    await page.locator('#benchPanel [data-bench-side="home"] .dp-item[data-player-id="0"] .dp-item-name').click();
    await page.locator('#pirIdInput').fill('Pavel');
    await page.locator('#pirFetch').click();
    await page.locator('.ps-result').first().click();
    await page.locator('#pirSave').click();
    const load = async id => page.evaluate(async ({ fixture, id }) => {
      fetchFixture = async requested => { const next = structuredClone(fixture); next.matchInfo.fixtureId = String(requested); return next; };
      await fetchAndApplyFixtureData(id, { silent: true }); clearPolling();
      return {
        home: lineupPanelState.lastEffectiveData.homeLineup.substitutes[0].playerId,
        away: lineupPanelState.lastEffectiveData.awayLineup.substitutes[0].playerId,
      };
    }, { fixture, id });
    const id = String(fixture.matchInfo.fixtureId);
    assert.deepEqual(await load(id), { home: 555001, away: 0 });
    assert.deepEqual(await load(String(Number(id) + 1)), { home: 0, away: 0 });
    assert.deepEqual(await load(id), { home: 555001, away: 0 });
    await page.reload();
    assert.deepEqual(await load(id), { home: 555001, away: 0 });
    // API 라인업이 비어 스탯으로 추정한 ID 0 선발 목록에서도 실제 이름 클릭이
    // 홈/원정을 식별해야 한다. 벤치 전용 조상 속성에 의존하면 이 경로가 실패한다.
    const inferred = structuredClone(fixture);
    inferred.matchInfo.fixtureId = `${id}9`;
    inferred.awayLineup = { startXi: [], substitutes: [], formation: null };
    inferred.playerStats = Array.from({ length: 12 }, (_, i) => ({
      side: 'away', playerId: i < 2 ? 0 : 700000 + i,
      playerName: `Test Starter ${i}`, playerNameKoLong: `Test Starter ${i}`,
      rating: '6.9', minutes: i < 11 ? 65 : 0, substitute: i === 11,
      number: null, position: null,
    }));
    const applyInferred = () => page.evaluate(async data => {
      fetchFixture = async () => structuredClone(data);
      await fetchAndApplyFixtureData(data.matchInfo.fixtureId, { silent: true }); clearPolling();
    }, inferred);
    await applyInferred();
    for (const layout of ['main-small', 'main-big']) {
      await page.evaluate(layout => activatePage(layout), layout);
      await settle(page);
      // 목록 폴백의 팀명도 교체 명단과 같은 팀색 라벨이며 패널 안쪽에 있어야 한다.
      const labels = await page.locator('.dp-lineup-list-wrap:visible').evaluate(wrap => {
        const panel = wrap.closest('[data-dp-role="lineup"]').getBoundingClientRect();
        return ['home', 'away'].map(side => {
          const label = wrap.querySelector(`[data-team-nickname-side="${side}"]`);
          const bench = document.querySelector(`#benchPanel [data-bench-side="${side}"] .dp-side-name`);
          const style = getComputedStyle(label), reference = getComputedStyle(bench);
          const rect = label.getBoundingClientRect();
          return { color: style.backgroundColor, reference: reference.backgroundColor,
            radius: style.borderRadius, referenceRadius: reference.borderRadius,
            inside: rect.left > panel.left && rect.right < panel.right,
            inset: parseFloat(getComputedStyle(wrap).paddingLeft) > 0 };
        });
      });
      labels.forEach(label => {
        assert.equal(label.color, label.reference);
        assert.equal(label.radius, label.referenceRadius);
        assert(label.inside && label.inset);
      });
      const starter = page.locator('.dp-item[data-player-orig-name="Test Starter 0"]:visible');
      assert.equal(await starter.locator('.dp-rating').innerText(), '6.9');
      await starter.locator('.dp-item-name').click();
      assert((await page.locator('#pirPopup .pm-avatar img').getAttribute('src')).includes('manual-player.png'));
      const buttons = await page.locator('#pirPopup .pir-actions > button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { y: rect.y, width: rect.width, inline: button.classList.contains('pm-btn-inline') };
      }));
      assert.equal(buttons.length, 3);
      assert(buttons.every(button => !button.inline && Math.abs(button.y - buttons[0].y) < 1));
      assert(Math.max(...buttons.map(b => b.width)) - Math.min(...buttons.map(b => b.width)) < 2);
      assert(await page.locator('#pirFetch').evaluate((button, y) => button.getBoundingClientRect().bottom < y, buttons[0].y));
      await page.locator('#pirBtnMatch').click();
      assert((await page.locator('#pmBackdrop .pm-stat-table').innerText()).includes('6.9'));
      await page.locator('#pmModalClose').click();
    }
    // 서로 다른 ID 0 선수의 번호는 독립적으로 저장되고 폴링/새로고침 후에도 유지된다.
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    const numberInput = index => page.locator(`.dp-grid-number-input[data-roster-key="0:${index}"]`);
    assert.equal(await page.locator('#manualGridFormation').inputValue(), '');
    assert.equal(await page.locator('#manualGridFormation option').first().innerText(), '선택 없음');
    await numberInput(0).fill('1');
    await numberInput(1).fill('2');
    await numberInput(1).blur();
    await page.locator('#manualPanelSave').click();
    const assertUnspecified = async () => assert(await page.evaluate(() => {
      const lineup = lineupPanelState.lastEffectiveData.awayLineup;
      return !lineup.formation && lineup.startXi.every(p => !p.grid)
        && lineup.startXi[0].number === '1' && lineup.startXi[1].number === '2';
    }));
    await assertUnspecified();
    await applyInferred();
    await assertUnspecified();
    await page.reload();
    await applyInferred();
    await assertUnspecified();
    // 번호만 저장했어도 후속 데이터에서 포지션으로 추정할 수 있으면 그 결과를 쓴다.
    await page.evaluate(() => {
      const data = structuredClone(lineupPanelState.lastFixture);
      const positions = ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'F', 'F', 'F'];
      data.awayLineup.startXi.forEach((p, i) => { p.pos = positions[i]; });
      applyLineupPanels(data);
      openManualPanel('lineup', 'away');
    });
    assert.equal(await page.locator('#manualGridFormation').inputValue(), '4-3-3');
    assert.equal(await numberInput(0).inputValue(), '1');
    await page.locator('#manualPanelCancel').click();
    await applyInferred();
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    assert.equal(await page.locator('#manualGridFormation').inputValue(), '');
    await page.locator('.dp-grid-row[data-slot-index="0"]').dragTo(page.locator('.dp-grid-row[data-slot-index="2"]'));
    await page.locator('#manualGridFormation').selectOption('4-4-2');
    assert.equal(await numberInput(0).inputValue(), '1');
    assert.equal(await numberInput(1).inputValue(), '2');
    await page.locator('#manualPanelSave').click();
    const assertNumbers = async () => assert.deepEqual(await page.evaluate(() =>
      lineupPanelState.lastEffectiveData.awayLineup.startXi.slice(0, 2).map(p => String(p.number))), ['1', '2']);
    await assertNumbers();
    await applyInferred();
    await assertNumbers();
    await page.reload();
    await applyInferred();
    await assertNumbers();
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    assert.equal(await numberInput(0).inputValue(), '1');
    await numberInput(0).fill('99');
    await page.locator('#manualPanelCancel').click();
    await assertNumbers();
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    await page.locator('#manualGridFormation').selectOption('');
    await page.locator('#manualPanelSave').click();
    await assertUnspecified();
    await page.evaluate(data => {
      data.matchInfo.fixtureId += '-other';
      applyLineupPanels(data);
    }, inferred);
    assert.deepEqual(await page.evaluate(() => lineupPanelState.lastEffectiveData.awayLineup.startXi.slice(0, 2).map(p => p.number || '')), ['', '']);
    // 같은 경기의 후속 폴링에 출전 스탯이 생기면, 앞서 미해결이던 교체 IN도 다시 계산한다.
    const delayed = structuredClone(inferred);
    delayed.matchInfo.fixtureId += '-delayed';
    delayed.matchInfo.elapsed = 70;
    delayed.events = [{ side: 'away', type: 'subst', elapsed: 66, playerId: 0, playerName: 'Test Starter 0', assistId: null }];
    delayed.playerStats.forEach((p, i) => { p.minutes = i === 11 ? 0 : 70; p.rating = i === 11 ? '0' : '6.9'; });
    const poll = data => page.evaluate(async data => {
      fetchFixture = async () => structuredClone(data);
      await fetchAndApplyFixtureData(data.matchInfo.fixtureId, { silent: true }); clearPolling();
      return lineupPanelState.lastEffectiveData.events[0].assistName || null;
    }, data);
    assert.equal(await poll(delayed), null);
    delayed.playerStats[0].minutes = 66;
    delayed.playerStats[11].minutes = 4;
    delayed.playerStats[11].rating = '7.4';
    assert.equal(await poll(delayed), 'Test Starter 11');
    // 구버전 캐시에 문자열 누락 표기가 남아 있어도 새로고침으로 다시 노출되지 않는다.
    await page.evaluate(() => {
      const data = JSON.parse(sessionStorage.getItem('cached_fixture_data'));
      data.matchInfo.refereeName = 'null';
      data.matchInfo.venueName = 'undefined';
      data.matchInfo.venueCity = 'null';
      data.matchInfo.leagueRound = 'null';
      data.awayLineup.coach = { name: 'null', nameKoLong: 'undefined' };
      sessionStorage.setItem('cached_fixture_data', JSON.stringify(data));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => lineupPanelState.lastFixture?.matchInfo?.refereeName === null);
    await page.evaluate(() => { clearPolling(); activatePage('main-small'); });
    assert.equal(await page.evaluate(() => lineupPanelState.lastFixture.matchInfo.refereeName), null);
    assert(!/\b(null|undefined|NaN)\b/i.test(await page.locator('#benchPanel').innerText()));
    assert.deepEqual(errors, []);
    console.log('PASS: zero-ID starter/bench ratings, actual menu clicks, candidate choice, button layout, default photos and fixture-scoped numbers across drag, formation, poll, reload and cancel.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
