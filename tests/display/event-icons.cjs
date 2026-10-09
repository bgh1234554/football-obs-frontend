const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'screenshots/event-icons');
const compareRef = process.env.ICON_COMPARE_REF;
const previous = new Map();
// Optional live comparison with a revision before the icon migration.
if (compareRef) {
  for (const file of ['overlay_dashboard.html', 'js/panels/events-panel.js', 'css/panels/events-panel.css',
    'js/lineup/lineup-render.js', 'js/lineup/lineup-manual-modal.js', 'js/tactics/tactics.js',
    'js/tactics/tactics-timeline.js', 'js/core/render.js']) {
    previous.set(file, execFileSync('git', ['show', `${compareRef}:${file}`], { cwd: root }));
  }
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function open(browser, baseline) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost') return route.abort();
    const relative = decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname).slice(1);
    const file = path.join(root, relative);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: baseline && previous.has(relative) ? previous.get(relative) : fs.readFileSync(file),
      contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[path.extname(file)] || 'application/octet-stream' });
  });
  await page.goto('http://localhost/', { waitUntil: 'load' });
  await page.addStyleTag({ content: '* { transition:none!important; animation:none!important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    setSetting('statCycleAuto', 'off');
    setSetting('greenscreen', 'off');
    setSetting('lineupNode', 'circle');
    const lineup = offset => ({ formation: '4-4-2',
      startXi: Array.from({ length: 11 }, (_, i) => ({ playerId: offset + i, name: `Player ${offset + i}`,
        number: i + 1, pos: 'M', grid: buildManualGridValues('4-4-2')[i] })),
      substitutes: [{ playerId: offset + 50, name: 'Bench player', number: 12 }] });
    const event = (type, detail, minute, id, other = {}) => ({ type, detail, elapsed: minute,
      side: 'home', playerId: id, playerName: `Player ${id}`, ...other });
    window.iconFixture = {
      matchInfo: { fixtureId: 'icon-regression', status: '2H', elapsed: 88,
        homeTeamId: 1, awayTeamId: 2, homeTeamName: 'Home', awayTeamName: 'Away' },
      homeLineup: lineup(100), awayLineup: lineup(200),
      events: [event('Goal', 'Normal Goal', 5, 101, { assistId: 102, assistName: 'Player 102' }),
        event('Goal', 'Normal Goal', 10, 101, { assistId: 102, assistName: 'Player 102' }),
        event('Goal', 'Own Goal', 15, 103), event('Goal', 'Own Goal', 20, 104),
        event('Goal', 'Own Goal', 25, 104), event('Goal', 'Penalty', 30, 105),
        event('Goal', 'Missed Penalty', 35, 106), event('Card', 'Yellow Card', 40, 150),
        event('Card', 'Yellow Card', 41, 107), event('Card', 'Second Yellow Card', 42, 107),
        event('Card', 'Red Card', 43, 108), event('Card', 'Yellow Card', 44, 250, { side: 'away' }),
        event('subst', 'Substitution 1', 50, 109, { assistId: 150, assistName: 'Bench player' }),
        event('Var', 'Goal Confirmed', 55, 101), event('Var', 'Goal cancelled', 60, 101),
        event('Var', 'Review', 65, 101), event('Goal', 'Normal Goal', 70, 103)],
      playerStats: Array.from({ length: 22 }, (_, i) => ({ playerId: i < 11 ? 100 + i : 200 + i - 11, rating: 7.2 })),
      homeInjuries: [{ playerId: 999, name: 'Suspended player', reason: 'Suspended' }], awayInjuries: [],
    };
    activatePage('main-big'); applyLineupPanels(iconFixture); applyEventsPanel(iconFixture, { animate: false });
    applyTacticsTimeline(iconFixture);
    state.redHome = 2; state.redAway = 1; renderRedCards();
  });
  await settle(page);
  return { page, errors };
}
async function layout(page) {
  return page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(v => +v.toFixed(2)); };
    const visible = sel => [...document.querySelectorAll(sel)].filter(el => el.getBoundingClientRect().width > 0);
    return {
      board: rect(document.querySelector('#board')),
      nodes: visible('.page.active .dp-lineup-node').map(el => ({ id: el.dataset.playerId, rect: rect(el) })),
      rows: visible('.page.active .ev-row[data-ev-key]').map(el => ({ key: el.dataset.evKey, text: el.querySelector('.ev-text')?.textContent, time: el.querySelector('.ev-time')?.textContent })),
      cards: [...document.querySelectorAll('#rcHome, #rcAway')].map(el => el.children.length),
      bench: visible('.page.active .dp-item').map(el => ({ id: el.dataset.playerId, name: el.querySelector('.dp-item-name')?.textContent })),
    };
  });
}
async function inspect(page) {
  return page.evaluate(() => {
    const rect = el => el.getBoundingClientRect();
    const visible = sel => [...document.querySelectorAll(sel)].filter(el => rect(el).width > 0);
    const bench = visible('.dp-item-content').filter(el => el.querySelector('.dp-card'));
    const centers = bench.map(el => {
      const card = rect(el.querySelector('.dp-card')), image = rect(el.querySelector('.dp-card .football-icon'));
      const name = rect(el.querySelector('.dp-item-name'));
      return { cardDelta: Math.abs(card.y + card.height / 2 - image.y - image.height / 2),
        nameDelta: Math.abs(card.y + card.height / 2 - name.y - name.height / 2) };
    });
    const badges = visible('.page.active .dp-node-goal-entry, .page.active .dp-node-assist');
    const clearances = badges.filter(el => el.closest('.dp-lineup-node')?.querySelector('.dp-node-rating')).map(el => {
      const b = rect(el), r = rect(el.closest('.dp-lineup-node').querySelector('.dp-node-rating'));
      return { width: b.width, overlap: b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top };
    });
    return { centers, clearances,
      brokenGlyphs: visible('.page.active .dp-item, .page.active .dp-node-badge, .page.active .ev-icon, .tactics-ball-token, .td-tl-glyph').filter(el => /[⚽👟🟨🟥⇅▮]/u.test(el.textContent)).length,
      ownSingleCounts: visible('.dp-event-own-goal:not(.has-count) .dp-event-own-goal-count').length,
      ownSinglePitch: visible('.dp-node-goal-entry[title="자책골 1회"] .dp-node-count').length,
      cumulative: document.querySelectorAll('.football-icon-cumulative-red').length,
    };
  });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const current = await open(browser, false);
    const old = compareRef ? await open(browser, true) : null;
    for (const mode of ['main-big', 'main-small']) {
      await current.page.evaluate(mode => activatePage(mode), mode); await settle(current.page);
      if (old) {
        await old.page.evaluate(mode => activatePage(mode), mode); await settle(old.page);
        assert.deepEqual(await layout(current.page), await layout(old.page), `${mode}: player placement, event data and card counts`);
        await old.page.screenshot({ path: path.join(output, `${mode}-before.png`) });
        if (mode === 'main-small') await old.page.locator('.page.active [data-dp-role="lineup"]').screenshot({ path: path.join(output, 'pitch-before.png') });
      }
      const result = await inspect(current.page);
      assert.equal(result.brokenGlyphs, 0); assert.equal(result.ownSingleCounts, 0); assert.equal(result.ownSinglePitch, 0);
      assert(result.cumulative > 0);
      result.centers.forEach(c => { assert(c.cardDelta < .5, JSON.stringify(c)); assert(c.nameDelta < 1, JSON.stringify(c)); });
      result.clearances.forEach(c => assert(!c.overlap, `Badge overlaps rating: ${JSON.stringify(c)}`));
      console.log(mode, JSON.stringify(result));
      await current.page.screenshot({ path: path.join(output, `${mode}-after.png`) });
      if (mode === 'main-small') {
        await current.page.locator('.page.active [data-dp-role="lineup"]').screenshot({ path: path.join(output, 'pitch-after.png') });
        await current.page.locator('#benchPanel').screenshot({ path: path.join(output, 'bench-after.png') });
        await current.page.evaluate(() => setSetting('lineupPitchTone', 'white'));
        await settle(current.page);
        await current.page.locator('.page.active [data-dp-role="lineup"]').screenshot({ path: path.join(output, 'pitch-white.png') });
        await current.page.evaluate(() => setSetting('lineupPitchTone', 'black'));
      }
    }
    // All scoreboard theme card dimensions, transforms and counts remain unchanged.
    const themes = await current.page.locator('#fsmThemeSelect option').evaluateAll(els => els.map(el => el.value).filter(v => v !== 'auto'));
    for (const theme of themes) {
      const metrics = [];
      for (const subject of [current, old].filter(Boolean)) {
        await subject.page.evaluate(theme => applyTheme(theme), theme);
        await subject.page.waitForFunction(() => !pendingThemeLink);
        await settle(subject.page);
        metrics.push(await subject.page.locator('.rc-card').evaluateAll(els => els.map(el => {
          const css = getComputedStyle(el); return { width: css.width, height: css.height, transform: css.transform };
        })));
      }
      if (old) assert.deepEqual(metrics[0], metrics[1], `${theme}: red card geometry`);
      assert.equal(await current.page.locator('.rc-card .football-icon-red-card').count(), 3);
    }
    await current.page.evaluate(() => {
      activatePage('tactics'); document.querySelector('#tactics-show-ball').checked = true; tacticsRenderTokens();
    });
    await settle(current.page);
    const ball = current.page.locator('.tactics-ball-token');
    const before = await ball.boundingBox();
    await current.page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await current.page.mouse.down(); await current.page.mouse.move(before.x + 90, before.y + 45, { steps: 8 }); await current.page.mouse.up();
    const after = await ball.boundingBox();
    assert(Math.abs(after.x - before.x) > 20, 'Ball still draggable through image');
    assert.equal(await ball.locator('.football-icon-goal').count(), 1);
    const chip = current.page.locator('.td-tl-event').first();
    await chip.click();
    assert.equal(await current.page.evaluate(() => tacticsTimelineState.currentElapsed), 42);
    assert.equal(await chip.locator('.football-icon-cumulative-red').count(), 1);
    await current.page.screenshot({ path: path.join(output, 'tactics-after.png') });
    // Every preset changes the check/IN color while PNG OFF remains exact.
    await current.page.evaluate(() => {
      const preview = document.createElement('div'); preview.id = 'icon-preview';
      preview.style.cssText = 'position:fixed;inset:80px auto auto 80px;padding:24px;z-index:99999;background:#111827;display:flex;gap:16px;font-size:60px';
      preview.innerHTML = Object.keys(FOOTBALL_ICON_ASSETS).map(footballIconHtml).join('') + footballIconHtml('subst');
      document.body.appendChild(preview);
    });
    const original = current.page.locator('#icon-preview .football-icon-confirm-original');
    assert((await original.getAttribute('href')).endsWith('/var-confirm.png'));
    assert.equal(await original.evaluate(el => getComputedStyle(el).display), 'inline');
    await current.page.locator('#icon-preview').screenshot({ path: path.join(output, 'icons-off.png') });
    for (const preset of ['strong', 'purple', 'moderate', 'mild', 'natural']) {
      await current.page.evaluate(preset => { setSetting('greenscreenIntensity', preset); setSetting('greenscreen', 'on'); }, preset);
      const color = await current.page.locator('#icon-preview .football-icon-check').evaluate(el => getComputedStyle(el).stroke);
      assert(!['rgb(34, 197, 94)', 'rgb(124, 252, 142)'].includes(color), `${preset}: green must change`);
      assert.equal(await original.evaluate(el => getComputedStyle(el).display), 'none');
      await current.page.locator('#icon-preview').screenshot({ path: path.join(output, `icons-${preset}.png`) });
    }
    await current.page.evaluate(() => setSetting('greenscreen', 'off'));
    assert.equal(await original.evaluate(el => getComputedStyle(el).display), 'inline');
    const manual = await current.page.evaluate(() => {
      const host = document.createElement('div'); host.innerHTML = buildLineupManualFormHtml({});
      return { icons: host.querySelectorAll('.dp-manual-stat-header .football-icon').length, checks: host.querySelectorAll('input[type="checkbox"]').length };
    });
    assert.equal(manual.icons, 5); assert.equal(manual.checks, 33);
    // Number glyphs must have clearance inside their border, including two digits.
    await current.page.evaluate(() => {
      document.querySelector('#icon-preview').remove();
      const host = document.createElement('div'); host.id = 'count-preview';
      host.style.cssText = 'position:fixed;top:80px;left:80px;z-index:99999;background:#111827;padding:30px;display:flex;gap:40px';
      host.innerHTML = [2, 10, 99].map(n => `<span style="position:relative;width:70px;height:60px">${lpBuildNodeBadgesHtml({ assists: Array(n), goals: Array(n) })}</span>`).join('');
      document.body.appendChild(host);
    });
    const numbers = await current.page.locator('#count-preview .dp-node-count').evaluateAll(els => els.map(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const glyph = range.getBoundingClientRect(), circle = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return { text: el.textContent, lineHeight: parseFloat(css.lineHeight), height: circle.height, left: glyph.left - circle.left, right: circle.right - glyph.right,
        top: glyph.top - circle.top, bottom: circle.bottom - glyph.bottom };
    }));
    // DOM Range includes the font's unused ascent/descent, so vertical clearance
    // uses the line box and is also checked in the saved actual-size screenshot.
    for (const n of numbers) assert(n.left >= 2 && n.right >= 2 && n.lineHeight <= n.height - 2, JSON.stringify(n));
    await current.page.locator('#count-preview').screenshot({ path: path.join(output, 'counts.png') });
    assert.deepEqual(current.errors, []); if (old) assert.deepEqual(old.errors, []);
    console.log(`PASS: icons, roster alignment, pitch clearances, ${themes.length} themes, drag/timeline, manual controls and 5 chroma presets${old ? '; before/after layout matched' : ''}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
