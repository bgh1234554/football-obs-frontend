// 전술판의 수동 교체는 원본 경기 명단과 분리하고 선택한 타임라인 시점에만 합성한다.
const tacticsBenchState = { fixtureId: '', changes: [], open: { home: false, away: false }, drag: null, ignoreClickUntil: 0 };

/** ID가 없는 선수도 이름과 등번호를 함께 사용해 같은 선수끼리만 식별한다. */
function tacticsBenchPlayerKey(player) {
  const id = Number(player?.id ?? player?.playerId);
  if (id > 0) return `id:${id}`;
  const name = player?.name || player?.playerName || player?.nameKoLong || player?.nameKo || '';
  return `name:${String(name).trim().toLowerCase()}:${player?.number ?? ''}`;
}

function tacticsBenchSyncFixture(id) {
  id = String(id ?? '');
  if (tacticsBenchState.fixtureId === id) return;
  tacticsBenchCancelDrag(true);
  tacticsBenchState.fixtureId = id;
  tacticsBenchState.changes = [];
  tacticsBenchState.open = { home: false, away: false };
}

/** 공식 교체·퇴장이 수동 교체의 어느 선수에든 적용되면 그 시점부터 공식 명단을 따른다. */
function tacticsBenchApplyFixture(data) {
  tacticsBenchSyncFixture(data?.matchInfo?.fixtureId);
  if (!tacticsBenchState.changes.length) return data;
  const timeline = typeof tacticsTimelineState !== 'undefined' ? tacticsTimelineState : null;
  if (!timeline?.fixture || String(timeline.fixture.matchInfo?.fixtureId) !== tacticsBenchState.fixtureId) return data;
  const elapsed = data._tacticsTimelineAt ?? timeline.currentElapsed;
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
      if (change.side !== side || change.at > cutoff) continue;
      const affected = [change.incoming, change.outgoing];
      const official = events.some(event => {
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

/** 같은 팀의 현재 벤치 선수와 피치 선수만 맞교환한다. */
function tacticsBenchSwap(side, incoming, outgoing) {
  const lineup = tacticsState.lineup?.[side];
  const bench = lineup?.bench || [];
  const incomingPlayer = bench.find(player => tacticsBenchPlayerKey(player) === incoming);
  const outgoingPlayer = lineup?.players.find(player => player?._benchKey === outgoing);
  if (!incomingPlayer || !outgoingPlayer || !tacticsBenchState.fixtureId) return false;
  const fixture = tacticsBenchApplyFixture(ttBuildFixtureAtTime(tacticsTimelineState.currentElapsed));
  const rawOutgoing = fixture[`${side}Lineup`]?.startXi.find(player => tacticsBenchPlayerKey(player) === outgoing);
  if (!rawOutgoing) return false;
  tacticsBenchState.changes.push({ side, incoming, outgoing, at: evTimelineCutoff(tacticsTimelineState.currentElapsed) });
  ttApplyTimelineToTactics(tacticsTimelineState.currentElapsed);
  return true;
}

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
  const scale = frame.width / wrap.offsetWidth || 1;
  Object.assign(layer.style, { left: `${(rect.left - frame.left) / scale}px`, top: `${(rect.top - frame.top) / scale}px`,
    width: `${rect.width / scale}px`, height: `${rect.height / scale}px` });
  layer.style.setProperty('--td-scale', getComputedStyle(pitch).getPropertyValue('--td-scale') || '1');
  layer.classList.toggle('is-vertical', !!tdPitchVertical);
}

function tacticsBenchRender() {
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

function tacticsBenchDragPoint(clientX, clientY) {
  const layer = document.getElementById('tactics-bench-layer');
  const rect = layer.getBoundingClientRect();
  const scale = rect.width / layer.offsetWidth || 1;
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

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
  tacticsBenchCancelDrag(false, !cancelled && !!outgoing);
  if (!cancelled && outgoing) tacticsBenchSwap(side, incoming, outgoing);
}

/** 빈 곳에 놓으면 명단을 다시 펼치고 잡았던 바둑알을 원래 자리로 돌려보낸다. */
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
