const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/Eliteserien.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/Eliteserien.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



for (const source of ['pl','ligue1','greecesuperleague']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Viking';state.awayName='Lillestrom';state.homeScore=2;state.awayScore=1;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(103,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='eliteserien');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/Eliteserien.svg');
 for(const scale of [60,100,150]) for(const aggregate of [false,true]){
 await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();reapplyBoardScale();},{scale,aggregate});
 const m=await page.evaluate(()=>{const c=(q,p)=>getComputedStyle(document.querySelector(q),p);const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {x:b.x,right:b.right,y:b.y,bottom:b.bottom,width:b.width,height:b.height}};return {paint:c('.scoreboard-main','::before').backgroundImage,angle:['.scoreboard-main','.time','.extra-time'].map(q=>c(q,'::before').transform),names:['.teams-left','.teams-right'].map(q=>[c(q).backgroundImage,c(q).color]),time:[c('.time','::before').backgroundColor,c('.time').color],extra:[c('.extra-time','::before').backgroundColor,c('.extra-time').color],score:c('.team-score').color,total:[c('.total-score').fontSize,c('.total-score').backgroundColor],logo:r('.epl-lion'),panel:r('.score-div'),home:r('#team-score-left'),away:r('#team-score-right'),totals:['#totalScoreLeft','#totalScoreRight'].map(r),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
 assert(m.paint.includes('rgb(17, 85, 134)')&&m.paint.includes('rgb(71, 181, 224)'));assert(m.angle.every(t=>t.includes('-0.935')));assert(m.names.every(n=>n[0].includes('rgb(127, 159, 181)')&&n[0].includes('rgb(251, 248, 253)')&&n[1]==='rgb(21, 33, 50)'));assert.deepEqual(m.time,['rgb(251, 248, 253)','rgb(21, 33, 50)']);assert.deepEqual(m.extra,['rgb(11, 73, 139)','rgb(255, 255, 255)']);assert.equal(m.score,'rgb(255, 255, 255)');assert(m.logo.y>=m.panel.y&&m.logo.bottom<=m.panel.bottom);assert(m.fits);if(aggregate){assert.deepEqual(m.total,['20px','rgba(0, 0, 0, 0)']);assert(m.totals[0].right<=m.home.x&&m.totals[1].x>=m.away.right);}

 }
}
await page.evaluate(()=>{state.fsmTheme='eliteserien';state.aggEnabled=true;state.aggHomeBase=2;state.aggAwayBase=2;state.boardScale=100;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>fsmBoardRender());assert.equal(await page.locator('#fsmThemeSelect option[value="eliteserien"]').count(),1);assert.deepEqual(errors,[]);
await page.evaluate(()=>{state.half='PK';render();fsmBoardRender();});
const pso=await page.locator('.pso-main').evaluate(n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n).color]);assert.deepEqual(pso,['rgb(21, 33, 50)','rgb(255, 255, 255)']);
await page.evaluate(()=>{state.half='2H';render();fsmBoardRender();});
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/eliteserien-scoreboard.png')});

for(const names of [['HOME','AWAY'],['Viking Fotballklubb','Lillestrom Sportsklubb'],['A','Lillestrom Sportsklubb']]) for(const aggregate of [false,true]) for(const scale of [60,100,150]) {
 await page.evaluate(({names,aggregate,scale})=>{[state.homeName,state.awayName]=names;state.aggEnabled=aggregate;state.boardScale=scale;render();fsmBoardRender();reapplyBoardScale();},{names,aggregate,scale});
 const geometry=await page.evaluate(()=>{const board=document.querySelector('.fsm-board'),main=board.querySelector('.scoreboard-main'),p=getComputedStyle(main,'::before'),r=main.getBoundingClientRect(),scale=r.height/48,skew=Math.abs(new DOMMatrix(p.transform).c),width=parseFloat(p.width)*scale,center=(r.left+r.right)/2,inset=48*skew*scale,leftTop=center-width/2+inset/2,rightTop=center+width/2+inset/2,leftBottom=center-width/2-inset/2,rightBottom=center+width/2-inset/2;return [...board.querySelectorAll('.team-name')].map((n,i)=>{const b=n.parentElement.getBoundingClientRect(),t=n.getBoundingClientRect(),text=n.querySelector('.text').getBoundingClientRect(),start=i?Math.max(rightTop,rightBottom):b.left,end=i?b.right:Math.min(leftTop,leftBottom);return {centerError:Math.abs((t.left+t.right-start-end)/2),textCenterError:Math.abs((text.left+text.right-t.left-t.right)/2),safe:text.left>=start&&text.right<=end};});});
 assert(geometry.every(g=>g.centerError<1&&g.textCenterError<1&&g.safe),JSON.stringify({names,aggregate,scale,geometry}));
}
for(const seconds of [123,2707,6303]) for(const extraShown of [false,true]){
 await page.evaluate(({seconds,extraShown})=>{setClockSeconds(seconds,{autoStart:false});state.extraShown=extraShown;state.boardScale=100;render();fsmBoardRender();reapplyBoardScale();},{seconds,extraShown});
 const clock=await page.locator('#clock').boundingBox(),main=await page.locator('.scoreboard-main').boundingBox();assert(Math.abs(clock.x+clock.width/2-main.x-main.width/2)<0.5);
 await page.locator('#clock').dblclick();
 const editor=await page.locator('#clockEditor').boundingBox();assert(Math.abs(editor.x+editor.width/2-clock.x-clock.width/2)<0.5);assert(Math.abs(editor.y+editor.height/2-clock.y-clock.height/2)<0.5);
 await page.locator('#ceColon').hover();assert(await page.locator('#cePresets').isVisible());assert.equal(await page.locator('#cePresets').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(251, 248, 253)');
 const numbers=await page.evaluate(()=>{const m=document.querySelector('#ceMin').getBoundingClientRect(),s=document.querySelector('#ceSec').getBoundingClientRect(),c=document.querySelector('#clock').getBoundingClientRect();return {error:Math.abs((m.left+s.right-c.left-c.right)/2),font:getComputedStyle(document.querySelector('#ceMin')).fontSize,clockFont:getComputedStyle(document.querySelector('#clock')).fontSize,seconds:document.querySelector('#ceSec').value};});assert(numbers.error<0.5);assert.equal(numbers.font,numbers.clockFont);assert.equal(numbers.seconds,String(seconds%60).padStart(2,'0'));
 if(seconds===2707&&extraShown)await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/eliteserien-clock-editing.png')});
 await page.keyboard.press('Escape');
}
await page.evaluate(()=>{state.homeName='HOME';state.awayName='AWAY';setClockSeconds(2707,{autoStart:false});render();fsmBoardRender();});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/eliteserien-short-side.png')});
console.log('PASS Eliteserien theme, slopes, gradients, inset logo, outer aggregate and scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
