// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [전술판 시간 슬라이더 / 라인업 재구성] (Iter 5-8)
//
// 전술판에서 "경기 시점 T"의 라인업을 재현하기 위한 모듈.
//   - 슬라이더로 0~max분 사이 임의 시점 선택 가능
//   - subst IN/OUT, Red Card, Second Yellow Card 이벤트만 라인업 변화에 영향
//   - 슬라이더 변경 시 그 시점까지의 이벤트를 누적 적용해 startXi/벤치 재구성 후 전술판 갱신
//   - 풀스크린 모드: 우측 슬라이드 인 패널 + 토글 버튼
//
// 기본 슬라이더 위치:
//   - pre-FT (경기 진행 중/전): 가장 최근 이벤트 시점 (= 현재 라인업 상태)
//   - post-FT: 0' (= 선발 라인업, 전술 분석에 자연스러움)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const tacticsTimelineState = {
  fixture: null,            // 마지막으로 받은 fixture data
  events: [],               // 라인업 변화에 영향 주는 이벤트만 추출 (subst/Red/Second Yellow)
  maxElapsed: 90,           // 슬라이더 max (가장 늦은 이벤트 시각 또는 90' 중 큰 값)
  currentElapsed: 0,        // 현재 슬라이더 위치
  isFullscreenPanelOpen: false,
};

/** 이벤트 elapsed + extra 합산해서 정렬용 sortable number로 변환. */
function ttEventTimeKey(ev) {
  const elapsed = Number(ev?.elapsed ?? 0);
  const extra = Number(ev?.extra ?? 0);
  return elapsed + (Number.isFinite(extra) ? extra * 0.01 : 0);
}

/**
 * 라인업 재구성 헬퍼 — 선수 ID/이름 매칭. lpFindLineupPlayerIndex와 동일한 로직.
 * lineup-events.js의 함수를 재사용하되, 미로드 시 fallback도 제공.
 */
function ttFindPlayerIndex(players, matcher) {
  if (typeof lpFindLineupPlayerIndex === 'function') {
    return lpFindLineupPlayerIndex(players, matcher);
  }
  // fallback: ID 매칭만 시도
  if (!Array.isArray(players) || !matcher) return -1;
  const id = String(matcher.playerId ?? '');
  if (!id) return -1;
  return players.findIndex(p => String(p?.playerId) === id);
}

/**
 * 이벤트 종류 판정.
 * - 'subst': type === 'subst' (playerId=OUT, assistId=IN)
 * - 'red'  : type === 'Card' && (detail === 'Red Card' || 'Second Yellow Card')
 * - null   : 라인업 변화에 영향 없음
 */
function ttClassifyEvent(ev) {
  if (!ev) return null;
  const type = String(ev.type || '').toLowerCase();
  if (type === 'subst') return 'subst';
  if (type === 'card') {
    const d = String(ev.detail || '').trim().toLowerCase();
    if (d === 'red card' || d === 'second yellow card') return 'red';
  }
  return null;
}

/**
 * 라인업 변화에 영향 주는 이벤트만 추출 + 시간 오름차순 정렬 + side별 분리.
 * 반환: { home: [...], away: [...] } — 각 배열은 시간순.
 */
function ttCollectLineupEvents(rawEvents) {
  const home = [];
  const away = [];
  (Array.isArray(rawEvents) ? rawEvents : []).forEach(ev => {
    const kind = ttClassifyEvent(ev);
    if (!kind) return;
    const enriched = { ...ev, _kind: kind, _timeKey: ttEventTimeKey(ev) };
    if (ev.side === 'home') home.push(enriched);
    else if (ev.side === 'away') away.push(enriched);
  });
  home.sort((a, b) => a._timeKey - b._timeKey);
  away.sort((a, b) => a._timeKey - b._timeKey);
  return { home, away };
}

/**
 * 단일 사이드의 라인업을 시점 T까지 재구성.
 *
 * 1) startXi/substitutes를 깊은 복사 (원본 보존)
 * 2) elapsed ≤ T인 이벤트를 시간순으로 적용:
 *    - subst: OUT 선수를 startXi에서 제거 → 벤치로 이동(grid를 IN에게 승계),
 *             IN 선수를 벤치에서 startXi로 이동 (subReflect=on 동작과 동일)
 *    - red/second yellow: 해당 선수를 startXi 또는 벤치에서 제거 (피치 빈 자리)
 * 3) 결과 lineup 객체 반환
 */
function ttReconstructLineupAtTime(rawLineup, sideEvents, targetElapsed) {
  if (!rawLineup) return rawLineup;
  const startXi = Array.isArray(rawLineup.startXi) ? rawLineup.startXi.map(p => ({ ...p })) : [];
  const substitutes = Array.isArray(rawLineup.substitutes) ? rawLineup.substitutes.map(p => ({ ...p })) : [];

  const cutoff = Number(targetElapsed) + 0.999; // extra 포함 동일 분 이벤트도 포함

  for (const ev of sideEvents) {
    if (ev._timeKey > cutoff) break;

    if (ev._kind === 'subst') {
      const outIdx = ttFindPlayerIndex(startXi, {
        playerId: ev.playerId, playerName: ev.playerName, playerNameKoLong: ev.playerNameKoLong,
      });
      const inIdx = ttFindPlayerIndex(substitutes, {
        playerId: ev.assistId, playerName: ev.assistName, playerNameKoLong: ev.assistNameKoLong,
      });
      if (outIdx === -1 || inIdx === -1) continue; // 데이터 누락 → 무시

      const outPlayer = startXi[outIdx];
      const inPlayer = substitutes[inIdx];
      // grid 승계: IN 선수가 OUT 자리로
      const newStarter = { ...inPlayer, grid: outPlayer.grid || inPlayer.grid || null };
      const benchPlayer = { ...outPlayer, grid: null };

      startXi.splice(outIdx, 1, newStarter);
      substitutes.splice(inIdx, 1);
      substitutes.unshift(benchPlayer);
      continue;
    }

    if (ev._kind === 'red') {
      const matcher = { playerId: ev.playerId, playerName: ev.playerName, playerNameKoLong: ev.playerNameKoLong };
      // 1) 선발에서 찾으면 그 자리를 빈 자리로 표시 (null 대신 placeholder)
      const sIdx = ttFindPlayerIndex(startXi, matcher);
      if (sIdx !== -1) {
        const removed = startXi[sIdx];
        startXi.splice(sIdx, 1, { _emptySlot: true, grid: removed.grid || null });
        continue;
      }
      // 2) 벤치에서 찾으면 그냥 제거 (피치 영향 없음)
      const bIdx = ttFindPlayerIndex(substitutes, matcher);
      if (bIdx !== -1) substitutes.splice(bIdx, 1);
    }
  }

  return { ...rawLineup, startXi, substitutes };
}

/**
 * 시점 T에서의 양 팀 라인업을 재구성한 fixture 데이터 반환.
 * tacticsApplyLineup이 받을 수 있는 형태(= buildEffectiveFixtureData 결과와 호환).
 */
function ttBuildFixtureAtTime(targetElapsed) {
  const fx = tacticsTimelineState.fixture;
  if (!fx) return null;

  const homeEvents = tacticsTimelineState.events.home || [];
  const awayEvents = tacticsTimelineState.events.away || [];

  return {
    ...fx,
    homeLineup: ttReconstructLineupAtTime(fx.homeLineup, homeEvents, targetElapsed),
    awayLineup: ttReconstructLineupAtTime(fx.awayLineup, awayEvents, targetElapsed),
  };
}

/**
 * 슬라이더 변경 → 그 시점 라인업을 전술판에 적용.
 * lineup-panel.js의 syncTacticsBoard와 같은 흐름이지만, 시간 컷오프된 데이터로 호출.
 */
function ttApplyTimelineToTactics(targetElapsed) {
  const reconstructed = ttBuildFixtureAtTime(targetElapsed);
  if (!reconstructed) return;
  if (typeof syncTacticsBoard === 'function') {
    syncTacticsBoard(reconstructed, { preservePositions: true });
  }
}

/** 슬라이더의 max 값 — 가장 늦은 이벤트 시각 또는 (extra 포함) 90' 중 큰 값. 최소 90. */
function ttComputeMaxElapsed(events) {
  const all = [...events.home, ...events.away];
  if (!all.length) return 90;
  const latest = all.reduce((max, ev) => Math.max(max, Math.ceil(ev._timeKey)), 0);
  return Math.max(90, latest);
}

/** 기본 슬라이더 위치 결정 — pre-FT는 최신 이벤트 시점, post-FT(매치 종료)는 0'. */
function ttComputeDefaultPosition(fixture, events) {
  const status = String(fixture?.matchInfo?.status || '');
  const isFt = status === 'FT';
  if (isFt) return 0;

  const all = [...events.home, ...events.away];
  if (!all.length) return Number(fixture?.matchInfo?.elapsed) || 0;
  const latest = all.reduce((max, ev) => Math.max(max, Math.ceil(ev._timeKey)), 0);
  return latest;
}

/**
 * 타임라인 이벤트 칩 DOM 빌드 (지하철 노선도 스타일).
 *
 * 추상화 정책:
 *   - 모든 이벤트(홈+원정)를 시간순 정렬 후 고유 시간을 "stop"으로 변환
 *   - 각 stop을 균등 간격(1/(N+1) 비율)으로 배치 — 실제 분에 비례하지 않음
 *   - 0%과 100% 양 끝은 0'와 max'로 사용. stop들은 그 사이를 균등 분할.
 *   - 같은 stop의 같은 팀 이벤트는 lane 분리 없이 그대로 겹쳐서 표시
 *   - 슬라이더는 stop index step(0 = 0', N+1 = max') → 드래그하면 stop으로 자동 snap
 *
 * 스트리머 사용 편의: 절대 시간보다 "n번째 이벤트 시점"이 더 의미 있음.
 *   이벤트 사이 빈 시간을 시각적으로 압축해서 칩이 균등하게 보임.
 */
function ttRenderMarkers() {
  const homeHost = document.getElementById('tactics-timeline-events-home');
  const awayHost = document.getElementById('tactics-timeline-events-away');
  if (!homeHost || !awayHost) return;
  homeHost.innerHTML = '';
  awayHost.innerHTML = '';

  const slider = document.getElementById('tactics-time-slider');
  const max = tacticsTimelineState.maxElapsed || 90;

  // 1) 모든 이벤트 시간순 정렬 + 고유 시간 추출 → stops 배열
  const allEvents = [
    ...tacticsTimelineState.events.home,
    ...tacticsTimelineState.events.away,
  ].sort((a, b) => a._timeKey - b._timeKey);

  // 같은 분(소수점 차이 < 0.5 = 거의 동시)을 한 stop으로 묶기
  const stopTimes = [];
  allEvents.forEach(ev => {
    const t = Math.ceil(ev._timeKey);
    if (!stopTimes.length || stopTimes[stopTimes.length - 1] !== t) {
      stopTimes.push(t);
    }
  });

  // 2) 각 stop을 균등 간격 % 위치로 매핑.
  //    0%은 kickoff(0'), 100%은 max'(경기 끝). 그 사이를 stop 수+1로 균등 분할.
  //    예: stop이 6개면 위치 = [14.3%, 28.6%, 42.9%, 57.1%, 71.4%, 85.7%]
  function stopPctByIdx(idx) {
    if (stopTimes.length === 0) return 50;
    return ((idx + 1) / (stopTimes.length + 1)) * 100;
  }
  function stopIdxOf(time) {
    const t = Math.ceil(time);
    return stopTimes.indexOf(t);
  }

  // 캐시: 슬라이더가 stop index 단위로 동작하도록 stops 정보를 state에 저장.
  tacticsTimelineState.stopTimes = stopTimes;

  // 3) 슬라이더 설정 — value 0 = kickoff, value (stopTimes.length+1) = max'
  if (slider) {
    slider.min = '0';
    slider.max = String(stopTimes.length + 1);
    slider.step = '1';
    // currentElapsed에 가장 가까운 stop으로 초기 위치 설정
    const curIdx = stopIdxOf(tacticsTimelineState.currentElapsed);
    if (curIdx >= 0) slider.value = String(curIdx + 1);
    else if (tacticsTimelineState.currentElapsed >= max) slider.value = String(stopTimes.length + 1);
    else slider.value = '0';
  }

  /**
   * (side, minute) 키로 이벤트 그룹핑 — 동일 시점 동일 팀 이벤트는 하나의 칩으로 묶는다.
   * 같은 stop, 같은 사이드에 여러 이벤트가 있을 때 칩이 겹쳐서 hover가 어색해지는 문제 해결.
   * 그룹 내 kind가 섞이면(subst+red 동시 — 매우 드뭄) red 우선으로 시각 강조.
   */
  function groupEventsByStop(events) {
    const map = new Map();
    events.forEach(ev => {
      const minute = Math.ceil(ev._timeKey);
      const key = String(minute);
      if (!map.has(key)) map.set(key, { minute, items: [] });
      map.get(key).items.push(ev);
    });
    return Array.from(map.values()).sort((a, b) => a.minute - b.minute);
  }

  /** 그룹 → 단일 칩 DOM. 항목 수 ≥ 2면 ×N 배지 표시, 툴팁에는 모든 이벤트 나열. */
  function makeGroupChip(group, side) {
    const minute = group.minute;
    const idx = stopIdxOf(minute);
    const pct = stopPctByIdx(idx >= 0 ? idx : 0);

    // 그룹 kind 우선순위: red > subst (드물지만 동시간 발생 가능)
    const hasRed = group.items.some(ev => ev._kind === 'red');
    const groupKind = hasRed ? 'red' : 'subst';

    // 툴팁: 각 이벤트를 줄바꿈으로 나열
    const lines = group.items.map(ev => {
      const playerName = ev.playerNameKoLong || ev.playerName || '';
      const assistName = ev.assistNameKoLong || ev.assistName || '';
      if (ev._kind === 'subst') {
        return `교체 — OUT: ${playerName}${assistName ? ' / IN: ' + assistName : ''}`;
      }
      return `퇴장 — ${playerName}`;
    });
    const titleText = `${minute}'\n${lines.join('\n')}`;

    const wrap = document.createElement('div');
    wrap.className = `td-tl-event kind-${groupKind} side-${side}`;
    wrap.style.left = `${pct}%`;
    if (side === 'home') wrap.style.bottom = '0';
    else wrap.style.top = '0';
    wrap.title = titleText;

    const glyph = groupKind === 'subst' ? '⇅' : '▮';
    const countBadge = group.items.length > 1 ? `<span class="td-tl-count">×${group.items.length}</span>` : '';
    wrap.innerHTML = `<span class="td-tl-glyph">${glyph}</span>${countBadge}<span class="td-tl-time">${minute}'</span>`;

    wrap.addEventListener('click', () => {
      tacticsTimelineState.currentElapsed = minute;
      if (slider && idx >= 0) slider.value = String(idx + 1);
      ttUpdateTimeLabel();
      ttApplyTimelineToTactics(minute);
    });
    return wrap;
  }

  // 4) (side, minute) 그룹핑 후 그룹마다 칩 1개씩 그리기 — 동시간 동일팀 칩 겹침 문제 해결
  groupEventsByStop(tacticsTimelineState.events.home).forEach(g => homeHost.appendChild(makeGroupChip(g, 'home')));
  groupEventsByStop(tacticsTimelineState.events.away).forEach(g => awayHost.appendChild(makeGroupChip(g, 'away')));

  // 컨테이너 height는 단일 칩 높이만 차지하면 됨 (overlap 사용)
  homeHost.style.height = '';
  awayHost.style.height = '';
}

/** "현재 시각" 라벨 갱신. */
function ttUpdateTimeLabel() {
  const cur = document.getElementById('tactics-time-current');
  const max = document.getElementById('tactics-time-max');
  if (cur) cur.textContent = `${tacticsTimelineState.currentElapsed}'`;
  if (max) max.textContent = `${tacticsTimelineState.maxElapsed}'`;
}

/**
 * 외부 진입점 — 새 fixture data가 도착하면 호출되어 타임라인 패널과 이벤트 패널을 갱신.
 * fixture.js의 fetchAndApplyFixtureData에서 applyEventsPanel 직후에 호출되도록 wire up 필요.
 */
function applyTacticsTimeline(fixtureData) {
  if (!fixtureData) {
    tacticsTimelineState.fixture = null;
    tacticsTimelineState.events = { home: [], away: [] };
    tacticsTimelineState.maxElapsed = 90;
    tacticsTimelineState.currentElapsed = 0;
    ttUpdateTimeLabel();
    const homeHost = document.getElementById('tactics-timeline-events-home');
    const awayHost = document.getElementById('tactics-timeline-events-away');
    const markerHost = document.getElementById('tactics-timeline-markers');
    if (homeHost) homeHost.innerHTML = '';
    if (awayHost) awayHost.innerHTML = '';
    if (markerHost) markerHost.innerHTML = '';
    const slider = document.getElementById('tactics-time-slider');
    if (slider) slider.value = '0';
    return;
  }

  tacticsTimelineState.fixture = fixtureData;
  tacticsTimelineState.events = ttCollectLineupEvents(fixtureData.events);
  tacticsTimelineState.maxElapsed = ttComputeMaxElapsed(tacticsTimelineState.events);
  tacticsTimelineState.currentElapsed = ttComputeDefaultPosition(fixtureData, tacticsTimelineState.events);

  const slider = document.getElementById('tactics-time-slider');
  if (slider) {
    slider.max = String(tacticsTimelineState.maxElapsed);
    slider.value = String(tacticsTimelineState.currentElapsed);
  }
  ttUpdateTimeLabel();
  ttRenderMarkers();
  ttApplyTimelineToTactics(tacticsTimelineState.currentElapsed);
}

/**
 * 슬라이더 input 핸들러 — 지하철 노선도 모드.
 * 슬라이더 value는 stop INDEX 단위 (step=1):
 *   value 0           = 0' 킥오프 (이벤트 적용 전)
 *   value 1..N        = N번째 stop (해당 stop 시간까지 이벤트 적용된 라인업)
 *   value N+1         = max' 경기 종료
 * step=1이므로 자동으로 stop마다 snap된다.
 */
function ttBindSlider() {
  const slider = document.getElementById('tactics-time-slider');
  if (!slider) return;
  slider.addEventListener('input', () => {
    const idx = Number(slider.value) || 0;
    const stops = tacticsTimelineState.stopTimes || [];
    const max = tacticsTimelineState.maxElapsed || 90;
    let minute;
    if (idx === 0) minute = 0;                       // 킥오프
    else if (idx > stops.length) minute = max;       // 경기 종료
    else minute = stops[idx - 1];                    // N번째 stop
    tacticsTimelineState.currentElapsed = minute;
    ttUpdateTimeLabel();
    ttApplyTimelineToTactics(minute);
  });
}

/**
 * 풀스크린 슬라이드 토글 — 토글 버튼 + 닫기 버튼 + 외부 클릭으로 닫기.
 *   - `‹‹ 타임라인` 버튼: 패널 슬라이드 인 (도구 사이드바 하단)
 *   - 패널 우상단 `×` 버튼: 슬라이드 아웃
 *   - 풀스크린에서 패널 외부 영역 클릭: 슬라이드 아웃
 */
function ttBindFullscreenToggle() {
  const openBtn = document.getElementById('td-timeline-toggle');
  const closeBtn = document.getElementById('td-timeline-close');
  const panel = document.getElementById('tactics-timeline-panel');
  if (!panel) return;

  const setOpen = (next) => {
    tacticsTimelineState.isFullscreenPanelOpen = next;
    panel.classList.toggle('is-open', next);
    if (openBtn) openBtn.textContent = next ? '›› 타임라인' : '‹‹ 타임라인';
  };

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!panel.classList.contains('is-open'));
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(false);
    });
  }

  // 풀스크린 + 패널이 열려있을 때만 외부 클릭으로 닫기.
  // 일반 모드에서는 패널이 인라인이라 외부 클릭으로 닫을 필요 없음.
  document.addEventListener('click', (e) => {
    if (!document.fullscreenElement) return;
    if (!panel.classList.contains('is-open')) return;
    if (panel.contains(e.target)) return;
    if (openBtn && openBtn.contains(e.target)) return;
    setOpen(false);
  });
}

/**
 * 전술판 이벤트 패널이 (재)렌더될 때마다 #tactics-timeline-bar를 패널 내부 .ev-title-bar 바로 아래로 이동.
 * events-panel.js가 'events-panel:rendered' 이벤트를 dispatch — 그때마다 끼워넣어야 replaceChildren에 의해
 * 사라지지 않는다. data-events-panel-source="tactics"인 패널만 대상.
 */
function ttInjectTimelineIntoEventsPanel(panel) {
  if (!panel || panel.dataset.eventsPanelSource !== 'tactics') return;
  const timeline = document.getElementById('tactics-timeline-bar');
  const titleBar = panel.querySelector('.ev-title-bar');
  if (!timeline || !titleBar) return;
  // 이미 올바른 위치에 있으면 no-op
  if (timeline.previousElementSibling === titleBar) return;
  titleBar.insertAdjacentElement('afterend', timeline);
}

document.addEventListener('events-panel:rendered', (e) => {
  ttInjectTimelineIntoEventsPanel(e.target);
});

document.addEventListener('DOMContentLoaded', () => {
  ttBindSlider();
  ttBindFullscreenToggle();
  ttUpdateTimeLabel();
  // 첫 로드 시 fixture 데이터가 없을 수 있으므로, 패널이 이미 렌더돼 있으면 즉시 삽입.
  const panel = document.querySelector('#tactics-events-host [data-events-panel]');
  if (panel) ttInjectTimelineIntoEventsPanel(panel);
});

// 외부에 노출 — fixture.js와 lineup-panel.js에서 호출
window.applyTacticsTimeline = applyTacticsTimeline;
