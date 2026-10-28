const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('./helpers');
const fixture = require('../fixtures/1637598-lineup.json');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1280, height: 900 } });
    await page.evaluate(() => activatePage('tactics'));
    const swap = page.getByRole('button', { name: '진영 바꾸기', exact: true });
    const beforeSwap = await page.evaluate(() => {
      tacticsState.homePositions[0] = { x: 23, y: 37 };
      tacticsRenderTokens();
      return structuredClone(tacticsState.homePositions);
    });
    await swap.click();
    assert.deepEqual(await page.evaluate(() => tacticsState.homePositions), beforeSwap.map(p => ({ x: 100 - p.x, y: p.y })));
    await page.evaluate(() => tacticsApplyFm());
    assert.equal(await page.evaluate(() => tacticsState.homePositions[0].x), 77, '포메이션 갱신 뒤에도 반전된 수동 좌표 유지');
    await swap.click();
    assert.deepEqual(await page.evaluate(() => tacticsState.homePositions), beforeSwap, '두 번 바꾸면 수동 배치 복원');
    const drawingSwap = await page.evaluate(() => {
      const drawing = { type: 'arrow', x1: 15, y1: 25, x2: 40, y2: 65, color: '#ffffff' };
      tdDrawings.push(drawing);
      tdHistoryPush({ type: 'draw', drawing });
      tacticsState.ballPosition = { x: 30, y: 45 };
      tacticsToggleOrientation();
      tacticsSwapEnds();
      const mirrored = { drawing: structuredClone(drawing), ball: structuredClone(tacticsState.ballPosition) };
      tdUndo();
      const removed = !tdDrawings.includes(drawing);
      tdRedo();
      const restored = tdDrawings.includes(drawing);
      tacticsSwapEnds();
      tacticsToggleOrientation();
      const original = structuredClone(drawing);
      tdUndo();
      return { mirrored, removed, restored, original };
    });
    assert.deepEqual(drawingSwap.mirrored.drawing, { type: 'arrow', x1: 85, y1: 25, x2: 60, y2: 65, color: '#ffffff' });
    assert.deepEqual(drawingSwap.mirrored.ball, { x: 70, y: 45 });
    assert(drawingSwap.removed && drawingSwap.restored, '진영 반전 뒤에도 그림 되돌리기/다시 실행 유지');
    assert.equal(drawingSwap.original.x1, 15);
    await page.evaluate(() => tacticsToggleFullscreen());
    await page.waitForFunction(() => !!document.fullscreenElement);
    assert.equal(await swap.locator('.td-btn-label').isVisible(), false);
    await page.evaluate(() => document.exitFullscreen());
    const result = await page.evaluate(fixture => {
      fixture.matchInfo.status = '2H';
      fixture.matchInfo.elapsed = 65;
      const apply = data => {
        applyLineupPanels(structuredClone(data));
        applyTacticsTimeline(structuredClone(data));
      };
      const positions = () => JSON.parse(JSON.stringify({
        home: tacticsState.homePositions,
        away: tacticsState.awayPositions,
      }));
      apply(fixture);
      const initial = positions();
      // 드래그가 저장하는 좌표를 양 팀에 설정하고 실제 폴링 적용 순서를 반복한다.
      tacticsState.homePositions[0] = { x: 37, y: 41 };
      tacticsState.awayPositions[0] = { x: 62, y: 59 };
      const moved = positions();
      for (let i = 0; i < 3; i++) apply(fixture);
      const refreshed = positions();
      const token = document.querySelector('.tactics-token[data-team="home"]');
      const rendered = { left: token.style.left, top: token.style.top };
      fixture.matchInfo.fixtureId += 1;
      apply(fixture);
      return { initial, moved, refreshed, rendered, switched: positions() };
    }, fixture);
    assert.deepEqual(result.refreshed, result.moved, '반복 폴링 시 양 팀의 수동 좌표 유지');
    assert.deepEqual(result.rendered, { left: '37%', top: '59%' }, '갱신된 토큰도 이동 좌표에 표시');
    assert.deepEqual(result.switched, result.initial, '다른 경기 선택 시 기본 좌표 적용');
    const modes = await page.evaluate(() => {
      const select = document.getElementById('tactics-home-fm');
      const source = structuredClone(tacticsState.sourceLineup);
      select.value = '5-4-1';
      tacticsApplyFm();
      source.home.formation = '3-5-2';
      tacticsApplyLineup(source, { preservePositions: true });
      const manual = tacticsState.lineup.home.formation;
      select.value = 'auto';
      tacticsApplyFm();
      return { manual, automatic: tacticsState.lineup.home.formation, first: select.options[0].value };
    });
    assert.deepEqual(modes, { manual: '5-4-1', automatic: '3-5-2', first: 'auto' });
    await page.evaluate(() => activatePage('tactics'));
    const trigger = page.locator('.td-fm-home .td-fm-trigger');
    await trigger.click();
    await page.locator('#tactics-home-fm-menu [data-value="4-3-3"]').click();
    assert.equal(await page.locator('#tactics-home-fm').inputValue(), '4-3-3');
    await trigger.click();
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click();
    await page.screenshot({ path: 'screenshots/tests/tactics-formation-menu.png' });
    await page.keyboard.press('Escape');
    // 강제 터치 배치와 실제 터치 입력 모두에서 메뉴는 세로 목록이고 컨트롤끼리 겹치지 않는다.
    for (const { width, height, touch } of [
      { width: 1920, height: 1080, touch: false },
      { width: 1366, height: 768, touch: false },
      { width: 1024, height: 768, touch: true },
      { width: 768, height: 1024, touch: true },
      { width: 844, height: 390, touch: true },
      { width: 390, height: 844, touch: true }
    ]) {
      const preview = await openPage(browser, { dpr: 1, platform: touch ? 'Linux armv8l' : 'Win32',
        touch, viewport: { width, height } });
      try {
        await preview.evaluate(() => { activatePage('tactics'); setSetting('tacticsTouchLayout', 'on'); });
        for (const side of ['home', 'away']) {
          await preview.locator(`.td-fm-${side} .td-fm-trigger`).click();
          const menu = preview.locator(`#tactics-${side}-fm-menu`);
          const geometry = await menu.evaluate(menu => {
            const box = menu.getBoundingClientRect();
            const buttons = [...menu.querySelectorAll('button')].map(button => button.getBoundingClientRect());
            return { left: box.left, right: box.right, viewport: innerWidth,
              horizontalOverflow: menu.scrollWidth - menu.clientWidth,
              list: buttons.slice(0, 3).map(button => ({ left: button.left, top: button.top, bottom: button.bottom })) };
          });
          assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, JSON.stringify({ width, height, side, geometry }));
          assert(geometry.horizontalOverflow <= 1);
          assert(geometry.list[1].top >= geometry.list[0].bottom - 1 && geometry.list[2].top >= geometry.list[1].bottom - 1);
          await menu.locator('[data-value="5-4-1"]').click();
          assert.equal(await preview.locator(`#tactics-${side}-fm`).inputValue(), '5-4-1');
        }
        const touchSwap = preview.getByRole('button', { name: '진영 바꾸기', exact: true });
        assert(await touchSwap.isVisible());
        assert.equal(await touchSwap.locator('.td-btn-label').isVisible(), false);
        await touchSwap.click();
        assert.equal(await touchSwap.getAttribute('aria-pressed'), 'true');
        await touchSwap.click();
        await preview.locator('#td-topbar-more-btn').click();
        const sliders = await preview.locator('#tactics-topbar .td-topbar-secondary .td-alpha-slider').evaluateAll(inputs => inputs.map(input => {
          const rect = input.getBoundingClientRect(), parent = input.parentElement.getBoundingClientRect();
          const reset = input.parentElement.querySelector('.td-slider-reset').getBoundingClientRect();
          return { width: rect.width, left: parent.left, right: parent.right, resetRight: reset.right, viewport: innerWidth };
        }));
        for (const slider of sliders) {
          assert(slider.width >= 65, JSON.stringify({ width, height, slider }));
          assert(slider.left >= -1 && slider.right <= slider.viewport + 1 && slider.resetRight <= slider.right + 1);
        }
        await preview.screenshot({ path: `screenshots/tests/tactics-touch-${width}x${height}.png` });
      } finally { await preview.close(); }
    }
    console.log('tactics-poll-positions: passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
