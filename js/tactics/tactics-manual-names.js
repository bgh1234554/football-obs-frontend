// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [전술판 - 선수 이름 수동 입력] 경기 ID가 연동되지 않은 상태에서 홈/원정 탭으로 나눠
// 팀 이름·배경색·글자색(테마 탭과 실시간 연동) + 포지션별 선수 이름을 직접 입력.
// 포지션별 이름/번호는 "저장" 버튼을 눌러야 전술판에 반영되지만, 팀 이름/색상은 테마 탭의
// 색상 피커처럼 입력 즉시 commit된다(state.colors, window.colorMap 실제 input까지 동기화).
// 경기 ID가 로딩되면(applyLineupPanels) 포지션 이름은 즉시 사라지고, 이후 경기 ID를 지워도
// 복원되지 않는다(별도 저장소 없이 tacticsState.lineup에만 존재).
// lineup-manual-store.js/lineup-data.js(getFormationSlotLabels, dpEscape, getInputValue,
// DETAIL_DEFAULT_FORMATION), lineup-manual-modal.js(buildFormationOptionsHtml),
// theme.js(normalizeHex, window.colorMap)에 의존하지만 전부 클릭/입력 시점에만 호출되므로
// <script> 로드 순서는 무관하다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** tacticsState.lineup의 해당 side가 이 모달로 저장된 수동 데이터인지. */
function tacticsIsManualLineupSide(side) {
  return !!tacticsState.lineup?.[side]?._manual;
}

/** side의 팀 컬러 기본값 — tacticsRenderTokens()의 fallback 색과 동일하게 맞춤. */
function tacticsTeamColorDefault(side, part) {
  if (part === 'Text') return '#ffffff';
  return side === 'home' ? '#3B82F6' : '#EF4444';
}

/** 모달 한 사이드 탭의 본문 HTML — 팀 이름/색상 + 포메이션 select + 슬롯별 번호/이름 입력 11행. */
function buildTacticsNamesSideFormHtml(side) {
  const toolbarFmSel = document.getElementById(side === 'home' ? 'tactics-home-fm' : 'tactics-away-fm');
  const currentSideLineup = tacticsState.lineup?.[side];
  const isManual = tacticsIsManualLineupSide(side);
  const formation = (isManual && currentSideLineup?.formation) || toolbarFmSel?.value || DETAIL_DEFAULT_FORMATION;
  const labels = getFormationSlotLabels(formation);
  const players = isManual ? (currentSideLineup.players || []) : [];
  const teamName = state[`${side}Name`] || (side === 'home' ? 'HOME' : 'AWAY');
  const bgColor = state.colors[`${side}Bg`] || tacticsTeamColorDefault(side, 'Bg');
  const textColor = state.colors[`${side}Text`] || tacticsTeamColorDefault(side, 'Text');

  return `<div class="dp-manual-help">팀 이름·배경색·글자색은 입력 즉시 점수판/전술판/테마 탭에 함께 반영됩니다. 포지션별 선수 이름은 비워두면 포지션 약어(GK/CB 등)가 그대로 표시됩니다.</div>
    <div class="dp-form-stack">
      <div class="tn-team-row">
        <label class="tn-name-group">
          <span class="tn-swatch-label">팀명</span>
          <input class="dp-input tn-teamname-input" value="${dpEscape(teamName)}" placeholder="${side === 'home' ? 'HOME' : 'AWAY'}" />
        </label>
        <label class="tn-swatch-group" title="배경색">
          <span class="tn-swatch-label">배경</span>
          <span class="tn-swatch" style="background:${dpEscape(bgColor)};">
            <input type="color" class="tn-color-bg" value="${dpEscape(bgColor)}" />
          </span>
        </label>
        <label class="tn-swatch-group" title="글자색">
          <span class="tn-swatch-label">글자</span>
          <span class="tn-swatch" style="background:${dpEscape(textColor)};">
            <input type="color" class="tn-color-text" value="${dpEscape(textColor)}" />
          </span>
        </label>
      </div>
      <label class="dp-field">
        <span class="dp-field-label">포메이션</span>
        <select class="dp-select tn-formation-select" data-side="${side}">
          ${buildFormationOptionsHtml(formation)}
        </select>
      </label>
      <div class="dp-manual-grid">
        ${labels.map((label, index) => `<div class="dp-manual-row">
          <div class="dp-slot-label" data-slot-index="${index}">${dpEscape(label || `${index + 1}`)}</div>
          <input class="dp-input" name="tn-number-${side}-${index}" value="${dpEscape(players[index]?._enteredNumber ?? '')}" placeholder="번호" />
          <input class="dp-input" name="tn-name-${side}-${index}" value="${dpEscape(players[index]?._enteredName ?? '')}" placeholder="선수 이름" />
        </div>`).join('')}
      </div>
    </div>`;
}

/** 팀 이름 입력 — 입력 즉시(키 입력마다) state에 반영하고 점수판을 다시 그린다. 테마 탭 수동모드 인풋도 동기화. */
function tacticsCommitTeamName(side, name) {
  state[`${side}Name`] = name;
  const mirror = document.getElementById(side === 'home' ? 'manualHomeName' : 'manualAwayName');
  if (mirror) mirror.value = name;
  if (typeof render === 'function') render();
  if (typeof persist === 'function') persist();
}

/**
 * 팀 배경/글자색 변경 commit — state.colors + 테마 탭의 실제 색상 피커(window.colorMap)까지
 * 그대로 동기화해서, 이 모달에서 바꾼 색이 테마 탭에도 같이 반영되도록 한다.
 * 전술판 바둑알은 CSS 변수가 아니라 state.colors를 직접 읽어 그리므로 tacticsRenderTokens()로 즉시 재렌더.
 */
function tacticsCommitTeamColor(side, part, value) {
  const key = `${side}${part}`; // homeBg | homeText | awayBg | awayText
  const normalized = (typeof normalizeHex === 'function' && normalizeHex(value)) || value;
  if (!normalized) return;
  state.colors[key] = normalized;

  const entry = (window.colorMap || []).find(([, mappedKey]) => mappedKey === key);
  if (entry) {
    const [colorInputId, , cssVar] = entry;
    if (typeof setCSS === 'function') setCSS(cssVar, normalized);
    const colorInput = document.getElementById(colorInputId);
    if (colorInput) colorInput.value = normalized;
    const hexInput = document.getElementById(colorInputId + 'Hex');
    if (hexInput) hexInput.value = normalized;
  }

  state.teamColorOverride = true;
  state.teamColorOverrideFixtureId = (typeof getLastFixtureId === 'function') ? getLastFixtureId() : null;

  if (typeof persist === 'function') persist();
  if (typeof render === 'function') render();
  document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key } }));
  // 경기 ID가 없는 상태라 lineup-render.js의 theme:colors-changed 리스너가 early-return하므로 직접 재렌더.
  if (typeof tacticsRenderTokens === 'function') tacticsRenderTokens();
}

/** 모달 본문 전체 렌더 — 홈/원정 패널을 둘 다 DOM에 마운트해두고 탭은 표시 여부만 토글한다. */
function renderTacticsNamesPanel() {
  const content = document.getElementById('tacticsNamesContent');
  if (!content) return;
  content.innerHTML = `
    <div data-tn-side-panel="home">${buildTacticsNamesSideFormHtml('home')}</div>
    <div data-tn-side-panel="away" style="display:none;">${buildTacticsNamesSideFormHtml('away')}</div>
  `;
}

/** 탭 전환 — 버튼 활성 표시 + 해당 side 패널만 보이게. */
function setTacticsNamesTab(side) {
  document.querySelectorAll('.tn-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.side === side));
  document.querySelectorAll('[data-tn-side-panel]').forEach(panel => {
    panel.style.display = panel.dataset.tnSidePanel === side ? '' : 'none';
  });
}

/** "선수 이름 입력" 버튼의 활성/비활성 — 경기 데이터가 로딩돼 있으면 비활성화. */
function tacticsSyncManualNamesButtonState() {
  const btn = document.getElementById('btn-tactics-manual-names');
  if (!btn) return;
  const fixtureLoaded = !!(typeof lineupPanelState !== 'undefined' && lineupPanelState?.lastFixture);
  btn.disabled = fixtureLoaded;
  btn.title = fixtureLoaded
    ? '경기 데이터가 연동되어 있으면 사용할 수 없습니다. 경기 ID를 지우면 다시 사용할 수 있습니다.'
    : '경기 ID가 없을 때 포지션별로 선수 이름을 직접 입력합니다.';
}

/** 모달 오픈 — 경기 데이터가 로딩 중이면 막는다(버튼도 disabled지만 이중 가드). */
function openTacticsNamesPanel() {
  if (typeof lineupPanelState !== 'undefined' && lineupPanelState?.lastFixture) return;
  const backdrop = document.getElementById('tacticsNamesBackdrop');
  if (!backdrop) return;
  renderTacticsNamesPanel();
  setTacticsNamesTab('home');
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
}

/** 모달 닫기. 포지션별 선수 이름/번호는 저장(저장 버튼) 전이면 버려지지만,
 * 팀 이름/배경색/글자색은 입력 즉시 commit되므로 모달을 그냥 닫아도 유지된다. */
function closeTacticsNamesPanel() {
  const backdrop = document.getElementById('tacticsNamesBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
}

function isTacticsNamesPanelOpen() {
  const backdrop = document.getElementById('tacticsNamesBackdrop');
  return !!(backdrop && backdrop.classList.contains('open'));
}

/**
 * 비워둔 번호칸의 기본값(슬롯 인덱스+1)을 채운다. 그 기본값을 다른 칸에서 이미 명시적으로
 * 쓰고 있으면 충돌을 피해 미사용 번호 중 가장 작은 값으로 대체한다.
 */
function resolveTacticsNumberDefaults(rawNumbers) {
  const usedNumbers = new Set(
    rawNumbers.map(Number).filter(n => Number.isFinite(n) && n > 0)
  );
  return rawNumbers.map((entered, index) => {
    if (entered) {
      const explicit = Number(entered);
      return Number.isFinite(explicit) && explicit > 0 ? explicit : null;
    }
    let candidate = index + 1;
    while (usedNumbers.has(candidate)) candidate += 1;
    usedNumbers.add(candidate);
    return candidate;
  });
}

/** 폼의 한 side 입력값 → TACTICS_MOCK_LINEUP과 같은 shape의 players 배열. */
function extractTacticsNamesSideFromForm(form, side, formation) {
  const labels = getFormationSlotLabels(formation);
  const rawNumbers = labels.map((_, index) => getInputValue(form.elements[`tn-number-${side}-${index}`]?.value));
  const resolvedNumbers = resolveTacticsNumberDefaults(rawNumbers);

  return labels.map((label, index) => {
    const name = getInputValue(form.elements[`tn-name-${side}-${index}`]?.value);
    return {
      nameKo: name || label,
      number: resolvedNumbers[index],
      pos: label,
      _isReal: !!name,
      _manual: true,
      _enteredName: name,
      _enteredNumber: rawNumbers[index],
    };
  });
}

/** 저장 — 홈/원정 폼 입력값으로 새 lineup 객체를 만들어 전술판에 바로 적용한다. */
function saveTacticsNamesPanel() {
  const form = document.getElementById('tacticsNamesForm');
  if (!form) return;

  const homeFormation = getInputValue(form.querySelector('[data-tn-side-panel="home"] .tn-formation-select')?.value) || DETAIL_DEFAULT_FORMATION;
  const awayFormation = getInputValue(form.querySelector('[data-tn-side-panel="away"] .tn-formation-select')?.value) || DETAIL_DEFAULT_FORMATION;

  // 팀 이름/색상은 입력 즉시(tacticsCommitTeamName/tacticsCommitTeamColor) 이미 state에 반영돼 있으므로 그대로 읽는다.
  const lineup = {
    home: {
      teamName: state.homeName || '홈팀',
      formation: homeFormation,
      players: extractTacticsNamesSideFromForm(form, 'home', homeFormation),
      _manual: true,
    },
    away: {
      teamName: state.awayName || '어웨이팀',
      formation: awayFormation,
      players: extractTacticsNamesSideFromForm(form, 'away', awayFormation),
      _manual: true,
    },
  };

  tacticsApplyLineup(lineup);
  closeTacticsNamesPanel();
}

/** 모달 "초기화" — 전술판을 포지션 약어 기본 상태로 되돌리고 모달을 닫는다. */
function resetTacticsNamesPanel() {
  tacticsApplyLineup(TACTICS_MOCK_LINEUP);
  closeTacticsNamesPanel();
}

document.addEventListener('click', event => {
  const tab = event.target.closest('.tn-tab');
  if (tab) {
    setTacticsNamesTab(tab.dataset.side);
    return;
  }
  if (event.target.id === 'tacticsNamesClose' || event.target.id === 'tacticsNamesCancel') {
    closeTacticsNamesPanel();
    return;
  }
  if (event.target.id === 'tacticsNamesSave') {
    saveTacticsNamesPanel();
    return;
  }
  if (event.target.id === 'tacticsNamesReset') {
    resetTacticsNamesPanel();
    return;
  }
  const backdrop = document.getElementById('tacticsNamesBackdrop');
  if (backdrop && event.target === backdrop) closeTacticsNamesPanel();
});

// 팀 이름 입력 — 키 입력마다 즉시 점수판에 반영(기존 수동모드 이름 입력과 동일한 UX).
// 색상 피커는 드래그 중 스와치 미리보기만(가벼움) — 실제 commit은 'change'에서.
document.addEventListener('input', event => {
  const nameInput = event.target.closest('.tn-teamname-input');
  if (nameInput) {
    const side = nameInput.closest('[data-tn-side-panel]')?.dataset.tnSidePanel;
    if (side) tacticsCommitTeamName(side, nameInput.value);
    return;
  }
  const colorInput = event.target.closest('.tn-color-bg, .tn-color-text');
  if (colorInput) {
    const swatch = colorInput.closest('.tn-swatch');
    if (swatch) swatch.style.background = colorInput.value;
  }
});

document.addEventListener('change', event => {
  // 모달 안 포메이션 select 변경 시 슬롯 라벨만 갱신 (입력값은 그대로 유지).
  const sel = event.target.closest('.tn-formation-select');
  if (sel) {
    const panel = sel.closest('[data-tn-side-panel]');
    if (!panel) return;
    const labels = getFormationSlotLabels(sel.value);
    panel.querySelectorAll('.dp-slot-label[data-slot-index]').forEach(el => {
      const idx = Number(el.dataset.slotIndex);
      el.textContent = labels[idx] || `${idx + 1}`;
    });
    return;
  }

  // 팀 배경/글자색 변경 — 테마 탭 색상 피커와 동일하게 선택 즉시 commit.
  const colorInput = event.target.closest('.tn-color-bg, .tn-color-text');
  if (colorInput) {
    const side = colorInput.closest('[data-tn-side-panel]')?.dataset.tnSidePanel;
    if (side) tacticsCommitTeamColor(side, colorInput.classList.contains('tn-color-bg') ? 'Bg' : 'Text', colorInput.value);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && isTacticsNamesPanelOpen()) {
    event.preventDefault();
    closeTacticsNamesPanel();
  }
});

document.addEventListener('DOMContentLoaded', tacticsSyncManualNamesButtonState);
