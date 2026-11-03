const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const draftRoot = path.resolve(process.argv[2] || root);
(async () => {
  const browser = await chromium.launch({ headless: true });
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

    // 이벤트 개수가 그대로인 상태 변경도 실제 폴링 경로로 알림을 띄워야 합니다.
    await page.clock.install();
    const baseFixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/1637598-lineup.json'), 'utf8'));
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


