const DETAIL_MANUAL_STORAGE_KEY = 'obs.detail.manual.v1';
const DETAIL_MANUAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DETAIL_DEFAULT_FORMATION = '4-3-3';
const DETAIL_BENCH_ROWS = 18;
const DETAIL_INJURY_ROWS = 12;
const DETAIL_SIDE_TITLES = { home: '홈', away: '원정' };

const lineupPanelState = {
  lastFixture: null,
  manualModal: null,
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

  if (sideData?.lineup && ((sideData.lineup.formation || '').trim() || (sideData.lineup.startXi || []).length)) {
    next.lineup = {
      formation: (sideData.lineup.formation || '').trim() || null,
      startXi: clonePlayers(sideData.lineup.startXi || []),
    };
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
  return !sanitizeManualSideData(entry?.home) && !sanitizeManualSideData(entry?.away);
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
    store[fixtureId] = {
      ...draft,
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

function buildEffectiveFixtureData(data) {
  if (!data) return null;

  const fixtureId = getFixtureIdFromData(data);
  const entry = getManualEntry(fixtureId);
  if (!entry) return data;

  const next = {
    ...data,
    homeLineup: cloneLineup(data.homeLineup),
    awayLineup: cloneLineup(data.awayLineup),
    homeInjuries: cloneInjuries(data.homeInjuries),
    awayInjuries: cloneInjuries(data.awayInjuries),
  };

  ['home', 'away'].forEach(side => {
    const manualSide = entry[side];
    if (!manualSide) return;

    const lineupKey = `${side}Lineup`;
    let lineup = next[lineupKey];

    if (manualSide.lineup) {
      const base = lineup || { formation: null, startXi: [], substitutes: [], coach: null };
      lineup = {
        ...base,
        formation: manualSide.lineup.formation || base.formation || null,
        startXi: clonePlayers(manualSide.lineup.startXi || []),
        substitutes: clonePlayers(base.substitutes || []),
        coach: base.coach ? { ...base.coach } : null,
      };
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
  return left.col - right.col;
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
  return `<button class="dp-side-edit-btn" data-manual="${kind}" data-side="${side}">${DETAIL_SIDE_TITLES[side]} 입력</button>`;
}

function shouldShowBenchManualButton(rawFixture, side) {
  return !Array.isArray(rawFixture?.[`${side}Lineup`]?.substitutes);
}

function shouldShowInjuryManualButton(rawFixture, side) {
  return !Array.isArray(rawFixture?.[`${side}Injuries`]);
}

function shouldShowLineupManualButton(rawFixture, side) {
  const lineup = rawFixture?.[`${side}Lineup`];
  return !lineup || !hasValidFormation(lineup) || !hasStartXi(lineup);
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

  el.textContent = effectiveCoachName || '(제공 안됨, 수동 입력 가능)';
  el.classList.toggle('dp-coach-editable', editable);
  el.dataset.coachSide = side;
  el.dataset.apiMissing = editable ? 'true' : 'false';
  el.title = editable ? '더블클릭해서 감독 이름 입력' : '';
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
    const reasonKo = typeof getInjuryReasonKo === 'function' ? getInjuryReasonKo(injury.reason) : (injury.reason || '');
    const tooltip = reasonKo ? ` title="${dpEscape(reasonKo)}"` : '';

    let iconHtml = '<span class="dp-icon dp-icon-injury" aria-label="부상"></span>';
    if (injury.type === 'Questionable') {
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
 *     away는 y → 100-y 로 미러 (전술판과 동일하게 LW/RW 좌우 반전)
 */
function mapFormationSlotToPitchPosition(slot, side) {
  const rawX = Number(slot?.coord?.x) || 5;
  const rawY = Number(slot?.coord?.y) || 50;
  // tactics_x 정규화: 5(GK) → 0, 44(FW) → 1
  const depth = Math.max(0, Math.min(1, (rawX - 5) / 39));
  const isHome = side === 'home';
  // 자기 진영 깊이 8~47% (39% 폭). GK가 8%에 위치 → 이름(원 아래)이 피치 밖 안 잘림
  const homeTop = 8 + depth * 39;
  const top = isHome ? homeTop : (100 - homeTop);
  // away는 y 미러: home y=10 (왼쪽 윙)에 대응하는 away는 화면 같은 왼쪽이지만
  //   원본 y는 90 (전술판이 mirror에서 100-y로 변환). 우리 입력은 mirror 안 된
  //   원본 좌표라 가정 → away만 좌우 반전해서 시각적 일관성 확보.
  const yLocal = isHome ? rawY : (100 - rawY);
  // 가로는 5~95% (90% 폭)
  const left = 5 + (yLocal / 100) * 90;
  return { left, top };
}

function getActiveLineupNodeMode() {
  if (typeof getLineupNodeMode === 'function') return getLineupNodeMode();
  return 'number';
}

function buildVerticalPitchNodesHtml(lineup, effectiveData, side) {
  const nodeMode = getActiveLineupNodeMode();
  const colors = getLineupSideColors(effectiveData, side);

  return getFormationAssignments(lineup).map(({ slot, player }) => {
    const name = pickName(player, 'lineup') || player.name || '';
    const title = player.nameKoLong && player.nameKoLong !== player.name
      ? ` title="${dpEscape(player.nameKoLong)}"`
      : '';
    const position = mapFormationSlotToPitchPosition(slot, side);
    const style = `left:${position.left}%;top:${position.top}%;--dp-node-bg:${colors.bg};--dp-node-text:${colors.text};--dp-node-glow:${withAlpha(colors.bg, '44')};--dp-node-border:${withAlpha(colors.text, '66')};`;

    const badge = nodeMode === 'photo' && player.photoUrl
      ? `<span class="dp-lineup-avatar" style="background-image:url('${dpEscape(player.photoUrl)}')"></span>`
      : `<span class="dp-lineup-circle">${dpEscape(player.number ?? '')}</span>`;

    return `<div class="dp-lineup-node is-${side}" style="${style}">
      ${badge}
      <span class="dp-lineup-name"${title}>${dpEscape(name)}</span>
    </div>`;
  }).join('');
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
      ${buildVerticalPitchNodesHtml(effectiveData?.homeLineup, effectiveData, 'home')}
      ${buildVerticalPitchNodesHtml(effectiveData?.awayLineup, effectiveData, 'away')}
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
  const formationMissing = !!lineup && !hasValidFormation(rawLineup);

  return `<div class="dp-col">
    ${buildLineupSideHeaderHtml(
      side,
      getTeamName(effectiveData, side),
      lineup?.formation || '',
      shouldShowLineupManualButton(rawData, side)
    )}
    ${formationMissing ? '<div class="dp-lineup-note">포메이션 정보가 없어 리스트형으로 표시합니다. 수동 입력하면 전술판도 함께 반영됩니다.</div>' : ''}
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

function renderBenchPanel(effectiveData, rawData) {
  const panel = document.getElementById('benchPanel');
  if (!panel) return;

  panel.classList.toggle('dp-mode-long', typeof isLongName === 'function' && isLongName('roster'));
  setPanelTitle(panel, '교체 명단', [
    shouldShowBenchManualButton(rawData, 'home') ? buildTitleActionButton('bench', 'home') : '',
    shouldShowBenchManualButton(rawData, 'away') ? buildTitleActionButton('bench', 'away') : '',
  ].filter(Boolean).join(''));

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

  setCoachElement(panel.querySelector('[data-bench-coach="home"] .dp-coach-name'), effectiveData, rawData, 'home');
  setCoachElement(panel.querySelector('[data-bench-coach="away"] .dp-coach-name'), effectiveData, rawData, 'away');

  const refereeEl = panel.querySelector('[data-bench-referee] .dp-referee-name');
  if (refereeEl) refereeEl.textContent = effectiveData?.matchInfo?.refereeName || '-';

  // 경기장 이름 — venueName + venueCity (도시 있으면 ", 도시" 형태로 붙임)
  const venueEl = panel.querySelector('[data-bench-venue] .dp-venue-name');
  if (venueEl) {
    const matchInfo = effectiveData?.matchInfo || {};
    const venueName = String(matchInfo.venueName || '').trim();
    const venueCity = String(matchInfo.venueCity || '').trim();
    let venueText = '-';
    if (venueName && venueCity && venueCity !== venueName) venueText = `${venueName}, ${venueCity}`;
    else if (venueName) venueText = venueName;
    else if (venueCity) venueText = venueCity;
    venueEl.textContent = venueText;
  }
}

function renderInjuryPanel(effectiveData, rawData) {
  const panel = document.getElementById('injuryPanel');
  if (!panel) return;

  panel.classList.toggle('dp-mode-long', typeof isLongName === 'function' && isLongName('roster'));
  setPanelTitle(panel, '부상자 명단', [
    shouldShowInjuryManualButton(rawData, 'home') ? buildTitleActionButton('injury', 'home') : '',
    shouldShowInjuryManualButton(rawData, 'away') ? buildTitleActionButton('injury', 'away') : '',
  ].filter(Boolean).join(''));

  setSideName(panel, 'injury', 'home', getTeamName(effectiveData, 'home'));
  setSideName(panel, 'injury', 'away', getTeamName(effectiveData, 'away'));

  const hasHomeInjuryData = Array.isArray(rawData?.homeInjuries) || Array.isArray(effectiveData?.homeInjuries);
  const hasAwayInjuryData = Array.isArray(rawData?.awayInjuries) || Array.isArray(effectiveData?.awayInjuries);

  const homeList = panel.querySelector('[data-injury-side="home"] .dp-list');
  const awayList = panel.querySelector('[data-injury-side="away"] .dp-list');
  if (homeList) homeList.innerHTML = buildInjuryListHtml(effectiveData?.homeInjuries, hasHomeInjuryData);
  if (awayList) awayList.innerHTML = buildInjuryListHtml(effectiveData?.awayInjuries, hasAwayInjuryData);
}

function renderLineupGrid(effectiveData, rawData) {
  // 메인 (캠 큼) + 메인 (캠 작음) 양쪽 페이지에 같은 라인업 패널이 있으므로
  // [data-dp-role="lineup"]가 붙은 모든 인스턴스에 동일하게 렌더.
  const panels = document.querySelectorAll('[data-dp-role="lineup"]');
  if (!panels.length) return;

  const usePitchMode =
    canRenderPitchMode(effectiveData?.homeLineup) &&
    canRenderPitchMode(effectiveData?.awayLineup);

  const html = usePitchMode
    ? buildLineupPitchModeHtml(effectiveData, rawData)
    : buildLineupListModeHtml(effectiveData, rawData);

  const longMode = typeof isLongName === 'function' && isLongName('lineup');

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
    return;
  }
  clearTacticsLineupSync(effectiveData);
}

/**
 * 라인업 토큰 이름 pill을 실제 렌더링된 줄 폭에 정확히 맞춤.
 * CSS로는 wrap 후 라인 폭을 알 수 없어서 (max-content/min-content 모두 부정확),
 * Range API로 layout 후 줄별 클라이언트 rect를 측정해 가장 긴 줄 + padding으로 width 고정.
 *
 * 호출 시점: innerHTML 갱신 후 다음 frame (DOM 레이아웃 안정화된 뒤)
 */
function fitLineupNamePills(root) {
  const scope = root || document;
  scope.querySelectorAll('.dp-lineup-name').forEach(nameEl => {
    if (!nameEl || !nameEl.firstChild) return;
    // 측정 전 잠깐 width 풀어주고 max-width:100%로 자연 wrap 유도
    nameEl.style.width = '';
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
}

function rerenderLineupPanels() {
  if (!lineupPanelState.lastFixture) {
    clearLineupPanels();
    return;
  }

  const effectiveData = buildEffectiveFixtureData(lineupPanelState.lastFixture);
  renderBenchPanel(effectiveData, lineupPanelState.lastFixture);
  renderInjuryPanel(effectiveData, lineupPanelState.lastFixture);
  renderLineupGrid(effectiveData, lineupPanelState.lastFixture);
  syncTacticsBoard(effectiveData);

  // 라인업 그리드의 이름 pill 폭을 실제 렌더된 라인 폭에 맞춤 (layout 안정화 다음 frame).
  // 양쪽 페이지의 라인업 인스턴스 모두 처리.
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-dp-role="lineup"]').forEach(p => fitLineupNamePills(p));
  });
}

function applyLineupPanels(fixtureData) {
  if (!fixtureData) {
    clearLineupPanels();
    return;
  }
  lineupPanelState.lastFixture = fixtureData;
  rerenderLineupPanels();
}

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
      el.classList.remove('dp-coach-editable', 'dp-coach-editing');
      delete el.dataset.coachSide;
      delete el.dataset.apiMissing;
    });
    const venueEl = benchPanel.querySelector('[data-bench-venue] .dp-venue-name');
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
    <div class="dp-manual-grid">
      ${Array.from({ length: DETAIL_BENCH_ROWS }, (_, index) => `<div class="dp-manual-row">
        <div class="dp-slot-label">${index + 1}</div>
        <input class="dp-input" name="bench-number-${index}" value="${dpEscape(list[index]?.number ?? '')}" placeholder="번호" />
        <input class="dp-input" name="bench-name-${index}" value="${dpEscape(getPrefillName(list[index]))}" placeholder="선수 이름" />
      </div>`).join('')}
    </div>`;
}

function buildInjuryManualFormHtml(injuries) {
  const list = Array.isArray(injuries) ? injuries : [];
  return `<div class="dp-manual-help">type은 Missing Fixture 또는 Questionable 중 하나를 사용합니다.</div>
    <div class="dp-manual-grid">
      ${Array.from({ length: DETAIL_INJURY_ROWS }, (_, index) => {
        const currentType = list[index]?.type === 'Questionable' ? 'Questionable' : 'Missing Fixture';
        return `<div class="dp-manual-row is-injury">
          <div class="dp-slot-label">${index + 1}</div>
          <input class="dp-input" name="injury-number-${index}" value="${dpEscape(list[index]?.number ?? '')}" placeholder="번호" />
          <input class="dp-input" name="injury-name-${index}" value="${dpEscape(getPrefillName(list[index]))}" placeholder="선수 이름" />
          <select class="dp-select" name="injury-type-${index}">
            <option value="Missing Fixture"${currentType === 'Missing Fixture' ? ' selected' : ''}>Missing Fixture</option>
            <option value="Questionable"${currentType === 'Questionable' ? ' selected' : ''}>Questionable</option>
          </select>
          <input class="dp-input" name="injury-reason-${index}" value="${dpEscape(list[index]?.reason ?? '')}" placeholder="reason" />
        </div>`;
      }).join('')}
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

  if (kind === 'lineup') {
    content.innerHTML = buildLineupManualFormHtml(effectiveData?.[`${side}Lineup`]);
  } else if (kind === 'bench') {
    content.innerHTML = buildBenchManualFormHtml(effectiveData?.[`${side}Lineup`]?.substitutes);
  } else {
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

  for (let index = 0; index < DETAIL_INJURY_ROWS; index += 1) {
    const name = getInputValue(form.elements[`injury-name-${index}`]?.value);
    const number = getInputValue(form.elements[`injury-number-${index}`]?.value);
    const type = getInputValue(form.elements[`injury-type-${index}`]?.value) || 'Missing Fixture';
    const reason = getInputValue(form.elements[`injury-reason-${index}`]?.value);
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

function saveManualPanel() {
  const modalState = lineupPanelState.manualModal;
  const form = document.getElementById('manualPanelForm');
  if (!modalState || !form) return;

  const { kind, side, fixtureId } = modalState;
  updateManualEntry(fixtureId, side, sideData => {
    if (kind === 'lineup') {
      const lineup = extractLineupOverrideFromForm(form);
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
});

document.addEventListener('dblclick', event => {
  const coachEl = event.target.closest('.dp-coach-name');
  if (!coachEl || coachEl.dataset.apiMissing !== 'true') return;
  startCoachInlineEdit(coachEl);
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
