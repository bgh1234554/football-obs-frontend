// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 ID 연결] 클릭 → ID 입력 팝업
// fetchPlayerStats로 프로필 가져와 이름/사진 덮어쓰기. 폴링 이벤트도 실 ID로 매칭됨.
// lineup-data.js의 buildEffectiveFixtureData에서 window.applyZeroIdOverrides를 호출해 적용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [자동 ID 매칭 전체 흐름] applyZeroIdOverrides가 매 렌더마다 거치는 순서
//
// 배경: API Football이 같은 선수에게 라인업 엔드포인트와 이벤트 엔드포인트에서
// 서로 다른 playerId를 주는 경우가 있다(흔히 "alt ID" 문제). 이걸 사람이 매번
// 수동으로 ID 입력 안 해도 되게, 같은 fixture 안에서 이름으로 같은 선수를
// 추론해 자동으로 이어붙이는 게 이 파일의 자동 매칭 부분이다. 수동 override
// (localStorage에 저장된 값)는 항상 이 자동 추론보다 우선한다.
//
// 0단계 — 수동 override 적용 범위 계산 (applyZeroIdOverrides 안)
//   localStorage에서 이 fixtureId의 저장된 override를 다 읽어온다(relevant).
//   autoLinkPlayerIdByName 설정이 off면 아래 1~2단계를 건너뛰고 수동 override만 적용.
//
// 1단계 — id≠0인데 ID가 틀린 경우: pirAutoLinkAltToCanonical(rawData, nameHints)
//   같은 팀 라인업+벤치 안에서, 이벤트에 나온 playerId가 로스터의 어떤 실제
//   playerId와도 안 맞으면(alt ID) "같은 선수"로 보이는 로스터 선수를 찾아
//   { side:altId → canonicalId } 매핑을 만든다. 한 선수 후보 안에서 시도 순서:
//     a) origName(이벤트 원문 영문) 완전 일치
//     b) 한글 이름(name/nameKoLong) 완전 일치
//     c) 위 둘 다 실패 → pirFuzzyFindRosterMatch로 유사도 매칭(아래 3단계)
//   매칭에 쓰인 한글 이름은 nameHints에 적립(원래 영문만 있는 로스터 표시에
//   나중에 끼워 넣기용).
//
// 2단계 — id=0인데 이벤트엔 실제 ID로 나오는 경우(반대 방향):
//   pirAutoLinkZeroIdFromEvents(rawData, claimedAltIdsBySide)
//   라인업/벤치에 playerId=0으로 내려온 선수를, 같은 팀 이벤트에 등장하는
//   (1단계에서 이미 다른 선수에게 쓰인 ID는 제외한) 실제 ID 후보들과 매칭한다.
//   origName 완전 일치를 먼저 다 처리하고, 남은 선수만 유사도 매칭으로 재시도.
//
// 3단계 — 유사도 매칭의 실제 알고리즘: pirFuzzyFindRosterMatch(eventNames, candidates)
//   완전 일치가 실패했을 때만 호출되는 마지막 보강 단계. 이벤트 쪽 이름
//   { origName, koName, koNameLong }을 후보들과 비교하는데, 셋을 순서대로
//   시도하다 하나라도 성공하면 그 결과를 쓴다(OR 체인, 동시 비교 아님):
//     origName(영문) → koNameLong(한글 풀네임) → koName(한글 단축명)
//   각 시도는 pirFuzzyMatchByField → pirFuzzyMatchPass로 내려가서:
//     - 정규화(영문: pirNormalizeForFuzzy / 한글: pirNormalizeForFuzzyKo)
//     - 첫 토큰(이름) 버리고 나머지(성 핵심부)만 비교 대상으로(pirCoreTokensFromTokens)
//     - 첫 글자가 다른 후보는 비교 전에 걸러냄(다른 이름과의 오매칭 1차 방지)
//     - 남은 후보들과 pirCoreTokensSimilarity(토큰별 1:1 최적 정렬 + pirJaroWinkler)로
//       점수를 매겨 1위/2위를 추적
//     - 1위가 PIR_FUZZY_THRESHOLD(0.85) 미만이거나, 1위-2위 차이가
//       PIR_FUZZY_MARGIN(0.08) 미만(모호함)이면 null — 틀린 매칭보다 미매칭이 안전
//   pirFuzzyMatchByField는 이 pass를 두 번 돌린다(영문에서만 의미 있음):
//     1차 — 접두어 분리 없이 원본 토큰 그대로(정상적인 Al-/Ben- 등으로 시작하는
//           성씨가 다른 선수와 혼동되지 않게 기본은 안전한 버전으로 비교)
//     2차 — 1차가 전부 실패했을 때만, "Abudahab" → "Abu"+"Dahab"처럼 관사성
//           접두어가 성에 공백 없이 병합된 토큰을 pirStripLeadingParticlePrefix로
//           분리해 재시도
//
// 4단계 — 위에서 만든 매핑들을 실제 데이터에 적용(applyZeroIdOverrides 본문)
//   altToCanonical(1단계 결과 + 수동 override id키)로 events/playerStats의
//   playerId/assistId를 라인업 노드에 귀속시키고, zeroIdAutoLinks(2단계 결과)로
//   playerId=0 로스터 항목에 실제 ID/한글 이름/사진을 채운다.
//
// 결과는 localStorage에 저장하지 않는다 — 매 렌더마다 현재 fixture 데이터로 새로
// 계산되는 순수 런타임 보정이라, 수동 ID 입력(저장됨)이 항상 우선한다.
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
// 게다가 한쪽에만 중간 이름이 있거나(예: "Husam Ali Mohammad Abudahab" vs
// "H. Abu Dahab"), 관사성 접두어가 성에 공백 없이 붙어 한 토큰으로 합쳐지거나
// (Abudahab vs Abu Dahab), 아랍어 등 음역 표기가 엔드포인트별로 달라지기도 한다
// (Rosan/Rousan, Fakhouri/Fakhoury). 그래서 "성(姓) 핵심부 토큰들" 사이에서
// 최적 1:1 정렬로 유사도를 구한다 — 한쪽에만 있는 여분의 중간 이름 토큰이 점수를
// 깎지 않는다. origName(영문)으로 먼저 시도하고, 실패하면 한글 이름
// (nameKoLong → name)으로도 같은 방식으로 재시도한다 — CSV 한글 번역자가 영문과
// 다른 이름 부분(중간 이름 등)을 통상명으로 골라 한글화한 경우, 영문 쪽이 어긋나도
// 한글 쪽에서 잡힐 수 있다. 같은 팀 안에 비슷한 성을 가진 다른 후보가 없으면
// 성 핵심부 토큰 1개만으로도 충분히 매칭된다(1위-2위 점수 차이만 확인).

/** 발음 구별 기호 제거 + 소문자 + 영문/숫자 외 문자는 공백으로 치환 + 공백 정리. */
function pirNormalizeForFuzzy(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 한글 이름 정규화: 한글/공백만 남기고 공백 정리(대소문자·발음부호 문제 없음). */
function pirNormalizeForFuzzyKo(s) {
  return String(s || '')
    .replace(/[^가-힣\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 표기 유무가 들쭉날쭉한 이름 관사성 토큰 — 비교 전 제거. 긴 것부터 시도해야
// "abudahab"처럼 성에 공백 없이 붙은 접두어를 안전하게 분리할 수 있다.
const PIR_NAME_PARTICLES = new Set(['al', 'el', 'abu', 'ibn', 'bin', 'bint', 'ben', 'de', 'van', 'der']);
const PIR_NAME_PARTICLES_BY_LEN = [...PIR_NAME_PARTICLES].sort((a, b) => b.length - a.length);
// 한글판 관사성 토큰. 한글은 음절 단위 표기라 접두어가 성에 병합되는 문제가 거의
// 없으므로 토큰 단위 제거에만 쓴다.
const PIR_NAME_PARTICLES_KO = new Set(['알', '엘', '아부', '이븐', '빈', '벤']);

/**
 * "abudahab"처럼 관사성 접두어가 성에 공백 없이 붙어 한 토큰으로 합쳐진 경우를
 * 분리해 접두어를 제거한다. 제거 후 남는 부분이 3자 미만이면(오탐 위험) 원본을 둔다.
 */
function pirStripLeadingParticlePrefix(token) {
  for (const p of PIR_NAME_PARTICLES_BY_LEN) {
    if (token.length - p.length >= 3 && token.startsWith(p)) return token.slice(p.length);
  }
  return token;
}

/**
 * 토큰 배열 → "성 핵심부" 토큰 배열. 첫 토큰(이름/이니셜)은 버리고, 나머지 각
 * 토큰에서 관사성 접두어(stripPrefixFn 제공 시 병합형까지)를 제거한 뒤 관사성
 * 토큰 자체도 걸러낸다.
 */
function pirCoreTokensFromTokens(tokens, particleSet, stripPrefixFn) {
  if (tokens.length <= 1) return tokens;
  const rest = tokens.slice(1)
    .map(t => stripPrefixFn ? stripPrefixFn(t) : t)
    .filter(t => t && !particleSet.has(t));
  return rest.length ? rest : tokens.slice(1); // 전부 관사면 원래 나머지로 폴백
}

/**
 * 두 문자열 간 Jaro 유사도(0~1). 단순 Levenshtein 정규화 유사도는 짧은 문자열에서
 * 편집 1번이 점수를 과하게 깎는 문제가 있다(예: 5글자 단어의 1글자 오차가 20%
 * 손실) — 성씨처럼 짧은 토큰 비교에는 부적합하다는 게 알려진 약점이다. Jaro(-Winkler)는
 * 애초에 사람 이름/성씨 같은 짧은 문자열 매칭을 위해 고안된 알고리즘이라 이 비교에 더
 * 적합하다.
 */
function pirJaro(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const matchDistance = Math.floor(Math.max(m, n) / 2) - 1;
  const aMatches = new Array(m).fill(false);
  const bMatches = new Array(n).fill(false);
  let matches = 0;
  for (let i = 0; i < m; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, n);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0, k = 0;
  for (let i = 0; i < m; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (matches / m + matches / n + (matches - transpositions) / matches) / 3;
}

/** Jaro-Winkler 유사도(0~1). 앞쪽 4글자까지 일치하는 접두어에 가중치를 더 준다(표준 p=0.1). */
function pirJaroWinkler(a, b) {
  const jaro = pirJaro(a, b);
  const maxPrefix = Math.min(4, a.length, b.length);
  let prefix = 0;
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] !== b[i]) break;
    prefix++;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * 두 "성 핵심부" 토큰 리스트 사이의 유사도(0~1). 토큰 개수가 달라도(한쪽에만
 * 중간 이름이 더 있는 경우 등) 점수가 깎이지 않도록, 더 짧은 쪽의 각 토큰에 대해
 * 다른 쪽에서 가장 유사한 토큰을 찾아 평균 낸다(최적 1:1 정렬) — surname 토큰
 * 하나만 정확히 일치해도 한쪽에 중간 이름이 더 있다는 이유로 점수가 떨어지지 않는다.
 */
function pirCoreTokensSimilarity(coreA, coreB) {
  if (!coreA.length || !coreB.length) return 0;
  const [shorter, longer] = coreA.length <= coreB.length ? [coreA, coreB] : [coreB, coreA];
  let total = 0;
  for (const tok of shorter) {
    let best = 0;
    for (const other of longer) {
      const sim = pirJaroWinkler(tok, other);
      if (sim > best) best = sim;
    }
    total += best;
  }
  return total / shorter.length;
}

// Jaro-Winkler 기준 임계값. "오매칭 비용이 큰 strict matching"에는 0.8~0.9대가 권장되는
// 일반적인 가이드라인을 따라 기존 0.78(Levenshtein 기준)보다 올림 — 짧은 성씨 토큰의
// 정상적인 음역 표기 차이(Rosan/Rousan, Fakhouri/Fakhoury 등)는 Jaro-Winkler에서
// 0.95 안팎으로 나와 여유 있게 통과하고, 그보다 낮은 애매한 경우는 더 엄격히 거른다.
const PIR_FUZZY_THRESHOLD = 0.85;   // 이 이상이어야 같은 선수로 인정
const PIR_FUZZY_MARGIN = 0.08;      // 1위-2위 차이가 이보다 작으면 모호하다고 보고 보류

/** 문자열에 한글이 포함되어 있는지 확인. */
const pirHasHangul = s => typeof s === 'string' && /[가-힣]/.test(s);

/**
 * pirFuzzyMatchByField의 단일 패스. stripPrefixFn 유무에 따라 병합형 접두어 분리를
 * 적용하거나(2차 패스) 안 한다(1차 패스).
 * - 첫 토큰(이름/이니셜)의 첫 글자가 같아야 함(다른 이름과의 오매칭 방지).
 * - 성 핵심부 유사도가 임계값 이상이고, 1위와 2위 점수 차이가 충분해야 함(동명이인/
 *   비슷한 철자의 다른 선수와 오매칭 방지) — 모호하면 null 반환(보류, 틀린 매칭보다 안전).
 *   같은 팀 안에 겹치는 성을 가진 다른 후보가 없으면 1위 점수만으로 충분히 통과한다.
 */
function pirFuzzyMatchPass(eventRaw, candidates, field, normalizeFn, particleSet, stripPrefixFn) {
  const normEvent = normalizeFn(eventRaw);
  if (!normEvent) return null;
  const eventTokens = normEvent.split(' ').filter(Boolean);
  if (!eventTokens.length) return null;
  const eventInitial = eventTokens[0][0];
  const eventCore = pirCoreTokensFromTokens(eventTokens, particleSet, stripPrefixFn);
  if (eventCore.join('').length < 3) return null; // 핵심부가 너무 짧으면(이니셜만 등) 신뢰 불가

  let bestPid = null, bestScore = 0, secondScore = 0;
  for (const cand of candidates) {
    const normCand = normalizeFn(cand[field]);
    if (!normCand) continue;
    const candTokens = normCand.split(' ').filter(Boolean);
    if (!candTokens.length || candTokens[0][0] !== eventInitial) continue;
    const candCore = pirCoreTokensFromTokens(candTokens, particleSet, stripPrefixFn);
    if (candCore.join('').length < 3) continue;
    const score = pirCoreTokensSimilarity(eventCore, candCore);
    if (score > bestScore) { secondScore = bestScore; bestScore = score; bestPid = cand.pid; }
    else if (score > secondScore) secondScore = score;
  }
  if (!bestPid || bestScore < PIR_FUZZY_THRESHOLD) return null;
  if (secondScore > 0 && bestScore - secondScore < PIR_FUZZY_MARGIN) return null;
  return bestPid;
}

/**
 * candidates 중 eventRaw와 가장 유사한 항목을 field 기준으로 찾는다.
 * normalizeFn/particleSet을 바꿔 영문(origName)/한글(koName 등) 양쪽에 동일한
 * 알고리즘을 재사용한다.
 * 1차: 병합형 접두어 분리 없이 원본 토큰 그대로 비교한다. "Bensebaini", "Alonso",
 * "Albright"처럼 관사성 토큰(al/el/ben 등)으로 시작하지만 실제로는 분리할 게 아닌
 * 정상 성씨가 이 1차에서 안전하게 매칭되거나(또는 안 되는 게 맞는 경우 그대로 탈락)
 * 끝난다.
 * 2차(stripPrefixFn 제공 시): 1차가 모든 후보에서 실패했을 때만 "Abudahab"처럼
 * 관사성 접두어가 성에 공백 없이 병합된 경우를 잡기 위해 접두어를 뗀 버전으로
 * 재시도한다. 1차에서 이미 매칭(혹은 정상적으로 매칭 실패)된 케이스는 2차를 타지
 * 않으므로, 접두어 분리가 정상 성씨를 다른 선수와 혼동시킬 위험을 1차가 전부
 * 실패하는 좁은 경우로 한정한다.
 */
function pirFuzzyMatchByField(eventRaw, candidates, field, normalizeFn, particleSet, stripPrefixFn) {
  return pirFuzzyMatchPass(eventRaw, candidates, field, normalizeFn, particleSet, null)
    || (stripPrefixFn ? pirFuzzyMatchPass(eventRaw, candidates, field, normalizeFn, particleSet, stripPrefixFn) : null);
}

/**
 * roster 후보들 중 이벤트 쪽 이름(eventNames: {origName, koName, koNameLong})과
 * 가장 유사한 선수를 찾는다. origName(영문)으로 먼저 시도하고, 실패하면 한글
 * 풀네임(koNameLong) → 한글 단축명(koName) 순으로 동일한 방식 재시도한다.
 */
function pirFuzzyFindRosterMatch(eventNames, candidates) {
  return pirFuzzyMatchByField(eventNames.origName, candidates, 'origName', pirNormalizeForFuzzy, PIR_NAME_PARTICLES, pirStripLeadingParticlePrefix)
    || pirFuzzyMatchByField(eventNames.koNameLong, candidates, 'koNameLong', pirNormalizeForFuzzyKo, PIR_NAME_PARTICLES_KO)
    || pirFuzzyMatchByField(eventNames.koName, candidates, 'koName', pirNormalizeForFuzzyKo, PIR_NAME_PARTICLES_KO);
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
// - 위 두 완전 일치가 모두 실패하면 origName(영문) → 한글 이름 순으로 성 핵심부
//   유사도(pirFuzzyFindRosterMatch)로 재시도한다 — 축약형 vs 풀네임, 중간 이름
//   유무, 아랍어 음역 표기 차이(Rosan/Rousan 등)를 흡수.
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
// canonicalKoHintsOut(선택): 매칭 성공 시 canonical(로스터) 쪽에 한글 이름이 있으면
//   `{side}:{altId}` → { name, nameKoLong }로 채워준다. 이벤트 쪽이 영문이고 로스터
//   쪽에 한글이 있는 경우, applyZeroIdOverrides가 이벤트의 playerName/assistName도
//   한글로 덮어써서 양쪽이 같은 한글 이름으로 표시되게 하기 위함.
function pirAutoLinkAltToCanonical(rawData, nameHintsOut, canonicalKoHintsOut) {
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
    const fuzzyCandidates = [];      // [{ pid, origName, koName, koNameLong }] — 완전 일치 실패 시 유사도 매칭용

    roster.forEach(p => {
      const pid = Number(p?.playerId);
      if (!pid) return; // id=0은 이 기능 대상 아님
      knownIds.add(pid);
      addToMap(origNameToId, String(p?.origName || '').trim(), pid);
      addToMap(koNameToId, String(p?.name || '').trim(), pid);
      addToMap(koNameToId, String(p?.nameKoLong || '').trim(), pid);
      fuzzyCandidates.push({ pid, origName: p?.origName, koName: p?.name, koNameLong: p?.nameKoLong });
    });

    // 매칭 성공 시 이벤트에 roster 쪽 한글 이름을 역전파하기 위한 pid→한글 조회 맵
    const pidToKo = canonicalKoHintsOut ? new Map(
      roster.filter(p => Number(p?.playerId)).map(p => [
        Number(p.playerId),
        { koName: p?.name || null, koNameLong: p?.nameKoLong || null },
      ])
    ) : null;

    const tryLink = (eventPid, origName, koName, koNameLong) => {
      const pid = Number(eventPid);
      if (!pid || knownIds.has(pid)) return; // id=0 또는 이미 정상 매칭되는 ID면 손댈 필요 없음
      const canonicalId = origNameToId.get(String(origName || '').trim())
        || koNameToId.get(String(koName || '').trim())
        || koNameToId.get(String(koNameLong || '').trim())
        || pirFuzzyFindRosterMatch({ origName, koName, koNameLong }, fuzzyCandidates);
      if (!canonicalId || canonicalId === pid) return;
      result[`${side}:${pid}`] = canonicalId;
      // 이벤트(alt ID) 쪽에 한글이 있으면 → canonical 로스터에 역전파(nameHintsOut)
      if (nameHintsOut && (koName || koNameLong)) {
        const key = `${side}:${canonicalId}`;
        if (!nameHintsOut[key]) nameHintsOut[key] = { name: koName || null, nameKoLong: koNameLong || null };
      }
      // canonical 로스터 쪽에 한글이 있으면 → 이벤트(alt ID)에 역전파(canonicalKoHintsOut)
      if (canonicalKoHintsOut && pidToKo) {
        const ko = pidToKo.get(canonicalId);
        if (ko && (pirHasHangul(ko.koName) || pirHasHangul(ko.koNameLong))) {
          const altKey = `${side}:${pid}`;
          if (!canonicalKoHintsOut[altKey]) canonicalKoHintsOut[altKey] = { name: ko.koName, nameKoLong: ko.koNameLong };
        }
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
// - origName 완전 일치를 먼저 모두 시도하고, 남은 선수에 대해서만 pirFuzzyFindRosterMatch로
//   재시도한다(origName → 한글 이름 순으로 성 핵심부 유사도 비교).
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

    const fuzzyCandidates = [...pidInfo.entries()].map(([pid, info]) => ({ pid, origName: info.origName, koName: info.koName, koNameLong: info.koNameLong }));
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
      const matchedPid = pirFuzzyFindRosterMatch({ origName: p.origName, koName: p.name, koNameLong: p.nameKoLong }, pool);
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
  const canonicalKoHints = {}; // {side:altId} → { name, nameKoLong } — canonical 로스터 한글을 이벤트에 역전파
  const altToCanonical = autoLinkOn ? pirAutoLinkAltToCanonical(next, nameHints, canonicalKoHints) : {};
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

  if (!Object.keys(relevant).length && !Object.keys(altToCanonical).length && !Object.keys(zeroIdAutoLinks).length && !Object.keys(canonicalKoHints).length) return;

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

  // ── 이벤트: altId → canonicalId 리매핑 + canonical 로스터 한글 역전파 ──────────
  // canonicalKoHints: 로스터에 한글이 있고 이벤트가 영문으로 내려온 경우, 이벤트의
  // playerName/assistName도 한글로 덮어써서 라인업 패널·이벤트 패널 양쪽이 같은 한글을
  // 표시하도록 한다. altToCanonical이 없어도 canonicalKoHints만으로 이름 패치가 발생할 수 있다.
  if (Array.isArray(next.events) && (Object.keys(altToCanonical).length || Object.keys(canonicalKoHints).length)) {
    next.events = next.events.map(ev => {
      if (!ev) return ev;
      const side = ev.side || '';
      const newPlayerId = altToCanonical[`${side}:${ev.playerId}`];
      const newAssistId = ev.assistId != null ? altToCanonical[`${side}:${ev.assistId}`] : undefined;
      const playerKo = canonicalKoHints[`${side}:${ev.playerId}`];
      const assistKo = ev.assistId != null ? canonicalKoHints[`${side}:${ev.assistId}`] : null;
      const needsPlayerName = playerKo?.name && !pirHasHangul(ev.playerName);
      const needsPlayerNameKoLong = playerKo?.nameKoLong && !pirHasHangul(ev.playerNameKoLong);
      const needsAssistName = assistKo?.name && !pirHasHangul(ev.assistName);
      const needsAssistNameKoLong = assistKo?.nameKoLong && !pirHasHangul(ev.assistNameKoLong);
      if (!newPlayerId && newAssistId === undefined && !needsPlayerName && !needsPlayerNameKoLong && !needsAssistName && !needsAssistNameKoLong) return ev;
      return {
        ...ev,
        ...(newPlayerId ? { playerId: newPlayerId } : {}),
        ...(newAssistId !== undefined ? { assistId: newAssistId } : {}),
        ...(needsPlayerName ? { playerName: playerKo.name } : {}),
        ...(needsPlayerNameKoLong ? { playerNameKoLong: playerKo.nameKoLong } : {}),
        ...(needsAssistName ? { assistName: assistKo.name } : {}),
        ...(needsAssistNameKoLong ? { assistNameKoLong: assistKo.nameKoLong } : {}),
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
