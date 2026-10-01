// Run: node tests/tactics/tactics-drawtools-scale.cjs (requires Playwright).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const screenshotDir = path.join(root, 'screenshots', 'display-viewport');
fs.mkdirSync(screenshotDir, { recursive: true });
const near = (actual, expected, label, tolerance = 2) =>
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const settle = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function openPage(browser, { dpr, platform, viewport, touch = false, mobile = false, uaPlatform, url = 'http://localhost/' }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, hasTouch: touch, isMobile: mobile });
  await page.addInitScript(({ platform, uaPlatform }) => {
    Object.defineProperty(navigator, 'platform', { value: platform });
    Object.defineProperty(navigator, 'userAgentData', {
      value: uaPlatform ? { platform: uaPlatform } : undefined
    });
  }, { platform, uaPlatform });
  await page.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== new URL(url).origin) return route.abort();
    const file = path.join(root, requestUrl.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(requestUrl.pathname));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: {
      '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json'
    }[path.extname(file)] || 'application/octet-stream' });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
  await settle(page);
  return page;
}

async function measurePage(page, name) {
  await page.evaluate(name => activatePage(name), name);
  await settle(page);
  return page.evaluate(name => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { width: r.width, height: r.height, bottom: r.bottom, left: r.left, top: r.top };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      layoutScale: Number(document.documentElement.style.getPropertyValue('--display-scale')),
      body: rect('body'), page: rect(`#page-${name}`), board: rect('#board'),
      content: rect(name === 'schedule' ? '.widgetGrid' : '#tactics-main-area'),
      zoom: Number(getComputedStyle(document.documentElement).zoom),
      ...(name === 'tactics' ? { pitch: rect('#tactics-pitch'), token: rect('.tactics-token > div') } : {}),
      text: [...document.querySelectorAll(name === 'tactics'
        ? '#tactics-topbar button, #tactics-topbar label, .tactics-token > div'
        : '#board .name, #board .digits, #page-schedule .panelHeader')].filter(el => el.getBoundingClientRect().width).map(el => {
          const r = document.createRange();
          r.selectNodeContents(el);
          const box = r.getBoundingClientRect();
          return { width: box.width * devicePixelRatio, height: box.height * devicePixelRatio,
            font: getComputedStyle(el).fontSize, text: el.textContent };
        })
    };
  }, name);
}

function fillsViewport(m, label) {
  near(m.body.width, m.viewport.width, `${label} body width`);
  near(m.body.left, 0, `${label} no left gap`);
  near(m.body.top, 0, `${label} no top gap`);
  near(m.body.bottom, m.viewport.height, `${label} body bottom`);
  near(m.page.bottom, m.viewport.height, `${label} page bottom`);
  // Schedule has an 8px inset around the grid.
  assert((m.viewport.height - m.content.bottom) / m.layoutScale >= -2 && (m.viewport.height - m.content.bottom) / m.layoutScale <= 10,
    `${label} content bottom: ${m.content.bottom} / ${m.viewport.height}`);
}

async function testPen(page) {
  const cdp = await page.context().newCDPSession(page);
  const pitch = await page.locator('#tactics-pitch').boundingBox();
  const start = { x: pitch.x + pitch.width * 0.57, y: pitch.y + pitch.height * 0.16 };
  const end = { x: pitch.x + pitch.width * 0.88, y: pitch.y + pitch.height * 0.62 };
  const send = (type, point, down) => cdp.send('Input.dispatchMouseEvent', {
    type, ...point, button: down ? 'left' : 'none', buttons: down ? 1 : 0,
    pointerType: 'pen', ...(type === 'mousePressed' ? { clickCount: 1 } : {})
  });
  await page.evaluate(() => tacticsDrawSetTool('select'));
  await send('mousePressed', start, true);
  await send('mouseMoved', end, true);
  const rect = await page.locator('#td-select-rect').boundingBox();
  near(rect.x, start.x, 'pen selection left', 0.1);
  near(rect.y, start.y, 'pen selection top', 0.1);
  near(rect.width, end.x - start.x, 'pen selection width', 0.1);
  near(rect.height, end.y - start.y, 'pen selection height', 0.1);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, pointerType: 'pen' });
  await page.evaluate(() => tacticsDrawSetTool('eraser'));
  await send('mouseMoved', start, false);
  const eraser = await page.locator('#td-eraser-cursor').boundingBox();
  near(eraser.x + eraser.width / 2, start.x, 'pen eraser X', 0.1);
  near(eraser.y + eraser.height / 2, start.y, 'pen eraser Y', 0.1);
  await page.evaluate(() => tacticsDrawSetTool('pencil'));
  await send('mousePressed', start, true);
  await send('mouseMoved', end, true);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, pointerType: 'pen' });
  const drawn = await page.evaluate(() => tdDrawings.at(-1));
  assert.equal(drawn.type, 'pencil');
  near(drawn.points[0].x, 57, 'pen stroke start X', 0.1);
  near(drawn.points[0].y, 16, 'pen stroke start Y', 0.1);
  near(drawn.points.at(-1).x, 88, 'pen stroke end X', 0.1);
  near(drawn.points.at(-1).y, 62, 'pen stroke end Y', 0.1);
  await page.evaluate(() => { tacticsDrawClear(); tacticsDrawSetTool('select'); });
  await cdp.detach();
}

async function testTouchScrolling(page) {
  await measurePage(page, 'schedule');
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (start, end) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: start.x + (end.x - start.x) * step / 8,
        y: start.y + (end.y - start.y) * step / 8, id: 1
      }] });
      await settle(page);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(page);
  };
  const viewport = page.viewportSize();
  await swipe({ x: viewport.width - 2, y: viewport.height * 0.6 },
    { x: viewport.width - 150, y: viewport.height * 0.3 });
  const rootScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY,
    visualX: visualViewport.offsetLeft, visualY: visualViewport.offsetTop }));
  Object.entries(rootScroll).forEach(([key, value]) => near(value, 0, `blank background touch ${key}`, 0.1));
  const panel = page.locator('#page-schedule .panelBody').first();
  await panel.evaluate(el => {
    el.innerHTML = '<div style="height:4000px">Scrollable test list</div>';
    el.scrollTop = 0;
  });
  const box = await panel.boundingBox();
  await swipe({ x: box.x + box.width / 2, y: box.y + box.height * 0.75 },
    { x: box.x + box.width / 2, y: box.y + box.height * 0.25 });
  assert(await panel.evaluate(el => el.scrollTop > 0), 'touch scroll inside a list remains available');
  await cdp.detach();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { dpr: 2, platform: 'Linux armv8l', uaPlatform: 'Android', touch: true, mobile: true, viewport: { width: 1280, height: 800 } });
    await measurePage(page, 'tactics');
    const slider = page.locator('#tactics-drawtools-scale-slider');
    const panel = page.locator('#tactics-draw-toolbar');
    await page.locator('#btn-tactics-fullscreen').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.locator('#td-drawtools-toggle').tap();
    const before = await page.locator('#td-tool-pencil').boundingBox();
    const panelBefore = await panel.boundingBox();
    const track = await slider.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: track.x + 5, y: track.y + track.height / 2, id: 1 }] });
    for (let step = 1; step <= 5; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: track.x + 5 + (track.width * .8 - 5) * step / 5, y: track.y + track.height / 2, id: 1 }] });
    }
    await settle(page);
    const pending = Number(await slider.inputValue());
    assert(pending > 100, 'touch drag previews value');
    const duringDrag = await page.evaluate(() => getSetting('tacticsDrawtoolsScale'));
    assert(duringDrag >= 100 && duringDrag <= pending, 'touch change may fire at an intermediate drag value');
    if (duringDrag === 100) {
      near((await page.locator('#td-tool-pencil').boundingBox()).height, before.height, 'button stays still before change', .01);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(page);
    assert.equal(await page.evaluate(() => getSetting('tacticsDrawtoolsScale')), pending, 'touch release saves');
    assert((await page.locator('#td-tool-pencil').boundingBox()).height > before.height, 'release enlarges button');
    await slider.focus(); await slider.press('End'); await settle(page);
    const enlarged = await page.locator('#td-tool-pencil').boundingBox();
    near(enlarged.height / before.height, 4 / 3, 'tool button height grows from 42px to 56px', .04);
    const panelWidthRatio = (await panel.boundingBox()).width / panelBefore.width;
    assert(panelWidthRatio > 1 && panelWidthRatio < 1.5, 'panel widens without doubling');
    assert.equal(await page.locator('#td-tool-pencil').evaluate(el => getComputedStyle(el).fontSize), '18px', 'font grows 50%');
    assert.equal(await page.evaluate(() => getSetting('tacticsTopbarScale')), 100, 'topbar independent');
    await page.locator('#td-drawtools-close').tap();
    for (const viewport of [{ width: 1280, height: 800 }, { width: 800, height: 1280 }]) {
      await page.evaluate(() => document.exitFullscreen());
      await page.setViewportSize(viewport);
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      for (const align of ['center', 'right']) {
        await page.evaluate(align => { setSetting('tacticsFullscreenAlign', align); tdSetDrawToolbarOpen(true); }, align);
        const portrait = viewport.height > viewport.width;
        await page.waitForFunction(portrait => {
          const box = document.getElementById('tactics-draw-toolbar').getBoundingClientRect();
          return portrait ? Math.abs(box.bottom - innerHeight) < 2 : Math.abs(box.top) < 2;
        }, portrait);
        const box = await panel.boundingBox();
        assert(box.x >= -1 && box.x + box.width <= viewport.width + 1, 'panel fits horizontally');
        if (portrait) {
          near(box.y + box.height, viewport.height, 'portrait sheet sits at bottom');
          assert(box.height <= viewport.height * .6 + 1, 'portrait sheet stays below 60% height');
        } else {
          near(box.y, 0, 'panel top'); near(box.height, viewport.height, 'panel fills height');
        }
        const overflow = await panel.evaluate(el => ({ width: el.scrollWidth - el.clientWidth, height: el.scrollHeight - el.clientHeight }));
        if (overflow.width > 1) {
          console.log(await panel.evaluate(el => ({ panel: {client: el.clientWidth, scroll: el.scrollWidth}, children: [...el.children].map(c => ({id:c.id, cls:c.className, width:c.offsetWidth, scroll:c.scrollWidth, text:c.textContent.trim().slice(0,30)})) })));
          await page.screenshot({ path: path.join(screenshotDir, 'drawtools-debug.png') });
        }
        assert(overflow.width <= 1, 'no horizontal clipping');
        if (!portrait) assert(overflow.height > 0, 'large controls scroll vertically');
        await page.locator('#td-tool-pencil').tap();
        assert.equal(await page.evaluate(() => tdTool), 'pencil', 'enlarged button touch works');
        const last = panel.getByRole('button', { name: '전체 지우기', exact: true });
        await last.scrollIntoViewIfNeeded();
        const lastBox = await last.boundingBox();
        assert(lastBox.y + lastBox.height <= viewport.height + 1, 'last action reachable by scrolling');
        await panel.evaluate(el => el.scrollTop = 0);
        await page.screenshot({ path: path.join(screenshotDir, `drawtools-200-${viewport.width}-${align}.png`) });
        await page.locator('#td-drawtools-close').tap();
        assert.equal(await panel.evaluate(el => el.classList.contains('is-open')), false);
        const closed = await panel.boundingBox();
        assert(portrait ? closed.y >= viewport.height - 1
          : closed.x + closed.width <= 1 || closed.x >= viewport.width - 1, 'closed panel offscreen');
      }
    }
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload({ waitUntil: 'load' }); await measurePage(page, 'tactics');
    assert.equal(await slider.inputValue(), '200', 'size restored after reload');
    await page.locator('#btn-tactics-fullscreen').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.locator('#td-drawtools-toggle').tap();
    assert.equal(await page.locator('#td-tool-pencil').evaluate(el => getComputedStyle(el).minHeight), '56px');
    await slider.focus(); await slider.press('Home');
    assert.equal(await page.evaluate(() => getSetting('tacticsDrawtoolsScale')), 100, 'reset works');
    console.log('PASS drawing tools: touch release apply, 100-200%, independent save, portrait/landscape, both sides, scroll to bottom, touch buttons, close, reload');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
