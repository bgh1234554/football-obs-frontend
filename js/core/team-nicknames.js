// 팀 ID를 기준으로 저장하고, ID가 없는 팀만 원래 이름으로 구분한다.
const TEAM_NICKNAME_KEY = 'obs.team.nicknames.v1';

/**
 * 경기 정보에서 한쪽 팀의 닉네임 저장 키를 만든다.
 * 팀 ID가 있으면 ID 문자열, 없으면 `n:{팀 이름}`(기본값 HOME/AWAY는 제외), 둘 다 없으면 빈 키.
 * @param {object} matchInfo  matchInfo 또는 같은 필드({side}TeamId/{side}TeamName)를 가진 객체
 * @param {'home'|'away'} side
 * @returns {{key: string, name: string}} key가 비어 있으면 저장할 수 없는 팀
 */
function teamNicknameIdentity(matchInfo, side) {
  const id = Number(matchInfo?.[`${side}TeamId`]);
  const name = String(matchInfo?.[`${side}TeamName`] || matchInfo?.[`${side}TeamNameShort`] || '').trim();
  const key = Number.isSafeInteger(id) && id > 0 ? String(id)
    : name && !['HOME', 'AWAY'].includes(name) ? `n:${name}` : '';
  return { key, name };
}

/** 저장된 팀 닉네임 맵({키: {name, nickname}})을 읽는다. 저장값이 없거나 깨졌으면 빈 객체. */
function readTeamNicknames() {
  try {
    const map = JSON.parse(localStorage.getItem(TEAM_NICKNAME_KEY) || '{}');
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch { return {}; }
}

/** identity 키로 저장된 닉네임. 없으면 빈 문자열. */
function getTeamNickname(identity) {
  const entry = readTeamNicknames()[identity?.key];
  return typeof entry?.nickname === 'string' ? entry.nickname : '';
}

/**
 * 팀 닉네임을 저장한다. 앞뒤 공백을 지우고 30자까지만 저장하며, 빈 값이면 그 팀 항목을 삭제한다.
 * @param {{key: string, name?: string}} identity  teamNicknameIdentity 결과
 * @param {string} value  새 닉네임 (빈 값 = 초기화)
 * @returns {boolean} 저장 성공 여부 (키가 없거나 localStorage 쓰기 실패 시 false)
 */
function setTeamNickname(identity, value) {
  if (!identity?.key) return false;
  const map = readTeamNicknames();
  const nickname = String(value || '').trim().slice(0, 30);
  if (nickname) map[identity.key] = { name: identity.name, nickname };
  else delete map[identity.key];
  try {
    localStorage.setItem(TEAM_NICKNAME_KEY, JSON.stringify(map));
    return true;
  } catch { return false; }
}

/** 패널 표시용 팀 이름 — 저장한 닉네임이 있으면 닉네임, 없으면 fallback(원래 이름). */
function teamNicknameDisplay(matchInfo, side, fallback) {
  return getTeamNickname(teamNicknameIdentity(matchInfo, side)) || fallback;
}

/**
 * 점수판 한쪽 팀의 닉네임 identity. 경기 연동 중이면 fixture.js가 보관한 팀 ID 기준, 아니면(수동 모드) 현재 팀 이름 기준.
 * 점수판 원본 이름은 그대로 보존해 폴링·초기화·긴 이름 설정과 닉네임이 섞이지 않게 한다.
 */
function scoreboardTeamIdentity(side) {
  return state.teamNicknameTeams?.[side]
    || teamNicknameIdentity({ [`${side}TeamName`]: state[`${side}Name`] }, side);
}

/** 점수판에 표시할 팀 이름 — 닉네임 > state의 원래 이름 > HOME/AWAY 순. */
function scoreboardTeamDisplayName(side) {
  return getTeamNickname(scoreboardTeamIdentity(side)) || state[`${side}Name`] || side.toUpperCase();
}

/** 현재 경기 홈/원정 팀 라벨에 붙일 클릭·키보드 편집용 HTML 속성 문자열 (앞에 공백 포함). */
function teamNicknameLabelAttrs(side) {
  return ` data-team-nickname-side="${side}" role="button" tabindex="0" aria-label="${side === 'home' ? '홈' : '원정'} 팀 닉네임 편집"`;
}

/**
 * 상대전적·최근 경기 목록처럼 행마다 팀이 다른 라벨을 편집 대상으로 만든다.
 * 현재 경기의 홈/원정 대신 그 행 팀의 키를 data 속성에 저장한다. 키를 만들 수 없는 팀은 건드리지 않는다.
 */
function bindTeamNicknameLabel(element, matchInfo, side) {
  const identity = teamNicknameIdentity(matchInfo, side);
  if (!identity.key) return;
  element.dataset.teamNicknameKey = identity.key;
  element.dataset.teamNicknameName = identity.name;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `${identity.name} 팀 닉네임 편집`);
  element.tabIndex = 0;
}

/** 닉네임 변경 후 점수판·라인업 패널을 다시 그리고, 그 밖의 패널에는 'team-nicknames:change' 이벤트로 알린다. */
function refreshTeamNicknames() {
  render();
  if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  document.dispatchEvent(new CustomEvent('team-nicknames:change'));
}

/**
 * 선수 닉네임과 같은 팝업(pm-*)으로 팀 닉네임 편집 창을 연다. 저장/초기화/취소, Enter 저장, Esc 닫기.
 * @param {{key: string, name?: string}} identity  편집할 팀 (창을 연 뒤 경기가 바뀌어도 이 팀에 저장)
 * @param {number} x  팝업 위치 (클릭 좌표)
 * @param {number} y
 */
function showTeamNicknameEditor(identity, x, y) {
  if (!identity?.key) return;
  pmHideAll();
  pmContainer().innerHTML = `<div class="pm-popup" id="teamNickPopup" role="dialog" aria-label="팀 닉네임 설정">
    <div class="pm-nick-wrap">
      <div class="pm-nick-title">팀 닉네임 설정 · ${pmEsc(identity.name || `팀 #${identity.key}`)}</div>
      <input class="pm-nick-input" id="teamNickInput" aria-label="팀 닉네임" type="text"
        placeholder="빈 칸으로 저장하면 초기화" maxlength="30" autocomplete="off" value="${pmEsc(getTeamNickname(identity))}">
      <div class="pm-nick-btns">
        <button class="pm-btn pm-btn-primary" id="teamNickSave">저장</button>
        <button class="pm-btn pm-btn-danger" id="teamNickClear">초기화</button>
        <button class="pm-btn" id="teamNickCancel">취소</button>
      </div>
      <div id="teamNickError" role="alert"></div>
    </div>
  </div>`;
  const popup = document.getElementById('teamNickPopup');
  const input = document.getElementById('teamNickInput');
  pmPositionPopup(popup, x, y);
  input.focus();
  input.select();
  /** 클릭 당시의 팀에 저장하고 창을 닫는다. 저장 실패 시 창에 오류를 표시한다. */
  const save = value => {
    if (!setTeamNickname(identity, value)) {
      document.getElementById('teamNickError').textContent = '닉네임을 저장하지 못했습니다.';
      return;
    }
    pmHideAll();
    refreshTeamNicknames();
  };
  document.getElementById('teamNickSave').onclick = () => save(input.value);
  document.getElementById('teamNickClear').onclick = () => save('');
  document.getElementById('teamNickCancel').onclick = pmHideAll;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(input.value); }
    if (e.key === 'Escape') { e.stopPropagation(); pmHideAll(); }
  });
}

/** 설정 이름 탭 '목록 보기' — 저장된 팀 닉네임 표와 개별 삭제 버튼을 모달로 연다. */
function showTeamNicknameList() {
  const entries = Object.entries(readTeamNicknames()).filter(([, entry]) => typeof entry?.nickname === 'string');
  pmHideAll();
  pmContainer().innerHTML = `<div class="pm-modal-backdrop" id="teamNickBackdrop">
    <div class="pm-modal pm-modal-wide" role="dialog" aria-label="팀 닉네임 목록">
      <div class="pm-modal-header"><span class="pm-modal-title">팀 닉네임 목록 (${entries.length}개)</span>
        <button class="pm-modal-close" id="teamNickListClose" aria-label="닫기">&#10005;</button></div>
      <div class="pm-modal-body"><table class="pm-szn-table pm-nick-list-table">
        <thead><tr><th>원래 이름</th><th>teamId</th><th>닉네임</th><th></th></tr></thead>
        <tbody>${entries.length ? entries.map(([key, entry]) => `<tr>
          <td class="pm-nick-list-name">${pmEsc(entry.name || `팀 #${key}`)}</td>
          <td class="pm-nick-list-id">${pmEsc(key.startsWith('n:') ? '없음 (이름 매칭)' : key)}</td>
          <td class="pm-nick-list-nick">${pmEsc(entry.nickname)}</td>
          <td class="pm-nick-list-action"><button class="pm-btn pm-btn-danger" data-team-nick-delete="${pmEsc(key)}">삭제</button></td>
        </tr>`).join('') : '<tr><td colspan="4" class="pm-empty">저장된 팀 닉네임 없음</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
  document.getElementById('teamNickListClose').onclick = pmHideAll;
  document.getElementById('teamNickBackdrop').onclick = e => {
    if (e.target === e.currentTarget) return pmHideAll();
    const button = e.target.closest('[data-team-nick-delete]');
    if (!button) return;
    if (!setTeamNickname({ key: button.dataset.teamNickDelete }, '')) return;
    refreshTeamNicknames();
    showTeamNicknameList();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const selector = '#homeName, #awayName, [data-team-nickname-side], [data-team-nickname-key]';
  /** 클릭/키보드로 선택한 라벨의 팀을 찾아 편집 창을 연다 — 행 단위 키 > 점수판 > 현재 경기 라인업 순. */
  const open = (target, x, y) => {
    if (target.dataset.teamNicknameKey) {
      showTeamNicknameEditor({ key: target.dataset.teamNicknameKey, name: target.dataset.teamNicknameName }, x, y);
      return;
    }
    const scoreboard = target.id === 'homeName' || target.id === 'awayName';
    const side = scoreboard ? (target.id === 'homeName' ? 'home' : 'away') : target.dataset.teamNicknameSide;
    const identity = scoreboard ? scoreboardTeamIdentity(side)
      : teamNicknameIdentity(lineupPanelState.lastEffectiveData?.matchInfo || lineupPanelState.lastFixture?.matchInfo, side);
    showTeamNicknameEditor(identity, x, y);
  };
  // 선수 메뉴의 바깥 클릭 처리가 끝난 뒤 같은 팝업 컨테이너에 팀 편집기를 연다.
  document.addEventListener('click', e => {
    const target = e.target.closest(selector);
    if (target) open(target, e.clientX, e.clientY);
  });
  document.addEventListener('keydown', e => {
    // 키를 누르고 있을 때의 반복 입력과 Element가 아닌 대상(document 등)은 무시한다.
    if (e.repeat || !(e.target instanceof Element)) return;
    const target = e.target.closest(selector);
    if (!target || !['Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    const rect = target.getBoundingClientRect();
    open(target, rect.left, rect.bottom);
  });
  document.getElementById('showTeamNicknameListBtn')?.addEventListener('click', showTeamNicknameList);
  document.getElementById('clearAllTeamNicknamesBtn')?.addEventListener('click', () => {
    if (!confirm('저장된 모든 팀 닉네임을 초기화할까요?')) return;
    try { localStorage.removeItem(TEAM_NICKNAME_KEY); } catch { return; }
    refreshTeamNicknames();
  });
});

window.addEventListener('storage', e => {
  if (e.key === TEAM_NICKNAME_KEY || e.key === null) refreshTeamNicknames();
});
