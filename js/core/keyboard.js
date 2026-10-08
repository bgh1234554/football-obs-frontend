// 사용자 단축키 정의와 실행
const shortcutActions = [
  ['clockToggle','타이머','시작 / 정지','Space',()=>{ window.toggleClockRunning ? window.toggleClockRunning() : state.running=!state.running; render(); persist(); }],
  ...[['clock0','00:00으로 초기화','KeyR',0],['clock45','45:00으로 초기화','KeyE',2700],['clock90','90:00으로 초기화','Shift+KeyR',5400],['clock105','105:00으로 초기화','Shift+KeyE',6300]].map(([id,label,key,seconds])=>[id,'타이머',label,key,()=>{ if(window.setClockSeconds) window.setClockSeconds(seconds); else {state.seconds=seconds;state.running=false;el.clock.textContent=fmtClock(seconds);} render();persist(); }]),
  ...[['homePlus','홈 점수 + / PK 득점','KeyQ','home','G',1],['homeMinus','홈 점수 − / PK 실축','KeyA','home','M',-1],['awayPlus','원정 점수 + / PK 득점','KeyW','away','G',1],['awayMinus','원정 점수 − / PK 실축','KeyS','away','M',-1]].map(([id,label,key,team,result,delta])=>[id,'점수 · 승부차기',label,key,()=>{if(state.half==='PK') pkPush(team,result); else if(state.manualMode){state[team+'Score']=Math.max(0,state[team+'Score']+delta);syncManualInputs();render();persist();}}]),
  ['scoreReset','점수 · 승부차기','수동 점수 초기화','KeyF',()=>{if(state.manualMode)resetManualScore();}],
  ['extra','점수 · 승부차기','추가시간 표시 전환','KeyT',()=>toggleManualExtra()],
  ['pkUndo','점수 · 승부차기','PK 기록 되돌리기','KeyZ',()=>{if(state.half==='PK')pkUndo();}],
  ['pkReset','점수 · 승부차기','PK 기록 초기화','KeyX',()=>{if(state.half==='PK')pkReset();}],
  ['undo','전술판','되돌리기','Ctrl+KeyZ',()=>{if(document.getElementById('page-tactics')?.classList.contains('active'))tdUndo();}],
  ['redo','전술판','다시 실행','Ctrl+KeyY',()=>{if(document.getElementById('page-tactics')?.classList.contains('active'))tdRedo();}],
  ['fullscreen','전술판','전체화면 전환','Backslash',()=>{if(document.getElementById('page-tactics')?.classList.contains('active'))tacticsToggleFullscreen();}],
  ['tabs','화면 이동','탭바 표시 / 숨기기','KeyH',()=>toggleTabsAndPages()],
  ...['main-big','main-small','theme','schedule','tactics','about'].map((page,i)=>['page'+i,'화면 이동',['캠 큼','캠 작음','테마','일정','전술판','소개'][i]+' 화면','Digit'+(i+1),()=>activatePage(page)]),
  ['fixture','화면 이동','경기 ID 입력','Digit7',()=>document.getElementById('open-fixture-overlay')?.click()],
  ['support','화면 이동','후원 페이지 열기','Digit8',()=>window.open('https://www.buymeacoffee.com/bgh1234554','_blank')]
];
const SHORTCUT_STORAGE_KEY='obs.shortcuts.v1';
let shortcutBindings={};
try { const saved=JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY)||'{}'); if(saved && typeof saved==='object') shortcutBindings=saved; } catch {}
function shortcutBinding(action){const value=shortcutBindings[action[0]];return typeof value==='string'?value:action[3];}
function shortcutKey(event){return [event.ctrlKey?'Ctrl':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,event.metaKey?'Meta':null,event.code].filter(Boolean).join('+');}
function shortcutLabel(key){return key ? key.replace(/Key([A-Z])/g,'$1').replace(/Digit([0-9])/g,'$1').replace('Backslash','\\').split('+').join(' + ') : '미지정';}
function saveShortcutBindings(){try{localStorage.setItem(SHORTCUT_STORAGE_KEY,JSON.stringify(shortcutBindings));return true;}catch{return false;}}
window.addEventListener('storage',event=>{if(event.key===SHORTCUT_STORAGE_KEY){try{shortcutBindings=JSON.parse(event.newValue||'{}')||{};}catch{shortcutBindings={};}window.renderShortcutSettings?.();}});
window.addEventListener('keydown',event=>{
  if(event.defaultPrevented || event.repeat || event.isComposing || document.activeElement?.closest('input,textarea,select,[contenteditable="true"]') || document.getElementById('settingsBackdrop')?.classList.contains('open'))return;
  const action=shortcutActions.find(action=>shortcutBinding(action)===shortcutKey(event));
  if(action){event.preventDefault();action[4]();}
});

window.updateScoreShortcutHint = function() {
  const hint = document.getElementById('manualScoreShortcutHint');
  if (!hint) return;
  const keys = ['homePlus','homeMinus','awayPlus','awayMinus'].map(id => shortcutLabel(shortcutBinding(shortcutActions.find(a => a[0] === id))));
  hint.textContent = state.half === 'PK'
    ? `승부차기 입력 중 · 홈 성공 / 실패: ${keys[0]} / ${keys[1]} · 원정 성공 / 실패: ${keys[2]} / ${keys[3]} · 일반 점수는 변경되지 않습니다.`
    : `일반 점수 입력 중 · 홈 + / −: ${keys[0]} / ${keys[1]} · 원정 + / −: ${keys[2]} / ${keys[3]} · 승부차기 입력은 위 체크박스를 켜세요.`;
};
