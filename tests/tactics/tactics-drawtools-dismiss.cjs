// Run: node tests/tactics/tactics-drawtools-dismiss.cjs (requires Playwright).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { near, settle, openPage, measurePage } = require('./helpers');

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
