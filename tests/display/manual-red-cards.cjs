// 수동 모드 퇴장 입력 UI, 기본/변경 단축키, 승부차기 안내 위치를 확인한다.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.log(String(e.stack).split(/\r?\n/).slice(0, 5).join(' | ')); });
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => {
      activatePage('theme');
      const toggle = document.getElementById('manualModeToggle');
      if (!toggle.checked) toggle.click();
      state.redHome = 0; state.redAway = 0; render();
    });
    await settle(page);
    const counts = () => page.evaluate(() => ({
      home: state.redHome, away: state.redAway,
      homeVal: document.getElementById('manualHomeRedVal').textContent,
      awayVal: document.getElementById('manualAwayRedVal').textContent,
      homeCards: document.querySelectorAll('#rcHome .rc-card').length,
      awayCards: document.querySelectorAll('#rcAway .rc-card').length,
    }));

    // 버튼: 0 미만/5 초과로 가지 않고 점수판 카드 수와 맞는다.
    await page.locator('#manualHomeRedMinus').click();
    for (let i = 0; i < 7; i++) await page.locator('#manualHomeRedPlus').click();
    await page.locator('#manualAwayRedPlus').click();
    assert.deepEqual(await counts(), { home: 5, away: 1, homeVal: '5', awayVal: '1', homeCards: 5, awayCards: 1 });

    // 기본 단축키: Shift+Q/A 홈, Shift+W/S 원정. 일반 점수 키와 겹치지 않는다.
    await page.locator('body').click({ position: { x: 5, y: 1075 } });
    const score = await page.evaluate(() => [state.homeScore, state.awayScore]);
    await page.keyboard.press('Shift+KeyA');
    await page.keyboard.press('Shift+KeyW');
    await page.keyboard.press('Shift+KeyS');
    await page.keyboard.press('Shift+KeyS');
    assert.deepEqual(await counts(), { home: 4, away: 0, homeVal: '4', awayVal: '0', homeCards: 4, awayCards: 0 });
    assert.deepEqual(await page.evaluate(() => [state.homeScore, state.awayScore]), score);
    assert.equal(await page.locator('#manualHomeRedPlus').getAttribute('title'), '홈 퇴장 +1 (Shift + Q)');

    // 레이아웃: PSO 안내는 PSO 버튼 바로 위, 퇴장 입력은 PSO 컨트롤 오른쪽 같은 줄.
    const box = sel => page.locator(sel).boundingBox();
    const hint = await box('#psoControlHint'), buttons = await box('#psoControls .manual-pk-buttons');
    const toggle = await box('#psoControls .theme-pso-toggle'), red = await box('#manualRedCards'), homeLabel = await box('.manual-score-group >> nth=0 >> label');
    assert(hint.y + hint.height <= buttons.y + 1 && hint.x >= toggle.x - 1, JSON.stringify({ hint, buttons }));
    assert(Math.abs(hint.y - homeLabel.y) < 6, JSON.stringify({ hint, homeLabel }));
    assert(red.x >= buttons.x + buttons.width, JSON.stringify({ red, buttons }));
    assert(Math.abs((red.y + red.height) - (buttons.y + buttons.height)) < 6, JSON.stringify({ red, buttons }));
    // 퇴장 라벨(단축키 포함)과 −/0/+ 줄의 가운데가 맞는다.
    const centers = await page.locator('#manualRedCards .manual-score-group').evaluateAll(n => n.map(g => [g.querySelector('label'), g.querySelector('.manual-score-row')].map(e => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; })));
    centers.forEach(([label, row]) => assert(Math.abs(label - row) < 1, JSON.stringify(centers)));
    await page.locator('#manual-section').screenshot({ path: 'screenshots/tests/manual-red-cards.png' });

    // 자동 모드에서는 퇴장 단축키가 동작하지 않는다.
    await page.evaluate(() => document.getElementById('manualModeToggle').click());
    await settle(page);
    await page.locator('body').click({ position: { x: 5, y: 1075 } });
    await page.keyboard.press('Shift+KeyQ');
    assert.equal((await counts()).home, 4);
    await page.evaluate(() => document.getElementById('manualModeToggle').click());

    // 설정에서 바꾼 키가 실행과 안내에 반영된다.
    await page.evaluate(() => { shortcutBindings.homeRedPlus = 'KeyK'; saveShortcutBindings(); updateScoreShortcutHint(); });
    await page.locator('body').click({ position: { x: 5, y: 1075 } });
    await page.keyboard.press('KeyK');
    assert.equal((await counts()).home, 5);
    assert.equal(await page.locator('#manualHomeRedKeys').textContent(), 'K/Shift + A');
    assert(await page.evaluate(() => shortcutActions.some(a => a[0] === 'awayRedMinus' && a[1] === '퇴장 (수동 모드)')));

    await page.reload();
    await settle(page);
    assert.equal((await counts()).home, 5);
    assert.deepEqual(errors, []);
    console.log('PASS manual red card buttons, clamping, default/custom shortcuts, auto-mode guard, PSO hint placement and persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
