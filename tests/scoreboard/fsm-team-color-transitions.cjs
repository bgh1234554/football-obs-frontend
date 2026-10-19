const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

// 처음 선택한 모습과 다른 테마를 거쳐 선택한 모습을 비교합니다.
async function select(page, theme) {
  await page.evaluate(theme => { state.fsmTheme = theme; applyTheme(theme, null); fsmBoardRender(); }, theme);
  await page.waitForFunction(theme => !pendingThemeLink && _currentTheme === theme, theme);
  await settle(page);
}
async function sample(page) {
  return page.evaluate(() => {
    const properties = ['display', 'backgroundColor', 'backgroundImage', 'color', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'boxShadow'];
    const result = Object.fromEntries(['#homeCard', '#awayCard', '#homeName', '#awayName', '#team-logo-left', '#team-logo-right', '#homeColor', '#awayColor'].map(selector => {
      const el = document.querySelector(selector), css = getComputedStyle(el);
      return [selector, Object.fromEntries(properties.map(p => [p, css.display === 'none' && p !== 'display' ? null : css[p]]))];
    }));
    result.decorations = Object.fromEntries(['jleague-arc', 'danish-triangle', 'cnl-curve', 'russiancup-triangle', 'az-chevron'].map(name => [name,
      [...document.querySelectorAll('.' + name)].filter(el => getComputedStyle(el).display !== 'none' && getComputedStyle(el.parentElement).display !== 'none').length]));
    return result;
  });
}
(async () => {
  const browser = await chromium.launch();
  const options = { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } };
  const failures = [];
  try {
    const page = await openPage(browser, options);
    const themes = await page.evaluate(() => Object.keys(FSM_THEMES));
    // 평소에는 각 팀컬러 표현의 대표 테마에서 전체 테마로 전환합니다.
    // 전체 조합 조사는 --all-pairs를 지정한 경우에만 수행합니다.
    const sources = process.argv.includes('--all-pairs') ? themes
      : ['laliga', 'carabao', 'danish', 'jleague', 'cnl', 'russiancup', 'nationalleague'];
    const setup = page => page.evaluate(() => {
      state.homeName = 'HOME'; state.awayName = 'AWAY';
      Object.assign(state.colors, { homeBg: '#ed2040', homeText: '#ffe020', awayBg: '#2050df', awayText: '#20ff80' });
      render();
    });
    const baselines = {};
    for (let start = 0; start < themes.length; start += 4) await Promise.all(themes.slice(start, start + 4).map(async theme => {
      const fresh = await openPage(browser, options);
      await setup(fresh); await select(fresh, theme);
      baselines[theme] = await sample(fresh);
      await fresh.close();
    }));
    await page.close();
    await Promise.all(Array.from({ length: 4 }, async (_, worker) => {
      const page = await openPage(browser, options);
      await setup(page);
      for (const source of sources.filter((_, index) => index % 4 === worker)) {
      for (const target of themes) {
        if (source === target) continue;
        await select(page, source); await select(page, target);
        const actual = await sample(page);
        for (const selector of Object.keys(actual)) {
          for (const property of Object.keys(actual[selector])) {
            if (actual[selector][property] !== baselines[target][selector][property]) {
              failures.push(`${source}->${target} ${selector}.${property}: ${actual[selector][property]} != ${baselines[target][selector][property]}`);
            }
          }
        }
      }
      console.log('AUDIT', source);
      }
      await page.close();
    }));
    assert.equal(failures.length, 0, failures.slice(0, 50).join('\n'));
    const pairs = sources.reduce((count, source) => count + themes.length - Number(themes.includes(source)), 0);
    console.log(`PASS ${pairs} theme pairs preserve team colors and logo borders`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
