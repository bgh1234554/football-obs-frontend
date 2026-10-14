const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const calls = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/players/search') {
        const query = url.searchParams.get('query');
        const rawPage = Number(url.searchParams.get('page'));
        calls.push({ query, page: rawPage });
        if (query === 'Error') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'Provider unavailable' }) });
        const byId = /^[0-9]+$/.test(query);
        const count = query === 'Empty' ? 0 : byId ? 1 : rawPage === 1 ? 250 : 7;
        const players = Array.from({ length: count }, (_, i) => ({ id: byId ? Number(query) : rawPage * 1000 + i, name: `후보 ${rawPage}-${i}`, fullName: `후보 선수 ${rawPage}-${i}`, englishName: `German Ivan ${rawPage}-${i}`, nationality: 'Testland', age: 25, number: 19, photoUrl: 'http://localhost/resources/imgs/manual-player.png' }));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ players, page: rawPage, totalPages: byId || !count ? 1 : 2 }) });
      }
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.addStyleTag({ content: '.pm-popup { animation: none !important; }' });
    await page.evaluate(() => {
      const lineup = { formation: '4-4-2', startXi: Array.from({ length: 10 }, (_, i) => ({ playerId: i === 0 ? 0 : 100 + i, name: `API ${i}`, origName: `API ${i}`, grid: buildManualGridValues('4-4-2')[i] })), substitutes: [] };
      applyLineupPanels({ matchInfo: { fixtureId: 'search-test', homeTeamId: 1, awayTeamId: 2, homeTeamName: 'Home', awayTeamName: 'Away' }, homeLineup: structuredClone(lineup), awayLineup: lineup, events: [], playerStats: [], homeInjuries: [], awayInjuries: [] });
      pirShowMenu('away', 'API 0', 950, 700);
    });
    const input = page.locator('#pirIdInput');
    await input.fill(' German Iva');
    const before = await page.locator('#pirPopup').boundingBox();
    await page.locator('#pirFetch').click();
    await page.locator('.ps-result').first().waitFor();
    assert((await page.locator('.ps-result').count()) < 250);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].query, ' German Iva');
    const after = await page.locator('#pirPopup').boundingBox();
    assert(Math.abs(after.height - before.height) < 1, 'Popup height must stay fixed');
    assert(after.width > before.width + 200, 'Results must expand to the right');
    assert(after.x >= 0 && after.x + after.width <= 1600, 'Expanded popup must remain inside viewport');
    // 상단을 늘리면 실제로 보이는 후보 수가 증가하고 페이지 이동 후에도 높이를 유지한다.
    const visibleResults = () => page.locator('.ps-results').evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return [...el.children].filter(item => { const r = item.getBoundingClientRect(); return r.top >= bounds.top && r.bottom <= bounds.bottom; }).length;
    });
    const initialVisible = await visibleResults();
    assert.equal(initialVisible, await page.locator('.ps-result').count(), 'Every candidate must fit without a long scrollbar');
    const handle = await page.locator('#pirPopup .ps-height-resize-top').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 220, { steps: 10 });
    await page.mouse.up();
    const resized = await page.locator('#pirPopup').boundingBox();
    await page.waitForTimeout(50);
    const resizedCount = await page.locator('.ps-result').count();
    assert(resized.height > after.height + 200, 'Dragging upward must enlarge results');
    assert(Math.abs(resized.y + resized.height - after.y - after.height) < 2, 'Bottom edge must stay anchored');
    assert(await visibleResults() > Math.max(5, initialVisible), 'Resizing must show more candidates, without a five-result limit');
    assert.equal(await visibleResults(), resizedCount, 'Resized page must fit all rendered candidates');
    const bottomHandle = await page.locator('#pirPopup .ps-height-resize-bottom').boundingBox();
    await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y + 4);
    await page.mouse.down();
    await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y - 116, { steps: 8 });
    await page.mouse.up();
    const shorter = await page.locator('#pirPopup').boundingBox();
    assert(Math.abs(shorter.y - resized.y) < 1, 'Bottom resize must preserve top position');
    assert(shorter.height < resized.height - 100);
    const lowerHandle = await page.locator('#pirPopup .ps-height-resize-bottom').boundingBox();
    await page.mouse.move(lowerHandle.x + lowerHandle.width / 2, lowerHandle.y + 4);
    await page.mouse.down();
    await page.mouse.move(lowerHandle.x + lowerHandle.width / 2, lowerHandle.y + 124, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    const restored = await page.locator('#pirPopup').boundingBox();
    assert(Math.abs(restored.height - resized.height) < 2, 'Dragging bottom downward must enlarge popup');
    assert.equal(await page.locator('.ps-result').count(), resizedCount, 'Bottom expansion must restore candidate capacity');
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.locator('#pirPopup').screenshot({ path: path.join(root, 'screenshots/player-search-popup.png') });
    await page.locator('[data-ps-page="1"]').click();
    await page.waitForFunction(() => document.querySelector('.ps-pagination span')?.textContent === '2페이지');
    assert.equal(await page.locator('.ps-pagination span').innerText(), '2페이지');
    assert.equal(calls.length, 1, 'Local pagination must reuse cached results');
    assert(Math.abs((await page.locator('#pirPopup').boundingBox()).height - resized.height) < 1, 'Pagination must preserve resized height');
    await page.evaluate(async () => {
      const snapshots = [];
      const search = createPlayerSearch({ onChange: () => {}, onSelect: () => {} });
      search.setPageSize(250);
      await search.search('Smith');
      snapshots.push({ raw: search.state.rawPage, local: search.state.localPage, screen: search.state.screenPage });
      await search.move(1);
      snapshots.push({ raw: search.state.rawPage, local: search.state.localPage, screen: search.state.screenPage });
      await search.move(-1);
      snapshots.push({ raw: search.state.rawPage, local: search.state.localPage, screen: search.state.screenPage });
      window.searchSnapshots = snapshots;
    });
    assert.deepEqual(await page.evaluate(() => window.searchSnapshots), [{ raw: 1, local: 0, screen: 1 }, { raw: 2, local: 0, screen: 2 }, { raw: 1, local: 0, screen: 1 }]);
    assert.deepEqual(calls.filter(c => c.query === 'Smith').map(c => c.page), [1, 2]);
    const boundary = await page.evaluate(async () => {
      const model = createPlayerSearch({ onChange: () => {}, onSelect: () => {} });
      model.setPageSize(7);
      await model.search('Boundary');
      for (let i = 0; i < 36; i++) await model.move(1);
      const next = [model.state.rawPage, model.state.localPage, model.state.screenPage];
      await model.move(-1);
      const previous = [model.state.rawPage, model.state.localPage, model.state.screenPage];
      model.setPageSize(10);
      return { next, previous, resized: [model.state.rawPage, model.state.localPage, model.state.screenPage] };
    });
    assert.deepEqual(boundary, { next: [2, 0, 37], previous: [1, 35, 36], resized: [1, 24, 25] });
    assert.deepEqual(calls.filter(c => c.query === 'Boundary').map(c => c.page), [1, 2], 'Only crossing the raw-page boundary may fetch');
    await page.locator('.ps-result').first().click();
    assert.equal(await input.inputValue(), String(1000 + resizedCount));
    await page.locator('#pirSave').click();
    assert.equal(await page.evaluate(() => pirGetByKey(pirMakeNameKey('search-test', 'away', 'API 0')).playerId), 1000 + resizedCount);

    // ID 검색도 명시적으로 후보를 선택하고 입력 변경·취소는 저장하지 않는다.
    await page.evaluate(() => pirShowMenu('home', 'API 0', 500, 300));
    await input.fill('6789');
    await input.press('Enter');
    await page.locator('.ps-result').waitFor();
    assert.equal(await page.locator('.ps-result').count(), 1);
    await page.locator('.ps-result').click();
    await input.fill('Unselected');
    await page.locator('#pirSave').click();
    assert(await page.locator('#pirPopup').isVisible());
    await input.fill('1e3');
    await page.locator('#pirSave').click();
    assert(await page.locator('#pirPopup').isVisible());
    await page.locator('#pirCancel').click();
    assert.equal(await page.evaluate(() => pirGetByKey(pirMakeNameKey('search-test', 'home', 'API 0'))), null);

    // 빈 슬롯은 모달 높이와 선수 행 높이를 유지하고 오른쪽 후보 선택 후 프로필을 적용한다.
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    await page.locator('.dp-grid-slot-edit').click();
    const field = name => page.locator(`.dp-grid-slot-input[data-field="${name}"]`);
    await field('name').fill('Manual name');
    await field('number').fill('99');
    await field('playerId').fill('German Iva');
    const modalBefore = await page.locator('#manualPanelBackdrop .dp-manual-modal').boundingBox();
    const rowBefore = await page.locator('.has-slot-input').boundingBox();
    await page.locator('.dp-grid-slot-search').click();
    await page.locator('.ps-result').first().waitFor();
    assert((await page.locator('.ps-result').count()) > 5);
    const modalAfter = await page.locator('#manualPanelBackdrop .dp-manual-modal').boundingBox();
    const rowAfter = await page.locator('.has-slot-input').boundingBox();
    assert(Math.abs(modalAfter.height - modalBefore.height) < 1, 'Modal height must stay fixed');
    assert(Math.abs(rowAfter.height - rowBefore.height) < 1, 'Player row height must stay fixed');
    assert(modalAfter.width > modalBefore.width + 200);
    await page.locator('#manualPanelBackdrop .dp-manual-modal').screenshot({ path: path.join(root, 'screenshots/player-search-slot.png') });
    await page.locator('.ps-result').nth(1).click();
    assert.equal(await field('playerId').inputValue(), '1001');
    assert.equal(await field('number').inputValue(), '99');
    await page.locator('.dp-grid-slot-apply[data-photo="replace"]').click();
    await page.locator('#manualPanelSave').click();
    assert.equal(await page.evaluate(() => getManualEntry('search-test').away.lineup.manualSlots[0].playerId), 1001);
    // 선발 보충 선수도 완료/수정/삭제가 가능하고 취소는 저장된 선수를 복원한다.
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    await page.locator('.dp-grid-slot-done').click();
    assert.equal(await page.locator('.has-slot-input').count(), 0);
    await page.locator('.dp-grid-slot-reopen').click();
    assert.equal(await field('playerId').inputValue(), '1001');
    await page.evaluate(() => {
      window.originalSlotFetch = window.fetchPlayerSearch;
      window.fetchPlayerSearch = () => new Promise(resolve => { window.resolveDeletedSlot = resolve; });
    });
    await field('playerId').fill('Pending');
    await page.locator('.dp-grid-slot-search').click();
    await page.locator('.ps-message').waitFor();
    await page.locator('.dp-slot-delete').click();
    await page.evaluate(async () => {
      window.resolveDeletedSlot({ players: [{ id: 777, name: 'Too late' }], page: 1, totalPages: 1 });
      window.fetchPlayerSearch = window.originalSlotFetch;
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    assert.equal(await page.locator('.ps-side-panel').count(), 0, 'Deleted slot must ignore late search results');
    assert.equal(await page.locator('.dp-slot-delete').count(), 0);
    assert.equal(await page.locator('#manualGridList .dp-grid-row').count(), 11, 'Deletion must keep the formation slot');
    await page.locator('#manualPanelCancel').click();
    assert.equal(await page.evaluate(() => getManualEntry('search-test').away.lineup.manualSlots[0].playerId), 1001);
    await page.evaluate(() => openManualPanel('lineup', 'away'));
    await page.locator('.dp-slot-delete').click();
    await page.locator('#manualPanelSave').click();
    assert.equal(await page.evaluate(() => getManualEntry('search-test').away.lineup.manualSlots.length), 0);
    assert.equal(await page.evaluate(() => buildEffectiveFixtureData(lineupPanelState.lastFixture).awayLineup.startXi.length), 10, 'API starters must survive supplement deletion');

    // 기존 ID 수정 팝업에서도 같은 검색·사진 유지 기능을 사용한다.
    await page.evaluate(() => {
      const c = pmContainer();
      c.innerHTML = '<div class="pm-popup" id="pmPopup"></div>';
      pmShowIdInput(101, { _side: 'away', playerId: 101, name: 'API 1', photoUrl: 'http://localhost/resources/imgs/manual-player.png?old' }, 'API 1', 100, 100);
    });
    await page.locator('#pmIdInput').fill('German');
    await page.locator('#pmIdFetch').click();
    await page.locator('.ps-result').first().waitFor();
    await page.locator('.ps-result').first().click();
    await page.locator('#pmPhotoKeep').click();
    await page.locator('#pmIdSave').click();
    const changed = await page.evaluate(() => pirGetByKey(pirMakeIdKey('search-test', 'away', 101)));
    assert.equal(changed.playerId, 1000);
    assert(changed.photoUrl.endsWith('?old'));

    // 교체 명단도 같은 슬롯 UI를 쓰며 기존 선수 정보와 취소/저장 의미를 보존한다.
    await page.evaluate(() => {
      pmHideAll();
      const fixture = structuredClone(lineupPanelState.lastFixture);
      fixture.homeLineup.substitutes = [
        { playerId: 501, name: 'Original bench', origName: 'Original bench', number: 8, photoUrl: 'http://localhost/resources/imgs/manual-player.png?original', pos: 'M' },
        { playerId: 0, name: 'Zero ID bench', number: 9 },
      ];
      applyLineupPanels(fixture);
      openManualPanel('bench', 'home');
    });
    const benchRow = index => page.locator(`.dp-bench-row[data-slot-index="${index}"]`);
    assert.equal(await benchRow(0).locator('input').count(), 0, 'Existing bench player must be a fixed label');
    assert((await benchRow(0).innerText()).includes('Original bench'));
    await page.locator('[name="bench-coach"]').fill('Manual coach');
    await page.locator('#manualPanelSave').click();
    assert.equal(await page.evaluate(() => getManualEntry('search-test').home.bench), undefined, 'Coach-only save must not override API players');
    await page.evaluate(() => openManualPanel('bench', 'home'));
    await benchRow(2).locator('.dp-bench-slot-edit').click();
    await benchRow(2).locator('[data-field="number"]').fill('77');
    await benchRow(2).locator('[data-field="name"]').fill('Manual bench');
    await benchRow(2).locator('.dp-bench-slot-done').click();
    assert.equal(await benchRow(2).locator('input').count(), 0);
    assert((await benchRow(2).innerText()).includes('Manual bench'));
    await page.locator('#manualPanelCancel').click();
    assert.equal(await page.evaluate(() => getManualEntry('search-test')?.home?.bench), undefined, 'Cancel must discard bench drafts');
    await page.evaluate(() => openManualPanel('bench', 'home'));
    assert(!(await benchRow(2).innerText()).includes('Manual bench'));
    await benchRow(2).locator('.dp-bench-slot-edit').click();
    await benchRow(2).locator('[data-field="number"]').fill('77');
    await benchRow(2).locator('[data-field="name"]').fill('Manual bench');
    await benchRow(2).locator('.dp-bench-slot-done').click();
    await benchRow(3).locator('.dp-bench-slot-edit').click();
    await benchRow(3).locator('[data-field="playerId"]').fill('German');
    await benchRow(3).locator('.dp-grid-slot-search').click();
    await page.locator('.ps-result').first().waitFor();
    assert((await page.locator('.ps-result').count()) > 5, 'Bench results must fit the full modal height');
    assert(await benchRow(3).evaluate(row => [...row.querySelectorAll('input, button')].every(field => field.getBoundingClientRect().right <= row.getBoundingClientRect().right)), 'Horizontal bench controls must fit within the player row');
    await page.locator('#manualPanelBackdrop .dp-manual-modal').screenshot({ path: path.join(root, 'screenshots/player-search-bench-edit.png') });
    await page.locator('.ps-result').nth(1).click();
    await page.locator('.dp-grid-slot-apply[data-photo="replace"]').click();
    assert.equal(await benchRow(3).locator('input').count(), 0, 'Selected bench player must become a fixed label');
    // 다른 행에서 검색하면 높이 관찰도 새 검색 모델로 연결한다.
    await benchRow(4).locator('.dp-bench-slot-edit').click();
    await benchRow(4).locator('[data-field="playerId"]').fill('6789');
    await benchRow(4).locator('[data-field="playerId"]').press('Enter');
    await page.locator('.ps-result').first().waitFor();
    assert.equal(await page.locator('.ps-result').count(), 1);
    await page.locator('.ps-result').first().click();
    await page.locator('.dp-grid-slot-apply[data-photo="keep"]').click();
    await page.locator('#manualPanelSave').click();
    const savedBench = await page.evaluate(() => getManualEntry('search-test').home.bench);
    assert.equal(savedBench.length, 5);
    assert.equal(savedBench[0].playerId, 501);
    assert(savedBench[0].photoUrl.endsWith('?original'));
    assert.equal(savedBench[1].name, 'Zero ID bench');
    assert.equal(savedBench[2].name, 'Manual bench');
    assert.equal(savedBench[2].playerId, 0, 'ID is optional');
    assert.equal(savedBench[2].number, '77');
    assert(savedBench[2].photoUrl.endsWith('manual-player.png'));
    assert.equal(savedBench[3].playerId, 1001);
    assert.equal(savedBench[3].origName, 'German Ivan 1-1');
    assert.equal(savedBench[4].playerId, 6789);
    await page.evaluate(() => openManualPanel('bench', 'home'));
    assert.equal(await page.locator('#manualBenchRows input').count(), 0, 'Reopened players must stay fixed');
    await page.locator('#manualPanelBackdrop .dp-manual-modal').screenshot({ path: path.join(root, 'screenshots/player-search-bench.png') });
    await benchRow(0).locator('.dp-bench-slot-edit').click();
    await benchRow(0).locator('[data-field="number"]').fill('88');
    await page.locator('#manualPanelSave').click();
    const editedBench = await page.evaluate(() => getManualEntry('search-test').home.bench);
    assert.equal(editedBench[0].playerId, 501, 'Editing number must retain ID');
    assert.equal(editedBench[0].number, '88');
    assert(editedBench[0].photoUrl.endsWith('?original'));
    const refreshed = await page.evaluate(() => {
      const fixture = structuredClone(lineupPanelState.lastFixture);
      fixture.homeLineup.substitutes.push({ playerId: 999, name: 'New API bench', number: 99 });
      return buildEffectiveFixtureData(fixture).homeLineup.substitutes.map(player => player.playerId);
    });
    assert.deepEqual(refreshed, [501, 0, 999], 'New API bench must replace manual draft saved against the old baseline');

    // 교체 선수 한 명/전체 삭제를 저장하고 취소 및 수동값 삭제로 되돌린다.
    await page.evaluate(() => openManualPanel('bench', 'home'));
    await benchRow(2).locator('.dp-bench-slot-edit').click();
    const removeColor = await page.locator('.dp-slot-delete').evaluate(el => getComputedStyle(el).color);
    assert.equal(removeColor, 'rgb(255, 139, 139)', 'Delete control must be red');
    await page.locator('.dp-slot-delete').click();
    assert((await benchRow(2).innerText()).includes('(빈 슬롯)'));
    await page.locator('#manualPanelCancel').click();
    assert.equal(await page.evaluate(() => getManualEntry('search-test').home.bench.length), 5);
    await page.evaluate(() => openManualPanel('bench', 'home'));
    await benchRow(2).locator('.dp-bench-slot-edit').click();
    await page.locator('.dp-slot-delete').click();
    await page.locator('#manualPanelSave').click();
    assert.deepEqual(await page.evaluate(() => getManualEntry('search-test').home.bench.map(p => p.playerId)), [501, 0, 1001, 6789]);
    await page.evaluate(() => openManualPanel('bench', 'home'));
    for (let index = 0; index < 4; index++) {
      await benchRow(index).locator('.dp-bench-slot-edit').click();
      await page.locator('.dp-slot-delete').click();
    }
    await page.locator('#manualPanelSave').click();
    assert.deepEqual(await page.evaluate(() => getManualEntry('search-test').home.bench), [], 'Deleting the last bench player must persist an empty roster');
    assert.deepEqual(await page.evaluate(() => buildEffectiveFixtureData(lineupPanelState.lastFixture).homeLineup.substitutes), []);
    await page.evaluate(() => openManualPanel('bench', 'home'));
    assert.equal(await page.locator('#manualPanelReset').isVisible(), true, 'Empty roster override must remain resettable');
    await page.locator('#manualPanelReset').click();
    assert.deepEqual(await page.evaluate(() => buildEffectiveFixtureData(lineupPanelState.lastFixture).homeLineup.substitutes.map(p => p.playerId)), [501, 0]);

    // 화면 배율이 바뀌어도 오른쪽 확장이 화면 밖으로 잘리지 않는다.
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => pirShowMenu('home', 'API 0', 350, 400));
      await input.fill('German');
      const original = await page.locator('#pirPopup').boundingBox();
      await page.locator('#pirFetch').click();
      await page.locator('.ps-result').first().waitFor();
      const expanded = await page.locator('#pirPopup').boundingBox();
      assert(Math.abs(original.height - expanded.height) < 1);
      assert(expanded.x >= 0 && expanded.x + expanded.width <= viewport.width + 1, JSON.stringify({ viewport, expanded }));
      await page.locator('#pirCancel').click();
    }

    // 빈 결과·실패와 입력 변경 후 도착한 이전 응답을 확인한다.
    const behavior = await page.evaluate(async () => {
      const search = createPlayerSearch({ onChange: () => {}, onSelect: () => {} });
      await search.search('   ');
      const blank = search.state.message;
      await search.search('abc');
      const short = search.state.message;
      await search.search('Empty');
      const empty = search.state.message;
      await search.search('Error');
      const error = search.state.message;
      const original = window.fetchPlayerSearch;
      let resolveOld;
      window.fetchPlayerSearch = query => query === 'Slow' ? new Promise(resolve => { resolveOld = resolve; }) : original(query);
      const old = search.search('Slow');
      await search.search('6789');
      resolveOld({ players: [{ id: 1111 }], page: 1, totalPages: 1 });
      await old;
      window.fetchPlayerSearch = original;
      return { blank, short, empty, error, query: search.state.query, id: search.state.pages.get(1)[0].id };
    });
    assert(behavior.empty.includes('없습니다'));
    assert(behavior.blank.includes('입력하세요'));
    assert(behavior.short.includes('4글자'));
    assert(behavior.error.includes('Provider unavailable'));
    assert.equal(behavior.query, '6789');
    assert.equal(behavior.id, 6789);
    assert.deepEqual(errors, []);
    console.log('PASS: ID/name search, height-based pagination, four UIs including bench fixed rows and optional IDs, metadata preservation, API refresh, save/cancel, photo choice and stale responses.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
