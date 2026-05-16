// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [캠 큰 패널 사이클 — Iter 7]
// lp-stat 안에서 스탯/이벤트/상대전적을 하나의 버튼으로 순환.
// applyEventsPanel / applyHthPanel이 끝날 때 lpStatUpdateBtn() 호출.
// fixture 전환 시 lpStatReset() 호출.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _lpStatCycle = { mode: 'stats' };
window._lpStatCycle = _lpStatCycle;

const _STAT_CYCLE_LABELS = { stats: '스탯', events: '이벤트', hth: '상대전적' };

const _STAT_CYCLE_ICONS = {
  stats:  `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="8" width="3" height="5"/><rect x="5.5" y="4" width="3" height="9"/><rect x="10" y="1" width="3" height="12"/></svg>`,
  events: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><rect x="6" y="2" width="7" height="2" rx="1"/><circle cx="3" cy="7" r="1.5"/><rect x="6" y="6" width="7" height="2" rx="1"/><circle cx="3" cy="11" r="1.5"/><rect x="6" y="10" width="7" height="2" rx="1"/></svg>`,
  hth:    `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h10M9 2l2 2-2 2"/><path d="M13 10H3M5 8l-2 2 2 2"/></svg>`,
};

/** 현재 데이터 기준 사용 가능한 모드 목록 */
function lpStatAvailableModes() {
  const modes = ['stats'];
  const hasEvents = Array.isArray(window._eventsLastData?.events)
    && window._eventsLastData.events.length > 0;
  const hasHth = typeof window.hthCanLoadForFixture === 'function'
    && window.hthCanLoadForFixture(window._eventsLastData);
  if (hasEvents) modes.push('events');
  if (hasHth) modes.push('hth');
  return modes;
}

/** .lp-stat 안의 패널 가시성 갱신 */
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
  lpStatUpdateBtn();
}

/** 사이클 버튼 아이콘·가시성 갱신 */
function lpStatUpdateBtn() {
  const available = lpStatAvailableModes();
  const canCycle = available.length > 1;
  document.querySelectorAll('.lp-stat-cycle-btn').forEach(btn => {
    btn.style.display = canCycle ? '' : 'none';
    if (canCycle) {
      btn.innerHTML = _STAT_CYCLE_ICONS[_lpStatCycle.mode] || _STAT_CYCLE_ICONS.stats;
      btn.title = _STAT_CYCLE_LABELS[_lpStatCycle.mode] || '스탯';
    }
  });
}

/** 버튼 클릭 시 다음 가용 모드로 이동 */
function lpStatCycleNext() {
  const modes = lpStatAvailableModes();
  const idx = modes.indexOf(_lpStatCycle.mode);
  _lpStatCycle.mode = modes[(idx + 1) % modes.length];
  lpStatUpdateVisibility();
  if (_lpStatCycle.mode === 'hth' && typeof window.hthEnsureLoadedForFixture === 'function') {
    const needsLoading = !(typeof window.hthCurrentDataIsFresh === 'function'
      && window.hthCurrentDataIsFresh(window._eventsLastData));
    window.hthEnsureLoadedForFixture(window._eventsLastData, { renderLoading: needsLoading })
      .catch(err => console.warn('HTH fetch failed:', err));
  }
}

/** fixture 전환 시 스탯 모드로 리셋 */
function lpStatReset() {
  _lpStatCycle.mode = 'stats';
  lpStatUpdateVisibility();
}

window.lpStatCycleNext = lpStatCycleNext;
window.lpStatReset = lpStatReset;
window.lpStatUpdateBtn = lpStatUpdateBtn;
window.lpStatUpdateVisibility = lpStatUpdateVisibility;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.lp-stat-cycle-btn').forEach(btn => {
    btn.addEventListener('click', lpStatCycleNext);
  });
  lpStatUpdateBtn();
});
