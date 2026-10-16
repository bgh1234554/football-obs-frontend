const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/CypriotFirstDivision.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/CypriotFirstDivision.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



for (const source of ['pl','ligue1','greecesuperleague']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='APOEL';state.awayName='Omonia';state.homeScore=2;state.awayScore=1;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(318,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='cypriotfirstdivision');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CypriotFirstDivision.svg');
 for(const scale of [60,100,150]) for(const aggregate of [false,true]){
 await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();reapplyBoardScale();},{scale,aggregate});
 const m=await page.evaluate(()=>{const c=q=>getComputedStyle(document.querySelector(q));const pair=q=>[c(q).backgroundColor,c(q).color];const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {y:b.y,bottom:b.bottom}};return {aggregate:document.querySelector('.fsm-board').dataset.fsmAggregate,totals:[...document.querySelectorAll('.total-score')].map(n=>[getComputedStyle(n).backgroundImage,getComputedStyle(n).color]),logo:pair('.score-div'),score:['#team-score-left','#team-score-right'].map(pair),names:['.teams-left','.teams-right'].map(pair),time:[c('.time').backgroundImage,c('.time').color],extra:pair('.extra-time'),image:r('.epl-lion'),panel:r('.score-div'),strip:['.teams-left','.teams-right'].map(q=>c(q).borderBottomWidth),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
 const white='rgb(255, 255, 255)',dark='rgb(28, 28, 28)';assert.equal(m.logo[0],'rgb(28, 28, 28)');assert.deepEqual(m.score,[[white,dark],[white,dark]]);assert.deepEqual(m.names,[[dark,white],[dark,white]]);assert(m.time[0].includes('to right top')&&m.time[0].includes('rgb(0, 127, 138)')&&m.time[0].includes('rgb(0, 172, 139)'));assert.equal(m.time[1],white);assert.deepEqual(m.extra,['rgb(238, 104, 33)',white]);assert(m.image.y<m.panel.y);assert(Math.abs(m.image.bottom-m.panel.bottom)<1);assert.deepEqual(m.strip,['5px','5px']);assert(m.fits);assert.equal(m.aggregate,String(aggregate));if(aggregate)assert(m.totals.every(t=>t[0]===m.time[0]&&t[1]===m.time[1]));

 }
}
await page.evaluate(()=>{state.fsmTheme='cypriotfirstdivision';state.aggEnabled=true;state.aggHomeBase=1;state.aggAwayBase=2;state.boardScale=100;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>fsmBoardRender());assert.equal(await page.locator('#fsmThemeSelect option[value="cypriotfirstdivision"]').count(),1);assert.deepEqual(errors,[]);
await page.evaluate(()=>{state.half='PK';render();fsmBoardRender();});
const pso=await page.locator('.pso-main').evaluate(n=>[getComputedStyle(n).backgroundImage,getComputedStyle(n).color]);assert(pso[0].includes('rgb(0, 127, 138)')&&pso[0].includes('rgb(0, 172, 139)'));assert.equal(pso[1],'rgb(255, 255, 255)');
await page.evaluate(()=>{state.half='2H';render();fsmBoardRender();});
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/cypriot-scoreboard.png')});
console.log('PASS Cypriot theme auto/manual, logo protrusion, score/name colors, timer/PSO gradients, extra and scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
