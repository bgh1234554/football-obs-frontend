// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 ID 연결] 클릭 → ID 입력 팝업
// fetchPlayerStats로 프로필 가져와 이름/사진 덮어쓰기. 폴링 이벤트도 실 ID로 매칭됨.
// lineup-data.js의 buildEffectiveFixtureData에서 window.applyZeroIdOverrides를 호출해 적용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PIR_STORE_KEY = 'obs.player.id.resolve.v2';

// ── 저장소 ───────────────────────────────────────────────────────────────────
// 키 형식:
//   id≠0 선수: "{fixtureId}:{side}:id:{originalPlayerId}"  — 이름 패치에 무관하게 안정적
//   id=0  선수: "{fixtureId}:{side}:n:{origApiName}"       — id가 없으므로 이름이 유일 식별자
// 값: { playerId, name, photoUrl, resolvedAt }

/** localStorage에서 override 저장소를 읽어 파싱. 파싱 실패/미존재 시 빈 객체. */
function pirReadStore() {
  try { return JSON.parse(localStorage.getItem(PIR_STORE_KEY) || '{}') || {}; }
  catch { return {}; }
}

/** override 저장소 객체를 localStorage에 JSON으로 직렬화해 저장. */
function pirWriteStore(store) {
  try { localStorage.setItem(PIR_STORE_KEY, JSON.stringify(store)); }
  catch {}
}

/** id≠0 선수의 저장소 키 생성: "{fixtureId}:{side}:id:{playerId}". */
function pirMakeIdKey(fixtureId, side, playerId) {
  return `${fixtureId}:${side}:id:${playerId}`;
}
/** id=0 선수의 저장소 키 생성(이름 기반): "{fixtureId}:{side}:n:{name}". */
function pirMakeNameKey(fixtureId, side, name) {
  return `${fixtureId}:${side}:n:${name}`;
}

/** 키로 override 항목 조회. 키가 없거나 저장된 적 없으면 null. */
function pirGetByKey(key) {
  return key ? (pirReadStore()[key] || null) : null;
}
/** 키에 override 항목 저장. data가 falsy면 해당 키를 삭제(연결 해제). */
function pirSetByKey(key, data) {
  if (!key) return;
  const store = pirReadStore();
  if (data) store[key] = data;
  else delete store[key];
  pirWriteStore(store);
}

/** 저장소 키를 fixtureId 접두어 제거 후 {side, kind, value}로 분해. fixtureId가 안 맞거나 형식이 다르면 null. */
function pirParseStoreKey(fixtureId, key) {
  const prefix = `${fixtureId}:`;
  if (!key || !String(key).startsWith(prefix)) return null;
  const local = String(key).slice(prefix.length);
  const sideEnd = local.indexOf(':');
  if (sideEnd < 0) return null;
  const side = local.slice(0, sideEnd);
  const rest = local.slice(sideEnd + 1);
  const kindEnd = rest.indexOf(':');
  if (kindEnd < 0) return null;
  return {
    side,
    kind: rest.slice(0, kindEnd),
    value: rest.slice(kindEnd + 1),
  };
}

/** 한 fixture의 홈/원정 라인업(선발·교체)·부상자 리스트를 side와 함께 순회용 배열로 묶음. */
function pirRosterBuckets(data) {
  if (!data) return [];
  return [
    { side: 'home', list: data.homeLineup?.startXi },
    { side: 'home', list: data.homeLineup?.substitutes },
    { side: 'home', list: data.homeInjuries },
    { side: 'away', list: data.awayLineup?.startXi },
    { side: 'away', list: data.awayLineup?.substitutes },
    { side: 'away', list: data.awayInjuries },
  ];
}

/** 선수 표시 이름. name 우선, 없으면 playerName(수동 입력 부상자 등) fallback. */
function pirRosterName(player) {
  return String(player?.name || player?.playerName || '').trim();
}

/**
 * 로스터의 player가 현재 비교 대상(current)과 같은 선수인지 판별.
 * id 키(kind==='id')는 playerId로, 이름 키(kind==='n')는 이름 일치 또는
 * 이미 연결된 effective playerId 일치로 판단.
 */
function pirIsCurrentRosterPlayer(player, side, current, currentEntry) {
  if (!player || !current || side !== current.side) return false;
  if (current.kind === 'id') return Number(player.playerId) === Number(current.value);
  if (current.kind === 'n') {
    if (pirRosterName(player) === current.value) return true;
    const currentLinkedId = Number(currentEntry?.playerId);
    return currentLinkedId > 0 && Number(player.playerId) === currentLinkedId;
  }
  return false;
}

/** newPid가 해당 fixture 로스터(라인업/벤치/부상자)에 이미 다른 선수의 playerId로 존재하는지 확인. current(자기 자신)는 제외. */
function pirFixtureRosterHasPlayerId(data, fixtureId, current, currentEntry, newPid) {
  const dataFixtureId = String(data?.matchInfo?.fixtureId ?? '').trim();
  if (dataFixtureId && dataFixtureId !== String(fixtureId)) return false;
  const targetId = Number(newPid);
  for (const { side, list } of pirRosterBuckets(data)) {
    if (!Array.isArray(list)) continue;
    for (const player of list) {
      if (!player || Number(player.playerId) !== targetId) continue;
      if (pirIsCurrentRosterPlayer(player, side, current, currentEntry)) continue;
      return true;
    }
  }
  return false;
}

// 같은 fixtureId 내에서 newPid가 이미 다른 entry의 value.playerId로 쓰이는지 확인.
// currentKey는 자기 자신 (수정 중인 entry) → 비교에서 제외.
function pirIsDuplicateAltId(fixtureId, currentKey, newPid) {
  if (!fixtureId || !newPid) return false;
  const store = pirReadStore();
  const prefix = `${fixtureId}:`;
  for (const [k, v] of Object.entries(store)) {
    if (!k.startsWith(prefix)) continue;
    if (k === currentKey) continue;
    if (Number(v.playerId) === Number(newPid)) return true;
  }
  const current = pirParseStoreKey(fixtureId, currentKey);
  const currentEntry = pirGetByKey(currentKey);
  const raw = typeof lineupPanelState !== 'undefined' ? lineupPanelState.lastFixture : null;
  const effective = typeof lineupPanelState !== 'undefined' ? lineupPanelState.lastEffectiveData : null;
  if (pirFixtureRosterHasPlayerId(raw, fixtureId, current, currentEntry, newPid)) return true;
  if (effective && effective !== raw
    && pirFixtureRosterHasPlayerId(effective, fixtureId, current, currentEntry, newPid)) {
    return true;
  }
  return false;
}
window.pirIsDuplicateAltId = pirIsDuplicateAltId;

// override 적용 후 effective playerId로 원본 id 키를 역탐색.
// 같은 선수를 두 번 수정할 때 사용 (effective pid → 원본 키).
function pirFindOriginalIdKey(fixtureId, side, effectivePid) {
  const store = pirReadStore();
  const prefix = `${fixtureId}:${side}:id:`;
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(prefix) && Number(v.playerId) === Number(effectivePid)) return k;
  }
  return null;
}

// id=0 선수를 연결한 경우(이름 키), value.playerId === effectivePid 인 n: 키를 역탐색.
// pmShowIdInput에서 연결 해제 버튼 렌더 및 clear 키로 사용.
function pirFindNameKeyByEffectiveId(fixtureId, side, effectivePid) {
  if (!fixtureId || !effectivePid) return null;
  const store = pirReadStore();
  const prefix = `${fixtureId}:${side}:n:`;
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(prefix) && Number(v?.playerId) === Number(effectivePid)) return k;
  }
  return null;
}
window.pirFindNameKeyByEffectiveId = pirFindNameKeyByEffectiveId;

// ── 이름 유사도 보강 매칭 ────────────────────────────────────────────────────
// 정확 일치(map lookup)가 실패했을 때의 2차 보강. API Football이 이벤트 쪽
// playerName/origName은 축약형("M. Al Daoud")으로, 라인업 쪽 origName은 풀네임
// ("Mohammad Al Daoud")으로 내려주는 게 기본이라 문자열 완전 일치가 거의 항상 깨진다.
// 게다가 아랍어 등 음역 표기가 엔드포인트별로 달라지기도 한다(Rosan/Rousan,
// Fakhouri/Fakhoury). 그래서 "성(姓) 핵심부"만 떼어 유사도로 비교한다.

/** 발음 구별 기호 제거 + 소문자 + 영문/숫자 외 문자는 공백으로 치환 + 공백 정리. */
function pirNormalizeForFuzzy(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// 표기 유무가 들쭉날쭉한 이름 관사성 토큰 — 비교 전 제거.
const PIR_NAME_PARTICLES = new Set(['al', 'el', 'abu', 'ibn', 'bin', 'bint', 'ben', 'de', 'van', 'der']);

/** 정규화된 이름 문자열 → "성 핵심부" 토큰 배열. 첫 토큰(이름/이니셜)은 버리고 관사성 토큰도 제거. */
function pirNameCoreTokens(normalized) {
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length <= 1) return tokens;
  const core = tokens.slice(1).filter(t => !PIR_NAME_PARTICLES.has(t));
  return core.length ? core : tokens.slice(1); // 전부 관사면 원래 나머지로 폴백
}

/** 두 문자열 간 Levenshtein 거리. */
function pirLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

const PIR_FUZZY_THRESHOLD = 0.78;   // 이 이상이어야 같은 선수로 인정
const PIR_FUZZY_MARGIN = 0.08;      // 1위-2위 차이가 이보다 작으면 모호하다고 보고 보류

/**
 * roster 후보들 중 eventOrigName과 가장 유사한 선수를 찾는다.
 * - 첫 토큰(이름/이니셜)의 첫 글자가 같아야 함(다른 이름과의 오매칭 방지).
 * - 성 핵심부 유사도가 임계값 이상이고, 1위와 2위 점수 차이가 충분해야 함(동명이인/
 *   비슷한 철자의 다른 선수와 오매칭 방지) — 모호하면 null 반환(보류, 틀린 매칭보다 안전).
 */
function pirFuzzyFindRosterMatch(eventOrigName, candidates) {
  const normEvent = pirNormalizeForFuzzy(eventOrigName);
  if (!normEvent) return null;
  const eventTokens = normEvent.split(' ').filter(Boolean);
  if (!eventTokens.length) return null;
  const eventInitial = eventTokens[0][0];
  const eventCore = pirNameCoreTokens(normEvent).join(' ');
  if (eventCore.length < 3) return null; // 핵심부가 너무 짧으면(이니셜만 등) 신뢰 불가

  let bestPid = null, bestScore = 0, secondScore = 0;
  for (const cand of candidates) {
    const normCand = pirNormalizeForFuzzy(cand.origName);
    if (!normCand) continue;
    const candTokens = normCand.split(' ').filter(Boolean);
    if (!candTokens.length || candTokens[0][0] !== eventInitial) continue;
    const candCore = pirNameCoreTokens(normCand).join(' ');
    if (candCore.length < 3) continue;
    const dist = pirLevenshtein(eventCore, candCore);
    const score = 1 - dist / Math.max(eventCore.length, candCore.length);
    if (score > bestScore) { secondScore = bestScore; bestScore = score; bestPid = cand.pid; }
    else if (score > secondScore) secondScore = score;
  }
  if (!bestPid || bestScore < PIR_FUZZY_THRESHOLD) return null;
  if (secondScore > 0 && bestScore - secondScore < PIR_FUZZY_MARGIN) return null;
  return bestPid;
}

// ── id≠0 자동 매칭 (이름 기반) ────────────────────────────────────────────────
// events의 playerId/assistId가 그 팀 라인업+벤치 어떤 선수의 id와도 안 맞는 경우(=API가
// 다른 ID를 붙인 케이스), 같은 팀 라인업+벤치 안에서 이름이 유일하게 일치하는 선수가
// 있으면 자동으로 alt→canonical 매핑을 만든다. 세 단계로 시도한다.
// - origName(API 원문 영문, 가공 전) 완전 일치: alt ID가 CSV 매칭 실패로 영문 그대로
//   내려오는 일반적인 경우를 잡는다.
// - 한글 표시 이름(name/playerName, nameKoLong/playerNameKoLong) 완전 일치: alt ID가
//   우연히 players.csv에 있는 값(예: 같은 선수의 중복 등록 ID)이면 한글로도 내려오는데,
//   이때 API가 엔드포인트별로 원문 영문 표기를 다르게 내려줘서(축약형 vs 풀네임 등)
//   origName 비교만으론 못 잡고 한글 비교라야 잡히는 경우가 있다.
// - 위 두 완전 일치가 모두 실패하면 origName 성 핵심부 유사도(pirFuzzyFindRosterMatch)로
//   재시도한다 — 축약형 vs 풀네임, 아랍어 음역 표기 차이(Rosan/Rousan 등)를 흡수.
// - 완전 일치 두 이름 공간은 각각 독립적으로 동명이인 검사를 한다 — 같은 팀 안에 그
//   이름이 같은 선수가 2명 이상이면 해당 이름 공간에서만 후보 제외.
// - id=0 선수는 대상이 아니다(이름 키 기반의 별도 시스템이 이미 처리).
// - 결과는 localStorage에 저장하지 않는다 — 매 렌더마다 현재 데이터로 다시 계산되는
//   순수 런타임 보정이라, 수동 override(저장됨)가 항상 우선한다.
// - nameHintsOut(선택): 매칭이 성립한 alt ID 쪽 이벤트에 한글 이름이 같이 와 있으면
//   `{side}:{canonicalId}` → { name, nameKoLong }로 채워준다. 라인업/벤치의 canonical
//   ID 쪽엔 CSV에 한글이 없어 영문으로만 표시되는데(흔한 경우 — 중복 등록된 alt ID에만
//   한글이 있는 패턴), 수동 ID 입력처럼 프로필을 다시 조회하지 않고도 이벤트에 이미
//   포함된 한글을 그대로 로스터에 채워 넣을 수 있게 하기 위함(applyZeroIdOverrides에서 사용).
function pirAutoLinkAltToCanonical(rawData, nameHintsOut) {
  const result = {};
  if (!rawData) return result;

  // map에 key→id를 넣되, 이미 다른 id로 등록된 key가 들어오면 null로 무효화(동명이인 충돌).
  const addToMap = (map, key, pid) => {
    if (!key) return;
    map.set(key, map.has(key) && map.get(key) !== pid ? null : pid);
  };

  for (const side of ['home', 'away']) {
    const lineup = rawData[`${side}Lineup`];
    const roster = [...(lineup?.startXi || []), ...(lineup?.substitutes || [])];
    const knownIds = new Set();
    const origNameToId = new Map(); // origName(trim) → playerId
    const koNameToId = new Map();   // name/nameKoLong(trim) → playerId
    const fuzzyCandidates = [];     // [{ pid, origName }] — 완전 일치 실패 시 유사도 매칭용

    roster.forEach(p => {
      const pid = Number(p?.playerId);
      if (!pid) return; // id=0은 이 기능 대상 아님
      knownIds.add(pid);
      addToMap(origNameToId, String(p?.origName || '').trim(), pid);
      addToMap(koNameToId, String(p?.name || '').trim(), pid);
      addToMap(koNameToId, String(p?.nameKoLong || '').trim(), pid);
      fuzzyCandidates.push({ pid, origName: p?.origName });
    });

    const tryLink = (eventPid, origName, koName, koNameLong) => {
      const pid = Number(eventPid);
      if (!pid || knownIds.has(pid)) return; // id=0 또는 이미 정상 매칭되는 ID면 손댈 필요 없음
      const canonicalId = origNameToId.get(String(origName || '').trim())
        || koNameToId.get(String(koName || '').trim())
        || koNameToId.get(String(koNameLong || '').trim())
        || pirFuzzyFindRosterMatch(origName, fuzzyCandidates);
      if (!canonicalId || canonicalId === pid) return;
      result[`${side}:${pid}`] = canonicalId;
      if (nameHintsOut && (koName || koNameLong)) {
        const key = `${side}:${canonicalId}`;
        if (!nameHintsOut[key]) nameHintsOut[key] = { name: koName || null, nameKoLong: koNameLong || null };
      }
    };

    (rawData.events || []).forEach(ev => {
      if (!ev || ev.side !== side) return;
      tryLink(ev.playerId, ev.playerOrigName, ev.playerName, ev.playerNameKoLong);
      if (ev.assistId != null) tryLink(ev.assistId, ev.assistOrigName, ev.assistName, ev.assistNameKoLong);
    });
  }

  return result;
}
window.pirAutoLinkAltToCanonical = pirAutoLinkAltToCanonical;

// ── id=0 로스터 자동 매칭 (이벤트 → 라인업, 반대 방향) ───────────────────────
// 라인업/벤치에 playerId=0으로 내려온 선수가, 같은 팀 이벤트(playerId/assistId)에는
// 정상적인 실제 ID로 등장하는 경우가 있다(API가 라인업 엔드포인트에서만 ID 해석에
// 실패한 케이스). pirAutoLinkAltToCanonical과 반대 방향으로, 이벤트 쪽의 실제 ID +
// origName을 후보로 두고 id=0 선수의 origName과 매칭한다.
// - claimedAltIds(side별 Set): 이미 다른(0이 아닌) 로스터 선수에게 매칭된 이벤트
//   ID(수동+자동 모두 포함, 호출자가 전달)는 후보에서 제외 — 중복 해석 방지.
// - 이름 완전 일치를 먼저 모두 시도하고, 남은 선수에 대해서만 유사도 매칭
//   (pirFuzzyFindRosterMatch와 동일한 알고리즘)으로 재시도한다.
// - 매칭이 성립하면 { playerId, name, nameKoLong, photoUrl }을 만든다. name/nameKoLong은
//   이벤트에 이미 내려온 한글을 그대로 쓰고(추가 API 호출 불필요), photoUrl은 해당
//   선수의 기존 photoUrl(보통 .../players/0.png)에서 파일명만 새 ID로 바꿔 만든다.
// - 결과 키는 applyZeroIdOverrides의 relevant 객체와 같은 로컬 키 형식
//   "{side}:n:{표시이름}"을 쓴다(저장하지 않고 매 렌더 다시 계산만 함).
function pirAutoLinkZeroIdFromEvents(rawData, claimedAltIdsBySide) {
  const result = {};
  if (!rawData) return result;

  for (const side of ['home', 'away']) {
    const lineup = rawData[`${side}Lineup`];
    const roster = [...(lineup?.startXi || []), ...(lineup?.substitutes || [])];
    const knownIds = new Set();
    const zeroPlayers = [];
    roster.forEach(p => {
      const pid = Number(p?.playerId);
      if (pid) knownIds.add(pid);
      else if (p?.origName) zeroPlayers.push(p);
    });
    if (!zeroPlayers.length) continue;

    const claimed = claimedAltIdsBySide?.[side] || new Set();
    const pidInfo = new Map(); // pid → { origName, koName, koNameLong }

    (rawData.events || []).forEach(ev => {
      if (!ev || ev.side !== side) return;
      const consider = (id, origName, koName, koNameLong) => {
        const pid = Number(id);
        if (!pid || knownIds.has(pid) || claimed.has(pid) || pidInfo.has(pid)) return;
        pidInfo.set(pid, { origName: String(origName || '').trim(), koName: koName || null, koNameLong: koNameLong || null });
      };
      consider(ev.playerId, ev.playerOrigName, ev.playerName, ev.playerNameKoLong);
      if (ev.assistId != null) consider(ev.assistId, ev.assistOrigName, ev.assistName, ev.assistNameKoLong);
    });
    if (!pidInfo.size) continue;

    const fuzzyCandidates = [...pidInfo.entries()].map(([pid, info]) => ({ pid, origName: info.origName }));
    const exactByOrigName = new Map(); // origName(trim) → pid | null(충돌)
    for (const [pid, info] of pidInfo) {
      if (!info.origName) continue;
      exactByOrigName.set(info.origName, exactByOrigName.has(info.origName) ? null : pid);
    }

    const usedIds = new Set();
    const buildEntry = (p, pid) => {
      const info = pidInfo.get(pid);
      const photoUrl = typeof p.photoUrl === 'string'
        ? p.photoUrl.replace(/\/\d+\.png(\?.*)?$/, `/${pid}.png$1`)
        : null;
      return { playerId: pid, name: info?.koName || null, nameKoLong: info?.koNameLong || null, photoUrl };
    };

    const remaining = [];
    zeroPlayers.forEach(p => {
      const exactPid = exactByOrigName.get(String(p.origName || '').trim());
      if (exactPid && !usedIds.has(exactPid)) {
        usedIds.add(exactPid);
        result[`${side}:n:${pirRosterName(p)}`] = buildEntry(p, exactPid);
      } else {
        remaining.push(p);
      }
    });
    remaining.forEach(p => {
      const pool = fuzzyCandidates.filter(c => !usedIds.has(c.pid));
      if (!pool.length) return;
      const matchedPid = pirFuzzyFindRosterMatch(p.origName, pool);
      if (!matchedPid) return;
      usedIds.add(matchedPid);
      result[`${side}:n:${pirRosterName(p)}`] = buildEntry(p, matchedPid);
    });
  }

  return result;
}
window.pirAutoLinkZeroIdFromEvents = pirAutoLinkZeroIdFromEvents;

// ── override 적용 ─────────────────────────────────────────────────────────────
// lineup-data.js의 buildEffectiveFixtureData에서 window hook으로 호출.
// 복제된 next 객체를 직접 변경(in-place) — 반환값 없음.

/** 저장된 override들을 fixture 데이터에 일괄 적용 (라인업/부상자 이름·사진/playerId, 이벤트, playerStats 리매핑). */
function applyZeroIdOverrides(next, fixtureId) {
  if (!next || !fixtureId) return;

  const store = pirReadStore();
  const prefix = `${fixtureId}:`;
  const relevant = {};
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(prefix)) relevant[k.slice(prefix.length)] = v;
  }

  // altId → canonicalId 역방향 맵 구성 (id≠0 선수의 event/stats 리매핑용).
  // 이름 자동 매칭을 먼저 깔고, 수동 입력(저장된 override)이 있으면 그쪽을 우선해 덮어쓴다.
  // nameHints: 자동 매칭이 성립한 alt ID 쪽 이벤트에 한글 이름이 같이 와 있으면 채워짐
  // (canonical ID는 CSV에 한글이 없어 영문으로만 표시되는 흔한 패턴 보강용 — 아래 applyToList에서 사용).
  const autoLinkOn = typeof getSetting !== 'function' || getSetting('autoLinkPlayerIdByName') !== 'off';
  const nameHints = {};
  const altToCanonical = autoLinkOn ? pirAutoLinkAltToCanonical(next, nameHints) : {};
  for (const [localKey, ov] of Object.entries(relevant)) {
    if (!localKey.includes(':id:')) continue;
    const parts = localKey.split(':');          // [side, 'id', canonicalId]
    const side = parts[0];
    const canonicalId = Number(parts[2]);
    const altId = Number(ov.playerId);
    if (altId && altId !== canonicalId) {
      altToCanonical[`${side}:${altId}`] = canonicalId;
    }
  }
  // id=0 로스터 자동 매칭 (반대 방향) — 라인업엔 id=0인데 같은 팀 이벤트엔 실제 ID로
  // 등장하는 선수를 자동 연결. 이미 위에서 alt→canonical로 해석된 ID는 후보에서
  // 제외해야 하므로(중복 해석 방지) altToCanonical을 side별 Set으로 변환해 전달.
  const claimedAltIdsBySide = { home: new Set(), away: new Set() };
  for (const key of Object.keys(altToCanonical)) {
    const [side, altId] = key.split(':');
    if (claimedAltIdsBySide[side]) claimedAltIdsBySide[side].add(Number(altId));
  }
  // id=0 선수를 수동으로 이미 특정 실제 ID에 연결해둔 경우, 그 ID도 자동 매칭 후보에서
  // 제외해야 한다 — 그렇지 않으면 자동 매칭이 같은 ID를 다른 미해결 선수에게도 부여해
  // 한 ID가 두 명에게 동시에 연결되는 사고가 난다.
  for (const [localKey, ov] of Object.entries(relevant)) {
    if (!localKey.includes(':n:')) continue;
    const side = localKey.split(':')[0];
    const claimedId = Number(ov?.playerId);
    if (claimedId && claimedAltIdsBySide[side]) claimedAltIdsBySide[side].add(claimedId);
  }
  const zeroIdAutoLinks = autoLinkOn ? pirAutoLinkZeroIdFromEvents(next, claimedAltIdsBySide) : {};

  if (!Object.keys(relevant).length && !Object.keys(altToCanonical).length && !Object.keys(zeroIdAutoLinks).length) return;

  const pirHasHangul = s => typeof s === 'string' && /[가-힣]/.test(s);

  // ── 라인업/부상자: id=0→playerId 교체+이름/사진, id≠0→이름/사진만 ────────────
  const applyToList = (list, side) => {
    if (!Array.isArray(list)) return list;
    return list.map(p => {
      if (!p) return p;
      const pid = Number(p.playerId);
      const isZero = pid === 0;
      // id=0은 수동 override가 항상 우선, 없으면 자동 매칭 결과로 보강.
      const ov = isZero
        ? (relevant[`${side}:n:${pirRosterName(p)}`] || zeroIdAutoLinks[`${side}:n:${pirRosterName(p)}`])
        : relevant[`${side}:id:${pid}`];
      // 수동 override가 name/nameKoLong을 채워주지 않고, 이 선수가 현재 영문으로만
      // 표시 중이면(=CSV에 한글 없음) 자동 매칭으로 얻은 한글 이름 힌트(이벤트 쪽 alt ID에
      // 있던 한글)로 보강한다. override 객체 자체의 존재 여부가 아니라 필드 단위로
      // 판단해야 한다 — playerId만 들어있고 name이 빈 override가 힌트를 막으면 안 됨.
      const hint = !isZero ? nameHints[`${side}:${pid}`] : null;
      const needsNameKoFromHint = !ov?.name && hint?.name && !pirHasHangul(p.name);
      const needsLongKoFromHint = !ov?.nameKoLong && hint?.nameKoLong && !pirHasHangul(p.nameKoLong);
      if (!ov && !needsNameKoFromHint && !needsLongKoFromHint) return p;
      return {
        ...p,
        ...(isZero ? { playerId: ov.playerId } : {}),
        ...(ov?.name ? { name: ov.name } : needsNameKoFromHint ? { name: hint.name } : {}),
        ...(ov?.nameKoLong ? { nameKoLong: ov.nameKoLong } : needsLongKoFromHint ? { nameKoLong: hint.nameKoLong } : {}),
        ...(ov?.photoUrl ? { photoUrl: ov.photoUrl } : {}),
      };
    });
  };

  for (const side of ['home', 'away']) {
    const lk = `${side}Lineup`;
    if (next[lk]) {
      next[lk] = {
        ...next[lk],
        startXi: applyToList(next[lk].startXi, side),
        substitutes: applyToList(next[lk].substitutes, side),
      };
    }
    const ik = `${side}Injuries`;
    if (next[ik]) next[ik] = applyToList(next[ik], side);
  }

  // ── 이벤트: altId → canonicalId 리매핑 (교체/카드/골이 라인업 노드에 귀속) ──
  if (Array.isArray(next.events) && Object.keys(altToCanonical).length) {
    next.events = next.events.map(ev => {
      if (!ev) return ev;
      const side = ev.side || '';
      const newPlayerId = altToCanonical[`${side}:${ev.playerId}`];
      const newAssistId = ev.assistId != null ? altToCanonical[`${side}:${ev.assistId}`] : undefined;
      if (!newPlayerId && newAssistId === undefined) return ev;
      return {
        ...ev,
        ...(newPlayerId ? { playerId: newPlayerId } : {}),
        ...(newAssistId !== undefined ? { assistId: newAssistId } : {}),
      };
    });
  }

  // ── playerStats: id=0→실ID 교체 / altId→canonicalId 귀속 ────────────────────
  if (Array.isArray(next.playerStats)) {
    next.playerStats = next.playerStats.map(p => {
      if (!p) return p;
      const pid = Number(p.playerId);
      if (pid === 0) {
        const name = String(p.name || p.playerName || '').trim();
        const ov = relevant[`home:n:${name}`] || relevant[`away:n:${name}`]
          || zeroIdAutoLinks[`home:n:${name}`] || zeroIdAutoLinks[`away:n:${name}`];
        if (!ov) return p;
        return { ...p, playerId: ov.playerId, ...(ov.name ? { name: ov.name, playerName: ov.name } : {}) };
      }
      // altId가 canonicalId로 매핑된 경우 (stats가 altId 아래 있을 때)
      const canonical = altToCanonical[`home:${pid}`] || altToCanonical[`away:${pid}`];
      if (!canonical) return p;
      return { ...p, playerId: canonical };
    });
  }
}

window.applyZeroIdOverrides = applyZeroIdOverrides;
window.pirGetByKey = pirGetByKey;
window.pirSetByKey = pirSetByKey;
window.pirMakeIdKey = pirMakeIdKey;
window.pirMakeNameKey = pirMakeNameKey;
window.pirFindOriginalIdKey = pirFindOriginalIdKey;

// ── 유틸 ─────────────────────────────────────────────────────────────────────

/** HTML 특수문자 escape (innerHTML 삽입용). */
function pirEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 현재 로드된 fixture의 ID 문자열. 없으면 빈 문자열. */
function pirGetCurrentFixtureId() {
  try {
    return String(
      (typeof lineupPanelState !== 'undefined'
        ? lineupPanelState.lastFixture?.matchInfo?.fixtureId
        : null) ?? ''
    ).trim();
  } catch { return ''; }
}

// ── side 감지 ─────────────────────────────────────────────────────────────────

/** 클릭된 DOM 엘리먼트에서 home/away side를 클래스(is-home/is-away)나 data-* 속성으로 추론. */
function pirGetSide(el) {
  if (!el) return null;
  if (el.classList.contains('is-home')) return 'home';
  if (el.classList.contains('is-away')) return 'away';
  const bench = el.closest('[data-bench-side]');
  if (bench) return bench.dataset.benchSide || null;
  const inj = el.closest('[data-injury-side]');
  if (inj) return inj.dataset.injurySide || null;
  const wrap = el.closest('.dp-lineup-name-wrap');
  if (wrap) return wrap.classList.contains('is-home') ? 'home' : wrap.classList.contains('is-away') ? 'away' : null;
  return null;
}

// ── raw fixture에서 선수 조회 (id=0 팝업 전용) ────────────────────────────────

/** 현재 fixture의 선발·교체·부상자 명단에서 이름(origName)으로 선수 객체 조회. */
function pirFindPlayer(side, origName) {
  const data = (typeof lineupPanelState !== 'undefined') ? lineupPanelState.lastFixture : null;
  if (!data) return null;
  const lineup = data[`${side}Lineup`];
  const all = [...(lineup?.startXi || []), ...(lineup?.substitutes || [])];
  const fromLineup = all.find(p => p && pirRosterName(p) === origName);
  if (fromLineup) return fromLineup;
  const injuries = data[`${side}Injuries`] || [];
  return injuries.find(p => p && pirRosterName(p) === origName) || null;
}

// ── pmContainer 참조 (player-menu.js와 공유) ──────────────────────────────────

/** 팝업 컨테이너 div. player-menu.js의 pmContainer가 있으면 그걸 재사용, 없으면 직접 생성. */
function pirGetContainer() {
  if (typeof pmContainer === 'function') return pmContainer();
  let c = document.getElementById('pmContainer');
  if (!c) { c = document.createElement('div'); c.id = 'pmContainer'; document.body.appendChild(c); }
  return c;
}

/** 컨테이너를 비워 현재 열린 팝업(pirPopup/pmPopup)을 닫는다. */
function pirHideAll() {
  pirGetContainer().innerHTML = '';
}

// ── 팝업 표시 (id=0 선수 전용) ───────────────────────────────────────────────
// id≠0 선수의 ID 수정은 player-menu.js의 pmShowIdInput이 담당.

/** id=0 선수 클릭 시 ID 연결 팝업(pirPopup) 표시 — 검색/저장/연결 해제 UI + 이벤트 바인딩. */
function pirShowMenu(side, origName, clientX, clientY) {
  const c = pirGetContainer();
  const player = pirFindPlayer(side, origName);
  const fixtureId = pirGetCurrentFixtureId();
  // id=0 선수는 name 키 사용
  const storeKey = fixtureId ? pirMakeNameKey(fixtureId, side, origName) : null;
  const existing = pirGetByKey(storeKey);

  const num = String(player?.number ?? '');
  const displayName = (typeof pickName === 'function' && player)
    ? (pickName(player, 'roster') || origName || '-')
    : (origName || '-');
  const idStatusHtml = `<div class="pm-pos" style="color:#f88;font-size:11px">선수 ID 없음 (클릭해서 연결)</div>`;

  c.innerHTML = `
<div class="pm-popup" id="pirPopup" role="dialog">
  <button class="pm-close" id="pirClose">&#10005;</button>
  <div class="pm-info">
    <div class="pm-avatar pm-avatar-empty" style="opacity:.35"></div>
    <div class="pm-info-text">
      <div class="pm-name"><span class="pm-num">${pirEsc(num)}</span>${pirEsc(displayName)}</div>
      ${idStatusHtml}
      ${existing ? `<div class="pm-nick-badge" style="color:#8cf">연결됨: ID ${pirEsc(String(existing.playerId))}</div>` : ''}
    </div>
  </div>
  <div class="pm-nick-wrap">
    <div class="pm-nick-title">선수 ID 입력 후 검색</div>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="pm-nick-input" id="pirIdInput" type="number" min="1"
        placeholder="예) 154660"
        value="${existing ? pirEsc(String(existing.playerId)) : ''}"
        style="flex:1;min-width:0"/>
      <button class="pm-btn pm-btn-primary" id="pirFetch" style="white-space:nowrap;padding:4px 10px">검색</button>
    </div>
    <div id="pirPreview" style="margin-top:8px;min-height:22px;font-size:11.5px;color:#aaa">
      ${existing
        ? `연결됨${existing.name ? ' - ' + pirEsc(existing.name) : ''} · 새 ID 입력 시 덮어쓰기`
        : '선수 ID를 입력하고 검색하세요'}
    </div>
    <div class="pm-nick-btns">
      <button class="pm-btn pm-btn-primary" id="pirSave">저장</button>
      ${existing ? '<button class="pm-btn pm-btn-danger" id="pirClear">연결 해제</button>' : ''}
      <button class="pm-btn" id="pirCancel">취소</button>
    </div>
  </div>
</div>`;

  if (typeof pmPositionPopup === 'function') {
    pmPositionPopup(document.getElementById('pirPopup'), clientX, clientY);
  }

  let _fetched = null;
  let _fetchedPid = null;
  const input = document.getElementById('pirIdInput');
  const preview = document.getElementById('pirPreview');

  async function doFetch() {
    const pid = parseInt(input.value, 10);
    if (!pid || pid <= 0) {
      preview.innerHTML = '<span style="color:#f88">유효한 ID를 입력하세요</span>';
      return;
    }
    preview.innerHTML = '<span style="color:#aaa">로딩 중...</span>';
    const fetchBtn = document.getElementById('pirFetch');
    if (fetchBtn) fetchBtn.disabled = true;
    try {
      const data = await (typeof fetchPlayerStats === 'function'
        ? fetchPlayerStats(pid)
        : Promise.reject(new Error('fetchPlayerStats 없음')));
      const p = data?.player;
      if (p) {
        _fetched = data;
        _fetchedPid = pid;
        const pname = p.fullName || p.name || '';
        const photoHtml = p.photoUrl
          ? `<img src="${pirEsc(p.photoUrl)}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:5px">`
          : '';
        const nat = p.nationality ? ` · ${pirEsc(p.nationality)}` : '';
        const age = p.age ? ` · ${p.age}세` : '';
        preview.innerHTML = `${photoHtml}<span style="color:#fff">${pirEsc(pname)}</span><span style="color:#888">${nat}${age}</span>`;
      } else {
        preview.innerHTML = '<span style="color:#f88">선수 정보를 찾을 수 없습니다</span>';
        _fetched = null;
        _fetchedPid = null;
      }
    } catch (err) {
      preview.innerHTML = `<span style="color:#f88">로딩 실패: ${pirEsc(String(err?.message || ''))}</span>`;
      _fetched = null;
      _fetchedPid = null;
    } finally {
      const fb = document.getElementById('pirFetch');
      if (fb) fb.disabled = false;
    }
  }

  document.getElementById('pirFetch').addEventListener('click', doFetch);
  input.addEventListener('input', () => {
    _fetched = null;
    _fetchedPid = null;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doFetch(); }
    if (e.key === 'Escape') { e.stopPropagation(); pirHideAll(); }
  });

  document.getElementById('pirClose').addEventListener('click', pirHideAll);
  document.getElementById('pirCancel').addEventListener('click', pirHideAll);

  document.getElementById('pirSave').addEventListener('click', () => {
    const pid = parseInt(input.value, 10);
    if (!pid || pid <= 0 || !storeKey) return;
    if (pirIsDuplicateAltId(fixtureId, storeKey, pid)) {
      preview.innerHTML = '<span style="color:#f88">이미 다른 선수에 연결된 ID입니다</span>';
      return;
    }
    const fetchedMatches = _fetchedPid === pid;
    const p = fetchedMatches ? _fetched?.player : null;
    const entry = {
      playerId: pid,
      resolvedAt: Date.now(),
    };
    // 같은 ID를 재저장(연결 해제/재검색 없이 그냥 저장)할 땐 기존에 저장된 이름/사진을 보존한다.
    if (!fetchedMatches && existing && Number(existing.playerId) === pid) {
      if (existing.name != null) entry.name = existing.name;
      if (existing.nameKoLong != null) entry.nameKoLong = existing.nameKoLong;
      if (existing.photoUrl != null) entry.photoUrl = existing.photoUrl;
    }
    if (fetchedMatches) {
      entry.name = p?.name || null;           // 단축명 (한글 단축 우선, 없으면 API 영문 단축)
      entry.nameKoLong = p?.fullName || null; // 풀네임 (한글 풀네임 우선, 없으면 API 영문 풀네임)
      entry.photoUrl = p?.photoUrl || null;
    }
    pirSetByKey(storeKey, entry);
    pirHideAll();
    if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  });

  const clearBtn = document.getElementById('pirClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      pirSetByKey(storeKey, null);
      pirHideAll();
      if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
    });
  }

  input.focus();
  input.select();
}

// ── 클릭 이벤트 핸들러 ─────────────────────────────────────────────────────────

/** document 클릭 위임으로 id=0 선수 노드 클릭을 감지해 pirShowMenu를 띄움. DOMContentLoaded에서 호출. */
function pirInit() {
  document.addEventListener('click', e => {
    const c = document.getElementById('pmContainer');
    if (c && c.contains(e.target)) return;

    const dpEl = e.target.closest(
      '.dp-item[data-player-id="0"], .dp-lineup-node[data-player-id="0"], .dp-lineup-name-wrap[data-player-id="0"]'
    );
    if (!dpEl) return;

    const origName = dpEl.dataset.playerOrigName || '';
    const side = pirGetSide(dpEl);
    if (!side) return;

    pirShowMenu(side, origName, e.clientX, e.clientY);
  });
}

// pirShowMenuForPlayer — id≠0 선수용. pmShowIdInput을 직접 호출하도록 player-menu.js에서 처리.
// 하위 호환을 위해 남겨두되 id=0 전용 pirShowMenu로 리다이렉트하지 않음.
window.pirShowMenuForPlayer = function(side, origApiName, clientX, clientY) {
  pirShowMenu(side, String(origApiName || '').trim(), clientX, clientY);
};

// ── 구버전 항목 자동 마이그레이션 ────────────────────────────────────────────
// name 필드만 있고 nameKoLong 프로퍼티가 없는 항목은 구버전 코드로 저장된 것.
// (구버전: name = fullName || name → 한글 풀네임이 name에 저장됨)
// name 필드를 제거해 백엔드가 내려주는 올바른 단축명이 그대로 사용되도록 함.
// playerId/photoUrl은 유지해 ID 연결과 사진 선택 결과는 보존.
function pirMigrateOldEntries() {
  const store = pirReadStore();
  let changed = false;
  for (const key of Object.keys(store)) {
    const entry = store[key];
    if (!entry || typeof entry !== 'object') continue;
    const hasNameKoLong = Object.prototype.hasOwnProperty.call(entry, 'nameKoLong');
    if (entry.name && !hasNameKoLong) {
      const { name: _removed, ...rest } = entry;
      store[key] = rest;
      changed = true;
    }
  }
  if (changed) pirWriteStore(store);
}

document.addEventListener('DOMContentLoaded', () => {
  pirMigrateOldEntries();
  pirInit();
});
