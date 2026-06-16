// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 이벤트 집계 / 평점] (Iter 5-3)
// 라인업 노드(피치) + 벤치 행에 골/어시/카드/교체/평점을 표시하기 위한 공통 헬퍼.
// 데이터 소스: fixtureData.events (이벤트), fixtureData.players (PlayerStats — rating).
// 호출 시점: lineup-panel.js의 rerenderLineupPanels에서 effectiveData 합성 직후.
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
      ? getPlayerNickname(player.playerId)
      : null,
    player.name,
    player.nameKoLong,
    player.playerName,
    player.playerNameKoLong,
  ]
    .map(lpNormalizePlayerName)
    .filter(Boolean);
}

/**
 * 라인업/벤치 배열에서 matcher와 매칭되는 선수의 인덱스를 찾는다.
 * 1) playerId가 있으면 그것을 1순위로 시도(가장 안정적).
 * 2) 못 찾으면 정규화 이름으로 fallback — 이벤트의 playerName과 라인업 데이터의 이름 키들 교집합 검색.
 * 3) 둘 다 실패 시 -1 반환 (호출자가 swap 스킵 + 경고 로그).
 */
function lpFindLineupPlayerIndex(players, matcher) {
  if (!Array.isArray(players) || !matcher || typeof matcher !== 'object') return -1;

  // 1) playerId 우선 매칭.
  const targetId = matcher.playerId == null ? null : String(matcher.playerId);
  if (targetId) {
    const byId = players.findIndex(player => String(player?.playerId) === targetId);
    if (byId !== -1) return byId;
  }

  // 2) 이름 fallback — 이벤트 측 이름 후보 정규화.
  const targetNames = [
    matcher.playerName,
    matcher.playerNameKoLong,
  ]
    .map(lpNormalizePlayerName)
    .filter(Boolean);
  if (!targetNames.length) return -1;

  // 3) 라인업 측 이름 후보군과 교집합 있는 첫 인덱스.
  return players.findIndex(player => {
    const candidateNames = lpCollectPlayerNames(player);
    return candidateNames.some(name => targetNames.includes(name));
  });
}

/**
 * fixtureData.events를 선수별로 집계.
 * 반환 Map<playerIdString, {
 *   goals: [{ time, isPenalty, isOwnGoal }],
 *   assists: [{ time }],
 *   yellow: { time, total },          // 1회만 (두 번째는 second-yellow로 별도)
 *   red: { time, isCumulative },      // Red 또는 Second Yellow (퇴장)
 *   subIn: { time } | null,           // 이 선수가 교체 IN 됐을 때
 *   subOut: { time } | null,          // 이 선수가 교체 OUT 됐을 때
 * }>
 *
 * Penalty Shootout 이벤트(comments==='Penalty Shootout')는 제외.
 * Own Goal은 해당 선수의 골로 간주하지 않음 — 골 이모티콘 안 띄움.
 */
function lpAggregatePlayerEvents(events) {
  const map = new Map();
  if (!Array.isArray(events)) return map;

  function ensure(pid) {
    const key = String(pid);
    if (!map.has(key)) {
      map.set(key, { goals: [], assists: [], yellow: null, red: null, subIn: null, subOut: null });
    }
    return map.get(key);
  }

  // 같은 선수 두 번째 옐로 → red(누적) 변환을 위해 yellow 카운트 추적.
  const yellowCount = new Map();

  events.forEach(ev => {
    if (!ev) return;
    const time = { elapsed: Number(ev.elapsed ?? 0), extra: Number(ev.extra ?? 0) };
    const type = String(ev.type || '').toLowerCase();
    const detail = String(ev.detail || '').trim();
    const isPso = String(ev.comments || '').trim() === 'Penalty Shootout';

    if (isPso) return;

    if (type === 'goal') {
      if (ev.playerId == null) return;
      if (detail === 'Missed Penalty') return;
      const isOwn = detail === 'Own Goal';
      const isPenalty = detail === 'Penalty';
      if (!isOwn) {
        ensure(ev.playerId).goals.push({ time, isPenalty, isOwnGoal: false });
      }
      // 어시스트는 Own Goal만 제외. 페널티는 보통 assistId가 없어 기록되지 않지만, 있으면 그대로 반영.
      if (ev.assistId != null && !isOwn) {
        ensure(ev.assistId).assists.push({ time });
      }
      return;
    }

    if (type === 'card') {
      if (ev.playerId == null) return;
      const e = ensure(ev.playerId);
      if (detail === 'Yellow Card') {
        const next = (yellowCount.get(String(ev.playerId)) || 0) + 1;
        yellowCount.set(String(ev.playerId), next);
        if (!e.yellow) e.yellow = { time };
        // 두 번째 옐로면 누적 퇴장으로 자동 마킹 (API가 별도 Red를 안 보낼 수도 있음).
        if (next >= 2 && !e.red) e.red = { time, isCumulative: true };
      } else if (detail === 'Second Yellow Card') {
        if (!e.yellow) e.yellow = { time }; // 두 번째 옐로만 와도 첫번째 옐로가 있었음을 함의 → 노란 표시
        e.red = { time, isCumulative: true };
      } else if (detail === 'Red Card') {
        const hadYellow = (yellowCount.get(String(ev.playerId)) || 0) > 0;
        e.red = { time, isCumulative: hadYellow };
      }
      return;
    }

    if (type === 'subst') {
      // playerId = OUT, assistId = IN (이벤트 패널과 동일한 컨벤션)
      if (ev.playerId != null) ensure(ev.playerId).subOut = { time };
      if (ev.assistId != null) ensure(ev.assistId).subIn = { time };
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
      });
      const inIdx = lpFindLineupPlayerIndex(substitutes, {
        playerId: ev.assistId,
        playerName: ev.assistName,
        playerNameKoLong: ev.assistNameKoLong,
      });
      if (outIdx === -1 || inIdx === -1) return;

      const outPlayer = startXi[outIdx];
      const inPlayer = substitutes[inIdx];
      const resolvedOutId = Number(outPlayer?.playerId) > 0 ? outPlayer.playerId : ev.playerId;
      const resolvedInId = Number(inPlayer?.playerId) > 0 ? inPlayer.playerId : ev.assistId;
      if (resolvedOutId !== ev.playerId || resolvedInId !== ev.assistId) {
        resolved[index] = {
          ...ev,
          playerId: resolvedOutId,
          assistId: resolvedInId,
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
    });
    const inIdx = lpFindLineupPlayerIndex(substitutes, {
      playerId: ev.assistId,
      playerName: ev.assistName,
      playerNameKoLong: ev.assistNameKoLong,
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

// 전역 노출 — lineup-panel.js에서 직접 호출
window.lpAggregatePlayerEvents = lpAggregatePlayerEvents;
window.lpResolveSubstEventIdsForAggregation = lpResolveSubstEventIdsForAggregation;
window.lpBuildRatingMap = lpBuildRatingMap;
window.lpRatingColor = lpRatingColor;
window.lpApplySubReflectToLineup = lpApplySubReflectToLineup;
window.lpCardKind = lpCardKind;
window.lpFormatEventTime = lpFormatEventTime;
