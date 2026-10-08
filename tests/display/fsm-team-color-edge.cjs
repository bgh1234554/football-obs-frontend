const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





await page.addStyleTag({content:'* { transition:none !important;animation:none !important; }'});
for(const theme of ['default','pl','wc26','rpl','uel','uecl','cl','kleague','seriea','unl','acle','ligue1','ligue2','er24']){
 await page.evaluate(theme=>{state.fsmTheme=theme;state.colors.homeBg='#101010';state.colors.awayBg='#101010';state.colors.homeText='#ffffff';state.colors.awayText='#ffcc00';autoApplyTemplateByLeagueId(39,null);render();},theme);
 await page.waitForFunction(()=>!pendingThemeLink);await page.waitForTimeout(100);
 const result=await page.evaluate(()=>{const board=document.querySelector('.fsm-board');return {theme:board.dataset.fsmTheme,mode:board.dataset.fsmColorEdge,home:board.style.getPropertyValue('--fsm-home-number-color'),away:board.style.getPropertyValue('--fsm-away-number-color'),edges:['home','away'].map(side=>{const node=document.getElementById(side+'Color');const card=document.getElementById(side+'Card');return {chip:getComputedStyle(node).boxShadow,strip:getComputedStyle(card).boxShadow,kleagueStrip:getComputedStyle(card,'::after').boxShadow,content:getComputedStyle(card,'::after').content};})};});
 assert.equal(result.theme,theme);assert.equal(result.home,'#ffffff');assert.equal(result.away,'#ffcc00');
 if(['pl','wc26','uel','uecl'].includes(theme)){assert.equal(result.mode,'none');for(const edge of result.edges)assert.equal(edge.content,'none');}
 else {assert.equal(result.mode,theme==='rpl'?'chip':'strip');for(const edge of result.edges){const shadow=result.mode==='chip'?edge.chip:theme==='kleague'?edge.kleagueStrip:edge.strip;assert(shadow.includes('inset'));if(result.mode==='chip'){assert(shadow.includes('1px 0px 0px 0px'));assert(shadow.includes('-1px 0px 0px 0px'));}else assert(shadow.includes(theme==='kleague'?'0px 1px 0px 0px':'0px -1px 0px 0px'));}}
 if(theme==='cl'||theme==='rpl')await page.screenshot({path:'tests/display/team-color-edge-'+theme+'.png'});
}
assert.deepEqual(errors,[]);console.log('PASS number color outlines across 14 themes, EPL and World Cup excluded');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
