  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [탭/페이지 전환] 탭바 숨기기(H키)와 탭 클릭·단축키 페이지 전환
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // --- schedule 탭 위젯 API 호출 차단 (비활성 시 쿼터 낭비 방지) ---
  // 위젯은 DOM 제거 후 재삽입 시 재초기화가 안 되므로, DOM은 유지하되
  // 비활성 탭에서의 fetch 호출을 가로채 폴링을 실질적으로 중단시킨다.
  // 차단 중에도 "results":0 빈 응답을 주면 위젯이 화면을 비워버리고, 복귀해도 자체
  // 새로고침 주기(data-refresh)까지 빈 상태로 멈춰있어 사용자가 직접 새로고침해야 했음.
  // → 차단 직전 마지막으로 받은 정상 응답을 URL별로 캐싱해두고, 차단 중엔 그 캐시를
  // 그대로 돌려줘 위젯이 "마지막으로 본 화면"을 계속 보여주게 한다. 탭 복귀 후엔 위젯의
  // 다음 자체 폴링이 차단 없이 통과해 자연스럽게 최신 데이터로 갱신됨 — 수동 새로고침 불필요.
  const _WIDGET_API_HOST = 'obs-scoreline-overlay.b-cdn.net';
  const WIDGET_STALE_RELOAD_MS = 5 * 60 * 1000; // 이 시간 이상 차단됐다가 돌아오면 위젯이 내부적으로 망가져있을 수 있어 새로고침
  let _widgetBlocked = false;
  let _widgetBlockedAt = 0; // 차단 시작 시각(ms) — 일정확인 탭 복귀 시 얼마나 오래 비웠는지 판단용
  const _widgetLastGoodResponse = new Map(); // url -> 마지막 정상 응답 body(text)

  (function () {
    const _origFetch = window.fetch.bind(window);
    window.fetch = function (resource, init) {
      const url = resource instanceof Request ? resource.url : String(resource);
      const isWidgetCall = url.includes(_WIDGET_API_HOST);

      if (_widgetBlocked && isWidgetCall) {
        const cachedBody = _widgetLastGoodResponse.get(url) || '{"results":0,"response":[]}';
        return Promise.resolve(new Response(cachedBody, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      const promise = _origFetch(resource, init);
      if (isWidgetCall) {
        promise.then(res => {
          if (res.ok) res.clone().text().then(text => { if (text) _widgetLastGoodResponse.set(url, text); }).catch(() => {});
        }).catch(() => {});
      }
      return promise;
    };
  })();

  // --- schedule 탭 위젯 lazy mount (첫 방문 시 한 번만 삽입, 이후 유지) ---
  let _scheduleWidgetMounted = false;

  function _scheduleWidgetMount() {
    if (_scheduleWidgetMounted) return;
    _scheduleWidgetMounted = true;

    const leaguesBody = document.getElementById('widget-leagues-body');
    if (leaguesBody) {
      const w = document.createElement('api-sports-widget');
      w.setAttribute('data-type', 'leagues');
      leaguesBody.appendChild(w);
    }

    const gamesList = document.getElementById('games-list');
    if (gamesList) {
      const w = document.createElement('api-sports-widget');
      w.setAttribute('data-type', 'games');
      gamesList.appendChild(w);
    }

    const standingsContent = document.getElementById('standings-content');
    if (standingsContent) {
      const w = document.createElement('api-sports-widget');
      w.setAttribute('data-type', 'standings');
      standingsContent.appendChild(w);
    }
  }
  const tabsEl = document.getElementById('tabsBar');
  const pagesEl = document.querySelector('.pages');
  let tabsHidden = false;

  /** H키로 탭바와 페이지 영역을 한 번에 숨기거나 다시 표시 */
  function toggleTabsAndPages(){
    tabsHidden = !tabsHidden;
    tabsEl.style.display = tabsHidden ? 'none' : '';
    const btn = document.getElementById('btn-toggle-tabs');
    if (btn) btn.textContent = tabsHidden ? '탭 보이기 (H)' : '탭 숨기기 (H)';
  }

  /** 해당 page id의 탭 버튼을 활성화하고 해당 페이지 콘텐츠만 표시 */
  const tabButtons = document.querySelectorAll('.tab');
  const manualToggleTabbar = $('manual-toggle-tabbar');
  const PAGE_TO_ROUTE = Object.freeze({
    'main-big': '/',
    'main-small': '/detail',
    'theme': '/theme',
    'schedule': '/schedule',
    'tactics': '/tactics',
    'about': '/about',
  });
  const ROUTE_TO_PAGE = Object.freeze(Object.fromEntries(
    Object.entries(PAGE_TO_ROUTE).map(([page, route]) => [route, page])
  ));
  // 로컬 개발 환경(127.0.0.1, localhost)이나 file:// 프로토콜은 path-based 라우팅을 못 쓰므로 hash 모드로 fallback.
  // 배포 환경(http(s) + 외부 호스트)에서만 깔끔한 path-based 라우팅 사용.
  const LOCAL_ROUTE_HOSTS = new Set(['127.0.0.1', 'localhost']);
  const ROUTING_MODE = ((window.location.protocol === 'http:' || window.location.protocol === 'https:')
    && !LOCAL_ROUTE_HOSTS.has(window.location.hostname))
    ? 'path'
    : 'hash';

  /**
   * 경로 문자열 정규화 — 라우팅 비교용 단일 키 형식.
   * 1) 빈/falsy → "/".
   * 2) 앞에 "/" 자동 부착, 끝의 "/" 제거.
   * 3) 소문자화.
   * 4) HTML 진입 경로(index.html, overlay_dashboard_*)는 모두 "/"로 매핑.
   */
  function normalizeRoutePath(pathname){
    let path = String(pathname || '/').trim() || '/';
    if(!path.startsWith('/')) path = `/${path}`;
    path = path.replace(/\/+$/, '') || '/';
    path = path.toLowerCase();
    if(path === '/index.html'
      || path === '/overlay_dashboard' || path === '/overlay_dashboard.html'
      || path === '/overlay_dashboard_five_cols' || path === '/overlay_dashboard_five_cols.html'){
      return '/';
    }
    return path;
  }

  /** 현재 라우팅 모드(path/hash)에 맞춰 active route 정규화 후 반환. */
  function getActiveRoutePath(){
    if(ROUTING_MODE === 'hash'){
      return normalizeRoutePath((window.location.hash || '').replace(/^#/, '') || '/');
    }
    return normalizeRoutePath(window.location.pathname);
  }

  /** path → page id 매핑. 알 수 없는 path면 'main-big' 기본 반환. */
  function resolvePageFromPath(pathname = null){
    if(pathname != null) return ROUTE_TO_PAGE[normalizeRoutePath(pathname)] || 'main-big';
    return ROUTE_TO_PAGE[getActiveRoutePath()] || 'main-big';
  }

  /**
   * page id에 맞는 URL로 history 동기화.
   * 1) 매핑 없는 page → '/'.
   * 2) 이미 같은 route면 no-op.
   * 3) historyMode가 'replace'면 replaceState, 'push'면 pushState 사용.
   * 4) hash 모드에선 pathname+search를 base로 두고 # 뒤 route만 변경.
   */
  function syncRouteForPage(page, historyMode = 'push'){
    const route = PAGE_TO_ROUTE[page] || '/';
    if(getActiveRoutePath() === route) return;
    const fn = historyMode === 'replace' ? 'replaceState' : 'pushState';
    if(ROUTING_MODE === 'hash'){
      const base = `${window.location.pathname}${window.location.search}`;
      const nextUrl = route === '/' ? base : `${base}#${route}`;
      window.history[fn]({ page }, '', nextUrl);
      return;
    }
    window.history[fn]({ page }, '', route);
  }

  /**
   * 페이지 활성화 단일 진입점.
   * 1) 매핑 없는 page는 'main-big'으로 폴백.
   * 2) 탭 버튼 active 상태 + .page 콘텐츠 visibility 갱신.
   * 3) tactics-active body 클래스 토글(전술판 전용 글로벌 CSS).
   * 4) 테마 탭에서만 수동 모드 토글 표시.
   * 5) syncRoute=true(default)면 history 갱신.
   * 6) 'page:activated' 이벤트 dispatch — events/stats 패널 등이 받아 재렌더.
   */
  function activatePage(page, options = {}){
    const nextPage = PAGE_TO_ROUTE[page] ? page : 'main-big';
    const { syncRoute = true, historyMode = 'push' } = options;
    if (nextPage === 'schedule') {
      // 5분 넘게 차단돼있다가 돌아온 거면, 위젯이 그 사이 내부적으로 맛이 가있을 수 있어
      // fetch 트릭 대신 그냥 새로고침으로 깔끔하게 재초기화한다. 새로고침 전에 URL을
      // /schedule로 먼저 동기화해둬야 새로고침 후에도 같은 탭으로 돌아온다.
      if (_widgetBlocked && _widgetBlockedAt && (Date.now() - _widgetBlockedAt) > WIDGET_STALE_RELOAD_MS) {
        if (syncRoute) syncRouteForPage(nextPage, historyMode);
        window.location.reload();
        return;
      }
      _widgetBlocked = false;
      _scheduleWidgetMount();
    } else {
      // 이미 차단 상태면 타임스탬프를 건드리지 않는다 — 비-일정 탭 사이를 여러 번 옮겨다녀도
      // "차단이 시작된 시각"이 매번 갱신되면 5분 경과 판정이 절대 누적되지 않는 문제가 있었음.
      if (!_widgetBlocked) _widgetBlockedAt = Date.now();
      _widgetBlocked = true;
    }
    tabButtons.forEach(b=>b.classList.toggle('active', b.dataset.page===nextPage));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    const el2=document.getElementById(`page-${nextPage}`);
    if(el2) el2.classList.add('active');
    document.body.classList.toggle('tactics-active', nextPage === 'tactics');
    // 테마 탭일 때만 수동 모드 토글 표시
    if(manualToggleTabbar) manualToggleTabbar.style.display = nextPage==='theme' ? 'flex' : 'none';
    if(syncRoute) syncRouteForPage(nextPage, historyMode);
    document.dispatchEvent(new CustomEvent('page:activated', { detail: { page: nextPage } }));
  }
  // 외부에서 페이지 전환 가능하도록 노출 (fixture.js의 메인 표시 버튼 등에서 사용)
  window.activatePage = activatePage;

  // [이벤트 등록] 탭 버튼 클릭으로 페이지 전환.
  // 클릭 후 버튼 blur — 활성 버튼이 포커스를 잡고 있으면 이후 사용자가 누르는 Space가
  // 버튼의 native click 트리거에도 걸려 토글이 꼬이는 문제 방지 (또한 timer space 단축키 정상 동작)
  tabButtons.forEach(btn=>btn.addEventListener('click', ()=>{ activatePage(btn.dataset.page); btn.blur(); }));
  window.addEventListener('popstate', ()=>activatePage(resolvePageFromPath(), { syncRoute: false }));
  if(ROUTING_MODE === 'hash'){
    window.addEventListener('hashchange', ()=>activatePage(resolvePageFromPath(), { syncRoute: false }));
  }
  activatePage(resolvePageFromPath(), { historyMode: 'replace' });
