  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [API / 경기 ID 연동] API-Sports 위젯에서 경기 ID를 추출하고 스코어보드에 반영
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const selectedEl = $('selected-fixture-id');
  const statusEl = $('fixture-status');
  const fixtureInlineWrap = $('fixture-inline-wrap');
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
    if (selectedEl) selectedEl.textContent = currentFixtureId ?? '-';
    if (fixtureInlineWrap) fixtureInlineWrap.style.display = currentFixtureId ? '' : 'none';
    if (currentFixtureId) localStorage.setItem('last_fixture_id', currentFixtureId);
  }
  /** 경기 상태 텍스트를 statusEl에 표시 */
  function setStatus(msg){ if(!statusEl) return; statusEl.textContent=msg?`(${msg})`:''; }
  /** 컨테이너 엘리먼트에서 api-sports-widget의 data-game-id 속성을 읽어 반환 */
  function readFixtureIdFromTarget(targetEl){ const w=targetEl.querySelector('api-sports-widget[data-type="game"]'); if(w){ const id=w.getAttribute('data-game-id'); if(id) return id; } return null; }

  // [이벤트 등록] 경기 ID 텍스트 클릭 → 클립보드 복사 + 토스트 알림
  if (selectedEl) {
    selectedEl.addEventListener('click', async () => {
      if (!currentFixtureId) return;
      try {
        await navigator.clipboard.writeText(currentFixtureId);
        showToast('복사되었습니다!');
      } catch {
        showToast('복사 실패 (브라우저 권한 확인)');
      }
    });
  }


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
      // Shadow DOM
      if (widget.shadowRoot) injectCSS(widget.shadowRoot);
      // iframe
      const iframe = widget.querySelector('iframe') || widget.shadowRoot?.querySelector('iframe');
      if (iframe) {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc?.head) injectCSS(doc);
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
    if(!id) return;
    fetchAndApplyFixtureData(id);
  }

  // [이벤트 등록] 경기 ID 입력 패널 버튼 (조회/최근값 불러오기/비우기)
  if(mainShowBtn)    mainShowBtn.addEventListener('click', ()=>{ renderMainGame(mainInput?.value); closeOverlay(); });
  if(mainUseLastBtn) mainUseLastBtn.addEventListener('click', ()=>{ const last=localStorage.getItem('last_fixture_id'); if(!last) return; if(mainInput) mainInput.value=last; mainInput.focus(); });
  if(mainClearBtn)   mainClearBtn.addEventListener('click', ()=>{ if(mainInput){ mainInput.value=''; mainInput.focus(); } });

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

  /** API 상태 표시 배지 업데이트 (ok/loading/idle 상태에 따라 dot 색상과 텍스트 변경) */
  const API_BASE = '/api'; // 가상 엔드포인트 (추후 Render URL로 교체)

  function setApiStatus(status, msg){
    const dot=$('apiDot'), text=$('apiStatus');
    if(!dot||!text) return;
    dot.className='dot';
    if(status==='ok'){ dot.classList.add('ok'); text.textContent=msg||'데이터 수신 완료'; }
    else if(status==='loading'){ dot.classList.add('loading'); text.textContent=msg||'가져오는 중...'; }
    else { dot.classList.add('idle'); text.textContent=msg||'대기 중'; }
    const ts=$('apiLastFetched');
    if(ts&&status==='ok') ts.textContent=`(${new Date().toLocaleTimeString('ko-KR')})`;
  }

  /**
   * 경기 ID로 API 데이터를 가져와 state에 적용하고 스코어보드를 갱신.
   * 현재는 stub 데이터를 사용하며, 백엔드 배포 시 실제 fetch URL로 교체 필요.
   */
  async function fetchAndApplyFixtureData(fixtureId){
    if(!fixtureId) return;
    if(state.manualMode){ setApiStatus('idle', '수동 모드 ON — API 적용 건너뜀'); return; }
    // 1. 로딩 상태 표시
    setApiStatus('loading');
    try{
      // ── 실제 배포 시 아래 URL을 사용: ──
      // const res = await fetch(`https://your-backend.onrender.com/api/fixture/${fixtureId}`);
      // const data = await res.json();
      //
      // ── 현재는 stub 데이터로 대체 ──
      await new Promise(r=>setTimeout(r,600)); // 네트워크 딜레이 시뮬레이션
      const data = await stubFetchFixture(fixtureId);

      // 2. API 응답 데이터로 state 업데이트
      if(data.homeTeam)       state.homeName   = data.homeTeam;
      if(data.awayTeam)       state.awayName   = data.awayTeam;
      if(data.homeScore != null) state.homeScore = data.homeScore;
      if(data.awayScore != null) state.awayScore = data.awayScore;
      if(data.homeScorers != null) state.notes.home = data.homeScorers;
      if(data.awayScorers != null) state.notes.away = data.awayScorers;
      if(data.homeRedCards != null) state.redHome = data.homeRedCards;
      if(data.awayRedCards != null) state.redAway = data.awayRedCards;
      if('homeLogo' in data) state.homeLogo = data.homeLogo || '';
      if('awayLogo' in data) state.awayLogo = data.awayLogo || '';
      if(data.half)           setMatchHalf(data.half);

      // 타이머 자동 정지: 경기 중 상태(1H/2H/ET1/ET2/PSO)가 아닌 경우(HT·FT·BT·NS 등) 타이머를 멈춤
      // API 응답값(1H, 2H, PSO)과 내부 halfOrder값(1, 2, PK) 모두 커버
      const PLAYING_HALVES = new Set(['1','1H','2','2H','ET1','ET2','PK','PSO']);
      if(data.half && !PLAYING_HALVES.has(data.half)){
        state.running = false;
      }

      // 자동 모드에서는 API extra 값을 그대로 반영한다. null이면 숨김 처리.
      state.extra = Math.max(0, Number(data.extra) || 0);
      state.extraShown = data.extra != null && state.extra > 0;

      render(); persist();
      setApiStatus('ok', `${data.homeTeam} vs ${data.awayTeam}`);
    }catch(e){
      console.error('API 오류:', e);
      setApiStatus('idle', '데이터 없음 (stub)');
    }
  }

  /**
   * 백엔드 미배포 상태의 stub 데이터 함수 — 실제 배포 시 fetch로 교체.
   * API Football /v3/fixtures?id=:fixtureId 응답을 파싱한 구조와 동일한 형태 반환.
   */
  async function stubFetchFixture(fixtureId){
    const stubs = {
      '1521155': { homeTeam:'Arsenal', awayTeam:'Chelsea', homeScore:2, awayScore:1, homeScorers:"23' Saka\n67' Martinelli", awayScorers:"45+1' Palmer", homeRedCards:0, awayRedCards:1, half:'2', homeLogo:'', awayLogo:'' },
      '1234567': { homeTeam:'Manchester City', awayTeam:'Liverpool', homeScore:1, awayScore:1, homeScorers:"55' Haaland", awayScorers:"30' Salah", homeRedCards:0, awayRedCards:0, half:'2', homeLogo:'', awayLogo:'' },
    };
    return stubs[fixtureId] ?? { homeTeam:`HOME (${fixtureId})`, awayTeam:`AWAY (${fixtureId})`, homeScore:0, awayScore:0, homeScorers:'', awayScorers:'', homeRedCards:0, awayRedCards:0, half:'1', homeLogo:'', awayLogo:'' };
  }

