const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);






await page.evaluate(()=>{state.manualMode=true;state.half='ET2';state.homeScore=2;state.awayScore=1;state.pk={home:[],away:[]};el.manualModeToggle.checked=true;el.manualSection.classList.add('visible');activatePage('theme');render();});
await page.locator('#manualPsoMode').check();await page.locator('#manualPsoMode').blur();await page.keyboard.press('q');
assert.deepEqual(await page.evaluate(()=>({half:state.half,score:state.homeScore,pk:state.pk.home})),{half:'PK',score:2,pk:['G']});
assert((await page.locator('#manualScoreShortcutHint').textContent()).includes('승부차기 입력 중'));
await page.locator('#manualPsoMode').uncheck();await page.locator('#manualPsoMode').blur();await page.keyboard.press('q');
assert.equal(await page.evaluate(()=>state.homeScore),3);assert.equal(await page.evaluate(()=>state.half),'ET2');
assert(await page.locator('#pkHomeGoal').isDisabled());
await page.keyboard.press('[');await page.keyboard.press(']');assert.equal(await page.evaluate(()=>state.half),'ET2');
await page.evaluate(async()=>{state.manualMode=false;const original=fetchFixture;fetchFixture=async()=>({matchInfo:{fixtureId:987654,status:'PSO',elapsed:120,homeTeamName:'HOME',awayTeamName:'AWAY',homeScore:2,awayScore:1},events:[],playerStats:[]});try{await fetchAndApplyFixtureData(987654,{});clearPolling();}finally{fetchFixture=original;} });
assert.equal(await page.evaluate(()=>state.half),'PK');assert(await page.locator('#manualPsoMode').isChecked());
assert.equal(await page.evaluate(()=>state.manualPsoPreviousHalf),null);
await page.evaluate(()=>{state.manualMode=false;el.manualSection.classList.remove('visible');render();});
assert(await page.locator('#pkHomeGoal').isVisible());assert(await page.locator('#pkHomeGoal').isEnabled());
assert(await page.locator('#manualPsoMode').isEnabled());
assert.equal(await page.locator('#manual-section #pkHomeGoal, #manual-section #manualPsoMode').count(),0);
await page.locator('#pkHomeGoal').click();await page.locator('#pkAwayMiss').click();
assert.deepEqual(await page.evaluate(()=>state.pk),{home:['G'],away:['M']});
await page.locator('#pkUndo').click();assert.deepEqual(await page.evaluate(()=>state.pk),{home:[],away:['M']});
await page.locator('#pkReset').click();assert.deepEqual(await page.evaluate(()=>state.pk),{home:[],away:[]});
await page.setViewportSize({width:1920,height:1080});
const lines=await page.locator('#psoControls input, #psoControls button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;}));
assert(Math.max(...lines)-Math.min(...lines)<1,'PSO toggle and buttons should share one line');
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
await page.locator('.theme-timer-card').screenshot({path:path.join(root,'screenshots/pso-common-controls.png')});
await page.setViewportSize({width:1280,height:720});
assert(!(await page.locator('#themePanel').evaluate(el=>el.scrollWidth>el.clientWidth+1)),'No horizontal overflow at 1280px');
await page.locator('#pkHomeGoal').blur();
await page.keyboard.press('q');assert.equal(await page.evaluate(()=>state.pk.home.at(-1)),'G');assert.equal(await page.evaluate(()=>state.homeScore),2);
await page.evaluate(()=>{state.manualMode=true;el.manualSection.classList.add('visible');render();});
await page.locator('#manualPsoMode').uncheck();
assert.equal(await page.evaluate(()=>state.half),'2');
await page.evaluate(()=>{state.manualMode=false;render();});
assert(await page.locator('#pkHomeGoal').isDisabled());
const pollNormal = id => page.evaluate(async id=>{
  const original=fetchFixture;
  fetchFixture=async()=>({matchInfo:{fixtureId:id,status:'2H',elapsed:89,homeTeamName:'HOME',awayTeamName:'AWAY',homeScore:3,awayScore:2},events:[],playerStats:[]});
  try{await fetchAndApplyFixtureData(id,{silent:true});clearPolling();}finally{fetchFixture=original;}
},id);
await pollNormal(987654);
await page.locator('#manualPsoMode').check();
await page.locator('#pkHomeGoal').click();await page.locator('#pkAwayMiss').click();
await pollNormal(987654);
assert.deepEqual(await page.evaluate(()=>({half:state.half,forced:state.psoModeForced,pk:state.pk,score:state.homeScore})),{half:'PK',forced:true,pk:{home:['G'],away:['M']},score:3});
assert((await page.locator('#psoControlHint').textContent()).includes('되돌리기 Z'));
assert((await page.locator('#psoControlHint').textContent()).includes('초기화 X'));
assert.deepEqual(await page.locator('#psoControlHint .kbd').allTextContents(),['Q','A','W','S','Z','X']);
await page.locator('#manualPsoMode').uncheck();await pollNormal(987654);
assert.equal(await page.evaluate(()=>state.half),'2');assert.equal(await page.evaluate(()=>state.psoModeForced),false);
await page.locator('#manualPsoMode').check();await pollNormal(987655);
assert.equal(await page.evaluate(()=>state.half),'2');assert.equal(await page.evaluate(()=>state.psoModeForced),false);
await page.evaluate(()=>{state.manualMode=true;el.manualSection.classList.add('visible');state.homeName='바이에른 뮌헨';state.awayName='보되/글림트';state.notes={home:"47′ 자말 무시알라\n61′ 해리 케인",away:"87′ 오딘 비에르투프트"};render();});
await page.setViewportSize({width:1920,height:1080});
await page.locator('#manualHomeName').fill('바이에른 뮌헨');await page.locator('#manualAwayName').fill('보되/글림트');
await page.locator('#manualHomeNote').fill("47′ 자말 무시알라\n61′ 해리 케인");await page.locator('#manualAwayNote').fill('87′ 오딘 비에르투프트');
const manualLayout=await page.evaluate(()=>{const score=document.querySelector('.manual-controls-row').getBoundingClientRect(),notes=document.querySelector('.manual-notes-grid').getBoundingClientRect();return {scoreBottom:score.bottom,notesTop:notes.top};});
assert(manualLayout.notesTop>manualLayout.scoreBottom,'Notes follow the score and PSO row');
assert.equal(await page.locator('#manual-section .manual-controls-row #psoControls').count(),1);
const manualLines=await page.locator('#manualHomePlus, #manualAwayPlus, #psoControls button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;}));
assert(Math.max(...manualLines)-Math.min(...manualLines)<1,'Manual score and PSO buttons should share one line');
await page.locator('#manual-section').screenshot({path:path.join(root,'screenshots/manual-controls-layout.png')});
await page.locator('.theme-timer-card').screenshot({path:path.join(root,'screenshots/pso-common-controls.png')});
for(const width of [1280,760,600]){await page.setViewportSize({width,height:900});assert(!(await page.locator('#manual-section').evaluate(el=>el.scrollWidth>el.clientWidth+1)),`Manual layout overflow at ${width}px`);}
await page.evaluate(()=>{state.manualMode=false;el.manualSection.classList.remove('visible');render();});
assert.equal(await page.locator('.theme-timer-card #psoControls').count(),1);
assert(await page.locator('#pkHomeGoal').isVisible());
assert.deepEqual(errors,[]);console.log('PASS manual PSO toggle, regular score separation, removed bracket keys and automatic PSO polling');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
