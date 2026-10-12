const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);



for(const theme of ['pl','unl']){
await page.evaluate(theme=>applyTheme(theme,null),theme);await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>document.fonts.ready);
for(const pair of [['본머스','리버풀'],['루마니아','스웨덴'],['FULHAM','MAN UTD'],['맨체스터 유나이티드','울버햄프턴 원더러스']]){
 await page.evaluate(pair=>{state.homeName=pair[0];state.awayName=pair[1];state.colors.homeBg='#cc0000';state.colors.awayBg='#cc0000';render();fsmBoardRender();},pair);
 for(const index of [0,1]){const e=page.locator('.team-name').nth(index);const png=theme==='pl'?await e.screenshot():await page.screenshot({clip:await e.evaluate(e=>{const r=e.getBoundingClientRect(),c=e.parentElement.getBoundingClientRect();return {x:r.x+2,y:c.y,width:r.width-4,height:c.height};})});const metric=await page.evaluate(async ({base64,black})=>{const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let top=c.height,bottom=-1;for(let y=0;y<c.height;y++)for(let x=2;x<c.width-2;x++){const i=(y*c.width+x)*4;if(black?d[i]<50&&d[i+1]<50&&d[i+2]<50:d[i]>230&&d[i+1]>230&&d[i+2]>230){top=Math.min(top,y);bottom=Math.max(bottom,y);}}return {height:c.height,top,bottom,error:(top+bottom+1-c.height)/2};},{base64:png.toString('base64'),black:theme==='unl'});assert(metric.bottom>=metric.top);assert(Math.abs(metric.error)<=0.5,JSON.stringify({name:pair[index],metric}));console.log(pair[index],metric);}
}
}
assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
