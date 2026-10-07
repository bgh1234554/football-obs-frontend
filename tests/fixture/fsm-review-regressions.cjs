const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname.slice(1)));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.waitForFunction(() => !document.querySelector('.fsm-starting, .fsm-entering'));
    const results = await page.evaluate(async () => {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(String(args[0]));
      localStorage.removeItem(SKEY);
      state.leagueId = 39; state.leagueLogoUrl = 'old';
      restore();
      console.warn = originalWarn;
      const restored = { leagueId: state.leagueId, logo: state.leagueLogoUrl, warnings };
      const contrast = ['#fff', '#ffffff', 'rgb(255, 255, 255)', 'rgba(255, 255, 255, 0.5)', '#ffffff80', '#000', null, 'invalid', '#zzzzzz'].map(getColorContract);
      const styles = {};
      for (const theme of ['pl', 'wc26', 'rpl']) {
        _currentTheme = theme; applyTeamColors();
        const node = document.querySelector('.teams-left');
        styles[theme] = { border: node.style.borderBottomStyle, borderColor: node.style.borderBottomColor, background: node.style.background };
      }
      state.fsmTheme = 'auto';
      fetchFixture = async id => ({ matchInfo: { fixtureId: id, leagueId: 39, leagueLogoUrl: 'logo', status: 'FT', elapsed: 90,
        homeTeamName: 'Home', awayTeamName: 'Away', homeScore: 1, awayScore: 0 }, events: [], playerStats: [] });
      const calls = [];
      const originalApply = window.autoApplyTemplateByLeagueId;
      window.autoApplyTemplateByLeagueId = (...args) => calls.push(args);
      await fetchAndApplyFixtureData('123', { silent: true }); clearPolling();
      const silent = JSON.parse(localStorage.getItem(SKEY));
      await fetchAndApplyFixtureData('123'); clearPolling();
      const explicit = JSON.parse(localStorage.getItem(SKEY));
      calls.length = 0;
      state.leagueId = null; state.leagueLogoUrl = null; state.leagueThemeApplyVersion = 0;
      syncScoreboardStateFromStorage(JSON.stringify(silent));
      const afterSilent = calls.length;
      // An unrelated later settings write must not reapply the silently changed league.
      syncScoreboardStateFromStorage(JSON.stringify({ ...silent, noteFontSize: 22 }));
      const afterSettings = calls.length;
      syncScoreboardStateFromStorage(JSON.stringify(explicit));
      const afterExplicit = calls.length;
      syncScoreboardStateFromStorage(JSON.stringify({ ...silent, fsmTheme: 'pl' }));
      const afterSelection = calls.length;
      window.autoApplyTemplateByLeagueId = originalApply;
      return { restored, contrast, styles, silent: silent.leagueThemeUpdateSilent, explicit: explicit.leagueThemeUpdateSilent, afterSilent, afterSettings, afterExplicit, afterSelection };
    });
    assert.deepEqual(results.restored, { leagueId: null, logo: null, warnings: [] });
    assert.deepEqual(results.contrast, Array(5).fill('#000000').concat(Array(4).fill('#ffffff')));
    assert.equal(results.styles.pl.border, 'none');
    assert.equal(results.styles.wc26.border, 'solid');
    assert.equal(results.styles.wc26.borderColor, 'rgb(233, 161, 134)');
    assert.equal(results.styles.rpl.border, 'none');
    assert.equal(results.styles.rpl.background, '');
    assert.equal(results.silent, true); assert.equal(results.explicit, false);
    assert.equal(results.afterSilent, 0); assert.equal(results.afterSettings, 0);
    assert.equal(results.afterExplicit, 1); assert.equal(results.afterSelection, 2);
    console.log('PASS first-run restore, RGB/HEX contrast, exclusive theme styles, silent fixture persistence and popout synchronization');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
