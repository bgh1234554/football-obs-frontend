// Run: node tests/tactics/tactics-topbar-scale.cjs (requires Playwright).
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
    for (const entry of ['overlay_dashboard.html']) {
      const page = await openPage(browser, { dpr: 2, platform: 'Win32', uaPlatform: 'Windows', touch: false, mobile: false,
        viewport: { width: 1280, height: 800 }, url: `http://localhost/${entry}` });
      await measurePage(page, 'tactics');
      const slider = page.locator('#tactics-topbar-scale-slider');
      assert.equal(await slider.isVisible(), false);
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      const measure = () => page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        };
        return { bar: rect('#tactics-topbar'), button: rect('#btn-tactics-fullscreen'), pitch: rect('#tactics-pitch'),
          size: rect('.td-topbar-size-control'), alpha: rect('.td-alpha-control'),
          controls: [...document.querySelectorAll('#tactics-topbar button, #tactics-topbar input, #tactics-topbar select')]
            .filter(el => el.getBoundingClientRect().width).map(el => ({ id: el.id, right: el.getBoundingClientRect().right, bottom: el.getBoundingClientRect().bottom })) };
      });
      const before = await measure();
      const track = await slider.boundingBox();
      await page.mouse.move(track.x + 5, track.y + track.height / 2);
      await page.mouse.down();
      await page.mouse.move(track.x + track.width * .75, track.y + track.height / 2, { steps: 5 });
      await settle(page);
      const pending = Number(await slider.inputValue());
      assert(pending > 100, 'drag previews a larger value');
      assert.equal(await page.locator('[data-settings-slider-value="tacticsTopbarScale"]').textContent(), `${pending}%`);
      near((await measure()).bar.height, before.bar.height, 'bar stays still while dragging', .01);
      assert.equal(await page.evaluate(() => getSetting('tacticsTopbarScale')), 100, 'drag does not save early');
      await page.mouse.up();
      await settle(page);
      assert.equal(await page.evaluate(() => getSetting('tacticsTopbarScale')), pending, 'release commits value');
      assert.equal(Number(await page.locator('#tactics-topbar').evaluate(el => getComputedStyle(el).zoom)), pending / 100, 'release applies size');
      assert((await measure()).button.height > before.button.height, 'release enlarges button');
      await slider.focus();
      await slider.press('End');
      await settle(page);
      assert.equal(await slider.inputValue(), '200');
      assert.equal(await page.locator('[data-settings-slider-value="tacticsTopbarScale"]').textContent(), '200%');
      const after = await measure();
      near(after.button.width / before.button.width, 2, 'button width doubles', .03);
      near(after.button.height / before.button.height, 2, 'button height doubles', .03);
      assert(after.bar.height > before.bar.height, 'bar grows vertically');
      assert(after.size.right <= after.alpha.x + 1 && Math.abs(after.size.y - after.alpha.y) < 2, 'size immediately left of opacity');
      for (const viewport of [{ width: 1280, height: 800 }, { width: 800, height: 1280 }]) {
        await page.evaluate(() => document.exitFullscreen());
        await page.setViewportSize(viewport);
        await page.locator('#btn-tactics-fullscreen').click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        await settle(page);
        const m = await measure();
        assert(m.bar.right <= viewport.width + 1, 'bar fits viewport');
        for (const c of m.controls) {
          assert(c.right <= m.bar.right + 1 && c.bottom <= m.bar.bottom + 1, `control fits: ${c.id}`);
        }
        assert(m.pitch.height > 100, 'pitch remains visible');
        near(m.pitch.width / m.pitch.height, 105 / 68, 'pitch aspect preserved', .005);
        await page.screenshot({ path: path.join(screenshotDir, `topbar-200-${viewport.width}-${entry}.png`) });
      }
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForFunction(() => !document.fullscreenElement);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await settle(page);
      const names = page.locator('#tactics-show-names');
      const wasChecked = await names.isChecked();
      await names.click();
      assert.equal(await names.isChecked(), !wasChecked, 'enlarged checkbox responds to click');
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.equal(await slider.isVisible(), false);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.reload({ waitUntil: 'load' });
      await measurePage(page, 'tactics');
      assert.equal(await slider.inputValue(), '200', 'saved setting restored');
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      assert.equal(await page.locator('#tactics-topbar').evaluate(el => getComputedStyle(el).zoom), '2');
      await slider.focus();
      await slider.press('Home');
      assert.equal(await slider.inputValue(), '100');
      console.log(`PASS ${entry}: 100-200% scale, landscape/portrait, click hit area, opacity placement, pitch fit, persistence, reset`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
