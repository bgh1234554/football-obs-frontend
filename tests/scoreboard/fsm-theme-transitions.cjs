require('../tactics/helpers');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const themes = { default: 'default', pl: 'EPL', cl: 'CL', uel: 'UEL', acle: 'ACLE', unl: 'UNL', er24: 'EURO24', ligue1: 'LIGUE1', seriea: 'SERIEA', kleague: 'KLEAGUE', wc26: 'WC26' };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff' }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.evaluate(() => { state.homeName='맨체스터 시티'; state.awayName='선덜랜드'; render(); fsmBoardRender(); });
    await page.evaluate(() => document.fonts.ready);
    // 모든 테마가 로고 마스크를 쓰는 테마를 드나들어도 로고는 전환 양 끝의 크기 범위를 넘지 않는다.
    const registeredThemes = await page.evaluate(() => Object.keys(FSM_THEMES));
    await page.evaluate(() => {
      const logo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="180" fill="orange"/></svg>');
      state.homeLogo=logo;state.awayLogo=logo;render();
    });
    await page.evaluate(()=>applyTheme('carabao',null));
    await page.waitForFunction(()=>!pendingThemeLink);
    await page.waitForTimeout(1000);
    for (const theme of registeredThemes.filter(theme=>theme!=='carabao')) {
      for (const target of [theme,'carabao']) {
        const samples=await page.evaluate(async target=>{
          const frames=[];
          const measure=()=>[...document.querySelectorAll('.fsm-board .team-logo img')].map(img=>{
            const rect=img.getBoundingClientRect();return {width:rect.width,height:rect.height};
          });
          const first=measure();let running=true;
          const sample=()=>frames.push(measure());
          const tick=()=>{sample();if(running)requestAnimationFrame(tick);};requestAnimationFrame(tick);
          applyTheme(target,null);pendingThemeLink?.addEventListener('fsm-theme-applied',sample,{once:true});
          await new Promise(resolve=>{
            const wait=()=>{
              if(pendingThemeLink){requestAnimationFrame(wait);return;}
              requestAnimationFrame(async()=>{
                const animations=document.querySelector('.fsm-board').getAnimations({subtree:true});
                await Promise.allSettled(animations.filter(animation=>Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation=>animation.finished));
                resolve();
              });
            };wait();
          });
          running=false;const last=measure();return {first,last,frames};
        },target);
        samples.frames.forEach(frame=>frame.forEach((logo,index)=>{
          for(const dimension of ['width','height'])assert(logo[dimension]<=Math.max(samples.first[index][dimension],samples.last[index][dimension])+1,
            `${target}: logo ${index} ${dimension} exceeds settled endpoint sizes`);
        }));
      }
    }
    console.log('PASS logo size bounds across every registered theme, both directions and both teams');
    const failures = [];
    for (const [theme, file] of Object.entries(themes)) {
      // Compare the original theme declarations; widths deliberately follow current layout.
      const oldCss = execFileSync('git', ['show', `5d791aa:css/theme/result_style_${file}.css`], { cwd: root, encoding: 'utf8' });
      const originalTransitions = [...oldCss.matchAll(/([^{}]+)\{[^{}]*transition:\s*([^;]+);[^{}]*\}/g)].map(match => match[1].trim());
      for (const source of ['default', 'pl', 'wc26']) {
        if (source === theme) continue;
        await page.evaluate(source => { document.querySelector('#board').classList.add('fsm-starting'); applyTheme(source, null); fsmBoardRender(); }, source);
        await page.waitForFunction(() => !pendingThemeLink && !document.querySelector('.fsm-starting'));
        await page.evaluate(() => { document.querySelector('#board').classList.remove('fsm-entering'); state.homeScore = 5; state.awayScore = 3; render(); });
        await page.evaluate(theme => applyTheme(theme, null), theme);
        await page.waitForFunction(theme => !pendingThemeLink && document.querySelector('#board').dataset.fsmTheme === theme, theme);
        // Font loading can legitimately change measured glyph widths; audit CSS transitions after fonts settle.
        await page.evaluate(async () => { await document.fonts.ready; fsmBoardRender(); });
        const metrics = await page.evaluate(() => {
          const main = document.querySelector('.scoreboard-main');
          const width = main.offsetWidth;
          const nodes = [...document.querySelectorAll('.team-score, .score-div, .team-logo, .time, .extra-time')];
          return { width, names: [...document.querySelectorAll('.team-name .text')].map(n => ({ text:n.textContent, width:n.scrollWidth, font:getComputedStyle(n).font, animations:n.parentElement.getAnimations().map(a=>a.transitionProperty) })), nodes: nodes.map(node => { const style = getComputedStyle(node); return {
            selector: node.className, background: style.backgroundColor,
            transition: style.transitionProperty, radius: style.borderTopLeftRadius
          }; }) };
        });
        if (source === 'default') await page.screenshot({ path: `screenshots/tests/transition-${theme}-middle.png` });
        await page.waitForTimeout(theme === 'pl' ? 450 : 950);
        const final = await page.evaluate(() => ({ width: document.querySelector('.scoreboard-main').offsetWidth, names:[...document.querySelectorAll('.team-name .text')].map(n=>({text:n.textContent,width:n.scrollWidth,font:getComputedStyle(n).font,animations:n.parentElement.getAnimations().map(a=>a.transitionProperty)})),
          backgrounds: [...document.querySelectorAll('.team-score, .score-div, .team-logo, .time, .extra-time')].map(node => getComputedStyle(node).backgroundColor), backgroundImages: [...document.querySelectorAll('.team-score, .score-div, .team-logo, .time, .extra-time')].map(node => getComputedStyle(node).backgroundImage) }));
        metrics.nodes.forEach((node, index) => {
          // 불투명 그라데이션은 투명한 바탕색을 완전히 덮는다. 투명 이미지·그라데이션은 계속 검사한다.
          const image = final.backgroundImages[index];
          const opaqueGradient = /^(?:linear|radial)-gradient\(/.test(image) && !/rgba\(|hsla\(|transparent/.test(image);
          if (!opaqueGradient && final.backgrounds[index] === 'rgba(0, 0, 0, 0)' && node.background !== final.backgrounds[index]) failures.push(`${source}->${theme}: stale ${node.selector} background ${node.background}`);
          if (!node.transition.includes('border-radius')) failures.push(`${source}->${theme}: missing ${node.selector} border-radius transition`);
        });
        if(metrics.width !== final.width) failures.push(`${source}->${theme}: width moved ${metrics.width}->${final.width} ${JSON.stringify({before:metrics.names,after:final.names})}`);
      }
      console.log('AUDIT', theme, 'original animated selectors:', originalTransitions.join(', '));
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    console.log('PASS all 30 source/target pairs: transparent backgrounds, corner effects and stable widths');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
