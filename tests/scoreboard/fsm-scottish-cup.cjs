const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/ScottishPremiership.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/ScottishPremiership.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



for (const league of [181,185]) for (const source of ['eflchampionship','seriea','greecesuperleague']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(league=>{state.fsmTheme='auto';Object.assign(state.colors,{homeBg:'#234567',homeText:'#ffffff',awayBg:'#a02030',awayText:'#ffe080'});state.homeName='Celtic';state.awayName='Rangers';state.homeScore=2;state.awayScore=1;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(league,null);render();},league);await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='scottishcup');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),null);
 for(const scale of [60,75,100,150]) for(const aggregate of [false,true]){
 await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();reapplyBoardScale();},{scale,aggregate});
 const m=await page.evaluate(()=>{const c=(q,p)=>getComputedStyle(document.querySelector(q),p);const pair=q=>[c(q).backgroundColor,c(q).color];const rect=q=>{const r=document.querySelector(q).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};return {gradient:c('.scoreboard-main').backgroundImage,gradientSize:c('.scoreboard-main').backgroundSize,teamLogos:['#team-logo-left','#team-logo-right'].map(q=>c(q).backgroundColor),names:['.teams-left','.teams-right'].map(pair),score:['#team-score-left','#team-score-right'].map(pair),time:pair('.time'),extra:pair('.extra-time'),line:[c('.score-div','::after').backgroundColor,c('.score-div','::after').top,c('.score-div','::after').bottom,c('.score-div','::after').width],logo:c('.epl-lion').display,hipen:c('.hipen').display,total:[c('.total-score').fontSize,c('.total-score').backgroundColor],home:rect('#team-score-left'),away:rect('#team-score-right'),ht:rect('#totalScoreLeft'),at:rect('#totalScoreRight'),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
 const white='rgb(255, 255, 255)',clear='rgba(0, 0, 0, 0)';assert(m.gradient.includes('rgb(35, 69, 103) calc(16.6667% - 18.6667px)')&&m.gradient.includes('rgb(0, 0, 0) calc(50% - 56px)')&&m.gradient.includes('rgb(0, 0, 0) calc(50% + 56px)')&&m.gradient.includes('rgb(160, 32, 48) calc(83.3333% + 18.6667px)'));assert.deepEqual(m.names,[[clear,white],[clear,white]]);assert.deepEqual(m.score,[['rgb(0, 0, 0)',white],['rgb(0, 0, 0)',white]]);assert.deepEqual(m.time,[white,'rgb(0, 0, 0)']);assert.deepEqual(m.extra,['rgb(250, 255, 147)','rgb(0, 0, 0)']);assert.deepEqual(m.line,['rgb(250, 255, 147)','6px','6px','1px']);assert.equal(m.logo,'none');assert.equal(m.hipen,'none');assert(m.fits);assert.deepEqual(m.teamLogos,['rgb(245, 245, 245)','rgb(245, 245, 245)']);assert.equal(m.gradientSize,'calc(100% - 160px) 100%');if(aggregate){assert.deepEqual(m.total,['20px',clear]);assert(m.ht.right<=m.home.left&&m.at.left>=m.away.right);}

 }
}
await page.evaluate(()=>{state.fsmTheme='scottishcup';state.aggEnabled=true;state.aggHomeBase=1;state.aggAwayBase=2;state.boardScale=100;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>fsmBoardRender());assert.equal(await page.locator('#fsmThemeSelect option[value="scottishcup"]').count(),1);assert.deepEqual(errors,[]);
await page.evaluate(()=>{state.half='PK';render();fsmBoardRender();});
const pso=await page.locator('.pso-main').evaluate(n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n).color]);assert.deepEqual(pso,['rgb(255, 255, 255)','rgb(0, 0, 0)']);
await page.evaluate(()=>{state.half='2H';render();fsmBoardRender();});
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/scottishcup-scoreboard.png')});

for(const scale of [75,100]) for(const aggregate of [false,true]) {
 for(const [home,away,expected] of [['#ffffff','#c5093f',[true,false]],['#00b4d8','#ffffff',[false,true]],['#ebebeb','#f5f5f5',[true,true]],['#eaeaea','#000000',[false,false]],['#234567','#a02030',[false,false]]]) {
 await page.evaluate(({home,away,scale,aggregate})=>{Object.assign(state.colors,{homeBg:home,awayBg:away,homeText:'#000000',awayText:'#000000'});state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();reapplyBoardScale();},{home,away,scale,aggregate});
 const texts=await page.evaluate(()=>['.teams-left','.teams-right'].map(q=>{const card=document.querySelector(q),text=card.querySelector('.text'),c=getComputedStyle(text),r=text.getBoundingClientRect(),b=card.getBoundingClientRect();return {stroke:c.webkitTextStrokeWidth,strokeColor:c.webkitTextStrokeColor,ink:c.color,order:c.paintOrder,shadow:getComputedStyle(card).boxShadow,fits:r.left>=b.left&&r.right<=b.right};}));
 texts.forEach((t,i)=>{assert.equal(t.stroke,expected[i]?'1px':'0px');if(expected[i])assert.equal(t.strokeColor,'rgb(0, 0, 0)');assert.equal(t.ink,'rgb(255, 255, 255)');assert(t.order.startsWith('stroke'));assert.equal(t.shadow,'none');assert(t.fits);});
 if(away==='#ffffff'&&scale===100&&aggregate)await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/scottishcup-white-primary.png')});
 }
}
await page.evaluate(()=>applyTheme('ligue1',null));await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>fsmBoardRender());assert(await page.locator('.team-name .text').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).webkitTextStrokeWidth==='0px')));
console.log('PASS Scottish Cup/League Cup mapping, gradients, extended center line, outer small aggregate, timer/extra and scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
