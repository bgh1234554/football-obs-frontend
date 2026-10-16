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
    for (const theme of ['cl', 'default', 'pl']) {
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
      assert.equal(result.noticeShown, theme === 'pl', `${theme}: unsupported notice only on unsupported theme`);
      if (theme === 'pl') assert.equal(result.unsupported, true, 'pl: unsupported notice');
      else {
        assert.equal(result.unsupported, false);
        assert.equal(result.totalVisible, true, `${theme}: aggregate shown`);
        assert.deepEqual(result.totals, ['5', '4'], `${theme}: totals`);
      }

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
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
