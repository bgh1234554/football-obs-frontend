const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      document.querySelectorAll('style').forEach(style => {
        if (style.textContent.includes('* { transition: none !important; animation: none !important; }')) style.remove();
      });
      state.homeName = '\uBD81\uC544\uC77C\uB79C\uB4DC'; state.awayName = '\uC870\uC9C0\uC544'; render();
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../json/juveparma.json'), 'utf8').replace(/^\uFEFF/, ''));
    await page.evaluate(data => {
      activatePage('main-small');
      _lpStatCycle.mode = 'stats';
      lpStatUpdateVisibility();
      applyLineupPanels(data);
      applyStatsPanel(data);
      applyTheme('ekstraklasa', null);
    }, fixture);
    await page.waitForTimeout(1200);
    const injuryResize = await page.evaluate(async () => {
      const panel = document.querySelector('#injuryPanel');
      const original = window.fitInjuryReasons;
      const width = panel.style.width;
      let fits = 0;
      window.fitInjuryReasons = function (...args) { fits++; return original.apply(this, args); };
      try {
        panel.style.width = `${panel.clientWidth - 30}px`;
        for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
        const html = panel.innerHTML;
        original(panel);
        return { fits, freshMatches: html === panel.innerHTML };
      } finally {
        panel.style.width = width;
        window.fitInjuryReasons = original;
      }
    });
    assert(injuryResize.fits > 0, 'real injury panel width change still refits reasons');
    assert(injuryResize.freshMatches, 'observer injury fit matches explicit fit at the new width');
    await page.waitForTimeout(150);
    for (const theme of ['romanian', 'ekstraklasa']) {
      const transition = await page.evaluate(async theme => {
        const wrap = document.querySelector('#boardStageWrap');
        const heights = [wrap.getBoundingClientRect().height];
        const originalRender = window.stRenderPanel;
        let renders = 0, intermediateRenders = 0, injuryFits = 0, columnFits = 0;
        const originalInjuryFit = window.fitInjuryReasons;
        const originalColumnFit = window.applyStoredSmallLayoutResize;
        window.fitInjuryReasons = function (...args) { injuryFits++; return originalInjuryFit.apply(this, args); };
        window.applyStoredSmallLayoutResize = function (...args) { columnFits++; return originalColumnFit.apply(this, args); };
        window.stRenderPanel = function (...args) {
          renders++;
          if (document.querySelector('.fsm-board').getAnimations({ subtree: true }).some(animation =>
            animation.playState === 'running' && /^(height|padding.*|margin.*|row-gap)$/.test(animation.transitionProperty || ''))) intermediateRenders++;
          return originalRender.apply(this, args);
        };
        try {
          const end = performance.now() + 1400;
          await new Promise(resolve => {
            function sample() {
              heights.push(wrap.getBoundingClientRect().height);
              if (performance.now() < end) requestAnimationFrame(sample);
              else resolve();
            }
            requestAnimationFrame(sample);
            applyTheme(theme, null);
          });
          const panel = document.querySelector('.page.active [data-stat-panel]');
          const html = panel.innerHTML;
          originalRender(panel, statsLastFixtureData);
          return { start: heights[0], end: heights.at(-1), min: Math.min(...heights), max: Math.max(...heights),
            renders, intermediateRenders, injuryFits, columnFits, finalMatches: html === panel.innerHTML };
        } finally {
          window.stRenderPanel = originalRender;
          window.fitInjuryReasons = originalInjuryFit;
          window.applyStoredSmallLayoutResize = originalColumnFit;
        }
      }, theme);
      assert(transition.min >= Math.min(transition.start, transition.end) - 1, JSON.stringify({ theme, transition }));
      assert(transition.max <= Math.max(transition.start, transition.end) + 1, JSON.stringify({ theme, transition }));
      assert.equal(transition.intermediateRenders, 0, 'stats measurement waits for final theme geometry');
      assert(transition.renders > 0, 'stats render resumes after transition');
      assert(transition.finalMatches, 'deferred stats layout matches fresh final-size render');
      assert.equal(transition.injuryFits, 0, 'height-only transition does not refit injury text');
      assert.equal(transition.columnFits, 0, 'height-only transition does not restore column widths');
      console.log('PASS height transition and deferred stats', theme);
    }
    await page.evaluate(() => {
      window.transitionStatsRenders = 0;
      window.transitionStatsStacks = [];
      const original = window.stRenderPanel;
      window.stRenderPanel = function (...args) {
        if (args[0]?.closest('.page.active') && document.querySelector('.fsm-board').getAnimations({ subtree: true }).some(animation =>
          animation.playState === 'running' && /^(height|width|padding.*|margin.*|row-gap|font-size|line-height)$/.test(animation.transitionProperty || ''))) {
          transitionStatsRenders++;
          transitionStatsStacks.push(new Error().stack);
        }
        return original.apply(this, args);
      };
    });
    for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES).filter(theme => theme !== 'pl'))) {
      await page.evaluate(() => applyTheme('pl', null));
      await page.waitForFunction(() => !pendingThemeLink);
      await page.waitForTimeout(500);
      await page.evaluate(() => { transitionStatsRenders = 0; transitionStatsStacks = []; });
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const initial = await page.locator('.scoreboard-main').evaluate(el => parseFloat(el.style.width));
      const heightError = await page.evaluate(() => new Promise(resolve => {
        const stage = document.querySelector('#boardStageInner');
        const wrap = document.querySelector('#boardStageWrap');
        let maxError = 0;
        const end = performance.now() + 1000;
        function sample() {
          const scale = new DOMMatrixReadOnly(getComputedStyle(stage).transform).a;
          maxError = Math.max(maxError, Math.abs(parseFloat(wrap.style.height) - stage.scrollHeight * scale));
          if (performance.now() < end) requestAnimationFrame(afterLayout);
          else resolve(maxError);
        }
        // ResizeObserver의 높이 반영이 끝난 뒤 전환 중의 실제 표시 영역을 확인한다.
        function afterLayout() { setTimeout(sample, 0); }
        requestAnimationFrame(afterLayout);
      }));
      assert(heightError <= 1, JSON.stringify({ theme, heightError }));
      const settled = await page.evaluate(() => {
        fsmBoardRender();
        return parseFloat(document.querySelector('.scoreboard-main').style.width);
      });
      const stats = await page.evaluate(() => {
        const panel = document.querySelector('.page.active [data-stat-panel]');
        const before = panel.innerHTML;
        const intermediate = transitionStatsRenders;
        stRenderPanel(panel, statsLastFixtureData);
        return { intermediate, stacks: transitionStatsStacks, finalMatches: before === panel.innerHTML };
      });
      assert.equal(stats.intermediate, 0, `${theme}: no stats measurement during geometry transition ${JSON.stringify(stats.stacks)}`);
      assert(stats.finalMatches, `${theme}: final stats capacity matches fresh render`);
      assert(Math.abs(initial - settled) < 1, JSON.stringify({ theme, initial, settled }));
      console.log('PASS stable transition width', theme, initial);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
