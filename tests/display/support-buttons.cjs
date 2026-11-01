const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { settle } = require('../tactics/helpers');
const root = path.resolve(__dirname, '../..');

// 외부 서비스의 가용성과 무관하게 공식 임베드의 DOM·기본 크기 계약을 재현한다.
const buttonScript = `document.writeln('<style>.bmc-btn{min-width:210px;height:60px;padding:0 24px;box-sizing:border-box;display:inline-flex;align-items:center;font:28px Cookie,cursive!important;background:#5f7fff;color:white}.bmc-btn-text{width:100%;flex-shrink:0;font-family:Cookie,cursive!important;white-space:nowrap}</style><div class="bmc-btn-container"><a class="bmc-btn" href="https://buymeacoffee.com/bgh1234554" target="_blank">☕<span class="bmc-btn-text">후원하기</span></a></div>');`;

async function openColdPage(browser, dpr = 1) {
  const page = await browser.newPage({ viewport: { width: Math.round(1920 / dpr), height: Math.round(1080 / dpr) }, deviceScaleFactor: dpr });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js') {
      // 파서가 외부 스크립트를 기다리는 최초 로딩도 검사한다.
      await new Promise(resolve => setTimeout(resolve, 150));
      return route.fulfill({ contentType: 'application/javascript', body: buttonScript });
    }
    if (url.hostname !== 'localhost') return route.abort();
    const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json',
    }[path.extname(file)] || 'application/octet-stream' });
  });
  await page.goto('http://localhost/', { waitUntil: 'load' });
  return page;
}

async function assertFits(page, selector) {
  const result = await page.locator(selector).evaluate(host => {
    const button = host.querySelector('.bmc-btn');
    const a = button.getBoundingClientRect(), b = host.getBoundingClientRect();
    return { visibility: getComputedStyle(button).visibility,
      font: getComputedStyle(button.querySelector('.bmc-btn-text')).fontFamily,
      text: button.textContent, href: button.href,
      fits: a.width > 0 && a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1 };
  });
  assert(result.visibility === 'visible' && result.fits, JSON.stringify(result));
  assert(result.text.includes('후원하기'));
  assert.equal(result.href, 'https://buymeacoffee.com/bgh1234554');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // 새로운 문서와 새로고침 모두 검사한다. 경기 로딩이 버튼 복구 조건이 되면 안 된다.
    const page = await openColdPage(browser);
    assert.equal(await page.locator('.support-button .bmc-btn').count(), 4);
    const data = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/1637598-lineup.json'), 'utf8'));
    data.teamStats = [{ side: 'home', totalShots: 4 }, { side: 'away', totalShots: 2 }];
    data.matchInfo.homeTeamId ||= 1;
    data.matchInfo.awayTeamId ||= 2;
    for (const reload of [false, true]) {
      if (reload) await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => activatePage('main-small'));
      await settle(page);
      await assertFits(page, '.lp-stat-s .support-button');
      await page.evaluate(async data => {
        clearPolling(); fetchFixture = async () => structuredClone(data);
        await fetchAndApplyFixtureData(data.matchInfo.fixtureId, { silent: true }); clearPolling();
      }, data);
      await settle(page);
      await assertFits(page, '.lp-stat-s .support-button');
      await page.evaluate(() => {
        // 이 검사는 상대전적 네트워크 응답이 아니라 조회 가능한 패널 전환을 대상으로 한다.
        window.hthHasMatchesForFixture = () => true;
        window.hthCanLoadForFixture = () => true;
        window.hthCurrentDataIsFresh = () => true;
        window.hthEnsureLoadedForFixture = async () => {};
        window.teamFixturesEnsure = async () => {};
        activatePage('main-big');
      });
      for (const auto of ['off', 'on']) for (const mode of ['stats', 'match_info', 'hth', 'fixtures']) {
        await page.evaluate(({ auto, mode }) => {
          setSetting('statCycleAuto', auto); _lpStatCycle.paused = true;
          _lpStatCycle.mode = mode; lpStatUpdateVisibility();
        }, { auto, mode });
        await settle(page);
        assert.equal(await page.evaluate(() => _lpStatCycle.mode), mode);
        await assertFits(page, '.lp-stat .support-button');
      }
      for (const view of ['tactics', 'schedule', 'main-small', 'tactics', 'schedule']) {
        await page.evaluate(view => activatePage(view), view);
        await settle(page);
        const selector = view === 'tactics' ? '.tactics-support-button'
          : view === 'schedule' ? '.schedule-support-button' : '.lp-stat-s .support-button';
        await assertFits(page, selector);
      }
    }
    await page.evaluate(() => document.documentElement.style.setProperty('--font-family', 'Arial, sans-serif'));
    assert((await page.locator('.schedule-support-button .bmc-btn-text').evaluate(el => getComputedStyle(el).fontFamily)).includes('Arial'));
    // 설명은 제목과 같은 그룹에 있고, 버튼과 별도 영역을 사용한다.
    assert.equal(await page.locator('.standings-header-title .hint').count(), 1);
    for (const width of [1280, 960]) {
      await page.setViewportSize({ width, height: 960 }); await settle(page);
      await assertFits(page, '.schedule-support-button');
    }
    for (const dpr of [1.5, 2]) {
      const scaledPage = await openColdPage(browser, dpr);
      for (const view of ['main-small', 'schedule', 'tactics']) {
        await scaledPage.evaluate(view => activatePage(view), view); await settle(scaledPage);
        await assertFits(scaledPage, view === 'main-small' ? '.lp-stat-s .support-button'
          : view === 'schedule' ? '.schedule-support-button' : '.tactics-support-button');
      }
      await scaledPage.close();
    }
    console.log('PASS support buttons: cold load, fixture load, reload, hidden page restoration, resizing and site font');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
