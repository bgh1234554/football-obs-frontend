const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', uaPlatform: 'Windows', viewport: { width: 1920, height: 1080 } });
    const commits = await page.evaluate(() => {
      const calls = [];
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
      const values = await page.evaluate(() => {
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
    await page.evaluate(() => { applyTheme('fnl', null); });
    await page.waitForFunction(() => !pendingThemeLink);
    await page.evaluate(() => { setSetting('greenscreen', 'on'); render(); fsmBoardRender(); });
    assert.equal(await page.locator('#team-score-left').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 199, 178)');
    await page.locator('#inPkGoalHex').evaluate(el => { el.value = '#2266dd'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.reload();
    assert.equal(await page.evaluate(() => state.colors.pkGoal), '#2266dd');
    console.log('PASS 5 chroma presets/OFF, strip and fixed-theme colors, PK colors, mint preservation and HEX persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
