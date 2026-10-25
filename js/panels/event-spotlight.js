/**
 * 신규 이벤트 표시 (설정 eventSpotlight: off/board/bottom, eventSpotlightScale).
 *
 * 폴링으로 같은 경기에 새 이벤트가 들어오거나 실제 경기 구간이 끝나면,
 * 이벤트 패널에 새로 생긴 행(.ev-row)을 복제해 점수판 아래 또는 화면 가운데 하단에 잠깐 띄운다.
 * 캠 큰 메뉴 패널 자동 전환을 꺼 둬도 새 이벤트를 화면에서 알 수 있게 하기 위한 기능.
 *
 * - 기본 너비는 그 페이지의 이벤트 패널 칼럼 너비(캠 큼: .lp-stat, 캠 작음: .lp-events-s)이고,
 *   배율(100~250%)만큼 키운다. 점수판 아래는 윗변 고정·아래로, 하단은 패널 하단선에 아랫변 고정·위로 커진다.
 * - 여러 이벤트가 한 번에 들어오면 오래된 것부터 하나씩 보여 준다.
 * - 메인 화면(캠 큼/캠 작음)이 아닐 때는 표시하지 않는다.
 */
(() => {
  const SHOW_MS = 5000;   // 한 이벤트를 보여 주는 시간 (캠 큰 패널 새 이벤트 유지 시간과 같음)
  const FADE_MS = 320;
  const SPOTLIGHT_BASE_SCALE = 1.25; // 설정 100%일 때의 실제 배율(이벤트 패널 칼럼 너비 기준)
  const SPOTLIGHT_BOARD_GAP = 6; // 점수판 아래 위치에서 점수판과의 간격(px)
  let seenFixtureId = '';
  let seenKeys = null;     // 마지막 렌더에서 본 이벤트 키(data-ev-key)
  let seenMarkerKeys = new Set(); // 같은 경기에서 이미 확인한 구간은 재조회로 다시 알리지 않는다.
  let pendingNew = false;  // fixture.js가 "새 이벤트 수신"을 알린 뒤 다음 렌더에서만 표시
  const queue = [];
  let showing = false;
  let host = null;
  let hideTimer = null;    // 표시 시간(SHOW_MS)이 끝나면 사라지기 시작
  let fadeTimer = null;    // 사라지는 효과(FADE_MS)가 끝나면 다음 이벤트로

  /**
   * 대기열·보이는 표시·진행 중인 타이머를 모두 치운다. 설정을 끄거나 다른 경기로 바뀔 때 쓴다.
   * 타이머를 취소하지 않으면 다시 켠 뒤 새 표시가 예전 타이머 때문에 일찍 사라지거나 순서가 꼬인다.
   */
  function reset() {
    clearTimeout(hideTimer);
    clearTimeout(fadeTimer);
    hideTimer = fadeTimer = null;
    queue.length = 0;
    if (host) { host.classList.remove('is-visible'); host.hidden = true; host.replaceChildren(); }
    showing = false;
  }

  const mode = () => (typeof getSetting === 'function' ? getSetting('eventSpotlight') : 'off');
  const enabled = () => ['board', 'bottom'].includes(mode());

  /** 지금 보이는 메인 페이지와 그 페이지의 이벤트 패널 칼럼(기본 너비 기준)을 찾는다. */
  function activeLayout() {
    const page = document.querySelector('#page-main-big.active, #page-main-small.active');
    if (!page) return null;
    const layout = page.querySelector('.layout-wrap');
    const column = page.id === 'page-main-big' ? page.querySelector('.lp-stat') : page.querySelector('.lp-events-s');
    if (!layout || !column || !column.offsetWidth) return null;
    return { layout, column };
  }

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.className = 'ev-spotlight';
    host.setAttribute('aria-live', 'polite');
    host.hidden = true;
    document.body.append(host);
    return host;
  }

  // body의 화면 배율이 다시 적용되므로 DOMRect를 먼저 레이아웃 좌표로 되돌린다.
  const layoutRect = element => typeof getDisplayLayoutRect === 'function'
    ? getDisplayLayoutRect(element) : element.getBoundingClientRect();

  /** 기본 너비·배율·아랫변 위치를 현재 레이아웃에 맞춘다. */
  function place(target) {
    const { layout, column } = target;
    // 패널 영역: 그 페이지의 패널(.lp)들이 차지하는 세로 범위(캠 작음은 이벤트 칼럼이 위쪽 절반뿐이라 전체 패널 기준으로 잰다).
    const panels = [...layout.querySelectorAll('.lp')].filter(node => node.offsetHeight).map(layoutRect);
    const columnRect = layoutRect(column);
    const viewport = typeof toDisplayLayoutPoint === 'function'
      ? toDisplayLayoutPoint(window.innerWidth, window.innerHeight)
      : { x: window.innerWidth, y: window.innerHeight };
    const panelBottom = Math.max(...panels.map(rect => rect.bottom), columnRect.bottom);
    // 설정 100%는 이벤트 패널 칼럼 너비의 1.25배(SPOTLIGHT_BASE_SCALE). 칼럼 너비 그대로는 화면에서 너무 작았다.
    const scale = SPOTLIGHT_BASE_SCALE * Math.max(100, Math.min(250, Number(getSetting('eventSpotlightScale')) || 100)) / 100;
    host.style.width = `${columnRect.width}px`;
    host.classList.toggle('is-board', mode() === 'board');
    if (mode() === 'board') {
      // 위: 윗변을 패널 윗선(그 페이지 .lp들의 맨 위)에 맞춰 양옆 패널과 한 줄로 잇고 아래로 커진다.
      // 점수판 배율을 키워 점수판이 패널 윗선보다 내려오면 점수판(시계 포함) 밑으로 물러나 점수판을 가리지 않는다.
      // body에 붙은 고정 레이어라 점수판 영역 높이 계산(캠 작음 패널 배치)에는 들어가지 않는다.
      const boardElement = document.getElementById('board');
      const board = boardElement ? layoutRect(boardElement) : null;
      const panelTop = Math.min(...panels.map(rect => rect.top), columnRect.top);
      host.style.bottom = '';
      host.style.top = `${Math.max(panelTop, board ? board.bottom + SPOTLIGHT_BOARD_GAP : 0)}px`;
      host.style.left = `${board ? (board.left + board.right) / 2 : viewport.x / 2}px`;
    } else {
      // 하단: 화면 가운데에서 아랫변을 패널 하단선(그 페이지에서 가장 아래 있는 패널)에 고정하고 위로 커진다.
      host.style.top = '';
      host.style.left = '';
      host.style.bottom = `${Math.max(0, viewport.y - panelBottom)}px`;
    }
    host.style.setProperty('--ev-spotlight-scale', String(scale));
  }

  function showNext() {
    if (showing || !queue.length) return;
    const target = enabled() ? activeLayout() : null;
    if (!target) { queue.length = 0; return; }
    showing = true;
    const row = queue.shift();
    ensureHost();
    const list = document.createElement('div');
    list.className = 'ev-list';
    list.append(row);
    host.replaceChildren(list);
    host.hidden = false;
    host.style.width = `${layoutRect(target.column).width}px`;
    // 패널과 같은 글자 맞춤을 복제 행에도 적용한 뒤(행 높이 확정) 위치를 잡는다. 아직 투명 상태라 보이지 않는다.
    window.evRefitPanelRows?.(host);
    place(target);
    requestAnimationFrame(() => {
      host.classList.add('is-visible');
      row.classList.remove('ev-row-new');
      void row.offsetWidth;
      row.classList.add('ev-row-new');
    });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      host.classList.remove('is-visible');
      fadeTimer = setTimeout(() => {
        fadeTimer = null;
        host.hidden = true;
        host.replaceChildren();
        showing = false;
        showNext();
      }, FADE_MS);
    }, SHOW_MS);
  }

  /** 이벤트 패널에서 새로 생긴 행을 복제해 대기열에 넣는다(오래된 이벤트부터). */
  function enqueue(rows) {
    rows.reverse().forEach(source => {
      const clone = source.cloneNode(true);
      clone.classList.remove('ev-row-new', 'ev-row-glow-held', 'is-editable', 'has-hide-btn');
      clone.removeAttribute('style');
      clone.querySelectorAll('.ev-hide-btn, .ev-row-menu, button').forEach(node => {
        if (node.matches('.ev-hide-btn, .ev-row-menu')) node.remove();
        else node.setAttribute('tabindex', '-1');
      });
      queue.push(clone);
    });
    showNext();
  }

  /** fixture.js: 같은 경기에서 이벤트 개수가 늘어난 응답을 렌더하기 직전에 호출. */
  window.evSpotlightMarkNewEvents = () => { pendingNew = true; };

  /** events-panel.js: 이벤트 패널을 다시 그린 직후 호출. 이전에 본 키와 비교해 새 행만 고른다. */
  window.evSpotlightAfterRender = (fixtureId, containers) => {
    const source = Array.from(containers).find(container => container.querySelector('.ev-row[data-ev-key], .ev-period-marker')) || containers[0];
    const allRows = source ? [...source.querySelectorAll('.ev-list > .ev-row')] : [];
    const rows = allRows.filter(row => row.dataset.evKey && !row.classList.contains('ev-period-marker'));
    const markers = allRows.filter(row => row.dataset.evMarkerKey);
    const keys = new Set(rows.map(row => row.dataset.evKey));
    // 다른 경기로 바뀌면 이전 경기의 대기 중·표시 중인 이벤트를 치운다.
    if (fixtureId !== seenFixtureId) { reset(); seenMarkerKeys = new Set(); }
    const sameFixture = fixtureId && fixtureId === seenFixtureId && seenKeys;
    const freshEvents = sameFixture && pendingNew && enabled() ? rows.filter(row => !seenKeys.has(row.dataset.evKey)) : [];
    // 첫 조회의 과거 구간이나 건너뛴 중간 구간을 뒤늦게 나열하지 않는다.
    const latestMarker = markers[0];
    const freshMarker = sameFixture && enabled() && latestMarker && !seenMarkerKeys.has(latestMarker.dataset.evMarkerKey) ? latestMarker : null;
    const fresh = allRows.filter(row => freshEvents.includes(row) || row === freshMarker);
    seenFixtureId = fixtureId;
    seenKeys = keys;
    markers.forEach(row => seenMarkerKeys.add(row.dataset.evMarkerKey));
    pendingNew = false;
    if (fresh.length) enqueue(fresh);
  };

  // 설정을 끄면 대기 중인 표시도 바로 치운다. 배율을 바꾸면 보이는 중인 표시에도 바로 반영한다.
  document.addEventListener('settings:change', event => {
    const category = event.detail?.category;
    if (category === 'eventSpotlight' && !enabled()) reset();
    if ((category === 'eventSpotlightScale' || category === 'eventSpotlight') && enabled() && host && !host.hidden) {
      const target = activeLayout();
      if (target) place(target);
    }
  });
  window.addEventListener('resize', () => {
    if (!host || host.hidden) return;
    const target = activeLayout();
    if (target) place(target);
  });
})();
