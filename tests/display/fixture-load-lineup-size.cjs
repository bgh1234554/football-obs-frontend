const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const entry of ['/', '/schedule']) {
      for (const transientWidth of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1317, height: 811 } });
      await page.addInitScript(() => { window.obsstudio = {}; });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'localhost') return route.abort();
        const file = path.join(root, ['/', '/schedule'].includes(url.pathname) ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
      });
      await page.goto(`http://localhost${entry}`, { waitUntil: 'load' });
      await page.evaluate(transientWidth => {
        if (transientWidth) {
          // 초기 가로 배치가 아직 끝나지 않은 CEF 측정 조건을 모사한다.
          const original = window.getDisplayLayoutRect;
          window.getDisplayLayoutRect = element => {
            const rect = original(element);
            return element.matches('.layout-big .lp-lineup') ? { x: rect.x, y: rect.y, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.left + 2, height: rect.height, width: 2 } : rect;
          };
        }
        const grids = ['1:1', '2:1', '2:2', '2:3', '2:4', '3:1', '3:2', '3:3', '4:1', '4:2', '4:3'];
        const lineup = offset => ({ formation: '4-3-3', coach: { name: '감독' }, startXi: grids.map((grid, i) => ({ id: offset + i, name: `선수 ${i}`, number: i + 1, grid, pos: i ? 'M' : 'G' })), substitutes: [] });
        fetchFixture = async id => ({ matchInfo: { fixtureId: id, status: 'FT', elapsed: 90, homeTeamId: 1, awayTeamId: 2, homeTeamName: '홈', awayTeamName: '원정', homeScore: 5, awayScore: 0 }, homeLineup: lineup(100), awayLineup: lineup(200), events: [], playerStats: [], homeInjuries: [], awayInjuries: [] });
        activatePage('schedule');
        setFixtureId('100');
        document.getElementById('panel-fixture-load-btn').click();
      }, transientWidth);
      await page.waitForTimeout(700);
      const result = await page.evaluate(() => {
        clearPolling();
        const panel = document.querySelector('.layout-big .lp-lineup');
        return { width: panel.getBoundingClientRect().width, height: panel.getBoundingClientRect().height, cachedWidth: panel.dataset.lineupWindowWidth, style: panel.style.cssText, classes: panel.className, players: panel.querySelectorAll('.dp-lineup-node').length };
      });
      assert(result.width > 200, '경기 불러오기 후 선발 라인업 폭 유지');
      assert(Number(result.cachedWidth) > 300, '축소된 측정값을 폭 캐시로 저장하지 않음');
      assert.equal(result.players, 22);
      console.log(`PASS: ${entry}, transient width=${transientWidth}`);
      await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
