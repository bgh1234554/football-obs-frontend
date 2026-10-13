const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



await page.evaluate(()=>applyTheme('unl',null));await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>document.fonts.ready);
for(const pct of [100,75,50])for(const pair of [['\uC2A4\uC704\uC2A4','\uBD81\uB9C8\uCF00\uB3C4\uB2C8\uC544'],['A','B'],['A Very Long Football Club Name','Another Long Football Club Name']]){
 await page.evaluate(({pct,pair})=>{state.homeName=pair[0];state.awayName=pair[1];state.boardScale=pct;render();fsmBoardRender();}, {pct,pair});await page.waitForTimeout(100);
 const m=await page.evaluate(()=>[...document.querySelectorAll('.team-name')].map((e,i)=>{const r=e.getBoundingClientRect(),t=e.querySelector('.text'),tr=t.getBoundingClientRect(),card=e.parentElement.getBoundingClientRect(),logo=document.getElementById(i===0?'team-logo-left':'team-logo-right').getBoundingClientRect(),s=getComputedStyle(e);const outer=i===0?logo.right:logo.left,inner=i===0?card.right:card.left;return {center:tr.left+tr.width/2,target:(outer+inner)/2,boundary:i===0?r.left:r.right,outer,font:parseFloat(getComputedStyle(t).fontSize),fits:t.scrollWidth<=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1};}));
 m.forEach(row=>{assert(Math.abs(row.center-row.target)<1,JSON.stringify({pct,pair,row}));assert(Math.abs(row.boundary-row.outer)<1);assert(row.fits);});if(pair[0].startsWith('\uC2A4'))m.forEach(row=>assert.equal(row.font,33));console.log('PASS',pct,pair,m.map(x=>x.font));
}
fs.mkdirSync(path.join(root,'screenshots/fsm-clock-editor'),{recursive:true});await page.evaluate(()=>{state.homeName='\uC2A4\uC704\uC2A4';state.awayName='\uBD81\uB9C8\uCF00\uB3C4\uB2C8\uC544';state.boardScale=100;render();fsmBoardRender();});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/fsm-clock-editor/unl-logo-boundary.png')});assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
