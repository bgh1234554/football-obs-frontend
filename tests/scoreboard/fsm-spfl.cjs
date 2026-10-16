const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/ScottishPremiership.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/ScottishPremiership.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



for (const league of [179,180,183,184]) for (const source of ['eflchampionship','seriea','greecesuperleague']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(league=>{state.fsmTheme='auto';Object.assign(state.colors,{homeBg:'#234567',homeText:'#ffffff',awayBg:'#a02030',awayText:'#ffe080'});state.homeName='Celtic';state.awayName='Rangers';state.homeScore=2;state.awayScore=1;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(league,null);render();},league);await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='spfl');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ScottishPremiership.svg');
 for(const scale of [60,75,100,150]) for(const aggregate of [false,true]){
 await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();reapplyBoardScale();},{scale,aggregate});
 const m=await page.evaluate(()=>{const c=q=>getComputedStyle(document.querySelector(q));const pair=q=>[c(q).backgroundColor,c(q).color];const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {y:b.y,bottom:b.bottom}};return {logo:pair('.score-div'),score:['#team-score-left','#team-score-right'].map(pair),names:['.teams-left','.teams-right'].map(q=>c(q).backgroundColor),teamLogos:['#team-logo-left','#team-logo-right'].map(q=>c(q).backgroundColor),time:pair('.time'),extra:pair('.extra-time'),total:pair('.total-score'),outline:[c('.scoreboard-main').outlineWidth,c('.scoreboard-main').outlineColor],radius:c('.scoreboard-main').borderRadius,clockRadius:c('.time').borderRadius,extraRadius:c('.extra-time').borderRadius,hipen:c('.hipen').display,image:r('.epl-lion'),panel:r('.score-div'),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
 const white='rgb(255, 255, 255)',navy='rgb(32, 41, 86)',gold='rgb(184, 166, 120)';assert.deepEqual(m.logo,[white,navy]);assert.deepEqual(m.score,[[white,navy],[white,navy]]);assert.deepEqual(m.names,['rgb(35, 69, 103)','rgb(160, 32, 48)']);assert.deepEqual(m.teamLogos,[gold,gold]);assert.deepEqual(m.time,[navy,white]);assert.deepEqual(m.extra,[gold,white]);if(aggregate)assert.deepEqual(m.total,[navy,white]);assert.deepEqual(m.outline,['2px',gold]);assert.equal(m.radius,'6px');assert.equal(m.clockRadius,'0px 0px 0px 6px');assert.equal(m.extraRadius,'0px 0px 6px');assert.equal(m.hipen,'none');assert(Math.abs(m.image.y-m.panel.y)<1&&Math.abs(m.image.bottom-m.panel.bottom)<1);assert(m.fits);

 }
}
await page.evaluate(()=>{state.fsmTheme='spfl';state.aggEnabled=false;state.boardScale=100;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>fsmBoardRender());assert.equal(await page.locator('#fsmThemeSelect option[value="spfl"]').count(),1);assert.deepEqual(errors,[]);
await page.evaluate(()=>{state.half='PK';render();fsmBoardRender();});
const pso=await page.locator('.pso-main').evaluate(n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n).color]);assert.deepEqual(pso,['rgb(32, 41, 86)','rgb(255, 255, 255)']);
await page.evaluate(()=>{state.half='2H';render();fsmBoardRender();});
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/spfl-scoreboard.png')});
console.log('PASS SPFL all 4 divisions, auto/manual, team colors, score/logo, outline, corner radii, timer/extra/aggregate/PSO and scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
