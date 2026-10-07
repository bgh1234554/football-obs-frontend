const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);


for(const theme of ['pl','seriea','wc26','ligue1','ligue2']){
 // 프리미어리그를 거쳐 전환하여 남아 있는 인라인 색상과 정렬 설정을 확인합니다.
 await page.evaluate(()=>applyTheme('pl',null));await page.waitForTimeout(100);
 await page.evaluate(theme=>theme==='ligue2'?autoApplyTemplateByLeagueId(62,'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'):applyTheme(theme,null),theme);await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>document.fonts.ready);
 if(theme==='ligue2'){
   assert((await page.locator('#fsm-theme-link').getAttribute('href')).endsWith('result_style_LIGUE2.css'));
   assert.equal(await page.locator('.score-div').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(0, 252, 208)');
   assert.equal(await page.locator('.extra-time').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(147, 82, 253)');
   assert((await page.locator('.epl-lion').getAttribute('src')).startsWith('data:image/svg+xml'));
 }
 for(const scale of (theme==='ligue1'?[60,100,150]:[100])){
 await page.evaluate(scale=>{state.boardScale=scale;render();},scale);
 for(const names of [['Short','B'],['스위스','북마케도니아'],['A Very Long Football Club Name','Another Long Team Name'],['A','B']]){
 await page.evaluate(names=>{state.homeName=names[0];state.awayName=names[1];state.homeScore=3;state.awayScore=12;render();fsmBoardRender();},names);
 const metrics=await page.evaluate(()=>[...document.querySelectorAll('.team-name')].map((name,i)=>{const text=name.querySelector('.text');const r=text.getBoundingClientRect();const c=name.parentElement.getBoundingClientRect();const marker=name.parentElement.querySelector('.team-color').getBoundingClientRect();const nr=name.getBoundingClientRect();return {color:getComputedStyle(text).color,center:r.x+r.width/2,target:themeTarget(i,c),name:{left:nr.left,right:nr.right},marker:{left:marker.left,right:marker.right},score:(()=>{const r=document.getElementById(i===0?'team-score-left':'team-score-right').getBoundingClientRect();return {left:r.left,right:r.right};})(),fits:text.scrollWidth<=name.clientWidth-parseFloat(getComputedStyle(name).paddingLeft)-parseFloat(getComputedStyle(name).paddingRight)+1};function themeTarget(i,c){const scale=c.width/name.parentElement.offsetWidth;if(_currentTheme==='pl')return c.x+(c.width+(i===0?-97:97)*scale)/2;const score=document.getElementById(i===0?'team-score-left':'team-score-right').getBoundingClientRect();const extra=_currentTheme==='wc26'?41*scale:0;return i===0?(c.left+score.left-extra)/2:(score.right+extra+c.right)/2;}}));
 metrics.forEach((m,i)=>{if(theme!=='pl')assert.equal(m.color,'rgb(255, 255, 255)');assert(Math.abs(m.center-m.target)<1,JSON.stringify({theme,names,m}));assert(m.fits);if(theme==='wc26'){if(i===0){assert(m.name.right<=m.marker.left);assert(m.marker.right<m.score.left);}else{assert(m.name.left>=m.marker.right);assert(m.marker.left>m.score.right);}}});
 }
 }
 await page.evaluate(()=>{state.homeName='\uB8E8\uB9C8\uB2C8\uC544';state.awayName='\uC2A4\uC6E8\uB374';state.homeScore=0;state.awayScore=1;state.colors.homeBg='#FEEA00';state.colors.awayBg='#F9DE52';state.boardScale=100;render();fsmBoardRender();});
 if(theme==='ligue1')await page.evaluate(()=>{state.homeName='스위스';state.awayName='북마케도니아';state.homeScore=3;state.awayScore=0;state.seconds=5400;render();fsmBoardRender();});
 fs.mkdirSync(path.join(root,'screenshots','fsm-clock-editor'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots','fsm-clock-editor',theme+'-name-layout.png')});
 console.log('PASS',theme,'white text, horizontal centering, reserved jersey zone, long-name fit and recovery');
}
await page.evaluate(()=>applyTheme('pl',null));await page.waitForFunction(()=>!pendingThemeLink);
for(const colors of [['#ffffff','#ff0000'],['#ff0000','#ffffff'],['#f9f9f9','#f0f0f0'],['#1d4ed8','#ff0000']]){
 const overlays=await page.evaluate(colors=>{state.colors.homeBg=colors[0];state.colors.awayBg=colors[1];fsmBoardRender();const board=document.querySelector('.fsm-board');return [board.style.getPropertyValue('--fsm-pl-home-overlay'),board.style.getPropertyValue('--fsm-pl-away-overlay')];},colors);
 overlays.forEach((overlay,i)=>{const white=['#ffffff','#f9f9f9','#f0f0f0'].includes(colors[i]);assert.equal(overlay,white?'#000000':'#ffffff');});
}
await page.evaluate(()=>{state.colors.homeBg='#ffffff';state.colors.awayBg='#ff0000';state.homeName='FULHAM';state.awayName='MAN UTD';render();fsmBoardRender();});
assert((await page.locator('.div-background').evaluate(e=>getComputedStyle(e).maskImage)).includes('background_pl2.png'));
await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots','fsm-clock-editor','pl-zigzag.png')});
console.log('PASS EPL: white/off-white inner region darkens independently per side; other colors retain light overlay');
assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
