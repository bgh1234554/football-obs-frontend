// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [이벤트 숨기기 / 수정] API가 잘못된 이벤트를 내려줄 때 이벤트 패널에서 바로잡는다.
//   - 숨기기: row hover X 버튼 -> 그 이벤트를 모든 곳(점수판 점수/득점자, 이벤트 패널, 라인업
//     배지, 전술판 타임라인)에서 뺀다.
//   - 수정: 골/경고·퇴장 row 클릭 -> 메뉴 -> 정보 수정 팝업. 골은 종류(골/페널티골/자책골)·득점
//     팀·득점자·어시스트, 카드는 종류(경고/퇴장/경고 누적 퇴장)·팀·선수를 고친다.
//
// - 이벤트는 "내용" 서명(시간/팀/종류/세부/코멘트/선수/어시스트)으로 식별한다. API가 그 이벤트
//   내용을 고치면 서명이 달라져 숨김/수정이 자동으로 풀리고, 같은 내용의 이벤트가 사라지면 기록도
//   정리된다(evHideApplyToFixtureData). 그래서 새 내용으로 다시 들어온 이벤트는 다시 그대로 표시된다.
// - 필터는 fixture.js가 데이터를 받는 입구에서 한 번 적용한다 — data.events는 숨김 제외 + 수정 반영
//   목록, data._rawEvents는 API 원본, data._rawScores는 API 원본 점수(복원/재적용용, 세션 캐시에도 저장).
// - 점수: API 점수에 "(숨김/수정 후 이벤트의 득점) - (원본 이벤트의 득점)" 차이만 더한다. 승부차기
//   골(comments: Penalty Shootout)은 PK 점수에 같은 방식으로 반영. 자책골 이벤트의 side는 API와
//   같이 "득점이 인정된 팀"이다(득점자는 상대 팀 선수).
// - 숨긴 이벤트가 있을 때만 이벤트 패널 필터 버튼 왼쪽에 관리 버튼이 생기고, 팝업에서 복원한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EV_HIDE_STORAGE_KEY = 'obs.events.hidden.v1';
const EV_HIDE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 수동 입력 저장소(DETAIL_MANUAL_TTL_MS)와 같은 7일
// 수정 팝업에서 고칠 수 있는 이벤트 필드 — 원본과 전부 같으면 수정 기록을 지운다.
const EV_EDIT_FIELDS = ['side', 'teamId', 'detail', 'playerId', 'playerName', 'playerNameKoLong', 'playerOrigName',
  'assistId', 'assistName', 'assistNameKoLong', 'assistOrigName'];

/** 이벤트 내용 서명 — API 원본 필드만 사용(화면용 가공 필드 제외). 내용이 바뀌면 서명도 바뀐다. */
function evHideSignature(ev) {
  return JSON.stringify([
    ev?.side ?? '', ev?.type ?? '', ev?.detail ?? '', ev?.comments ?? '',
    Number(ev?.elapsed ?? 0), Number(ev?.extra ?? 0),
    Number(ev?.playerId ?? 0), ev?.playerName ?? '',
    Number(ev?.assistId ?? 0), ev?.assistName ?? '',
  ]);
}

// ── 저장소 ────────────────────────────────────────────────────────────────────
// { [fixtureId]: { savedAt, items: { [sig]: {snapshot, hiddenAt} }, edits: { [sig]: {patch, editedAt} } } }

function evHideLoad() {
  let store = {};
  try { store = JSON.parse(localStorage.getItem(EV_HIDE_STORAGE_KEY) || '{}') || {}; } catch { store = {}; }
  const now = Date.now();
  let pruned = false;
  Object.keys(store).forEach(fixtureId => {
    const entry = store[fixtureId];
    if (!entry || typeof entry !== 'object' || now - Number(entry.savedAt || 0) > EV_HIDE_TTL_MS) {
      delete store[fixtureId];
      pruned = true;
    }
  });
  if (pruned) evHideSave(store);
  return store;
}

function evHideSave(store) {
  try {
    if (Object.keys(store).length) localStorage.setItem(EV_HIDE_STORAGE_KEY, JSON.stringify(store));
    else localStorage.removeItem(EV_HIDE_STORAGE_KEY);
  } catch {}
}

/** fixture의 숨김(items)/수정(edits) 기록. 없으면 빈 맵. */
function evHideGetEntry(fixtureId) {
  const id = String(fixtureId ?? '').trim();
  const entry = (id && evHideLoad()[id]) || {};
  return { items: { ...(entry.items || {}) }, edits: { ...(entry.edits || {}) } };
}

function evHideSetEntry(fixtureId, entry) {
  const id = String(fixtureId ?? '').trim();
  if (!id) return;
  const store = evHideLoad();
  const items = entry.items || {};
  const edits = entry.edits || {};
  if (Object.keys(items).length || Object.keys(edits).length) store[id] = { savedAt: Date.now(), items, edits };
  else delete store[id];
  evHideSave(store);
}

/** 숨김 항목 맵만 필요할 때(관리 버튼/팝업). */
function evHideGetItems(fixtureId) {
  return evHideGetEntry(fixtureId).items;
}

// ── 필터 적용 (fixture.js 입구) ───────────────────────────────────────────────

function evIsGoalEvent(ev) {
  return String(ev?.type || '').toLowerCase() === 'goal';
}

function evIsShootoutEvent(ev) {
  return String(ev?.comments || '').toLowerCase() === 'penalty shootout';
}

/** 이벤트 목록의 득점 합계 — 일반 득점은 home/away, 승부차기 성공은 penHome/penAway. 실축 제외. */
function evHideGoalCredits(events) {
  const credits = { home: 0, away: 0, penHome: 0, penAway: 0 };
  (events || []).forEach(ev => {
    if (!ev || !evIsGoalEvent(ev)) return;
    const detail = String(ev.detail || '').toLowerCase();
    if (detail === 'missed penalty') return;
    const side = ev.side === 'home' ? 'home' : ev.side === 'away' ? 'away' : null;
    if (!side) return;
    if (evIsShootoutEvent(ev)) {
      if (detail === 'penalty') credits[side === 'home' ? 'penHome' : 'penAway'] += 1;
      return;
    }
    credits[side] += 1;
  });
  return credits;
}

/**
 * fixture 데이터에 숨김/수정을 적용한 새 객체 반환(원본 불변). fixture.js가 API 응답/캐시 복원 직후와
 * 숨김·수정 직후(fixtureReapplyEventHide) 호출한다.
 * 1) API 원본 이벤트/점수는 data._rawEvents/_rawScores로 보존(이미 적용된 데이터면 그 값을 재사용).
 * 2) 원본 이벤트마다 서명(_hideSig)을 붙인다 — 이후 가공(교체 override, alt ID 연결)은 전부 스프레드
 *    복사라 표시용 이벤트에도 따라가, X 버튼/수정 팝업이 원본 서명으로 기록할 수 있다.
 * 3) 숨김/수정 기록 중 지금 원본에 같은 서명이 없는 것은 지운다(내용이 바뀌었거나 이벤트가 사라짐).
 *    단 이벤트가 하나도 없는 응답은 일시적 누락일 수 있어 정리하지 않는다.
 * 4) 점수는 원본 점수 + (적용 후 득점 - 원본 득점). 원본 PK 점수가 null(승부차기 없음)이면 그대로 둔다.
 */
function evHideApplyToFixtureData(data) {
  if (!data) return data;
  const raw = Array.isArray(data._rawEvents) ? data._rawEvents : data.events;
  if (!Array.isArray(raw)) return data;
  const matchInfo = data.matchInfo || {};
  const rawScores = data._rawScores || {
    homeScore: matchInfo.homeScore,
    awayScore: matchInfo.awayScore,
    homePenaltyScore: matchInfo.homePenaltyScore,
    awayPenaltyScore: matchInfo.awayPenaltyScore,
  };
  const fixtureId = String(matchInfo.fixtureId ?? '').trim();
  const { items, edits } = evHideGetEntry(fixtureId);

  const tagged = raw.map(ev => (ev ? { ...ev, _hideSig: evHideSignature(ev) } : ev));
  if (raw.length && (Object.keys(items).length || Object.keys(edits).length)) {
    const present = new Set(tagged.map(ev => ev?._hideSig));
    let changed = false;
    [items, edits].forEach(map => Object.keys(map).forEach(sig => {
      if (!present.has(sig)) { delete map[sig]; changed = true; }
    }));
    if (changed) evHideSetEntry(fixtureId, { items, edits });
  }

  const events = tagged
    .filter(ev => !ev || !items[ev._hideSig])
    .map(ev => (ev && edits[ev._hideSig]?.patch ? { ...ev, ...edits[ev._hideSig].patch, _evEdited: true } : ev));

  const rawCredits = evHideGoalCredits(raw);
  const effCredits = evHideGoalCredits(events);
  const adjust = (value, delta) => (value == null || !Number.isFinite(Number(value)) ? value : Math.max(0, Number(value) + delta));
  return {
    ...data,
    _rawEvents: raw,
    _rawScores: rawScores,
    matchInfo: {
      ...matchInfo,
      homeScore: adjust(rawScores.homeScore, effCredits.home - rawCredits.home),
      awayScore: adjust(rawScores.awayScore, effCredits.away - rawCredits.away),
      homePenaltyScore: adjust(rawScores.homePenaltyScore, effCredits.penHome - rawCredits.penHome),
      awayPenaltyScore: adjust(rawScores.awayPenaltyScore, effCredits.penAway - rawCredits.penAway),
    },
    events,
  };
}
window.evHideApplyToFixtureData = evHideApplyToFixtureData;

/** 현재 표시 중인 경기 ID — 이벤트 패널이 마지막으로 그린 데이터 기준. */
function evHideCurrentFixtureId() {
  return String(window._eventsLastData?.matchInfo?.fixtureId ?? '').trim();
}

/** 숨김/수정/복원 후 fixture.js가 원본 이벤트로 다시 적용해 점수판·모든 패널을 갱신. */
function evHideReapply() {
  if (typeof window.fixtureReapplyEventHide === 'function') window.fixtureReapplyEventHide();
}

// ── 숨기기 ────────────────────────────────────────────────────────────────────

/** X 버튼 — 표시용 이벤트(ev)를 원본 서명으로 숨긴다. 관리 팝업 표시용 요약도 함께 저장. */
function evHideEvent(ev) {
  const fixtureId = evHideCurrentFixtureId();
  if (!fixtureId || !ev?._hideSig) return;
  const pick = (kind) => (typeof evPickPlayerName === 'function' ? evPickPlayerName(ev, kind) : '')
    || (kind === 'assist' ? ev.assistName : ev.playerName) || '';
  const isSubst = String(ev.type || '').toLowerCase() === 'subst';
  const entry = evHideGetEntry(fixtureId);
  entry.items[ev._hideSig] = {
    hiddenAt: Date.now(),
    snapshot: {
      side: ev.side || '',
      elapsed: ev.elapsed ?? null,
      extra: ev.extra ?? null,
      label: typeof evLabelKo === 'function' ? evLabelKo(ev) : String(ev.type || ''),
      player: pick('player'),
      assist: isSubst || ev.assistName ? pick('assist') : '',
      isSubst,
    },
  };
  evHideSetEntry(fixtureId, entry);
  evHideReapply();
}
window.evHideEvent = evHideEvent;

/** 숨김 복원 — sig가 없으면 해당 경기 숨김 전체 복원(수정 기록은 유지). */
function evHideRestore(fixtureId, sig) {
  const entry = evHideGetEntry(fixtureId);
  if (sig) delete entry.items[sig];
  else entry.items = {};
  evHideSetEntry(fixtureId, entry);
  evHideReapply();
}

/** 이벤트 row용 X 버튼. 원본 서명이 없는 행(구간 마커 등)은 null. */
function evHideCreateRowButton(ev) {
  if (!ev?._hideSig) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ev-hide-btn';
  btn.title = '이 이벤트 숨기기 (점수판/라인업/전술판에도 반영 안 됨)';
  btn.setAttribute('aria-label', '이벤트 숨기기');
  btn.textContent = '✕';
  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    evHideEvent(ev);
  });
  return btn;
}
window.evHideCreateRowButton = evHideCreateRowButton;

/** 필터 버튼 왼쪽 관리 버튼 — 현재 경기에 숨긴 이벤트가 있을 때만 생성, 없으면 null. */
function evHideCreateManageButton() {
  const fixtureId = evHideCurrentFixtureId();
  const count = Object.keys(evHideGetItems(fixtureId)).length;
  if (!count) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ev-filter-btn ev-hide-manage-btn';
  btn.title = `숨긴 이벤트 관리 (${count}개)`;
  // 눈 가림 아이콘 — 캠 큰 메뉴(lp-stat)에서는 라벨/개수 없이 아이콘만 보인다(events-panel.css).
  btn.innerHTML = [
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
    '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    '<circle cx="8" cy="8" r="2" fill="currentColor"/>',
    '<path d="M2.5 13.5 13.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    '</svg>',
    `<span class="ev-filter-btn-label">숨김</span><span class="ev-filter-badge">${count}</span>`,
  ].join('');
  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    evHideOpenManager(fixtureId);
  });
  return btn;
}
window.evHideCreateManageButton = evHideCreateManageButton;

/** 모달 공통 뼈대 — 교체 선수 선택 모달과 같은 스타일. { overlay, modal, body, actions, close }. */
function evHideCreateModal(titleText, extraClass) {
  const overlay = document.createElement('div');
  overlay.className = `ev-subst-picker-overlay ${extraClass}-overlay`;
  const modal = document.createElement('div');
  modal.className = `ev-subst-picker-modal ${extraClass}`;
  modal.addEventListener('click', e => e.stopPropagation());

  const header = document.createElement('div');
  header.className = 'ev-subst-picker-header';
  const title = document.createElement('span');
  title.className = 'ev-subst-picker-title';
  title.textContent = titleText;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ev-subst-picker-close';
  closeBtn.textContent = '✕';
  header.append(title, closeBtn);

  const actions = document.createElement('div');
  actions.className = 'ev-subst-picker-actions';

  function onEsc(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onEsc);

  modal.append(header);
  overlay.appendChild(modal);
  const mount = () => {
    modal.append(actions);
    // 전술판 전체화면 중이면 전체화면 요소 안에 띄운다(evOpenSubstPicker와 동일).
    const fsEl = document.fullscreenElement;
    (fsEl ? (fsEl.querySelector('.tactics-viewport') || fsEl) : document.body).appendChild(overlay);
  };
  return { overlay, modal, actions, close, mount };
}

/** 숨긴 이벤트 관리 팝업 — 개별 복원 / 전체 복원. */
function evHideOpenManager(fixtureId) {
  document.querySelector('.ev-hide-mgr-modal-overlay')?.remove();
  const { modal, actions, close, mount } = evHideCreateModal('숨긴 이벤트', 'ev-hide-mgr-modal');

  const help = document.createElement('div');
  help.className = 'ev-hide-mgr-help';
  help.textContent = 'API가 이 이벤트 내용을 고치면 숨김이 자동으로 풀립니다.';
  const list = document.createElement('div');
  list.className = 'ev-subst-picker-list';
  modal.append(help, list);

  const restoreAllBtn = document.createElement('button');
  restoreAllBtn.type = 'button';
  restoreAllBtn.className = 'ev-subst-picker-confirm';
  restoreAllBtn.textContent = '모두 복원';
  restoreAllBtn.addEventListener('click', () => { evHideRestore(fixtureId); close(); });
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'ev-subst-picker-cancel';
  cancelBtn.textContent = '닫기';
  cancelBtn.addEventListener('click', close);
  actions.append(restoreAllBtn, cancelBtn);

  function renderList() {
    const entries = Object.entries(evHideGetItems(fixtureId))
      .sort((a, b) => (Number(a[1]?.snapshot?.elapsed ?? 0) + Number(a[1]?.snapshot?.extra ?? 0) / 100)
        - (Number(b[1]?.snapshot?.elapsed ?? 0) + Number(b[1]?.snapshot?.extra ?? 0) / 100));
    if (!entries.length) { close(); return; }
    list.replaceChildren(...entries.map(([sig, item]) => {
      const snap = item?.snapshot || {};
      const row = document.createElement('div');
      row.className = 'ev-subst-picker-item ev-hide-mgr-item';

      const time = document.createElement('span');
      time.className = 'ev-subst-picker-number';
      time.textContent = snap.extra ? `${snap.elapsed}+${snap.extra}'` : `${snap.elapsed ?? '-'}'`;

      const text = document.createElement('span');
      text.className = 'ev-subst-picker-name';
      const team = snap.side === 'home' ? '홈' : snap.side === 'away' ? '원정' : '';
      const who = snap.isSubst
        ? `IN ${snap.assist || '?'} / OUT ${snap.player || '?'}`
        : [snap.player || '(선수 없음)', snap.assist ? `(도움 ${snap.assist})` : ''].filter(Boolean).join(' ');
      text.textContent = [team, snap.label, who].filter(Boolean).join(' · ');
      text.title = text.textContent;

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'ev-hide-mgr-restore';
      restoreBtn.textContent = '복원';
      restoreBtn.addEventListener('click', () => { evHideRestore(fixtureId, sig); renderList(); });

      row.append(time, text, restoreBtn);
      return row;
    }));
  }

  renderList();
  if (list.childElementCount) mount();
}

// ── 수정 (골/카드) ────────────────────────────────────────────────────────────

/** 수정 대상 이벤트인지 — 일반 골(승부차기 제외, 실축 제외)과 카드. */
function evEditIsEditable(ev) {
  if (!ev?._hideSig) return false;
  const type = String(ev.type || '').toLowerCase();
  const detail = String(ev.detail || '').toLowerCase();
  if (type === 'goal') return !evIsShootoutEvent(ev) && detail !== 'missed penalty';
  return type === 'card';
}
window.evEditIsEditable = evEditIsEditable;

/** 원본(API) 이벤트 — _rawEvents에서 서명으로 찾는다. 수정 전 값과 비교/되돌리기에 사용. */
function evEditFindRawEvent(sig) {
  const raw = window._eventsLastData?._rawEvents || [];
  return raw.find(ev => ev && evHideSignature(ev) === sig) || null;
}

/** 수정 기록 저장. patch가 원본과 전부 같거나 null이면 기록을 지운다. */
function evEditSave(sig, patch) {
  const fixtureId = evHideCurrentFixtureId();
  if (!fixtureId || !sig) return;
  const entry = evHideGetEntry(fixtureId);
  const raw = evEditFindRawEvent(sig) || {};
  const same = patch && EV_EDIT_FIELDS.every(key => (patch[key] ?? null) === (raw[key] ?? null)
    || (key.endsWith('Id') && Number(patch[key] || 0) === Number(raw[key] || 0)));
  if (!patch || same) delete entry.edits[sig];
  else entry.edits[sig] = { patch, editedAt: Date.now() };
  evHideSetEntry(fixtureId, entry);
  evHideReapply();
}

/**
 * 팀별 선수 목록(선발+교체). 라인업 패널 원본(lineupPanelState.lastFixture — playerStats로 추정한
 * 라인업 포함)에 수동 입력/ID 연결을 반영해 쓰고(교체 반영 전이라 벤치 선수도 전부 포함), 그래도
 * 비면 playerStats에서 그 팀 선수를 모은다.
 */
function evEditRoster(side) {
  const base = (typeof lineupPanelState !== 'undefined' && lineupPanelState?.lastFixture) || window._eventsLastData;
  const data = base && typeof buildEffectiveFixtureData === 'function' ? buildEffectiveFixtureData(base) : base;
  const lineup = data?.[`${side}Lineup`];
  const roster = [...(lineup?.startXi || []), ...(lineup?.substitutes || [])].filter(Boolean);
  if (roster.length) return roster;
  return (data?.playerStats || []).filter(p => p && p.side === side).map(p => ({
    playerId: Number(p.playerId) || 0,
    name: p.playerName || '',
    nameKoLong: p.playerNameKoLong || null,
    number: p.number ?? '',
  }));
}

function evEditTeamName(side) {
  const mi = window._eventsLastData?.matchInfo || {};
  const name = side === 'home'
    ? (mi.homeTeamNameShort || mi.homeTeamName)
    : (mi.awayTeamNameShort || mi.awayTeamName);
  return name || (side === 'home' ? '홈' : '원정');
}

function evEditTeamId(side) {
  const mi = window._eventsLastData?.matchInfo || {};
  return side === 'home' ? mi.homeTeamId : mi.awayTeamId;
}

function evEditPlayerLabel(player) {
  const name = (typeof pickName === 'function' ? pickName(player, 'roster') : '') || player?.name || player?.nameKoLong || '';
  const num = player?.number != null && player.number !== '' ? `${player.number} ` : '';
  return `${num}${name}`.trim() || '(이름 없음)';
}

/** 이벤트의 선수와 같은 로스터 인덱스 — playerId 우선, 없으면 이름. 못 찾으면 -1. */
function evEditRosterIndex(roster, id, names) {
  const pid = Number(id) || 0;
  if (pid) {
    const byId = roster.findIndex(p => Number(p?.playerId) === pid);
    if (byId >= 0) return byId;
  }
  const wanted = names.map(n => String(n || '').trim()).filter(Boolean);
  if (!wanted.length) return -1;
  return roster.findIndex(p => [p?.name, p?.nameKoLong, p?.origName].some(n => n && wanted.includes(String(n).trim())));
}

/** 세그먼트 버튼 그룹. options: [{value, label}]. onChange(value). */
function evEditSegment(options, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'ev-edit-seg';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ev-edit-seg-btn';
    btn.textContent = opt.label;
    btn.classList.toggle('is-active', opt.value === value);
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.ev-edit-seg-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      onChange(opt.value);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function evEditField(labelText, control) {
  const field = document.createElement('label');
  field.className = 'ev-edit-field';
  const label = document.createElement('span');
  label.className = 'ev-edit-label';
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

/**
 * 골/카드 정보 수정 팝업.
 * - 골: 종류(골/페널티골/자책골) + 득점 팀(득점이 인정된 팀, 자책골이면 득점자는 상대 팀 선수) +
 *   득점자 + 어시스트(자책골은 없음).
 * - 카드: 종류(경고/퇴장/경고 누적 퇴장) + 팀 + 선수.
 * 선수 목록은 그 팀 선발+교체. 목록에 없는 현재 선수는 "현재 선수 유지" 선택지로 둔다.
 */
function evEditOpen(ev) {
  if (!evEditIsEditable(ev)) return;
  document.querySelector('.ev-edit-modal-overlay')?.remove();
  const isGoal = evIsGoalEvent(ev);
  const sig = ev._hideSig;
  const { modal, actions, close, mount } = evHideCreateModal(isGoal ? '골 정보 수정' : '카드 정보 수정', 'ev-edit-modal');

  const keepPlayer = {
    playerId: ev.playerId ?? null,
    playerName: ev.playerName ?? null,
    playerNameKoLong: ev.playerNameKoLong ?? null,
    playerOrigName: ev.playerOrigName ?? null,
  };
  const keepAssist = {
    assistId: ev.assistId ?? null,
    assistName: ev.assistName ?? null,
    assistNameKoLong: ev.assistNameKoLong ?? null,
    assistOrigName: ev.assistOrigName ?? null,
  };
  const draft = {
    side: ev.side === 'away' ? 'away' : 'home',
    detail: isGoal
      ? (['Own Goal', 'Penalty'].includes(ev.detail) ? ev.detail : 'Normal Goal')
      : (['Red Card', 'Second Yellow Card'].includes(ev.detail) ? ev.detail : 'Yellow Card'),
    playerKey: 'keep',
    assistKey: 'keep',
  };

  const body = document.createElement('div');
  body.className = 'ev-edit-body';
  modal.append(body);

  const typeOptions = isGoal
    ? [{ value: 'Normal Goal', label: '골' }, { value: 'Penalty', label: '페널티골' }, { value: 'Own Goal', label: '자책골' }]
    : [{ value: 'Yellow Card', label: '경고' }, { value: 'Red Card', label: '퇴장' }, { value: 'Second Yellow Card', label: '경고 누적 퇴장' }];
  const teamOptions = ['home', 'away'].map(side => ({ value: side, label: evEditTeamName(side) }));

  const playerSelect = document.createElement('select');
  playerSelect.className = 'ev-edit-select';
  const assistSelect = document.createElement('select');
  assistSelect.className = 'ev-edit-select';
  const assistField = evEditField('어시스트', assistSelect);

  // 득점자는 자책골이면 상대 팀, 아니면 득점 팀 선수. 카드는 그 팀 선수.
  const playerSide = () => (isGoal && draft.detail === 'Own Goal' ? (draft.side === 'home' ? 'away' : 'home') : draft.side);

  function fillSelect(select, roster, currentKeyIndex, keepLabel, withNone) {
    const options = [];
    options.push(`<option value="keep">${dpEscapeSafe(keepLabel)}</option>`);
    if (withNone) options.push('<option value="none">없음</option>');
    roster.forEach((p, i) => options.push(`<option value="${i}">${dpEscapeSafe(evEditPlayerLabel(p))}</option>`));
    select.innerHTML = options.join('');
    select.value = currentKeyIndex >= 0 ? String(currentKeyIndex) : 'keep';
  }

  function refreshPlayers() {
    const roster = evEditRoster(playerSide());
    const idx = evEditRosterIndex(roster, keepPlayer.playerId, [keepPlayer.playerName, keepPlayer.playerNameKoLong, keepPlayer.playerOrigName]);
    const currentName = (typeof evPickPlayerName === 'function' ? evPickPlayerName(ev, 'player') : '') || '선수 없음';
    fillSelect(playerSelect, roster, idx, `현재: ${currentName}`, false);
    draft.playerKey = playerSelect.value;
    playerSelect._roster = roster;

    const showAssist = isGoal && draft.detail !== 'Own Goal';
    assistField.hidden = !showAssist;
    if (showAssist) {
      const aRoster = evEditRoster(draft.side);
      const aIdx = evEditRosterIndex(aRoster, keepAssist.assistId, [keepAssist.assistName, keepAssist.assistNameKoLong, keepAssist.assistOrigName]);
      const currentAssist = (typeof evPickPlayerName === 'function' ? evPickPlayerName(ev, 'assist') : '') || '없음';
      fillSelect(assistSelect, aRoster, aIdx, `현재: ${currentAssist}`, true);
      if (aIdx < 0 && !keepAssist.assistId && !keepAssist.assistName) assistSelect.value = 'none';
      draft.assistKey = assistSelect.value;
      assistSelect._roster = aRoster;
    }
  }

  playerSelect.addEventListener('change', () => { draft.playerKey = playerSelect.value; });
  assistSelect.addEventListener('change', () => { draft.assistKey = assistSelect.value; });

  body.append(
    evEditField('종류', evEditSegment(typeOptions, draft.detail, value => { draft.detail = value; refreshPlayers(); })),
    evEditField(isGoal ? '득점 팀' : '팀', evEditSegment(teamOptions, draft.side, value => { draft.side = value; refreshPlayers(); })),
    evEditField(isGoal ? '득점자' : '선수', playerSelect),
    assistField,
  );
  if (isGoal) {
    const help = document.createElement('div');
    help.className = 'ev-hide-mgr-help';
    help.textContent = '득점 팀은 골이 인정된 팀입니다. 자책골이면 득점자는 상대 팀 선수 중에서 고릅니다.';
    body.appendChild(help);
  }
  refreshPlayers();

  const pickFrom = (select, key, prefix) => {
    const p = select._roster?.[Number(key)];
    return {
      [`${prefix}Id`]: Number(p?.playerId) || 0,
      [`${prefix}Name`]: p?.name || p?.nameKoLong || '',
      [`${prefix}NameKoLong`]: p?.nameKoLong || null,
      [`${prefix}OrigName`]: p?.origName || null,
    };
  };

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'ev-subst-picker-reset';
  resetBtn.textContent = '초기화';
  resetBtn.disabled = !ev._evEdited;
  resetBtn.title = ev._evEdited ? '수정한 내용을 지우고 API 원래 값으로 되돌립니다.' : '수정한 내용이 없습니다.';
  resetBtn.addEventListener('click', () => { evEditSave(sig, null); close(); });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'ev-subst-picker-confirm';
  saveBtn.textContent = '저장';
  saveBtn.addEventListener('click', () => {
    const patch = {
      side: draft.side,
      teamId: evEditTeamId(draft.side) ?? ev.teamId ?? null,
      detail: draft.detail,
      ...(draft.playerKey === 'keep' ? keepPlayer : pickFrom(playerSelect, draft.playerKey, 'player')),
    };
    if (isGoal) {
      if (draft.detail === 'Own Goal' || draft.assistKey === 'none') {
        Object.assign(patch, { assistId: null, assistName: null, assistNameKoLong: null, assistOrigName: null });
      } else {
        Object.assign(patch, draft.assistKey === 'keep' ? keepAssist : pickFrom(assistSelect, draft.assistKey, 'assist'));
      }
    }
    evEditSave(sig, patch);
    close();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'ev-subst-picker-cancel';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', close);

  actions.append(resetBtn, saveBtn, cancelBtn);
  mount();
}
window.evEditOpen = evEditOpen;

function dpEscapeSafe(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── row 클릭 메뉴 ─────────────────────────────────────────────────────────────

function evRowMenuClose() {
  document.querySelector('.ev-row-menu')?.remove();
}

/** 골/카드 row 클릭 시 클릭 위치에 작은 메뉴(정보 수정 / 수정 초기화 / 숨기기). */
function evRowMenuOpen(ev, clientX, clientY) {
  evRowMenuClose();
  const menu = document.createElement('div');
  menu.className = 'ev-row-menu';
  menu.addEventListener('click', e => e.stopPropagation());
  const add = (label, onClick, extraClass = '') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ev-row-menu-btn ${extraClass}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', () => { evRowMenuClose(); onClick(); });
    menu.appendChild(btn);
  };
  add('정보 수정', () => evEditOpen(ev));
  if (ev._evEdited) add('수정 초기화', () => evEditSave(ev._hideSig, null));
  add('숨기기', () => evHideEvent(ev), 'is-danger');

  const fsEl = document.fullscreenElement;
  (fsEl || document.body).appendChild(menu);
  const point = typeof toDisplayLayoutPoint === 'function' ? toDisplayLayoutPoint(clientX, clientY) : { x: clientX, y: clientY };
  menu.style.left = `${point.x + 6}px`;
  menu.style.top = `${point.y + 6}px`;
  if (typeof pmClampPopupToViewport === 'function') pmClampPopupToViewport(menu);
}

/** events-panel.js evCreateRow가 골/카드 row에 연결. */
function evEditAttachRow(row, ev) {
  if (!evEditIsEditable(ev)) return;
  row.classList.add('is-editable');
  row.addEventListener('click', event => {
    if (event.target.closest('button, a, input, select')) return;
    event.stopPropagation();
    evRowMenuOpen(ev, event.clientX, event.clientY);
  });
}
window.evEditAttachRow = evEditAttachRow;

document.addEventListener('pointerdown', event => {
  if (!document.querySelector('.ev-row-menu')) return;
  if (event.target.closest?.('.ev-row-menu')) return;
  evRowMenuClose();
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') evRowMenuClose();
});
