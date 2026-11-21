const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const draftRoot = path.resolve(process.argv[2] || root);
(async () => {
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const relative = decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname);
      const draftFile = path.join(draftRoot, relative);
      const file = fs.existsSync(draftFile) ? draftFile : path.join(root, relative);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');

    await page.evaluate(() => {
      activatePage('main-big'); setSetting('statCycleAuto','on'); setSetting('statsAutoSwipeSec',2.5);
      const data={matchInfo:{fixtureId:'scroll-test',status:'1H',elapsed:40,homeTeamId:1,awayTeamId:2},events:Array.from({length:20},(_,i)=>({side:'home',teamId:1,type:'Goal',detail:'Normal Goal',elapsed:i+1,playerId:i+1,playerName:'Player '+i}))};
      applyEventsPanel(data,{animate:false}); _lpAutoClear(); window._lpStatMatchInfoAvailable=true; _lpStatCycle.mode='match_info'; lpStatUpdateVisibility();
    });
    await page.waitForTimeout(100);
    await page.evaluate(()=>{
      const data=structuredClone(window._eventsLastData);
      data.events.push({side:'home',teamId:1,type:'Goal',detail:'Normal Goal',elapsed:40,playerId:999,playerName:'NEW TEST'});
      window._eventsLastData=data;
      const prepared=lpStatPrepareForNewEvent(); applyEventsPanel(data); if(prepared)lpStatResumeAfterNewEventRendered();
    });
    const snapshot=()=>page.evaluate(()=>{
      const el=document.querySelector('.layout-big .lp-stat .ev-list');
      const row=[...el.children].find(row=>row.textContent.includes('NEW TEST'));
      return {mode:_lpStatCycle.mode,top:el.scrollTop,max:el.scrollHeight-el.clientHeight,
        held:row.classList.contains('ev-row-glow-held'),shadow:getComputedStyle(row).boxShadow,
        transition:getComputedStyle(row).transitionProperty,visible:row.getBoundingClientRect().bottom>el.getBoundingClientRect().top && row.getBoundingClientRect().top<el.getBoundingClientRect().bottom};
    });
    await page.waitForTimeout(100);
    let state=await snapshot();
    assert.equal(state.mode,'events'); assert.equal(state.top,0);
    assert(state.visible && state.held); assert(state.transition.includes('transform'));
    assert.notEqual(state.shadow,'none');
    await page.waitForTimeout(4900);
    await page.waitForFunction(()=>{const el=document.querySelector('.layout-big .lp-stat .ev-list');return el.scrollTop>400;});
    const bottom=await snapshot(); assert(bottom.held);
    await page.waitForTimeout(1500);
    const before=await snapshot(); assert(before.top<bottom.top && before.top>0);
    await page.evaluate(()=>applyEventsPanel(window._eventsLastData));
    await page.waitForTimeout(500);
    const after=await snapshot(); assert(after.top<before.top && after.top>0,'polling must keep scrolling the visible list');
    assert(after.held); assert.notEqual(after.shadow,'none');
    await page.waitForFunction(()=>document.querySelector('.layout-big .lp-stat .ev-list').scrollTop===0,{},{timeout:20000});
    assert.equal((await snapshot()).held,true,'glow survives until panel transition');
    await page.waitForFunction(()=>_lpStatCycle.mode==='match_info');
    assert.equal((await snapshot()).held,false);
    assert.deepEqual(errors,[]);
    console.log('PASS: visible top insertion, five-second hold, bottom-to-top scroll, polling continuity, glow through completion and previous-panel return.');

    // 여기까지는 실제 시간으로 새 이벤트의 삽입과 이동을 관찰한다. 이후에는 긴 상대전적과
    // 이벤트 구간 알림의 대기를 가상 시계로 진행한다. 실제 시계에서 만든 예약을 먼저
    // 정리하지 않으면 설치 뒤 clearTimeout()으로 정리되지 않는 기존 예약이 남을 수 있다.
    // 그러면 수동으로 선택한 패널이 이전 자동 전환에 의해 바뀌어 검증 결과가 흔들린다.
    await page.evaluate(() => { setSetting('statCycleAuto', 'off'); _lpAutoClear(); });
    await page.clock.install();
    const baseFixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/1637598-lineup.json'), 'utf8'));
    // 긴 상대전적과 후보명단도 실제 DOM 교체/폴링 뒤 스크롤을 이어간다.
    // 후보를 60명 넣어 기본 패널 크기에서도 2열로 모두 표시할 수 없는 조건을 만든다.
    // 실제 서비스의 명단 정원을 뜻하는 값이 아니라, 스크롤 경로를 확실히 실행하는 데이터다.
    await page.evaluate(async fixture => {
      setSetting('statCycleAuto', 'off');
      window.scrollFixture = structuredClone(fixture);
      const players = Array.from({ length: 60 }, (_, i) => ({ playerId: 90000 + i, number: i + 1, name: `후보 선수 ${i}` }));
      scrollFixture.homeLineup.substitutes = players;
      scrollFixture.awayLineup.substitutes = players;
      fetchFixture = async () => structuredClone(scrollFixture);
      await fetchAndApplyFixtureData(scrollFixture.matchInfo.fixtureId, { silent: true }); clearPolling();
      window.scrollHth = { matches: Array.from({ length: 35 }, (_, i) => ({
        fixtureId: i + 1, date: '2020-01-01T12:00:00Z', homeTeamId: fixture.matchInfo.homeTeamId,
        awayTeamId: fixture.matchInfo.awayTeamId, homeTeamName: '홈 팀', awayTeamName: '원정 팀',
        homeScore: 1, awayScore: 0, leagueName: '테스트 대회', venueName: '경기장'
      })) };
      applyHthPanel(scrollHth, scrollFixture);
    }, baseFixture);
    for (const view of ['main-big', 'main-small']) {
      // 두 레이아웃의 수동 위치 보존부터 확인한다. 이 구간은 자동 전환을 꺼 두어
      // 사용자가 읽던 위치를 재렌더가 바꾸는 문제와 자동 이동 자체의 문제를 구분한다.
      const selector = view === 'main-big' ? '.layout-big .hth-list' : '.lp-events-s .hth-list';
      await page.evaluate(view => {
        setSetting('statCycleAuto', 'off'); activatePage(view); _lpAutoClear();
        if (view === 'main-small') hthSetMode('hth');
        else { _lpStatCycle.mode = 'hth'; lpStatUpdateVisibility(); }
      }, view);
      await page.clock.runFor(100);
      await page.locator(selector).evaluate(list => { list.scrollTop = 200; });
      const before = await page.locator(selector).evaluate(list => list.scrollTop);
      assert(before > 0, `${view}: long HTH overflows: ${JSON.stringify(await page.locator(selector).evaluate(list => ({ mode: _lpStatCycle.mode, height: list.clientHeight, total: list.scrollHeight, rows: list.children.length, display: getComputedStyle(list.parentElement).display, available: lpStatAvailableModes() })))}`);
      await page.evaluate(() => applyHthPanel(scrollHth, scrollFixture));
      await page.clock.runFor(50);
      assert.equal(await page.locator(selector).evaluate(list => list.scrollTop), before, `${view}: HTH rerender retains manual position`);
    }
    await page.evaluate(() => {
      activatePage('main-big'); setSetting('statsAutoSwipeSec', 2.5); setSetting('statCycleAuto', 'on');
      _lpAutoClear(); _lpStatCycle.mode = 'hth'; lpStatUpdateVisibility();
    });
    await page.clock.runFor(2600);
    assert.equal(await page.locator('.layout-big .hth-list').evaluate(list => list.scrollTop), 0, 'HTH first holds the newest matches for three seconds');
    await page.clock.runFor(2200);
    const hthBefore = await page.locator('.layout-big .hth-list').evaluate(list => list.scrollTop);
    await page.evaluate(() => applyHthPanel(scrollHth, scrollFixture));
    await page.clock.runFor(600);
    const hthAfter = await page.locator('.layout-big .hth-list').evaluate(list => list.scrollTop);
    assert(hthAfter > 0 && hthAfter < hthBefore, 'HTH auto scroll continues on the new visible list');
    const remainingHthTravel = await page.evaluate(() => {
      const interval = _lpGetIntervalMs();
      return _lpHthScrollOptions(interval).scrollDurationMs + interval * 0.1 - 2400 + 100;
    });
    // 시작과 이동 중의 위치는 위에서 실제 rAF로 검사했다. 남은 긴 이동은 마지막
    // 프레임까지 건너뛰어, 재렌더 뒤에도 끝 위치에 도달하는지 별도로 확인한다.
    await page.clock.fastForward(remainingHthTravel);
    assert.equal(await page.locator('.layout-big .hth-list').evaluate(list => list.scrollTop), 0, 'long HTH finishes the full scroll after rerender');
    for (const side of ['home', 'away']) {
      await page.evaluate(side => {
        _lpAutoClear(); _lpStatCycle.mode = `bench_${side}`;
        const host = document.querySelector(`.layout-big [data-bench-${side}-panel]`);
        host.removeAttribute('data-bench-scroll');
        const panel = host.closest('.lp-stat'); panel.style.height = '160px'; panel.style.flex = '0 0 160px';
        lpStatUpdateVisibility();
      }, side);
      await page.clock.runFor(800);
      const selector = `.layout-big [data-bench-${side}-panel] .bc-body`;
      const before = await page.locator(selector).evaluate(list => list.scrollTop);
      assert(before > 0, `${side}: hidden bench starts scrolling after layout`);
      const rebalanced = await page.evaluate(side => {
        const panel = document.querySelector(`.layout-big [data-bench-${side}-panel]`);
        const list = panel.querySelector('.bc-body'), before = list.scrollTop;
        lpBenchCycleRebalance(panel);
        return { before, after: list.scrollTop };
      }, side);
      assert.equal(rebalanced.after, rebalanced.before, `${side}: rebalancing retains scroll position`);
      const replacement = await page.evaluate(side => {
        const panel = document.querySelector(`.layout-big [data-bench-${side}-panel]`);
        const previous = panel.querySelector('.bc-body'), top = previous.scrollTop;
        renderBenchCyclePanels(scrollFixture);
        // 브라우저가 제거된 목록에 전달하는 늦은 scroll 이벤트를 재현한다.
        // 새 목록의 위치를 같은 작업 안에서 읽어 다음 프레임의 자동 이동이 잘못된
        // 초기화를 덮어주기 전에, 렌더 함수 자체가 즉시 위치를 넘겼는지 확인한다.
        previous.dispatchEvent(new Event('scroll'));
        return { before: top, after: panel.querySelector('.bc-body').scrollTop };
      }, side);
      assert(Math.abs(replacement.after - replacement.before) <= 1, `${side}: replacement restores position before the next frame: ${JSON.stringify(replacement)}`);
      await page.clock.runFor(200);
      const after = await page.locator(selector).evaluate(list => list.scrollTop);
      assert(after > before, `${side}: polling preserves bench auto scroll`);
    }
    await page.evaluate(() => { activatePage('main-small'); _lpAutoClear(); });
    // 작은 레이아웃은 두 팀의 목록이 동시에 보인다. 한쪽만 우연히 움직인 경우가
    // 통과하지 않도록 두 목록을 모두 확인한 뒤, 한쪽 조작과 전체 자동 해제를 구분한다.
    await page.clock.runFor(1400);
    const smallSelector = '#benchPanel .dp-list';
    const beforeSmall = await page.locator(smallSelector).evaluateAll(lists => lists.map(list => list.scrollTop));
    assert(beforeSmall.every(top => top > 0), 'small camera scrolls both bench lists');
    await page.evaluate(() => renderBenchPanel(scrollFixture, scrollFixture));
    await page.clock.runFor(250);
    const afterSmall = await page.locator(smallSelector).evaluateAll(lists => lists.map(list => list.scrollTop));
    assert(afterSmall.every((top, i) => top > beforeSmall[i]), 'small camera polling continues both lists');
    await page.locator(smallSelector).first().dispatchEvent('wheel');
    const manualTop = await page.locator(smallSelector).first().evaluate(list => list.scrollTop);
    await page.clock.runFor(500);
    assert.equal(await page.locator(smallSelector).first().evaluate(list => list.scrollTop), manualTop, 'manual scroll interrupts small bench animation');
    await page.evaluate(() => setSetting('statCycleAuto', 'off'));
    const stopped = await page.locator(smallSelector).evaluateAll(lists => lists.map(list => list.scrollTop));
    await page.clock.runFor(500);
    assert.deepEqual(await page.locator(smallSelector).evaluateAll(lists => lists.map(list => list.scrollTop)), stopped, 'auto off stops small bench animation');
    await page.evaluate(() => {
      const panel = document.querySelector('.layout-big .lp-stat'); panel.style.height = ''; panel.style.flex = '';
    });
    assert.deepEqual(errors, []);
    console.log('PASS: both camera HTH positions, HTH and both bench polling continuity, small bench manual interruption and auto off.');
    let fixtureId = 20261020;
    async function poll(status, elapsed, penalties = false) {
      await page.evaluate(async ({ status, elapsed, penalties }) => {
        Object.assign(window.spotlightFixture.matchInfo, { status, elapsed,
          homePenaltyScore: penalties ? 4 : null, awayPenaltyScore: penalties ? 3 : null });
        await fetchAndApplyFixtureData(window.spotlightFixture.matchInfo.fixtureId, { silent: true });
        clearPolling();
      }, { status, elapsed, penalties });
      await page.clock.runFor(50);
    }
    const notice = () => page.locator('.ev-spotlight:not([hidden])');
    let transparencyChecked = false;
    async function expectNotice(text) {
      assert.equal((await notice().innerText()).trim(), text);
      if (!transparencyChecked) {
        for (const transparency of [0, 50, 100]) {
          await page.evaluate(value => setSetting('panelAlpha', value), transparency);
          const result = await notice().evaluate(host => ({ background: getComputedStyle(host).backgroundColor, textOpacity: getComputedStyle(host.querySelector('.ev-row')).opacity }));
          const rgba = result.background.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
          assert.equal(rgba ? Number(rgba[1]) : 1, (100 - transparency) / 100);
          assert.equal(result.textOpacity, '1');
        }
        await page.evaluate(() => setSetting('panelAlpha', 25));
        transparencyChecked = true;
      }
      await page.clock.runFor(5400);
      assert.equal(await notice().count(), 0);
    }
    for (const layout of ['main-big', 'main-small']) {
      async function start(status, elapsed) {
        await page.evaluate(async ({ fixture, id, status, elapsed, layout }) => {
          setSetting('statCycleAuto', 'off'); setSetting('eventSpotlight', 'board');
          window.spotlightFixture = structuredClone(fixture);
          Object.assign(window.spotlightFixture.matchInfo, { fixtureId: id, status, elapsed, homePenaltyScore: null, awayPenaltyScore: null });
          window.spotlightFixture.events = [];
          fetchFixture = async () => structuredClone(window.spotlightFixture);
          await fetchAndApplyFixtureData(id, { silent: true }); clearPolling(); activatePage(layout);
        }, { fixture: baseFixture, id: ++fixtureId, status, elapsed, layout });
        await page.clock.runFor(50);
        assert.equal(await notice().count(), 0, '첫 조회는 과거 구간을 알리지 않는다.');
      }
      await start('1H', 30);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      for (const end of [3, 7]) {
        await page.evaluate(end => {
          const events = window.spotlightFixture.events;
          while (events.length < end) {
            const minute = events.length + 1;
            events.push({ type: 'Card', detail: 'Yellow Card', side: 'home', elapsed: minute, playerName: '경고선수' + minute });
          }
        }, end);
        await poll('1H', 30);
      }
      await page.clock.fastForward(6500);
      assert.equal(await notice().count(), 0);
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await poll('1H', 30);
      for (let minute = 3; minute <= 7; minute++) {
        assert((await notice().innerText()).includes('경고선수' + minute));
        await page.clock.runFor(5350);
      }
      assert.equal(await notice().count(), 0);
      await start('1H', 44);
      await poll('HT', 45); await expectNotice('하프타임');
      await poll('HT', 45); assert.equal(await notice().count(), 0, '같은 하프타임을 중복 알리지 않는다.');
      await poll('2H', 70); assert.equal(await notice().count(), 0);
      await poll('FT', 90); await expectNotice('풀타임');

      await start('2H', 89);
      await poll('BT', 90); await expectNotice('후반종료');
      await poll('PSO', 90, true);
      assert.equal(await notice().count(), 0, '직행 승부차기는 연장 종료 알림을 만들지 않는다.');
      assert.equal(await page.locator('.ev-period-marker').filter({ hasText: '연장' }).count(), 0);
      await poll('FT', 90, true); await expectNotice('풀타임');

      await start('2H', 89);
      await poll('ET1', 91); await expectNotice('후반종료');
      await poll('ET2', 106); await expectNotice('연장 전반 종료');
      await poll('PSO', 120, true); await expectNotice('연장 후반 종료');
      await poll('FT', 120, true); await expectNotice('풀타임');

      // 90분 고정 기록과 카라바오컵의 91분부터 증가하는 기록 모두 직행으로 처리합니다.
      for (const startMinute of [90, 91]) {
        await start('2H', 89);
        await poll('BT', 90); await expectNotice('후반종료');
        await page.evaluate(startMinute => {
          window.spotlightFixture.events = [
            { elapsed: 90, extra: 2, side: 'away', playerName: 'Card', type: 'Card', detail: 'Yellow Card' },
            { elapsed: startMinute, extra: null, side: 'home', playerName: 'Penalty', type: 'Goal', detail: 'Penalty', comments: 'Penalty Shootout' },
            { elapsed: startMinute + 9, extra: null, side: 'away', playerName: 'Last Penalty', type: 'Goal', detail: 'Penalty', comments: 'Penalty Shootout' }
          ];
        }, startMinute);
        await poll('PSO', 120, true);
        assert.equal(await page.locator('.ev-period-marker').filter({ hasText: '연장' }).count(), 0);
        assert(!(await notice().innerText()).includes('연장'));
        await page.evaluate(() => { setSetting('eventSpotlight', 'off'); setSetting('eventSpotlight', 'board'); });
        await poll('FT', 120, true); await expectNotice('풀타임');
        assert.equal(await page.locator('.ev-period-marker').filter({ hasText: '연장' }).count(), 0);
      }
    }
    // 크기 조절 견본은 설정창 위에 실제 배율로 보이며 경기 데이터와 신규 감지 상태를 바꾸지 않는다.
    await page.evaluate(() => { clearPolling(); setSetting('eventSpotlight', 'off'); openSettingsPopup(); });
    await page.getByRole('button', { name: '설정 검색', exact: true }).click();
    await page.getByRole('searchbox', { name: '설정 검색어' }).fill('신규 이벤트 표시 크기');
    const size = page.locator('#settingsBackdrop [data-settings-slider="eventSpotlightScale"]');
    const preview = page.locator('.ev-spotlight-preview.is-visible');
    const fixtureBefore = await page.evaluate(() => JSON.stringify(window._eventsLastData));
    for (const layout of ['main-big', 'main-small', 'schedule']) {
      await page.evaluate(layout => activatePage(layout), layout);
      await size.fill('125'); await size.fill('150');
      await page.clock.runFor(700);
      assert.equal(await preview.count(), 1, '연속 조절 후 견본은 하나만 표시한다.');
      await preview.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      assert((await preview.innerText()).includes('미리보기 득점자'));
      const first = await preview.boundingBox();
      assert(first.width > 0 && first.height > 0, layout);
      const style = await preview.evaluate(el => ({ z: Number(getComputedStyle(el).zIndex), settingsZ: Number(getComputedStyle(document.getElementById('settingsBackdrop')).zIndex), pointer: getComputedStyle(el).pointerEvents }));
      assert(style.z > style.settingsZ, '열린 설정창보다 위에 표시한다.');
      assert.equal(style.pointer, 'none', '견본이 설정 조작을 막지 않는다.');
      await size.fill('200'); await page.clock.runFor(700);
      await preview.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      const enlarged = await preview.boundingBox();
      assert(Math.abs(enlarged.width / first.width - 200 / 150) < .01, '실제 선택 배율대로 확대한다.');
      assert.equal(await page.evaluate(() => getSetting('eventSpotlight')), 'off', 'OFF 상태도 임시 견본만 표시한다.');
      assert.equal(await page.evaluate(() => JSON.stringify(window._eventsLastData)), fixtureBefore);
      if (layout === 'main-small') {
        fs.mkdirSync(path.join(root, 'screenshots/tests'), { recursive: true });
        await page.screenshot({ path: path.join(root, 'screenshots/tests/event-size-preview.png') });
      }
      await page.clock.runFor(5200);
      assert.equal(await preview.count(), 0, '견본은 자동으로 사라진다.');
    }
    await page.evaluate(() => {
      closeSettingsPopup(); activatePage('main-big'); setSetting('eventSpotlight', 'board');
      window.previewSource = document.createElement('div'); previewSource.innerHTML = '<div class="ev-list"></div>';
      evSpotlightAfterRender('after-preview', [previewSource]);
      evSpotlightPreview();
    });
    await page.clock.runFor(700);
    await page.evaluate(() => {
      previewSource.firstChild.append(evCreateRow({ type: 'Goal', detail: 'Normal Goal', side: 'home', playerName: '실제 신규 이벤트', elapsed: 89 }, { matchInfo: { status: '2H', elapsed: 89 } }, 'actual-after-preview'));
      evSpotlightMarkNewEvents(); evSpotlightAfterRender('after-preview', [previewSource]);
    });
    await page.clock.runFor(100);
    assert.equal(await preview.count(), 0, '실제 이벤트가 들어오면 견본을 치운다.');
    const actual = page.locator('.ev-spotlight:not(.ev-spotlight-preview).is-visible');
    assert((await actual.innerText()).includes('실제 신규 이벤트'));
    await actual.click();
    await page.clock.runFor(5400);
    const menu = page.getByRole('dialog', { name: '신규 이벤트 표시 크기', exact: true });
    await menu.getByRole('slider').fill('175');
    await page.clock.runFor(700);
    assert.equal(await preview.count(), 1, '팝업의 빠른 크기 메뉴에서도 견본을 표시한다.');
    await menu.getByRole('button', { name: '초기화', exact: true }).click();
    await page.clock.runFor(700);
    assert.equal(await page.evaluate(() => getSetting('eventSpotlightScale')), 125);
    assert.equal(await preview.count(), 1);
    await page.clock.runFor(5200);
    assert.deepEqual(errors, []);
    console.log('PASS: event lifecycle and size previews in both camera layouts, settings/schedule, quick menu, actual scale, cleanup and real-event priority.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });


