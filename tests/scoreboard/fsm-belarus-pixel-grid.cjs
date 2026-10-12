const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
const output = path.resolve('screenshots/tests/belarus-pixel-grid');
const variables = ['upper-y', 'upper-outer', 'upper-inner', 'lower-y', 'lower-outer', 'lower-inner',
  'upper-paint-y', 'lower-paint-y', 'edge-top', 'edge-bottom', 'edge-top-x', 'edge-bottom-x'];

async function assertAligned(page, label) {
  const positions = await page.evaluate(() => {
    const board = document.querySelector('.fsm-board'), style = getComputedStyle(board);
    const rect = document.querySelector('#team-score-left').getBoundingClientRect();
    return ['upper', 'lower'].map(name => (rect.top + parseFloat(style.getPropertyValue('--fsm-belarus-' + name + '-y')) * rect.height / 48) * devicePixelRatio);
  });
  assert(positions.every(y => Number.isFinite(y) && Math.abs(y - Math.round(y)) < 1e-4), `${label}: ${positions}`);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const records = [];
  try {
    for (const dpr of [1, 1.25, 2]) {
      const page = await openPage(browser, { dpr, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addStyleTag({ content: `
        .board.fsm-board.belarus-pixel-baseline .teams-left { background: var(--fsm-home-primary-color); }
        .board.fsm-board.belarus-pixel-baseline .teams-right { background: var(--fsm-away-primary-color); }
        .board.fsm-board.belarus-pixel-baseline :is(.teams-left, .teams-right)::before { display: none; }
      ` });
      await page.evaluate(() => {
        state.fsmTheme = 'belarus'; state.homeName = 'HOME'; state.awayName = 'AWAY';
        state.redHome = 0; state.redAway = 0;
        Object.assign(state.colors, { homeBg: '#ffdd00', homeText: '#004b26', awayBg: '#ff0000', awayText: '#ffffff' });
        autoApplyTemplateByLeagueId(116, null); render();
      });
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      await assertAligned(page, 'initial theme render');
      for (const width of [1920, 1536]) {
        await page.setViewportSize({ width, height: 1080 });
        await settle(page);
        await assertAligned(page, 'resize without reapplying board scale');
        for (const scale of [100, 75]) {
          await page.evaluate(scale => { state.boardScale = scale; reapplyBoardScale(); }, scale);
          await settle(page);
          for (const mode of ['before', 'after']) {
            await page.evaluate(({ mode, variables }) => {
              const board = document.querySelector('.fsm-board');
              board.classList.toggle('belarus-pixel-baseline', mode === 'before');
              if (mode === 'before') variables.forEach(v => board.style.removeProperty('--fsm-belarus-' + v));
              else syncBelarusBoundaryPixelGrid();
            }, { mode, variables });
            await settle(page);
            const record = await page.evaluate(({ mode, dpr, width, scale }) => {
              const board = document.querySelector('.fsm-board'), style = getComputedStyle(board);
              const r = document.querySelector('#team-score-left').getBoundingClientRect();
              const away = document.querySelector('#team-score-right').getBoundingClientRect();
              const ratio = r.height / 48;
              const clip = { x: Math.floor(r.left - ratio * 14), y: Math.floor(r.top), width: Math.ceil(away.right + ratio * 14) - Math.floor(r.left - ratio * 14), height: Math.ceil(r.bottom) - Math.floor(r.top) };
              const bends = [['upper', 9.816], ['lower', 36]].flatMap(([name, fallback]) => {
                const y = parseFloat(style.getPropertyValue('--fsm-belarus-' + name + '-y')) || fallback;
                const outer = 1.36 + y / 12;
                return ['home', 'away'].map(side => ({ side, name, deviceY: (r.top + y * ratio) * dpr,
                  sampleX: ((side === 'home' ? r.left - 10 * ratio + (outer + 2.73) * ratio : away.right + 10 * ratio - (outer + 2.73) * ratio) - clip.x) * dpr,
                  sampleY: (r.top + y * ratio - clip.y) * dpr }));
              });
              const edges = [['top', 0], ['bottom', 48]].flatMap(([name, y]) => {
                const outer = 1.36 + y / 12;
                return ['home', 'away'].map(side => ({ side, name,
                  sampleX: ((side === 'home' ? r.left - 10 * ratio + (outer + 3) * ratio : away.right + 10 * ratio - (outer + 3) * ratio) - clip.x) * dpr,
                  sampleY: (r.top + y * ratio - clip.y) * dpr - (name === 'bottom' ? 1 : 0) }));
              });
              return { mode, dpr, width, scale, clip, bends, edges };
            }, { mode, dpr, width, scale });
            record.file = `${dpr}-${width}-${scale}-${mode}.png`;
            await page.screenshot({ path: path.join(output, record.file), clip: record.clip });
            if (mode === 'after') for (const bend of record.bends) {
              assert(Math.abs(bend.deviceY - Math.round(bend.deviceY)) < 1e-4, JSON.stringify(record));
            }
            records.push(record);
          }
        }
      }
      await page.evaluate(() => { state.homeScore = 10; state.awayScore = 1; render(); });
      await settle(page);
      await assertAligned(page, 'score update');
      await page.evaluate(() => applyTheme('fnl', null));
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => { state.fsmTheme = 'belarus'; autoApplyTemplateByLeagueId(116, null); render(); });
      await page.waitForFunction(() => !pendingThemeLink);
      await settle(page);
      await assertAligned(page, 'theme reentry');
      assert.deepEqual(errors, []);
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(records, null, 2));
    console.log('PASS 12 combinations: DPR 1/1.25/2, widths 1920/1536, board 100%/75%; 24 screenshots');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
