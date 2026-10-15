const assert = require('node:assert/strict');
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
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff'
      }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.evaluate(() => document.fonts.ready);
    for (const scale of [60, 100, 150, 200]) {
      for (const position of ['left', 'center', 'right']) {
        for (const aggregate of [false, true]) {
          await page.evaluate(({ scale, position, aggregate }) => {
            state.boardScale = scale; state.boardPosition = position; state.aggEnabled = aggregate;
            state.fsmTheme = 'cnl'; autoApplyTemplateByLeagueId(536, null); render();
          }, { scale, position, aggregate });
          await page.waitForFunction(() => !pendingThemeLink && _currentTheme === 'cnl');
          await page.waitForFunction(() => document.querySelectorAll('.cnl-curve').length === 2);
          assert(await page.locator('.cnl-curve').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'block')));
          await page.evaluate(() => {
            state.fsmTheme = 'concacafcc'; autoApplyTemplateByLeagueId(16, null); render();
          });
          await page.waitForFunction(() => !pendingThemeLink && _currentTheme === 'concacafcc');
          // 전환 시작·중간·종료에 양쪽 원호가 DOM에서 사라지고 팀컬러 칸은 유지되는지 확인합니다.
          for (const delay of [0, 100, 850]) {
            if (delay) await page.waitForTimeout(delay);
            assert.equal(await page.locator('.cnl-curve').count(), 0, `${scale}/${position}/${aggregate}`);
            assert(await page.locator('#homeColor, #awayColor').evaluateAll(nodes => nodes.every(node => {
              const style = getComputedStyle(node);
              return style.width === '8px' && style.height === '48px';
            })));
          }
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS CNL -> Champions Cup -> CNL: curve cleanup and recreation, live transitions, 4 scales, 3 positions, aggregate on/off');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
