const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);






for(const theme of ['default','pl','cl','eflchampionship','seriea']){
 await page.evaluate(theme=>{applyTheme(theme,null);state.half='2H';state.seconds=5400;state.running=false;setManualExtra(3);fsmBoardRender();},theme);
 await page.waitForTimeout(600);
 await page.evaluate(()=>fsmBoardRender());
 await page.waitForTimeout(150);
 const before=await page.locator('#board').boundingBox();
 for(const id of ['clock','extra'])assert.equal(await page.locator('#'+id).evaluate(e=>getComputedStyle(e).cursor),'pointer');
 await page.locator('#extra').dblclick();
 if(theme==='cl')await page.locator('#board').screenshot({path:'tests/display/fsm-extra-editor.png'});
 const during=await page.locator('#board').boundingBox();assert(Math.abs(before.height-during.height)<1);assert(Math.abs(before.width-during.width)<1);
 await page.locator('#extraEditor input').fill('7');await page.evaluate(()=>render());await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>state.extra),7);assert(await page.evaluate(()=>state.extraManualOverride));assert.equal(await page.evaluate(()=>state.running),false);
 await page.locator('#extra').dblclick();await page.locator('#extraEditor input').fill('9');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>state.extra),7);
 await page.evaluate(()=>state.running=true);await page.locator('#extra').dblclick();assert(await page.evaluate(()=>state.running));await page.locator('#extraEditor input').fill('4');await page.locator('#extraEditor button').click();assert.equal(await page.evaluate(()=>state.extra),4);
 await page.evaluate(()=>pauseClockTimer());
 await page.locator('#extra').dblclick();await page.locator('#extraEditor input').fill('11');await page.mouse.click(0,0);assert.equal(await page.evaluate(()=>state.extra),4);
 console.log('PASS extra editor',theme);
}
await page.mouse.click(0,0);await page.keyboard.press('BracketRight');assert.equal(await page.evaluate(()=>state.extra),5);
await page.locator('#clock').dblclick();assert(await page.locator('#clockEditor').isVisible());await page.locator('#ceMin').fill('12');await page.locator('#ceSec').fill('34');await page.locator('#ceConfirm').click();assert.equal(await page.evaluate(()=>Math.floor(state.seconds)),754);await page.evaluate(()=>pauseClockTimer());
for(let i=0;i<7;i++)await page.keyboard.press('BracketLeft');assert.equal(await page.evaluate(()=>state.extra),0);assert.equal(await page.evaluate(()=>state.extraShown),false);
await page.locator('#settingsGearBtn').evaluate(e=>e.click());await page.locator('[data-sp-tab="general"]').click();await page.locator('#shortcutManageBtn').click();
assert.deepEqual(await page.evaluate(()=>shortcutActions.slice(1,8).map(a=>a[0])),['clock0','clock45','clock90','clock105','extra','extraPlus','extraMinus']);
assert(await page.evaluate(()=>shortcutActions.filter(a=>a[0].startsWith('extra')).every(a=>a[1]==='타이머')));
const row=page.locator('.sc-row').filter({has:page.getByText('추가시간 +1분',{exact:true})});await row.locator('.sc-key').click();await page.keyboard.press('Control+j');
await page.locator('#shortcutBackBtn').click();await page.locator('#settingsCloseBtn').click();await page.keyboard.press('Control+j');assert.equal(await page.evaluate(()=>state.extra),1);
await page.reload();assert.equal(await page.evaluate(()=>shortcutBinding(shortcutActions.find(a=>a[0]==='extraPlus'))),'Ctrl+KeyJ');
assert.deepEqual(errors,[]);console.log('PASS extra shortcuts, zero clamp, timer grouping, settings capture and persistence');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
