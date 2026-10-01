// Run: node tests/display/display-scale-layout.cjs (requires Playwright).
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
      // Playwright page.screenshot restores its original context viewport when
      // metrics were changed through CDP. Capture directly to retain this case.
      const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, `${width}-${dpr}.png`), Buffer.from(capture.data, 'base64'));
    }
  }
  // A real double-click clears all width overrides; reload must not restore the old value.
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

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    let baseline, alternateBaseline;
    for (const dpr of [1, 1.25, 1.5, 2]) {
      const { page, errors } = await openPage(browser, dpr);
      await fillLineups(page);
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
      // Unrelated old theme test refers to a removed css/theme directory.
      // External libraries/APIs are blocked; the legacy jQuery adapter is outside
      // this fixture. Core score rendering, animation, and panel sizing run normally.
      assert(errors.every(message => message === 'jQuery is not defined'), errors.join('\n'));
      console.log(`PASS: ${dpr * 100}% panel sizes, player names, drag and reload`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
