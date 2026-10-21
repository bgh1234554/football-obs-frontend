// 점수 영역 클릭 시 열리는 합계 점수 빠른 입력이 테마 탭 입력과 같은 state를 바꾸는지 확인한다.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', error => errors.push(error.message));
    for (const theme of ['cl', 'default']) {
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => {
        state.homeName = '올랭피크 리옹'; state.awayName = '크리스탈 팰리스';
        state.homeScore = 3; state.awayScore = 2; state.aggEnabled = false; state.aggHomeBase = 0; state.aggAwayBase = 0;
        state.boardScale = 75; render(); fsmBoardRender(); reapplyBoardScale();
      });
      await settle(page);
      const panel = page.locator('#boardAggControls');
      assert.equal(await panel.isHidden(), true, `${theme}: closed by default`);
      const wrapHeight = () => page.evaluate(() => document.getElementById('boardStageWrap').getBoundingClientRect().height);
      const closedHeight = await wrapHeight();

      // 점수 칸 클릭으로 열고, 다시 클릭하면 닫힌다.
      await page.locator('#team-score-left').click();
      await settle(page);
      assert.equal(await panel.isVisible(), true, `${theme}: opens on score click`);
      const scoreRange = panel.locator('[data-scale-key="boardScale"] input');
      await scoreRange.fill('90');
      await settle(page);
      assert.equal(await page.evaluate(() => state.boardScale), 90);
      assert.equal(await page.locator('#boardScaleRange').inputValue(), '90');
      await page.screenshot({ path: `screenshots/tests/score-scale-${theme}.png` });
      await panel.locator('.fsm-scale-control button').click();
      assert.equal(await scoreRange.inputValue(), '75');
      // 실제 포인터 드래그 중 메뉴가 움직이거나 숨겨져 range 조작이 끊기면 안 됩니다.
      await page.evaluate(() => { state.manualMode = true; activatePage('main-small'); });
      await settle(page);
      const sliderBox = await scoreRange.boundingBox();
      const menuBox = await panel.boundingBox();
      const heightBeforeDrag = await wrapHeight();
      await page.evaluate(() => {
        window.scaleStorageWrites = 0;
        window.scaleOriginalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(...args) { window.scaleStorageWrites++; return window.scaleOriginalSetItem.apply(this, args); };
      });
      await page.mouse.move(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sliderBox.x + sliderBox.width * .85, sliderBox.y + sliderBox.height / 2, { steps: 12 });
      const duringDrag = await panel.boundingBox();
      assert(Math.abs(duringDrag.x - menuBox.x) < 1 && Math.abs(duringDrag.y - menuBox.y) < 1, 'menu stays fixed while dragging');
      assert(Math.abs(duringDrag.width - menuBox.width) < 1, 'menu keeps its width while dragging');
      assert(Number(await scoreRange.inputValue()) > 88, 'native range drag reaches the pointer');
      assert.equal(await wrapHeight(), heightBeforeDrag, 'drag does not resize the surrounding panels');
      assert.equal(await page.evaluate(() => window.scaleStorageWrites), 0, 'drag does not serialize state on every movement');
      await page.mouse.up();
      assert((await wrapHeight()) > heightBeforeDrag, 'final height applied after release');
      assert(await page.evaluate(() => window.scaleStorageWrites > 0), 'final scale persisted');
      await page.evaluate(() => { Storage.prototype.setItem = window.scaleOriginalSetItem; });
      await panel.locator('.fsm-scale-control button').click();
      await page.locator('#team-score-right').click();
      assert.equal(await panel.isHidden(), true, `${theme}: toggles closed`);
      await page.locator('.score-div').click({ force: true });
      await settle(page);
      assert.equal(await panel.isVisible(), true, `${theme}: opens on divider click`);

      // 표시 토글과 +/- , 직접 입력이 테마 탭 입력과 같은 값을 바꾼다.
      await panel.locator('[data-agg-action="toggle"]').click();
      await panel.locator('[data-agg-action="homePlus"]').click();
      await panel.locator('[data-agg-action="homePlus"]').click();
      await panel.locator('[data-agg-action="homePlus"]').click();
      await panel.locator('[data-agg-action="homeMinus"]').click();
      await panel.locator('[data-agg-input="away"]').fill('2');
      await settle(page); await settle(page);
      // 메뉴는 아래 패널 위에 겹쳐 뜰 뿐 점수판 영역 높이에 들어가지 않는다(다시 그린 뒤에도).
      assert.equal(await wrapHeight(), closedHeight, `${theme}: open menu must not grow board area`);
      const result = await page.evaluate(() => ({
        enabled: state.aggEnabled, home: state.aggHomeBase, away: state.aggAwayBase,
        themeToggle: document.getElementById('aggToggle').checked,
        themeHome: document.getElementById('aggHomeBase').value, themeAway: document.getElementById('aggAwayBase').value,
        totals: [...document.querySelectorAll('.fsm-board .total')].map(node => node.textContent),
        totalVisible: getComputedStyle(document.querySelector('.fsm-board .total-score')).display !== 'none',
        pressed: document.querySelector('#boardAggControls .agg-quick-toggle').getAttribute('aria-pressed'),
        summary: document.querySelector('#boardAggControls .agg-quick-total').textContent,
        unsupported: document.getElementById('boardAggControls').classList.contains('is-unsupported'),
        noticeShown: getComputedStyle(document.querySelector('#boardAggControls .agg-quick-unsupported')).display !== 'none',
        saved: JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => (localStorage.getItem(key) || '').includes('"aggHomeBase"')) || 'null'))
      }));
      assert.deepEqual([result.enabled, result.home, result.away], [true, 2, 2], `${theme}: ${JSON.stringify(result)}`);
      assert.deepEqual([result.themeToggle, result.themeHome, result.themeAway], [true, '2', '2'], `${theme}: theme tab synced`);
      assert.equal(result.pressed, 'true');
      assert.equal(result.summary, '합계 5 : 4');
      assert.equal(result.saved?.aggHomeBase, 2, `${theme}: persisted`);
      assert.equal(result.noticeShown, false, `${theme}: no unsupported notice`);
      assert.equal(result.unsupported, false);
      assert.equal(result.totalVisible, true, `${theme}: aggregate shown`);
      assert.deepEqual(result.totals, ['5', '4'], `${theme}: totals`);

      // 패널은 점수 영역 가운데 아래에 열리고 화면 밖으로 나가지 않는다.
      const geometry = await page.evaluate(() => {
        const panel = document.getElementById('boardAggControls').getBoundingClientRect();
        const main = document.querySelector('.fsm-board .scoreboard-main').getBoundingClientRect();
        const score = document.querySelector('.fsm-board .score-div').getBoundingClientRect();
        return { panelTop: panel.top, panelCenter: (panel.left + panel.right) / 2, scoreCenter: (score.left + score.right) / 2, mainBottom: main.bottom, left: panel.left, right: panel.right };
      });
      assert(geometry.panelTop >= geometry.mainBottom - 1, `${theme}: below board ${JSON.stringify(geometry)}`);
      assert(Math.abs(geometry.panelCenter - geometry.scoreCenter) < 40, `${theme}: centered ${JSON.stringify(geometry)}`);
      assert(geometry.left >= 0 && geometry.right <= 1920, `${theme}: inside viewport`);
      const stage = await page.locator('#boardStageInner').boundingBox();
      await page.screenshot({ path: `screenshots/tests/aggregate-quick-${theme}.png`, clip: { x: stage.x, y: stage.y, width: stage.width, height: 260 } });

      // 입력칸에서 숫자를 쳐도 단축키(탭 전환 등)가 동작하지 않는다.
      const before = await page.evaluate(() => document.querySelector('.page.active')?.id);
      await panel.locator('[data-agg-input="home"]').fill('');
      await panel.locator('[data-agg-input="home"]').type('4');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => state.aggHomeBase), 4, `${theme}: typed value`);
      assert.equal(await page.evaluate(() => document.querySelector('.page.active')?.id), before, `${theme}: no shortcut`);

      // Esc와 바깥 클릭으로 닫힌다.
      await page.keyboard.press('Escape');
      assert.equal(await panel.isHidden(), true, `${theme}: Esc closes`);
      await page.locator('#team-score-left').click();
      await page.mouse.click(5, 600);
      assert.equal(await panel.isHidden(), true, `${theme}: outside click closes`);
      console.log('PASS', theme, 'aggregate quick controls');
    }
    // 합계 미지원 테마도 크기 조절은 열리지만 합계 입력과 표시는 숨깁니다.
    for (const theme of ['pl', 'dfb']) {
      await page.evaluate(theme => { state.aggEnabled = true; applyTheme(theme, null); }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => { render(); fsmBoardRender(); });
      await settle(page);
      const panel = page.locator('#boardAggControls');
      await page.locator('#team-score-left').click({ force: true });
      await page.locator('.score-div').click({ force: true });
      await page.locator('#team-score-left').focus().catch(() => {});
      await page.keyboard.press('Enter');
      await settle(page);
      const blocked = await page.evaluate(() => ({
        cursor: getComputedStyle(document.getElementById('team-score-left')).cursor,
        role: document.getElementById('team-score-left').getAttribute('role'),
        tabIndex: document.getElementById('team-score-left').getAttribute('tabindex'),
        totalShown: [...document.querySelectorAll('.fsm-board .total-score')].some(node => getComputedStyle(node).display !== 'none')
      }));
      assert.equal(await panel.isVisible(), true, `${theme}: size menu available`);
      assert.equal(await panel.locator('.agg-quick-toggle').isHidden(), true);
      assert.equal(blocked.role, 'button', `${theme}: size control accessible`);
      assert.equal(blocked.tabIndex, '0');
      assert.equal(blocked.totalShown, false, `${theme}: aggregate hidden even when enabled`);
      console.log('PASS', theme, 'size controls available without aggregate controls');
      await page.keyboard.press('Escape');
    }
    // 지원하는 점수판으로 돌아오면 다시 열린다.
    await page.evaluate(() => applyTheme('cl', null));
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => { render(); fsmBoardRender(); });
    await settle(page);
    await page.mouse.click(1900, 1000);
    await page.locator('#team-score-left').focus();
    await page.keyboard.press('Enter');
    await settle(page);
    assert.equal(await page.locator('#boardAggControls').isVisible(), true, 'cl: menu opens again after leaving unsupported board');
    await page.keyboard.press('Escape');
    for (const side of ['home', 'away']) {
      const name = page.locator(`#${side}Card .team-name .text`);
      const before = await page.locator('#board').evaluate(node => node.getBoundingClientRect().width);
      await page.locator(`#${side}Card`).click();
      const menu = page.locator('#scoreboardTeamEditMenu');
      await menu.locator('input[type="range"]').fill('70');
      await settle(page);
      assert(await page.locator('#board').evaluate((node, before) => node.getBoundingClientRect().width < before, before));
      assert.equal(await page.locator('#boardScaleRange').inputValue(), '70');
      assert.equal(await menu.locator('output').textContent(), '70%');
      await page.screenshot({ path: `screenshots/tests/team-scale-${side}.png` });
      await menu.locator('.fsm-scale-control button').click();
      assert.equal(await menu.locator('input').inputValue(), '75');
      await page.keyboard.press('Escape');
    }
    // 카메라 뷰도 드래그 중 주변 배치를 유지하고 놓을 때 최종 높이를 적용합니다.
    await page.evaluate(() => { activatePage('main-big'); state.boardScale = 50; reapplyBoardScale(); });
    await page.mouse.click(1900, 1000);
    await page.locator('#team-score-left').click();
    const cameraRange = page.locator('#boardAggControls input[type="range"]');
    const cameraBox = await cameraRange.boundingBox();
    const cameraHeight = await page.locator('#boardStageWrap').evaluate(node => node.offsetHeight);
    const cameraBoardWidth = await page.locator('#board').evaluate(node => node.getBoundingClientRect().width);
    await page.mouse.move(cameraBox.x + 7, cameraBox.y + cameraBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cameraBox.x + cameraBox.width - 7, cameraBox.y + cameraBox.height / 2, { steps: 15 });
    await settle(page);
    assert.equal(await page.locator('#boardStageWrap').evaluate(node => node.offsetHeight), cameraHeight, 'camera surrounding panels stay fixed during drag');
    assert((await page.locator('#board').evaluate(node => node.getBoundingClientRect().width)) > cameraBoardWidth, 'camera board previews scale during drag');
    await page.mouse.up();
    await settle(page);
    assert((await page.locator('#boardStageWrap').evaluate(node => node.offsetHeight)) > cameraHeight, 'camera final height applied after release');
    await cameraRange.fill('50');
    await settle(page);
    assert.equal(await page.locator('#boardStageWrap').evaluate(node => node.offsetHeight), cameraHeight, 'camera height restored at 50%');
    // 같은 프레임의 입력은 합치고, 프레임 전에 놓아도 마지막 값을 보존합니다.
    const burst = await page.evaluate(async () => {
      const range = document.querySelector('#boardAggControls input[type="range"]');
      range.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const initial = document.getElementById('boardStageInner').style.transform;
      for (const value of [55, 60, 65, 70]) {
        range.value = value;
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const deferred = document.getElementById('boardStageInner').style.transform === initial;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const preview = document.getElementById('boardStageInner').style.transform;
      range.value = 80;
      range.dispatchEvent(new Event('input', { bubbles: true }));
      finishScoreboardScaleDrag();
      await new Promise(resolve => requestAnimationFrame(resolve));
      return { deferred, preview, final: document.getElementById('boardStageInner').style.transform };
    });
    assert.ok(burst.deferred, 'scale burst waits for the next frame');
    assert.equal(burst.preview, 'scale(0.7)', 'scale burst previews the latest value');
    assert.equal(burst.final, 'scale(0.8)', 'release flushes the final value before pending preview');
    assert.equal(await page.evaluate(() => {
      const original = window.addEventListener;
      let added = 0;
      window.addEventListener = function(type, ...args) {
        if (type === 'pointerup') added++;
        return original.call(this, type, ...args);
      };
      try {
        for (let i = 0; i < 10; i++) createScoreboardScaleControl('boardScale', 'Scale');
      } finally { window.addEventListener = original; }
      return added;
    }), 0, 'recreating controls must not add global pointerup listeners');
    await page.evaluate(() => {
      // 패널 없는 팀명 메뉴에서도 종료 후 재배율 적용과 저장이 실행되어야 합니다.
      state.boardScale = 65;
      window.fsmScaleDrag = { panel: null, styles: [['left', '0px']] };
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
    assert.equal(await page.evaluate(() => window.fsmScaleDrag), null);
    assert.equal(await page.locator('#boardScaleRange').inputValue(), '65');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('obs-scoreboard-state-v2')).boardScale), 65);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
