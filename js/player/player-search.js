// 선수 ID 연결·빈 슬롯 입력에서 함께 사용하는 높이별 페이지 후보 선택기.
/** 양의 안전한 정수만 선수 ID로 인정하며, 사용할 수 없는 값은 0으로 반환합니다. */
function playerSearchId(value) {
  const text = String(value ?? '').trim();
  const id = /^[0-9]+$/.test(text) ? Number(text) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

/**
 * API 검색 결과를 캐시하고 패널 높이에 맞는 화면 페이지로 나누어 관리합니다.
 * @param {Object} options 검색 상태와 선택 결과를 전달할 콜백입니다.
 * @param {Function} options.onChange 활성 상태에서 검색 상태가 바뀌면 호출합니다.
 * @param {Function} options.onSelect 유효한 선수 후보를 선택하면 호출합니다.
 * @param {Function} [options.isActive] 닫히거나 교체된 편집창에 결과를 적용하지 않도록 확인합니다.
 * @returns {Object} 검색 상태와 검색·페이지 이동·선택 메서드입니다.
 */
function createPlayerSearch({ onChange, onSelect, isActive = () => true }) {
  const state = { query: '', pages: new Map(), rawPage: 1, localPage: 0, screenPage: 1, pageSize: 5, totalPages: 1, loading: false, message: '', selected: null };
  // 새 검색이나 초기화 이후 도착한 이전 응답은 결과와 로딩 상태를 바꾸지 못합니다.
  let version = 0;
  const notify = () => { if (isActive()) onChange(state); };
  const current = () => state.pages.get(state.rawPage) || [];
  /** API 페이지마다 화면에 나뉘는 페이지 수를 합쳐 사용자에게 보일 페이지 번호를 계산합니다. */
  const updateScreenPage = () => {
    state.screenPage = 1 + state.localPage;
    for (let page = 1; page < state.rawPage; page++) state.screenPage += Math.max(1, Math.ceil((state.pages.get(page)?.length || 0) / state.pageSize));
  };
  /** API 페이지를 가져오거나 캐시에서 읽으며, localPage가 -1이면 해당 결과의 마지막 화면을 엽니다. */
  async function load(rawPage, localPage, screenPage) {
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
    /** 패널 높이가 바뀌어도 기존 화면의 첫 후보가 포함된 페이지를 유지합니다. */
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
    /** 검색어를 검증하고 이전 결과를 비운 뒤 첫 API 페이지를 요청합니다. */
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
    /** 화면 페이지의 상대 위치가 아닌 현재 API 결과 배열의 인덱스로 선수를 선택합니다. */
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
  const players = s.pages.get(s.rawPage) || [];
  const start = s.localPage * s.pageSize;
  const selected = s.selected;
  const visible = selected ? [selected] : players.slice(start, start + s.pageSize);
  const items = visible.map((p, i) => `<button type="button" class="ps-result${selected ? ' is-selected' : ''}" data-ps-index="${start + i}"${selected ? ' disabled' : ''}>
    ${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" loading="lazy">` : '<span class="ps-avatar-empty"></span>'}
    <span class="ps-result-text" title="${esc([p.fullName || p.name, p.englishName].filter(Boolean).join(' · '))}"><strong>${esc(p.fullName || p.name || p.englishName)}</strong>
    ${p.englishName && p.englishName !== (p.fullName || p.name) ? `<span>${esc(p.englishName)}</span>` : ''}
    <small>${esc([p.nationality, p.age ? `${p.age}세` : '', `ID ${p.id}`].filter(Boolean).join(' · '))}</small></span>
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

function closePlayerSearchSidePanel(host) {
  host?.querySelector(':scope > .ps-side-panel')?._psObserver?.disconnect();
  host?.querySelector(':scope > .ps-side-panel')?.remove();
  host?.querySelectorAll(':scope > .ps-height-resize').forEach(handle => handle.remove());
  host?.classList.remove('ps-expanded');
  if (host) { host.style.height = ''; host.style.removeProperty('--ps-base-width'); }
}

function bindPlayerSearchPanel(panel, search) {
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

/** 팝업 검색칸에 공통 후보 선택기를 연결한다. */
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
