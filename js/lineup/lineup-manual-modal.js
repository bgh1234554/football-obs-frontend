// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 패널 / 수동 입력 모달]
// 그리드 모드(포메이션 + 선수별 grid override) + 풀폼 모달(라인업/벤치/부상자 직접
// 입력) + 감독/주심 인라인 편집. lineup-manual-store.js, lineup-data.js 로드 후 사용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 풀폼/그리드 모달의 포메이션 select용 option HTML — TACTICS_FM에 등록된 전체 목록. */
function buildFormationOptionsHtml(selected) {
  return Object.keys(getTacticsFormationMap())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(formation => `<option value="${dpEscape(formation)}"${formation === selected ? ' selected' : ''}>${dpEscape(formation)}</option>`)
    .join('');
}

/** 입력 폼 prefill용 — 패널에 실제로 표시 중인 이름(풀네임 설정/닉네임 반영)과 동일한 값을 사용. */
function getPrefillName(person) {
  if (!person) return '';
  if (typeof pickName === 'function') {
    const picked = pickName(person, 'roster');
    if (picked) return picked;
  }
  return person.name || person.playerName || person.nameKoLong || person.playerNameKoLong || '';
}

/** 부상 사유가 "출전 여부 미정" 상태인지 — type 필드 또는 reason 문자열 둘 다 확인. */
function isQuestionableInjuryReason(reason, type) {
  return type === 'Questionable' || String(reason || '').trim() === 'Questionable';
}

/** 부상 사유 한글 표시 텍스트. Questionable이면 "출전 여부 미정" (+ 세부 사유가 있으면 같이). */
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

/** INJURY_REASON_KO 전체 키를 일반 부상/징계(출장정지)/미등록 세 그룹으로 분류 + 한글 라벨 기준 정렬. */
function getManualInjuryReasonCatalog() {
  const keys = typeof INJURY_REASON_KO !== 'undefined' && INJURY_REASON_KO
    ? Object.keys(INJURY_REASON_KO)
    : [];
  const regular = [];
  const suspensions = [];
  const offRoster = [];
  const seenLabels = new Set();

  Array.from(new Set(keys.filter(Boolean))).forEach(reason => {
    const label = getInjuryReasonDisplayText(reason);
    if (!label || seenLabels.has(label)) return;
    seenLabels.add(label);
    if (typeof isOffRoster === 'function' && isOffRoster(reason)) offRoster.push(reason);
    else if (typeof isSuspension === 'function' && isSuspension(reason)) suspensions.push(reason);
    else regular.push(reason);
  });

  const sortByLabel = (a, b) => getInjuryReasonDisplayText(a).localeCompare(getInjuryReasonDisplayText(b), 'ko');
  regular.sort(sortByLabel);
  suspensions.sort(sortByLabel);
  offRoster.sort(sortByLabel);
  return { regular, suspensions, offRoster };
}

/** 부상 사유 select용 option 한 줄 HTML. */
function buildInjuryReasonOptionHtml(reason, selectedReason) {
  return `<option value="${dpEscape(reason)}"${reason === selectedReason ? ' selected' : ''}>${dpEscape(getInjuryReasonDisplayText(reason))}</option>`;
}

/** 부상 사유 select 전체 HTML — 상태/부상·결장/징계·카드 optgroup 3개 + 카탈로그에 없는 커스텀 값 보존. */
function buildInjuryReasonOptionsHtml(reason, type) {
  const selectedReason = isQuestionableInjuryReason(reason, type) ? 'Questionable' : String(reason || '').trim();
  const { regular, suspensions, offRoster } = getManualInjuryReasonCatalog();
  const knownReasons = new Set(['Questionable', ...regular, ...suspensions, ...offRoster]);
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
    </optgroup>
    <optgroup label="미등록">
      ${offRoster.map(item => buildInjuryReasonOptionHtml(item, selectedReason)).join('')}
    </optgroup>`;
}

/**
 * 수동 입력 모달(풀폼/벤치)이 기준으로 삼을 라인업 데이터 소스.
 * subReflect(교체 반영) 설정이 켜져 있으면 rerenderLineupPanels가 만들어둔
 * lastEffectiveData(수동 override + 교체 이벤트 swap까지 반영된 상태)를 그대로 쓴다.
 * subReflect가 꺼져있으면 lastEffectiveData는 buildEffectiveFixtureData 결과와 동일하므로
 * 항상 이 값을 우선 사용해도 안전하다. 아직 계산 전이면(방어적으로) 그 자리에서 새로 합성한다.
 * 주의: 그리드 모드(initGridState/recomputeGridSlotsForFormation)는 저장 키를 원본 API
 * playerId에 고정해야 하므로 이 함수를 쓰지 않는다 — buildLineupDisplayOverlay 참고.
 */
function getManualModalEffectiveData() {
  return lineupPanelState.lastEffectiveData || buildEffectiveFixtureData(lineupPanelState.lastFixture);
}

/**
 * 그리드 모드 전용: 원본 API startXi(식별자 기준, 인덱스 정렬)에 subReflect로 같은 자리에
 * 들어온 교체 선수의 "표시용" 정보(이름/번호/사진/포지션)만 덮어씌운 배열을 만든다.
 * playerId는 원본 그대로 유지한다 — buildEffectiveFixtureData의 그리드 override 재적용이
 * `grids[buildLineupRosterKey(원본 선수, idx)]`로 원본 배열을 다시 순회하므로, 저장 키가
 * 교체 선수 ID로 바뀌면 그 슬롯의 override가 원본 선수와 매칭되지 않아 무시된다
 * (포메이션/드래그 변경이 저장 후 적용되지 않는 버그의 원인). lpApplySubReflectToLineup이
 * 같은 배열 인덱스에서 in-place로 선수만 바꿔치기하므로 인덱스로 짝지으면 항상 안전하다.
 */
/**
 * 그리드 모드가 기준으로 삼는 원본 라인업. API가 formation/grid 없이 선수만 준 경우(playerStats로
 * 추정한 라인업 포함) 패널 렌더와 같은 applyInferredFormation 결과를 써서, 모달이 화면에 보이는
 * 추정 포메이션/배치 그대로 열리게 한다(예전엔 기본값 4-3-3에 API 순서대로 채워져 화면과 달랐다).
 * playerId는 그대로라 저장 키(buildLineupRosterKey)는 원본과 동일하다.
 */
function getGridSourceLineup(side) {
  const lineup = lineupPanelState.lastFixture?.[`${side}Lineup`];
  return typeof applyInferredFormation === 'function' ? applyInferredFormation(lineup) : lineup;
}

function buildLineupDisplayOverlay(side) {
  const rawStartXi = getGridSourceLineup(side)?.startXi || [];
  const effectiveStartXi = getManualModalEffectiveData()?.[`${side}Lineup`]?.startXi || [];
  return clonePlayers(rawStartXi).map((p, idx) => {
    const display = effectiveStartXi[idx];
    if (!display || Number(display.playerId) === Number(p.playerId)) return p;
    return {
      ...p,
      name: display.name,
      nameKoLong: display.nameKoLong,
      origName: display.origName,
      number: display.number,
      photoUrl: display.photoUrl,
      pos: display.pos || p.pos,
      // 저장 키(playerId)는 원본 유지 — 교체 IN 마커 표시용으로만 실제 선수 ID를 따로 들고 있는다.
      _subEventPlayerId: display.playerId,
    };
  });
}

// ─── 그리드 모드 (API 라인업 보존, 포메이션 + 선수별 grid만 override) ───────
// 모달 오픈 시 호출 — gridState 초기화. 저장된 gridByPlayerId override 있으면 복원.
function initGridState(side) {
  const fixtureId = getActiveFixtureId();
  const apiLineup = getGridSourceLineup(side);
  const players = buildLineupDisplayOverlay(side);
  const playersById = Object.fromEntries(players.map((p, idx) => [buildLineupRosterKey(p, idx), p]));

  const stored = getManualSideData(fixtureId, side)?.lineup;
  // 포메이션 우선순위: 저장된 수동값 > API 응답 > default(4-3-3)
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
    players.forEach((p, i) => {
      if (!p.grid) return;
      const idx = gridValues.indexOf(p.grid);
      const pidStr = buildLineupRosterKey(p, i);
      if (idx >= 0 && !slotPlayerIds[idx]) slotPlayerIds[idx] = pidStr;
    });
  }

  // 3) 매핑 안 된 선수는 빈 슬롯에 API 순서대로 삽입
  let cursor = 0;
  players.forEach((p, i) => {
    const pidStr = buildLineupRosterKey(p, i);
    if (slotPlayerIds.includes(pidStr)) return;
    while (cursor < slotsCount && slotPlayerIds[cursor]) cursor += 1;
    if (cursor < slotsCount) slotPlayerIds[cursor] = pidStr;
  });

  lineupPanelState.gridState = { side, formation, slotPlayerIds, players: playersById };
}

/** API 원본 대신 드래그로 수정한 현재 슬롯을 새 포메이션의 대응 역할로 옮긴다. */
function recomputeGridSlotsForFormation(side, formation) {
  const state = lineupPanelState.gridState;
  if (!state || state.side !== side) return [];
  return remapLineupFormationSlots(state.formation, formation, state.slotPlayerIds);
}

/**
 * 그리드 모달 한 슬롯 행 HTML — 드래그 핸들 + 슬롯 라벨 + 선수 사진/번호/이름(없으면 "빈 슬롯").
 * API가 아예 이름 없이 내려준 선수(pickName/name/origName 모두 공백, playerId만 있음)는
 * "빈 슬롯"과 겉보기엔 비슷하지만 실제로는 선수가 배정돼 있는 자리라 드래그 대상이 된다 —
 * 이런 경우 이름 자리에 직접 입력 가능한 input을 대신 렌더해 이름을 채울 수 있게 한다
 * (saveManualGridPlayerName). 저장된 이름은 player-id-resolve.js의 id-key override로
 * 들어가 /detail 패널 표시뿐 아니라 이후 이벤트 fuzzy 자동 연계 후보로도 쓰인다.
 * subReflect로 이 슬롯에 교체 선수가 표시 중이면(buildLineupDisplayOverlay), 라인업
 * 패널/벤치 행과 같은 "교체 IN" 마커(lpBuildSubMarkerHtml)를 이름 오른쪽에 그대로 붙인다.
 */
function buildGridRowHtml(pidStr, slotIndex) {
  const { formation, players, side } = lineupPanelState.gridState;
  const labels = getFormationSlotLabels(formation);
  const p = pidStr ? players[pidStr] : null;
  const photoStyle = p?.photoUrl ? ` style="background-image:url('${dpEscape(p.photoUrl)}')"` : '';
  const photoCls = p?.photoUrl ? '' : ' dp-grid-photo-empty';
  const num = p ? dpEscape(p.number ?? '') : '';
  const resolvedName = p ? (lineupPanelState.gridState.fullFormRows ? p.name : (pickName(p, 'lineup') || p.name || '')) : '';
  const isNamelessPlayer = !!p && !resolvedName && Number(p.playerId) > 0;
  const subEvents = p?._subEventPlayerId != null && typeof lpGetPlayerEvents === 'function'
    ? lpGetPlayerEvents(p._subEventPlayerId, side, p.name)
    : null;
  const subHtml = subEvents && typeof lpBuildSubMarkerHtml === 'function'
    ? lpBuildSubMarkerHtml(subEvents, 'starter')
    : '';
  const nameHtml = !p
    ? '(빈 슬롯)'
    : isNamelessPlayer
      ? `<input type="text" class="dp-input dp-grid-name-input" data-player-id="${p.playerId}" placeholder="선수 이름 입력 (이벤트 자동 연계용)" value="" draggable="false">`
      : `${p.manualCaptain ? '<span class="dp-roster-captain" title="주장">C</span>' : ''}${dpEscape(resolvedName)}${subHtml ? ` ${subHtml}` : ''}`;
  const emptyCls = p ? '' : ' dp-grid-empty'; // "(빈 슬롯)" 텍스트 전용 — 입력창 렌더링일 땐 부여 안 함
  return `<div class="dp-grid-row" data-slot-index="${slotIndex}" draggable="true">
    <span class="dp-grid-handle" aria-hidden="true">⠿</span>
    <span class="dp-grid-slot-label">${dpEscape(labels[slotIndex] || `${slotIndex + 1}`)}</span>
    <span class="dp-grid-photo${photoCls}"${photoStyle}></span>
    <span class="dp-grid-num">${num}</span>
    <span class="dp-grid-name${emptyCls}">${nameHtml}</span>
  </div>`;
}

/**
 * 이름 없이 내려온 그리드 슬롯 선수에게 입력한 이름을 저장.
 * player-id-resolve.js의 id-key override(pirSetByKey)를 그대로 재사용 —
 * applyZeroIdOverrides가 /detail 패널·전술판 표시와 이벤트 fuzzy 자동 연계
 * (pirApplyManualNameHintsForFuzzy) 양쪽에 이 이름을 반영한다.
 * `viaBlankNameInput: true` 플래그를 남겨, 같은 side에 이 플래그를 가진 선수가 유일하고
 * 교체 이벤트에 로스터 어디에도 없는 id가 유일하게 하나뿐이면 fuzzy 매칭 실패와 무관하게
 * 소거법으로 자동 연결하는 pirAutoLinkOrphanByElimination이 이 선수를 식별할 수 있게 한다.
 */
function saveManualGridPlayerName(inputEl) {
  const pid = Number(inputEl?.dataset?.playerId);
  const side = lineupPanelState.gridState?.side;
  const fixtureId = getActiveFixtureId();
  const name = getInputValue(inputEl.value);
  if (!pid || !side || !fixtureId) return;
  if (typeof pirMakeIdKey !== 'function' || typeof pirSetByKey !== 'function') return;

  const key = pirMakeIdKey(fixtureId, side, pid);
  if (!name) {
    pirSetByKey(key, null);
  } else {
    const existing = typeof pirGetByKey === 'function' ? pirGetByKey(key) : null;
    // 이 키로 이미 다른 실제(alt) ID가 연결돼 있었다면(예: 과거 ID 재검색으로 연결) 그대로 보존 —
    // 이름만 채우는 이 흐름이 기존 alt ID 연결을 되돌리지 않도록.
    const resolvedPid = existing && Number(existing.playerId) > 0 ? existing.playerId : pid;
    pirSetByKey(key, { ...(existing || {}), playerId: resolvedPid, name, nameKoLong: name, viaBlankNameInput: true, resolvedAt: Date.now() });
  }

  // 모달이 열려있는 동안에도 즉시 반영되도록 gridState 스냅샷(원본 API startXi 복제본)도 패치.
  Object.values(lineupPanelState.gridState?.players || {}).forEach(player => {
    if (player && Number(player.playerId) === pid) {
      player.name = name || player.name;
      player.nameKoLong = name || player.nameKoLong;
    }
  });
  rerenderGridList();
}

/** 그리드 모드 모달 본문 전체 HTML — 안내문 + 포메이션 select + 슬롯 목록. */
function buildLineupGridFormHtml() {
  const { formation, slotPlayerIds } = lineupPanelState.gridState;
  const rows = slotPlayerIds.map((pid, idx) => buildGridRowHtml(pid, idx)).join('');
  const help = lineupPanelState.gridState.fullFormRows
    ? '포메이션을 바꾸면 현재 위치와 역할을 최대한 유지해 배치합니다. 핸들(⠿)로 선수를 옮기면 번호와 득점·카드 정보도 함께 이동합니다. 포메이션 이동 버튼을 다시 누르면 입력 폼으로 돌아갑니다.'
    : '포메이션을 바꾸면 현재 위치와 역할을 최대한 유지해 배치합니다. 핸들(⠿)을 드래그해서 선수 위치를 서로 바꿀 수 있습니다. 저장하면 라인업과 전술판에 같이 반영됩니다.';
  return `<div class="dp-manual-help">${help}</div>
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

/** 풀폼의 미저장 입력을 보존한 채 기존 슬롯 이동 UI를 켜고 끈다. 저장 형식은 풀폼을 유지한다. */
function toggleManualLineupGrid() {
  const modal = lineupPanelState.manualModal;
  const content = document.getElementById('manualPanelContent');
  const toggle = document.getElementById('manualPanelGridToggle');
  const fullForm = document.getElementById('manualLineupFullForm');
  if (modal?.kind !== 'lineup' || !fullForm || !content || !toggle) return;

  const grid = lineupPanelState.gridState;
  if (grid?.fullFormRows) {
    // 이름이 없는 행도 포함해 모든 입력을 이동한다. 필터링하거나 다시 파싱하면 부분 입력이 사라진다.
    grid.slotPlayerIds.forEach((key, index) => {
      grid.fullFormRows[key].forEach(field => {
        const input = fullForm.querySelector(`[name="${field.prefix}${index}"]`);
        input.value = field.value;
        input.checked = field.checked;
      });
    });
    fullForm.querySelector('#manualLineupFormation').value = grid.formation;
    syncManualLineupSlotLabels(grid.formation);
    document.getElementById('manualLineupGridView')?.remove();
    fullForm.hidden = false;
    lineupPanelState.gridState = null;
    toggle.setAttribute('aria-pressed', 'false');
    return;
  }

  const formation = fullForm.querySelector('#manualLineupFormation').value;
  const fullFormRows = {};
  const players = {};
  const slotPlayerIds = Array.from({ length: 11 }, (_, index) => {
    const key = `manual-row-${index}`;
    fullFormRows[key] = [...fullForm.querySelectorAll(`input[name$="-${index}"]`)].map(input => ({
      prefix: input.name.replace(/\d+$/, ''), value: input.value, checked: input.checked,
    }));
    const name = fullForm.querySelector(`[name="lineup-name-${index}"]`).value;
    const number = fullForm.querySelector(`[name="lineup-number-${index}"]`).value;
    const manualCaptain = !!fullForm.querySelector(`[name="lineup-captain-${index}"]`)?.checked;
    if (name || number) players[key] = { name, number, manualCaptain };
    return key;
  });
  lineupPanelState.gridState = { side: modal.side, formation, slotPlayerIds, players, fullFormRows };
  const view = document.createElement('div');
  view.id = 'manualLineupGridView';
  view.innerHTML = buildLineupGridFormHtml();
  // 원본 폼의 formation 입력을 저장에 사용한다. 이동 UI 선택값은 토글 해제/저장 시 동기화한다.
  view.querySelector('select').removeAttribute('name');
  fullForm.hidden = true;
  content.appendChild(view);
  toggle.setAttribute('aria-pressed', 'true');
  bindLineupGridDragDrop();
}

/** gridState.slotPlayerIds 기준으로 슬롯 목록 DOM을 다시 그리고 드래그 핸들러를 재바인딩. */
function rerenderGridList() {
  const list = document.getElementById('manualGridList');
  if (!list || !lineupPanelState.gridState) return;
  const { slotPlayerIds } = lineupPanelState.gridState;
  list.innerHTML = slotPlayerIds.map((pid, idx) => buildGridRowHtml(pid, idx)).join('');
  bindLineupGridDragDrop();
}

/** 슬롯 행끼리 드래그&드롭으로 자리 교환 (HTML5 DnD). */
function bindLineupGridDragDrop() {
  const list = document.getElementById('manualGridList');
  if (!list) return;
  list.querySelectorAll('.dp-grid-row').forEach(row => {
    row.addEventListener('dragstart', event => {
      // 이름 입력 칸에서 텍스트를 드래그-선택하는 동작이 행 자체의 드래그로 오인되지 않도록.
      if (event.target.closest('.dp-grid-name-input')) { event.preventDefault(); return; }
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

/** 현재 gridState를 저장 형식({formation, gridByPlayerId})으로 변환. 빈 슬롯뿐이면 null. */
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

/**
 * 완전 수동 라인업(풀폼) 전용 골/자책골/도움/경고/퇴장/주장 6칸 — 헤더 행과 각 선수 행이
 * 같은 grid-template-columns(dp-manual-row.has-stats, css/lineup/lineup-manual.css)를 공유해
 * 열이 그대로 맞춰진다. 이 선수는 API 이벤트와 아예 연결될 방법이 없는 _manual 선수라
 * (player-id-resolve.js의 fuzzy 매칭도 origName 없는 선수는 후보에서 제외), 분(minute)
 * 정보 없이 "몇 번 있었는지/있었는지"만 직접 입력받는다. extractLineupOverrideFromForm이
 * 이 값을 player 오브젝트의 manualGoals/manualOwnGoals/manualAssists/manualYellow/manualRed
 * 필드로 저장하고, lpManualPlayerEventsOverride(lineup-events.js)가 렌더 시 이걸 events와
 * 같은 모양으로 변환해 기존 배지 렌더링 함수들을 그대로 재사용한다.
 */
function buildLineupManualStatCellsHtml(player, index) {
  const goals = Number(player?.manualGoals) || 0;
  const ownGoals = Number(player?.manualOwnGoals) || 0;
  const assists = Number(player?.manualAssists) || 0;
  const yellow = !!player?.manualYellow;
  const red = !!player?.manualRed;
  return `<input type="number" min="0" max="99" class="dp-input dp-input-mini" name="lineup-goals-${index}" value="${goals || ''}" placeholder="0" title="득점" />
    <input type="number" min="0" max="99" class="dp-input dp-input-mini" name="lineup-owngoals-${index}" value="${ownGoals || ''}" placeholder="0" title="자책골" />
    <input type="number" min="0" max="99" class="dp-input dp-input-mini" name="lineup-assists-${index}" value="${assists || ''}" placeholder="0" title="도움" />
    <label class="dp-manual-stat-check" title="경고(옐로카드)"><input type="checkbox" name="lineup-yellow-${index}" aria-label="경고(옐로카드)"${yellow ? ' checked' : ''} /><span class="dp-manual-card-swatch is-yellow" aria-hidden="true"></span></label>
    <label class="dp-manual-stat-check" title="퇴장(레드카드)"><input type="checkbox" name="lineup-red-${index}" aria-label="퇴장(레드카드)"${red ? ' checked' : ''} /><span class="dp-manual-card-swatch is-red" aria-hidden="true"></span></label>
    <label class="dp-manual-stat-check" title="주장"><input type="checkbox" name="lineup-captain-${index}" aria-label="주장"${player?.manualCaptain ? ' checked' : ''} /><span class="dp-manual-card-swatch is-captain" aria-hidden="true">C</span></label>`;
}

/**
 * 라인업 풀폼 모달(포메이션 없음 — 11명 줄글 직접 입력) 본문 HTML.
 * 첫 행은 좁힌 포메이션 select(1~3번 칸에 걸침) + 골/자책골/도움/경고/퇴장/주장 헤더(4~9번 칸).
 * 이후 11개 선수 행은 같은 9칸 grid를 공유해(dp-manual-row.has-stats) 각 입력칸이 헤더 아이콘과
 * 세로로 정확히 맞춰진다. 이름 입력칸은 폭을 고정 좁혀 통계 칸들이 들어갈 자리를 확보한다.
 */
function buildLineupManualFormHtml(lineup) {
  const formation = hasValidFormation(lineup) ? lineup.formation : DETAIL_DEFAULT_FORMATION;
  const players = getOrderedLineupPlayers(lineup?.startXi || []);
  const labels = getFormationSlotLabels(formation);

  return `<div class="dp-manual-help">포메이션과 선발 11명을 입력하면 /detail 라인업과 전술판에 함께 반영됩니다. 오른쪽 열에서 득점/자책골/도움 횟수와 경고·퇴장 여부, 주장(C)도 설정할 수 있습니다.</div>
    <div class="dp-form-stack">
      <div class="dp-manual-grid dp-manual-grid-lineup">
        <div class="dp-manual-row has-stats dp-manual-header-row">
          <label class="dp-manual-formation-field">
            <span class="dp-field-label">포메이션</span>
            <select class="dp-select dp-select-compact" name="manual-formation" id="manualLineupFormation" data-formation="${dpEscape(formation)}">
              ${buildFormationOptionsHtml(formation)}
            </select>
          </label>
          <span class="dp-manual-stat-header" title="득점">⚽</span>
          <span class="dp-manual-stat-header" title="자책골">OG</span>
          <span class="dp-manual-stat-header" title="도움">👟</span>
          <span class="dp-manual-stat-header" title="경고(옐로카드)">🟨</span>
          <span class="dp-manual-stat-header" title="퇴장(레드카드)">🟥</span>
          <span class="dp-manual-stat-header" title="주장">C</span>
        </div>
        ${Array.from({ length: 11 }, (_, index) => `<div class="dp-manual-row has-stats">
          <div class="dp-slot-label" data-slot-index="${index}">${dpEscape(labels[index] || `${index + 1}`)}</div>
          <input class="dp-input" name="lineup-number-${index}" value="${dpEscape(players[index]?.number ?? '')}" placeholder="번호" />
          <input class="dp-input" name="lineup-name-${index}" value="${dpEscape(getPrefillName(players[index]))}" placeholder="선수 이름" />
          ${buildLineupManualStatCellsHtml(players[index], index)}
        </div>`).join('')}
      </div>
    </div>`;
}

/** 교체 명단 풀폼 모달 본문 HTML — 맨 위 감독 이름 행 + 번호/이름 입력 행 DETAIL_BENCH_ROWS개. */
function buildBenchManualFormHtml(players, coachName) {
  const list = clonePlayers(players || []);
  return `<div class="dp-manual-help">교체 명단과 감독 이름을 입력하면 즉시 반영됩니다. 감독은 이후 API가 다른 감독 정보를 주면 그 값으로 자동 갱신됩니다.</div>
    <div class="dp-form-stack">
      <div class="dp-manual-grid">
        <div class="dp-manual-row dp-manual-header-row">
          <div class="dp-slot-label">감독</div>
          <input class="dp-input dp-manual-coach-input" name="bench-coach" value="${dpEscape(coachName || '')}" placeholder="감독 이름" />
        </div>
        ${Array.from({ length: DETAIL_BENCH_ROWS }, (_, index) => `<div class="dp-manual-row">
          <div class="dp-slot-label">${index + 1}</div>
          <input class="dp-input" name="bench-number-${index}" value="${dpEscape(list[index]?.number ?? '')}" placeholder="번호" />
          <input class="dp-input" name="bench-name-${index}" value="${dpEscape(getPrefillName(list[index]))}" placeholder="선수 이름" />
        </div>`).join('')}
      </div>
    </div>`;
}

/** 부상자 명단 풀폼 모달 본문 HTML — 번호/이름/사유select 입력 행. 기존 항목 위에 빈 행 2개 추가. */
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

/** 모달 종류(kind) → 한글 표시명. */
function getManualKindLabel(kind) {
  if (kind === 'lineup') return '선발 라인업';
  if (kind === 'bench') return '교체 명단';
  return '미출전 선수 명단';
}

/** 해당 fixture/side/kind에 수동 override가 저장돼 있는지 — 모달 "초기화" 버튼 노출 여부 판단. */
function hasManualOverrideForKind(fixtureId, side, kind) {
  const sideData = getManualSideData(fixtureId, side);
  if (!sideData) return false;
  if (kind === 'lineup') return !!sideData.lineup;
  if (kind === 'bench') return !!((sideData.bench && sideData.bench.length) || sideData.coachName);
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
  const effectiveData = getManualModalEffectiveData();
  const content = document.getElementById('manualPanelContent');
  const meta = document.getElementById('manualPanelMeta');
  const resetBtn = document.getElementById('manualPanelReset');
  const panelTitle = document.getElementById('manualPanelTitle');

  if (!content || !meta || !resetBtn || !panelTitle) return;

  panelTitle.textContent = `${DETAIL_SIDE_TITLES[side]} ${getManualKindLabel(kind)}`;
  meta.textContent = `fixtureId ${fixtureId} · ${getTeamName(effectiveData, side)}`;
  resetBtn.hidden = !hasManualOverrideForKind(fixtureId, side, kind);
  const gridToggle = document.getElementById('manualPanelGridToggle');
  if (gridToggle) {
    gridToggle.hidden = true;
    gridToggle.setAttribute('aria-pressed', 'false');
  }

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
      content.innerHTML = `<div id="manualLineupFullForm">${buildLineupManualFormHtml(effectiveData?.[`${side}Lineup`])}</div>`;
      if (gridToggle) gridToggle.hidden = false;
    }
  } else if (kind === 'bench') {
    // 2) 교체 명단은 번호/이름 full form.
    // 감독 칸은 지금 화면에 보이는 감독(수동값이 적용 중이면 수동값, 아니면 API 값)으로 채운다.
    // 선수 행과 같은 getPrefillName(pickName 'roster')을 써서 패널과 똑같이 풀네임/단축명 설정을 따른다.
    const coachName = normalizeCoachName(getPrefillName(effectiveData?.[`${side}Lineup`]?.coach));
    // 교체 명단 칸은 교체 반영(subReflect) 전 명단으로 채운다 — 교체 반영 후 명단(OUT 선수가 벤치로
    // 내려오고 IN 선수는 빠진 상태)을 프리필하면 명단을 안 건드려도 API 명단과 달라 보여, 감독만
    // 바꿔 저장해도 선수 ID 없는 수동 명단으로 덮여 이벤트 연동이 끊기는 문제가 있었다.
    const benchPrefill = clonePlayers(buildEffectiveFixtureData(lineupPanelState.lastFixture)?.[`${side}Lineup`]?.substitutes || []);
    if (lineupPanelState.manualModal) lineupPanelState.manualModal.benchPrefill = benchPrefill;
    content.innerHTML = buildBenchManualFormHtml(benchPrefill, coachName);
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

/** 풀폼 입력 전체를 대응 슬롯으로 이동한다. 빈 이름 행과 주장/카드 체크도 보존한다. */
function remapManualLineupForm(fromFormation, toFormation) {
  const form = document.getElementById('manualLineupFullForm');
  if (!form) return;
  // 모든 입력을 먼저 복사해야 앞 행을 갱신하면서 뒤 행의 원본 값을 잃지 않는다.
  const rows = Array.from({ length: 11 }, (_, index) =>
    [...form.querySelectorAll(`input[name$="-${index}"]`)].map(input => ({
      prefix: input.name.replace(/\d+$/, ''), value: input.value, checked: input.checked,
    })));
  remapLineupFormationSlots(fromFormation, toFormation, rows).forEach((fields, index) => {
    fields?.forEach(field => {
      const input = form.querySelector(`[name="${field.prefix}${index}"]`);
      if (input) { input.value = field.value; input.checked = field.checked; }
    });
  });
}

/** 슬롯 라벨과 다음 변경의 기준 포메이션을 함께 갱신한다. */
function syncManualLineupSlotLabels(formation) {
  const select = document.getElementById('manualLineupFormation');
  if (select) select.dataset.formation = formation;
  const labels = getFormationSlotLabels(formation);
  document.querySelectorAll('#manualPanelContent .dp-slot-label[data-slot-index]').forEach(el => {
    const index = Number(el.dataset.slotIndex);
    el.textContent = labels[index] || `${index + 1}`;
  });
}

/** 라인업 풀폼 입력값 → {formation, startXi} override. 이름 없는 행은 제외. */
function extractLineupOverrideFromForm(form) {
  const formation = getInputValue(form.querySelector('[name="manual-formation"]')?.value) || DETAIL_DEFAULT_FORMATION;
  const labels = getFormationSlotLabels(formation);
  const grids = buildManualGridValues(formation);
  const players = [];

  for (let index = 0; index < 11; index += 1) {
    const name = getInputValue(form.elements[`lineup-name-${index}`]?.value);
    const number = getInputValue(form.elements[`lineup-number-${index}`]?.value);
    if (!name) continue;

    const goals = Math.max(0, Number(form.elements[`lineup-goals-${index}`]?.value) || 0);
    const ownGoals = Math.max(0, Number(form.elements[`lineup-owngoals-${index}`]?.value) || 0);
    const assists = Math.max(0, Number(form.elements[`lineup-assists-${index}`]?.value) || 0);
    const yellow = !!form.elements[`lineup-yellow-${index}`]?.checked;
    const red = !!form.elements[`lineup-red-${index}`]?.checked;
    const captain = !!form.elements[`lineup-captain-${index}`]?.checked;

    players.push({
      playerId: null,
      name,
      nameKoLong: name,
      photoUrl: '',
      number: number || '',
      pos: inferBasePos(labels[index]),
      grid: grids[index] || null,
      _manual: true,
      // 라인업 자체가 없어 API 이벤트와 연결될 방법이 없는 선수의 골/카드 수동 입력값 —
      // lpManualPlayerEventsOverride(lineup-events.js)가 렌더 시 events와 같은 모양으로 변환.
      manualGoals: goals || undefined,
      manualOwnGoals: ownGoals || undefined,
      manualAssists: assists || undefined,
      manualYellow: yellow || undefined,
      manualRed: red || undefined,
      manualCaptain: captain || undefined,
    });
  }

  return players.length ? { formation, startXi: players } : null;
}

/** 교체 명단 풀폼 입력값 → 선수 배열. 이름 없는 행은 제외. */
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

/** 부상자 명단 풀폼 입력값 → 부상자 배열. 이름 없는 행은 제외, type은 사유로부터 자동 분류. */
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
  if (kind === 'lineup' && lineupPanelState.gridState?.fullFormRows) toggleManualLineupGrid();

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
      const extracted = extractBenchOverrideFromForm(form);
      const rawBenchLineup = lineupPanelState.lastFixture?.[`${side}Lineup`];
      const prefill = modalState.benchPrefill || [];
      const sameRows = (players, rows) => players.length === rows.length && players.every((player, index) =>
        getPrefillName(player) === rows[index].name
        && String(player.number ?? '') === String(rows[index].number ?? ''));
      // 프리필된 이름과 같은 행은 원래 선수 객체(playerId/사진/포지션/원본 이름)를 이어받는다 —
      // 명단을 일부 고쳐 저장해도 기존 선수는 ID가 유지돼 교체/카드 이벤트 연동이 끊기지 않는다.
      // 같은 이름(예: 김태현 2명)이 있어도 서로 다른 선수로 남도록, 같은 줄의 프리필(이름+번호) ->
      // 이름+번호가 같은 다른 줄 -> 이름만 같은 줄 순으로 찾고, 한 번 쓴 프리필 행은 다시 쓰지 않는다.
      const used = new Set();
      const sameName = (player, row) => getPrefillName(player) === row.name;
      const sameNumber = (player, row) => String(player.number ?? '') === String(row.number ?? '');
      const findSource = (row, index) => {
        const candidates = [
          i => i === index && sameName(prefill[i], row) && sameNumber(prefill[i], row),
          i => sameName(prefill[i], row) && sameNumber(prefill[i], row),
          i => sameName(prefill[i], row),
        ];
        for (const match of candidates) {
          const i = prefill.findIndex((_, idx) => !used.has(idx) && match(idx));
          if (i >= 0) { used.add(i); return prefill[i]; }
        }
        return null;
      };
      const bench = extracted.map((row, index) => {
        const source = findSource(row, index);
        if (!source || !Number(source.playerId)) return row;
        return { ...source, number: row.number || source.number || '' };
      });
      // 프리필된 API 명단을 그대로 저장한 경우(번호/이름 순서까지 동일)는 수동값을 만들지 않는다 —
      // 불필요한 override가 API 갱신을 가리지 않도록.
      const rawBench = clonePlayers(rawBenchLineup?.substitutes || []);
      const sameAsApi = sameRows(rawBench, extracted);
      if (sameRows(prefill, extracted) && !sameAsApi) {
        // 명단은 손대지 않음(감독만 바꾼 경우 등) — 기존 수동 명단/API 명단 상태를 그대로 둔다.
      } else if (bench.length && !sameAsApi) {
        sideData.bench = bench;
        sideData.benchApiBaseline = getBenchApiBaselineKey(rawBenchLineup);
      } else {
        delete sideData.bench;
        delete sideData.benchApiBaseline;
      }

      // 감독 — 비우거나 API 값과 같게 두면 수동값 삭제(API 값 사용). 다르면 지금 API 감독 키를
      // 함께 저장해, 이후 API 감독이 바뀌면(새 정보) buildEffectiveFixtureData가 수동값을 무시한다.
      const rawLineup = lineupPanelState.lastFixture?.[`${side}Lineup`];
      const coachInput = normalizeCoachName(form.elements['bench-coach']?.value);
      const rawCoach = rawLineup?.coach;
      const matchesApi = !coachInput
        || coachInput === normalizeCoachName(rawCoach?.name)
        || coachInput === normalizeCoachName(rawCoach?.nameKoLong);
      if (matchesApi) {
        delete sideData.coachName;
        delete sideData.coachApiBaseline;
      } else {
        sideData.coachName = coachInput;
        sideData.coachApiBaseline = getCoachApiBaselineKey(rawLineup);
      }
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

/** 모달 "초기화" 버튼 — 현재 kind/side의 수동 override만 지우고 모달을 닫는다. */
function resetManualPanelKind() {
  const modalState = lineupPanelState.manualModal;
  if (!modalState) return;
  deleteManualKind(modalState.fixtureId, modalState.side, modalState.kind);
  // 교체 명단 모달엔 감독 칸도 있으므로 초기화 시 감독 수동값도 같이 지운다.
  if (modalState.kind === 'bench') deleteManualKind(modalState.fixtureId, modalState.side, 'coach');
  closeManualPanel();
  rerenderLineupPanels();
}

/** 감독 인라인 편집 종료 — saveValue가 true면 입력값을 manual store에 저장 후 항상 재렌더. */
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
      if (trimmed) {
        sideData.coachName = trimmed;
        sideData.coachApiBaseline = getCoachApiBaselineKey(lineupPanelState.lastFixture?.[`${side}Lineup`]);
      } else {
        delete sideData.coachName;
        delete sideData.coachApiBaseline;
      }
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

/** 주심 인라인 편집 종료 — saveValue가 true면 입력값을 manual store에 저장 후 항상 재렌더. */
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

/** 경기장 인라인 편집 종료 — finishRefereeInlineEdit와 동일한 흐름. */
function finishVenueInlineEdit(hostEl, inputEl, saveValue) {
  const fixtureId = getActiveFixtureId();
  if (hostEl) hostEl.classList.remove('dp-venue-editing');
  if (!hostEl || !fixtureId) {
    rerenderLineupPanels();
    return;
  }
  if (saveValue) setManualVenue(fixtureId, inputEl.value);
  rerenderLineupPanels();
}

/** API에 경기장 이름이 없을 때만 허용되는 인라인 경기장 편집 진입점 (주심과 동일한 방식). */
function startVenueInlineEdit(hostEl) {
  if (!hostEl || hostEl.dataset.apiMissing !== 'true') return;
  if (hostEl.querySelector('input')) return;

  const fixtureId = getActiveFixtureId();
  if (!fixtureId) return;

  const current = String(getManualEntry(fixtureId)?.venueName || '').trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dp-coach-inline-input';   // 동일 스타일 재사용
  input.value = current;
  input.placeholder = '경기장 이름';

  hostEl.classList.add('dp-venue-editing');
  hostEl.textContent = '';
  hostEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = saveValue => {
    if (done) return;
    done = true;
    finishVenueInlineEdit(hostEl, input, saveValue);
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
    if (typeof popoutModeEnabled === 'function' && popoutModeEnabled()) {
      window.Popout.open('manual', { kind: manualBtn.dataset.manual, side: manualBtn.dataset.side });
    } else {
      openManualPanel(manualBtn.dataset.manual, manualBtn.dataset.side);
    }
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
  if (event.target.id === 'manualPanelGridToggle') {
    toggleManualLineupGrid();
    return;
  }

  const backdrop = document.getElementById('manualPanelBackdrop');
  if (backdrop && event.target === backdrop) closeManualPanel();
});

/**
 * 수동 입력 폼(#manualPanelForm) 공통 — Enter 키로 다음 입력칸으로 포커스 이동(번호 -> 같은 줄 이름 -> 다음 줄 번호, 그 외는 같은 열 다음 행).
 * input name이 "{prefix}-{index}" 형식(lineup-name-0, lineup-goals-3, bench-number-2,
 * injury-name-5 등 — 이 파일의 모든 풀폼/그리드 행이 이 규칙을 따름)이면 다음 인덱스의
 * 같은 prefix 필드로 넘어간다. 다음 행에 그 필드가 없으면(마지막 행 등) 아무 동작 안 함.
 */
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  // 한글/일본어 등 IME 조합 중 후보를 확정하는 Enter까지 다음 칸 이동으로 가로채면, 조합
  // 중이던 글자가 커밋되지 않거나 포커스가 엉뚱한 칸으로 튀는 문제가 있다 — isComposing과
  // 구형 브라우저의 keyCode 229(조합 확정용 Enter 표시)를 함께 확인해 건너뛴다.
  if (event.isComposing || event.keyCode === 229) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const form = target.closest('#manualPanelForm');
  if (!form) return;

  event.preventDefault();
  const name = target.getAttribute('name') || '';
  const match = name.match(/^(.*-)(\d+)$/);
  if (!match) return;
  const index = Number(match[2]);
  // 번호 → 이름 → 다음 줄 번호 순서(엑셀식 입력 흐름): 번호 칸 Enter는 같은 줄 이름 칸으로,
  // 이름 칸 Enter는 다음 줄 번호 칸으로 이동한다. 그 외 칸(골/도움 등)은 같은 열의 다음 행.
  const rowMatch = match[1].match(/^(.*-)(number|name)-$/);
  let nextName = `${match[1]}${index + 1}`;
  if (rowMatch && rowMatch[2] === 'number' && form.elements[`${rowMatch[1]}name-${index}`]) {
    nextName = `${rowMatch[1]}name-${index}`;
  } else if (rowMatch && rowMatch[2] === 'name' && form.elements[`${rowMatch[1]}number-${index + 1}`]) {
    nextName = `${rowMatch[1]}number-${index + 1}`;
  }
  const nextField = form.elements[nextName];
  if (!nextField) return;
  nextField.focus();
  if (nextField.type !== 'checkbox' && typeof nextField.select === 'function') nextField.select();
});

document.addEventListener('change', event => {
  if (event.target?.matches('#manualLineupFullForm input[name^="lineup-captain-"]') && event.target.checked) {
    document.querySelectorAll('#manualLineupFullForm input[name^="lineup-captain-"]').forEach(input => {
      if (input !== event.target) input.checked = false;
    });
  }
  if (event.target?.classList?.contains('dp-grid-name-input')) {
    saveManualGridPlayerName(event.target);
    return;
  }
  if (event.target?.id === 'manualLineupFormation') {
    remapManualLineupForm(event.target.dataset.formation, event.target.value);
    syncManualLineupSlotLabels(event.target.value);
  }
  if (event.target?.id === 'manualGridFormation' && lineupPanelState.gridState) {
    const state = lineupPanelState.gridState;
    state.slotPlayerIds = recomputeGridSlotsForFormation(state.side, event.target.value);
    state.formation = event.target.value;
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
    return;
  }
  const venueEl = event.target.closest('.dp-venue-name');
  if (venueEl && venueEl.dataset.apiMissing === 'true') {
    startVenueInlineEdit(venueEl);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && isManualPanelOpen()) {
    event.preventDefault();
    closeManualPanel();
    return;
  }
  // 이름 입력 칸에서 Enter → blur시켜 'change' 저장을 즉시 트리거.
  if (event.key === 'Enter' && event.target?.classList?.contains('dp-grid-name-input')) {
    event.preventDefault();
    event.target.blur();
  }
});

