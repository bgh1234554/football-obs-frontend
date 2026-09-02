  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전역 상태] 스코어보드 전체 상태 객체와 LocalStorage 키 정의
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 전/후반 진행 순서 정의 ([ 버튼과 ] 버튼으로 순환)
  const halfOrder = ['1','2','ET1','ET2','PK'];
  const TKEY = 'obs-scoreboard-templates-v1';
  const TLASTKEY = 'obs-scoreboard-selected-template-v1';
  const SKEY = 'obs-scoreboard-state-v2';
  /** 폰트 패밀리 문자열을 정규화 — 콤마로 split, 각 부분 trim, 빈 항목 제거 후 ", "로 join. */
  function normalizeFontFamilySpec(fontMaybe){
    return String(fontMaybe || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .join(', ');
  }
  // 기본 + 옛 default 폰트 spec — restore() 시 legacy 값을 새 default로 자동 마이그레이션.
  const DEFAULT_FONT_FAMILY = normalizeFontFamilySpec("'Ubuntu', 'Nanum Barun Gothic', 'Malgun Gothic', sans-serif");
  const LEGACY_DEFAULT_FONT_FAMILY = normalizeFontFamilySpec("'Ubuntu', 'NanumSquareRound', sans-serif");
  const LEGACY_NANUM_GOTHIC_DEFAULT_FONT_FAMILY = normalizeFontFamilySpec("'Ubuntu', 'Nanum Gothic', 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif");
  // PK 하프에서 잠시 다른 하프로 이탈했다 돌아왔을 때 시퀀스를 보존하는 retention 시간 (30초).
  const PK_RETENTION_MS = 30 * 1000;

  /** PK 점수 정규화 — null은 그대로, 음수/NaN은 0으로 클램프. */
  function normalizePenaltyScore(scoreMaybe){
    if(scoreMaybe == null) return null;
    return Math.max(0, Number(scoreMaybe) || 0);
  }

  /**
   * 폰트 패밀리 spec sanitize.
   * 1) 빈 입력은 빈 문자열.
   * 2) legacy default 두 종류는 새 DEFAULT로 치환.
   * 3) NanumSquareRound / Nanum Gothic은 'Nanum Barun Gothic'으로 정규화.
   * 4) HUMidnight140은 폰트 목록에서 제거 (지원 폰트 변경).
   * 5) 'Ubuntu' 단독 + 원본에 HUMidnight140 흔적 → 안전한 default 폰트로 복귀.
   */
  function sanitizeFontFamily(fontMaybe){
    const raw = (typeof fontMaybe === 'string') ? fontMaybe.trim() : '';
    if(!raw) return '';
    const normalized = normalizeFontFamilySpec(raw);
    if(!normalized) return '';
    if(normalized === LEGACY_DEFAULT_FONT_FAMILY || normalized === LEGACY_NANUM_GOTHIC_DEFAULT_FONT_FAMILY) return DEFAULT_FONT_FAMILY;
    const parts = normalized.split(',').map(s=>s.trim()).filter(Boolean)
      .map(s => {
        if(/^['"]?NanumSquareRound['"]?$/i.test(s)) return "'Nanum Barun Gothic'";
        if(/^['"]?Nanum Gothic['"]?$/i.test(s)) return "'Nanum Barun Gothic'";
        return s;
      })
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
      // uiBg는 Iter 5-7에서 설정 팝업의 'bgColor'로 이전됨 — state.colors에서 제거.
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
    pkScore: { home: null, away: null },
    pkLastExitedAt: 0,
    // 사용자가 테마 탭에서 home/away 컬러를 직접 수정한 적이 있으면 true.
    // applyFixtureToState가 API 컬러로 덮어쓰지 않도록 가드용. localStorage로 영속화돼서 새로고침 후에도 보존.
    teamColorOverride: false,
    teamColorOverrideFixtureId: null,
    noteEnabled: true,
    notes: { home: '', away: '' },
    noteFontSize: 18,
    noteBorderWidth: 1,
    noteMinHeight: 56,
    manualMode: false,
    leagueId: null,
    leagueLogoUrl: null
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
    // inUiBg 제거 — 설정 팝업의 bgColor로 이전.
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
    templateSelect: $('templateSelect'), templateName: $('templateName'), saveTemplate: $('saveTemplate'), deleteTemplate: $('deleteTemplate'), resetTemplates: $('resetTemplates'),
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
        localStorage.setItem(SKEY, JSON.stringify(state));
        return;
      }catch(e){
        if(e.name !== 'QuotaExceededError' && e.name !== 'NS_ERROR_DOM_QUOTA_REACHED') throw e;
        const snap = JSON.parse(JSON.stringify({...state, homeLogo:'', awayLogo:'', homeLogoManual:'', awayLogoManual:''}));
        localStorage.setItem(SKEY, JSON.stringify(snap));
        console.warn('Logo data was excluded from localStorage because it exceeded the browser quota.', e);
        return;
      }
    }catch(e){ console.warn('저장 실패 (' + SKEY + '):', e); }
  }
  /**
   * LocalStorage에서 저장된 state를 불러와 현재 state에 병합.
   *
   * 1) saved를 Object.assign으로 병합 — running 상태도 보존(이전엔 항상 false 리셋했음).
   * 2) running + lastRunningTickMs 있으면 (Date.now - lastRunningTickMs)만큼 seconds에 더해 시계 끊김 보정.
   *    하루(24h) 이상 차이는 stale로 보고 적용 안 함 (브라우저 재시작 등).
   * 3) colors / pk / pkScore / notes 같은 중첩 객체는 default와 shallow merge — 누락 키 보완.
   * 4) PK retention 만료 체크(expireStalePkState).
   * 5) legacy 키(homeLogoManualOverride 등) → 새 키(homeLogoManual)로 마이그레이션.
   * 6) 폰트/노트 폰트 사이즈 sanitize.
   * 7) teamColorOverride 플래그 정규화 (boolean + fixtureId 문자열).
   */
  function restore(){
    try{
      const saved = JSON.parse(localStorage.getItem(SKEY)||'null');
      // colors/pk/notes는 중첩 객체이므로 shallow assign 후 기본값으로 누락 키를 보완
      const defaultColors = {...state.colors};
      // running 상태 보존 — 새로고침 사이에도 타이머가 이어지도록 (이전엔 항상 false로 리셋했음)
      if(saved) Object.assign(state, saved);
      // 새로고침 사이 경과한 실제 시간을 더해줘서 시계가 끊기지 않게 보정.
      // lastRunningTickMs는 timer.js의 tick()에서 매 틱마다 Date.now()로 갱신 + beforeunload에서 persist.
      if (state.running && state.lastRunningTickMs) {
        const elapsedMs = Date.now() - Number(state.lastRunningTickMs);
        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (elapsedMs > 0 && elapsedMs < ONE_DAY) {
          const secPerTick = Number(state.secPerTick) || 1;
          state.seconds = Number(state.seconds || 0) + (elapsedMs / 1000) * secPerTick;
        }
      }
      state.lastRunningTickMs = 0; // 현재 세션에서 다시 채워짐
      state.colors = Object.assign({}, defaultColors, (saved||{}).colors || {});
      state.pk = Object.assign({home:[],away:[]}, (saved||{}).pk || {});
      state.pkScore = Object.assign({home:null,away:null}, (saved||{}).pkScore || {});
      state.notes = Object.assign({home:'',away:''}, (saved||{}).notes || {});
      state.pkScore.home = normalizePenaltyScore(state.pkScore.home);
      state.pkScore.away = normalizePenaltyScore(state.pkScore.away);
      state.pkLastExitedAt = Math.max(0, Number(state.pkLastExitedAt) || 0);
      expireStalePkState();
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
      state.teamColorOverride = !!state.teamColorOverride;
      state.teamColorOverrideFixtureId = String(state.teamColorOverrideFixtureId || '').trim() || null;
      state.leagueId = saved.leagueId;
      state.leagueLogoUrl = saved.leagueLogoUrl;
    }catch(e){ console.warn('복원 실패:', e); }
  }
