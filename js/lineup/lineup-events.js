// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 이벤트 집계 / 평점] (Iter 5-3)
// 라인업 노드(피치) + 벤치 행에 골/어시/카드/교체/평점을 표시하기 위한 공통 헬퍼.
// 데이터 소스: fixtureData.events (이벤트), fixtureData.players (PlayerStats — rating).
// 호출 시점: lineup-render.js의 rerenderLineupPanels에서 effectiveData 합성 직후.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 이벤트 시간 비교용 — extra까지 합산해 정렬 키로 사용. */
function lpEventTimeKey(ev) {
  const elapsed = Number(ev?.elapsed ?? 0);
  const extra = Number(ev?.extra ?? 0);
  return elapsed + (Number.isFinite(extra) ? extra * 0.01 : 0);
}

/** "{elapsed}'" 또는 "{elapsed}+{extra}'" — 자리 절약을 위해 분 단위만. */
function lpFormatEventTime(time) {
  if (!time || !Number.isFinite(Number(time.elapsed))) return '';
  const elapsed = Number(time.elapsed);
  const extra = Number(time.extra);
  return Number.isFinite(extra) && extra > 0 ? `${elapsed}+${extra}'` : `${elapsed}'`;
}

/**
 * 선수 이름을 비교용으로 정규화. 공백/하이픈/점/따옴표를 제거하고 소문자화.
 * "J. Mateta" / "J. Mateta " / "j.mateta"가 모두 같은 키로 매칭되도록.
 */
function lpNormalizePlayerName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-.'"]/g, '');
}

/**
 * 한 선수 객체에서 이름 후보(short/long, 영/한)를 모두 모아 정규화 배열로 반환.
 * 백엔드 응답이 일관되지 않은 키(name/playerName/nameKoLong/playerNameKoLong)를 흡수.
 */
function lpCollectPlayerNames(player) {
  if (!player || typeof player !== 'object') return [];
  return [
    typeof getPlayerNickname === 'function' && player.playerId != null
      ? getPlayerNickname(
        player.playerId,
        // id=0 선수만 이름 키로 조회(id≠0이면 두 번째 인자는 무시됨)
        Number(player.playerId) === 0 && typeof playerNicknameSourceName === 'function'
          ? playerNicknameSourceName(player)
          : undefined
      )
      : null,
    player.name,
    player.nameKoLong,
    player.playerName,
    player.playerNameKoLong,
    player.origName,
    player.playerOrigName,
  ]
    .map(lpNormalizePlayerName)
    .filter(Boolean);
}

/**
 * 라인업/벤치 배열에서 matcher와 매칭되는 선수의 인덱스를 찾는다.
 * ID를 우선하되, 이름이 명확하게 다른 한 선수를 가리키면 해당 선수를 사용한다.
 * API가 서로 다른 선수에게 같은 이벤트 ID를 주는 경우에도 이름이 모호하면 추측하지 않는다.
 * 3) 둘 다 실패 시 -1 반환 (호출자가 swap 스킵 + 경고 로그).
 */
function lpFindLineupPlayerIndex(players, matcher) {
  if (!Array.isArray(players) || !matcher || typeof matcher !== 'object') return -1;

  // 1) playerId 우선 매칭 — 실제 ID(0 초과)일 때만. 0은 "ID 없음"이라 ID로 찾으면 명단에서 ID가 0인
  //    첫 선수가 엉뚱하게 잡힌다(예: 교체 IN을 ID 0 선수로 고르면 다른 ID 0 벤치 선수가 대신 투입됨).
  const targetId = Number(matcher.playerId) > 0 ? String(Number(matcher.playerId)) : null;
  const byId = targetId ? players.findIndex(player => String(player?.playerId) === targetId) : -1;

  // 2) 이름 fallback — 이벤트 측 이름 후보 정규화.
  const targetNames = [
    matcher.playerName,
    matcher.playerNameKoLong,
    matcher.playerOrigName,
  ]
    .map(lpNormalizePlayerName)
    .filter(Boolean);
  if (!targetNames.length) return byId;

  // 이름만 일치하는 첫 항목을 고르면 동명이인이 잘못 교체될 수 있으므로 유일성을 확인한다.
  const matches = [];
  players.forEach((player, index) => {
    const candidateNames = lpCollectPlayerNames(player);
    if (candidateNames.some(name => targetNames.includes(name))) matches.push(index);
  });
  if (matches.includes(byId)) return byId;
  if (matches.length === 1) return matches[0];
  return matches.length ? -1 : byId;
}

/** 이미 명단에 있는 ID가 다른 선수의 이름으로 사용된 이벤트만 개별 보정한다.
 * ID 전체를 리매핑하면 정상 이벤트까지 다른 선수에게 넘어가므로 이벤트 단위로 처리한다.
 * ID 없는 선수는 0 + 명단 표시명을 유지해 카드/교체 집계의 이름 키도 일치시킨다.
 */
function lpReconcileConflictingEventIds(data, manualLinks = {}) {
  if (!Array.isArray(data?.events)) return;
  data.events = data.events.map(ev => {
    if (!ev) return ev;
    const lineup = data[`${ev.side}Lineup`];
    const roster = [...(lineup?.startXi || []), ...(lineup?.substitutes || [])];
    let next = ev;
    ['player', 'assist'].forEach(field => {
      const id = Number(ev[`${field}Id`]);
      if (!(id > 0) || !roster.some(p => Number(p?.playerId) === id)) return;
      // 교체 이벤트 자체의 수동 선택, 또는 이 이벤트의 이름에 해당하는 선수 링크만 우선한다.
      const fixtureId = String(data.matchInfo?.fixtureId ?? '');
      if (String(ev.type || '').toLowerCase() === 'subst' && fixtureId
        && typeof evGetSubstOverride === 'function' && evGetSubstOverride(fixtureId, ev, field)) return;
      const eventNames = [ev[`${field}Name`], ev[`${field}NameKoLong`], ev[`${field}OrigName`]]
        .map(lpNormalizePlayerName).filter(Boolean);
      const namePrefix = `${ev.side}:n:`;
      if (eventNames.length && Object.entries(manualLinks).some(([key, value]) => {
        const idLink = key === `${ev.side}:id:${id}`;
        const nameLink = key.startsWith(namePrefix) && Number(value?.playerId) === id;
        if (!idLink && !nameLink) return false;
        const linkNames = [value?.name, value?.nameKoLong, nameLink ? key.slice(namePrefix.length) : null]
          .map(lpNormalizePlayerName).filter(Boolean);
        return linkNames.some(name => eventNames.includes(name));
      })) return;
      const index = lpFindLineupPlayerIndex(roster, {
        playerId: id,
        playerName: ev[`${field}Name`],
        playerNameKoLong: ev[`${field}NameKoLong`],
        playerOrigName: ev[`${field}OrigName`],
      });
      const player = roster[index];
      if (!player || Number(player.playerId) === id) return;
      next = {
        ...next,
        [`${field}Id`]: Number(player.playerId) || 0,
        [`${field}Name`]: player.name || player.playerName || '',
        [`${field}NameKoLong`]: player.nameKoLong || null,
        [`${field}OrigName`]: player.origName || null,
      };
    });
    return next;
  });
}

/**
 * playerId가 실제 값(0 아님)이면 그대로 문자열 키로 쓰고, 0/null이면 "0:{side}:{정규화된 이름}"
 * 합성 키로 구분한다. API가 여러 선수의 ID를 다 못 준 팀(하위 리그 등)에서, 라인업/벤치에
 * playerId=0인 선수가 여럿 있을 때 전부 같은 "0" 키로 뭉쳐 한 이벤트(카드/골/교체)가 무관한
 * 선수 전원에게 표시되던 충돌을 막는다. 이름은 이벤트 쪽(playerName/assistName)과 라인업 쪽
 * (player.name) 둘 다 백엔드 KoResolver를 거쳐 동일한 표시명을 쓰므로 정규화 후 일치한다.
 * 이름조차 없으면(사실상 식별 불가) null을 반환해 호출자가 집계를 건너뛰게 한다.
 */
function lpEventPersonKey(id, side, name) {
  const pid = Number(id);
  if (pid) return String(pid);
  const normalized = lpNormalizePlayerName(name);
  if (!normalized) return null;
  return `0:${side || ''}:${normalized}`;
}
window.lpEventPersonKey = lpEventPersonKey;

/**
 * 라인업 풀폼(완전 수동 입력, `_manual: true`)으로 만든 선수는 playerId가 없어 API events와
 * 전혀 연결될 수 없다 — lineup-manual-modal.js의 골/자책골/도움/경고/퇴장 입력칸에 사용자가
 * 직접 넣은 값을 lpAggregatePlayerEvents가 만드는 events와 정확히 같은 모양으로 변환해,
 * lpBuildNodeBadgesHtml/lpBuildCardMarkersHtml/lpBuildGoalsAssistsHtml/lpCardKind 등
 * 기존 배지 렌더링 함수를 그대로 재사용할 수 있게 한다. 분(minute) 정보가 없으므로
 * time은 전부 null — 위 렌더 함수들은 개수/존재 여부만 보고 time은 쓰지 않아 안전하다.
 * 값이 하나도 없으면 null(호출자가 일반 이벤트 조회로 폴백).
 */
function lpManualPlayerEventsOverride(player) {
  if (!player) return null;
  const goals = Number(player.manualGoals) || 0;
  const ownGoals = Number(player.manualOwnGoals) || 0;
  const assists = Number(player.manualAssists) || 0;
  const yellow = !!player.manualYellow;
  const red = !!player.manualRed;
  if (!goals && !ownGoals && !assists && !yellow && !red) return null;

  return {
    goals: Array.from({ length: goals }, () => ({ time: null, isPenalty: false, isOwnGoal: false })),
    ownGoals: Array.from({ length: ownGoals }, () => ({ time: null })),
    assists: Array.from({ length: assists }, () => ({ time: null })),
    yellow: yellow ? { time: null } : null,
    // 옐로+레드 둘 다 체크 = "2번째 경고 누적 퇴장"(lpCardKind가 yellow+red.isCumulative일 때만
    // 'cumulative'로 판정해 카드 2장을 같이 그림). 레드만 체크하면 일반 단독 퇴장.
    red: red ? { time: null, isCumulative: yellow } : null,
    subIn: null,
    subOut: null,
  };
}
window.lpManualPlayerEventsOverride = lpManualPlayerEventsOverride;

/**
 * fixtureData.events를 선수별로 집계.
 * 반환 Map<personKey, {
 *   goals: [{ time, isPenalty, isOwnGoal }],  // 정규 득점만 (자책골 제외)
 *   ownGoals: [{ time }],                     // 이 선수의 자책골
 *   assists: [{ time }],
 *   yellow: { time, total },          // 1회만 (두 번째는 second-yellow로 별도)
 *   red: { time, isCumulative },      // Red 또는 Second Yellow (퇴장)
 *   subIn: { time } | null,           // 이 선수가 교체 IN 됐을 때
 *   subOut: { time } | null,          // 이 선수가 교체 OUT 됐을 때
 * }>
 * personKey는 lpEventPersonKey 참고 — playerId가 있으면 그 숫자 그대로, 없으면
 * "0:{side}:{이름}" 합성 키. 렌더 쪽 lpGetPlayerEvents도 같은 함수로 조회해야 일치한다.
 *
 * Penalty Shootout 이벤트(comments==='Penalty Shootout')는 제외.
 * Own Goal은 goals가 아닌 별도의 ownGoals에 집계 — 정규 득점과 구분해서 표시하기 위함
 * (lpBuildNodeBadgesHtml이 자책골 카운트를 빨간 배경 배지로 별도 표시).
 */
function lpAggregatePlayerEvents(events) {
  const map = new Map();
  if (!Array.isArray(events)) return map;

  function ensure(key) {
    if (!map.has(key)) {
      map.set(key, { goals: [], ownGoals: [], assists: [], yellow: null, red: null, subIn: null, subOut: null });
    }
    return map.get(key);
  }

  // 같은 선수 두 번째 옐로 → red(누적) 변환을 위해 yellow 카운트 추적(personKey 기준).
  const yellowCount = new Map();

  events.forEach(ev => {
    if (!ev) return;
    const time = { elapsed: Number(ev.elapsed ?? 0), extra: Number(ev.extra ?? 0) };
    const type = String(ev.type || '').toLowerCase();
    const detail = String(ev.detail || '').trim();
    const isPso = String(ev.comments || '').trim() === 'Penalty Shootout';

    if (isPso) return;

    if (type === 'goal') {
      const isOwn = detail === 'Own Goal';
      const scorerSide = isOwn ? (ev.side === 'home' ? 'away' : ev.side === 'away' ? 'home' : ev.side) : ev.side;
      const playerKey = lpEventPersonKey(ev.playerId, scorerSide, ev.playerName);
      if (!playerKey) return;
      if (detail === 'Missed Penalty') return;
      const isPenalty = detail === 'Penalty';
      if (isOwn) {
        ensure(playerKey).ownGoals.push({ time });
      } else {
        ensure(playerKey).goals.push({ time, isPenalty, isOwnGoal: false });
      }
      // 어시스트는 Own Goal만 제외. 페널티는 보통 assistId가 없어 기록되지 않지만, 있으면 그대로 반영.
      const assistKey = lpEventPersonKey(ev.assistId, ev.side, ev.assistName);
      if (assistKey && !isOwn) {
        ensure(assistKey).assists.push({ time });
      }
      return;
    }

    if (type === 'card') {
      const playerKey = lpEventPersonKey(ev.playerId, ev.side, ev.playerName);
      if (!playerKey) return;
      const e = ensure(playerKey);
      if (detail === 'Yellow Card') {
        const next = (yellowCount.get(playerKey) || 0) + 1;
        yellowCount.set(playerKey, next);
        if (!e.yellow) e.yellow = { time };
        // 두 번째 옐로면 누적 퇴장으로 자동 마킹 (API가 별도 Red를 안 보낼 수도 있음).
        if (next >= 2 && !e.red) e.red = { time, isCumulative: true };
      } else if (detail === 'Second Yellow Card') {
        if (!e.yellow) e.yellow = { time }; // 두 번째 옐로만 와도 첫번째 옐로가 있었음을 함의 → 노란 표시
        e.red = { time, isCumulative: true };
      } else if (detail === 'Red Card') {
        const hadYellow = (yellowCount.get(playerKey) || 0) > 0;
        e.red = { time, isCumulative: hadYellow };
      }
      return;
    }

    if (type === 'subst') {
      // playerId = OUT, assistId = IN (이벤트 패널과 동일한 컨벤션)
      const outKey = lpEventPersonKey(ev.playerId, ev.side, ev.playerName);
      const inKey = lpEventPersonKey(ev.assistId, ev.side, ev.assistName);
      if (outKey) ensure(outKey).subOut = { time };
      if (inKey) ensure(inKey).subIn = { time };
    }
  });

  return map;
}

/**
 * 교체 이벤트가 playerId는 틀렸지만 이름/닉네임으로는 실제 라인업 선수와 매칭되는 경우,
 * 노드 마커 집계(subIn/subOut)도 "실제로 교체된 선수 ID"를 보도록 이벤트 사본을 보정한다.
 *
 * lpApplySubReflectToLineup과 같은 순서로 startXi/substitutes를 재구성하되,
 * 이벤트 패널 표시용 원본은 건드리지 않고 aggregate 전용 배열만 반환한다.
 */
function lpResolveSubstEventIdsForAggregation(fixtureData) {
  const events = Array.isArray(fixtureData?.events) ? fixtureData.events : [];
  if (!events.length) return events;

  const resolved = events.slice();

  ['home', 'away'].forEach(side => {
    const lineup = fixtureData?.[`${side}Lineup`];
    if (!Array.isArray(lineup?.startXi) || !Array.isArray(lineup?.substitutes)) return;

    const startXi = lineup.startXi.map(player => ({ ...player }));
    const substitutes = lineup.substitutes.map(player => ({ ...player }));
    const subEvents = events
      .map((ev, index) => ({ ev, index }))
      .filter(({ ev }) => ev && String(ev.type || '').toLowerCase() === 'subst' && ev.side === side)
      .sort((a, b) => lpEventTimeKey(a.ev) - lpEventTimeKey(b.ev));

    subEvents.forEach(({ ev, index }) => {
      const outIdx = lpFindLineupPlayerIndex(startXi, {
        playerId: ev.playerId,
        playerName: ev.playerName,
        playerNameKoLong: ev.playerNameKoLong,
        playerOrigName: ev.playerOrigName,
      });
      const inIdx = lpFindLineupPlayerIndex(substitutes, {
        playerId: ev.assistId,
        playerName: ev.assistName,
        playerNameKoLong: ev.assistNameKoLong,
        playerOrigName: ev.assistOrigName,
      });
      if (outIdx === -1 || inIdx === -1) return;

      const outPlayer = startXi[outIdx];
      const inPlayer = substitutes[inIdx];
      const resolvedOutId = Number(outPlayer?.playerId) || 0;
      const resolvedInId = Number(inPlayer?.playerId) || 0;
      // ID 0은 이름이 집계 키이므로, ID가 그대로여도 명단의 이름으로 맞춘다.
      // 수동 선택에서 긴 이름을 저장한 경우에도 노드의 짧은 이름과 연결되어야 한다.
      if (resolvedOutId !== ev.playerId || resolvedInId !== ev.assistId
        || resolvedOutId === 0 || resolvedInId === 0) {
        resolved[index] = {
          ...ev,
          playerId: resolvedOutId,
          assistId: resolvedInId,
          ...(resolvedOutId === 0 ? { playerName: outPlayer.name || outPlayer.playerName } : {}),
          ...(resolvedInId === 0 ? { assistName: inPlayer.name || inPlayer.playerName } : {}),
        };
      }

      const newStarter = { ...inPlayer, grid: outPlayer.grid || inPlayer.grid || null };
      const benchPlayer = { ...outPlayer, grid: null };
      startXi.splice(outIdx, 1, newStarter);
      substitutes.splice(inIdx, 1);
      substitutes.unshift(benchPlayer);
    });
  });

  return resolved;
}

/**
 * fixtureData.players(PlayerStats)에서 playerId → rating(string) 맵.
 * rating이 없거나 빈 값/유효 범위 밖이면 그대로 (UI에서 null 처리).
 */
function lpBuildRatingMap(players) {
  const map = new Map();
  if (!Array.isArray(players)) return map;
  players.forEach(p => {
    if (!p || p.playerId == null || Number(p.playerId) === 0) return;
    const raw = String(p.rating ?? '').trim();
    if (!raw) return;
    const num = Number(raw);
    if (!Number.isFinite(num) || num === 0) return;
    map.set(String(p.playerId), num);
  });
  return map;
}

/** fixtureData.players(PlayerStats)에서 captain=true인 playerId 집합. 주장 완장 배지 표시용. */
function lpBuildCaptainSet(players) {
  const set = new Set();
  if (!Array.isArray(players)) return set;
  players.forEach(p => {
    if (!p || p.playerId == null || Number(p.playerId) === 0) return;
    if (p.captain) set.add(String(p.playerId));
  });
  return set;
}

// 평점 색상 기본 팔레트. settings에 사용자 override가 없을 때만 사용.
// 사용자가 설정 팝업의 '이벤트/스탯' 탭에서 7구간 색을 직접 변경 가능.
// settings-popup.js의 SETTINGS_DEFAULTS와 같은 값(소문자)으로 유지 — color input 호환성.
const LP_RATING_COLOR_DEFAULTS = {
  ratingColorBelow6: '#cd0b00', // < 6.0 (red)
  ratingColor6:      '#ed7e07', // 6.0~6.4 (orange)
  ratingColor65:     '#d9af00', // 6.5~6.9 (yellow)
  ratingColor7:      '#00c424', // 7.0~7.9 (green)
  ratingColor8:      '#00adc4', // 8.0~8.9 (cyan)
  ratingColor9:      '#374df5', // 9.0~9.4 (blue)
  ratingColor95:     '#7f1d6d', // ≥9.5 (purple)
};

/**
 * 사용자 설정값 우선, 없으면 기본 팔레트로 폴백.
 * greenscreen 모드 ON일 때 초록 계열 평점(7.0~7.9 default)은 항상 마젠타로 고정 치환 —
 * 'strong' 강제 (사용자가 강도를 파랑/청록으로 설정했더라도 평점만은 다른 구간(8.0~8.9 시안,
 * 9.0~9.4 파랑)과 충돌하지 않도록 마젠타 영역에 가둠).
 */
function lpGetRatingColor(key) {
  const fromSetting = (typeof getSetting === 'function') ? getSetting(key) : null;
  const raw = fromSetting || LP_RATING_COLOR_DEFAULTS[key] || '#666';
  return (typeof chromaSafe === 'function') ? chromaSafe(raw, 'strong') : raw;
}

/**
 * 평점 → 배경 색상.
 * 7구간으로 분기. 각 구간 색은 LP_RATING_COLOR_DEFAULTS 또는 사용자 설정으로 결정.
 *   <6.0      : ratingColorBelow6
 *   6.0~6.4   : ratingColor6
 *   6.5~6.9   : ratingColor65
 *   7.0~7.9   : ratingColor7
 *   8.0~8.9   : ratingColor8
 *   9.0~9.4   : ratingColor9
 *   ≥9.5      : ratingColor95
 */
function lpRatingColor(ratingNum) {
  const r = Number(ratingNum);
  if (!Number.isFinite(r)) return '#666';
  if (r < 6.0) return lpGetRatingColor('ratingColorBelow6');
  if (r < 6.5) return lpGetRatingColor('ratingColor6');
  if (r < 7.0) return lpGetRatingColor('ratingColor65');
  if (r < 8.0) return lpGetRatingColor('ratingColor7');
  if (r < 9.0) return lpGetRatingColor('ratingColor8');
  if (r < 9.5) return lpGetRatingColor('ratingColor9');
  return lpGetRatingColor('ratingColor95');
}

/**
 * 교체 이벤트로 선발 ↔ 벤치 swap (subReflect=on일 때 사용).
 * 같은 사이드 안에서, 이벤트 시간 오름차순으로 처리.
 *  - OUT 선수: startXi에서 제거 → substitutes 맨 앞으로 이동, grid를 IN 선수에게 물려줌
 *  - IN 선수: substitutes에서 제거 → startXi에 OUT 자리 grid로 삽입
 *  - OUT 선수가 startXi에 없거나 IN 선수가 substitutes에 없으면 그 페어는 skip
 *
 * 부수효과 없음 — 입력 lineup은 건드리지 않고 새 객체 반환.
 */
function lpApplySubReflectToLineup(lineup, side, events) {
  if (!lineup) return lineup;
  if (!Array.isArray(lineup.startXi) || !Array.isArray(lineup.substitutes)) return lineup;

  const subEvents = (events || [])
    .filter(ev => ev && String(ev.type || '').toLowerCase() === 'subst' && ev.side === side)
    .sort((a, b) => lpEventTimeKey(a) - lpEventTimeKey(b));
  if (!subEvents.length) return lineup;

  const startXi = lineup.startXi.map(p => ({ ...p }));
  const substitutes = lineup.substitutes.map(p => ({ ...p }));

  subEvents.forEach(ev => {
    const outIdx = lpFindLineupPlayerIndex(startXi, {
      playerId: ev.playerId,
      playerName: ev.playerName,
      playerNameKoLong: ev.playerNameKoLong,
      playerOrigName: ev.playerOrigName,
    });
    const inIdx = lpFindLineupPlayerIndex(substitutes, {
      playerId: ev.assistId,
      playerName: ev.assistName,
      playerNameKoLong: ev.assistNameKoLong,
      playerOrigName: ev.assistOrigName,
    });
    if (outIdx === -1 || inIdx === -1) {
      console.warn('Sub reflect skipped due to unmatched lineup player', {
        side,
        event: {
          elapsed: ev.elapsed,
          extra: ev.extra,
          outPlayerId: ev.playerId,
          outPlayerName: ev.playerNameKoLong || ev.playerName || '',
          inPlayerId: ev.assistId,
          inPlayerName: ev.assistNameKoLong || ev.assistName || '',
        },
        startXi: startXi.map(player => ({
          playerId: player?.playerId,
          name: player?.nameKoLong || player?.name || '',
        })),
        substitutes: substitutes.map(player => ({
          playerId: player?.playerId,
          name: player?.nameKoLong || player?.name || '',
        })),
      });
      return;
    }

    const outPlayer = startXi[outIdx];
    const inPlayer = substitutes[inIdx];

    // grid 승계 — 들어온 선수가 나간 선수의 자리를 차지
    const newStarter = { ...inPlayer, grid: outPlayer.grid || inPlayer.grid || null };
    const benchPlayer = { ...outPlayer, grid: null };

    startXi.splice(outIdx, 1, newStarter);
    substitutes.splice(inIdx, 1);
    substitutes.unshift(benchPlayer);
  });

  return { ...lineup, startXi, substitutes };
}

/** 카드 종류 결정 — yellow / red / yellow+red(누적) / null */
function lpCardKind(eventInfo) {
  if (!eventInfo) return null;
  if (eventInfo.red && eventInfo.yellow && eventInfo.red.isCumulative) return 'cumulative';
  if (eventInfo.red) return 'red';
  if (eventInfo.yellow) return 'yellow';
  return null;
}

// 전역 노출 — lineup-render.js에서 직접 호출
window.lpAggregatePlayerEvents = lpAggregatePlayerEvents;
window.lpResolveSubstEventIdsForAggregation = lpResolveSubstEventIdsForAggregation;
window.lpBuildRatingMap = lpBuildRatingMap;
window.lpRatingColor = lpRatingColor;
window.lpApplySubReflectToLineup = lpApplySubReflectToLineup;
window.lpCardKind = lpCardKind;
window.lpFormatEventTime = lpFormatEventTime;
