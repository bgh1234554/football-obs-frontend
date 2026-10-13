const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Galatasaray';state.awayName='Fenerbahce';state.homeScore=2;state.awayScore=1;state.manualMode=true;state.seconds=5400;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(203,null);render();});
await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='superlig');
await page.evaluate(()=>fsmBoardRender());
assert.equal(await page.locator('#fsmThemeSelect option[value="superlig"]').count(),1);
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/TurkishSuperLig.svg');
const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));return {score:s('.team-score').backgroundImage,team:s('.teams-left').backgroundColor,clock:s('.time').backgroundColor,clockFg:s('.time').color,extra:s('.extra-time').backgroundColor,extraFg:s('.extra-time').color,reserved:parseFloat(document.querySelector('.fsm-board').style.getPropertyValue('--fsm-name-reserved-width'))};});
assert.equal(m.score,'linear-gradient(rgb(230, 0, 0), rgb(21, 28, 47))');assert.equal(m.team,'rgb(0, 0, 0)');assert.equal(m.clock,'rgb(255, 2, 3)');assert.equal(m.clockFg,'rgb(255, 255, 255)');assert.equal(m.extra,'rgb(21, 28, 47)');assert.equal(m.extraFg,m.clockFg);assert(m.reserved>0);
const geometry=await page.evaluate(()=>{const rect=q=>{const r=document.querySelector(q).getBoundingClientRect();return {top:r.top,bottom:r.bottom};};return {logo:rect('.epl-lion'),timer:rect('.time'),center:rect('.score-div'),score:rect('.team-score'),background:getComputedStyle(document.querySelector('.score-div')).backgroundImage};});
assert(geometry.logo.top<geometry.score.top,'Logo should protrude above the score strip');
assert(geometry.logo.bottom<=geometry.timer.top,'Logo must not overlap the timer');
assert(Math.abs(geometry.center.top-geometry.score.top)<0.5 && Math.abs(geometry.center.bottom-geometry.score.bottom)<0.5,'Center background must align with both score panels');
assert.equal(geometry.background,m.score);
await page.evaluate(()=>{state.fsmTheme='superlig';autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='superlig');
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/superlig-scoreboard.png')});assert.deepEqual(errors,[]);console.log('PASS Super Lig auto/manual theme, colors, gradient and name reservation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
