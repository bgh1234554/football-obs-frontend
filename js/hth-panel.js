// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [상대 전적 패널 — Iter 7]
// fixtureId 로드 시 /api/hth를 호출해 [data-hth-panel]에 렌더링.
// 이벤트가 없을 때 자동으로 HTH 패널 표시, 이벤트 발생 시 자동 복귀.
// ev-title-bar 내 토글 버튼으로 수동 전환 가능.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HTH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HTH_CACHE_STORAGE_KEY = 'obs.hth.cache.v1';
const _hthCache = new Map();
const _hthState = {
  mode: 'events',      // 'events' | 'hth'
  hthData: null,       // HthResponseDto { matches: HthMatchDto[] }
  fixtureData: null,   // 마지막 fixture 데이터 — 팀 ID 비교용
  cacheKey: '',
  fetchedAt: 0,
  expiresAt: 0,
  fetchPromise: null,
  requestSeq: 0,       // 요청마다 증가 — in-flight 구 응답 식별용
};
window._hthState = _hthState;

function hthPersistCache() {
  try {
    const now = Date.now();
    const entries = {};
    _hthCache.forEach((entry, key) => {
      if (Number(entry?.expiresAt) > now) entries[key] = entry;
    });
    sessionStorage.setItem(HTH_CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

function hthHydrateCache() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(HTH_CACHE_STORAGE_KEY) || '{}');
    const now = Date.now();
    Object.entries(raw || {}).forEach(([key, entry]) => {
      if (entry && Number(entry.expiresAt) > now) _hthCache.set(key, entry);
    });
    hthPersistCache();
  } catch {}
}
hthHydrateCache();

function hthGetFixtureData(fixtureData = null) {
  return fixtureData || window._eventsLastData || _hthState.fixtureData || null;
}

function hthGetTeamIds(fixtureData = null) {
  const data = hthGetFixtureData(fixtureData);
  const homeTeamId = Number(data?.matchInfo?.homeTeamId);
  const awayTeamId = Number(data?.matchInfo?.awayTeamId);
  if (!homeTeamId || !awayTeamId) return null;
  return { homeTeamId, awayTeamId };
}

function hthGetCacheKey(fixtureData = null) {
  const ids = hthGetTeamIds(fixtureData);
  if (!ids) return '';
  return [ids.homeTeamId, ids.awayTeamId].sort((a, b) => a - b).join(':');
}

function hthGetFreshCacheEntry(cacheKey) {
  if (!cacheKey) return null;
  const entry = _hthCache.get(cacheKey);
  if (!entry) return null;
  if (Number(entry.expiresAt) <= Date.now()) {
    _hthCache.delete(cacheKey);
    hthPersistCache();
    return null;
  }
  return entry;
}

function hthCanLoadForFixture(fixtureData = null) {
  return !!hthGetCacheKey(fixtureData);
}

function hthCurrentDataIsFresh(fixtureData = null) {
  const cacheKey = hthGetCacheKey(fixtureData);
  return !!cacheKey
    && _hthState.cacheKey === cacheKey
    && !!_hthState.hthData
    && Number(_hthState.expiresAt) > Date.now();
}

function hthRenderStatus(message) {
  document.querySelectorAll('[data-hth-panel]').forEach(container => {
    const titleBar = hthCreateTitleBar(container);
    const status = document.createElement('div');
    status.className = 'ev-empty';
    status.textContent = message;
    container.replaceChildren(titleBar, status);
  });
}

/** 승자 판정: 'home' | 'away' | 'draw' */
function hthGetWinner(match) {
  if (match.homePenaltyScore != null) {
    if (match.homePenaltyScore > match.awayPenaltyScore) return 'home';
    if (match.awayPenaltyScore > match.homePenaltyScore) return 'away';
    return 'draw';
  }
  if (match.homeScore > match.awayScore) return 'home';
  if (match.awayScore > match.homeScore) return 'away';
  return 'draw';
}

/**
 * 승자 팀 ID가 현재 fixture의 홈/원정 중 어느 쪽인지 반환.
 * 테마 CSS 변수(--home-bg / --away-bg) 선택에 사용.
 */
function hthGetColorSide(match, fixtureData) {
  const winner = hthGetWinner(match);
  if (winner === 'draw') return 'draw';
  const homeId = Number(fixtureData?.matchInfo?.homeTeamId);
  const awayId = Number(fixtureData?.matchInfo?.awayTeamId);
  const winnerId = winner === 'home' ? Number(match.homeTeamId) : Number(match.awayTeamId);
  if (homeId && winnerId === homeId) return 'home';
  if (awayId && winnerId === awayId) return 'away';
  return 'unknown';
}

/** ISO-8601 날짜 → 한국 형식 (2024. 10. 6.) */
function hthFormatDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 라운드 문자열 단순화 ("Regular Season - 30" → "30R") */
function hthFormatRound(round) {
  if (!round) return '';
  const m = round.match(/Regular Season\s*-\s*(\d+)/i);
  if (m) return `${m[1]}R`;
  const map = [
    [/\bfinal\b/i, '결승'],
    [/semi.final/i, '4강'],
    [/quarter.final/i, '8강'],
    [/round of 16/i, '16강'],
    [/round of 32/i, '32강'],
    [/group stage/i, '조별리그'],
    [/qualif/i, '예선'],
    [/playoff/i, '플레이오프'],
  ];
  for (const [re, label] of map) {
    if (re.test(round)) return label;
  }
  return round;
}

/** HTH 경기 한 줄 row DOM 생성 */
function hthCreateRow(match, fixtureData) {
  const winner = hthGetWinner(match);
  const colorSide = hthGetColorSide(match, fixtureData);

  const row = document.createElement('div');
  row.className = `hth-row hth-bar-${colorSide}`;

  const bar = document.createElement('div');
  bar.className = 'hth-bar';
  row.appendChild(bar);

  const content = document.createElement('div');
  content.className = 'hth-content';

  // ── 점수 행: [홈 로고+이름] [점수 중앙] [원정 이름+로고] ──
  const scoreRow = document.createElement('div');
  scoreRow.className = 'hth-score-row';

  // 홈팀
  const homeSide = document.createElement('div');
  homeSide.className = 'hth-team-side hth-team-home';
  if (match.homeTeamLogo) {
    const img = document.createElement('img');
    img.src = match.homeTeamLogo;
    img.alt = match.homeTeamName || 'HOME';
    img.className = 'hth-logo';
    homeSide.appendChild(img);
  }
  const homeNameEl = document.createElement('span');
  homeNameEl.className = 'hth-team-name';
  homeNameEl.textContent = match.homeTeamName || '';
  homeSide.appendChild(homeNameEl);

  // 점수 중앙
  const scoreCenter = document.createElement('div');
  scoreCenter.className = 'hth-score-center';

  const scoreMain = document.createElement('div');
  scoreMain.className = 'hth-score-main';

  const homeScoreEl = document.createElement('span');
  homeScoreEl.className = `hth-score ${
    winner === 'home' ? 'hth-score-win' : winner === 'draw' ? 'hth-score-draw' : 'hth-score-loss'
  }`;
  homeScoreEl.textContent = String(match.homeScore);

  const scoreSep = document.createElement('span');
  scoreSep.className = 'hth-score-sep';
  scoreSep.textContent = ' - ';

  const awayScoreEl = document.createElement('span');
  awayScoreEl.className = `hth-score ${
    winner === 'away' ? 'hth-score-win' : winner === 'draw' ? 'hth-score-draw' : 'hth-score-loss'
  }`;
  awayScoreEl.textContent = String(match.awayScore);

  scoreMain.append(homeScoreEl, scoreSep, awayScoreEl);
  scoreCenter.appendChild(scoreMain);

  if (match.homePenaltyScore != null) {
    const pk = document.createElement('div');
    pk.className = 'hth-pk-score';
    const pkHomeWin = match.homePenaltyScore > match.awayPenaltyScore;
    const pkHomeEl = document.createElement('span');
    pkHomeEl.className = pkHomeWin ? 'hth-score-win' : 'hth-score-loss';
    pkHomeEl.textContent = String(match.homePenaltyScore);
    const pkSepEl = document.createElement('span');
    pkSepEl.className = 'hth-pk-sep';
    pkSepEl.textContent = '-';
    const pkAwayEl = document.createElement('span');
    pkAwayEl.className = !pkHomeWin ? 'hth-score-win' : 'hth-score-loss';
    pkAwayEl.textContent = String(match.awayPenaltyScore);
    pk.append('PK (', pkHomeEl, pkSepEl, pkAwayEl, ')');
    scoreCenter.appendChild(pk);
  }

  // 원정팀
  const awaySide = document.createElement('div');
  awaySide.className = 'hth-team-side hth-team-away';
  const awayNameEl = document.createElement('span');
  awayNameEl.className = 'hth-team-name';
  awayNameEl.textContent = match.awayTeamName || '';
  awaySide.appendChild(awayNameEl);
  if (match.awayTeamLogo) {
    const img = document.createElement('img');
    img.src = match.awayTeamLogo;
    img.alt = match.awayTeamName || 'AWAY';
    img.className = 'hth-logo';
    awaySide.appendChild(img);
  }

  scoreRow.append(homeSide, scoreCenter, awaySide);
  content.appendChild(scoreRow);

  // ── 메타 행: [시즌·리그·라운드  LEFT] [경기장·날짜  RIGHT] ──
  // 공간 충분하면 한 줄(좌/우), 부족하면 두 줄(가운데) — hthCheckMetaWrap()이 wrap 감지 후 클래스 부여
  const metaRow = document.createElement('div');
  metaRow.className = 'hth-meta-row';

  const metaLeft = document.createElement('span');
  metaLeft.className = 'hth-meta hth-meta-left';
  metaLeft.textContent = [
    match.season ? `${match.season}/${String(match.season + 1).slice(-2)}` : '',
    match.leagueName || '',
    hthFormatRound(match.leagueRound),
  ].filter(Boolean).join(' · ');

  const metaRight = document.createElement('span');
  metaRight.className = 'hth-meta hth-meta-right';
  const venue = [match.venueName, match.venueCity].filter(Boolean).join(', ');
  metaRight.textContent = [venue, hthFormatDate(match.date)].filter(Boolean).join(' · ');

  metaRow.append(metaLeft, metaRight);
  content.appendChild(metaRow);

  row.appendChild(content);
  return row;
}

/** HTH 패널 제목 바 ('← 이벤트' 토글 버튼 + '상대 전적' 타이틀).
 *  lp-stat 컨텍스트에서는 cycle 버튼이 이미 있으므로 전환 버튼만 생략한다. */
function hthCreateTitleBar(container) {
  const isStatPanel = container?.closest?.('.lp-stat');

  const titleBar = document.createElement('div');
  titleBar.className = 'ev-title-bar';

  if (!isStatPanel) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'hth-toggle-btn';
    toggleBtn.title = '이벤트 패널로 전환';
    // events 아이콘 (점+줄 목록)
    toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><rect x="6" y="2" width="7" height="2" rx="1"/><circle cx="3" cy="7" r="1.5"/><rect x="6" y="6" width="7" height="2" rx="1"/><circle cx="3" cy="11" r="1.5"/><rect x="6" y="10" width="7" height="2" rx="1"/></svg>`;
    toggleBtn.addEventListener('click', () => hthSetMode('events'));
    titleBar.appendChild(toggleBtn);
  }

  const title = document.createElement('div');
  title.className = 'ev-title';
  title.textContent = '상대 전적';
  titleBar.appendChild(title);

  return titleBar;
}

/** 메타 행 wrap 감지 → .hth-meta-row-wrapped 토글 */
function hthCheckMetaWrap() {
  document.querySelectorAll('[data-hth-panel] .hth-meta-row').forEach(row => {
    const left = row.querySelector('.hth-meta-left');
    const right = row.querySelector('.hth-meta-right');
    if (!left || !right) return;
    const wrapped = right.getBoundingClientRect().top > left.getBoundingClientRect().bottom - 2;
    row.classList.toggle('hth-meta-row-wrapped', wrapped);
  });
}
window.addEventListener('resize', () => {
  if (_hthState.mode === 'hth') hthCheckMetaWrap();
});

/** 모든 [data-hth-panel]에 HTH 데이터 렌더링 */
function applyHthPanel(hthData, fixtureData, meta = {}) {
  _hthState.hthData = hthData;
  _hthState.fixtureData = fixtureData;
  _hthState.cacheKey = meta.cacheKey || hthGetCacheKey(fixtureData);
  _hthState.fetchedAt = Number(meta.fetchedAt) || Date.now();
  _hthState.expiresAt = Number(meta.expiresAt) || (_hthState.fetchedAt + HTH_CACHE_TTL_MS);

  document.querySelectorAll('[data-hth-panel]').forEach(container => {
    const titleBar = hthCreateTitleBar(container);
    const matches = Array.isArray(hthData?.matches) ? hthData.matches : [];
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'ev-empty';
      empty.textContent = '상대 전적 데이터가 없습니다';
      if (titleBar) container.replaceChildren(titleBar, empty);
      else container.replaceChildren(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'hth-list ev-list';
    matches.forEach(m => list.appendChild(hthCreateRow(m, fixtureData)));
    if (titleBar) container.replaceChildren(titleBar, list);
    else container.replaceChildren(list);
  });

  // 패널이 보이는 상태면 wrap 체크
  if (_hthState.mode === 'hth') requestAnimationFrame(hthCheckMetaWrap);

  // lp-stat cycle 버튼 상태 갱신 (Iter 7)
  if (typeof window.lpStatUpdateBtn === 'function') window.lpStatUpdateBtn();

  // HTH 데이터 로드 완료 후 이벤트 패널 제목바 재렌더 — '상대 전적' 토글 버튼 반영
  if (_hthState.mode === 'events' && window._eventsLastData && typeof window.applyEventsPanel === 'function') {
    window.applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

/**
 * 현재 fixture의 HTH 데이터를 보장한다.
 * - fresh cache가 있으면 네트워크 없이 바로 렌더.
 * - 같은 팀 조합 요청이 이미 진행 중이면 그 Promise를 재사용.
 * - 새 요청 응답은 현재 화면이 같은 fixture일 때만 적용하고, 아니어도 TTL 캐시는 보존.
 */
function hthEnsureLoadedForFixture(fixtureData = null, options = {}) {
  const data = hthGetFixtureData(fixtureData);
  const ids = hthGetTeamIds(data);
  const cacheKey = hthGetCacheKey(data);
  if (!ids || !cacheKey || typeof fetchHeadToHead !== 'function') return Promise.resolve(null);

  const cached = hthGetFreshCacheEntry(cacheKey);
  if (cached) {
    applyHthPanel(cached.data, data, cached);
    return Promise.resolve(cached.data);
  }

  if (_hthState.fetchPromise && _hthState.cacheKey === cacheKey) {
    return _hthState.fetchPromise;
  }

  if (options.renderLoading) hthRenderStatus('상대 전적 불러오는 중...');

  const fetchedAt = Date.now();
  _hthState.cacheKey = cacheKey;
  const mySeq = ++_hthState.requestSeq;
  const requestPromise = fetchHeadToHead(ids.homeTeamId, ids.awayTeamId, { silent: true })
    .then(hthData => {
      const entry = {
        data: hthData,
        cacheKey,
        fetchedAt,
        expiresAt: fetchedAt + HTH_CACHE_TTL_MS,
      };
      _hthCache.set(cacheKey, entry);
      hthPersistCache();

      if (_hthState.requestSeq === mySeq && hthGetCacheKey() === cacheKey) {
        applyHthPanel(hthData, data, entry);
      }
      return hthData;
    })
    .catch(err => {
      if (_hthState.requestSeq === mySeq && hthGetCacheKey() === cacheKey && options.renderLoading) {
        hthRenderStatus('상대 전적을 불러오지 못했습니다');
      }
      throw err;
    })
    .finally(() => {
      if (_hthState.fetchPromise === requestPromise) _hthState.fetchPromise = null;
    });

  _hthState.fetchPromise = requestPromise;
  return requestPromise;
}

function hthShowForFixture(fixtureData = null) {
  hthSetMode('hth');
  return hthEnsureLoadedForFixture(fixtureData, { renderLoading: !hthCurrentDataIsFresh(fixtureData) });
}

/**
 * 이벤트/HTH 패널 표시 전환.
 * 'events'로 전환 시 이벤트 패널 제목 바 재렌더 (토글 버튼 표시 갱신).
 */
function hthSetMode(mode) {
  _hthState.mode = mode === 'hth' ? 'hth' : 'events';
  hthUpdateVisibility();
  if (_hthState.mode === 'hth') {
    requestAnimationFrame(hthCheckMetaWrap);
  } else if (window._eventsLastData && typeof window.applyEventsPanel === 'function') {
    window.applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

/** lp-events-s 안의 [data-hth-panel]과 [data-events-panel] 가시성 갱신.
 *  .lp-stat [data-hth-panel]은 stat-cycle.js가 독립 관리하므로 건드리지 않음. */
function hthUpdateVisibility() {
  const isHth = _hthState.mode === 'hth';
  document.querySelectorAll('.lp-events-s [data-hth-panel]').forEach(el => {
    el.style.display = isHth ? '' : 'none';
  });
  document.querySelectorAll('.lp-events-s [data-events-panel]').forEach(el => {
    el.style.display = isHth ? 'none' : '';
  });
}

/**
 * 이벤트 배열이 비어있다가 채워질 때 HTH -> 이벤트 자동 전환.
 * fixture.js에서 applyEventsPanel 직후 호출.
 */
function hthAutoSwitch(events) {
  const hasEvents = Array.isArray(events) && events.length > 0;
  if (hasEvents && _hthState.mode === 'hth') {
    hthSetMode('events');
  }
}

/** fixture 전환 시 HTH 상태 초기화 */
function hthReset() {
  _hthState.hthData = null;
  _hthState.fixtureData = null;
  _hthState.cacheKey = '';
  _hthState.fetchedAt = 0;
  _hthState.expiresAt = 0;
  _hthState.fetchPromise = null;
  _hthState.requestSeq++;
  _hthState.mode = 'events';
  hthUpdateVisibility();
  document.querySelectorAll('[data-hth-panel]').forEach(el => { el.replaceChildren(); });
}

window.applyHthPanel = applyHthPanel;
window.hthCanLoadForFixture = hthCanLoadForFixture;
window.hthCurrentDataIsFresh = hthCurrentDataIsFresh;
window.hthEnsureLoadedForFixture = hthEnsureLoadedForFixture;
window.hthShowForFixture = hthShowForFixture;
window.hthSetMode = hthSetMode;
window.hthUpdateVisibility = hthUpdateVisibility;
window.hthAutoSwitch = hthAutoSwitch;
window.hthReset = hthReset;
window.hthCheckMetaWrap = hthCheckMetaWrap;
