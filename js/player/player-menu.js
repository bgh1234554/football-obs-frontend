// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 컨텍스트 메뉴] Iter 6 — 선발/교체/부상 패널 선수 클릭 메뉴
//   6-1: 닉네임 설정  6-2: 경기 스탯  6-3: 시즌 스탯
//
// 처리 흐름: 선수 클릭 → 연결 ID가 반영된 선수 조회 → 메뉴 → 닉네임/ID 편집 또는 스탯 모달.
// 닉네임은 localStorage, ID 연결은 player-id-resolve.js가 관리한다.
// 경기 스탯은 현재 경기 데이터로 먼저 표시하고 프로필만 추가 조회한다.
// 시즌 스탯은 API 응답을 메모리에 보관해 시즌 전환 시 재조회 없이 렌더링한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PLAYER_NICKNAME_KEY = 'obs.player.nicknames.v1';

// ── 닉네임 CRUD ──────────────────────────────────────────────────────────────

/** 유효한 선수 ID의 저장된 닉네임을 반환한다. 미등록·잘못된 ID·저장소 오류는 null로 처리한다. */
function getPlayerNickname(playerId) {
  if (!playerId || Number(playerId) === 0) return null;
  try {
    const map = JSON.parse(localStorage.getItem(PLAYER_NICKNAME_KEY) || '{}');
    return map[String(playerId)] || null;
  } catch { return null; }
}

/** 선수 ID별 닉네임을 저장한다. 공백만 입력하면 해당 항목을 삭제하며 ID 0은 저장하지 않는다. */
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

/** 모든 닉네임을 삭제하고 라인업·득점자·이벤트 표시를 원래 이름으로 갱신한다. */
function clearAllPlayerNicknames() {
  localStorage.removeItem(PLAYER_NICKNAME_KEY);
  if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  document.dispatchEvent(new CustomEvent('settings:change', { detail: { category: 'scorer' } }));
  if (window._eventsLastData && typeof applyEventsPanel === 'function') {
    applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

// ── HTML escape ───────────────────────────────────────────────────────────────

/** HTML에 삽입할 값을 문자열로 바꾸고 특수문자를 이스케이프한다. nullish 값은 빈 문자열이다. */
function pmEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 포지션 한글화 ─────────────────────────────────────────────────────────────

/** API 포지션 G/D/M/F를 표시용 GK/DF/MF/FW로 바꾸고, 알 수 없는 값은 그대로 반환한다. */
function pmPosKo(pos) {
  return ({ G: 'GK', D: 'DF', M: 'MF', F: 'FW' })[pos] || pos || '-';
}

// ── 선수 데이터 조회 ──────────────────────────────────────────────────────────

/** 연결 ID가 반영된 명단에서 선수를 찾아 홈/원정과 선발/벤치/부상 구분을 붙여 반환한다. 없으면 null. */
function pmFindPlayer(playerId) {
  // override 적용 후 real ID가 부여된 선수를 찾으려면 effective data(override 반영본)를 우선 사용.
  const data = typeof lineupPanelState !== 'undefined'
    ? (lineupPanelState.lastEffectiveData || lineupPanelState.lastFixture)
    : null;
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

/** 현재 경기의 선수별 스탯을 연결 ID 반영 데이터에서 우선 찾는다. 데이터나 해당 선수가 없으면 null. */
function pmFindMatchStats(playerId) {
  const stats = typeof lineupPanelState !== 'undefined'
    ? (lineupPanelState.lastEffectiveData?.playerStats || lineupPanelState.lastFixture?.playerStats) : null;
  if (!Array.isArray(stats)) return null;
  const id = Number(playerId);
  return stats.find(s => s && Number(s.playerId) === id) || null;
}

/** 경기/시즌 스탯 조회용 playerId 결정. ID 연결 override가 있으면 연결된 ID, 없으면 원본 ID 그대로. */
function pmResolveLinkedProfileId(playerId, player) {
  const originalId = Number(playerId);
  if (!originalId || originalId <= 0) return playerId;
  const fixtureId = String(
    (typeof lineupPanelState !== 'undefined' ? lineupPanelState.lastFixture?.matchInfo?.fixtureId : '') ?? ''
  ).trim();
  const side = player?._side || '';
  if (!fixtureId || !side || typeof window.pirGetByKey !== 'function') return playerId;
  const key = typeof window.pirMakeIdKey === 'function'
    ? window.pirMakeIdKey(fixtureId, side, originalId)
    : `${fixtureId}:${side}:id:${originalId}`;
  const linkedId = Number(window.pirGetByKey(key)?.playerId);
  return linkedId > 0 ? linkedId : playerId;
}

// ── 팝업 컨테이너 ─────────────────────────────────────────────────────────────

let _pmActiveId = null;
let _pmMatchRequestId = 0;

/** 메뉴와 모달이 공유할 컨테이너를 반환하며, 처음 사용할 때 body에 생성한다. */
function pmContainer() {
  let c = document.getElementById('pmContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'pmContainer';
    document.body.appendChild(c);
  }
  return c;
}

/** 선수 팝업 내용을 비우고 같은 선수 클릭 시 다시 열 수 있도록 활성 ID를 해제한다. */
function pmHideAll() {
  pmContainer().innerHTML = '';
  _pmActiveId = null;
}

// ── 컨텍스트 메뉴 팝업 ────────────────────────────────────────────────────────

/** 클릭한 선수의 기본 정보와 편집·스탯 메뉴를 연다. 열린 메뉴의 같은 선수를 클릭하면 닫는다. */
function pmShowMenu(playerId, clientX, clientY) {
  // 1) ID와 토글 상태를 확인한 뒤 현재 명단에서 표시할 선수를 찾는다.
  const pid = Number(playerId);
  if (!pid) return;

  if (_pmActiveId === pid && pmContainer().innerHTML.trim()) { pmHideAll(); return; }

  const player = pmFindPlayer(pid);
  if (!player) return;

  _pmActiveId = pid;

  // 2) 닉네임·원래 이름·사진·부상 사유와 경기 스탯 가용 여부를 모아 메뉴 내용을 구성한다.
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
  // 부상자 명단 선수만 — hover 툴팁이 잘 안 보이는 환경 대비 사유를 메뉴에도 노출.
  // 출전 여부 미정(Questionable)은 확정 부상/출장정지와 구분되도록 노란색으로 표시.
  const injuryReasonText = player._kind === 'injury'
    ? (typeof getInjuryReasonDisplayText === 'function' ? getInjuryReasonDisplayText(player.reason, player.type) : '')
    : '';
  const isQuestionable = player._kind === 'injury'
    && typeof isQuestionableInjuryReason === 'function'
    && isQuestionableInjuryReason(player.reason, player.type);
  const injuryReasonRow = injuryReasonText
    ? `<div class="pm-injury-reason${isQuestionable ? ' pm-injury-reason-questionable' : ''}">${pmEsc(injuryReasonText)}</div>`
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
      ${injuryReasonRow}
      <div class="pm-pos" style="display:flex;align-items:center;gap:5px">
        <span>포지션: ${pmEsc(pos)}</span>
        <button class="pm-btn" id="pmBtnIdLink" style="padding:1px 6px;font-size:10px;line-height:1.5;margin:0;opacity:.75">ID 입력</button>
      </div>
    </div>
  </div>
  <div class="pm-btns">
    <button class="pm-btn" id="pmBtnNick">닉네임 설정</button>
    <button class="pm-btn" id="pmBtnMatch"${hasMatchStats ? '' : ' disabled'}>경기 스탯</button>
    <button class="pm-btn" id="pmBtnSeason">시즌 스탯</button>
  </div>
</div>`;

  // 3) 클릭 위치에 배치하고 화면 경계를 보정한 뒤 각 버튼을 편집기 또는 스탯 모달로 연결한다.
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
  document.getElementById('pmBtnIdLink').addEventListener('click', e => {
    e.stopPropagation();
    pmShowIdInput(pid, player, displayName, clientX, clientY);
  });
}

/** 클릭한 화면 좌표를 레이아웃 좌표로 변환해 팝업을 옆에 배치하고 화면 경계 안으로 보정한다. */
function pmPositionPopup(el, cx, cy) {
  const point = toDisplayLayoutPoint(cx, cy);
  el.style.left = (point.x + 12) + 'px';
  el.style.top  = (point.y + 12) + 'px';
  pmClampPopupToViewport(el);
}

/**
 * 팝업 엘리먼트의 실제 렌더링 크기를 측정해 화면 밖으로 넘치면 위치를 보정한다.
 * pmShowIdInput/pmEditNickname처럼 처음 메뉴보다 더 큰 내용으로 내용만 바꿔 끼우는
 * 경우, 최초 메뉴 크기 기준으로 잡힌 위치를 그대로 쓰면 화면 아래/오른쪽으로 잘릴 수
 * 있다 — 내용 교체 직후마다 호출해서 실제 높이/너비로 다시 클램프한다.
 * el을 안 넘기면 #pmPopup을 기본으로 찾는다(같은 컨테이너를 재사용하는 pmShowIdInput/
 * pmEditNickname 호출부 편의용) — id=0 전용 팝업(#pirPopup)처럼 다른 엘리먼트면
 * 반드시 명시적으로 넘겨야 한다.
 */
function pmClampPopupToViewport(el, margin = 8) {
  if (!el) el = document.getElementById('pmPopup');
  if (!el) return;
  const rect = getDisplayLayoutRect(el);
  const W = document.body.clientWidth, H = document.body.clientHeight;
  let dx = 0, dy = 0;
  if (rect.right > W - margin) dx = (W - margin) - rect.right;
  if (rect.left + dx < margin) dx = margin - rect.left;
  if (rect.bottom > H - margin) dy = (H - margin) - rect.bottom;
  if (rect.top + dy < margin) dy = margin - rect.top;
  if (dx) el.style.left = (rect.left + dx) + 'px';
  if (dy) el.style.top = (rect.top + dy) + 'px';
}

// ── 선수 ID 인라인 입력 뷰 (pm-popup 내부에서 전환, 뒤로가기 지원) ─────────────
/** pmPopup을 ID 입력 인라인 폼으로 전환 — 검색/미리보기/사진 유지·변경 토글/저장/연결 해제. */
async function pmShowIdInput(pid, player, displayName, clientX, clientY) {
  // 1) 현재 경기·진영·원본 ID로 저장 키를 찾는다. ID 0에서 연결된 선수는 이름 키도 역탐색한다.
  const popup = document.getElementById('pmPopup');
  if (!popup) return;

  const fixtureId = String(
    (typeof lineupPanelState !== 'undefined' ? lineupPanelState.lastFixture?.matchInfo?.fixtureId : '') ?? ''
  ).trim();
  const side = player._side || '';
  const currentApiId = Number(pid);
  // id≠0 선수는 playerId를 바꾸지 않으므로 항상 원본 API ID로 키 구성
  const _pmIdKey = fixtureId
    ? (typeof window.pirMakeIdKey === 'function'
        ? window.pirMakeIdKey(fixtureId, side, currentApiId)
        : `${fixtureId}:${side}:id:${currentApiId}`)
    : null;
  let existing = (typeof window.pirGetByKey === 'function' && _pmIdKey)
    ? window.pirGetByKey(_pmIdKey) : null;
  // id=0 선수를 이름 키로 연결한 경우: id-key로 찾지 못했을 때 n: 키를 역탐색
  let _pmClearKey = _pmIdKey;
  let _pmStoreKey = _pmIdKey;
  if (!existing && fixtureId && typeof window.pirFindNameKeyByEffectiveId === 'function') {
    const nameKey = window.pirFindNameKeyByEffectiveId(fixtureId, side, currentApiId);
    if (nameKey) {
      existing = window.pirGetByKey(nameKey);
      _pmClearKey = nameKey;
      _pmStoreKey = nameKey;
    }
  }

  // 2) 자동 연결 상태를 계산해 수동으로 저장된 연결 정보와 함께 입력 폼에 표시한다.
  // 이벤트의 다른 alt ID가 이 선수(currentApiId)로 자동 연결되고 있는지 확인 (pirAutoLinkAltToCanonical).
  // applyZeroIdOverrides와 동일한 조건으로 게이트 — 설정이 OFF면 실제로 적용되지 않으므로 배지도 안 보여준다.
  const autoLinkSettingOn = typeof getSetting !== 'function' || getSetting('autoLinkPlayerIdByName') !== 'off';
  let autoLinkedAltId = null;
  if (autoLinkSettingOn && side && typeof window.pirAutoLinkAltToCanonical === 'function') {
    const rawForAutoLink = typeof lineupPanelState !== 'undefined' ? lineupPanelState.lastFixture : null;
    const autoMap = window.pirAutoLinkAltToCanonical(rawForAutoLink);
    const prefix = `${side}:`;
    for (const [k, v] of Object.entries(autoMap)) {
      if (k.startsWith(prefix) && Number(v) === currentApiId) {
        autoLinkedAltId = k.slice(prefix.length);
        break;
      }
    }
  }

  popup.innerHTML = `
<button class="pm-close" id="pmIdBack" aria-label="뒤로가기" style="left:10px;right:auto">&#8592;</button>
<div class="pm-nick-wrap">
  <div class="pm-nick-title">선수 ID 연결</div>
  <div style="font-size:11px;color:#8af;margin-bottom:6px">
    현재 API ID: ${pmEsc(String(currentApiId))}${existing ? ` &nbsp;·&nbsp; 연결됨: ${pmEsc(String(existing.playerId))}` : ''}${autoLinkedAltId ? ` &nbsp;·&nbsp; 자동 연결됨: ${pmEsc(autoLinkedAltId)}` : ''}
  </div>
  <div style="display:flex;gap:6px;align-items:center">
    <input class="pm-nick-input" id="pmIdInput" type="number" min="1"
      placeholder="새 선수 ID"
      value="${existing ? pmEsc(String(existing.playerId)) : pmEsc(String(currentApiId))}"
      style="flex:1;min-width:0"/>
    <button class="pm-btn pm-btn-primary" id="pmIdFetch" style="white-space:nowrap;padding:4px 8px">검색</button>
  </div>
  <div id="pmIdPreview" style="margin-top:6px;min-height:20px;font-size:11px;color:#aaa">
    ${existing ? `연결됨${existing.name ? ' - ' + pmEsc(existing.name) : ''} · 새 ID 입력 시 덮어쓰기` : 'ID를 입력하고 검색하세요'}
  </div>
  <div class="pm-nick-btns">
    <button class="pm-btn pm-btn-primary" id="pmIdSave">저장</button>
    ${existing ? '<button class="pm-btn pm-btn-danger" id="pmIdClear">연결 해제</button>' : ''}
    <button class="pm-btn" id="pmIdCancel">취소</button>
  </div>
</div>`;
  pmClampPopupToViewport();

  document.getElementById('pmIdBack').addEventListener('click', e => {
    e.stopPropagation();
    _pmActiveId = null; // 토글 감지 리셋 — 재오픈 허용
    pmShowMenu(pid, clientX, clientY);
  });
  document.getElementById('pmIdCancel').addEventListener('click', e => {
    e.stopPropagation();
    pmHideAll();
  });

  let _fetched = null;
  let _fetchedPid = null;
  let _useNewPhoto = true; // id≠0: 검색 결과 사진을 사용할지 여부
  const _origPhotoUrl = player.photoUrl || null; // 원본 선수 사진
  const input = document.getElementById('pmIdInput');
  const preview = document.getElementById('pmIdPreview');

  /** 원본과 검색 결과의 사진이 다를 때 사진 유지·변경 선택 UI의 HTML을 반환한다. */
  function renderPhotoToggle(newPhotoUrl) {
    // id≠0이고 양쪽 사진이 모두 있고 서로 다를 때만 before→after 비교 표시
    if (!newPhotoUrl || !_origPhotoUrl || newPhotoUrl === _origPhotoUrl) return '';
    const imgStyle = 'width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;border:1.5px solid #555';
    const arrow = '<span style="font-size:14px;margin:0 4px;color:#888">&#8594;</span>';
    const togBefore = _useNewPhoto ? '' : ' pm-btn-primary';
    const togAfter  = _useNewPhoto ? ' pm-btn-primary' : '';
    return `<div style="display:flex;align-items:center;margin-top:6px;gap:4px;flex-wrap:wrap">` +
      `<img src="${pmEsc(_origPhotoUrl)}" style="${imgStyle}">` +
      `${arrow}` +
      `<img src="${pmEsc(newPhotoUrl)}" style="${imgStyle}">` +
      `<button class="pm-btn${togBefore}" id="pmPhotoKeep" style="padding:2px 7px;font-size:10.5px;margin-left:6px">사진 유지</button>` +
      `<button class="pm-btn${togAfter}" id="pmPhotoChange" style="padding:2px 7px;font-size:10.5px">사진 변경</button>` +
      `</div>`;
  }

  /** 입력한 선수 ID를 조회해 미리보기와 사진 선택 UI를 갱신하고, 저장에 쓸 조회 결과를 보관한다. */
  async function doFetch() {
    // 3-a) 양의 ID만 조회하고 검색 중에는 버튼을 잠근다.
    const newPid = parseInt(input.value, 10);
    if (!newPid || newPid <= 0) { preview.innerHTML = '<span style="color:#f88">유효한 ID를 입력하세요</span>'; return; }
    preview.innerHTML = '<span style="color:#aaa">로딩 중...</span>';
    document.getElementById('pmIdFetch').disabled = true;
    try {
      const data = await (typeof fetchPlayerStats === 'function'
        ? fetchPlayerStats(newPid)
        : Promise.reject(new Error('fetchPlayerStats 없음')));
      const p = data?.player;
      if (p) {
        _fetched = data;
        _fetchedPid = newPid;
        const pname = p.fullName || p.name || '';
        const photoHtml = p.photoUrl ? `<img src="${pmEsc(p.photoUrl)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px">` : '';
        const nat = p.nationality ? ` · ${pmEsc(p.nationality)}` : '';
        const age = p.age ? ` · ${p.age}세` : '';
        const photoToggle = renderPhotoToggle(p.photoUrl);
        preview.innerHTML = `<div>${photoHtml}<span style="color:#fff">${pmEsc(pname)}</span><span style="color:#888">${nat}${age}</span></div>${photoToggle}`;
        // 사진 토글 버튼 이벤트
        const keepBtn   = document.getElementById('pmPhotoKeep');
        const changeBtn = document.getElementById('pmPhotoChange');
        if (keepBtn) keepBtn.addEventListener('click', e => {
          e.stopPropagation(); _useNewPhoto = false;
          if (keepBtn)   keepBtn.className   = keepBtn.className.replace('pm-btn-primary', '').trim() + ' pm-btn-primary';
          if (changeBtn) changeBtn.className = changeBtn.className.replace(' pm-btn-primary', '');
        });
        if (changeBtn) changeBtn.addEventListener('click', e => {
          e.stopPropagation(); _useNewPhoto = true;
          if (changeBtn) changeBtn.className = changeBtn.className.replace('pm-btn-primary', '').trim() + ' pm-btn-primary';
          if (keepBtn)   keepBtn.className   = keepBtn.className.replace(' pm-btn-primary', '');
        });
      } else {
        preview.innerHTML = '<span style="color:#f88">선수 정보를 찾을 수 없습니다</span>';
        _fetched = null;
        _fetchedPid = null;
      }
    } catch (err) {
      preview.innerHTML = `<span style="color:#f88">로딩 실패: ${pmEsc(String(err?.message || ''))}</span>`;
      _fetched = null;
      _fetchedPid = null;
    } finally {
      const fb = document.getElementById('pmIdFetch');
      if (fb) fb.disabled = false;
      // preview.innerHTML 갱신(특히 사진 비교 토글 영역)으로 팝업이 더 커질 수 있어 재클램프.
      pmClampPopupToViewport();
    }
  }

  // 3) 검색 버튼과 Enter를 연결한다. 입력이 바뀌면 이전 검색 결과를 저장에 재사용하지 않는다.
  document.getElementById('pmIdFetch').addEventListener('click', doFetch);
  input.addEventListener('input', () => {
    _fetched = null;
    _fetchedPid = null;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doFetch(); }
    if (e.key === 'Escape') { e.stopPropagation(); pmShowMenu(pid, clientX, clientY); }
  });

  // 4) 중복 연결을 검사한 뒤 현재 입력 ID와 일치하는 검색 결과만 이름·사진에 반영해 저장한다.
  document.getElementById('pmIdSave').addEventListener('click', () => {
    const newPid = parseInt(input.value, 10);
    if (!newPid || newPid <= 0 || !fixtureId) return;
    if (typeof window.pirIsDuplicateAltId === 'function' && _pmStoreKey &&
        window.pirIsDuplicateAltId(fixtureId, _pmStoreKey, newPid)) {
      preview.innerHTML = '<span style="color:#f88">이미 다른 선수에 연결된 ID입니다</span>';
      return;
    }
    const fetchedMatches = _fetchedPid === newPid;
    const p = fetchedMatches ? _fetched?.player : null;
    const entry = {
      playerId: newPid,
      resolvedAt: Date.now(),
    };
    // 같은 ID를 재저장(연결 해제/재검색 없이 그냥 저장)할 땐 기존에 저장된 이름/사진을 보존한다.
    if (!fetchedMatches && existing && Number(existing.playerId) === newPid) {
      if (existing.name != null) entry.name = existing.name;
      if (existing.nameKoLong != null) entry.nameKoLong = existing.nameKoLong;
      if (existing.photoUrl != null) entry.photoUrl = existing.photoUrl;
    }
    if (fetchedMatches) {
      // id≠0: 사진은 사용자가 선택한 경우에만 변경. 기본은 새 사진 사용.
      entry.name = p?.name || null;           // 단축명 (한글 단축 우선, 없으면 API 영문 단축)
      entry.nameKoLong = p?.fullName || null; // 풀네임 (한글 풀네임 우선, 없으면 API 영문 풀네임)
      entry.photoUrl = _useNewPhoto ? (p?.photoUrl || null) : _origPhotoUrl;
    }
    if (typeof window.pirSetByKey === 'function' && _pmStoreKey) {
      window.pirSetByKey(_pmStoreKey, entry);
    }
    pmHideAll();
    if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  });

  // 5) 연결 해제는 처음 찾은 저장 키를 삭제한다. 저장·해제 후 라인업을 다시 그려 변경을 반영한다.
  const clearBtn = document.getElementById('pmIdClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!fixtureId) return;
      if (typeof window.pirSetByKey === 'function') {
        window.pirSetByKey(_pmClearKey, null);
      }
      pmHideAll();
      if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
    });
  }

  input.focus();
  input.select();
}

// ── 닉네임 편집 ──────────────────────────────────────────────────────────────

/** 현재 팝업을 닉네임 편집기로 바꾸고 저장·초기화·취소 및 Enter/Escape 처리를 연결한다. */
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
  pmClampPopupToViewport();

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

/** 닉네임 변경을 라인업과 득점자·이벤트 패널에 반영하며 이벤트 등장 애니메이션은 생략한다. */
function pmRefreshAfterNickname() {
  if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  // 득점자 이름 / events-panel 갱신
  document.dispatchEvent(new CustomEvent('settings:change', { detail: { category: 'scorer' } }));
  if (window._eventsLastData && typeof applyEventsPanel === 'function') {
    applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

// ── 경기 스탯 모달 ────────────────────────────────────────────────────────────

/** 경기 스탯과 기본 프로필을 즉시 표시하고, 연결 ID로 조회한 상세 프로필이 도착하면 보완한다. */
async function pmShowMatchStats(playerId, player, stats) {
  // 1) 현재 경기의 이름과 스탯으로 모달을 먼저 만든다. 프로필 API 실패 시에도 이 화면을 유지한다.
  const displayName = getPlayerNickname(playerId)
    || (typeof pickName === 'function' ? pickName(player, 'roster') : player.name || player.playerName || '');

  pmContainer().innerHTML = `
<div class="pm-modal-backdrop" id="pmBackdrop">
  <div class="pm-modal">
    <div class="pm-modal-header">
      <span class="pm-modal-title">경기 스탯 &mdash; ${pmEsc(displayName)}</span>
      <button class="pm-modal-close" id="pmModalClose">&#10005;</button>
    </div>
    <div class="pm-modal-body pm-body-split">
      <div class="pm-szn-profile" id="pmSznProfile"></div>
      <div class="pm-szn-scroll pm-match-stat-scroll">
        <table class="pm-stat-table">${pmBuildMatchStatRows(stats)}</table>
      </div>
    </div>
  </div>
</div>`;

  pmRenderMatchProfile(player, playerId);
  document.getElementById('pmModalClose').addEventListener('click', pmHideAll);
  document.getElementById('pmBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) pmHideAll();
  });

  const profileId = pmResolveLinkedProfileId(playerId, player);
  // 2) 요청 번호를 부여해 더 최근의 경기 스탯 조회가 시작되면 이전 응답을 무시한다.
  const myReqId = ++_pmMatchRequestId;
  try {
    const data = await (typeof fetchPlayerStats === 'function'
      ? fetchPlayerStats(profileId)
      : Promise.reject(new Error('fetchPlayerStats not available')));
    if (!document.getElementById('pmBackdrop') || myReqId !== _pmMatchRequestId) return;
    if (data?.player) {
      // 3) 상세 프로필과 제목만 갱신한다. 오른쪽 경기 스탯 표는 최초 경기 데이터로 유지한다.
      pmRenderSeasonProfile(data.player, player.number ?? '');
      const nick = getPlayerNickname(playerId);
      const fullName = nick || data.player.fullName || data.player.name || displayName;
      const titleEl = document.querySelector('#pmBackdrop .pm-modal-title');
      if (titleEl) titleEl.textContent = `경기 스탯 — ${fullName}`;
    }
  } catch (_) {
    // fetchPlayerStats 실패 시 기본 프로필 유지
  }
}

/** 경기 명단에 있는 사진·등번호·닉네임·포지션으로 상세 조회 전의 기본 프로필을 표시한다. */
function pmRenderMatchProfile(player, playerId) {
  const el = document.getElementById('pmSznProfile');
  if (!el) return;

  const photoUrl = player.photoUrl || player.playerPhotoUrl || '';
  const photoHtml = photoUrl
    ? `<div class="pm-avatar pm-avatar-lg"><img src="${pmEsc(photoUrl)}" alt="" loading="lazy"></div>`
    : `<div class="pm-avatar pm-avatar-lg pm-avatar-empty"></div>`;

  const nick = getPlayerNickname(playerId);
  const baseName = nick || (typeof pickName === 'function' ? pickName(player, 'roster') : player.name || player.playerName || '');
  const number = player.number ?? '';
  const displayName = (number !== '' && number != null ? `${number} ` : '') + baseName;
  const pos = pmPosKo(player.pos || player.position);

  el.innerHTML = `
<div class="pm-profile-wrap">
  ${photoHtml}
  <div class="pm-profile-info">
    <div class="pm-profile-name">${pmEsc(displayName)}</div>
    <div class="pm-profile-sub">${pmEsc(pos)}</div>
  </div>
</div>`;
}

/** 선수 경기 스탯 객체를 표 행 HTML로 변환한다. 빈 항목은 생략하고 평점은 색상 배지로 표시한다. */
function pmBuildMatchStatRows(s) {
  // 1) 라벨과 공통 값 포맷을 준비한다. 0은 유효한 기록이므로 일반 행에서 생략하지 않는다.
  const L = (typeof PLAYER_MATCH_STAT_LABELS !== 'undefined') ? PLAYER_MATCH_STAT_LABELS : {};
  const lbl = key => L[key] || key;

  const row = (key, val) => {
    if (val === null || val === undefined || val === '') return '';
    return `<tr><td class="pm-st-label">${pmEsc(lbl(key))}</td><td class="pm-st-val">${pmEsc(String(val))}</td></tr>`;
  };
  const frac = (a, b) => (a != null && b != null) ? `${a} / ${b}` : (a != null ? String(a) : null);
  const passValue = (total, successful) => {
    const totalEmpty = total == null || String(total).trim() === '';
    const successfulEmpty = successful == null || String(successful).trim() === '';
    if (totalEmpty && successfulEmpty) return null;
    if (successfulEmpty) return String(total);
    if (totalEmpty) return `-(${successful})`;
    return `${total}(${successful})`;
  };

  const tackleParts = [s.tacklesTotal, s.tacklesBlocks, s.tacklesInterceptions];
  const tackleAllNull = tackleParts.every(v => v == null);
  const tackleLabel = [lbl('tacklesTotal'), lbl('tacklesBlocks'), lbl('tacklesInterceptions')].join(' / ');
  const tackleVal = tackleAllNull ? null : tackleParts.map(v => v ?? '-').join(' / ');

  // 2) 복합 기록과 평점을 별도로 구성한 뒤 나머지 단일 기록과 정해진 순서로 합친다.
  // 평점은 다른 스탯과 달리 순수 텍스트가 아니라 포메이션 라인업 평점 배지와 동일한
  // 배경색(_pmRatingHtml — lpRatingColor와 같은 구간 기준)을 입혀야 하므로 row()를 안 거친다.
  const ratingRow = (s.rating != null && s.rating !== '')
    ? `<tr><td class="pm-st-label">${pmEsc(lbl('rating'))}</td><td class="pm-st-val">${_pmRatingHtml(s.rating)}</td></tr>`
    : '';

  return [
    row('minutes',  s.minutes != null ? `${s.minutes}분` : null),
    row('position', pmPosKo(s.position)),
    ratingRow,
    // 슛을 한 행으로 묶어 표시 (총 / 유효)
    `${row('shotsTotal', s.shotsTotal)}${row('shotsOn', s.shotsOn)}`,
    row('goalsScored', s.goalsScored),
    row('assists',     s.assists),
    row('saves',       s.saves),
    row('goalsConceded', s.goalsConceded),
    row('passesTotal', passValue(s.passesTotal, s.passesSuccessful)),
    row('passesAccuracy', s.passesAccuracy != null ? `${s.passesAccuracy}%` : null),
    row('passesKey',   s.passesKey),
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
let _pmSznRequestId = 0;

/** 연결 ID의 시즌 스탯을 조회해 최신 시즌부터 표시한다. 로딩 상태와 조회 실패 메시지도 처리한다. */
async function pmShowSeasonStats(playerId, player) {
  // 1) 로딩 모달을 먼저 열고 닫기 동작을 연결한다.
  const displayName = getPlayerNickname(playerId)
    || (typeof pickName === 'function' ? pickName(player, 'roster') : player.name || player.playerName || '');

  pmContainer().innerHTML = `
<div class="pm-modal-backdrop" id="pmBackdrop">
  <div class="pm-modal pm-modal-szn">
    <div class="pm-modal-header">
      <span class="pm-modal-title">시즌 스탯 &mdash; ${pmEsc(displayName)}</span>
      <button class="pm-modal-close" id="pmModalClose">&#10005;</button>
    </div>
    <div class="pm-modal-body pm-body-split">
      <div class="pm-szn-profile" id="pmSznProfile"></div>
      <div class="pm-szn-nav-fixed" id="pmSznNav"></div>
      <div class="pm-szn-scroll" id="pmModalBody">
        <div class="pm-loading">로딩 중...</div>
      </div>
    </div>
  </div>
</div>`;

  document.getElementById('pmModalClose').addEventListener('click', pmHideAll);
  document.getElementById('pmBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) pmHideAll();
  });

  const myReqId = ++_pmSznRequestId;
  // 2) 원본 선수 ID에 연결된 프로필 ID로 조회한다. 다음 조회가 시작됐거나 모달이 닫히면 응답을 무시한다.
  const profileId = pmResolveLinkedProfileId(playerId, player);
  try {
    const data = await (typeof fetchPlayerStats === 'function'
      ? fetchPlayerStats(profileId)
      : Promise.reject(new Error('fetchPlayerStats not available')));

    if (!document.getElementById('pmBackdrop') || myReqId !== _pmSznRequestId) return;

    // 3) 응답과 시즌 목록을 보관하고 최신 시즌을 선택한다. 이후 탐색은 캐시된 응답을 사용한다.
    _pmSznData = data;
    _pmSznKeys = Object.keys(data.statistics || {}).sort().reverse();
    _pmSznIdx  = 0;
    pmRenderSeasonProfile(data.player, player.number);
    pmRenderSeasonPage();
  } catch (err) {
    const body = document.getElementById('pmModalBody');
    if (body) body.innerHTML = `<div class="pm-error">스탯 로딩 실패<br><small>${pmEsc(err.message || '')}</small></div>`;
  }
}

/** 상세 선수 프로필의 사진·이름·국적·신체 정보·출생 정보를 값이 있는 항목만 표시한다. */
function pmRenderSeasonProfile(p, number) {
  const el = document.getElementById('pmSznProfile');
  if (!el || !p) return;

  const photoHtml = p.photoUrl
    ? `<div class="pm-avatar pm-avatar-lg"><img src="${pmEsc(p.photoUrl)}" alt="" loading="lazy"></div>`
    : `<div class="pm-avatar pm-avatar-lg pm-avatar-empty"></div>`;

  const nick = getPlayerNickname(p.id);
  const baseName   = nick || p.fullName || p.name || '';
  const displayName = (number != null ? `${number} ` : '') + baseName;

  const birthDate  = p.birth?.date ? p.birth.date.replace(/-/g, '.') : '';
  const birthPlace = [p.birth?.place, p.birth?.country].filter(Boolean).join(' / ');

  const chips = [
    p.nationality ? pmEsc(p.nationality) : null,
    p.age         ? `${p.age}세`         : null,
    p.height      ? `${p.height}cm`      : null,
    p.weight      ? `${p.weight}kg`      : null,
  ].filter(Boolean).map(v => `<span class="pm-chip">${v}</span>`).join('');

  el.innerHTML = `
<div class="pm-profile-wrap">
  ${photoHtml}
  <div class="pm-profile-info">
    <div class="pm-profile-name">${pmEsc(displayName)}</div>
    ${chips      ? `<div class="pm-profile-chips">${chips}</div>` : ''}
    ${birthDate  ? `<div class="pm-profile-birth">생일: ${pmEsc(birthDate)}</div>` : ''}
    ${birthPlace ? `<div class="pm-profile-birth">출생지: ${pmEsc(birthPlace)}</div>` : ''}
  </div>
</div>`;
}

/** 평점을 소수 첫째 자리와 설정된 구간 색상의 배지로 반환한다. 빈 값은 '-', 숫자가 아니면 텍스트. */
function _pmRatingHtml(r) {
  if (r == null || r === '') return '-';
  const n = Number(r);
  if (isNaN(n)) return pmEsc(String(r));
  const color = typeof getSetting === 'function' ? (
    n >= 9.5 ? getSetting('ratingColor95') :
    n >= 9.0 ? getSetting('ratingColor9')  :
    n >= 8.0 ? getSetting('ratingColor8')  :
    n >= 7.0 ? getSetting('ratingColor7')  :
    n >= 6.5 ? getSetting('ratingColor65') :
    n >= 6.0 ? getSetting('ratingColor6')  :
               getSetting('ratingColorBelow6')
  ) : null;
  const bg = color ? ` style="background:#${pmEsc(color.replace(/^#/, ''))}"` : '';
  return `<span class="pm-rating-badge"${bg}>${n.toFixed(1)}</span>`;
}

/** 선택한 시즌의 대회·팀별 기록 표와 이전/다음 시즌 탐색 버튼을 캐시된 응답으로 다시 그린다. */
function pmRenderSeasonPage() {
  // 1) 모달과 데이터 유무를 확인하고 현재 시즌 및 탐색 가능 방향을 결정한다.
  const body = document.getElementById('pmModalBody');
  if (!body || !_pmSznData) return;

  if (!_pmSznKeys.length) {
    body.innerHTML = '<div class="pm-empty">시즌 데이터 없음</div>';
    return;
  }

  const key  = _pmSznKeys[_pmSznIdx];
  const list = (_pmSznData.statistics || {})[key] || [];
  const canOlder = _pmSznIdx < _pmSznKeys.length - 1;
  const canNewer = _pmSznIdx > 0;

  const v = (x, sfx = '') => (x != null) ? `${x}${sfx}` : '-';

  // 2) 대회·팀별 기록을 한 행씩 만든다. 누락 기록은 '-'로, 카드와 평점은 별도 표시 형식으로 변환한다.
  const tableRows = list.map(stat => {
    const lg = stat.league   || {};
    const tm = stat.team     || {};
    const gm = stat.games    || {};
    const sh = stat.shots    || {};
    const gl = stat.goals    || {};
    const ps = stat.passes   || {};
    const tk = stat.tackles  || {};
    const du = stat.duels    || {};
    const dr = stat.dribbles || {};
    const fo = stat.fouls    || {};
    const cd = stat.cards    || {};

    const lgLogo = lg.logo ? `<img class="pm-lg-logo" src="${pmEsc(lg.logo)}" alt="" loading="lazy">` : '';
    const tmLogo = tm.logo ? `<img class="pm-lg-logo" src="${pmEsc(tm.logo)}" alt="" loading="lazy">` : '';

    const yrHtml = (cd.yellowred > 0) ? `<span class="pm-card-yr">${cd.yellowred}</span>` : '';
    const yHtml  = (cd.yellow > 0)    ? `<span class="pm-card-y">${cd.yellow}</span>${yrHtml}` : (yrHtml || '-');
    const rHtml  = (cd.red > 0)       ? `<span class="pm-card-r">${cd.red}</span>` : '-';

    return `<tr>
  <td class="pm-st-sticky"><div class="pm-st-league">${lgLogo}<span>${pmEsc(lg.name || '-')}</span></div><div class="pm-st-team-row">${tmLogo}<span>${pmEsc(tm.name || '-')}</span></div></td>
  <td class="pm-st-num">${v(gm.appearences)}</td>
  <td class="pm-st-num">${v(gm.lineups)}</td>
  <td class="pm-st-num">${gm.minutes != null ? gm.minutes + "'" : '-'}</td>
  <td class="pm-st-num">${_pmRatingHtml(gm.rating)}</td>
  <td class="pm-st-num">${v(sh.total)}</td>
  <td class="pm-st-num">${v(sh.on)}</td>
  <td class="pm-st-num">${v(gl.total)}</td>
  <td class="pm-st-num">${v(gl.assists)}</td>
  <td class="pm-st-num">${v(gl.saves)}</td>
  <td class="pm-st-num">${v(ps.total)}</td>
  <td class="pm-st-num">${v(ps.key)}</td>
  <td class="pm-st-num">${ps.accuracy != null ? ps.accuracy + '%' : '-'}</td>
  <td class="pm-st-num">${v(tk.total)}</td>
  <td class="pm-st-num">${v(tk.blocks)}</td>
  <td class="pm-st-num">${v(tk.interceptions)}</td>
  <td class="pm-st-num">${v(dr.attempts)}</td>
  <td class="pm-st-num">${v(dr.success)}</td>
  <td class="pm-st-num">${v(du.total)}</td>
  <td class="pm-st-num">${v(du.won)}</td>
  <td class="pm-st-num">${v(fo.drawn)}</td>
  <td class="pm-st-num">${v(fo.committed)}</td>
  <td class="pm-st-num">${yHtml}</td>
  <td class="pm-st-num">${rHtml}</td>
</tr>`;
  }).join('');

  // 3) 표시 라벨과 시즌 탐색 바를 준비한 뒤 그룹 헤더와 기록 행을 표에 배치한다.
  const L = (typeof PLAYER_SZN_LABELS !== 'undefined') ? PLAYER_SZN_LABELS : {};
  const sl = (k, fb) => L[k] != null ? L[k] : fb;

  const nav = document.getElementById('pmSznNav');
  if (nav) {
    nav.innerHTML = `
<div class="pm-szn-nav">
  <button class="pm-nav-btn" id="pmNavOlder" ${canOlder ? '' : 'disabled'}>${sl('navOlder','&#9664; 구시즌')}</button>
  <span class="pm-szn-key">${pmEsc(key)}</span>
  <button class="pm-nav-btn" id="pmNavNewer" ${canNewer ? '' : 'disabled'}>${sl('navNewer','신시즌 &#9654;')}</button>
</div>`;
  }

  body.innerHTML = `
<div class="pm-szn-table-wrap">
  <table class="pm-szn-table pm-szn-table-full">
    <thead>
      <tr class="pm-th-group-row">
        <th rowspan="2" class="pm-th-league pm-th-sticky">${sl('colLeague','대회')}</th>
        <th colspan="4" class="pm-th-group-cell">${sl('groupBasic','기본')}</th>
        <th colspan="2" class="pm-th-group-cell">${sl('groupShots','슈팅')}</th>
        <th colspan="3" class="pm-th-group-cell">${sl('groupAttack','공격')}</th>
        <th colspan="3" class="pm-th-group-cell">${sl('groupPasses','패스')}</th>
        <th colspan="3" class="pm-th-group-cell">${sl('groupDefense','수비')}</th>
        <th colspan="2" class="pm-th-group-cell">${sl('groupDribbles','드리블')}</th>
        <th colspan="2" class="pm-th-group-cell">${sl('groupDuels','경합')}</th>
        <th colspan="2" class="pm-th-group-cell">${sl('groupFouls','파울')}</th>
        <th colspan="2" class="pm-th-group-cell">${sl('groupCards','카드')}</th>
      </tr>
      <tr>
        <th class="pm-th-num">${sl('appearances','출전')}</th><th class="pm-th-num">${sl('lineups','선발')}</th>
        <th class="pm-th-num">${sl('minutes','시간')}</th><th class="pm-th-num">${sl('rating','평점')}</th>
        <th class="pm-th-num">${sl('shotsTotal','슛')}</th><th class="pm-th-num">${sl('shotsOn','유효')}</th>
        <th class="pm-th-num">${sl('goalsTotal','득점')}</th><th class="pm-th-num">${sl('assists','어시')}</th><th class="pm-th-num">${sl('saves','세이브')}</th>
        <th class="pm-th-num">${sl('passesTotal','패스')}</th><th class="pm-th-num">${sl('passesKey','키패스')}</th><th class="pm-th-num">${sl('passesAccuracy','패스%')}</th>
        <th class="pm-th-num">${sl('tacklesTotal','태클')}</th><th class="pm-th-num">${sl('tacklesBlocks','블록')}</th><th class="pm-th-num">${sl('interceptions','인터셉트')}</th>
        <th class="pm-th-num">${sl('dribblesAttempts','시도')}</th><th class="pm-th-num">${sl('dribblesSuccess','성공')}</th>
        <th class="pm-th-num">${sl('duelsTotal','총')}</th><th class="pm-th-num">${sl('duelsWon','승')}</th>
        <th class="pm-th-num">${sl('foulsDrawn','받음')}</th><th class="pm-th-num">${sl('foulsCommitted','범함')}</th>
        <th class="pm-th-num">${sl('yellowCards','황색')}</th><th class="pm-th-num">${sl('redCards','적색')}</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="24" class="pm-empty">${sl('emptyData','데이터 없음')}</td></tr>`}
    </tbody>
  </table>
</div>`;

  // 4) 시즌 버튼은 인덱스만 바꿔 재렌더한다. API를 다시 호출하지 않는다.
  document.getElementById('pmNavOlder')?.addEventListener('click', () => {
    if (_pmSznIdx < _pmSznKeys.length - 1) { _pmSznIdx++; pmRenderSeasonPage(); }
  });
  document.getElementById('pmNavNewer')?.addEventListener('click', () => {
    if (_pmSznIdx > 0) { _pmSznIdx--; pmRenderSeasonPage(); }
  });
}

// ── 닉네임 목록 모달 ──────────────────────────────────────────────────────────

/** 저장된 닉네임 목록을 모달로 표시하고 개별 삭제 시 목록 수와 관련 패널의 이름을 갱신한다. */
function pmShowNicknameList() {
  // 1) 저장소를 읽고 현재 경기에서 찾을 수 있는 선수는 원래 이름을 함께 표시한다.
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
    ? '<tr><td colspan="4" class="pm-empty">저장된 닉네임 없음</td></tr>'
    : entries.map(([pid, nick]) => {
        const origName = getName(pid) || `선수 #${pid}`;
        return `<tr>
          <td class="pm-nick-list-name">${pmEsc(origName)}</td>
          <td class="pm-nick-list-id">${pmEsc(pid)}</td>
          <td class="pm-nick-list-nick">${pmEsc(nick)}</td>
          <td class="pm-nick-list-action">
            <button class="pm-btn pm-btn-danger pm-nick-del" data-pid="${pmEsc(pid)}">삭제</button>
          </td>
        </tr>`;
      }).join('');

  // 2) 설정 팝업과 별도로 선수 메뉴 컨테이너 안에 목록 모달을 만든다.
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
            <th class="pm-th-num">playerId</th>
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

  // 3) 삭제를 목록에 위임해 저장값·해당 행·제목의 개수를 갱신하고 경기 화면에도 반영한다.
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

/** 선수 클릭·외부 클릭·Escape를 위임 처리하고 설정 화면의 닉네임 초기화·목록 버튼을 연결한다. */
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
