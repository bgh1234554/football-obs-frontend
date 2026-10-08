const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);


for(const test of [
 {colors:['FEEA00','F9DE52'],values:[464,421],divider:true},
 {colors:['#FEEA00','#F9DE52'],values:[88,85],divider:true},
 {colors:['rgb(254, 234, 0)','rgb(249, 222, 82)'],values:[3,9],divider:true},
 {colors:['#fff000','#ffe44d'],values:[464,421],divider:true},
 {colors:['rgb(255, 240, 0)','rgb(255, 228, 77)'],values:[88,85],divider:true},
 {colors:['hsl(56, 100%, 50%)','hsl(51, 100%, 65%)'],values:[3,9],divider:true},
 {colors:['yellow','yellow'],values:[6,1],divider:true},
 {colors:['#ff0000','#0000ff'],values:[6,2],divider:false},
 {colors:['#fff000','#ffe44d'],values:[0,0],divider:false},
 {colors:['#fff000','#ffe44d'],values:[0.41,0.41],divider:true}
]) {
 const result=await page.evaluate(test=>{state.colors.homeBg=test.colors[0];state.colors.awayBg=test.colors[1];const row=stCreateRow({label:'Stat',homeVal:test.values[0],awayVal:test.values[1]},{});document.body.append(row);const divider=row.querySelector('.st-bar-divider');const result={divider:!!divider,color:divider?.style.background,left:divider?.style.left,width:divider?.getBoundingClientRect().width};row.remove();return result;},test);
 assert.equal(result.divider,test.divider,JSON.stringify({test,result}));if(test.divider){assert(result.color.startsWith('rgb('));assert(result.width>0);if(test.colors[0].toUpperCase().includes('FEEA00'))assert.equal(result.color,'rgb(1, 21, 255)');}console.log('PASS stat divider',JSON.stringify(test));
}
// 패널 배경과 비슷한 팀 색만 number color 테두리로 구분한다.
const outlines = await page.evaluate(() => {
  state.colors = { ...state.colors, homeBg: '#171513', homeText: '#ffe080', awayBg: '#ffffff', awayText: '#101010' };
  return ['.lp-stat [data-stat-panel]', '.lp-stat-s [data-stat-panel]'].map(selector => {
    const panel = document.querySelector(selector);
    const background = teamPanelBackground(panel);
    const row = stCreateRow({ label: '코너킥', homeVal: 7, awayVal: 6 }, {}, background);
    const tied = stCreateRow({ label: '퇴장', homeVal: 0, awayVal: 0 }, {}, background);
    const read = el => ({ background: el.style.background, outline: el.style.boxShadow });
    return {
      home: read(row.querySelector('.st-bar-home')),
      away: read(row.querySelector('.st-bar-away')),
      label: read(row.querySelector('.st-val-home')),
      plainLabel: read(row.querySelector('.st-val-away')),
      zero: read(tied.querySelector('.st-bar-home')),
      stateColor: state.colors.homeBg,
      bench: (() => {
        const host = document.createElement('div');
        host.style.background = '#0d1321';
        host.innerHTML = '<div data-bench-side="home"><span class="dp-side-name"></span></div>';
        document.body.append(host);
        setSideName(host, 'bench', 'home', 'TEAM', '#171513', '#ffe080');
        const name = host.querySelector('.dp-side-name');
        const outline = name.style.boxShadow;
        setSideName(host, 'bench', 'home', 'TEAM', '#ffffff', '#101010');
        const cleared = name.style.boxShadow;
        host.remove();
        return { outline, cleared };
      })(),
    };
  });
});
for (const result of outlines) {
  assert.equal(result.home.background, 'rgb(23, 21, 19)');
  assert.match(result.home.outline, /rgb\(255, 224, 128\).*inset|inset.*rgb\(255, 224, 128\)/);
  assert.equal(result.label.outline, result.home.outline);
  assert.equal(result.away.outline, '');
  assert.equal(result.plainLabel.outline, '');
  assert.equal(result.zero.outline, '');
  assert.equal(result.stateColor, '#171513');
  assert.match(result.home.outline, /0\.5px/);
  assert.equal(result.bench.outline, result.home.outline);
  assert.equal(result.bench.cleared, '');
}
console.log('PASS stat panel contrast outlines (big/small, original colors, zero values)');
const settingsChecks = await page.evaluate(() => {
  applyStatsPanel({ teamStats: [{ side: 'home', totalShots: 7 }, { side: 'away', totalShots: 6 }] });
  const checks = [];
  for (const [color, alpha] of [['#0b1220', 0], ['#ffffff', 0], ['#171513', 50], ['#808080', 75]]) {
    setSetting('panelColor', color);
    setSetting('panelAlpha', alpha);
    for (const panel of document.querySelectorAll('[data-stat-panel]')) {
      const fill = panel.querySelector('.st-bar-home');
      if (!fill) continue;
      const contrast = teamColorContrastRatio(state.colors.homeBg, teamPanelBackground(panel));
      checks.push({ color, alpha, expected: contrast < TEAM_PANEL_MIN_CONTRAST, actual: !!fill.style.boxShadow });
    }
  }
  return checks;
});
assert(settingsChecks.length >= 8);
for (const check of settingsChecks) assert.equal(check.actual, check.expected, JSON.stringify(check));
console.log('PASS live panelColor/panelAlpha setting changes', settingsChecks.length);
const unexpectedErrors=errors.filter(message=>message !== 'jQuery is not defined');
assert.deepEqual(unexpectedErrors,[],`Unexpected page errors: ${unexpectedErrors.join('\n')}`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
