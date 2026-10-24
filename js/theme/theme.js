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

  // 사용자가 테마 탭에서 직접 만지면 state.teamColorOverride=true로 마킹할 키 목록.
  // applyFixtureToState가 API 컬러로 덮어쓰지 않도록 가드.
  const TEAM_COLOR_KEYS = new Set(['homeBg','homeText','awayBg','awayText']);

  /**
   * 색상 상태와 입력기를 함께 갱신하고, 실제 변경이 있을 때 저장·렌더링·알림을 수행합니다.
   * @param {Object<string,string>} updates 변경할 색상 키와 HEX 값입니다.
   * @param {boolean} [syncColorInput=true] 색상 선택기의 값도 함께 동기화할지 지정합니다.
   */
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
  function bindColorWithHex(colorId, key, cssVar, signal){
    const colorInput=$(colorId); if(!colorInput) return;
    const hexInput=document.createElement('input'); hexInput.type='text'; hexInput.id=colorId+'Hex'; hexInput.placeholder='#RRGGBB'; hexInput.style.width='92px'; hexInput.style.marginLeft='6px'; hexInput.value=state.colors[key]||colorInput.value||'#000000';
    // bootstrap 스타일 적용
    hexInput.style.background='var(--ui-control-surface, #0b1220)'; hexInput.style.color='var(--ui-text, #e5e7eb)'; hexInput.style.border='1px solid rgba(var(--ui-ink-rgb, 255, 255, 255), .125)'; hexInput.style.borderRadius='10px'; hexInput.style.padding='4px 8px'; hexInput.style.height='36px';
    colorInput.insertAdjacentElement('afterend', hexInput);
    const editor = document.createElement('span');
    editor.className = 'theme-color-editor';
    editor.dataset.themeColor = key;
    colorInput.before(editor);
    editor.append(colorInput, hexInput);
    hexInput.classList.add('sp-color-code');
    const rgb = document.createElement('div');
    rgb.className = 'sp-color-rgb';
    rgb.hidden = true;
    ['R', 'G', 'B'].forEach((name, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      Object.assign(input, { type: 'number', min: '0', max: '255', step: '1', inputMode: 'numeric' });
      input.dataset.colorChannel = index;
      input.setAttribute('aria-label', `${key} ${name}`);
      label.append(name, input);
      rgb.append(label);
    });
    const sync = (value = state.colors[key]) => {
      value = normalizeHex(value) || '#000000';
      rgb.querySelectorAll('input').forEach((input, index) => {
        input.value = parseInt(value.slice(1 + index * 2, 3 + index * 2), 16);
      });
    };
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sp-color-format-btn';
    toggle.innerHTML = document.getElementById('settingsBgColorFormat').innerHTML;
    const updateToggle = () => {
      toggle.title = rgb.hidden ? 'RGB 입력으로 전환' : 'HEX 입력으로 전환';
      toggle.setAttribute('aria-label', toggle.title);
    };
    toggle.addEventListener('click', () => {
      rgb.hidden = !rgb.hidden;
      hexInput.hidden = !rgb.hidden;
      sync();
      updateToggle();
      (rgb.hidden ? hexInput : rgb.querySelector('input')).focus();
    });
    /** 세 채널이 모두 유효할 때만 HEX로 변환해 저장해, 입력 중인 빈 칸은 색상에 반영하지 않습니다. */
    const commitRgb = () => {
      const inputs = [...rgb.querySelectorAll('input')];
      if (inputs.some(input => input.value === '' || !input.validity.valid)) return false;
      commitThemeColors({ [key]: '#' + inputs.map(input => Number(input.value).toString(16).padStart(2, '0')).join('') });
      return true;
    };
    rgb.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', commitRgb);
      input.addEventListener('change', () => { if (!commitRgb()) sync(); });
    });
    colorInput.syncRgb = sync;
    document.addEventListener('theme:colors-changed', () => {
      colorInput.value = hexInput.value = state.colors[key];
      sync();
    }, signal ? { signal } : undefined);
    editor.append(rgb, toggle);
    sync();
    updateToggle();

    /** 드래그 중 가벼운 라이브 프리뷰 — CSS 변수와 hex 표시만 갱신. state/persist/render/dispatch 안 함. */
    const previewThemeColor = value => {
      setCSS(cssVar, value);
      hexInput.value = value;
      sync(value);
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

  // 팝업에는 별도 입력기를 만들고 같은 색상 저장 경로로 동기화한다.
  const teamColorDialog = document.createElement('div');
  teamColorDialog.className = 'team-color-dialog pm-popup';
  teamColorDialog.popover = 'auto';
  teamColorDialog.setAttribute('role', 'dialog');
  document.body.append(teamColorDialog);
  let quickColorAbort;
  /** 닫힌 팝업의 동기화 이벤트를 해제해 다음 편집창에 이전 입력기가 남지 않게 합니다. */
  const restoreColorEditors = () => {
    quickColorAbort?.abort();
    teamColorDialog.replaceChildren();
  };
  teamColorDialog.addEventListener('toggle', event => {
    if (event.newState === 'closed' && !teamColorDialog.matches(':popover-open')) restoreColorEditors();
  });
  ['home', 'away'].forEach(side => {
    const chip = document.getElementById(side + 'Color');
    if (!chip) return;
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', side === 'home' ? '홈 팀컬러 편집' : '원정 팀컬러 편집');
    /** 해당 팀의 편집 입력기를 새로 만들고 클릭 위치에서 화면을 벗어나지 않도록 엽니다. */
    const open = (event) => {
      teamColorDialog.hidePopover();
      restoreColorEditors();
      teamColorDialog.replaceChildren();
      quickColorAbort = new AbortController();
      const heading = document.createElement('h3');
      heading.className = 'pm-nick-title';
      heading.textContent = side === 'home' ? '홈 팀컬러' : '원정 팀컬러';
      teamColorDialog.append(heading);
      ['Bg', 'Text'].forEach((suffix, index) => {
        const input = document.createElement('input');
        input.type = 'color';
        input.id = 'quickTeam' + side + suffix;
        input.value = state.colors[side + suffix];
        const row = document.createElement('div');
        row.className = 'team-color-dialog-row';
        const label = document.createElement('span');
        label.textContent = index === 0 ? '배경 색' : '글자 색';
        row.append(label, input);
        teamColorDialog.append(row);
        bindColorWithHex(input.id, side + suffix, '--' + side + (suffix === 'Bg' ? '-bg' : '-text'), quickColorAbort.signal);
        row.querySelector('input[type=text]').classList.add('pm-nick-input');
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'pm-btn';
      close.textContent = '닫기';
      close.addEventListener('click', () => teamColorDialog.hidePopover());
      const actions = document.createElement('div');
      actions.className = 'pm-nick-btns';
      const swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'pm-btn';
      swap.textContent = '색상 맞바꾸기';
      swap.title = '배경색과 글자색 바꾸기';
      swap.addEventListener('click', () => swapTeamColors(side));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'pm-btn pm-btn-danger';
      reset.textContent = '초기화';
      reset.title = side === 'home' ? '홈 팀컬러를 API 색상으로 초기화' : '원정 팀컬러를 API 색상으로 초기화';
      reset.disabled = !window.canResetFixtureTeamColors?.();
      reset.addEventListener('click', () => window.resetFixtureTeamColors?.(side));
      actions.append(close, swap, reset);
      teamColorDialog.append(actions);
      teamColorDialog.showPopover();
      const rect = chip.getBoundingClientRect();
      // 최상위 popover는 body 배율이 아닌 화면 좌표로 배치한다.
      const popupRect = teamColorDialog.getBoundingClientRect();
      const x = event?.clientX ?? rect.left;
      const y = event?.clientY ?? rect.bottom;
      teamColorDialog.style.left = Math.max(8, Math.min(x + 12, innerWidth - popupRect.width - 8)) + 'px';
      teamColorDialog.style.top = Math.max(8, Math.min(y + 12, innerHeight - popupRect.height - 8)) + 'px';
    };
    const choose = event => {
      event.stopPropagation?.();
      const rect = document.getElementById(side + 'Card').getBoundingClientRect();
      window.openScoreboardTeamEditMenu(side, event.clientX ?? rect.left, event.clientY ?? rect.bottom);
    };
    chip.addEventListener('click', choose);
    chip.openColorEditor = open;
    const teamBox = document.getElementById(side + 'Card');
    teamBox?.addEventListener('click', choose);
    if (teamBox) {
      teamBox.tabIndex = 0;
      teamBox.setAttribute('role', 'button');
      teamBox.setAttribute('aria-label', side === 'home' ? '홈 팀 이름·컬러 수정' : '원정 팀 이름·컬러 수정');
      teamBox.addEventListener('keydown', event => {
        if (event.target !== teamBox || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        choose(event);
      });
    }
    chip.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      choose(event);
    });
    const logoBox = document.getElementById(side === 'home' ? 'team-logo-left' : 'team-logo-right');
    logoBox?.addEventListener('click', event => {
      if (document.getElementById('board')?.dataset.fsmTheme === 'unl') choose(event);
    });
    logoBox?.addEventListener('keydown', event => {
      if (document.getElementById('board')?.dataset.fsmTheme !== 'unl' || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      const bounds = logoBox.getBoundingClientRect();
      choose({ clientX: bounds.left, clientY: bounds.bottom });
    });
    /** 로고 칸으로 팀컬러를 표현하는 네이션스리그에서만 로고에 키보드 편집 진입점을 둡니다. */
    const syncLogoColorButton = () => {
      const enabled = document.getElementById('board')?.dataset.fsmTheme === 'unl';
      if (!logoBox) return;
      if (enabled) {
        logoBox.tabIndex = 0;
        logoBox.setAttribute('role', 'button');
        logoBox.setAttribute('aria-label', side === 'home' ? '홈 팀컬러 편집' : '원정 팀컬러 편집');
      } else {
        logoBox.tabIndex = 0;
        logoBox.setAttribute('role', 'button');
        logoBox.setAttribute('aria-label', side === 'home' ? '홈 로고 설정' : '원정 로고 설정');
      }
    };
    new MutationObserver(syncLogoColorButton).observe(document.getElementById('board'), { attributes: true, attributeFilter: ['data-fsm-theme'] });
    syncLogoColorButton();
  });
  /**
   * 점수판에서 팀 이름 또는 팀컬러 편집을 선택하는 메뉴를 엽니다.
   * @param {'home'|'away'} side 편집할 팀입니다.
   * @param {number} x 메뉴를 열 화면의 가로 좌표입니다.
   * @param {number} y 메뉴를 열 화면의 세로 좌표입니다.
   */
  window.openScoreboardTeamEditMenu = (side, x, y) => {
    pmHideAll();
    pmContainer().innerHTML = `<div class="pm-popup" id="scoreboardTeamEditMenu" role="dialog" aria-label="팀 수정 선택">
      <button type="button" class="pm-btn" data-team-edit="name">팀이름 수정</button>
      <button type="button" class="pm-btn" data-team-edit="color">팀컬러 수정</button>
    </div>`;
    const menu = document.getElementById('scoreboardTeamEditMenu');
    menu.prepend(createScoreboardScaleControl('boardScale', '점수판 배율'));
    menu.querySelector('.fsm-scale-control').after(createQuickSettingRow('teamName', true));
    syncSwitchUi('teamName');
    pmPositionPopup(menu, x, y);
    menu.querySelector('[data-team-edit="name"]').onclick = () => {
      showTeamNicknameEditor(scoreboardTeamIdentity(side), x, y);
    };
    menu.querySelector('[data-team-edit="color"]').onclick = () => {
      pmHideAll();
      document.getElementById(side + 'Color').openColorEditor({ clientX: x, clientY: y });
    };
    menu.querySelector('button').focus();
    return true;
  };

  // 수동 입력이 늘어나도 기본 패널 상단을 유지한다.
  const themePanel = document.getElementById('themePanel');
  /** 수동 입력 영역을 제외한 기본 높이를 기록하고, 수동 모드에서는 이미 정한 높이를 유지합니다. */
  const syncThemePanelLimit = () => {
    if (!themePanel?.offsetWidth || window.__POPOUT_MODE__) return;
    if (state.manualMode && document.documentElement.style.getPropertyValue('--theme-panel-limit')) return;
    const style = getComputedStyle(themePanel);
    const children = [...themePanel.children].filter(node => node.id !== 'manual-section' && node.offsetHeight);
    const height = children.reduce((sum, node) => {
      const childStyle = getComputedStyle(node);
      return sum + node.offsetHeight + parseFloat(childStyle.marginTop) + parseFloat(childStyle.marginBottom);
    }, parseFloat(style.paddingTop) + parseFloat(style.paddingBottom))
      + Math.max(0, children.length - 1) * parseFloat(style.rowGap);
    document.documentElement.style.setProperty('--theme-panel-limit', `${Math.ceil(height)}px`);
  };
  const themePanelObserver = new ResizeObserver(syncThemePanelLimit);
  [...themePanel.children].forEach(node => themePanelObserver.observe(node));
  document.addEventListener('page:activated', () => requestAnimationFrame(syncThemePanelLimit));
  window.addEventListener('resize', syncThemePanelLimit);

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
      // 수동 로고가 없으면 현재 경기 로고를 이어 받아 전환과 새로고침 때 유지합니다.
      state.homeLogoManual = state.homeLogoManual || state.homeLogo || '';
      state.awayLogoManual = state.awayLogoManual || state.awayLogo || '';
      state.homeLogo = state.homeLogoManual || '';
      state.awayLogo = state.awayLogoManual || '';
      syncManualInputs();
    }else{
      state.homeLogo = '';
      state.awayLogo = '';
      reapplyFixtureLogos();
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
  el.manualHomeName?.addEventListener('input', e=>{
    // 수동으로 다른 팀 이름을 입력하면 이전 API 팀 ID와 분리한다.
    if (state.teamNicknameTeams) state.teamNicknameTeams.home = null;
    state.homeName=e.target.value; render(); persist();
  });
  el.manualAwayName?.addEventListener('input', e=>{
    if (state.teamNicknameTeams) state.teamNicknameTeams.away = null;
    state.awayName=e.target.value; render(); persist();
  });
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
  // [이벤트 등록] 수동 모드 — 퇴장 수 +/- 버튼
  /**
   * 수동 모드 퇴장 수(점수판 레드카드 수)를 delta만큼 바꾼다. 0~5장으로 제한, 버튼과 단축키가 공용으로 사용.
   * @param {'home'|'away'} team
   * @param {number} delta  +1 또는 -1
   */
  function changeManualRedCards(team, delta){
    const key = team === 'home' ? 'redHome' : 'redAway';
    state[key] = clampNum((state[key] || 0) + delta, 0, 5, 0);
    render();
    persist();
  }
  window.changeManualRedCards = changeManualRedCards;
  [['manualHomeRedPlus','home',1],['manualHomeRedMinus','home',-1],['manualAwayRedPlus','away',1],['manualAwayRedMinus','away',-1]]
    .forEach(([id, team, delta]) => $(id)?.addEventListener('click', () => changeManualRedCards(team, delta)));

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
  // [이벤트 등록] 자동 경기의 교체 로고는 경기별로 보관하여 수동 로고와 섞이지 않게 합니다.
  for (const [side, id] of [['home', 'team-logo-left'], ['away', 'team-logo-right']]) {
    const box = document.getElementById(id);
    if (!box) continue;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.id = side + 'ScoreboardLogoUpload';
    document.body.append(input);
    let target;
    const upload = () => {
      target = { manual: !!state.manualMode, fixtureId: String(getLastFixtureId() ?? '') };
      input.value = '';
      input.click();
    };
    box.setAttribute('role', 'button');
    box.tabIndex = 0;
    box.style.cursor = 'pointer';
    box.title = `${side === 'home' ? '홈' : '원정'} 로고 설정`;
    box.setAttribute('aria-label', box.title);
    const restore = () => {
      if (state.manualMode) clearManualLogo(side);
      else {
        state[side + 'LogoUpload'] = '';
        state[side + 'Logo'] = '';
        reapplyFixtureLogos();
        render(); persist();
      }
    };
    const open = () => {
      // 네이션스리그의 로고 칸은 기존 팀컬러 편집 기능을 유지합니다.
      if (document.getElementById('board')?.dataset.fsmTheme === 'unl') return;
      pmHideAll();
      pmContainer().innerHTML = `<div class="pm-popup" id="scoreboardLogoMenu" role="dialog" aria-label="${box.title}">
        <button type="button" class="pm-btn" data-logo-action="upload">업로드</button>
        <button type="button" class="pm-btn" data-logo-action="restore">원래 로고</button>
      </div>`;
      const menu = document.getElementById('scoreboardLogoMenu');
      const bounds = box.getBoundingClientRect();
      pmPositionPopup(menu, bounds.left, bounds.bottom);
      menu.querySelector('[data-logo-action="upload"]').onclick = () => { pmHideAll(); upload(); };
      menu.querySelector('[data-logo-action="restore"]').onclick = () => { pmHideAll(); restore(); };
      menu.querySelector('button').focus();
    };
    box.addEventListener('click', e => { e.stopPropagation(); open(); });
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); }
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const selected = target;
      readLogoFile(file, url => {
        // 파일을 읽는 동안 경기나 모드가 바뀌면 이전 업로드를 적용하지 않습니다.
        if (selected.manual !== !!state.manualMode || (!selected.manual && selected.fixtureId !== String(getLastFixtureId() ?? ''))) return;
        if (selected.manual) state[side + 'LogoManual'] = url;
        else state[side + 'LogoUpload'] = { fixtureId: selected.fixtureId, url };
        state[side + 'Logo'] = url;
        syncManualInputs();
        render(); persist();
      });
    });
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
