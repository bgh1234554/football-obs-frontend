// Run: node tests/tactics/tactics-drawtools-scale.cjs (requires Playwright).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const screenshotDir = path.join(root, 'screenshots', 'display-viewport');
fs.mkdirSync(screenshotDir, { recursive: true });
const { near, settle, openPage, measurePage } = require('./helpers');

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
