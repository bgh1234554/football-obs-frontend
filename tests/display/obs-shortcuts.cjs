const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const {chromium}=require(path.join(root,'node_modules/playwright'));
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.obsstudio={};});
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const file=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});});
await page.goto('http://localhost/');
const result=await page.evaluate(()=>{
  shortcutBindings={};const results=[];
  function fire(id){const action=shortcutActions.find(a=>a[0]===id);const parts=action[3].split('+'),code=parts.pop();const keyCode=code.startsWith('Key')?code.charCodeAt(3):code.startsWith('Digit')?code.charCodeAt(5):{Space:32,Backslash:220}[code];
    document.activeElement?.blur();document.body.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,code:'',key:code.startsWith('Key')?String.fromCharCode(keyCode).toLowerCase():code.startsWith('Digit')?code.slice(5):code==='Space'?' ':'\\',keyCode,which:keyCode,ctrlKey:parts.includes('Ctrl'),shiftKey:parts.includes('Shift')}));}
  function check(id,setup,verify,eventId=id){try{setup();fire(eventId);if(!verify())throw Error('expected state change missing');results.push({id,pass:true});}catch(e){results.push({id,pass:false,error:e.message});}}
  check('clockToggle',()=>{state.running=false;},()=>state.running===true);
  for(const [id,seconds] of [['clock0',0],['clock45',2700],['clock90',5400],['clock105',6300]])check(id,()=>{state.seconds=42;},()=>state.seconds===seconds);
  for(const [id,team,delta] of [['homePlus','home',1],['homeMinus','home',-1],['awayPlus','away',1],['awayMinus','away',-1]])check(id,()=>{state.manualMode=true;state.half='1';state[team+'Score']=3;},()=>state[team+'Score']===3+delta);
  check('scoreReset',()=>{state.manualMode=true;state.homeScore=3;state.awayScore=2;},()=>state.homeScore===0&&state.awayScore===0);
  let extra;check('extra',()=>{extra=state.extraShown;},()=>state.extraShown!==extra);
  check('pkUndo',()=>{state.half='PK';pkReset();pkPush('home','G');},()=>state.pk.home.length===0);
  check('pkReset',()=>{state.half='PK';pkReset();pkPush('home','G');pkPush('away','M');},()=>state.pk.home.length===0&&state.pk.away.length===0);
  const drawing={type:'arrow',x1:10,y1:10,x2:30,y2:30,color:'#ffffff'};
  check('undo',()=>{activatePage('tactics');tacticsDrawClear();tdDrawings.push(drawing);tdHistoryPush({type:'draw',drawing});tdRenderAll();},()=>tdDrawings.length===0&&tdFuture.length===1);
  check('redo',()=>{activatePage('tactics');tacticsDrawClear();tdDrawings.push(drawing);tdHistoryPush({type:'draw',drawing});tdUndo();},()=>tdDrawings.length===1&&tdFuture.length===0);
  let fullscreenRequested=0;const pitchPage=document.getElementById('page-tactics');pitchPage.requestFullscreen=()=>{fullscreenRequested++;return Promise.resolve();};
  check('fullscreen',()=>activatePage('tactics'),()=>fullscreenRequested===1);
  let hidden;check('tabs',()=>{hidden=tabsHidden;},()=>tabsHidden!==hidden);
  for(const [i,name] of ['main-big','main-small','theme','schedule','tactics','about'].entries())check('page'+i,()=>activatePage(name==='main-big'?'theme':'main-big'),()=>document.getElementById('page-'+name).classList.contains('active'));
  check('fixture',()=>{},()=>!!document.querySelector('#fixture-overlay.open'));
  let opened;window.open=(...args)=>{opened=args;return null;};check('support',()=>{},()=>opened?.[0]==='https://www.buymeacoffee.com/bgh1234554');
  // 점수 키 네 개는 승부차기 상태에서도 각각 실제 기록을 확인합니다.
  for(const [id,team,result] of [['homePlus','home','G'],['homeMinus','home','M'],['awayPlus','away','G'],['awayMinus','away','M']])check(id+'-PK',()=>{state.half='PK';pkReset();},()=>state.pk[team].length===1&&state.pk[team][0]===result,id);
  document.getElementById('fixture-overlay').classList.remove('open');
  for(const codeMode of ['','Unidentified','physical'])for(let n=1;n<=8;n++){
    const id='Numpad'+n+'-'+(codeMode||'empty');
    try{
      activatePage(n===1?'theme':'main-big');opened=null;document.getElementById('fixture-overlay').classList.remove('open');document.activeElement?.blur();
      document.body.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,code:codeMode==='physical'?'Numpad'+n:codeMode,key:String(n),keyCode:96+n,which:96+n,location:3}));
      const name=['main-big','main-small','theme','schedule','tactics','about'][n-1];
      const pass=n<=6?document.getElementById('page-'+name).classList.contains('active'):n===7?!!document.querySelector('#fixture-overlay.open'):opened?.[0]==='https://www.buymeacoffee.com/bgh1234554';
      if(!pass)throw Error('expected numpad action missing');results.push({id,pass:true});
    }catch(e){results.push({id,pass:false,error:e.message});}
  }
  document.getElementById('fixture-overlay').classList.remove('open');
  shortcutBindings.clockToggle='Numpad1';state.running=false;activatePage('theme');document.activeElement?.blur();
  document.body.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'1',keyCode:97,location:3}));
  results.push({id:'explicit-numpad-binding-priority',pass:state.running===true&&document.getElementById('page-theme').classList.contains('active')});
  shortcutBindings={};activatePage('tactics');
  document.getElementById('fixture-overlay').classList.remove('open');
  function historyKey(letter,codeMode){
    document.activeElement?.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,ctrlKey:true,code:codeMode==='physical'?'Key'+letter:codeMode,key:String.fromCharCode(letter.charCodeAt(0)-64),keyCode:letter.charCodeAt(0)}));
  }
  for(const codeMode of ['','Unidentified','physical'])for(const type of ['draw','erase','flip','multi','new-action']){
    const id='redo-roundtrip-'+type+'-'+(codeMode||'empty');
    try{
      tacticsDrawClear();
      const d={type:'curve-arrow',x1:10,y1:10,x2:30,y2:30,cx:15,cy:30,color:'#ffffff'};
      if(type==='erase'){tdHistoryPush({type:'erase',index:0,drawing:d});}
      else if(type==='flip'){tdDrawings.push(d);tdFlipCurve(0);}
      else{tdDrawings.push(d);tdHistoryPush({type:'draw',drawing:d});}
      if(type==='multi'){const d2={...d,x1:40};tdDrawings.push(d2);tdHistoryPush({type:'draw',drawing:d2});}
      const expected=JSON.stringify(tdDrawings);
      historyKey('Z',codeMode);
      if(type==='multi')historyKey('Z',codeMode);
      if(!tdFuture.length)throw Error('undo failed');
      if(type==='new-action'){
        const d2={...d,x1:50};tdDrawings.push(d2);tdHistoryPush({type:'draw',drawing:d2});
        const current=JSON.stringify(tdDrawings);historyKey('G',codeMode);
        if(tdFuture.length!==0||JSON.stringify(tdDrawings)!==current)throw Error('new action should invalidate redo');
      }else{
        historyKey('G',codeMode);if(type==='multi')historyKey('G',codeMode);
        if(tdFuture.length!==0||JSON.stringify(tdDrawings)!==expected)throw Error('redo state mismatch');
        for(let cycle=0;cycle<5;cycle++){historyKey('Z',codeMode);historyKey('G',codeMode);if(JSON.stringify(tdDrawings)!==expected)throw Error('repeated undo/redo mismatch');}
      }
      results.push({id,pass:true});
    }catch(e){results.push({id,pass:false,error:e.message});}
  }
  tacticsDrawClear();
  const remappedDrawing={type:'arrow',x1:10,y1:10,x2:30,y2:30,color:'#ffffff'};
  tdDrawings.push(remappedDrawing);tdHistoryPush({type:'draw',drawing:remappedDrawing});
  historyKey('Z','');shortcutBindings.redo='Ctrl+KeyX';historyKey('X','');
  results.push({id:'redo-remapped-Ctrl-X',pass:tdDrawings.length===1&&tdFuture.length===0});
  shortcutBindings={};renderShortcutSettings();
  const redoAction=shortcutActions.find(action=>action[0]==='redo');
  results.push({id:'OBS-redo-default-G',pass:shortcutBinding(redoAction)==='Ctrl+KeyG'&&document.getElementById('td-redo-btn').title.includes('Ctrl + G')});
  shortcutBindings.redo='Ctrl+KeyX';renderShortcutSettings();
  results.push({id:'custom-redo-preserved',pass:shortcutBinding(redoAction)==='Ctrl+KeyX'&&document.getElementById('td-redo-btn').title.includes('Ctrl + X')});
  shortcutBindings.redo='';renderShortcutSettings();
  results.push({id:'disabled-redo-preserved',pass:shortcutBinding(redoAction)===''});
  shortcutBindings={};renderShortcutSettings();
  return {results};
});const failures=result.results.filter(r=>!r.pass);console.log(JSON.stringify({checks:result.results.length,failures,errors},null,2));assert.equal(result.results.length,73);assert.equal(failures.length,0);assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
