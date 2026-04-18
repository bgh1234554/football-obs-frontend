  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전역 상태] 스코어보드 전체 상태 객체와 LocalStorage 키 정의
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 전/후반 진행 순서 정의 ([ 버튼과 ] 버튼으로 순환)
  const halfOrder = ['1','2','ET1','ET2','PK'];
  const TKEY = 'obs-scoreboard-templates-v1';
  const SKEY = 'obs-scoreboard-state-v2';
  const DEFAULT_FONT_FAMILY = "'Ubuntu', 'NanumSquareRound', sans-serif";
  const PK_RETENTION_MS = 30 * 1000;

  function sanitizeFontFamily(fontMaybe){
    const raw = (typeof fontMaybe === 'string') ? fontMaybe.trim() : '';
    if(!raw) return '';
    const parts = raw.split(',').map(s=>s.trim()).filter(Boolean)
      .filter(s=>!/^['"]?HUMidnight140['"]?$/i.test(s));
    if(parts.length === 0) return '';
    if(/^['"]?Ubuntu['"]?$/i.test(parts[0]) && parts.length === 1 && /HUMidnight140/i.test(raw)) return DEFAULT_FONT_FAMILY;
    return parts.join(', ');
  }

  const state = {
    logoAlign: 'hybrid',
    homeName: 'HOME', awayName: 'AWAY',
    homeScore: 0, awayScore: 0,
    aggEnabled: false, aggHomeBase: 0, aggAwayBase: 0,
    homeLogo: '', awayLogo: '',
    homeLogoManual: '', awayLogoManual: '',
    radiusMode: 'round',
    boardWidth: 1080,
    boardScale: 75,
    homeLogoScale: 1, awayLogoScale: 1,
    homeLogoX: 0, homeLogoY: 0,
    awayLogoX: 0, awayLogoY: 0,
    colors: {
      boardA: '#000000', boardB: '#000000',
      scoreBg: '#0b1220', digits: '#e5e7eb', meta: '#e5e7eb',
      extra: '#22c55e', halfBg: '#a70e80', halfText: '#f6fd8e',
      homeBg: '#1d4ed8', homeText: '#ffffff',
      awayBg: '#ef4444', awayText: '#ffffff',
      outline: '#ffffff15', pkBase: '#334155',
      homeOutline: '#ffffff40', awayOutline: '#ffffff40',
      noteText: '#e5e7eb', noteStroke: '#000000',
    },
    homeOutlineEnabled: false, awayOutlineEnabled: false,
    homeOutlineWidth: 1, awayOutlineWidth: 1,
    boardOutlineEnabled: true, scoreOutlineEnabled: true,
    boardOutlineWidth: 1, scoreOutlineWidth: 1,
    fontFamily: DEFAULT_FONT_FAMILY,
    half: '1', running: false, seconds: 0, secPerTick: 1,
    extraShown: false, extra: 0,
    redHome: 0, redAway: 0,
    rcSize: 14, rcGap: 6, rcTop: -25, rcHomeInset: 6, rcAwayInset: 6,
    pk: { home: [], away: [] },
    pkLastExitedAt: 0,
    noteEnabled: true,
    notes: { home: '', away: '' },
    noteFontSize: 18,
    noteBorderWidth: 1,
    noteMinHeight: 56,
    manualMode: false,
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [DOM 엘리먼트 참조] 자주 사용하는 UI 요소를 초기에 한 번만 조회해 el 객체로 관리
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const el = {
    homeCard: $('homeCard'), awayCard: $('awayCard'),
    homeName: $('homeName'), awayName: $('awayName'),
    homeScore: $('homeScore'), awayScore: $('awayScore'),
    aggToggle: $('aggToggle'), aggHomeBase: $('aggHomeBase'), aggAwayBase: $('aggAwayBase'),
    aggHomeWrap: $('aggHomeWrap'), aggAwayWrap: $('aggAwayWrap'),
    aggHomeVal: $('aggHomeVal'), aggAwayVal: $('aggAwayVal'),
    homeLogo: $('homeLogo'), awayLogo: $('awayLogo'),
    inHomeOutline: $('inHomeOutline'), inAwayOutline: $('inAwayOutline'),
    homeOutlineOn: $('homeOutlineOn'), awayOutlineOn: $('awayOutlineOn'),
    homeOutlineWidth: $('homeOutlineWidth'), awayOutlineWidth: $('awayOutlineWidth'),
    scorePanel: $('scorePanel'),
    boardOutlineOn: $('boardOutlineOn'), scoreOutlineOn: $('scoreOutlineOn'),
    boardOutlineWidth: $('boardOutlineWidth'), scoreOutlineWidth: $('scoreOutlineWidth'),
    clock: $('clock'), extra: $('extra'), half: $('half'),
    startAt: $('startAt'), applyStartAt: $('applyStartAt'),
    quick45: $('quick45'), quick90: $('quick90'),
    // inHomeLogo: $('inHomeLogo'), inAwayLogo: $('inAwayLogo'),
    inBoardA: $('inBoardA'), inBoardB: $('inBoardB'),
    inScoreBg: $('inScoreBg'), inDigitsColor: $('inDigitsColor'), inMetaColor: $('inMetaColor'), inExtraColor: $('inExtraColor'),
    inHalfBg: $('inHalfBg'), inHalfText: $('inHalfText'),
    inHomeBg: $('inHomeBg'), inHomeText: $('inHomeText'), inAwayBg: $('inAwayBg'), inAwayText: $('inAwayText'), inOutline: $('inOutline'),
    halfSelect: $('halfSelect'), prevHalf: $('prevHalf'), nextHalf: $('nextHalf'),
    startPause: $('startPause'), resetTime: $('resetTime'), secPerTick: $('secPerTick'),
    extraInput: $('extraInput'), toggleExtra: $('toggleExtra'), extraPlus: $('extraPlus'), extraMinus: $('extraMinus'),
    pkWrap: $('pkWrap'), pkHome: $('pkHome'), pkAway: $('pkAway'),
    pkHomeGoal: $('pkHomeGoal'), pkHomeMiss: $('pkHomeMiss'), pkAwayGoal: $('pkAwayGoal'), pkAwayMiss: $('pkAwayMiss'), pkUndo: $('pkUndo'), pkReset: $('pkReset'),
    pkBaseColor: $('pkBaseColor'),
    rcHome: $('rcHome'), rcAway: $('rcAway'),
    rcSize: $('rcSize'), rcGap: $('rcGap'),
    rcTop: $('rcTop'), rcHomeInset: $('rcHomeInset'), rcAwayInset: $('rcAwayInset'),
    templateSelect: $('templateSelect'), templateName: $('templateName'), saveTemplate: $('saveTemplate'), deleteTemplate: $('deleteTemplate'),
    exportTemplates: $('exportTemplates'), importTemplates: $('importTemplates'),
    fontPreset: $('fontPreset'), fontCssUrl: $('fontCssUrl'), fontFamily: $('fontFamily'), applyFont: $('applyFont'), resetFont: $('resetFont'),
    askLocalFonts: $('askLocalFonts'), systemFonts: $('systemFonts'), fontFile: $('fontFile'),
    logoAlign: $('logoAlign'),
    manualHomeName: $('manualHomeName'), manualAwayName: $('manualAwayName'),
    manualHomeLogo: $('manualHomeLogo'), manualAwayLogo: $('manualAwayLogo'),
    manualHomeLogoUrl: $('manualHomeLogoUrl'), manualAwayLogoUrl: $('manualAwayLogoUrl'),
    manualHomeLogoClear: $('manualHomeLogoClear'), manualAwayLogoClear: $('manualAwayLogoClear'),
    manualHomePlus: $('manualHomePlus'), manualHomeMinus: $('manualHomeMinus'),
    manualAwayPlus: $('manualAwayPlus'), manualAwayMinus: $('manualAwayMinus'),
    manualResetScore: $('manualResetScore'),
    manualHomeScoreVal: $('manualHomeScoreVal'), manualAwayScoreVal: $('manualAwayScoreVal'),
    manualHomeNote: $('manualHomeNote'), manualAwayNote: $('manualAwayNote'),
    manualSection: $('manual-section'), manualModeToggle: $('manualModeToggle'),
    homeLogoScale: $('homeLogoScale'), awayLogoScale: $('awayLogoScale'),
    homeLogoX: $('homeLogoX'), homeLogoY: $('homeLogoY'),
    awayLogoX: $('awayLogoX'), awayLogoY: $('awayLogoY'),
    homeOffsetReset: $('homeOffsetReset'), awayOffsetReset: $('awayOffsetReset'),
    homeNote: $('homeNote'), awayNote: $('awayNote'),
    homeNoteSide: $('homeNoteSide'), awayNoteSide: $('awayNoteSide'),
    noteOn: $('noteOn'), noteFontSize: $('noteFontSize'),
    inNoteStroke: $('inNoteStroke'), inNoteText: $('inNoteText'),
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [상태 저장/복원] LocalStorage를 통해 state를 영속화하고 새로고침 시 복원
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 현재 state를 LocalStorage에 JSON으로 저장 (로고 데이터는 용량 절약을 위해 제외) */
  function persist(){
    try{
      try{
        localStorage.setItem(SKEY, JSON.stringify(JSON.parse(JSON.stringify(state))));
        return;
      }catch(e){
        const snap = JSON.parse(JSON.stringify({...state, homeLogo:'', awayLogo:'', homeLogoManual:'', awayLogoManual:''}));
        localStorage.setItem(SKEY, JSON.stringify(snap));
        console.warn('Logo data was excluded from localStorage because it exceeded the browser quota.', e);
        return;
      }
    }catch(e){ console.warn('저장 실패:', e); }
  }
  /** LocalStorage에서 저장된 state를 불러와 현재 state에 병합 (running은 항상 false로 초기화) */
  function restore(){
    try{
      const saved = JSON.parse(localStorage.getItem(SKEY)||'null');
      if(saved) Object.assign(state, saved, {running:false});
      if(!state.pk) state.pk={home:[],away:[]};
      state.pkLastExitedAt = Math.max(0, Number(state.pkLastExitedAt) || 0);
      expireStalePkState();
      if(!state.notes) state.notes={home:'',away:''};
      const legacyHomeManual = !!state.homeLogoManualOverride;
      const legacyAwayManual = !!state.awayLogoManualOverride;
      state.homeLogoManual = typeof state.homeLogoManual === 'string' ? state.homeLogoManual : '';
      state.awayLogoManual = typeof state.awayLogoManual === 'string' ? state.awayLogoManual : '';
      if(!state.homeLogoManual && legacyHomeManual && state.homeLogo) state.homeLogoManual = state.homeLogo;
      if(!state.awayLogoManual && legacyAwayManual && state.awayLogo) state.awayLogoManual = state.awayLogo;
      if(state.manualMode){
        state.homeLogo = state.homeLogoManual || '';
        state.awayLogo = state.awayLogoManual || '';
      }else{
        if(legacyHomeManual && !('homeLogoManual' in (saved || {}))) state.homeLogo = '';
        if(legacyAwayManual && !('awayLogoManual' in (saved || {}))) state.awayLogo = '';
      }
      delete state.homeLogoManualOverride;
      delete state.awayLogoManualOverride;
      state.fontFamily = sanitizeFontFamily(state.fontFamily) || DEFAULT_FONT_FAMILY;
      state.noteFontSize = clampNum(state.noteFontSize, 10, 60, 18);
    }catch{}
  }

