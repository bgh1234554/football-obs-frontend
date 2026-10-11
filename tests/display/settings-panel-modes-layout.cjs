const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const config of [
      { name: 'desktop', viewport: { width: 1920, height: 1080 }, rows: 2 },
      { name: 'small-desktop', viewport: { width: 1280, height: 720 }, rows: 2 },
      { name: 'narrow', viewport: { width: 390, height: 844 } },
      { name: 'popout', viewport: { width: 720, height: 820 }, url: 'http://localhost/?popout=settings', rows: 2 },
      { name: 'popout-narrow', viewport: { width: 570, height: 760 }, url: 'http://localhost/?popout=settings' },
    ]) {
      const page = await openPage(browser, { dpr: 1, platform: 'Win32', ...config });
      await page.evaluate(() => openSettingsPopup());
      await page.locator('[data-sp-tab="events"]').click();
      const transitionSection = await page.locator('[data-sp-tab-section="events"]').evaluate(section => {
        const titles = [...section.querySelectorAll('.sp-section-title')];
        const title = titles[1];
        const controls = [];
        for (let row = title.nextElementSibling; row && !row.classList.contains('sp-section-title'); row = row.nextElementSibling) {
          controls.push(...[...row.querySelectorAll('[data-settings-cat],[data-settings-number]')].map(el => el.dataset.settingsCat || el.dataset.settingsNumber));
        }
        return { title: title.textContent, controls };
      });
      assert.equal(transitionSection.title, '캠 큰 메뉴 우측 하단 패널 전환');
      assert(transitionSection.controls.includes('statCycleAuto'));
      assert(transitionSection.controls.includes('statCycleModeTeamFixtures'));
      assert(transitionSection.controls.includes('statsAutoSwipe'));
      assert(transitionSection.controls.includes('statsAutoSwipeSec'));
      const group = page.locator('.sp-panel-mode-toggles');
      await group.scrollIntoViewIfNeeded();
      await settle(page);
      const geometry = await group.evaluate(group => {
        const r = group.getBoundingClientRect();
        const body = group.closest('.sp-body');
        const b = body.getBoundingClientRect();
        return { count: group.children.length, overflow: group.scrollWidth - group.clientWidth,
          left: r.left, right: r.right, bodyLeft: b.left, bodyRight: b.right,
          rows: new Set([...group.children].map(el => Math.round(el.getBoundingClientRect().top))).size,
          outside: [...group.querySelectorAll('.sp-mini-toggle-label,.sp-switch')].some(el => {
            const box = el.getBoundingClientRect();
            return box.left < r.left - 1 || box.right > r.right + 1;
          }),
          bodyOverflow: body.scrollWidth - body.clientWidth };
      });
      assert.equal(geometry.count, 8);
      assert(geometry.overflow <= 1, JSON.stringify(geometry));
      assert(!geometry.outside, JSON.stringify(geometry));
      assert(geometry.left >= geometry.bodyLeft && geometry.right <= geometry.bodyRight, JSON.stringify(geometry));
      assert(geometry.bodyOverflow <= 1, JSON.stringify(geometry));
      if (config.name.startsWith('popout')) {
        const misplaced = await page.locator('[data-sp-tab-section="events"] .sp-row').evaluateAll(rows => rows.flatMap(row => {
          const label = row.querySelector('.sp-row-label');
          const control = row.querySelector('.sp-toggle-cluster, .sp-slider-cluster');
          if (!label || !control) return [];
          const a = label.getBoundingClientRect();
          const b = control.getBoundingClientRect();
          return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) > 2
            ? [label.textContent.trim()] : [];
        }));
        assert.deepEqual(misplaced, [], '토글·슬라이더가 라벨 아래로 내려가면 안 된다');
      }
      if (config.rows) assert.equal(geometry.rows, config.rows, JSON.stringify(geometry));
      await group.locator('label[title="최근·예정 경기"]').click();
      assert.equal(await page.evaluate(() => getSetting('statCycleModeTeamFixtures')), 'off');
      await page.screenshot({ path: `tests/display/settings-panel-modes-${config.name}.png` });
      console.log('PASS', config.name, JSON.stringify(geometry));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
