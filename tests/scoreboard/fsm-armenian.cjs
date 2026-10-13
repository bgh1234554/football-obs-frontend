const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





for (const source of ['ligue1','rpl','pl']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='FC Pyunik';state.awayName='Ararat-Armenia';state.homeScore=3;state.awayScore=2;state.colors.homeBg='#0088ff';state.colors.awayBg='#7722aa';state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(342,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='armenian');
 const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {left:b.left,right:b.right};};return {bg:['.teams-left','.teams-right','.team-score','.score-div','.team-logo'].map(q=>s(q).backgroundColor),fg:s('.team-score').color,clock:[s('.time').backgroundColor,s('.time').color],extra:[s('.extra-time').backgroundColor,s('.extra-time').color],edge:document.querySelector('.fsm-board').dataset.fsmColorEdge,home:r('#homeColor'),hs:r('#team-score-left'),away:r('#awayColor'),as:r('#team-score-right'),border:s('.teams-left').borderBottomWidth,chip:[s('#homeColor').backgroundColor,s('#awayColor').backgroundColor],divider:['#team-score-left','.team-logo'].map(q=>{const p=getComputedStyle(document.querySelector(q),'::after');return [p.top,p.bottom,p.width,p.backgroundColor];})};});
 assert.deepEqual(m.bg,['rgb(61, 4, 3)','rgb(61, 4, 3)','rgb(255, 255, 255)','rgb(99, 5, 5)','rgb(245, 245, 245)']);assert.equal(m.fg,'rgb(0, 0, 0)');assert.deepEqual(m.clock,['rgb(0, 0, 0)','rgb(255, 255, 255)']);assert.deepEqual(m.extra,['rgb(133, 6, 7)','rgb(255, 255, 255)']);assert.equal(m.edge,'chip');assert.equal(m.border,'0px');assert.deepEqual(m.chip,['rgb(0, 136, 255)','rgb(119, 34, 170)']);assert(Math.abs(m.home.right-m.hs.left)<1,JSON.stringify(m));assert(Math.abs(m.away.left-m.as.right)<1,JSON.stringify(m));
 assert.equal(await page.locator('#homeName').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');
 assert.deepEqual(await page.locator('#homeColor').evaluate(n=>{const s=getComputedStyle(n);return [parseFloat(s.width),parseFloat(s.height)];}),[8,48]);
}
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ArmenianPremierLeague.svg');
await page.evaluate(()=>{state.fsmTheme='armenian';autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='armenian');
assert.equal(await page.locator('#fsmThemeSelect option[value="armenian"]').count(),1);assert.deepEqual(errors,[]);
assert.deepEqual(await page.locator('.epl-lion').evaluate(n=>{const s=getComputedStyle(n);return [s.height,s.paddingTop,s.paddingBottom];}),['48px','0px','0px']);
const options=await page.locator('#fsmThemeSelect option').evaluateAll(nodes=>nodes.map(n=>n.value));assert.equal(options.indexOf('armenian'),options.indexOf('belarus')+1);
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/armenian-scoreboard.png')});console.log('PASS Armenian auto/manual theme, transitions, colors and vertical chips');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
