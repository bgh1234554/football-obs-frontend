/**
 * [신규 이벤트 표시: 렌더 결과 비교와 순차 알림]
 * 설정 eventSpotlight(off/board/bottom)와 eventSpotlightScale에 따라 신규 이벤트를 잠깐 표시한다.
 * 이벤트 원본을 별도 형식으로 다시 그리지 않고 events-panel.js가 만든 행을 복제해 사용한다.
 *
 * 처리 순서:
 *  1. fixture.js가 신규 이벤트를 받은 응답에서 evSpotlightMarkNewEvents로 다음 렌더를 표시한다.
 *  2. 패널 렌더 후 evSpotlightAfterRender가 이전 이벤트 키/구간 키와 비교해 새 행을 추린다.
 *  3. 첫 조회의 과거 행은 제외하고, 새 행을 오래된 순서로 복제해 대기열에 넣는다.
 *  4. showNext가 하나씩 글자 맞춤과 위치 계산을 마친 후 표시·퇴장 타이머를 진행한다.
 *  5. 경기 변경/설정 끄기 때 표시와 대기열을 정리한다. 크기 견본은 별도 레이어로 관리한다.
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
  const SPOTLIGHT_FONT_SIZE = 15; // 패널 글씨 크기와 분리한 알림 전용 기준 크기
  const SPOTLIGHT_BASE_SCALE = 1.25; // 설정 100%일 때의 실제 배율(이벤트 패널 칼럼 너비 기준)
  const SPOTLIGHT_BOARD_GAP = 6; // 점수판 아래 위치에서 점수판과의 간격(px)
  let seenFixtureId = '';
  // 중복 판정 상태와 표시 대기열은 역할이 다르다. 알림이 꺼져 있어도 렌더 후 확인 키는
  // 갱신해 두며, 다시 켰을 때 이미 지나간 이벤트를 새로운 이벤트로 취급하지 않는다.
  let seenKeys = null;     // 마지막 렌더에서 본 이벤트 키(data-ev-key)
  let seenMarkerKeys = new Set(); // 같은 경기에서 이미 확인한 구간은 재조회로 다시 알리지 않는다.
  let pendingNew = false;  // fixture.js가 "새 이벤트 수신"을 알린 뒤 다음 렌더에서만 표시
  const queue = [];
  let showing = false;
  let host = null;
  let hideTimer = null;    // 표시 시간(SHOW_MS)이 끝나면 사라지기 시작
  let fadeTimer = null;    // 사라지는 효과(FADE_MS)가 끝나면 다음 이벤트로
  let previewHost = null;
  let previewTimer = null;
  let previewHideTimer = null;

  /**
   * 대기열·보이는 표시·진행 중인 타이머를 모두 치운다. 설정을 끄거나 다른 경기로 바뀔 때 쓴다.
   * 타이머를 취소하지 않으면 다시 켠 뒤 새 표시가 예전 타이머 때문에 일찍 사라지거나 순서가 꼬인다.
   */
  function reset() {
    // 현재 표시 수명만 정리한다. 확인 키의 갱신/경기별 구간 키 초기화는 AfterRender가 맡으므로,
    // 설정을 껐다 켜는 동작 자체가 과거 이벤트를 다시 알리는 기준 초기화가 되지 않는다.
    window.notificationSounds?.stop('event');
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

  /**
   * 실제 신규 이벤트를 표시할 고정 레이어를 한 번 생성하고 이후 표시마다 재사용한다.
   * 원본 이벤트 패널 바깥에 두어 알림 크기가 카메라 레이아웃의 높이 계산에 들어가지 않게 한다.
   * 레이어의 클릭은 크기 설정을 열지만 복제된 행의 원본 편집 동작은 실행하지 않는다.
   */
  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.className = 'ev-spotlight';
    host.dataset.panelFont = 'eventSpotlightScale';
    host.tabIndex = 0;
    host.setAttribute('role', 'button');
    host.setAttribute('aria-label', '신규 이벤트 표시 크기 조절');
    host.title = '클릭하여 신규 이벤트 표시 크기 조절';
    host.addEventListener('click', event => {
      event.stopPropagation();
      openPanelFontPopup(host, { x: event.clientX, y: event.clientY });
    }, true);
    host.style.setProperty('--ev-name-base-size', `${SPOTLIGHT_FONT_SIZE}px`);
    host.style.setProperty('--ev-ui-scale', '1');
    host.setAttribute('aria-live', 'polite');
    host.hidden = true;
    document.body.append(host);
    return host;
  }

  // body의 화면 배율이 다시 적용되므로 DOMRect를 먼저 레이아웃 좌표로 되돌린다.
  const layoutRect = element => typeof getDisplayLayoutRect === 'function'
    ? getDisplayLayoutRect(element) : element.getBoundingClientRect();

  /** 기본 너비·배율·아랫변 위치를 현재 레이아웃에 맞춘다. */
  function place(target, element = host) {
    // 실제 알림과 크기 견본이 공유하는 배치 계산이다. body 화면 배율과 알림 배율을
    // 분리해 처리하며, 모드마다 기준 변을 정해 확대해도 점수판/패널의 기준선에서 멀어지지 않게 한다.
    const host = element;
    const { layout, column } = target;
    // 패널 영역: 그 페이지의 패널(.lp)들이 차지하는 세로 범위(캠 작음은 이벤트 칼럼이 위쪽 절반뿐이라 전체 패널 기준으로 잰다).
    const panels = [...layout.querySelectorAll('.lp')].filter(node => node.offsetHeight).map(layoutRect);
    const columnRect = layoutRect(column);
    const viewport = typeof toDisplayLayoutPoint === 'function'
      ? toDisplayLayoutPoint(window.innerWidth, window.innerHeight)
      : { x: window.innerWidth, y: window.innerHeight };
    const panelBottom = Math.max(...panels.map(rect => rect.bottom), columnRect.bottom);
    // 설정 100%는 이벤트 패널 칼럼 너비의 1.25배(SPOTLIGHT_BASE_SCALE). 칼럼 너비 그대로는 화면에서 너무 작았다.
    const scale = SPOTLIGHT_BASE_SCALE * Math.max(100, Math.min(250, Number(getSetting('eventSpotlightScale')) || SETTINGS_DEFAULTS.eventSpotlightScale)) / 100;
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

  /**
   * 표시 중인 이벤트가 없을 때 대기열에서 한 행을 꺼내 표시하고 다음 행까지 이어간다.
   * 행의 글씨 맞춤과 위치 계산을 투명 상태에서 끝낸 뒤 나타나게 해 높이 변화가 보이지 않게 한다.
   * 표시 시간과 사라지는 시간을 별도 타이머로 두어 이전 행이 사라진 뒤에만 다음 행을 시작한다.
   * 알림이 꺼졌거나 카메라 레이아웃이 아니면 대기열을 비워 나중에 과거 이벤트를 몰아 띄우지 않는다.
   */
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
    window.evRefitPanelRows?.(host, SPOTLIGHT_FONT_SIZE);
    place(target);
    requestAnimationFrame(() => {
      // 크기/위치가 확정된 다음 프레임에서 보이게 한다. 복제 행의 신규 표시 클래스를
      // 다시 붙여 애니메이션을 시작하며, 알림음은 notification-sounds.js가 이 시작을 감지한다.
      host.classList.add('is-visible');
      row.classList.remove('ev-row-new');
      void row.offsetWidth;
      row.classList.add('ev-row-new');
    });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      window.notificationSounds?.stop('event');
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

  /**
   * 새 이벤트 행을 오래된 것부터 복제해 표시 대기열에 넣는다.
   * 원본 패널의 편집/숨기기 버튼과 유지 중인 강조 상태를 제거해 알림이 원본 동작을
   * 대신 실행하지 않게 한다. 실제 이벤트가 오면 크기 견본을 먼저 치워 겹치지 않게 한다.
   * @param {HTMLElement[]} rows 원본 이벤트 패널에서 새로 추가된 행.
   */
  function enqueue(rows) {
    window.evSpotlightStopPreview();
    // 패널은 최신순이지만 알림은 발생 순서대로 보여야 하므로 순서를 뒤집는다.
    // cloneNode는 원본 이벤트 리스너를 복제하지 않는다. 남은 버튼도 탭 이동 대상에서 빼고
    // 실제 알림 레이어의 클릭은 크기 조절 경로로만 전달되도록 한다.
    rows.reverse().forEach(source => {
      const clone = source.cloneNode(true);
      clone.classList.remove('ev-row-new', 'ev-row-glow-held', 'is-editable', 'has-hide-btn');
      clone.removeAttribute('style');
      clone.querySelectorAll('.ev-marker-label').forEach(label => { label.style.fontSize = `${SPOTLIGHT_FONT_SIZE}px`; });
      clone.querySelectorAll('.ev-hide-btn, .ev-row-menu, button').forEach(node => {
        if (node.matches('.ev-hide-btn, .ev-row-menu')) node.remove();
        else node.setAttribute('tabindex', '-1');
      });
      queue.push(clone);
    });
    showNext();
  }

  /** 크기 견본은 실제 이벤트 대기열·중복 감지와 분리해 표시한다. */
  window.evSpotlightStopPreview = () => {
    clearTimeout(previewTimer);
    clearTimeout(previewHideTimer);
    previewHost?.remove();
    previewHost = null;
  };

  /**
   * 크기 견본을 현재 카메라 칼럼의 폭으로 배치한다. 일정이나 설정 페이지에서는 선택한
   * 카메라 레이아웃을 보이지 않게 잠시 측정하고 원래 인라인 스타일을 finally에서 복원한다.
   * 실제 이벤트 표시 위치와 견본 위치를 분리해 설정 중에 화면 이동이나 실제 이벤트 재생을 만들지 않는다.
   */
  function placePreview() {
    if (!previewHost) return;
    const target = activeLayout();
    if (target) { place(target, previewHost); return; }
    // 일정/설정 전용 창에서도 선택한 카메라 뷰의 실제 칼럼 너비를 측정한다.
    const page = document.getElementById(getSetting('mainPage') === 'small' ? 'page-main-small' : 'page-main-big');
    const column = page?.querySelector(page.id === 'page-main-big' ? '.lp-stat' : '.lp-events-s');
    if (!page || !column) return;
    const style = page.style.cssText;
    let width;
    try {
      Object.assign(page.style, { display: 'block', visibility: 'hidden', position: 'fixed', inset: '0', pointerEvents: 'none' });
      width = layoutRect(column).width;
    } finally { page.style.cssText = style; }
    previewHost.classList.remove('is-board');
    previewHost.style.width = `${width}px`;
    previewHost.style.top = '';
    previewHost.style.left = '50%';
    previewHost.style.bottom = '24px';
    previewHost.style.setProperty('--ev-spotlight-scale', String(SPOTLIGHT_BASE_SCALE * Number(getSetting('eventSpotlightScale')) / 100));
  }

  window.evSpotlightPreview = () => {
    clearTimeout(previewTimer);
    // 슬라이더를 움직이는 동안 여러 견본을 쌓지 않고 마지막 값만 보여 준다.
    previewTimer = setTimeout(() => {
      window.evSpotlightStopPreview();
      if (showing) return; // 실제 이벤트가 보이면 그 이벤트에 새 크기가 바로 적용된다.
      previewHost = document.createElement('div');
      previewHost.className = 'ev-spotlight ev-spotlight-preview';
      previewHost.style.transition = 'none';
      previewHost.setAttribute('role', 'status');
      previewHost.setAttribute('aria-label', '신규 이벤트 크기 미리보기');
      previewHost.style.setProperty('--ev-name-base-size', `${SPOTLIGHT_FONT_SIZE}px`);
      previewHost.style.setProperty('--ev-ui-scale', '1');
      const list = document.createElement('div');
      list.className = 'ev-list';
      const row = evCreateRow({ type: 'Goal', detail: 'Normal Goal', side: 'home',
        playerName: '미리보기 득점자', assistName: '미리보기 도움 선수', elapsed: 88 },
        { matchInfo: { status: '2H', elapsed: 88 } });
      row.classList.add('ev-row-new');
      list.append(row);
      previewHost.append(list);
      (document.fullscreenElement || document.body).append(previewHost);
      placePreview();
      window.evRefitPanelRows?.(previewHost, SPOTLIGHT_FONT_SIZE);
      // 줄 높이가 확정된 다음 실제 팝업과 같은 기준으로 배치한다.
      placePreview();
      void previewHost.offsetWidth;
      previewHost.style.transition = '';
      requestAnimationFrame(() => previewHost?.classList.add('is-visible'));
      previewHideTimer = setTimeout(window.evSpotlightStopPreview, SHOW_MS);
    }, 250);
  };

  /**
   * fixture.js가 같은 경기에서 이벤트 개수가 늘어난 응답을 렌더하기 직전에 호출한다.
   * 즉시 행을 표시하지 않고 다음 AfterRender 한 번에만 쓸 표식을 남긴다. 실제 DOM 행과
   * 중복 키 비교는 렌더 완료 후에 가능하므로, 수신 시점과 표시 판정 시점을 분리한다.
   */
  window.evSpotlightMarkNewEvents = () => { pendingNew = true; };

  /**
   * events-panel.js가 렌더한 결과를 이전 키 집합과 비교해 새 이벤트와 구간 알림을 추린다.
   * 같은 경기를 여러 컨테이너에 렌더해도 한 목록만 기준으로 사용한다. 일반 이벤트는
   * fixture.js의 pendingNew 표시가 있는 렌더에서만 알리고, 구간 종료 행은 별도 키로
   * 같은 개수의 응답 변경도 감지한다. 첫 조회나 경기 변경의 과거 이벤트는 표시하지 않는다.
   * @param {string|number} fixtureId 렌더한 경기 ID.
   * @param {Iterable<HTMLElement>} containers 같은 경기의 이벤트 패널 컨테이너들.
   */
  window.evSpotlightAfterRender = (fixtureId, containers) => {
    // 캠 큼/캠 작음 등 여러 패널이 같은 이벤트를 그려도 한 목록만 기준으로 삼는다.
    // 일반 이벤트와 구간 종료 행은 서로 다른 키/갱신 조건을 사용한다.
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
    // 표시 대상이 없거나 알림 설정이 꺼졌어도 확인 상태를 먼저 갱신한다. pendingNew는
    // 여기서 소모해 같은 응답의 다른 렌더가 신규 알림을 다시 만들지 않게 한다.
    seenKeys = keys;
    markers.forEach(row => seenMarkerKeys.add(row.dataset.evMarkerKey));
    pendingNew = false;
    if (fresh.length) enqueue(fresh);
  };

  // 설정을 끄면 대기 중인 표시도 바로 치운다. 배율을 바꾸면 보이는 중인 표시에도 바로 반영한다.
  document.addEventListener('settings:change', event => {
    const category = event.detail?.category;
    if (category === 'eventSpotlightScale' || category === 'eventSpotlight') placePreview();
    if (category === 'eventSpotlight' && !enabled()) reset();
    if ((category === 'eventSpotlightScale' || category === 'eventSpotlight') && enabled() && host && !host.hidden) {
      const target = activeLayout();
      if (target) place(target);
    }
  });
  window.addEventListener('resize', () => {
    placePreview();
    if (!host || host.hidden) return;
    const target = activeLayout();
    if (target) place(target);
  });
  document.addEventListener('page:activated', () => window.evSpotlightStopPreview());
})();
