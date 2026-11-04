const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
/** 시계 hover 버튼이 실제로 보이고 누를 수 있는지. 평소에는 Tab 이동을 위해 투명도로만 숨긴다. */
const clockControlShown=id=>page.locator('#'+id).evaluate(e=>{const c=getComputedStyle(e.parentElement);return c.visibility==='visible'&&c.opacity==='1'&&c.pointerEvents!=='none';});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);

for(const theme of await page.evaluate(()=>Object.keys(FSM_THEMES))) {
 await page.evaluate(theme=>applyTheme(theme,null),theme);await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>{state.half='2H';state.seconds=123;state.running=false;render();fsmBoardRender();});await page.waitForTimeout(100);
 const before=await page.locator('#board').boundingBox();
 const stageHeight=await page.locator('#boardStageWrap').evaluate(e=>e.getBoundingClientRect().height);
 const originalColon=await page.locator('#clock').evaluate(e=>{const t=e.firstChild;const i=t.textContent.indexOf(':');const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);const b=r.getBoundingClientRect();return b.x+b.width/2;});
 await page.locator('#clock').dblclick();
 assert(await page.locator('#clockEditor').isVisible());
 const editingColon=await page.locator('#ceColon').evaluate(e=>{const b=e.getBoundingClientRect();return b.x+b.width/2;});
 assert(Math.abs(originalColon-editingColon)<1,`${theme}: colon stays anchored when editor opens (${originalColon} -> ${editingColon})`);
 const minuteWidth=(await page.locator('#ceMin').boundingBox()).width;
 for(const value of ['105','120','999']){
  await page.locator('#ceMin').fill(value);
  const fit=await page.locator('#ceMin').evaluate(e=>{const s=getComputedStyle(e);const c=document.createElement('canvas').getContext('2d');c.font=s.font;const text=c.measureText(e.value).width;const available=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);return {fits:text<=available,scroll:e.scrollLeft};});
  assert(fit.fits&&fit.scroll===0,`${theme}: all three minute digits are visible for ${value}`);
  if(theme==='seriea'&&value==='105'){fs.mkdirSync(path.join(root,'screenshots','fsm-clock-editor'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots','fsm-clock-editor','seriea-three-digit-input.png')});}
  assert(Math.abs((await page.locator('#ceMin').boundingBox()).width-minuteWidth)<1,`${theme}: minute input width stays fixed`);
  const colon=await page.locator('#ceColon').evaluate(e=>{const b=e.getBoundingClientRect();return b.x+b.width/2;});
  assert(Math.abs(originalColon-colon)<1,`${theme}: typing three digits keeps colon fixed`);
 }
 await page.locator('#ceMin').fill('99');await page.locator('#ceMinUp').click();assert.equal(await page.locator('#ceMin').inputValue(),'100');
 await page.locator('#ceMin').fill('2');
 const confirmRect=await page.locator('#ceConfirm').boundingBox();
 assert.equal(await page.locator('#clockEditor .clock-toggle').count(),0);
 assert(!await clockControlShown('clockToggle'),`${theme}: playback hidden while editing`);
 const editorRect=await page.locator('#clockEditor').boundingBox();
 const clockRect=await page.locator('#clock').boundingBox();
 assert(Math.abs(editorRect.height-clockRect.height)<1&&Math.abs(editorRect.y-clockRect.y)<1,`${theme}: editing keeps original clock height and vertical position`);
 for(const arrow of await page.locator('#clockEditor .ce-arrow').all()){const rect=await arrow.boundingBox();assert(rect.y>=editorRect.y-1&&rect.y+rect.height<=editorRect.y+editorRect.height+1,`${theme}: arrows remain inside clock height`);}
 for(const rect of [confirmRect])assert(rect.x>=editorRect.x&&rect.x+rect.width<=editorRect.x+editorRect.width+1&&rect.y>=editorRect.y&&rect.y+rect.height<=editorRect.y+editorRect.height+1,`${theme}: both controls stay inside editor background`);
 if(theme==='seriea'){fs.mkdirSync(path.join(root,'screenshots','fsm-clock-editor'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots','fsm-clock-editor','seriea-controls.png')});}
 const accent=await page.evaluate(()=>{const e=document.createElement('span');e.style.color='var(--control-accent)';document.body.append(e);const color=getComputedStyle(e).color;e.remove();return color;});
 const accentText=await page.evaluate(()=>{const e=document.createElement('span');e.style.color='var(--control-accent-text)';document.body.append(e);const color=getComputedStyle(e).color;e.remove();return color;});
 await page.mouse.move(0,0);assert.equal(await page.locator('#ceConfirm').evaluate(e=>getComputedStyle(e).color),accent);
 await page.locator('#ceConfirm').hover();assert.equal(await page.locator('#ceConfirm').evaluate(e=>getComputedStyle(e).color),accentText);
 assert(await page.locator('.scoreboard-main').isVisible());
 const during=await page.locator('#board').boundingBox();assert(Math.abs(before.height-during.height)<1);assert(Math.abs(before.width-during.width)<1);
 const styles=await page.locator('#clock').evaluate(e=>({display:getComputedStyle(e).display,background:getComputedStyle(e).backgroundColor,editorBackground:getComputedStyle(document.querySelector('#clockEditor')).backgroundColor,margin:getComputedStyle(document.querySelector('#clockEditor')).marginTop}));
 assert.notEqual(styles.display,'none');assert.equal(styles.background,styles.editorBackground);assert.equal(styles.margin,'0px');
 await page.locator('#ceColon').hover();assert(await page.locator('#cePresets').isVisible());
 const presetLayout=await page.locator('#cePresets').evaluate(menu=>{
  const buttons=[...menu.querySelectorAll('.ce-preset-btn')].map(button=>button.getBoundingClientRect());
  const hint=menu.querySelector('.ce-presets-hint').getBoundingClientRect();
  return {singleColumn:buttons.every((rect,index)=>Math.abs(rect.left-buttons[0].left)<1&&(!index||rect.top>=buttons[index-1].bottom)),hintBelow:hint.top>=buttons.at(-1).bottom,keys:[...menu.querySelectorAll('kbd')].map(key=>key.textContent)};
 });
 assert(presetLayout.singleColumn,`${theme}: four presets stay in one vertical column`);
 const timerKeys=await page.evaluate(()=>['clockToggle','clock0','clock45','clock90','clock105','extra','extraMinus','extraPlus'].map(id=>shortcutLabel(shortcutBinding(shortcutActions.find(action=>action[0]===id))).replace(/ \+ /g,'+')));
 assert(presetLayout.hintBelow,`${theme}: shortcut hint appears below presets`);
 assert.deepEqual(presetLayout.keys,timerKeys,`${theme}: hint follows actual timer shortcuts`);
 if(theme==='default'){
  await page.evaluate(()=>{shortcutBindings.clockToggle='KeyP';ceShowPresets();});
  assert.equal(await page.locator('.ce-presets-hint kbd').first().textContent(),'P');
  await page.evaluate(()=>{delete shortcutBindings.clockToggle;ceShowPresets();});
 }
 // 프리셋을 연 채 배율을 다시 적용해도 아래 패널을 밀어내지 않아야 한다.
 await page.evaluate(()=>applyBoardScale(state.boardScale || 100));
 assert.equal(await page.locator('#boardStageWrap').evaluate(e=>e.getBoundingClientRect().height),stageHeight,`${theme}: timer menu must not grow board area`);
 if(['eliteserien','danish'].includes(theme))assert.equal(await page.locator('#cePresets').evaluate(n=>getComputedStyle(n).backgroundColor),theme==='danish'?'rgb(189, 229, 94)':'rgb(251, 248, 253)');
 if(theme==='result_style_CL.css'){fs.mkdirSync(path.join(root,'screenshots','fsm-clock-editor'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots','fsm-clock-editor','cl-editing.png')});}
 await page.locator('.ce-preset-btn[data-min="45"]').click();
 assert.equal(await page.evaluate(()=>Math.floor(state.seconds)),2700);assert(await page.evaluate(()=>state.running));assert(!await page.locator('#clockEditor').isVisible());
 for(const min of [0,90,105]){await page.evaluate(()=>pauseClockTimer());await page.locator('#clock').dblclick();await page.locator('#ceColon').hover();await page.locator('.ce-preset-btn[data-min="'+min+'"]').click();assert.equal(await page.evaluate(()=>Math.floor(state.seconds)),min*60);}
 await page.evaluate(()=>pauseClockTimer());await page.locator('#clock').dblclick();await page.locator('#ceMin').fill('12');await page.locator('#ceSec').fill('34');await page.locator('#ceConfirm').click();assert.equal(await page.evaluate(()=>Math.floor(state.seconds)),754);
 await page.evaluate(()=>pauseClockTimer());await page.locator('#clock').dblclick();await page.keyboard.press('Escape');assert(!await page.locator('#clockEditor').isVisible());assert.equal(await page.locator('#clock').evaluate(e=>e.classList.contains('is-editing')),false);
 // 편집은 실제 타이머를 멈추거나 입력 초안을 덮어쓰지 않는다.
 await page.evaluate(()=>{setClockSeconds(120,{autoStart:true});});
 await page.locator('#clock').dblclick();
 assert(await page.evaluate(()=>state.running),`${theme}: opening editor keeps clock running`);
 await page.locator('#ceMin').fill('10');await page.locator('#ceSec').fill('15');
 await page.evaluate(()=>{state.lastRunningTickMs-=5000;syncRunningClockToNow();});
 assert(await page.evaluate(()=>state.seconds>=125));
 assert.equal(await page.locator('#ceSec').inputValue(),'15');
 await page.keyboard.press('Escape');
 assert(await page.evaluate(()=>state.running&&state.seconds>=125&&state.seconds<615),`${theme}: cancel keeps elapsed time and discards draft`);
 await page.mouse.click(0,0);assert(!await clockControlShown('clockToggle'),`${theme}: playback hidden away from clock`);
 await page.locator('#clock').hover();assert(await clockControlShown('clockToggle'));
 const clockBox=await page.locator('#clock').boundingBox();
 const hoverBox=await page.locator('#clockToggle').boundingBox();
 assert(await clockControlShown('clockStop'),`${theme}: stop appears beside playback`);
 if(theme==='seriea')await page.screenshot({path:path.join(root,'screenshots','fsm-clock-editor','seriea-hover-controls.png')});
 await page.locator('#clockToggle').click();assert(!await page.evaluate(()=>state.running));
 await page.mouse.move(0,0);assert(!await clockControlShown('clockToggle'),`${theme}: mouse click does not leave playback stuck visible`);
 await page.locator('#clock').hover();
 const pausedSeconds=await page.evaluate(()=>state.seconds);
 await page.evaluate(()=>syncRunningClockToNow(Date.now()+5000));assert.equal(await page.evaluate(()=>state.seconds),pausedSeconds);
 assert.equal(await page.locator('#clockToggle').getAttribute('aria-label'),'타이머 시작');
 await page.locator('#clockToggle').press('Enter');assert(await page.evaluate(()=>state.running));
 await page.locator('#clockToggle').press('Space');assert(!await page.evaluate(()=>state.running));
 await page.locator('#clock').dblclick();assert(!await clockControlShown('clockToggle'));
 await page.locator('#ceMin').fill('0');await page.locator('#ceSec').fill('16');await page.locator('#ceConfirm').click();
 assert(await page.evaluate(()=>state.running&&state.seconds>=16&&state.seconds<17));
 await page.locator('#clock').hover();await page.locator('#clockToggle').click();
 assert(await page.evaluate(()=>!state.running&&state.seconds>=16&&state.seconds<17),`${theme}: hover pause uses live time, not old editor draft`);
 await page.locator('#clockToggle').evaluate(e=>e.blur());await page.mouse.move(0,0);
 assert(!await clockControlShown('clockToggle'));
 // 마우스 없이 키보드로 버튼에 들어오면 보인다.
 await page.keyboard.press('Shift');await page.locator('#clockToggle').focus();
 assert(await page.locator('#clockToggle').evaluate(e=>e.matches(':focus-visible')&&document.activeElement===e),`${theme}: playback reachable by keyboard`);
 assert(await clockControlShown('clockToggle'),`${theme}: keyboard focus shows playback`);
 await page.locator('#clockToggle').evaluate(e=>e.blur());
 // 세 자리 시간에서도 두 버튼이 시간 숫자와 추가시간 사이에 들어간다.
 for(const seconds of [2790,6300,7200]){
  await page.evaluate(seconds=>{setManualExtra(1);setClockSeconds(seconds,{autoStart:true});},seconds);
  await page.locator('#clock').hover();
  const fit=await page.evaluate(()=>{positionClockToggle();const textRect=e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect();};const time=textRect(document.querySelector('#clock'));const extra=textRect(document.querySelector('#extra'));const play=document.querySelector('#clockToggle').getBoundingClientRect();const stop=document.querySelector('#clockStop').getBoundingClientRect();return {inside:play.left>=time.right-1&&stop.right<=extra.left+1,paired:Math.abs(play.width-stop.width)<1&&Math.abs(play.top-stop.top)<1};});
  assert(fit.inside&&fit.paired,`${theme}: paired buttons fit between time and + at ${seconds}`);
  if(theme==='seriea'&&seconds===7200)await page.screenshot({path:path.join(root,'screenshots','fsm-clock-editor','seriea-stop-controls.png')});
  await page.locator('#clockStop').click();
  assert.equal(await page.evaluate(()=>state.seconds),seconds<6300?2700:6300);assert(!await page.evaluate(()=>state.running));
 }
 if(theme==='default')for(const running of [false,true])for(const [seconds,expected] of [[0,0],[2699,0],[2700,2700],[5399,2700],[5400,5400],[6299,5400],[6300,6300],[9000,6300]]){
  const result=await page.evaluate(({seconds,running})=>{setClockSeconds(seconds,{autoStart:running});document.querySelector('#clockStop').click();return {seconds:state.seconds,running:state.running};},{seconds,running});
  assert.deepEqual(result,{seconds:expected,running:false});
 }
 await page.evaluate(()=>setManualExtra(0));
 console.log('PASS',theme,'stable board/timer background, colon hover, 4 presets, manual edit, cancel');
}
assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
