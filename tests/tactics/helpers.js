const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
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

module.exports = { near, settle, openPage, measurePage };
