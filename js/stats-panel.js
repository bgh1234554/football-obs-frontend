// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [경기 스탯 패널]
// fixture.teamStats(홈/원정)를 STATS_CONFIG.order 순서대로 페이지네이션해서 표시.
// 캠 큼(lp-stat)·캠 작음(lp-stat-s) 두 패널에 동일 데이터, 독립적인 페이지 상태로 렌더.
//
// 한 row 구조:
//   ┌──────────────────────────────────────────────┐
//   │   {homeVal}      {제목 가운데}      {awayVal} │
//   │ ━━━━━━━━━ {homeBar%} | {awayBar%} ━━━━━━━━━━ │
//   └──────────────────────────────────────────────┘
//   더 큰 값 쪽은 팀 컬러 원으로 강조 (homeBg/awayBg). 0:0이거나 동률은 강조 X.
//
// 페이지네이션:
//   - 항목 6개씩(기본). 페이지 < 2면 컨트롤 숨김.
//   - 좌우 화살표 버튼 + 점(dot) 인디케이터.
//   - 자동 스와이프 토글 ON일 때 STATS_CONFIG.autoSwipeIntervalMs 간격으로 자동 전환.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 패널별 상태(페이지 인덱스, 자동 스와이프 타이머) 보관 — 두 패널 독립.
const statsPanelStates = new WeakMap();
let statsLastFixtureData = null;

function stRerenderActivePanels() {
  if (statsLastFixtureData == null) return;
  document.querySelectorAll('.page.active [data-stat-panel]').forEach(panel => {
    stRenderPanel(panel, statsLastFixtureData);
  });
}

/** API 응답의 색상이 #으로 시작 안 할 수 있어 정규화. "1d4ed8" → "#1d4ed8". */
function stEnsureHashColor(c) {
  if (!c) return null;
  const s = String(c).trim();
  if (!s) return null;
  if (s.startsWith('#') || s.startsWith('rgb') || s.startsWith('hsl')) return s;
  if (/^[0-9a-fA-F]{3,8}$/.test(s)) return '#' + s;
  return s;
}

/** "#RRGGBB"/"#RGB" → {r,g,b}. 실패 시 null. */
function stHexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.trim().replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(m)) {
    return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
  }
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    return { r: parseInt(m[0] + m[0], 16), g: parseInt(m[1] + m[1], 16), b: parseInt(m[2] + m[2], 16) };
  }
  return null;
}

/** 두 색의 RGB 거리(0~441). 70 이하면 시각적으로 거의 비슷 → 구분선 필요. */
function stColorDistance(a, b) {
  if (!a || !b) return Infinity;
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** RGB 보색 — "rgb(r,g,b)" 문자열. 막대 경계선 색상으로 사용 (홈 컬러 반대). */
function stInvertRgb(rgb) {
  if (!rgb) return 'rgba(0,0,0,.6)';
  return `rgb(${255 - rgb.r}, ${255 - rgb.g}, ${255 - rgb.b})`;
}

/** 스탯 값을 숫자로 변환. "31%" → 31, null → null, "1.23" → 1.23. 비교/막대 비율 계산용. */
function stParseNumber(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const s = String(val).trim().replace('%', '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** 한 row의 표시 문자열. 숫자는 그대로, %는 그대로, null은 "-". */
function stDisplayValue(val) {
  if (val == null) return '-';
  if (typeof val === 'number') return String(val);
  return String(val);
}

/**
 * passesPercent가 null이면 passesAccurate/totalPasses로 계산한 % 반환.
 * 그 외 키는 stats 객체에서 그대로 꺼냄.
 */
function stResolveValue(stats, key) {
  if (!stats) return null;
  if (key === 'passesPercent') {
    if (stats.passesPercent != null && String(stats.passesPercent).trim() !== '') return stats.passesPercent;
    const total = stParseNumber(stats.totalPasses);
    const accurate = stParseNumber(stats.passesAccurate);
    if (total && accurate != null) return Math.round((accurate / total) * 100) + '%';
    return null;
  }
  return stats[key] ?? null;
}

/**
 * fixture data → 표시할 stat row 목록.
 * STATS_CONFIG.order 순회, 양 팀 모두 null/빈값이면 skip.
 * 반환: [{ key, label, homeVal, awayVal }, ...]
 */
function stCollectRows(fixtureData) {
  const cfg = window.STATS_CONFIG;
  if (!cfg) return [];
  const teamStats = Array.isArray(fixtureData?.teamStats) ? fixtureData.teamStats : [];
  const home = teamStats.find(s => s?.side === 'home') || null;
  const away = teamStats.find(s => s?.side === 'away') || null;

  const rows = [];
  for (const key of cfg.order) {
    const label = cfg.labels[key];
    if (!label) continue;
    const homeVal = stResolveValue(home, key);
    const awayVal = stResolveValue(away, key);
    // 양쪽 다 null/빈문자열이면 skip
    const homeEmpty = homeVal == null || String(homeVal).trim() === '';
    const awayEmpty = awayVal == null || String(awayVal).trim() === '';
    if (homeEmpty && awayEmpty) continue;
    // goalsPrevented는 양쪽 모두 0이면 의미 없는 항목으로 skip (사용자 요청).
    if (key === 'goalsPrevented') {
      const h = stParseNumber(homeVal) ?? 0;
      const a = stParseNumber(awayVal) ?? 0;
      if (h === 0 && a === 0) continue;
    }
    rows.push({ key, label, homeVal, awayVal });
  }
  return rows;
}

/** 배열을 size 단위로 chunk. */
function stChunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 막대 비율 + 강조 여부 계산. 0:0이거나 동률이면 강조 X. */
function stComputeBar(homeVal, awayVal) {
  const h = stParseNumber(homeVal);
  const a = stParseNumber(awayVal);
  // 한쪽 null인 경우 0으로 취급 (이미 collectRows에서 양쪽 모두 null인 경우는 제거됨)
  const hn = h ?? 0;
  const an = a ?? 0;
  const total = hn + an;
  if (total === 0) {
    return { homePct: 50, awayPct: 50, emphasize: 'none', zeroTotal: true };
  }
  const homePct = (hn / total) * 100;
  const awayPct = (an / total) * 100;
  let emphasize = 'none';
  if (hn > an) emphasize = 'home';
  else if (an > hn) emphasize = 'away';
  return { homePct, awayPct, emphasize, zeroTotal: false };
}

/** 한 stat row의 DOM 생성. fixtureData → matchInfo → state.colors 순으로 팀 컬러 fallback. */
function stCreateRow(row, fixtureData) {
  const m = fixtureData?.matchInfo || {};
  // 우선순위: API matchInfo 컬러 → state.colors(사용자 override 반영) → 하드코딩 default
  const stateCol = (typeof state !== 'undefined' && state?.colors) ? state.colors : {};
  const homeBg = stEnsureHashColor(stateCol.homeBg) || stEnsureHashColor(m.homePrimaryColor) || '#1d4ed8';
  const homeText = stEnsureHashColor(stateCol.homeText) || stEnsureHashColor(m.homeNumberColor) || '#ffffff';
  const awayBg = stEnsureHashColor(stateCol.awayBg) || stEnsureHashColor(m.awayPrimaryColor) || '#ef4444';
  const awayText = stEnsureHashColor(stateCol.awayText) || stEnsureHashColor(m.awayNumberColor) || '#ffffff';

  const { homePct, awayPct, emphasize, zeroTotal } = stComputeBar(row.homeVal, row.awayVal);

  const el = document.createElement('div');
  el.className = 'st-row';

  // 상단: 홈 값 / 제목 / 원정 값
  const top = document.createElement('div');
  top.className = 'st-top';

  const homeV = document.createElement('div');
  homeV.className = 'st-val st-val-home' + (emphasize === 'home' ? ' is-emphasized' : '');
  homeV.textContent = stDisplayValue(row.homeVal);
  if (emphasize === 'home') {
    homeV.style.background = homeBg;
    homeV.style.color = homeText;
  }
  top.appendChild(homeV);

  const title = document.createElement('div');
  title.className = 'st-title';
  title.textContent = row.label;
  top.appendChild(title);

  const awayV = document.createElement('div');
  awayV.className = 'st-val st-val-away' + (emphasize === 'away' ? ' is-emphasized' : '');
  awayV.textContent = stDisplayValue(row.awayVal);
  if (emphasize === 'away') {
    awayV.style.background = awayBg;
    awayV.style.color = awayText;
  }
  top.appendChild(awayV);

  el.appendChild(top);

  // 하단: 비율 막대 (홈 왼쪽, 원정 오른쪽). 0:0이면 50/50 회색.
  const bar = document.createElement('div');
  bar.className = 'st-bar';
  const homeFill = document.createElement('div');
  homeFill.className = 'st-bar-home';
  homeFill.style.width = homePct.toFixed(2) + '%';
  homeFill.style.background = zeroTotal ? 'rgba(255,255,255,.25)' : homeBg;
  const awayFill = document.createElement('div');
  awayFill.className = 'st-bar-away';
  awayFill.style.width = awayPct.toFixed(2) + '%';
  awayFill.style.background = zeroTotal ? 'rgba(255,255,255,.25)' : awayBg;
  bar.appendChild(homeFill);
  bar.appendChild(awayFill);

  // 팀 컬러가 비슷할 때 막대 경계에 가는 구분선 추가 (홈 컬러 보색).
  // 0:0 또는 동률은 50/50이라 경계 의미 약함 → 구분선 X.
  if (!zeroTotal) {
    const homeRgb = stHexToRgb(homeBg);
    const awayRgb = stHexToRgb(awayBg);
    const dist = stColorDistance(homeRgb, awayRgb);
    if (dist < 80) {
      const divider = document.createElement('div');
      divider.className = 'st-bar-divider';
      divider.style.left = homePct.toFixed(2) + '%';
      divider.style.background = stInvertRgb(homeRgb);
      bar.appendChild(divider);
    }
  }
  el.appendChild(bar);

  return el;
}

/** 자동 스와이프 타이머 정리. */
function stClearAutoSwipe(state) {
  if (state.autoTimer) {
    clearInterval(state.autoTimer);
    state.autoTimer = null;
  }
}

/** 자동 스와이프가 settings에서 ON인지 여부. */
function stIsAutoSwipeEnabled() {
  const swipeMode = (typeof getSetting === 'function') ? getSetting('statsAutoSwipe') : 'off';
  return swipeMode === 'on';
}

/**
 * 자동 스와이프 ON 시 일정 간격으로 페이지 advance.
 * - settings에서 statsAutoSwipe='on' + statsAutoSwipeSec 읽음.
 * - 없으면 STATS_CONFIG.autoSwipeIntervalMs 기본값.
 * - state.paused가 true이면 ON이어도 타이머 시작 안 함 (사용자가 일시정지 누른 상태).
 */
function stSetupAutoSwipe(panel, state, totalPages) {
  stClearAutoSwipe(state);
  if (totalPages < 2) return;
  if (!stIsAutoSwipeEnabled()) return;
  if (state.paused) return;
  const cfgInterval = window.STATS_CONFIG?.autoSwipeIntervalMs || 10000;
  // settings는 초 단위로 저장됨(0.5초 단위 입력). ms로 변환.
  const userSec = (typeof getSetting === 'function') ? Number(getSetting('statsAutoSwipeSec')) : NaN;
  const intervalMs = Number.isFinite(userSec) && userSec >= 0.5 ? Math.round(userSec * 1000) : cfgInterval;
  state.autoTimer = setInterval(() => {
    state.page = (state.page + 1) % totalPages;
    stRenderPanel(panel, statsLastFixtureData);
  }, intervalMs);
}

/**
 * 컨테이너 높이 기반으로 한 페이지에 들어갈 수 있는 row 수를 동적 계산.
 * 화면이 클수록 더 많은 항목이 한 페이지에 들어가서 페이지 수 자동으로 줄어듦.
 * 측정 못하면 STATS_CONFIG.itemsPerPage 기본값.
 */
function stComputeItemsPerPage(panel) {
  const cfg = window.STATS_CONFIG;
  const fallback = cfg?.itemsPerPage || 6;
  const titleBar = panel.querySelector('.st-title-bar');
  const controls = panel.querySelector('.st-controls');
  const titleH = titleBar ? titleBar.getBoundingClientRect().height : 24;
  const controlsH = controls ? controls.getBoundingClientRect().height : 28;
  const totalH = panel.clientHeight;
  if (!totalH) return fallback;
  const rowH = 30; // st-row 평균 높이 (제목 줄 + 4px 막대 + 4px gap)
  const gap = 4;
  const padding = 16; // panel 위아래 padding 합계
  const avail = totalH - titleH - controlsH - padding;
  if (avail <= 0) return fallback;
  const fits = Math.floor((avail + gap) / (rowH + gap))-1;
  return Math.max(1, fits);
}

/** 한 패널 렌더 (재진입 가능 — page state 변경 후 다시 호출). */
function stRenderPanel(panel, fixtureData) {
  if (!panel) return;
  let state = statsPanelStates.get(panel);
  if (!state) {
    state = { page: 0, autoTimer: null, paused: false };
    statsPanelStates.set(panel, state);
  }

  const rows = stCollectRows(fixtureData);

  panel.innerHTML = '';

  // 제목 줄 — 교체명단/부상 패널 톤 유지
  const titleBar = document.createElement('div');
  titleBar.className = 'st-title-bar';
  titleBar.textContent = '경기 스탯';
  panel.appendChild(titleBar);

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'st-empty';
    empty.textContent = '데이터가 없습니다';
    panel.appendChild(empty);
    stClearAutoSwipe(state);
    return;
  }

  // 동적 itemsPerPage — 사용자 화면 크기에 맞춰 한 페이지에 가능한 한 많이 표시
  const itemsPerPage = stComputeItemsPerPage(panel);
  const pages = stChunk(rows, itemsPerPage);
  if (state.page >= pages.length) state.page = pages.length - 1;
  if (state.page < 0) state.page = 0;

  const wrap = document.createElement('div');
  wrap.className = 'st-wrap';

  const pageEl = document.createElement('div');
  pageEl.className = 'st-page';
  pages[state.page].forEach(row => pageEl.appendChild(stCreateRow(row, fixtureData)));
  wrap.appendChild(pageEl);

  // 페이지 컨트롤 (페이지 2개 이상일 때만)
  if (pages.length > 1) {
    const controls = document.createElement('div');
    controls.className = 'st-controls';

    const prev = document.createElement('button');
    prev.className = 'st-arrow st-arrow-prev';
    prev.type = 'button';
    prev.setAttribute('aria-label', '이전 페이지');
    prev.textContent = '‹';
    prev.addEventListener('click', () => {
      state.page = (state.page - 1 + pages.length) % pages.length;
      stRenderPanel(panel, fixtureData);
    });

    const dots = document.createElement('div');
    dots.className = 'st-dots';
    pages.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'st-dot' + (i === state.page ? ' is-active' : '');
      dot.addEventListener('click', () => {
        state.page = i;
        stRenderPanel(panel, fixtureData);
      });
      dots.appendChild(dot);
    });

    // 일시정지 버튼 — 자동 스와이프 ON일 때만 좌우 화살표 사이에 노출.
    // paused 상태면 ▶ (재생) 표시, 진행 중이면 ❚❚ (일시정지) 표시.
    let pauseBtn = null;
    if (stIsAutoSwipeEnabled()) {
      pauseBtn = document.createElement('button');
      pauseBtn.className = 'st-pause' + (state.paused ? ' is-paused' : '');
      pauseBtn.type = 'button';
      pauseBtn.setAttribute('aria-label', state.paused ? '자동 스와이프 재생' : '자동 스와이프 일시정지');
      pauseBtn.textContent = state.paused ? '▶' : '❚❚';
      pauseBtn.addEventListener('click', () => {
        state.paused = !state.paused;
        stRenderPanel(panel, fixtureData);
      });
    }

    const next = document.createElement('button');
    next.className = 'st-arrow st-arrow-next';
    next.type = 'button';
    next.setAttribute('aria-label', '다음 페이지');
    next.textContent = '›';
    next.addEventListener('click', () => {
      state.page = (state.page + 1) % pages.length;
      stRenderPanel(panel, fixtureData);
    });

    controls.appendChild(prev);
    controls.appendChild(dots);
    controls.appendChild(next);
    if (pauseBtn) controls.appendChild(pauseBtn); // 오른쪽 구석에 absolute 배치 (CSS .st-pause)
    wrap.appendChild(controls);
  }

  panel.appendChild(wrap);

  stSetupAutoSwipe(panel, state, pages.length);
}

/**
 * fixture data를 받아서 모든 [data-stat-panel] 컨테이너에 렌더.
 * fixture.js에서 applyLineupPanels와 함께 호출.
 */
function applyStatsPanel(fixtureData) {
  statsLastFixtureData = fixtureData;
  document.querySelectorAll('[data-stat-panel]').forEach(panel => {
    stRenderPanel(panel, fixtureData);
  });
  requestAnimationFrame(() => {
    stRerenderActivePanels();
  });
}

// settings 변경(자동 스와이프 토글/간격) 감지 시 즉시 반영.
// settings-popup.js가 document에 dispatch함.
document.addEventListener('settings:change', e => {
  const cat = e.detail?.category;
  if (cat === 'statsAutoSwipe' || cat === 'statsAutoSwipeSec') {
    if (statsLastFixtureData != null) applyStatsPanel(statsLastFixtureData);
  }
});

document.addEventListener('theme:colors-changed', e => {
  if (statsLastFixtureData == null) return;
  const key = e.detail?.key;
  if (!['homeBg', 'homeText', 'awayBg', 'awayText'].includes(key)) return;
  applyStatsPanel(statsLastFixtureData);
});

document.addEventListener('page:activated', () => {
  requestAnimationFrame(() => {
    stRerenderActivePanels();
  });
});

window.addEventListener('resize', () => {
  requestAnimationFrame(() => {
    stRerenderActivePanels();
  });
});

window.applyStatsPanel = applyStatsPanel;
