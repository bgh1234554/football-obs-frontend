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

  /**
   * api.js가 429 응답을 받으면 api:rate-limit 이벤트를 발행한다.
   *
   * 여기서는 "수동 조회"처럼 사용자가 직접 트리거한 요청에만
   * 토스트 + API 상태 문구를 갱신하고,
   * silent poll(detail.silent=true)은 시청자 화면을 건드리지 않는다.
   *
   * 참고:
   *   - 실제 재시도 대기/재호출은 api.js의 공통 fetch 레이어가 담당.
   *   - fixture.js는 사용자에게 "몇 초 뒤 자동 재시도 중인지"를 알려주는 UI 역할만 한다.
   */
  document.addEventListener('api:rate-limit', event => {
    const detail = event.detail || {};
    if (detail.silent) return;

    const waitMs = Math.max(0, Number(detail.waitMs) || 0);
    const retrySeconds = Math.max(1, Math.ceil(waitMs / 1000));
    const message = `요청 제한 도달 - ${retrySeconds}초 후 재시도`;

    showToast(message);
    setApiStatus('loading', message, { noOverlay: true });

    const loading = $('dpLoading');
    const loadingMsg = $('dpLoadingMsg');
    if (loading?.classList.contains('open') && loadingMsg) {
      loadingMsg.textContent = message;
    }
  });

  /** 현재 선택된 경기 ID를 전역 변수에 저장하고 UI(표시 텍스트, 인라인 래퍼)를 갱신 */
  /**
   * 현재 선택된 경기 ID를 전역 변수에 저장하고 UI(표시 텍스트, 인라인 래퍼)를 갱신.
   * id가 truthy면 last_fixture_id로 영속화 → 다음 세션 "최근값 불러오기" 버튼에서 사용.
   */
  function setFixtureId(id) {
    currentFixtureId = id || null;
    selectedEls.forEach(selectedEl => { selectedEl.textContent = currentFixtureId ?? '-'; });
    fixtureInlineWraps.forEach(fixtureInlineWrap => { fixtureInlineWrap.style.display = currentFixtureId ? '' : 'none'; });
    if (currentFixtureId) localStorage.setItem('last_fixture_id', currentFixtureId);
  }
  /**
   * matchInfo에서 한 팀의 표시명 선택 — 설정의 'teamName' 토글에 따라 long/short 분기.
   * long 모드: 한글 풀네임(homeTeamName) 우선, 없으면 short fallback.
   * short 모드: 한글 단축명(homeTeamNameShort) 우선, 없으면 long fallback.
   */
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

  /** 입력값을 finite 숫자로 변환. NaN/undefined는 null 반환. 템플릿 leagueId 비교용. */
  function toFixtureLeagueId(value) {
    const leagueId = Number(value);
    return Number.isFinite(leagueId) ? leagueId : null;
  }

  /**
   * 응답 객체에서 leagueId를 우선순위에 따라 추출.
   * matchInfo.leagueId (현재 백엔드 표준) > matchInfo.league.id (legacy) > 최상위 leagueId/league.id 순.
   * 첫 번째로 finite 정수가 나오는 값을 반환. 모두 실패 시 null.
   */
  function extractLeagueIdFromFixtureData(data) {
    const candidates = [
      data?.matchInfo?.leagueId,
      data?.matchInfo?.league?.id,
      data?.leagueId,
      data?.league?.id,
    ];
    for (const candidate of candidates) {
      const leagueId = toFixtureLeagueId(candidate);
      if (leagueId != null) return leagueId;
    }
    return null;
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
        statusMessage: '경기 선택 대기'
      });
      return;
    }
    fetchAndApplyFixtureData(id);
  }

  // [이벤트 등록] 경기 ID 입력 패널 버튼 (조회/최근값 불러오기/비우기)
  // 메인 표시 버튼 — 데이터 로딩 + 설정의 'mainPage'(big/small)에 따라 해당 페이지로 자동 이동.
  if(mainShowBtn)    mainShowBtn.addEventListener('click', ()=>{
    renderMainGame(mainInput?.value);
    closeOverlay();
    const target = (typeof getSetting === 'function' && getSetting('mainPage') === 'small') ? 'main-small' : 'main-big';
    if (typeof window.activatePage === 'function') window.activatePage(target);
  });
  if(mainUseLastBtn) mainUseLastBtn.addEventListener('click', ()=>{ const last=localStorage.getItem('last_fixture_id'); if(!last) return; if(mainInput) mainInput.value=last; mainInput.focus(); });
  if(mainClearBtn)   mainClearBtn.addEventListener('click', ()=>{
    if(mainInput){
      mainInput.value='';
      mainInput.focus();
    }
    resetFixtureDrivenState({
      clearFixtureId: true,
      clearCache: true,
      statusMessage: '경기 선택 대기'
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

  // 마지막으로 요청된 경기 ID — 폴링 재개 가드(wakeAndFetch 등) 비교에 사용. fixtureId 문자열 그대로 저장.
  let _lastFetchId = null;

  // fetchAndApplyFixtureData 호출마다 증가하는 시퀀스 번호 — in-flight 응답 폐기 가드용.
  // 같은 fixtureId로 겹쳐 호출되면(강제 새로고침 + 폴링 등) _lastFetchId만으로는 둘을 구분 못해
  // 늦게 도착한 이전 요청의 응답이 더 최신 요청의 결과를 덮어쓸 수 있었음.
  let _fetchSeq = 0;

  // 마지막 fixture 응답 보관 — scorer 토글 변경 시 events에서 notes 재구성용
  let _lastFixtureData = null;

  // 폴링 응답에서 점수/득점자 변경 감지용 스냅샷. fetchAndApplyFixtureData가 성공할 때마다
  // applyFixtureToState로 state 갱신한 직후의 값을 저장해 두고, 다음 호출 때 비교.
  // null이면 첫 fetch라는 뜻 → 깜빡임 없이 스냅샷만 초기화.
  let _flashSnapshot = null;

  /**
   * 폴링 응답으로 점수/득점자가 바뀐 부분만 깜빡임 효과 발동.
   * 1) 현재 state에서 비교 키(score/note 4종) 추출.
   * 2) 직전 스냅샷이 있으면 키별 비교 → 변경된 박스만 flashScore/flashNote 호출.
   * 3) 새 스냅샷으로 갱신.
   * 첫 fetch는 _flashSnapshot이 null이라 깜빡임 없이 스냅샷만 채움.
   */
  function maybeTriggerFixtureFlash() {
    const homeNote = state.notes?.home ?? '';
    const awayNote = state.notes?.away ?? '';
    const next = {
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      homeNote,
      awayNote,
    };

    if (_flashSnapshot) {
      // 변경된 항목만 깜빡임. 점수는 숫자, 득점자는 변경된 쪽 텍스트 박스만 반응.
      if (_flashSnapshot.homeScore !== next.homeScore && typeof window.flashScore === 'function') window.flashScore('home');
      if (_flashSnapshot.awayScore !== next.awayScore && typeof window.flashScore === 'function') window.flashScore('away');
      if (_flashSnapshot.homeNote  !== next.homeNote  && typeof window.flashNote  === 'function') window.flashNote('home');
      if (_flashSnapshot.awayNote  !== next.awayNote  && typeof window.flashNote  === 'function') window.flashNote('away');
    }

    _flashSnapshot = next;
  }

  /**
   * 팀 로고 URL 결정 — 설정 토글 'teamLogo'에 따라 기본/협회 중 선택.
   *   'logo' (default): matchInfo.homeTeamLogo (클럽=팀 로고, 국가대표=국기)
   *   'fa'            : matchInfo.homeTeamFaUrl (협회 로고). null이면 'logo'로 자동 폴백.
   */
  function resolveTeamLogoUrl(matchInfo, side) {
    const useFa = typeof getSetting === 'function' && getSetting('teamLogo') === 'fa';
    const faKey = side === 'home' ? 'homeTeamFaUrl' : 'awayTeamFaUrl';
    const logoKey = side === 'home' ? 'homeTeamLogo' : 'awayTeamLogo';
    if (useFa && matchInfo?.[faKey]) return matchInfo[faKey];
    return matchInfo?.[logoKey] || '';
  }

  // ─── 자동 폴링 ─────────────────────────────────────────────────
  // 정책:
  //   - 경기 시작 전(NS + kickoffUtc 있음): 킥오프 30초 전까지 대기 후 호출 시작
  //   - 진행 중(1H/HT/2H/ET1/ET2/PSO): 15초 간격으로 호출
  //   - FT 첫 감지 후 3분까지: 1분 간격 (스탯 후처리 갱신 가능성)
  //   - FT + 3분 경과: 호출 중단
  //   - INT(중단, 재개 가능): 5분 간격으로 재확인. 첫 감지로부터 30분 넘게 지속되면
  //     수동 새로고침을 안내하는 alert를 1회만 띄우고 그 뒤로는 자동 재확인 중단.
  //   - ABD(중단/취소, 재개 안 됨): 감지 즉시 안내 alert를 1회만 띄우고 호출 영구 중단.
  //   - 그 외 비정상 상태(PST/CANC/SUSP/AWD/WO): 조용히 호출 중단.
  //   - kickoffUtc 없는 NS: 안전하게 15초 간격으로 재호출 (fallback)
  const POLL_INTERVAL_MS    = 15 * 1000;
  const FT_POLL_INTERVAL_MS = 60 * 1000;
  const POST_FT_WINDOW_MS   = 3 * 60 * 1000;
  // FT 상태인데 킥오프로부터 이 시간 이상 지났으면 더 이상 폴링하지 않음 (첫 1회 로딩으로 충분).
  // 일정 페이지에서 며칠 전 끝난 경기를 클릭한 경우 등 쓸데없이 매분 호출하는 것 방지.
  const FT_STALE_AFTER_MS   = 4 * 60 * 60 * 1000;
  const PRE_KICKOFF_BUFFER_MS = 30 * 1000;
  const INT_POLL_INTERVAL_MS = 5 * 60 * 1000;  // INT(중단) 상태 재확인 간격
  const INT_ALERT_AFTER_MS   = 30 * 60 * 1000; // INT가 이만큼 지속되면 수동 새로고침 안내
  const FT_LIKE_STATUSES    = new Set(['FT','AET','PEN']); // 백엔드는 'FT'로 통일하지만 방어
  const ABNORMAL_STATUSES   = new Set(['PST','CANC','SUSP','INT','ABD','AWD','WO']);
  const LIVE_STATUSES_POLL  = new Set(['1H','HT','2H','ET1','ET2','PSO']);

  let _pollTimer = null;
  let _ftFirstDetectedAt = null;
  let _intFirstDetectedAt = null; // INT 첫 감지 시각 — 30분 경과 판정용
  let _intAlertShown = false;     // 같은 중단 동안 alert 중복 표시 방지
  let _abdAlertShown = false;     // ABD 감지 시 alert 1회만 표시

  /** 진행 중인 폴링 타이머 취소 + FT/INT/ABD 추적 상태 리셋 */
  function clearPolling(resetFt = true) {
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
    if (resetFt) {
      _ftFirstDetectedAt = null;
      _intFirstDetectedAt = null;
      _intAlertShown = false;
      _abdAlertShown = false;
    }
  }

  /**
   * 다음 호출을 적절한 시점에 예약. 응답 받은 직후 호출하면 됨.
   * 사용자가 다른 fixtureId로 바꾸면 _lastFetchId 비교로 자동 폐기됨.
   *
   * 1) FT 도달 — 킥오프 후 4시간 이상 경과면 폴링 종료. 그 외엔 3분 윈도우 내에서만 1분 간격 유지.
   * 2) ABD(중단/취소, 재개 안 됨) — 안내 alert 1회 후 폴링 영구 중단.
   * 3) 그 외 비정상 상태(PST/CANC/SUSP/AWD/WO) — 조용히 폴링 중단. (INT는 5)에서 별도 처리)
   * 4) NS + kickoffUtc 알면 — 킥오프 30초 전까지 대기 후 wakeAndFetch.
   * 5) INT(중단, 재개 가능) — 5분 간격 재확인. 30분 경과 시 안내 alert 1회 후 재확인도 중단.
   * 6) FT-like — 1분 간격.
   * 7) LIVE/NS — 15초 간격.
   * 8) 그 외 미지의 status — 안전하게 폴링 안 함.
   *
   * wakeAndFetch는 fetchAndApplyFixtureData를 silent=true로 호출하고,
   * 성공 시 fetchAndApplyFixtureData가 내부에서 다시 schedulePoll을 부르며 체인이 이어진다.
   * 실패 시에만 scheduleRetryFromLastFixture로 재예약(타이머 중복 생성 방지).
   */
  function schedulePoll(data) {
    clearPolling(false);

    const fixtureId = String(data?.matchInfo?.fixtureId ?? '').trim();
    if (!fixtureId) return;

    const status = String(data?.matchInfo?.status || '');
    const kickoffUtc = data?.matchInfo?.kickoffAt || data?.matchInfo?.kickoffUtc;
    const now = Date.now();

    // 1) FT 도달 — 킥오프 후 4시간 이상 경과 시 즉시 종료. 그 외에는 3분 윈도우 내에서만 유지.
    if (FT_LIKE_STATUSES.has(status)) {
      if (kickoffUtc) {
        const kickoffMs = Date.parse(kickoffUtc);
        if (!isNaN(kickoffMs) && (now - kickoffMs) >= FT_STALE_AFTER_MS) return;
      }
      if (!_ftFirstDetectedAt) _ftFirstDetectedAt = now;
      if (now - _ftFirstDetectedAt >= POST_FT_WINDOW_MS) return;
    } else {
      _ftFirstDetectedAt = null;
    }

    // INT가 아닌 상태로 넘어왔으면 중단 추적을 리셋 — 재개됐다가 나중에 다시 INT가 되면
    // 30분 카운트가 처음부터 다시 시작되고 alert도 다시 뜰 수 있어야 한다.
    if (status !== 'INT') { _intFirstDetectedAt = null; _intAlertShown = false; }

    // 2) ABD(중단/취소) — 재개되지 않는 경기이므로 안내 alert 1회만 띄우고 폴링 영구 중단.
    if (status === 'ABD') {
      if (!_abdAlertShown) {
        _abdAlertShown = true;
        alert('경기가 중단되어 더 이상 진행되지 않습니다 (Abandoned). 자동 갱신을 중단합니다.');
      }
      return;
    }
    _abdAlertShown = false;

    // 3) 그 외 비정상 상태면 폴링 중단 (INT는 5)에서 재확인 로직으로 따로 처리)
    if (ABNORMAL_STATUSES.has(status) && status !== 'INT') return;

    const scheduleRetryFromLastFixture = () => {
      if (!_lastFixtureData) return;
      const lastStatus = String(_lastFixtureData?.matchInfo?.status || '');
      if (lastStatus === 'INT') { handleIntRecheck(); return; }
      if (ABNORMAL_STATUSES.has(lastStatus)) return;
      if (FT_LIKE_STATUSES.has(lastStatus)) {
        _pollTimer = setTimeout(wakeAndFetch, FT_POLL_INTERVAL_MS);
        return;
      }
      if (LIVE_STATUSES_POLL.has(lastStatus) || lastStatus === 'NS') {
        _pollTimer = setTimeout(wakeAndFetch, POLL_INTERVAL_MS);
      }
    };

    const wakeAndFetch = async () => {
      // 폴링 진행 중에 사용자가 다른 ID로 바꾸거나 reset한 경우 폐기
      if (_lastFetchId !== fixtureId) return;
      // silent=true → 풀스크린 로딩 오버레이 안 띄움 (시청자 화면 깜빡임 방지)
      try {
        const data = await fetchAndApplyFixtureData(fixtureId, { silent: true });
        // 성공 시에는 fetchAndApplyFixtureData 내부의 schedulePoll(data)가 다음 폴을 예약한다.
        // 여기서 또 setTimeout을 잡으면 동일 시점에 타이머가 2개 생긴다.
        if (!data) scheduleRetryFromLastFixture();
      } catch (e) {
        console.error('Silent poll error:', e);
        // fetchAndApplyFixtureData가 내부에서 잡지 못한 예외만 여기로 온다.
        scheduleRetryFromLastFixture();
      }
    };

    // INT(중단, 재개 가능) — 5분 간격으로 재확인하다가 첫 감지로부터 30분 넘게 지속되면
    // 수동 새로고침을 안내하는 alert를 1회만 띄우고 그 뒤로는 자동 재확인을 멈춘다.
    // schedulePoll의 메인 흐름과 scheduleRetryFromLastFixture(네트워크 에러 재시도 경로)
    // 양쪽에서 같은 판단이 필요해 헬퍼로 뺐다.
    const handleIntRecheck = () => {
      if (!_intFirstDetectedAt) _intFirstDetectedAt = Date.now();
      if (Date.now() - _intFirstDetectedAt >= INT_ALERT_AFTER_MS) {
        if (!_intAlertShown) {
          _intAlertShown = true;
          alert('경기가 30분 넘게 중단(Interrupted)된 상태입니다. 경기 재개 시 수동으로 새로고침해 주세요.');
        }
        return;
      }
      _pollTimer = setTimeout(wakeAndFetch, INT_POLL_INTERVAL_MS);
    };

    if (status === 'INT') {
      handleIntRecheck();
      return;
    }

    // 4) 경기 시작 전(NS) + kickoffUtc 알면 시작 직전까지 대기
    if (status === 'NS' && kickoffUtc) {
      const kickoffMs = Date.parse(kickoffUtc);
      if (!isNaN(kickoffMs) && kickoffMs > now + PRE_KICKOFF_BUFFER_MS) {
        const waitMs = kickoffMs - now - PRE_KICKOFF_BUFFER_MS;
        _pollTimer = setTimeout(wakeAndFetch, waitMs);
        return;
      }
    }

    if (FT_LIKE_STATUSES.has(status)) {
      _pollTimer = setTimeout(wakeAndFetch, FT_POLL_INTERVAL_MS);
      return;
    }

    if (LIVE_STATUSES_POLL.has(status) || status === 'NS') {
      _pollTimer = setTimeout(wakeAndFetch, POLL_INTERVAL_MS);
    }
    // 그 외(미지의 status)는 안전하게 폴링하지 않음
  }

  /** sessionStorage + localStorage(legacy)에 저장된 fixture 캐시 모두 제거. */
  function clearCachedFixtureData() {
    try { sessionStorage.removeItem('cached_fixture_data'); } catch {}
    try { localStorage.removeItem('cached_fixture_data'); } catch {}
  }

  /**
   * 경기 ID 변경/취소 시 fixture에서 파생된 모든 state를 초기 상태로 되돌린다.
   *
   * 1) 폴링 타이머 정리 + 마지막 fetch id/스냅샷/팀컬러 override 리셋.
   * 2) 옵션에 따라 경기 캐시 + fixtureId 제거.
   * 3) 수동 모드면 패널만 비우고 종료(state는 사용자 입력 유지).
   * 4) 자동 모드면 점수/이름/하프/추가시간/PK까지 모두 default로 초기화 + 타이머 정지.
   * 5) 라인업/이벤트/스탯 패널 비우고 render+persist+상태 배지 갱신.
   */
  function resetFixtureDrivenState({ clearFixtureId = false, clearCache = false, statusMessage = '' } = {}) {
    clearPolling();
    _lastFetchId = null;
    _lastFixtureData = null;
    _flashSnapshot = null;
    state.teamColorOverride = false;
    state.teamColorOverrideFixtureId = null;

    if (clearCache) clearCachedFixtureData();
    if (clearFixtureId) setFixtureId(null);

    if (state.manualMode) {
      if (typeof applyLineupPanels === 'function') applyLineupPanels(null);
    if (typeof applyEventsPanel === 'function') applyEventsPanel(null);
    if (typeof applyStatsPanel === 'function') applyStatsPanel(null);
    if (typeof applyTacticsTimeline === 'function') applyTacticsTimeline(null);
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
    if (typeof window.pauseClockTimer === 'function') window.pauseClockTimer();
    else state.running = false;
    state.pk = { home: [], away: [] };
    state.pkScore = { home: null, away: null };
    state.pkLastExitedAt = 0;
    setMatchHalf('1');

    if (typeof applyLineupPanels === 'function') applyLineupPanels(null);
    if (typeof applyEventsPanel === 'function') applyEventsPanel(null);
    if (typeof applyStatsPanel === 'function') applyStatsPanel(null);
    if (typeof applyTacticsTimeline === 'function') applyTacticsTimeline(null);

    render();
    persist();
    setApiStatus('idle', statusMessage);
  }

  /**
   * 경기 ID로 백엔드 API 호출 → FixtureResponseDto를 state + 패널에 일괄 적용.
   *
   * 처리 단계:
   * 1) 입력 정규화 — 빈 ID면 reset 후 종료. 수동 모드면 적용 건너뜀.
   * 2) silent 옵션 분기 — 폴링용 갱신은 로딩 오버레이/배지 안 띄움.
   * 3) fetchFixture로 데이터 조회. _fetchSeq 비교로 stale 응답 폐기(같은 fixtureId로 겹쳐 호출돼도 구분됨).
   * 4) fixture 전환 감지 — 이전 ID와 다르면 팀컬러 override / PK / flash 스냅샷 리셋.
   *    같은 ID면 사용자가 켠 타이머를 보존하는 preserveRunningOnRefresh 플래그 set.
   * 5) applyFixtureToState로 state 매핑 + maybeTriggerFixtureFlash로 변경 부위 깜빡임.
   * 6) leagueId 매칭되는 템플릿이 있으면 자동 적용(silent=false일 때만 — 폴링 중 컬러 보호).
   * 7) 라인업/이벤트/스탯 패널 채움 + API 상태 배지 갱신 + schedulePoll로 다음 폴 예약.
   * 8) 캐시 영속화 — sessionStorage(데이터) + localStorage(last_fixture_id).
   *
   * 반환: 성공 시 fixture data, 실패/스킵 시 null.
   */
  async function fetchAndApplyFixtureData(fixtureId, options){
    const normalizedFixtureId = String(fixtureId || '').trim();
    if(!normalizedFixtureId){
      resetFixtureDrivenState({
        clearFixtureId: true,
        clearCache: true,
        statusMessage: '경기 선택 대기'
      });
      return null;
    }
    if(state.manualMode){ setApiStatus('idle', '수동 모드 ON — API 적용 건너뜀'); return null; }
    // silent=true (폴링 등 자동 갱신) 시 어떤 시각적 피드백도 주지 않음 — 시청자 화면 그대로.
    //   - loading 상태 : setApiStatus 호출 스킵 (배지/오버레이 둘 다 안 바뀜)
    //   - ok 상태      : 호출하되 noOverlay — 'ok' 텍스트는 그대로 유지되고 타임스탬프만 갱신
    //   - 에러         : console.error만, 배지는 직전 'ok' 상태 유지
    const silent = options && options.silent === true;
    const cacheMode = options && options.cache;
    const overlayOpts = silent ? { noOverlay: true } : undefined;
    _fetchSeq += 1;
    const requestSeq = _fetchSeq;
    _lastFetchId = normalizedFixtureId;
    if (!silent) setApiStatus('loading');
    try{
      // 수동 로드는 60초, 폴링은 10초(기본값) — Render 콜드 스타트(20~40s) 대응
      const data = await fetchFixture(normalizedFixtureId, { silent, timeoutMs: silent ? 10000 : 60000, cache: cacheMode });
      // requestSeq 비교: 같은 fixtureId로 겹쳐 호출돼도(강제 새로고침 도중 폴링 등) 더 나중에
      // 시작된 호출이 있으면 이 응답은 폐기 — _lastFetchId(fixtureId 문자열) 비교로는 같은
      // fixtureId끼리 겹친 요청을 구분할 수 없었음.
      if (requestSeq !== _fetchSeq) return null;
      if(!data){
        resetFixtureDrivenState({
          clearFixtureId: true,
          clearCache: true,
          statusMessage: '경기 데이터 없음'
        });
        return null;
      }

      const previousFixtureId = String(_lastFixtureData?.matchInfo?.fixtureId ?? '').trim();
      const previousStatus = String(_lastFixtureData?.matchInfo?.status || '');
      const newStatus = String(data?.matchInfo?.status || '');
      // FT(또는 AET/PEN)에 막 진입한 시점 — preserveRunningOnRefresh로 인해 applyFixtureToState의
      // resetRunning 가드를 건너뛰는 동안에도(같은 fixture를 silent 폴링 중) 경기가 끝났으면
      // 사용자가 켜둔 타이머를 멈춰야 한다.
      const justReachedFT = FT_LIKE_STATUSES.has(newStatus) && !FT_LIKE_STATUSES.has(previousStatus);
      const preserveRunningOnRefresh = !!silent
        && !!previousFixtureId
        && previousFixtureId === normalizedFixtureId;
      if (previousFixtureId && previousFixtureId !== normalizedFixtureId) {
        state.teamColorOverride = false;
        state.teamColorOverrideFixtureId = null;
        clearPkState();
        state.pkScore = { home: null, away: null };
        state.pkLastExitedAt = 0;
        // 다른 경기로 전환 — 깜빡임 비교용 스냅샷도 초기화 (이전 경기와 비교하면 의미 없음)
        _flashSnapshot = null;
        // HTH 패널 초기화 (Iter 7)
        if (typeof window.hthReset === 'function') window.hthReset();
        if (typeof window.lpStatReset === 'function') window.lpStatReset();
      }

      _lastFixtureData = data;
      // 자동 폴링으로 같은 경기를 다시 반영할 때는 사용자가 직접 켠 타이머를 멈추지 않는다.
      applyFixtureToState(data, { resetRunning: !preserveRunningOnRefresh });
      // FT에 막 도달했으면 위 resetRunning 가드와 무관하게 타이머를 멈춘다 — 경기가 끝났는데
      // 같은 fixture를 silent 폴링 중이라는 이유로 시계가 계속 흘러가면 안 되기 때문.
      // pauseClockTimer는 이미 멈춰있어도 안전(idempotent)하므로 중복 호출 걱정 없음.
      if (justReachedFT) {
        if (typeof window.pauseClockTimer === 'function') window.pauseClockTimer();
        else state.running = false;
      }
      // applyFixtureToState 직후의 state 값을 이전 스냅샷과 비교 → 변경된 점수/득점자 박스만 깜빡임.
      // 첫 fetch는 _flashSnapshot이 null이라 깜빡임 없이 스냅샷만 채움.
      maybeTriggerFixtureFlash();
      setFixtureId(normalizedFixtureId);
      const leagueId = extractLeagueIdFromFixtureData(data);
      if (!silent && leagueId != null && typeof window.autoApplyTemplateByLeagueId === 'function') {
        try {
          await window.autoApplyTemplateByLeagueId(leagueId);
        } catch (templateErr) {
          console.warn('Auto template apply failed:', templateErr);
        }
      }
      // 벤치/부상 패널 채우기 (lineup-render.js)
      if (typeof applyLineupPanels === 'function') applyLineupPanels(data);
      // 이벤트 타임라인 + 경기 스탯 패널 (Iter 5-2)
      // buildEffectiveFixtureData를 거쳐야 alt→canonical ID 유사도 매칭 결과(닉네임 조회의
      // 기준이 되는 playerId)가 이벤트에도 반영된다 — raw data 그대로 넘기면 alt ID가 남아
      // 닉네임/한글화가 누락된다.
      if (typeof applyEventsPanel === 'function') {
        const eventsPanelData = (typeof buildEffectiveFixtureData === 'function') ? buildEffectiveFixtureData(data) : data;
        applyEventsPanel(eventsPanelData);
      }
      // HTH 자동 전환: 이벤트가 생기면 hth → events (Iter 7)
      if (typeof window.hthAutoSwitch === 'function') window.hthAutoSwitch(data.events);
      if (typeof applyStatsPanel === 'function') applyStatsPanel(data);
      if (typeof applyTacticsTimeline === 'function') applyTacticsTimeline(data);
      // HTH는 lazy-load. 새 fixture에서 이벤트가 없을 때만 대체 메인 패널용으로 자동 조회한다.
      const hasEvents = Array.isArray(data.events) && data.events.length > 0;
      if (previousFixtureId !== normalizedFixtureId
        && !hasEvents
        && typeof window.hthShowForFixture === 'function') {
        window.hthShowForFixture(data).catch(err => console.warn('HTH fetch failed:', err));
      }

      const m = data.matchInfo || {};
      const homeName = pickMatchTeamName(m, 'home');
      const awayName = pickMatchTeamName(m, 'away');
      setApiStatus('ok', `${homeName} vs ${awayName}`, overlayOpts);

      // 다음 호출 자동 예약 (1분 간격, FT+3분 후 중단, 비정상 상태 중단, 경기 시작 전 대기)
      schedulePoll(data);

      //   sessionStorage: 경기 캐시 + 현재 표시 상태 (탭 닫으면 자동 소거)
      //   localStorage : 마지막 fixtureId만 유지 (다음 세션에서 '최근 선택값'으로 의도적 재호출용)
      try { sessionStorage.setItem('cached_fixture_data', JSON.stringify(data)); } catch {}
      try { localStorage.removeItem('cached_fixture_data'); } catch {}  // 구버전 잔여물 정리
      try { localStorage.setItem('last_fixture_id', normalizedFixtureId); } catch {}
      return data;
    }catch(e){
      console.error('API 오류:', e);
      // silent(폴링) 에러는 배지 그대로 두고 콘솔에만 — 시청자 화면 그대로 유지
      if (!silent) {
        const msg = (e && e.code) ? `${e.code}: ${e.message}` : (e?.message || '데이터 가져오기 실패');
        setApiStatus('idle', msg);
      }
      return null;
    }
  }

  /**
   * FixtureResponseDto → state 매핑.
   *
   * 1) teamColorOverride 가드 — 같은 fixture에서 사용자가 컬러 직접 수정한 적 있으면 API 컬러 보존.
   *    다른 fixture로 바뀌면 override 해제.
   * 2) 팀 이름 — 'teamName' 토글에 따라 long/short 선택.
   * 3) 점수 — homeScore/awayScore 그대로 반영 (정규+연장 합산값).
   * 4) 로고 — 'teamLogo' 토글에 따라 기본/협회 중 선택. 협회 URL 없으면 기본으로 폴백.
   * 5) 팀 컬러 — preserveTeamColors가 false인 경우만 API 값(`#` prefix 추가)을 적용.
   * 6) 하프 — mapApiStatusToHalf로 PSO만 PK 변환, 나머지는 status 그대로.
   * 7) 추가시간 — extraManualOverride가 false일 때만 API extra로 갱신.
   * 8) 페널티 슛아웃 — events에서 PK 시퀀스 재구성. 단, 새 시퀀스가 더 짧으면 기존 값 유지.
   * 9) 득점자/레드카드 — applyScorersAndCards에서 events 가공.
   * 10) 타이머 — resetRunning !== false 일 때 비-진행 status면 정지.
   *     (silent 폴링 + 같은 fixture 케이스에선 호출자가 false로 끔.)
   */
  function applyFixtureToState(data, options){
    const m = data?.matchInfo || {};
    const fixtureId = String(m.fixtureId ?? '').trim();
    const preserveTeamColors = !!state.teamColorOverride
      && !!fixtureId
      && state.teamColorOverrideFixtureId === fixtureId;

    if (!preserveTeamColors && state.teamColorOverrideFixtureId && state.teamColorOverrideFixtureId !== fixtureId) {
      state.teamColorOverride = false;
      state.teamColorOverrideFixtureId = null;
    }

    // 팀 이름 (단축명 우선, 없으면 풀네임)
    const homeTeamName = pickMatchTeamName(m, 'home');
    const awayTeamName = pickMatchTeamName(m, 'away');
    if (homeTeamName) state.homeName = homeTeamName;
    if (awayTeamName) state.awayName = awayTeamName;

    // 점수 (정규+연장 합산값을 그대로 사용)
    if (m.homeScore != null) state.homeScore = m.homeScore;
    if (m.awayScore != null) state.awayScore = m.awayScore;

    // 로고 — 설정의 teamLogo('logo'|'fa')에 따라 기본 로고/협회 로고 중 선택. 협회 URL 없으면 기본으로 자동 폴백.
    if ('homeTeamLogo' in m || 'homeTeamFaUrl' in m) state.homeLogo = resolveTeamLogoUrl(m, 'home');
    if ('awayTeamLogo' in m || 'awayTeamFaUrl' in m) state.awayLogo = resolveTeamLogoUrl(m, 'away');

    // 팀 컬러 (Hex, '#' 없음 → 붙여서 저장). 사용자 override가 있으면 건너뜀.
    state.colors = state.colors || {};
    if (!preserveTeamColors && m.homePrimaryColor) state.colors.homeBg   = '#' + m.homePrimaryColor;
    if (!preserveTeamColors && m.homeNumberColor)  state.colors.homeText = '#' + m.homeNumberColor;
    if (!preserveTeamColors && m.awayPrimaryColor) state.colors.awayBg   = '#' + m.awayPrimaryColor;
    if (!preserveTeamColors && m.awayNumberColor)  state.colors.awayText = '#' + m.awayNumberColor;

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
    state.pkScore = state.pkScore || { home: null, away: null };
    if (m.homePenaltyScore != null || m.awayPenaltyScore != null) {
      state.pkScore.home = normalizePenaltyScore(m.homePenaltyScore);
      state.pkScore.away = normalizePenaltyScore(m.awayPenaltyScore);

      const nextPkHome = buildPkArray(data.events || [], 'home');
      const nextPkAway = buildPkArray(data.events || [], 'away');
      const nextPkCount = nextPkHome.length + nextPkAway.length;
      const currentPkCount = (state.pk.home?.length || 0) + (state.pk.away?.length || 0);

      // API가 PK 이벤트를 생략하거나 더 짧게 보내도, 이미 확보한 시퀀스는 유지한다.
      if (nextPkCount > 0 && nextPkCount >= currentPkCount) {
        state.pk.home = nextPkHome;
        state.pk.away = nextPkAway;
      }
    } else {
      state.pkScore.home = null;
      state.pkScore.away = null;
      clearPkState();
    }

    // 득점자/레드카드 (events 가공)
    applyScorersAndCards(data);

    // 타이머: 비-진행 상태(HT/FT/NS 등)면 정지.
    //   단, 단순 재적용(예: settings 토글 변경)에서는 사용자가 수동으로 시작한 타이머를
    //   덮어쓰지 않도록 호출자가 options.resetRunning=false로 끌 수 있음.
    if (options?.resetRunning !== false) {
      const LIVE_STATUSES = new Set(['1H','2H','ET1','ET2','PSO']);
      if (m.status && !LIVE_STATUSES.has(String(m.status))) {
        if (typeof window.pauseClockTimer === 'function') window.pauseClockTimer();
        else state.running = false;
      }
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

  // ── 득점자 텍스트 빌드 헬퍼 ──────────────────────────────────────────
  // buildScorers는 같은 선수가 여러 골을 넣었을 때 한 줄로 묶어준다.
  // 예) "24', 56' 흐비차 크바라츠헬리아", "45' (PK), 58' 우스만 뎀벨레"
  // 그룹화 기준은 playerId 우선, 없으면 정규화된 이름, 그것도 없으면 이벤트 인덱스.

  /**
   * 득점자 그룹화 키. 같은 선수의 다중 득점을 한 줄로 묶기 위해 사용.
   * playerId(가장 안정) > 정규화 이름 > 인덱스(unique fallback).
   */
  function buildScorerGroupKey(event, fallbackIndex) {
    // playerId=0은 "미해결 선수"를 뜻하는 플레이스홀더 — 동명이인 아닌 서로 다른
    // 선수가 전부 pid:0으로 묶여 득점이 합쳐지므로 이름/인덱스 fallback으로 넘긴다.
    if (event?.playerId != null && String(event.playerId).trim() !== '' && Number(event.playerId) !== 0) {
      return `pid:${String(event.playerId).trim()}`;
    }

    const stableName = String(
      event?.playerNameKoLong
      || event?.playerName
      || event?.nameKoLong
      || event?.name
      || ''
    ).trim().toLowerCase();
    if (stableName) return `name:${stableName}`;

    return `event:${fallbackIndex}`;
  }

  /** 이벤트 시각 포맷 — "45'" 또는 "45+1'". */
  function formatEventMinute(event) {
    const elapsed = event?.elapsed ?? 0;
    const extra = Number(event?.extra ?? 0);
    return extra ? `${elapsed}+${extra}'` : `${elapsed}'`;
  }

  function eventSortKey(event) {
    const elapsed = Number(event?.elapsed ?? 0);
    const extra = Number(event?.extra ?? 0);
    return (elapsed * 100) + extra;
  }

  function isFixtureEventType(event, type) {
    return String(event?.type || '').toLowerCase() === String(type).toLowerCase();
  }

  function isFixtureEventDetail(event, detail) {
    return String(event?.detail || '').toLowerCase() === String(detail).toLowerCase();
  }

  function isPenaltyShootoutEvent(event) {
    return String(event?.comments || '').toLowerCase() === 'penalty shootout';
  }

  /**
   * 골 시각 포맷 — detail 따라 (OG)/(PK) 접미.
   * 일반골은 시간만, OG/PK는 시간 뒤 괄호 표기.
   */
  function formatScorerMinute(event) {
    const min = formatEventMinute(event);
    if (isFixtureEventDetail(event, 'Own Goal')) return `${min} (OG)`;
    if (isFixtureEventDetail(event, 'Penalty')) return `${min} (PK)`;
    return min;
  }

  /** 표시명 sanitize — 공백/null/undefined/하이픈 단독은 fallback으로 대체. */
  function normalizeScorerDisplayName(value, fallback = '') {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || /^(null|undefined|-)$/i.test(trimmed)) return fallback;
    return trimmed;
  }

  function getEventPlayerDisplayName(event, fallback = '') {
    const rawName = (typeof pickName === 'function') ? pickName(event, 'scorer') : (event?.playerName || '');
    return normalizeScorerDisplayName(rawName, fallback);
  }

  function buildTaggedPlayerLine(event, label) {
    const name = getEventPlayerDisplayName(event);
    return `${formatEventMinute(event)} (${label}) ${name}`.trim();
  }

  function isNoteEventEnabled(category) {
    return typeof getSetting !== 'function' || getSetting(category) !== 'off';
  }

  /**
   * 한 팀(side)의 득점자/PK 실축/퇴장 텍스트를 \n 구분 문자열로 빌드.
   * 1) PSO 제외 후, 골은 같은 선수끼리 한 줄로 묶는다.
   * 2) PK 실축과 퇴장은 개별 줄로 추가한다.
   * 3) 각 줄을 첫 이벤트 시각 기준으로 정렬한다.
   */
  function buildScorers(events, side){
    const scorerEvents = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) =>
        event.side === side &&
        isFixtureEventType(event, 'Goal') &&
        !isPenaltyShootoutEvent(event) &&
        !isFixtureEventDetail(event, 'Missed Penalty'));
    const groups = [];
    const groupMap = new Map();

    scorerEvents.forEach(({ event, index }) => {
      const key = buildScorerGroupKey(event, index);
      let group = groupMap.get(key);
      if (!group) {
        // pickName은 settings-popup.js의 헬퍼 — playerName/playerNameKoLong 양쪽 지원
        group = {
          name: getEventPlayerDisplayName(event, '득점'),
          minutes: [],
          sortKey: eventSortKey(event),
          order: index,
        };
        groupMap.set(key, group);
        groups.push(group);
      }

      group.minutes.push(formatScorerMinute(event));
    });

    const entries = groups.map(group => ({
      text: `${group.minutes.join(', ')} ${group.name}`.trim(),
      sortKey: group.sortKey,
      order: group.order,
    }));
    const showPenaltyMisses = isNoteEventEnabled('noteShowPenaltyMisses');
    const showRedCards = isNoteEventEnabled('noteShowRedCards');

    events.forEach((event, index) => {
      if (event.side !== side || isPenaltyShootoutEvent(event)) return;

      if (showPenaltyMisses && isFixtureEventType(event, 'Goal') && isFixtureEventDetail(event, 'Missed Penalty')) {
        entries.push({
          text: buildTaggedPlayerLine(event, 'PK 실축'),
          sortKey: eventSortKey(event),
          order: index,
        });
        return;
      }

      if (
        showRedCards &&
        isFixtureEventType(event, 'Card') &&
        (isFixtureEventDetail(event, 'Red Card') || isFixtureEventDetail(event, 'Second Yellow Card'))
      ) {
        entries.push({
          text: buildTaggedPlayerLine(event, '퇴장'),
          sortKey: eventSortKey(event),
          order: index,
        });
      }
    });

    return entries
      .sort((a, b) => (a.sortKey - b.sortKey) || (a.order - b.order))
      .map(entry => entry.text)
      .join('\n');
  }

  /** Red Card + Second Yellow Card 합산 */
  function countRedCards(events, side){
    return events.filter(e =>
      e.side === side &&
      isFixtureEventType(e, 'Card') &&
      (isFixtureEventDetail(e, 'Red Card') || isFixtureEventDetail(e, 'Second Yellow Card'))
    ).length;
  }

  /** PSO 이벤트 → 'G'/'M' 배열 (일반 'Penalty'=득점, 'Missed Penalty'=실패) */
  function buildPkArray(events, side){
    return events
      .filter(e => e.type === 'Goal' && e.comments === 'Penalty Shootout' && e.side === side)
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

  // 토글 변경 시 fixture를 다시 적용 — scorer/teamName(이름 표기), teamLogo(기본/협회 로고).
  // 사용자가 수동으로 켠 타이머는 보존(resetRunning: false). 팀 컬러 보존은 state.teamColorOverride
  // 플래그가 처리하므로 별도 옵션 불필요.
  document.addEventListener('settings:change', e => {
    const category = e.detail?.category;
    if (
      category !== 'scorer' &&
      category !== 'teamName' &&
      category !== 'teamLogo' &&
      category !== 'noteShowPenaltyMisses' &&
      category !== 'noteShowRedCards'
    ) return;
    if (!_lastFixtureData) return;
    applyFixtureToState(_lastFixtureData, { resetRunning: false });
  });

  /**
   * DOMContentLoaded 시 같은 탭 내 새로고침 캐시 복원 — API 호출 없이 즉시 표시.
   *
   * 1) 수동 모드면 즉시 종료.
   * 2) sessionStorage 우선, 없으면 localStorage(legacy)에서 raw 읽고 sessionStorage로 마이그레이션.
   * 3) 캐시가 비었거나 손상되면 reset 후 종료.
   * 4) requestAnimationFrame 다음 사이클에서 applyFixtureToState 적용 — init.js의 첫 render 후 실행돼
   *    layout 안정화된 상태에서 라인업/스탯 패널까지 채움. restore된 timer가 running이면 보존.
   * 5) flash 스냅샷을 캐시 값으로 초기화 — 이후 폴링 응답에서 변화한 부분만 깜빡이도록.
   * 6) schedulePoll로 폴링 시작 — 캐시가 stale일 가능성 대비.
   *
   * 탭/브라우저를 완전히 닫고 다시 열면 sessionStorage가 비어있어 빈 화면으로 시작한다.
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
          statusMessage: '경기 선택 대기'
        });
        return;
      }
      const data = JSON.parse(raw);
      if (!data || !data.matchInfo) {
        resetFixtureDrivenState({
          clearFixtureId: true,
          clearCache: true,
          statusMessage: '경기 선택 대기'
        });
        return;
      }
      _lastFixtureData = data;
      // init.js의 첫 render() 다음 사이클에서 적용 — 레이아웃 안정화 후
      requestAnimationFrame(() => {
        // restore()가 이미 running 타이머를 복원했으면, 캐시 재적용으로 다시 멈추지 않는다.
        applyFixtureToState(data, { resetRunning: !state.running });
        // 캐시 복원 직후 깜빡임 스냅샷 초기화 — 다음 폴링 응답이 캐시 대비 점수/득점자 변화가
        // 있으면 자연스럽게 깜빡임이 발동되도록. 복원 자체로는 깜빡임 발동 안 함 (값 동일).
        _flashSnapshot = {
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          homeNote: state.notes?.home ?? '',
          awayNote: state.notes?.away ?? '',
        };
        const fixtureId = String(data?.matchInfo?.fixtureId ?? '').trim();
        if (fixtureId) {
          setFixtureId(fixtureId);
          _lastFetchId = fixtureId; // 폴링 콜백의 _lastFetchId 비교용
        }
        if (typeof applyLineupPanels === 'function') applyLineupPanels(data);
        if (typeof applyEventsPanel === 'function') {
          const eventsPanelData = (typeof buildEffectiveFixtureData === 'function') ? buildEffectiveFixtureData(data) : data;
          applyEventsPanel(eventsPanelData);
        }
        if (typeof window.hthAutoSwitch === 'function') window.hthAutoSwitch(data.events);
        if (typeof applyStatsPanel === 'function') applyStatsPanel(data);
        if (typeof applyTacticsTimeline === 'function') applyTacticsTimeline(data);
        // 캐시 복원에서도 events가 없을 때만 HTH를 대체 메인 패널로 lazy-load한다.
        if ((!Array.isArray(data.events) || data.events.length === 0)
          && typeof window.hthShowForFixture === 'function') {
          window.hthShowForFixture(data).catch(() => {});
        }
        const m = data.matchInfo;
        const homeName = pickMatchTeamName(m, 'home');
        const awayName = pickMatchTeamName(m, 'away');
        setApiStatus('ok', `${homeName} vs ${awayName} (캐시)`);
        // 캐시 복원 후에도 폴링 시작 (stale 방지)
        schedulePoll(data);
      });
    } catch {}
  });

  /**
   * 마지막으로 로드된 fixture 데이터의 ID를 반환.
   * theme.js 등에서 _lastFixtureData 직접 접근 불가하므로 이 getter 사용.
   */
  function getLastFixtureId() {
    const fixtureId = String(_lastFixtureData?.matchInfo?.fixtureId ?? '').trim();
    return fixtureId || null;
  }

  /**
   * 강제 새로고침 — 탭 비활성화로 setTimeout 폴링 체인이 지연될 때, 사용자가 즉시 1회 재조회.
   * 캠 큼(.lp-stat-refresh-btn)/캠 작음(.lp-bench-refresh-btn) 두 버튼이 같은 쿨다운을 공유.
   * 클릭 시 5초간 비활성화 + 아이콘 대신 카운트다운 숫자(5→1) 표시.
   */
  const FORCE_REFRESH_COOLDOWN_SEC = 5;
  const FORCE_REFRESH_ICON_HTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7A5 5 0 1 1 10.4 3.4"/><path d="M12 2.2v3.6H8.4"/></svg>';
  let _forceRefreshCooldownTimer = null;
  // 현재 쿨다운 남은 초(null=쉬는 중) — 교체 명단 버튼은 fixture 갱신마다 setPanelTitle()이 DOM을 새로 그려
  // 쿨다운 도중 새 버튼 노드로 교체되면 idle 모양으로 보였다가 다음 tick에야 따라잡던 문제가 있어,
  // 새로 그려진 직후 lineup-render.js가 syncForceRefreshButtons()를 호출해 즉시 현재 상태를 재적용한다.
  let _forceRefreshSecondsLeft = null;

  function updateForceRefreshButtons(secondsLeft) {
    _forceRefreshSecondsLeft = secondsLeft;
    document.querySelectorAll('.lp-force-refresh-btn').forEach(btn => {
      if (secondsLeft == null) {
        btn.disabled = false;
        btn.classList.remove('is-cooldown');
        btn.innerHTML = `${FORCE_REFRESH_ICON_HTML}<span class="lp-force-refresh-label">새로고침</span>`;
        btn.title = '새로고침';
      } else {
        btn.disabled = true;
        btn.classList.add('is-cooldown');
        // "진행중" 단어는 lp-stat-refresh-btn(캠 큼)에서 CSS로 숨겨 숫자만 보이게 한다.
        btn.innerHTML = `${FORCE_REFRESH_ICON_HTML}<span class="lp-force-refresh-label">진행중</span><span class="lp-force-refresh-count">${secondsLeft}</span>`;
        btn.title = `새로고침 진행중 (${secondsLeft})`;
      }
    });
  }

  function syncForceRefreshButtons() {
    updateForceRefreshButtons(_forceRefreshSecondsLeft);
  }

  function forceRefreshCurrentFixture() {
    if (_forceRefreshCooldownTimer) return;
    if (state.manualMode || !currentFixtureId) {
      showToast('연동된 경기가 없습니다');
      return;
    }
    let secondsLeft = FORCE_REFRESH_COOLDOWN_SEC;
    updateForceRefreshButtons(secondsLeft);
    _forceRefreshCooldownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(_forceRefreshCooldownTimer);
        _forceRefreshCooldownTimer = null;
        updateForceRefreshButtons(null);
      } else {
        updateForceRefreshButtons(secondsLeft);
      }
    }, 1000);
    fetchAndApplyFixtureData(currentFixtureId, { silent: true, cache: 'reload' })
      .catch(err => console.error('Force refresh failed:', err));
  }

  // 교체 명단(.lp-bench-refresh-btn)은 fixture 갱신마다 setPanelTitle()이 새로 그려 DOM 노드가 교체되므로
  // 위임 방식으로 바인딩 — 캠 큼(.lp-stat-refresh-btn)은 정적 마크업이라 상관없이 동작.
  document.addEventListener('click', e => {
    if (e.target.closest('.lp-force-refresh-btn')) forceRefreshCurrentFixture();
  });

  window.syncForceRefreshButtons = syncForceRefreshButtons;

  window.forceRefreshCurrentFixture = forceRefreshCurrentFixture;

