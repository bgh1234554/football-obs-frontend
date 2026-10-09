const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





await page.evaluate(()=>{setSetting('statCycleAuto','off');activatePage('main-big');const data={matchInfo:{homeTeamName:'Home',awayTeamName:'Away'},homeInjuries:[{playerId:991,name:'Tom Cairney',reason:'Knee Injury',type:'Questionable'}],awayInjuries:[]};renderInjuryPanel(data,data);renderInjuryCyclePanel(data,data);});
await page.evaluate(()=>document.fonts.ready);
const visibleReasons = await page.evaluate(() => ['[data-injury-cycle-panel]', '#injuryPanel'].map(selector => {
  const label = document.querySelector(selector).querySelector('.dp-item-name');
  return { text: label.querySelector('.ic-reason').textContent, tooltip: label.title, detailed: getInjuryReasonDisplayText('Knee Injury', 'Questionable') };
}));
for (const reason of visibleReasons) { assert.equal(reason.text, '무릎 부상'); assert.equal(reason.tooltip, reason.detailed); assert.notEqual(reason.tooltip, reason.text); }
    for (const [mode, selector] of [['main-big', '[data-injury-cycle-panel]'], ['main-small', '#injuryPanel']]) {
      const sizing = await page.evaluate(({ mode, selector }) => {
        activatePage(mode); _lpStatCycle.mode = 'injuries'; lpStatUpdateVisibility();
        const panel = document.querySelector(selector), label = panel.querySelector('.dp-item-name'), reason = label.querySelector('.ic-reason');
        const nameSize = getComputedStyle(label).fontSize;
        label.style.flex = '0 0 auto'; label.style.width = '400px'; fitInjuryReasons(panel);
        const base = parseFloat(getComputedStyle(reason).fontSize);
        label.style.width = '1px'; reason.style.fontSize = '8px';
        const narrow = label.scrollWidth;
        reason.style.fontSize = `${base}px`;
        const wide = label.scrollWidth;
        label.style.width = `${Math.floor((wide + narrow) / 2)}px`; fitInjuryReasons(panel);
        const shrunk = { font: parseFloat(getComputedStyle(reason).fontSize), fits: label.scrollWidth <= label.clientWidth, name: getComputedStyle(label).fontSize };
        label.style.width = '400px'; fitInjuryReasons(panel);
        const restored = parseFloat(getComputedStyle(reason).fontSize);
        reason.textContent = 'A very long unknown injury reason '.repeat(8);
        label.style.width = '120px'; fitInjuryReasons(panel);
        return { base, shrunk, restored, nameSize, fallback: label.classList.contains('ic-reason-wrap'), minimum: parseFloat(getComputedStyle(reason).fontSize) };
      }, { mode, selector });
      assert(sizing.shrunk.font < sizing.base && sizing.shrunk.font >= 8, JSON.stringify(sizing));
      assert(sizing.shrunk.fits); assert.equal(sizing.shrunk.name, sizing.nameSize);
      assert.equal(sizing.restored, sizing.base); assert(sizing.fallback); assert.equal(sizing.minimum, sizing.base);

      // 최소 크기로도 한 줄에 못 들어가는 사유는 기본 크기의 두 줄로 표시한다.
      const twoLines = await page.evaluate(selector => {
        const panel = document.querySelector(selector), label = panel.querySelector('.dp-item-name'), reason = label.querySelector('.ic-reason');
        label.firstChild.textContent = 'Tom Cairney ';
        reason.textContent = '\uCD9C\uC804 \uC5EC\uBD80 \uBBF8\uC815 - \uCD9C\uC804 \uBD88\uAC00';
        label.style.width = '150px'; fitInjuryReasons(panel);
        return { font: parseFloat(getComputedStyle(reason).fontSize), lines: Math.round(label.clientHeight / parseFloat(getComputedStyle(label).lineHeight)), wrap: label.classList.contains('ic-reason-wrap'), display: getComputedStyle(reason).display };
      }, selector);
      assert.equal(twoLines.font, sizing.base); assert.equal(twoLines.lines, 2); assert(twoLines.wrap); assert.equal(twoLines.display, 'block');
      if (process.argv.includes('--screenshot')) {
        const folder = path.join(root, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
        await page.locator(selector).screenshot({ path: path.join(folder, `injury-reason-newline-${mode}.png`) });
      }

      const wrapped = await page.evaluate(selector => {
        const panel = document.querySelector(selector), label = panel.querySelector('.dp-item-name'), reason = label.querySelector('.ic-reason');
        label.firstChild.textContent = 'Noah Chidiebere Junior Anyanwu Ohio ';
        reason.textContent = '\uBB34\uB98E \uBD80\uC0C1'; reason.style.removeProperty('font-size');
        const base = parseFloat(getComputedStyle(reason).fontSize);
        const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
        const cases = {};
        for (const reasonText of ['Knee injury', 'Recovering from knee injury', 'Recovering from a serious injury']) {
          reason.textContent = reasonText;
          for (let width = 80; width <= 400; width++) {
            label.classList.remove('ic-reason-newline');
            label.style.width = `${width}px`; label.classList.add('ic-reason-wrap');
            reason.style.display = 'none'; const nameHeight = label.clientHeight; reason.style.display = '';
            if (Math.round(nameHeight / lineHeight) !== 2) continue;
            reason.style.fontSize = `${base}px`; const fullHeight = label.clientHeight;
            reason.style.fontSize = '8px'; const minHeight = label.clientHeight;
            const key = fullHeight <= nameHeight + 1 ? 'sameLines' : minHeight <= nameHeight + 1 ? 'extraLine' : null;
            if (!key || cases[key]) continue;
            fitInjuryReasons(panel);
            cases[key] = {base, font:parseFloat(getComputedStyle(reason).fontSize),height:label.clientHeight,nameHeight,nameSize:getComputedStyle(label).fontSize};
          }
        }
        label.style.width = '600px'; fitInjuryReasons(panel);
        return {cases,restored:parseFloat(getComputedStyle(reason).fontSize),base};
      }, selector);
      assert(wrapped.cases.sameLines, JSON.stringify(wrapped));
      assert.equal(wrapped.cases.sameLines.font, wrapped.base);
      assert(wrapped.cases.extraLine, JSON.stringify(wrapped));
      assert(wrapped.cases.extraLine.font < wrapped.base && wrapped.cases.extraLine.font >= 8);
      assert(wrapped.cases.extraLine.height <= wrapped.cases.extraLine.nameHeight + 1);
      assert.equal(wrapped.cases.sameLines.nameSize, sizing.nameSize);
      assert.equal(wrapped.restored, wrapped.base);
    }

console.log('PASS injury reason fitting: single-line shrink, wrapped-name base size, extra-line shrink and restore in big/small layouts');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
