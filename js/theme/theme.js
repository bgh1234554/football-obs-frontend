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
    ['inPkGoal','pkGoal','--pk-goal'],
    ['inPkMiss','pkMiss','--pk-miss'],
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
  const TEAM_COLOR_KEYS = new Set(['homeBg','homeText','awayBg','awayText']);

  function commitThemeColors(updates, syncColorInput = true) {
    const keys = Object.keys(updates);
    const changed = keys.some(key => state.colors[key] !== updates[key]);
    const teamColorChanged = keys.some(key => TEAM_COLOR_KEYS.has(key));
    if (teamColorChanged) {
      state.teamColorOverride = true;
      state.teamColorOverrideFixtureId = typeof getLastFixtureId === 'function' ? getLastFixtureId() : null;
    }
    window.colorMap.filter(([, key]) => keys.includes(key)).forEach(([id, key, cssVar]) => {
      state.colors[key] = updates[key];
      setCSS(cssVar, updates[key]);
      if (syncColorInput && $(id)) $(id).value = updates[key];
      if ($(id + 'Hex')) $(id + 'Hex').value = updates[key];
    });
    if (!changed) return;
    if (teamColorChanged && typeof applyTeamColors === 'function') applyTeamColors();
    persist();
    render();
    document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key: keys[0] } }));
  }

  /**
   * 색상 피커와 HEX 텍스트 입력 필드를 양방향으로 연결.
   *
   * 드래그 lag 방지 정책:
   *   - input(드래그 중): CSS 변수 + hex 표시만 즉시 갱신 → 라이브 프리뷰. 무거운 작업 X.
   *   - change(피커 닫힘): state 저장 + persist + render + 라인업/스탯 패널 dispatch 한 번만 실행.
   * 결과: 60fps로 점수판이 즉시 반영되면서도 드래그 도중 lag 없음.
   */
  function bindColorWithHex(colorId, key, cssVar){
    const colorInput=$(colorId); if(!colorInput) return;
    const hexInput=document.createElement('input'); hexInput.type='text'; hexInput.id=colorId+'Hex'; hexInput.placeholder='#RRGGBB'; hexInput.style.width='92px'; hexInput.style.marginLeft='6px'; hexInput.value=state.colors[key]||colorInput.value||'#000000';
    // bootstrap 스타일 적용
    hexInput.style.background='#0b1220'; hexInput.style.color='#e5e7eb'; hexInput.style.border='1px solid #ffffff20'; hexInput.style.borderRadius='10px'; hexInput.style.padding='4px 8px'; hexInput.style.height='36px';
    colorInput.insertAdjacentElement('afterend', hexInput);

    /** 드래그 중 가벼운 라이브 프리뷰 — CSS 변수와 hex 표시만 갱신. state/persist/render/dispatch 안 함. */
    const previewThemeColor = value => {
      setCSS(cssVar, value);
      hexInput.value = value;
    };

    /** 피커 닫힘/HEX 입력 확정 시 한 번만 실행되는 무거운 commit. */
    const commitThemeColor = (value, syncColorInput = false) => {
      commitThemeColors({ [key]: value }, syncColorInput);
    };

    // input(드래그): 라이브 프리뷰만. change(피커 닫힘): 최종 commit.
    colorInput.addEventListener('input', e => previewThemeColor(e.target.value));
    colorInput.addEventListener('change', e => commitThemeColor(e.target.value));

    // 16진수 색상 입력 직접 변경은 피커 드래그가 아니므로 즉시 commit. colorInput.value도 같이 동기화.
    hexInput.addEventListener('change', e => {
      const nv = normalizeHex(e.target.value);
      if (!nv) {
        hexInput.value = state.colors[key];
        alert('HEX 형식은 #RRGGBB 또는 #RGB입니다.');
        return;
      }
      commitThemeColor(nv, true);
    });
  }
  window.colorMap.forEach(([id,key,varName])=>bindColorWithHex(id,key,varName));

  // 선택한 팀의 배경색과 글자색을 서로 바꾸고 사용자 지정 색상으로 저장한다.
  function swapTeamColors(side){
    if (side !== 'home' && side !== 'away') return;
    const bgKey = side + 'Bg';
    const textKey = side + 'Text';
    commitThemeColors({ [bgKey]: state.colors[textKey], [textKey]: state.colors[bgKey] });
  }
  $('swapHomeTeamColors')?.addEventListener('click', () => swapTeamColors('home'));
  $('swapAwayTeamColors')?.addEventListener('click', () => swapTeamColors('away'));


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
   * - 그 외(PNG 등): 저장 예산 이하는 원본 data URL로 읽고, 큰 파일만
   *   설정 팝업의 배경 이미지 첨부(compressBackgroundImage)와 동일한 압축을
   *   재사용 — 1920x1080 초과분만 축소하고 화질을 단계적으로 낮춰 localStorage에 안전하게
   *   들어가는 크기(약 1.8MB 이하)로 줄인다.
   *   { preserveAlpha: true }로 호출해 JPEG로 폴백하지 않게 한다 — 팀 로고는
   *   대부분 투명 배경 PNG라, 배경 이미지처럼 JPEG로 넘어가면 투명한 부분이 단색으로
   *   채워져 로고가 망가진다(WebP는 압축하면서도 알파 채널을 유지). 압축 자체가
   *   실패하면(매우 드묾) 원본 base64로 폴백 — 저장 시 용량 초과가 나더라도 persist()의
   *   quota 가드가 반대편 로고까지 지우지는 않는다.
   */
  function readLogoFile(file, cb){
    if(file.type === 'image/svg+xml'){
      const r = new FileReader();
      // SVG는 텍스트로 읽어 URL-encoded data URI 생성 (벡터 품질 유지)
      r.onload = ()=> cb('data:image/svg+xml,' + encodeURIComponent(r.result));
      r.readAsText(file);
      return;
    }
    if(file.size > BG_IMAGE_SAFE_PERSIST_BYTES && typeof compressBackgroundImage === 'function'){
      compressBackgroundImage(file, { preserveAlpha: true }).then(cb).catch(()=>{
        const r = new FileReader();
        r.onload = ()=> cb(r.result);
        r.readAsDataURL(file);
      });
      return;
    }
    const r = new FileReader();
    r.onload = ()=> cb(r.result);
    r.readAsDataURL(file);
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

  document.getElementById('resetApiTeamColors')?.addEventListener('click', () => window.resetFixtureTeamColors?.());
