/**
 * [전술판 벤치: 시점별 수동 교체와 드래그 UI]
 * 전술판에서 같은 팀의 벤치 선수와 피치 선수를 수동으로 교체하는 UI와 상태를 관리한다.
 * tactics-timeline.js가 만든 공식 시점별 명단을 기준으로 하며, API 교체 이벤트의 오류를
 * 수정하는 events-panel.js의 수동 연결과는 별도인 전술 실험용 기록이다.
 *
 * 처리 순서:
 *  1. 경기 ID를 동기화하고 선택한 타임라인 시점의 공식 명단을 가져온다.
 *  2. 해당 시점까지의 수동 교체를 순서대로 적용하되 이후 공식 교체/퇴장과 충돌한 기록은 건너뛴다.
 *  3. 합성된 명단으로 피치와 벤치를 표시하고, 벤치 토큰의 드래그를 받는다.
 *  4. 드롭 시 현재 명단과 같은 팀 조건을 다시 확인한 뒤 식별 키/시각을 기록하고 타임라인을 갱신한다.
 *  5. 드래그 종료·페이지 전환에서 UI 자원을 정리하며, 경기 변경 시에는 수동 기록도 초기화한다.
 *
 * changes에는 선수 객체를 직접 수정하는 대신 교체 시각과 두 선수의 식별 키를 기록한다.
 * 선택한 타임라인 시점의 공식 명단에 이 기록을 합성하므로 원본 API 명단은 유지된다.
 * 관련 선수의 공식 교체나 퇴장이 수동 기록 이후에 발생하면 그 시점부터 공식 상태가 우선한다.
 * 경기 변경은 전체 수동 상태를 비우지만, 같은 경기의 폴링은 현재 기록을 그대로 유지한다.
 */
// 수동 기록은 메모리에만 두며 저장소나 서버에 기록하지 않는다. changes는 경기 안의 타임라인
// 시각과 연결되고, open/drag/ignoreClickUntil은 트레이 표시 및 한 번의 포인터 동작을 관리한다.
const tacticsBenchState = { fixtureId: '', changes: [], open: { home: false, away: false }, drag: null, ignoreClickUntil: 0 };

/** ID가 없는 선수도 이름과 등번호를 함께 사용해 같은 선수끼리만 식별한다. */
function tacticsBenchPlayerKey(player) {
  const id = Number(player?.id ?? player?.playerId);
  if (id > 0) return `id:${id}`;
  const name = player?.name || player?.playerName || player?.nameKoLong || player?.nameKo || '';
  return `name:${String(name).trim().toLowerCase()}:${player?.number ?? ''}`;
}

/**
 * 경기 ID가 달라졌을 때만 드래그, 수동 교체 기록, 명단 열림 상태를 초기화한다.
 * 같은 ID의 재렌더에서는 돌아가므로 폴링 때문에 사용자의 전술 실험이 사라지지 않는다.
 * @param {string|number|null} id 현재 전술판에 연결된 경기 ID.
 */
function tacticsBenchSyncFixture(id) {
  id = String(id ?? '');
  if (tacticsBenchState.fixtureId === id) return;
  tacticsBenchCancelDrag(true);
  tacticsBenchState.fixtureId = id;
  tacticsBenchState.changes = [];
  tacticsBenchState.open = { home: false, away: false };
}

/**
 * 선택한 타임라인 시점의 명단에 유효한 수동 교체만 합성해 반환한다.
 * 각 팀의 선수 배열과 항목을 복제해 공식 명단을 수정하지 않는다. 수동 교체 이후부터
 * 선택 시점까지 두 선수 중 누구에게든 공식 이벤트가 적용됐으면 그 수동 기록은 건너뛴다.
 * 교체 투입 선수는 나가는 선수의 grid를 이어받고, 벤치로 나간 선수의 grid는 비운다.
 * @param {object} data 타임라인 시점의 경기 데이터 또는 합성할 경기 데이터.
 * @returns {object} 유효한 수동 교체가 반영된 데이터. 적용할 기록이 없으면 입력을 그대로 반환한다.
 */
function tacticsBenchApplyFixture(data) {
  tacticsBenchSyncFixture(data?.matchInfo?.fixtureId);
  if (!tacticsBenchState.changes.length) return data;
  const timeline = typeof tacticsTimelineState !== 'undefined' ? tacticsTimelineState : null;
  if (!timeline?.fixture || String(timeline.fixture.matchInfo?.fixtureId) !== tacticsBenchState.fixtureId) return data;
  const elapsed = data._tacticsTimelineAt ?? timeline.currentElapsed;
  // 이미 특정 시점으로 합성된 입력이면 그대로 기준으로 삼고, 아니면 공식 타임라인에서 다시 만든다.
  // cutoff는 추가시간/구간 경계를 포함한 공통 비교값으로, 화면의 정수 분과 직접 비교하지 않는다.
  const canonical = data._tacticsTimelineAt != null ? data : ttBuildFixtureAtTime(elapsed);
  const cutoff = evTimelineCutoff(elapsed);
  const result = { ...canonical };
  for (const side of ['home', 'away']) {
    const raw = canonical[`${side}Lineup`];
    if (!raw) continue;
    const starters = (raw.startXi || []).map(player => ({ ...player }));
    const bench = (raw.substitutes || []).map(player => ({ ...player }));
    const events = timeline.events[side] || [];
    const sourceLineup = timeline.fixture[`${side}Lineup`];
    const roster = [...(sourceLineup?.startXi || []), ...(sourceLineup?.substitutes || [])];
    for (const change of tacticsBenchState.changes) {
      // 과거 시점으로 슬라이더를 옮기면 미래의 수동 기록은 적용하지 않는다. 기록을 삭제하지
      // 않으므로 같은 경기에서 다시 해당 시점 이후로 이동하면 유효한 기록을 다시 합성할 수 있다.
      if (change.side !== side || change.at > cutoff) continue;
      const affected = [change.incoming, change.outgoing];
      const official = events.some(event => {
        // 수동 기록 직후부터 현재 시점까지의 공식 이벤트만 검사한다. 두 선수 중 하나라도
        // 공식 교체/퇴장에 관여했다면, 그 이후에는 공식 명단을 우선해 불가능한 재투입을 피한다.
        if (event._timeKey <= change.at || event._timeKey > cutoff) return false;
        // 전체 명단에서 매칭해 ID 누락과 동명이인도 기존 타임라인과 똑같이 판단한다.
        const matchers = [{ playerId: event.playerId, playerName: event.playerName, playerNameKoLong: event.playerNameKoLong }];
        if (event._kind === 'subst') matchers.push({ playerId: event.assistId, playerName: event.assistName, playerNameKoLong: event.assistNameKoLong });
        return matchers.some(matcher => {
          const player = roster[ttFindPlayerIndex(roster, matcher)];
          return player && affected.includes(tacticsBenchPlayerKey(player));
        });
      });
      if (official) continue;
      // 앞선 수동 교체까지 반영된 배열에서 두 역할을 다시 확인한다. 이미 피치를 떠난 선수나
      // 벤치에 없는 선수를 중복 교체하지 않고, 투입 선수는 나가는 선수의 배치만 이어받는다.
      const outIndex = starters.findIndex(player => !player._emptySlot && tacticsBenchPlayerKey(player) === change.outgoing);
      const inIndex = bench.findIndex(player => tacticsBenchPlayerKey(player) === change.incoming);
      if (outIndex < 0 || inIndex < 0) continue;
      const outgoing = starters[outIndex];
      starters[outIndex] = { ...bench[inIndex], grid: outgoing.grid || null };
      bench.splice(inIndex, 1, { ...outgoing, grid: null });
    }
    result[`${side}Lineup`] = { ...raw, startXi: starters, substitutes: bench };
  }
  return result;
}

/**
 * 같은 팀의 현재 벤치 선수와 실제 피치 선수를 확인한 뒤 현재 시각의 수동 교체를 기록한다.
 * 화면에 남은 오래된 토큰이나 빈 슬롯을 대상으로 기록하지 않도록 현재 명단에서도 다시
 * 확인하고, 성공하면 타임라인을 다시 합성해 피치와 벤치 표시를 함께 갱신한다.
 * @param {'home'|'away'} side 교체할 팀.
 * @param {string} incoming 투입할 벤치 선수의 식별 키.
 * @param {string} outgoing 피치에서 나갈 선수의 식별 키.
 * @returns {boolean} 교체 기록을 추가했는지 여부.
 */
function tacticsBenchSwap(side, incoming, outgoing) {
  const lineup = tacticsState.lineup?.[side];
  const bench = lineup?.bench || [];
  const incomingPlayer = bench.find(player => tacticsBenchPlayerKey(player) === incoming);
  const outgoingPlayer = lineup?.players.find(player => player?._benchKey === outgoing);
  if (!incomingPlayer || !outgoingPlayer || !tacticsBenchState.fixtureId) return false;
  // 화면 토큰이 아직 남아 있어도 폴링/타임라인 이동으로 공식 명단이 달라졌을 수 있다.
  // 현재 시점의 합성 결과에도 OUT이 실제 선발로 존재하는지 확인한 후에만 기록을 추가한다.
  const fixture = tacticsBenchApplyFixture(ttBuildFixtureAtTime(tacticsTimelineState.currentElapsed));
  const rawOutgoing = fixture[`${side}Lineup`]?.startXi.find(player => tacticsBenchPlayerKey(player) === outgoing);
  if (!rawOutgoing) return false;
  tacticsBenchState.changes.push({ side, incoming, outgoing, at: evTimelineCutoff(tacticsTimelineState.currentElapsed) });
  ttApplyTimelineToTactics(tacticsTimelineState.currentElapsed);
  return true;
}

/** 팀을 지정하면 그 팀의 수동 교체만 지우고, 생략하면 양쪽 기록과 명단 열림 상태를 함께 초기화한다. */
function tacticsBenchReset(side) {
  tacticsBenchCancelDrag(true);
  if (side === 'home' || side === 'away') {
    tacticsBenchState.changes = tacticsBenchState.changes.filter(change => change.side !== side);
  } else {
    tacticsBenchState.changes = [];
    tacticsBenchState.open = { home: false, away: false };
  }
  if (typeof tacticsTimelineState !== 'undefined' && tacticsTimelineState.fixture) {
    ttApplyTimelineToTactics(tacticsTimelineState.currentElapsed);
  } else tacticsBenchRender();
}

/** 피치의 화면상 경계를 사용해 회전된 피치에서도 벤치 UI 자체는 똑바로 배치한다. */
function tacticsBenchLayout() {
  const layer = document.getElementById('tactics-bench-layer');
  const pitch = document.getElementById('tactics-pitch');
  const wrap = document.getElementById('tactics-pitch-wrap');
  if (!layer || !pitch || !wrap || !wrap.offsetWidth) return;
  const frame = wrap.getBoundingClientRect(), rect = pitch.getBoundingClientRect();
  // 피치는 회전될 수 있지만 트레이는 화면에서 똑바로 보여야 한다. 화면상 피치 사각형을
  // wrap 기준의 배율 제거 좌표로 환산해 별도 레이어에 맞추며, 선수 배치 좌표는 바꾸지 않는다.
  const scale = frame.width / wrap.offsetWidth || 1;
  Object.assign(layer.style, { left: `${(rect.left - frame.left) / scale}px`, top: `${(rect.top - frame.top) / scale}px`,
    width: `${rect.width / scale}px`, height: `${rect.height / scale}px` });
  layer.style.setProperty('--td-scale', getComputedStyle(pitch).getPropertyValue('--td-scale') || '1');
  layer.classList.toggle('is-vertical', !!tdPitchVertical);
}

/**
 * 양쪽 벤치 트레이와 선수 토큰을 현재 합성 명단에 맞춰 갱신한다.
 * 드래그 중에는 캡처된 원본 토큰이 제거되지 않게 재렌더를 보류한다. 평상시에는 기존
 * 트레이를 재사용하고 선수 목록을 교체하되 스크롤 위치를 보존한다. 닫힌 트레이는
 * inert와 aria-hidden도 함께 설정해 보이지 않는 선수로 포커스가 들어가지 않게 한다.
 */
function tacticsBenchRender() {
  // 드래그 원본 DOM을 교체하면 포인터 캡처가 끊긴다. 드래그 중 폴링/리사이즈가 들어와도
  // 목록 재생성은 미루고 종료 정리 후 현재 명단으로 다시 그린다.
  if (tacticsBenchState.drag) return;
  const pitch = document.getElementById('tactics-pitch');
  const wrap = document.getElementById('tactics-pitch-wrap');
  if (!pitch || !wrap || typeof tacticsState === 'undefined') return;
  tacticsBenchSyncFixture(tacticsState.lineup?.fixtureId);
  let layer = document.getElementById('tactics-bench-layer');
  if (!layer) {
    layer = document.createElement('div'); layer.id = 'tactics-bench-layer'; wrap.append(layer);
    for (const side of ['home', 'away']) {
      const tray = document.createElement('section');
      tray.id = `tactics-bench-${side}`; tray.className = `td-bench-tray is-${side}`;
      tray.setAttribute('aria-label', `${side === 'home' ? '홈' : '원정'} 벤치 명단`);
      const header = document.createElement('div'); header.className = 'td-bench-header';
      const title = document.createElement('span'); title.textContent = '벤치 명단';
      const actions = document.createElement('div'); actions.className = 'td-bench-actions';
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'td-bench-reset';
      reset.title = `${side === 'home' ? '홈' : '원정'} 수동 교체 초기화`;
      reset.setAttribute('aria-label', reset.title);
      reset.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 5.5A5 5 0 1 1 3 10M3 2v4h4"/></svg>';
      reset.onclick = () => tacticsBenchReset(side);
      const close = document.createElement('button'); close.type = 'button';
      close.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m5 5 6 6M11 5l-6 6"/></svg>';
      close.setAttribute('aria-label', '벤치 명단 닫기');
      close.onclick = () => { tacticsBenchState.open[side] = false; tacticsBenchRender(); };
      actions.append(reset, close); header.append(title, actions);
      const list = document.createElement('div'); list.className = 'td-bench-list';
      tray.append(header, list); layer.append(tray);
    }
  }
  for (const side of ['home', 'away']) {
    const label = pitch.querySelector(`.td-team-label-${side}`);
    const open = tacticsBenchState.open[side];
    label.setAttribute('role', 'button'); label.tabIndex = 0;
    label.setAttribute('aria-controls', `tactics-bench-${side}`);
    label.setAttribute('aria-expanded', String(open)); label.title = '벤치 명단 열기/닫기';
    const tray = document.getElementById(`tactics-bench-${side}`);
    tray.classList.toggle('is-open', open); tray.inert = !open;
    tray.querySelector('.td-bench-reset').disabled = !tacticsBenchState.changes.some(change => change.side === side);
    tray.setAttribute('aria-hidden', String(!open));
    const color = { bg: getComputedStyle(label).getPropertyValue('--td-team-accent'),
      border: getComputedStyle(label).getPropertyValue('--td-team-accent'), text: getComputedStyle(label).getPropertyValue('--td-team-text') };
    const players = tacticsState.lineup?.[side]?.bench || [];
    const list = tray.querySelector('.td-bench-list');
    const scroll = { top: list.scrollTop, left: list.scrollLeft }; list.replaceChildren();
    for (const player of players) {
      const token = tacticsCreateToken(0, 0, 0, color, { ...player, nameKo: pickName(player, 'lineup') || player.name || '' }, true);
      token.className = 'td-bench-token'; token.dataset.kind = 'bench'; token.dataset.team = side;
      token.dataset.key = tacticsBenchPlayerKey(player); token.removeAttribute('style');
      token.title = '같은 팀 선수에게 드래그해 교체';
      token.addEventListener('pointerdown', tacticsBenchDragStart);
      list.append(token);
    }
    if (!players.length) { const empty = document.createElement('p'); empty.textContent = '벤치 명단이 없습니다'; list.append(empty); }
    list.scrollTop = scroll.top; list.scrollLeft = scroll.left;
  }
  tacticsBenchLayout();
}

/** 화면 포인터 좌표를 벤치 레이어의 로컬 좌표로 바꿔 화면 배율이 적용돼도 드래그 복제본을 같은 위치에 둔다. */
function tacticsBenchDragPoint(clientX, clientY) {
  const layer = document.getElementById('tactics-bench-layer');
  const rect = layer.getBoundingClientRect();
  const scale = rect.width / layer.offsetWidth || 1;
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

/**
 * 원본 벤치 토큰은 명단에 두고 이동용 복제본을 별도 레이어에 만든다.
 * 포인터 캡처와 window 리스너로 트레이 밖에서도 이동과 종료를 받으며,
 * 복제본 크기는 화면 배율을 제거한 레이아웃 단위로 저장한다.
 */
function tacticsBenchDragStart(event) {
  if (event.button !== 0 || tacticsBenchState.drag) return;
  event.preventDefault(); event.stopPropagation();
  const source = event.currentTarget, tray = source.closest('.td-bench-tray');
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true); ghost.className = 'td-bench-token td-bench-ghost';
  ghost.removeAttribute('id');
  const layer = document.getElementById('tactics-bench-layer');
  const scale = layer.getBoundingClientRect().width / layer.offsetWidth || 1;
  ghost.style.width = `${rect.width / scale}px`;
  const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const point = tacticsBenchDragPoint(origin.x, origin.y);
  ghost.style.left = `${point.x}px`; ghost.style.top = `${point.y}px`;
  layer.append(ghost); source.style.opacity = '.25';
  tacticsBenchState.drag = { source, tray, ghost, origin, side: source.dataset.team, key: source.dataset.key,
    pointerId: event.pointerId, target: null, outside: false };
  source.setPointerCapture(event.pointerId);
  window.addEventListener('pointermove', tacticsBenchDragMove);
  window.addEventListener('pointerup', tacticsBenchDragEnd);
  window.addEventListener('pointercancel', tacticsBenchDragEnd);
}

/** 이동 복제본을 따라가게 하고, 포인터 아래의 같은 팀 피치 토큰만 교체 대상으로 강조한다. */
function tacticsBenchDragMove(event) {
  const drag = tacticsBenchState.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = tacticsBenchDragPoint(event.clientX, event.clientY);
  drag.ghost.style.left = `${point.x}px`; drag.ghost.style.top = `${point.y}px`;
  const rect = drag.tray.getBoundingClientRect();
  if (!drag.outside && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) {
    drag.outside = true; drag.tray.classList.add('is-dragging-outside');
  }
  drag.target?.classList.remove('td-bench-drop-target');
  drag.target = document.elementsFromPoint(event.clientX, event.clientY)
    .find(node => node.matches?.(`.tactics-token[data-team="${drag.side}"]`)) || null;
  drag.target?.classList.add('td-bench-drop-target');
}

/**
 * 마지막 포인터 위치를 다시 판정해 유효한 같은 팀 선수에게 놓았을 때만 교체를 확정한다.
 * pointercancel은 교체를 적용하지 않으며, 종료 정리를 먼저 마친 뒤 타임라인을 재렌더한다.
 */
function tacticsBenchDragEnd(event) {
  const drag = tacticsBenchState.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  // 포인터를 놓은 실제 위치에서 같은 팀 선수만 교체 대상으로 판정한다.
  tacticsBenchDragMove(event);
  const index = Number(drag.target?.dataset.idx);
  const slot = drag.side === 'home' ? index : index - 11;
  const player = drag.target ? tacticsState.lineup?.[drag.side]?.players[slot] : null;
  const cancelled = event.type === 'pointercancel';
  const incoming = drag.key, outgoing = player?._benchKey, side = drag.side;
  // 먼저 전역 리스너/캡처/복제본을 정리한 뒤 교체한다. 타임라인 재렌더가 드래그 중 상태로
  // 오인되어 보류되거나, 제거된 DOM을 다음 pointermove가 참조하지 않도록 순서를 고정한다.
  tacticsBenchCancelDrag(false, !cancelled && !!outgoing);
  if (!cancelled && outgoing) tacticsBenchSwap(side, incoming, outgoing);
}

/**
 * 드래그 리스너, 캡처, 대상 강조를 정리하고 복제본을 제거하거나 원래 자리로 돌려보낸다.
 * 성공한 교체는 트레이를 닫고, 빈 곳에 놓은 경우는 원위치 애니메이션 뒤 명단을 갱신한다.
 * 종료 직후 300ms 동안 바깥 클릭을 무시해 같은 포인터 동작의 click이 트레이를 다시 닫지 않게 한다.
 * @param {boolean} immediate 경기 변경이나 강제 종료처럼 복귀 애니메이션을 생략할지 여부.
 * @param {boolean} accepted 유효한 교체 대상으로 드롭했는지 여부.
 */
function tacticsBenchCancelDrag(immediate = false, accepted = false) {
  const drag = tacticsBenchState.drag;
  if (!drag) return;
  tacticsBenchState.drag = null;
  tacticsBenchState.ignoreClickUntil = performance.now() + 300;
  window.removeEventListener('pointermove', tacticsBenchDragMove);
  window.removeEventListener('pointerup', tacticsBenchDragEnd);
  window.removeEventListener('pointercancel', tacticsBenchDragEnd);
  drag.target?.classList.remove('td-bench-drop-target');
  drag.source.style.opacity = '';
  if (drag.source.hasPointerCapture?.(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
  if (accepted) tacticsBenchState.open[drag.side] = false;
  drag.tray.classList.remove('is-dragging-outside');
  if (!immediate && !accepted && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const point = tacticsBenchDragPoint(drag.origin.x, drag.origin.y);
    drag.source.style.opacity = '0';
    const animation = drag.ghost.animate([{ left: drag.ghost.style.left, top: drag.ghost.style.top },
      { left: `${point.x}px`, top: `${point.y}px` }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    animation.finished.catch(() => {}).finally(() => { drag.ghost.remove(); tacticsBenchRender(); });
  } else { drag.ghost.remove(); tacticsBenchRender(); }
}

// 팀 라벨은 트레이를 열고, 트레이 바깥 클릭은 닫는다. 드래그 직후 발생하는 같은 동작의
// click은 ignoreClickUntil로 제외하며, 페이지 전환은 UI만 닫고 같은 경기의 수동 기록은 유지한다.
document.addEventListener('click', event => {
  const label = event.target.closest?.('.td-team-label-wrap');
  if (!label) {
    if (performance.now() < tacticsBenchState.ignoreClickUntil) return;
    if (event.target.closest?.('.td-bench-tray') || tacticsBenchState.drag) return;
    if (tacticsBenchState.open.home || tacticsBenchState.open.away) {
      tacticsBenchState.open = { home: false, away: false }; tacticsBenchRender();
    }
    return;
  }
  const side = label.classList.contains('td-team-label-home') ? 'home' : 'away';
  tacticsBenchState.open[side] = !tacticsBenchState.open[side]; tacticsBenchRender();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { tacticsBenchCancelDrag(true); tacticsBenchState.open = { home: false, away: false }; tacticsBenchRender(); }
  if (['Enter', ' '].includes(event.key) && event.target.matches?.('.td-team-label-wrap')) { event.preventDefault(); event.target.click(); }
});
document.addEventListener('page:activated', () => { tacticsBenchCancelDrag(true); tacticsBenchState.open = { home: false, away: false }; tacticsBenchRender(); });
document.addEventListener('DOMContentLoaded', () => {
  tacticsBenchRender();
  const observer = new ResizeObserver(tacticsBenchLayout);
  for (const id of ['tactics-pitch', 'tactics-pitch-wrap']) { const node = document.getElementById(id); if (node) observer.observe(node); }
});
window.addEventListener('resize', tacticsBenchLayout);
window.tacticsBenchRender = tacticsBenchRender;
window.tacticsBenchReset = tacticsBenchReset;
