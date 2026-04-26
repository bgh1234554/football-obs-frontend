  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [API / 경기 ID 연동] API-Sports 위젯에서 경기 ID를 추출하고 스코어보드에 반영
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const selectedEls = Array.from(document.querySelectorAll('[data-selected-fixture-id]'));
  const statusEl = $('fixture-status');
  const fixtureInlineWraps = Array.from(document.querySelectorAll('[data-fixture-inline-wrap]'));
  const copyToast = $('copy-toast');
  const gameTarget = document.querySelector('#game-content');
  let currentFixtureId = null;
  let toastTimer = null;

  /** 화면 하단에 토스트 메시지를 1.8초 동안 표시 */
  function showToast(msg) {
    if (!copyToast) return;
    copyToast.textContent = msg;
    copyToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => copyToast.classList.remove('show'), 1800);
  }

  /** 현재 선택된 경기 ID를 전역 변수에 저장하고 UI(표시 텍스트, 인라인 래퍼)를 갱신 */
  function setFixtureId(id) {
    currentFixtureId = id || null;
    selectedEls.forEach(selectedEl => { selectedEl.textContent = currentFixtureId ?? '-'; });
    fixtureInlineWraps.forEach(fixtureInlineWrap => { fixtureInlineWrap.style.display = currentFixtureId ? '' : 'none'; });
    if (currentFixtureId) localStorage.setItem('last_fixture_id', currentFixtureId);
  }
  function pickMatchTeamName(matchInfo, side) {
    const shortName = side === 'home'
      ? (matchInfo?.homeTeamNameShort || '')
      : (matchInfo?.awayTeamNameShort || '');
    const longName = side === 'home'
      ? (matchInfo?.homeTeamName || '')
      : (matchInfo?.awayTeamName || '');
    const useLong = (typeof isLongName === 'function') && isLongName('teamName');
    return useLong ? (longName || shortName) : (shortName || longName);
  }
  /** 경기 상태 텍스트를 statusEl에 표시 */
  function setStatus(msg){ if(!statusEl) return; statusEl.textContent=msg?`(${msg})`:''; }
  /** 컨테이너 엘리먼트에서 api-sports-widget의 data-game-id 속성을 읽어 반환 */
  function readFixtureIdFromTarget(targetEl){ const w=targetEl.querySelector('api-sports-widget[data-type="game"]'); if(w){ const id=w.getAttribute('data-game-id'); if(id) return id; } return null; }

  // [이벤트 등록] 경기 ID 텍스트 클릭 → 클립보드 복사 + 토스트 알림
  selectedEls.forEach(selectedEl => {
    selectedEl.addEventListener('click', async () => {
      if (!currentFixtureId) return;
      try {
        await navigator.clipboard.writeText(currentFixtureId);
        showToast('복사되었습니다!');
      } catch {
        showToast('복사 실패 (브라우저 권한 확인)');
      }
    });
  });


  if(gameTarget){
    const observer=new MutationObserver(()=>{
      const w = gameTarget.querySelector('api-sports-widget[data-type="game"]');
      const id = w ? w.getAttribute('data-game-id') : null;
      if(id && id !== currentFixtureId){
        setFixtureId(id);
        setStatus('클릭으로 선택됨');
        autoClickStandings(id);
      }
    });
    observer.observe(gameTarget,{childList:true,subtree:true,attributes:true,attributeFilter:['data-game-id']});
  }

  /**
   * 경기 선택 시 해당 리그의 순위표(Standings) 탭 버튼을 자동으로 클릭.
   * game-item → games-container → game-list-header → .league-standings 순서로 DOM을 탐색한다.
   */
  function autoClickStandings(fixtureId) {
    const gamesList = document.querySelector('#games-list');
    if (!gamesList) return;

    setTimeout(() => {
      // game-item[data-id="fixtureId"] 찾기
      const gameItem = gamesList.querySelector(`game-item[data-id="${fixtureId}"]`);
      if (!gameItem) return;

      // 부모 games-container → 이전 형제 game-list-header → .league-standings 클릭
      const gamesContainer = gameItem.closest('.games-container');
      if (!gamesContainer) return;

      const header = gamesContainer.previousElementSibling;
      if (!header || !header.classList.contains('game-list-header')) return;

      const standingsBtn = header.querySelector('.league-standings');
      if (standingsBtn) standingsBtn.click();
    }, 300);
  }

  /** API-Sports 위젯의 Shadow DOM 또는 iframe에 커스텀 CSS를 주입 */
  const WIDGET_CSS = `
    /* Details 점수 가운데 정렬 */
    .game-detail { display: flex !important; align-items: center !important; justify-content: center !important; }
    .game-center { flex: 1 !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; text-align: center !important; }
    /* Lineups 선수명 작게 */
    .group-title, .lineup-section h3 {
      font-family: Poppins, sans-serif !important;
      font-weight: 700 !important;
      letter-spacing: normal !important;
    }
    .lineup-player-name, .player-name, .player-item span, .player-item div { font-size: 11px !important; }
    .lineup-player { font-size: 11px !important; }
    .shirt-number { font-size: 10px !important; }
  `;

  /** 주어진 root(Shadow DOM 또는 document)에 WIDGET_CSS를 style 태그로 한 번만 주입 */
  function injectCSS(root) {
    if (!root || root._cssInjected) return;
    try {
      const style = root.ownerDocument
        ? root.ownerDocument.createElement('style')
        : document.createElement('style');
      style.textContent = WIDGET_CSS;
      (root.head || root).appendChild(style);
      root._cssInjected = true;
    } catch(e) {}
  }

  /** 페이지 내 모든 api-sports-widget 요소의 Shadow DOM과 iframe에 CSS를 주입 (1초마다 재시도) */
  function injectWidgetCSS() {
    document.querySelectorAll('api-sports-widget').forEach(widget => {
      // Shadow DOM에 주입 후 위젯 엘리먼트에 플래그 설정
      if (widget.shadowRoot && !widget.shadowRoot._cssInjected) {
        injectCSS(widget.shadowRoot);
        if (widget.shadowRoot._cssInjected) widget._cssInjected = true;
      }
      // iframe — 크로스오리진 접근은 SecurityError를 던질 수 있으므로 try-catch로 감쌈
      const iframe = widget.querySelector('iframe') || widget.shadowRoot?.querySelector('iframe');
      if (iframe && !widget._cssInjected) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc?.head) {
            injectCSS(doc);
            if (doc._cssInjected) widget._cssInjected = true;
          }
        } catch(e) { /* cross-origin: 무시 */ }
      }
    });
  }

  const injectWidgetCSSInterval = setInterval(() => {
    injectWidgetCSS();
    // 모든 위젯에 주입 완료 시 인터벌 종료
    const widgets = document.querySelectorAll('api-sports-widget');
    if (widgets.length > 0 && Array.from(widgets).every(w => w._cssInjected)) {
      clearInterval(injectWidgetCSSInterval);
    }
  }, 1000);

  /** 경기 ID 입력값으로 API 데이터를 가져와 스코어보드에 반영하는 메인 진입점 */
  const mainInput      = $('main-fixture-input');
  const mainShowBtn    = $('main-show-btn');
  const mainUseLastBtn = $('main-use-last-btn');
  const mainClearBtn   = $('main-clear-btn');

  /** 입력된 fixtureId로 fetchAndApplyFixtureData를 호출하고 오버레이를 닫음 */
  function renderMainGame(fixtureId){
    const id = (fixtureId||'').trim();
    if(!id){
      resetFixtureDrivenState({
        clearFixtureId: true,
        clearCache: true,
        statusMessage: '경기 선택 안 됨'
      });
      return;
    }
    fetchAndApplyFixtureData(id);
  }

  // [이벤트 등록] 경기 ID 입력 패널 버튼 (조회/최근값 불러오기/비우기)
  if(mainShowBtn)    mainShowBtn.addEventListener('click', ()=>{ renderMainGame(mainInput?.value); closeOverlay(); });
  if(mainUseLastBtn) mainUseLastBtn.addEventListener('click', ()=>{ const last=localStorage.getItem('last_fixture_id'); if(!last) return; if(mainInput) mainInput.value=last; mainInput.focus(); });
  if(mainClearBtn)   mainClearBtn.addEventListener('click', ()=>{
    if(mainInput){
      mainInput.value='';
      mainInput.focus();
    }
    resetFixtureDrivenState({
      clearFixtureId: true,
      clearCache: true,
      statusMessage: '경기 선택 안 됨'
    });
  });

  /** 경기 ID 입력 오버레이 패널을 열고 입력 필드에 포커스 */
  const overlay = $('fixture-overlay');
  const openBtn = $('open-fixture-overlay');
  const closeBtn = $('close-fixture-overlay');

  function openOverlay(){
    if(!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    setTimeout(()=>mainInput?.focus(),0);
  }
  /** 경기 ID 입력 오버레이 패널을 닫음 */
  function closeOverlay(){ if(!overlay) return; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); }
  // [이벤트 등록] 오버레이 열기/닫기 (버튼, 배경 클릭, Escape 키)
  if(openBtn) openBtn.addEventListener('click', openOverlay);
  if(closeBtn) closeBtn.addEventListener('click', closeOverlay);
  if(overlay){ overlay.addEventListener('click', e=>{ if(e.target===overlay) closeOverlay(); }); }
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'&&overlay?.classList.contains('open')) closeOverlay(); });

  /**
   * API 상태 표시 배지 업데이트 (ok/loading/idle 상태에 따라 dot 색상과 텍스트 변경).
   * @param {string} status  'ok' | 'loading' | 'idle'
   * @param {string=} msg
   * @param {{noOverlay?: boolean}=} opts  noOverlay=true면 풀스크린 로딩 오버레이를 토글하지 않음
   *                                        (폴링/silent 갱신 시 시청자 화면 깜빡임 방지)
   */
  function setApiStatus(status, msg, opts){
    const dot=$('apiDot'), text=$('apiStatus');
    if(dot && text){
      dot.className='dot';
      if(status==='ok'){ dot.classList.add('ok'); text.textContent=msg||'데이터 수신 완료'; }
      else if(status==='loading'){ dot.classList.add('loading'); text.textContent=msg||'가져오는 중...'; }
      else { dot.classList.add('idle'); text.textContent=msg||'대기 중'; }
      const ts=$('apiLastFetched');
      if(ts&&status==='ok') ts.textContent=`(${new Date().toLocaleTimeString('ko-KR')})`;
    }
    // noOverlay=true면 오버레이 토글 스킵 (열린 상태도 건드리지 않음)
    if (opts && opts.noOverlay) return;
    // 풀스크린 로딩 오버레이 토글
    const loading=$('dpLoading');
    if(loading){
      loading.classList.toggle('open', status==='loading');
      loading.setAttribute('aria-hidden', status==='loading' ? 'false' : 'true');
      const m=$('dpLoadingMsg');
      if(m && status==='loading') m.textContent = msg || '경기 데이터 불러오는 중…';
    }
  }

  // 마지막으로 요청된 경기 ID — 이전 요청의 응답이 늦게 도착해도 state를 덮어쓰지 않도록 비교에 사용
  let _lastFetchId = null;

  // 마지막 fixture 응답 보관 — scorer 토글 변경 시 events에서 notes 재구성용
  let _lastFixtureData = null;

  // ─── 자동 폴링 ─────────────────────────────────────────────────
  // 정책:
  //   - 경기 시작 전(NS + kickoffUtc 있음): 킥오프 30초 전까지 대기 후 호출 시작
  //   - 진행 중(1H/HT/2H/ET1/ET2/PSO): 30초 간격으로 호출
  //   - FT 첫 감지 후 3분까지: 1분 간격 (스탯 후처리 갱신 가능성)
  //   - FT + 3분 경과 / 비정상 상태(PST/CANC/SUSP/INT/ABD/AWD/WO): 호출 중단
  //   - kickoffUtc 없는 NS: 안전하게 1분 간격으로 재호출 (fallback)
  const POLL_INTERVAL_MS    = 30 * 1000;
  const POST_FT_WINDOW_MS   = 3 * 60 * 1000;
  const PRE_KICKOFF_BUFFER_MS = 30 * 1000;
  const FT_LIKE_STATUSES    = new Set(['FT','AET','PEN']); // 백엔드는 'FT'로 통일하지만 방어
  const ABNORMAL_STATUSES   = new Set(['PST','CANC','SUSP','INT','ABD','AWD','WO']);
  const LIVE_STATUSES_POLL  = new Set(['1H','HT','2H','ET1','ET2','PSO']);

  let _pollTimer = null;
  let _ftFirstDetectedAt = null;

  /** 진행 중인 폴링 타이머 취소 + FT 추적 시각 리셋 */
  function clearPolling() {
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
    _ftFirstDetectedAt = null;
  }

  /**
   * 다음 호출을 적절한 시점에 예약. 응답 받은 직후 호출하면 됨.
   * 사용자가 다른 fixtureId로 바꾸면 _lastFetchId 비교로 자동 폐기됨.
   */
  function schedulePoll(data) {
    clearPolling();

    const fixtureId = String(data?.matchInfo?.fixtureId ?? '').trim();
    if (!fixtureId) return;

    const status = String(data?.matchInfo?.status || '');
    const kickoffUtc = data?.matchInfo?.kickoffUtc;
    const now = Date.now();

    // 1) FT 도달 — 3분 윈도우 내에서만 폴링 유지
    if (FT_LIKE_STATUSES.has(status)) {
      if (!_ftFirstDetectedAt) _ftFirstDetectedAt = now;
      if (now - _ftFirstDetectedAt >= POST_FT_WINDOW_MS) return; // 종료
    } else {
      _ftFirstDetectedAt = null;
    }

    // 2) 비정상 상태면 폴링 중단
    if (ABNORMAL_STATUSES.has(status)) return;

    const wakeAndFetch = () => {
      // 폴링 진행 중에 사용자가 다른 ID로 바꾸거나 reset한 경우 폐기
      if (_lastFetchId !== fixtureId) return;
      // silent=true → 풀스크린 로딩 오버레이 안 띄움 (시청자 화면 깜빡임 방지)
      fetchAndApplyFixtureData(fixtureId, { silent: true });
    };

    // 3) 경기 시작 전(NS) + kickoffUtc 알면 시작 직전까지 대기
    if (status === 'NS' && kickoffUtc) {
      const kickoffMs = Date.parse(kickoffUtc);
      if (!isNaN(kickoffMs) && kickoffMs > now + PRE_KICKOFF_BUFFER_MS) {
        const waitMs = kickoffMs - now - PRE_KICKOFF_BUFFER_MS;
        _pollTimer = setTimeout(wakeAndFetch, waitMs);
        return;
      }
    }

    // 4) 진행 중 / HT / kickoff 임박 / kickoff 모르는 NS → 1분 간격
    if (LIVE_STATUSES_POLL.has(status) || status === 'NS' || FT_LIKE_STATUSES.has(status)) {
      _pollTimer = setTimeout(wakeAndFetch, POLL_INTERVAL_MS);
    }
    // 그 외(미지의 status)는 안전하게 폴링하지 않음
  }
  // ────────────────────────────────────────────────────────────────────────

  function clearCachedFixtureData() {
    try { sessionStorage.removeItem('cached_fixture_data'); } catch {}
    try { localStorage.removeItem('cached_fixture_data'); } catch {}
  }

  function resetFixtureDrivenState({ clearFixtureId = false, clearCache = false, statusMessage = '' } = {}) {
    clearPolling();
    _lastFetchId = null;
    _lastFixtureData = null;

    if (clearCache) clearCachedFixtureData();
    if (clearFixtureId) setFixtureId(null);

    if (state.manualMode) {
      if (typeof applyLineupPanels === 'function') applyLineupPanels(null);
      setApiStatus('idle', statusMessage);
      return;
    }

    state.homeName = 'HOME';
    state.awayName = 'AWAY';
    state.homeScore = 0;
    state.awayScore = 0;
    state.homeLogo = '';
    state.awayLogo = '';
    state.extra = 0;
    state.extraShown = false;
    state.extraManualOverride = false; // 새 fixture로 넘어가면 override 풀림
    state.redHome = 0;
    state.redAway = 0;
    state.notes = { home: '', away: '' };
    state.running = false;
    state.pk = { home: [], away: [] };
    state.pkLastExitedAt = 0;
    setMatchHalf('1');

    if (typeof applyLineupPanels === 'function') applyLineupPanels(null);

    render();
    persist();
    setApiStatus('idle', statusMessage);
  }

  /**
   * 경기 ID로 백엔드 API를 호출해 FixtureResponseDto를 받고, state + 패널에 적용.
   * - 점수판/색상/하프/추가시간/PK는 state 업데이트 → render()
   * - 득점자(notes)와 레드카드 카운트는 events 배열을 가공해 state에 반영
   * - 벤치/부상 패널은 applyLineupPanels(data)로 위임 (lineup-panel.js)
   * - scorer 토글 변경 시 이름 다시 골라 notes 재구성 (하단 'settings:change' 리스너)
   */
  async function fetchAndApplyFixtureData(fixtureId, options){
    const normalizedFixtureId = String(fixtureId || '').trim();
    if(!normalizedFixtureId){
      resetFixtureDrivenState({
        clearFixtureId: true,
        clearCache: true,
        statusMessage: '경기 선택 안 됨'
      });
      return;
    }
    if(state.manualMode){ setApiStatus('idle', '수동 모드 ON — API 적용 건너뜀'); return; }
    // silent=true (폴링 등 자동 갱신) 시 어떤 시각적 피드백도 주지 않음 — 시청자 화면 그대로.
    //   - loading 상태 : setApiStatus 호출 스킵 (배지/오버레이 둘 다 안 바뀜)
    //   - ok 상태      : 호출하되 noOverlay — 'ok' 텍스트는 그대로 유지되고 타임스탬프만 갱신
    //   - 에러         : console.error만, 배지는 직전 'ok' 상태 유지
    const silent = options && options.silent === true;
    const overlayOpts = silent ? { noOverlay: true } : undefined;
    const requestId = normalizedFixtureId;
    _lastFetchId = requestId;
    if (!silent) setApiStatus('loading');
    try{
      const data = await fetchFixture(normalizedFixtureId);
      if(_lastFetchId !== requestId) return;
      if(!data){
        resetFixtureDrivenState({
          clearFixtureId: true,
          clearCache: true,
          statusMessage: '경기 데이터 없음'
        });
        return;
      }

      _lastFixtureData = data;
      applyFixtureToState(data);
      setFixtureId(normalizedFixtureId);
      // 벤치/부상 패널 채우기 (lineup-panel.js)
      if (typeof applyLineupPanels === 'function') applyLineupPanels(data);

      const m = data.matchInfo || {};
      const homeName = pickMatchTeamName(m, 'home');
      const awayName = pickMatchTeamName(m, 'away');
      setApiStatus('ok', `${homeName} vs ${awayName}`, overlayOpts);

      // 다음 호출 자동 예약 (1분 간격, FT+3분 후 중단, 비정상 상태 중단, 경기 시작 전 대기)
      schedulePoll(data);

      // [Iter 2-3 저장 정책]
      //   sessionStorage: 경기 캐시 + 현재 표시 상태 (탭 닫으면 자동 소거)
      //   localStorage : 마지막 fixtureId만 유지 (다음 세션에서 '최근 선택값'으로 의도적 재호출용)
      try { sessionStorage.setItem('cached_fixture_data', JSON.stringify(data)); } catch {}
      try { localStorage.removeItem('cached_fixture_data'); } catch {}  // 구버전 잔여물 정리
      try { localStorage.setItem('last_fixture_id', normalizedFixtureId); } catch {}
    }catch(e){
      console.error('API 오류:', e);
      // silent(폴링) 에러는 배지 그대로 두고 콘솔에만 — 시청자 화면 그대로 유지
      if (!silent) {
        const msg = (e && e.code) ? `${e.code}: ${e.message}` : (e?.message || '데이터 가져오기 실패');
        setApiStatus('idle', msg);
      }
    }
  }

  /**
   * FixtureResponseDto → state 매핑.
   * matchInfo 기반 점수/색/하프/추가시간/PK + events 기반 득점자/레드카드.
   */
  function applyFixtureToState(data, options){
    const m = data?.matchInfo || {};

    // 팀 이름 (단축명 우선, 없으면 풀네임)
    const homeTeamName = pickMatchTeamName(m, 'home');
    const awayTeamName = pickMatchTeamName(m, 'away');
    if (homeTeamName) state.homeName = homeTeamName;
    if (awayTeamName) state.awayName = awayTeamName;

    // 점수 (정규+연장 합산값을 그대로 사용)
    if (m.homeScore != null) state.homeScore = m.homeScore;
    if (m.awayScore != null) state.awayScore = m.awayScore;

    // 로고
    if ('homeTeamLogo' in m) state.homeLogo = m.homeTeamLogo || '';
    if ('awayTeamLogo' in m) state.awayLogo = m.awayTeamLogo || '';

    // 팀 컬러 (Hex, '#' 없음 → 붙여서 저장)
    state.colors = state.colors || {};
    if (m.homePrimaryColor) state.colors.homeBg   = '#' + m.homePrimaryColor;
    if (m.homeNumberColor)  state.colors.homeText = '#' + m.homeNumberColor;
    if (m.awayPrimaryColor) state.colors.awayBg   = '#' + m.awayPrimaryColor;
    if (m.awayNumberColor)  state.colors.awayText = '#' + m.awayNumberColor;

    // 하프 (PSO만 PK로 변환, 그 외 그대로)
    if (m.status) setMatchHalf(mapApiStatusToHalf(m.status, m));

    // 추가시간
    // 추가시간: 사용자가 수동으로 토글/조정한 적 있으면(extraManualOverride) API 값으로 덮지 않음.
    // 새 fixture id로 바뀌면 resetFixtureDrivenState에서 override가 풀림.
    if (!state.extraManualOverride) {
      state.extra = Math.max(0, Number(m.extra) || 0);
      state.extraShown = m.extra != null && state.extra > 0;
    }

    // 페널티 슛아웃 결과 — events에서 PK 이벤트 추출해 배열 재구성
    state.pk = state.pk || { home: [], away: [] };
    if (m.homePenaltyScore != null || m.awayPenaltyScore != null) {
      state.pk.home = buildPkArray(data.events || [], 'home');
      state.pk.away = buildPkArray(data.events || [], 'away');
    }

    // 득점자/레드카드 (events 가공)
    applyScorersAndCards(data);

    // 타이머: 비-진행 상태(HT/FT/NS 등)면 정지.
    //   단, 단순 재적용(예: settings 토글 변경)에서는 사용자가 수동으로 시작한 타이머를
    //   덮어쓰지 않도록 호출자가 options.resetRunning=false로 끌 수 있음.
    if (options?.resetRunning !== false) {
      const LIVE_STATUSES = new Set(['1H','2H','ET1','ET2','PSO']);
      if (m.status && !LIVE_STATUSES.has(String(m.status))) state.running = false;
    }

    render();
    persist();
  }

  /** events 배열에서 득점자 텍스트와 레드카드 카운트를 state에 반영 */
  function applyScorersAndCards(data){
    const events = data?.events || [];
    state.notes = state.notes || { home: '', away: '' };
    state.notes.home = buildScorers(events, 'home');
    state.notes.away = buildScorers(events, 'away');
    state.redHome = countRedCards(events, 'home');
    state.redAway = countRedCards(events, 'away');
  }

  /**
   * 득점자 텍스트 한 팀치를 만들어 반환 (\n으로 구분된 줄들).
   * 'Missed Penalty'는 제외, 'Own Goal'/'Penalty'는 표기 추가.
   * 이름은 scorer 토글 (long/short)에 따라 선택.
   */
  function buildScorers(events, side){
    return events
      .filter(e => e.side === side && e.type === 'Goal' && e.detail !== 'Missed Penalty')
      .map(e => {
        const min = e.extra ? `${e.elapsed}+${e.extra}'` : `${e.elapsed}'`;
        // pickName은 settings-popup.js의 헬퍼 — playerName/playerNameKoLong 양쪽 지원
        const name = (typeof pickName === 'function') ? pickName(e, 'scorer') : (e.playerName || '');
        // 자책골/페널티 모두 이름 뒤에 표기. 일반골은 이름만.
        if (e.detail === 'Own Goal') return `${min} ${name} (OG)`;
        if (e.detail === 'Penalty')  return `${min} ${name} (PK)`;
        return `${min} ${name}`;
      })
      .join('\n');
  }

  /** Red Card + Second Yellow Card 합산 */
  function countRedCards(events, side){
    return events.filter(e =>
      e.side === side &&
      e.type === 'Card' &&
      (e.detail === 'Red Card' || e.detail === 'Second Yellow Card')
    ).length;
  }

  /** PSO 이벤트 → 'G'/'M' 배열 (일반 'Penalty'=득점, 'Missed Penalty'=실패) */
  function buildPkArray(events, side){
    return events
      .filter(e => e.comments === 'Penalty Shootout' && e.side === side)
      .map(e => e.detail === 'Penalty' ? 'G' : 'M');
  }

  /** API status → state.half 매핑 (PSO만 PK로 치환, 나머지는 그대로) */
  function mapApiStatusToHalf(status, matchInfo){
    const s = String(status || '').toUpperCase();
    const elapsed = Number(matchInfo?.elapsed) || 0;
    const hasPenaltyScore = matchInfo?.homePenaltyScore != null || matchInfo?.awayPenaltyScore != null;

    if (s === '1H' || s === 'HT' || s === 'NS') return '1';
    if (s === '2H') return '2';
    if (s === 'ET1') return 'ET1';
    if (s === 'ET2' || s === 'AET') return 'ET2';
    if (s === 'ET') return elapsed > 105 ? 'ET2' : 'ET1';
    if (s === 'PSO' || s === 'P' || s === 'PEN') return 'PK';
    if (s === 'FT') {
      if (hasPenaltyScore) return 'PK';
      if (elapsed > 105) return 'ET2';
      return '2';
    }
    return '1';
  }

  // scorer 토글 변경 시 notes만 재계산 후 다시 렌더 (점수판 옆 메모 즉시 반영)
  document.addEventListener('settings:change', e => {
    if (e.detail?.category !== 'scorer' && e.detail?.category !== 'teamName') return;
    if (!_lastFixtureData) return;
    // 토글 변경은 표시 텍스트만 갱신해야 하므로 사용자가 수동으로 켠 타이머를 보존
    applyFixtureToState(_lastFixtureData, { resetRunning: false });
  });

  /**
   * 같은 탭 내 새로고침 시 sessionStorage 캐시에서 복원 (API 호출 없음).
   * 탭/브라우저를 완전히 닫고 다시 열면 sessionStorage가 비어있어 자동 복원 안 됨 → 빈 화면.
   * 수동 모드에서는 건너뜀.
   */
  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (state.manualMode) return;
      // sessionStorage 우선 — localStorage는 구버전 마이그레이션용 fallback 후 정리
      const raw = sessionStorage.getItem('cached_fixture_data') || localStorage.getItem('cached_fixture_data');
      if (raw && !sessionStorage.getItem('cached_fixture_data')) {
        try { sessionStorage.setItem('cached_fixture_data', raw); } catch {}
        try { localStorage.removeItem('cached_fixture_data'); } catch {}
      }
      if (!raw) {
        resetFixtureDrivenState({
          clearFixtureId: true,
          clearCache: true,
          statusMessage: '경기 선택 안 됨'
        });
        return;
      }
      const data = JSON.parse(raw);
      if (!data || !data.matchInfo) {
        resetFixtureDrivenState({
          clearFixtureId: true,
          clearCache: true,
          statusMessage: '경기 선택 안 됨'
        });
        return;
      }
      _lastFixtureData = data;
      // init.js의 첫 render() 다음 사이클에서 적용 — 레이아웃 안정화 후
      requestAnimationFrame(() => {
        applyFixtureToState(data);
        const fixtureId = String(data?.matchInfo?.fixtureId ?? '').trim();
        if (fixtureId) {
          setFixtureId(fixtureId);
          _lastFetchId = fixtureId; // 폴링 콜백의 _lastFetchId 비교용
        }
        if (typeof applyLineupPanels === 'function') applyLineupPanels(data);
        const m = data.matchInfo;
        const homeName = pickMatchTeamName(m, 'home');
        const awayName = pickMatchTeamName(m, 'away');
        setApiStatus('ok', `${homeName} vs ${awayName} (캐시)`);
        // 캐시 복원 후에도 폴링 시작 (stale 방지)
        schedulePoll(data);
      });
    } catch {}
  });
