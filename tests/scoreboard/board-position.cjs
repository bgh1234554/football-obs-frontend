require('../tactics/helpers');
﻿const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.ttf': 'font/ttf', '.woff': 'font/woff'
      }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');

    for (const theme of await page.evaluate(() => Object.keys(FSM_THEMES))) {
      await page.evaluate(theme=>applyTheme(theme,null),theme);
      await page.waitForFunction(()=>!pendingThemeLink);
      for(const scale of [50,75,100]) for(const position of ['left','center','right']) for(const home of ['',"12' Home player"]) for(const away of ['',"65' Away player"]) for(const enabled of [true,false]) {
        const r=await page.evaluate(({scale,position,home,away,enabled})=>{
          state.boardPosition=position; state.boardScale=scale; state.notes={home,away}; state.noteEnabled=enabled; state.manualMode=false;
          render(); fsmBoardRender();
          const board=document.getElementById('board').getBoundingClientRect();
          const wrap=document.getElementById('boardStageWrap').getBoundingClientRect();
          const boxes=['homeNoteSide','awayNoteSide'].map(id=>document.getElementById(id)).filter(n=>enabled&&n.offsetWidth).map(n=>n.getBoundingClientRect());
          return {left:Math.min(board.left,...boxes.map(b=>b.left)),right:Math.max(board.right,...boxes.map(b=>b.right)),wl:wrap.left,wr:wrap.right};
        },{scale,position,home,away,enabled});
        if(position!=='center') {assert(r.left>=r.wl+7,JSON.stringify({theme,scale,position,home,away,enabled,r}));assert(r.right<=r.wr-7,JSON.stringify({theme,scale,position,home,away,enabled,r}));}
      }
      console.log('PASS position matrix',theme);
    }

    for (const position of ['left','right']) {
      await page.evaluate(position=>{state.boardPosition=position;state.boardScale=75;state.noteEnabled=true;state.notes={home:'',away:''};render();fsmBoardRender();},position);
      await page.waitForTimeout(300);
      const original=await page.evaluate(()=>document.getElementById('board').getBoundingClientRect().left);
      const side=position==='left'?'home':'away';
      await page.evaluate(side=>{state.notes[side]="12' New scorer";render();flashNote(side);},side);
      await page.waitForFunction(()=>document.getElementById('boardStageInner').classList.contains('flash-update'));
      await page.evaluate(()=>{document.getElementById('boardStageInner').classList.remove('flash-update'); const input=document.getElementById('noteOn');input.checked=false;input.dispatchEvent(new Event('change'));fsmBoardRender();});
      const restored=await page.evaluate(()=>document.getElementById('board').getBoundingClientRect().left);
      assert(Math.abs(original-restored)<1,'Hide notes restores selected edge');
      const menu=await page.evaluate(()=>document.querySelector('.float-hamburger').getBoundingClientRect().left);
      assert(position==='left'?menu>1800:menu<20,'Menu uses opposite edge');
    }


    for (const position of ['left','right']) {
      const r=await page.evaluate(position=>{
        state.boardPosition=position;state.boardScale=75;state.manualMode=false;state.noteEnabled=true;state.noteFontSize=40;
        const side=position==='left'?'home':'away';
        state.notes={home:'',away:''};state.notes[side]=Array.from({length:8},(_,i)=>`${i+1}' Long scorer name`).join('\n');
        render();fsmBoardRender();
        const note=document.getElementById(side+'Note');
        const small=parseFloat(getComputedStyle(note).fontSize);
        const scale=new DOMMatrix(getComputedStyle(document.getElementById('boardStageInner')).transform).a;
        state.notes[side]="12' A";render();fsmBoardRender();
        return {small,large:parseFloat(getComputedStyle(note).fontSize),scale,setting:state.noteFontSize};
      },position);
      assert(r.small<r.large,'Fewer scorers restores text size');
      assert.equal(r.setting,40,'Configured text size stays unchanged');
      assert(Math.abs(r.scale-.75)<.001,'Many scorers never shrink the board');
    }

    for (const position of ['left','right']) {
      const sizes=await page.evaluate(position=>{
        state.boardPosition=position;state.boardScale=75;state.noteFontSize=20;state.manualMode=false;
        const side=position==='left'?'home':'away';state.notes={home:'',away:''};
        state.notes[side]="12' Moderately long player name";render();fsmBoardRender();
        const note=document.getElementById(side+'Note');
        const normal=parseFloat(getComputedStyle(note).fontSize);
        state.notes[side]="12' "+'Extremely long scorer name '.repeat(5);render();fsmBoardRender();
        const reduced=parseFloat(getComputedStyle(note).fontSize);
        state.notes[side]="12' Moderately long player name";render();fsmBoardRender();
        return {normal,reduced,restored:parseFloat(getComputedStyle(note).fontSize)};
      },position);
      assert.equal(sizes.normal,20,'Ordinary inward movement preserves text size');
      assert(sizes.reduced<sizes.normal,'Only excessive central movement shrinks text');
      assert.equal(sizes.restored,20,'Returning below threshold restores text size');
    }
    await page.evaluate(()=>{state.noteFontSize=18;});
    for (const width of [1280,720,360]) {
      await page.setViewportSize({width,height:900});
      for (const position of ['left','center','right']) {
        await page.evaluate(position=>{state.boardPosition=position;state.boardScale=25;state.manualMode=true;state.noteEnabled=true;state.notes={home:"12' Home player with a very long name",away:"65' Away player with a very long name"};render();fsmBoardRender();},position);
        await page.waitForTimeout(300);
        const r=await page.evaluate(()=>{
          const wrap=document.getElementById('boardStageWrap').getBoundingClientRect();
          const boxes=['board','homeNoteSide','awayNoteSide'].map(id=>document.getElementById(id).getBoundingClientRect());
          return {left:Math.min(...boxes.map(r=>r.left)),right:Math.max(...boxes.map(r=>r.right)),wl:wrap.left,wr:wrap.right,scale:new DOMMatrix(getComputedStyle(document.getElementById('boardStageInner')).transform).a};
        });
        assert(Math.abs(r.scale-.25)<.001,'Board scale stays unchanged');
        assert(r.left>=r.wl+7&&r.right<=r.wr-7,'Resize keeps group in bounds');
      }
    }
    await page.setViewportSize({width:1920,height:1080});
    // 벨기에 띠의 1px 흰 테두리: 배율마다 위·아래 선이 반 픽셀에 걸려 한쪽만 얇아지지 않게 세로 미세 이동(render.js boardPixelSnapShiftY).
    // 75%는 띠 높이가 화면 정수 px라 두 경계 모두 화면 픽셀에 맞고, 다른 테마는 세로 이동이 없어야 한다.
    await page.evaluate(()=>{state.boardPosition='center';state.notes={home:'',away:''};render();applyTheme('belgian',null);});
    await page.waitForFunction(()=>!pendingThemeLink);
    for (const pct of [75,70,80,90,100]) {
      const r=await page.evaluate(pct=>{state.boardScale=pct;applyBoardScale(pct);
        const m=document.querySelector('.scoreboard-main').getBoundingClientRect();
        return {top:m.top,bottom:m.bottom,shiftY:Number(document.getElementById('boardStageInner').dataset.positionShiftY)};},pct);
      assert(Math.abs(r.shiftY)<1,`belgian ${pct}% shift stays under one pixel ${JSON.stringify(r)}`);
      if (pct===75||pct===100) {
        assert(Math.abs(r.top-Math.round(r.top))<.01&&Math.abs(r.bottom-Math.round(r.bottom))<.01,`belgian ${pct}% strip edges on pixels ${JSON.stringify(r)}`);
      }
    }
    await page.evaluate(()=>{applyTheme('pl',null);});
    await page.waitForFunction(()=>!pendingThemeLink);
    assert.equal(await page.evaluate(()=>{state.boardScale=75;applyBoardScale(75);return Number(document.getElementById('boardStageInner').dataset.positionShiftY);}),0,'other themes have no vertical shift');
    console.log('PASS belgian outline pixel snap');
    await page.selectOption('#boardPosition','left',{force:true});
    await page.reload();
    await page.waitForFunction(()=>document.body.dataset.boardPosition==='left');
    assert.equal(await page.inputValue('#boardPosition'),'left');
    // 설정 창 버튼도 같은 값을 표시하고, 메뉴는 햄버거 버튼이 있는 쪽에서 열립니다.
    const menuSide=await page.evaluate(async()=>{
      const active=()=>[...document.querySelectorAll('[data-board-position-value]')].filter(b=>b.classList.contains('is-active')).map(b=>b.dataset.boardPositionValue);
      const before=active();document.getElementById('tabsBar').click();await new Promise(r=>setTimeout(r,400));
      const nav=document.getElementById('sidebarNav').getBoundingClientRect(),button=document.getElementById('tabsBar').getBoundingClientRect();
      document.getElementById('sidebarClose').click();
      document.querySelector('[data-board-position-value="center"]').click();
      return {before,after:active(),select:document.getElementById('boardPosition').value,navRight:nav.right,buttonRight:button.right,width:innerWidth};
    });
    assert.deepEqual(menuSide.before,['left']);
    assert(Math.abs(menuSide.navRight-menuSide.width)<1&&menuSide.buttonRight>menuSide.width/2,JSON.stringify(menuSide));
    assert.deepEqual([menuSide.after,menuSide.select],[['center'],'center']);
    await page.evaluate(()=>document.querySelector('[data-board-position-value="left"]').click());
    await page.evaluate(()=>{state.noteEnabled=true;state.notes={home:"12' Home scorer",away:"65' Away scorer"};render();fsmBoardRender();});
    await page.waitForTimeout(300);
    await page.screenshot({path:'screenshots/board-position-left.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS whole-board flash');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
