// 실행: node tests/display/display-viewport.cjs (Playwright 필요).
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
  // 경기 일정 그리드 주변에는 안쪽 여백 8px이 있습니다.
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
    const baseline = {};
    for (const dpr of [1, 1.25, 1.5, 2, 0.25, 0.5, 5]) {
      // DPR이 1 미만인 경우 CSS 확대/축소를 사용하며, 글꼴 힌팅으로 1픽셀 반올림이 발생할 수 있습니다.
      const tolerance = dpr < 1 ? 2 : 0.01;
      const page = await openPage(browser, { dpr, platform: 'Win32', viewport: { width: 1920 / dpr, height: 1080 / dpr } });
      for (const name of ['schedule', 'tactics']) {
        const m = await measurePage(page, name);
        if (process.env.DEBUG_VIEWPORT) console.log(name, dpr, JSON.stringify(m));
        fillsViewport(m, `Windows ${dpr} ${name}`);
        baseline[name] ||= m;
        for (const key of ['body', 'board', 'content', ...(m.pitch ? ['pitch', 'token'] : [])]) {
          for (const dimension of ['width', 'height']) {
            const expected = baseline[name][key][dimension];
            near(m[key][dimension] * dpr, expected, `Windows ${dpr} ${name} ${key} ${dimension}`, tolerance);
          }
        }
        m.text.forEach((text, i) => {
          near(parseFloat(text.font), parseFloat(baseline[name].text[i].font),
            `Windows ${dpr} ${name} font ${i}`, tolerance);
          assert.equal(text.text, baseline[name].text[i].text);
          near(text.width, baseline[name].text[i].width, `Windows ${dpr} ${name} text width ${i}`, tolerance);
          near(text.height, baseline[name].text[i].height, `Windows ${dpr} ${name} text height ${i}`, tolerance);
        });
        await page.screenshot({ path: path.join(screenshotDir, `windows-${dpr}-${name}.png`), scale: 'device' });
      }
      await page.locator('#btn-tactics-fullscreen').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await settle(page);
      const fullscreen = await measurePage(page, 'tactics');
      baseline.fullscreen ||= fullscreen;
      for (const key of ['content', 'pitch', 'token']) {
        for (const dimension of ['width', 'height']) {
          near(fullscreen[key][dimension] * dpr, baseline.fullscreen[key][dimension],
            `Windows ${dpr} fullscreen ${key} ${dimension}`, tolerance);
        }
      }
      fullscreen.text.forEach((text, i) => {
        near(parseFloat(text.font), parseFloat(baseline.fullscreen.text[i].font), `fullscreen font ${i}`, dpr < 1 ? 0.1 : 0.001);
        near(text.width, baseline.fullscreen.text[i].width, `Windows ${dpr} fullscreen text ${i}`, tolerance);
      });
      const panels = await page.evaluate(() => ['#tactics-timeline-panel', '#tactics-draw-toolbar'].map(selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { height: r.height, viewportHeight: innerHeight };
      }));
      panels.forEach(m => near(m.height, m.viewportHeight, `Windows ${dpr} fullscreen panel height`));
      await page.mouse.move(0, 0);
      await page.screenshot({ path: path.join(screenshotDir, `windows-${dpr}-fullscreen.png`), scale: 'device' });
      await testPen(page);
      await page.evaluate(() => document.exitFullscreen());
      await settle(page);
      const token = page.locator('.tactics-token').first();
      const before = await token.boundingBox();
      await page.mouse.move(before.x + before.width / 2, before.y + 5 / dpr);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 + 32 / dpr, before.y + 25 / dpr, { steps: 3 });
      await page.mouse.up();
      const after = await token.boundingBox();
      near((after.x - before.x) * dpr, 32, `Windows ${dpr} player drag X`, 0.2);
      near((after.y - before.y) * dpr, 20, `Windows ${dpr} player drag Y`, 0.2);
      await page.setViewportSize({ width: 1280, height: 720 });
      fillsViewport(await measurePage(page, 'schedule'), `Windows ${dpr} resize`);
      await page.close();
      console.log(`PASS Windows ${dpr * 100}%: physical sizes, schedule/tactics, resize, fullscreen panels`);
    }
    const changing = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows',
      viewport: { width: 1920, height: 1080 } });
    const cdp = await changing.context().newCDPSession(changing);
    for (const dpr of [1.25, 1.5, 2, 1]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1920 / dpr, height: 1080 / dpr, deviceScaleFactor: dpr, mobile: false
      });
      await changing.waitForFunction(dpr => document.documentElement.style.getPropertyValue('--display-scale') === String(1 / dpr), dpr);
      const m = await measurePage(changing, 'schedule');
      fillsViewport(m, `DPR change ${dpr}`);
      near(m.board.width * dpr, baseline.schedule.board.width, `DPR change ${dpr} board`, 0.01);
    }
    await changing.close();
    console.log('PASS Windows running display-scale changes: 100 → 125 → 150 → 200 → 100%');
    const tabletMatch = await openPage(browser, { dpr: 2, platform: 'Linux armv8l', uaPlatform: 'Android',
      touch: true, mobile: true, viewport: { width: 960, height: 540 } });
    for (const name of ['schedule', 'tactics']) {
      const m = await measurePage(tabletMatch, name);
      fillsViewport(m, `Android tablet ${name}`);
      assert(m.board.width > 0 && m.content.width > 0, `${name}: visible content`);
      if (m.pitch) assert(m.pitch.width > 0 && m.pitch.height > 0, 'visible tactics pitch');
    }
    await tabletMatch.close();
    console.log('PASS Android tablet: responsive content fits the viewport');
    for (const viewport of [
      { width: 3840, height: 2160 }, { width: 2560, height: 1440 },
      { width: 1920, height: 955 }, { width: 2560, height: 1080 }, { width: 1280, height: 800 }
    ]) {
      const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport });
      const factor = viewport.width / 1920;
      for (const name of ['schedule', 'tactics']) {
        const m = await measurePage(page, name);
        fillsViewport(m, `${viewport.width}x${viewport.height} ${name}`);
        near(m.board.width / factor, baseline[name].board.width, 'resolution-independent scoreboard width', 0.01);
        if (viewport.width / viewport.height === 16 / 9) {
          for (const key of ['board', 'content', ...(m.pitch ? ['pitch', 'token'] : [])]) {
            for (const dimension of ['width', 'height']) {
              near(m[key][dimension] / factor, baseline[name][key][dimension], `${viewport.width} ${key} ${dimension}`, 0.01);
            }
          }
          m.text.forEach((text, i) => {
            assert.equal(text.font, baseline[name].text[i].font);
            near(text.width / factor, baseline[name].text[i].width, `${viewport.width} text ${i}`, 0.01);
          });
        }
        if (m.pitch) near(m.pitch.width / m.pitch.height, 105 / 68, 'pitch aspect ratio preserved', 0.002);
        if (viewport.width === 3840) await page.screenshot({ path: path.join(screenshotDir, `4k-${name}.png`) });
      }
      await page.close();
      console.log(`PASS ${viewport.width}x${viewport.height}: proportional UI, viewport filled, pitch aspect preserved`);
    }
    for (const device of [
      { label: 'Android tablet', platform: 'Linux armv8l', uaPlatform: 'Android', touch: true, mobile: true },
      { label: 'Android desktop site', platform: 'Linux x86_64', uaPlatform: 'Android', touch: true },
      { label: 'iPad desktop site', platform: 'MacIntel', touch: true },
      { label: 'Mac Retina', platform: 'MacIntel' }
    ]) {
      const page = await openPage(browser, { ...device, dpr: 2, viewport: { width: 1280, height: 800 } });
      for (const viewport of [{ width: 1280, height: 800 }, { width: 800, height: 1280 }]) {
        await page.setViewportSize(viewport);
        for (const name of ['schedule', 'tactics']) {
          const m = await measurePage(page, name);
          assert.equal(m.zoom, 1, `${device.label} uses transform without CSS zoom rounding`);
          fillsViewport(m, `${device.label} ${name}`);
          const scroll = await page.evaluate(() => {
            window.scrollTo(1000, 1000);
            return { x: scrollX, y: scrollY, width: document.documentElement.scrollWidth, viewport: innerWidth };
          });
          assert.equal(scroll.x, 0, `${device.label} blank horizontal scroll`);
          assert.equal(scroll.y, 0, `${device.label} blank vertical scroll`);
          assert(scroll.width <= scroll.viewport + 1, `${device.label} document overflow`);
        }
      }
      if (device.touch) {
        await page.setViewportSize({ width: 1280, height: 800 });
        if (device.mobile) await testTouchScrolling(page);
        await measurePage(page, 'tactics');
        await page.locator('#btn-tactics-fullscreen').click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        await settle(page);
        const full = await page.evaluate(() => {
          const pitch = document.querySelector('#tactics-pitch').getBoundingClientRect();
          const token = document.querySelector('.tactics-token > div').getBoundingClientRect();
          return { ratio: token.width / pitch.width,
            wrappedControls: [...document.querySelectorAll('#tactics-topbar > button, #tactics-topbar > label')]
              .filter(el => el.getBoundingClientRect().width && getComputedStyle(el).whiteSpace !== 'nowrap').length };
        });
        assert(full.ratio < 0.05, `${device.label} fullscreen player tokens are oversized: ${full.ratio}`);
        assert.equal(full.wrappedControls, 0, `${device.label} toolbar labels wrap internally`);
        await page.mouse.move(0, 0);
        await page.screenshot({ path: path.join(screenshotDir, `${device.label.replaceAll(' ', '-')}-fullscreen.png`) });
        await testPen(page);
      }
      await page.close();
      console.log(`PASS ${device.label}: physical pixel scale, landscape/portrait, no blank scrolling, fullscreen pen input`);
    }
    const lan = await openPage(browser, { dpr: 2, platform: 'Linux armv8l', uaPlatform: 'Android', touch: true,
      viewport: { width: 1280, height: 800 }, url: 'http://192.168.35.145:5501/overlay_dashboard.html#/schedule' });
    for (const name of ['schedule', 'tactics']) {
      fillsViewport(await measurePage(lan, name), `LAN ${name}`);
      assert.equal(new URL(lan.url()).pathname, '/overlay_dashboard.html');
      assert.equal(new URL(lan.url()).hash, `#/${name}`);
      await lan.reload({ waitUntil: 'load' });
      assert(await lan.locator(`#page-${name}`).evaluate(el => el.classList.contains('active')));
    }
    await lan.close();
    console.log('PASS LAN Live Server: tab navigation and reload retain HTML entry and active page');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
