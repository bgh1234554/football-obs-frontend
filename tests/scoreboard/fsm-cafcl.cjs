const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/CafChampionsLeague.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/CafChampionsLeague.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);







for(const source of ['romanian','ligue1','pl']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Al Ahly';state.awayName='Mamelodi Sundowns';state.homeScore=2;state.awayScore=1;state.aggHomeBase=1;state.aggAwayBase=2;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(12,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='cafcl');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CafChampionsLeague.svg');
 for(const scale of [60,100,150,200]) for(const aggregate of [false,true]) {
  await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();},{scale,aggregate});
  const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const r=q=>{const n=document.querySelector(q),b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}};const c=q=>[s(q).backgroundColor,s(q).color];return {name:c('.teams-left'),teamLogos:['#team-logo-left','#team-logo-right'].map(q=>s(q).backgroundColor),score:c('.team-score'),clock:c('.time'),extra:[s('.extra-time').backgroundImage,s('.extra-time').color],total:[s('.total-score').backgroundImage,s('.total-score').color],awayGradient:s('.total-score:has(#totalScoreRight)').backgroundImage,outline:getComputedStyle(document.querySelector('.score-div'),'::before').backgroundColor,logo:getComputedStyle(document.querySelector('.score-div'),'::after').backgroundColor,radius:['.teams-left','.team-logo','.time','.extra-time','.pso-main'].map(q=>s(q).borderRadius),aggregate:document.querySelector('.fsm-board').dataset.fsmAggregate,home:r('#team-score-left'),ht:r('#totalScoreLeft'),away:r('#team-score-right'),at:r('#totalScoreRight'),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
  assert.deepEqual(m.teamLogos,['rgb(245, 245, 245)','rgb(245, 245, 245)']);assert.deepEqual(m.name,['rgb(40, 40, 37)','rgb(255, 255, 255)']);assert.deepEqual(m.score,['rgb(76, 74, 45)','rgb(255, 255, 255)']);assert.deepEqual(m.clock,['rgb(255, 255, 255)','rgb(0, 0, 0)']);assert(m.extra[0].includes('to right')&&m.extra[0].includes('rgb(172, 145, 46)')&&m.extra[0].includes('rgb(211, 184, 12)'));assert.equal(m.extra[1],'rgb(255, 255, 255)');assert.equal(m.outline,'rgb(252, 255, 250)');assert.equal(m.logo,'rgb(51, 47, 32)');assert(m.radius.every(v=>v==='0px'));assert.equal(m.aggregate,String(aggregate));assert(m.fits,JSON.stringify(m));
  if(aggregate){assert(m.total[0].includes('to left')&&m.awayGradient.includes('to right')&&m.total[0].includes('rgb(176, 144, 46)')&&m.total[0].includes('rgb(215, 186, 13)'));assert.equal(m.total[1],'rgb(255, 255, 255)');assert(m.ht.right<=m.home.left+1&&m.at.left>=m.away.right-1,JSON.stringify(m));}
 }
}
await page.evaluate(()=>{state.fsmTheme='cafcl';state.half='PK';state.boardScale=100;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='cafcl');await page.evaluate(()=>fsmBoardRender());
assert.equal(await page.locator('#fsmThemeSelect option[value="cafcl"]').count(),1);
const pso=await page.evaluate(()=>{const p=getComputedStyle(document.querySelector('.pso-main')),a=getComputedStyle(document.querySelector('.total-score'));return {p:[p.backgroundImage,p.color],a:[a.backgroundImage,a.color]}});assert(pso.p[0].includes('rgb(176, 144, 46)')&&pso.p[0].includes('rgb(215, 186, 13)'));assert.equal(pso.p[1],pso.a[1]);assert.deepEqual(errors,[]);
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/cafcl-pso.png')});await page.evaluate(()=>{state.half='2H';render();fsmBoardRender();});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/cafcl-scoreboard.png')});
console.log('PASS CAF Champions League auto/manual theme, Romanian cup badge, Ligue 1 layout, colors, square corners, aggregate, timer/extra/PSO and 4 scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
