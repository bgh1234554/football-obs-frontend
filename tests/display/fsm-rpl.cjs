const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



const logo='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="72"><rect width="64" height="72" fill="navy"/></svg>';
for(const source of ['pl','uel','seriea']) {
 await page.evaluate(t=>applyTheme(t,null),source); await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(logo=>{state.homeName='\uC81C\uB2C8\uD2B8';state.awayName='\uC2A4\uD30C\uB974\uD0C0\uD06C \uBAA8\uC2A4\uD06C\uBC14';state.homeScore=3;state.awayScore=0;state.manualMode=true;state.seconds=5400;state.extraShown=true;state.extra=4;state.colors.homeBg='#00aaff';state.colors.awayBg='#cc0000';autoApplyTemplateByLeagueId(235,logo);render();},logo);
 await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(async()=>{await document.fonts.ready;fsmBoardRender();});
 assert((await page.locator('#fsm-theme-link').getAttribute('href')).endsWith('result_style_RPL.css'));
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),logo);
 const m=await page.evaluate(()=>{const style=s=>getComputedStyle(document.querySelector(s));const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right};};return {bg:style('.team-score').backgroundColor,fg:style('.team-score').color,name:style('.team-name').color,team:style('.teams-left').backgroundColor,clock:style('.time').color,extra:style('.extra-time').backgroundColor,extraFg:style('.extra-time').color,transform:style('.team-score').transform,home:rect('#homeColor'),hs:rect('#team-score-left'),away:rect('#awayColor'),as:rect('#team-score-right'),colors:[style('#homeColor').backgroundImage,style('#homeColor').backgroundColor],fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').scrollWidth<=n.clientWidth-48+1)};});
 assert.equal(m.bg,'rgb(255, 255, 255)');assert.equal(m.fg,'rgb(14, 42, 92)');assert.equal(m.team,'rgb(14, 42, 92)');assert.equal(m.name,'rgb(255, 255, 255)');assert.equal(m.clock,m.fg);assert.equal(m.extra,'rgb(230, 47, 47)');assert.equal(m.extraFg,m.name);assert.equal(m.transform,'none');assert.deepEqual(m.colors,['none','rgb(0, 170, 255)']);assert(Math.abs(m.home.right-m.hs.left)<1,JSON.stringify(m));assert(Math.abs(m.away.left-m.as.right)<1,JSON.stringify(m));assert(m.fits);
 const visible=await page.locator('#awayScore').evaluate(n=>{const r=n.getBoundingClientRect();return document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).includes(n);});assert(visible,'Away score must remain visible above the positioned team card');
 console.log('PASS',source+' -> RPL: API logo, colors, straight edges, primary stripes, name fit');
}
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/rpl-scoreboard.png')});assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
