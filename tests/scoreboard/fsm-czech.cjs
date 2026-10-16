const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





for (const source of ['ligue1','rpl','pl']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Sparta Praha';state.awayName='Slavia Praha';state.homeScore=3;state.awayScore=2;state.colors.homeBg='#0088ff';state.colors.awayBg='#7722aa';state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(345,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='czech');await page.evaluate(()=>render());
 const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {left:b.left,right:b.right};};return {bg:['.teams-left','.teams-right','.team-score','.score-div','.team-logo'].map(q=>s(q).backgroundColor),fg:s('.team-score').color,clock:[s('.time').backgroundColor,s('.time').color],extra:[s('.extra-time').backgroundColor,s('.extra-time').color],edge:document.querySelector('.fsm-board').dataset.fsmColorEdge,home:r('#homeColor'),hs:r('#team-score-left'),away:r('#awayColor'),as:r('#team-score-right'),border:s('.teams-left').borderBottomWidth,chip:[s('#homeColor').backgroundColor,s('#awayColor').backgroundColor],divider:['#team-score-left','.team-logo'].map(q=>{const p=getComputedStyle(document.querySelector(q),'::after');return [p.top,p.bottom,p.width,p.backgroundColor];})};});
 assert.deepEqual(m.bg,['rgb(24, 30, 115)','rgb(24, 30, 115)','rgba(0, 0, 0, 0)','rgb(174, 255, 0)','rgb(245, 245, 245)']);assert.equal(m.fg,'rgb(24, 30, 115)');assert.deepEqual(m.clock,['rgb(48, 65, 195)','rgb(255, 255, 255)']);assert.deepEqual(m.extra,['rgb(24, 30, 115)','rgb(255, 255, 255)']);assert.equal(m.edge,'strip-top');assert.equal(m.border,'0px');
 const strip=await page.locator('#homeCard').evaluate(n=>{const s=getComputedStyle(n);return [s.borderTopWidth,s.borderTopColor,s.boxShadow];});assert.deepEqual(strip,['5px','rgb(0, 136, 255)','rgb(255, 255, 255) 0px 1px 0px 0px inset']);
 const geometry=await page.evaluate(()=>{const b=document.querySelector('.fsm-board');const s=getComputedStyle(b);const home=document.querySelector('#team-score-left');const hs=getComputedStyle(home,'::before');return [hs.clipPath,hs.backgroundColor,parseFloat(s.getPropertyValue('--fsm-name-reserved-width')),parseFloat(s.getPropertyValue('--fsm-score-overlap'))];});assert.equal(geometry[0],'polygon(15px 0px, 100% 0px, 100% 100%, 0px 100%)');assert.equal(geometry[1],'rgb(255, 255, 255)');assert.equal(geometry[2],geometry[3]);
 assert.equal(await page.locator('#homeName').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');
}
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CzechFirstLeagueTransparent.svg');
await page.evaluate(()=>{state.fsmTheme='czech';autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='czech');await page.evaluate(()=>render());
assert.equal(await page.locator('#fsmThemeSelect option[value="czech"]').count(),1);assert.deepEqual(errors,[]);
assert.deepEqual(await page.locator('.epl-lion').evaluate(n=>{const s=getComputedStyle(n);return [s.height,s.paddingTop,s.paddingBottom];}),['48px','5px','5px']);
const options=await page.locator('#fsmThemeSelect option').evaluateAll(nodes=>nodes.map(n=>n.value));/* 기타 유럽 리그 묶음(러시아 컵 다음, 챔피언스리그 앞)에 있어야 한다. 묶음 안 순서는 UEFA 계수에 따라 바뀔 수 있다. */assert(options.indexOf('czech')>options.indexOf('russiancup')&&options.indexOf('czech')<options.indexOf('cl'),JSON.stringify(options));
const scoreImage=await page.locator('#team-score-left').screenshot();
const edge=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const firstWhite=y=>{const row=ctx.getImageData(0,y,img.width,1).data;for(let x=0;x<img.width;x++){if(row[x*4]>240&&row[x*4+1]>240&&row[x*4+2]>240)return x;}return -1;};return {top:firstWhite(1),bottom:firstWhite(img.height-2),height:img.height};},scoreImage.toString('base64'));
assert(edge.top>edge.bottom,JSON.stringify(edge));assert(Math.abs((edge.top-edge.bottom)/edge.height-15/48)<0.1,JSON.stringify(edge));
fs.mkdirSync(path.join(root,'screenshots/tests'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tests/czech-scoreboard.png')});console.log('PASS Czech theme colors, top strip inward edge, trapezoid geometry and logo padding');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
