const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:Number(process.env.FSM_TEST_DPR||1)});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





for (const source of ['ligue1','rpl','pl']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Lech Poznan';state.awayName='Legia Warszawa';state.homeScore=3;state.awayScore=2;state.colors.homeBg='#0088ff';state.colors.awayBg='#7722aa';state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(106,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='ekstraklasa');await page.evaluate(()=>render());
 const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {left:b.left,right:b.right};};return {bg:['.teams-left','.teams-right','.team-score','.score-div','.team-logo'].map(q=>s(q).backgroundColor),fg:s('.team-score').color,clock:[s('.time').backgroundColor,s('.time').color],extra:[s('.extra-time').backgroundColor,s('.extra-time').color],edge:document.querySelector('.fsm-board').dataset.fsmColorEdge,home:r('#homeColor'),hs:r('#team-score-left'),away:r('#awayColor'),as:r('#team-score-right'),border:s('.teams-left').borderBottomWidth,chip:[s('#homeColor').backgroundColor,s('#awayColor').backgroundColor],divider:['#team-score-left','.team-logo'].map(q=>{const p=getComputedStyle(document.querySelector(q),'::after');return [p.top,p.bottom,p.width,p.backgroundColor];})};});
 assert.equal(m.fg,'rgb(255, 255, 255)');assert.deepEqual(m.clock,['rgb(0, 59, 239)','rgb(255, 255, 255)']);assert.deepEqual(m.extra,['rgb(9, 233, 150)','rgb(0, 0, 0)']);assert.equal(m.edge,'strip-top');assert.equal(m.border,'0px');assert.equal(m.bg[3],'rgba(0, 0, 0, 0)');
  // 팀컬러 5px + 경계선 1px (다른 가로 팀컬러 점수판과 같은 굵기)
 const strip=await page.locator('#homeCard').evaluate(n=>{const s=getComputedStyle(n,'::before');return [s.height,s.backgroundColor,s.boxShadow];});assert.deepEqual(strip,['6px','rgb(0, 136, 255)','rgb(255, 255, 255) 0px -1px 0px 0px inset']);
 const gradient=await page.locator('.scoreboard-main').evaluate(n=>getComputedStyle(n,'::before').backgroundImage);assert(gradient.includes('rgb(0, 32, 128)'));assert(gradient.includes('rgb(0, 59, 239)'));
 assert.equal(await page.locator('#homeName').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');
}
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/Ekstraklasa.svg');
await page.evaluate(()=>{state.fsmTheme='ekstraklasa';autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='ekstraklasa');await page.evaluate(()=>render());
assert.equal(await page.locator('#fsmThemeSelect option[value="ekstraklasa"]').count(),1);assert.deepEqual(errors,[]);
assert.deepEqual(await page.locator('.epl-lion').evaluate(n=>{const s=getComputedStyle(n);return [s.height,s.paddingTop,s.paddingBottom];}),['48px','5px','5px']);
const options=await page.locator('#fsmThemeSelect option').evaluateAll(nodes=>nodes.map(n=>n.value));assert.equal(options.indexOf('ekstraklasa'),options.indexOf('czech')+1);
for(const width of [1280,1536]) for(const scale of [75,100]) {
 await page.setViewportSize({width,height:720});
 await page.evaluate(scale=>{state.boardScale=scale;state.colors.homeBg='#ff0000';state.colors.awayBg='#ff0000';render();reapplyBoardScale();},scale);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const geometry=await page.evaluate(()=>{const b=document.querySelector('.fsm-board'),score=document.querySelector('#team-score-left'),away=document.querySelector('#team-score-right'),logo=document.querySelector('.score-div');const r=score.getBoundingClientRect(),a=away.getBoundingClientRect(),l=logo.getBoundingClientRect();const paint=parseFloat(getComputedStyle(b).getPropertyValue('--fsm-ekstraklasa-paint-top'));return {gap:l.left-r.right,awayGap:a.left-l.right,paintY:(r.top+paint*r.height/48)*devicePixelRatio,sample:[Math.floor((r.left+r.width/2)*devicePixelRatio),Math.floor(r.top*devicePixelRatio)],logoSample:[Math.floor((l.left+l.width/2)*devicePixelRatio),Math.floor(l.top*devicePixelRatio)]};});
 assert(Math.abs(geometry.gap)<0.01&&Math.abs(geometry.awayGap)<0.01,JSON.stringify(geometry));assert(Math.abs(geometry.paintY-Math.round(geometry.paintY))<0.001,JSON.stringify(geometry));
 const lines=await page.evaluate(()=>Array.from(document.querySelectorAll('.team-score, .score-div')).flatMap(n=>{const r=n.getBoundingClientRect(),scale=r.height/48;return (n.classList.contains('score-div')?['::before','::after']:['::after']).map(p=>{const s=getComputedStyle(n,p);return [(r.left+parseFloat(s.left)*scale)*devicePixelRatio,(r.top+parseFloat(s.top)*scale)*devicePixelRatio,parseFloat(s.width)*scale*devicePixelRatio,parseFloat(s.height)*scale*devicePixelRatio,s.backgroundColor];});}));assert(lines.every(l=>l.slice(0,4).every(v=>Math.abs(v-Math.round(v))<0.02)&&l[4]==='rgb(96, 254, 253)'),JSON.stringify(lines));
 const png=await page.screenshot();const pixels=await page.evaluate(async({data,points})=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return points.map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));},{data:png.toString('base64'),points:[geometry.sample,geometry.logoSample]});assert(pixels.every(p=>p[2]>p[0]+80),JSON.stringify({scale,width,pixels}));
}
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/ekstraklasa-scoreboard.png')});console.log('PASS Ekstraklasa auto/manual theme, continuous gradients, dividers, top strips and timer colors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
