// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 컨텍스트 메뉴] Iter 6 — 선발/교체/부상 패널 선수 클릭 메뉴
//   6-1: 닉네임 설정  6-2: 경기 스탯  6-3: 시즌 스탯
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PLAYER_NICKNAME_KEY = 'obs.player.nicknames.v1';

// ── 닉네임 CRUD ──────────────────────────────────────────────────────────────

function getPlayerNickname(playerId) {
  if (!playerId || Number(playerId) === 0) return null;
  try {
    const map = JSON.parse(localStorage.getItem(PLAYER_NICKNAME_KEY) || '{}');
    return map[String(playerId)] || null;
  } catch { return null; }
}

function setPlayerNickname(playerId, nickname) {
  if (!playerId || Number(playerId) === 0) return;
  try {
    const map = JSON.parse(localStorage.getItem(PLAYER_NICKNAME_KEY) || '{}');
    const v = String(nickname || '').trim();
    if (v) map[String(playerId)] = v;
    else delete map[String(playerId)];
    localStorage.setItem(PLAYER_NICKNAME_KEY, JSON.stringify(map));
  } catch {}
}

function clearAllPlayerNicknames() {
  localStorage.removeItem(PLAYER_NICKNAME_KEY);
  if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  document.dispatchEvent(new CustomEvent('settings:change', { detail: { category: 'scorer' } }));
  if (window._eventsLastData && typeof applyEventsPanel === 'function') {
    applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

// ── HTML escape ───────────────────────────────────────────────────────────────

function pmEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 포지션 한글화 ─────────────────────────────────────────────────────────────

function pmPosKo(pos) {
  return ({ G: 'GK', D: 'DF', M: 'MF', F: 'FW' })[pos] || pos || '-';
}

// ── 선수 데이터 조회 ──────────────────────────────────────────────────────────

function pmFindPlayer(playerId) {
  const data = typeof lineupPanelState !== 'undefined' ? lineupPanelState.lastFixture : null;
  if (!data) return null;
  const id = Number(playerId);
  if (!id) return null;
  const buckets = [
    { list: data.homeLineup?.startXi,    side: 'home', kind: 'starter' },
    { list: data.homeLineup?.substitutes, side: 'home', kind: 'bench' },
    { list: data.awayLineup?.startXi,    side: 'away', kind: 'starter' },
    { list: data.awayLineup?.substitutes, side: 'away', kind: 'bench' },
  ];
  for (const { list, side, kind } of buckets) {
    if (!Array.isArray(list)) continue;
    const p = list.find(p => p && Number(p.playerId) === id);
    if (p) return { ...p, _side: side, _kind: kind };
  }
  const injuries = [
    { list: data.homeInjuries, side: 'home' },
    { list: data.awayInjuries, side: 'away' },
  ];
  for (const { list, side } of injuries) {
    if (!Array.isArray(list)) continue;
    const p = list.find(p => p && Number(p.playerId) === id);
    if (p) return { ...p, _side: side, _kind: 'injury' };
  }
  return null;
}

function pmFindMatchStats(playerId) {
  const stats = typeof lineupPanelState !== 'undefined'
    ? lineupPanelState.lastFixture?.playerStats : null;
  if (!Array.isArray(stats)) return null;
  const id = Number(playerId);
  return stats.find(s => s && Number(s.playerId) === id) || null;
}

// ── 팝업 컨테이너 ─────────────────────────────────────────────────────────────

let _pmActiveId = null;

function pmContainer() {
  let c = document.getElementById('pmContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'pmContainer';
    document.body.appendChild(c);
  }
  return c;
}

function pmHideAll() {
  pmContainer().innerHTML = '';
  _pmActiveId = null;
}

// ── 컨텍스트 메뉴 팝업 ────────────────────────────────────────────────────────

function pmShowMenu(playerId, clientX, clientY) {
  const pid = Number(playerId);
  if (!pid) return;

  if (_pmActiveId === pid && pmContainer().innerHTML.trim()) { pmHideAll(); return; }

  const player = pmFindPlayer(pid);
  if (!player) return;

  _pmActiveId = pid;

  const nickname = getPlayerNickname(pid);
  const shortName = player.name || player.playerName || '';
  const longName  = player.nameKoLong || player.playerNameKoLong || '';
  const displayName = nickname || (typeof pickName === 'function' ? pickName(player, 'roster') : shortName) || '-';
  const fullName = longName || shortName;
  const number = player.number ?? '';
  const pos    = pmPosKo(player.pos || player.position);

  const hasMatchStats = !!pmFindMatchStats(pid);

  const photoUrl = player.photoUrl || player.playerPhotoUrl || '';
  const avatarHtml = photoUrl
    ? `<div class="pm-avatar"><img src="${pmEsc(photoUrl)}" alt="" loading="lazy"></div>`
    : `<div class="pm-avatar pm-avatar-empty"></div>`;

  const nicknameRow = nickname
    ? `<div class="pm-nick-badge">닉네임: ${pmEsc(nickname)}</div>`
    : '';
  const subNameRow = fullName && fullName !== displayName
    ? `<div class="pm-subname">${pmEsc(fullName)}</div>`
    : '';

  pmContainer().innerHTML = `
<div class="pm-popup" id="pmPopup" role="dialog">
  <button class="pm-close" id="pmClose" aria-label="닫기">&#10005;</button>
  <div class="pm-info">
    ${avatarHtml}
    <div class="pm-info-text">
      <div class="pm-name"><span class="pm-num">${pmEsc(number)}</span>${pmEsc(displayName)}</div>
      ${subNameRow}
      ${nicknameRow}
      <div class="pm-pos">포지션: ${pmEsc(pos)}</div>
    </div>
  </div>
  <div class="pm-btns">
    <button class="pm-btn" id="pmBtnNick">닉네임 설정</button>
    <button class="pm-btn" id="pmBtnMatch"${hasMatchStats ? '' : ' disabled'}>경기 스탯</button>
    <button class="pm-btn" id="pmBtnSeason">시즌 스탯</button>
  </div>
</div>`;

  pmPositionPopup(document.getElementById('pmPopup'), clientX, clientY);

  document.getElementById('pmClose').addEventListener('click', e => { e.stopPropagation(); pmHideAll(); });
  document.getElementById('pmBtnNick').addEventListener('click', e => { e.stopPropagation(); pmEditNickname(pid, displayName); });
  if (hasMatchStats) {
    document.getElementById('pmBtnMatch').addEventListener('click', e => {
      e.stopPropagation();
      pmHideAll();
      pmShowMatchStats(pid, player, pmFindMatchStats(pid));
    });
  }
  document.getElementById('pmBtnSeason').addEventListener('click', e => {
    e.stopPropagation();
    pmHideAll();
    pmShowSeasonStats(pid, player);
  });
}

function pmPositionPopup(el, cx, cy) {
  const W = window.innerWidth, H = window.innerHeight;
  const pw = 240, ph = 120;
  let left = cx + 12, top = cy + 12;
  if (left + pw > W - 8) left = Math.max(8, cx - pw - 12);
  if (top  + ph > H - 8) top  = Math.max(8, cy - ph - 12);
  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
}

// ── 닉네임 편집 ──────────────────────────────────────────────────────────────

function pmEditNickname(playerId, currentDisplay) {
  const popup = document.getElementById('pmPopup');
  if (!popup) return;
  const current = getPlayerNickname(playerId) || '';

  popup.innerHTML = `
<div class="pm-nick-wrap">
  <div class="pm-nick-title">닉네임 설정</div>
  <input class="pm-nick-input" id="pmNickInput" type="text"
    placeholder="빈 칸으로 저장하면 초기화" value="${pmEsc(current)}" maxlength="30" autocomplete="off"/>
  <div class="pm-nick-btns">
    <button class="pm-btn pm-btn-primary" id="pmNickSave">저장</button>
    <button class="pm-btn pm-btn-danger"  id="pmNickClear">초기화</button>
    <button class="pm-btn"               id="pmNickCancel">취소</button>
  </div>
</div>`;

  const input = document.getElementById('pmNickInput');
  input.focus();
  input.select();

  const save = () => {
    setPlayerNickname(playerId, input.value);
    pmRefreshAfterNickname();
    pmHideAll();
  };
  const clear = () => {
    setPlayerNickname(playerId, '');
    pmRefreshAfterNickname();
    pmHideAll();
  };

  document.getElementById('pmNickSave').addEventListener('click', save);
  document.getElementById('pmNickClear').addEventListener('click', clear);
  document.getElementById('pmNickCancel').addEventListener('click', () => pmHideAll());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.stopPropagation(); pmHideAll(); }
  });
}

function pmRefreshAfterNickname() {
  if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  // 득점자 이름 / events-panel 갱신
  document.dispatchEvent(new CustomEvent('settings:change', { detail: { category: 'scorer' } }));
  if (window._eventsLastData && typeof applyEventsPanel === 'function') {
    applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

// ── 경기 스탯 모달 ────────────────────────────────────────────────────────────

function pmShowMatchStats(playerId, player, stats) {
  const displayName = getPlayerNickname(playerId)
    || (typeof pickName === 'function' ? pickName(player, 'roster') : player.name || player.playerName || '');

  pmContainer().innerHTML = `
<div class="pm-modal-backdrop" id="pmBackdrop">
  <div class="pm-modal">
    <div class="pm-modal-header">
      <span class="pm-modal-title">경기 스탯 &mdash; ${pmEsc(displayName)}</span>
      <button class="pm-modal-close" id="pmModalClose">&#10005;</button>
    </div>
    <div class="pm-modal-body">
      <table class="pm-stat-table">${pmBuildMatchStatRows(stats)}</table>
    </div>
  </div>
</div>`;

  document.getElementById('pmModalClose').addEventListener('click', pmHideAll);
  document.getElementById('pmBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) pmHideAll();
  });
}

function pmBuildMatchStatRows(s) {
  const L = (typeof PLAYER_MATCH_STAT_LABELS !== 'undefined') ? PLAYER_MATCH_STAT_LABELS : {};
  const lbl = key => L[key] || key;

  const row = (key, val) => {
    if (val === null || val === undefined || val === '') return '';
    return `<tr><td class="pm-st-label">${pmEsc(lbl(key))}</td><td class="pm-st-val">${pmEsc(String(val))}</td></tr>`;
  };
  const frac = (a, b) => (a != null && b != null) ? `${a} / ${b}` : (a != null ? String(a) : null);

  const tackleParts = [s.tacklesTotal, s.tacklesBlocks, s.tacklesInterceptions];
  const tackleAllNull = tackleParts.every(v => v == null);
  const tackleLabel = [lbl('tacklesTotal'), lbl('tacklesBlocks'), lbl('tacklesInterceptions')].join(' / ');
  const tackleVal = tackleAllNull ? null : tackleParts.map(v => v ?? '-').join(' / ');

  return [
    row('minutes',  s.minutes != null ? `${s.minutes}분` : null),
    row('position', pmPosKo(s.position)),
    row('rating',   s.rating),
    // 슛을 한 행으로 묶어 표시 (총 / 유효)
    `${row('shotsTotal', s.shotsTotal)}${row('shotsOn', s.shotsOn)}`,
    row('goalsScored', s.goalsScored),
    row('assists',     s.assists),
    row('saves',       s.saves),
    row('goalsConceded', s.goalsConceded),
    row('passesTotal', s.passesTotal),
    row('passesKey',   s.passesKey),
    row('passesAccuracy', s.passesAccuracy ? `${s.passesAccuracy}%` : null),
    // 태클/블록/인터셉트 한 행
    tackleVal ? `<tr><td class="pm-st-label">${pmEsc(tackleLabel)}</td><td class="pm-st-val">${pmEsc(tackleVal)}</td></tr>` : '',
    row('dribblesAttempts', s.dribblesAttempts),
    row('dribblesSuccess',  s.dribblesSuccess),
    row('duelsTotal', frac(s.duelsTotal, s.duelsWon)),
    row('foulsDrawn',     s.foulsDrawn),
    row('foulsCommitted', s.foulsCommitted),
    row('yellowCards', s.yellowCards || null),
    row('redCards',    s.redCards    || null),
  ].join('');
}

// ── 시즌 스탯 모달 ────────────────────────────────────────────────────────────

let _pmSznData = null;
let _pmSznKeys = [];
let _pmSznIdx  = 0;

async function pmShowSeasonStats(playerId, player) {
  const displayName = getPlayerNickname(playerId)
    || (typeof pickName === 'function' ? pickName(player, 'roster') : player.name || player.playerName || '');

  pmContainer().innerHTML = `
<div class="pm-modal-backdrop" id="pmBackdrop">
  <div class="pm-modal">
    <div class="pm-modal-header">
      <span class="pm-modal-title">시즌 스탯 &mdash; ${pmEsc(displayName)}</span>
      <button class="pm-modal-close" id="pmModalClose">&#10005;</button>
    </div>
    <div class="pm-modal-body" id="pmModalBody">
      <div class="pm-loading">로딩 중...</div>
    </div>
  </div>
</div>`;

  document.getElementById('pmModalClose').addEventListener('click', pmHideAll);
  document.getElementById('pmBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) pmHideAll();
  });

  try {
    const data = await (typeof fetchPlayerStats === 'function'
      ? fetchPlayerStats(playerId)
      : Promise.reject(new Error('fetchPlayerStats not available')));

    if (!document.getElementById('pmBackdrop')) return; // closed while loading

    _pmSznData = data;
    _pmSznKeys = Object.keys(data.statistics || {}).sort().reverse(); // newest first
    _pmSznIdx  = 0;
    pmRenderSeasonPage();
  } catch (err) {
    const body = document.getElementById('pmModalBody');
    if (body) body.innerHTML = `<div class="pm-error">스탯 로딩 실패<br><small>${pmEsc(err.message || '')}</small></div>`;
  }
}

function pmRenderSeasonPage() {
  const body = document.getElementById('pmModalBody');
  if (!body || !_pmSznData) return;

  if (!_pmSznKeys.length) {
    body.innerHTML = '<div class="pm-empty">시즌 데이터 없음</div>';
    return;
  }

  const key  = _pmSznKeys[_pmSznIdx];
  const list = (_pmSznData.statistics || {})[key] || [];

  const tableRows = list.map(stat => {
    const lg = stat.league || {};
    const gm = stat.games  || {};
    const gl = stat.goals  || {};
    const logoHtml = lg.logo
      ? `<img class="pm-lg-logo" src="${pmEsc(lg.logo)}" alt="" loading="lazy">`
      : '';
    const rating = gm.rating ? Number(gm.rating).toFixed(1) : '-';
    return `<tr>
      <td class="pm-st-league">${logoHtml}<span>${pmEsc(lg.name || '-')}</span></td>
      <td class="pm-st-num">${gm.appearences ?? '-'}</td>
      <td class="pm-st-num">${gm.lineups ?? '-'}</td>
      <td class="pm-st-num">${gm.minutes != null ? gm.minutes + "'" : '-'}</td>
      <td class="pm-st-num">${gl.total ?? '-'}</td>
      <td class="pm-st-num">${gl.assists ?? '-'}</td>
      <td class="pm-st-num">${rating}</td>
    </tr>`;
  }).join('');

  // _pmSznKeys[0] = 가장 최신 시즌. ◀ = 구시즌(idx+1), ▶ = 신시즌(idx-1)
  const canOlder  = _pmSznIdx < _pmSznKeys.length - 1;
  const canNewer  = _pmSznIdx > 0;

  body.innerHTML = `
<div class="pm-szn-nav">
  <button class="pm-nav-btn" id="pmNavOlder" ${canOlder ? '' : 'disabled'}>&#9664; 구시즌</button>
  <span class="pm-szn-key">${pmEsc(key)}</span>
  <button class="pm-nav-btn" id="pmNavNewer" ${canNewer ? '' : 'disabled'}>신시즌 &#9654;</button>
</div>
<div class="pm-szn-table-wrap">
  <table class="pm-szn-table">
    <thead>
      <tr>
        <th class="pm-th-league">대회</th>
        <th class="pm-th-num">출전</th>
        <th class="pm-th-num">선발</th>
        <th class="pm-th-num">시간</th>
        <th class="pm-th-num">득점</th>
        <th class="pm-th-num">어시</th>
        <th class="pm-th-num">평점</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="7" class="pm-empty">데이터 없음</td></tr>'}
    </tbody>
  </table>
</div>`;

  document.getElementById('pmNavOlder')?.addEventListener('click', () => {
    if (_pmSznIdx < _pmSznKeys.length - 1) { _pmSznIdx++; pmRenderSeasonPage(); }
  });
  document.getElementById('pmNavNewer')?.addEventListener('click', () => {
    if (_pmSznIdx > 0) { _pmSznIdx--; pmRenderSeasonPage(); }
  });
}

// ── 닉네임 목록 모달 ──────────────────────────────────────────────────────────

function pmShowNicknameList() {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(PLAYER_NICKNAME_KEY) || '{}'); } catch {}

  const entries = Object.entries(map); // [[playerId, nickname], ...]

  // 현재 fixture에서 선수 이름 조회
  const getName = (pid) => {
    const p = pmFindPlayer(Number(pid));
    if (!p) return null;
    return p.nameKoLong || p.playerNameKoLong || p.name || p.playerName || null;
  };

  const rows = entries.length === 0
    ? '<tr><td colspan="3" class="pm-empty">저장된 닉네임 없음</td></tr>'
    : entries.map(([pid, nick]) => {
        const origName = getName(pid) || `선수 #${pid}`;
        return `<tr>
          <td class="pm-nick-list-name">${pmEsc(origName)}</td>
          <td class="pm-nick-list-nick">${pmEsc(nick)}</td>
          <td class="pm-nick-list-action">
            <button class="pm-btn pm-btn-danger pm-nick-del" data-pid="${pmEsc(pid)}">삭제</button>
          </td>
        </tr>`;
      }).join('');

  // 설정 팝업이 열려 있을 수 있으므로 pmContainer 대신 별도 모달 사용
  pmContainer().innerHTML = `
<div class="pm-modal-backdrop" id="pmBackdrop">
  <div class="pm-modal pm-modal-wide">
    <div class="pm-modal-header">
      <span class="pm-modal-title">닉네임 목록 (${entries.length}개)</span>
      <button class="pm-modal-close" id="pmModalClose">&#10005;</button>
    </div>
    <div class="pm-modal-body">
      <table class="pm-szn-table pm-nick-list-table">
        <thead>
          <tr>
            <th class="pm-th-league">원래 이름</th>
            <th class="pm-th-league">닉네임</th>
            <th class="pm-th-num" style="width:60px"></th>
          </tr>
        </thead>
        <tbody id="pmNickListBody">${rows}</tbody>
      </table>
    </div>
  </div>
</div>`;

  document.getElementById('pmModalClose').addEventListener('click', pmHideAll);
  document.getElementById('pmBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) pmHideAll();
  });

  document.getElementById('pmNickListBody').addEventListener('click', e => {
    const btn = e.target.closest('.pm-nick-del');
    if (!btn) return;
    const pid = btn.dataset.pid;
    setPlayerNickname(pid, '');
    btn.closest('tr').remove();
    // 남은 행 수 업데이트
    const remaining = document.querySelectorAll('.pm-nick-del').length;
    const title = document.querySelector('.pm-modal-title');
    if (title) title.textContent = `닉네임 목록 (${remaining}개)`;
    pmRefreshAfterNickname();
  });
}

// ── 클릭 이벤트 위임 ──────────────────────────────────────────────────────────

function pmInit() {
  // 선수 요소 클릭 → 컨텍스트 메뉴
  document.addEventListener('click', e => {
    const c = pmContainer();

    // 팝업/모달 내부 클릭은 내부 핸들러가 처리
    if (c.contains(e.target)) return;

    const dpEl = e.target.closest(
      '.dp-item[data-player-id], .dp-lineup-node[data-player-id], .dp-lineup-name-wrap[data-player-id]'
    );

    if (!dpEl) {
      if (c.innerHTML.trim()) pmHideAll();
      return;
    }

    const pid = Number(dpEl.dataset.playerId);
    if (!pid) return;

    if (_pmActiveId === pid && c.innerHTML.trim()) {
      pmHideAll();
    } else {
      pmShowMenu(pid, e.clientX, e.clientY);
    }
  }, true); // capture phase so we fire before other listeners

  // Esc → 닫기
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pmContainer().innerHTML.trim()) {
      pmHideAll();
      e.stopPropagation();
    }
  }, true);

  // 설정 팝업 이름 탭: 닉네임 초기화 / 목록 버튼
  const clearBtn = document.getElementById('clearAllNicknamesBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('저장된 모든 선수 닉네임을 초기화할까요?')) {
        clearAllPlayerNicknames();
      }
    });
  }
  const listBtn = document.getElementById('showNicknameListBtn');
  if (listBtn) {
    listBtn.addEventListener('click', pmShowNicknameList);
  }
}

document.addEventListener('DOMContentLoaded', pmInit);
