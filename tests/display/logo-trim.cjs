/**
 * 로고 자동 여백 보정의 브라우저 회귀 테스트.
 * 실행: node tests/display/logo-trim.cjs (Playwright와 테스트용 Chromium 설치 필요).
 * 실제 Canvas·CSS·localStorage를 사용해 별 보존, 경계 정렬, 캐시 수명, 실패 시 원본 표시를 검증한다.
 * 외부 서비스 대신 요청 가로채기로 고정 이미지를 제공하므로 네트워크 상태에 의존하지 않는다.
 * 마지막에는 실제 대시보드를 로드해 홈·원정 로고 연결과 스크립트 오류 유무를 확인한다.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
// 별도 작업 폴더에서 테스트할 때 수정하지 않은 대시보드 자원은 지정한 프런트엔드 경로에서 읽는다.
const fallback = process.env.LOGO_TRIM_FRONTEND_ROOT || root;
const prefix = 'football-obs:logo-trim:v5:';
const ttl = 30 * 86400000;
const url = 'http://localhost/logo.png';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="30" y="40" width="40" height="45" fill="blue"/><path d="M80 10L82 14L87 14L83 17L85 22L80 19L75 22L77 17L73 14L78 14Z" fill="gold"/></svg>';
const near = (a, b) => assert(Math.abs(a - b) < 0.05, `${a} != ${b}`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 응답을 지연시킨 로고를 준비해, 로고 교체 뒤 도착하는 이전 분석 결과를 검증한다.
    let slowRelease;
    const slow = new Promise(resolve => { slowRelease = resolve; });
    let png;
    await page.route('**/*', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.hostname === 'no-cors.test') {
        // 현재 페이지와 다른 출처만 허용한다. 일반 img 표시는 가능하지만 픽셀 분석은 실패해야 한다.
        return route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': 'http://different.test' }, body: svg });
      }
      if (requestUrl.hostname !== 'localhost') return route.abort();
      if (requestUrl.pathname === '/logo.png') return route.fulfill({ contentType: 'image/png', body: png });
      if (requestUrl.pathname === '/slow.svg') {
        await slow;
        return route.fulfill({ contentType: 'image/svg+xml', body: svg });
      }
      if (requestUrl.pathname === '/logo.svg') return route.fulfill({ contentType: 'image/svg+xml', body: svg });
      const shapes = {
        '/empty.svg': '',
        '/opaque.svg': '<rect width="100" height="100" fill="blue"/>',
        '/tall.svg': '<rect x="40" width="20" height="100" fill="blue"/>',
      };
      if (Object.hasOwn(shapes, requestUrl.pathname)) return route.fulfill({ contentType: 'image/svg+xml', body:
        `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${shapes[requestUrl.pathname]}</svg>` });
      // 대시보드의 실제 로고 CSS를 쓰는 최소 화면으로 좌표와 배율을 정밀하게 확인한다.
      if (requestUrl.pathname === '/harness') return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <link rel="stylesheet" href="/css/core/board.css">
        <style>.hidden{display:none}.board{width:500px;--home-logo-x:0px;--home-logo-y:0px;--home-logo-scale:1;--away-logo-x:0px;--away-logo-y:0px;--away-logo-scale:1}</style>
        <div class="board"><div id="homeCard"><div class="logo-box"><img id="homeLogo" class="logo-img"></div></div>
        <div id="awayCard"><div class="logo-box"><img id="awayLogo" class="logo-img"></div></div></div>
        <script src="/js/core/logo-fill-exceptions.js"></script>
        <script src="/js/core/logo-trim.js"></script>` });
      const relative = decodeURIComponent(requestUrl.pathname === '/' ? '/overlay_dashboard.html' : requestUrl.pathname).slice(1);
      let file = path.join(root, relative);
      if (!fs.existsSync(file)) file = path.join(fallback, relative);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'text/plain' });
    });
    await page.goto('http://localhost/harness');
    png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'blue'; ctx.fillRect(30, 40, 40, 45);
      ctx.fillStyle = 'gold'; ctx.fillRect(80, 10, 5, 5); // 본체와 떨어진 별·장식에 해당하는 픽셀
      const pixel = ctx.createImageData(1, 1);
      pixel.data.set([255, 255, 255, 1]);
      ctx.putImageData(pixel, 10, 20); // 알파값 1/255인 희미한 가장자리도 경계에 포함되어야 한다.
      return canvas.toDataURL().split(',')[1];
    }), 'base64');
    const render = source => page.evaluate(source => {
      LogoTrim.render(document.getElementById('homeLogo'), source);
    }, source);
    const ready = () => page.waitForFunction(() => document.getElementById('homeLogo').classList.contains('logo-trimmed'));
    await render(url);
    await ready();
    // 네 경계가 장식과 희미한 픽셀까지 감싸며, 저장 시점 기준 30일 TTL을 갖는지 확인한다.
    const record = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + url);
    assert.deepEqual(record.bounds, { left: 30, top: 10, right: 85, bottom: 85, width: 100, height: 100 });
    assert(Math.abs(record.expiresAt - Date.now() - ttl) < 10000);
    console.log('PASS: detached ornaments remain; near-transparent pixels are ignored; 30-day TTL');

    // 경계 [30, 85)의 중심은 57.5, 안전 여백을 더한 [29, 86)의 너비는 57이다.
    // 원본 100픽셀 기준 비율로 화면 좌표를 환산해, 비대칭 그림의 실제 중심과 표시 크기를 측정한다.
    const measure = () => page.evaluate(() => {
      const img = document.getElementById('homeLogo');
      const r = img.getBoundingClientRect(), box = img.parentElement.getBoundingClientRect();
      return { x: r.x + r.width * .575 - (box.x + box.width / 2),
        y: r.y + r.height * .475 - (box.y + box.height / 2), size: r.width * .57,
        src: img.getAttribute('src') };
    });
    let m = await measure();
    near(m.x, 0); near(m.y, 0); assert(m.size > 30); assert.equal(m.src, url);
    const initialSize = m.size;
    await page.evaluate(() => {
      const board = document.querySelector('.board');
      board.style.setProperty('--home-logo-scale', '2');
      board.style.setProperty('--home-logo-x', '7px');
      board.style.setProperty('--home-logo-y', '-3px');
    });
    m = await measure(); near(m.x, 7); near(m.y, -3); near(m.size, initialSize * 2);
    console.log('PASS: asymmetric bounds centre correctly and preserve manual scale/offset');

    // 새로고침으로 모듈 메모리를 비운 뒤 Canvas 호출 횟수가 0인지 확인한다.
    // localStorage의 유효한 좌표가 재분석 없이 재사용되어야 한다.
    await page.reload();
    await page.evaluate(() => {
      window.draws = 0;
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) { window.draws++; return original.apply(this, args); };
    });
    await render(url); await ready();
    assert.equal(await page.evaluate(() => window.draws), 0);
    // 저장소의 만료 시각을 과거로 바꾸고 다시 로드하면 새 만료 시각과 좌표가 저장되어야 한다.
    await page.evaluate(key => {
      const cached = JSON.parse(localStorage.getItem(key));
      cached.expiresAt = Date.now() - 1;
      localStorage.setItem(key, JSON.stringify(cached));
    }, prefix + url);
    await page.reload();
    await render(url); await ready();
    const fresh = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + url);
    assert(fresh.expiresAt > Date.now()); assert.deepEqual(fresh.bounds, record.bounds);
    console.log('PASS: reload reuses cache; expired bounds are analysed again');

    // SVG에서도 본체 위의 별이 경계에 포함되고 src가 원본 SVG로 유지되는지 확인한다.
    await render('http://localhost/logo.svg'); await ready();
    const vector = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + 'http://localhost/logo.svg');
    assert(vector.bounds.top <= 103 && vector.bounds.right >= 870);
    assert.equal(await page.locator('#homeLogo').getAttribute('src'), 'http://localhost/logo.svg');
    console.log('PASS: SVG star is included and original vector source is retained');

    // 느린 SVG에서 PNG로 바꾼 뒤 SVG 응답을 풀어도 현재 PNG의 좌표가 덮어써지면 안 된다.
    await render('http://localhost/slow.svg');
    await render(url); await ready(); slowRelease();
    await page.waitForFunction(key => localStorage.getItem(key), prefix + 'http://localhost/slow.svg');
    assert.equal(await page.locator('#homeLogo').getAttribute('src'), url);
    near((await measure()).size, initialSize);
    await render('');
    assert.equal(await page.locator('#homeLogo').getAttribute('src'), null);
    assert(!(await page.locator('#homeLogo').getAttribute('class')).includes('logo-trimmed'));
    console.log('PASS: stale responses cannot alter a replacement logo; clearing resets layout');

    // 픽셀 분석이 CORS로 차단되어도 원본 로고가 보이고, 실패가 영구 캐시로 저장되지 않아야 한다.
    await render('http://no-cors.test/logo.svg');
    await page.waitForFunction(() => document.getElementById('homeLogo').complete);
    assert(!(await page.locator('#homeLogo').getAttribute('class')).includes('logo-trimmed'));
    assert.equal(await page.evaluate(() => document.getElementById('homeLogo').naturalWidth), 100);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), prefix + 'http://no-cors.test/logo.svg'), null);
    console.log('PASS: CORS failure keeps the original visible');

    // 빈 이미지·여백 없는 이미지는 보정하지 않고, 양옆 여백만 있는 세로형은 높이를 유지한다.
    for (const name of ['empty', 'opaque', 'tall']) {
      const source = `http://localhost/${name}.svg`;
      await render(source);
      await page.waitForFunction(key => localStorage.getItem(key), prefix + source);
      if (name === 'tall') {
        await ready();
        const height = await page.locator('#homeLogo').evaluate(img => img.getBoundingClientRect().height);
        near(height, 48);
      } else {
        assert(!(await page.locator('#homeLogo').getAttribute('class')).includes('logo-trimmed'));
      }
    }
    console.log('PASS: empty/opaque images stay unchanged; side-only whitespace does not enlarge tall logos');

    // 손상된 JSON은 무시하고 재분석한다. 오래 열린 페이지의 메모리 캐시도 TTL을 적용해야 한다.
    await page.evaluate(key => localStorage.setItem(key, '{invalid json'), prefix + url);
    await page.reload();
    await render(url); await ready();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).bounds, prefix + url), record.bounds);
    await page.evaluate(() => {
      const now = Date.now();
      Date.now = () => now + 31 * 86400000;
      LogoTrim.render(document.getElementById('homeLogo'), 'http://localhost/logo.png');
    });
    await ready();
    const future = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + url);
    assert(future.expiresAt > Date.now() + 60 * 86400000);
    console.log('PASS: corrupted cache recovers; a long-open page also expires its memory cache');

    await page.reload();
    await page.evaluate(() => {
      // 브라우저의 저장소 접근 제한을 재현한다. 캐시 저장 실패가 로고 표시 실패로 이어지면 안 된다.
      Storage.prototype.getItem = Storage.prototype.setItem = Storage.prototype.removeItem = () => { throw new Error('storage blocked'); };
    });
    await render(url); await ready();
    console.log('PASS: storage unavailable still permits trim');

    // 최소 테스트 화면에서 끝내지 않고 실제 render 함수와 양쪽 로고의 연결도 확인한다.
    await page.goto('http://localhost/');
    await page.evaluate(url => { state.homeLogo = url; state.awayLogo = url; render(); }, url);
    await ready();
    await page.waitForFunction(() => document.getElementById('awayLogo').classList.contains('logo-trimmed'));
    assert.deepEqual(errors, []);
    const screenshotPath = process.env.LOGO_TRIM_SCREENSHOT || path.join(root, 'screenshots', 'logo-trim.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('PASS: actual dashboard renders both trimmed logos without script errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
