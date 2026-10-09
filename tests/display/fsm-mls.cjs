const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





for (const source of ['eredivisie', 'pl', 'rpl', 'uel']) {
 await page.evaluate(t=>{state.fsmTheme=t;autoApplyTemplateByLeagueId(39,null);render();},source);
 await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Inter Miami CF';state.awayName='Los Angeles Football Club';state.homeScore=3;state.awayScore=2;state.colors.homeBg='#880000';state.colors.homeText='#220000';state.colors.awayBg='#eeeeee';state.colors.awayText='#ffffff';state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(253,null);render();});
 await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='mls');
 await page.evaluate(async()=>{await document.fonts.ready;fsmBoardRender();});
 const m=await page.evaluate(()=>{
  const s=q=>getComputedStyle(document.querySelector(q));
  const r=q=>document.querySelector(q).getBoundingClientRect();
  return {panels:['#homeCard','#awayCard','#team-score-left','#team-score-right'].map(q=>[s(q).backgroundColor,s(q).backgroundImage]),names:['#homeName .text','#awayName .text'].map(q=>[s(q).color,s(q).webkitTextStrokeWidth]),scores:['#team-score-left','#team-score-right'].map(q=>s(q).color),divider:[s('.divider').height,s('.divider').backgroundColor,r('.divider').top-r('.scoreboard-main').top],clock:[s('.time').backgroundColor,s('.time').color],extra:[s('.extra-time').backgroundColor,s('.extra-time').color],chips:['#homeColor','#awayColor'].map(q=>[s(q).width,s(q).backgroundColor,s(q).backgroundImage]),edges:[r('#homeColor').right-r('#team-score-left').left,r('#awayColor').left-r('#team-score-right').right]};
 });
 assert.deepEqual(m.panels,Array(4).fill(['rgb(225, 227, 231)','none']));
 assert.deepEqual(m.names,Array(2).fill(['rgb(0, 0, 0)','0px']));
 assert.deepEqual(m.scores,Array(2).fill('rgb(0, 0, 0)'));
 assert.deepEqual(m.divider,['48px','rgb(134, 136, 140)',0]);
 assert.deepEqual(m.clock,['rgb(39, 44, 47)','rgb(216, 218, 222)']);
 assert.deepEqual(m.extra,['rgb(216, 218, 222)','rgb(39, 44, 47)']);
 assert.deepEqual(m.chips,[['28px','rgb(136, 0, 0)','none'],['28px','rgb(238, 238, 238)','none']]);
 assert(m.edges.every(n=>Math.abs(n)<0.01),JSON.stringify(m));
}
assert.equal(await page.locator('#fsmThemeSelect option[value="mls"]').count(),1);
await page.evaluate(()=>{state.fsmTheme='mls';autoApplyTemplateByLeagueId(39,null);render();});
await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='mls');
for(const width of [640,1920]) {
 await page.setViewportSize({width,height:900});
 await page.evaluate(()=>{render();fsmBoardRender();});
 const fits=await page.locator('.team-name').evaluateAll(ns=>ns.every(n=>n.querySelector('.text').scrollWidth<=n.clientWidth-48+1));assert(fits);
}
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/mls-scoreboard.png')});
assert.deepEqual(errors,[]);console.log('PASS MLS colors, full divider, primary strips, theme transitions, manual selection and viewport fit');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
