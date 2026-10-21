// 실행: node tests/display/big-pitch-transitions.cjs (Playwright 필요).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const near = (actual, expected, label, tolerance = 1.5) => assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

async function openPage(browser, dpr) {
  const page = await browser.newPage({ viewport: { width: 1920 / dpr, height: 960 / dpr }, deviceScaleFactor: dpr });
  // F11은 자동화 브라우저의 키 이벤트로 전환되지 않아 표시 모드와 화면 크기를 함께 모의한다.
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = original(query);
      if (query === '(display-mode: fullscreen)') Object.defineProperty(result, 'matches', { get: () => window.testFullscreen === true });
      return result;
    };
  });
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

const settle = page => page.waitForTimeout(220);
async function geometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.layout-big .lp-lineup');
    const r = getDisplayLayoutRect(panel);
    const outer = panel.getBoundingClientRect();
    const layout = panel.closest('.layout-wrap');
    const scale = outer.height / r.height;
    const top = layout.getBoundingClientRect().top + parseFloat(getComputedStyle(layout).paddingTop) * scale;
    return { width: r.width, height: r.height, fraction: r.height / _lineupGetMaxHeight(panel),
      top: outer.top, minTop: top, bottom: outer.bottom,
      stored: [localStorage.getItem(LINEUP_EDGE_W_KEY), localStorage.getItem(LINEUP_HEIGHT_REFERENCE_KEY), getSetting('lineupScale')],
      pitches: [...panel.querySelectorAll('.dp-lineup-vertical-pitch')].map(el => {
        const p = el.getBoundingClientRect();
        return { top: p.top, bottom: p.bottom, width: p.width / scale };
      }) };
  });
}
async function check(page) {
  const g = await geometry(page);
  assert(g.top >= g.minTop - 1, 'top clipping: ' + JSON.stringify(g));
  assert(g.height >= 79 && g.fraction <= 1.001, 'height outside limits');
  for (const p of g.pitches) {
    assert(p.top >= g.top - 1 && p.bottom <= g.bottom + 1, 'inner pitch clipped');
    near(p.width, g.width - 2, 'pitch fills panel width', 2);
  }
  return g;
}
async function drag(page, edge, dy, dx = 0) {
  const box = await page.locator('.layout-big .' + edge).boundingBox();
  assert(box);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up();
  await settle(page);
  return check(page);
}
async function viewport(page, dpr, height) {
  await page.evaluate(fullscreen => { window.testFullscreen = fullscreen; }, height === 1080);
  await page.setViewportSize({ width: Math.round(1920 / dpr), height: Math.round(height / dpr) });
  await settle(page);
  return check(page);
}
async function roundTrip(page, dpr, base, other) {
  const before = await check(page);
  const changed = await viewport(page, dpr, other);
  if (dpr === 1 && base === 960 && before.stored[1] == null) {
    await page.screenshot({ path: 'screenshots/big-pitch-entry.png' });
  }
  near(changed.width, before.width, 'transition preserves width');
  if (base === 960) near(changed.height, before.height, 'fullscreen entry preserves height');
  else near(changed.fraction, before.fraction, 'fullscreen edit is normalized on regular return', 0.003);
  const back = await viewport(page, dpr, base);
  near(back.width, before.width, 'return restores width');
  near(back.height, before.height, 'return restores height');
  assert.deepEqual(back.stored, before.stored, 'transition must not rewrite settings');
}
async function reloadAfterBoardScale(browser) {
  const { page } = await openPage(browser, 1);
  await page.evaluate(() => activatePage('main-big'));
  await settle(page);
  await fillLineups(page); await settle(page);
  const before = await geometry(page);
  near(before.width / before.height, 94 / 210, 'first split pitch uses its natural aspect ratio', 0.005);
  await page.locator('#team-score-left').click();
  const range = page.locator('#boardAggControls input[type="range"]');
  const box = await range.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .9, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.locator('#boardAggControls .fsm-scale-control button').click();
  await settle(page);
  const reset = await geometry(page);
  near(reset.width, before.width, 'board scale reset preserves lineup width');
  near(reset.height, before.height, 'board scale reset restores lineup height');
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => activatePage('main-big'));
  await settle(page);
  await fillLineups(page); await settle(page);
  const restored = await geometry(page);
  near(restored.width, reset.width, 'reload preserves lineup width after board scale reset');
  near(restored.height, reset.height, 'reload preserves lineup height after board scale reset');
  await page.close();
  console.log('PASS: initial split pitch ratio, board scale reset and reload');
}
async function legacy(browser) {
  const { page } = await openPage(browser, 1);
  await page.evaluate(() => activatePage('main-big'));
  await fillLineups(page);
  await page.evaluate(() => {
    localStorage.setItem(LINEUP_EDGE_W_KEY, '330');
    localStorage.setItem(LINEUP_EDGE_H_KEY, '650');
    // 구버전 저장값으로 처음 시작하는 상태를 만든다.
    lineupHeightReferences.delete(document.querySelector('.layout-big .lp-lineup'));
    activatePage('main-small'); applyStoredLineupEdgeOverrides();
  });
  assert.equal(await page.evaluate(() => localStorage.getItem(LINEUP_EDGE_H_KEY)), '650');
  await page.evaluate(() => { activatePage('main-big'); applyStoredLineupEdgeOverrides(); });
  await settle(page);
  const restored = await check(page);
  near(restored.width, 330, 'legacy width'); near(restored.height, 650, 'legacy height');
  assert.equal(restored.stored[2], 100, 'migration preserves default scale');
  await roundTrip(page, 1, 960, 1080);
  await page.locator('.layout-big .lp-lineup-top-edge').dblclick(); await settle(page);
  const reset = await check(page);
  near(reset.fraction, 1, 'height reset'); near(reset.width, 330, 'height reset preserves width');
  await drag(page, 'lp-lineup-top-edge', 80);
  const resized = await check(page);
  await page.locator('.layout-big .lp-lineup-right-edge').dblclick(); await settle(page);
  const widthReset = await check(page);
  near(widthReset.fraction, resized.fraction, 'width reset preserves height fraction', 0.003);
  assert(widthReset.width > 80, 'width reset must not collapse the pitch');
  await page.evaluate(() => setSetting('lineupScale', 80)); await settle(page);
  near((await check(page)).fraction, 0.8, 'explicit scale setting replaces manual height', 0.003);
  assert.equal(await page.evaluate(() => localStorage.getItem(LINEUP_HEIGHT_FRACTION_KEY)), null);
  await page.close();
  console.log('PASS: legacy height migration and scoped reset');
}
async function fullscreenApi(browser) {
  const { page } = await openPage(browser, 1);
  await page.evaluate(() => activatePage('main-big'));
  await fillLineups(page); await settle(page);
  const before = await check(page);
  await page.evaluate(() => document.documentElement.requestFullscreen()); await settle(page);
  const entered = await check(page);
  near(entered.width, before.width, 'Fullscreen API entry width');
  near(entered.height, before.height, 'Fullscreen API entry height');
  const widened = await drag(page, 'lp-lineup-right-edge', 0, 20);
  near(widened.height, entered.height, 'fullscreen width edit preserves height');
  assert.equal(JSON.parse(widened.stored[1]).fullscreen, true, 'width edit records fullscreen context');
  const edited = await drag(page, 'lp-lineup-top-edge', 80);
  await page.evaluate(() => document.exitFullscreen());
  const returned = await viewport(page, 1, 960);
  near(returned.width, edited.width, 'Fullscreen API return width');
  near(returned.fraction, edited.fraction, 'Fullscreen API edit is normalized on return', 0.003);
  await page.close();
  console.log('PASS: real Fullscreen API entry, edit and return');
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await reloadAfterBoardScale(browser);
    if (process.argv.includes('--reload-only')) return;
    await legacy(browser);
    await fullscreenApi(browser);
    if (process.argv.includes('--legacy-only')) return;
    for (const dpr of [1, 1.5, 2]) {
      const { page } = await openPage(browser, dpr);
      await page.evaluate(() => activatePage('main-big'));
      await fillLineups(page);
      for (const split of ['on', 'off']) {
        await viewport(page, dpr, 960);
        await page.evaluate(value => { setSetting('splitLineup', value); resetAllLayoutSizes(); setSetting('lineupScale', 100); }, split);
        await settle(page);
        await viewport(page, dpr, 960);
        await roundTrip(page, dpr, 960, 1080);
        for (const height of [960, 1080]) {
          await viewport(page, dpr, height);
          for (const edge of ['lp-lineup-top-edge', 'lp-lineup-resize']) {
            const before = await check(page);
            const after = await drag(page, edge, 80 / dpr);
            assert.equal(after.stored[2], 100, 'drag must not rewrite default scale');
            if (edge === 'lp-lineup-top-edge') near(after.width, before.width, 'height drag preserves width');
            else near(after.width / after.height, before.width / before.height, 'corner preserves current ratio', 0.01);
            await roundTrip(page, dpr, height, height === 960 ? 1080 : 960);
            if (dpr === 1) await roundTrip(page, dpr, height, height === 960 ? 1080 : 960);
            await drag(page, edge, -2000 / dpr);
            near((await check(page)).fraction, 1, 'expand to full height', 0.003);
          }
          const before = await check(page);
          const after = await drag(page, 'lp-lineup-right-edge', 0, 20 / dpr);
          near(after.height, before.height, 'width drag preserves height');
          await roundTrip(page, dpr, height, height === 960 ? 1080 : 960);
        }
        const before = await check(page);
        await page.evaluate(() => activatePage('main-small')); await settle(page);
        await page.evaluate(() => activatePage('main-big')); await settle(page);
        near((await check(page)).height, before.height, 'hidden page preserves height');
        if (dpr === 1) await page.screenshot({ path: 'screenshots/big-pitch-' + split + '.png' });
      }
      const before = await check(page);
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => activatePage('main-big')); await fillLineups(page); await settle(page);
      const restored = await check(page);
      near(restored.width, before.width, 'reload restores width');
      near(restored.fraction, before.fraction, 'reload restores fraction', 0.003);
      console.log('PASS: default, all handles, split/combined, viewport round trips and reload at ' + dpr * 100 + '%');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

