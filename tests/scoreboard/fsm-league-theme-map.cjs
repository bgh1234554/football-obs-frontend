// 리그 ID -> 점수판 테마 자동 매핑과 수동 선택을 모든 테마에 대해 한 번에 확인한다.
// (예전 테마별 테스트의 "auto/manual theme" 확인을 테마가 늘어나도 그대로 쓰는 형태로 합침)
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', error => errors.push(error.message));
    const { map, themes } = await page.evaluate(() => ({ map: LEAGUE_THEME_MAP, themes: Object.keys(FSM_THEMES) }));
    // 아직 만들지 않은 테마(예: 1166 클럽 월드컵 -> cwc25)는 기본 테마로 표시된다. 실패 대신 안내만 남긴다.
    const pending = Object.entries(map).filter(([, entry]) => !themes.includes(entry.theme));
    for (const [id, entry] of pending) console.log(`NOTE league ${id} -> theme '${entry.theme}' not built yet, shown as default`);
    // 기본 테마를 뺀 모든 테마는 최소 한 리그에 연결되어 있어야 자동 선택이 가능하다.
    const mapped = new Set(Object.values(map).map(entry => entry.theme));
    const unmapped = themes.filter(theme => theme !== 'default' && !mapped.has(theme));
    assert.deepEqual(unmapped, [], `themes without league mapping: ${unmapped}`);

    // 자동 모드: 리그 ID마다 해당 테마가 실제로 적용된다.
    for (const [id, entry] of Object.entries(map)) {
      await page.evaluate(id => { state.fsmTheme = 'auto'; autoApplyTemplateByLeagueId(Number(id), null); render(); }, id);
      await page.waitForFunction(() => !pendingThemeLink);
      assert.equal(await page.evaluate(() => _currentTheme), themes.includes(entry.theme) ? entry.theme : 'default', `auto league ${id}`);
    }
    // 매핑에 없는 리그는 기본 테마로 떨어진다.
    await page.evaluate(() => { state.fsmTheme = 'auto'; autoApplyTemplateByLeagueId(999999, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    assert.equal(await page.evaluate(() => _currentTheme), 'default', 'unmapped league falls back to default');

    // 수동 선택: 경기 리그와 관계없이 고른 테마가 적용되고 목록 선택값도 같다.
    for (const theme of themes) {
      await page.evaluate(theme => { state.fsmTheme = theme; autoApplyTemplateByLeagueId(39, null); render(); }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      assert.equal(await page.evaluate(() => _currentTheme), theme, `manual ${theme}`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS league-theme mapping', Object.keys(map).length, 'leagues;', themes.length, 'themes auto/manual');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
