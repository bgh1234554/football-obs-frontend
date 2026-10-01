const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const draftRoot = path.resolve(process.argv[2] || root);
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const relative = decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname);
      const draftFile = path.join(draftRoot, relative);
      const file = fs.existsSync(draftFile) ? draftFile : path.join(root, relative);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    const seed = { side: 'away', teamId: 6, extra: null };
    const penalty = { ...seed, elapsed: 45, playerId: 1496, playerName: '하피냐', type: 'Goal', detail: 'Penalty' };
    const added = { ...seed, elapsed: 45, extra: 4, playerId: 11, playerName: 'Added', type: 'Card', detail: 'Yellow Card' };
    const sub = { ...seed, elapsed: 45, playerId: 12, playerName: 'Out', assistId: 13, assistName: 'In', type: 'subst', detail: 'Substitution 1' };
    const next = { ...added, elapsed: 46, extra: null, playerId: 14, playerName: 'Next' };
    const render = async (id, status, events, rawEvents) => page.evaluate(({ id, status, events, rawEvents }) => {
      activatePage('main-small');
      applyEventsPanel({ matchInfo: { fixtureId: id, status, elapsed: 46, homeTeamId: 20, awayTeamId: 6, homeTeamName: '호주', awayTeamName: '브라질' }, events, ...(rawEvents ? { _rawEvents: rawEvents } : {}) }, { animate: false });
      const panel = [...document.querySelectorAll('[data-events-panel]')].find(el => el.getClientRects().length);
      return [...panel.querySelectorAll('.ev-list > .ev-row')].map(row => ({ marker: row.classList.contains('ev-period-marker'), sub: row.classList.contains('ev-row-subst'), text: row.textContent }));
    }, { id, status, events, rawEvents });
    const assertSubSide = (rows, after) => {
      const marker = rows.findIndex(row => row.marker && row.text.includes('하프타임'));
      const subIndex = rows.findIndex(row => row.sub);
      assert(marker >= 0 && subIndex >= 0, JSON.stringify(rows));
      assert.equal(subIndex < marker, after, JSON.stringify(rows));
    };
    let rows = await render('1583654', 'HT', [penalty, added, sub]);
    assertSubSide(rows, true);
    assert(rows.findIndex(row => row.text.includes('하피냐')) > rows.findIndex(row => row.marker));
    assertSubSide(await render('1583654', '2H', [penalty, added, sub, next]), true);
    assertSubSide(await render('1583654', '2H', [penalty, sub, added, next]), false);
    assertSubSide(await render('hidden-neighbors', '2H', [sub], [added, sub, next]), true);
    await render('observed-live', '1H', [sub]);
    assertSubSide(await render('observed-live', '2H', [added, sub, next]), false);
    await page.reload();
    assertSubSide(await render('observed-live', '2H', [added, sub, next]), false);
    assert.deepEqual(errors, []);
    console.log('PASS: actual event-panel DOM places the penalty before HT, reevaluates substitutions, preserves hidden raw evidence and restores direct observations after reload.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
