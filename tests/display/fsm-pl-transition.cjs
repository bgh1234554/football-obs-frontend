const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const revision of ['old', 'current']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://localhost') return route.abort();
        const relative = url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname.slice(1));
        const file = path.join(root, relative);
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
        const compareCss = revision === 'old' && ['css/core/fsm-board.css', 'css/theme/result_style_EPL.css'].includes(relative);
        const body = compareCss ? execFileSync('git', ['show', `5d791aa:${relative}`], { cwd: root }) : fs.readFileSync(file);
        return route.fulfill({ body, contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream' });
      });
      await page.goto('http://localhost/');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        state.homeName = '맨체스터 시티'; state.awayName = '선덜랜드';
        state.homeScore = 5; state.awayScore = 3;
        state.colors.homeBg = '#6cabdd'; state.colors.awayBg = '#ffffff';
        render(); fsmBoardRender();
      });
      await page.waitForTimeout(1000);
      await page.evaluate(() => applyTheme('pl', null));
      await page.waitForFunction(() => !pendingThemeLink);
      for (const delay of [0, 80, 120, 250]) {
        if (delay) await page.waitForTimeout(delay);
        const backgrounds = await page.locator('.team-score, .score-div').evaluateAll(nodes => nodes.map(node => ({
          background: getComputedStyle(node).backgroundColor,
          transitions: getComputedStyle(node).transitionProperty,
          animations: node.getAnimations().map(a => a.transitionProperty)
        })));
        if (revision === 'current' && delay === 0) {
          assert(backgrounds[0].animations.includes('font-size'), 'Restore the original score size transition');
          assert(backgrounds[0].animations.includes('margin-top'), 'Restore the original score movement');
        }
        await page.screenshot({ path: `tests/display/pl-${revision}-${delay}.png` });
        if (revision === 'current') backgrounds.forEach(value => assert.equal(value.background, 'rgba(0, 0, 0, 0)'));
      }
      console.log('PASS', revision, 'EPL transition frames; current score and logo backgrounds stay transparent');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
