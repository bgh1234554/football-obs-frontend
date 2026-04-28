  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [스코어보드 렌더링] 점수판 UI 갱신, 레드카드·PK 렌더, 득점자 레이아웃, 배율 조정
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** scorePanel 너비를 --score-col CSS 변수에 동기화 (득점자 박스 너비 연동) */
  function syncScoreCol(){
    const w = el.scorePanel?.getBoundingClientRect().width || 180;
    setCSS('--score-col', w + 'px');
  }
  if (window.ResizeObserver && el.scorePanel){
    new ResizeObserver(syncScoreCol).observe(el.scorePanel);
  }
  window.addEventListener('resize', syncScoreCol);

  /** 레드카드 수만큼 .rc-card div를 생성해 홈/어웨이 컨테이너에 삽입 */
  function renderRedCards(){
    const make = n => { const nodes=[]; for(let i=0;i<n;i++){ const d=document.createElement('div'); d.className='rc-card'; nodes.push(d);} return nodes; };
    if(el.rcHome){ el.rcHome.replaceChildren(...make(state.redHome)); el.rcHome.classList.toggle('hidden', state.redHome===0); }
    if(el.rcAway){ el.rcAway.replaceChildren(...make(state.redAway)); el.rcAway.classList.toggle('hidden', state.redAway===0); }
  }

  /** PK 하프 여부에 따라 PK 패널 토글 및 PK 결과 도트(G/M) 렌더링 */
  let activeNoteEditor = null;

  function canEditNotesInline() {
    return !!(state.manualMode && state.noteEnabled);
  }

  function getNoteTargets(side) {
    if (side === 'home') return { note: el.homeNote, noteSide: el.homeNoteSide };
    return { note: el.awayNote, noteSide: el.awayNoteSide };
  }

  function closeNoteEditor(options = {}) {
    if (!activeNoteEditor) return;

    const { save = false } = options;
    const { side, note, noteSide, editorWrap, textarea, cleanup } = activeNoteEditor;
    const nextValue = String(textarea?.value ?? '').replace(/\r\n?/g, '\n');

    cleanup?.();
    editorWrap?.remove();
    if (note) note.style.display = '';
    if (noteSide) {
      noteSide.classList.remove('editing');
      noteSide.style.width = '';
    }
    activeNoteEditor = null;

    if (save) {
      state.notes = state.notes || { home: '', away: '' };
      state.notes[side] = nextValue;
      if (typeof syncManualInputs === 'function') syncManualInputs();
      render();
      persist();
      return;
    }

    autoLayoutNotes();
  }

  function openNoteEditor(side) {
    if (!canEditNotesInline()) return;

    const { note, noteSide } = getNoteTargets(side);
    if (!note || !noteSide) return;

    if (activeNoteEditor?.side === side) {
      activeNoteEditor.textarea?.focus();
      activeNoteEditor.textarea?.select();
      return;
    }
    if (activeNoteEditor) closeNoteEditor({ save: true });

    const lockedWidth = Math.max(Math.ceil(noteSide.getBoundingClientRect().width || 0), 220);
    const editorWrap = document.createElement('div');
    const textarea = document.createElement('textarea');
    const confirmBtn = document.createElement('button');

    editorWrap.className = `note-inline-editor ${side}`;
    textarea.className = 'note-inline-textarea';
    textarea.value = state.notes?.[side] || '';
    textarea.rows = Math.max(4, textarea.value.split('\n').length || 0);
    textarea.placeholder = "예: 54' 골";
    confirmBtn.type = 'button';
    confirmBtn.className = 'ce-confirm note-inline-save';
    confirmBtn.textContent = '✓';
    confirmBtn.setAttribute('aria-label', '득점자 저장');

    editorWrap.append(textarea, confirmBtn);
    note.style.display = 'none';
    noteSide.classList.add('editing');
    noteSide.style.width = `${lockedWidth}px`;
    noteSide.appendChild(editorWrap);

    const onOutsideClick = event => {
      if (!activeNoteEditor || activeNoteEditor.side !== side) return;
      if (editorWrap.contains(event.target)) return;
      closeNoteEditor();
    };

    const cleanup = () => {
      document.removeEventListener('mousedown', onOutsideClick);
    };

    activeNoteEditor = { side, note, noteSide, editorWrap, textarea, cleanup };

    confirmBtn.addEventListener('click', () => closeNoteEditor({ save: true }));
    textarea.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        closeNoteEditor({ save: true });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNoteEditor();
      }
    });

    setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 0);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });
  }

  el.homeNoteSide?.addEventListener('dblclick', () => openNoteEditor('home'));
  el.awayNoteSide?.addEventListener('dblclick', () => openNoteEditor('away'));

  function countPkGoals(arr) {
    return (Array.isArray(arr) ? arr : []).filter(v => v === 'G').length;
  }

  function getPkDisplayScore(team) {
    const apiScore = state.pkScore?.[team];
    if (!state.manualMode && apiScore != null) return Math.max(0, Number(apiScore) || 0);
    return countPkGoals(state.pk?.[team]);
  }

  function renderPK(){
    const isPK = state.half === 'PK';
    el.pkWrap.classList.toggle('show', isPK);
    const scorePanel = document.getElementById('scorePanel');
    if(scorePanel) scorePanel.classList.toggle('pk-mode', isPK);

    // PK 점수 행 토글
    const pkScoreRow = $('pkScoreRow');
    if(pkScoreRow) pkScoreRow.classList.toggle('hidden', !isPK);

    if(!isPK) return;

    // PK 점수 계산 (득점만 카운트)
    const pkScoreHome = $('pkScoreHome');
    const pkScoreAway = $('pkScoreAway');
    if(pkScoreHome) pkScoreHome.textContent = getPkDisplayScore('home');
    if(pkScoreAway) pkScoreAway.textContent = getPkDisplayScore('away');

    const makeDots = arr => {
      const base=Math.max(5,arr.length); const nodes=[];
      for(let i=0;i<base;i++){ const v=arr[i]; const d=document.createElement('div'); d.className='pk-dot'+(v==='G'?' goal':v==='M'?' miss':''); d.textContent=v==='M'?'×':''; nodes.push(d); } return nodes;
    };
    el.pkHome.replaceChildren(...makeDots(state.pk.home));
    el.pkAway.replaceChildren(...makeDots(state.pk.away));
  }

  /**
   * 스코어보드 전체를 state 기준으로 다시 그리는 메인 렌더 함수.
   * 팀명/점수, 합산점수, 로고, 색상 CSS 변수, 타이머, PK, 레드카드, 득점자 레이아웃 등
   * 모든 UI 요소를 일괄 갱신한다.
   */
  function render(){
    if (activeNoteEditor && !canEditNotesInline()) closeNoteEditor();
    // 1. 팀명 / 점수 텍스트 갱신
    el.homeName.textContent = state.homeName || 'HOME';
    el.awayName.textContent = state.awayName || 'AWAY';
    el.homeScore.textContent = state.homeScore;
    el.awayScore.textContent = state.awayScore;

    // 2. 합산 점수(Aggregate) 표시
    if(el.aggHomeWrap && el.aggAwayWrap){
      const aggHome = (Number(state.aggHomeBase)||0)+(Number(state.homeScore)||0);
      const aggAway = (Number(state.aggAwayBase)||0)+(Number(state.awayScore)||0);
      if(el.aggHomeVal) el.aggHomeVal.textContent = aggHome;
      if(el.aggAwayVal) el.aggAwayVal.textContent = aggAway;
      el.aggHomeWrap.classList.toggle('hidden', !state.aggEnabled);
      el.aggAwayWrap.classList.toggle('hidden', !state.aggEnabled);
    }
    if(el.aggToggle) el.aggToggle.checked = !!state.aggEnabled;
    if(el.aggHomeBase) el.aggHomeBase.value = state.aggHomeBase;
    if(el.aggAwayBase) el.aggAwayBase.value = state.aggAwayBase;

    // 3. 팀 로고 표시/숨김
    if(state.homeLogo){ el.homeLogo.src=state.homeLogo; el.homeLogo.classList.remove('hidden'); }
    else { el.homeLogo.removeAttribute('src'); el.homeLogo.classList.add('hidden'); }
    if(state.awayLogo){ el.awayLogo.src=state.awayLogo; el.awayLogo.classList.remove('hidden'); }
    else { el.awayLogo.removeAttribute('src'); el.awayLogo.classList.add('hidden'); }

    // 4. 색상 CSS 변수 일괄 적용
    setCSS('--board-a', state.colors.boardA);
    setCSS('--board-b', state.colors.boardB);
    setCSS('--score-bg', state.colors.scoreBg);
    setCSS('--digits-color', state.colors.digits);
    setCSS('--meta-color', state.colors.meta);
    setCSS('--extra-color', state.colors.extra);
    setCSS('--half-bg', state.colors.halfBg);
    setCSS('--half-text', state.colors.halfText);
    setCSS('--home-bg', state.colors.homeBg);
    setCSS('--home-text', state.colors.homeText);
    setCSS('--away-bg', state.colors.awayBg);
    setCSS('--away-text', state.colors.awayText);
    setCSS('--card-outline', state.colors.outline);
    setCSS('--pk-base', state.colors.pkBase);
    setCSS('--home-outline', state.colors.homeOutline);
    setCSS('--away-outline', state.colors.awayOutline);
    setCSS('--home-outline-w', (state.homeOutlineWidth??1)+'px');
    setCSS('--away-outline-w', (state.awayOutlineWidth??1)+'px');
    setCSS('--board-outline-w', (state.boardOutlineWidth??1)+'px');
    setCSS('--score-outline-w', (state.scoreOutlineWidth??1)+'px');
    setCSS('--note-font-size-home', (state.noteFontSize??18)+'px');
    setCSS('--note-font-size-away', (state.noteFontSize??18)+'px');
    setCSS('--note-stroke', state.colors.noteStroke);
    setCSS('--note-text', state.colors.noteText);
    setCSS('--home-logo-x', (state.homeLogoX??0)+'px');
    setCSS('--home-logo-y', (state.homeLogoY??0)+'px');
    setCSS('--away-logo-x', (state.awayLogoX??0)+'px');
    setCSS('--away-logo-y', (state.awayLogoY??0)+'px');
    setCSS('--font-family', state.fontFamily);
    if(el.fontFamily) el.fontFamily.value = state.fontFamily;
    if(el.fontPreset) el.fontPreset.value = Array.from(el.fontPreset.options).some(o=>o.value===state.fontFamily) ? state.fontFamily : '';
    setCSS('--rc-size', (state.rcSize??14)+'px');
    setCSS('--rc-gap', (state.rcGap??6)+'px');
    setCSS('--rc-top', (state.rcTop??-25)+'px');
    setCSS('--rc-home-inset', (state.rcHomeInset??6)+'px');
    setCSS('--rc-away-inset', (state.rcAwayInset??6)+'px');
    if(el.rcSize) el.rcSize.value = state.rcSize;
    if(el.rcGap) el.rcGap.value = state.rcGap;
    if(el.rcTop) el.rcTop.value = state.rcTop;
    if(el.rcHomeInset) el.rcHomeInset.value = state.rcHomeInset;
    if(el.rcAwayInset) el.rcAwayInset.value = state.rcAwayInset;

    // 5. 득점자 표시 여부 및 색상 피커 동기화
    if(el.homeNoteSide) el.homeNoteSide.classList.toggle('hidden', !state.noteEnabled);
    if(el.awayNoteSide) el.awayNoteSide.classList.toggle('hidden', !state.noteEnabled);
    if(el.homeNoteSide) el.homeNoteSide.classList.toggle('manual-editable', !!state.manualMode && !!state.noteEnabled);
    if(el.awayNoteSide) el.awayNoteSide.classList.toggle('manual-editable', !!state.manualMode && !!state.noteEnabled);
    if(el.homeNote) {
      el.homeNote.classList.toggle('manual-editable', !!state.manualMode && !!state.noteEnabled);
      el.homeNote.title = (state.manualMode && state.noteEnabled) ? '더블클릭해서 홈 득점자 편집' : '';
    }
    if(el.awayNote) {
      el.awayNote.classList.toggle('manual-editable', !!state.manualMode && !!state.noteEnabled);
      el.awayNote.title = (state.manualMode && state.noteEnabled) ? '더블클릭해서 원정 득점자 편집' : '';
    }
    if(el.noteOn) el.noteOn.checked = !!state.noteEnabled;
    if(el.inNoteStroke) el.inNoteStroke.value = state.colors.noteStroke;
    if(el.inNoteText) el.inNoteText.value = state.colors.noteText;

    // 6. 득점자 텍스트 자동 레이아웃 (1줄→2줄→폰트 축소)
    autoLayoutNotes();

    // 7. 로고 정렬 모드 및 보드 테두리 클래스 적용
    const boardEl = $('board');
    boardEl.classList.remove('align-outer','align-inner','align-hybrid');
    boardEl.classList.add(`align-${state.logoAlign}`);
    boardEl.classList.toggle('outline-on', !!state.boardOutlineEnabled);
    if(el.scorePanel) el.scorePanel.classList.toggle('outline-on', !!state.scoreOutlineEnabled);
    if(el.logoAlign) el.logoAlign.value = state.logoAlign;

    el.homeCard.classList.toggle('outline-on', !!state.homeOutlineEnabled);
    el.awayCard.classList.toggle('outline-on', !!state.awayOutlineEnabled);
    if(el.inHomeOutline) el.inHomeOutline.value = state.colors.homeOutline;
    if(el.inAwayOutline) el.inAwayOutline.value = state.colors.awayOutline;
    if(el.homeOutlineWidth) el.homeOutlineWidth.value = state.homeOutlineWidth??1;
    if(el.awayOutlineWidth) el.awayOutlineWidth.value = state.awayOutlineWidth??1;
    if(el.boardOutlineOn) el.boardOutlineOn.checked = !!state.boardOutlineEnabled;
    if(el.scoreOutlineOn) el.scoreOutlineOn.checked = !!state.scoreOutlineEnabled;
    if(el.boardOutlineWidth) el.boardOutlineWidth.value = state.boardOutlineWidth??1;
    if(el.scoreOutlineWidth) el.scoreOutlineWidth.value = state.scoreOutlineWidth??1;

    // 8. 모서리 라운드/각형 CSS 변수 적용
    if(state.radiusMode==='square'){ setCSS('--board-radius','0px'); setCSS('--team-radius','0px'); setCSS('--score-radius','0px'); }
    else { setCSS('--board-radius','18px'); setCSS('--team-radius','14px'); setCSS('--score-radius','14px'); }
    if($('radiusMode')) $('radiusMode').value = state.radiusMode;

    // 9. 보드 너비 CSS 변수 적용
    setCSS('--board-width', state.boardWidth+'px');
    if($('boardWidth')) $('boardWidth').value = state.boardWidth;

    // 10. 로고 배율 및 오프셋 CSS 변수 적용
    setCSS('--home-logo-scale', state.homeLogoScale??1);
    setCSS('--away-logo-scale', state.awayLogoScale??1);
    if($('homeLogoScale')) $('homeLogoScale').value = state.homeLogoScale;
    if($('awayLogoScale')) $('awayLogoScale').value = state.awayLogoScale;
    if($('homeLogoX')) $('homeLogoX').value = state.homeLogoX;
    if($('homeLogoY')) $('homeLogoY').value = state.homeLogoY;
    if($('awayLogoX')) $('awayLogoX').value = state.awayLogoX;
    if($('awayLogoY')) $('awayLogoY').value = state.awayLogoY;

    // 11. 타이머 및 전/후반 표시 갱신
    const map={'1':'1H','2':'2H','ET1':'ET1','ET2':'ET2','PK':'PSO'};
    el.half.textContent = map[state.half]||'1H';
    el.extra.textContent = `+${state.extra}`;
    el.extra.classList.toggle('hidden', !state.extraShown||state.extra<=0);
    el.halfSelect.value = state.half;
    el.extraInput.value = state.extra;
    el.secPerTick.value = state.secPerTick;
    el.startPause.textContent = state.running ? '일시정지 (Space)' : '시작 (Space)';

    // 12. 색상 피커 input 값을 state와 동기화
    if(el.inBoardA) el.inBoardA.value = state.colors.boardA;
    if(el.inBoardB) el.inBoardB.value = state.colors.boardB;
    if(el.inScoreBg) el.inScoreBg.value = state.colors.scoreBg;
    if(el.inDigitsColor) el.inDigitsColor.value = state.colors.digits;
    if(el.inMetaColor) el.inMetaColor.value = state.colors.meta;
    if(el.inExtraColor) el.inExtraColor.value = state.colors.extra;
    if(el.inHalfBg) el.inHalfBg.value = state.colors.halfBg;
    if(el.inHalfText) el.inHalfText.value = state.colors.halfText;
    if(el.inHomeBg) el.inHomeBg.value = state.colors.homeBg;
    if(el.inHomeText) el.inHomeText.value = state.colors.homeText;
    if(el.inAwayBg) el.inAwayBg.value = state.colors.awayBg;
    if(el.inAwayText) el.inAwayText.value = state.colors.awayText;
    if(el.inOutline) el.inOutline.value = state.colors.outline;
    if(el.pkBaseColor) el.pkBaseColor.value = state.colors.pkBase;

    if(window.colorMap){
      window.colorMap.forEach(([id, key]) => {
        const hex = $(id+'Hex');
        if(hex) hex.value = state.colors[key];
      });
    }

    // 13. 하위 렌더 함수 호출 (PK 도트, 레드카드, 스코어 컬럼 너비, 전술판 색상)
    renderPK();
    renderRedCards();
    syncScoreCol();
    // 전술판 토큰 색상 동기화 — 팀 색상이 실제로 바뀐 경우에만 재렌더 (매 render() 호출 시 DOM 재생성하면 드래그/선택 상태가 깨짐)
    if (typeof tacticsState !== 'undefined' && typeof tacticsRenderTokens === 'function') {
      const _tck = [state.colors.homeBg, state.colors.homeText, state.colors.awayBg, state.colors.awayText].join('|');
      if (_tck !== render._lastTacticsColorKey) { render._lastTacticsColorKey = _tck; tacticsRenderTokens(); }
    }
  }

  // 점수판/득점자 박스 깜빡임 — fixture.js의 폴링 응답 처리에서 호출.
  // render() 안에서 자동 비교하지 않음 (render는 색상/폰트 등 다른 사유로도 호출되므로
  // 깜빡임이 무관한 시점에 발동되는 문제 방지).
  function flashElement(target) {
    if (!target) return;
    target.classList.remove('flash-update');
    // 강제 reflow → 같은 클래스 재부여 시 애니메이션 재시작 보장
    void target.offsetWidth;
    target.classList.add('flash-update');
    target.addEventListener('animationend', () => target.classList.remove('flash-update'), { once: true });
  }
  // 외부(fixture.js)에서 호출용. side: 'home'|'away'
  window.flashScore = side => flashElement(side === 'home' ? el.homeScore : el.awayScore);
  window.flashNote  = side => flashElement(side === 'home' ? el.homeNoteSide : el.awayNoteSide);

  function clearPkState() {
    if(!state.pk) state.pk = { home: [], away: [] };
    state.pk.home = [];
    state.pk.away = [];
  }

  function expireStalePkState(now = Date.now()) {
    const lastExitedAt = Number(state.pkLastExitedAt) || 0;
    if (state.half === 'PK' || !lastExitedAt) return false;
    if ((now - lastExitedAt) <= PK_RETENTION_MS) return false;
    clearPkState();
    state.pkLastExitedAt = 0;
    return true;
  }

  function setMatchHalf(nextHalf) {
    if (!halfOrder.includes(nextHalf) || nextHalf === state.half) return;
    const now = Date.now();
    const prevHalf = state.half;
    if (prevHalf === 'PK' && nextHalf !== 'PK') {
      state.pkLastExitedAt = now;
    } else if (prevHalf !== 'PK' && nextHalf === 'PK') {
      const lastExitedAt = Number(state.pkLastExitedAt) || 0;
      if (lastExitedAt && (now - lastExitedAt) > PK_RETENTION_MS) clearPkState();
      state.pkLastExitedAt = 0;
    }
    state.half = nextHalf;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [스코어보드 렌더링 - 득점자 자동 레이아웃] 1줄 → 2명씩 한 줄 → 폰트 축소로 넘침 방지
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /*
  [테스트 케이스 - 콘솔에 붙여넣어 사용]

  // 케이스 1: 한글 이름 (짧음)
  state.notes.home = "12' V. 요케레스\n34' E. 에제\n67' K. 하베르츠";
  state.notes.away = "23' R. 벤탕쿠르\n89' Kh. 크바라츠헬리아";
  render();

  // 케이스 2: 영어 긴 이름 (10명 → 2명씩 1줄 + 폰트 축소 테스트)
  state.notes.home = "12' Max Alleyne\n24' Rodri\n42' OG Jake Doyle-Hayes\n45+2' OG Jack Fitzwater\n49' Rico Lewis\n54' Antoine Semenyo\n71' Tijjani Reijnders\n79' Nico O'Reilly\n86' Ryan McAidoo\n90+1' Rico Lewis";
  state.notes.away = "51' Loum Tchouna\n62' Jaidon Anthony";
  render();

  // 케이스 3: 한글+영어 혼합
  state.notes.home = "15' 손흥민\n33' Salah\n67' 김민재\n88' K. Mbappé";
  state.notes.away = "10' K. De Bruyne\n45+3' 이강인\n78' E. Haaland";
  render();

  // 케이스 4: 양쪽 많음 (2명씩 한 줄 전환 테스트)
  state.notes.home = "3' 홍길동\n12' 김철수\n24' 이민준\n31' 박지성\n45' 최강희\n52' 황희찬";
  state.notes.away = "8' L. Messi\n19' C. Ronaldo\n33' K. Mbappé\n47' E. Haaland\n61' M. Salah\n75' K. De Bruyne";
  render();

  // 케이스 5: 극단적으로 많음 (폰트 축소 테스트)
  state.notes.home = "3' 홍길동\n12' 김철수\n24' 이민준\n31' 박지성\n45' 최강희\n52' 황희찬\n60' 손흥민\n71' 이강인\n80' 조규성\n88' 김민재";
  state.notes.away = "5' L. Messi\n18' C. Ronaldo\n27' K. Mbappé\n39' E. Haaland\n50' M. Salah\n63' K. De Bruyne\n74' Neymar\n85' K. Benzema\n90' R. Lewandowski\n90+4' L. Modric";
  render();

  // 케이스 6: 한쪽만 득점 (비대칭 너비 테스트)
  state.notes.home = "45+2' (OG) Jake Doyle-Hayes\n67' Tijjani Reijnders";
  state.notes.away = "";
  render();

  // 케이스 7: PK 포함 혼합
  state.notes.home = "23' (PK) 손흥민\n45' R. 벤탕쿠르\n67' (PK) 히샤를리송";
  state.notes.away = "11' E. Haaland\n55' (PK) O. Marmoush\n90+3' R. Cherki";
  render();

  // 케이스 8: 초기화
  state.notes.home = '';
  state.notes.away = '';
  render();
  */
  /** 득점자 줄 배열을 perRow 명씩 한 줄로 합쳐 문자열 반환 (perRow=1이면 그대로) */
  function formatScorers(lines, perRow) {
    // perRow=1: 그대로, perRow=2: 두 명씩 한 줄
    if (perRow === 1) return lines.join('\n');
    const rows = [];
    for (let i = 0; i < lines.length; i += 2) {
      if (i + 1 < lines.length) rows.push(lines[i] + '  ' + lines[i+1]);
      else rows.push(lines[i]);
    }
    return rows.join('\n');
  }

  /**
   * 단일 팀 득점자 텍스트의 폰트 크기와 줄 배치를 자동으로 조정.
   * boardH(보드 높이)를 초과하지 않도록 단계적으로 레이아웃을 최적화하고
   * 최종 적용된 폰트 크기를 반환한다.
   */
  function autoLayoutNote(noteEl, noteSideEl, lines, boardH, cssVar) {
    if (!noteEl) return 0;

    const baseSize = state.noteFontSize ?? 18;
    const MIN_SIZE = 8;

    // 1단계: 1줄씩, 기본 폰트 크기로 시작
    let effectiveSize = baseSize;
    setCSS(cssVar, effectiveSize + 'px');
    noteEl.textContent = formatScorers(lines, 1);

    // 2단계: 보드 높이를 넘치면 2명씩 한 줄로 압축
    if (noteEl.scrollHeight > boardH) {
      noteEl.textContent = formatScorers(lines, 2);
    }

    // 3단계: 그래도 넘치면 폰트 크기를 1px씩 줄여 MIN_SIZE까지 축소
    while (noteEl.scrollHeight > boardH && effectiveSize > MIN_SIZE) {
      effectiveSize -= 1;
      setCSS(cssVar, effectiveSize + 'px');
    }

    return effectiveSize;
  }

  /**
   * 홈/어웨이 득점자 패널을 각각 독립적으로 자동 레이아웃하고
   * note-side 박스를 스코어보드 양 옆에 절대 위치로 고정시키는 통합 함수.
   */
  function autoLayoutNotes() {
    if (activeNoteEditor) return;
    // 1. 보드 높이 측정 — 아직 렌더되지 않으면 종료
    const boardEl = $('board');
    if (!boardEl || !el.homeNote || !el.awayNote) return;

    const boardH = boardEl.offsetHeight;
    if (!boardH) return;

    // 2. 득점자 줄 배열 추출
    const homeLines = (state.notes?.home ?? '').split('\n').filter(l => l.trim());
    const awayLines = (state.notes?.away ?? '').split('\n').filter(l => l.trim());

    const homeNoteSide = $('homeNoteSide');
    const awayNoteSide = $('awayNoteSide');

    // 중요: autoLayoutNote는 noteEl.scrollHeight를 보고 보드 높이 초과 여부를 판정하는데,
    // .note에 overflow-wrap:anywhere + white-space:pre-line이 걸려있어서, 부모 noteSide의
    // shrink-to-fit(width:auto)이 min-content(한 토큰 폭, 예: "16'" 47px)로 떨어지는 케이스가
    // 있음. 그러면 자식이 모든 글자에 줄바꿈하여 scrollHeight가 폭증, 잘못된 압축/축소 발동.
    // → max-content로 명시 고정해 자연 폭(가장 긴 줄)을 강제로 사용하게 한 뒤 측정.
    if (homeNoteSide) homeNoteSide.style.width = 'max-content';
    if (awayNoteSide) awayNoteSide.style.width = 'max-content';

    // 3. 홈/원정 각각 독립적으로 폰트 크기 최적화
    const homeSize = autoLayoutNote(el.homeNote, homeNoteSide, homeLines, boardH, '--note-font-size-home');
    const awaySize = autoLayoutNote(el.awayNote, awayNoteSide, awayLines, boardH, '--note-font-size-away');

    // 4. 테마 탭 폰트 크기 입력란에 둘 중 작은 값 표시
    if (el.noteFontSize) el.noteFontSize.value = Math.min(homeSize, awaySize);

    // 5. note-side 너비를 내용 scrollWidth에 맞게 동적 조정 (위에서 'auto'로 풀어둔 상태)
    const PAD = 20;
    const MIN_EDIT_W = (state.manualMode && state.noteEnabled) ? 140 : 0;
    const stageEl = $('boardStageInner');
    const homeW = Math.max(MIN_EDIT_W, homeLines.length ? el.homeNote.scrollWidth + PAD : 0);
    const awayW = Math.max(MIN_EDIT_W, awayLines.length ? el.awayNote.scrollWidth + PAD : 0);

    if (homeNoteSide) homeNoteSide.style.width = homeW + 'px';
    if (awayNoteSide) awayNoteSide.style.width = awayW + 'px';

    // 6. stageInner 기준으로 note-side를 board 양 옆에 절대 위치로 고정
    if (stageEl && boardEl) {
      const boardLeft  = boardEl.offsetLeft;
      const boardRight = stageEl.offsetWidth - boardEl.offsetLeft - boardEl.offsetWidth;
      if (homeNoteSide) homeNoteSide.style.right = boardRight + boardEl.offsetWidth + 'px';
      if (awayNoteSide) awayNoteSide.style.left  = boardLeft  + boardEl.offsetWidth + 'px';
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [스코어보드 렌더링 - 배율] 슬라이더로 스코어보드 미리보기 배율 조정
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const boardStageInner = $('boardStageInner');
  const boardStageWrap  = $('boardStageWrap');
  const boardScaleRange = $('boardScaleRange');
  const boardScaleLabel = $('boardScaleLabel');

  /** 보드 미리보기를 pct% 배율로 scale 변환하고, 래퍼 높이도 실제 렌더 크기에 맞게 조정 */
  function applyBoardScale(pct){
    const s = pct / 100;
    boardStageInner.style.transform = `scale(${s})`;
    // wrap 높이를 실제 축소 높이에 맞게 조정
    const naturalH = boardStageInner.scrollHeight;
    boardStageWrap.style.height = (naturalH * s) + 'px';
    if(boardScaleLabel) boardScaleLabel.textContent = pct;
    if(boardScaleRange) boardScaleRange.value = pct;
  }

  /** restore() 후 state.boardScale 값으로 초기 배율을 적용 (DOM 렌더 후 requestAnimationFrame에서 호출) */
  function initBoardScale(){
    const pct = state.boardScale ?? 75;
    applyBoardScale(pct);
  }

  // [이벤트 등록] 배율 슬라이더 및 리셋 버튼
  boardScaleRange?.addEventListener('input', e=>{
    state.boardScale = Number(e.target.value);
    applyBoardScale(state.boardScale);
    persist();
  });

  $('boardScaleReset')?.addEventListener('click', ()=>{
    state.boardScale = 75;
    applyBoardScale(75);
    persist();
  });

  // [이벤트 등록] 로고 배율 및 위치 오프셋 컨트롤
  $('homeLogoScale')?.addEventListener('input', e=>{ state.homeLogoScale=Math.min(5,Math.max(0.2,Number(e.target.value)||1)); render(); persist(); });
  $('awayLogoScale')?.addEventListener('input', e=>{ state.awayLogoScale=Math.min(5,Math.max(0.2,Number(e.target.value)||1)); render(); persist(); });
  $('homeLogoX')?.addEventListener('input', e=>{ state.homeLogoX=Number(e.target.value)||0; render(); persist(); });
  $('homeLogoY')?.addEventListener('input', e=>{ state.homeLogoY=Number(e.target.value)||0; render(); persist(); });
  $('awayLogoX')?.addEventListener('input', e=>{ state.awayLogoX=Number(e.target.value)||0; render(); persist(); });
  $('awayLogoY')?.addEventListener('input', e=>{ state.awayLogoY=Number(e.target.value)||0; render(); persist(); });
  el.homeOffsetReset?.addEventListener('click', ()=>{ state.homeLogoX=0; state.homeLogoY=0; render(); persist(); });
  el.awayOffsetReset?.addEventListener('click', ()=>{ state.awayLogoX=0; state.awayLogoY=0; render(); persist(); });

  // [이벤트 등록] 전/후반 선택, 타이머 시작/정지/리셋 및 시작 시각 설정
  el.halfSelect?.addEventListener('change', e=>{ setMatchHalf(e.target.value); render(); persist(); });
  el.prevHalf?.addEventListener('click', ()=>{ const i=Math.max(0,halfOrder.indexOf(state.half)-1); setMatchHalf(halfOrder[i]); render(); persist(); });
  el.nextHalf?.addEventListener('click', ()=>{ const i=Math.min(halfOrder.length-1,halfOrder.indexOf(state.half)+1); setMatchHalf(halfOrder[i]); render(); persist(); });
  el.startPause?.addEventListener('click', ()=>{ state.running=!state.running; render(); persist(); });
  el.resetTime?.addEventListener('click', ()=>{ state.seconds=0; state.running=false; el.clock.textContent='00:00'; render(); persist(); });
  el.secPerTick?.addEventListener('input', e=>{ state.secPerTick=Math.max(0.1,Number(e.target.value)||1); render(); persist(); });
  el.applyStartAt?.addEventListener('click', ()=>{ const sec=parseStartTime(el.startAt?.value); if(sec==null){ alert('형식은 mm:ss입니다. 예: 45:00'); return; } state.running=false; state.seconds=sec; el.clock.textContent=fmtClock(state.seconds); render(); persist(); });
  el.quick45?.addEventListener('click', ()=>{ el.startAt.value='45:00'; el.applyStartAt.click(); });
  el.quick90?.addEventListener('click', ()=>{ el.startAt.value='90:00'; el.applyStartAt.click(); });

  // [이벤트 등록] 추가 시간 표시/숨김 및 값 조정
  function setManualExtra(nextValue){
    state.extra = Math.max(0, Number(nextValue) || 0);
    state.extraShown = state.extra > 0;
    state.extraManualOverride = true; // 수동 조작 후엔 API 자동 갱신 건너뜀
    render();
    persist();
  }
  function toggleManualExtra(){
    state.extraShown = !state.extraShown;
    state.extraManualOverride = true; // 수동 토글 후엔 API 자동 갱신 건너뜀
    render();
    persist();
  }
  el.toggleExtra?.addEventListener('click', toggleManualExtra);
  el.extraInput?.addEventListener('input', e=>setManualExtra(e.target.value));
  el.extraPlus?.addEventListener('click', ()=>setManualExtra(state.extra + 1));
  el.extraMinus?.addEventListener('click', ()=>setManualExtra(state.extra - 1));

  // [이벤트 등록] 득점자 표시 여부 및 폰트 크기
  el.noteOn?.addEventListener('change', e=>{ state.noteEnabled=!!e.target.checked; render(); persist(); });
  el.noteFontSize?.addEventListener('input', e=>{ state.noteFontSize=Math.max(10,Number(e.target.value)||18); render(); persist(); });

  // [이벤트 등록] 보드/점수/팀카드 테두리 ON/OFF 및 두께 조정
  el.boardOutlineOn?.addEventListener('change', e=>{ state.boardOutlineEnabled=!!e.target.checked; render(); persist(); });
  el.scoreOutlineOn?.addEventListener('change', e=>{ state.scoreOutlineEnabled=!!e.target.checked; render(); persist(); });
  el.boardOutlineWidth?.addEventListener('input', e=>{ state.boardOutlineWidth=Math.max(0,Number(e.target.value)||0); setCSS('--board-outline-w',state.boardOutlineWidth+'px'); render(); persist(); });
  el.scoreOutlineWidth?.addEventListener('input', e=>{ state.scoreOutlineWidth=Math.max(0,Number(e.target.value)||0); setCSS('--score-outline-w',state.scoreOutlineWidth+'px'); render(); persist(); });
  el.homeOutlineOn?.addEventListener('change', e=>{ state.homeOutlineEnabled=!!e.target.checked; render(); persist(); });
  el.awayOutlineOn?.addEventListener('change', e=>{ state.awayOutlineEnabled=!!e.target.checked; render(); persist(); });
  el.homeOutlineWidth?.addEventListener('input', e=>{ state.homeOutlineWidth=Math.max(0,Number(e.target.value)||0); render(); persist(); });
  el.awayOutlineWidth?.addEventListener('input', e=>{ state.awayOutlineWidth=Math.max(0,Number(e.target.value)||0); render(); persist(); });

  // [이벤트 등록] 레드카드 크기·간격·위치 조정
  el.rcSize?.addEventListener('input', e=>{ state.rcSize=Math.max(6,Number(e.target.value)||14); render(); persist(); });
  el.rcGap?.addEventListener('input', e=>{ state.rcGap=Math.max(0,Number(e.target.value)||6); render(); persist(); });
  el.rcTop?.addEventListener('input', e=>{ state.rcTop=Number(e.target.value)||0; render(); persist(); });
  el.rcHomeInset?.addEventListener('input', e=>{ state.rcHomeInset=Math.max(0,Number(e.target.value)||0); render(); persist(); });
  el.rcAwayInset?.addEventListener('input', e=>{ state.rcAwayInset=Math.max(0,Number(e.target.value)||0); render(); persist(); });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [PK 관리] 킥 결과 추가, 되돌리기, 초기화
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 해당 팀(home/away)의 PK 결과 배열에 'G'(골) 또는 'M'(실패)을 추가 */
  function pkPush(team,res){ if(team==='home') state.pk.home.push(res); else state.pk.away.push(res); render(); persist(); }
  /** 마지막으로 추가된 PK 결과를 제거 (홈/어웨이 중 더 많은 쪽에서 pop) */
  function pkUndo(){ const h=state.pk.home.length,a=state.pk.away.length; if(h===0&&a===0) return; if(h>=a) state.pk.home.pop(); else state.pk.away.pop(); render(); persist(); }
  /** PK 결과 전체 초기화 */
  function pkReset(){ clearPkState(); render(); persist(); }
  // [이벤트 등록] PK 버튼 (홈/어웨이 골/미스, 되돌리기, 초기화)
  el.pkHomeGoal?.addEventListener('click', ()=>pkPush('home','G'));
  el.pkHomeMiss?.addEventListener('click', ()=>pkPush('home','M'));
  el.pkAwayGoal?.addEventListener('click', ()=>pkPush('away','G'));
  el.pkAwayMiss?.addEventListener('click', ()=>pkPush('away','M'));
  el.pkUndo?.addEventListener('click', pkUndo);
  el.pkReset?.addEventListener('click', pkReset);

  // [이벤트 등록] 템플릿 저장/삭제/내보내기/가져오기/불러오기

  /** templateSelect와 단일 템플릿 import가 공통으로 사용하는 state 반영 로직 */
  function applyTemplate(t){
    // 경기 ID가 로딩된 상태(자동 폴링 중 또는 fixture 응답 캐시 있음)에서는
    // 템플릿이 home/away 팀 컬러를 덮어쓰지 않게 보호.
    //   - API에서 받은 컬러 그대로 유지
    //   - 사용자가 테마 탭에서 수정한 컬러도 그대로 유지
    // (보드 배경/스코어/디지트/메타 등 비-팀 컬러는 템플릿대로 적용)
    const incoming = (t.colors || {});
    const fixtureLoaded = (typeof currentFixtureId !== 'undefined') && !!currentFixtureId;
    const TEAM_COLOR_KEYS = ['homeBg','homeText','awayBg','awayText','homeOutline','awayOutline'];
    const colorsToApply = fixtureLoaded
      ? Object.fromEntries(Object.entries(incoming).filter(([k]) => !TEAM_COLOR_KEYS.includes(k)))
      : incoming;
    state.colors={...state.colors,...colorsToApply};
    state.fontFamily=resolveTemplateFontFamily(t);
    if(t.logoAlign) state.logoAlign=t.logoAlign;
    if(t.radiusMode) state.radiusMode=t.radiusMode;
    if(t.boardWidth) state.boardWidth=t.boardWidth;
    if(t.homeLogoScale) state.homeLogoScale=t.homeLogoScale;
    if(t.awayLogoScale) state.awayLogoScale=t.awayLogoScale;
    if('homeOutlineEnabled' in t) state.homeOutlineEnabled=!!t.homeOutlineEnabled;
    if('awayOutlineEnabled' in t) state.awayOutlineEnabled=!!t.awayOutlineEnabled;
    if('homeOutlineWidth' in t) state.homeOutlineWidth=Number(t.homeOutlineWidth)||0;
    if('awayOutlineWidth' in t) state.awayOutlineWidth=Number(t.awayOutlineWidth)||0;
    if('boardOutlineEnabled' in t) state.boardOutlineEnabled=!!t.boardOutlineEnabled;
    if('scoreOutlineEnabled' in t) state.scoreOutlineEnabled=!!t.scoreOutlineEnabled;
    if('boardOutlineWidth' in t) state.boardOutlineWidth=Number(t.boardOutlineWidth)||0;
    if('scoreOutlineWidth' in t) state.scoreOutlineWidth=Number(t.scoreOutlineWidth)||0;
    if('noteEnabled' in t) state.noteEnabled=!!t.noteEnabled;
    if('noteFontSize' in t) state.noteFontSize=Number(t.noteFontSize)||18;
  }

  // theme.js가 나중에 로드되므로, export 버튼은 구현체를 지연 조회한다.
  function exportTemplatesFile(){
    return window.exportTemplatesFileImpl?.();
  }

  el.saveTemplate?.addEventListener('click', ()=>saveTemplate(el.templateName.value.trim()));
  el.deleteTemplate?.addEventListener('click', ()=>{ const typed=(el.templateName?.value||'').trim(); const selected=el.templateSelect?.value||''; deleteTemplate(typed||selected); });
  el.exportTemplates?.addEventListener('click', exportTemplatesFile);
  el.templateSelect?.addEventListener('change', ()=>{
    const name=el.templateSelect.value; if(!name) return;
    const t=loadTemplates().find(x=>x&&x.name===name); if(!t) return;
    applyTemplate(t);
    render(); persist();
  });
  el.importTemplates?.addEventListener('change', async e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const fallbackName=f.name.replace(/\.json$/i,'');
    try{
      const text=await f.text(); const parsed=JSON.parse(text);
      if(Array.isArray(parsed)){ let added=0,replaced=0,skipped=0; for(let i=0;i<parsed.length;i++){ const raw=parsed[i]; if(!raw||typeof raw!=='object'){ skipped++; continue; } if(!raw.name) raw.name=`${fallbackName||'Imported'}-${i+1}`; const res=upsertTemplateToLocal(raw,true); if(!res.saved){ skipped++; continue; } if(res.replaced) replaced++; else added++; } loadTemplates(); alert(`추가 ${added}, 덮어쓰기 ${replaced}, 건너뜀 ${skipped}`); }
      else if(parsed&&typeof parsed==='object'){ const t={...parsed}; if(!t.name) t.name=fallbackName||'Imported'; applyTemplate(t); render(); persist(); const{saved,name}=upsertTemplateToLocal(t,true); loadTemplates(); if(saved) el.templateSelect.value=name; alert('템플릿 적용됨.'+(saved?' (목록에 저장됨)':'')); }
      else alert('알 수 없는 템플릿 형식.');
    }catch{ alert('JSON 형식이 아닙니다.'); }
    finally{ e.target.value=''; }
  });
