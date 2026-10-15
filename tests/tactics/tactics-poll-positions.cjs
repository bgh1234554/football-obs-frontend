const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('./helpers');
const fixture = require('../fixtures/1637598-lineup.json');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1280, height: 900 } });
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
    console.log('tactics-poll-positions: passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
