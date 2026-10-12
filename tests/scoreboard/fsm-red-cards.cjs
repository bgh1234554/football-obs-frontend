require('../tactics/helpers');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff',
      }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
    const themes = await page.evaluate(() => Object.keys(FSM_THEMES));
    fs.mkdirSync(path.join(root, 'screenshots/red-cards'), { recursive: true });
    for (const theme of themes) {
      await page.evaluate(theme => {
        state.fsmTheme = theme;
        state.redHome = 3; state.redAway = 2;
        autoApplyTemplateByLeagueId(39, null); render();
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(async () => {
        await document.fonts.ready;
        fsmBoardRender();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.waitForTimeout(100);
      const cards = await page.locator('.div-rc .rc-card').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect();
        const team = node.closest('.teams-left, .teams-right').getBoundingClientRect();
        const exposedY = Math.min(r.bottom - 2, team.top - 2);
        return { above: team.top - r.top, visible: exposedY > r.top &&
          document.elementsFromPoint(r.x + r.width / 2, exposedY).some(hit => node.contains(hit)) };
      }));
      await page.locator('#boardStageInner').screenshot({ path: path.join(root, 'screenshots/red-cards', `${theme}.png`) });
      if (!process.env.RC_AUDIT) {
        assert.equal(cards.length, 5);
        assert(cards.every(card => card.above >= 7 && card.visible), `${theme}: cards must be exposed above the team background: ${JSON.stringify(cards)}`);
        await page.evaluate(() => { state.redHome = 0; state.redAway = 0; renderRedCards(); });
        assert.equal(await page.locator('.div-rc:not(.hidden)').count(), 0);
        console.log('PASS', theme, 'home/away cards exposed; zero cards hidden');
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
