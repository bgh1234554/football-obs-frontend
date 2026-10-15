const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/TFF1Lig.svg'))return route.fulfill({body:process.env.TFF1LIG_LOGO_PATH ? fs.readFileSync(process.env.TFF1LIG_LOGO_PATH) : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72"><path fill="red" d="M0 0H64V72H0Z"/></svg>',contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





for (const source of ['belgian', 'ligue1', 'seriea']) {
 await page.evaluate(source=>{state.fsmTheme=source;autoApplyTemplateByLeagueId(39,null);render();},source);
 await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.fsmTheme='auto';state.homeName='Istanbulspor';state.awayName='Sakaryaspor';state.homeScore=3;state.awayScore=2;state.colors.homeBg='#0088ff';state.colors.awayBg='#7722aa';state.extraShown=true;state.extra=4;autoApplyTemplateByLeagueId(204,null);render();});
 await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='tff1lig'&&document.querySelector('.epl-lion').naturalWidth>0);
 for(const scale of [60,100,150]) {
 await page.evaluate(scale=>{state.boardScale=scale;render();},scale);
 const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));const r=q=>document.querySelector(q).getBoundingClientRect();return {
 gradient:['.teams-left','.teams-right','#team-score-left','#team-score-right'].map(q=>s(q).backgroundImage),
 logos:['#team-logo-left','#team-logo-right'].map(q=>s(q).backgroundColor),center:s('.score-div').backgroundColor,
 clock:[s('.time').backgroundColor,s('.time').color],extra:[s('.extra-time').backgroundColor,s('.extra-time').color],
 strips:['.teams-left','.teams-right'].map(q=>[s(q).borderBottomWidth,s(q).borderBottomColor]),edge:document.querySelector('#board').dataset.fsmColorEdge,
 dividers:[['#team-score-left','::before'],['#team-score-right','::after']].map(([q,p])=>{const x=getComputedStyle(document.querySelector(q),p);return [x.content,x.width,x.top,x.bottom];}),
 logoDividers:['#team-logo-left','#team-logo-right'].flatMap(q=>['::before','::after'].map(p=>getComputedStyle(document.querySelector(q),p).content)),
 overflow:r('.epl-lion').top<r('.score-div').top, bottom:Math.abs(r('.epl-lion').bottom-r('.score-div').bottom),
 text:['#homeName','#awayName'].map(q=>s(q).justifyContent)};});
 assert(m.gradient.every(g=>g==='linear-gradient(rgb(19, 34, 42), rgb(8, 21, 27))'),JSON.stringify(m));
 assert.deepEqual(m.logos,['rgb(245, 245, 245)','rgb(245, 245, 245)']);assert.equal(m.center,'rgb(255, 255, 255)');
 assert.deepEqual(m.clock,['rgb(255, 255, 255)','rgb(8, 21, 27)']);assert.deepEqual(m.extra,['rgb(179, 0, 0)','rgb(255, 255, 255)']);
 assert.deepEqual(m.strips,[['5px','rgb(0, 136, 255)'],['5px','rgb(119, 34, 170)']]);assert.equal(m.edge,'strip');
 assert(m.dividers.every(d=>JSON.stringify(d)===JSON.stringify(['""','1px','10px','10px'])));assert(m.logoDividers.every(v=>v==='none'));
 assert(m.overflow);assert(m.bottom<1);assert.deepEqual(m.text,['center','center']);
 }
}
await page.evaluate(()=>{state.boardScale=100;state.fsmTheme='tff1lig';autoApplyTemplateByLeagueId(39,null);render();});
await page.waitForFunction(()=>!pendingThemeLink);
assert.equal(await page.locator('#board').getAttribute('data-fsm-theme'),'tff1lig');
assert.equal(await page.locator('#fsmThemeSelect option[value="tff1lig"]').count(),1);
for (const scale of [60,100,150]) {
 await page.evaluate(scale=>{state.boardScale=scale;state.aggEnabled=true;state.aggHomeBase=2;state.aggAwayBase=3;state.homeScore=1;state.awayScore=1;render();fsmBoardRender();},scale);
 const m=await page.evaluate(()=>{const r=q=>document.querySelector(q).getBoundingClientRect();const s=q=>getComputedStyle(document.querySelector(q));const hl=r('#totalScoreLeft'),al=r('#totalScoreRight'),hs=r('#team-score-left'),as=r('#team-score-right');return {
 enabled:document.querySelector('#board').dataset.fsmAggregate,
 values:['#totalScoreLeft','#totalScoreRight'].map(q=>document.querySelector(q).textContent),
 fonts:['.total-score','.team-score'].map(q=>parseFloat(s(q).fontSize)),
 backgrounds:[...document.querySelectorAll('.total-score')].map(n=>getComputedStyle(n).backgroundImage),
 order:hl.right<=hs.left&&as.right<=al.left,
 innerSeparators:[['#team-score-left','::before'],['#team-score-right','::after']].map(([q,p])=>{const x=getComputedStyle(document.querySelector(q),p);return [x.content,x.top,x.bottom,x.width];}),
 separators:[...document.querySelectorAll('.total-score')].map(n=>{const p=getComputedStyle(n,'::before');return [p.top,p.bottom,p.width];})};});
 assert.equal(m.enabled,'true');assert.deepEqual(m.values,['3','4']);assert(m.fonts[0]<m.fonts[1]);assert(m.order,JSON.stringify(m));
 assert(m.innerSeparators.every(s=>JSON.stringify(s)===JSON.stringify(['""','10px','10px','1px'])));
 assert(m.backgrounds.every(g=>g==='linear-gradient(rgb(19, 34, 42), rgb(8, 21, 27))'));assert(m.separators.every(s=>JSON.stringify(s)===JSON.stringify(['10px','10px','1px'])));
}
await page.evaluate(()=>{state.boardScale=100;render();});
await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tff1lig-aggregate-scoreboard.png')});
await page.evaluate(()=>{state.aggEnabled=false;render();fsmBoardRender();});
assert.equal(await page.locator('#board').getAttribute('data-fsm-aggregate'),'false');
assert.equal(await page.locator('.total-score').first().evaluate(n=>getComputedStyle(n).display),'none');
await page.evaluate(()=>{state.half='PK';render();fsmBoardRender();});
const pso=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));return {background:s('.pso-main').backgroundColor,ink:s('.pso-middle').color,clockBackground:s('.time').backgroundColor,clockInk:s('.time').color};});
assert.equal(pso.background,pso.clockBackground);assert.equal(pso.ink,pso.clockInk);
assert.equal(pso.background,'rgb(255, 255, 255)');assert.equal(pso.ink,'rgb(8, 21, 27)');
await page.evaluate(()=>{state.half='1H';render();fsmBoardRender();});
await page.evaluate(()=>{state.fsmTheme='auto';autoApplyTemplateByLeagueId(206,null);render();fsmBoardRender();});
await page.waitForFunction(()=>!pendingThemeLink);
assert.equal(await page.locator('#board').getAttribute('data-fsm-theme'),'turkishcup');
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/TurkishCup.svg');
await page.evaluate(()=>{autoApplyTemplateByLeagueId(204,null);render();fsmBoardRender();});
await page.waitForFunction(()=>!pendingThemeLink);
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/TFF1Lig.svg');
for (const theme of ['turkishcup','tff1lig','turkishcup']) {
 await page.selectOption('#fsmThemeSelect',theme,{force:true});
 await page.waitForFunction(()=>!pendingThemeLink);
 await page.evaluate(()=>{state.aggEnabled=true;state.half='PK';fsmBoardRender();});
 const m=await page.evaluate(()=>{const s=q=>getComputedStyle(document.querySelector(q));return {theme:_currentTheme,aggregate:document.querySelector('#board').dataset.fsmAggregate,css:oldlink.getAttribute('href'),logo:document.querySelector('.epl-lion').getAttribute('src'),font:s('.total-score').fontSize,pso:[s('.pso-main').backgroundColor,s('.pso-middle').color],names:['#homeName','#awayName'].map(q=>s(q).justifyContent),gradient:s('.teams-left').backgroundImage};});
 assert.equal(m.theme,theme);assert.equal(m.aggregate,'true');assert(m.css.endsWith('result_style_TFF1LIG.css'));
 assert(m.logo.endsWith(theme==='turkishcup'?'TurkishCup.svg':'TFF1Lig.svg'));assert.equal(m.font,'20px');
 assert.deepEqual(m.pso,theme==='turkishcup'?['rgb(229, 22, 54)','rgb(255, 255, 255)']:['rgb(255, 255, 255)','rgb(8, 21, 27)']);assert.deepEqual(m.names,['center','center']);assert.equal(m.gradient,'linear-gradient(rgb(19, 34, 42), rgb(8, 21, 27))');
}
const scoreStyle=()=>[...document.querySelectorAll('.team-score')].map(n=>{const s=getComputedStyle(n),t=getComputedStyle(n.querySelector('span'));return [s.width,s.fontFamily,s.fontSize,s.fontWeight,t.display,t.lineHeight,t.transform,t.textShadow];});
await page.evaluate(()=>{state.fsmTheme='uzbek';autoApplyTemplateByLeagueId(369,null);render();});
await page.waitForFunction(()=>!pendingThemeLink);
const uzbekScores=await page.evaluate(scoreStyle);
await page.selectOption('#fsmThemeSelect','turkishcup',{force:true});
await page.waitForFunction(()=>!pendingThemeLink);
assert.deepEqual(await page.evaluate(scoreStyle),uzbekScores);
assert.deepEqual(await page.locator('.extra-time').evaluate(n=>{const s=getComputedStyle(n);return [s.backgroundColor,s.color];}),['rgb(229, 22, 54)','rgb(255, 255, 255)']);
assert.deepEqual(await page.locator('.time').evaluate(n=>{const s=getComputedStyle(n);return [s.backgroundColor,s.color];}),['rgb(208, 212, 216)','rgb(4, 25, 47)']);
await page.evaluate(()=>{state.half='1H';state.aggEnabled=false;fsmBoardRender();});
await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/turkishcup-scoreboard.png')});
await page.selectOption('#fsmThemeSelect','tff1lig',{force:true});
await page.evaluate(()=>fsmBoardRender());
assert.equal(await page.locator('.team-score').first().evaluate(n=>getComputedStyle(n).fontSize),'32px');
assert.deepEqual(errors,[]);
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots/tff1lig-scoreboard.png')});
console.log('PASS TFF 1. Lig automatic/manual mapping, theme switching, gradients, logo overflow, dividers and horizontal colors at 60/100/150%');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
