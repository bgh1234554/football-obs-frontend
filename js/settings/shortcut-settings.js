// 설정 팝업 내부의 단축키 관리 화면
(() => {
  let editing=null, scrollTop=0;
  const history=[];
  const body=document.querySelector('.sp-body');
  const tabs=document.querySelector('.sp-tabs');
  const panel=document.createElement('section');
  panel.id='shortcutSettings'; panel.hidden=true;
  panel.innerHTML=`<div class="sc-toolbar"><button type="button" class="sp-secondary-btn" id="shortcutBackBtn">← 뒤로가기</button><div class="sc-controls"><button type="button" class="sp-secondary-btn" id="shortcutUndoBtn" disabled>되돌리기</button><button type="button" class="sp-secondary-btn" id="shortcutResetBtn">초기화</button></div></div>
    <div class="sc-intro"><h2>단축키 관리</h2><p>키 버튼을 누른 뒤 사용할 키 조합을 입력하세요.</p><p>Ctrl · Alt · Shift 조합 사용 가능 · Esc 입력 취소</p></div>
    <label class="sc-search-label"><span>기능 검색</span><input type="search" class="sp-text-input" id="shortcutSearch" placeholder="타이머, 점수, 전술판…"></label>
    <p class="sc-status" role="status" aria-live="polite">변경 사항은 자동 저장됩니다. 설정 창에서는 단축키가 실행되지 않습니다.</p><div id="shortcutRows"></div>`;
  body.append(panel);
  const status=panel.querySelector('.sc-status');
  const search=panel.querySelector('input');
  function message(text){status.textContent=text;}
  function stopEditing(){editing=null;renderShortcutSettings();}
  window.renderShortcutSettings=function(){
    panel.querySelector('#shortcutUndoBtn').disabled=!history.length;
    const rows=panel.querySelector('#shortcutRows');rows.replaceChildren();let group='';let count=0;
    const query=search.value.trim().toLowerCase();
    for(const action of shortcutActions){
      if(!(action[1]+action[2]).toLowerCase().includes(query))continue;
      count++;
      if(group!==action[1]){group=action[1];const heading=document.createElement('h3');heading.className='sc-group';heading.textContent=group;rows.append(heading);}
      const row=document.createElement('div');row.className='sc-row';
      const label=document.createElement('span');label.textContent=action[2];
      const controls=document.createElement('div');controls.className='sc-controls';
      const key=document.createElement('button');key.type='button';key.className='sc-key'+(editing===action[0]?' is-recording':'');key.textContent=editing===action[0]?'키 입력 대기…':shortcutLabel(shortcutBinding(action));key.setAttribute('aria-label',action[2]+': '+key.textContent+' 변경');
      key.onclick=()=>{editing=action[0];message('새 키를 입력하세요. Esc를 누르면 취소합니다.');renderShortcutSettings();panel.querySelector('.is-recording')?.focus();};
      const clear=document.createElement('button');clear.type='button';clear.className='sc-clear';clear.textContent='해제';clear.setAttribute('aria-label',action[2]+' 단축키 해제');clear.onclick=()=>commit(action,'');
      controls.append(key,clear);row.append(label,controls);rows.append(row);
    }
    if(!count){const empty=document.createElement('p');empty.className='sc-empty';empty.textContent='검색 결과가 없습니다.';rows.append(empty);}
  };
  function commit(action,key){
    const previous={...shortcutBindings};shortcutBindings[action[0]]=key;
    if(!saveShortcutBindings()){shortcutBindings=previous;message('저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');return;}
    history.push(previous);editing=null;renderShortcutSettings();message(action[2]+': '+shortcutLabel(key)+' · 저장됨');
    updateHints();
  }
  function updateHints(){
    window.updateScoreShortcutHint?.();
    const hint=document.querySelector('.theme-shortcut-hint');if(!hint)return;
    const keycap=action=>{const key=document.createElement('span');key.className='kbd';key.textContent=shortcutLabel(shortcutBinding(action));return key;};
    hint.replaceChildren('단축키 ',keycap(shortcutActions[0]),' 시작/정지 · 리셋 ');
    shortcutActions.slice(1,5).forEach((action,index)=>{
      if(index)hint.append(' / ');
      hint.append(keycap(action),' '+action[2].replace('으로 초기화',''));
    });
  }
  function back(focus=true){
    editing=null;panel.hidden=true;tabs.hidden=false;document.getElementById('settingsTitle').textContent='설정';applySettingsTab('general');body.scrollTop=scrollTop;if(focus)document.getElementById('shortcutManageBtn').focus();
  }
  document.getElementById('shortcutManageBtn').onclick=()=>{
    scrollTop=body.scrollTop;tabs.hidden=true;document.querySelectorAll('[data-sp-tab-section]').forEach(s=>s.hidden=true);panel.hidden=false;document.getElementById('settingsTitle').textContent='설정 / 단축키 관리';search.value='';renderShortcutSettings();body.scrollTop=0;panel.querySelector('#shortcutBackBtn').focus();
  };
  panel.querySelector('#shortcutBackBtn').onclick=()=>back();
  panel.querySelector('#shortcutUndoBtn').onclick=()=>{
    if(!history.length)return;
    const current=shortcutBindings;shortcutBindings=history[history.length-1];
    if(!saveShortcutBindings()){shortcutBindings=current;message('변경을 되돌리지 못했습니다.');return;}
    history.pop();stopEditing();updateHints();message('직전 변경을 되돌렸습니다.');
  };
  search.oninput=()=>{editing=null;renderShortcutSettings();};
  panel.querySelector('#shortcutResetBtn').onclick=()=>{
    if(!confirm('모든 단축키를 기본값으로 복원할까요?'))return;
    const previous=shortcutBindings;shortcutBindings={};if(!saveShortcutBindings()){shortcutBindings=previous;message('저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');return;}history.push({...previous});stopEditing();updateHints();message('모든 단축키를 기본값으로 초기화했습니다.');
  };
  window.addEventListener('keydown',event=>{
    if(panel.hidden || !isSettingsOpen())return;
    if(editing){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.key==='Escape'){stopEditing();message('키 변경을 취소했습니다.');return;}
      if(event.isComposing || event.repeat || ['Control','Shift','Alt','Meta'].includes(event.key))return;
      if(!event.code || ['Tab','Enter','Backspace','Delete'].includes(event.code) && !event.ctrlKey && !event.altKey && !event.shiftKey){message('Tab, Enter, Backspace, Delete는 조합 키와 함께 사용하세요.');return;}
      const key=shortcutKey(event);const conflict=shortcutActions.find(a=>a[0]!==editing && shortcutBinding(a)===key);
      if(conflict){message('이미 “'+conflict[2]+'”에 사용 중입니다. 다른 키를 입력하거나 기존 단축키를 해제하세요.');return;}
      commit(shortcutActions.find(a=>a[0]===editing),key);
    }else if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();back();}
  },true);
  new MutationObserver(()=>{if(!isSettingsOpen()&&!panel.hidden)back(false);}).observe(document.getElementById('settingsBackdrop'),{attributes:true,attributeFilter:['class']});
  renderShortcutSettings();updateHints();
})();
