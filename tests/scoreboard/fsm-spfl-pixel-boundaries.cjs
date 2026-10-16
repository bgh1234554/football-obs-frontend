const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/ScottishPremiership.svg'))return route.fulfill({body:fs.readFileSync(path.resolve(root,'../football-obs-logo-cdn/leagues/ScottishPremiership.svg')),contentType:'image/svg+xml'});if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




const {PNG}=require(path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
await page.evaluate(()=>{state.fsmTheme='spfl';state.homeName='HOME';state.awayName='AWAY';state.homeScore=0;state.awayScore=0;state.extraShown=false;Object.assign(state.colors,{homeBg:'#1018B0',homeText:'#ffffff',awayBg:'#006C32',awayText:'#ffffff'});autoApplyTemplateByLeagueId(179,null);render();});await page.waitForFunction(()=>!pendingThemeLink);
for(const scale of [75,100]) for(const aggregate of [false,true]){
await page.evaluate(({scale,aggregate})=>{state.boardScale=scale;state.aggEnabled=aggregate;render();fsmBoardRender();reapplyBoardScale();},{scale,aggregate});
const rects=await page.evaluate(()=>['.score-div','.epl-lion','#team-score-left','#team-score-right','#team-logo-left','#team-logo-right'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,height:r.height,width:r.width}}));
assert(Math.abs(rects[0].width-rects[1].width)<0.1);assert(Math.abs(rects[0].height-rects[1].height)<0.1);
if(!aggregate){
 const png=PNG.sync.read(await page.screenshot());
 for(const [index,edge,color] of [[2,'x',[16,24,176]],[3,'right',[0,108,50]]]){
 const r=rects[index];for(let y=Math.ceil(r.y)+6;y<r.y+r.height-6;y++)for(let x=Math.floor(r[edge])-2;x<=Math.floor(r[edge])+2;x++){
 const at=(y*png.width+x)*4,p=[...png.data.subarray(at,at+3)],alpha=(255-p[0])/(255-color[0]);
 assert(p.every((v,c)=>Math.abs(v-(255+(color[c]-255)*alpha))<4),JSON.stringify({scale,index,x,y,p}));
 }
 }
 for(const index of [4,5]){const r=rects[index],x=Math.floor(index===4?r.x+3:r.right-3);for(let y=Math.ceil(r.y)+6;y<r.y+r.height-6;y++){const at=(y*png.width+x)*4;assert.deepEqual([...png.data.subarray(at,at+3)],[184,166,120]);}}
}
}
assert.deepEqual(errors,[]);console.log('PASS SPFL 75/100% score boundary pixels, outer gold edges, aggregate and fitted logo');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
