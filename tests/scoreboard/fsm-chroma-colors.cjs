const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    const commits = await page.evaluate(() => {
      const calls = [];
      /** theme:colors-changed 이벤트로 바뀐 색상 key를 기록한다. */
      const listener = event => calls.push(event.detail.key);
      document.addEventListener('theme:colors-changed', listener);
      try {
        state.colors.homeBg = '#112233'; state.colors.homeText = '#ddeeff';
        const before = JSON.stringify(state);
        swapTeamColors('invalid');
        if (JSON.stringify(state) !== before || calls.length) throw Error('Invalid side changed state');
        swapTeamColors('home');
        if (state.colors.homeBg !== '#ddeeff' || state.colors.homeText !== '#112233') throw Error('Swap failed');
        if (!state.teamColorOverride) throw Error('Missing override');
        for (const [id, key] of [['inHomeBg', 'homeBg'], ['inHomeText', 'homeText']]) {
          if ($(id).value !== state.colors[key] || $(id + 'Hex').value !== state.colors[key]) throw Error('Inputs out of sync');
        }
        const hex = $('inHomeBgHex');
        hex.value = '#445566'; hex.dispatchEvent(new Event('change'));
        if (state.colors.homeBg !== '#445566' || $('inHomeBg').value !== '#445566') throw Error('HEX commit failed');
        hex.dispatchEvent(new Event('change'));
        return calls;
      } finally { document.removeEventListener('theme:colors-changed', listener); }
    });
    assert.deepEqual(commits, ['homeBg', 'homeBg']);
    await page.evaluate(() => {
      state.colors.homeBg = '#00c424'; state.colors.homeText = '#ffffff';
      state.pk.home = ['G', 'M']; state.half = 'PK';
      state.colors.pkGoal = '#00c424'; state.colors.pkMiss = '#22bb44';
      applyTheme('ligue2', null);
    });
    await page.waitForFunction(() => !pendingThemeLink);
    for (const mode of ['strong', 'purple', 'moderate', 'mild', 'natural', 'off']) {
      await page.evaluate(mode => {
        setSetting('greenscreen', mode === 'off' ? 'off' : 'on');
        if (mode !== 'off') setSetting('greenscreenIntensity', mode);
        render(); fsmBoardRender();
      }, mode);
      await settle(page);
      const boundary = await page.evaluate(() => ({
        preserved: ['#ffff00', '#fcdb2c', '#d9af00'].map(color => ({
          color, converted: chromaSafe(color), text: chromaSafeText(color), green: isGreenLike(color),
        })),
        green: chromaSafe('#00ff00'),
        // 같은 색상각이어도 키 색에서 먼 어두운 색은 유지한다.
        darkGreen: chromaSafe('#002000'),
        rgba: chromaSafe('rgba(255, 255, 0, 0.5)'),
        gradient: chromaSafeGradient('linear-gradient(#ffff00, #00ff00)'),
      }));
      for (const item of boundary.preserved) {
        assert.equal(item.converted, item.color, mode);
        assert.equal(item.text, item.color, mode);
        assert.equal(item.green, false, mode);
      }
      assert.equal(boundary.darkGreen, '#002000', mode);
      assert.equal(boundary.rgba, 'rgba(255, 255, 0, 0.5)', mode);
      assert.equal(boundary.gradient, `linear-gradient(#ffff00, ${boundary.green})`, mode);
      if (mode !== 'off') assert.notEqual(boundary.green, '#00ff00', mode);
      const grouped = await page.evaluate(() => {
        const source = 'linear-gradient(to right, rgba(10, 73, 32, 0.6), #00c424)';
        const converted = chromaSafeGradient(source);
        const stops = converted.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g).map(parseAnyColor);
        const separate = 'linear-gradient(#002000, #003000)';
        // natural 상한(lCap)을 두 색이 모두 넘어도 같은 비율로 낮춰 명도 순서를 유지해야 한다.
        const capped = toChromaSafeGradient('linear-gradient(#00c424, #33ff66)', 'natural')
          .match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g).map(parseAnyColor);
        return {
          source, converted, alpha: stops[0].a,
          lightness: stops.map(c => rgbToHsl(c.r, c.g, c.b).l),
          cappedLightness: capped.map(c => rgbToHsl(c.r, c.g, c.b).l),
          safeOnly: chromaSafeGradient(separate), separate,
          layered: chromaSafeGradient(source + ', ' + separate),
          ungroupedDark: chromaSafe('rgba(10, 73, 32, 0.6)'),
        };
      });
      assert.equal(grouped.alpha, .6, mode);
      assert(grouped.lightness[0] < grouped.lightness[1], `Gradient contrast lost: ${mode}`);
      assert(grouped.cappedLightness[0] < grouped.cappedLightness[1], `Capped gradient contrast lost: ${JSON.stringify(grouped.cappedLightness)}`);
      assert.equal(grouped.safeOnly, grouped.separate, mode);
      assert.equal(grouped.layered, grouped.converted + ', ' + grouped.separate, mode);
      assert.equal(grouped.ungroupedDark, 'rgba(10, 73, 32, 0.6)', mode);
      if (mode === 'off') assert.equal(grouped.converted, grouped.source);
      else assert.notEqual(grouped.converted.match(/rgba?\([^)]+\)/)[0], grouped.ungroupedDark, mode);
      const values = await page.evaluate(() => {
        /** CSS 색 문자열을 브라우저가 정규화한 rgb() 형식으로 바꾼다. */
        const rgb = value => { const el = document.createElement('span'); el.style.color = value; return el.style.color; };
        return {
          strip: getComputedStyle(document.querySelector('.teams-left')).borderBottomColor,
          team: rgb(chromaSafe('#00c424')),
          fixed: getComputedStyle(document.querySelector('.score-div')).backgroundColor,
          expectedFixed: rgb(chromaSafe('#00fcd0')),
          expectedMiss: rgb(chromaSafe('#22bb44')),
          pk: [...document.querySelectorAll('#pso-left li')].slice(0, 2).map(el => el.style.backgroundColor),
          saved: state.colors.homeBg,
        };
      });
      assert.equal(values.strip, values.team, mode);
      assert.equal(values.fixed, values.expectedFixed, mode);
      assert.equal(values.pk[0], values.team, mode);
      assert.equal(values.pk[1], values.expectedMiss, mode);
      if (mode !== 'off') assert.notEqual(values.pk[1], 'rgb(34, 187, 68)', mode);
      assert.equal(values.saved, '#00c424');
    }
    // 외곽선도 다른 테마 색상처럼 프리셋을 따르고 모드를 끄면 복원되어야 합니다.
    await page.evaluate(() => { applyTheme('uecl', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    const outline = page.locator('.scoreboard-main');
    const originalOutline = await outline.evaluate(el => getComputedStyle(el).outlineColor);
    for (const mode of ['strong', 'purple', 'moderate', 'mild', 'natural', 'off']) {
      await page.evaluate(mode => {
        setSetting('greenscreen', mode === 'off' ? 'off' : 'on');
        if (mode !== 'off') setSetting('greenscreenIntensity', mode);
        render(); fsmBoardRender();
      }, mode);
      await settle(page);
      const colors = await page.evaluate(original => {
        const probe = document.createElement('span');
        probe.style.color = chromaSafe(original);
        return { actual: getComputedStyle(document.querySelector('.scoreboard-main')).outlineColor, expected: probe.style.color };
      }, originalOutline);
      assert.equal(colors.actual, colors.expected, `Theme outline: ${mode}`);
      if (mode !== 'off') assert.notEqual(colors.actual, originalOutline, mode);
      else assert.equal(colors.actual, originalOutline);
    }
    await page.evaluate(() => { applyTheme('fnl', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => { setSetting('greenscreen', 'on'); render(); fsmBoardRender(); });
    assert.equal(await page.locator('#team-score-left').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 199, 178)');
    await page.locator('#inPkGoalHex').evaluate(el => { el.value = '#2266dd'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    // 테마의 CSS 변수로 지정한 그라데이션에도 같은 보정이 적용되고 OFF에서 복원되어야 합니다.
    await page.evaluate(() => {
      setSetting('greenscreen', 'off'); render(); fsmBoardRender();
      oldlink.sheet.insertRule('#board.fsm-board { --test-chroma-gradient: linear-gradient(#0a4920, #00c424); }', oldlink.sheet.cssRules.length);
      oldlink.sheet.insertRule('#board.fsm-board .teams-left { background-image: var(--test-chroma-gradient); }', oldlink.sheet.cssRules.length);
    });
    const originalGradient = await page.locator('.teams-left').evaluate(node => getComputedStyle(node).backgroundImage);
    for (const on of [true, false]) {
      await page.evaluate(on => { setSetting('greenscreen', on ? 'on' : 'off'); render(); fsmBoardRender(); }, on);
      const gradients = await page.evaluate(original => {
        const probe = document.createElement('div');
        probe.style.backgroundImage = chromaSafeGradient(original);
        document.body.append(probe);
        const expected = getComputedStyle(probe).backgroundImage;
        probe.remove();
        return { actual: getComputedStyle(document.querySelector('.teams-left')).backgroundImage, expected };
      }, originalGradient);
      assert.equal(gradients.actual, gradients.expected, `CSS variable gradient: ${on}`);
      if (on) assert.notEqual(gradients.actual, originalGradient);
      else assert.equal(gradients.actual, originalGradient);
    }
    await page.reload();
    assert.equal(await page.evaluate(() => state.colors.pkGoal), '#2266dd');
    console.log('PASS 5 chroma presets/OFF, grouped and CSS-variable gradients, strip/fixed/PK colors, mint preservation and HEX persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
