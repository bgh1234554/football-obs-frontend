// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 패널 / 공통 유틸 + 수동 입력 저장소]
// dpEscape/clonePlayers 등 lineup-data.js, lineup-render.js, lineup-manual-modal.js가
// 공유하는 저수준 유틸 + lineupPanelState(현재 표시 중인 fixture/모달/그리드 상태) +
// fixture 단위 수동 override(localStorage, TTL 7일) CRUD. 다른 lineup-*.js 파일보다
// 먼저 로드되어야 한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [상세 패널 / 라인업] 교체 명단·부상자 명단·선발 라인업 렌더와 수동 입력, 전술판 동기화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DETAIL_MANUAL_STORAGE_KEY = 'obs.detail.manual.v1';
const DETAIL_MANUAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DETAIL_DEFAULT_FORMATION = '4-3-3';
const DETAIL_BENCH_ROWS = 18;
const DETAIL_INJURY_ROWS = 12;
const DETAIL_SIDE_TITLES = { home: '홈', away: '원정' };
const DETAIL_PANEL_BALANCE_EPSILON_PX = 1;

const lineupPanelState = {
  lastFixture: null,
  manualModal: null,
  // 그리드 모드 모달 편집 중 상태 (열려있을 때만 non-null):
  //   { side, formation, slotPlayerIds: [11 players], players: { [pid]: playerInfo } }
  gridState: null,
};

let detailBenchBalanceRaf = 0;
let detailBenchResizeObserver = null;

/** HTML에 안전하게 삽입하기 위해 `& < > " '`를 entity로 escape. innerHTML 합성 시 사용. */
function dpEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

/** tactics.js의 포메이션 좌표 map(TACTICS_FM)을 안전하게 반환. 없으면 빈 객체. */
function getTacticsFormationMap() {
  return typeof TACTICS_FM !== 'undefined' && TACTICS_FM ? TACTICS_FM : {};
}

/** tactics.js의 포지션 라벨 map(TACTICS_LABELS) 안전 반환. */
function getTacticsLabelMap() {
  return typeof TACTICS_LABELS !== 'undefined' && TACTICS_LABELS ? TACTICS_LABELS : {};
}

/**
 * 그리드 모드(initGridState/lineup-data.js gridByPlayerId)에서 선수를 구분하는 안정적인 키.
 * playerId=0(미해결)인 선수가 한 팀에 여럴 있으면 전부 같은 키로 충돌하므로,
 * 같은 startXi 배열 안 인덱스로 구분한다. 두 호출부(initGridState, buildEffectiveFixtureData)
 * 모두 lineupPanelState.lastFixture의 같은 startXi 배열을 같은 순서로 순회하므로 인덱스가 안정적이다.
 */
function buildLineupRosterKey(player, index) {
  const pid = Number(player?.playerId);
  return pid ? String(pid) : `0:${index}`;
}

/** 선수 배열 깊은 복사 (1-depth). null 항목 제거. 입력이 배열 아니면 빈 배열. */
function clonePlayers(players) {
  return Array.isArray(players) ? players.filter(Boolean).map(player => ({ ...player })) : [];
}

/** 부상자 배열 깊은 복사 (1-depth). null 제거. */
function cloneInjuries(injuries) {
  return Array.isArray(injuries) ? injuries.filter(Boolean).map(injury => ({ ...injury })) : [];
}

/** lineup 객체 + 내부 startXi/substitutes/coach까지 1-depth 복사. effectiveData 합성 시 사용. */
function cloneLineup(lineup) {
  if (!lineup) return lineup;
  return {
    ...lineup,
    startXi: clonePlayers(lineup.startXi),
    substitutes: clonePlayers(lineup.substitutes),
    coach: lineup.coach ? { ...lineup.coach } : lineup.coach,
  };
}

/** fixture 응답에서 fixtureId 문자열 추출. 없거나 공백이면 빈 문자열. */
function getFixtureIdFromData(data) {
  return String(data?.matchInfo?.fixtureId ?? '').trim();
}

/** 현재 패널이 표시 중인 fixtureId. 모달의 저장 키 / 수동 store 키로 사용. */
function getActiveFixtureId() {
  return getFixtureIdFromData(lineupPanelState.lastFixture);
}

/** 감독 이름 sanitize. 빈 값/null/undefined/하이픈 단독은 빈 문자열 반환 (UI에서 placeholder). */
function normalizeCoachName(name) {
  const value = String(name ?? '').trim();
  if (!value) return '';
  if (/^(null|undefined|-)$/i.test(value)) return '';
  return value;
}

// ─── 수동 입력 저장소 (fixture 단위) ──────────────────────────────────────
// localStorage(DETAIL_MANUAL_STORAGE_KEY)에 fixtureId 기준으로 override를 보관하고,
// API 응답에 얹어서 실제 렌더 데이터로 사용. TTL은 7일.

/**
 * 저장소 raw 읽고 만료/빈 entry 정리 후 반환.
 * 1) JSON 파싱 실패 시 빈 객체.
 * 2) expiresAt 지났거나 sanitize 결과 빈 entry는 제거.
 * 3) 정리된 결과가 있으면 즉시 다시 저장.
 */
function readManualStore() {
  let parsed = {};
  try {
    parsed = JSON.parse(localStorage.getItem(DETAIL_MANUAL_STORAGE_KEY) || '{}') || {};
  } catch {}

  let dirty = false;
  const now = Date.now();
  Object.keys(parsed).forEach(fixtureId => {
    const entry = parsed[fixtureId];
    const expiresAt = Number(entry?.expiresAt);
    const isExpired = !Number.isFinite(expiresAt) || expiresAt < now;
    if (!entry || typeof entry !== 'object' || isExpired || isManualEntryEmpty(entry)) {
      delete parsed[fixtureId];
      dirty = true;
    }
  });

  if (dirty) writeManualStore(parsed);
  return parsed;
}

/** 수동 store 직렬화 저장. quota 초과 등 에러는 silent. */
function writeManualStore(store) {
  try {
    localStorage.setItem(DETAIL_MANUAL_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

/**
 * 한 side의 수동 입력 데이터를 저장 형식으로 정규화.
 *
 * - lineup: startXi 풀폼(11명+포메이션) 또는 grid-only(formation+gridByPlayerId) 두 모드 지원.
 * - bench / injuries: 빈 배열은 키 자체 제외(저장 공간 절약).
 * - coachName: 공백 trim 후 빈 값이면 키 제외.
 *
 * 결과가 빈 객체면 null 반환 — 호출자가 store에서 키를 지울지 판단.
 */
function sanitizeManualSideData(sideData) {
  const next = {};

  // manualSide.lineup 두 가지 모드:
  //   (A) startXi 풀폼 — 사용자가 11명 + 포메이션을 직접 입력 (API 라인업 자체가 없을 때).
  //   (B) gridByPlayerId — API 라인업은 있지만 포메이션이 없는 경우.
  //       API startXi를 보존한 채 formation + 선수별 grid 매핑만 override.
  if (sideData?.lineup) {
    const formation = (sideData.lineup.formation || '').trim() || null;
    const hasStartXiArr = Array.isArray(sideData.lineup.startXi) && sideData.lineup.startXi.length > 0;
    const gridByPlayerId = sideData.lineup.gridByPlayerId;
    const hasGrids = gridByPlayerId && typeof gridByPlayerId === 'object'
      && Object.keys(gridByPlayerId).length > 0;

    if (hasStartXiArr) {
      next.lineup = { formation, startXi: clonePlayers(sideData.lineup.startXi) };
    } else if (hasGrids && formation) {
      next.lineup = { formation, gridByPlayerId: { ...gridByPlayerId } };
    }
  }

  if (Array.isArray(sideData?.bench) && sideData.bench.length) {
    next.bench = clonePlayers(sideData.bench);
  }

  if (Array.isArray(sideData?.injuries) && sideData.injuries.length) {
    next.injuries = cloneInjuries(sideData.injuries);
  }

  if (String(sideData?.coachName || '').trim()) {
    next.coachName = String(sideData.coachName).trim();
  }

  return Object.keys(next).length ? next : null;
}

/** entry가 사용자 입력이 하나도 없는지 — 주심+양 사이드 모두 비면 true. store 정리 판단용. */
function isManualEntryEmpty(entry) {
  const refereeEmpty = !String(entry?.refereeName || '').trim();
  return refereeEmpty && !sanitizeManualSideData(entry?.home) && !sanitizeManualSideData(entry?.away);
}

// fixture 단위로 저장되는 주심 이름 — entry 최상단(home/away와 동급)에 보관.
// updateManualEntry는 side 단위라 별도 헬퍼 사용.
function setManualReferee(fixtureId, value) {
  if (!fixtureId) return;
  const trimmed = String(value || '').trim();
  const store = readManualStore();
  const current = store[fixtureId] && typeof store[fixtureId] === 'object'
    ? { ...store[fixtureId] }
    : { home: {}, away: {} };

  if (trimmed) current.refereeName = trimmed;
  else delete current.refereeName;

  if (isManualEntryEmpty(current)) {
    delete store[fixtureId];
  } else {
    store[fixtureId] = {
      ...current,
      savedAt: Date.now(),
      expiresAt: Date.now() + DETAIL_MANUAL_TTL_MS,
    };
  }
  writeManualStore(store);
}

/** fixtureId의 수동 entry 전체 반환 (home/away/refereeName 포함). 없으면 null. */
function getManualEntry(fixtureId) {
  if (!fixtureId) return null;
  return readManualStore()[fixtureId] || null;
}

/**
 * fixtureId 하나의 수동 입력 중, options에서 true로 켠 항목만 선택적으로 삭제.
 * options: { lineup, bench, injuries, coachName, referee } (boolean, 기본 전부 false).
 *   - lineup/bench/injuries/coachName: home/away 양쪽에서 함께 지움
 *     (lineup엔 포메이션+그리드/풀폼 라인업이 같이 들어있어 따로 못 나눔).
 *   - referee: entry 최상단 refereeName (양 팀 공통이라 side 구분 없음).
 * 다른 fixture의 저장값이나 선수 ID/닉네임 연결(player-id-resolve.js, 별도 storage key)은
 * 건드리지 않음 — "캐시 초기화"가 API 응답 캐시만 지우고 이 store는 그대로 두는 것과
 * 반대로, 이 함수는 이 store의 해당 fixture 항목 중 선택한 필드만 지운다.
 * 실제로 뭔가 지워졌으면 true, 지울 게 없었으면 false.
 */
function clearManualEntryFields(fixtureId, options = {}) {
  if (!fixtureId) return false;
  const store = readManualStore();
  const current = store[fixtureId];
  if (!current || typeof current !== 'object') return false;

  const next = {
    ...current,
    home: { ...(current.home || {}) },
    away: { ...(current.away || {}) },
  };
  let changed = false;

  ['home', 'away'].forEach(side => {
    ['lineup', 'bench', 'injuries', 'coachName'].forEach(field => {
      if (options[field] && next[side][field] !== undefined) {
        delete next[side][field];
        changed = true;
      }
    });
  });
  if (options.referee && next.refereeName !== undefined) {
    delete next.refereeName;
    changed = true;
  }

  if (!changed) return false;

  if (isManualEntryEmpty(next)) {
    delete store[fixtureId];
  } else {
    store[fixtureId] = { ...next, savedAt: Date.now(), expiresAt: Date.now() + DETAIL_MANUAL_TTL_MS };
  }
  writeManualStore(store);
  return true;
}

/** fixtureId+side의 수동 데이터 부분만 반환. 모달 진입 시 기존 값 미리 채우는 용도. */
function getManualSideData(fixtureId, side) {
  return getManualEntry(fixtureId)?.[side] || null;
}

/**
 * 한 side의 수동 데이터를 updater 함수로 변형 후 저장.
 *
 * 1) store에서 현재 entry draft 만들기(home/away 분리 복사).
 * 2) updater(현재 side draft) → 결과를 sanitize.
 * 3) sanitize 결과가 있으면 draft에 반영, 없으면 해당 side 키 제거.
 * 4) entry가 완전히 비면 store에서 fixtureId 자체 제거, 아니면 savedAt/expiresAt 갱신해 저장.
 * 5) refereeName 등 top-level 필드는 보존하면서 home/away만 교체.
 */
function updateManualEntry(fixtureId, side, updater) {
  if (!fixtureId || !side || typeof updater !== 'function') return null;

  const store = readManualStore();
  const current = store[fixtureId] && typeof store[fixtureId] === 'object'
    ? store[fixtureId]
    : { home: {}, away: {} };

  const draft = {
    home: { ...(current.home || {}) },
    away: { ...(current.away || {}) },
  };

  const updated = updater({ ...(draft[side] || {}) }) || {};
  const sanitizedSide = sanitizeManualSideData(updated);

  if (sanitizedSide) draft[side] = sanitizedSide;
  else delete draft[side];

  // refereeName 등 top-level 필드는 draft에 없으므로, current와 합친 결과로 비어있는지 판단해야
  // home/away만 비워도 기존 refereeName이 남아있는 entry를 통째로 지우는 사고를 막는다.
  if (isManualEntryEmpty({ ...current, ...draft })) {
    delete store[fixtureId];
  } else {
    // 기존 top-level 필드 (refereeName 등)를 보존하면서 새 home/away와 병합
    store[fixtureId] = {
      ...current, // 기존 refereeName, savedAt 등 모두 유지
      ...draft,   // draft.home, draft.away로 덮어쓰기
      savedAt: Date.now(),
      expiresAt: Date.now() + DETAIL_MANUAL_TTL_MS,
    };
  }

  writeManualStore(store);
  return store[fixtureId] || null;
}

/**
 * 수동 entry에서 특정 종류(lineup/bench/injury/coach)만 골라 삭제.
 * 패널 내 "수동값 삭제" 버튼이 호출. 다른 종류 입력은 그대로 유지.
 */
function deleteManualKind(fixtureId, side, kind) {
  updateManualEntry(fixtureId, side, sideData => {
    if (kind === 'lineup') delete sideData.lineup;
    if (kind === 'bench') delete sideData.bench;
    if (kind === 'injury') delete sideData.injuries;
    if (kind === 'coach') delete sideData.coachName;
    return sideData;
  });
}
