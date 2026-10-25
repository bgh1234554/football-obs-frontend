// 실행: node tests/display/display-scale-layout.cjs (Playwright 필요).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const near = (actual, expected, label, tolerance = 1.5) => assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

async function openPage(browser, dpr) {
  const page = await browser.newPage({ viewport: { width: 1920 / dpr, height: 960 / dpr }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost') {
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>' });
      return route.abort();
    }
    const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
  });
  await page.goto('http://localhost/', { waitUntil: 'load' });
  await frames(page);
  return { page, errors };
}

async function fillLineups(page) {
  await page.evaluate(() => {
    const names = ['스티븐 안투네스', '코디 학포', '버질 판 다이크', '테스트 미드필더', 'Alexander Arnold', '김민재', '손흥민', '황희찬', '이강인', '황인범', '이재성'];
    const grids = ['1:1', '2:1', '2:2', '2:3', '2:4', '3:1', '3:2', '3:3', '4:1', '4:2', '4:3'];
    const lineup = offset => ({ formation: '4-3-3', coach: { name: '테스트 감독' }, startXi: names.map((name, i) => ({ id: offset + i, name, number: i + 1, grid: grids[i], pos: i === 0 ? 'G' : 'M' })), substitutes: [] });
    applyLineupPanels({ matchInfo: { fixtureId: 'test-scale', homeTeamId: 1, awayTeamId: 2, homeTeamName: '네덜란드', awayTeamName: '모로코' }, homeLineup: lineup(100), awayLineup: lineup(200), homeInjuries: [], awayInjuries: [], events: [], playerStats: [] });
  });
  await frames(page);
  await page.evaluate(() => { applyStoredBigPanelHeights(); fitLineupNamePills(); });
}

async function measure(page) {
  return page.evaluate(() => {
    const size = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { width: r.width * devicePixelRatio, height: r.height * devicePixelRatio };
    };
    return {
      body: size('body'), lineup: size('.layout-big .lp-lineup'),
      column: size('.layout-big .lp-col'), chat: size('.layout-big .lp-chat-big'), stat: size('.layout-big .lp-stat'),
      labels: [...document.querySelectorAll('.layout-big .dp-lineup-name')].map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width * devicePixelRatio, font: parseFloat(getComputedStyle(el).fontSize) }))
    };
  });
}

async function testDrag(page, dpr) {
  const handle = page.locator('.layout-big .lp-big-col-left-handle');
  const box = await handle.boundingBox();
  assert(box && box.height > 0);
  const before = (await measure(page)).column.width;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 40 / dpr, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  await frames(page);
  near((await measure(page)).column.width, before + 40, 'column drag follows physical pointer');
  await page.reload({ waitUntil: 'load' });
  await frames(page);
  near((await measure(page)).column.width, before + 40, 'saved width survives reload');
}

async function alternateLayouts(page) {
  await page.evaluate(() => setSetting('splitLineup', 'off'));
  await frames(page);
  const combined = await measure(page);
  await page.evaluate(() => { setSetting('bigPanelLinked', 'off'); applyStoredBigPanelHeights(); });
  await frames(page);
  const independent = await measure(page);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) applyStoredBigPanelHeights(); });
  const repeated = await measure(page);
  near(repeated.chat.width, independent.chat.width, 'independent panel width stays stable');
  near(repeated.stat.height, independent.stat.height, 'independent panel height stays stable');
  await page.evaluate(() => activatePage('main-small'));
  await frames(page);
  await page.evaluate(() => {
    applySmallLayoutResizeRatio(document.querySelector('.layout-small'), 0.45);
    fitLineupNamePills();
    balanceBenchInjuryPanelHeights();
  });
  const small = await page.evaluate(() => Object.fromEntries(['.lp-col-events-stat', '.lp-lineup-s', '.lp-bench', '.lp-injury', '.lp-cam-chat'].map(selector => {
    const rect = document.querySelector(`.layout-small ${selector}`).getBoundingClientRect();
    return [selector, { width: rect.width * devicePixelRatio, height: rect.height * devicePixelRatio }];
  })));
  await page.evaluate(() => { activatePage('main-big'); setSetting('splitLineup', 'on'); setSetting('bigPanelLinked', 'on'); });
  await frames(page);
  return { combined: combined.lineup, chat: independent.chat, stat: independent.stat, ...small };
}

async function testSmallBenchHeight(page, dpr) {
  const seed = async () => {
    await page.evaluate(() => activatePage('main-small'));
    await frames(page);
    await page.evaluate(() => {
      for (const [id, count] of [['benchPanel', 12], ['injuryPanel', 14]]) {
        document.querySelectorAll(`#${id} .dp-list`).forEach(list => {
          list.innerHTML = Array.from({ length: count }, (_, i) =>
            `<div class="dp-item"><span class="dp-item-num">${i + 1}</span><span class="dp-item-name">Test player ${i + 1}</span></div>`).join('');
        });
      }
      balanceBenchInjuryPanelHeights();
    });
    await frames(page);
  };
  const read = () => page.evaluate(() => {
    const metrics = getSmallBenchHeightMetrics();
    return {
      height: getDisplayLayoutRect(metrics.benchSection).height,
      injuryHeight: getDisplayLayoutRect(metrics.injurySection).height,
      available: metrics.available,
      saved: localStorage.getItem('obs.smallLayout.benchHeightRatio.v1'),
      overflow: ['benchPanel', 'injuryPanel'].map(id => {
        const list = document.querySelector(`#${id} .dp-list`);
        return list.scrollHeight > list.clientHeight + 1;
      }),
      scrollbar: getComputedStyle(document.querySelector('#benchPanel .dp-list'), '::-webkit-scrollbar').display
    };
  });
  const dragTo = async height => {
    const before = await read();
    const box = await page.locator('.lp-small-bench-height-resize').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + (height - before.height) / dpr, { steps: 8 });
    await page.mouse.up();
    await frames(page);
  };
  await seed();
  const automatic = await read();
  await dragTo(300);
  let m = await read();
  near(m.height, 300, 'small bench drag follows DPI-normalized pointer', 0.1);
  assert.deepEqual(m.overflow, [true, false], 'shrunk bench scrolls, expanded injury list fits');
  assert.equal(m.scrollbar, 'block');
  assert.equal(await page.locator('.lp-small-bench-height-resize').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'hover stays transparent like the width handle');
  if (dpr === 2) {
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['pen', 'touch']) {
      const box = await page.locator('.lp-small-bench-height-resize').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (type === 'touch') {
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 40 / dpr }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y + 40 / dpr, button: 'left', buttons: 1, pointerType: 'pen' });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y + 40 / dpr, button: 'left', buttons: 0, pointerType: 'pen' });
      }
      await frames(page);
      near((await read()).height, 340, `${type} divider drag uses display coordinates`, 0.1);
      await dragTo(300);
    }
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
  const ratioBeforeResize = Number((await read()).saved);
  await page.setViewportSize({ width: 3840 / dpr, height: 2160 / dpr });
  await frames(page);
  m = await read();
  near(m.height / m.available, ratioBeforeResize, 'height ratio follows changed resolution', 0.001);
  await page.setViewportSize({ width: 1920 / dpr, height: 960 / dpr });
  await frames(page);
  m = await read();
  near(m.height, 300, 'height returns after resolution round trip', 0.1);
  const saved = m.saved;
  await page.evaluate(() => { for (let i = 0; i < 5; i++) balanceBenchInjuryPanelHeights(); });
  near((await read()).height, 300, 'automatic rebalance cannot undo manual drag', 0.1);
  await page.reload({ waitUntil: 'load' });
  await seed();
  m = await read();
  assert.equal(m.saved, saved, 'height ratio survives reload');
  near(m.height, 300, 'saved height restored', 0.1);
  await dragTo(m.available - 120);
  m = await read();
  assert.deepEqual(m.overflow, [false, true], 'expanded bench fits, shrunk injury list scrolls');
  await page.locator('.lp-small-bench-height-resize').dblclick();
  await frames(page);
  m = await read();
  assert.equal(m.saved, null, 'double-click removes manual ratio');
  near(m.height, automatic.height, 'double-click restores content-based optimal height', 0.1);
  await dragTo(300);
  await page.evaluate(() => window.resetAllLayoutSizes());
  await frames(page);
  assert.equal((await read()).saved, null, 'global size reset clears small bench ratio');
  near((await read()).height, automatic.height, 'global reset restores automatic height', 0.1);
  await page.evaluate(() => activatePage('main-big'));
  await frames(page);
  console.log(`PASS: ${dpr * 100}% small bench divider drag, dynamic scrollbars, reload, automatic and global reset`);
}

async function testResolutionPersistence(page) {
  const directory = path.join(root, 'screenshots', 'display-persistence');
  fs.mkdirSync(directory, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const read = () => page.evaluate(() => ({
    saved: localStorage.getItem('obs.bigLayout.colWidth.v1'),
    width: getDisplayLayoutRect(document.querySelector('.layout-big .lp-col')).width
  }));
  const stored = await read();
  let reference;
  for (const condition of [
    { width: 1920, height: 1080, dpr: 1 },
    { width: 1920, height: 1080, dpr: 1.25 },
    { width: 1920, height: 1080, dpr: 1.5 },
    { width: 1920, height: 1080, dpr: 2 },
    { width: 3840, height: 2160, dpr: 1 },
    { width: 3840, height: 2160, dpr: 1.25 },
    { width: 3840, height: 2160, dpr: 2 },
    { width: 2560, height: 1440, dpr: 1 },
    { width: 2560, height: 1600, dpr: 2 },
    { width: 1920, height: 955, dpr: 1 }
  ]) {
    const { width, height, dpr } = condition;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: Math.round(width / dpr), height: Math.round(height / dpr), deviceScaleFactor: dpr, mobile: false
    });
    for (let reload = 0; reload < 3; reload++) {
      await page.reload({ waitUntil: 'load' });
      await fillLineups(page);
      const current = await read();
      assert.equal(current.saved, stored.saved, 'resolution/reload never rescales saved width');
      near(current.width, stored.width, 'logical column width after resolution/reload', 0.1);
    }
    await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
    await page.mouse.move(0, 0);
    const m = await measure(page);
    if (!reference) reference = m;
    if (width / height === 16 / 9) {
      for (const key of ['lineup', 'column', 'chat', 'stat']) {
        for (const dimension of ['width', 'height']) {
          near(m[key][dimension] / (width / 1920), reference[key][dimension], `${width} DPR ${dpr} ${key} ${dimension}`, 0.15);
        }
      }
      m.labels.forEach((label, i) => {
        near(label.width / (width / 1920), reference.labels[i].width, 'proportional player label', 0.15);
        near(label.font, reference.labels[i].font, 'unchanged logical font', 0.01);
      });
      // CDP로 화면 크기를 변경하면 Playwright의 page.screenshot이
      // 원래 화면 크기로 복원하므로, 이 경우에는 직접 캡처하여 설정을 유지합니다.
      const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, `${width}-${dpr}.png`), Buffer.from(capture.data, 'base64'));
    }
  }
  // 실제 더블클릭으로 모든 너비 덮어쓰기를 해제하고, 새로고침 후에도 이전 값이 복원되지 않아야 합니다.
  await page.locator('.layout-big .lp-big-col-left-handle').dblclick();
  await frames(page);
  const reset = await read();
  assert.equal(reset.saved, null, 'double-click clears saved column width');
  for (const dpr of [1, 1.25, 2]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920 / dpr, height: 1080 / dpr, deviceScaleFactor: dpr, mobile: false });
    await page.reload({ waitUntil: 'load' });
    await frames(page);
    const current = await read();
    assert.equal(current.saved, null, 'reset persists across reload and DPI change');
    near(current.width, reset.width, 'default panel width stays stable', 0.1);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  console.log('PASS: FHD/QHD/4K/tablet aspect ratios, combined DPI changes, 30 reloads, double-click reset persistence');
}

// 글꼴과 가용 높이가 바뀌어도 스탯은 잘리지 않는 최대 행 수를 사용한다.
async function testStatsCapacity(page) {
  await page.evaluate(() => activatePage('main-small'));
  await frames(page);
  // 팬 반응을 꺼도 같은 경계에서 너비 조절과 초기화를 할 수 있어야 한다.
  await page.evaluate(() => setSetting('fanReaction', 'off'));
  await frames(page);
  const divider = page.locator('.layout-small .lp-small-col-resize-end');
  const box = await divider.boundingBox();
  const chatWidth = () => page.locator('.layout-small .lp-cam-chat').evaluate(el => el.getBoundingClientRect().width);
  const before = await chatWidth();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  await frames(page);
  assert.ok(await chatWidth() > before + 10, 'hidden fan panel boundary remains draggable');
  await divider.dblclick();
  await frames(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('obs.smallLayout.columnWidths.v2')), null, 'hidden fan panel boundary resets widths');
  await page.evaluate(() => setSetting('fanReaction', 'on'));
  const results = await page.evaluate(() => {
    const original = document.querySelector('.layout-small [data-stat-panel]');
    const panel = original.cloneNode(false);
    original.parentElement.appendChild(panel);
    Object.assign(panel.style, { display: 'flex', flexDirection: 'column', flex: 'none', width: '300px' });
    const rows = Array.from({ length: 24 }, (_, i) => ({ label: `스탯 ${i}`, homeVal: i % 2 ? '100%' : 1523, awayVal: i % 2 ? 1234 : '88%' }));
    const results = [];
    try {
      for (const height of [60, 100, 179.5, 180, 300, 480, 800]) {
        for (const font of [10, 12, 12.5, 18, 24]) {
          for (const reserveControls of [false, true]) {
            panel.style.height = `${height}px`;
            panel.style.setProperty('--st-name-base-size', `${font}px`);
            panel.innerHTML = '<div class="st-title-bar">경기 스탯</div>';
            const count = stComputeItemsPerPage(panel, rows, null, { reserveControls });
            const wrap = document.createElement('div');
            wrap.className = 'st-wrap';
            const body = document.createElement('div');
            body.className = 'st-page';
            wrap.appendChild(body);
            if (reserveControls) wrap.appendChild(stCreateControlsProbe());
            panel.appendChild(wrap);
            const bg = teamPanelBackground(panel);
            rows.slice(0, count).forEach(row => body.appendChild(stCreateRow(row, null, bg)));
            const fits = body.scrollHeight <= body.clientHeight + 0.5;
            const contained = [...body.querySelectorAll('.st-val')].every(value => {
              const range = document.createRange();
              range.selectNodeContents(value);
              const text = range.getBoundingClientRect();
              const badge = value.getBoundingClientRect();
              const bounds = panel.getBoundingClientRect();
              return text.left >= badge.left && text.right <= badge.right + 0.5 && badge.left >= bounds.left && badge.right <= bounds.right + 0.5;
            });
            if (count < rows.length) body.appendChild(stCreateRow(rows[count], null, bg));
            const maximal = count === rows.length || body.scrollHeight > body.clientHeight + 0.5;
            results.push({ height, font, reserveControls, count, fits, maximal, contained });
          }
        }
      }
    } finally { panel.remove(); }
    return results;
  });
  for (const result of results) {
    assert.ok(result.count >= 1, JSON.stringify(result));
    assert.ok(result.fits || result.count === 1, JSON.stringify(result));
    assert.ok(result.maximal, JSON.stringify(result));
    assert.ok(result.contained, JSON.stringify(result));
  }

  // 같은 프레임의 여러 크기 보정 요청은 한 번만 렌더하고 페이지 내용은 유지한다.
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'json', 'juveparma.json'), 'utf8').replace(/^\uFEFF/, ''));
  await page.evaluate(data => {
    _lpStatCycle.mode = 'stats';
    applyStatsPanel(data);
    stResetAllPanelPages();
    stRerenderActivePanels();
  }, fixture);
  await frames(page);
  const reuse = await page.evaluate(async () => {
    const panel = document.querySelector('.page.active [data-stat-panel]');
    const before = panel.innerHTML;
    const render = window.stRenderPanel;
    let calls = 0;
    window.stRenderPanel = function (...args) {
      if (args[0] === panel) calls++;
      return render.apply(this, args);
    };
    try {
      stRerenderActivePanels();
      stRerenderActivePanels();
      lpStatUpdateVisibility();
      stRerenderActivePanels();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { calls, unchanged: before === panel.innerHTML };
    } finally {
      window.stRenderPanel = render;
    }
  });
  assert.equal(reuse.calls, 1, 'same-frame stats requests render once');
  assert.ok(reuse.unchanged, 'coalesced stats render preserves rows and controls');

  // 반복 렌더는 실측을 재사용하되 글꼴·행 내용 변경은 다시 측정해야 한다.
  const capacityReuse = await page.evaluate(() => {
    const panel = document.querySelector('.page.active [data-stat-panel]');
    const append = Element.prototype.appendChild;
    let probes = 0;
    Element.prototype.appendChild = function (node) {
      if (this === panel && node.classList?.contains('st-wrap') && node.style.visibility === 'hidden') probes++;
      return append.call(this, node);
    };
    const font = panel.style.getPropertyValue('--st-name-base-size');
    try {
      stRenderPanel(panel, statsLastFixtureData);
      const repeated = probes;
      probes = 0;
      panel.style.setProperty('--st-name-base-size', '21px');
      stRenderPanel(panel, statsLastFixtureData);
      const changedFont = probes;
      probes = 0;
      const data = structuredClone(statsLastFixtureData);
      data.teamStats[0].totalShots += 1;
      stRenderPanel(panel, data);
      return { repeated, changedFont, changedData: probes };
    } finally {
      Element.prototype.appendChild = append;
      if (font) panel.style.setProperty('--st-name-base-size', font);
      else panel.style.removeProperty('--st-name-base-size');
      stRenderPanel(panel, statsLastFixtureData);
    }
  });
  assert.equal(capacityReuse.repeated, 0, 'unchanged stats capacity avoids DOM measurement');
  assert.ok(capacityReuse.changedFont > 0, 'stats font change invalidates capacity');
  assert.ok(capacityReuse.changedData > 0, 'stats data change invalidates capacity');

  // 실제 버튼과 타이머를 통해 페이지 이동·일시정지·재생 계약을 확인한다.
  await page.evaluate(() => {
    activatePage('main-big');
    _lpStatCycle.mode = 'stats';
    lpStatUpdateVisibility();
    setSetting('statsAutoSwipe', 'on');
    setSetting('statsAutoSwipeSec', 2.5);
    stResetAllPanelPages();
    applyStatsPanel(statsLastFixtureData);
  });
  await frames(page);
  const statsPanel = page.locator('.page.active [data-stat-panel]');
  await statsPanel.locator('.st-pause').click();
  const activeDot = () => statsPanel.locator('.st-dot.is-active').evaluate(el => [...el.parentElement.children].indexOf(el));
  const firstPage = await activeDot();
  await statsPanel.locator('.st-arrow-next').click();
  assert.notEqual(await activeDot(), firstPage, 'next button changes stats page');
  await statsPanel.locator('.st-arrow-prev').click();
  assert.equal(await activeDot(), firstPage, 'previous button restores stats page');
  await page.waitForTimeout(2800);
  assert.equal(await activeDot(), firstPage, 'paused stats page stays still');
  await statsPanel.locator('.st-pause').click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('.page.active [data-stat-panel]');
    return [...panel.querySelectorAll('.st-dot')].findIndex(dot => dot.classList.contains('is-active')) !== 0;
  }, null, { timeout: 6000 });
  await page.evaluate(() => {
    setSetting('statsAutoSwipe', 'off');
    applyStatsPanel(statsLastFixtureData);
  });
}

async function testSpotlightPosition(page) {
  for (const view of ['main-big', 'main-small']) {
    for (const mode of ['board', 'bottom']) {
      await page.evaluate(view => activatePage(view), view);
      await page.waitForTimeout(350);
      await page.evaluate(({ view, mode }) => {
        setSetting('eventSpotlight', 'off');
        setSetting('eventSpotlight', mode);
        const source = document.createElement('div');
        source.innerHTML = '<div class="ev-list"><div class="ev-row" data-ev-key="first">First event</div></div>';
        const id = `${view}-${mode}-${performance.now()}`;
        evSpotlightAfterRender(id, [source]);
        source.firstElementChild.insertAdjacentHTML('afterbegin', '<div class="ev-row" data-ev-key="second">New event</div>');
        evSpotlightMarkNewEvents();
        evSpotlightAfterRender(id, [source]);
      }, { view, mode });
      await page.waitForTimeout(380);
      const metrics = await page.evaluate(mode => {
        const host = document.querySelector('.ev-spotlight').getBoundingClientRect();
        const board = document.getElementById('board').getBoundingClientRect();
        const page = document.querySelector('.page.active');
        const column = page.querySelector(page.id === 'page-main-big' ? '.lp-stat' : '.lp-events-s').getBoundingClientRect();
        const bottom = Math.max(...[...page.querySelectorAll('.layout-wrap .lp')].filter(el => el.offsetHeight).map(el => el.getBoundingClientRect().bottom));
        return { center: (host.left + host.right) / 2,
          expected: mode === 'board' ? (board.left + board.right) / 2 : innerWidth / 2,
          width: host.width, expectedWidth: column.width * 1.25,
          bottom: host.bottom, expectedBottom: bottom };
      }, mode);
      near(metrics.center, metrics.expected, `${view} ${mode} spotlight center`);
      near(metrics.width, metrics.expectedWidth, `${view} ${mode} spotlight width`);
      if (mode === 'bottom') near(metrics.bottom, metrics.expectedBottom, `${view} spotlight bottom`);
    }
  }
  await page.evaluate(() => setSetting('eventSpotlight', 'off'));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    let baseline, alternateBaseline;
    for (const dpr of [1, 1.25, 1.5, 2]) {
      const { page, errors } = await openPage(browser, dpr);
      if (process.argv.includes('--spotlight')) {
        await testSpotlightPosition(page);
        console.log(`PASS: ${dpr * 100}% spotlight coordinates in both views and positions`);
        await page.close();
        continue;
      }
      if (process.argv.includes('--stats')) {
        await testStatsCapacity(page);
        console.log(`PASS: ${dpr * 100}% stats containment, pagination and hidden fan divider`);
        await page.close();
        continue;
      }
      await fillLineups(page);
      await testSpotlightPosition(page);
      const current = await measure(page);
      assert.equal(current.labels.length, 22, 'both teams render');
      near(current.body.width, 1920, 'physical width');
      near(current.body.height, 960, 'physical height');
      if (!baseline) baseline = current;
      for (const key of ['lineup', 'column', 'chat', 'stat']) {
        near(current[key].width, baseline[key].width, `${dpr} ${key} width`);
        near(current[key].height, baseline[key].height, `${dpr} ${key} height`);
      }
      current.labels.forEach((label, i) => {
        near(label.width, baseline.labels[i].width, `${dpr} label ${i} width`, 2);
        near(label.font, baseline.labels[i].font, `${dpr} label ${i} font`, 0.1);
      });
      const alternate = await alternateLayouts(page);
      if (!alternateBaseline) alternateBaseline = alternate;
      for (const [name, rect] of Object.entries(alternate)) {
        near(rect.width, alternateBaseline[name].width, `${dpr} ${name} alternate width`);
        near(rect.height, alternateBaseline[name].height, `${dpr} ${name} alternate height`);
      }
      await testDrag(page, dpr);
      if (dpr === 1) await testResolutionPersistence(page);
      await testSmallBenchHeight(page, dpr);
      if (dpr === 1) await testStatsCapacity(page);
      // 별도의 이전 테마 테스트가 삭제된 css/theme 경로를 참조합니다.
      // 외부 라이브러리와 API는 차단하며, 기존 jQuery 어댑터는
      // 이 테스트 범위에서 제외합니다. 핵심 점수 렌더링, 애니메이션, 패널 크기 조정은 정상 실행합니다.
      assert(errors.every(message => message === 'jQuery is not defined'), errors.join('\n'));
      console.log(`PASS: ${dpr * 100}% panel sizes, player names, drag and reload`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
