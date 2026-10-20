// 사용자 단축키 정의와 실행
// 각 항목은 기능 ID, 그룹, 표시 이름, 기본 키 조합, 실행 함수 순서입니다.
const shortcutActions = [
  ['clockToggle','타이머','시작 / 정지','Space',()=>{ window.toggleClockRunning ? window.toggleClockRunning() : state.running=!state.running; render(); persist(); }],
  ...[['clock0','00:00으로 초기화','KeyR',0],['clock45','45:00으로 초기화','KeyE',2700],['clock90','90:00으로 초기화','Shift+KeyR',5400],['clock105','105:00으로 초기화','Shift+KeyE',6300]].map(([id,label,key,seconds])=>[id,'타이머',label,key,()=>{ if(window.setClockSeconds) window.setClockSeconds(seconds); else {state.seconds=seconds;state.running=false;el.clock.textContent=fmtClock(seconds);} render();persist(); }]),
  ['extra','타이머','추가시간 표시 전환','KeyT',()=>toggleManualExtra()],
  ['extraMinus','타이머','추가시간 −1분','BracketLeft',()=>setManualExtra(state.extra-1)],
  ['extraPlus','타이머','추가시간 +1분','BracketRight',()=>setManualExtra(state.extra+1)],
  ...[['homePlus','홈 점수 + / PK 득점','KeyQ','home','G',1],['homeMinus','홈 점수 − / PK 실축','KeyA','home','M',-1],['awayPlus','원정 점수 + / PK 득점','KeyW','away','G',1],['awayMinus','원정 점수 − / PK 실축','KeyS','away','M',-1]].map(([id,label,key,team,result,delta])=>[id,'점수 · 승부차기',label,key,()=>{if(state.half==='PK') pkPush(team,result); else if(state.manualMode){state[team+'Score']=Math.max(0,state[team+'Score']+delta);syncManualInputs();render();persist();}}]),
  ['scoreReset','점수 · 승부차기','수동 점수 초기화','KeyF',()=>{if(state.manualMode)resetManualScore();}],
  // 수동 모드 퇴장 수 조절 (점수 키에 Shift 조합)
  ...[['homeRedPlus','홈 퇴장 +1','Shift+KeyQ','home',1],['homeRedMinus','홈 퇴장 −1','Shift+KeyA','home',-1],['awayRedPlus','원정 퇴장 +1','Shift+KeyW','away',1],['awayRedMinus','원정 퇴장 −1','Shift+KeyS','away',-1]].map(([id,label,key,team,delta])=>[id,'퇴장 (수동 모드)',label,key,()=>{if(state.manualMode)changeManualRedCards(team,delta);}]),
  ['pkUndo','점수 · 승부차기','PK 기록 되돌리기','KeyZ',()=>{if(state.half==='PK')pkUndo();}],
  ['pkReset','점수 · 승부차기','PK 기록 초기화','KeyX',()=>{if(state.half==='PK')pkReset();}],
  ['undo','전술판','되돌리기','Ctrl+KeyZ',()=>{if(document.getElementById('page-tactics')?.classList.contains('active'))tdUndo();}],
  ['redo','전술판','다시 실행',window.obsstudio ? 'Ctrl+KeyG' : 'Ctrl+KeyY',()=>{if(document.getElementById('page-tactics')?.classList.contains('active'))tdRedo();}],
  ['fullscreen','전술판','전체화면 전환','Backslash',()=>{if(document.getElementById('page-tactics')?.classList.contains('active'))tacticsToggleFullscreen();}],
  ['themePrevious','점수판','이전 점수판','Shift+BracketLeft',()=>cycleFsmTheme(-1)],
  ['themeNext','점수판','다음 점수판','Shift+BracketRight',()=>cycleFsmTheme(1)],
  ...[['noteSizePlus','글자 크기 +1px','Shift+Equal',1],['noteSizeMinus','글자 크기 −1px','Shift+Minus',-1]].map(([id,label,key,delta])=>[id,'득점자 표시',label,key,()=>{state.noteFontSize=Math.max(10,(state.noteFontSize??18)+delta);render();persist();}]),
  ['tabs','화면 이동','탭바 표시 / 숨기기','KeyH',()=>toggleTabsAndPages()],
  ...['main-big','main-small','theme','schedule','tactics','about'].map((page,i)=>['page'+i,'화면 이동',['카메라 뷰','대시보드 뷰','테마','일정 확인','전술판','About'][i]+(i < 2 ? '' : ' 화면'),'Digit'+(i+1),()=>activatePage(page)]),
  ['fixture','화면 이동','경기 ID 입력','Digit7',()=>document.getElementById('open-fixture-overlay')?.click()],
  ['support','화면 이동','후원 페이지 열기','Digit8',()=>window.open('https://www.buymeacoffee.com/bgh1234554','_blank')]
];
const SHORTCUT_STORAGE_KEY='obs.shortcuts.v1';
let shortcutBindings={};
try { const saved=JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY)||'{}'); if(saved && typeof saved==='object') shortcutBindings=saved; } catch {}
/** 저장된 빈 문자열은 해제 상태로 존중하며, 사용자 설정이 없을 때만 기본 키를 사용합니다. */
function shortcutBinding(action){const value=shortcutBindings[action[0]];return typeof value==='string'?value:action[3];}
/** event.code를 우선하고, 이를 제공하지 않는 OBS 환경에서는 가상 키와 key 값으로 보완합니다. */
function shortcutCode(event){
  if(event.code && event.code!=='Unidentified')return event.code;
  // OBS 브라우저 소스에서의 단축키 대응
  const virtualKey=event.keyCode || event.which;
  if(virtualKey>=65 && virtualKey<=90)return 'Key'+String.fromCharCode(virtualKey);
  if(virtualKey>=48 && virtualKey<=57)return 'Digit'+String.fromCharCode(virtualKey);
  if(virtualKey>=96 && virtualKey<=105)return 'Numpad'+(virtualKey-96);
  if(virtualKey>=112 && virtualKey<=135)return 'F'+(virtualKey-111);
  const codes={8:'Backspace',9:'Tab',13:event.location===3?'NumpadEnter':'Enter',27:'Escape',32:'Space',33:'PageUp',34:'PageDown',35:'End',36:'Home',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',45:'Insert',46:'Delete',106:'NumpadMultiply',107:'NumpadAdd',109:'NumpadSubtract',110:'NumpadDecimal',111:'NumpadDivide',186:'Semicolon',187:'Equal',188:'Comma',189:'Minus',190:'Period',191:'Slash',192:'Backquote',219:'BracketLeft',220:'Backslash',221:'BracketRight',222:'Quote',226:'IntlBackslash'};
  if(codes[virtualKey])return codes[virtualKey];
  const key=event.key;
  if(/^[a-z]$/i.test(key || ''))return 'Key'+key.toUpperCase();
  if(/^[0-9]$/.test(key || ''))return 'Digit'+key;
  const names={' ':'Space',Spacebar:'Space',Esc:'Escape',';':'Semicolon',':':'Semicolon','=':'Equal','+':'Equal',',':'Comma','<':'Comma','-':'Minus','_':'Minus','.':'Period','>':'Period','/':'Slash','?':'Slash','`':'Backquote','~':'Backquote','[':'BracketLeft','{':'BracketLeft',']':'BracketRight','}':'BracketRight','\\':'Backslash','|':'Backslash',"'":'Quote','"':'Quote'};
  if(names[key])return names[key];
  return /^(Escape|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Left|Right|Up|Down)|F([1-9]|1[0-9]|2[0-4]))$/.test(key || '')?key:'';
}
/** 보조 키를 일정한 순서로 합쳐 저장·충돌 검사·실행에서 같은 키 조합으로 비교합니다. */
function shortcutKey(event){const code=shortcutCode(event);return code?[event.ctrlKey?'Ctrl':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,event.metaKey?'Meta':null,code].filter(Boolean).join('+'):'';}
/** 저장용 키 코드를 화면에 표시할 이름으로 바꾸며, 빈 값은 미지정으로 표시합니다. */
function shortcutLabel(key){return key ? key.replace(/Key([A-Z])/g,'$1').replace(/Digit([0-9])/g,'$1').replace('Backslash','\\').replace('Equal','=').replace('Minus','−').replace('BracketLeft','[').replace('BracketRight',']').split('+').join(' + ') : '미지정';}
/** 점수판 테마 선택 옆의 이전·다음 단축키 안내를 현재 설정으로 갱신합니다. */
function updateThemeCycleShortcutHint(){
  const hint=document.getElementById('themeCycleShortcutHint');
  if(!hint)return;
  hint.replaceChildren();
  for(const [id,label] of [['themePrevious','이전'],['themeNext','다음']]){
    const action=shortcutActions.find(action=>action[0]===id);
    const row=document.createElement('span');
    const key=document.createElement('span');key.className='kbd';key.textContent=shortcutLabel(shortcutBinding(action));
    row.append(key,' '+label);hint.append(row);
  }
}
/** 테마 전환 안내와 전술판 되돌리기·다시 실행 버튼의 툴팁을 함께 갱신합니다. */
function updateTacticsShortcutHints(){
  updateThemeCycleShortcutHint();
  const hint=document.getElementById('noteSizeShortcutHint');
  if(hint){
    hint.replaceChildren('글자 크기 ');
    for(const [id,label] of [['noteSizePlus','키우기'],['noteSizeMinus','줄이기']]){
      const action=shortcutActions.find(action=>action[0]===id);
      const key=document.createElement('span');key.className='kbd';key.textContent=shortcutLabel(shortcutBinding(action));
      hint.append(key,' '+label+' ');
    }
  }
  for(const [id,buttonId] of [['undo','td-undo-btn'],['redo','td-redo-btn']]){
    const action=shortcutActions.find(action=>action[0]===id);
    const button=document.getElementById(buttonId);
    if(button)button.title=action[2]+' ('+shortcutLabel(shortcutBinding(action))+')';
  }
}
/** 저장 공간 접근에 실패하면 호출부가 이전 설정으로 되돌릴 수 있도록 false를 반환합니다. */
function saveShortcutBindings(){try{localStorage.setItem(SHORTCUT_STORAGE_KEY,JSON.stringify(shortcutBindings));return true;}catch{return false;}}
window.addEventListener('storage',event=>{if(event.key===SHORTCUT_STORAGE_KEY){try{shortcutBindings=JSON.parse(event.newValue||'{}')||{};}catch{shortcutBindings={};}window.renderShortcutSettings?.();}});
window.addEventListener('keydown',event=>{
  if(event.defaultPrevented || event.repeat || event.isComposing || document.activeElement?.closest('input,textarea,select,[contenteditable="true"]') || document.getElementById('settingsBackdrop')?.classList.contains('open'))return;
  const key=shortcutKey(event);
  // 숫자패드의 +/-도 글자 크기에 지정된 일반 +/- 키처럼 처리합니다.
  const noteKey=key.replace(/NumpadAdd$/, 'Equal').replace(/NumpadSubtract$/, 'Minus');
  const action=shortcutActions.find(action=>shortcutBinding(action)===key)
    || (/Numpad[0-9]$/.test(key) ? shortcutActions.find(action=>shortcutBinding(action)===key.replace(/Numpad([0-9])$/, 'Digit$1')) : null)
    || (noteKey!==key ? shortcutActions.find(action=>['noteSizePlus','noteSizeMinus'].includes(action[0]) && shortcutBinding(action)===noteKey) : null);
  if(action){event.preventDefault();action[4]();}
});

/**
 * 현재 단축키 설정으로 수동 입력 안내를 다시 그린다 — 입력 모드 안내(일반 점수/승부차기),
 * PSO 버튼 위 키 안내, 퇴장 라벨 옆 키와 +/− 버튼 툴팁. render()와 단축키 변경 시 호출된다.
 */
window.updateScoreShortcutHint = function() {
  const hint = document.getElementById('manualScoreShortcutHint');
  if (!hint) return;
  const keys = ['homePlus','homeMinus','awayPlus','awayMinus'].map(id => shortcutLabel(shortcutBinding(shortcutActions.find(a => a[0] === id))));
  hint.textContent = state.half === 'PK'
    ? `승부차기 입력 중 · 홈 성공 / 실패: ${keys[0]} / ${keys[1]} · 원정 성공 / 실패: ${keys[2]} / ${keys[3]} · 일반 점수는 변경되지 않습니다.`
    : `일반 점수 입력 중 · 홈 + / −: ${keys[0]} / ${keys[1]} · 원정 + / −: ${keys[2]} / ${keys[3]} · 승부차기 입력은 ‘승부차기 (PSO)’에서 전환하세요.`;
  const psoHint = document.getElementById('psoControlHint');
  if (psoHint) {
    const pkKeys = ['pkUndo','pkReset'].map(id => shortcutLabel(shortcutBinding(shortcutActions.find(a => a[0] === id))));
    const keycap = value => { const span = document.createElement('span'); span.className = 'kbd'; span.textContent = value; return span; };
    psoHint.replaceChildren(state.half === 'PK' ? '' : 'PSO 입력: ',
      '홈 성공/실패 ', keycap(keys[0]), '/', keycap(keys[1]),
      ' · 원정 성공/실패 ', keycap(keys[2]), '/', keycap(keys[3]),
      ' · 되돌리기 ', keycap(pkKeys[0]), ' · 초기화 ', keycap(pkKeys[1]));
  }
  // 퇴장 +/- 버튼 툴팁에도 현재 단축키를 표시한다.
  const redIds = ['homeRedPlus','homeRedMinus','awayRedPlus','awayRedMinus'];
  const redKeys = redIds.map(id => shortcutLabel(shortcutBinding(shortcutActions.find(a => a[0] === id))));
  ['manualHomeRedPlus','manualHomeRedMinus','manualAwayRedPlus','manualAwayRedMinus'].forEach((id, i) => {
    const button = document.getElementById(id);
    if (button) button.title = `${shortcutActions.find(a => a[0] === redIds[i])[2]} (${redKeys[i]})`;
  });
  // 라벨 옆에 +/− 키를 표시한다 (예: 홈 퇴장 Shift + Q / Shift + A).
  [['manualHomeRedKeys', 0], ['manualAwayRedKeys', 2]].forEach(([id, i]) => {
    const target = document.getElementById(id);
    if (!target) return;
    /** 키 이름을 .kbd 배지 span으로 만든다. */
    const keycap = value => { const span = document.createElement('span'); span.className = 'kbd'; span.textContent = value; return span; };
    target.replaceChildren(keycap(redKeys[i]), '/', keycap(redKeys[i + 1]));
  });
};
