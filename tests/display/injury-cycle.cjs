const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 945 } });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.evaluate(() => {
      setSetting('statCycleAuto', 'off'); activatePage('main-big');
      state.colors.homeBg = '#ffffff'; state.colors.homeText = '#101010';
      state.colors.awayBg = '#ff0000'; state.colors.awayText = '#ffffff';
      window.injuryFixture = {
        matchInfo: { homeTeamName: '풀럼', awayTeamName: '맨체스터 유나이티드' },
        homeInjuries: [{ playerId: 101, number: 10, name: '톰 케어니', reason: 'Knee Injury' }, { playerId: 102, number: 2, name: '케니 테테', reason: 'Suspended' }],
        awayInjuries: Array.from({ length: 5 }, (_, i) => ({ playerId: 201 + i, number: 16 + i, name: '선수 ' + (i + 1), reason: 'Ankle Injury', type: i === 1 ? 'Questionable' : 'Missing Fixture' })),
      };
      renderInjuryCyclePanel(injuryFixture, injuryFixture);
      window._lpStatBenchData = { home: [{}], away: [{}] }; window._lpStatMatchInfoAvailable = true;
      _lpStatCycle.mode = 'injuries'; lpStatUpdateVisibility();
    });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const panel = document.querySelector('[data-injury-cycle-panel]');
      const sections = [...panel.querySelectorAll('.ic-team')];
      const rect = el => getDisplayLayoutRect(el);
      const gaps = sections.map(section => ({
        top: rect(section.querySelector('.dp-side-header')).top - rect(section).top,
        labelToList: rect(section.querySelector('.ic-list')).top - rect(section.querySelector('.dp-side-header')).bottom,
        bottom: rect(section).bottom - rect(section.querySelector('.ic-list')).bottom,
      }));
      const body = panel.querySelector('.ic-body');
      renderInjuryCyclePanel(injuryFixture, injuryFixture);
      return { modes: lpStatAvailableModes(), count: _lpStatInjuryCount, gaps, stable: body === panel.querySelector('.ic-body'),
        reasons: [...panel.querySelectorAll('.ic-reason')].map(el => ({ text: el.textContent, color: getComputedStyle(el).color })),
        smallReasons: document.querySelectorAll('#injuryPanel .ic-reason').length };
    });
    assert.equal(result.count, 7); assert(result.stable); assert.equal(result.smallReasons, 0);
    assert.deepEqual(result.modes.slice(-4), ['bench_home', 'bench_away', 'injuries', 'match_info']);
    for (const gap of result.gaps) { assert(Math.abs(gap.top - 10) <= 1); assert(Math.abs(gap.bottom - 10) <= 1); assert(Math.abs(gap.labelToList - 8) < 0.1); }
    assert(result.reasons.some(r => r.color === 'rgb(255, 217, 61)'));
    assert(result.reasons.some(r => r.color === 'rgb(248, 113, 113)'));
    if (process.env.INJURY_SCREENSHOT) await page.locator('.layout-big .lp-stat').screenshot({ path: process.env.INJURY_SCREENSHOT });
    await page.evaluate(() => { setSetting('statCycleModeInjuries', 'off'); });
    assert.equal(await page.evaluate(() => lpStatAvailableModes().includes('injuries')), false);
    await page.evaluate(() => { setSetting('statCycleModeInjuries', 'on'); renderInjuryCyclePanel({}, {}); });
    assert.equal(await page.evaluate(() => lpStatAvailableModes().includes('injuries')), false);
    await page.evaluate(() => { renderInjuryCyclePanel({ homeInjuries: injuryFixture.homeInjuries }, {}); });
    assert.equal(await page.evaluate(() => lpStatAvailableModes().includes('injuries')), true);
    for (const count of [9, 10, 20]) {
      const duration = await page.evaluate(count => { _lpStatInjuryCount = count; const o = _lpInjuryScrollOptions(10000); return o.scrollDurationMs == null ? 10000 : o.startHoldMs + o.scrollDurationMs + o.endHoldMs; }, count);
      assert.equal(duration, count < 10 ? 10000 : 3500 + count * 1000);
    }
    await page.evaluate(() => {
      const cases = [
        { reason: 'Knee Injury' }, { reason: 'Ankle Injury', type: 'Questionable' },
        { reason: 'Questionable' }, { reason: 'Yellow Card Accumulation' },
        { reason: 'National Team' }, { reason: 'Off the roster' }, { reason: '' },
        { reason: 'Detailed unknown injury reason with a long explanation that must wrap across lines' },
      ];
      injuryFixture.awayInjuries = Array.from({ length: 20 }, (_, i) => ({ playerId: 300 + i, number: i + 1, name: '긴 이름의 선수 ' + i, ...cases[i % cases.length] }));
      renderInjuryCyclePanel(injuryFixture, injuryFixture);
      document.querySelector('.layout-big .lp-stat').style.height = '260px';
      setSetting('statsAutoSwipeSec', 2.5); setSetting('statCycleAuto', 'on');
      _lpAutoClear(); _lpStatCycle.mode = 'injuries'; lpStatUpdateVisibility();
    });
    await page.waitForTimeout(1400);
    const progress = await page.evaluate(() => { const el = _lpEventsScrollEl('injuries'); return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight }; });
    assert(progress.max > 0 && progress.top > 0 && progress.top < progress.max);
    const longLayout = await page.evaluate(() => {
      const panel = document.querySelector('[data-injury-cycle-panel]'), body = panel.querySelector('.ic-body');
      const rows = [...panel.querySelectorAll('.dp-item')];
      const oldBody = body;
      renderInjuryCyclePanel(injuryFixture, injuryFixture);
      return {
        count: rows.length, stable: oldBody === panel.querySelector('.ic-body'),
        scrollbar: getComputedStyle(body, '::-webkit-scrollbar').display,
        scrollbarWidth: getComputedStyle(body, '::-webkit-scrollbar').width,
        inside: body.getBoundingClientRect().right < panel.getBoundingClientRect().right,
        overflowX: body.scrollWidth > body.clientWidth,
        reasons: rows.map(row => ({ text: row.querySelector('.ic-reason').textContent, color: getComputedStyle(row.querySelector('.ic-reason')).color })),
        icons: [...panel.querySelectorAll('.dp-icon')].map(el => el.className),
      };
    });
    assert.equal(longLayout.count, 22); assert(longLayout.stable); assert(longLayout.inside); assert(!longLayout.overflowX);
    assert.equal(longLayout.scrollbar, 'block'); assert.equal(longLayout.scrollbarWidth, '6px');
    for (const icon of ['dp-icon-injury', 'dp-icon-questionable', 'dp-icon-redcard', 'dp-icon-unregistered']) assert(longLayout.icons.some(c => c.includes(icon)));
    for (const text of ['무릎 부상', '출장 정지', '정보 없음', '출전 여부 미정']) assert(longLayout.reasons.some(r => r.text.includes(text)));
    assert(longLayout.reasons.some(r => r.text.includes('Detailed unknown')));
    assert(longLayout.reasons.filter(r => r.text.includes('출전 여부 미정')).every(r => r.color === 'rgb(255, 217, 61)'));
    if (process.env.INJURY_SCREENSHOT) await page.locator('.layout-big .lp-stat').screenshot({ path: process.env.INJURY_SCREENSHOT.replace('.png', '-long.png') });
    await page.evaluate(() => lpStatTogglePause());
    const stopped = await page.evaluate(() => _lpEventsScrollEl('injuries').scrollTop);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => _lpEventsScrollEl('injuries').scrollTop), stopped);
    // 실제 스크롤 완료 위치와 다음 패널 전환까지의 경과 시간을 측정한다.
    const timings = [];
    for (const [count, seconds] of [[22, 2.5], [10, 2.5], [9, 2.5], [12, 5]]) {
      const expected = await page.evaluate(({ count, seconds }) => {
        _lpAutoClear(); _lpStatCycle.paused = true;
        const entries = Array.from({ length: count }, (_, i) => ({ playerId: 500 + i, name: '측정 선수 ' + i, reason: 'Knee Injury' }));
        renderInjuryCyclePanel({ ...injuryFixture, homeInjuries: entries.slice(0, 2), awayInjuries: entries.slice(2) }, {});
        setSetting('statsAutoSwipeSec', seconds);
        if (!window.originalInjuryAdvance) {
          window.originalInjuryAdvance = lpStatAutoAdvance;
          lpStatAutoAdvance = () => {
            if (_lpStatCycle.mode === 'injuries') {
              const el = _lpEventsScrollEl('injuries');
              window.injuryTiming = { elapsed: performance.now() - window.injuryStarted, top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
            }
            originalInjuryAdvance();
          };
        }
        window.injuryTiming = null; _lpStatCycle.mode = 'injuries'; _lpStatCycle.paused = false;
        window.injuryStarted = performance.now(); lpStatUpdateVisibility();
        const base = seconds * 1000;
        return count < 10 ? base : base * (count / 10 + 0.35);
      }, { count, seconds });
      await page.waitForFunction(() => window.injuryTiming !== null, null, { timeout: expected + 3000 });
      const timing = await page.evaluate(() => window.injuryTiming);
      assert(Math.abs(timing.top - timing.max) <= 1, JSON.stringify(timing));
      assert(timing.elapsed >= expected - 80 && timing.elapsed <= expected + 1000, JSON.stringify({ count, seconds, expected, timing }));
      timings.push({ count, seconds, expectedMs: expected, actualMs: Math.round(timing.elapsed) });
    }
    console.log('PASS actual injury scroll/transition timing', JSON.stringify(timings));
    // 같은 폰트 피팅을 캠 큰/작은 실제 명단 행에 적용한다.
    await page.evaluate(() => {
      _lpAutoClear(); setSetting('statCycleAuto', 'off');
      const data = { ...injuryFixture, homeInjuries: [{ playerId: 991, name: '톰 케어니', reason: 'Knee Injury', type: 'Questionable' }], awayInjuries: [] };
      renderInjuryPanel(data, data); renderInjuryCyclePanel(data, data);
    });
    for (const [mode, selector] of [['main-big', '[data-injury-cycle-panel]'], ['main-small', '#injuryPanel']]) {
      const sizing = await page.evaluate(({ mode, selector }) => {
        activatePage(mode); _lpStatCycle.mode = 'injuries'; lpStatUpdateVisibility();
        const panel = document.querySelector(selector), label = panel.querySelector('.dp-item-name'), reason = label.querySelector('.ic-reason');
        const nameSize = getComputedStyle(label).fontSize;
        label.style.flex = '0 0 auto'; label.style.width = '400px'; fitInjuryReasons(panel);
        const base = parseFloat(getComputedStyle(reason).fontSize);
        label.style.width = '1px'; reason.style.fontSize = '8px';
        const narrow = label.scrollWidth;
        reason.style.fontSize = `${base}px`;
        const wide = label.scrollWidth;
        label.style.width = `${Math.floor((wide + narrow) / 2)}px`; fitInjuryReasons(panel);
        const shrunk = { font: parseFloat(getComputedStyle(reason).fontSize), fits: label.scrollWidth <= label.clientWidth, name: getComputedStyle(label).fontSize };
        label.style.width = '400px'; fitInjuryReasons(panel);
        const restored = parseFloat(getComputedStyle(reason).fontSize);
        reason.textContent = 'A very long unknown injury reason '.repeat(8);
        label.style.width = '120px'; fitInjuryReasons(panel);
        return { base, shrunk, restored, nameSize, fallback: label.classList.contains('ic-reason-wrap'), minimum: parseFloat(getComputedStyle(reason).fontSize) };
      }, { mode, selector });
      assert(sizing.shrunk.font < sizing.base && sizing.shrunk.font >= 8, JSON.stringify(sizing));
      assert(sizing.shrunk.fits); assert.equal(sizing.shrunk.name, sizing.nameSize);
      assert.equal(sizing.restored, sizing.base); assert(sizing.fallback); assert.equal(sizing.minimum, 8);
    }
    console.log('PASS shared reason font fitting: shrink, keep name size, expand back, readable long-text fallback (big/small)');
    if (process.env.INJURY_SCREENSHOT) {
      await page.evaluate(() => {
        const data = { ...injuryFixture, awayInjuries: injuryFixture.awayInjuries.slice(0, 5) };
        document.querySelector('#injuryPanel').querySelectorAll('.dp-item-name').forEach(el => { el.style.removeProperty('width'); el.style.removeProperty('flex'); });
        renderInjuryPanel(data, data);
      });
      await page.waitForTimeout(100);
      await page.locator('.layout-small .lp-injury').screenshot({ path: process.env.INJURY_SCREENSHOT.replace('.png', '-small.png') });
    }
    console.log('PASS injury cycle: order, equal spacing, mixed reasons, empty/one-team/off, stable polling, scrollbar bounds, downward scroll and pause');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
