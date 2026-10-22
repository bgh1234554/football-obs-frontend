require('../tactics/helpers');
﻿const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.ttf': 'font/ttf', '.woff': 'font/woff'
      }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
    for (const theme of ['default', 'pl', 'cl', 'uel', 'acle', 'unl', 'er24', 'ligue1', 'seriea', 'kleague', 'wc26']) {
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      for (const scale of [60, 100, 150]) {
        const metrics = await page.evaluate(scale => {
          state.boardScale = scale; state.noteFontSize = 20; state.noteEnabled = true;
          state.notes.home = "9' 조나탕 밤바\n27' (PK 실축) 필리프 징커나겔\n50' 필리프 징커나겔\n88' 마렌 하일레셀라시";
          state.notes.away = "73' 마티아스 라보르다";
          render(); fsmBoardRender();
          const main = document.querySelector('.scoreboard-main');
          const timer = document.querySelector('.scoreboard-timer');
          const rect = main.getBoundingClientRect();
          const scaleFactor = rect.height / main.offsetHeight;
          return {
            limit: main.offsetHeight + 2 * timer.offsetHeight,
            notes: ['homeNote', 'awayNote'].map(id => {
              const node = document.getElementById(id), r = node.getBoundingClientRect();
              return { height: node.scrollHeight, centerError: Math.abs((r.top + r.bottom - rect.top - rect.bottom) / 2),
                top: (r.top - rect.top) / scaleFactor, bottom: (r.bottom - rect.bottom) / scaleFactor,
                rows: node.querySelectorAll('.note-row').length, font: parseFloat(getComputedStyle(node).fontSize) };
            }), timerHeight: timer.offsetHeight
          };
        }, scale);
        for (const note of metrics.notes) {
          assert(note.height <= metrics.limit, JSON.stringify({ theme, scale, metrics }));
          assert(note.centerError < 1, JSON.stringify({ theme, scale, note }));
          assert(note.top >= -metrics.timerHeight - 1 && note.bottom <= metrics.timerHeight + 1);
          assert(note.font >= 8 && note.font <= 20);
          if (scale === 60) assert.equal(note.font, 20);
        }
        assert.equal(metrics.notes[0].rows, 4, 'Four rows should fit without premature compression');
      }
      console.log('PASS', theme, 'symmetric timer allowance, centering and preview scales');
    }
    await page.evaluate(() => applyTheme('default', null));
    await page.waitForFunction(() => !pendingThemeLink);
    // Keep the wrapper unchanged; the observer must detect an independently taller clock.
    await page.evaluate(() => {
      state.boardScale = 100; state.notes.home = Array.from({ length: 6 }, (_, i) => `${i + 1}' 선수`).join('\n');
      render(); fsmBoardRender();
      document.querySelector('.time').style.height = '60px';
    });
    await page.waitForFunction(() => document.querySelectorAll('#homeNote .note-row').length === 6);
    await page.evaluate(() => { document.querySelector('.time').style.height = '12px'; document.querySelector('.scoreboard-timer').style.height = '12px'; });
    await page.waitForFunction(() => document.querySelectorAll('#homeNote .note-row').length === 4);
    await page.evaluate(() => { document.querySelector('.scoreboard-timer').style.display = 'none'; });
    await page.waitForFunction(() => document.querySelectorAll('#homeNote .note-row').length === 1 && parseFloat(getComputedStyle(document.querySelector('#homeNote')).fontSize) === 20);
    await page.evaluate(() => {
      document.querySelector('.time').style.height = ''; document.querySelector('.scoreboard-timer').style.height = '';
      document.querySelector('.scoreboard-timer').style.display = '';
      state.homeName = '시카고 파이어'; state.awayName = '밴쿠버 화이트캡스'; state.homeScore = 3; state.awayScore = 1;
      state.notes.home = "9' 조나탕 밤바\n27' (PK 실축) 필리프 징커나겔\n50' 필리프 징커나겔\n88' 마렌 하일레셀라시";
      setClockSeconds(5400, { autoStart: false }); render(); fsmBoardRender();
    });
    for (const green of ['off', 'on']) {
      for (const width of [0, 1, 3]) {
        const svgMetrics = await page.evaluate(({ green, width }) => {
          setSetting('greenscreen', green);
          state.noteStrokeWidth = width;
          state.notes.home = "11' 얀 우르비히\n27' (PK 실축) 선수\n50' (OG) 선수\n88' (퇴장) 선수";
          render(); fsmBoardRender();
          return [...document.querySelectorAll('#homeNote .note-line')].map(line => {
            const text = line.querySelector('svg text');
            const style = getComputedStyle(text);
            const box = text.getBBox();
            const matrix = text.transform.baseVal.consolidate().matrix;
            return { stroke: parseFloat(style.strokeWidth), fill: style.fill,
              expectedFill: getComputedStyle(line).color, join: style.strokeLinejoin,
              paint: style.paintOrder, x: box.x + matrix.e,
              center: box.y + matrix.f + box.height / 2, expectedCenter: line.offsetHeight / 2,
              label: line.getAttribute('aria-label') };
          });
        }, { green, width });
        assert.equal(svgMetrics.length, 4);
        for (const metric of svgMetrics) {
          assert.equal(metric.stroke, 2 * (width + (green === 'on' && width > 0 ? 0.75 : 0)));
          assert.equal(metric.fill, metric.expectedFill);
          assert.equal(metric.join, 'round');
          assert.equal(metric.paint, 'stroke');
          assert(Math.abs(metric.x) < 0.1 && Math.abs(metric.center - metric.expectedCenter) < 0.1);
          assert(metric.label.length > 0);
        }
      }
    }
    console.log('PASS SVG event colors, rounded strokes, alignment and greenscreen reinforcement');
    const reuse = await page.evaluate(() => {
      autoLayoutNotes();
      const home = el.homeNote.firstChild;
      const away = el.awayNote.firstChild;
      const before = [el.homeNote.innerHTML, el.awayNote.innerHTML];
      autoLayoutNotes();
      autoLayoutNotes();
      const kept = home === el.homeNote.firstChild && away === el.awayNote.firstChild;
      const unchanged = before[0] === el.homeNote.innerHTML && before[1] === el.awayNote.innerHTML;
      const size = state.noteFontSize;
      state.noteFontSize = size + 2;
      autoLayoutNotes();
      const refitted = home !== el.homeNote.firstChild;
      state.noteFontSize = size;
      autoLayoutNotes();
      return { kept, unchanged, refitted };
    });
    assert.ok(reuse.kept && reuse.unchanged, 'unchanged notes retain DOM and layout');
    assert.ok(reuse.refitted, 'font size change refits notes');
    await page.evaluate(() => {
      const note = document.getElementById('homeNote');
      const text = note.querySelector('svg text');
      const original = text.getBBox;
      note.style.display = 'none';
      /** 숨겨진 SVG를 측정하면 실패하도록 getBBox를 막는다. */
      text.getBBox = () => { throw new Error('Hidden SVG must not be measured'); };
      try { alignNoteSvg(note); }
      finally { text.getBBox = original; note.style.display = ''; }
      alignNoteSvg(note);
    });
    for (const position of ['center', 'left', 'right']) {
      for (const content of ['', "9' Player"]) {
        await page.evaluate(({ position, content }) => {
          state.manualMode = true; state.noteEnabled = true; state.boardScale = 85;
          state.boardPosition = position; state.notes = { home: content, away: content };
          render(); fsmBoardRender(); reapplyBoardScale();
        }, { position, content });
        for (const side of ['home', 'away']) {
          const note = page.locator(`#${side}Note`);
          const width = await note.evaluate(node => node.getBoundingClientRect().width);
          for (let repeat = 0; repeat < 2; repeat++) {
            await note.dblclick();
            const editor = page.locator('.note-inline-textarea');
            await editor.fill('unsaved edit');
            await page.waitForFunction(() => document.activeElement?.matches('.note-inline-textarea'));
            // 다음 작업으로 등록되는 바깥 클릭 리스너를 기다린 뒤 취소합니다.
            await page.waitForTimeout(20);
            await page.mouse.click(5, 600);
            assert.equal(await editor.count(), 0, 'outside click closes editor');
            const restored = await note.evaluate(node => node.getBoundingClientRect().width);
            assert(Math.abs(restored - width) < 1 && restored > 0, 'cancel restores clickable note width');
            assert.equal(await page.evaluate(side => state.notes[side], side), content, 'cancel preserves saved text');
          }
        }
      }
    }
    console.log('PASS note editing reopens after outside cancel on both sides and all positions');
    for (const manual of [false, true]) {
      for (const position of ['center', 'left', 'right']) {
        await page.evaluate(({ manual, position }) => {
          state.manualMode = manual; state.boardPosition = position;
          state.notes = { home: "9' Home", away: "12' Away" };
          state.noteFontSize = 18; state.noteStrokeWidth = 1;
          render(); fsmBoardRender(); reapplyBoardScale();
        }, { manual, position });
        for (const side of ['home', 'away']) {
          const closedHeight = await page.locator('#boardStageWrap').evaluate(node => node.getBoundingClientRect().height);
          await page.locator(`#${side}Note`).click();
          const menu = page.getByRole('group', { name: '득점자 표시 설정', exact: true });
          assert.equal(await menu.isVisible(), true);
          assert.equal(await menu.locator('.note-quick-shortcuts .kbd').count(), 2);
          assert.equal(await menu.locator('.note-edit-shortcuts').count(), manual ? 1 : 0);
          if (manual) assert.deepEqual(await menu.locator('.note-edit-shortcuts .kbd').allTextContents(), ['Enter', 'Ctrl+Enter', 'Esc']);
          if (manual) {
            await page.locator('.note-inline-textarea').fill('draft text');
            const bounds = await menu.evaluate(node => ({ menu: node.getBoundingClientRect().width, editor: node.parentElement.querySelector('textarea').getBoundingClientRect().width }));
            assert(Math.abs(bounds.menu - bounds.editor) < 1, 'manual menu matches editor width');
          }
          await menu.getByRole('button', { name: '글자 크기 키우기', exact: true }).click();
          assert.equal(await page.evaluate(() => state.noteFontSize), 19);
          await menu.getByRole('button', { name: '글자 크기 줄이기', exact: true }).click();
          assert.equal(await page.evaluate(() => state.noteFontSize), 18);
          await menu.getByRole('button', { name: '테두리 굵기 키우기', exact: true }).click();
          assert.equal(await page.evaluate(() => state.noteStrokeWidth), 1.5);
          await menu.getByRole('button', { name: '테두리 굵기 줄이기', exact: true }).click();
          assert.equal(await page.evaluate(() => state.noteStrokeWidth), 1);
          await menu.getByRole('button', { name: '테두리 굵기 키우기', exact: true }).click();
          await menu.getByRole('button', { name: '테두리 굵기 초기화', exact: true }).click();
          assert.equal(await page.evaluate(() => state.noteStrokeWidth), 1, 'stroke reset restores default');
          if (manual) assert.equal(await page.locator('.note-inline-textarea').inputValue(), 'draft text');
          await page.evaluate(() => syncBoardStageHeight());
          assert.equal(await page.locator('#boardStageWrap').evaluate(node => node.getBoundingClientRect().height), closedHeight, 'note menu and editor do not grow scoreboard height');
          const menuBounds = await menu.boundingBox();
          assert(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 1920, 'menu stays within viewport');
          await page.screenshot({ path: `screenshots/tests/note-menu-${manual ? 'manual' : 'auto'}-${position}-${side}.png` });
          if (manual) await page.locator('.note-inline-textarea').press('Escape');
          else await page.keyboard.press('Escape');
          assert.equal(await menu.count(), 0);
        }
      }
    }
    await page.evaluate(() => { state.manualMode = false; render(); fsmBoardRender(); });
    await page.locator('#homeNote').click();
    await page.getByRole('button', { name: '글자 크기 초기화', exact: true }).click();
    assert.equal(await page.evaluate(() => state.noteFontSize), 18);
    await page.getByRole('button', { name: '상세 설정', exact: true }).click();
    assert.equal(await page.evaluate(() => document.querySelector('.page.active')?.id), 'page-theme');
    assert.equal(await page.locator('.note-quick-menu').count(), 0);
    const glow = await page.locator('.theme-notes-card').evaluate(panel => {
      const animation = panel.getAnimations().find(animation => animation.id === 'note-settings-glow');
      if (!animation) return false;
      animation.pause();
      animation.currentTime = 600;
      return getComputedStyle(panel).boxShadow !== 'none';
    });
    assert(glow, 'details highlights scorer settings panel');
    await page.screenshot({ path: 'screenshots/tests/note-settings-glow.png' });
    await page.locator('.theme-notes-card').evaluate(panel => panel.getAnimations().forEach(animation => animation.finish()));
    console.log('PASS automatic and manual note menus, settings, draft preservation and placement');
    await page.screenshot({ path: 'screenshots/tests/fsm-note-height.png' });
    assert.deepEqual(errors, []);
    console.log('PASS dynamic clock height, hidden timer and automatic relayout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

