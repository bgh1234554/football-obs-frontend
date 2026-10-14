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
    for (const theme of themes) for (const scale of [60, 100, 150]) {
      await page.evaluate(({ theme, scale }) => {
        state.fsmTheme = theme;
        state.boardScale = scale;
        state.redHome = 3; state.redAway = 2;
        autoApplyTemplateByLeagueId(39, null); render();
      }, { theme, scale });
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
        const main = node.closest('.scoreboard-main').getBoundingClientRect();
        const home = node.closest('.div-rc').id === 'rcHome';
        const sideCorrect = home ? r.right <= main.x + main.width / 2 : r.left >= main.x + main.width / 2;
        const exposedY = Math.min(r.bottom - 2, team.top - 2);
        return { sideCorrect, above: team.top - r.top, visible: exposedY > r.top &&
          document.elementsFromPoint(r.x + r.width / 2, exposedY).some(hit => node.contains(hit)) };
      }));
      if (scale === 100) await page.locator('#boardStageInner').screenshot({ path: path.join(root, 'screenshots/red-cards', `${theme}.png`) });
      if (!process.env.RC_AUDIT) {
        assert.equal(cards.length, 5);
        assert(cards.every(card => card.above >= (theme === 'czech' ? 13 : 7) * scale / 100 && card.visible && card.sideCorrect), `${theme} ${scale}%: cards must be exposed above their own side: ${JSON.stringify(cards)}`);
        const shapes = await page.locator('.rc-card').evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node);
          return [style.transform, style.borderRadius, style.backgroundColor, node.childElementCount,
            node.firstElementChild?.classList.contains('football-icon-red-card'), node.firstElementChild?.getAttribute('preserveAspectRatio')];
        }));
        assert(shapes.every(shape => JSON.stringify(shape) === JSON.stringify(['none', '0px', 'rgba(0, 0, 0, 0)', 1, true, 'none'])), `${theme}: ${JSON.stringify(shapes)}`);
        if (theme === 'cnl') {
          const anchors = await page.evaluate(() => {
            const main = document.querySelector('.scoreboard-main').getBoundingClientRect();
            const home = document.getElementById('rcHome').getBoundingClientRect();
            const away = document.getElementById('rcAway').getBoundingClientRect();
            return [home.left - main.left, main.right - away.right];
          });
          assert(anchors.every(inset => Math.abs(inset - scale) < .1), `CNL card anchors: ${anchors}`);
        }
        await page.evaluate(() => { state.redHome = 0; state.redAway = 0; renderRedCards(); });
        assert.equal(await page.locator('.div-rc:not(.hidden)').count(), 0);
        console.log('PASS', theme, scale, 'home/away cards exposed; zero cards hidden');
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
