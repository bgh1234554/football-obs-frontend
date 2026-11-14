/**
 * [선수 검색: 비동기 상태와 높이별 결과 페이지]
 * 선수 ID 연결과 빈 슬롯 입력 팝업에서 사용하는 공통 검색 상태와 후보 선택 UI이다.
 * 검색 API 호출은 api.js의 fetchPlayerSearch에, 선택 후 ID 저장은 호출자의 콜백에 맡긴다.
 *
 * 처리 순서:
 *  1. 검색어를 검증하고 새 요청 버전을 발급해 이전 검색/선택 상태를 무효화한다.
 *  2. API 페이지를 가져오거나 현재 검색어의 캐시에서 읽고 응답 구조를 검사한다.
 *  3. 결과를 현재 패널 높이에 맞는 내부 페이지로 나눠 표시한다. 높이 변경은 API를 다시 부르지 않는다.
 *  4. 후보 선택은 원본 API 결과 인덱스로 처리하고, 선택 후 저장 여부는 호출자가 판단한다.
 *  5. 입력 변경/팝업 닫기에서는 요청 버전과 DOM 연결 상태로 늦은 응답 반영을 막는다.
 *
 * API 페이지(rawPage), 그 결과를 패널 높이만큼 나눈 내부 페이지(localPage), 사용자에게
 * 표시할 누적 페이지(screenPage)를 구분한다. 패널 높이가 바뀌어도 API를 재요청하지 않고
 * 같은 결과 배열을 다시 나누며, 비동기 응답은 요청 버전과 팝업 활성 여부가 맞을 때만 반영한다.
 */
/** 양의 안전한 정수만 선수 ID로 인정하며, 사용할 수 없는 값은 0으로 반환한다. */
function playerSearchId(value) {
  const text = String(value ?? '').trim();
  const id = /^[0-9]+$/.test(text) ? Number(text) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

/**
 * API 검색 결과를 캐시하고 패널 높이에 맞는 화면 페이지로 나누어 관리한다.
 * 캐시는 현재 검색어 안에서 API 페이지별로 보관하며 새 검색이나 reset에서 비운다.
 * version은 검색어뿐 아니라 페이지 요청마다 증가해 먼저 보낸 응답이 나중 상태를 덮지 못한다.
 * @param {Object} options 검색 상태와 선택 결과를 전달할 콜백이다.
 * @param {Function} options.onChange 활성 상태에서 검색 상태가 바뀌면 호출한다.
 * @param {Function} options.onSelect 유효한 선수 후보를 선택하면 호출한다.
 * @param {Function} [options.isActive] 닫히거나 교체된 편집창에 결과를 적용하지 않도록 확인한다.
 * @returns {Object} 검색 상태와 검색·페이지 이동·선택 메서드이다.
 */
function createPlayerSearch({ onChange, onSelect, isActive = () => true }) {
  const state = { query: '', pages: new Map(), rawPage: 1, localPage: 0, screenPage: 1, pageSize: 5, totalPages: 1, loading: false, message: '', selected: null };
  // 새 검색이나 초기화 이후 도착한 이전 응답은 결과와 로딩 상태를 바꾸지 못한다.
  let version = 0;
  const notify = () => { if (isActive()) onChange(state); };
  const current = () => state.pages.get(state.rawPage) || [];
  /** API 페이지마다 화면에 나뉘는 페이지 수를 합쳐 사용자에게 보일 페이지 번호를 계산한다. */
  const updateScreenPage = () => {
    state.screenPage = 1 + state.localPage;
    for (let page = 1; page < state.rawPage; page++) state.screenPage += Math.max(1, Math.ceil((state.pages.get(page)?.length || 0) / state.pageSize));
  };
  /**
   * API 페이지를 가져오거나 현재 검색의 페이지 캐시에서 읽는다.
   * localPage=-1은 이전 API 페이지로 돌아갈 때 그 결과의 마지막 내부 화면을 뜻한다.
   * 성공, 오류, finally 모두 요청 버전을 검사해 닫힌 팝업이나 새 검색의 로딩 상태를
   * 오래된 응답이 변경하지 않도록 한다. 응답의 페이지 번호와 결과 구조도 저장 전에 확인한다.
   */
  async function load(rawPage, localPage, screenPage) {
    // 요청 자체를 네트워크에서 취소하는 방식이 아니라 결과 반영 권한을 버전으로 구분한다.
    // 성공 분기뿐 아니라 catch/finally도 검사해야 오래된 실패가 최신 검색의 안내/로딩을 덮지 않는다.
    const request = ++version;
    state.loading = true;
    state.message = '';
    notify();
    try {
      if (!state.pages.has(rawPage)) {
        const data = await fetchPlayerSearch(state.query, rawPage);
        if (request !== version || !isActive()) return;
        if (!Array.isArray(data?.players) || !Number.isInteger(data.page) || data.page !== rawPage || !Number.isInteger(data.totalPages)) throw new Error('올바르지 않은 검색 응답');
        state.pages.set(rawPage, data.players);
        state.totalPages = Math.max(1, data.totalPages);
      }
      if (request !== version || !isActive()) return;
      state.rawPage = rawPage;
      state.localPage = localPage === -1 ? Math.max(0, Math.ceil(current().length / state.pageSize) - 1) : localPage;
      updateScreenPage();
      if (!current().length) state.message = '검색 결과가 없습니다';
    } catch (error) {
      if (request !== version || !isActive()) return;
      state.message = `검색 실패: ${error?.message || ''}`;
    } finally {
      if (request === version && isActive()) { state.loading = false; notify(); }
    }
  }
  return {
    state,
    /** 패널 높이가 바뀌어도 기존 화면의 첫 후보가 포함된 페이지를 유지한다. */
    setPageSize(size) {
      size = Math.max(1, Math.floor(size));
      if (size === state.pageSize) return;
      const first = state.localPage * state.pageSize;
      state.pageSize = size;
      state.localPage = Math.floor(first / size);
      updateScreenPage();
      notify();
    },
    reset() { ++version; state.loading = false; state.selected = null; state.pages.clear(); state.message = ''; },
    /** 검색어를 검증하고 이전 결과를 비운 뒤 첫 API 페이지를 요청한다. */
    async search(input) {
      ++version;
      const raw = String(input || '');
      const query = /^[0-9]+$/.test(raw.trim()) ? raw.trim() : raw;
      Object.assign(state, { query, rawPage: 1, localPage: 0, screenPage: 1, totalPages: 1, selected: null, message: '', loading: false });
      state.pages.clear();
      if (!query.trim()) { state.message = '선수 ID 또는 영문 이름을 입력하세요'; notify(); return; }
      if (query.length > 128) { state.message = '검색어는 128자 이내로 입력하세요'; notify(); return; }
      if (/^[0-9]+$/.test(query) && !playerSearchId(query)) { state.message = '유효한 선수 ID를 입력하세요'; notify(); return; }
      if (!/^[0-9]+$/.test(query) && [...query].length < 4) { state.message = '영문 이름을 4글자 이상 입력하세요'; notify(); return; }
      await load(1, 0, 1);
    },
    /** 현재 API 결과 안에서 먼저 이동하고, 끝에 도달하면 앞뒤 API 페이지를 불러옵니다. */
    async move(direction) {
      if (state.loading || state.selected) return;
      const next = state.localPage + direction;
      if (next >= 0 && next * state.pageSize < current().length) await load(state.rawPage, next, state.screenPage + direction);
      else if (direction > 0 && state.rawPage < state.totalPages) await load(state.rawPage + 1, 0, state.screenPage + 1);
      else if (direction < 0 && state.rawPage > 1) await load(state.rawPage - 1, -1, state.screenPage - 1);
    },
    /** 화면 페이지의 상대 위치가 아닌 현재 API 결과 배열의 인덱스로 선수를 선택한다. */
    choose(index) {
      if (state.loading) return;
      const player = current()[index];
      if (!player || !Number.isSafeInteger(Number(player.id)) || Number(player.id) <= 0) return;
      state.selected = player;
      onSelect(player);
      notify();
    },
  };
}

/** 외부 검색 데이터는 이스케이프하고, 선택 상태·로딩 상태를 반영한 결과 목록을 만듭니다. */
function playerSearchResultsHtml(search) {
  const s = search.state;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const name = value => typeof formatLatinPlayerName === 'function' ? formatLatinPlayerName(value) : value;
  const players = s.pages.get(s.rawPage) || [];
  const start = s.localPage * s.pageSize;
  const selected = s.selected;
  const visible = (selected ? [selected] : players.slice(start, start + s.pageSize)).map(normalizeMissingValues);
  const items = visible.map((p, i) => `<button type="button" class="ps-result${selected ? ' is-selected' : ''}" data-ps-index="${start + i}"${selected ? ' disabled' : ''}>
    ${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" loading="lazy">` : '<span class="ps-avatar-empty"></span>'}
    <span class="ps-result-text" title="${esc([p.fullName || p.name, p.englishName].filter(Boolean).map(name).join(' · '))}"><strong>${esc(name(p.fullName || p.name || p.englishName))}</strong>
    ${p.englishName && p.englishName !== (p.fullName || p.name) ? `<span>${esc(name(p.englishName))}</span>` : ''}
    <small>${esc([p.nationality, p.age ? `${p.age}세` : '', `ID ${displayText(p.id, '-')}`].filter(Boolean).join(' / '))}</small></span>
  </button>`).join('');
  const hasNext = start + s.pageSize < players.length || s.rawPage < s.totalPages;
  return `<div class="ps-heading">${selected ? '선택한 선수' : '검색 결과'}</div>
    <div class="ps-results" aria-live="polite">${s.loading ? '<div class="ps-message">검색 중…</div>' : s.message ? `<div class="ps-message">${esc(s.message)}</div>` : items}</div>
    ${!selected && players.length ? `<div class="ps-pagination"><button type="button" data-ps-page="-1"${s.loading || s.screenPage === 1 ? ' disabled' : ''}>이전</button><span>${s.screenPage}페이지</span><button type="button" data-ps-page="1"${s.loading || !hasNext ? ' disabled' : ''}>다음</button></div>` : ''}`;
}

/** 오른쪽 영역을 절대 배치해 기존 입력 영역 높이는 바꾸지 않는다. */
function playerSearchSidePanel(host) {
  let panel = host.querySelector(':scope > .ps-side-panel');
  if (panel) return panel;
  host.style.setProperty('--ps-base-width', `${host.offsetWidth}px`);
  host.style.height = `${host.offsetHeight}px`;
  host.classList.add('ps-expanded');
  panel = document.createElement('div');
  panel.className = 'ps-side-panel';
  host.appendChild(panel);
  if (host.classList.contains('pm-popup')) {
    bindPlayerSearchResize(host);
    bindPlayerSearchResize(host, 'bottom');
  }
  return panel;
}

/** 상단 경계를 끌어 하단 위치를 유지하면서 검색 목록 높이를 조절한다. */
function bindPlayerSearchResize(host, edge = 'top') {
  const handle = document.createElement('div');
  handle.className = `ps-height-resize ps-height-resize-${edge}`;
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', edge === 'top' ? '검색 패널 상단 높이 조절' : '검색 패널 하단 높이 조절');
  handle.setAttribute('aria-orientation', 'horizontal');
  const minHeight = host.offsetHeight;
  const resize = (top, bottom) => {
    if (edge === 'bottom') {
      const nextBottom = Math.min(document.body.clientHeight - 8, Math.max(bottom, top + minHeight));
      host.style.height = `${nextBottom - top}px`;
      return;
    }
    const nextTop = Math.max(8, Math.min(top, bottom - minHeight));
    host.style.top = `${nextTop}px`;
    host.style.height = `${bottom - nextTop}px`;
  };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = getDisplayLayoutRect(host);
    const scale = host.getBoundingClientRect().height / rect.height || 1;
    const startY = event.clientY;
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove = move => {
      const delta = (move.clientY - startY) / scale;
      resize(rect.top + (edge === 'top' ? delta : 0), rect.bottom + (edge === 'bottom' ? delta : 0));
    };
    handle.onpointerup = handle.onpointercancel = () => {
      handle.onpointermove = null;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    };
  });
  handle.addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const rect = getDisplayLayoutRect(host);
    const delta = event.key === 'ArrowUp' ? -20 : 20;
    resize(rect.top + (edge === 'top' ? delta : 0), rect.bottom + (edge === 'bottom' ? delta : 0));
  });
  host.appendChild(handle);
}

/** 검색 영역과 크기 조절 핸들을 제거하고 ResizeObserver를 해제해, 닫힌 팝업을 계속 측정하지 않게 한다. */
function closePlayerSearchSidePanel(host) {
  host?.querySelector(':scope > .ps-side-panel')?._psObserver?.disconnect();
  host?.querySelector(':scope > .ps-side-panel')?.remove();
  host?.querySelectorAll(':scope > .ps-height-resize').forEach(handle => handle.remove());
  host?.classList.remove('ps-expanded');
  if (host) { host.style.height = ''; host.style.removeProperty('--ps-base-width'); }
}

/**
 * 검색 결과 패널의 높이와 클릭을 검색 상태 객체에 연결한다.
 * 결과 HTML을 교체할 때 같은 패널의 관찰자를 중복 생성하지 않고 최신 fit 함수만 갱신한다.
 * 선택 완료 상태에서는 페이지 용량을 재계산하지 않아 선택한 선수 표시가 다시 나뉘지 않게 한다.
 */
function bindPlayerSearchPanel(panel, search) {
  // 같은 패널의 HTML은 검색 상태마다 교체될 수 있다. 관찰자 콜백이 처음 생성 당시의
  // 검색 상태를 계속 붙잡지 않도록 관찰자는 재사용하고 실행할 fit 참조만 최신으로 바꾼다.
  // CSS의 행 높이와 간격으로 용량을 계산해 후보가 중간에 잘리지 않게 한다.
  const fit = () => {
    if (!panel.isConnected) { panel._psObserver?.disconnect(); return; }
    const list = panel.querySelector('.ps-results');
    if (list && !search.state.selected) search.setPageSize(Math.max(1, Math.floor((list.clientHeight + 4) / 58)));
  };
  panel._psFit = fit;
  if (!panel._psObserver) {
    panel._psObserver = new ResizeObserver(() => panel._psFit());
    panel._psObserver.observe(panel);
  }
  fit();
  panel.onclick = event => {
    const page = event.target.closest('[data-ps-page]');
    const item = event.target.closest('[data-ps-index]');
    if (page) search.move(Number(page.dataset.psPage));
    if (item) search.choose(Number(item.dataset.psIndex));
  };
}

/**
 * 팝업의 검색 입력, 검색 버튼, 후보 선택을 공통 검색 상태와 연결한다.
 * 입력을 다시 바꾸면 이전 선택을 무효화하고 진행 중인 응답도 reset으로 무효화한다.
 * 팝업 연결 여부와 입력기가 여전히 그 팝업에 속하는지 검사해 교체된 편집창을 보호한다.
 * @param {object} options 입력기와 후보 선택/무효화 콜백.
 * @returns {object} 생성한 공통 검색 상태와 제어 메서드.
 */
function bindPopupPlayerSearch({ input, button, popup, onSelect, onInvalidate }) {
  const search = createPlayerSearch({
    isActive: () => popup.isConnected && popup.contains(input),
    onChange: () => {
      const panel = playerSearchSidePanel(popup);
      panel.innerHTML = playerSearchResultsHtml(search);
      bindPlayerSearchPanel(panel, search);
      pmClampPopupToViewport(popup);
    },
    onSelect: player => { input.value = String(player.id); onSelect(player); },
  });
  button.addEventListener('click', () => { onInvalidate(); search.search(input.value); });
  input.addEventListener('input', () => { search.reset(); closePlayerSearchSidePanel(popup); onInvalidate(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); onInvalidate(); search.search(input.value); }
  });
  return search;
}
