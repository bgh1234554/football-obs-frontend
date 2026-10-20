const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1280, height: 720 } });
    const active = () => page.locator('.page.active').getAttribute('id');
    assert.equal(await active(), 'page-schedule', '첫 접속은 일정 확인');
    for (const name of ['main-big', 'main-small']) {
      await page.evaluate(name => activatePage(name), name);
      assert.equal(await active(), `page-${name}`, '빈 상태에서도 직접 메인 메뉴 선택 가능');
      await page.evaluate(() => document.getElementById('main-clear-btn').click());
      assert.equal(await active(), 'page-schedule', '경기를 비우면 일정 확인');
    }
    await page.evaluate(() => activatePage('main-big'));
    await page.reload();
    await settle(page);
    assert.equal(await active(), 'page-schedule', '복원할 경기 없는 새로고침');
    await page.evaluate(() => { sessionStorage.setItem('cached_fixture_data', '{broken'); activatePage('main-big'); });
    await page.reload();
    await settle(page);
    assert.equal(await active(), 'page-schedule', '손상된 경기 캐시');
    await page.evaluate(() => activatePage('theme'));
    await page.reload();
    await settle(page);
    assert.equal(await active(), 'page-theme', '직접 진입한 설정 페이지 유지');
    await page.evaluate(() => { state.manualMode = true; persist(); activatePage('main-big'); });
    await page.reload();
    await settle(page);
    assert.equal(await active(), 'page-main-big', '수동 모드는 메인 화면 유지');
    console.log('PASS empty startup, cleared fixture, reload, invalid cache, explicit page, manual mode');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
