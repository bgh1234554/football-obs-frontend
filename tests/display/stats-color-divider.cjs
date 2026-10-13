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
const panelPalette = [
  ['black/dark panel', '#000000', '#0b1220', true],
  ['dark brown/dark panel', '#171513', '#0b1220', true],
  ['navy/dark panel', '#18244b', '#0b1220', true],
  ['dark blue/dark panel', '#000040', '#0b1220', true],
  ['Atalanta-like blue/dark panel', '#0055aa', '#0b1220', false],
  ['royal blue/dark panel', '#0057b8', '#0b1220', false],
  ['same blue background', '#0055aa', '#0055aa', true],
  ['red/dark panel', '#ff0000', '#0b1220', false],
  ['gray/dark panel', '#404040', '#0b1220', false],
  ['white/dark panel', '#ffffff', '#0b1220', false],
  ['white/white panel', '#ffffff', '#ffffff', true],
  ['near white/white panel', '#eeeeee', '#ffffff', true],
  ['blue/white panel', '#0055aa', '#ffffff', false],
  ['near gray/gray panel', '#888888', '#808080', true],
  ['blue/gray panel', '#0055aa', '#808080', false],
];
for (const [name, color, background, expected] of panelPalette) {
  const result = await page.evaluate(({ color, background }) => {
    const node = document.createElement('div');
    teamOutlineLowContrast(node, color, '#ffffff', background);
    return { outline: !!node.style.boxShadow, metrics: teamPanelColorMetrics(color, background) };
  }, { color, background });
  assert.equal(result.outline, expected, JSON.stringify({ name, result }));
}
console.log('PASS perceptual panel palette', panelPalette.length);
const settingsChecks = await page.evaluate(() => {
  applyStatsPanel({ teamStats: [{ side: 'home', totalShots: 7 }, { side: 'away', totalShots: 6 }] });
  const checks = [];
  for (const [color, alpha] of [['#0b1220', 0], ['#ffffff', 0], ['#171513', 50], ['#808080', 75]]) {
    setSetting('panelColor', color);
    setSetting('panelAlpha', alpha);
    for (const panel of document.querySelectorAll('[data-stat-panel]')) {
      const fill = panel.querySelector('.st-bar-home');
      if (!fill) continue;
      const expected = teamColorBlendsIntoPanel(state.colors.homeBg, teamPanelBackground(panel));
      checks.push({ color, alpha, expected, actual: !!fill.style.boxShadow });
    }
  }
  return checks;
});
assert(settingsChecks.length >= 8);
for (const check of settingsChecks) assert.equal(check.actual, check.expected, JSON.stringify(check));
console.log('PASS live panelColor/panelAlpha setting changes', settingsChecks.length);
const hthChecks = await page.evaluate(() => {
  const fixture = { matchInfo: { homeTeamId: 1, awayTeamId: 2 } };
  const matches = [
    { homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1 },
    { homeTeamId: 2, awayTeamId: 1, homeScore: 1, awayScore: 2 },
    { homeTeamId: 1, awayTeamId: 2, homeScore: 1, awayScore: 1 },
    { homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1 },
  ];
  setSetting('panelColor', '#0b1220');
  setSetting('panelAlpha', 0);
  applyHthPanel({ matches }, fixture);
  const read = () => [...document.querySelector('[data-hth-panel]').querySelectorAll('.hth-bar')].map(el => el.style.boxShadow);
  const dark = read();
  setSetting('panelColor', '#ffffff');
  const light = read();
  return { dark, light };
});
assert.match(hthChecks.dark[0], /0\.5px/);
assert.equal(hthChecks.dark[0], hthChecks.dark[1]); // 과거 원정으로 이겨도 현재 홈 팀 색 사용
assert.equal(hthChecks.dark[2], ''); // 무승부
assert.equal(hthChecks.dark[3], ''); // 밝은 팀 색
assert.equal(hthChecks.light[0], '');
assert.match(hthChecks.light[3], /0\.5px/);
console.log('PASS HTH contrast outlines and live background changes');
const labels = await page.evaluate(() => {
  setSetting('panelColor', '#0b1220');
  setSetting('panelAlpha', 0);
  activatePage('main-small');
  const data = {
    matchInfo: { homeTeamName: 'Home', awayTeamName: 'Away' },
    homeLineup: { substitutes: [] }, awayLineup: { substitutes: [] },
    homeInjuries: [], awayInjuries: [],
  };
  renderBenchPanel(data, data);
  renderInjuryPanel(data, data);
  return ['benchPanel', 'injuryPanel'].map(id => [...document.querySelectorAll(`#${id} .dp-side-name`)].map(el => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, color: css.color, padding: css.padding, radius: css.borderRadius, outline: el.style.boxShadow };
  }));
});
assert.equal(labels[0].length, 2);
assert.deepEqual(labels[0], labels[1]);
console.log('PASS identical bench/injury team labels');
const unexpectedErrors=errors.filter(message=>message !== 'jQuery is not defined');
assert.deepEqual(unexpectedErrors,[],`Unexpected page errors: ${unexpectedErrors.join('\n')}`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
