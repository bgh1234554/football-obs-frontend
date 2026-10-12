const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




await page.evaluate(()=>{state.fsmTheme='pl';state.colors.homeBg='#123456';state.colors.awayBg='#aa0000';autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink);await page.waitForTimeout(500);
for(const side of ['home','away']){
const id=side==='home'?'inHomeBg':'inAwayBg';
for(const [color,expected] of [['#ffffff','#000000'],['#123456','#ffffff'],['#eeeeee','#000000']]){
await page.locator('#'+id).evaluate((n,color)=>{n.value=color;n.dispatchEvent(new Event('change',{bubbles:true}));},color);
const immediate=await page.evaluate(side=>({overlay:document.querySelector('.fsm-board').style.getPropertyValue('--fsm-pl-'+side+'-overlay'),bg:state.colors[side+'Bg']}),side);assert.equal(immediate.overlay,expected);assert.equal(immediate.bg,color);await page.waitForTimeout(450);
assert.equal(await page.evaluate(side=>document.querySelector('.fsm-board').style.getPropertyValue('--fsm-pl-'+side+'-overlay'),side),expected);
}
}
const hex=page.locator('#inHomeBgHex');await hex.evaluate(n=>{n.value='#ffffff';n.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await page.evaluate(()=>document.querySelector('.fsm-board').style.getPropertyValue('--fsm-pl-home-overlay')),'#000000');assert.deepEqual(errors,[]);console.log('PASS EPL overlay updates immediately for both teams, white/color transitions and HEX changes with CSS transitions enabled');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
