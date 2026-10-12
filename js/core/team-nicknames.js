// 팀 ID를 기준으로 저장하고, ID가 없는 팀만 원래 이름으로 구분한다.
const TEAM_NICKNAME_KEY = 'obs.team.nicknames.v1';

function teamNicknameIdentity(matchInfo, side) {
  const id = Number(matchInfo?.[`${side}TeamId`]);
  const name = String(matchInfo?.[`${side}TeamName`] || matchInfo?.[`${side}TeamNameShort`] || '').trim();
  const key = Number.isSafeInteger(id) && id > 0 ? String(id)
    : name && !['HOME', 'AWAY'].includes(name) ? `n:${name}` : '';
  return { key, name };
}

function readTeamNicknames() {
  try {
    const map = JSON.parse(localStorage.getItem(TEAM_NICKNAME_KEY) || '{}');
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch { return {}; }
}

function getTeamNickname(identity) {
  const entry = readTeamNicknames()[identity?.key];
  return typeof entry?.nickname === 'string' ? entry.nickname : '';
}

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

function teamNicknameDisplay(matchInfo, side, fallback) {
  return getTeamNickname(teamNicknameIdentity(matchInfo, side)) || fallback;
}

// 점수판 원본 이름은 그대로 보존해 폴링·초기화·긴 이름 설정과 닉네임이 섞이지 않게 한다.
function scoreboardTeamIdentity(side) {
  return state.teamNicknameTeams?.[side]
    || teamNicknameIdentity({ [`${side}TeamName`]: state[`${side}Name`] }, side);
}

function scoreboardTeamDisplayName(side) {
  return getTeamNickname(scoreboardTeamIdentity(side)) || state[`${side}Name`] || side.toUpperCase();
}

function teamNicknameLabelAttrs(side) {
  return ` data-team-nickname-side="${side}" role="button" tabindex="0" aria-label="${side === 'home' ? '홈' : '원정'} 팀 닉네임 편집"`;
}

// 상대전적·최근 경기 목록은 현재 경기의 홈/원정 대신 각 행의 팀을 편집한다.
function bindTeamNicknameLabel(element, matchInfo, side) {
  const identity = teamNicknameIdentity(matchInfo, side);
  if (!identity.key) return;
  element.dataset.teamNicknameKey = identity.key;
  element.dataset.teamNicknameName = identity.name;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `${identity.name} 팀 닉네임 편집`);
  element.tabIndex = 0;
}

function refreshTeamNicknames() {
  render();
  if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  document.dispatchEvent(new CustomEvent('team-nicknames:change'));
}

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
  // 열린 뒤 경기가 바뀌어도 클릭 당시의 팀에 저장한다.
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
