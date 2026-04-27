  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [템플릿 관리] 색상·폰트·레이아웃 설정을 템플릿으로 저장·불러오기·내보내기·가져오기
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 현재 state에서 템플릿 객체를 생성 (이름 포함, 색상·폰트·레이아웃 설정 포함) */
  function buildCurrentTemplate(name){
    return { name, colors:{...state.colors}, fontFamily:state.fontFamily, logoAlign:state.logoAlign, radiusMode:state.radiusMode, boardWidth:state.boardWidth, homeLogoScale:state.homeLogoScale, awayLogoScale:state.awayLogoScale, homeOutlineEnabled:state.homeOutlineEnabled, awayOutlineEnabled:state.awayOutlineEnabled, homeOutlineWidth:state.homeOutlineWidth, awayOutlineWidth:state.awayOutlineWidth, boardOutlineEnabled:state.boardOutlineEnabled, scoreOutlineEnabled:state.scoreOutlineEnabled, boardOutlineWidth:state.boardOutlineWidth, scoreOutlineWidth:state.scoreOutlineWidth, noteEnabled:state.noteEnabled, noteFontSize:state.noteFontSize };
  }

  function resolveTemplateFontFamily(t){
    const font = sanitizeFontFamily(t?.fontFamily);
    return font || DEFAULT_FONT_FAMILY;
  }

  function resolveTemplateSaveName(nameMaybe){
    const typed = (nameMaybe||'').trim();
    if(typed) return typed;
    return (el.templateSelect?.value||'').trim();
  }

  /** LocalStorage에서 템플릿 목록을 읽어 select 요소에 option으로 채움 (selectedName 있으면 선택 유지) */
  function loadTemplates(selectedName){
    const list = JSON.parse(localStorage.getItem(TKEY)||'[]');
    const prevValue = (selectedName!==undefined) ? selectedName : (el.templateSelect?.value||'');
    el.templateSelect.innerHTML = '';
    const o=document.createElement('option'); o.value=''; o.textContent='로드된 템플릿'; el.templateSelect.appendChild(o);
    list.forEach(t=>{ if(!t||!t.name) return; const x=document.createElement('option'); x.value=t.name; x.textContent=t.name; el.templateSelect.appendChild(x); });
    const stillExists=list.some(t=>t&&t.name===prevValue);
    el.templateSelect.value = stillExists ? prevValue : '';
    return list;
  }

  /** 현재 설정을 주어진 이름으로 LocalStorage에 저장 (동명 템플릿 존재 시 덮어쓰기 확인) */
  function saveTemplate(name){
    name = resolveTemplateSaveName(name);
    if(!name) return alert('템플릿 이름을 입력해주세요.');
    const list=JSON.parse(localStorage.getItem(TKEY)||'[]');
    const exists=list.some(t=>t&&t.name===name);
    if(exists&&!confirm(`"${name}" 템플릿이 이미 있습니다. 덮어쓸까요?`)) return;
    const next=list.filter(t=>t&&t.name!==name);
    next.push(buildCurrentTemplate(name));
    try{ localStorage.setItem(TKEY, JSON.stringify(next)); }
    catch(e){ return alert('저장 공간이 부족합니다.'); }
    loadTemplates(); el.templateSelect.value=name; alert('저장되었습니다.');
  }

  /** 이름 입력란 > 선택된 option 순서로 템플릿을 찾아 LocalStorage에서 삭제 */
  function deleteTemplate(nameMaybe){
    const typed=(el.templateName?.value||'').trim();
    const selected=el.templateSelect?.value||'';
    const name=(typed||nameMaybe||selected||'').trim();
    if(!name){ alert('삭제할 템플릿을 선택하거나 이름을 입력해 주세요.'); return; }
    const list=JSON.parse(localStorage.getItem(TKEY)||'[]');
    if(!list.some(t=>t&&t.name===name)){ alert(`"${name}" 템플릿을 찾을 수 없습니다.`); return; }
    localStorage.setItem(TKEY, JSON.stringify(list.filter(t=>t&&t.name!==name)));
    loadTemplates(); if(el.templateName) el.templateName.value=''; alert(`"${name}" 삭제 완료.`);
  }

  /** 외부 데이터(t)를 LocalStorage 템플릿 목록에 삽입하거나 기존 항목을 덮어씀 */
  function upsertTemplateToLocal(t, askOnDuplicate=true){
    const list=JSON.parse(localStorage.getItem(TKEY)||'[]'); const name=(t?.name||'Imported').toString();
    const idx=list.findIndex(x=>x&&x.name===name);
    if(idx!==-1&&askOnDuplicate){ const ok=confirm(`"${name}" 이미 있음. 덮어쓸까요?`); if(!ok) return{saved:false,replaced:false,name}; }
    const toSave=buildCurrentTemplate(name); Object.assign(toSave, t);
    toSave.fontFamily = resolveTemplateFontFamily(t);
    if(idx!==-1) list[idx]=toSave; else list.push(toSave);
    localStorage.setItem(TKEY, JSON.stringify(list));
    return{saved:true,replaced:(idx!==-1),name};
  }

  /** 이름 입력란이 있으면 해당 템플릿 단건, 없으면 전체 목록을 JSON 파일로 다운로드 */
  async function exportTemplatesFileImpl(){
    const nameInput=(el.templateName?.value||'').trim();
    let dataStr,filename;
    if(nameInput){ dataStr=JSON.stringify(buildCurrentTemplate(nameInput),null,2); filename=`${slugify(nameInput)}.json`; }
    else{ const list=JSON.parse(localStorage.getItem(TKEY)||'[]'); dataStr=JSON.stringify(list,null,2); filename='scoreboard-templates.json'; }
    downloadBlob(filename, new Blob([dataStr],{type:'application/json'}));
  }
  window.exportTemplatesFileImpl = exportTemplatesFileImpl;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [색상/폰트 바인딩] 색상 피커와 HEX 텍스트 입력을 양방향으로 연결하고 폰트 변경 처리
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // [색상 id, state.colors 키, CSS 변수명] 매핑 테이블
  window.colorMap = [
    ['inBoardA','boardA','--board-a'],
    ['inBoardB','boardB','--board-b'],
    ['inScoreBg','scoreBg','--score-bg'],
    ['inDigitsColor','digits','--digits-color'],
    ['inMetaColor','meta','--meta-color'],
    ['inExtraColor','extra','--extra-color'],
    ['inHalfBg','halfBg','--half-bg'],
    ['inHalfText','halfText','--half-text'],
    ['inHomeBg','homeBg','--home-bg'],
    ['inHomeText','homeText','--home-text'],
    ['inAwayBg','awayBg','--away-bg'],
    ['inAwayText','awayText','--away-text'],
    ['inOutline','outline','--card-outline'],
    ['pkBaseColor','pkBase','--pk-base'],
    ['inHomeOutline','homeOutline','--home-outline'],
    ['inAwayOutline','awayOutline','--away-outline'],
    ['inNoteText','noteText','--note-text'],
    ['inNoteStroke','noteStroke','--note-stroke'],
  ];

  /** #RGB 또는 #RRGGBB 형식의 HEX 색상 문자열을 정규화. 유효하지 않으면 null 반환 */
  function normalizeHex(v){ if(!v) return null; v=String(v).trim(); if(/^#?[0-9a-fA-F]{3}$/.test(v)){ const h=v.replace('#',''); return '#'+h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; } if(/^#?[0-9a-fA-F]{6}$/.test(v)) return '#'+v.replace('#','').toLowerCase(); return null; }

  /**
   * 색상 피커(input[type=color])와 HEX 텍스트 입력 필드를 양방향으로 연결.
   * 어느 쪽을 변경해도 state, CSS 변수, 상대 필드가 모두 동기화됨.
   */
  // 사용자가 테마 탭에서 직접 만지면 state.teamColorOverride=true로 마킹할 키 목록.
  // applyFixtureToState가 API 컬러로 덮어쓰지 않도록 가드.
  const TEAM_COLOR_KEYS = new Set(['homeBg','homeText','awayBg','awayText','homeOutline','awayOutline']);

  function bindColorWithHex(colorId, key, cssVar){
    const colorInput=$(colorId); if(!colorInput) return;
    const hexInput=document.createElement('input'); hexInput.type='text'; hexInput.id=colorId+'Hex'; hexInput.placeholder='#RRGGBB'; hexInput.style.width='92px'; hexInput.style.marginLeft='6px'; hexInput.value=state.colors[key]||colorInput.value||'#000000';
    // bootstrap 스타일 적용
    hexInput.style.background='#0b1220'; hexInput.style.color='#e5e7eb'; hexInput.style.border='1px solid #ffffff20'; hexInput.style.borderRadius='10px'; hexInput.style.padding='4px 8px'; hexInput.style.height='36px';
    colorInput.insertAdjacentElement('afterend', hexInput);
    // 'theme:colors-changed' 이벤트 — 라인업 패널 등 점수판 외 영역도 새 컬러로 재렌더할 수 있게 신호
    const dispatchThemeChange = () => document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key } }));
    const markOverride = () => {
      if (!TEAM_COLOR_KEYS.has(key)) return;
      state.teamColorOverride = true;
      state.teamColorOverrideFixtureId = String(_lastFixtureData?.matchInfo?.fixtureId ?? '').trim() || null;
    };
    const commitThemeColor = value => { state.colors[key]=value; setCSS(cssVar,value); hexInput.value=value; markOverride(); persist(); render(); dispatchThemeChange(); };
    const deferUntilChange = key === 'homeBg' || key === 'homeText' || key === 'awayBg' || key === 'awayText';
    colorInput.addEventListener('input', e=>{ const val=e.target.value; if(deferUntilChange){ hexInput.value=val; return; } commitThemeColor(val); });
    if(deferUntilChange){
      colorInput.addEventListener('change', e=>commitThemeColor(e.target.value));
    }
    hexInput.addEventListener('change', e=>{ const nv=normalizeHex(e.target.value); if(!nv){ hexInput.value=state.colors[key]; alert('HEX 형식은 #RRGGBB 또는 #RGB입니다.'); return; } state.colors[key]=nv; setCSS(cssVar,nv); colorInput.value=nv; markOverride(); persist(); render(); dispatchThemeChange(); });
  }
  window.colorMap.forEach(([id,key,varName])=>bindColorWithHex(id,key,varName));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [이벤트 바인딩] 각종 UI 컨트롤에 이벤트 리스너를 연결
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // [이벤트 등록] 로고 업로드 (현재 주석 처리됨)
  // el.inHomeLogo?.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f){ const r=new FileReader(); r.onload=()=>{ state.homeLogo=r.result; render(); }; r.readAsDataURL(f); } });
  // el.inAwayLogo?.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f){ const r=new FileReader(); r.onload=()=>{ state.awayLogo=r.result; render(); }; r.readAsDataURL(f); } });

  // [이벤트 등록] 합계 점수(Aggregate) 토글 및 기준 점수 입력
  el.aggToggle?.addEventListener('change', e=>{ state.aggEnabled=!!e.target.checked; render(); persist(); });
  el.aggHomeBase?.addEventListener('input', e=>{ state.aggHomeBase=Math.max(0,Number(e.target.value)||0); render(); persist(); });
  el.aggAwayBase?.addEventListener('input', e=>{ state.aggAwayBase=Math.max(0,Number(e.target.value)||0); render(); persist(); });

  // [이벤트 등록] 로고 정렬, 모서리 모드, 보드 너비 컨트롤
  el.logoAlign?.addEventListener('change', e=>{ state.logoAlign=e.target.value; render(); persist(); });
  $('radiusMode')?.addEventListener('change', e=>{ state.radiusMode=e.target.value; render(); persist(); });
  $('boardWidth')?.addEventListener('input', e=>{ state.boardWidth=Math.max(10,Number(e.target.value)||1080); render(); persist(); });
  $('boardWidthReset')?.addEventListener('click', ()=>{ state.boardWidth=1080; render(); persist(); });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [수동 모드] 토글 및 입력 이벤트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 수동 모드 ON/OFF 토글.
   * ON 시 안내 다이얼로그를 표시하고, 취소하면 체크박스를 원복한다.
   * OFF 시에는 다이얼로그 없이 즉시 해제된다.
   */
  function toggleManualMode(){
    const checkbox = el.manualModeToggle;
    // 1. 체크박스 상태 기준으로 ON/OFF 방향 결정 (checkbox가 없으면 현재 state 반전)
    const turningOn = checkbox ? checkbox.checked : !state.manualMode;
    // 2. ON 전환 시 안내 confirm — 취소하면 체크박스를 되돌리고 종료
    if(turningOn){
      const ok = confirm(
        '수동 모드를 켜시겠습니까?\n\n' +
        '수동 모드가 ON이면:\n' +
        '- 경기 ID로 API 데이터를 불러와도 점수판에 적용되지 않습니다.\n' +
        '- 팀 이름, 점수, 득점자, 로고를 직접 입력해 사용합니다.\n\n' +
        '이벤트 경기 등 API가 지원되지 않는 경기에 사용하세요.'
      );
      if(!ok){
        if(checkbox) checkbox.checked = false;
        return;
      }
    }
    // 3. state 및 체크박스 UI 반영
    state.manualMode = turningOn;
    if(checkbox) checkbox.checked = turningOn;
    // 4. 수동 모드 입력 섹션 표시/숨김
    el.manualSection.classList.toggle('visible', turningOn);
    // 5. ON 시 현재 state 값을 입력 필드에 미리 채워 넣음
    if(turningOn){
      state.homeLogo = state.homeLogoManual || '';
      state.awayLogo = state.awayLogoManual || '';
      syncManualInputs();
    }else{
      state.homeLogo = '';
      state.awayLogo = '';
    }
    render();
    persist();
  }

  /**
   * 현재 state 값을 수동 모드 입력 필드 전체에 동기화.
   * 수동 모드를 켤 때, 그리고 점수 +/- 버튼 클릭 후 표시값 갱신에 사용한다.
   */
  function syncManualInputs(){
    if(el.manualHomeName) el.manualHomeName.value = state.homeName || '';
    if(el.manualAwayName) el.manualAwayName.value = state.awayName || '';
    if(el.manualHomeScoreVal) el.manualHomeScoreVal.textContent = state.homeScore ?? 0;
    if(el.manualAwayScoreVal) el.manualAwayScoreVal.textContent = state.awayScore ?? 0;
    if(el.extraInput) el.extraInput.value = state.extra ?? 0;
    if(el.manualHomeNote) el.manualHomeNote.value = state.notes.home || '';
    if(el.manualAwayNote) el.manualAwayNote.value = state.notes.away || '';
    if(el.manualHomeLogoUrl) el.manualHomeLogoUrl.value = (/^(https?:)?\/\//i.test(state.homeLogoManual || '') ? state.homeLogoManual : '');
    if(el.manualAwayLogoUrl) el.manualAwayLogoUrl.value = (/^(https?:)?\/\//i.test(state.awayLogoManual || '') ? state.awayLogoManual : '');
  }

  // [이벤트 등록] 수동 모드 — 팀 이름·득점자 텍스트 입력
  el.manualHomeName?.addEventListener('input', e=>{ state.homeName=e.target.value; render(); persist(); });
  el.manualAwayName?.addEventListener('input', e=>{ state.awayName=e.target.value; render(); persist(); });
  el.manualHomeNote?.addEventListener('input', e=>{ state.notes.home=e.target.value; render(); persist(); });
  el.manualAwayNote?.addEventListener('input', e=>{ state.notes.away=e.target.value; render(); persist(); });

  // [이벤트 등록] 수동 모드 — 점수 +/- 버튼 (0 미만으로 내려가지 않음)
  el.manualHomePlus?.addEventListener('click',  ()=>{ state.homeScore++; syncManualInputs(); render(); persist(); });
  el.manualHomeMinus?.addEventListener('click', ()=>{ state.homeScore=Math.max(0,state.homeScore-1); syncManualInputs(); render(); persist(); });
  el.manualAwayPlus?.addEventListener('click',  ()=>{ state.awayScore++; syncManualInputs(); render(); persist(); });
  el.manualAwayMinus?.addEventListener('click', ()=>{ state.awayScore=Math.max(0,state.awayScore-1); syncManualInputs(); render(); persist(); });
  // [이벤트 등록] 수동 모드 — 점수 초기화
  function resetManualScore(){
    state.homeScore = 0;
    state.awayScore = 0;
    syncManualInputs();
    render();
    persist();
  }
  el.manualResetScore?.addEventListener('click', resetManualScore);

  /**
   * 이미지 파일을 읽어 URL 문자열을 콜백으로 전달.
   * - SVG: readAsText → data:image/svg+xml,{encodeURIComponent} 형식
   *   → 브라우저가 벡터로 렌더링하며, localStorage에도 문자열로 저장 가능
   * - 그 외(PNG 등): readAsDataURL → base64 data URL
   */
  function readLogoFile(file, cb){
    const r = new FileReader();
    if(file.type === 'image/svg+xml'){
      // SVG는 텍스트로 읽어 URL-encoded data URI 생성 (벡터 품질 유지)
      r.onload = ()=> cb('data:image/svg+xml,' + encodeURIComponent(r.result));
      r.readAsText(file);
    } else {
      // PNG 등 래스터 이미지는 base64로 변환
      r.onload = ()=> cb(r.result);
      r.readAsDataURL(file);
    }
  }
  // [이벤트 등록] 수동 모드 — 로고 파일 업로드 (파일 선택 시 URL 입력란 초기화)
  function clearManualLogo(side){
    if(side === 'home'){
      state.homeLogoManual = '';
      if(state.manualMode) state.homeLogo = '';
      if(el.manualHomeLogo) el.manualHomeLogo.value = '';
      if(el.manualHomeLogoUrl) el.manualHomeLogoUrl.value = '';
    }else{
      state.awayLogoManual = '';
      if(state.manualMode) state.awayLogo = '';
      if(el.manualAwayLogo) el.manualAwayLogo.value = '';
      if(el.manualAwayLogoUrl) el.manualAwayLogoUrl.value = '';
    }
    render();
    persist();
  }
  el.manualHomeLogo?.addEventListener('change', e=>{
    const f=e.target.files?.[0]; if(!f) return;
    readLogoFile(f, url=>{ state.homeLogoManual=url; if(state.manualMode) state.homeLogo=url; if(el.manualHomeLogoUrl) el.manualHomeLogoUrl.value=''; render(); persist(); });
  });
  el.manualAwayLogo?.addEventListener('change', e=>{
    const f=e.target.files?.[0]; if(!f) return;
    readLogoFile(f, url=>{ state.awayLogoManual=url; if(state.manualMode) state.awayLogo=url; if(el.manualAwayLogoUrl) el.manualAwayLogoUrl.value=''; render(); persist(); });
  });
  // [이벤트 등록] 수동 모드 — 로고 URL 직접 입력 (URL 입력 시 파일 선택 초기화)
  el.manualHomeLogoUrl?.addEventListener('change', e=>{
    const url=e.target.value.trim(); if(!url){ clearManualLogo('home'); return; }
    state.homeLogoManual=url; if(state.manualMode) state.homeLogo=url; if(el.manualHomeLogo) el.manualHomeLogo.value=''; render(); persist();
  });
  el.manualAwayLogoUrl?.addEventListener('change', e=>{
    const url=e.target.value.trim(); if(!url){ clearManualLogo('away'); return; }
    state.awayLogoManual=url; if(state.manualMode) state.awayLogo=url; if(el.manualAwayLogo) el.manualAwayLogo.value=''; render(); persist();
  });
  el.manualHomeLogoUrl?.addEventListener('input', e=>{ if(!e.target.value.trim() && state.homeLogoManual) clearManualLogo('home'); });
  el.manualAwayLogoUrl?.addEventListener('input', e=>{ if(!e.target.value.trim() && state.awayLogoManual) clearManualLogo('away'); });
  el.manualHomeLogoClear?.addEventListener('click', ()=> clearManualLogo('home'));
  el.manualAwayLogoClear?.addEventListener('click', ()=> clearManualLogo('away'));

  // [이벤트 등록] 폰트 프리셋, URL 입력, 로컬 폰트 목록, 파일 업로드
  let dynamicFontLink = null;
  let uploadedFontStyle = null;
  function clearRuntimeFontAssets(){
    if(dynamicFontLink){ dynamicFontLink.remove(); dynamicFontLink = null; }
    if(uploadedFontStyle){ uploadedFontStyle.remove(); uploadedFontStyle = null; }
    if(el.fontFile) el.fontFile.value = '';
  }
  function attachDynamicFontLink(url){
    if(!url) return;
    dynamicFontLink=document.createElement('link');
    dynamicFontLink.rel='stylesheet';
    dynamicFontLink.href=url;
    document.head.appendChild(dynamicFontLink);
  }
  function resetFontToDefault(){
    clearRuntimeFontAssets();
    if(el.fontCssUrl) el.fontCssUrl.value = '';
    if(el.systemFonts) el.systemFonts.value = '';
    if(el.fontPreset) el.fontPreset.value = DEFAULT_FONT_FAMILY;
    state.fontFamily = DEFAULT_FONT_FAMILY;
    render();
    persist();
  }
  /** CSS URL과 폰트 패밀리 입력값을 읽어 동적으로 폰트를 적용 */
  function applyFontFromInputs(){
    const url=el.fontCssUrl?.value.trim();
    const fam=sanitizeFontFamily(el.fontFamily?.value);
    if(!url && !fam){ resetFontToDefault(); return; }
    clearRuntimeFontAssets();
    if(el.systemFonts) el.systemFonts.value = '';
    if(url) attachDynamicFontLink(url);
    if(fam) state.fontFamily=fam;
    render();
    persist();
  }
  el.fontPreset?.addEventListener('change', ()=>{
    if(!el.fontPreset.value) return;
    const option=el.fontPreset.selectedOptions?.[0];
    const fam=sanitizeFontFamily(el.fontPreset.value) || DEFAULT_FONT_FAMILY;
    clearRuntimeFontAssets();
    if(el.fontCssUrl) el.fontCssUrl.value = '';
    if(el.systemFonts) el.systemFonts.value = '';
    state.fontFamily=fam;
    attachDynamicFontLink(option?.dataset?.fontUrl?.trim());
    render(); persist();
  });
  if(el.askLocalFonts) el.askLocalFonts.addEventListener('click', async()=>{
    if(!('queryLocalFonts' in window)){ alert('설치 폰트 읽기를 지원하지 않는 환경입니다.'); return; }
    try{ const fonts=await window.queryLocalFonts(); const fams=[...new Set(fonts.map(f=>f.family))].sort(); el.systemFonts.innerHTML=''; fams.forEach(name=>{ const o=document.createElement('option'); o.value=name; o.textContent=name; el.systemFonts.appendChild(o); }); }
    catch(e){ alert('설치 폰트 권한이 거부되었거나 지원되지 않습니다.'); }
  });
  if(el.systemFonts) el.systemFonts.addEventListener('change', e=>{ clearRuntimeFontAssets(); if(el.fontCssUrl) el.fontCssUrl.value = ''; state.fontFamily=sanitizeFontFamily(e.target.value) || DEFAULT_FONT_FAMILY; render(); persist(); });
  if(el.fontFile) el.fontFile.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(!f) return; if(dynamicFontLink){ dynamicFontLink.remove(); dynamicFontLink = null; } const url=URL.createObjectURL(f); const fam=(f.name.replace(/\.[^.]+$/,'')||'Uploaded').replace(/[^A-Za-z0-9 _-]/g,''); const css=`@font-face{font-family:"${fam}";src:url('${url}');font-weight:100 900;font-style:normal;font-display:swap}`; if(uploadedFontStyle) uploadedFontStyle.remove(); uploadedFontStyle=document.createElement('style'); uploadedFontStyle.textContent=css; document.head.appendChild(uploadedFontStyle); if(el.fontCssUrl) el.fontCssUrl.value = ''; if(el.systemFonts) el.systemFonts.value = ''; state.fontFamily=sanitizeFontFamily(`'${fam}', ${DEFAULT_FONT_FAMILY}`) || `'${fam}', ${DEFAULT_FONT_FAMILY}`; render(); persist(); });
  el.applyFont?.addEventListener('click', applyFontFromInputs);
  el.resetFont?.addEventListener('click', resetFontToDefault);
