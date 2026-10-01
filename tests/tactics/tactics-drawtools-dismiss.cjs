// Run: node tests/tactics/tactics-drawtools-dismiss.cjs (requires Playwright).
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
    await page.locator('#btn-tactics-fullscreen').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    const cdp = await page.context().newCDPSession(page);
    const gesture = async (kind, start, end) => {
      if (kind === 'touch') {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
        if (end) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else if (kind === 'pen') {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, pointerType: 'pen', button: 'left', buttons: 1, clickCount: 1 });
        if (end) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, pointerType: 'pen', button: 'left', buttons: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...(end || start), pointerType: 'pen', button: 'left', buttons: 0, clickCount: 1 });
      } else {
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        if (end) await page.mouse.move(end.x, end.y, { steps: 5 });
        await page.mouse.up();
      }
      await settle(page);
    };
    for (const align of ['center', 'right']) {
      await page.evaluate(align => setSetting('tacticsFullscreenAlign', align), align);
      for (const kind of ['touch', 'mouse', 'pen']) {
        await page.evaluate(() => { tacticsDrawClear(); tacticsDrawSetTool('pencil'); });
        await page.locator('#td-drawtools-toggle').tap();
        await page.locator('#td-tool-pencil').tap();
        await page.locator('[data-clr="#000000"]').scrollIntoViewIfNeeded();
        await page.locator('[data-clr="#000000"]').tap();
        assert.equal(await page.evaluate(() => tdColor), '#000000', 'panel controls remain interactive');
        const pitch = await page.locator('#tactics-pitch').boundingBox();
        const start = { x: pitch.x + pitch.width * .45, y: pitch.y + pitch.height * .45 };
        const end = { x: start.x + 40, y: start.y + 30 };
        await page.evaluate(() => {
          window.pitchEvents = [];
          if (!window.recordPitchEvents) {
            window.recordPitchEvents = e => window.pitchEvents.push(e.type);
            for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click']) document.getElementById('tactics-pitch').addEventListener(type, window.recordPitchEvents);
          }
        });
        await gesture(kind, start);
        assert.equal(await page.locator('#tactics-draw-toolbar').evaluate(el => el.classList.contains('is-open')), false, 'first tap closes panel');
        assert.equal(await page.evaluate(() => tdDrawings.length), 0, 'dismiss tap leaves no dot');
        assert.deepEqual(await page.evaluate(() => window.pitchEvents), [], 'dismiss gesture never reaches pitch');
        await gesture(kind, start, end);
        assert.equal(await page.evaluate(() => tdDrawings.length), 1, 'next gesture draws normally');
        assert.equal(await page.evaluate(() => tdDrawings[0].color), '#000000');
        await page.locator('#td-drawtools-toggle').tap();
        await gesture(kind, start, end);
        assert.equal(await page.evaluate(() => tdDrawings.length), 1, 'dismiss drag leaves no stroke');
        await page.locator('#td-drawtools-toggle').tap();
        await page.locator('#tactics-draw-toolbar').evaluate(el => el.scrollTop = 0);
        await page.locator('#td-drawtools-close').tap();
        assert.equal(await page.locator('#td-drawtools-backdrop').isVisible(), false, 'X removes backdrop');
        console.log(`PASS ${kind} / ${align}: panel controls work, outside tap/drag only dismisses, next gesture draws`);
      }
    }
    await page.locator('#td-drawtools-toggle').tap();
    const fullscreenButton = page.locator('#btn-tactics-fullscreen');
    const buttonBox = await fullscreenButton.boundingBox();
    assert(buttonBox, 'fullscreen button remains visible in the touch topbar');
    await gesture('touch', { x: buttonBox.x + buttonBox.width / 2, y: buttonBox.y + buttonBox.height / 2 });
    assert(await page.evaluate(() => !!document.fullscreenElement), 'first outside tap does not activate underlying topbar');
    await fullscreenButton.tap();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await page.locator('#td-drawtools-backdrop').isVisible(), false, 'normal mode has no blocker');
    console.log('PASS topbar first-tap dismissal and normal-mode interaction');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
