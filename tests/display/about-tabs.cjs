const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.jsdelivr.net') return route.continue();
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: {
        '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.md': 'text/plain', '.json': 'application/json',
      }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.evaluate(() => activatePage('about'));
    await page.waitForSelector('.about-tabs');
    const tabs = page.locator('.about-tabs [role="tab"]');
    assert.equal(await tabs.count(), 11);
    assert.equal(await page.locator('#about-rendered > h1').count(), 1);
    assert.equal(await page.locator('#about-rendered > p').count(), 1);
    for (let index = 0; index < 11; index++) {
      await tabs.nth(index).click();
      assert.equal(await page.locator('.about-tab-panel:visible').count(), 1);
      const panel = page.locator('#' + await tabs.nth(index).getAttribute('aria-controls'));
      assert(await panel.isVisible());
      assert((await panel.textContent()).trim().length > 50);
      assert.equal(await tabs.nth(index).getAttribute('aria-selected'), 'true');
    }
    assert.equal(await page.locator('#about-panel-broadcast h2').count(), 2);
    const mainTab = page.locator('#about-tab-main');
    const mainMenu = page.locator('#about-submenu-main');
    await mainTab.hover();
    assert(await mainMenu.isVisible());
    assert.equal(await mainTab.getAttribute('aria-expanded'), 'true');
    await page.screenshot({ path: path.join(root, 'screenshots/about-submenu.png') });
    await mainMenu.getByRole('button', { name: '라인업 패널', exact: true }).click();
    assert.equal(await mainTab.getAttribute('aria-selected'), 'true');
    assert(await mainMenu.isVisible());
    assert.equal(await mainMenu.locator('[aria-current="location"]').textContent(), '라인업 패널');
    assert(await page.evaluate(() => document.getElementById('라인업-패널').getBoundingClientRect().top
      >= document.querySelector('.about-tabs').getBoundingClientRect().bottom));
    await mainTab.click();
    assert(await mainMenu.isVisible());
    await mainTab.press('ArrowDown');
    assert(await mainMenu.locator('button').first().evaluate(node => node === document.activeElement));
    await mainMenu.locator('button').first().press('Escape');
    assert(await mainMenu.isVisible());
    await mainTab.click();
    await page.locator('#about-panel-main h3').click();
    assert(await mainMenu.isVisible());
    await page.evaluate(() => {
      const pane = document.querySelector('#page-about .panelBody');
      pane.scrollTop = pane.scrollHeight;
    });
    await page.waitForFunction(() => document.querySelector('#about-submenu-main [aria-current="location"]')?.textContent === '선수 이름 표시');
    await mainTab.click();
    assert(await mainMenu.evaluate(menu => {
      const links = [...menu.children];
      return links[1].getBoundingClientRect().left > links[0].getBoundingClientRect().left;
    }));
    await tabs.first().click();
    await tabs.first().press('ArrowRight');
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
    await tabs.nth(1).press('End');
    assert.equal(await tabs.last().getAttribute('aria-selected'), 'true');
    // 다른 탭의 제목을 향하는 문서 링크도 SPA 경로를 바꾸지 않고 연다.
    const hash = await page.evaluate(() => location.hash);
    // 문서 로드 전에 다른 탭으로 연결되는 링크를 삽입한다.
    await page.route('**/about.md', route => route.fulfill({ body: fs.readFileSync(path.join(root, 'about.md'), 'utf8') + '\n\n[시작으로](#처음-사용하기)\n' }));
    await page.evaluate(() => loadAbout());
    await page.locator('#about-tab-info').click();
    await page.getByRole('link', { name: '시작으로', exact: true }).click();
    assert.equal(await page.locator('#about-tab-start').getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => location.hash), hash);
    assert(await page.evaluate(() => document.getElementById('처음-사용하기').getBoundingClientRect().top
      >= document.querySelector('.about-tabs').getBoundingClientRect().bottom));
    await page.screenshot({ path: path.join(root, 'screenshots/about-tabs.png') });
    await page.setViewportSize({ width: 600, height: 800 });
    await page.locator('#about-tab-tactics').hover();
    assert(await page.evaluate(() => {
      const bounds = document.getElementById('about-submenu-tactics').getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth;
    }));
    assert(await page.evaluate(() => {
      const nav = document.querySelector('.about-tabs');
      return nav.scrollWidth <= nav.clientWidth + 1;
    }));
    assert.deepEqual(errors, []);
    console.log('PASS About tabs: content, keyboard, cross-tab anchors and narrow layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
