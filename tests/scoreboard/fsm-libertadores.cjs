const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/CopaLibertadores.svg'))return route.fulfill({response:await route.fetch()});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);






for (const source of ['belgian', 'rpl', 'pl']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);
 await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='River Plate';state.awayName='Botafogo';state.homeScore=3;state.awayScore=2;state.colors.homeBg='#0088ff';state.colors.awayBg='#7722aa';autoApplyTemplateByLeagueId(13,null);render();});
 await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='libertadores');
 assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CopaLibertadores.svg');
 for (const aggregate of [false,true]) {
  await page.evaluate(aggregate=>{state.aggEnabled=aggregate;state.aggHomeBase=4;state.aggAwayBase=3;render();fsmBoardRender();},aggregate);
  for (const scale of [.6,1,1.5,2]) {
   await page.evaluate(scale=>{state.boardScale=scale*100;render();fsmBoardRender();},scale);
   const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,height:b.height};};return {theme:document.querySelector('.fsm-board').dataset.fsmTheme,aggregate:document.querySelector('.fsm-board').dataset.fsmAggregate,colors:['.teams-left','.teams-right'].map(q=>({rect:r(q),height:s(q).height,bg:s(q).backgroundColor,border:s(q).borderBottom,shadow:s(q).boxShadow})),dividers:['#team-score-left','#team-score-right'].map(q=>{const p=getComputedStyle(document.querySelector(q),q.endsWith('left')?'::after':'::before');return {top:p.top,bottom:p.bottom,width:p.width,bg:p.backgroundImage}}),outline:getComputedStyle(document.querySelector('.scoreboard-main'),'::after').backgroundImage,borders:['.scoreboard-main','.teams-left','.teams-right'].map(q=>[s(q).borderLeftWidth,s(q).borderRightWidth]),fits:[...document.querySelectorAll('.team-name')].every(n=>n.querySelector('.text').getBoundingClientRect().width<=n.getBoundingClientRect().width+1)};});
   assert.equal(m.aggregate,String(aggregate));assert(m.fits,JSON.stringify(m));
   assert.deepEqual(m.colors.map(c=>c.border),['7px solid rgb(0, 136, 255)','7px solid rgb(119, 34, 170)']);assert(m.colors.every(c=>c.rect.width>c.rect.height));
   assert(m.dividers.every(d=>d.top==='11px'&&d.bottom==='11px'&&d.width==='2px'&&!d.bg.includes('to right')&&d.bg.includes('rgb(242, 218, 130)')&&d.bg.includes('rgb(163, 122, 58)')),JSON.stringify(m));
   assert(m.outline.includes('to right'));assert(m.outline.includes('rgb(242, 218, 130)')&&m.outline.includes('rgb(163, 122, 58)'));assert(m.borders.flat().every(b=>b==='0px'));
  }
 }
}
await page.evaluate(()=>{state.fsmTheme='libertadores';state.aggEnabled=true;state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(39,null);render();});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='libertadores');
const logoLines=await page.evaluate(()=>[getComputedStyle(document.querySelector('#team-logo-left'),'::after').content,getComputedStyle(document.querySelector('#team-logo-right'),'::before').content]);assert.deepEqual(logoLines,['none','none']);
assert.equal(await page.locator('#fsmThemeSelect option[value="libertadores"]').count(),1);
const palette=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));return {clock:[s('.time').backgroundImage,s('.time').color],extra:[s('.extra-time').backgroundColor,s('.extra-time').color],total:[s('.total').backgroundImage,s('.total').backgroundClip,s('.total').color],chips:[...document.querySelectorAll('.teams-left,.teams-right')].map(n=>{const r=n.getBoundingClientRect();return document.elementsFromPoint(r.x+r.width/2,r.bottom-1).includes(n)})};});
assert(palette.clock[0].includes('to right'));assert.equal(palette.clock[1],'rgb(0, 0, 0)');assert(palette.clock[0].includes('rgb(242, 218, 130)'));assert.deepEqual(palette.extra,['rgb(0, 0, 0)','rgb(242, 218, 130)']);assert.equal(palette.total[1],'text');assert(palette.total[0].includes('rgb(163, 122, 58)'));assert(palette.chips.every(Boolean),JSON.stringify(palette));
await page.evaluate(()=>{state.half='PK';state.pk.home=['G','M'];state.pk.away=['G'];render();fsmBoardRender();});
const pso=await page.locator('.pso-main').evaluate(n=>[getComputedStyle(n).backgroundImage,getComputedStyle(n).color]);assert.deepEqual(pso,palette.clock);
assert.deepEqual(errors,[]);
await page.evaluate(()=>{state.half='2H';state.boardScale=100;render();fsmBoardRender();});
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/libertadores-scoreboard.png')});
console.log('PASS Libertadores auto/manual theme, transitions, Ligue 1 team color borders, gold borders and dividers, aggregate and 4 scales');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

