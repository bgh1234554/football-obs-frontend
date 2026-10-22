const assert=require('node:assert/strict');const path=require('node:path');const {tmpdir}=require('node:os');const {chromium}=require('playwright');const {openPage,settle}=require('../tactics/helpers');
// 합계 칸을 지원하는 모든 테마에서 양쪽 접합부를 직접 검사합니다.
async function checkAggregateScoreJoins(browser) {
 for (const dpr of [1,1.25,2]) {
  const page=await openPage(browser,{dpr,platform:'Win32',viewport:{width:1335,height:650}});
  try {
   await page.addStyleTag({content:'#board :is(img,.score-left,.score-right,.total,.hipen) {visibility:hidden!important}'});
   const themes=await page.evaluate(()=>Object.keys(FSM_THEMES));
   for (const theme of themes) {
    await page.evaluate(theme=>{state.fsmTheme=theme;state.aggEnabled=true;state.aggHomeBase=3;state.aggAwayBase=2;state.homeScore=4;state.awayScore=1;state.homeName='코모';state.awayName='맨체스터 유나이티드';state.noteEnabled=true;state.notes={home:'2′, 57′ 니코 파스\n76′ 하코보 라몬',away:'90+1′ 조슈아 지르크지'};applyTheme(theme,null);render();fsmBoardRender();},theme);
    await page.waitForFunction(()=>!pendingThemeLink);
    if (!await page.evaluate(()=>document.getElementById('board').dataset.fsmAggregate==='true')) continue;
    for (const scale of [50,85,125]) {
     await page.evaluate(scale=>{state.boardScale=scale;render();fsmBoardRender();},scale);await settle(page);
     const g=await page.evaluate(()=>{
      const rect=n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {x:r.x,y:r.y,width:r.width,height:r.height,transform:s.transform,bg:s.backgroundColor,image:s.backgroundImage,clip:s.clipPath};};
      const pairs=['Left','Right'].map((side,i)=>({side,total:rect(document.getElementById('totalScore'+side).parentElement),score:rect(document.getElementById(i?'team-score-right':'team-score-left'))}));
      const boxes=pairs.flatMap(p=>[p.total,p.score]);const x=Math.floor(Math.min(...boxes.map(b=>b.x)))-2,y=Math.floor(Math.min(...boxes.map(b=>b.y)))-1;
      return {pairs,clip:{x,y,width:Math.ceil(Math.max(...boxes.map(b=>b.x+b.width)))-x+2,height:Math.ceil(Math.max(...boxes.map(b=>b.y+b.height)))-y+1}};
     });
     const png=await page.screenshot({clip:g.clip});
     const m=await page.evaluate(async ({png,g,dpr,theme})=>{
      const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,img.width,img.height).data;
      const pixel=(x,y)=>{const i=(y*img.width+x)*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
      const edge=(b,y,right)=>{const m=new DOMMatrix(b.transform==='none'?undefined:b.transform);const shear=m.c/m.d*b.height;const left=b.x+Math.max(0,-shear)+shear*(y-b.y)/b.height;return left+(right?b.width-Math.abs(shear):0);};
      return g.pairs.map(p=>{
       const [left,right]=p.total.x+p.total.width/2<p.score.x+p.score.width/2?[p.total,p.score]:[p.score,p.total];let gap=-Infinity,deviation=0,pattern=0;
       const same=p.total.image==='none'&&p.score.image==='none'&&p.total.bg===p.score.bg&&p.total.bg!=='rgba(0, 0, 0, 0)'&&p.total.clip==='none'&&p.score.clip==='none';const color=p.total.bg.match(/[\d.]+/g).slice(0,3).map(Number);
       for(const t of [.25,.5,.75]) {
        const y=Math.max(left.y,right.y)+Math.min(left.height,right.height)*t;const a=edge(left,y,true),b=edge(right,y,false);gap=Math.max(gap,(b-a)*dpr);
        // 기울어진 칸도 각 높이에서 실제 사선 경계를 따라 배경색을 비교합니다.
        if(same)for(let dx=-2;dx<=2;dx++){const c=pixel(Math.round(((a+b)/2-g.clip.x)*dpr)+dx,Math.floor((y-g.clip.y)*dpr));deviation=Math.max(deviation,...c.map((v,k)=>Math.abs(v-color[k])));}
       }
       if(theme==='singapore')for(let y=Math.ceil((p.total.y-g.clip.y)*dpr)+1;y<Math.floor((p.total.y+p.total.height-g.clip.y)*dpr)-1;y++)for(let x=Math.ceil((p.total.x-g.clip.x)*dpr)+1;x<Math.floor((p.total.x+p.total.width-g.clip.x)*dpr)-1;x++){const [r,g,b]=pixel(x,y);if(r>g*2&&r>b*1.5)pattern++;}
       return {side:p.side,gap,deviation,same,pattern};
      });
     },{png:png.toString('base64'),g,dpr,theme});
     for(const pair of m){const context=JSON.stringify({theme,scale,dpr,...pair});assert(pair.gap<.1,context);assert(pair.deviation<=2,context);if(theme==='singapore')assert(pair.pattern>0,context);}
    }
    console.log('PASS aggregate/main joints',theme,'DPR',dpr);
   }
  } finally {await page.close();}
 }
}
// 단색과 그라데이션 점수 배경 모두 축소·이동 후 이음새에 어두운 틈이 없어야 합니다.
async function checkScoreBackgroundJoins(browser) {
 for (const dpr of [1, 1.25, 2]) {
  const page = await openPage(browser, {dpr, platform:'Win32', viewport:{width:1400,height:650}});
  try {
   await page.addStyleTag({content: '#board :is(img,.score-left,.score-right,.total,.hipen) { visibility: hidden !important; }'});
   for (const theme of ['eflchampionship','eflleagueone','eflleaguetwo','belarus','russiancup','kazakh','czech','unl','default','cl']) {
    await page.evaluate(theme => {
     state.fsmTheme=theme; state.homeName='코모'; state.awayName='맨체스터 유나이티드';
     state.homeScore=4; state.awayScore=1; state.aggHomeBase=3; state.aggAwayBase=2;
     state.noteEnabled=true; state.notes={home:"2′, 57′ 니코 파스\n49′ 두비카스\n76′ 하코보 라몬",away:"90+1′ 조슈아 지르크지"};
     applyTheme(theme,null);
    }, theme);
    await page.waitForFunction(() => !pendingThemeLink);
    const scales = dpr === 1 ? Array.from({length:76}, (_,i) => 50+i) : [50,67,75,80,85,90,100,110,125];
    for (const aggregate of [false,true]) for (const scale of scales) for (const position of (scale === 75 || scale === 85 ? ['left','center','right'] : ['center'])) {
     await page.evaluate(({scale,position,aggregate}) => { state.aggEnabled=aggregate; state.boardScale=scale; state.boardPosition=position; render(); fsmBoardRender(); }, {scale,position,aggregate});
     await settle(page);
     const geometry = await page.evaluate(() => {
      const left=document.getElementById('team-score-left').getBoundingClientRect();
      const right=document.getElementById('team-score-right').getBoundingClientRect();
      const x=Math.floor(left.left), y=Math.floor(left.top);
      return {clip:{x,y,width:Math.ceil(right.right)-x,height:Math.ceil(left.bottom)-y},left:left.left-x,right:right.right-x,top:left.top-y,height:left.height};
     });
     const png = await page.screenshot({clip:geometry.clip});
     const discontinuity = await page.evaluate(async ({png,g,dpr,gradient}) => {
      const img=new Image(); img.src='data:image/png;base64,'+png; await img.decode();
      const canvas=document.createElement('canvas'); canvas.width=img.width; canvas.height=img.height;
      const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0);
      let max=0;
      // 숫자에 닿지 않는 위아래 배경만 비교하고 테마 색상 자체는 고정하지 않습니다.
      for (const fraction of [.1,.9]) {
       const y=Math.floor((g.top+g.height*fraction)*dpr);
       const x0=Math.ceil((g.left+3)*dpr), x1=Math.floor((g.right-3)*dpr);
       const row=ctx.getImageData(x0,y,x1-x0,1).data;
       if (gradient) {
        // 그라데이션은 일정한 색 대신 주변보다 갑자기 어두워지는 세로선을 검사합니다.
        for (let i=8;i<row.length-8;i+=4) {
         // 의도된 색상 전환은 제외하고 비슷한 색 사이에 끼어든 어두운 선만 검사합니다.
         if (Math.max(...[0,1,2].map(c=>Math.abs(row[i-8+c]-row[i+8+c]))) >= 14) continue;
         for(let c=0;c<3;c++) max=Math.max(max,Math.min(row[i-8+c],row[i+8+c])-row[i+c]);
        }
       } else {
        for (let i=4;i<row.length;i+=4) for(let c=0;c<3;c++) max=Math.max(max,Math.abs(row[i+c]-row[c]));
       }
      }
      return max;
     }, {png:png.toString('base64'),g:geometry,dpr,gradient:['belarus','kazakh','czech','cl'].includes(theme)});
     assert(discontinuity <= (['belarus','kazakh','czech','cl'].includes(theme) ? 4 : 2), JSON.stringify({theme,scale,position,dpr,aggregate,discontinuity}));
    }
    console.log('PASS continuous score background',theme,'DPR',dpr);
   }
  } finally { await page.close(); }
 }
}

(async()=>{const browser=await chromium.launch();try{const page=await openPage(browser,{dpr:1,platform:'Win32',viewport:{width:1920,height:1080}});await checkScoreBackgroundJoins(browser);await checkAggregateScoreJoins(browser);const themes=await page.evaluate(()=>Object.keys(FSM_THEMES));for(const theme of themes){await page.evaluate(theme=>{state.homeName='Home Team';state.awayName='Away Team';state.homeScore=10;state.awayScore=2;applyTheme(theme,null);render();},theme);await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>document.fonts.ready);for(const scale of [60,75,100,125,150]){await page.evaluate(scale=>{state.boardScale=scale;render();fsmBoardRender();},scale);await settle(page);const m=await page.evaluate(()=>{const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};return {scores:[rect('#team-score-left'),rect('#team-score-right')],center:rect('.score-div'),card:rect('.teams-left')};});if(theme==='pl'||theme==='seriea'||theme==='dfb'){/* 가운데 로고가 점수판 위아래로 나오는 디자인(DFB-포칼 트로피 포함) */assert(m.center.height>m.card.height);}else{for(const r of [...m.scores,m.center]){assert(Math.abs(r.top-m.card.top)<.1,JSON.stringify({theme,scale,m}));assert(Math.abs(r.bottom-m.card.bottom)<.1,JSON.stringify({theme,scale,m}));}}}if(['kleague','seriea'].includes(theme)){
const edges=await page.evaluate(()=>['home','away'].map(side=>{
 const score=document.getElementById(side==='home'?'team-score-left':'team-score-right');
 const box=score.getBoundingClientRect();const scale=box.height/score.offsetHeight;
 // 점수 숫자와 우상단 대각선 끝이 팀 패널 위에 보이는지 hit-test한다.
 const text=score.querySelector('span').getBoundingClientRect();
 const hit=document.elementFromPoint(text.x+text.width/2,text.y+text.height/2);
 const diagonalHit=document.elementFromPoint(box.right-2*scale,box.top+2*scale);
 return {transform:getComputedStyle(score).transform,visible:score.contains(hit),diagonalVisible:score.contains(diagonalHit)};
}));
assert.equal(edges[0].transform,edges[1].transform);assert(edges.every(edge=>edge.visible),JSON.stringify(edges));
if(theme==='kleague'){
 assert(edges.every(edge=>edge.diagonalVisible));
 const gap=await page.evaluate(()=>{const card=document.getElementById('awayCard');const edge=getComputedStyle(card,'::after');const score=document.getElementById('team-score-right');const scale=score.getBoundingClientRect().height/score.offsetHeight;const expected=score.offsetHeight/2*Math.tan(10*Math.PI/180);return {extension:parseFloat(edge.width),expected,background:edge.backgroundColor};});
 assert(gap.extension>gap.expected);
 const stripeEnds=await page.evaluate(()=>['home','away'].map(side=>{const style=getComputedStyle(document.getElementById(side+'Card'),'::after');return {left:style.left,right:style.right};}));
 assert.equal(stripeEnds[0].right,'4px');assert.equal(stripeEnds[1].left,'-4px');assert.notEqual(gap.background,'rgba(0, 0, 0, 0)');
}
}
if(['fnl','ligue1','kleague','wc26','cl'].includes(theme)){await page.locator('#board').screenshot({path:path.join(tmpdir(),`fsm-edges-${theme}.png`)});}console.log('PASS',theme);} }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
