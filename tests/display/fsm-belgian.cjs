const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





for (const source of ['ligue1','rpl','pl']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Club Brugge';state.awayName='Anderlecht';state.homeScore=3;state.awayScore=2;state.colors.homeBg='#0088ff';state.colors.awayBg='#7722aa';state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(144,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='belgian');
 const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {left:b.left,right:b.right};};return {bg:['.teams-left','.teams-right','.team-score','.score-div','.team-logo'].map(q=>s(q).backgroundColor),fg:s('.team-score').color,clock:[s('.time').backgroundColor,s('.time').color],extra:[s('.extra-time').backgroundColor,s('.extra-time').color],edge:document.querySelector('.fsm-board').dataset.fsmColorEdge,home:r('#homeColor'),hs:r('#team-score-left'),away:r('#awayColor'),as:r('#team-score-right'),border:s('.teams-left').borderBottomWidth,chip:[s('#homeColor').backgroundColor,s('#awayColor').backgroundColor],divider:['#team-score-left','.team-logo'].map(q=>{const p=getComputedStyle(document.querySelector(q),'::after');return [p.top,p.bottom,p.width,p.backgroundColor];})};});
 assert(m.bg.every(c=>c==='rgb(20, 24, 9)'),JSON.stringify(m));assert.equal(m.fg,'rgb(255, 255, 255)');assert.deepEqual(m.clock,['rgb(255, 255, 255)','rgb(20, 24, 9)']);assert.deepEqual(m.extra,['rgb(255, 23, 64)','rgb(255, 255, 255)']);assert.equal(m.edge,'chip');assert.equal(m.border,'0px');assert.deepEqual(m.chip,['rgb(0, 136, 255)','rgb(119, 34, 170)']);assert(Math.abs(m.home.right-m.hs.left)<1,JSON.stringify(m));assert(Math.abs(m.away.left-m.as.right)<1,JSON.stringify(m));assert(m.divider.every(d=>JSON.stringify(d)===JSON.stringify(['8px','8px','1px','rgb(255, 255, 255)'])));
}
const outline=await page.locator('.scoreboard-main').evaluate(n=>{const s=getComputedStyle(n,'::after');return {borders:[s.borderTop,s.borderRight,s.borderBottom,s.borderLeft],insets:[s.top,s.right,s.bottom,s.left]};});assert(outline.borders.every(b=>b==='1px solid rgb(255, 255, 255)'));assert(outline.insets.every(v=>v==='0px'));
const outerDividers=await page.evaluate(()=>[getComputedStyle(document.querySelector('#team-logo-left'),'::before').content,getComputedStyle(document.querySelector('#team-logo-right'),'::after').content]);assert.deepEqual(outerDividers,['none','none']);
const colorSideDividers=await page.evaluate(()=>[getComputedStyle(document.querySelector('#team-score-left'),'::before').content,getComputedStyle(document.querySelector('#team-score-right'),'::after').content]);assert.deepEqual(colorSideDividers,['none','none']);
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/BelgianProLeague.svg');
await page.evaluate(()=>{state.fsmTheme='belgian';autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='belgian');
assert.equal(await page.locator('#fsmThemeSelect option[value="belgian"]').count(),1);assert.deepEqual(errors,[]);
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/belgian-scoreboard.png')});console.log('PASS Belgian auto/manual theme, transitions, colors, inset dividers and RPL chips');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
