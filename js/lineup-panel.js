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
    if (!entry || typeof entry !== 'object' || Number(entry.expiresAt) < now || isManualEntryEmpty(entry)) {
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

  if (isManualEntryEmpty(draft)) {
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

/**
 * API fixture 응답에 수동 override를 합성해 "실제 표시용" 상세 패널 데이터를 만든다.
 * startXi 풀폼 override, grid-only override, 교체 명단, 감독/주심, 부상자 명단을 모두 여기서 병합한다.
 */
function buildEffectiveFixtureData(data) {
  if (!data) return null;

  // 1) 현재 fixture에 대해 저장된 수동 입력이 없으면 원본 응답을 그대로 사용.
  const fixtureId = getFixtureIdFromData(data);
  const entry = getManualEntry(fixtureId);

  // 2) 원본 객체를 직접 훼손하지 않도록 라인업/부상 배열을 먼저 복제한다.
  const next = {
    ...data,
    homeLineup: cloneLineup(data.homeLineup),
    awayLineup: cloneLineup(data.awayLineup),
    homeInjuries: cloneInjuries(data.homeInjuries),
    awayInjuries: cloneInjuries(data.awayInjuries),
  };
  // 교체 선수 수동 연동 override(events-panel.js) 적용 — subReflect swap이 이를 반영하도록.
  if (typeof window.evPatchSubstEvents === 'function' && Array.isArray(next.events)) {
    next.events = window.evPatchSubstEvents(next.events, fixtureId);
  }
  if (!entry) {
    // 수동 입력이 없으면 ID override만 적용하고 바로 반환.
    if (typeof window.applyZeroIdOverrides === 'function') {
      window.applyZeroIdOverrides(next, fixtureId);
    }
    return next;
  }

  // 3) 홈/원정 각각에 대해 라인업, 벤치, 감독, 부상자 override를 순서대로 적용한다.
  ['home', 'away'].forEach(side => {
    const manualSide = entry[side];
    if (!manualSide) return;

    const lineupKey = `${side}Lineup`;
    let lineup = next[lineupKey];

    if (manualSide.lineup) {
      const base = lineup || { formation: null, startXi: [], substitutes: [], coach: null };
      if (Array.isArray(manualSide.lineup.startXi)) {
        // (A) 풀폼 모드 — startXi 통째 override
        lineup = {
          ...base,
          formation: manualSide.lineup.formation || base.formation || null,
          startXi: clonePlayers(manualSide.lineup.startXi || []),
          substitutes: clonePlayers(base.substitutes || []),
          coach: base.coach ? { ...base.coach } : null,
        };
      } else if (manualSide.lineup.gridByPlayerId) {
        // (B) 그리드만 모드 — API의 startXi를 보존, formation + 선수별 grid만 override.
        // 카드/교체 이벤트는 자동 모드와 같은 데이터 구조라 그대로 작동.
        const grids = manualSide.lineup.gridByPlayerId;
        lineup = {
          ...base,
          formation: manualSide.lineup.formation || base.formation || null,
          startXi: clonePlayers(base.startXi || []).map(p => ({
            ...p,
            grid: grids[String(p.playerId)] || p.grid || null,
          })),
          substitutes: clonePlayers(base.substitutes || []),
          coach: base.coach ? { ...base.coach } : null,
        };
      }
      next[lineupKey] = lineup;
    }

    if (manualSide.bench) {
      const base = lineup || next[lineupKey] || { formation: null, startXi: [], substitutes: [], coach: null };
      lineup = {
        ...base,
        startXi: clonePlayers(base.startXi || []),
        substitutes: clonePlayers(manualSide.bench || []),
        coach: base.coach ? { ...base.coach } : null,
      };
      next[lineupKey] = lineup;
    }

    if (manualSide.coachName) {
      const base = lineup || next[lineupKey] || { formation: null, startXi: [], substitutes: [], coach: null };
      lineup = {
        ...base,
        startXi: clonePlayers(base.startXi || []),
        substitutes: clonePlayers(base.substitutes || []),
        coach: {
          ...(base.coach || {}),
          name: manualSide.coachName,
          nameKoLong: manualSide.coachName,
        },
      };
      next[lineupKey] = lineup;
    }

    if (manualSide.injuries) {
      next[`${side}Injuries`] = cloneInjuries(manualSide.injuries);
    }
  });

  // 4) 주심은 fixture 공통 데이터라 side 바깥에서 한 번만 반영한다.
  // fixture 단위로 저장된 manualEntry.refereeName 적용 — API에 주심 없을 때만 의미가 있지만,
  // setRefereeElement는 raw fixture 기준 editable 여부를 판별하므로 항상 override 우선.
  const manualReferee = String(entry.refereeName || '').trim();
  if (manualReferee) {
    next.matchInfo = { ...(next.matchInfo || {}), refereeName: manualReferee };
  }

  // 5) 수동 라인업 적용 후 ID override 적용 — 수동 선수 데이터가 한글 이름을 덮어쓰지 않도록
  //    항상 마지막에 실행한다.
  if (typeof window.applyZeroIdOverrides === 'function') {
    window.applyZeroIdOverrides(next, fixtureId);
  }

  return next;
}

// Iter 5-3: 교체 이벤트로 선발/벤치 swap. subReflect=on일 때만 적용.
// buildEffectiveFixtureData 결과를 받아 양 팀 startXi/substitutes를 이벤트 기반으로 재구성한 새 객체 반환.
// 데이터 변형은 lpApplySubReflectToLineup이 새 객체를 만들어 돌려주므로 입력 lineup은 안 건드림.
function applySubReflectToFixture(data) {
  if (!data) return data;
  const subReflectOn = (typeof getSetting === 'function') && getSetting('subReflect') === 'on';
  if (!subReflectOn) return data;
  if (typeof lpApplySubReflectToLineup !== 'function') return data;

  const events = Array.isArray(data.events) ? data.events : [];
  return {
    ...data,
    homeLineup: lpApplySubReflectToLineup(data.homeLineup, 'home', events),
    awayLineup: lpApplySubReflectToLineup(data.awayLineup, 'away', events),
  };
}

/** 한 사이드의 표시용 팀명. teamName 토글에 따라 long/short 선택, 빈 값은 다른 쪽 또는 기본 라벨로 폴백. */
function getTeamName(data, side) {
  const matchInfo = data?.matchInfo || {};
  const shortName = side === 'home'
    ? (matchInfo.homeTeamNameShort || '')
    : (matchInfo.awayTeamNameShort || '');
  const longName = side === 'home'
    ? (matchInfo.homeTeamName || '')
    : (matchInfo.awayTeamName || '');
  // 'teamName' 토글: long이면 풀네임, short이면 단축명. 빈 값은 다른 쪽으로 자동 폴백.
  const useLong = (typeof isLongName === 'function') && isLongName('teamName');
  const fallback = side === 'home' ? 'HOME' : 'AWAY';
  if (useLong) return longName || shortName || fallback;
  return shortName || longName || fallback;
}

/** API의 grid 값("X:Y") → {line, col} 객체. 잘못된 형식이면 null. */
function parseGridValue(value) {
  const match = String(value || '').match(/^(\d+):(\d+)$/);
  if (!match) return null;
  return { line: Number(match[1]), col: Number(match[2]) };
}

/**
 * grid 비교자. line(수비라인부터 1) 오름차순 + col 내림차순으로 정렬.
 * (col 내림차순: API의 col은 오른쪽에서 1부터인데 화면에선 왼쪽이 1번 슬롯이라 뒤집음.)
 * null grid는 항상 뒤로 보냄.
 */
function compareParsedGrid(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  if (left.line !== right.line) return left.line - right.line;
  return right.col - left.col;
}

/** startXi를 grid 순서로 정렬한 새 배열 반환. 원본 보존. */
function getOrderedLineupPlayers(players) {
  return clonePlayers(players).sort((a, b) => {
    const left = parseGridValue(a.grid);
    const right = parseGridValue(b.grid);
    return compareParsedGrid(left, right);
  });
}

/** lineup에 선발 11명(또는 그 이상)이 들어있는지. 빈 배열/null은 false. */
function hasStartXi(lineup) {
  return Array.isArray(lineup?.startXi) && lineup.startXi.length > 0;
}

/** lineup의 formation이 TACTICS_FM에 등록된 알려진 포메이션인지. */
function hasValidFormation(lineup) {
  const formation = String(lineup?.formation || '').trim();
  return !!(formation && getTacticsFormationMap()[formation]);
}

// Iter 3: API 라인업(startXi)이 있는 모든 경우 — 그리드 모드. 사용자가 데이터 오류나
// 교체 후 포메이션 변경을 직접 손볼 수 있도록, 포메이션이 이미 제공된 경우에도 활성화.
// startXi 자체가 없는 경우만 풀폼 모드(직접 입력) 라우팅.
function isGridMode(rawData, side) {
  const lineup = rawData?.[`${side}Lineup`];
  return !!lineup && hasStartXi(lineup);
}

/** 포메이션의 슬롯별 포지션 라벨(GK/CB/RB/...). 알 수 없는 포메이션이면 1~11 숫자 fallback. */
function getFormationSlotLabels(formation) {
  const labels = getTacticsLabelMap()[formation];
  if (Array.isArray(labels) && labels.length) return labels;
  return Array.from({ length: 11 }, (_, index) => `${index + 1}`);
}

/** 라벨 텍스트(GK/CB/CDM 등)에서 G/D/M/F 큰 분류 추출. 노드 색/그룹화 등 폴백 사용. */
function inferBasePos(label) {
  const upper = String(label || '').toUpperCase();
  if (upper.includes('GK')) return 'G';
  if (upper.includes('CB') || upper.includes('LB') || upper.includes('RB') || upper.includes('WB')) return 'D';
  if (upper.includes('DM') || upper.includes('CM') || upper.includes('AM') || upper.includes('LM') || upper.includes('RM') || upper.includes('M')) return 'M';
  return 'F';
}

/**
 * 포메이션 슬롯을 grid 순서(x → y 오름차순)로 정렬해서 반환.
 * 각 슬롯은 { coord, originalIndex } — originalIndex로 라벨/좌표 매핑 보존.
 */
function getFormationSlotsByGridOrder(formation) {
  return (getTacticsFormationMap()[formation] || [])
    .map((coord, originalIndex) => ({ coord: { ...coord }, originalIndex }))
    .sort((left, right) => {
      if (left.coord.x !== right.coord.x) return left.coord.x - right.coord.x;
      return left.coord.y - right.coord.y;
    });
}

/**
 * 슬롯 ↔ 선수 매핑을 grid 순서대로 짝지어 반환.
 * 선수가 없는 슬롯은 결과에서 제외 (포메이션 11개 < startXi 11명일 수도 있는 잡음 방어).
 */
function getFormationAssignments(lineup) {
  const slots = getFormationSlotsByGridOrder(lineup?.formation);
  const players = getOrderedLineupPlayers(lineup?.startXi || []);
  return slots
    .map((slot, index) => ({ slot, player: players[index] || null }))
    .filter(entry => !!entry.player);
}

function canRenderPitchMode(lineup) {
  if (!hasValidFormation(lineup) || !hasStartXi(lineup)) return false;
  return getFormationAssignments(lineup).length > 0;
}

function buildManualGridValues(formation) {
  const slots = getFormationSlotsByGridOrder(formation);
  if (!slots.length) return Array.from({ length: 11 }, (_, index) => index === 0 ? '1:1' : null);

  const uniqueLines = [...new Set(slots.map(slot => slot.coord.x))].sort((a, b) => a - b);
  return slots.map(slot => {
    const lineIndex = uniqueLines.indexOf(slot.coord.x) + 1;
    const rowSlots = slots.filter(candidate => candidate.coord.x === slot.coord.x);
    // grid 값의 col은 API-Football 관례와 동일하게 "오른쪽 -> 왼쪽" 순서로 저장한다.
    // getOrderedLineupPlayers()가 같은 line 안에서 col 내림차순으로 정렬하기 때문에,
    // 여기서도 RB/RW가 더 큰 col을 갖도록 맞춰야 저장 후 재로딩 시 좌우가 뒤집히지 않는다.
    const rowIndex = rowSlots.length - rowSlots.findIndex(candidate => candidate.originalIndex === slot.originalIndex);
    return `${lineIndex}:${rowIndex}`;
  });
}

function getInputValue(value) {
  return String(value ?? '').trim();
}

function normalizeHexColor(value, fallback) {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

function withAlpha(hexColor, alphaHex) {
  const normalized = normalizeHexColor(hexColor, '');
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? `${normalized}${alphaHex}` : normalized;
}

/**
 * 라인업 토큰/팀 chip 색상 — state.colors를 우선 사용.
 *   applyFixtureToState가 API의 homePrimaryColor를 state.colors.homeBg에 동기화하고,
 *   사용자가 테마 탭에서 직접 바꾸면 거기서도 state.colors가 갱신됨 → 한 곳만 보면 일관됨.
 *   greenscreen ON일 때는 chromaSafe()로 초록 계열 → 시안 자동 치환.
 */
function getLineupSideColors(data, side) {
  const cs = (typeof chromaSafe === 'function') ? chromaSafe : (v => v);
  if (side === 'home') {
    return {
      bg: cs(normalizeHexColor(state?.colors?.homeBg, '#2563eb')),
      text: cs(normalizeHexColor(state?.colors?.homeText, '#ffffff')),
    };
  }
  return {
    bg: cs(normalizeHexColor(state?.colors?.awayBg, '#ef4444')),
    text: cs(normalizeHexColor(state?.colors?.awayText, '#ffffff')),
  };
}

function buildEmptyHtml(message) {
  return `<div class="dp-empty">${dpEscape(message)}</div>`;
}

// ─── Iter 5-3: 라인업 이벤트/평점 표시 헬퍼 ───────────────────────────────
// 노드(피치) + 벤치 행 + 선발 리스트 행에서 공통으로 사용.

function lpGetContext() {
  return lineupPanelState.context || { eventsByPlayer: new Map(), ratingByPlayer: new Map() };
}

function lpGetPlayerEvents(playerId) {
  if (playerId == null) return null;
  return lpGetContext().eventsByPlayer.get(String(playerId)) || null;
}

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

  return `<div class="${itemClass}" data-player-id="${dpEscape(player.playerId)}"${Number(player.playerId) === 0 ? ` data-player-orig-name="${dpEscape(player.name || '')}"` : ''}>
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

function setPanelTitle(panel, titleText, actionsHtml = '') {
  const titleEl = panel?.querySelector('.dp-title');
  if (!titleEl) return;
  titleEl.innerHTML = `<span class="dp-title-text">${dpEscape(titleText)}</span>${actionsHtml ? `<span class="dp-title-actions">${actionsHtml}</span>` : ''}`;
}

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

function shouldShowBenchManualButton(rawFixture, side) {
  return !Array.isArray(rawFixture?.[`${side}Lineup`]?.substitutes);
}

function shouldShowInjuryManualButton(/* rawFixture, side */) {
  return true;
}

// 항상 표시 — 데이터가 잘못됐거나 교체 후 포메이션 수정이 필요한 경우 직접 손볼 수 있게.
// 그리드/풀폼 모드는 isGridMode로 자동 분기.
function shouldShowLineupManualButton(/* rawFixture, side */) {
  return true;
}

function buildLineupSideHeaderHtml(side, teamName, formationText, showManual) {
  return `<div class="dp-side-header">
    <span class="dp-side-name" title="${dpEscape(teamName)}">${dpEscape(teamName)}</span>
    ${formationText ? `<span class="dp-side-formation">${dpEscape(formationText)}</span>` : ''}
    ${showManual ? buildTitleActionButton('lineup', side) : ''}
  </div>`;
}

function setSideName(panel, dataAttrPrefix, side, teamName, accentColor) {
  const nameEl = panel?.querySelector(`[data-${dataAttrPrefix}-side="${side}"] .dp-side-name`);
  if (!nameEl) return;
  nameEl.textContent = teamName;
  nameEl.title = teamName;
  if (accentColor) nameEl.style.setProperty('--dp-team-accent', accentColor);
  else nameEl.style.removeProperty('--dp-team-accent');
}

function getCoachName(lineupLike) {
  return typeof pickName === 'function' ? pickName(lineupLike?.coach, 'roster') : '';
}

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

function applyBenchCountClass(listEl) {
  if (!listEl) return;
  listEl.classList.remove('dp-count-md');
}

function buildBenchListHtml(players, lineupExists) {
  if (!players || players.length === 0) {
    return buildEmptyHtml(lineupExists ? '후보 없음' : '벤치 정보 미제공');
  }
  // Iter 5-3: 카드/교체/골/어시/평점 마커는 lpBuildRosterRowHtml이 일괄 처리.
  return players.map(player => lpBuildRosterRowHtml(player, 'bench')).join('');
}

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

    return `<div class="dp-item" data-player-id="${dpEscape(injury.playerId)}"${Number(injury.playerId) === 0 ? ` data-player-orig-name="${dpEscape(injury.name || '')}"` : ''}>
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
function mapFormationSlotToBigSplitPitchPosition(slot, side) {
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
  const SPLIT_AWAY_SUPPORT_LIFT_PCT = 2.5;
  if (side === 'away' && depth > 0 && depth < 0.82) {
    top -= SPLIT_AWAY_SUPPORT_LIFT_PCT;
  }
  // 바둑알(원) 반지름이 컨테이너 높이 대비 ~6%이므로, 포메이션에 관계없이 상단 잘림을 막는
  // 보편적 하한선. 4-3-1-2처럼 x=44(depth=1.0)인 극단 포메이션에서도 안전하게 적용된다.
  top = Math.max(8, top);
  const yLocal = 100 - rawY;
  const left = 5 + (yLocal / 100) * 90;
  return { left, top };
}

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

function getActiveLineupNodeMode() {
  if (typeof getLineupNodeMode === 'function') return getLineupNodeMode();
  return 'number';
}

function shouldShowLineupNameNumber() {
  if (getActiveLineupNodeMode() !== 'photo') return false;
  return typeof getSetting !== 'function' || getSetting('lineupShowNumber') !== 'off';
}

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

  getFormationAssignments(lineup).forEach(({ slot, player }) => {
    const name = pickName(player, 'lineup') || player.name || '';
    const title = player.nameKoLong && player.nameKoLong !== player.name
      ? ` title="${dpEscape(player.nameKoLong)}"`
      : '';
    const position = pitchMode === 'split'
      ? mapFormationSlotToBigSplitPitchPosition(slot, side)
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
    const _pirAttr = Number(player.playerId) === 0 ? ` data-player-orig-name="${dpEscape(player.name || '')}"` : '';
    circles.push(`<div class="${nodeClass}" data-player-id="${dpEscape(player.playerId)}"${_pirAttr} style="${posStyle}${colorVars}">${badge}${badgesHtml}${ratingHtml}</div>`);
    names.push(`<div class="dp-lineup-name-wrap is-${side}" data-player-id="${dpEscape(player.playerId)}"${_pirAttr} style="${posStyle}">${buildLineupNameLabelHtml(player, name, nameClass, title)}</div>`);
  });

  return { circles: circles.join(''), names: names.join('') };
}

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

function buildLineupSplitPitchModeHtml(effectiveData, rawData, options = {}) {
  return `<div class="dp-lineup-pitch is-split">
    ${buildSingleSidePitchHtml('home', effectiveData, rawData, options)}
    ${buildSingleSidePitchHtml('away', effectiveData, rawData, options)}
  </div>`;
}

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
  ].filter(Boolean).join(''));

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
 * 단일 컬럼에서 선수가 넘치면 bc-two-col 클래스를 붙여 CSS columns 활성화.
 * columns: 2; column-fill: auto 로 왼쪽 먼저 꽉 채운 뒤 오른쪽으로 넘침.
 * 높이가 늘어나면 자동으로 왼쪽으로 복귀.
 */
function lpBenchCycleRebalance(panel) {
  const body = panel?.querySelector('.bc-body');
  if (!body) return;
  // 일시적으로 단일 컬럼으로 돌려서 실제 overflow 측정
  body.classList.remove('bc-two-col');
  const overflows = body.scrollHeight > body.clientHeight + 2;
  body.classList.toggle('bc-two-col', overflows);
}

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

  window.lpStatUpdateBtn?.();
}

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

// ─── 텍스트 피팅 / 충돌 보정 ─────────────────────────────────────────────
// 라인업 이름 pill, 벤치 하단 텍스트, 팀 칩은 모두 렌더 후 실제 픽셀 기준으로 한 번 더 보정한다.
const LINEUP_NAME_MIN_FONT_PX = 7;
const LINEUP_NAME_MIN_WIDTH_PX = 44;
const LINEUP_NAME_PITCH_PADDING_PX = 2;
const BIG_LINEUP_NAME_PITCH_PADDING_PX = 6;
const BENCH_FOOTER_MIN_FONT_PX = 8;
const TEAM_CHIP_NAME_MIN_FONT_PX = 7;
const TEAM_CHIP_NAME_MIN_WIDTH_PX = 44;
const TEAM_CHIP_META_MIN_FONT_PX = 7;
const TEAM_CHIP_BUTTON_MIN_FONT_PX = 7;
const TEAM_CHIP_BUTTON_MIN_WIDTH_PX = 48;
const TEXT_FIT_FONT_STEP_PX = 1;

function canMeasureTextElement(el) {
  return !!(el && el.isConnected && el.getClientRects().length && (el.offsetWidth > 0 || el.offsetHeight > 0));
}

function shrinkTextElement(el, minFontPx) {
  const current = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(current) || current <= minFontPx + 0.01) return false;
  const next = Math.max(minFontPx, current - TEXT_FIT_FONT_STEP_PX);
  if (next >= current) return false;
  el.style.fontSize = `${next}px`;
  return true;
}

function getTextLineRects(el) {
  if (!canMeasureTextElement(el) || !el.firstChild) return [];
  const range = document.createRange();
  try {
    range.selectNodeContents(el);
    return Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
  } finally {
    range.detach && range.detach();
  }
}

function getMergedTextLines(el) {
  const rects = getTextLineRects(el)
    .sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const lines = [];

  rects.forEach(rect => {
    const centerY = rect.top + (rect.height / 2);
    const tolerance = Math.max(1, rect.height * 0.35);
    const line = lines.find(item => Math.abs(item.centerY - centerY) <= tolerance);
    if (!line) {
      lines.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        centerY,
      });
      return;
    }
    line.top = Math.min(line.top, rect.top);
    line.bottom = Math.max(line.bottom, rect.bottom);
    line.left = Math.min(line.left, rect.left);
    line.right = Math.max(line.right, rect.right);
    line.centerY = line.top + ((line.bottom - line.top) / 2);
  });

  return lines;
}

function measureMaxTextLineWidth(el) {
  const rects = getMergedTextLines(el);
  let maxLineWidth = 0;
  rects.forEach(rect => {
    const width = rect.right - rect.left;
    if (width > maxLineWidth) maxLineWidth = width;
  });
  return maxLineWidth;
}

function getHorizontalChromeWidth(el) {
  const styles = getComputedStyle(el);
  return ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
    .reduce((sum, key) => sum + (parseFloat(styles[key]) || 0), 0);
}

function lockTextElementWidth(el, bufferPx = 1) {
  const maxLineWidth = measureMaxTextLineWidth(el);
  if (maxLineWidth > 0) {
    el.style.width = `${Math.ceil(maxLineWidth + getHorizontalChromeWidth(el) + bufferPx)}px`;
  }
}

function lockLineupNameWidth(nameEl) {
  lockTextElementWidth(nameEl, 1);
}

function canStayWithinTwoLineClamp(nameEl) {
  return nameEl.scrollHeight <= nameEl.clientHeight + 0.5;
}

function getRenderedTextLineCount(el) {
  const rects = getMergedTextLines(el);
  return rects.length || 1;
}

function canStayWithinTwoTextLines(el) {
  return getRenderedTextLineCount(el) <= 2;
}

function tightenTextElementWidth(el, minWidthPx, canFitFn) {
  if (!canMeasureTextElement(el) || typeof canFitFn !== 'function') return false;
  const currentWidth = Math.ceil(el.getBoundingClientRect().width);
  if (!Number.isFinite(currentWidth) || currentWidth <= minWidthPx) return false;

  let low = minWidthPx;
  let high = currentWidth;
  let best = currentWidth;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    el.style.width = `${mid}px`;
    if (canFitFn(el)) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  el.style.width = `${best}px`;
  return best < currentWidth;
}

function tightenLineupNameWidth(nameEl) {
  return tightenTextElementWidth(nameEl, LINEUP_NAME_MIN_WIDTH_PX, canStayWithinTwoLineClamp);
}

function isBigLineupName(nameEl) {
  return !!nameEl?.closest('.layout-big .lp-lineup');
}

function getBigLineupNameMinWidthPx(nameEl) {
  const wrap = nameEl?.closest('.dp-lineup-name-wrap');
  const wrapWidth = wrap ? Math.floor(wrap.getBoundingClientRect().width) : 0;
  if (!Number.isFinite(wrapWidth) || wrapWidth <= 0) return LINEUP_NAME_MIN_WIDTH_PX;
  return Math.max(30, Math.min(LINEUP_NAME_MIN_WIDTH_PX, Math.floor(wrapWidth * 0.58)));
}

function tightenBigLineupNameWidth(nameEl) {
  return tightenTextElementWidth(nameEl, getBigLineupNameMinWidthPx(nameEl), canStayWithinTwoLineClamp);
}

function fitLineupNameSelf(nameEl) {
  if (!canMeasureTextElement(nameEl) || !nameEl.firstChild) return;
  let safety = 0;
  while (safety < 16 && nameEl.scrollHeight > nameEl.clientHeight + 0.5) {
    if (!shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) break;
    safety += 1;
  }
  lockLineupNameWidth(nameEl);
}

function shrinkLineupName(nameEl) {
  if (!shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) return false;
  fitLineupNameSelf(nameEl);
  return true;
}

function shrinkBigLineupName(nameEl) {
  if (!shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) return false;
  fitLineupNameSelf(nameEl);
  tightenBigLineupNameWidth(nameEl);
  return true;
}

function getLineupNameWrap(nameEl) {
  return nameEl?.closest('.dp-lineup-name-wrap') || null;
}

function resetLineupNameWrapOffset(nameEl) {
  const wrap = getLineupNameWrap(nameEl);
  if (!wrap) return;
  wrap.style.marginLeft = '';
  wrap.style.marginTop = '';
}

function getLineupNamePitchOverflow(nameEl, paddingPx = LINEUP_NAME_PITCH_PADDING_PX) {
  const wrap = getLineupNameWrap(nameEl);
  const pitch = wrap?.closest('.dp-lineup-vertical-pitch');
  if (!wrap || !pitch || !canMeasureTextElement(nameEl) || !canMeasureTextElement(pitch)) return null;

  const wrapRect = nameEl.getBoundingClientRect();
  const pitchRect = pitch.getBoundingClientRect();
  return {
    left: Math.max(0, (pitchRect.left + paddingPx) - wrapRect.left),
    right: Math.max(0, wrapRect.right - (pitchRect.right - paddingPx)),
    top: Math.max(0, (pitchRect.top + paddingPx) - wrapRect.top),
    bottom: Math.max(0, wrapRect.bottom - (pitchRect.bottom - paddingPx)),
  };
}

function hasLineupNamePitchOverflow(nameEl, paddingPx = LINEUP_NAME_PITCH_PADDING_PX) {
  const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
  return !!(overflow && (overflow.left > 0.5 || overflow.right > 0.5 || overflow.top > 0.5 || overflow.bottom > 0.5));
}

function getLineupNamePitchPaddingPxForContext(nameEl) {
  return isBigLineupName(nameEl) ? BIG_LINEUP_NAME_PITCH_PADDING_PX : LINEUP_NAME_PITCH_PADDING_PX;
}

function nudgeLineupNameWrapVerticallyWithinPitch(nameEl, paddingPx = getLineupNamePitchPaddingPxForContext(nameEl)) {
  const wrap = getLineupNameWrap(nameEl);
  const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
  if (!wrap || !overflow) return false;

  let deltaY = 0;
  if (overflow.top > 0.5) deltaY += overflow.top + 1;
  if (overflow.bottom > 0.5) deltaY -= overflow.bottom + 1;
  if (Math.abs(deltaY) < 0.5) return false;

  const currentMarginTop = parseFloat(wrap.style.marginTop) || 0;
  wrap.style.marginTop = `${currentMarginTop + deltaY}px`;
  return true;
}

function relaxLineupNameWrapVerticalOffsetIfPossible(nameEl, paddingPx = getLineupNamePitchPaddingPxForContext(nameEl)) {
  const wrap = getLineupNameWrap(nameEl);
  if (!wrap) return false;

  const currentMarginTop = parseFloat(wrap.style.marginTop) || 0;
  if (Math.abs(currentMarginTop) < 0.5) return false;

  const previousMarginTop = wrap.style.marginTop;
  wrap.style.marginTop = '';
  const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
  const baselineFits = !!overflow && overflow.top <= 0.5 && overflow.bottom <= 0.5;
  if (baselineFits) return true;

  wrap.style.marginTop = previousMarginTop;
  return false;
}

function tightenLineupNameWidthForContext(nameEl) {
  return isBigLineupName(nameEl) ? tightenBigLineupNameWidth(nameEl) : tightenLineupNameWidth(nameEl);
}

function fitLineupNameWithinPitchBounds(nameEl) {
  if (!canMeasureTextElement(nameEl)) return false;

  const paddingPx = getLineupNamePitchPaddingPxForContext(nameEl);
  let changed = false;
  let safety = 0;
  while (safety < 16 && hasLineupNamePitchOverflow(nameEl, paddingPx)) {
    const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
    const horizontalOverflow = overflow && (overflow.left > 0.5 || overflow.right > 0.5);
    const verticalOverflow = overflow && (overflow.top > 0.5 || overflow.bottom > 0.5);

    if (horizontalOverflow && tightenLineupNameWidthForContext(nameEl)) {
      changed = true;
      safety += 1;
      continue;
    }

    if (verticalOverflow && isBigLineupName(nameEl) && nudgeLineupNameWrapVerticallyWithinPitch(nameEl, paddingPx)) {
      changed = true;
      safety += 1;
      continue;
    }

    if (!shrinkLineupName(nameEl)) break;
    changed = true;
    safety += 1;
  }

  // 큰 화면에서 하단 GK 라벨이 두 줄→한 줄로 줄어든 뒤에도 이전의 위쪽 보정값이 남아
  // 얼굴 위로 말려 올라오지 않게, 현재 크기에서 기본 위치가 다시 가능하면 되돌린다.
  if (isBigLineupName(nameEl) && relaxLineupNameWrapVerticalOffsetIfPossible(nameEl, paddingPx)) {
    changed = true;
  }

  return changed;
}

function wrapsOverlap(leftWrap, rightWrap) {
  const leftRect = leftWrap.getBoundingClientRect();
  const rightRect = rightWrap.getBoundingClientRect();
  return leftRect.left < rightRect.right - 1
    && leftRect.right > rightRect.left + 1
    && leftRect.top < rightRect.bottom - 1
    && leftRect.bottom > rightRect.top + 1;
}

function chooseWrapToShrink(leftWrap, rightWrap) {
  const leftRect = leftWrap.getBoundingClientRect();
  const rightRect = rightWrap.getBoundingClientRect();
  if (Math.abs(leftRect.width - rightRect.width) > 1) {
    return leftRect.width > rightRect.width ? leftWrap : rightWrap;
  }

  const leftName = leftWrap.matches?.('.dp-lineup-name') ? leftWrap : leftWrap.querySelector('.dp-lineup-name');
  const rightName = rightWrap.matches?.('.dp-lineup-name') ? rightWrap : rightWrap.querySelector('.dp-lineup-name');
  const leftLen = String(leftName?.textContent || '').trim().length;
  const rightLen = String(rightName?.textContent || '').trim().length;
  if (leftLen !== rightLen) return leftLen > rightLen ? leftWrap : rightWrap;

  return leftRect.top > rightRect.top ? leftWrap : rightWrap;
}

/**
 * 큰 캠 라인업 축소 시에만 추가로 도는 보정 패스.
 * 기본 pill 로직이 끝난 뒤에도 남는 충돌만 대상으로 폭 축소 → 폰트 축소 순서로 한 번 더 정리한다.
 */
function fitResidualBigLineupNameCollisions(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (bigLabels.length < 2) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (let i = 0; i < bigLabels.length; i += 1) {
      for (let j = i + 1; j < bigLabels.length; j += 1) {
        const leftEl = bigLabels[i];
        const rightEl = bigLabels[j];
        if (!canMeasureTextElement(leftEl) || !canMeasureTextElement(rightEl)) continue;
        if (!wrapsOverlap(leftEl, rightEl)) continue;

        const primaryEl = chooseWrapToShrink(leftEl, rightEl);
        const secondaryEl = primaryEl === leftEl ? rightEl : leftEl;

        if ((primaryEl && tightenBigLineupNameWidth(primaryEl))
          || (secondaryEl && tightenBigLineupNameWidth(secondaryEl))) {
          changed = true;
          break;
        }

        if ((primaryEl && shrinkBigLineupName(primaryEl))
          || (secondaryEl && shrinkBigLineupName(secondaryEl))) {
          changed = true;
          break;
        }
      }
      if (changed) break;
    }

    if (!changed) break;
    pass += 1;
  }
}

function getLineupNameSide(nameEl) {
  const wrap = getLineupNameWrap(nameEl);
  if (!wrap) return '';
  if (wrap.classList.contains('is-home')) return 'home';
  if (wrap.classList.contains('is-away')) return 'away';
  return '';
}

function getOpposingLineupBadgeTargets(nameEl) {
  const side = getLineupNameSide(nameEl);
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!side || !pitch) return [];

  const opposingSide = side === 'home' ? 'away' : 'home';
  return Array.from(
    pitch.querySelectorAll(`.dp-lineup-node.is-${opposingSide} .dp-node-badge, .dp-lineup-node.is-${opposingSide} .dp-node-rating`)
  ).filter(target => canMeasureTextElement(target));
}

function getPriorityLineupBadgeTargets(nameEl) {
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!pitch) return [];

  return Array.from(
    pitch.querySelectorAll('.dp-node-sub-in, .dp-node-sub-out, .dp-node-assist')
  ).filter(target => canMeasureTextElement(target));
}

function getTeamChipTargetsForLineupName(nameEl) {
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!pitch) return [];

  return Array.from(
    pitch.querySelectorAll('.dp-lineup-team-main, .dp-lineup-team-chip .dp-side-edit-btn')
  ).filter(target => canMeasureTextElement(target));
}

function getOwnTeamChipTargetsForLineupName(nameEl) {
  const side = getLineupNameSide(nameEl);
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!side || !pitch) return [];

  return Array.from(
    pitch.querySelectorAll(`.dp-lineup-team-chip.is-${side} .dp-lineup-team-main, .dp-lineup-team-chip.is-${side} .dp-side-edit-btn`)
  ).filter(target => canMeasureTextElement(target));
}

// 동일 피치 안에서 이 라벨의 선수를 제외한 나머지 선수 원(node 자체)을 반환한다.
// name-wrap과 node는 동일한 data-player-id를 가지므로 이것으로 자기 원을 구분한다.
function getSiblingNodeCirclesForLabel(nameEl) {
  const nameWrap = getLineupNameWrap(nameEl);
  const playerId = nameWrap?.dataset?.playerId;
  const playerOrigName = nameWrap?.dataset?.playerOrigName || '';
  const playerSide = getLineupNameSide(nameEl);
  const pitch = nameWrap?.closest('.dp-lineup-vertical-pitch');
  if (!pitch) return [];

  return Array.from(pitch.querySelectorAll('.dp-lineup-node'))
    .filter(node => {
      if (!canMeasureTextElement(node)) return false;
      if (playerId && playerId !== '0' && node.dataset.playerId === playerId) return false;
      if (playerId === '0' && playerOrigName && node.dataset.playerId === '0') {
        const nodeSide = node.classList.contains('is-home')
          ? 'home'
          : node.classList.contains('is-away') ? 'away' : '';
        if (node.dataset.playerOrigName === playerOrigName
          && (!playerSide || !nodeSide || nodeSide === playerSide)) {
          return false;
        }
      }
      return true;
    });
}

function shrinkBigLineupNameForBadgeCollision(nameEl, badgeTargets) {
  let changed = false;
  let safety = 0;

  while (safety < 12
    && canMeasureTextElement(nameEl)
    && Array.isArray(badgeTargets)
    && badgeTargets.length
    && elementOverlapsAny(nameEl, badgeTargets)) {
    if (shrinkBigLineupName(nameEl)) {
      fitLineupNameWithinPitchBounds(nameEl);
      changed = true;
      safety += 1;
      continue;
    }

    if (tightenBigLineupNameWidth(nameEl)) {
      fitLineupNameWithinPitchBounds(nameEl);
      changed = true;
      safety += 1;
      continue;
    }

    break;
  }

  return changed;
}

function fitBigLineupNameAgainstPriorityBadges(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const badgeTargets = getPriorityLineupBadgeTargets(nameEl);
      if (!badgeTargets.length) continue;
      if (!elementOverlapsAny(nameEl, badgeTargets)) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, badgeTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

function fitBigLineupNameAgainstOtherLabels(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const labelTargets = labels.filter(target => target !== nameEl && canMeasureTextElement(target));
      if (!labelTargets.length) continue;
      if (!elementOverlapsAny(nameEl, labelTargets)) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, labelTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

function fitBigLineupNameAgainstTeamChips(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const chipTargets = getTeamChipTargetsForLineupName(nameEl);
      if (!chipTargets.length) continue;
      if (!elementOverlapsAny(nameEl, chipTargets)) continue;

      const ownChipTargets = getOwnTeamChipTargetsForLineupName(nameEl);
      const foreignChipTargets = chipTargets.filter(target => !ownChipTargets.includes(target));
      const overlapsOwnChipOnly = elementOverlapsAny(nameEl, ownChipTargets)
        && !elementOverlapsAny(nameEl, foreignChipTargets);
      // 자기 팀 칩과의 충돌은 이름을 올리거나 줄이지 말고,
      // 마지막 team-chip fitting 패스가 칩 쪽을 가장자리로 물리도록 맡긴다.
      // 특히 하단 원정 GK는 이 편이 라벨 기준선을 안정적으로 지킨다.
      if (overlapsOwnChipOnly) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, chipTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

function fitBigLineupNameAgainstOpposingBadges(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const badgeTargets = getOpposingLineupBadgeTargets(nameEl);
      if (!badgeTargets.length) continue;
      if (!elementOverlapsAny(nameEl, badgeTargets)) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, badgeTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

// 이름 라벨이 다른 선수의 바둑알(원) 자체와 겹칠 때 감지·보정한다.
// 기존 시스템이 라벨-라벨, 라벨-배지만 감지하고 라벨-원은 놓치던 gap을 메운다.
//
// 판정 기준: 이름 pill의 "텍스트 실제 표시 영역"이 바둑알(원)과 실제로 겹쳐야만 발동한다.
//   - pill 좌우 패딩(6px) + 상하 패딩(2px)을 뺀 텍스트 내부 rect 사용
//   - 원의 border-radius:50% 코너 빈 공간은 실제 원-사각형 충돌 알고리즘으로 제외
//     (중심점에서 텍스트 rect 최근접점까지의 거리 < 반지름 → 실제 겹침)
//   - AABB만 쓰면 코너 투명 공간 때문에 false positive가 발생하므로 이 방식이 정확함
function nameOverlapsNodeCircleSignificantly(nameEl, nodeEl) {
  if (!canMeasureTextElement(nameEl) || !canMeasureTextElement(nodeEl)) return false;
  const nr = nameEl.getBoundingClientRect();
  const cr = nodeEl.getBoundingClientRect();
  // pill 패딩 제외한 텍스트 표시 영역
  const tL = nr.left + 6, tR = nr.right - 6;
  const tT = nr.top + 2,  tB = nr.bottom - 2;
  if (tR <= tL + 0.5 || tB <= tT + 0.5) return false;
  // 바둑알 중심 + 반지름 (getBoundingClientRect는 transform 적용 후 뷰포트 좌표)
  const cX = (cr.left + cr.right) / 2;
  const cY = (cr.top + cr.bottom) / 2;
  const radius = (cr.right - cr.left) / 2;
  // 텍스트 rect에서 원 중심까지의 최단 거리 (원-사각형 충돌 표준 알고리즘)
  const nearX = Math.max(tL, Math.min(cX, tR));
  const nearY = Math.max(tT, Math.min(cY, tB));
  const dist = Math.sqrt((cX - nearX) ** 2 + (cY - nearY) ** 2);
  // 원 반지름의 50% 이내까지 들어왔을 때만 발동.
  // 라벨 테두리나 바둑알 테두리가 아주 살짝 닿는 수준은 무시하고,
  // 이름 텍스트가 바둑알 안쪽 중심부에 확실히 겹칠 때만 축소한다.
  return dist < radius * 0.5;
}

function nameOverlapsAnyNodeCircle(nameEl, circles) {
  return circles.some(node => nameOverlapsNodeCircleSignificantly(nameEl, node));
}

function fitLineupNamesAgainstNodeCircles(labels) {
  labels.forEach(nameEl => {
    if (!canMeasureTextElement(nameEl)) return;
    const circles = getSiblingNodeCirclesForLabel(nameEl);
    if (!circles.length || !nameOverlapsAnyNodeCircle(nameEl, circles)) return;

    let safety = 0;
    while (safety < 8 && canMeasureTextElement(nameEl) && nameOverlapsAnyNodeCircle(nameEl, circles)) {
      if (shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) {
        fitLineupNameSelf(nameEl);
        fitLineupNameWithinPitchBounds(nameEl);
        safety++;
        continue;
      }
      if (tightenLineupNameWidthForContext(nameEl)) {
        fitLineupNameWithinPitchBounds(nameEl);
        safety++;
        continue;
      }
      // 위 두 방법이 모두 한계에 달하면 큰 캠에서만 수직 nudge를 마지막 수단으로 사용.
      if (isBigLineupName(nameEl)) nudgeLineupNameWrapVerticallyWithinPitch(nameEl);
      break;
    }
  });
}

function fitBenchFooterNames(root) {
  const scope = root || document;
  scope.querySelectorAll('.dp-bench-footer .dp-coach-name, .dp-bench-footer .dp-referee-name').forEach(nameEl => {
    if (!nameEl || nameEl.classList.contains('dp-coach-editing') || nameEl.classList.contains('dp-referee-editing')) return;
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;

    const isReferee = nameEl.classList.contains('dp-referee-name');
    let safety = 0;
    while (safety < 12) {
      const overflow = isReferee
        ? (nameEl.scrollHeight > nameEl.clientHeight + 0.5 || nameEl.scrollWidth > nameEl.clientWidth + 0.5)
        : nameEl.scrollWidth > nameEl.clientWidth + 0.5;
      if (!overflow) break;
      if (!shrinkTextElement(nameEl, BENCH_FOOTER_MIN_FONT_PX)) break;
      safety += 1;
    }
  });

  // 경기장 이름 — 2줄 line-clamp 후에도 잘리거나 가로 넘침이면 폰트 점진 축소.
  scope.querySelectorAll('.dp-bench-venue .dp-league-name').forEach(nameEl => {
    if (!nameEl) return;
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;
    let safety = 0;
    while (safety < 12) {
      const overflow = nameEl.scrollWidth > nameEl.clientWidth + 0.5;
      if (!overflow) break;
      if (!shrinkTextElement(nameEl, BENCH_FOOTER_MIN_FONT_PX)) break;
      safety += 1;
    }
  });

  // 경기장 이름은 'overflow-wrap: anywhere' + 'line-clamp: 2'라 자연스럽게 줄바꿈되며
  // scrollWidth ≤ clientWidth가 되어 일반적인 overflow 검사로는 줄바꿈을 못 잡는다.
  // → 단일 줄(white-space:nowrap) 자연 폭을 측정해 컨테이너 폭과 비교, 가능한 한 1줄에
  // 맞도록 폰트를 점진 축소. 최소 폰트(8px)에 도달했는데도 1줄에 못 들어가면 그대로 wrap 허용.
  scope.querySelectorAll('.dp-bench-venue .dp-venue-name').forEach(nameEl => {
    if (!nameEl) return;
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;
    let safety = 0;
    while (safety < 16) {
      const containerWidth = nameEl.clientWidth;
      if (!containerWidth) break;
      // 임시로 nowrap 적용해 단일 줄 자연 폭 측정.
      const prevWhiteSpace = nameEl.style.whiteSpace;
      nameEl.style.whiteSpace = 'nowrap';
      const naturalWidth = nameEl.scrollWidth;
      nameEl.style.whiteSpace = prevWhiteSpace;
      // 1줄에 들어가거나 추가 오버플로우 없으면 종료.
      const wrapNeeded = naturalWidth > containerWidth + 0.5;
      const heightOverflow = nameEl.scrollHeight > nameEl.clientHeight + 0.5;
      if (!wrapNeeded && !heightOverflow) break;
      if (!shrinkTextElement(nameEl, BENCH_FOOTER_MIN_FONT_PX)) break;
      safety += 1;
    }
  });

  scope.querySelectorAll('.dp-bench-kickoff .dp-kickoff-time').forEach(nameEl => {
    if (!nameEl) return;
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;
    let safety = 0;
    while (safety < 12) {
      const overflow = nameEl.scrollWidth > nameEl.clientWidth + 0.5;
      if (!overflow) break;
      if (!shrinkTextElement(nameEl, BENCH_FOOTER_MIN_FONT_PX)) break;
      safety += 1;
    }
  });
}

function getPanelOuterHeight(el) {
  if (!el) return 0;
  const style = getComputedStyle(el);
  return el.getBoundingClientRect().height
    + (parseFloat(style.marginTop) || 0)
    + (parseFloat(style.marginBottom) || 0);
}

function getPanelPaddingY(el) {
  if (!el) return 0;
  const style = getComputedStyle(el);
  return (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
}

function getListContentHeight(list) {
  if (!list) return 0;
  const style = getComputedStyle(list);
  const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const children = Array.from(list.children);
  if (!children.length) return paddingY;
  const listRect = list.getBoundingClientRect();
  const measuredBottom = children.reduce((maxBottom, child) => (
    Math.max(
      maxBottom,
      (child.getBoundingClientRect().bottom - listRect.top) + list.scrollTop
    )
  ), 0);
  return Math.max(paddingY, measuredBottom + (parseFloat(style.paddingBottom) || 0));
}

function getPanelSplitMinHeight(splitEl) {
  if (!splitEl) return 0;
  const columns = Array.from(splitEl.children).filter(child => child.classList.contains('dp-col'));
  if (!columns.length) return 0;

  return Math.max(...columns.map(column => {
    const header = column.querySelector('.dp-side-header');
    const list = column.querySelector('.dp-list');
    return getPanelOuterHeight(header) + getListContentHeight(list);
  }));
}

function getPanelSplitMetrics(panel) {
  const split = panel?.querySelector('.dp-split');
  if (!split) return { current: 0, required: 0, spare: 0, deficit: 0 };
  const current = split.getBoundingClientRect().height;
  const required = getPanelSplitMinHeight(split);
  return {
    current,
    required,
    spare: Math.max(0, current - required),
    deficit: Math.max(0, required - current),
  };
}

function getPanelChromeHeight(panel) {
  if (!panel) return 0;
  const split = panel.querySelector('.dp-split');
  const panelHeight = panel.getBoundingClientRect().height;
  const splitHeight = split ? split.getBoundingClientRect().height : 0;
  return Math.max(0, panelHeight - splitHeight);
}

function getBenchPanelSections() {
  const benchPanel = document.getElementById('benchPanel');
  const injuryPanel = document.getElementById('injuryPanel');
  const benchSection = benchPanel?.closest('.lp-bench') || null;
  const injurySection = injuryPanel?.closest('.lp-injury') || null;
  const benchColumn = benchSection?.closest('.lp-col-bench') || null;
  return { benchPanel, injuryPanel, benchSection, injurySection, benchColumn };
}

function resetBenchInjuryPanelHeights() {
  const { benchSection, injurySection } = getBenchPanelSections();
  if (benchSection) {
    benchSection.style.flex = '';
    benchSection.style.height = '';
  }
  if (injurySection) {
    injurySection.style.flex = '';
    injurySection.style.height = '';
  }
}

function balanceBenchInjuryPanelHeights() {
  const {
    benchPanel,
    injuryPanel,
    benchSection,
    injurySection,
    benchColumn,
  } = getBenchPanelSections();

  if (!benchPanel || !injuryPanel || !benchSection || !injurySection || !benchColumn) return;

  resetBenchInjuryPanelHeights();

  const page = benchColumn.closest('.page');
  if (page && !page.classList.contains('active')) return;

  const benchRect = benchSection.getBoundingClientRect();
  const injuryRect = injurySection.getBoundingClientRect();
  if (benchRect.height <= DETAIL_PANEL_BALANCE_EPSILON_PX
    || injuryRect.height <= DETAIL_PANEL_BALANCE_EPSILON_PX) {
    return;
  }

  const benchMetrics = getPanelSplitMetrics(benchPanel);
  const injuryMetrics = getPanelSplitMetrics(injuryPanel);
  let transferTarget = null;
  let sourceSpare = 0;
  let targetDeficit = 0;

  if (injuryMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && benchMetrics.spare > DETAIL_PANEL_BALANCE_EPSILON_PX) {
    transferTarget = 'injury';
    sourceSpare = benchMetrics.spare;
    targetDeficit = injuryMetrics.deficit;
  } else if (benchMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && injuryMetrics.spare > DETAIL_PANEL_BALANCE_EPSILON_PX) {
    transferTarget = 'bench';
    sourceSpare = injuryMetrics.spare;
    targetDeficit = benchMetrics.deficit;
  } else if (benchMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && injuryMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX) {
    const minInjuryHeight = getPanelChromeHeight(injuryPanel) + DETAIL_PANEL_BALANCE_EPSILON_PX;
    const maxTransferFromInjury = Math.max(0, injuryRect.height - minInjuryHeight);
    const transfer = Math.min(
      Math.floor(maxTransferFromInjury),
      Math.ceil(benchMetrics.deficit)
    );
    if (transfer <= DETAIL_PANEL_BALANCE_EPSILON_PX) return;

    const nextBenchHeight = benchRect.height + transfer;
    const nextInjuryHeight = injuryRect.height - transfer;

    benchSection.style.flex = `0 0 ${nextBenchHeight}px`;
    benchSection.style.height = `${nextBenchHeight}px`;
    injurySection.style.flex = `0 0 ${nextInjuryHeight}px`;
    injurySection.style.height = `${nextInjuryHeight}px`;
    return;
  } else {
    return;
  }

  const transfer = Math.min(
    Math.floor(sourceSpare),
    Math.ceil(targetDeficit)
  );
  if (transfer <= DETAIL_PANEL_BALANCE_EPSILON_PX) return;

  const nextBenchHeight = transferTarget === 'bench'
    ? benchRect.height + transfer
    : benchRect.height - transfer;
  const nextInjuryHeight = transferTarget === 'injury'
    ? injuryRect.height + transfer
    : injuryRect.height - transfer;

  benchSection.style.flex = `0 0 ${nextBenchHeight}px`;
  benchSection.style.height = `${nextBenchHeight}px`;
  injurySection.style.flex = `0 0 ${nextInjuryHeight}px`;
  injurySection.style.height = `${nextInjuryHeight}px`;
}

function scheduleBenchInjuryPanelBalance() {
  if (detailBenchBalanceRaf) cancelAnimationFrame(detailBenchBalanceRaf);
  detailBenchBalanceRaf = requestAnimationFrame(() => {
    detailBenchBalanceRaf = 0;
    balanceBenchInjuryPanelHeights();
  });
}

function initBenchInjuryPanelObserver() {
  if (detailBenchResizeObserver || !window.ResizeObserver) return;
  const { benchColumn } = getBenchPanelSections();
  if (!benchColumn) return;

  detailBenchResizeObserver = new ResizeObserver(() => {
    scheduleBenchInjuryPanelBalance();
  });
  detailBenchResizeObserver.observe(benchColumn);
}

/**
 * 라인업 토큰 이름 pill 처리 — 세 단계.
 *  1) 잘림(2줄 line-clamp 후 ellipsis) 감지 시 해당 라벨 font-size만 점진 축소.
 *     scrollHeight > clientHeight 이면 텍스트가 잘리는 상태 → min 7px / -0.5px씩 축소.
 *     라벨별 inline 스타일이라 다른 라벨 시각 균형 안 깨짐.
 *  2) Range API로 줄별 폭 측정 → 가장 긴 줄 폭 + padding으로 width 고정 (pill을 텍스트에 딱 맞춤).
 *  3) 큰 캠 축소 상황에서만 남는 충돌이 있으면 폭 축소, 그래도 안 풀리면 추가 폰트 축소를 적용.
 *
 * 호출 시점: innerHTML 갱신 후 다음 frame, 라인업 리사이즈 종료 후에도 다시 호출.
 */
function elementOverlapsAny(subjectEl, targets) {
  if (!canMeasureTextElement(subjectEl) || !Array.isArray(targets) || !targets.length) return false;
  return targets.some(target => canMeasureTextElement(target) && wrapsOverlap(subjectEl, target));
}

function nudgeTeamChipTowardEdge(chipEl, collisionEls) {
  if (!chipEl || !Array.isArray(collisionEls) || !collisionEls.length) return false;

  const prop = chipEl.classList.contains('is-away') ? 'bottom' : 'top';
  const currentOffset = parseFloat(getComputedStyle(chipEl)[prop]);
  const minOffset = 2;
  if (!Number.isFinite(currentOffset) || currentOffset <= minOffset + 0.5) return false;

  let changed = false;
  for (let next = Math.floor(currentOffset) - 1; next >= minOffset; next -= 1) {
    chipEl.style[prop] = `${next}px`;
    changed = true;
    if (!elementOverlapsAny(chipEl, collisionEls)) break;
  }
  return changed;
}

function shrinkTeamChipMainText(nameEl, formationEl) {
  let changed = false;
  if (shrinkTextElement(nameEl, TEAM_CHIP_NAME_MIN_FONT_PX)) changed = true;
  if (formationEl && shrinkTextElement(formationEl, TEAM_CHIP_META_MIN_FONT_PX)) changed = true;
  if (changed) {
    nameEl.style.width = '';
    if (formationEl) formationEl.style.width = '';
  }
  return changed;
}

function fitTeamChip(chipEl, collisionEls, options = {}) {
  const preferShrink = options?.preferShrink === true;
  const mainEl = chipEl?.querySelector('.dp-lineup-team-main');
  const nameEl = mainEl?.querySelector('.dp-lineup-team-name');
  const formationEl = mainEl?.querySelector('.dp-lineup-team-fm');
  const buttonEl = chipEl?.querySelector('.dp-side-edit-btn');
  const preserveBigFormationButton = !!(
    mainEl?.classList.contains('is-formation-only')
    && chipEl?.closest('.layout-big .lp-lineup')
  );
  if (!mainEl || !nameEl || !Array.isArray(collisionEls) || !collisionEls.length) return;

  let safety = 0;
  while (safety < 32) {
    const mainOverlaps = elementOverlapsAny(mainEl, collisionEls);
    const buttonOverlaps = elementOverlapsAny(buttonEl, collisionEls);
    if (!mainOverlaps && !buttonOverlaps) break;

    if (preferShrink && mainOverlaps) {
      if (shrinkTeamChipMainText(nameEl, formationEl)) {
        safety += 1;
        continue;
      }
      if (tightenTextElementWidth(nameEl, TEAM_CHIP_NAME_MIN_WIDTH_PX, canStayWithinTwoTextLines)) {
        safety += 1;
        continue;
      }
    }

    if (!preferShrink && mainOverlaps && formationEl && !mainEl.classList.contains('is-stacked')) {
      mainEl.classList.add('is-stacked');
      safety += 1;
      continue;
    }

    if (nudgeTeamChipTowardEdge(chipEl, collisionEls)) {
      safety += 1;
      continue;
    }

    if (!preserveBigFormationButton && buttonOverlaps && buttonEl
      && tightenTextElementWidth(buttonEl, TEAM_CHIP_BUTTON_MIN_WIDTH_PX, canStayWithinTwoTextLines)) {
      safety += 1;
      continue;
    }

    let changed = false;
    if (mainOverlaps) {
      changed = shrinkTeamChipMainText(nameEl, formationEl);
    }
    if (changed) {
      safety += 1;
      continue;
    }

    if (mainOverlaps && tightenTextElementWidth(nameEl, TEAM_CHIP_NAME_MIN_WIDTH_PX, canStayWithinTwoTextLines)) {
      safety += 1;
      continue;
    }

    if (!preserveBigFormationButton && buttonOverlaps && buttonEl && shrinkTextElement(buttonEl, TEAM_CHIP_BUTTON_MIN_FONT_PX)) {
      tightenTextElementWidth(buttonEl, TEAM_CHIP_BUTTON_MIN_WIDTH_PX, canStayWithinTwoTextLines);
      safety += 1;
      continue;
    }

    break;
  }
}

function fitBigLineupTeamChips(root) {
  const scope = root || document;
  const panels = scope?.matches?.('[data-dp-role="lineup"]')
    ? [scope]
    : Array.from(scope.querySelectorAll('[data-dp-role="lineup"]'));

  panels.forEach(panel => {
    const isBigLayout = !!panel.closest('.layout-big .lp-lineup');
    const isSmallLayout = !!panel.closest('.layout-small .lp-lineup-s');
    if (!isBigLayout && !isSmallLayout) return;

    const pitches = Array.from(panel.querySelectorAll('.dp-lineup-vertical-pitch'));
    if (!pitches.length) return;

    pitches.forEach(pitch => {
      pitch.querySelectorAll('.dp-lineup-team-name, .dp-lineup-team-chip .dp-side-edit-btn').forEach(el => {
        el.style.width = '';
        el.style.fontSize = '';
      });
      pitch.querySelectorAll('.dp-lineup-team-fm').forEach(el => {
        el.style.fontSize = '';
      });
      pitch.querySelectorAll('.dp-lineup-team-main').forEach(el => {
        el.classList.remove('is-stacked');
      });
      pitch.querySelectorAll('.dp-lineup-team-chip').forEach(chip => {
        chip.style.top = '';
        chip.style.bottom = '';
      });

      pitch.querySelectorAll('.dp-lineup-team-chip').forEach(chip => {
        const collisionEls = Array.from(
          pitch.querySelectorAll('.dp-lineup-node, .dp-lineup-name-wrap')
        ).filter(target => target !== chip && !chip.contains(target));
        fitTeamChip(chip, collisionEls, { preferShrink: isSmallLayout });
      });
    });
  });
}

function fitLineupNamePills(root) {
  const scope = root || document;
  const labels = Array.from(scope.querySelectorAll('.dp-lineup-name'))
    .filter(nameEl => !!(nameEl && nameEl.firstChild));

  // 1) 모든 라벨을 CSS 기본 상태로 되돌린 뒤 현재 텍스트 폭에 맞춰 pill width를 잠근다.
  labels.forEach(nameEl => {
    resetLineupNameWrapOffset(nameEl);
    nameEl.style.width = '';
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;
    fitLineupNameSelf(nameEl);
  });

  labels.forEach(nameEl => {
    fitLineupNameWithinPitchBounds(nameEl);
  });

  // 2) 공통 충돌 보정: 좁히기 가능한 쪽부터 width를 줄이고, 더 이상 안 되면 font-size를 줄인다.
  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const leftEl = labels[i];
        const rightEl = labels[j];
        if (!canMeasureTextElement(leftEl) || !canMeasureTextElement(rightEl)) continue;
        if (!wrapsOverlap(leftEl, rightEl)) continue;

        const primaryEl = chooseWrapToShrink(leftEl, rightEl);
        const secondaryEl = primaryEl === leftEl ? rightEl : leftEl;

        if ((primaryEl && tightenLineupNameWidth(primaryEl))
          || (secondaryEl && tightenLineupNameWidth(secondaryEl))) {
          changed = true;
          break;
        }

        if ((primaryEl && shrinkTextElement(primaryEl, LINEUP_NAME_MIN_FONT_PX))
          || (secondaryEl && shrinkTextElement(secondaryEl, LINEUP_NAME_MIN_FONT_PX))) {
          if (primaryEl) lockLineupNameWidth(primaryEl);
          if (secondaryEl) lockLineupNameWidth(secondaryEl);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }

    if (!changed) break;
    pass += 1;
  }

  // 3) 큰 캠 축소 상태에서만 남는 충돌은 별도 패스로 한 번 더 정리한다.
  fitResidualBigLineupNameCollisions(labels);
  fitBigLineupNameAgainstOtherLabels(labels);
  fitBigLineupNameAgainstTeamChips(labels);
  fitBigLineupNameAgainstPriorityBadges(labels);
  fitBigLineupNameAgainstOpposingBadges(labels);
  labels.forEach(nameEl => {
    fitLineupNameWithinPitchBounds(nameEl);
  });
  fitResidualBigLineupNameCollisions(labels);
  fitBigLineupNameAgainstOtherLabels(labels);
  fitBigLineupNameAgainstTeamChips(labels);
  fitBigLineupNameAgainstPriorityBadges(labels);
  fitBigLineupNameAgainstOpposingBadges(labels);
  // 라벨이 다른 선수의 원 자체와 겹치는 경우 (기존 패스가 감지 못하는 gap 보완)
  fitLineupNamesAgainstNodeCircles(labels);
  labels.forEach(nameEl => { fitLineupNameWithinPitchBounds(nameEl); });
  fitBigLineupTeamChips(scope);
}

// 라인업 리사이즈/설정 변경 후 외부에서 다시 fit을 호출할 수 있도록 노출
window.fitLineupNamePills = fitLineupNamePills;
window.fitBenchFooterNames = fitBenchFooterNames;

document.addEventListener('page:activated', () => {
  requestAnimationFrame(() => {
    document.querySelectorAll('.page.active [data-dp-role="lineup"]').forEach(panel => fitLineupNamePills(panel));
    fitBenchFooterNames(document.querySelector('.page.active #benchPanel') || document.getElementById('benchPanel'));
    balanceBenchInjuryPanelHeights();
  });
});

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
  lineupPanelState.lastFixture = fixtureData;
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
    setPanelTitle(benchPanel, '교체 명단');
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
}

function buildFormationOptionsHtml(selected) {
  return Object.keys(getTacticsFormationMap())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(formation => `<option value="${dpEscape(formation)}"${formation === selected ? ' selected' : ''}>${dpEscape(formation)}</option>`)
    .join('');
}

function getPrefillName(person) {
  return person?.name || person?.playerName || person?.nameKoLong || person?.playerNameKoLong || '';
}

function isQuestionableInjuryReason(reason, type) {
  return type === 'Questionable' || String(reason || '').trim() === 'Questionable';
}

function getInjuryReasonDisplayText(reason, type) {
  const raw = String(reason || '').trim();
  if (isQuestionableInjuryReason(reason, type)) {
    if (!raw || raw === 'Questionable') return '출전 여부 미정';
    const translated = typeof getInjuryReasonKo === 'function' ? getInjuryReasonKo(raw) : raw;
    return `출전 여부 미정 - ${translated}`;
  }
  if (!raw) return '';
  return typeof getInjuryReasonKo === 'function' ? getInjuryReasonKo(raw) : raw;
}

function getManualInjuryReasonCatalog() {
  const keys = typeof INJURY_REASON_KO !== 'undefined' && INJURY_REASON_KO
    ? Object.keys(INJURY_REASON_KO)
    : [];
  const regular = [];
  const suspensions = [];
  const seenLabels = new Set();

  Array.from(new Set(keys.filter(Boolean))).forEach(reason => {
    const label = getInjuryReasonDisplayText(reason);
    if (!label || seenLabels.has(label)) return;
    seenLabels.add(label);
    if (typeof isSuspension === 'function' && isSuspension(reason)) suspensions.push(reason);
    else regular.push(reason);
  });

  const sortByLabel = (a, b) => getInjuryReasonDisplayText(a).localeCompare(getInjuryReasonDisplayText(b), 'ko');
  regular.sort(sortByLabel);
  suspensions.sort(sortByLabel);
  return { regular, suspensions };
}

function buildInjuryReasonOptionHtml(reason, selectedReason) {
  return `<option value="${dpEscape(reason)}"${reason === selectedReason ? ' selected' : ''}>${dpEscape(getInjuryReasonDisplayText(reason))}</option>`;
}

function buildInjuryReasonOptionsHtml(reason, type) {
  const selectedReason = isQuestionableInjuryReason(reason, type) ? 'Questionable' : String(reason || '').trim();
  const { regular, suspensions } = getManualInjuryReasonCatalog();
  const knownReasons = new Set(['Questionable', ...regular, ...suspensions]);
  const customOption = selectedReason && !knownReasons.has(selectedReason)
    ? buildInjuryReasonOptionHtml(selectedReason, selectedReason)
    : '';

  return `<option value="">사유 선택</option>
    <optgroup label="상태">
      <option value="Questionable"${selectedReason === 'Questionable' ? ' selected' : ''}>출전 여부 미정</option>
      ${customOption}
    </optgroup>
    <optgroup label="부상 / 결장">
      ${regular.map(item => buildInjuryReasonOptionHtml(item, selectedReason)).join('')}
    </optgroup>
    <optgroup label="징계 / 카드">
      ${suspensions.map(item => buildInjuryReasonOptionHtml(item, selectedReason)).join('')}
    </optgroup>`;
}

// ─── 그리드 모드 (API 라인업 보존, 포메이션 + 선수별 grid만 override) ───────
// 모달 오픈 시 호출 — gridState 초기화. 저장된 gridByPlayerId override 있으면 복원.
function initGridState(side) {
  const fixtureId = getActiveFixtureId();
  const apiStartXi = lineupPanelState.lastFixture?.[`${side}Lineup`]?.startXi || [];
  const players = clonePlayers(apiStartXi);
  const playersById = Object.fromEntries(players.map(p => [String(p.playerId), p]));

  const stored = getManualSideData(fixtureId, side)?.lineup;
  // 포메이션 우선순위: 저장된 수동값 > API 응답 > default(4-3-3)
  const apiLineup = lineupPanelState.lastFixture?.[`${side}Lineup`];
  let formation = stored?.formation || apiLineup?.formation;
  if (!formation || !getTacticsFormationMap()[formation]) formation = DETAIL_DEFAULT_FORMATION;

  const slotsCount = (getTacticsFormationMap()[formation] || []).length || 11;
  const slotPlayerIds = new Array(slotsCount).fill(null);
  const gridValues = buildManualGridValues(formation);

  // 1) 저장된 수동 grid 매핑 우선
  if (stored?.gridByPlayerId) {
    Object.entries(stored.gridByPlayerId).forEach(([pid, grid]) => {
      const idx = gridValues.indexOf(grid);
      if (idx >= 0 && !slotPlayerIds[idx] && playersById[String(pid)]) {
        slotPlayerIds[idx] = String(pid);
      }
    });
  } else {
    // 2) API 응답에 grid가 있으면 그걸로 초기 배치 (포메이션이 같은 경우만 의미 있음)
    players.forEach(p => {
      if (!p.grid) return;
      const idx = gridValues.indexOf(p.grid);
      const pidStr = String(p.playerId);
      if (idx >= 0 && !slotPlayerIds[idx]) slotPlayerIds[idx] = pidStr;
    });
  }

  // 3) 매핑 안 된 선수는 빈 슬롯에 API 순서대로 삽입
  let cursor = 0;
  players.forEach(p => {
    const pidStr = String(p.playerId);
    if (slotPlayerIds.includes(pidStr)) return;
    while (cursor < slotsCount && slotPlayerIds[cursor]) cursor += 1;
    if (cursor < slotsCount) slotPlayerIds[cursor] = pidStr;
  });

  lineupPanelState.gridState = { side, formation, slotPlayerIds, players: playersById };
}

function buildGridRowHtml(pidStr, slotIndex) {
  const { formation, players } = lineupPanelState.gridState;
  const labels = getFormationSlotLabels(formation);
  const p = pidStr ? players[pidStr] : null;
  const photoStyle = p?.photoUrl ? ` style="background-image:url('${dpEscape(p.photoUrl)}')"` : '';
  const photoCls = p?.photoUrl ? '' : ' dp-grid-photo-empty';
  const num = p ? dpEscape(p.number ?? '') : '';
  const name = p ? dpEscape(pickName(p, 'lineup') || p.name || '') : '(빈 슬롯)';
  const emptyCls = p ? '' : ' dp-grid-empty';
  return `<div class="dp-grid-row" data-slot-index="${slotIndex}" draggable="true">
    <span class="dp-grid-handle" aria-hidden="true">⠿</span>
    <span class="dp-grid-slot-label">${dpEscape(labels[slotIndex] || `${slotIndex + 1}`)}</span>
    <span class="dp-grid-photo${photoCls}"${photoStyle}></span>
    <span class="dp-grid-num">${num}</span>
    <span class="dp-grid-name${emptyCls}">${name}</span>
  </div>`;
}

function buildLineupGridFormHtml() {
  const { formation, slotPlayerIds } = lineupPanelState.gridState;
  const rows = slotPlayerIds.map((pid, idx) => buildGridRowHtml(pid, idx)).join('');
  return `<div class="dp-manual-help">포메이션이 없으면 라인업이 리스트로만 표시되며, 불러온 포메이션 데이터가 잘못된 경우에도 여기서 수정할 수 있습니다. 포메이션을 선택하면 슬롯이 표시되고 선수가 자동 배치됩니다. 핸들(⠿)을 드래그해서 슬롯 위치를 서로 바꾸세요. 저장하면 라인업과 전술판에 같이 반영됩니다.</div>
    <div class="dp-form-stack">
      <label class="dp-field">
        <span class="dp-field-label">포메이션</span>
        <select class="dp-select" name="manual-formation" id="manualGridFormation">
          ${buildFormationOptionsHtml(formation)}
        </select>
      </label>
      <div class="dp-grid-list" id="manualGridList">${rows}</div>
    </div>`;
}

function rerenderGridList() {
  const list = document.getElementById('manualGridList');
  if (!list || !lineupPanelState.gridState) return;
  const { slotPlayerIds } = lineupPanelState.gridState;
  list.innerHTML = slotPlayerIds.map((pid, idx) => buildGridRowHtml(pid, idx)).join('');
  bindLineupGridDragDrop();
}

function bindLineupGridDragDrop() {
  const list = document.getElementById('manualGridList');
  if (!list) return;
  list.querySelectorAll('.dp-grid-row').forEach(row => {
    row.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', row.dataset.slotIndex);
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      list.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    });
    row.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', event => {
      event.preventDefault();
      row.classList.remove('is-drop-target');
      const sourceIdx = Number(event.dataTransfer.getData('text/plain'));
      const targetIdx = Number(row.dataset.slotIndex);
      if (Number.isNaN(sourceIdx) || Number.isNaN(targetIdx) || sourceIdx === targetIdx) return;
      const ids = lineupPanelState.gridState?.slotPlayerIds;
      if (!ids) return;
      [ids[sourceIdx], ids[targetIdx]] = [ids[targetIdx], ids[sourceIdx]];
      rerenderGridList();
    });
  });
}

function extractGridOverrideFromState() {
  if (!lineupPanelState.gridState) return null;
  const { formation, slotPlayerIds } = lineupPanelState.gridState;
  const grids = buildManualGridValues(formation);
  const gridByPlayerId = {};
  slotPlayerIds.forEach((pid, idx) => {
    if (!pid || !grids[idx]) return;
    gridByPlayerId[pid] = grids[idx];
  });
  return Object.keys(gridByPlayerId).length ? { formation, gridByPlayerId } : null;
}

function buildLineupManualFormHtml(lineup) {
  const formation = hasValidFormation(lineup) ? lineup.formation : DETAIL_DEFAULT_FORMATION;
  const players = getOrderedLineupPlayers(lineup?.startXi || []);
  const labels = getFormationSlotLabels(formation);

  return `<div class="dp-manual-help">포메이션과 선발 11명을 입력하면 /detail 라인업과 전술판에 함께 반영됩니다.</div>
    <div class="dp-form-stack">
      <label class="dp-field">
        <span class="dp-field-label">포메이션</span>
        <select class="dp-select" name="manual-formation" id="manualLineupFormation">
          ${buildFormationOptionsHtml(formation)}
        </select>
      </label>
      <div class="dp-manual-grid">
        ${Array.from({ length: 11 }, (_, index) => `<div class="dp-manual-row">
          <div class="dp-slot-label" data-slot-index="${index}">${dpEscape(labels[index] || `${index + 1}`)}</div>
          <input class="dp-input" name="lineup-number-${index}" value="${dpEscape(players[index]?.number ?? '')}" placeholder="번호" />
          <input class="dp-input" name="lineup-name-${index}" value="${dpEscape(getPrefillName(players[index]))}" placeholder="선수 이름" />
        </div>`).join('')}
      </div>
    </div>`;
}

function buildBenchManualFormHtml(players) {
  const list = clonePlayers(players || []);
  return `<div class="dp-manual-help">교체 명단을 입력하면 /detail 교체 명단에 즉시 반영됩니다.</div>
    <div class="dp-form-stack">
      <div class="dp-manual-grid">
        ${Array.from({ length: DETAIL_BENCH_ROWS }, (_, index) => `<div class="dp-manual-row">
          <div class="dp-slot-label">${index + 1}</div>
          <input class="dp-input" name="bench-number-${index}" value="${dpEscape(list[index]?.number ?? '')}" placeholder="번호" />
          <input class="dp-input" name="bench-name-${index}" value="${dpEscape(getPrefillName(list[index]))}" placeholder="선수 이름" />
        </div>`).join('')}
      </div>
    </div>`;
}

function buildInjuryManualFormHtml(injuries) {
  const list = Array.isArray(injuries) ? injuries : [];
  const rowCount = Math.max(DETAIL_INJURY_ROWS, list.length + 2);
  return `<div class="dp-manual-help">기존 결장자를 유지한 채 추가할 수 있습니다. 사유를 선택하면 저장 후 아이콘도 자동으로 연동됩니다.</div>
    <div class="dp-form-stack">
      <div class="dp-manual-grid">
        ${Array.from({ length: rowCount }, (_, index) => {
          const current = list[index] || {};
          return `<div class="dp-manual-row is-injury">
            <div class="dp-slot-label">${index + 1}</div>
            <input class="dp-input" name="injury-number-${index}" value="${dpEscape(current.number ?? '')}" placeholder="번호" />
            <input class="dp-input" name="injury-name-${index}" value="${dpEscape(getPrefillName(current))}" placeholder="선수 이름" />
            <select class="dp-select" name="injury-reason-${index}">
              ${buildInjuryReasonOptionsHtml(current.reason, current.type)}
            </select>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function getManualKindLabel(kind) {
  if (kind === 'lineup') return '선발 라인업';
  if (kind === 'bench') return '교체 명단';
  return '부상자 명단';
}

function hasManualOverrideForKind(fixtureId, side, kind) {
  const sideData = getManualSideData(fixtureId, side);
  if (!sideData) return false;
  if (kind === 'lineup') return !!sideData.lineup;
  if (kind === 'bench') return !!(sideData.bench && sideData.bench.length);
  if (kind === 'injury') return !!(sideData.injuries && sideData.injuries.length);
  if (kind === 'coach') return !!sideData.coachName;
  return false;
}

/**
 * 수동 입력 모달의 현재 종류(lineup / bench / injury)에 맞는 폼을 렌더한다.
 * lineup은 다시 grid 모드와 풀폼 모드로 갈라지고, bench/injury는 각 전용 full form을 사용한다.
 */
function renderManualPanelForm(kind, side) {
  const fixtureId = getActiveFixtureId();
  const effectiveData = buildEffectiveFixtureData(lineupPanelState.lastFixture);
  const content = document.getElementById('manualPanelContent');
  const meta = document.getElementById('manualPanelMeta');
  const resetBtn = document.getElementById('manualPanelReset');
  const panelTitle = document.getElementById('manualPanelTitle');

  if (!content || !meta || !resetBtn || !panelTitle) return;

  panelTitle.textContent = `${DETAIL_SIDE_TITLES[side]} ${getManualKindLabel(kind)}`;
  meta.textContent = `fixtureId ${fixtureId} · ${getTeamName(effectiveData, side)}`;
  resetBtn.hidden = !hasManualOverrideForKind(fixtureId, side, kind);

  // 1) 선발 라인업은 grid-only override와 full form override를 구분해 렌더한다.
  if (kind === 'lineup') {
    if (isGridMode(lineupPanelState.lastFixture, side)) {
      // 그리드 모드 — API 라인업이 있고 포메이션만 없는 경우
      initGridState(side);
      content.innerHTML = buildLineupGridFormHtml();
      requestAnimationFrame(bindLineupGridDragDrop);
    } else {
      // 풀폼 모드 — API 라인업 자체가 없는 경우 (또는 startXi 비어있음)
      lineupPanelState.gridState = null;
      content.innerHTML = buildLineupManualFormHtml(effectiveData?.[`${side}Lineup`]);
    }
  } else if (kind === 'bench') {
    // 2) 교체 명단은 번호/이름 full form.
    content.innerHTML = buildBenchManualFormHtml(effectiveData?.[`${side}Lineup`]?.substitutes);
  } else {
    // 3) 부상자 명단은 번호/이름/사유 full form.
    content.innerHTML = buildInjuryManualFormHtml(effectiveData?.[`${side}Injuries`]);
  }
}

/**
 * 수동 입력 모달 오픈.
 * 1) 활성 fixtureId 없으면 alert 후 종료 — 수동 데이터는 fixture별로 묶이므로 fixture 필수.
 * 2) 모달 상태 저장 + renderManualPanelForm으로 kind/side 맞는 폼 렌더.
 * 3) 백드롭에 .open 추가 → CSS transition으로 표시.
 */
function openManualPanel(kind, side) {
  const fixtureId = getActiveFixtureId();
  if (!fixtureId || !lineupPanelState.lastFixture) {
    alert('먼저 경기 데이터를 불러와야 합니다.');
    return;
  }

  lineupPanelState.manualModal = { kind, side, fixtureId };
  renderManualPanelForm(kind, side);

  const backdrop = document.getElementById('manualPanelBackdrop');
  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
  }
}

/** 수동 입력 모달 닫기. 모달 상태 + 그리드 편집 상태 모두 비우고 백드롭의 .open 제거. */
function closeManualPanel() {
  lineupPanelState.manualModal = null;
  lineupPanelState.gridState = null;
  const backdrop = document.getElementById('manualPanelBackdrop');
  if (backdrop) {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

/** 백드롭 .open 클래스로 모달 오픈 여부 판정. ESC 핸들러 가드용. */
function isManualPanelOpen() {
  const backdrop = document.getElementById('manualPanelBackdrop');
  return !!(backdrop && backdrop.classList.contains('open'));
}

function syncManualLineupSlotLabels(formation) {
  const labels = getFormationSlotLabels(formation);
  document.querySelectorAll('#manualPanelContent .dp-slot-label[data-slot-index]').forEach(el => {
    const index = Number(el.dataset.slotIndex);
    el.textContent = labels[index] || `${index + 1}`;
  });
}

function extractLineupOverrideFromForm(form) {
  const formation = getInputValue(form.querySelector('[name="manual-formation"]')?.value) || DETAIL_DEFAULT_FORMATION;
  const labels = getFormationSlotLabels(formation);
  const grids = buildManualGridValues(formation);
  const players = [];

  for (let index = 0; index < 11; index += 1) {
    const name = getInputValue(form.elements[`lineup-name-${index}`]?.value);
    const number = getInputValue(form.elements[`lineup-number-${index}`]?.value);
    if (!name) continue;

    players.push({
      playerId: null,
      name,
      nameKoLong: name,
      photoUrl: '',
      number: number || '',
      pos: inferBasePos(labels[index]),
      grid: grids[index] || null,
      _manual: true,
    });
  }

  return players.length ? { formation, startXi: players } : null;
}

function extractBenchOverrideFromForm(form) {
  const bench = [];
  for (let index = 0; index < DETAIL_BENCH_ROWS; index += 1) {
    const name = getInputValue(form.elements[`bench-name-${index}`]?.value);
    const number = getInputValue(form.elements[`bench-number-${index}`]?.value);
    if (!name) continue;
    bench.push({
      playerId: null,
      name,
      nameKoLong: name,
      photoUrl: '',
      number: number || '',
      pos: '',
      grid: null,
      _manual: true,
    });
  }
  return bench;
}

function extractInjuryOverrideFromForm(form, side) {
  const injuries = [];
  const teamName = getTeamName(lineupPanelState.lastFixture, side);
  const rowCount = form.querySelectorAll('.dp-manual-row.is-injury').length;

  for (let index = 0; index < rowCount; index += 1) {
    const name = getInputValue(form.elements[`injury-name-${index}`]?.value);
    const number = getInputValue(form.elements[`injury-number-${index}`]?.value);
    const reason = getInputValue(form.elements[`injury-reason-${index}`]?.value);
    const type = isQuestionableInjuryReason(reason) ? 'Questionable' : 'Missing Fixture';
    if (!name) continue;

    injuries.push({
      playerId: null,
      playerName: name,
      playerNameKoLong: name,
      playerPhotoUrl: '',
      number: number || '',
      type,
      reason,
      teamId: null,
      teamName,
      teamLogo: '',
    });
  }

  return injuries;
}

/**
 * 현재 열린 수동 입력 모달의 값을 fixture별 manual store에 저장한다.
 * 저장 후에는 상세 패널 3종과 전술판을 같은 override 기준으로 즉시 다시 렌더한다.
 */
function saveManualPanel() {
  const modalState = lineupPanelState.manualModal;
  const form = document.getElementById('manualPanelForm');
  if (!modalState || !form) return;

  const { kind, side, fixtureId } = modalState;

  // 1) kind별 추출 함수를 통해 sideData를 갱신한다.
  updateManualEntry(fixtureId, side, sideData => {
    if (kind === 'lineup') {
      // 그리드 모드 vs 풀폼 모드 분기. gridState가 살아있으면 그리드, 아니면 풀폼.
      const lineup = lineupPanelState.gridState
        ? extractGridOverrideFromState()
        : extractLineupOverrideFromForm(form);
      if (lineup) sideData.lineup = lineup;
      else delete sideData.lineup;
    }
    if (kind === 'bench') {
      const bench = extractBenchOverrideFromForm(form);
      if (bench.length) sideData.bench = bench;
      else delete sideData.bench;
    }
    if (kind === 'injury') {
      const injuries = extractInjuryOverrideFromForm(form, side);
      if (injuries.length) sideData.injuries = injuries;
      else delete sideData.injuries;
    }
    return sideData;
  });

  // 2) 저장이 끝나면 모달을 닫고, 3) 같은 fixture를 기준으로 패널을 즉시 다시 그린다.
  closeManualPanel();
  rerenderLineupPanels();
}

function resetManualPanelKind() {
  const modalState = lineupPanelState.manualModal;
  if (!modalState) return;
  deleteManualKind(modalState.fixtureId, modalState.side, modalState.kind);
  closeManualPanel();
  rerenderLineupPanels();
}

function finishCoachInlineEdit(hostEl, inputEl, side, saveValue) {
  const fixtureId = getActiveFixtureId();
  if (hostEl) hostEl.classList.remove('dp-coach-editing');
  if (!hostEl || !side || !fixtureId) {
    rerenderLineupPanels();
    return;
  }

  if (saveValue) {
    updateManualEntry(fixtureId, side, sideData => {
      const trimmed = normalizeCoachName(inputEl.value);
      if (trimmed) sideData.coachName = trimmed;
      else delete sideData.coachName;
      return sideData;
    });
  }

  rerenderLineupPanels();
}

/** API에 감독명이 없을 때만 허용되는 벤치 하단 인라인 감독 편집 진입점. */
function startCoachInlineEdit(hostEl) {
  if (!hostEl || hostEl.dataset.apiMissing !== 'true') return;
  if (hostEl.querySelector('input')) return;

  const side = hostEl.dataset.coachSide;
  const fixtureId = getActiveFixtureId();
  if (!side || !fixtureId) return;

  const current = normalizeCoachName(getManualSideData(fixtureId, side)?.coachName);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dp-coach-inline-input';
  input.value = current;
  input.placeholder = '감독 이름';

  hostEl.classList.add('dp-coach-editing');
  hostEl.textContent = '';
  hostEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = saveValue => {
    if (done) return;
    done = true;
    finishCoachInlineEdit(hostEl, input, side, saveValue);
  };

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });

  input.addEventListener('blur', () => finish(true));
}

function finishRefereeInlineEdit(hostEl, inputEl, saveValue) {
  const fixtureId = getActiveFixtureId();
  if (hostEl) hostEl.classList.remove('dp-referee-editing');
  if (!hostEl || !fixtureId) {
    rerenderLineupPanels();
    return;
  }
  if (saveValue) setManualReferee(fixtureId, inputEl.value);
  rerenderLineupPanels();
}

/** API에 주심명이 없을 때만 허용되는 벤치 하단 인라인 주심 편집 진입점. */
function startRefereeInlineEdit(hostEl) {
  if (!hostEl || hostEl.dataset.apiMissing !== 'true') return;
  if (hostEl.querySelector('input')) return;

  const fixtureId = getActiveFixtureId();
  if (!fixtureId) return;

  const current = String(getManualEntry(fixtureId)?.refereeName || '').trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dp-coach-inline-input';   // 동일 스타일 재사용
  input.value = current;
  input.placeholder = '주심 이름';

  hostEl.classList.add('dp-referee-editing');
  hostEl.textContent = '';
  hostEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = saveValue => {
    if (done) return;
    done = true;
    finishRefereeInlineEdit(hostEl, input, saveValue);
  };

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); return; }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

document.addEventListener('click', event => {
  const manualBtn = event.target.closest('.dp-side-edit-btn');
  if (manualBtn?.dataset.manual && manualBtn?.dataset.side) {
    openManualPanel(manualBtn.dataset.manual, manualBtn.dataset.side);
    return;
  }

  if (event.target.id === 'manualPanelClose' || event.target.id === 'manualPanelCancel') {
    closeManualPanel();
    return;
  }
  if (event.target.id === 'manualPanelSave') {
    saveManualPanel();
    return;
  }
  if (event.target.id === 'manualPanelReset') {
    resetManualPanelKind();
    return;
  }

  const backdrop = document.getElementById('manualPanelBackdrop');
  if (backdrop && event.target === backdrop) closeManualPanel();
});

document.addEventListener('change', event => {
  if (event.target?.id === 'manualLineupFormation') {
    syncManualLineupSlotLabels(event.target.value);
  }
  if (event.target?.id === 'manualGridFormation' && lineupPanelState.gridState) {
    // 그리드 모드 포메이션 변경: 슬롯 라벨만 갱신, 선수 순서는 그대로 유지
    lineupPanelState.gridState.formation = event.target.value;
    rerenderGridList();
  }
});

document.addEventListener('dblclick', event => {
  const coachEl = event.target.closest('.dp-coach-name');
  if (coachEl && coachEl.dataset.apiMissing === 'true') {
    startCoachInlineEdit(coachEl);
    return;
  }
  const refereeEl = event.target.closest('.dp-referee-name');
  if (refereeEl && refereeEl.dataset.apiMissing === 'true') {
    startRefereeInlineEdit(refereeEl);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && isManualPanelOpen()) {
    event.preventDefault();
    closeManualPanel();
  }
});

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
