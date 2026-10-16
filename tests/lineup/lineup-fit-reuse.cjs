// 실행: node tests/lineup/lineup-fit-reuse.cjs
// 라인업 이름 피팅 재사용 계약: 같은 DOM/같은 크기에서는 다시 맞추지 않고, 팀 컬러만 바뀌면
// DOM을 유지한 채 색만 바꾸며, 그 결과는 처음부터 다시 그려 맞춘 결과와 같아야 한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const fixtureFiles = ['juveparma.json', 'womensleague.json'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const file of fixtureFiles) {
      for (const pageName of ['main-big', 'main-small']) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.hostname === 'football-obs-backend.onrender.com' && url.pathname.startsWith('/api/fixtures/')) {
            return route.fulfill({ body: fs.readFileSync(path.join(root, 'json', file)), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
          }
          if (url.hostname !== 'localhost') return route.abort();
          const local = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
          if (!fs.existsSync(local)) return route.fulfill({ status: 404, body: '' });
          return route.fulfill({ body: fs.readFileSync(local), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(local)] || 'application/octet-stream' });
        });
        await page.goto('http://localhost/', { waitUntil: 'load' });
        await page.evaluate(name => activatePage(name), pageName);
        const fixtureId = JSON.parse(fs.readFileSync(path.join(root, 'json', file), 'utf8').replace(/^﻿/, '')).matchInfo.fixtureId;
        await page.evaluate(id => fetchAndApplyFixtureData(String(id)), fixtureId);
        await page.waitForTimeout(2500);

        const result = await page.evaluate(async () => {
          const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
          const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const panel = document.querySelector('.page.active [data-dp-role="lineup"]');
          /** 스타일 속성 순서/표기 차이를 없앤 패널 HTML. */
          const html = () => {
            const clone = panel.cloneNode(true);
            clone.querySelectorAll('[style]').forEach(el => {
              const parts = [];
              for (let i = 0; i < el.style.length; i += 1) parts.push(`${el.style[i]}:${el.style.getPropertyValue(el.style[i])}`);
              el.setAttribute('style', parts.sort().join(';'));
            });
            return clone.innerHTML.replace(/<([a-z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*>/g, (m, tag, attrs) =>
              `<${tag} ${(attrs.match(/[\w:-]+(?:="[^"]*")?/g) || []).sort().join(' ')}>`);
          };
          let fits = 0;
          const original = window.fitLineupNamePills;
          window.fitLineupNamePills = function (...args) { fits += 1; return original.apply(this, args); };

          // 1) 같은 DOM/같은 크기에서 화면 폭 재계산 경로가 돌아도 다시 맞추지 않는다.
          const before = html();
          document.dispatchEvent(new Event('page:activated'));
          await frames();
          await wait(300);
          const viewportRefits = fits;
          const unchanged = html() === before;

          // 2) 팀 컬러만 바뀌면 라벨 DOM을 유지하고 다시 맞추지 않는다.
          fits = 0;
          const firstLabel = panel.querySelector('.dp-lineup-name');
          state.colors.homeBg = '#7a1f5c';
          state.colors.awayBg = '#1f7a3a';
          document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key: 'homeBg' } }));
          await frames();
          await wait(300);
          const colorRefits = fits;
          const keptDom = panel.querySelector('.dp-lineup-name') === firstLabel;
          const colorApplied = panel.innerHTML.includes('#7a1f5c') || panel.innerHTML.includes('122, 31, 92');
          const patched = html();

          // 3) 같은 색으로 처음부터 다시 그려 맞춘 결과와 같아야 한다.
          rerenderLineupPanels();
          await frames();
          await wait(300);
          const fresh = html();
          window.fitLineupNamePills = original;
          return { viewportRefits, unchanged, colorRefits, keptDom, colorApplied, sameAsFresh: patched === fresh };
        });

        const label = `${file} ${pageName}`;
        assert.equal(result.viewportRefits, 0, `${label}: repeated viewport fit refitted`);
        assert.ok(result.unchanged, `${label}: skipped fit changed the DOM`);
        assert.equal(result.colorRefits, 0, `${label}: color-only change refitted names`);
        assert.ok(result.keptDom, `${label}: color-only change replaced lineup DOM`);
        assert.ok(result.colorApplied, `${label}: new team color not applied`);
        assert.ok(result.sameAsFresh, `${label}: color patch differs from a fresh render`);
        assert.deepEqual(errors, [], `${label}: page errors`);
        await page.close();
      }
    }
    console.log('PASS: lineup name fit reuse (same DOM/size skip, color-only patch keeps DOM and matches a fresh render) for 2 fixtures x 2 pages');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
