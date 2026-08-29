// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 패널 / 렌더]
// 이벤트·평점 표시 헬퍼, 피치 좌표 매핑, 라인업/벤치/부상자 패널 HTML 빌더, 교체명단
// 사이클 패널, 전술판 동기화 + applyLineupPanels/rerenderLineupPanels/clearLineupPanels
// (외부 진입점). lineup-manual-store.js, lineup-data.js 로드 후 사용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Iter 5-3: 라인업 이벤트/평점 표시 헬퍼 ───────────────────────────────
// 노드(피치) + 벤치 행 + 선발 리스트 행에서 공통으로 사용.

/** rerenderLineupPanels가 매 렌더마다 채워두는 이벤트/평점 lookup 캐시. 없으면 빈 Map. */
function lpGetContext() {
  return lineupPanelState.context || { eventsByPlayer: new Map(), ratingByPlayer: new Map() };
}

/** 선수 1명의 집계된 골/어시/카드/교체 이벤트. 없으면 null. */
function lpGetPlayerEvents(playerId) {
  if (playerId == null) return null;
  return lpGetContext().eventsByPlayer.get(String(playerId)) || null;
}

/** 선수 1명의 경기 평점. 데이터 없음(unset)과 0 평점을 구분하기 위해 has() 먼저 체크. */
function lpGetPlayerRating(playerId) {
  if (playerId == null) return null;
  const map = lpGetContext().ratingByPlayer;
  return map.has(String(playerId)) ? map.get(String(playerId)) : null;
}

/** 카드 마커 HTML — yellow / red / 누적(yellow+red) / null */
function lpBuildCardMarkersHtml(events) {
  const kind = typeof lpCardKind === 'function' ? lpCardKind(events) : null;
  if (kind === 'yellow') return '<span class="dp-card is-yellow"></span>';
  if (kind === 'red') return '<span class="dp-card is-red"></span>';
  if (kind === 'cumulative') return '<span class="dp-card is-yellow"></span><span class="dp-card is-red"></span>';
  return '';
}

/** subOut/subIn 마커 HTML — kind('bench'|'starter') 기반으로 화살표 색상/방향 결정.
 *  subIn + subOut 둘 다 있는 경우(재교체 선수): 두 마커를 모두 렌더. */
function lpBuildSubMarkerHtml(events, kind) {
  if (!events) return '';
  const fmt = typeof lpFormatEventTime === 'function' ? lpFormatEventTime : () => '';
  const mkIn  = t => `<span class="dp-sub-marker is-in"  title="교체 IN" >→ <span class="dp-sub-time-text">${dpEscape(fmt(t))}</span></span>`;
  const mkOut = t => `<span class="dp-sub-marker is-out" title="교체 OUT">→ <span class="dp-sub-time-text">${dpEscape(fmt(t))}</span></span>`;

  const hasIn  = !!events.subIn;
  const hasOut = !!events.subOut;

  // 재교체 선수(subIn + subOut 모두): 시간 오름차순으로 두 마커 표시
  if (hasIn && hasOut) {
    const inFirst = Number(events.subIn.time?.elapsed ?? 0) <= Number(events.subOut.time?.elapsed ?? 0);
    return inFirst
      ? mkIn(events.subIn.time) + mkOut(events.subOut.time)
      : mkOut(events.subOut.time) + mkIn(events.subIn.time);
  }

  if (kind === 'bench') {
    if (hasOut) return mkOut(events.subOut.time);
    if (hasIn)  return mkIn(events.subIn.time);
  }
  if (kind === 'starter') {
    if (hasIn)  return mkIn(events.subIn.time);
    if (hasOut) return mkOut(events.subOut.time);
  }
  return '';
}

/** 골/어시 이모티콘 — 횟수만큼 반복 (벤치/리스트 행용) */
function lpBuildGoalsAssistsHtml(events) {
  if (!events) return '';
  const goalCount = events.goals?.length || 0;
  const assistCount = events.assists?.length || 0;
  if (!goalCount && !assistCount) return '';
  let html = '';
  for (let i = 0; i < goalCount; i++) html += '<span class="dp-event-icon dp-event-goal" title="득점">⚽</span>';
  for (let i = 0; i < assistCount; i++) html += '<span class="dp-event-icon dp-event-assist" title="도움">👟</span>';
  return html;
}

/** 평점 박스 HTML — 평점 색상 매핑은 lpRatingColor가 처리 */
function lpBuildRatingHtml(playerId) {
  const rating = lpGetPlayerRating(playerId);
  if (rating == null) return '';
  const color = typeof lpRatingColor === 'function' ? lpRatingColor(rating) : '#666';
  return `<span class="dp-rating" style="background:${color}">${rating.toFixed(1)}</span>`;
}

/**
 * 벤치/선발-리스트 공통 행 HTML.
 * kind: 'bench' (교체명단 행) | 'starter' (선발 리스트 모드 행)
 *
 * 레이아웃 — outer flex(num | content | rating). content는 내부 flex-wrap으로
 * 이름/카드/교체마커/골·어시를 한 줄에 시도하다 안 되면 둘째 줄로 넘김.
 * 평점은 outer flex에 있어서 항상 최우측 정렬 + 첫 줄 위치 유지.
 */
function lpBuildRosterRowHtml(player, kind) {
  const events = lpGetPlayerEvents(player.playerId);
  const cardKind = typeof lpCardKind === 'function' ? lpCardKind(events) : null;
  const isOff = !!(events?.red);

  const title = player.nameKoLong && player.nameKoLong !== player.name
    ? ` title="${dpEscape(player.nameKoLong)}"`
    : '';
  const nameClass = `dp-item-name${cardKind === 'yellow' ? ' is-yellow' : ''}${isOff ? ' is-red' : ''}`;
  const itemClass = `dp-item${isOff ? ' is-sent-off' : ''}`;

  const cardsHtml = lpBuildCardMarkersHtml(events);
  const subHtml = lpBuildSubMarkerHtml(events, kind);
  const goalsAssistsHtml = lpBuildGoalsAssistsHtml(events);
  const ratingHtml = lpBuildRatingHtml(player.playerId);

  return `<div class="${itemClass}" data-player-id="${dpEscape(player.playerId)}"${Number(player.playerId) === 0 ? ` data-player-orig-name="${dpEscape(player.name || player.playerName || '')}"` : ''}>
    <span class="dp-item-num">${dpEscape(player.number ?? '')}</span>
    <span class="dp-item-content">
      <span class="${nameClass}"${title}>${dpEscape(pickName(player, kind === 'bench' ? 'roster' : 'lineup'))}</span>
      ${cardsHtml}
      ${subHtml}
      ${goalsAssistsHtml}
    </span>
    ${ratingHtml}
  </div>`;
}

/**
 * 피치 노드 위 badge HTML (sub-in/out / 골 / 어시 / 카드).
 * 항상 모든 badge를 렌더하고, 캠 큼에서의 per-feature 토글은 body class + CSS로 숨김 처리한다.
 * (작은 캠은 항상 모두 표시 — 사용자 요청: 마스터 토글만 적용.)
 */
function lpBuildNodeBadgesHtml(events) {
  if (!events) return '';
  let html = '';
  const fmt = typeof lpFormatEventTime === 'function' ? lpFormatEventTime : () => '';
  const hasBothSubBadges = !!(events.subIn && events.subOut);
  // top-left: 교체 IN 시간 — 진입한 선수 (subReflect=ON에서 선발 자리로 올라온 선수)
  if (events.subIn) {
    html += `<span class="dp-node-badge dp-node-sub-in${hasBothSubBadges ? ' dp-node-sub-stacked' : ''}" title="교체 IN">→<span class="dp-node-sub-time">${dpEscape(fmt(events.subIn.time))}</span></span>`;
  }
  // top-left: 교체 OUT 시간 — subReflect=OFF에서 선발에 남아있는 OUT 선수에게 표시. 빨간 chip.
  if (events.subOut) {
    html += `<span class="dp-node-badge dp-node-sub-out${hasBothSubBadges ? ' dp-node-sub-stacked' : ''}" title="교체 OUT">→<span class="dp-node-sub-time">${dpEscape(fmt(events.subOut.time))}</span></span>`;
  }
  // top-right: 어시스트
  if (events.assists?.length) {
    const n = events.assists.length;
    html += `<span class="dp-node-badge dp-node-assist" title="도움 ${n}회">👟${n > 1 ? `<span class="dp-node-count">${n}</span>` : ''}</span>`;
  }
  // bottom-right: 골
  if (events.goals?.length) {
    const n = events.goals.length;
    html += `<span class="dp-node-badge dp-node-goal" title="득점 ${n}회">⚽${n > 1 ? `<span class="dp-node-count">${n}</span>` : ''}</span>`;
  }
  // left side: 카드
  const cardKind = typeof lpCardKind === 'function' ? lpCardKind(events) : null;
  if (cardKind === 'yellow') html += '<span class="dp-node-badge dp-node-card"><span class="dp-card is-yellow"></span></span>';
  else if (cardKind === 'red') html += '<span class="dp-node-badge dp-node-card"><span class="dp-card is-red"></span></span>';
  else if (cardKind === 'cumulative') html += '<span class="dp-node-badge dp-node-card"><span class="dp-card is-yellow"></span><span class="dp-card is-red"></span></span>';
  return html;
}

/** 노드 평점 박스 HTML — bottom-center 위치 (CSS로 처리). 토글은 body class로 숨김 처리. */
function lpBuildNodeRatingHtml(playerId) {
  const rating = lpGetPlayerRating(playerId);
  if (rating == null) return '';
  const color = typeof lpRatingColor === 'function' ? lpRatingColor(rating) : '#666';
  return `<span class="dp-node-rating" style="background:${color}">${rating.toFixed(1)}</span>`;
}

/** 패널 상단 타이틀 텍스트 + 좌/우 버튼(새로고침, 입력 버튼 등) 갱신.
 * left/actionsHtml 모두 .dp-title의 flex 정렬(align-items:center)에 기대 별도 top 계산 없이 타이틀 텍스트와 동일한
 * 높이/세로 위치를 자동으로 맞춘다 — top을 지정하지 않은 absolute 요소는 static position(=flex 정렬 결과)을 따른다. */
function setPanelTitle(panel, titleText, actionsHtml = '', leftActionsHtml = '') {
  const titleEl = panel?.querySelector('.dp-title');
  if (!titleEl) return;
  titleEl.innerHTML = `${leftActionsHtml ? `<span class="dp-title-actions-left">${leftActionsHtml}</span>` : ''}<span class="dp-title-text">${dpEscape(titleText)}</span>${actionsHtml ? `<span class="dp-title-actions">${actionsHtml}</span>` : ''}`;
  // leftActionsHtml(새로고침 버튼)이 새 DOM 노드로 교체됐으므로, 쿨다운 진행 중이었다면 idle 모양으로
  // 잠깐 보였다가 다음 tick에야 따라잡는 깜빡임을 막기 위해 현재 쿨다운 상태를 즉시 재적용한다.
  if (leftActionsHtml) window.syncForceRefreshButtons?.();
}

/** 교체 명단(캠 작음) 타이틀 좌측 강제 새로고침 버튼 HTML — 쿨다운/아이콘 갱신은 fixture.js가 담당. */
function buildBenchForceRefreshButtonHtml() {
  return '<button class="lp-force-refresh-btn lp-bench-refresh-btn" type="button" title="새로고침">'
    + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7A5 5 0 1 1 10.4 3.4"/><path d="M12 2.2v3.6H8.4"/></svg>'
    + '<span class="lp-force-refresh-label">새로고침</span></button>';
}

/** 패널에 .dp-title/.dp-lineup-body가 없으면 만들어 붙이고, 본문 엘리먼트를 반환. */
function ensureLineupPanelScaffold(panel) {
  if (!panel) return null;
  let title = panel.querySelector('.dp-title');
  let body = panel.querySelector('.dp-lineup-body');
  if (title && body) return body;

  title = document.createElement('div');
  title.className = 'dp-title';
  body = document.createElement('div');
  body.className = 'dp-lineup-body';
  panel.replaceChildren(title, body);
  return body;
}

/** 패널 타이틀 옆 수동입력 버튼(라인업/벤치/부상자) HTML. */
function buildTitleActionButton(kind, side) {
  // lineup 버튼 라벨은 모드에 따라 다르게: API 라인업이 있으면 "포메이션 설정"(그리드 모드),
  // 없으면 "라인업 입력"(풀폼 모드). 양 팀 컨텍스트는 버튼이 위치한 컨테이너로 구분되므로
  // 라벨에 홈/원정 prefix는 붙이지 않는다.
  if (kind === 'lineup') {
    const label = isGridMode(lineupPanelState.lastFixture, side) ? '포메이션 설정' : '라인업 입력';
    return `<button class="dp-side-edit-btn" data-manual="lineup" data-side="${side}">${label}</button>`;
  }
  return `<button class="dp-side-edit-btn" data-manual="${kind}" data-side="${side}">${DETAIL_SIDE_TITLES[side]} 입력</button>`;
}

/** API에 교체 명단이 통째로 없을 때만 입력 버튼 노출 — 있으면 그리드/풀폼 수동 모드 자체가 무관. */
function shouldShowBenchManualButton(rawFixture, side) {
  return !Array.isArray(rawFixture?.[`${side}Lineup`]?.substitutes);
}

/** 부상자는 API에 있어도 추가 입력이 의미 있어 항상 노출. */
function shouldShowInjuryManualButton(/* rawFixture, side */) {
  return true;
}

// 항상 표시 — 데이터가 잘못됐거나 교체 후 포메이션 수정이 필요한 경우 직접 손볼 수 있게.
// 그리드/풀폼 모드는 isGridMode로 자동 분기.
function shouldShowLineupManualButton(/* rawFixture, side */) {
  return true;
}

/** 라인업 패널 한쪽(홈/원정) 헤더 HTML — 팀명 + 포메이션 + (있으면) 입력 버튼. */
function buildLineupSideHeaderHtml(side, teamName, formationText, showManual) {
  return `<div class="dp-side-header">
    <span class="dp-side-name" title="${dpEscape(teamName)}">${dpEscape(teamName)}</span>
    ${formationText ? `<span class="dp-side-formation">${dpEscape(formationText)}</span>` : ''}
    ${showManual ? buildTitleActionButton('lineup', side) : ''}
  </div>`;
}

/** 패널 안 한쪽 팀명 텍스트 + accent 컬러(팀칩 등) 갱신. */
function setSideName(panel, dataAttrPrefix, side, teamName, accentColor) {
  const nameEl = panel?.querySelector(`[data-${dataAttrPrefix}-side="${side}"] .dp-side-name`);
  if (!nameEl) return;
  nameEl.textContent = teamName;
  nameEl.title = teamName;
  if (accentColor) nameEl.style.setProperty('--dp-team-accent', accentColor);
  else nameEl.style.removeProperty('--dp-team-accent');
}

/** lineup.coach에서 표시용 이름(닉네임 우선순위 pickName) 추출. */
function getCoachName(lineupLike) {
  return typeof pickName === 'function' ? pickName(lineupLike?.coach, 'roster') : '';
}

/** 감독 이름 표시 + API에 없을 때만 더블클릭 인라인 편집 가능하도록 editable 표시. */
function setCoachElement(el, effectiveData, rawData, side) {
  if (!el) return;

  const fixtureId = getActiveFixtureId();
  const manualCoachName = normalizeCoachName(getManualSideData(fixtureId, side)?.coachName);
  const rawCoachName = normalizeCoachName(getCoachName(rawData?.[`${side}Lineup`]));
  const effectiveCoachName = normalizeCoachName(getCoachName(effectiveData?.[`${side}Lineup`])) || manualCoachName;
  const editable = !rawCoachName;

  el.textContent = effectiveCoachName || '(정보 없음. 직접 입력)';
  el.classList.toggle('dp-coach-editable', editable);
  el.dataset.coachSide = side;
  el.dataset.apiMissing = editable ? 'true' : 'false';
  el.title = editable ? '더블클릭해서 감독 이름 입력' : '';
}

// setCoachElement와 동일한 패턴 — 단, 안내 텍스트 없이 빈 값엔 '정보 없음' 표시 (사용자 요청).
function setRefereeElement(el, effectiveData, rawData) {
  if (!el) return;

  const fixtureId = getActiveFixtureId();
  const manualReferee = String(getManualEntry(fixtureId)?.refereeName || '').trim();
  const rawReferee = String(rawData?.matchInfo?.refereeName || '').trim();
  const effectiveReferee = String(effectiveData?.matchInfo?.refereeName || '').trim() || manualReferee;
  const editable = !rawReferee;

  el.textContent = effectiveReferee || '(정보 없음)';
  el.classList.toggle('dp-referee-editable', editable);
  el.dataset.apiMissing = editable ? 'true' : 'false';
  el.title = editable ? '더블클릭해서 주심 이름 입력' : '';
}

/** 벤치 패널 헤더용 킥오프 시각 — 로컬 타임존, "M월 D일 (요일) HH:mm" 형식. */
function formatBenchKickoffLocal(matchInfo) {
  const kickoffRaw = matchInfo?.kickoffAt || matchInfo?.kickoffUtc;
  if (!kickoffRaw) return '-';

  const kickoff = new Date(kickoffRaw);
  if (Number.isNaN(kickoff.getTime())) return '-';

  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(kickoff);

  const pick = type => parts.find(part => part.type === type)?.value?.trim() || '';
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const weekday = pick('weekday').replace(/\.$/, '');
  const hour = pick('hour');
  const minute = pick('minute');
  const rawTimeZoneName = pick('timeZoneName');

  const offsetMinutes = -kickoff.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offsetAbs = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(offsetAbs / 60);
  const offsetRemainder = offsetAbs % 60;
  const offsetText = offsetRemainder === 0
    ? `UTC${offsetSign}${offsetHours}`
    : `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetRemainder).padStart(2, '0')}`;

  const resolvedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL';
  const normalizedTzLabel = (!rawTimeZoneName || /^(GMT|UTC)/i.test(rawTimeZoneName))
    ? resolvedZone
    : rawTimeZoneName;
  const timeZone = `${normalizedTzLabel}:${offsetText}`;

  if (!year || !month || !day || !hour || !minute) return '-';

  return `${year}.${month}.${day} ${hour}:${minute} (${weekday}) (${timeZone})`;
}

/** 벤치 목록 행 개수에 따른 보조 카운트 class 리셋. */
function applyBenchCountClass(listEl) {
  if (!listEl) return;
  listEl.classList.remove('dp-count-md');
}

/** 교체 명단 목록 HTML. 빈 배열이면 "후보 없음"/"벤치 정보 미제공"으로 API 유무를 구분. */
function buildBenchListHtml(players, lineupExists) {
  if (!players || players.length === 0) {
    return buildEmptyHtml(lineupExists ? '후보 없음' : '벤치 정보 미제공');
  }
  // Iter 5-3: 카드/교체/골/어시/평점 마커는 lpBuildRosterRowHtml이 일괄 처리.
  return players.map(player => lpBuildRosterRowHtml(player, 'bench')).join('');
}

/** 부상자 명단 목록 HTML — 사유별 아이콘(부상/의심/출장정지) + 한글 사유 툴팁. */
function buildInjuryListHtml(injuries, provided) {
  if (!injuries || injuries.length === 0) {
    return buildEmptyHtml(provided ? '결장자 없음' : '부상 정보 미제공');
  }

  return injuries.map(injury => {
    const reasonKo = getInjuryReasonDisplayText(injury.reason, injury.type);
    const tooltip = reasonKo ? ` title="${dpEscape(reasonKo)}"` : '';

    let iconHtml = '<span class="dp-icon dp-icon-injury" aria-label="부상"></span>';
    if (isQuestionableInjuryReason(injury.reason, injury.type)) {
      iconHtml = '<span class="dp-icon dp-icon-questionable" aria-label="의심"></span>';
    } else if (typeof isSuspension === 'function' && isSuspension(injury.reason)) {
      iconHtml = '<span class="dp-icon dp-icon-redcard" aria-label="출장 정지"></span>';
    }

    return `<div class="dp-item" data-player-id="${dpEscape(injury.playerId)}"${Number(injury.playerId) === 0 ? ` data-player-orig-name="${dpEscape(injury.name || injury.playerName || '')}"` : ''}>
      ${iconHtml}
      <span class="dp-item-num">${dpEscape(injury.number ?? '')}</span>
      <span class="dp-item-name dp-injury-name"${tooltip}>${dpEscape(pickName(injury, 'roster') || '-')}</span>
    </div>`;
  }).join('');
}

/**
 * TACTICS_FM의 가로 좌표(x: 5~44, y: 0~100)를 세로 피치 좌표로 변환.
 * 전술판이 away를 (100-x, 100-y)로 미러링하는 것과 동일하게 양 팀 위치를 반영해서
 * 화면 기준으로 양 팀의 LW/RW가 서로 반대 사이드에 위치하게 한다.
 *
 * 세로 피치 매핑:
 *   - tactics_x (자기 골문 5 → 공격라인 44) → 자기 진영의 깊이
 *     양 팀 모두 이름 박스가 원 아래로 표시되므로, 가장자리(0/100%)에서 안쪽으로
 *     충분한 여백을 둬야 GK 이름이 피치 밖으로 잘리지 않음.
 *     → home: top 8% (자기 골박스) → 47% (하프라인 직전)
 *     → away: top 92% → 53% (위 mirror)
 *   - tactics_y (0 → 100) → 화면 가로 (5% → 95%)
 *     좌우 반전 처리:
 *       · home: y → 100 - rawY (작은 y가 화면 오른쪽 = RW/RB 자연스럽게 위치)
 *       · away: 전술판에서 이미 (100-y)로 반전된 좌표를 받으므로 화면에서는 rawY 그대로 사용
 */
/**
 * 캠 큰 split 전용 좌표 매핑.
 * 한 피치에 한 팀만 들어가므로 자기 진영 절반만 쓰지 않고 풀 피치를 사용.
 *   - 세로: GK top 92% → FW top 8%를 기본으로 하되, split 전용으로 전체를 살짝 위로 올린다.
 *           추가로 최전방 라인을 제외한 모든 줄은 이름 라벨 한 줄 정도 더 위로 올려
 *           GK/수비 라벨이 패널 하단에 걸리지 않게 한다.
 *   - 가로: 홈/원정 모두 같은 좌우 기준을 써야 하므로 100-rawY를 공통 적용한다.
 */
function mapFormationSlotToBigSplitPitchPosition(slot, side, options = {}) {
  const rawX = Number(slot?.coord?.x) || 5;
  const rawY = Number(slot?.coord?.y) || 50;
  const depth = Math.max(0, Math.min(1, (rawX - 5) / 39));
  // big split 전용:
  // - 두 피치는 같은 방향의 독립 보드이므로 홈/원정 모두 같은 좌우 기준을 쓴다.
  // - 두 팀 모두 바둑알+라벨 전체를 살짝 위로 올려, 하단 라벨이 쓸 여유 공간을 만든다.
  const SPLIT_NODE_LIFT_PCT = 4;
  let top = 92 - depth * 84 - SPLIT_NODE_LIFT_PCT;
  // GK 포함 비최전방 라인은 이름 라벨이 하단으로 잘리지 않도록 위로 올린다.
  const SPLIT_LABEL_LINE_LIFT_PCT = 4.75;
  if (depth < 0.82) top -= SPLIT_LABEL_LINE_LIFT_PCT;
  if (depth === 0) top += 1; // GK: 이름 pill 살짝 안쪽으로
  // split 원정은 수비/미드 라인이 하단에 촘촘하게 몰리므로 중간 라인만 추가 lift.
  // 단, FW 바로 앞 라인(preFwDepth)은 제외 — 이 라인까지 들어올리면 FW와의 간격이
  // 좁아져 라벨이 겹친다 (포메이션별로 FW 앞 라인 depth가 달라 동적으로 계산해 제외).
  const SPLIT_AWAY_SUPPORT_LIFT_PCT = 2.5;
  const preFwDepth = options.preFwDepth;
  const isPreFwLine = preFwDepth != null && Math.abs(depth - preFwDepth) < 0.001;
  if (side === 'away' && depth > 0 && depth < 0.82 && !isPreFwLine) {
    top -= SPLIT_AWAY_SUPPORT_LIFT_PCT;
  }
  // 바둑알(원) 반지름이 컨테이너 높이 대비 ~6%이므로, 포메이션에 관계없이 상단 잘림을 막는
  // 보편적 하한선. 4-3-1-2처럼 x=44(depth=1.0)인 극단 포메이션에서도 안전하게 적용된다.
  top = Math.max(8, top);
  const yLocal = 100 - rawY;
  const left = 5 + (yLocal / 100) * 90;
  return { left, top };
}

/** 한 피치에 양 팀이 같이 들어가는 combined 모드용 좌표 매핑(위 Iter 0 주석 참조). */
function mapFormationSlotToPitchPosition(slot, side, options = {}) {
  const rawX = Number(slot?.coord?.x) || 5;
  const rawY = Number(slot?.coord?.y) || 50;
  // tactics_x 정규화: 5(GK) → 0, 44(FW) → 1
  const depth = Math.max(0, Math.min(1, (rawX - 5) / 39));
  const isHome = side === 'home';
  // 자기 진영 깊이 8~47% (39% 폭). 자연 GK 위치 = home 8% / away 92%.
  const homeTop = 8 + depth * 39;
  let top = isHome ? homeTop : (100 - homeTop);
  // GK(depth=0) 추가 오프셋: 양 팀 모두 화면상 "위쪽"(top% 감소) 방향으로 이동. 비대칭.
  //   - home: -3.5% (≈ 16px on 470px pitch) — 수비수와 GK 사이 간격 확보. 긴 이름이 수비수 얼굴
  //           위로 가려지는 케이스 방지.
  //   - away: -0.5% (≈  4px on 470px pitch) — 이름 pill이 원 아래로 그려져 피치 밖으로 잘리지
  //           않을 정도로만 살짝 올림. 너무 올리면 미드필더와 겹치므로 조금만.
  if (depth === 0) top -= isHome ? 3.5 : 0.5;
  // combined 피치에서는 원정팀의 미드/수비 줄(GK·공격 최전방 제외)을 살짝 올려
  // 이름 라벨이 패널 하단에서 잘릴 가능성을 줄인다.
  // 캠 큰 화면은 여유 있게, 캠 작은 화면은 라벨 한 줄 정도만 가볍게 올리도록 호출부가 강도를 나눈다.
  const awaySupportLiftPct = Number(options.awaySupportLiftPct) || 0;
  if (!isHome && depth > 0 && depth < 0.85 && awaySupportLiftPct > 0) {
    top -= awaySupportLiftPct;
  }
  // away 최전방(depth≥0.85): 수비/미드와 별도 lift — 미드라인 너머 상대 진영에 배치
  const awayFwLiftPct = Number(options.awayFwLiftPct) || 0;
  if (!isHome && depth >= 0.85 && awayFwLiftPct > 0) {
    top -= awayFwLiftPct;
  }
  // home 최전방(depth≥0.85): 미드라인 쪽으로 올릴 때 사용 (양수면 위로)
  const homeFwLiftPct = Number(options.homeFwLiftPct) || 0;
  if (isHome && depth >= 0.85 && homeFwLiftPct !== 0) {
    top -= homeFwLiftPct;
  }
  // 홈팀은 rawY 그대로, 원정팀은 100 - rawY를 써서 서로 마주보는 방향으로 배치한다.
  const yLocal = isHome ? rawY : (100 - rawY);
  // 가로는 5~95% (90% 폭)
  const left = 5 + (yLocal / 100) * 90;
  return { left, top };
}

/** 설정의 라인업 노드 모드(번호/사진). settings-popup.js 미로드 시 'number' 폴백. */
function getActiveLineupNodeMode() {
  if (typeof getLineupNodeMode === 'function') return getLineupNodeMode();
  return 'number';
}

/** 노드가 사진 모드일 때만, 설정에서 끄지 않았다면 이름 라벨 앞에 등번호를 같이 표시. */
function shouldShowLineupNameNumber() {
  if (getActiveLineupNodeMode() !== 'photo') return false;
  return typeof getSetting !== 'function' || getSetting('lineupShowNumber') !== 'off';
}

/** 이름 라벨 내부 HTML — (사진 모드면) 등번호 + 이름 텍스트. */
function buildLineupNameLabelHtml(player, name, nameClass, title = '') {
  const safeName = dpEscape(name || '');
  const rawNumber = String(player?.number ?? '').trim();
  const showNumber = shouldShowLineupNameNumber() && rawNumber !== '';
  const numberHtml = showNumber
    ? `<span class="dp-lineup-name-num">${dpEscape(rawNumber)}</span>`
    : '';
  return `<span class="${nameClass}"${title}>${numberHtml}<span class="dp-lineup-name-text">${safeName}</span></span>`;
}

// 두 패스 렌더링 — 원/아바타와 이름 라벨을 분리해 HTML 두 덩어리로 반환.
// 호출 측에서 모든 원을 먼저, 모든 이름을 나중에 DOM 삽입 → DOM 순서상 이름이 항상 위에 그려짐.
// 결과: 홈/원정 양쪽 모두 이름이 인접 팀 얼굴 위로 나옴 (이전엔 home은 가려지고 away는 안 가림).
//
// pitchMode: 'combined' (default) — 양 팀 한 피치, 자기 진영만 사용
//            'split'    — 한 팀이 풀 피치 사용 (캠 큼 splitLineup=on 전용)
function buildVerticalPitchNodesHtml(lineup, effectiveData, side, pitchMode, options = {}) {
  const nodeMode = getActiveLineupNodeMode();
  const colors = getLineupSideColors(effectiveData, side);
  const circles = [];
  const names = [];
  // Iter 5-3: 노드 badge는 항상 모두 렌더 (양 캠 동일 DOM 공유).
  // per-feature 토글은 body 클래스(no-lineup-goals/cards/rating/subtime) + 캠 큼 CSS로 숨김 처리.
  const preFwDepth = pitchMode === 'split' ? getPreFwFormationDepth(lineup?.formation) : null;

  getFormationAssignments(lineup).forEach(({ slot, player }) => {
    const name = pickName(player, 'lineup') || player.name || '';
    const title = player.nameKoLong && player.nameKoLong !== player.name
      ? ` title="${dpEscape(player.nameKoLong)}"`
      : '';
    const position = pitchMode === 'split'
      ? mapFormationSlotToBigSplitPitchPosition(slot, side, { preFwDepth })
      : mapFormationSlotToPitchPosition(slot, side, options);
    const colorVars = `--dp-node-bg:${colors.bg};--dp-node-text:${colors.text};--dp-node-glow:${withAlpha(colors.bg, '44')};--dp-node-border:${withAlpha(colors.text, '66')};`;
    const posStyle = `left:${position.left}%;top:${position.top}%;`;

    const badge = nodeMode === 'photo' && player.photoUrl
      ? `<span class="dp-lineup-avatar" style="background-image:url('${dpEscape(player.photoUrl)}')"></span>`
      : `<span class="dp-lineup-circle">${dpEscape(player.number ?? '')}</span>`;

    // Iter 5-3: 이벤트/평점 lookup
    const events = lpGetPlayerEvents(player.playerId);
    const isSentOff = !!(events?.red);
    const badgesHtml = lpBuildNodeBadgesHtml(events);
    const ratingHtml = lpBuildNodeRatingHtml(player.playerId);
    const nodeClass = `dp-lineup-node is-${side}${isSentOff ? ' is-sent-off' : ''}`;
    const nameClass = `dp-lineup-name${isSentOff ? ' is-red' : ''}${typeof lpCardKind === 'function' && lpCardKind(events) === 'yellow' ? ' is-yellow' : ''}`;

    // SofaScore 방식: 평점은 노드 자식으로, 원 바로 아래에 부착. name-wrap은 그만큼 더 아래로 밀림.
    const _pirAttr = Number(player.playerId) === 0 ? ` data-player-orig-name="${dpEscape(player.name || player.playerName || '')}"` : '';
    circles.push(`<div class="${nodeClass}" data-player-id="${dpEscape(player.playerId)}"${_pirAttr} style="${posStyle}${colorVars}">${badge}${badgesHtml}${ratingHtml}</div>`);
    names.push(`<div class="dp-lineup-name-wrap is-${side}" data-player-id="${dpEscape(player.playerId)}"${_pirAttr} style="${posStyle}">${buildLineupNameLabelHtml(player, name, nameClass, title)}</div>`);
  });

  return { circles: circles.join(''), names: names.join('') };
}

/** 피치 위 팀명/포메이션 chip HTML. formationOnly면 팀명 대신 포메이션을 메인 텍스트로. */
function buildLineupPitchTeamChipHtml(side, effectiveData, rawData, options = {}) {
  const lineup = effectiveData?.[`${side}Lineup`];
  const colors = getLineupSideColors(effectiveData, side);
  const formationOnly = options.formationOnly === true;
  const primaryLabel = formationOnly
    ? String(lineup?.formation || '').trim()
    : getTeamName(effectiveData, side);
  const primaryTitle = formationOnly ? primaryLabel : getTeamName(effectiveData, side);
  return `<div class="dp-lineup-team-chip is-${side}">
    <div class="dp-lineup-team-main${formationOnly ? ' is-formation-only' : ''}" style="--dp-team-accent:${colors.bg};--dp-team-text:${colors.text};">
      <span class="dp-lineup-team-name" title="${dpEscape(primaryTitle)}">${dpEscape(primaryLabel)}</span>
      ${!formationOnly && lineup?.formation ? `<span class="dp-lineup-team-fm">${dpEscape(lineup.formation)}</span>` : ''}
    </div>
    ${shouldShowLineupManualButton(rawData, side) ? buildTitleActionButton('lineup', side) : ''}
  </div>`;
}

/** 피치 가운데(또는 설정에 따라 좌/우) 흐린 리그 로고 워시 HTML. 로고 없으면 빈 문자열. */
function buildLineupPitchLeagueWashHtml(effectiveData, rawData) {
  const leagueLogoUrl = String(
    effectiveData?.matchInfo?.leagueLogoUrl
    || rawData?.matchInfo?.leagueLogoUrl
    || ''
  ).trim();
  if (!leagueLogoUrl) return '';

  // leagueLogoPos: 'center'(default) / 'left' / 'right' — 센터 서클이 라인업에 가려질때 사이드로 회피.
  const pos = (typeof getSetting === 'function' && getSetting('leagueLogoPos')) || 'center';
  return `<div class="dp-lineup-league-wash is-${pos}" aria-hidden="true">
    <span class="dp-lineup-league-wash-logo" style="background-image:url('${dpEscape(leagueLogoUrl)}')"></span>
  </div>`;
}

// Iter 5-X: 분할 모드 한 팀 풀 피치 마크업. 마킹/리그 로고/팀 chip은 combined와 공유.
function buildSingleSidePitchHtml(side, effectiveData, rawData, options = {}) {
  const lineup = effectiveData?.[`${side}Lineup`];
  const nodes = buildVerticalPitchNodesHtml(lineup, effectiveData, side, 'split');
  return `<div class="dp-lineup-vertical-pitch is-split is-${side}">
    ${buildLineupPitchLeagueWashHtml(effectiveData, rawData)}
    <div class="dp-lineup-markings">
      <div class="dp-lineup-marking dp-lineup-marking-top-box"></div>
      <div class="dp-lineup-marking dp-lineup-marking-top-goal"></div>
      <div class="dp-lineup-marking dp-lineup-marking-top-arc"></div>
      <div class="dp-lineup-marking dp-lineup-marking-midline"></div>
      <div class="dp-lineup-marking dp-lineup-marking-center-circle"></div>
      <div class="dp-lineup-marking dp-lineup-marking-bottom-box"></div>
      <div class="dp-lineup-marking dp-lineup-marking-bottom-goal"></div>
      <div class="dp-lineup-marking dp-lineup-marking-bottom-arc"></div>
    </div>
    ${buildLineupPitchTeamChipHtml(side, effectiveData, rawData, options)}
    ${nodes.circles}
    ${nodes.names}
  </div>`;
}

/** splitLineup 모드 — 홈/원정 각자 풀 피치 2개를 나란히. */
function buildLineupSplitPitchModeHtml(effectiveData, rawData, options = {}) {
  return `<div class="dp-lineup-pitch is-split">
    ${buildSingleSidePitchHtml('home', effectiveData, rawData, options)}
    ${buildSingleSidePitchHtml('away', effectiveData, rawData, options)}
  </div>`;
}

/** combined 모드(기본) — 한 피치에 양 팀이 자기 진영씩 나눠서. */
function buildLineupPitchModeHtml(effectiveData, rawData, options = {}) {
  const homeNodes = buildVerticalPitchNodesHtml(
    effectiveData?.homeLineup,
    effectiveData,
    'home',
    'combined',
    options
  );
  const awayNodes = buildVerticalPitchNodesHtml(
    effectiveData?.awayLineup,
    effectiveData,
    'away',
    'combined',
    options
  );
  return `<div class="dp-lineup-pitch">
    <div class="dp-lineup-vertical-pitch">
      ${buildLineupPitchLeagueWashHtml(effectiveData, rawData)}
      <div class="dp-lineup-markings">
        <div class="dp-lineup-marking dp-lineup-marking-top-box"></div>
        <div class="dp-lineup-marking dp-lineup-marking-top-goal"></div>
        <div class="dp-lineup-marking dp-lineup-marking-top-arc"></div>
        <div class="dp-lineup-marking dp-lineup-marking-midline"></div>
        <div class="dp-lineup-marking dp-lineup-marking-center-circle"></div>
        <div class="dp-lineup-marking dp-lineup-marking-bottom-box"></div>
        <div class="dp-lineup-marking dp-lineup-marking-bottom-goal"></div>
        <div class="dp-lineup-marking dp-lineup-marking-bottom-arc"></div>
      </div>
      ${buildLineupPitchTeamChipHtml('home', effectiveData, rawData, options)}
      ${buildLineupPitchTeamChipHtml('away', effectiveData, rawData, options)}
      ${homeNodes.circles}
      ${awayNodes.circles}
      ${homeNodes.names}
      ${awayNodes.names}
    </div>
  </div>`;
}

/** 포메이션 정보 없을 때(canRenderPitchMode=false) 줄글 폴백용 선발 명단 HTML. */
function buildStartXiListHtml(lineup, lineupProvided) {
  if (!lineupProvided || !lineup) {
    return buildEmptyHtml('선발 라인업 미제공');
  }

  const players = getOrderedLineupPlayers(lineup.startXi || []);
  if (!players.length) {
    return buildEmptyHtml('선발 명단 없음');
  }
  // Iter 5-3: 카드/교체/골/어시/평점 마커는 lpBuildRosterRowHtml이 일괄 처리.
  return players.map(player => lpBuildRosterRowHtml(player, 'starter')).join('');
}

/** 줄글 폴백 모드 한쪽(홈/원정) 컬럼 — 헤더 + buildStartXiListHtml. */
function buildLineupListSideHtml(effectiveData, rawData, side) {
  const lineup = effectiveData?.[`${side}Lineup`];
  const rawLineup = rawData?.[`${side}Lineup`];

  // 포메이션 미제공 안내문은 모달 description에 흡수했으므로 패널 위에 별도 노트 없음.
  return `<div class="dp-col">
    ${buildLineupSideHeaderHtml(
      side,
      getTeamName(effectiveData, side),
      lineup?.formation || '',
      shouldShowLineupManualButton(rawData, side)
    )}
    <div class="dp-list">${buildStartXiListHtml(lineup, !!rawLineup || !!lineup)}</div>
  </div>`;
}

/** 포메이션 정보 자체가 없을 때(canRenderPitchMode=false) 쓰는 줄글 폴백 전체 레이아웃. */
function buildLineupListModeHtml(effectiveData, rawData) {
  return `<div class="dp-split dp-lineup-list-wrap">
    ${buildLineupListSideHtml(effectiveData, rawData, 'home')}
    <div class="dp-divider-v"></div>
    ${buildLineupListSideHtml(effectiveData, rawData, 'away')}
  </div>`;
}

// ─── 상세 패널 렌더 ──────────────────────────────────────────────────────
// 교체 명단 / 부상자 명단 / 선발 라인업 패널은 공통 fixture 데이터를 공유하되 표시 규칙은 각각 다르다.
function renderBenchPanel(effectiveData, rawData) {
  const panel = document.getElementById('benchPanel');
  if (!panel) return;

  // 1) 패널 모드(long/short)와 타이틀 액션 버튼을 먼저 확정한다.
  panel.classList.toggle('dp-mode-long', typeof isLongName === 'function' && isLongName('roster'));
  setPanelTitle(panel, '교체 명단', [
    shouldShowBenchManualButton(rawData, 'home') ? buildTitleActionButton('bench', 'home') : '',
    shouldShowBenchManualButton(rawData, 'away') ? buildTitleActionButton('bench', 'away') : '',
  ].filter(Boolean).join(''), buildBenchForceRefreshButtonHtml());

  // 2) 팀명과 양쪽 리스트를 채운다 (팀 컬러는 chip 배경 accent에 사용).
  const cs = (typeof chromaSafe === 'function') ? chromaSafe : (v => v);
  setSideName(panel, 'bench', 'home', getTeamName(effectiveData, 'home'), cs(normalizeHexColor(state?.colors?.homeBg, '#2563eb')));
  setSideName(panel, 'bench', 'away', getTeamName(effectiveData, 'away'), cs(normalizeHexColor(state?.colors?.awayBg, '#dc2626')));

  const homeLineupExists = !!effectiveData?.homeLineup;
  const awayLineupExists = !!effectiveData?.awayLineup;

  const homeList = panel.querySelector('[data-bench-side="home"] .dp-list');
  const awayList = panel.querySelector('[data-bench-side="away"] .dp-list');
  if (homeList) {
    homeList.innerHTML = buildBenchListHtml(effectiveData?.homeLineup?.substitutes || [], homeLineupExists);
    applyBenchCountClass(homeList);
  }
  if (awayList) {
    awayList.innerHTML = buildBenchListHtml(effectiveData?.awayLineup?.substitutes || [], awayLineupExists);
    applyBenchCountClass(awayList);
  }

  // 3) 벤치 패널 하단의 감독 / 주심 인라인 편집 영역을 함께 갱신한다.
  setCoachElement(panel.querySelector('[data-bench-coach="home"] .dp-coach-name'), effectiveData, rawData, 'home');
  setCoachElement(panel.querySelector('[data-bench-coach="away"] .dp-coach-name'), effectiveData, rawData, 'away');

  setRefereeElement(panel.querySelector('[data-bench-referee] .dp-referee-name'), effectiveData, rawData);

  // 4) 리그/라운드와 경기장 정보를 하단 메타 라인에 반영한다.
  // 경기장 이름 — venueName + venueCity (도시 있으면 ", 도시" 형태로 붙임)
  const leagueEl = panel.querySelector('[data-bench-venue] .dp-league-name');
  const venueEl = panel.querySelector('[data-bench-venue] .dp-venue-name');
  const kickoffEl = panel.querySelector('[data-bench-kickoff] .dp-kickoff-time');
  if (leagueEl || venueEl || kickoffEl) {
    const matchInfo = effectiveData?.matchInfo || {};
    const leagueName = String(matchInfo.leagueName || '').trim();
    const leagueRound = String(matchInfo.leagueRound || '').trim();
    const leagueText = [leagueName, leagueRound].filter(Boolean).join(' · ');
    const venueName = String(matchInfo.venueName || '').trim();
    const venueCity = String(matchInfo.venueCity || '').trim();
    let venueText = '-';
    if (venueName && venueCity && venueCity !== venueName) venueText = `${venueName}, ${venueCity}`;
    else if (venueName) venueText = venueName;
    else if (venueCity) venueText = venueCity;
    if (leagueEl) leagueEl.textContent = leagueText || '-';
    if (venueEl) venueEl.textContent = venueText;
    if (kickoffEl) kickoffEl.textContent = formatBenchKickoffLocal(matchInfo);
  }
}

// ─── lp-stat 안의 교체명단 사이클 패널 ──────────────────────────────────────

let _benchCycleResizeObs = null;
const BENCH_CYCLE_SINGLE_COLUMN_MAX_ROWS = 15;
const BENCH_CYCLE_OVERFLOW_EPSILON_PX = 2;
const BC_CYCLE_TITLE_FONT_MAX = 12; // .st-title-bar 기본 font-size와 동일
const BC_CYCLE_TITLE_FONT_MIN = 9;

// 교체명단 타이틀과 겹칠 수 있는 .lp-stat 컨트롤 버튼들 — 왼쪽/오른쪽에 뜰 수 있는 것만 구분.
// 개수/위치는 상태에 따라 달라지므로(순환 버튼만 있을 때 vs 새로고침·순위표 팝업까지 뜰 때)
// 실제로 화면에 떠 있는 것만 매번 실측한다 — 고정 padding으로 예약해두면 버튼이 적게 떠 있을 때
// 제목이 한쪽으로 쏠려 보이는 문제가 있었다(2026-08 피드백).
const BC_CYCLE_TITLE_LEFT_BTN_SELECTORS = ['.lp-stat-cycle-btn', '.lp-stat-refresh-btn', '.lp-stat-standings-popup-btn'];
const BC_CYCLE_TITLE_RIGHT_BTN_SELECTORS = ['.lp-stat-pause-btn'];
const BC_CYCLE_TITLE_SAFE_GAP_PX = 6;

// 텍스트 폭 측정 전용 오프스크린 canvas — 재사용(매번 새로 만들지 않음).
let _bcTitleMeasureCtx = null;
/**
 * 후보 폰트 크기로 렌더했을 때 텍스트의 "진짜" 자연 폭을 잰다.
 * titleEl.scrollWidth는 쓸 수 없다 — .bc-cycle-title은 width:100%(패널 전체 폭)인 flex
 * 컨테이너라서, 텍스트가 그 폭보다 짧아 안 넘칠 때는 scrollWidth가 텍스트 폭이 아니라
 * "박스 자체의 폭"(=패널 전체 폭)을 그대로 반환한다 — 그래서 (버튼 안전영역만큼 줄인) 더 좁은
 * availableWidth와 비교하면 텍스트가 짧아도 항상 "넘친다"고 오판정해 매번 최소 폰트까지
 * 줄어드는 버그가 있었다(2026-08 피드백: "px을 줄일 필요가 없는데 줄어들었어"). canvas
 * measureText는 박스 크기와 무관하게 텍스트 자체의 폭만 재므로 이 문제가 없다.
 */
function bcMeasureTitleWidth(text, fontSizePx, sampleEl) {
  if (!_bcTitleMeasureCtx) _bcTitleMeasureCtx = document.createElement('canvas').getContext('2d');
  const ctx = _bcTitleMeasureCtx;
  const cs = getComputedStyle(sampleEl);
  ctx.font = `${cs.fontWeight} ${fontSizePx}px ${cs.fontFamily}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing;
  return ctx.measureText(text).width;
}

/**
 * 교체명단 사이클 패널 타이틀(팀명 + "교체명단")이 길어서 .lp-stat 위에 절대좌표로 뜨는
 * 순환/새로고침/순위표팝업/일시정지 버튼과 겹칠 때, 잘라내는 대신 폰트를 한 줄 안에 들어올
 * 때까지 1px씩 점진적으로 줄인다 — events-panel.js의 evFitText와 동일한 정책(기본 크기로
 * 시도 → 넘치면 축소 → 하한 도달하면 그대로 둠), 다만 폭 측정은 canvas로(위 설명 참조).
 *
 * 제목은 항상 정중앙 정렬(.st-title-bar의 justify-content:center)을 유지해야 하므로, 왼쪽/
 * 오른쪽에 실제로 보이는 버튼들의 폭 중 더 넓은 쪽을 기준으로 양쪽에 똑같이 안전 여백을 두고
 * (비대칭 padding을 쓰면 버튼이 적을 때 제목이 한쪽으로 쏠려 보임) 그 안에 들어오는지만 본다.
 */
function lpFitBenchCycleTitle(titleEl) {
  if (!titleEl) return;
  const lpStat = titleEl.closest('.lp-stat');
  const panelRect = lpStat?.getBoundingClientRect();
  if (!lpStat || !panelRect?.width) { titleEl.style.fontSize = ''; return; }

  const isVisible = el => !!el && el.offsetParent !== null;
  const btnEdgeFrom = (selectors, pick) => selectors.reduce((acc, sel) => {
    const el = lpStat.querySelector(sel);
    if (!isVisible(el)) return acc;
    return pick(acc, el.getBoundingClientRect());
  }, 0);
  const leftEdge = btnEdgeFrom(BC_CYCLE_TITLE_LEFT_BTN_SELECTORS,
    (acc, r) => Math.max(acc, r.right - panelRect.left));
  const rightGap = btnEdgeFrom(BC_CYCLE_TITLE_RIGHT_BTN_SELECTORS,
    (acc, r) => Math.max(acc, panelRect.right - r.left));

  const sideMargin = Math.max(leftEdge, rightGap, 0) + BC_CYCLE_TITLE_SAFE_GAP_PX;
  const availableWidth = Math.max(20, panelRect.width - sideMargin * 2);

  const text = titleEl.textContent;
  const MEASURE_BUFFER_PX = 2; // canvas vs 실제 DOM 렌더 간 미세한 커닝 차이 대비
  let size = BC_CYCLE_TITLE_FONT_MAX;
  while (bcMeasureTitleWidth(text, size, titleEl) + MEASURE_BUFFER_PX > availableWidth && size > BC_CYCLE_TITLE_FONT_MIN) {
    size--;
  }
  titleEl.style.fontSize = size + 'px';
}

/** lp-stat 교체명단 사이클 패널 HTML 빌드. 선수 없으면 빈 상태 표시. */
function buildBenchCyclePanelHtml(players, teamName, accentColor) {
  const accentStyle = accentColor ? ` style="--dp-team-accent:${dpEscape(accentColor)}"` : '';
  const title = `<div class="st-title-bar bc-cycle-title"${accentStyle}>${dpEscape(teamName)} 교체명단</div>`;
  if (!players || !players.length) {
    return `${title}<div class="st-empty">교체 선수 없음</div>`;
  }
  // 모든 선수를 단일 리스트로 — CSS columns + JS 오버플로 감지가 2열 전환을 처리
  return `${title}<div class="bc-body">${players.map(p => lpBuildRosterRowHtml(p, 'bench')).join('')}</div>`;
}

/**
 * 교체명단 사이클 패널의 2열 전환 처리.
 * 패딩/폰트는 항상 고정값 그대로 두고(stats-panel의 itemsPerPage 계산과 같은 방식 —
 * 정상 크기 기준으로 몇 줄이 들어가는지만 본다), 정상 크기로 1열에 다 안 들어가면(=마지막
 * 행이 가려짐) bc-two-col로 2열 전환한다.
 * columns: 2; column-fill: auto 로 왼쪽 컬럼을 끝까지 채우고 넘치는 만큼만 오른쪽으로 보낸다
 * (balance는 균등하게 나누지만 굳이 안 옮겨도 될 줄까지 오른쪽으로 끌고 가는 단점이 있어 폐기).
 */
function lpBenchCycleRebalance(panel) {
  lpFitBenchCycleTitle(panel?.querySelector('.bc-cycle-title'));

  const body = panel?.querySelector('.bc-body');
  if (!body) return;

  const rowCount = Array.from(body.children)
    .filter(child => child.classList?.contains('dp-item'))
    .length;
  if (rowCount <= BENCH_CYCLE_SINGLE_COLUMN_MAX_ROWS) {
    body.classList.remove('bc-two-col', 'bc-scroll-mode');
    panel.removeAttribute('data-bench-scroll');
    return;
  }

  if (!body.getClientRects().length || body.clientHeight <= 0) return;

  // 1열 상태에서 overflow 측정
  body.classList.remove('bc-two-col', 'bc-scroll-mode');
  panel.removeAttribute('data-bench-scroll');
  const overflows = body.scrollHeight > body.clientHeight + BENCH_CYCLE_OVERFLOW_EPSILON_PX;
  if (!overflows) return;

  // 2열로 전환 후 여전히 overflow이면 1열 + 자동 스크롤 폴백
  body.classList.add('bc-two-col');
  const twoColOverflows = body.scrollHeight > body.clientHeight + BENCH_CYCLE_OVERFLOW_EPSILON_PX;
  if (twoColOverflows) {
    body.classList.remove('bc-two-col');
    body.classList.add('bc-scroll-mode');
    panel.setAttribute('data-bench-scroll', 'true');
  }
}

/**
 * lineup-resize.js의 패널 너비/높이 드래그 종료 직후 호출용 — stRerenderActivePanels와 같은 시점에
 * 보이는/숨겨진 교체명단 사이클 패널을 모두 재계산한다. ResizeObserver가 .lp-stat 자체의 크기 변화는
 * 잡아내지만, 드래그 도중에는 .bc-body 안쪽 줄 수/줄바꿈이 같이 바뀌므로 드래그 종료 시점에 한 번 더
 * 정확하게 재확인할 필요가 있다.
 */
function lpBenchCycleRebalanceAll() {
  document.querySelectorAll('.lp-stat [data-bench-home-panel], .lp-stat [data-bench-away-panel]')
    .forEach(lpBenchCycleRebalance);
}
window.lpBenchCycleRebalanceAll = lpBenchCycleRebalanceAll;
window.lpBenchCycleRebalance = lpBenchCycleRebalance;

/** 홈/원정 교체명단 사이클 패널 렌더 + rebalance + ResizeObserver 등록, lp-stat 사이클 가시성 갱신. */
function renderBenchCyclePanels(effectiveData) {
  const cs = (typeof chromaSafe === 'function') ? chromaSafe : (v => v);
  const homeColor = cs(normalizeHexColor(state?.colors?.homeBg, '#2563eb'));
  const awayColor = cs(normalizeHexColor(state?.colors?.awayBg, '#dc2626'));
  const homeSubs = effectiveData?.homeLineup?.substitutes || [];
  const awaySubs = effectiveData?.awayLineup?.substitutes || [];

  window._lpStatBenchData = {
    home: homeSubs.length > 0 ? homeSubs : null,
    away: awaySubs.length > 0 ? awaySubs : null,
  };

  document.querySelectorAll('.lp-stat [data-bench-home-panel]').forEach(el => {
    el.innerHTML = buildBenchCyclePanelHtml(homeSubs, getTeamName(effectiveData, 'home'), homeColor);
  });
  document.querySelectorAll('.lp-stat [data-bench-away-panel]').forEach(el => {
    el.innerHTML = buildBenchCyclePanelHtml(awaySubs, getTeamName(effectiveData, 'away'), awayColor);
  });

  // 렌더 직후 rebalance
  requestAnimationFrame(() => {
    document.querySelectorAll('.lp-stat [data-bench-home-panel], .lp-stat [data-bench-away-panel]').forEach(lpBenchCycleRebalance);
  });

  // 패널 크기 변화(lineup-resize 등) 시 자동 재계산
  if (_benchCycleResizeObs) _benchCycleResizeObs.disconnect();
  if (typeof ResizeObserver !== 'undefined') {
    _benchCycleResizeObs = new ResizeObserver(() => {
      document.querySelectorAll('.lp-stat [data-bench-home-panel], .lp-stat [data-bench-away-panel]').forEach(lpBenchCycleRebalance);
    });
    document.querySelectorAll('.lp-stat').forEach(el => _benchCycleResizeObs.observe(el));
  }

  window.lpStatUpdateVisibility?.();
}

// ─── lp-stat 경기 정보 사이클 패널 ─────────────────────────────────────────

/**
 * 경기 정보 패널의 실제 배경색 근사치.
 * [data-match-info-panel] 자신은 배경이 없고 .lp-stat의 배경(`--panel-bg:
 * rgba(var(--panel-ui-rgb), var(--panel-alpha))`)이 그대로 비친다 — .lp-lineup류가 쓰는
 * `--lp-pitch-alpha`가 아니라 `--panel-alpha`가 실제로 적용되는 값이다(이전엔 이걸 착각해서
 * 유사도 판정이 거의 항상 빗나갔음). 그 값을 페이지 배경(`--bg-ui`) 위에 알파 합성해 추정한다
 * (그린스크린 모드 등으로 `--bg-ui`가 진한 초록이고 패널이 반투명하면 그 색이 비쳐 보임).
 */
function miResolveEffectiveBgHex() {
  const panelRgb = (typeof parseAnyColor === 'function') ? parseAnyColor(`rgb(${getCSS('--panel-ui-rgb') || '11, 18, 32'})`) : null;
  const base = (typeof parseAnyColor === 'function') ? parseAnyColor(normalizeTeamColorHex(getCSS('--bg-ui')) || '#111827') : null;
  if (!panelRgb || !base || typeof rgbToHex !== 'function') return '#0b1220';
  const alpha = clampNum(parseFloat(getCSS('--panel-alpha')), 0, 1, 1);
  const blend = (p, b) => p * alpha + b * (1 - alpha);
  return rgbToHex(blend(panelRgb.r, base.r), blend(panelRgb.g, base.g), blend(panelRgb.b, base.b));
}

// WCAG AA 기준(일반 텍스트 4.5:1)을 기준으로 삼는다. 팀 컬러 유사도(deltaE)는 "두 팀 배지색이
// 구분되는가"를 보는 지표라 톤(초록 vs 청록)만 달라도 안 비슷하다고 판정되기 쉬운데, 여기서
// 문제되는 건 어두운 팀 컬러 글자가 어두운 패널 배경에 묻히는 "명도 대비" 부족이라 밝기 기반
// contrast ratio가 더 맞다.
const MI_LABEL_MIN_CONTRAST = 4.5;
// 테두리(stroke) 색 — 팀 컬러의 보색을 쓰면 팀 컬러에 따라 형광/원색이 튀어나와 눈이 피로할 수
// 있어, 항상 이 고정된 은은한 화이트로 통일한다(완전한 #ffffff보다 살짝 차분하게).
const MI_LABEL_BORDER_COLOR = '#e6e6e6';

/** lp-stat 경기 정보 사이클 패널 HTML 빌드. */
function buildMatchInfoCyclePanel(effectiveData) {
  const matchInfo = effectiveData?.matchInfo || {};
  const cs = (typeof chromaSafe === 'function') ? chromaSafe : (v => v);
  const homeAccent = cs(normalizeHexColor(state?.colors?.homeBg, '#2563eb'));
  const awayAccent = cs(normalizeHexColor(state?.colors?.awayBg, '#dc2626'));
  const effectiveBg = miResolveEffectiveBgHex();

  const homeCoach = getCoachName(effectiveData?.homeLineup) || '-';
  const awayCoach = getCoachName(effectiveData?.awayLineup) || '-';
  const referee = matchInfo.refereeName || '-';
  const leagueName = matchInfo.leagueName || '-';
  const leagueRound = String(matchInfo.leagueRound || '').trim();
  const venueName = matchInfo.venueName || '-';
  const venueCity = String(matchInfo.venueCity || '').trim();
  const venue = (venueCity && venueName !== '-' && venueCity !== venueName) ? `${venueName}, ${venueCity}` : venueName;
  const kickoff = formatBenchKickoffLocal(matchInfo);

  const miRow = (label, value, accentColor) => {
    let labelClass = 'mi-label';
    let labelStyle = '';
    if (accentColor) {
      const styleParts = [`--mi-label-color:${dpEscape(accentColor)}`];
      // 팀 컬러와 패널 배경의 명도 대비가 부족하면(둘 다 어두운 톤이라 글자가 묻히는 경우 등)
      // 테두리를 둘러 구분되게 한다. 보색은 팀 컬러에 따라 형광/원색이 나올 수 있어 눈이
      // 피로하므로, 항상 고정된 은은한 화이트(완전 #fff는 아님)로 통일.
      const contrast = (typeof teamColorContrastRatio === 'function')
        ? teamColorContrastRatio(accentColor, effectiveBg) : 21;
      if (contrast < MI_LABEL_MIN_CONTRAST) {
        styleParts.push(`--mi-label-border-color:${MI_LABEL_BORDER_COLOR}`);
        labelClass += ' mi-label-accented';
      }
      labelStyle = ` style="${styleParts.join(';')}"`;
    }
    return `<div class="mi-row">
      <span class="${labelClass}"${labelStyle}>${dpEscape(label)}</span>
      <span class="mi-value">${dpEscape(value || '-')}</span>
    </div>`;
  };

  return `<div class="st-title-bar mi-panel-title">경기 정보</div>
<div class="mi-body">
  <div class="mi-section">
    ${miRow('홈 감독', homeCoach, homeAccent)}
    ${miRow('원정 감독', awayCoach, awayAccent)}
  </div>
  <div class="mi-sep"></div>
  <div class="mi-section">
    ${miRow('주심', referee)}
  </div>
  <div class="mi-sep"></div>
  <div class="mi-section">
    ${miRow('대회', leagueName)}
    ${leagueRound ? miRow('라운드', leagueRound) : ''}
    ${miRow('경기장', venue)}
    ${miRow('킥오프', kickoff)}
  </div>
</div>`;
}

/** lp-stat 경기 정보 사이클 패널 렌더 — _lpStatMatchInfoAvailable 플래그 갱신.
 *  lpStatUpdateVisibility는 이후 renderBenchCyclePanels에서 한 번만 호출됨. */
function renderMatchInfoCyclePanel(effectiveData) {
  const hasData = !!(effectiveData?.matchInfo);
  window._lpStatMatchInfoAvailable = hasData;
  document.querySelectorAll('.lp-stat [data-match-info-panel]').forEach(el => {
    el.innerHTML = hasData ? buildMatchInfoCyclePanel(effectiveData) : '';
  });
}

/** 부상자 명단 패널 전체 갱신 — 타이틀/입력버튼/팀명/좌우 리스트. */
function renderInjuryPanel(effectiveData, rawData) {
  const panel = document.getElementById('injuryPanel');
  if (!panel) return;

  // 1) 패널 모드와 수동 입력 버튼 상태를 맞춘다.
  panel.classList.toggle('dp-mode-long', typeof isLongName === 'function' && isLongName('roster'));
  setPanelTitle(panel, '부상자 명단', [
    shouldShowInjuryManualButton(rawData, 'home') ? buildTitleActionButton('injury', 'home') : '',
    shouldShowInjuryManualButton(rawData, 'away') ? buildTitleActionButton('injury', 'away') : '',
  ].filter(Boolean).join(''));

  // 2) 좌우 팀명을 갱신한다.
  setSideName(panel, 'injury', 'home', getTeamName(effectiveData, 'home'));
  setSideName(panel, 'injury', 'away', getTeamName(effectiveData, 'away'));

  // 3) raw/effective 어느 쪽이든 데이터가 있는지 판단해 empty 문구를 제어한다.
  const hasHomeInjuryData = Array.isArray(rawData?.homeInjuries) || Array.isArray(effectiveData?.homeInjuries);
  const hasAwayInjuryData = Array.isArray(rawData?.awayInjuries) || Array.isArray(effectiveData?.awayInjuries);

  // 4) 최종 리스트 HTML을 좌우 컬럼에 삽입한다.
  const homeList = panel.querySelector('[data-injury-side="home"] .dp-list');
  const awayList = panel.querySelector('[data-injury-side="away"] .dp-list');
  if (homeList) homeList.innerHTML = buildInjuryListHtml(effectiveData?.homeInjuries, hasHomeInjuryData);
  if (awayList) awayList.innerHTML = buildInjuryListHtml(effectiveData?.awayInjuries, hasAwayInjuryData);
}

/**
 * 선발 라인업 패널을 모든 라인업 인스턴스에 동기 렌더한다.
 * 포메이션 + startXi가 모두 유효하면 피치 모드, 아니면 리스트 모드로 자동 전환된다.
 */
function renderLineupGrid(effectiveData, rawData) {
  // 메인 (캠 큼) + 메인 (캠 작음) 양쪽 페이지에 같은 라인업 패널이 있으므로
  // [data-dp-role="lineup"]가 붙은 모든 인스턴스에 동일하게 렌더.
  const panels = document.querySelectorAll('[data-dp-role="lineup"]');
  if (!panels.length) return;

  // 1) 홈/원정 모두 피치 렌더가 가능한지 먼저 판단한다.
  const usePitchMode =
    canRenderPitchMode(effectiveData?.homeLineup) &&
    canRenderPitchMode(effectiveData?.awayLineup);

  // 2) 사용할 마크업(pitch/list)과 이름 길이 모드를 고른다.
  // splitLineup 설정이 ON이면 layout-big에서만 두 피치로 분리 — layout-small은 항상 combined 모드.
  const splitOn = typeof getSetting === 'function' && getSetting('splitLineup') === 'on';
  const bigPitchOptions = { awaySupportLiftPct: 3.5, awayFwLiftPct: 3, formationOnly: true };
  const bigCombinedHtml = usePitchMode
    ? buildLineupPitchModeHtml(effectiveData, rawData, bigPitchOptions)
    : buildLineupListModeHtml(effectiveData, rawData);
  const smallCombinedHtml = usePitchMode
    ? buildLineupPitchModeHtml(effectiveData, rawData, { awaySupportLiftPct: 2, awayFwLiftPct: 2, homeFwLiftPct: 1.5 })
    : buildLineupListModeHtml(effectiveData, rawData);
  const splitHtml = (usePitchMode && splitOn)
    ? buildLineupSplitPitchModeHtml(effectiveData, rawData, { formationOnly: true })
    : bigCombinedHtml;

  const longMode = typeof isLongName === 'function' && isLongName('lineup');

  // 3) 현재 페이지에 떠 있는 모든 라인업 패널 인스턴스에 같은 결과를 주입한다.
  panels.forEach(panel => {
    const body = ensureLineupPanelScaffold(panel);
    if (!body) return;
    const isBig = !!panel.closest('.layout-big');
    const splitActive = isBig && splitOn && usePitchMode;
    panel.classList.toggle('dp-mode-long', longMode);
    panel.classList.toggle('dp-mode-split', splitActive);
    // outer .lp-lineup wrapper — aspect-ratio 변경을 위해 같은 클래스 미러.
    const wrap = panel.closest('.lp-lineup, .lp-lineup-s');
    if (wrap) wrap.classList.toggle('dp-mode-split', splitActive);
    setPanelTitle(panel, '선발 라인업', '');
    body.innerHTML = isBig ? splitHtml : smallCombinedHtml;
  });
}

/**
 * 라인업 1팀치를 전술판(tactics.js)이 기대하는 player 객체 배열로 변환.
 * - 11개 슬롯을 포메이션 grid 순서대로 정렬해 originalIndex 자리에 player 정보 삽입.
 * - _isReal=true 마킹 — tactics 렌더가 포지션 라벨 대신 nameKo를 표시하게 함.
 * - 누락된 슬롯은 null (전술판에서 빈 자리 그대로 표시).
 */
function buildTacticsPlayers(lineup) {
  const labels = getFormationSlotLabels(lineup.formation);
  const slots = getFormationSlotsByGridOrder(lineup.formation);
  const players = Array.from({ length: Math.max(slots.length, labels.length, 11) }, () => null);

  getFormationAssignments(lineup).forEach(({ slot, player }) => {
    // Iter 5-8: tactics-timeline.js의 빈 자리 마커는 토큰 렌더 X (퇴장 선수의 빈 자리).
    if (player?._emptySlot) return;
    players[slot.originalIndex] = {
      number: player.number ?? '',
      nameKo: pickName(player, 'lineup') || player.name || '',
      photoUrl: player.photoUrl || '',
      pos: player.pos || inferBasePos(labels[slot.originalIndex]),
      _isReal: true,
    };
  });

  return players;
}

/**
 * 양 팀 모두 포메이션 + startXi가 있을 때만 전술판 연동용 payload 생성.
 * 한쪽이라도 부족하면 null — 전술판은 기본 포메이션으로 대기.
 */
function buildTacticsPayload(effectiveData) {
  if (!hasValidFormation(effectiveData?.homeLineup) || !hasValidFormation(effectiveData?.awayLineup)) return null;
  if (!hasStartXi(effectiveData?.homeLineup) || !hasStartXi(effectiveData?.awayLineup)) return null;

  return {
    home: {
      teamName: getTeamName(effectiveData, 'home'),
      formation: effectiveData.homeLineup.formation,
      players: buildTacticsPlayers(effectiveData.homeLineup),
    },
    away: {
      teamName: getTeamName(effectiveData, 'away'),
      formation: effectiveData.awayLineup.formation,
      players: buildTacticsPlayers(effectiveData.awayLineup),
    },
  };
}

/**
 * fixture 기반 라인업이 사라졌을 때 전술판을 기본 토큰 상태로 되돌린다.
 * 경기 데이터가 없어도 토큰은 유지하고, 이름만 포지션 폴백으로 표시한다.
 */
function clearTacticsLineupSync(data = lineupPanelState.lastFixture) {
  if (
    typeof tacticsApplyLineup === 'function'
    && typeof TACTICS_MOCK_LINEUP !== 'undefined'
    && TACTICS_MOCK_LINEUP
  ) {
    tacticsApplyLineup(TACTICS_MOCK_LINEUP);
    return;
  }

  const pitch = document.getElementById('tactics-pitch');
  if (pitch) pitch.querySelectorAll('.tactics-token, .tactics-ball-token').forEach(node => node.remove());

  if (typeof tacticsState !== 'undefined' && tacticsState) {
    tacticsState.lineup = null;
    tacticsState.homePositions = [];
    tacticsState.awayPositions = [];
  }

  const homeLabel = document.getElementById('tactics-home-label');
  const awayLabel = document.getElementById('tactics-away-label');
  if (homeLabel) homeLabel.textContent = getTeamName(data, 'home');
  if (awayLabel) awayLabel.textContent = getTeamName(data, 'away');
}

/** 전술판에 effectiveData 기반 라인업 적용 시도. payload 만들기 실패면 false. */
function syncTacticsBoard(effectiveData, options = {}) {
  const payload = buildTacticsPayload(effectiveData);
  if (payload && typeof tacticsApplyLineup === 'function') {
    tacticsApplyLineup(payload, options);
    return true;
  }
  return false;
}


// ─── 라인업 패널 재렌더 진입점 ──────────────────────────────────────────
// fixture 재적용, 수동 저장/초기화, 페이지 재활성화 시 모두 이 경로로 들어온다.
/**
 * 상세 패널(라인업/벤치/부상) + 전술판 일괄 재렌더.
 *
 * 1) lastFixture 없으면 패널 비우고 종료.
 * 2) buildEffectiveFixtureData로 raw + 수동 override 합성 (mergedData).
 * 3) applySubReflectToFixture로 subReflect=on이면 교체 이벤트 기반 startXi/벤치 swap.
 * 4) 이벤트/평점 lookup 캐시 생성(lineupPanelState.context) — 렌더 헬퍼들이 매 row마다 read.
 * 5) 벤치/부상/라인업 그리드 + 전술판 4개 패널 동시 갱신.
 * 6) 다음 frame(layout 안정화 후)에 fitLineupNamePills/fitBenchFooterNames/balanceBenchInjuryPanelHeights 호출.
 */
function rerenderLineupPanels() {
  if (!lineupPanelState.lastFixture) {
    clearLineupPanels();
    return;
  }

  initBenchInjuryPanelObserver();

  // 1) raw fixture + 수동 override를 합성한 표시용 데이터를 만든다.
  // (a) manual override 합성 → (b) subReflect ON이면 교체 이벤트로 startXi/벤치 자동 swap
  const mergedData = buildEffectiveFixtureData(lineupPanelState.lastFixture);
  const effectiveData = applySubReflectToFixture(mergedData);
  lineupPanelState.lastEffectiveData = effectiveData;
  if (typeof setLineupInitialCollisionContext === 'function') {
    setLineupInitialCollisionContext(effectiveData);
  }

  // Iter 5-3: 라인업 노드/벤치 행에서 사용할 이벤트/평점 lookup을 한 번만 계산해 캐시.
  // 렌더 헬퍼들이 lineupPanelState.context에서 읽어 쓰도록 한다.
  // mergedData.events는 evPatchSubstEvents를 거쳐 null playerId override가 반영됐으므로,
  // rawEvents 대신 mergedData.events를 사용해 재교체 선수 subOut이 올바르게 집계되도록 한다.
  // 추가로 ID는 틀렸지만 이름/닉네임으로 교체가 해석된 경우엔,
  // 마커 집계도 실제로 매칭된 선수 ID를 따라가야 들어온 선수에게 +분 마커가 붙는다.
  const rawEvents = Array.isArray(mergedData?.events) ? mergedData.events : [];
  const markerEvents = typeof lpResolveSubstEventIdsForAggregation === 'function'
    ? lpResolveSubstEventIdsForAggregation(mergedData)
    : rawEvents;
  // 응답 필드명은 'playerStats' (FixtureResponseDto.playerStats — PlayerStatsDto 리스트).
  // 'players'가 아니므로 주의 (CLAUDE.md 표기가 과거에 'players'로 적혀있었지만 실제 backend는 playerStats).
  const rawPlayerStats = Array.isArray(effectiveData?.playerStats) ? effectiveData.playerStats : (Array.isArray(lineupPanelState.lastFixture?.playerStats) ? lineupPanelState.lastFixture.playerStats : []);
  lineupPanelState.context = {
    eventsByPlayer: typeof lpAggregatePlayerEvents === 'function' ? lpAggregatePlayerEvents(markerEvents) : new Map(),
    ratingByPlayer: typeof lpBuildRatingMap === 'function' ? lpBuildRatingMap(rawPlayerStats) : new Map(),
  };

  // 2) 상세 패널 3종과 전술판을 같은 기준 데이터로 동시에 갱신한다.
  renderBenchPanel(effectiveData, lineupPanelState.lastFixture);
  renderInjuryPanel(effectiveData, lineupPanelState.lastFixture);
  renderLineupGrid(effectiveData, lineupPanelState.lastFixture);
  syncTacticsBoard(effectiveData);
  renderMatchInfoCyclePanel(effectiveData);
  renderBenchCyclePanels(effectiveData);

  // 3) DOM이 실제 배치된 다음 frame에서 텍스트 피팅을 다시 돌린다.
  // 라인업 그리드의 이름 pill 폭을 실제 렌더된 라인 폭에 맞춤 (layout 안정화 다음 frame).
  // 양쪽 페이지의 라인업 인스턴스 모두 처리.
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-dp-role="lineup"]').forEach(p => fitLineupNamePills(p));
    fitBenchFooterNames(document.getElementById('benchPanel'));
    balanceBenchInjuryPanelHeights();
  });
}

/** 외부에서 fixture 데이터를 넘겨 상세 패널 전체를 적용할 때 쓰는 공개 진입점. */
function applyLineupPanels(fixtureData) {
  if (!fixtureData) {
    clearLineupPanels();
    return;
  }
  // 경기 ID가 실제로 바뀔 때만 전술판 수동 입력 이름을 지운다.
  // 같은 경기를 폴링할 때는 clearTacticsLineupSync를 생략해 전술판 상태를 보존한다.
  const incomingId = String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
  const currentId = String(lineupPanelState.lastFixture?.matchInfo?.fixtureId ?? '').trim();
  if (incomingId !== currentId) clearTacticsLineupSync();
  lineupPanelState.lastFixture = fixtureData;
  if (typeof tacticsSyncManualNamesButtonState === 'function') tacticsSyncManualNamesButtonState();
  rerenderLineupPanels();
}

/** fixture가 비워졌을 때 상세 패널과 전술판을 모두 기본 상태로 되돌린다. */
function clearLineupPanels() {
  lineupPanelState.lastFixture = null;
  lineupPanelState.lastEffectiveData = null;
  lineupPanelState.manualModal = null;
  if (typeof setLineupInitialCollisionContext === 'function') {
    setLineupInitialCollisionContext(null);
  }
  closeManualPanel();
  resetBenchInjuryPanelHeights();

  const benchPanel = document.getElementById('benchPanel');
  if (benchPanel) {
    setPanelTitle(benchPanel, '교체 명단', '', buildBenchForceRefreshButtonHtml());
    benchPanel.classList.remove('dp-mode-long');
    benchPanel.querySelectorAll('.dp-list').forEach(list => { list.innerHTML = ''; });
    benchPanel.querySelectorAll('.dp-side-name').forEach(el => { el.textContent = 'TEAM'; });
    benchPanel.querySelectorAll('.dp-coach-name, .dp-referee-name').forEach(el => {
      el.textContent = '-';
      el.classList.remove('dp-coach-editable', 'dp-coach-editing', 'dp-referee-editable', 'dp-referee-editing');
      delete el.dataset.coachSide;
      delete el.dataset.apiMissing;
    });
    const leagueEl = benchPanel.querySelector('[data-bench-venue] .dp-league-name');
    const venueEl = benchPanel.querySelector('[data-bench-venue] .dp-venue-name');
    const kickoffEl = benchPanel.querySelector('[data-bench-kickoff] .dp-kickoff-time');
    if (leagueEl) leagueEl.textContent = '-';
    if (venueEl) venueEl.textContent = '-';
    if (kickoffEl) kickoffEl.textContent = '-';
  }

  const injuryPanel = document.getElementById('injuryPanel');
  if (injuryPanel) {
    setPanelTitle(injuryPanel, '부상자 명단');
    injuryPanel.classList.remove('dp-mode-long');
    injuryPanel.querySelectorAll('.dp-list').forEach(list => { list.innerHTML = ''; });
    injuryPanel.querySelectorAll('.dp-side-name').forEach(el => { el.textContent = 'TEAM'; });
  }

  // 라인업 패널 다중 인스턴스 정리 (메인 캠 큼 + 메인 캠 작음)
  document.querySelectorAll('[data-dp-role="lineup"]').forEach(lineupPanel => {
    const body = ensureLineupPanelScaffold(lineupPanel);
    setPanelTitle(lineupPanel, '선발 라인업');
    lineupPanel.classList.remove('dp-mode-long');
    if (body) body.innerHTML = '';
  });

  clearTacticsLineupSync();
  if (typeof tacticsSyncManualNamesButtonState === 'function') tacticsSyncManualNamesButtonState();

  window._lpStatBenchData = null;
  window._lpStatMatchInfoAvailable = false;
  document.querySelectorAll('.lp-stat [data-match-info-panel]').forEach(el => { el.innerHTML = ''; });
  window.lpStatUpdateVisibility?.();
}


// 테마 탭에서 홈/원정 컬러 변경 시 라인업 토큰/팀 chip도 재렌더 (전술판과 동일한 동작)
document.addEventListener('theme:colors-changed', () => {
  if (!lineupPanelState.lastFixture) return;
  // home/away 컬러 키만 영향 — 다른 키(boardA/scoreBg 등)도 들어오지만 재렌더 비용 작아서 통과
  rerenderLineupPanels();
});

document.addEventListener('settings:change', event => {
  if (!lineupPanelState.lastFixture) return;
  // Iter 5-3: subReflect / per-feature 토글이 바뀌면 라인업 재렌더가 필요.
  // 평점 색상 7구간(ratingColor*)도 변경 시 노드 평점 박스 즉시 갱신.
  const re = ['roster', 'lineup', 'lineupNode', 'teamName',
    'lineupHideInitial', 'lineupShowNumber',
    'subReflect', 'lineupShowGoals', 'lineupShowCards', 'lineupShowRating', 'lineupShowSubTime',
    'splitLineup', 'leagueLogoPos',
    'ratingColorBelow6', 'ratingColor6', 'ratingColor65',
    'ratingColor7', 'ratingColor8', 'ratingColor9', 'ratingColor95'];
  if (!re.includes(event.detail?.category)) return;
  rerenderLineupPanels();
});
