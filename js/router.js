  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [탭/페이지 전환] 탭바 숨기기(H키)와 탭 클릭·단축키 페이지 전환
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
  const LOCAL_ROUTE_HOSTS = new Set(['127.0.0.1', 'localhost']);
  const ROUTING_MODE = ((window.location.protocol === 'http:' || window.location.protocol === 'https:')
    && !LOCAL_ROUTE_HOSTS.has(window.location.hostname))
    ? 'path'
    : 'hash';
  function normalizeRoutePath(pathname){
    let path = String(pathname || '/').trim() || '/';
    if(!path.startsWith('/')) path = `/${path}`;
    path = path.replace(/\/+$/, '') || '/';
    path = path.toLowerCase();
    if(path === '/index.html' || path === '/overlay_dashboard_five_cols' || path === '/overlay_dashboard_five_cols.html'){
      return '/';
    }
    return path;
  }

  function getActiveRoutePath(){
    if(ROUTING_MODE === 'hash'){
      return normalizeRoutePath((window.location.hash || '').replace(/^#/, '') || '/');
    }
    return normalizeRoutePath(window.location.pathname);
  }

  function resolvePageFromPath(pathname = null){
    if(pathname != null) return ROUTE_TO_PAGE[normalizeRoutePath(pathname)] || 'main-big';
    return ROUTE_TO_PAGE[getActiveRoutePath()] || 'main-big';
  }

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
  function activatePage(page, options = {}){
    const nextPage = PAGE_TO_ROUTE[page] ? page : 'main-big';
    const { syncRoute = true, historyMode = 'push' } = options;
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
