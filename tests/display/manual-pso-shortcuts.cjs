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
await page.keyboard.press('q');assert.equal(await page.evaluate(()=>state.pk.home.at(-1)),'G');assert.equal(await page.evaluate(()=>state.homeScore),2);
assert.deepEqual(errors,[]);console.log('PASS manual PSO toggle, regular score separation, removed bracket keys and automatic PSO polling');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
