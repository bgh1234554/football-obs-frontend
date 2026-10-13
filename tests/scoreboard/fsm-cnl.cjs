const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);






for (const source of ['ligue1', 'ligaportugal', 'pl']) {
 await page.evaluate(t=>{state.fsmTheme=t;autoApplyTemplateByLeagueId(39,null);render();},source);
 await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='DOMINICAN REPUBLIC';state.awayName='HAITI';state.homeScore=0;state.awayScore=1;state.colors.homeBg='#e52234';state.colors.awayBg='#003399';state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(536,null);render();});
 await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='cnl');
 await page.evaluate(async()=>{await document.fonts.ready;fsmBoardRender();});
 const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const main=document.querySelector('.scoreboard-main');return {radius:parseFloat(s('.fsm-board').getPropertyValue('--cnl-radius')),width:main.offsetWidth,team:s('.teams-left').backgroundImage,score:s('.team-score').backgroundImage,logo:getComputedStyle(document.querySelector('.score-div'),'::before').backgroundColor,extra:[s('.extra-time').backgroundColor,s('.extra-time').color],clock:s('.time').backgroundImage,edge:document.querySelector('.fsm-board').dataset.fsmColorEdge,fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').scrollWidth<=n.clientWidth-48+1)};});
 assert.equal(m.radius,82);assert.equal(m.team,'linear-gradient(rgb(0, 77, 255), rgb(0, 128, 255))');assert.equal(m.score,'linear-gradient(rgb(0, 174, 255), rgb(1, 119, 255))');assert.equal(m.logo,'rgb(245, 245, 245)');assert.deepEqual(m.extra,['rgb(255, 255, 255)','rgb(5, 1, 45)']);assert.equal(m.edge,'chip');assert(m.fits,JSON.stringify(m));assert(m.clock.includes('rgb(3, 31, 152)'));
}
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ConcacafNationsLeagueCup.svg');
assert(await page.evaluate(()=>Object.hasOwn(FSM_THEMES,'cnl')));
assert(await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const glow=getComputedStyle(document.querySelector('.scoreboard-main'),'::before');return s('.div-background').backgroundImage===s('.teams-left').backgroundImage&&s('.score-div').backgroundImage===s('.team-score').backgroundImage&&glow.backgroundColor==='rgb(255, 255, 255)'&&glow.boxShadow!=='none'&&s('#team-score-left').clipPath.startsWith('circle(82px');}));
assert(await page.evaluate(()=>{const board=document.querySelector('.fsm-board');const radius=89;const expected=radius-Math.sqrt(radius*radius-24*24);const curves=[...board.querySelectorAll('.cnl-curve path')];return Math.abs(board.querySelector('#homeColor').getBoundingClientRect().left-board.querySelector('#team-score-left').getBoundingClientRect().left+7*board.querySelector('#team-score-left').getBoundingClientRect().height/48)<0.01&&curves.length===2&&curves.every(p=>Math.abs(parseFloat(p.getAttribute('d').slice(1))-expected)<1e-8)&&getComputedStyle(board.querySelector('#homeColor')).backgroundColor==='rgba(0, 0, 0, 0)';}));
await page.evaluate(()=>{state.fsmTheme='cnl';autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='cnl');
for(const width of [640,1920]){await page.setViewportSize({width,height:900});await page.evaluate(()=>{state.homeName='DOMINICAN REPUBLIC';state.awayName='HAITI';render();fsmBoardRender();});assert(await page.locator('.team-name').evaluateAll(ns=>ns.every(n=>n.querySelector('.text').scrollWidth<=n.clientWidth-48+1)));}
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/cnl-scoreboard.png')});
await page.evaluate(()=>applyTheme('ligue1',null));await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='ligue1');assert(await page.locator('.cnl-curve').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).display==='none')));
assert.deepEqual(errors,[]);console.log('PASS CONCACAF auto/manual theme, gradients, circle radius, transitions and name fit');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
