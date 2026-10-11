const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const logoUrl = 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/JLeague.svg';
    const logoFile = path.join(tmpdir(), 'fsm-JLeague.svg');
    await page.route(logoUrl, route => route.fulfill({ contentType: 'image/svg+xml', body: fs.existsSync(logoFile) ? fs.readFileSync(logoFile) : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><text x="12" y="32">J</text></svg>' }));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => {
      state.homeName = '하이덴하임'; state.awayName = '카이저슬라우테른'; state.homeScore = 0; state.awayScore = 0;
      state.seconds = 5400; state.extra = 1; state.extraShown = true; state.boardScale = 100;
      Object.assign(state.colors, { homeBg: '#ff4400', homeText: '#ffee00', awayBg: '#2277ff', awayText: '#ffffff' });
    });
    for (const id of [98, 99, 100]) {
      await page.evaluate(id => { state.fsmTheme = 'auto'; autoApplyTemplateByLeagueId(id, null); render(); }, id);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      assert.equal(await page.evaluate(() => _currentTheme), 'jleague');
      assert.equal(await page.locator('.epl-lion').getAttribute('src'), logoUrl);
    }
    assert.equal(await page.locator('#fsmThemeSelect option[value="jleague"]').count(), 1);
    const style = selector => page.locator(selector).first().evaluate(el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, ink: s.color }; });
    assert.deepEqual(await style('.time'), { bg: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)' });
    assert.deepEqual(await style('.extra-time'), { bg: 'rgb(225, 32, 51)', ink: 'rgb(255, 255, 255)' });
    assert.equal((await style('.score-div')).bg, 'rgb(255, 255, 255)');
    assert.equal((await style('.team-logo')).bg, 'rgb(255, 255, 255)');
    const colors = await page.evaluate(() => {
      const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundImage;
      return [bg('.teams-left'), bg('.teams-right'), bg('#team-score-left'), bg('#team-score-right')];
    });
    assert(colors[0].includes('rgb(69, 73, 79)') && colors[0].includes('rgb(0, 0, 0)'));
    assert(colors[2].includes('rgb(50, 50, 50)') && colors[2].includes('rgb(13, 13, 13)'));
    await page.locator('#board').screenshot({ path: path.join(tmpdir(), 'fsm-jleague.png') });
    for (const scale of [60, 75, 100, 125, 150]) {
      await page.evaluate(scale => { state.boardScale = scale; state.homeName = 'A very long football club name to test fitting'; state.homeScore = 10; render(); fsmBoardRender(); }, scale);
      await settle(page);
      const m = await page.evaluate(() => {
        const board = document.querySelector('.scoreboard-main');
        return { width: board.offsetWidth, cards: ['homeCard', 'awayCard'].map(id => {
          const card = document.getElementById(id), name = card.querySelector('.team-name'), text = name.querySelector('.text');
          const s = getComputedStyle(name);
          const ctx = document.createElement('canvas').getContext('2d'), ts = getComputedStyle(text);
          ctx.font = `${ts.fontWeight} ${ts.fontSize} ${ts.fontFamily}`;
          const ink = ctx.measureText(text.textContent), radius = card.clientHeight;
          const reach = Math.min(radius, (radius + ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent) / 2);
          const intrusion = radius - Math.sqrt(Math.max(0, radius * radius - reach * reach));
          const c = card.getBoundingClientRect(), t = text.getBoundingClientRect(), scale = c.height / card.offsetHeight;
          return { width: card.offsetWidth, fits: text.scrollWidth <= name.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1,
            clear: Math.min(t.left - c.left, c.right - t.right) / scale - intrusion };
        }), scores: ['left', 'right'].map(side => {
          const box = document.querySelector('#team-score-' + side).getBoundingClientRect();
          const text = document.querySelector('.score-' + side).getBoundingClientRect();
          return text.top < box.top - 5;
        }), arcs: ['home', 'away'].map(side => [...document.querySelectorAll('#' + side + 'Color .jleague-arc')].map(arc => {
          const s = getComputedStyle(arc), border = getComputedStyle(arc.querySelector('.jleague-arc-border'));
          return { width: s.width, height: s.height, transform: s.transform, stroke: border.strokeWidth, curve: arc.querySelector('.jleague-arc-border').getAttribute('d') };
        })) };
      });
      assert(m.width <= 1080 && m.cards.every(c => c.fits), JSON.stringify(m));
      assert(m.cards.every(c => c.clear >= 2), JSON.stringify(m));
      assert.equal(m.cards[0].width, m.cards[1].width);
      assert(m.scores.every(Boolean));
      assert.equal(m.arcs.flat().length, 4);
      m.arcs.flat().forEach(arc => { assert.equal(arc.width, '48px'); assert.equal(arc.height, '48px'); assert.equal(arc.stroke, '0.5px'); assert.equal(arc.curve, 'M0 0 A48 48 0 0 0 48 48'); });
      assert.deepEqual(m.arcs.map(arcs => arcs.map(arc => arc.transform)), [['none', 'matrix(-1, 0, 0, -1, 0, 0)'], ['matrix(1, 0, 0, -1, 0, 0)', 'matrix(-1, 0, 0, 1, 0, 0)']]);
    }
    await page.evaluate(() => { state.fsmTheme = 'jleague'; autoApplyTemplateByLeagueId(39, null); state.half = 'PK'; render(); });
    await settle(page);
    assert.equal(await page.evaluate(() => _currentTheme), 'jleague');
    assert.equal(await page.locator('.pso-status').evaluate(el => getComputedStyle(el).display), 'flex');
    await page.evaluate(() => { state.fsmTheme = 'fnl'; autoApplyTemplateByLeagueId(236, null); render(); });
    await page.waitForFunction(() => !pendingThemeLink);
    assert.equal(await page.locator('#homeColor').evaluate(el => getComputedStyle(el).display), 'none');
    assert.deepEqual(errors, []);
    console.log('PASS J1/J2/J3 and manual theme, logo, colors, quarter-circle decorations, protruding scores, long names, scales and PSO');
    console.log(path.join(tmpdir(), 'fsm-jleague.png'));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
