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

/**
 * 원본 이벤트 목록의 서명 배열 — 같은 내용이 여러 번 나오면 두 번째부터 "#2", "#3"을 붙여 구분한다
 * (첫 번째는 그대로라 기존 저장값과 호환). 그래야 중복 이벤트 하나만 숨기거나 수정할 수 있다.
 */
function evHideSignatures(rawEvents) {
  const seen = new Map();
  return (rawEvents || []).map(ev => {
    if (!ev) return null;
    const base = evHideSignature(ev);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
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

  const sigs = evHideSignatures(raw);
  const tagged = raw.map((ev, i) => (ev ? { ...ev, _hideSig: sigs[i] } : ev));
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
    if (typeof popoutModeEnabled === 'function' && popoutModeEnabled()) window.Popout.open('evhidden', {});
    else evHideOpenManager(fixtureId);
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
    if (!entries.length) {
      close();
      // 새 창으로 연 경우 마지막 항목까지 복원하면 창도 닫는다(빈 창만 남지 않도록).
      if (window.__POPOUT_MODE__) setTimeout(() => window.close(), 50);
      return;
    }
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
  const sigs = evHideSignatures(raw);
  const index = sigs.indexOf(sig);
  return index >= 0 ? raw[index] : null;
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
 * 팀별 선발/교체 명단(교체 반영 전). 라인업 패널 원본(lineupPanelState.lastFixture — playerStats로
 * 추정한 라인업 포함)에 수동 입력/ID 연결을 반영해 쓰고, 라인업이 아예 없으면 playerStats의 그 팀
 * 선수를 선발 여부(substitute)로 나눠 쓴다.
 */
function evEditLineupParts(side) {
  const base = (typeof lineupPanelState !== 'undefined' && lineupPanelState?.lastFixture) || window._eventsLastData;
  const data = base && typeof buildEffectiveFixtureData === 'function' ? buildEffectiveFixtureData(base) : base;
  const lineup = data?.[`${side}Lineup`];
  const starters = (lineup?.startXi || []).filter(Boolean);
  const bench = (lineup?.substitutes || []).filter(Boolean);
  if (starters.length || bench.length) return { starters, bench };
  const rows = (data?.playerStats || []).filter(p => p && p.side === side).map(p => ({
    playerId: Number(p.playerId) || 0,
    name: p.playerName || '',
    nameKoLong: p.playerNameKoLong || null,
    number: p.number ?? '',
    pos: p.position || '',
    _sub: p.substitute === true,
  }));
  return { starters: rows.filter(p => !p._sub), bench: rows.filter(p => p._sub) };
}

/** 팀 전체 명단(선발+교체) — 시점 계산이 불가능할 때의 폴백. */
function evEditRoster(side) {
  const { starters, bench } = evEditLineupParts(side);
  return [...starters, ...bench];
}
window.evEditRoster = evEditRoster;

const EV_POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };
/**
 * 선수 선택 목록 정렬 — 포지션(GK → DF → MF → FW → 미상) 다음 등번호 오름차순(번호 없으면 뒤).
 * 명단 원본 순서(API/수동 입력/playerStats 추정, 교체 투입 선수는 벤치 순서)가 섞여 있어 목록이
 * 뒤죽박죽으로 보이던 문제를 고정 기준으로 정리한다.
 */
function evSortPlayers(players) {
  const posRank = p => EV_POS_ORDER[String(p?.pos || p?.position || '').toUpperCase().charAt(0)] ?? 4;
  const numRank = p => {
    const n = Number.parseInt(p?.number, 10);
    return Number.isFinite(n) ? n : 999;
  };
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => posRank(a.p) - posRank(b.p) || numRank(a.p) - numRank(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

/** 이벤트 시각 정렬 키(분*100+추가시간). */
function evEditTimeKey(ev) {
  return Number(ev?.elapsed ?? 0) * 100 + Number(ev?.extra ?? 0);
}

/**
 * 이벤트(ev) 시점에 실제로 선택 가능한 선수 목록.
 *  - role 'onPitch': 그 시점 그라운드에 있는 선수(선발 + 이전 교체 IN - 이전 교체 OUT - 이전 퇴장).
 *    골 득점자/어시스트, 카드, 교체 OUT에 사용.
 *  - role 'bench': 아직 투입되지 않은 교체 명단 선수. 교체 IN에 사용.
 * 같은 분의 이벤트는 이벤트 목록 순서상 ev보다 앞에 있는 것만 반영하고, ev 자신은 제외한다(교체
 * 선수 override를 다시 고를 때 자기 자신의 교체가 목록을 바꾸지 않도록). 이벤트는 교체 override/수정이
 * 반영된 이벤트 패널 데이터 기준. 명단이 비어 계산할 수 없으면 팀 전체 명단으로 폴백.
 */
function evAvailablePlayers(ev, side, role) {
  const { starters, bench } = evEditLineupParts(side);
  const roster = [...starters, ...bench];
  if (!starters.length) return evSortPlayers(roster);

  const indexOf = (id, names) => evEditRosterIndex(roster, id, names);
  const onPitch = new Set(starters.map((_, i) => i));
  const usedIn = new Set();
  const targetKey = evEditTimeKey(ev);
  const events = (window._eventsLastData?.events || [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e && e.side === side)
    .sort((a, b) => evEditTimeKey(a.e) - evEditTimeKey(b.e) || a.i - b.i);

  for (const { e } of events) {
    if (ev?._hideSig && e._hideSig === ev._hideSig) break;
    if (evEditTimeKey(e) > targetKey) break;
    const type = String(e.type || '').toLowerCase();
    const detail = String(e.detail || '').toLowerCase();
    if (type === 'subst') {
      const outIdx = indexOf(e.playerId, [e.playerName, e.playerNameKoLong, e.playerOrigName]);
      const inIdx = indexOf(e.assistId, [e.assistName, e.assistNameKoLong, e.assistOrigName]);
      if (outIdx >= 0) onPitch.delete(outIdx);
      if (inIdx >= 0) { onPitch.add(inIdx); usedIn.add(inIdx); }
    } else if (type === 'card' && (detail === 'red card' || detail === 'second yellow card')) {
      const idx = indexOf(e.playerId, [e.playerName, e.playerNameKoLong, e.playerOrigName]);
      if (idx >= 0) onPitch.delete(idx);
    }
  }

  if (role === 'bench') {
    return evSortPlayers(roster.filter((_, i) => i >= starters.length && !usedIn.has(i) && !onPitch.has(i)));
  }
  return evSortPlayers(roster.filter((_, i) => onPitch.has(i)));
}
window.evAvailablePlayers = evAvailablePlayers;

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
    btn.dataset.value = opt.value;
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
  const field = document.createElement('div');
  field.className = 'ev-edit-field';
  const label = document.createElement('span');
  label.className = 'ev-edit-label';
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

/** 교체 선수 선택 모달과 같은 모양의 선수 행(등번호 / 이름 / 포지션). */
function evEditPlayerItem(numberText, nameText, posText, selected, onClick) {
  const item = document.createElement('div');
  item.className = 'ev-subst-picker-item';
  item.classList.toggle('is-selected', !!selected);
  const num = document.createElement('span');
  num.className = 'ev-subst-picker-number';
  num.textContent = numberText;
  const name = document.createElement('span');
  name.className = 'ev-subst-picker-name';
  name.textContent = nameText;
  const pos = document.createElement('span');
  pos.className = 'ev-subst-picker-pos';
  pos.textContent = posText || '';
  item.append(num, name, pos);
  item.addEventListener('click', () => {
    item.parentElement?.querySelectorAll('.ev-subst-picker-item.is-selected').forEach(el => el.classList.remove('is-selected'));
    item.classList.add('is-selected');
    onClick();
  });
  return item;
}

function evEditDisplayName(player) {
  return (typeof pickName === 'function' ? pickName(player, 'roster') : '') || player?.name || player?.nameKoLong || '(이름 없음)';
}

/**
 * 골/카드 정보 수정 팝업 — 교체 선수 선택 모달과 같은 모양(헤더 / 선수 목록 / 초기화·확인·취소).
 * - 골: 종류(골/페널티골/자책골) + 득점 팀(득점이 인정된 팀, 자책골이면 득점자는 상대 팀 선수) +
 *   득점자/어시스트 탭(어시스트는 자책골이면 없음).
 * - 카드: 종류(경고/퇴장/경고 누적 퇴장) + 팀 + 선수.
 * 선수 목록은 그 이벤트 시점에 그라운드에 있던 선수만(evAvailablePlayers). 지금 값이 목록에 없으면
 * 맨 위 "현재" 행으로 남겨 그대로 유지할 수 있다.
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
  const hadAssist = !!(Number(keepAssist.assistId) || String(keepAssist.assistName || '').trim());
  // player/assist: 'keep'(현재 값 유지) | 'none'(어시스트 없음) | 선수 객체
  const draft = {
    side: ev.side === 'away' ? 'away' : 'home',
    detail: isGoal
      ? (['Own Goal', 'Penalty'].includes(ev.detail) ? ev.detail : 'Normal Goal')
      : (['Red Card', 'Second Yellow Card'].includes(ev.detail) ? ev.detail : 'Yellow Card'),
    player: 'keep',
    assist: hadAssist ? 'keep' : 'none',
    tab: 'player',
  };

  const typeOptions = isGoal
    ? [{ value: 'Normal Goal', label: '골' }, { value: 'Penalty', label: '페널티골' }, { value: 'Own Goal', label: '자책골' }]
    : [{ value: 'Yellow Card', label: '경고' }, { value: 'Red Card', label: '퇴장' }, { value: 'Second Yellow Card', label: '경고 누적' }];
  const teamOptions = ['home', 'away'].map(side => ({ value: side, label: evEditTeamName(side) }));

  const body = document.createElement('div');
  body.className = 'ev-edit-body';
  const tabWrap = document.createElement('div');
  tabWrap.className = 'ev-edit-seg ev-edit-tabs';
  const list = document.createElement('div');
  list.className = 'ev-subst-picker-list';

  // 득점자는 자책골이면 상대 팀, 아니면 득점 팀 선수. 카드는 그 팀 선수.
  const playerSide = () => (isGoal && draft.detail === 'Own Goal' ? (draft.side === 'home' ? 'away' : 'home') : draft.side);
  const showAssist = () => isGoal && draft.detail !== 'Own Goal';
  const pickedName = (value, kind) => {
    if (value === 'none') return '없음';
    if (value === 'keep') return (typeof evPickPlayerName === 'function' ? evPickPlayerName(ev, kind) : '') || (kind === 'assist' ? '없음' : '선수 없음');
    return evEditDisplayName(value);
  };

  function renderTabs() {
    if (!showAssist() && draft.tab === 'assist') draft.tab = 'player';
    const tabs = [{ key: 'player', label: `${isGoal ? '득점자' : '선수'}: ${pickedName(draft.player, 'player')}` }];
    if (showAssist()) tabs.push({ key: 'assist', label: `어시스트: ${pickedName(draft.assist, 'assist')}` });
    tabWrap.replaceChildren(...tabs.map(tab => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ev-edit-seg-btn';
      btn.classList.toggle('is-active', draft.tab === tab.key);
      btn.textContent = tab.label;
      btn.title = tab.label;
      btn.addEventListener('click', () => { draft.tab = tab.key; renderTabs(); renderList(); });
      return btn;
    }));
  }

  function renderList() {
    const kind = draft.tab;
    const side = kind === 'assist' ? draft.side : playerSide();
    const available = evAvailablePlayers(ev, side, 'onPitch');
    const keep = kind === 'assist' ? keepAssist : keepPlayer;
    const current = draft[kind];
    const keepIdx = evEditRosterIndex(available, keep[`${kind}Id`], [keep[`${kind}Name`], keep[`${kind}NameKoLong`], keep[`${kind}OrigName`]]);
    const hasKeepValue = kind === 'assist' ? hadAssist : true;
    const select = value => { draft[kind] = value; renderTabs(); };
    const items = [];
    // 지금 값은 항상 맨 위 "현재" 행으로 보여준다 — 무엇을 고치는 중인지 바로 보이고, 목록에 없는
    // 선수(다른 팀/시점 밖, 이름 없는 선수)여도 그대로 유지할 수 있다. 목록 안의 같은 선수 행은
    // "현재" 행과 중복 강조하지 않는다.
    if (hasKeepValue) {
      const keepPlayerObj = keepIdx >= 0 ? available[keepIdx] : null;
      const keepNum = keepPlayerObj?.number != null && keepPlayerObj.number !== '' ? String(keepPlayerObj.number) : '-';
      items.push(evEditPlayerItem(keepNum, `현재: ${pickedName('keep', kind)}`, keepPlayerObj?.pos || '', current === 'keep', () => select('keep')));
    }
    if (kind === 'assist') items.push(evEditPlayerItem('-', '없음', '', current === 'none', () => select('none')));
    available.forEach(p => {
      const isSelected = current !== 'keep' && current !== 'none' && current === p;
      items.push(evEditPlayerItem(p.number != null && p.number !== '' ? String(p.number) : '-',
        evEditDisplayName(p), p.pos || '', isSelected, () => select(p)));
    });
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'ev-subst-picker-empty';
      empty.textContent = '선수 명단 데이터가 없습니다';
      items.push(empty);
    }
    list.replaceChildren(...items);
    // 선택된 선수가 목록 아래쪽이면 보이도록 스크롤.
    requestAnimationFrame(() => {
      const selected = list.querySelector('.is-selected');
      if (!selected || selected === list.firstElementChild) list.scrollTop = 0;
      else selected.scrollIntoView({ block: 'nearest' });
    });
  }

  // 팀/종류를 바꾸면 득점자 팀이 달라질 수 있어 이전 선택을 비우고 현재 값 기준으로 다시 고른다.
  const resetPicks = () => { draft.player = 'keep'; draft.assist = hadAssist ? 'keep' : 'none'; renderTabs(); renderList(); };
  const segRow = document.createElement('div');
  segRow.className = 'ev-edit-seg-rows';
  segRow.append(
    evEditField('종류', evEditSegment(typeOptions, draft.detail, value => { draft.detail = value; resetPicks(); })),
    evEditField(isGoal ? '득점 팀 (골이 인정된 팀)' : '팀', evEditSegment(teamOptions, draft.side, value => { draft.side = value; resetPicks(); })),
  );
  body.append(segRow, tabWrap);
  modal.append(body, list);
  renderTabs();
  renderList();

  const toFields = (p, prefix) => ({
    [`${prefix}Id`]: Number(p?.playerId) || 0,
    [`${prefix}Name`]: p?.name || p?.nameKoLong || '',
    [`${prefix}NameKoLong`]: p?.nameKoLong || null,
    [`${prefix}OrigName`]: p?.origName || null,
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'ev-subst-picker-reset';
  resetBtn.textContent = '초기화';
  resetBtn.disabled = !ev._evEdited;
  resetBtn.title = ev._evEdited ? '수정한 내용을 지우고 원래 데이터로 되돌립니다.' : '수정한 내용이 없습니다.';
  resetBtn.addEventListener('click', () => { evEditSave(sig, null); close(); });

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'ev-subst-picker-confirm';
  confirmBtn.textContent = '확인';
  confirmBtn.addEventListener('click', () => {
    const patch = {
      side: draft.side,
      teamId: evEditTeamId(draft.side) ?? ev.teamId ?? null,
      detail: draft.detail,
      ...(draft.player === 'keep' ? keepPlayer : toFields(draft.player, 'player')),
    };
    if (isGoal) {
      if (!showAssist() || draft.assist === 'none') {
        Object.assign(patch, { assistId: null, assistName: null, assistNameKoLong: null, assistOrigName: null });
      } else {
        Object.assign(patch, draft.assist === 'keep' ? keepAssist : toFields(draft.assist, 'assist'));
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

  actions.append(resetBtn, confirmBtn, cancelBtn);
  mount();
}
window.evEditOpen = evEditOpen;

// ── 교체 묶음 수정 (연속 교체) ────────────────────────────────────────────────

/** 이벤트 분(추가시간 포함) — 교체 묶음 판정용. */
function evSubstMinute(ev) {
  return Number(ev?.elapsed ?? 0) + Number(ev?.extra ?? 0);
}

/**
 * ev와 이어진 같은 팀 교체 묶음 — 시간 순으로 인접한 교체끼리 1분 이내면 한 묶음으로 잇는다.
 * API가 동시에 한 교체를 같은 분 또는 앞뒤 1분으로 나눠 기록하기 때문에, 한 교체의 선수가 잘못 들어오면
 * 옆 교체의 후보에서 올바른 선수가 빠질 수 있다 — 그래서 묶음 전체를 한 번에 고치게 한다.
 * 교체 override와 수정이 반영된 이벤트 패널 데이터 기준. 묶음이 없으면 [ev].
 */
function evSubstCluster(ev) {
  const sameSubst = (window._eventsLastData?.events || [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e && e.side === ev?.side && String(e.type || '').toLowerCase() === 'subst')
    .sort((a, b) => evEditTimeKey(a.e) - evEditTimeKey(b.e) || a.i - b.i)
    .map(({ e }) => e);
  const idx = sameSubst.findIndex(e => (ev?._hideSig && e._hideSig === ev._hideSig)
    || (typeof evSubstEventKey === 'function' && evSubstEventKey(e) === evSubstEventKey(ev)));
  if (idx < 0) return [ev];
  let lo = idx;
  let hi = idx;
  while (lo > 0 && evSubstMinute(sameSubst[lo]) - evSubstMinute(sameSubst[lo - 1]) <= 1) lo -= 1;
  while (hi < sameSubst.length - 1 && evSubstMinute(sameSubst[hi + 1]) - evSubstMinute(sameSubst[hi]) <= 1) hi += 1;
  return sameSubst.slice(lo, hi + 1);
}
window.evSubstCluster = evSubstCluster;

/** 교체 override에 저장할 표시 이름 — 기존 교체 선수 선택 창과 같은 규칙(라인업 풀네임 설정). */
function evSubstOverrideName(player) {
  const useLong = (typeof getSetting === 'function') && getSetting('lineup') === 'long';
  return useLong
    ? (player.nameKoLong || player.name || String(player.playerId ?? '-'))
    : (player.name || player.nameKoLong || String(player.playerId ?? '-'));
}

/**
 * 연속 교체 묶음 수정 팝업 — 골/카드 정보 수정 팝업과 같은 틀로, 묶음의 교체를 시간 순으로 가로로
 * 나열하고 각 교체마다 OUT/IN 탭 + 선수 목록을 둔다.
 * - 후보는 묶음 첫 교체 직전 기준: OUT = 그라운드에 있던 선수, IN = 아직 투입 안 된 교체 명단 선수.
 * - 한 선수는 묶음 안에서 한 번만 고를 수 있다(다른 교체에서 고른 선수는 흐리게 표시되고 선택 불가).
 * - 각 칸 맨 위 "현재" 행은 지금 값(API 또는 이전에 고른 값) 유지.
 * 확인 시 바꾼 칸만 교체 override(evSetSubstOverride)로 저장, 초기화는 묶음 전체의 override를 지운다.
 */
function evOpenSubstClusterEditor(cluster, focusEv, focusField, fixtureData) {
  const fixtureId = String(fixtureData?.matchInfo?.fixtureId ?? window._eventsLastData?.matchInfo?.fixtureId ?? '').trim();
  const side = focusEv.side;
  document.querySelector('.ev-subst-cluster-modal-overlay')?.remove();
  const { modal, actions, close, mount } = evHideCreateModal('교체 선수 수정', 'ev-subst-cluster-modal');

  const cands = {
    player: evAvailablePlayers(cluster[0], side, 'onPitch'),
    assist: evAvailablePlayers(cluster[0], side, 'bench'),
  };
  const focusSig = focusEv._hideSig;
  const cols = cluster.map(ev => ({
    ev,
    sel: { player: 'keep', assist: 'keep' },
    tab: (focusSig && ev._hideSig === focusSig) ? focusField : 'player',
  }));

  // 칸별 현재 선택의 후보 인덱스(keep이면 지금 값이 후보에 있는 위치, 없으면 -1).
  const currentIndex = (col, field) => {
    const pick = col.sel[field];
    if (pick !== 'keep') return cands[field].indexOf(pick);
    const ev = col.ev;
    const id = field === 'player' ? ev.playerId : ev.assistId;
    const names = field === 'player'
      ? [ev.playerName, ev.playerNameKoLong, ev.playerOrigName]
      : [ev.assistName, ev.assistNameKoLong, ev.assistOrigName];
    return evEditRosterIndex(cands[field], id, names);
  };
  const takenByOthers = (field, exceptCol) => new Set(cols
    .filter(col => col !== exceptCol)
    .map(col => currentIndex(col, field))
    .filter(i => i >= 0));
  const currentName = (col, field) => {
    const pick = col.sel[field];
    if (pick !== 'keep') return evEditDisplayName(pick);
    const name = typeof evGetSubstDisplayName === 'function' ? evGetSubstDisplayName(col.ev, field, fixtureId) : '';
    return name || '?';
  };

  const help = document.createElement('div');
  help.className = 'ev-hide-mgr-help';
  help.textContent = cols.length > 1
    ? '한 번에 일어난 교체 이벤트를 한번에 수정합니다. 한 선수는 한 번만 고를 수 있습니다.'
    : '교체로 나간 선수(OUT)와 들어온 선수(IN)를 수정합니다.';
  const colsWrap = document.createElement('div');
  colsWrap.className = 'ev-subst-cluster-cols';
  modal.append(help, colsWrap);

  function renderColumn(col) {
    const box = document.createElement('div');
    box.className = 'ev-subst-cluster-col';
    const head = document.createElement('div');
    head.className = 'ev-subst-cluster-head';
    const order = String(col.ev.detail || '').match(/(\d+)\s*$/)?.[1];
    head.textContent = `${typeof evFormatTime === 'function' ? evFormatTime(col.ev) : `${col.ev.elapsed}'`} 교체${order ? ` ${order}` : ''}`;

    const tabs = document.createElement('div');
    tabs.className = 'ev-edit-seg ev-edit-tabs';
    [['player', 'OUT'], ['assist', 'IN']].forEach(([field, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ev-edit-seg-btn';
      btn.classList.toggle('is-active', col.tab === field);
      btn.textContent = `${label}: ${currentName(col, field)}`;
      btn.title = btn.textContent;
      btn.addEventListener('click', () => { col.tab = field; renderAll(); });
      tabs.appendChild(btn);
    });

    const list = document.createElement('div');
    list.className = 'ev-subst-picker-list';
    const field = col.tab;
    const taken = takenByOthers(field, col);
    const keepIdx = currentIndex({ ...col, sel: { ...col.sel, [field]: 'keep' } }, field);
    const keepObj = keepIdx >= 0 ? cands[field][keepIdx] : null;
    const items = [evEditPlayerItem(
      keepObj?.number != null && keepObj.number !== '' ? String(keepObj.number) : '-',
      `현재: ${(typeof evGetSubstDisplayName === 'function' ? evGetSubstDisplayName(col.ev, field, fixtureId) : '') || '?'}`,
      keepObj?.pos || '', col.sel[field] === 'keep', () => { col.sel[field] = 'keep'; renderAll(); })];
    cands[field].forEach((p, i) => {
      const item = evEditPlayerItem(p.number != null && p.number !== '' ? String(p.number) : '-',
        evEditDisplayName(p), p.pos || '', col.sel[field] === p, () => { col.sel[field] = p; renderAll(); });
      if (taken.has(i)) {
        item.classList.add('is-taken');
        item.title = '다른 교체에서 이미 고른 선수입니다';
      }
      items.push(item);
    });
    if (!cands[field].length) {
      const empty = document.createElement('div');
      empty.className = 'ev-subst-picker-empty';
      empty.textContent = '선수 명단 데이터가 없습니다';
      items.push(empty);
    }
    list.replaceChildren(...items);
    box.append(head, tabs, list);
    return box;
  }

  function renderAll() {
    const scrollTops = [...colsWrap.querySelectorAll('.ev-subst-picker-list')].map(el => el.scrollTop);
    colsWrap.replaceChildren(...cols.map(renderColumn));
    colsWrap.querySelectorAll('.ev-subst-picker-list').forEach((el, i) => { el.scrollTop = scrollTops[i] || 0; });
  }
  renderAll();

  const hasOverride = cols.some(col => ['player', 'assist']
    .some(field => typeof evGetSubstOverride === 'function' && evGetSubstOverride(fixtureId, col.ev, field)));
  const refresh = () => evSubstRefreshAfterOverride(fixtureId);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'ev-subst-picker-reset';
  resetBtn.textContent = '초기화';
  resetBtn.disabled = !hasOverride;
  resetBtn.title = hasOverride ? '이 교체들에서 직접 고른 선수를 지우고 원래 데이터로 되돌립니다.' : '직접 선택한 선수가 없습니다.';
  resetBtn.addEventListener('click', () => {
    cols.forEach(col => ['player', 'assist'].forEach(field => evClearSubstOverride(fixtureId, col.ev, field)));
    close();
    refresh();
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'ev-subst-picker-confirm';
  confirmBtn.textContent = '확인';
  confirmBtn.addEventListener('click', () => {
    cols.forEach(col => ['player', 'assist'].forEach(field => {
      const pick = col.sel[field];
      if (pick === 'keep') return;
      evSetSubstOverride(fixtureId, col.ev, field, { playerId: pick.playerId, name: evSubstOverrideName(pick) });
    }));
    close();
    refresh();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'ev-subst-picker-cancel';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', close);

  actions.append(resetBtn, confirmBtn, cancelBtn);
  modal.style.setProperty('--ev-cluster-cols', String(cols.length));
  mount();
}
window.evOpenSubstClusterEditor = evOpenSubstClusterEditor;

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
  const isSubst = evIsSubstEvent(ev);
  const popout = typeof popoutModeEnabled === 'function' && popoutModeEnabled();
  // 설정 "입력창/설정을 새 창으로 열기"(popoutModals)가 켜져 있으면 수정 팝업을 별도 창으로 연다(popout.js).
  add('정보 수정', () => {
    if (isSubst) {
      // 교체는 교체 선수 수정 창 — 앞뒤 1분 이내로 이어진 교체가 있으면 묶음 전체, 없으면 한 칸.
      const cluster = evSubstCluster(ev);
      if (popout) window.Popout.open('substedit', { sig: ev._hideSig, ...(cluster.length > 1 ? { wide: '1' } : {}) });
      else evOpenSubstClusterEditor(cluster, ev, 'player', window._eventsLastData);
      return;
    }
    if (popout) window.Popout.open('evedit', { sig: ev._hideSig });
    else evEditOpen(ev);
  });
  if (isSubst) {
    if (evSubstHasOverride(ev)) add('수정 초기화', () => evSubstClearOverrides([ev]));
  } else if (ev._evEdited) {
    add('수정 초기화', () => evEditSave(ev._hideSig, null));
  }
  add('숨기기', () => evHideEvent(ev), 'is-danger');

  const fsEl = document.fullscreenElement;
  (fsEl || document.body).appendChild(menu);
  const point = typeof toDisplayLayoutPoint === 'function' ? toDisplayLayoutPoint(clientX, clientY) : { x: clientX, y: clientY };
  menu.style.left = `${point.x + 6}px`;
  menu.style.top = `${point.y + 6}px`;
  if (typeof pmClampPopupToViewport === 'function') pmClampPopupToViewport(menu);
}

function evIsSubstEvent(ev) {
  return !!ev?._hideSig && String(ev.type || '').toLowerCase() === 'subst';
}

/** 이 교체에 직접 고른 선수(교체 override)가 있는지. */
function evSubstHasOverride(ev) {
  const fixtureId = evHideCurrentFixtureId();
  return typeof evGetSubstOverride === 'function'
    && ['player', 'assist'].some(field => evGetSubstOverride(fixtureId, ev, field));
}

/** 교체들의 override를 지우고 이벤트 패널/라인업/전술판을 다시 그린다. */
function evSubstClearOverrides(events) {
  const fixtureId = evHideCurrentFixtureId();
  events.forEach(ev => ['player', 'assist'].forEach(field => evClearSubstOverride(fixtureId, ev, field)));
  evSubstRefreshAfterOverride(fixtureId);
}

/** 교체 override 저장/삭제 후 갱신 — 교체 선수 선택 창(evOpenSubstPicker)과 같은 3곳. */
function evSubstRefreshAfterOverride(fixtureId) {
  if (typeof evRerenderCurrentPanel === 'function') evRerenderCurrentPanel();
  if (typeof applyLineupPanels === 'function' && window._eventsLastData) applyLineupPanels(window._eventsLastData);
  if (typeof window.ttRefreshEventsData === 'function' && window._eventsLastData && typeof evPatchSubstEvents === 'function') {
    window.ttRefreshEventsData({ ...window._eventsLastData, events: evPatchSubstEvents(window._eventsLastData.events, fixtureId) });
  }
}

/** events-panel.js evCreateRow가 골/카드/교체 row에 연결 — 클릭하면 정보 수정 메뉴. */
function evEditAttachRow(row, ev) {
  if (!evEditIsEditable(ev) && !evIsSubstEvent(ev)) return;
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
