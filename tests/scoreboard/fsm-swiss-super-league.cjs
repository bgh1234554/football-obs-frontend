const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/SwissSuperLeague.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/SwissSuperLeague.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



for (const source of ['pl','ligue1','greecesuperleague']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Basel';state.awayName='Young Boys';state.homeScore=2;state.awayScore=1;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(207,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='swisssuperleague');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/SwissSuperLeague.svg');
 for(const scale of [60,100,150]) for(const aggregate of [false,true]){
 await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();reapplyBoardScale();},{scale,aggregate});
 const m=await page.evaluate(()=>{const c=(q,p)=>getComputedStyle(document.querySelector(q),p);const pair=q=>[c(q).backgroundColor,c(q).color];const r=q=>document.querySelector(q).getBoundingClientRect();return {logo:pair('.score-div'),score:['#team-score-left','#team-score-right'].map(pair),names:['.teams-left','.teams-right'].map(pair),time:pair('.time'),extra:pair('.extra-time'),total:pair('.total-score'),padding:c('.epl-lion').padding,panelHeight:r('.score-div').height,height:r('.epl-lion').height,width:r('.score-div').width,logoWidth:r('.epl-lion').width,strip:['.teams-left','.teams-right'].map(q=>c(q).borderBottomWidth),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
 const pink='rgb(197, 9, 63)',white='rgb(255, 255, 255)',black='rgb(0, 0, 0)',gray='rgb(162, 162, 162)';
 assert.equal(m.logo[0],pink);assert.deepEqual(m.score,[[white,pink],[white,pink]]);assert.deepEqual(m.names,[[pink,white],[pink,white]]);assert.deepEqual(m.time,[gray,black]);assert.deepEqual(m.extra,['rgb(228, 14, 15)',white]);if(aggregate)assert.deepEqual(m.total,[gray,black]);assert(Math.abs(m.height-m.panelHeight)<0.1);assert(Math.abs(m.width-m.panelHeight/48*(42*55.88/53.8+6))<1);assert(Math.abs(m.width-m.logoWidth)<1);assert.equal(m.padding,'3px');assert.deepEqual(m.strip,['5px','5px']);assert(m.fits);

 }
}
await page.evaluate(()=>{state.fsmTheme='swisssuperleague';state.aggEnabled=false;state.boardScale=100;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>fsmBoardRender());assert.equal(await page.locator('#fsmThemeSelect option[value="swisssuperleague"]').count(),1);assert.deepEqual(errors,[]);
await page.evaluate(()=>{state.half='PK';render();fsmBoardRender();});
const pso=await page.locator('.pso-main').evaluate(n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n).color]);assert.deepEqual(pso,['rgb(197, 9, 63)','rgb(255, 255, 255)']);
await page.evaluate(()=>{state.half='2H';render();fsmBoardRender();});
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/swiss-scoreboard.png')});
console.log('PASS Swiss auto/manual, colors, logo dimensions, team strips, aggregate and scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
