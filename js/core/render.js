  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [스코어보드 렌더링] 점수판 UI 갱신, 레드카드·PK 렌더, 득점자 레이아웃, 배율 조정
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** scorePanel 너비를 --score-col CSS 변수에 동기화 (득점자 박스 너비 연동) */
  function syncScoreCol(){
    const w = el.scorePanel ? getDisplayLayoutRect(el.scorePanel).width || 180 : 180;
    setCSS('--score-col', w + 'px');
  }
  if (window.ResizeObserver && el.scorePanel){
    new ResizeObserver(syncScoreCol).observe(el.scorePanel);
  }
  window.addEventListener('resize', syncScoreCol);

  /** 레드카드 수만큼 .rc-card div를 생성해 홈/어웨이 컨테이너에 삽입 */
  function renderRedCards(){
    // 이벤트와 같은 아이콘을 쓰되 점수판의 카드 크기·직사각형 배치는 유지합니다.
    /**
     * 지정한 퇴장 수만큼 점수판 크기에 맞는 카드 아이콘 요소를 생성합니다.
     * @param {number} n 생성할 퇴장 카드 수입니다.
     * @returns {HTMLDivElement[]} 퇴장 표시 컨테이너에 삽입할 카드 요소 배열입니다.
     */
    const make = n => {
      const nodes = [];
      for (let i = 0; i < n; i++) {
        const card = document.createElement('div');
        card.className = 'rc-card has-event-icon';
        card.innerHTML = footballIconHtml('red-card');
        card.firstElementChild.setAttribute('preserveAspectRatio', 'none');
        nodes.push(card);
      }
      return nodes;
    };
    if(el.rcHome){ el.rcHome.replaceChildren(...make(state.redHome)); el.rcHome.classList.toggle('hidden', state.redHome===0); }
    if(el.rcAway){ el.rcAway.replaceChildren(...make(state.redAway)); el.rcAway.classList.toggle('hidden', state.redAway===0); }
  }

  /** PK 하프 여부에 따라 PK 패널 토글 및 PK 결과 도트(G/M) 렌더링 */
  // 현재 인라인 편집 중인 득점자 박스. 동시에 둘 이상 못 열게 단일 reference로 관리.
  let activeNoteEditor = null;

  /** 인라인 득점자 편집이 가능한 모드인지 — 수동 모드 ON + 득점자 표시 ON일 때만. */
  function canEditNotesInline() {
    return !!(state.manualMode && state.noteEnabled);
  }

  /** side('home'|'away')에 따른 note/noteSide DOM 페어 반환. 편집기 위치/사이즈 계산에 사용. */
  function getNoteTargets(side) {
    if (side === 'home') return { note: el.homeNote, noteSide: el.homeNoteSide };
    return { note: el.awayNote, noteSide: el.awayNoteSide };
  }

  let activeNoteMenu = null;
  function closeNoteMenu() {
    if (!activeNoteMenu) return;
    activeNoteMenu.menu.remove();
    activeNoteMenu.noteSide.classList.remove('note-menu-open');
    activeNoteMenu = null;
  }

  /** 편집창과 자동 득점자 박스가 같은 빠른 설정을 사용합니다. */
  function createNoteMenu() {
    const menu = document.createElement('div');
    menu.className = 'note-quick-menu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', '득점자 표시 설정');
    menu.innerHTML = `<div class="note-quick-row"><span>글자 크기</span><button type="button" data-note-action="sizeMinus" aria-label="글자 크기 줄이기">−</button><output data-note-size></output><button type="button" data-note-action="sizePlus" aria-label="글자 크기 키우기">+</button><button type="button" data-note-action="reset" aria-label="글자 크기 초기화">↶</button></div><div class="note-quick-shortcuts"></div><div class="note-quick-row"><span>테두리 굵기</span><button type="button" data-note-action="strokeMinus" aria-label="테두리 굵기 줄이기">−</button><output data-note-stroke></output><button type="button" data-note-action="strokePlus" aria-label="테두리 굵기 키우기">+</button><button type="button" data-note-action="resetStroke" aria-label="테두리 굵기 초기화">↶</button></div><button type="button" data-note-action="settings" class="note-quick-settings">상세 설정</button>`;
    if (state.manualMode) {
      const editingHint = document.createElement('div');
      editingHint.className = 'note-edit-shortcuts';
      editingHint.innerHTML = `<span><span class="kbd">Enter</span> 줄바꿈</span><span><span class="kbd">Ctrl+Enter</span> 또는 ✓ 저장</span><span><span class="kbd">Esc</span> 또는 바깥 클릭 취소</span>`;
      menu.append(editingHint);
    }
    menu.addEventListener('dblclick', event => event.stopPropagation());
    menu.addEventListener('click', event => {
      event.stopPropagation();
      const action = event.target.closest('[data-note-action]')?.dataset.noteAction;
      if (!action) return;
      if (action === 'settings') {
        closeNoteMenu();
        closeNoteEditor();
        activatePage('theme');
        const panel = document.querySelector('.theme-notes-card');
        if (panel) {
          panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
          // 반복해서 열어도 강조가 겹치지 않게 다시 시작하고, 완료 후 원래 스타일로 돌아갑니다.
          panel.getAnimations().filter(animation => animation.id === 'note-settings-glow').forEach(animation => animation.cancel());
          const glow = panel.animate([
            { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.4), 0 0 0 0 rgba(255,255,255,0)', offset: 0 },
            { boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.9), 0 0 16px 3px rgba(255,255,255,.8)', offset: .2 },
            { boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.9), 0 0 16px 3px rgba(255,255,255,.8)', offset: .65 },
            { boxShadow: getComputedStyle(panel).boxShadow, offset: 1 }
          ], { duration: 3000, easing: 'ease-out' });
          glow.id = 'note-settings-glow';
        }
        return;
      }
      if (action === 'reset') state.noteFontSize = 18;
      if (action === 'resetStroke') state.noteStrokeWidth = 1;
      if (action.startsWith('size')) state.noteFontSize = Math.max(10, (state.noteFontSize ?? 18) + (action === 'sizePlus' ? 1 : -1));
      if (action.startsWith('stroke')) state.noteStrokeWidth = clampNum((state.noteStrokeWidth ?? 1) + (action === 'strokePlus' ? .5 : -.5), 0, 10, 1);
      render(); persist();
    });
    return menu;
  }

  function syncNoteMenus() {
    if (activeNoteMenu && (state.manualMode || !state.noteEnabled)) closeNoteMenu();
    document.querySelectorAll('.note-quick-menu').forEach(menu => {
      menu.querySelector('[data-note-size]').textContent = state.noteFontSize ?? 18;
      menu.querySelector('[data-note-stroke]').textContent = state.noteStrokeWidth ?? 1;
      const hint = menu.querySelector('.note-quick-shortcuts');
      hint.replaceChildren(...['noteSizePlus', 'noteSizeMinus'].map((id, index) => {
        const item = document.createElement('span');
        const key = document.createElement('span');
        key.className = 'kbd';
        key.textContent = shortcutLabel(shortcutBinding(shortcutActions.find(action => action[0] === id)));
        item.append(index ? '줄이기 ' : '키우기 ', key);
        return item;
      }));
    });
    positionNoteMenus();
  }

  /** 좌우 끝의 텍스트에서 열어도 편집창과 메뉴가 화면 안에 남도록 보정합니다. */
  function positionNoteMenus() {
    const targets = [activeNoteMenu?.menu, activeNoteEditor?.editorWrap].filter(Boolean);
    targets.forEach(node => {
      node.style.translate = 'none';
      const rect = node.getBoundingClientRect();
      const scale = rect.width / node.offsetWidth || 1;
      const shift = Math.max(8 - rect.left, Math.min(0, document.documentElement.clientWidth - 8 - rect.right));
      node.style.translate = `${shift / scale}px 0`;
    });
  }

  document.addEventListener('mousedown', event => {
    if (activeNoteMenu && !activeNoteMenu.noteSide.contains(event.target)) closeNoteMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNoteMenu();
  });

  /**
   * 현재 활성 득점자 인라인 편집기를 닫는다.
   *
   * 1) activeNoteEditor 없으면 no-op.
   * 2) options.save=true면 textarea 값을 state.notes에 반영(\r\n 정규화) + persist + render.
   * 3) editorWrap DOM 제거 + note 표시 복원 + noteSide의 임시 width/editing 클래스 제거.
   * 4) outside-click 리스너 정리(cleanup).
   * 5) save가 아니면 autoLayoutNotes로 폭/폰트 재계산.
   */
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
    // 편집용 고정 너비를 해제했으므로 캐시를 비워 원래 클릭 영역까지 복원합니다.
    noteLayoutStamp = null;

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

  /**
   * 득점자 텍스트 박스를 클릭하면 textarea와 확인 버튼, 표시 설정 메뉴를 함께 엽니다.
   *
   * 1) 편집 가능 모드 가드(수동 + noteEnabled). 같은 side 재오픈은 focus만 다시.
   * 2) 다른 side가 열려있으면 save하며 닫고 새 편집기 열기.
   * 3) 현재 noteSide 폭을 고정(최소 220px) → 편집 중 너비 출렁임 방지.
   * 4) textarea(value=현재 notes, rows=줄 수) + ✓ 버튼을 wrap에 담아 noteSide에 삽입.
   * 5) 외부 클릭 시 cancel(close), Ctrl/Cmd+Enter면 save+close, Escape면 cancel.
   * 6) RAF로 textarea focus + select.
   */
  function openNoteEditor(side) {
    if (!canEditNotesInline()) return;
    closeNoteMenu();

    const { note, noteSide } = getNoteTargets(side);
    if (!note || !noteSide) return;

    if (activeNoteEditor?.side === side) {
      activeNoteEditor.textarea?.focus();
      activeNoteEditor.textarea?.select();
      return;
    }
    if (activeNoteEditor) closeNoteEditor({ save: true });

    const lockedWidth = Math.max(Math.ceil(getDisplayLayoutRect(noteSide).width || 0), 280);
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

    editorWrap.append(textarea, confirmBtn, createNoteMenu());
    note.style.display = 'none';
    noteSide.classList.add('editing');
    noteSide.style.width = `${lockedWidth}px`;
    noteSide.appendChild(editorWrap);
    syncNoteMenus();

    const onOutsideClick = event => {
      if (!activeNoteEditor || activeNoteEditor.side !== side) return;
      if (editorWrap.contains(event.target)) return;
      closeNoteEditor();
    };

    const cleanup = () => {
      document.removeEventListener('mousedown', onOutsideClick);
    };

    activeNoteEditor = { side, note, noteSide, editorWrap, textarea, cleanup };
    positionNoteMenus();

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

  ['home', 'away'].forEach(side => {
    getNoteTargets(side).noteSide?.addEventListener('click', event => {
      if (event.target.closest('button, input, textarea, .note-quick-menu') || !state.noteEnabled) return;
      if (state.manualMode) { openNoteEditor(side); return; }
      const { noteSide } = getNoteTargets(side);
      if (activeNoteMenu?.noteSide === noteSide) { closeNoteMenu(); return; }
      closeNoteMenu();
      const menu = createNoteMenu();
      noteSide.append(menu);
      noteSide.classList.add('note-menu-open');
      activeNoteMenu = { menu, noteSide };
      syncNoteMenus();
    });
  });

  /** state.pk[team] 배열에서 'G'(득점) 개수 카운트. PK 점수판 표시용. */
  function countPkGoals(arr) {
    return (Array.isArray(arr) ? arr : []).filter(v => v === 'G').length;
  }

  /**
   * PK 점수판에 표시할 숫자 결정 — 자동 모드면 API 값 우선, 수동/없으면 시퀀스 'G' 개수로 폴백.
   * (Iter 4-3: PK 시퀀스 누락 시에도 점수판 숫자는 정확하게 표시되도록.)
   */
  function getPkDisplayScore(team) {
    const apiScore = state.pkScore?.[team];
    if (!state.manualMode && apiScore != null) return Math.max(0, Number(apiScore) || 0);
    return countPkGoals(state.pk?.[team]);
  }

  /**
   * PK 패널 토글 + PK 점수/시퀀스 도트 렌더링.
   * isPK=false면 패널 숨김으로 끝. isPK=true면 점수 텍스트 + 양 팀 dot 행 그림.
   * dot은 최소 5개부터 시작, 시퀀스가 길어지면 그만큼 늘림. 'G'=득점 원, 'M'=실축 ×.
   */
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
    const homeNameText = el.homeName.querySelector('.text') || el.homeName;
    const awayNameText = el.awayName.querySelector('.text') || el.awayName;
    homeNameText.textContent = scoreboardTeamDisplayName('home');
    el.homeName.setAttribute('role', 'button');
    el.homeName.tabIndex = 0;
    el.homeName.setAttribute('aria-label', '홈 팀 닉네임 편집');
    awayNameText.textContent = scoreboardTeamDisplayName('away');
    el.awayName.setAttribute('role', 'button');
    el.awayName.tabIndex = 0;
    el.awayName.setAttribute('aria-label', '원정 팀 닉네임 편집');
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

    // 3. 팀 로고 표시/숨김 및 바깥 투명 여백 보정.
    // LogoTrim이 URL별 경계를 30일 동안 캐시하고, 미분석·만료 로고만 비동기로 분석한다.
    // 원본 src는 유지하며 별·반투명 테두리까지 포함한 경계에 맞춰 크기와 중심을 조절한다.
    // URL 교체 시 이전 보정을 초기화하고, 분석 실패 시 원본을 표시하는 처리도 모듈에 위임한다.
    // 로고 렌더는 아래에서 색상·배율 적용 후 수행해 최종 표시 크기로 외곽색을 검사한다.

    // 4. 색상 CSS 변수 일괄 적용. greenscreen ON일 때는 chromaSafe()로 초록 계열만 시안으로 치환.
    //    --bg-ui는 settings-popup.js의 applyBackgroundSettings가 별도 관리하므로 여기선 건너뜀.
    setCSS('--board-a',     chromaSafe(state.colors.boardA));
    setCSS('--board-b',     chromaSafe(state.colors.boardB));
    setCSS('--score-bg',    chromaSafe(state.colors.scoreBg));
    setCSS('--digits-color',chromaSafe(state.colors.digits));
    setCSS('--meta-color',  chromaSafe(state.colors.meta));
    setCSS('--extra-color', chromaSafe(state.colors.extra));
    setCSS('--half-bg',     chromaSafe(state.colors.halfBg));
    setCSS('--half-text',   chromaSafe(state.colors.halfText));
    setCSS('--home-bg',     chromaSafe(state.colors.homeBg));
    setCSS('--home-text',   chromaSafe(state.colors.homeText));
    setCSS('--away-bg',     chromaSafe(state.colors.awayBg));
    setCSS('--away-text',   chromaSafe(state.colors.awayText));
    setCSS('--card-outline',chromaSafe(state.colors.outline));
    setCSS('--pk-base',     chromaSafe(state.colors.pkBase));
    setCSS('--pk-goal', chromaSafe(state.colors.pkGoal));
    setCSS('--pk-miss', chromaSafe(state.colors.pkMiss));
    setCSS('--home-outline',chromaSafe(state.colors.homeOutline));
    setCSS('--away-outline',chromaSafe(state.colors.awayOutline));
    setCSS('--home-outline-w', (state.homeOutlineWidth??1)+'px');
    setCSS('--away-outline-w', (state.awayOutlineWidth??1)+'px');
    setCSS('--board-outline-w', (state.boardOutlineWidth??1)+'px');
    setCSS('--score-outline-w', (state.scoreOutlineWidth??1)+'px');
    // 정상 배치의 폰트 크기는 autoLayoutNotes가 관리한다. 폴링마다 기본값으로
    // 되돌리면 축소해서 맞춘 배치도 다시 계산해야 한다. 편집 중에는 설정값을 반영한다.
    if (activeNoteEditor) {
      setCSS('--note-font-size-home', (state.noteFontSize??18)+'px');
      setCSS('--note-font-size-away', (state.noteFontSize??18)+'px');
    }
    setCSS('--note-stroke', chromaSafe(state.colors.noteStroke));
    const noteStrokeWidth = clampNum(state.noteStrokeWidth, 0, 10, 1);
    const noteKeyGuardWidth = isGreenscreenOn() && noteStrokeWidth > 0 ? 0.75 : 0;
    setCSS('--note-key-guard-w', noteKeyGuardWidth + 'px');
    setCSS('--note-key-guard-visibility', noteKeyGuardWidth > 0 ? 'visible' : 'hidden');
    setCSS('--note-stroke-w', noteStrokeWidth + 'px');
    setCSS('--note-stroke-w-neg', -noteStrokeWidth + 'px');
    if (el.noteStrokeWidth) el.noteStrokeWidth.value = noteStrokeWidth;
    setCSS('--note-text', chromaSafe(state.colors.noteText));
    if (typeof applyPageBackground === 'function') applyPageBackground();
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
      el.homeNote.title = state.noteEnabled ? (state.manualMode ? '클릭해서 홈 득점자 편집' : '클릭해서 득점자 표시 설정') : '';
    }
    if(el.awayNote) {
      el.awayNote.classList.toggle('manual-editable', !!state.manualMode && !!state.noteEnabled);
      el.awayNote.title = state.noteEnabled ? (state.manualMode ? '클릭해서 원정 득점자 편집' : '클릭해서 득점자 표시 설정') : '';
    }
    if(el.noteOn) el.noteOn.checked = !!state.noteEnabled;
    if ($('boardPosition')) $('boardPosition').value = state.boardPosition || 'center';
    syncBoardPositionButtons();
    if(el.inNoteStroke) el.inNoteStroke.value = state.colors.noteStroke;
    if(el.inNoteText) el.inNoteText.value = state.colors.noteText;

    // 6. 득점자 텍스트 자동 레이아웃 (허용 줄 수→묶음 최적화→폰트 축소)
    autoLayoutNotes();

    // 7. 로고 정렬 모드 및 보드 테두리 클래스 적용
    syncNoteMenus();
    const boardEl = $('board');
    boardEl.classList.remove('align-outer','align-inner','align-hybrid');
    boardEl.classList.add(`align-${state.logoAlign}`);
    boardEl.classList.toggle('outline-on', !!state.boardOutlineEnabled);
    if(el.scorePanel) el.scorePanel.classList.toggle('outline-on', !!state.scoreOutlineEnabled);
    if(el.logoAlign) el.logoAlign.value = state.logoAlign;

    el.homeCard.classList.toggle('outline-on', !!state.homeOutlineEnabled);
    el.awayCard.classList.toggle('outline-on', !!state.awayOutlineEnabled);
    if(el.homeOutlineOn) el.homeOutlineOn.checked = !!state.homeOutlineEnabled;
    if(el.awayOutlineOn) el.awayOutlineOn.checked = !!state.awayOutlineEnabled;
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
    const manualPsoMode = document.getElementById('manualPsoMode');
    const psoControls = document.getElementById('psoControls');
    const psoHost = document.querySelector(state.manualMode ? '#manual-section .manual-controls-row' : '.theme-timer-card');
    if (psoControls && psoHost && psoControls.parentElement !== psoHost) psoHost.appendChild(psoControls);
    // 수동 모드 퇴장 입력은 항상 승부차기 컨트롤 오른쪽에 둔다.
    const manualRedCards = document.getElementById('manualRedCards');
    if (state.manualMode && psoControls && manualRedCards && psoControls.nextElementSibling !== manualRedCards) psoControls.after(manualRedCards);
    if ($('manualHomeRedVal')) $('manualHomeRedVal').textContent = state.redHome ?? 0;
    if ($('manualAwayRedVal')) $('manualAwayRedVal').textContent = state.redAway ?? 0;
    if (manualPsoMode) {
      manualPsoMode.checked = state.half === 'PK';
      manualPsoMode.disabled = false;
    }
    if (typeof window.updateScoreShortcutHint === 'function') window.updateScoreShortcutHint();
    ['pkHomeGoal','pkHomeMiss','pkAwayGoal','pkAwayMiss','pkUndo','pkReset'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = state.half !== 'PK';
    });
    el.extraInput.value = state.extra;
    el.secPerTick.value = state.secPerTick;
    el.startPause.textContent = state.running ? '일시정지 (Space)' : '시작 (Space)';

    const resetApiColors = document.getElementById('resetApiTeamColors');
    if (resetApiColors) resetApiColors.disabled = !window.canResetFixtureTeamColors?.();

    // 12. 색상 피커 input 값을 state와 동기화
    // uiBg는 설정 팝업으로 이전됨 (Iter 5-7) — el.inUiBg/state.colors.uiBg 동기화 라인 제거.
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
    if($('inPkGoal')) $('inPkGoal').value = state.colors.pkGoal;
    if($('inPkMiss')) $('inPkMiss').value = state.colors.pkMiss;

    if(window.colorMap){
      window.colorMap.forEach(([id, key]) => {
        const hex = $(id+'Hex');
        if(hex) hex.value = state.colors[key];
        $(id)?.syncRgb?.(state.colors[key]);
      });
    }

    // 13. 하위 렌더 함수 호출 (PK 도트, 레드카드, 스코어 컬럼 너비, 전술판 색상)
    renderPK();
    renderRedCards();
    syncScoreCol();
    for (const side of ['home', 'away']) {
      // 네이션스리그는 팀 엠블럼 대신 전용 장식을 표시하므로 로고 분석을 적용하지 않습니다.
      if (el[`${side}Logo`]?.closest('.fsm-board')?.dataset.fsmTheme === 'unl') continue;
      LogoTrim.render(el[`${side}Logo`], state[`${side}Logo`], ready => {
        ScoreboardLogoContrast.render(el[`${side}Logo`], el[`${side}Card`],
          chromaSafe(state.colors[`${side}Bg`]), chromaSafe(state.colors[`${side}Text`]), ready);
      });
    }
    // 전술판 토큰 색상 동기화 — 팀 색상이 실제로 바뀐 경우에만 재렌더 (매 render() 호출 시 DOM 재생성하면 드래그/선택 상태가 깨짐)
    if (typeof tacticsState !== 'undefined' && typeof tacticsRenderTokens === 'function') {
      const _tck = [state.colors.homeBg, state.colors.homeText, state.colors.awayBg, state.colors.awayText].join('|');
      if (_tck !== render._lastTacticsColorKey) { render._lastTacticsColorKey = _tck; tacticsRenderTokens(); }
    }
    requestAnimationFrame(() => {
      if (typeof fsmBoardRender === 'function') fsmBoardRender();
    });
  }

  /**
   * 점수판/득점자 박스 깜빡임 효과(.flash-update 클래스).
   * 이미 적용 중이면 강제 reflow(offsetWidth read)로 애니메이션 재시작.
   * animationend에서 클래스 자동 제거 — 다음 호출 때 다시 적용 가능하게.
   *
   * fixture.js의 폴링 응답 처리에서 호출. render() 안에서 자동 비교하지 않음
   * (render는 색상/폰트 등 다른 사유로도 호출되므로 깜빡임이 무관한 시점에 발동되는 문제 방지).
   */
  function flashElement(target) {
    if (!target) return;
    target.classList.remove('flash-update');
    // 강제 reflow → 같은 클래스 재부여 시 애니메이션 재시작 보장
    void target.offsetWidth;
    target.classList.add('flash-update');
    target.addEventListener('animationend', () => target.classList.remove('flash-update'), { once: true });
  }
  // 외부(fixture.js)에서 호출용. side: 'home'|'away'
  let pendingPositionFlash = false;
  function flashBoardUpdate(target) {
    const stage = $('boardStageInner');
    if (pendingPositionFlash || stage?.classList.contains('flash-update')) {
      stage.querySelectorAll('.flash-update').forEach(node => node.classList.remove('flash-update'));
      flashElement(stage);
      pendingPositionFlash = false;
    } else flashElement(target);
  }
  window.flashScore = side => flashBoardUpdate(side === 'away' ? el.awayScore : el.homeScore);
  window.flashNote  = side => flashBoardUpdate(side === 'home' ? el.homeNoteSide : el.awayNoteSide);

  /** state.pk 시퀀스를 양 팀 모두 빈 배열로 리셋. PK 종료 후 retention 만료 등에서 호출. */
  function clearPkState() {
    if(!state.pk) state.pk = { home: [], away: [] };
    state.pk.home = [];
    state.pk.away = [];
  }

  /**
   * PK 빠져나간 시점(pkLastExitedAt)으로부터 retention 시간이 지났으면 PK 시퀀스 자동 폐기.
   * - PK 하프 진행 중이거나 lastExitedAt가 없으면 no-op.
   * - retention 안이면 보존, 지났으면 clear.
   * 반환값: 실제 만료 처리했는지 boolean.
   * (PK 하프에서 잠깐 다른 하프로 전환했다 돌아와도 시퀀스를 일정 시간 보존하기 위함.)
   */
  function expireStalePkState(now = Date.now()) {
    const lastExitedAt = Number(state.pkLastExitedAt) || 0;
    if (state.half === 'PK' || !lastExitedAt) return false;
    if ((now - lastExitedAt) <= PK_RETENTION_MS) return false;
    clearPkState();
    state.pkLastExitedAt = 0;
    return true;
  }

  /**
   * 하프(전후반) 변경 단일 진입점. halfOrder 안 값만 허용.
   *
   * 1) 같은 값으로 변경하려 하거나 알 수 없는 값이면 no-op.
   * 2) PK → 다른 하프 전환: pkLastExitedAt 기록(시퀀스 보존 retention 시작).
   * 3) 다른 하프 → PK 진입: lastExitedAt 확인 → retention 지났으면 clear, 안 지났으면 보존.
   *    (다시 들어왔으니 lastExitedAt은 0으로.)
   * 4) state.half 갱신.
   */
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
  // [스코어보드 렌더링 - 득점자 자동 레이아웃] 허용 높이와 폭에 맞춰 줄 묶음을 최적화
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
  function escapeNoteHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function getNoteLineClass(line) {
    if (String(line).includes('(PK 실축)')) return 'note-line note-line-pk-miss';
    if (String(line).includes('(퇴장)')) return 'note-line note-line-red-card';
    if (String(line).includes('(OG)')) return 'note-line note-line-own-goal';
    return 'note-line';
  }

  function renderNoteLine(line) {
    const text = escapeNoteHtml(line);
    return `<span class="${getNoteLineClass(line)}" role="img" aria-label="${text}"><span class="note-line-measure" aria-hidden="true">${text}</span><svg class="note-line-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><text class="note-line-svg-text">${text}</text></svg></span>`;
  }

  function alignNoteSvg(noteEl) {
    if (!noteEl.getClientRects().length) return;
    // HTML의 자동 줄 배치와 폭 측정은 유지하고 SVG 글자만 같은 영역에 맞춘다.
    const measurements = [...noteEl.querySelectorAll('.note-line')].map(line => {
      const text = line.querySelector('.note-line-svg-text');
      return { text, box: text.getBBox(), height: line.offsetHeight };
    });
    measurements.forEach(({ text, box, height }) => {
      text.setAttribute('transform', `translate(${-box.x} ${(height - box.height) / 2 - box.y})`);
    });
  }

  /** 득점자 줄 배열을 perRow 명씩 한 줄로 합쳐 HTML 반환 (perRow=1이면 줄마다 표시) */
  function formatScorers(lines, perRow) {
    const rows = [];
    const rowSize = Math.max(1, Number(perRow) || 1);
    for (let i = 0; i < lines.length; i += rowSize) {
      const row = lines
        .slice(i, i + rowSize)
        .map(renderNoteLine)
        .join('<span class="note-line-gap">  </span>');
      rows.push(`<span class="note-row">${row}</span>`);
    }
    return rows.join('');
  }

  // 설정 미리보기에서도 실제 득점자 SVG와 외곽선 배치를 그대로 사용합니다.
  window.renderScorerPreview = (element, lines) => {
    element.innerHTML = formatScorers(lines, 1);
    if (!element.getClientRects().length) return;
    // 미리보기 폭 안에서 실제 SVG 글자와 외곽선이 잘리지 않도록 함께 맞춥니다.
    let size = 12;
    element.style.setProperty('font-size', `${size}px`, 'important');
    const availableWidth = element.parentElement.clientWidth - 8;
    const fits = () => [...element.querySelectorAll('.note-line')].every(line => line.getBoundingClientRect().width <= availableWidth);
    while (size > 8 && !fits()) {
      size--;
      element.style.setProperty('font-size', `${size}px`, 'important');
    }
    alignNoteSvg(element);
  };

  /**
   * 단일 팀 득점자 텍스트의 폰트 크기와 줄 배치를 자동으로 조정.
   * boardH(보드 높이)를 초과하지 않도록 단계적으로 레이아웃을 최적화하고
   * 최종 적용된 폰트 크기를 반환한다.
   */
  function autoLayoutNote(noteEl, noteSideEl, lines, boardH, cssVar, maxWidth = Infinity) {
    if (!noteEl) return 0;

    const baseSize = state.noteFontSize ?? 18;
    const MIN_SIZE = 8;

    // 설정한 글자 크기를 우선 유지하며 배치를 탐색합니다.
    let effectiveSize = baseSize;
    while (true) {
      // 1단계: 현재 글자 크기로 항목을 한 줄씩 그려 각 항목의 실제 폭을 측정합니다.
      setCSS(cssVar, effectiveSize + 'px');
      noteEl.innerHTML = formatScorers(lines, 1);
      const entries = [...noteEl.querySelectorAll('.note-line')];
      if (!entries.length) break;
      const style = getComputedStyle(noteEl);
      // 2단계: 상하 패딩을 뺀 허용 높이를 줄 높이로 나눠 최대 줄 수를 정합니다.
      // 줄 높이에는 글자 크기와 외곽선 두께가 포함되며, 항목 수보다 많은 줄은 만들지 않습니다.
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const rowHeight = parseFloat(style.lineHeight);
      const rowCount = Math.max(1, Math.min(lines.length, Math.floor((boardH - padding) / rowHeight)));
      if (rowCount < lines.length) {
        // 3단계: 항목 순서를 유지하면서 가장 긴 줄의 폭이 최소가 되는 묶음을 찾습니다.
        // 누적 폭으로 연속 항목의 너비를 구하고, 항목 사이 간격도 함께 더합니다.
        const gap = parseFloat(style.fontSize) * .9;
        const prefix = [0];
        entries.forEach(entry => prefix.push(prefix[prefix.length - 1] + entry.offsetWidth));
        const costs = Array.from({length: rowCount + 1}, () => Array(lines.length + 1).fill(Infinity));
        const breaks = Array.from({length: rowCount + 1}, () => []);
        costs[0][0] = 0;
        // costs[줄 수][항목 수]는 해당 항목들을 배치했을 때 가장 긴 줄의 최소 폭입니다.
        // 가능한 이전 줄의 끝을 비교하고, 선택한 경계를 breaks에 기록합니다.
        for (let row = 1; row <= rowCount; row++) {
          for (let end = row; end <= lines.length; end++) {
            for (let start = row - 1; start < end; start++) {
              const width = prefix[end] - prefix[start] + gap * (end - start - 1);
              const cost = Math.max(costs[row - 1][start], width);
              if (cost < costs[row][end]) {
                costs[row][end] = cost;
                breaks[row][end] = start;
              }
            }
          }
        }
        const rows = [];
        // 4단계: 마지막 항목부터 선택한 경계를 역추적해 실제 줄을 구성합니다.
        // 선수 이름이나 여러 득점 시간을 나누지 않고 항목 전체를 같은 줄에 둡니다.
        let end = lines.length;
        for (let row = rowCount; row > 0; row--) {
          const start = breaks[row][end];
          rows.unshift(`<span class="note-row">${lines.slice(start, end).map(renderNoteLine).join('<span class="note-line-gap">  </span>')}</span>`);
          end = start;
        }
        noteEl.innerHTML = rows.join('');
      }
      // 5단계: 높이와 폭이 모두 맞으면 확정합니다. 부족할 때만 1px 줄여 줄 수와 묶음을 다시 계산합니다.
      if ((noteEl.scrollHeight <= boardH && noteEl.scrollWidth <= maxWidth) || effectiveSize <= MIN_SIZE) break;
      effectiveSize -= 1;
    }

    alignNoteSvg(noteEl);
    return effectiveSize;
  }

  /**
   * 홈/어웨이 득점자 패널을 각각 독립적으로 자동 레이아웃하고
   * note-side 박스를 스코어보드 양 옆에 절대 위치로 고정시키는 통합 함수.
   */
  let noteLayoutStamp = null;
  function autoLayoutNotes() {
    if (activeNoteEditor) return;
    // 1. 보드 높이 측정 — 아직 렌더되지 않으면 종료
    const boardEl = $('board');
    if (!boardEl || !el.homeNote || !el.awayNote) return;

    const main = boardEl.querySelector('.scoreboard-main');
    // 띠의 가운데를 유지하면서 타이머 높이만큼 위/아래 여유를 각각 확보합니다.
    // offsetHeight는 미리보기 배율 적용 전 크기이며, display:none인 타이머는 0입니다.
    const timerHeights = Array.from(boardEl.querySelectorAll('.scoreboard-timer, .time, .extra-time'))
      .map(node => node.offsetHeight);
    const timerH = Math.max(0, ...timerHeights);
    const boardH = main ? main.offsetHeight + 2 * timerH : boardEl.offsetHeight;
    if (!boardH) return;

    // 2. 득점자 줄 배열 추출
    const homeLines = (state.notes?.home ?? '').split('\n').filter(l => l.trim());
    const awayLines = (state.notes?.away ?? '').split('\n').filter(l => l.trim());

    const homeNoteSide = $('homeNoteSide');
    const awayNoteSide = $('awayNoteSide');

    // 렌더·폰트 완료·크기 감지가 같은 배치를 다시 요청하더라도 내용과 실제 배치가
    // 같으면 SVG와 줄 묶음을 다시 만들지 않는다. 색상은 기존 CSS 상속으로 갱신된다.
    /**
     * 득점자 줄, 표시 설정, 보드 기하 정보, 로딩된 글꼴과 계산된 스타일을 직렬화한다.
     * 내용이 같아도 테마·배율·사용 가능한 공간이 바뀌면 다시 배치해야 하므로 함께 기록한다.
     * 캐시 적중 여부는 이 키뿐 아니라 실제 자식 노드의 동일성도 확인해 판정한다.
     * 배치 과정에서 보드 위치가 달라질 수 있으므로 최종 결과를 저장할 때 다시 호출한다.
     *
     * @returns {string} 현재 득점자 레이아웃 입력을 나타내는 JSON 문자열.
     */
    const inputKey = () => {
      const stage = $('boardStageInner');
      /**
       * 현재 미리보기 변환이 적용된 화면 좌표와 크기를 읽는다.
       * 득점자 배치는 보드와 주변 영역의 위치 관계에 의존하므로 폭·높이뿐 아니라
       * 좌측·상단 좌표도 기록한다. DOM을 변경하지 않지만 필요하면 브라우저 배치를 확정한다.
       *
       * @param {Element|null} node 측정할 요소.
       * @returns {number[]|null} [left, top, width, height], 요소가 없으면 null.
       */
      const rectKey = node => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return [r.left, r.top, r.width, r.height];
      };
      /**
       * 득점자 글자의 자연 크기와 줄바꿈, 외곽선 여유에 영향을 주는 스타일을 수집한다.
       * 글꼴 이름이 같아도 크기·굵기·자간·패딩이 바뀔 수 있어 각 값을 함께 비교한다.
       * 현재 피팅 결과의 fontSize도 포함해 외부 스타일 변경을 캐시 적중으로 오인하지 않는다.
       *
       * @param {Element} node 득점자 텍스트 요소.
       * @returns {string[]} 계산된 글꼴·박스·외곽선 관련 값의 배열.
       */
      const fontKey = node => {
        const s = getComputedStyle(node);
        return [s.fontFamily, s.fontSize, s.lineHeight, s.fontWeight, s.fontStyle, s.fontStretch, s.letterSpacing, s.wordSpacing,
          s.padding, s.borderWidth, s.boxSizing, s.textTransform,
          s.getPropertyValue('--note-stroke-w'), s.getPropertyValue('--note-key-guard-w')];
      };
      let loadedFonts = 0;
      document.fonts?.forEach(face => { if (face.status === 'loaded') loadedFonts++; });
      return JSON.stringify([homeLines, awayLines, state.noteFontSize ?? 18,
        state.noteEnabled, state.manualMode, state.boardScale, state.boardPosition,
        boardEl.className, boardEl.dataset.fsmTheme, boardH, timerH, loadedFonts,
        $('boardStageWrap').clientWidth, rectKey(stage), rectKey(boardEl), rectKey(main),
        main ? Array.from(main.children, rectKey) : [], fontKey(el.homeNote), fontKey(el.awayNote)]);
    };
    const key = inputKey();
    if (noteLayoutStamp?.key === key && noteLayoutStamp.home === el.homeNote.firstChild
      && noteLayoutStamp.away === el.awayNote.firstChild) return;

    // 중요: autoLayoutNote는 noteEl.scrollHeight를 보고 보드 높이 초과 여부를 판정하는데,
    // .note에 overflow-wrap:anywhere + white-space:pre-line이 걸려있어서, 부모 noteSide의
    // shrink-to-fit(width:auto)이 min-content(한 토큰 폭, 예: "16'" 47px)로 떨어지는 케이스가
    // 있음. 그러면 자식이 모든 글자에 줄바꿈하여 scrollHeight가 폭증, 잘못된 압축/축소 발동.
    // → max-content로 명시 고정해 자연 폭(가장 긴 줄)을 강제로 사용하게 한 뒤 측정.
    if (homeNoteSide) homeNoteSide.style.width = 'max-content';
    if (awayNoteSide) awayNoteSide.style.width = 'max-content';

    const scale = boardScaleFactor(state.boardScale ?? 85);
    const viewportWidth = $('boardStageWrap').clientWidth;
    const available = Math.max(0, (viewportWidth - 16) / scale - boardEl.offsetWidth - 10);
    const position = state.boardPosition || 'center';
    // 먼저 기존 세로 배치로 측정하고, 묶음의 중심이 과도하게 밀릴 때만 가로 폭을 줄입니다.
    let homeSize = autoLayoutNote(el.homeNote, homeNoteSide, homeLines, boardH, '--note-font-size-home');
    let awaySize = autoLayoutNote(el.awayNote, awayNoteSide, awayLines, boardH, '--note-font-size-away');
    const homeNatural = homeLines.length ? el.homeNote.scrollWidth + 20 : 0;
    const awayNatural = awayLines.length ? el.awayNote.scrollWidth + 20 : 0;
    const totalNatural = homeNatural + awayNatural;
    // 좌우 배치에서는 기본 중심과 화면 중앙 사이의 중간선을 넘을 때 축소합니다.
    const horizontalLimit = position === 'center' ? available : available / 2;
    if (state.noteEnabled && totalNatural > horizontalLimit) {
      const ratio = horizontalLimit / totalNatural;
      if (homeNatural) homeSize = autoLayoutNote(el.homeNote, homeNoteSide, homeLines, boardH,
        '--note-font-size-home', Math.max(0, homeNatural * ratio - 20));
      if (awayNatural) awaySize = autoLayoutNote(el.awayNote, awayNoteSide, awayLines, boardH,
        '--note-font-size-away', Math.max(0, awayNatural * ratio - 20));
    }

    // 4. 테마 탭 폰트 크기 입력란에 둘 중 작은 값 표시
    if (el.noteFontSize) el.noteFontSize.value = Math.min(homeSize, awaySize);

    // 5. note-side 너비를 내용 scrollWidth에 맞게 동적 조정 (위에서 'auto'로 풀어둔 상태)
    const PAD = 20;
    const MIN_EDIT_W = (state.manualMode && state.noteEnabled) ? 140 : 0;
    const homeW = Math.max(MIN_EDIT_W, homeLines.length ? el.homeNote.scrollWidth + PAD : 0);
    const awayW = Math.max(MIN_EDIT_W, awayLines.length ? el.awayNote.scrollWidth + PAD : 0);

    if (homeNoteSide) homeNoteSide.style.width = homeW + 'px';
    if (awayNoteSide) awayNoteSide.style.width = awayW + 'px';

    // 6. stageInner 기준으로 note-side를 board 양 옆에 절대 위치로 고정
    positionNoteSides(boardEl, main);
    // 배치 과정에서 보드 중심이 이동할 수 있으므로 최종 위치를 기록한다.
    noteLayoutStamp = { key: inputKey(), home: el.homeNote.firstChild, away: el.awayNote.firstChild };
  }

  /**
   * 득점자 박스(note-side)를 점수판 띠 양 옆과 세로 가운데에 붙이고 보드 좌우 배치를 다시 맞춘다.
   * 글자 크기·줄 묶음·박스 폭은 건드리지 않는 위치 전용 단계라, 전체 피팅(autoLayoutNotes)과
   * 전환 애니메이션 중 크기 감지 경로(autoLayoutNotesOnResize)가 같은 계산을 공유한다.
   *
   * @param {HTMLElement} boardEl 점수판 요소.
   * @param {HTMLElement|null} main 점수판 띠(.scoreboard-main).
   * @returns {void} note-side의 right/left/top과 보드 이동량을 갱신한다.
   */
  function positionNoteSides(boardEl, main) {
    const stageEl = $('boardStageInner');
    const homeNoteSide = $('homeNoteSide');
    const awayNoteSide = $('awayNoteSide');
    if (!stageEl || !boardEl) return;
    const boardLeft  = boardEl.offsetLeft;
    const boardRight = stageEl.offsetWidth - boardEl.offsetLeft - boardEl.offsetWidth;
    if (homeNoteSide) homeNoteSide.style.right = boardRight + boardEl.offsetWidth + 'px';
    if (awayNoteSide) awayNoteSide.style.left  = boardLeft  + boardEl.offsetWidth + 'px';
    if (main) {
      // 회전하거나 이동한 로고 영역의 끝은 점수판 배치 박스의 경계와 다릅니다.
      // 미리보기 배율도 변환하여 실제 표시 영역을 기준으로 이벤트 텍스트를 배치합니다.
      const stageRect = stageEl.getBoundingClientRect();
      const scale = stageRect.width / stageEl.offsetWidth || 1;
      const slots = Array.from(main.children).filter(child => {
        const style = getComputedStyle(child);
        return style.display !== 'none' && style.position !== 'absolute';
      }).map(child => child.getBoundingClientRect());
      if (slots.length) {
        const left = (Math.min(...slots.map(rect => rect.left)) - stageRect.left) / scale;
        const right = (Math.max(...slots.map(rect => rect.right)) - stageRect.left) / scale;
        const noteGap = 5;
        if (homeNoteSide) homeNoteSide.style.right = stageEl.offsetWidth - left + noteGap + 'px';
        if (awayNoteSide) awayNoteSide.style.left = right + noteGap + 'px';
      }
    }
    const noteTop = main ? boardEl.offsetTop + main.offsetTop + main.offsetHeight / 2 + 'px' : '50%';
    if (homeNoteSide) homeNoteSide.style.top = noteTop;
    if (awayNoteSide) awayNoteSide.style.top = noteTop;
    syncBoardPosition();
    positionNoteMenus();
  }

  // 점수판 크기 감지(init.js ResizeObserver) 진입점.
  // 테마 전환 같은 CSS 전환 애니메이션(0.9초) 동안은 점수판 크기가 매 프레임 바뀌어 감지가 매 프레임 온다.
  // 이때 전체 피팅을 돌리면 캐시 키(보드 rect)가 매번 달라 적중하지 않고, 득점자 줄을 매 프레임 다시 그리며
  // 강제 레이아웃을 반복한다(2026-10-17, 득점자 있는 상태 CPU 4배 감속에서 russiancup/cl 전환당 460~566ms).
  // 전환 중에는 위치만 따라가게 하고, 전환이 모두 끝난 뒤 최종 크기로 한 번만 전체 피팅한다.
  let noteTransitionWait = null;
  /**
   * 점수판 안에서 진행 중인 CSS 전환(transition)을 모은다. 무한 반복 keyframe 애니메이션은
   * 끝나지 않으므로 대상이 아니다.
   *
   * @param {HTMLElement} boardEl 점수판 요소.
   * @returns {Animation[]} 진행 중인 CSSTransition 목록.
   */
  function runningBoardTransitions(boardEl) {
    if (!boardEl.getAnimations || typeof CSSTransition === 'undefined') return [];
    return boardEl.getAnimations({ subtree: true })
      .filter(anim => anim instanceof CSSTransition && anim.playState === 'running');
  }
  /**
   * 크기 감지 콜백. 전환 중이면 득점자 박스 위치만 맞추고, 전환이 끝나면 전체 피팅을 한 번 예약한다.
   * 전환이 아니면(시계 글자 폭 변화 등) 기존처럼 바로 전체 피팅한다.
   *
   * @returns {void}
   */
  function autoLayoutNotesOnResize() {
    if (activeNoteEditor) return;
    const boardEl = $('board');
    if (!boardEl) return;
    const transitions = runningBoardTransitions(boardEl);
    if (!transitions.length) {
      if (!noteTransitionWait) autoLayoutNotes();
      return;
    }
    positionNoteSides(boardEl, boardEl.querySelector('.scoreboard-main'));
    if (noteTransitionWait) return;
    // 기다리는 동안 새 전환이 시작될 수 있어, 끝날 때 다시 확인하고 남아 있으면 그것도 기다린다.
    const waitAll = list => Promise.allSettled(list.map(anim => anim.finished)).then(() => {
      const rest = runningBoardTransitions(boardEl);
      return rest.length ? waitAll(rest) : null;
    });
    noteTransitionWait = waitAll(transitions).then(() => {
      noteTransitionWait = null;
      autoLayoutNotes();
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [스코어보드 렌더링 - 배율] 슬라이더로 스코어보드 미리보기 배율 조정
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const boardStageInner = $('boardStageInner');
  const boardStageWrap  = $('boardStageWrap');
  const boardScaleRange = $('boardScaleRange');
  const boardScaleLabel = $('boardScaleLabel');

  // 터치 기기 전술판 배치(js/tactics/tactics.js: tacticsApplyTouchLayout)에서 점수판을 작게 줄이는 비율.
  // 사용자가 정한 배율의 70%까지만 쓰고, 좁은 세로 화면에서는 점수판이 화면 폭 안에 들어오도록 더 줄인다.
  const TOUCH_BOARD_SHRINK = 0.7;
  /** 보드 미리보기를 pct% 배율로 scale 변환하고, 래퍼 높이도 실제 렌더 크기에 맞게 조정 */
  function boardScaleFactor(pct){
    let s = pct / 100;
    if (document.body.classList.contains('tactics-active') && document.body.classList.contains('td-touch-board')) {
      const boardEl = boardStageInner.querySelector('.board');
      const boardW = boardEl ? boardEl.offsetWidth : 0;
      const avail = document.body.clientWidth - 24;
      s = Math.min(s * TOUCH_BOARD_SHRINK, boardW > 0 ? avail / boardW : s);
    }
    return s;
  }
  let appliedBoardScale = 1;
  /**
   * 보드의 자연 높이에 마지막으로 적용한 배율을 곱해 래퍼의 높이를 동기화한다.
   * 빠른 입력 메뉴와 득점자 편집창은 본문 위에 겹쳐 표시되므로 측정 중 잠시 숨긴다.
   * 메뉴를 scrollHeight에 포함하면 메뉴를 열기만 해도 아래 패널이 밀려난다.
   * 높이가 같으면 인라인 스타일을 다시 쓰지 않는다. 배율·슬라이더·위치 전체를
   * 재적용하지 않으므로 ResizeObserver에서 애니메이션의 중간 높이를 반영할 때도 사용한다.
   *
   * @returns {void} boardStageWrap.style.height를 필요할 때만 변경한다.
   */
  function syncBoardStageHeight(){
    // 두 뷰 모두 드래그 중에는 주변 패널을 고정하고 종료 시 최종 높이를 적용합니다.
    if (window.fsmScaleDrag) return;
    // wrap 높이를 실제 축소 높이에 맞게 조정.
    // 점수판 아래로 펼쳐지는 빠른 입력 메뉴(합계 점수·승부차기)는 아래 패널 위에 겹쳐 띄우는 것이라
    // scrollHeight에 들어가지 않도록 잠깐 숨기고 잰다. 안 그러면 메뉴를 열 때마다 아래 패널이 밀려난다.
    // 타이머와 득점자 편집창, 표시 설정 메뉴도 아래 패널 위에 겹치므로 높이 측정에서 제외한다.
    const quickMenus = [...boardStageInner.querySelectorAll('#boardAggControls:not([hidden]), #boardPsoControls:not([hidden]), #clockEditor.active, .note-inline-editor, .note-quick-menu')];
    const dragging = window.fsmScaleDrag;
    if (!dragging) quickMenus.forEach(menu => { menu.style.display = 'none'; });
    const naturalH = dragging ? dragging.naturalHeight : boardStageInner.scrollHeight;
    if (!dragging) quickMenus.forEach(menu => { menu.style.display = ''; });
    const height = (naturalH * appliedBoardScale) + 'px';
    if (boardStageWrap.style.height !== height) {
      boardStageWrap.style.height = height;
      // 피치가 이미 고정 높이이면 부모가 커져도 자체 ResizeObserver는 울리지 않습니다.
      // 카메라 뷰의 기존 저장 비율 계산을 다시 실행해 줄었던 높이도 복원합니다.
      if (document.getElementById('page-main-big')?.classList.contains('active')) {
        window.scheduleLineupViewportFit?.();
      }
    }
  }
  let boardScaleInputFrame = null;
  /**
   * 사용자가 선택한 백분율 배율에 터치 전술판의 화면 폭 제한을 반영한다.
   * 실제 변환 배율을 저장한 뒤 보드 transform, 래퍼 높이, 슬라이더와 표시값을 맞춘다.
   * 이어 좌우·중앙 배치와 테마별 경계 픽셀 보정을 수행한다.
   * 단순 높이 변화는 이 함수 대신 syncBoardStageHeight를 사용해 전체 보정을 반복하지 않는다.
   *
   * @param {number} pct 사용자가 선택한 백분율 배율.
   * @returns {void} 미리보기 배치 및 배율 컨트롤을 갱신한다.
   */
  function applyBoardScale(pct){
    // 종료·초기화 시 남은 미리보기가 최종 배율을 다시 덮어쓰지 않게 합니다.
    if (boardScaleInputFrame !== null) {
      cancelAnimationFrame(boardScaleInputFrame);
      boardScaleInputFrame = null;
    }
    const s = boardScaleFactor(pct);
    appliedBoardScale = s;
    boardStageInner.style.transition = 'none';
    const transform = `scale(${s})`;
    if (boardStageInner.style.transform !== transform) boardStageInner.style.transform = transform;
    syncBoardStageHeight();
    if(boardScaleLabel) boardScaleLabel.textContent = pct;
    if(boardScaleRange) boardScaleRange.value = pct;
    document.querySelectorAll('.fsm-scale-control').forEach(control => {
      control.querySelector('input').value = pct;
      control.querySelector('output').textContent = `${pct}%`;
    });
    syncBoardPosition();
    window.syncFsmScaleDrag?.();
    window.syncBelarusBoundaryPixelGrid?.();
    window.syncEkstraklasaBoundaryPixelGrid?.();
  }

  // 득점자 박스와 배율을 포함한 실제 표시 영역을 기준으로 배치합니다.
  function syncBoardPosition() {
    const stage = $('boardStageInner'), wrap = $('boardStageWrap'), board = $('board');
    if (!stage || !wrap || !board || !board.offsetWidth) return;
    const position = ['left', 'right'].includes(state.boardPosition) ? state.boardPosition : 'center';
    if (document.body.dataset.boardPosition !== position) {
      // 닫힌 메뉴가 반대편으로 옮겨질 때 화면을 가로질러 미끄러지지 않도록 이번 변경만 전환 효과를 끕니다.
      const nav = $('sidebarNav');
      if (nav) nav.style.transition = 'none';
      document.body.dataset.boardPosition = position;
      if (nav) { void nav.offsetWidth; nav.style.transition = ''; }
    }
    const bounds = wrap.getBoundingClientRect();
    const surfaceScale = bounds.width / wrap.offsetWidth || 1;
    const previous = Number(stage.dataset.positionShift || 0) * surfaceScale;
    const notes = ['homeNoteSide', 'awayNoteSide'].map($).filter(node =>
      state.noteEnabled && node && node.offsetWidth && getComputedStyle(node).display !== 'none');
    const nodes = [board, ...notes];
    const rect = board.getBoundingClientRect();
    const left = rect.left - previous, right = rect.right - previous;
    let shift = position === 'left' ? bounds.left + 16 - left
      : position === 'right' ? bounds.right - 16 - right : 0;
    const boxes = nodes.map(node => node.getBoundingClientRect());
    const min = Math.min(...boxes.map(box => box.left - previous));
    const max = Math.max(...boxes.map(box => box.right - previous));
    const lower = bounds.left + 8 - min, upper = bounds.right - 8 - max;
    shift = lower <= upper ? Math.max(lower, Math.min(upper, shift)) : (lower + upper) / 2;
    // 이동으로 로고 경계의 픽셀 정렬이 달라지지 않도록 화면 픽셀 단위로 옮깁니다.
    const dpr = window.devicePixelRatio || 1;
    shift = Math.round(shift * dpr) / dpr;
    const positionChanged = Math.abs(shift - previous) > .5;
    if (positionChanged) {
      pendingPositionFlash = true;
      requestAnimationFrame(() => { pendingPositionFlash = false; });
    }
    if (positionChanged && stage.querySelector('.flash-update')) {
      stage.querySelectorAll('.flash-update').forEach(node => node.classList.remove('flash-update'));
      flashElement(stage);
    }
    stage.dataset.positionShift = shift / surfaceScale;
    const shiftY = boardPixelSnapShiftY(stage, board, surfaceScale);
    stage.style.translate = `${shift / surfaceScale}px ${shiftY}px`;
  }

  // 띠 위아래 경계의 가로선을 화면 픽셀에 맞출 테마와 그 선의 굵기(CSS px, 배율 적용 전).
  // 1px 흰 테두리처럼 얇은 가로선이 띠 경계에 붙은 테마만 대상이다.
  const BOARD_PIXEL_SNAP_Y_THEMES = { belgian: 1 };
  /**
   * 점수판 띠(.scoreboard-main)의 위·아래 경계선이 화면 픽셀에 최대한 걸치도록 미리보기 영역을 세로로 미세 이동할 값을 구한다.
   * Chrome은 배율 변환 전에 테두리 위치와 굵기를 CSS 정수 px로 반올림하므로, 75%에서 띠 위쪽이 y=31.5처럼
   * 반 픽셀에 걸리면 1px 테두리(화면 0.75px)가 두 행에 나뉘어 위쪽만 얇고 흐리게 보였다(2026-10-17, 벨기에).
   * 테마 CSS 값으로는 맞출 수 없어(정수 px로 반올림됨) 반올림되지 않는 translate로 옮긴다.
   * 띠 높이 x 배율이 화면 정수 px가 아니면(80% 등) 두 선을 동시에 맞출 수 없으므로, 각 선이 한 화면 행에
   * 칠해지는 비율 중 작은 쪽이 가장 커지는 이동량을 1/16 화면 px 단위로 찾는다(같으면 이동이 작은 쪽).
   * 이동량은 화면 1px 미만이다.
   *
   * @param {HTMLElement} stage 미리보기 영역(#boardStageInner).
   * @param {HTMLElement} board 점수판 요소.
   * @param {number} surfaceScale 바깥 영역 배율(stage translate는 이 배율 적용 전 단위).
   * @returns {number} stage translate의 세로 값(px). 대상 테마가 아니면 0.
   */
  function boardPixelSnapShiftY(stage, board, surfaceScale) {
    const previous = Number(stage.dataset.positionShiftY || 0);
    const lineWidth = BOARD_PIXEL_SNAP_Y_THEMES[board.dataset.fsmTheme];
    const main = lineWidth ? board.querySelector('.scoreboard-main') : null;
    let shiftY = 0;
    if (main && main.offsetHeight) {
      const dpr = window.devicePixelRatio || 1;
      const rect = main.getBoundingClientRect();
      // 화면 픽셀 단위 좌표. 선 굵기는 배율 변환 후 화면 px로 환산한다.
      const top = (rect.top - previous * surfaceScale) * dpr;
      const bottom = top + rect.height * dpr;
      const line = Math.min(1, lineWidth * rect.height / main.offsetHeight * dpr);
      /** [start, start+line] 구간이 가장 많이 걸친 화면 행에 칠해지는 비율. */
      const rowCoverage = start => {
        const edge = Math.floor(start) + 1;
        return start + line <= edge ? line : Math.max(edge - start, start + line - edge);
      };
      let best = 0, bestScore = -1;
      for (let step = -7; step <= 8; step++) {
        const delta = step / 16;
        const score = Math.min(rowCoverage(top + delta), rowCoverage(bottom + delta - line));
        if (score > bestScore + 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && Math.abs(delta) < Math.abs(best))) {
          best = delta; bestScore = score;
        }
      }
      shiftY = best / dpr / surfaceScale;
    }
    stage.dataset.positionShiftY = shiftY;
    return shiftY;
  }
  /** 설정 창 패널/스탯 탭의 점수판 위치 버튼을 현재 값으로 표시합니다. */
  function syncBoardPositionButtons() {
    const position = state.boardPosition || 'center';
    if ($('boardPosition')) $('boardPosition').value = position;
    document.querySelectorAll('[data-board-position-value]').forEach(btn => {
      const active = btn.dataset.boardPositionValue === position;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }
  /** 테마 메뉴 선택 상자와 설정 창 버튼이 같은 점수판 위치 상태를 바꿉니다. */
  function setBoardPosition(value) {
    state.boardPosition = value;
    syncBoardPositionButtons();
    syncBoardPosition();
    persist();
  }
  $('boardPosition')?.addEventListener('change', event => setBoardPosition(event.target.value));
  document.querySelectorAll('[data-board-position-value]').forEach(btn => {
    btn.addEventListener('click', () => setBoardPosition(btn.dataset.boardPositionValue));
  });
  let noteResizeFrame = null;
  window.addEventListener('resize', () => {
    if (noteResizeFrame !== null) return;
    noteResizeFrame = requestAnimationFrame(() => {
      noteResizeFrame = null;
      autoLayoutNotes();
    });
  });

  /** restore() 후 state.boardScale 값으로 초기 배율을 적용 (DOM 렌더 후 requestAnimationFrame에서 호출) */
  function initBoardScale(){
    const pct = state.boardScale ?? 85;
    applyBoardScale(pct);
  }
  // 터치 기기 전술판 배치 전환/탭 이동/화면 회전 시 점수판 배율을 다시 계산하도록 노출
  window.reapplyBoardScale = () => applyBoardScale(state.boardScale ?? 85);

  if (window.ResizeObserver && boardStageInner) {
    new ResizeObserver(entries => {
      const size = entries[0]?.contentRect;
      if (!size || size.height <= 0) return;
      // 높이 전환은 배율 변경이 아니다. 브라우저가 배치를 계산한 직후 높이만
      // 반영해 다음 프레임의 전체 배율 재적용과 한 프레임 지연을 피한다.
      syncBoardStageHeight();
      // 전환 중 득점자와 팀 영역의 폭도 바뀔 수 있어 기존 위치·픽셀 보정은 유지한다.
      syncBoardPosition();
      window.syncBelarusBoundaryPixelGrid?.();
      window.syncEkstraklasaBoundaryPixelGrid?.();
    }).observe(boardStageInner);
  }

  // [이벤트 등록] 배율 슬라이더 및 리셋 버튼
  boardScaleRange?.addEventListener('input', e=>{
    state.boardScale = Number(e.target.value);
    if (!window.fsmScaleDrag) {
      applyBoardScale(state.boardScale);
      return;
    }
    // 드래그 입력이 몰려도 프레임마다 최신 배율만 미리보기로 반영합니다.
    if (boardScaleInputFrame !== null) return;
    boardScaleInputFrame = requestAnimationFrame(() => {
      boardScaleInputFrame = null;
      applyBoardScale(state.boardScale);
    });
  });
  boardScaleRange?.addEventListener('change', () => persist());

  $('boardScaleReset')?.addEventListener('click', ()=>{
    state.boardScale = 85;
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
  document.getElementById('manualPsoMode')?.addEventListener('change', e => {
    state.psoModeForced = e.target.checked;
    state.psoModeFixtureId = e.target.checked ? String(_lastFixtureData?.matchInfo?.fixtureId ?? '') : null;
    if (e.target.checked) state.manualPsoPreviousHalf = state.half === 'PK' ? '2' : state.half;
    setMatchHalf(e.target.checked ? 'PK' : (state.manualPsoPreviousHalf || '2'));
    render();
    persist();
  });
  el.startPause?.addEventListener('click', ()=>{
    if (typeof window.toggleClockRunning === 'function') window.toggleClockRunning();
    else state.running = !state.running;
    render();
    persist();
  });
  el.resetTime?.addEventListener('click', ()=>{
    if (typeof window.setClockSeconds === 'function') window.setClockSeconds(0);
    else {
      state.seconds = 0;
      state.running = false;
      el.clock.textContent = '00:00';
    }
    render();
    persist();
  });
  el.secPerTick?.addEventListener('input', e=>{
    if (state.running && typeof window.syncRunningClockToNow === 'function') window.syncRunningClockToNow();
    state.secPerTick = Math.max(0.1, Number(e.target.value) || 1);
    render();
    persist();
  });
  el.applyStartAt?.addEventListener('click', ()=>{
    const sec = parseStartTime(el.startAt?.value);
    if(sec==null){ alert('형식은 mm:ss입니다. 예: 45:00'); return; }
    if (typeof window.setClockSeconds === 'function') window.setClockSeconds(sec);
    else {
      state.running = false;
      state.seconds = sec;
      el.clock.textContent = fmtClock(state.seconds);
    }
    render();
    persist();
  });
  el.quick45?.addEventListener('click', ()=>{ el.startAt.value='45:00'; el.applyStartAt.click(); });
  el.quick90?.addEventListener('click', ()=>{ el.startAt.value='90:00'; el.applyStartAt.click(); });

  // [이벤트 등록] 추가 시간 표시/숨김 및 값 조정
  /**
   * 추가시간 분 수동 설정. 0 미만은 클램프, 0보다 크면 자동 표시 ON.
   * extraManualOverride 플래그를 set해 자동 폴링이 API extra로 덮어쓰지 못하게 보호.
   */
  function setManualExtra(nextValue){
    state.extra = Math.max(0, Number(nextValue) || 0);
    state.extraShown = state.extra > 0;
    state.extraManualOverride = true; // 수동 조작 후엔 API 자동 갱신 건너뜀
    render();
    persist();
  }

  /**
   * 추가시간 표시 ON/OFF 토글 (T 키 / 토글 버튼).
   * extra 값 자체는 유지하고 extraShown만 반전. extraManualOverride로 자동 갱신 가드.
   */
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
  el.noteStrokeWidth?.addEventListener('input', e=>{ state.noteStrokeWidth=clampNum(e.target.value,0,10,1); render(); persist(); });
  // 각 초기화 버튼은 해당 항목만 기본값으로 복원한다.
  [
    ['resetNoteSize', () => { state.noteFontSize = 18; }],
    ['resetNoteText', () => { commitThemeColors({ noteText: '#e5e7eb' }); }],
    ['resetNoteStroke', () => { commitThemeColors({ noteStroke: '#000000' }); }],
    ['resetNoteStrokeWidth', () => { state.noteStrokeWidth = 1; }],
  ].forEach(([id, reset]) => $(id)?.addEventListener('click', () => { reset(); render(); persist(); }));

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
  function pkPush(team,res){
    const score = getPkDisplayScore(team);
    state.pk[team].push(res);
    if (!state.manualMode) {
      state.pkScore ??= {};
      state.pkScore[team] = score + (res === 'G' ? 1 : 0);
    }
    render(); persist();
  }
  /** 마지막으로 추가된 PK 결과를 제거 (홈/어웨이 중 더 많은 쪽에서 pop) */
  function pkUndo(){
    const h=state.pk.home.length,a=state.pk.away.length;
    if(h===0&&a===0) return;
    const team = h >= a ? 'home' : 'away';
    const score = getPkDisplayScore(team);
    const result = state.pk[team].pop();
    if (!state.manualMode) {
      state.pkScore ??= {};
      state.pkScore[team] = Math.max(0, score - (result === 'G' ? 1 : 0));
    }
    render(); persist();
  }
  /** PK 결과 전체 초기화 */
  function pkReset(){ clearPkState(); if (!state.manualMode) state.pkScore = { home: 0, away: 0 }; render(); persist(); }
  // [이벤트 등록] PK 버튼 (홈/어웨이 골/미스, 되돌리기, 초기화)
  el.pkHomeGoal?.addEventListener('click', ()=>pkPush('home','G'));
  el.pkHomeMiss?.addEventListener('click', ()=>pkPush('home','M'));
  el.pkAwayGoal?.addEventListener('click', ()=>pkPush('away','G'));
  el.pkAwayMiss?.addEventListener('click', ()=>pkPush('away','M'));
  el.pkUndo?.addEventListener('click', pkUndo);
  el.pkReset?.addEventListener('click', pkReset);
