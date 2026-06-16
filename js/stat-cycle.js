// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [캠 큰 패널 사이클 — Iter 7 + 자동 사이클 확장]
// lp-stat 안에서 스탯/이벤트/상대전적/홈교체/원정교체를 하나의 버튼으로 순환.
// 자동 사이클: statCycleAuto 설정 ON일 때 statsAutoSwipeSec 간격으로 자동 전환.
//   - 스탯 패널: 모든 페이지가 다 보인 뒤(statspanel:cycle-done) 다음 패널로 이동.
//   - 이벤트 패널: 맨 아래에서 시작 → 75% 동안 위로 스크롤, 25% 동안 맨 위 유지.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _lpStatCycle = { mode: 'stats' };
window._lpStatCycle = _lpStatCycle;

// 자동 사이클 내부 상태
const _lpAuto = {
  timer: null,          // setTimeout ID (비-stats 모드 또는 stats 단일페이지 fallback)
  fallback: null,       // stats 다중페이지 fallback timeout
  listening: false,     // statspanel:cycle-done 대기 중 여부
  scrollRaf: null,      // 이벤트 패널 스크롤 rAF
  scrollTimer: null,    // 이벤트 패널 스크롤 end timer
  scrollProgrammatic: false,
  scrollProgrammaticTimer: null,
  scrollExpectedTop: null,
  scrollListeners: [],
};

const _LP_SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

const _STAT_CYCLE_LABELS = {
  stats: '스탯',
  events: '이벤트',
  hth: '상대전적',
  bench_home: '홈 교체',
  bench_away: '원정 교체',
};

const _STAT_CYCLE_ICONS = {
  stats:      `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="8" width="3" height="5"/><rect x="5.5" y="4" width="3" height="9"/><rect x="10" y="1" width="3" height="12"/></svg>`,
  events:     `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><rect x="6" y="2" width="7" height="2" rx="1"/><circle cx="3" cy="7" r="1.5"/><rect x="6" y="6" width="7" height="2" rx="1"/><circle cx="3" cy="11" r="1.5"/><rect x="6" y="10" width="7" height="2" rx="1"/></svg>`,
  hth:        `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h10M9 2l2 2-2 2"/><path d="M13 10H3M5 8l-2 2 2 2"/></svg>`,
  bench_home: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM1 14h4V8.5L3 7 1 8.5V14zm8 0h4V8.5L11 7 9 8.5V14z"/><path d="M5 10h4v1H5z" opacity=".45"/></svg>`,
  bench_away: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM1 14h4V8.5L3 7 1 8.5V14zm8 0h4V8.5L11 7 9 8.5V14z"/><path d="M5 10h4v1H5z" opacity=".45"/></svg>`,
};

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function _lpIsCycleAutoOn() {
  return (typeof getSetting === 'function') && getSetting('statCycleAuto') === 'on';
}

function _lpIsStatsAutoSwipeOn() {
  return (typeof getSetting === 'function') && getSetting('statsAutoSwipe') === 'on';
}

function _lpGetIntervalMs() {
  const cfgMs = window.STATS_CONFIG?.autoSwipeIntervalMs || 10000;
  const userSec = (typeof getSetting === 'function') ? Number(getSetting('statsAutoSwipeSec')) : NaN;
  return Number.isFinite(userSec) && userSec >= 0.5 ? Math.round(userSec * 1000) : cfgMs;
}

/** lp-stat 안의 stat 패널 점 개수(= 총 페이지 수). 렌더 직후 DOM에서 읽음. */
function _lpStatPageCount() {
  const panel = document.querySelector('.lp-stat [data-stat-panel]');
  if (!panel) return 1;
  const dots = panel.querySelectorAll('.st-dot');
  return Math.max(1, dots.length);
}

/** lp-stat 안의 이벤트 패널 스크롤 컨테이너 */
function _lpEventsScrollEl() {
  const panel = document.querySelector('.lp-stat [data-events-panel]');
  return panel?.querySelector('.ev-list') || panel;
}

// ─── 이벤트 패널 자동 스크롤 ─────────────────────────────────────────────────

function _lpAddEventsScrollListener(el, type, handler, options) {
  el.addEventListener(type, handler, options);
  _lpAuto.scrollListeners.push({ el, type, handler, options });
}

function _lpClearEventsScrollListeners() {
  _lpAuto.scrollListeners.forEach(({ el, type, handler, options }) => {
    el.removeEventListener(type, handler, options);
  });
  _lpAuto.scrollListeners = [];
}

function _lpPointerLooksLikeScrollbarDrag(event, el) {
  if (!event || !el || event.button !== 0) return false;
  const rect = el.getBoundingClientRect();
  const scrollbarWidth = Math.max(0, el.offsetWidth - el.clientWidth);
  if (scrollbarWidth <= 0) return false;
  const hitWidth = Math.max(10, scrollbarWidth + 2);
  return event.clientX >= rect.right - hitWidth
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
}

function _lpSetEventsScrollTop(el, value) {
  _lpAuto.scrollProgrammatic = true;
  _lpAuto.scrollExpectedTop = value;
  el.scrollTop = value;
  if (_lpAuto.scrollProgrammaticTimer) clearTimeout(_lpAuto.scrollProgrammaticTimer);
  _lpAuto.scrollProgrammaticTimer = setTimeout(() => {
    _lpAuto.scrollProgrammatic = false;
    _lpAuto.scrollProgrammaticTimer = null;
  }, 0);
}

function _lpStopEventsScroll() {
  if (_lpAuto.scrollRaf) { cancelAnimationFrame(_lpAuto.scrollRaf); _lpAuto.scrollRaf = null; }
  if (_lpAuto.scrollTimer) { clearTimeout(_lpAuto.scrollTimer); _lpAuto.scrollTimer = null; }
  if (_lpAuto.scrollProgrammaticTimer) {
    clearTimeout(_lpAuto.scrollProgrammaticTimer);
    _lpAuto.scrollProgrammaticTimer = null;
  }
  _lpAuto.scrollProgrammatic = false;
  _lpAuto.scrollExpectedTop = null;
  _lpClearEventsScrollListeners();
}

function _lpCancelEventsScrollByUser() {
  if (_lpStatCycle.mode !== 'events') return;
  _lpStopEventsScroll();
}

function _lpBindEventsScrollInterruption(el) {
  _lpClearEventsScrollListeners();
  const cancel = () => _lpCancelEventsScrollByUser();
  const onPointerDown = event => {
    if (_lpPointerLooksLikeScrollbarDrag(event, el)) cancel();
  };
  const onKeyDown = event => {
    if (_LP_SCROLL_KEYS.has(event.key)) cancel();
  };
  const onScroll = () => {
    if (_lpAuto.scrollProgrammatic) return;
    if (_lpAuto.scrollExpectedTop != null
      && Math.abs(el.scrollTop - _lpAuto.scrollExpectedTop) <= 1) {
      return;
    }
    cancel();
  };

  _lpAddEventsScrollListener(el, 'wheel', cancel, { passive: true });
  _lpAddEventsScrollListener(el, 'touchstart', cancel, { passive: true });
  _lpAddEventsScrollListener(el, 'pointerdown', onPointerDown, { passive: true });
  _lpAddEventsScrollListener(el, 'keydown', onKeyDown);
  _lpAddEventsScrollListener(el, 'scroll', onScroll, { passive: true });
}

/**
 * 이벤트 패널에 스크롤이 있으면 맨 아래에서 시작해
 * intervalMs의 75% 동안 등속도로 맨 위까지 스크롤한다.
 * 이후 나머지 25% 동안 맨 위를 보여준 뒤 다음 패널로 자동 전환한다.
 */
function _lpStartEventsScroll(intervalMs) {
  _lpStopEventsScroll();
  const el = _lpEventsScrollEl();
  if (!el) {
    _lpAuto.scrollTimer = setTimeout(() => lpStatAutoAdvance(), intervalMs);
    return;
  }
  _lpBindEventsScrollInterruption(el);

  const scrollDuration = Math.max(0, intervalMs * 0.75);
  const waitAfter = Math.max(0, intervalMs - scrollDuration);

  const startAfterLayout = () => {
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    _lpSetEventsScrollTop(el, maxScroll);

    if (maxScroll <= 0 || scrollDuration <= 0) {
      _lpSetEventsScrollTop(el, 0);
      _lpClearEventsScrollListeners();
      _lpAuto.scrollTimer = setTimeout(() => lpStatAutoAdvance(), intervalMs);
      return;
    }

    const startTime = performance.now();
    const tick = now => {
      const progress = Math.min((now - startTime) / scrollDuration, 1);
      _lpSetEventsScrollTop(el, maxScroll * (1 - progress));

      if (progress < 1) {
        _lpAuto.scrollRaf = requestAnimationFrame(tick);
      } else {
        _lpSetEventsScrollTop(el, 0);
        _lpAuto.scrollTimer = setTimeout(() => lpStatAutoAdvance(), waitAfter);
      }
    };

    _lpAuto.scrollRaf = requestAnimationFrame(tick);
  };

  _lpAuto.scrollRaf = requestAnimationFrame(() => {
    _lpAuto.scrollRaf = requestAnimationFrame(startAfterLayout);
  });
}

// ─── 자동 사이클 제어 ────────────────────────────────────────────────────────

function _lpAutoClear() {
  if (_lpAuto.timer) { clearTimeout(_lpAuto.timer); _lpAuto.timer = null; }
  if (_lpAuto.fallback) { clearTimeout(_lpAuto.fallback); _lpAuto.fallback = null; }
  _lpAuto.listening = false;
  _lpStopEventsScroll();
}

/** 현재 모드에 맞게 자동 사이클 타이머/리스너 셋업 */
function _lpAutoStart() {
  _lpAutoClear();
  if (!_lpIsCycleAutoOn()) return;
  const modes = lpStatAvailableModes();
  if (modes.length < 2) return;

  const intervalMs = _lpGetIntervalMs();
  const mode = _lpStatCycle.mode;

  if (mode === 'stats') {
    const pages = _lpStatPageCount();
    if (pages <= 1 || !_lpIsStatsAutoSwipeOn()) {
      // 단일 페이지이거나 스탯 자동스와이프가 꺼진 경우도 현재 패널 기준 interval 후 전환
      _lpAuto.timer = setTimeout(() => lpStatAutoAdvance(), intervalMs);
    } else {
      // 다중 페이지 → statspanel:cycle-done 이벤트 대기 + safety fallback
      _lpAuto.listening = true;
      _lpAuto.fallback = setTimeout(() => {
        if (_lpAuto.listening) lpStatAutoAdvance();
      }, (intervalMs * pages) + 500);
    }
  } else if (mode === 'events') {
    _lpStartEventsScroll(intervalMs);
  } else {
    // hth / bench_home / bench_away
    _lpAuto.timer = setTimeout(() => lpStatAutoAdvance(), intervalMs);
  }
}

/** 다음 모드로 전환하고 자동 사이클 재시작 */
function lpStatAutoAdvance() {
  _lpAutoClear();
  const modes = lpStatAvailableModes();
  if (modes.length < 2) return;
  const idx = modes.indexOf(_lpStatCycle.mode);
  _lpStatCycle.mode = modes[(idx + 1) % modes.length];
  lpStatUpdateVisibility();
  lpStatEnsureModeReady(_lpStatCycle.mode);
  // lpStatUpdateVisibility 내에서 _lpAutoStart() 호출됨
}

// ─── 가용 모드 / 가시성 / 버튼 ───────────────────────────────────────────────

function lpStatAvailableModes() {
  const modes = ['stats'];
  const hasEvents = Array.isArray(window._eventsLastData?.events)
    && window._eventsLastData.events.length > 0;
  const hasHth = typeof window.hthCanLoadForFixture === 'function'
    && window.hthCanLoadForFixture(window._eventsLastData);
  const hasBenchHome = !!(window._lpStatBenchData?.home);
  const hasBenchAway = !!(window._lpStatBenchData?.away);
  if (hasEvents) modes.push('events');
  if (hasHth) modes.push('hth');
  if (hasBenchHome) modes.push('bench_home');
  if (hasBenchAway) modes.push('bench_away');
  return modes;
}

function lpStatEnsureModeReady(mode) {
  if (mode !== 'hth' || typeof window.hthEnsureLoadedForFixture !== 'function') return;
  const needsLoading = !(typeof window.hthCurrentDataIsFresh === 'function'
    && window.hthCurrentDataIsFresh(window._eventsLastData));
  window.hthEnsureLoadedForFixture(window._eventsLastData, { renderLoading: needsLoading })
    .catch(err => console.warn('HTH fetch failed:', err));
}

function lpStatUpdateVisibility() {
  const available = lpStatAvailableModes();
  if (!available.includes(_lpStatCycle.mode)) _lpStatCycle.mode = 'stats';
  const mode = _lpStatCycle.mode;

  document.querySelectorAll('.lp-stat [data-stat-panel]').forEach(el => {
    el.style.display = mode === 'stats' ? '' : 'none';
  });
  document.querySelectorAll('.lp-stat [data-hth-panel]').forEach(el => {
    el.style.display = mode === 'hth' ? '' : 'none';
    if (mode === 'hth') requestAnimationFrame(() => window.hthCheckMetaWrap?.());
  });
  document.querySelectorAll('.lp-stat [data-events-panel]').forEach(el => {
    el.style.display = mode === 'events' ? '' : 'none';
    if (mode === 'events') requestAnimationFrame(() => window.evRefitPanelRows?.(el));
  });
  document.querySelectorAll('.lp-stat [data-bench-home-panel]').forEach(el => {
    el.style.display = mode === 'bench_home' ? '' : 'none';
  });
  document.querySelectorAll('.lp-stat [data-bench-away-panel]').forEach(el => {
    el.style.display = mode === 'bench_away' ? '' : 'none';
  });

  lpStatUpdateBtn();
  _lpAutoStart();
}

function lpStatUpdateBtn() {
  const available = lpStatAvailableModes();
  const canCycle = available.length > 1;
  const autoOn = _lpIsCycleAutoOn();
  document.querySelectorAll('.lp-stat-cycle-btn').forEach(btn => {
    btn.style.display = canCycle ? '' : 'none';
    if (canCycle) {
      const icon = _STAT_CYCLE_ICONS[_lpStatCycle.mode] || _STAT_CYCLE_ICONS.stats;
      const label = _STAT_CYCLE_LABELS[_lpStatCycle.mode] || '스탯';
      btn.innerHTML = icon;
      btn.title = label + (autoOn ? ' (자동 전환 중)' : '');
      btn.classList.toggle('is-auto', autoOn);
    }
  });
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

function lpStatCycleNext() {
  // 수동 클릭 시 자동 타이머 초기화 후 수동 전환
  _lpAutoClear();
  const modes = lpStatAvailableModes();
  const idx = modes.indexOf(_lpStatCycle.mode);
  _lpStatCycle.mode = modes[(idx + 1) % modes.length];
  lpStatUpdateVisibility();
  lpStatEnsureModeReady(_lpStatCycle.mode);
}

function lpStatReset() {
  _lpAutoClear();
  _lpStatCycle.mode = 'stats';
  window._lpStatBenchData = null;
  lpStatUpdateVisibility();
}

// ─── 이벤트 리스너 ────────────────────────────────────────────────────────────

// stats 패널이 마지막 페이지 자동 스와이프 후 발생시키는 이벤트
document.addEventListener('statspanel:cycle-done', event => {
  const fromBigStatPanel = typeof event.target?.closest === 'function'
    && !!event.target.closest('.lp-stat');
  if (!fromBigStatPanel) return;
  if (_lpAuto.listening && _lpStatCycle.mode === 'stats') {
    lpStatAutoAdvance();
  }
});

// 자동 사이클 설정 변경 시 즉시 반영
document.addEventListener('settings:change', e => {
  const cat = e.detail?.category;
  if (cat === 'statCycleAuto' || cat === 'statsAutoSwipe' || cat === 'statsAutoSwipeSec') {
    _lpAutoClear();
    _lpAutoStart();
    lpStatUpdateBtn();
  }
});

// window 노출
window.lpStatCycleNext = lpStatCycleNext;
window.lpStatReset = lpStatReset;
window.lpStatUpdateBtn = lpStatUpdateBtn;
window.lpStatUpdateVisibility = lpStatUpdateVisibility;
window.lpStatAutoAdvance = lpStatAutoAdvance;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.lp-stat-cycle-btn').forEach(btn => {
    btn.addEventListener('click', lpStatCycleNext);
  });
  lpStatUpdateBtn();
});
