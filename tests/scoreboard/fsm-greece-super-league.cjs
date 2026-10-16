const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/GreeceSuperLeague.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/GreeceSuperLeague.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



for (const source of ['pl','ligue1','ligue2']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Olympiacos';state.awayName='Panathinaikos';state.homeScore=2;state.awayScore=1;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(197,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='greecesuperleague');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/GreeceSuperLeague.svg');
 for(const scale of [60,100,150]) for(const aggregate of [false,true]){
 await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();},{scale,aggregate});
 const m=await page.evaluate(()=>{const c=q=>getComputedStyle(document.querySelector(q));return {main:c('.scoreboard-main').backgroundImage,time:[c('.time').backgroundImage,c('.time').color],extra:[c('.extra-time').backgroundColor,c('.extra-time').color],score:c('.team-score').color,positions:['#team-score-left','.score-div','#team-score-right'].map(q=>document.querySelector(q).getBoundingClientRect().x),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
 assert(m.main.includes('rgb(40, 40, 40)')&&m.main.includes('rgb(58, 58, 56)'));assert(m.time[0].includes('rgb(212, 215, 214)')&&m.time[0].includes('rgb(250, 251, 246)'));assert.equal(m.time[1],'rgb(13, 13, 13)');assert.deepEqual(m.extra,['rgb(219, 1, 115)','rgb(255, 255, 255)']);assert.equal(m.score,'rgb(255, 255, 255)');assert(m.positions[0]<m.positions[1]&&m.positions[1]<m.positions[2]);assert(m.fits);
 }
}
await page.evaluate(()=>{state.fsmTheme='greecesuperleague';state.aggEnabled=false;state.boardScale=100;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>fsmBoardRender());assert.equal(await page.locator('#fsmThemeSelect option[value="greecesuperleague"]').count(),1);assert.deepEqual(errors,[]);
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/greece-scoreboard.png')});
console.log('PASS Greece auto/manual, theme transitions, gradients, extra time, aggregate and scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
