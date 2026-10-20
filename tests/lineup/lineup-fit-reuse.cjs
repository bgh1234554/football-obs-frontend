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

        // 같은 경기 폴링(silent 갱신)으로 라인업을 다시 그려도, 맞추기 전 기본 폭의 라벨이 화면에 그려지면 안 된다.
        // (2026-10-17) 피팅 예약이 두 프레임 뒤로 통합되며 폴링 15초마다 라벨이 한 프레임 2줄로 줄었다 펴졌다.
        // 그리기가 끝난 뒤(rAF 다음 메시지 태스크) 상태만 비교해 실제로 화면에 나온 프레임을 센다.
        const pollFlicker = await page.evaluate(async id => {
          const snap = () => [...document.querySelectorAll('.page.active [data-dp-role="lineup"] .dp-lineup-name')]
            .map(n => { const r = n.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}|${getComputedStyle(n).fontSize}`; }).join(';');
          const before = snap();
          let painted = 0, unfitted = 0, on = true;
          const channel = new MessageChannel();
          channel.port1.onmessage = () => { painted++; if (snap() !== before) unfitted++; if (on) requestAnimationFrame(loop); };
          const loop = () => channel.port2.postMessage(0);
          requestAnimationFrame(loop);
          await fetchAndApplyFixtureData(String(id), { silent: true });
          await new Promise(resolve => setTimeout(resolve, 1500));
          on = false;
          return { painted, unfitted, sameAfter: snap() === before };
        }, fixtureId);
        assert(pollFlicker.painted > 10, `${file} ${pageName}: frames were sampled`);
        assert.equal(pollFlicker.unfitted, 0, `${file} ${pageName}: unfitted lineup names were painted during a silent poll ${JSON.stringify(pollFlicker)}`);
        assert(pollFlicker.sameAfter, `${file} ${pageName}: silent poll changed the fitted lineup names`);

        const result = await page.evaluate(async () => {
          const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
          const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const panel = document.querySelector('.page.active [data-dp-role="lineup"]');
          /** 스타일 속성 순서/표기 차이를 없앤 패널 HTML. */
          const html = (target = panel) => {
            const clone = target.cloneNode(true);
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

          // 페이지 전체의 이동은 이름과 충돌 대상의 상대 배치를 바꾸지 않는다.
          const activePage = panel.closest('.page');
          const transform = activePage.style.transform;
          fits = 0;
          try {
            activePage.style.transform = 'translate(11px, 7px)';
            fitLineupNamePillsIfChanged(panel);
          } finally {
            activePage.style.transform = transform;
          }
          const translationRefits = fits;

          // 2) 팀 컬러만 바뀌면 라벨 DOM을 유지하고 다시 맞추지 않는다.
          fits = 0;
          const firstLabel = panel.querySelector('.dp-lineup-name');
          state.colors.homeBg = '#7a1f5c';
          state.colors.awayBg = '#1f7a3a';
          state.colors.homeText = '#f4e4b2';
          state.colors.awayText = '#e2f0ff';
          // 로고 색상 추출 완료와 같은 순서로 전체 색상 렌더 후 이벤트를 보낸다.
          render();
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

          // 4) 폭 보정 예약 도중 렌더가 들어와도 최종 활성 패널은 한 번만 맞춘다.
          fits = 0;
          scheduleLineupViewportFit();
          await new Promise(resolve => requestAnimationFrame(() => {
            rerenderLineupPanels();
            resolve();
          }));
          await frames();
          await wait(300);
          const singlePassFits = fits;
          const scheduled = html();

          // 5) 모아서 측정한 자연 폭으로도 개별 복제본 측정과 같은 이름 배치가 나와야 한다.
          const batchMeasure = window.measureLineupNameNaturalSizes;
          try {
            window.measureLineupNameNaturalSizes = () => new Map();
            rerenderLineupPanels();
            await frames();
            await wait(300);
          } finally {
            window.measureLineupNameNaturalSizes = batchMeasure;
          }
          const sameAsSequential = scheduled === html();

          // 6) 숨은 패널은 건너뛰되, 페이지 전환 후에는 전체 피팅과 같은 결과를 보여준다.
          const otherPanel = [...document.querySelectorAll('[data-dp-role="lineup"]')].find(el => el !== panel);
          fits = 0;
          fitLineupNamePillsIfChanged(otherPanel);
          const hiddenFits = fits;
          activatePage(panel.closest('.page').id === 'page-main-big' ? 'main-small' : 'main-big');
          await frames();
          await wait(300);
          const activated = html(otherPanel);
          original(otherPanel);
          const sameAfterActivation = activated === html(otherPanel);
          window.fitLineupNamePills = original;
          return { viewportRefits, translationRefits, unchanged, colorRefits, keptDom, colorApplied, sameAsFresh: patched === fresh, singlePassFits, sameAsSequential, hiddenFits, sameAfterActivation };
        });

        const label = `${file} ${pageName}`;
        assert.equal(result.viewportRefits, 0, `${label}: repeated viewport fit refitted`);
        assert.equal(result.translationRefits, 0, `${label}: translated page refitted unchanged lineup`);
        assert.ok(result.unchanged, `${label}: skipped fit changed the DOM`);
        assert.equal(result.colorRefits, 0, `${label}: color-only change refitted names`);
        assert.ok(result.keptDom, `${label}: color-only change replaced lineup DOM`);
        assert.ok(result.colorApplied, `${label}: new team color not applied`);
        assert.ok(result.sameAsFresh, `${label}: color patch differs from a fresh render`);
        assert.equal(result.singlePassFits, 1, `${label}: pending viewport fit and render fitted twice`);
        assert.ok(result.sameAsSequential, `${label}: batch measurements changed name layout`);
        assert.equal(result.hiddenFits, 0, `${label}: hidden panel was fitted`);
        assert.ok(result.sameAfterActivation, `${label}: page activation differs from full fitting`);
        assert.deepEqual(errors, [], `${label}: page errors`);
        await page.close();
      }
    }
    console.log('PASS: lineup name fit reuse (same DOM/size skip, color-only patch keeps DOM and matches a fresh render) for 2 fixtures x 2 pages');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
