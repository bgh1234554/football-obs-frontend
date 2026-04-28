// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [상세 패널 / 라인업] 교체 명단·부상자 명단·선발 라인업 렌더와 수동 입력, 전술판 동기화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DETAIL_MANUAL_STORAGE_KEY = 'obs.detail.manual.v1';
const DETAIL_MANUAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DETAIL_DEFAULT_FORMATION = '4-3-3';
const DETAIL_BENCH_ROWS = 18;
const DETAIL_INJURY_ROWS = 12;
const DETAIL_SIDE_TITLES = { home: '홈', away: '원정' };

const lineupPanelState = {
  lastFixture: null,
  manualModal: null,
  // 그리드 모드 모달 편집 중 상태 (열려있을 때만 non-null):
  //   { side, formation, slotPlayerIds: [11 players], players: { [pid]: playerInfo } }
  gridState: null,
};

function dpEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function getTacticsFormationMap() {
  return typeof TACTICS_FM !== 'undefined' && TACTICS_FM ? TACTICS_FM : {};
}

function getTacticsLabelMap() {
  return typeof TACTICS_LABELS !== 'undefined' && TACTICS_LABELS ? TACTICS_LABELS : {};
}

function clonePlayers(players) {
  return Array.isArray(players) ? players.filter(Boolean).map(player => ({ ...player })) : [];
}

function cloneInjuries(injuries) {
  return Array.isArray(injuries) ? injuries.filter(Boolean).map(injury => ({ ...injury })) : [];
}

function cloneLineup(lineup) {
  if (!lineup) return lineup;
  return {
    ...lineup,
    startXi: clonePlayers(lineup.startXi),
    substitutes: clonePlayers(lineup.substitutes),
    coach: lineup.coach ? { ...lineup.coach } : lineup.coach,
  };
}

function getFixtureIdFromData(data) {
  return String(data?.matchInfo?.fixtureId ?? '').trim();
}

function getActiveFixtureId() {
  return getFixtureIdFromData(lineupPanelState.lastFixture);
}

function normalizeCoachName(name) {
  const value = String(name ?? '').trim();
  if (!value) return '';
  if (/^(null|undefined|-)$/i.test(value)) return '';
  return value;
}

// ─── 수동 입력 저장소 (fixture 단위) ──────────────────────────────────────
// localStorage에 fixtureId 기준 override를 보관하고, API 응답에 얹어서 실제 렌더 데이터로 사용.
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

function writeManualStore(store) {
  try {
    localStorage.setItem(DETAIL_MANUAL_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

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

function getManualEntry(fixtureId) {
  if (!fixtureId) return null;
  return readManualStore()[fixtureId] || null;
}

function getManualSideData(fixtureId, side) {
  return getManualEntry(fixtureId)?.[side] || null;
}

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
  if (!entry) return data;

  // 2) 원본 객체를 직접 훼손하지 않도록 라인업/부상 배열을 먼저 복제한다.
  const next = {
    ...data,
    homeLineup: cloneLineup(data.homeLineup),
    awayLineup: cloneLineup(data.awayLineup),
    homeInjuries: cloneInjuries(data.homeInjuries),
    awayInjuries: cloneInjuries(data.awayInjuries),
  };

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

  return next;
}

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

function parseGridValue(value) {
  const match = String(value || '').match(/^(\d+):(\d+)$/);
  if (!match) return null;
  return { line: Number(match[1]), col: Number(match[2]) };
}

function compareParsedGrid(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  if (left.line !== right.line) return left.line - right.line;
  return right.col - left.col;
}

function getOrderedLineupPlayers(players) {
  return clonePlayers(players).sort((a, b) => {
    const left = parseGridValue(a.grid);
    const right = parseGridValue(b.grid);
    return compareParsedGrid(left, right);
  });
}

function hasStartXi(lineup) {
  return Array.isArray(lineup?.startXi) && lineup.startXi.length > 0;
}

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

function getFormationSlotLabels(formation) {
  const labels = getTacticsLabelMap()[formation];
  if (Array.isArray(labels) && labels.length) return labels;
  return Array.from({ length: 11 }, (_, index) => `${index + 1}`);
}

function inferBasePos(label) {
  const upper = String(label || '').toUpperCase();
  if (upper.includes('GK')) return 'G';
  if (upper.includes('CB') || upper.includes('LB') || upper.includes('RB') || upper.includes('WB')) return 'D';
  if (upper.includes('DM') || upper.includes('CM') || upper.includes('AM') || upper.includes('LM') || upper.includes('RM') || upper.includes('M')) return 'M';
  return 'F';
}

function getFormationSlotsByGridOrder(formation) {
  return (getTacticsFormationMap()[formation] || [])
    .map((coord, originalIndex) => ({ coord: { ...coord }, originalIndex }))
    .sort((left, right) => {
      if (left.coord.x !== right.coord.x) return left.coord.x - right.coord.x;
      return left.coord.y - right.coord.y;
    });
}

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
  return slots.map((slot, index) => {
    const grid = parseGridValue(`${index + 1}:1`);
    void grid;
    return null;
  }).map((_, index) => {
    const slot = slots[index];
    const line = slots
      .filter(other => other.coord.x < slot.coord.x)
      .reduce((count, other) => count + (other.coord.x !== slot.coord.x ? 0 : 0), 0);
    void line;
    return '';
  });
}

function buildManualGridValues(formation) {
  const slots = getFormationSlotsByGridOrder(formation);
  if (!slots.length) return Array.from({ length: 11 }, (_, index) => index === 0 ? '1:1' : null);

  const uniqueLines = [...new Set(slots.map(slot => slot.coord.x))].sort((a, b) => a - b);
  return slots.map(slot => {
    const lineIndex = uniqueLines.indexOf(slot.coord.x) + 1;
    const rowSlots = slots.filter(candidate => candidate.coord.x === slot.coord.x);
    const rowIndex = rowSlots.findIndex(candidate => candidate.originalIndex === slot.originalIndex) + 1;
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
 *   (이전엔 matchInfo.homePrimaryColor를 우선해서 테마 변경이 라인업에 반영 안 됐음)
 */
function getLineupSideColors(data, side) {
  if (side === 'home') {
    return {
      bg: normalizeHexColor(state?.colors?.homeBg, '#2563eb'),
      text: normalizeHexColor(state?.colors?.homeText, '#ffffff'),
    };
  }
  return {
    bg: normalizeHexColor(state?.colors?.awayBg, '#ef4444'),
    text: normalizeHexColor(state?.colors?.awayText, '#ffffff'),
  };
}

function buildEmptyHtml(message) {
  return `<div class="dp-empty">${dpEscape(message)}</div>`;
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

function setSideName(panel, dataAttrPrefix, side, teamName) {
  const nameEl = panel?.querySelector(`[data-${dataAttrPrefix}-side="${side}"] .dp-side-name`);
  if (!nameEl) return;
  nameEl.textContent = teamName;
  nameEl.title = teamName;
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

function applyBenchCountClass(listEl) {
  if (!listEl) return;
  listEl.classList.remove('dp-count-md');
}

function buildBenchListHtml(players, lineupExists) {
  if (!players || players.length === 0) {
    return buildEmptyHtml(lineupExists ? '후보 없음' : '벤치 정보 미제공');
  }

  return players.map(player => {
    const title = player.nameKoLong && player.nameKoLong !== player.name
      ? ` title="${dpEscape(player.nameKoLong)}"`
      : '';
    return `<div class="dp-item" data-player-id="${dpEscape(player.playerId)}">
      <span class="dp-item-num">${dpEscape(player.number ?? '')}</span>
      <span class="dp-item-name"${title}>${dpEscape(pickName(player, 'roster'))}</span>
    </div>`;
  }).join('');
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

    return `<div class="dp-item" data-player-id="${dpEscape(injury.playerId)}">
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
function mapFormationSlotToPitchPosition(slot, side) {
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
  if (depth === 0) top -= isHome ? 3.5 : -0.5;
  const yLocal = rawY;
  // 가로는 5~95% (90% 폭)
  const left = 5 + (yLocal / 100) * 90;
  return { left, top };
}

function getActiveLineupNodeMode() {
  if (typeof getLineupNodeMode === 'function') return getLineupNodeMode();
  return 'number';
}

// 두 패스 렌더링 — 원/아바타와 이름 라벨을 분리해 HTML 두 덩어리로 반환.
// 호출 측에서 모든 원을 먼저, 모든 이름을 나중에 DOM 삽입 → DOM 순서상 이름이 항상 위에 그려짐.
// 결과: 홈/원정 양쪽 모두 이름이 인접 팀 얼굴 위로 나옴 (이전엔 home은 가려지고 away는 안 가림).
function buildVerticalPitchNodesHtml(lineup, effectiveData, side) {
  const nodeMode = getActiveLineupNodeMode();
  const colors = getLineupSideColors(effectiveData, side);
  const circles = [];
  const names = [];

  getFormationAssignments(lineup).forEach(({ slot, player }) => {
    const name = pickName(player, 'lineup') || player.name || '';
    const title = player.nameKoLong && player.nameKoLong !== player.name
      ? ` title="${dpEscape(player.nameKoLong)}"`
      : '';
    const position = mapFormationSlotToPitchPosition(slot, side);
    const colorVars = `--dp-node-bg:${colors.bg};--dp-node-text:${colors.text};--dp-node-glow:${withAlpha(colors.bg, '44')};--dp-node-border:${withAlpha(colors.text, '66')};`;
    const posStyle = `left:${position.left}%;top:${position.top}%;`;

    const badge = nodeMode === 'photo' && player.photoUrl
      ? `<span class="dp-lineup-avatar" style="background-image:url('${dpEscape(player.photoUrl)}')"></span>`
      : `<span class="dp-lineup-circle">${dpEscape(player.number ?? '')}</span>`;

    circles.push(`<div class="dp-lineup-node is-${side}" style="${posStyle}${colorVars}">${badge}</div>`);
    names.push(`<div class="dp-lineup-name-wrap is-${side}" style="${posStyle}"><span class="dp-lineup-name"${title}>${dpEscape(name)}</span></div>`);
  });

  return { circles: circles.join(''), names: names.join('') };
}

function buildLineupPitchTeamChipHtml(side, effectiveData, rawData) {
  const lineup = effectiveData?.[`${side}Lineup`];
  const colors = getLineupSideColors(effectiveData, side);
  return `<div class="dp-lineup-team-chip is-${side}">
    <div class="dp-lineup-team-main" style="--dp-team-accent:${colors.bg};--dp-team-text:${colors.text};">
      <span class="dp-lineup-team-name" title="${dpEscape(getTeamName(effectiveData, side))}">${dpEscape(getTeamName(effectiveData, side))}</span>
      ${lineup?.formation ? `<span class="dp-lineup-team-fm">${dpEscape(lineup.formation)}</span>` : ''}
    </div>
    ${shouldShowLineupManualButton(rawData, side) ? buildTitleActionButton('lineup', side) : ''}
  </div>`;
}

function buildLineupPitchModeHtml(effectiveData, rawData) {
  const homeNodes = buildVerticalPitchNodesHtml(effectiveData?.homeLineup, effectiveData, 'home');
  const awayNodes = buildVerticalPitchNodesHtml(effectiveData?.awayLineup, effectiveData, 'away');
  return `<div class="dp-lineup-pitch">
    <div class="dp-lineup-vertical-pitch">
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
      ${buildLineupPitchTeamChipHtml('home', effectiveData, rawData)}
      ${buildLineupPitchTeamChipHtml('away', effectiveData, rawData)}
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

  return players.map(player => {
    const title = player.nameKoLong && player.nameKoLong !== player.name
      ? ` title="${dpEscape(player.nameKoLong)}"`
      : '';
    return `<div class="dp-item" data-player-id="${dpEscape(player.playerId)}">
      <span class="dp-item-num">${dpEscape(player.number ?? '')}</span>
      <span class="dp-item-name"${title}>${dpEscape(pickName(player, 'lineup') || '')}</span>
    </div>`;
  }).join('');
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

  // 2) 팀명과 양쪽 리스트를 채운다.
  setSideName(panel, 'bench', 'home', getTeamName(effectiveData, 'home'));
  setSideName(panel, 'bench', 'away', getTeamName(effectiveData, 'away'));

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
  if (leagueEl || venueEl) {
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
  }
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
  const html = usePitchMode
    ? buildLineupPitchModeHtml(effectiveData, rawData)
    : buildLineupListModeHtml(effectiveData, rawData);

  const longMode = typeof isLongName === 'function' && isLongName('lineup');

  // 3) 현재 페이지에 떠 있는 모든 라인업 패널 인스턴스에 같은 결과를 주입한다.
  panels.forEach(panel => {
    const body = ensureLineupPanelScaffold(panel);
    if (!body) return;
    panel.classList.toggle('dp-mode-long', longMode);
    setPanelTitle(panel, '선발 라인업', '');
    body.innerHTML = html;
  });
}

function buildTacticsPlayers(lineup) {
  const labels = getFormationSlotLabels(lineup.formation);
  const slots = getFormationSlotsByGridOrder(lineup.formation);
  const players = Array.from({ length: Math.max(slots.length, labels.length, 11) }, () => null);

  getFormationAssignments(lineup).forEach(({ slot, player }) => {
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

function clearTacticsLineupSync(data = lineupPanelState.lastFixture) {
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

function syncTacticsBoard(effectiveData) {
  const payload = buildTacticsPayload(effectiveData);
  if (payload && typeof tacticsApplyLineup === 'function') {
    tacticsApplyLineup(payload);
    return true;
  }
  return false;
}

// ─── 텍스트 피팅 / 충돌 보정 ─────────────────────────────────────────────
// 라인업 이름 pill, 벤치 하단 텍스트, 팀 칩은 모두 렌더 후 실제 픽셀 기준으로 한 번 더 보정한다.
const LINEUP_NAME_MIN_FONT_PX = 7;
const LINEUP_NAME_MIN_WIDTH_PX = 44;
const LINEUP_NAME_PITCH_PADDING_PX = 2;
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

function measureMaxTextLineWidth(el) {
  const rects = getTextLineRects(el);
  let maxLineWidth = 0;
  rects.forEach(rect => {
    if (rect.width > maxLineWidth) maxLineWidth = rect.width;
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
  const rects = getTextLineRects(el);
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
  if (!wrap || !pitch || !canMeasureTextElement(wrap) || !canMeasureTextElement(pitch)) return null;

  const wrapRect = wrap.getBoundingClientRect();
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

function tightenLineupNameWidthForContext(nameEl) {
  return isBigLineupName(nameEl) ? tightenBigLineupNameWidth(nameEl) : tightenLineupNameWidth(nameEl);
}

function fitLineupNameWithinPitchBounds(nameEl) {
  if (!canMeasureTextElement(nameEl)) return false;

  let changed = false;
  let safety = 0;
  while (safety < 16 && hasLineupNamePitchOverflow(nameEl)) {
    const overflow = getLineupNamePitchOverflow(nameEl);
    const horizontalOverflow = overflow && (overflow.left > 0.5 || overflow.right > 0.5);

    if (horizontalOverflow && tightenLineupNameWidthForContext(nameEl)) {
      changed = true;
      safety += 1;
      continue;
    }

    if (!shrinkLineupName(nameEl)) break;
    changed = true;
    safety += 1;
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

function fitTeamChip(chipEl, collisionEls) {
  const mainEl = chipEl?.querySelector('.dp-lineup-team-main');
  const nameEl = mainEl?.querySelector('.dp-lineup-team-name');
  const formationEl = mainEl?.querySelector('.dp-lineup-team-fm');
  const buttonEl = chipEl?.querySelector('.dp-side-edit-btn');
  if (!mainEl || !nameEl || !Array.isArray(collisionEls) || !collisionEls.length) return;

  let safety = 0;
  while (safety < 32) {
    const mainOverlaps = elementOverlapsAny(mainEl, collisionEls);
    const buttonOverlaps = elementOverlapsAny(buttonEl, collisionEls);
    if (!mainOverlaps && !buttonOverlaps) break;

    if (mainOverlaps && formationEl && !mainEl.classList.contains('is-stacked')) {
      mainEl.classList.add('is-stacked');
      safety += 1;
      continue;
    }

    if (nudgeTeamChipTowardEdge(chipEl, collisionEls)) {
      safety += 1;
      continue;
    }

    if (buttonOverlaps && buttonEl
      && tightenTextElementWidth(buttonEl, TEAM_CHIP_BUTTON_MIN_WIDTH_PX, canStayWithinTwoTextLines)) {
      safety += 1;
      continue;
    }

    let changed = false;
    if (mainOverlaps) {
      if (shrinkTextElement(nameEl, TEAM_CHIP_NAME_MIN_FONT_PX)) changed = true;
      if (formationEl && shrinkTextElement(formationEl, TEAM_CHIP_META_MIN_FONT_PX)) changed = true;
    }
    if (changed) {
      safety += 1;
      continue;
    }

    if (buttonOverlaps && buttonEl && shrinkTextElement(buttonEl, TEAM_CHIP_BUTTON_MIN_FONT_PX)) {
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
    if (!panel.closest('.layout-big .lp-lineup')) return;

    const pitch = panel.querySelector('.dp-lineup-vertical-pitch');
    if (!pitch) return;

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
      const side = chip.classList.contains('is-away') ? 'away' : 'home';
      const collisionEls = Array.from(pitch.querySelectorAll(`.dp-lineup-node.is-${side}, .dp-lineup-name-wrap.is-${side}`));
      fitTeamChip(chip, collisionEls);
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
  labels.forEach(nameEl => {
    fitLineupNameWithinPitchBounds(nameEl);
  });
  fitBigLineupTeamChips(scope);
  return;
  {

  labels.forEach(nameEl => {
    if (!nameEl || !nameEl.firstChild) return;
    // 측정 전 width / inline font-size 둘 다 reset → CSS 기반 base 크기로 복귀
    nameEl.style.width = '';
    nameEl.style.fontSize = '';

    // [1] 잘림 감지 시 폰트 점진 축소 (라벨별 독립)
    let safety = 0;
    while (safety < 12 && nameEl.scrollHeight > nameEl.clientHeight + 0.5) {
      const cur = parseFloat(getComputedStyle(nameEl).fontSize);
      if (!Number.isFinite(cur) || cur <= 7) break;
      const next = Math.max(7, cur - 0.5);
      nameEl.style.fontSize = `${next}px`;
      safety += 1;
    }

    // [2] 줄별 폭 측정 후 pill width 고정
    const range = document.createRange();
    try {
      range.selectNodeContents(nameEl);
      const rects = range.getClientRects();
      if (!rects.length) return;
      let maxLineWidth = 0;
      for (const rect of rects) {
        if (rect.width > maxLineWidth) maxLineWidth = rect.width;
      }
      if (maxLineWidth > 0) {
        // +12px = 가로 padding(2 * 6px). +1px buffer로 sub-pixel 잘림 방지
        nameEl.style.width = `${Math.ceil(maxLineWidth) + 13}px`;
      }
    } finally {
      range.detach && range.detach();
    }
  });

  labels.forEach(nameEl => {
    nameEl.style.width = '';
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;
    lockLineupNameWidth(nameEl);
  });

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
  }
}

// 라인업 리사이즈/설정 변경 후 외부에서 다시 fit을 호출할 수 있도록 노출
window.fitLineupNamePills = fitLineupNamePills;
window.fitBenchFooterNames = fitBenchFooterNames;

document.addEventListener('page:activated', () => {
  requestAnimationFrame(() => {
    document.querySelectorAll('.page.active [data-dp-role="lineup"]').forEach(panel => fitLineupNamePills(panel));
    fitBenchFooterNames(document.querySelector('.page.active #benchPanel') || document.getElementById('benchPanel'));
  });
});

// ─── 라인업 패널 재렌더 진입점 ──────────────────────────────────────────
// fixture 재적용, 수동 저장/초기화, 페이지 재활성화 시 모두 이 경로로 들어온다.
function rerenderLineupPanels() {
  if (!lineupPanelState.lastFixture) {
    clearLineupPanels();
    return;
  }

  // 1) raw fixture + 수동 override를 합성한 표시용 데이터를 만든다.
  const effectiveData = buildEffectiveFixtureData(lineupPanelState.lastFixture);

  // 2) 상세 패널 3종과 전술판을 같은 기준 데이터로 동시에 갱신한다.
  renderBenchPanel(effectiveData, lineupPanelState.lastFixture);
  renderInjuryPanel(effectiveData, lineupPanelState.lastFixture);
  renderLineupGrid(effectiveData, lineupPanelState.lastFixture);
  syncTacticsBoard(effectiveData);

  // 3) DOM이 실제 배치된 다음 frame에서 텍스트 피팅을 다시 돌린다.
  // 라인업 그리드의 이름 pill 폭을 실제 렌더된 라인 폭에 맞춤 (layout 안정화 다음 frame).
  // 양쪽 페이지의 라인업 인스턴스 모두 처리.
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-dp-role="lineup"]').forEach(p => fitLineupNamePills(p));
    fitBenchFooterNames(document.getElementById('benchPanel'));
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
  lineupPanelState.manualModal = null;
  closeManualPanel();

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
    if (leagueEl) leagueEl.textContent = '-';
    if (venueEl) venueEl.textContent = '-';
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
  if (isQuestionableInjuryReason(reason, type)) return '출전 여부 미정';
  const raw = String(reason || '').trim();
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

function closeManualPanel() {
  lineupPanelState.manualModal = null;
  lineupPanelState.gridState = null;
  const backdrop = document.getElementById('manualPanelBackdrop');
  if (backdrop) {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

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
  if (!['roster', 'lineup', 'lineupNode', 'teamName'].includes(event.detail?.category)) return;
  rerenderLineupPanels();
});
