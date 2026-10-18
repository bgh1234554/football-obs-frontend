const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { viewport: { width: 1920, height: 1080 }, dpr: 1, platform: 'Win32' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const data = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/1637598-lineup.json'), 'utf8'));
    data.events = [{ type: 'Card', detail: 'Yellow Card', elapsed: 10, side: 'home', playerId: 1, playerName: '선수' }];
    data.homeInjuries = [{ playerId: 1, playerName: '부상 선수', reason: 'Injury' }];
    data.awayInjuries = [];
    data.teamStats = [{ side: 'home', totalShots: 4 }, { side: 'away', totalShots: 2 }];
    await page.evaluate(async data => {
      clearPolling();
      setSetting('statCycleAuto', 'off');
      fetchFixture = async () => structuredClone(data);
      await fetchAndApplyFixtureData(data.matchInfo.fixtureId, { silent: true });
      clearPolling(); activatePage('main-small');
    }, data);
    const popup = page.getByRole('dialog', { name: '패널 글자 크기' });
    const slider = popup.getByRole('slider', { name: '글자 크기' });
    const change = async value => slider.evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    const close = async () => page.mouse.click(page.viewportSize().width - 6, 8);
    // 선수명 크기와 라벨·아이콘의 배율이 함께 바뀌어야 한다.
    const eventMetrics = () => page.locator('.lp-events-s .ev-row:has(.ev-icon)').first().evaluate(row => {
      const font = selector => parseFloat(getComputedStyle(row.querySelector(selector)).fontSize);
      const icon = row.querySelector('.ev-icon > .football-icon').getBoundingClientRect();
      return { label: font('.ev-label'), time: font('.ev-time'), iconWidth: icon.width, iconHeight: icon.height };
    });
    const baseSize = await page.evaluate(() => getSetting('eventNameSize'));
    const baseMetrics = await eventMetrics();
    await page.locator('.lp-events-s .ev-title').click();
    const largerSize = Number(await slider.getAttribute('max'));
    await change(largerSize);
    const largerMetrics = await eventMetrics();
    for (const key of Object.keys(baseMetrics)) {
      assert(Math.abs(largerMetrics[key] / baseMetrics[key] - largerSize / baseSize) < 0.02, `${key} follows event font scale`);
    }
    await popup.getByRole('button', { name: '초기화', exact: true }).click();
    await close();
    for (const [selector, category] of [
      ['.lp-events-s .ev-title', 'eventNameSize'],
      ['.lp-stat-s .st-title-bar', 'statsNameSize'],
      ['#benchPanel .dp-title', 'benchInjuryNameSize'],
      ['#injuryPanel .dp-title', 'benchInjuryNameSize'],
    ]) {
      await page.locator(selector).click();
      assert(await popup.isVisible(), selector);
      const range = page.locator(`input[data-settings-slider="${category}"]`);
      assert.equal(await slider.getAttribute('min'), await range.getAttribute('min'));
      assert.equal(await slider.getAttribute('max'), await range.getAttribute('max'));
      const before = Number(await slider.inputValue());
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await range.inputValue(), String(before + 1));
      assert.equal(await popup.locator('output').textContent(), `${before + 1}px`);
      await popup.getByRole('button', { name: '초기화', exact: true }).click();
      assert.equal(await slider.inputValue(), String(await page.evaluate(category => SETTINGS_DEFAULTS[category], category)));
      await close();
      assert.equal(await popup.count(), 0);
    }
    // 제목 주변 필터는 기존 기능을 유지한다.
    await page.locator('.lp-events-s .ev-filter-btn').first().click();
    assert.equal(await popup.count(), 0);
    await page.keyboard.press('Escape');
    // 닫을 때 현재 내용 기준 높이를 다시 맞추며, 창이 사라진 뒤에도 값은 유지된다.
    await page.locator('#benchPanel .dp-title').click();
    await change(18);
    await close();
    await settle(page);
    assert.equal(await page.evaluate(() => getSetting('benchInjuryNameSize')), 18);
    assert(await page.locator('#benchPanel').evaluate(panel => {
      const split = panel.querySelector('.dp-split');
      return split.clientHeight > 0 && split.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom;
    }), 'bench list remains inside the recalculated panel');
    // 작은 캠 하프라인은 선수 노드를 피해 누를 수 있어야 한다.
    const smallLine = page.locator('.layout-small .dp-lineup-marking-midline');
    await smallLine.click({ position: { x: 10, y: 1 } });
    assert.equal(await slider.getAttribute('max'), '20');
    await change(20);
    assert.equal(await page.evaluate(() => getSetting('lineupNameSize')), 20);
    await close();
    // F11처럼 너비는 같고 높이만 달라져도 네 칼럼이 화면 너비를 모두 채운다.
    await page.setViewportSize({ width: 1920, height: 950 });
    await page.waitForTimeout(350);
    const gap = await page.evaluate(() => {
      const layout = document.querySelector('.layout-small');
      const last = layout.querySelector('.lp-cam-chat');
      return layout.getBoundingClientRect().right - last.getBoundingClientRect().right - (parseFloat(getComputedStyle(layout).paddingRight) || 0);
    });
    assert(Math.abs(gap) < 2, `height-only resize must not leave an unused right margin: ${gap}`);
    await page.evaluate(() => activatePage('main-big'));
    await settle(page);
    const lines = page.locator('.layout-big .dp-lineup-marking-midline');
    assert.equal(await lines.count(), 2);
    for (let i = 0; i < 2; i++) {
      await lines.nth(i).click({ position: { x: 10, y: 1 } });
      await change(19 + i);
      assert.equal(await page.evaluate(() => getSetting('lineupNameSize')), 19 + i);
      await close();
    }
    // 분할을 끈 큰 캠에서도 같은 하프라인 편집기를 사용한다.
    await page.evaluate(() => setSetting('splitLineup', 'off'));
    await settle(page);
    assert.equal(await lines.count(), 1);
    await lines.first().focus();
    await page.keyboard.press('Enter');
    assert(await popup.isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await popup.count(), 0);
    // 큰 캠의 순환 패널 제목도 같은 설정으로 연결된다.
    for (const mode of ['events', 'stats', 'bench_home', 'injuries']) {
      await page.evaluate(mode => { _lpStatCycle.mode = mode; lpStatUpdateVisibility(); }, mode);
      const heading = page.locator('.layout-big .lp-stat [data-panel-font]:visible').first();
      if (mode === 'bench_home') await heading.locator('.panel-font-title-text').click();
      else await heading.click();
      assert(await popup.isVisible(), mode);
      await close();
    }
    await page.evaluate(() => document.documentElement.requestFullscreen());
    await settle(page);
    await lines.first().click({ position: { x: 10, y: 1 } });
    await change(20);
    assert.equal(await popup.evaluate(node => node.parentElement === document.fullscreenElement), true);
    await page.evaluate(() => document.exitFullscreen());
    await settle(page);
    assert.equal(await popup.count(), 0);
    assert.equal(await page.evaluate(() => getSetting('lineupNameSize')), 20);
    assert.deepEqual(errors, []);
    await page.reload();
    await settle(page);
    assert.equal(await page.locator('input[data-settings-slider="lineupNameSize"]').inputValue(), '20');
    console.log('PASS panel title sliders/reset, existing controls, combined/split half-lines, shared lineup size and height-only viewport changes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
