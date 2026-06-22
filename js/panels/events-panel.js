// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [이벤트 패널 / 문자중계 타임라인]
// 캠 작음(/detail) 페이지의 lp-events-s에 fixture.events 데이터를 시간 내림차순으로 렌더.
// 캠 큼 페이지에는 표시 안 함 (사용자 요청).
//
// 주요 동작:
// - 시간 기준 내림차순 정렬 (최신이 위)
// - 같은 선수가 두 번째 옐로우 카드 받은 뒤 레드 카드 이벤트가 오면 "경고 누적 퇴장"으로 자동 분류
// - 이벤트 종류별 좌측 색깔 막대 + 아이콘 + 한글 라벨
// - 골/카드/교체/VAR/PK 미스/자책골 등 9가지 케이스 분기
// - 한 줄 폭 안 들어가면 폰트 점진 축소 (10px까지). 그 이하로 가야 하면 wrap 허용.
// - comments 필드(예: "Foul last man") 있으면 보조 줄에 작은 글씨로 표시
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EVENTS_PANEL_FONT_DEFAULT = 15;
const SUBST_OVERRIDE_STORAGE_KEY = 'obs.subst.override.v1';
const EVENTS_PANEL_FONT_MIN = 10;
const EVENTS_PANEL_ROW_ANIM_MS = 340;
const EVENTS_PANEL_ROW_ENTER_OFFSET_PX = 16;
const EVENTS_PANEL_FILTER_STORAGE_KEY = 'obs.eventsPanel.filters.v1';
const EVENTS_PANEL_FILTER_ORDER = [
  'goal',
  'pk-goal',
  'own-goal',
  'pk-miss',
  'yellow-card',
  'red-card',
  'cumulative-red',
  'subst',
  'var',
  'var-goal-cancel',
  'var-penalty-cancel',
  'var-goal-confirm',
  'var-penalty-confirm',
];
const eventsPanelFilterState = {
  isOpen: false,
  disabledKeys: evLoadDisabledFilterKeys(),
};

/** localStorage(필터 키)에서 비활성 카테고리 Set 복원. 손상되면 빈 Set. */
function evLoadDisabledFilterKeys() {
  try {
    const raw = localStorage.getItem(EVENTS_PANEL_FILTER_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(value => String(value || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** 현재 비활성 카테고리 Set을 localStorage에 직렬화 저장. */
function evSaveDisabledFilterKeys() {
  try {
    localStorage.setItem(
      EVENTS_PANEL_FILTER_STORAGE_KEY,
      JSON.stringify(Array.from(eventsPanelFilterState.disabledKeys))
    );
  } catch {}
}

/** 카테고리 키가 활성 상태인지 — disabledKeys Set에 없으면 true. */
function evIsFilterEnabled(key) {
  return !eventsPanelFilterState.disabledKeys.has(key);
}

/** 카테고리 단일 토글. enabled=true면 Set에서 제거, false면 추가. 직후 영속화. */
function evSetFilterEnabled(key, enabled) {
  const normalized = String(key || '').trim();
  if (!normalized) return;
  if (enabled) eventsPanelFilterState.disabledKeys.delete(normalized);
  else eventsPanelFilterState.disabledKeys.add(normalized);
  evSaveDisabledFilterKeys();
}

/** 여러 카테고리를 한 번에 같은 상태로 토글. "전체 표시"/"전체 숨김" 버튼용. */
function evSetAllFilters(filterKeys, enabled) {
  Array.from(new Set((Array.isArray(filterKeys) ? filterKeys : []).map(key => String(key || '').trim()).filter(Boolean)))
    .forEach(key => evSetFilterEnabled(key, enabled));
}

/** 필터 옵션 정렬용 가중치 — EVENTS_PANEL_FILTER_ORDER의 인덱스, 누락이면 큰 값. */
function evFilterSortWeight(key) {
  const index = EVENTS_PANEL_FILTER_ORDER.indexOf(String(key || ''));
  return index >= 0 ? index : EVENTS_PANEL_FILTER_ORDER.length + 100;
}

/** 이벤트 type이 target과 case-insensitive 일치하는지. */
function evTypeIs(ev, type) {
  return String(ev?.type || '').toLowerCase() === String(type || '').toLowerCase();
}

/** detail이 target과 case-insensitive + trim 일치하는지. API 데이터 잡음 흡수. */
function evDetailIs(detail, target) {
  return String(detail || '').trim().toLowerCase() === String(target || '').trim().toLowerCase();
}

/**
 * VAR detail 문자열을 파싱해 4종 필터 키 + 표시용 텍스트로 분리.
 * "Goal cancelled - Offside" → { key: 'goal-cancel', displayDetail: 'Goal cancelled', displayComment: 'Offside' }
 * 매칭 안 되는 detail이면 key는 빈 값.
 */
function evParseVarDetail(detail) {
  const raw = String(detail || '').trim();
  if (!raw) return { key: '', displayDetail: '', displayComment: '' };

  const match = raw.match(/^([^-]+?)(?:\s*-\s*(.+))?$/);
  const head = String(match?.[1] || raw).trim();
  const reason = String(match?.[2] || '').trim();
  const normalizedHead = head.toLowerCase();

  if (normalizedHead === 'goal disallowed'
    || normalizedHead === 'goal cancelled'
    || normalizedHead === 'goal canceled') {
    return { key: 'goal-cancel', displayDetail: 'Goal cancelled', displayComment: reason };
  }
  if (normalizedHead === 'penalty disallowed'
    || normalizedHead === 'penalty cancelled'
    || normalizedHead === 'penalty canceled') {
    return { key: 'penalty-cancel', displayDetail: 'Penalty cancelled', displayComment: reason };
  }
  if (normalizedHead === 'goal confirmed') {
    return { key: 'goal-confirm', displayDetail: 'Goal Confirmed', displayComment: reason };
  }
  if (normalizedHead === 'penalty confirmed') {
    return { key: 'penalty-confirm', displayDetail: 'Penalty confirmed', displayComment: reason };
  }
  return { key: '', displayDetail: raw, displayComment: '' };
}

/** VAR detail에서 4종 필터 키만 빠르게 꺼내는 헬퍼. evParseVarDetail의 1-필드 shortcut. */
function evVarDetailKey(detail) {
  return evParseVarDetail(detail).key;
}

// ─── 교체 선수 수동 연동 저장소 ───────────────────────────────────────────────
// API에서 OUT/IN 선수 정보가 null인 경우, 사용자가 직접 선택한 선수를
// fixtureId + 이벤트 복합키 기준으로 저장.
// 복합키: side|elapsed|extra|playerId|assistId — 이벤트 패널·라인업 패널 양쪽에서 동일하게 생성 가능.

function evSubstEventKey(ev) {
  return [
    ev?.side || '',
    Number(ev?.elapsed ?? 0),
    Number(ev?.extra ?? 0),
    Number(ev?.playerId ?? 0),
    Number(ev?.assistId ?? 0),
    ev?.id ?? ev?.origIndex ?? '',
  ].join('|');
}

function evLoadSubstOverrides() {
  try { return JSON.parse(localStorage.getItem(SUBST_OVERRIDE_STORAGE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function evSaveSubstOverrides(data) {
  try { localStorage.setItem(SUBST_OVERRIDE_STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function evGetSubstOverride(fixtureId, ev, field) {
  if (!fixtureId) return null;
  const key = evSubstEventKey(ev);
  return evLoadSubstOverrides()[fixtureId]?.[key]?.[field] || null;
}

function evSetSubstOverride(fixtureId, ev, field, playerInfo) {
  if (!fixtureId) return;
  const key = evSubstEventKey(ev);
  const store = evLoadSubstOverrides();
  if (!store[fixtureId]) store[fixtureId] = {};
  if (!store[fixtureId][key]) store[fixtureId][key] = {};
  store[fixtureId][key][field] = playerInfo;
  evSaveSubstOverrides(store);
}

/**
 * 교체 이벤트의 선수 이름을 반환. override가 있으면 그것을 우선.
 * field: 'player'(OUT) or 'assist'(IN)
 */
function evGetSubstDisplayName(ev, field, fixtureId) {
  const override = evGetSubstOverride(fixtureId, ev, field);
  if (override) return override.name || '';
  return evPickPlayerName(ev, field);
}

/**
 * 선수명이 비어있을 때 표시하는 클릭 가능한 `?` 버튼.
 * 클릭 시 evOpenSubstPicker 모달을 열어 팀 선수 명단에서 선택할 수 있게 함.
 */
function evCreateSubstFixBtn(ev, field, fixtureData) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ev-subst-fix-btn';
  btn.title = field === 'player' ? 'OUT 선수 선택' : 'IN 선수 선택';
  btn.textContent = '?';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    evOpenSubstPicker(ev, field, fixtureData);
  });
  return btn;
}

/**
 * events 배열에 저장된 교체 선수 override를 적용한 새 배열 반환.
 * lineup-data.js의 buildEffectiveFixtureData에서 호출해
 * subReflect 교체 swap이 override를 반영하도록 함.
 */
function evPatchSubstEvents(events, fixtureId) {
  if (!Array.isArray(events) || !fixtureId) return events;
  const overrides = evLoadSubstOverrides()[fixtureId];
  if (!overrides || !Object.keys(overrides).length) return events;

  return events.map(ev => {
    if (String(ev?.type || '').toLowerCase() !== 'subst') return ev;
    const evOverride = overrides[evSubstEventKey(ev)];
    if (!evOverride) return ev;
    const patched = { ...ev };
    if (evOverride.player) {
      patched.playerId = evOverride.player.playerId;
      patched.playerName = evOverride.player.name;
    }
    if (evOverride.assist) {
      patched.assistId = evOverride.assist.playerId;
      patched.assistName = evOverride.assist.name;
    }
    return patched;
  });
}
window.evPatchSubstEvents = evPatchSubstEvents;

/**
 * 교체 선수 선택 모달.
 * 해당 팀의 startXi + substitutes 전체를 목록으로 표시하고,
 * 선택 확인 시 override 저장 + 이벤트 패널 + 라인업 패널 즉시 재렌더.
 */
function evOpenSubstPicker(ev, field, fixtureData) {
  const fixtureId = String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
  const lineup = ev.side === 'home' ? fixtureData?.homeLineup : fixtureData?.awayLineup;
  const allPlayers = [
    ...(lineup?.startXi || []),
    ...(lineup?.substitutes || []),
  ].filter(Boolean);

  document.querySelector('.ev-subst-picker-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ev-subst-picker-overlay';

  const modal = document.createElement('div');
  modal.className = 'ev-subst-picker-modal';
  modal.addEventListener('click', e => e.stopPropagation());

  const header = document.createElement('div');
  header.className = 'ev-subst-picker-header';
  const titleEl = document.createElement('span');
  titleEl.className = 'ev-subst-picker-title';
  titleEl.textContent = field === 'player' ? 'OUT 선수 선택' : 'IN 선수 선택';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ev-subst-picker-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeOverlay);
  header.append(titleEl, closeBtn);

  const list = document.createElement('div');
  list.className = 'ev-subst-picker-list';

  let selectedPlayer = null;

  if (!allPlayers.length) {
    const empty = document.createElement('div');
    empty.className = 'ev-subst-picker-empty';
    empty.textContent = '선수 명단 데이터가 없습니다';
    list.appendChild(empty);
  } else {
    const useLong = (typeof getSetting === 'function') && getSetting('lineup') === 'long';
    allPlayers.forEach(player => {
      const item = document.createElement('div');
      item.className = 'ev-subst-picker-item';

      const num = document.createElement('span');
      num.className = 'ev-subst-picker-number';
      num.textContent = player.number != null ? String(player.number) : '-';

      const displayName = useLong
        ? (player.nameKoLong || player.name || String(player.playerId ?? '-'))
        : (player.name || player.nameKoLong || String(player.playerId ?? '-'));

      const nameEl = document.createElement('span');
      nameEl.className = 'ev-subst-picker-name';
      nameEl.textContent = displayName;

      const posEl = document.createElement('span');
      posEl.className = 'ev-subst-picker-pos';
      posEl.textContent = player.pos || '';

      item.append(num, nameEl, posEl);
      item.addEventListener('click', () => {
        list.querySelectorAll('.ev-subst-picker-item.is-selected')
          .forEach(el => el.classList.remove('is-selected'));
        item.classList.add('is-selected');
        selectedPlayer = { playerId: player.playerId, name: displayName };
      });
      list.appendChild(item);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'ev-subst-picker-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'ev-subst-picker-confirm';
  confirmBtn.textContent = '확인';
  confirmBtn.addEventListener('click', () => {
    if (!selectedPlayer) return;
    evSetSubstOverride(fixtureId, ev, field, selectedPlayer);
    closeOverlay();
    evRerenderCurrentPanel();
    if (typeof applyLineupPanels === 'function' && window._eventsLastData) {
      applyLineupPanels(window._eventsLastData);
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'ev-subst-picker-cancel';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', closeOverlay);

  actions.append(confirmBtn, cancelBtn);
  modal.append(header, list, actions);
  overlay.appendChild(modal);

  function closeOverlay() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) {
    if (e.key === 'Escape') closeOverlay();
  }
  overlay.addEventListener('click', closeOverlay);
  document.addEventListener('keydown', onEsc);

  document.body.appendChild(overlay);
}

/** 이벤트 표시 시간 — extra가 있으면 "{elapsed}+{extra}'", 없으면 "{elapsed}'". */
function evFormatTime(ev) {
  const elapsed = Number(ev.elapsed ?? 0);
  const extra = ev.extra != null ? Number(ev.extra) : null;
  return extra ? `${elapsed}+${extra}'` : `${elapsed}'`;
}

/** detail/type 한글 라벨. 라벨은 색상 막대 옆 짧은 종류 표시용. */
function evLabelKo(ev) {
  const detail = ev._displayDetail || ev.detail || '';
  const varDetailKey = evTypeIs(ev, 'Var') ? evVarDetailKey(detail) : '';
  if (varDetailKey === 'goal-cancel') return 'VAR 골 취소';
  if (varDetailKey === 'penalty-cancel') return 'VAR PK 취소';
  if (varDetailKey === 'goal-confirm') return 'VAR 골 선언';
  if (varDetailKey === 'penalty-confirm') return 'VAR PK 선언';
  if (evTypeIs(ev, 'Goal')) {
    if (evDetailIs(detail, 'Missed Penalty')) return 'PK 실축';
    if (evDetailIs(detail, 'Own Goal')) return '자책골';
    if (evDetailIs(detail, 'Penalty')) return 'PK 골';
    return '골';
  }
  if (evTypeIs(ev, 'Card')) {
    if (evDetailIs(detail, 'Yellow Card')) return '경고';
    if (ev._isCumulativeRed) return '경고 누적 퇴장';
    return '퇴장';
  }
  if (evTypeIs(ev, 'subst')) return '교체';
  if (evTypeIs(ev, 'Var')) {
    if (evDetailIs(detail, 'Goal cancelled')) return 'VAR 골 취소';
    if (evDetailIs(detail, 'Goal Confirmed')) return 'VAR 골 선언';
    if (evDetailIs(detail, 'Penalty confirmed')) return 'VAR PK 선언';
    return 'VAR';
  }
  return ev.type || '이벤트';
}

/** 이벤트 종류 → { color, icon } 매핑. CSS에서 ev-bar-{color}, ev-icon-{icon} 스타일 사용. */
function evStyle(ev) {
  const detail = ev._displayDetail || ev.detail || '';
  const varDetailKey = evTypeIs(ev, 'Var') ? evVarDetailKey(detail) : '';
  if (varDetailKey === 'goal-cancel' || varDetailKey === 'penalty-cancel') {
    return { color: 'orange', icon: 'var-cancel' };
  }
  if (varDetailKey === 'goal-confirm' || varDetailKey === 'penalty-confirm') {
    return { color: 'white', icon: 'var-confirm' };
  }
  if (evTypeIs(ev, 'Goal')) {
    if (evDetailIs(detail, 'Missed Penalty')) return { color: 'orange', icon: 'pk-miss' };
    if (evDetailIs(detail, 'Own Goal')) return { color: 'blue', icon: 'own-goal' };
    if (evDetailIs(detail, 'Penalty')) return { color: 'blue', icon: 'pk-goal' };
    return { color: 'blue', icon: 'goal' };
  }
  if (evTypeIs(ev, 'Card')) {
    if (evDetailIs(detail, 'Yellow Card')) return { color: 'yellow', icon: 'yellow-card' };
    if (ev._isCumulativeRed) return { color: 'red', icon: 'cumulative-red' };
    return { color: 'red', icon: 'red-card' };
  }
  if (evTypeIs(ev, 'subst')) return { color: 'green', icon: 'subst' };
  if (evTypeIs(ev, 'Var')) {
    if (evDetailIs(detail, 'Goal cancelled')) return { color: 'orange', icon: 'var-cancel' };
    if (evDetailIs(detail, 'Goal Confirmed')) return { color: 'white', icon: 'var-confirm' };
    if (evDetailIs(detail, 'Penalty confirmed')) return { color: 'white', icon: 'var-confirm' };
    return { color: 'white', icon: 'var' };
  }
  return { color: 'white', icon: 'default' };
}

/** 이벤트를 필터 UI에서 다룰 카테고리 키로 정규화. */
function evFilterKey(ev) {
  const detail = ev._displayDetail || ev.detail || '';
  const varDetailKey = evTypeIs(ev, 'Var') ? evVarDetailKey(detail) : '';

  if (varDetailKey === 'goal-cancel') return 'var-goal-cancel';
  if (varDetailKey === 'penalty-cancel') return 'var-penalty-cancel';
  if (varDetailKey === 'goal-confirm') return 'var-goal-confirm';
  if (varDetailKey === 'penalty-confirm') return 'var-penalty-confirm';

  if (evTypeIs(ev, 'Goal')) {
    if (evDetailIs(detail, 'Missed Penalty')) return 'pk-miss';
    if (evDetailIs(detail, 'Own Goal')) return 'own-goal';
    if (evDetailIs(detail, 'Penalty')) return 'pk-goal';
    return 'goal';
  }
  if (evTypeIs(ev, 'Card')) {
    if (evDetailIs(detail, 'Yellow Card')) return 'yellow-card';
    if (ev._isCumulativeRed) return 'cumulative-red';
    return 'red-card';
  }
  if (evTypeIs(ev, 'subst')) return 'subst';
  if (evTypeIs(ev, 'Var')) return 'var';
  return `other:${String(ev?.type || 'event').trim().toLowerCase() || 'event'}`;
}

/** 이벤트 → 필터 메타데이터(카테고리 키 + 라벨 + 색상). 필터 popover 옵션 빌드용. */
function evGetFilterMeta(ev) {
  const style = evStyle(ev);
  return {
    key: evFilterKey(ev),
    label: evLabelKo(ev) || '기타',
    color: String(style.color || 'white'),
  };
}

/**
 * 이벤트 배열 → 필터 popover 옵션 배열.
 * 1) 카테고리 키별 카운트 집계.
 * 2) EVENTS_PANEL_FILTER_ORDER 가중치 + 라벨 한글 정렬로 정돈된 옵션 목록 반환.
 */
function evBuildFilterOptions(events) {
  const optionMap = new Map();
  (Array.isArray(events) ? events : []).forEach(ev => {
    const meta = evGetFilterMeta(ev);
    const current = optionMap.get(meta.key);
    if (current) {
      current.count += 1;
      return;
    }
    optionMap.set(meta.key, { ...meta, count: 1 });
  });

  return Array.from(optionMap.values()).sort((left, right) => {
    const orderDiff = evFilterSortWeight(left.key) - evFilterSortWeight(right.key);
    if (orderDiff) return orderDiff;
    return String(left.label || '').localeCompare(String(right.label || ''), 'ko');
  });
}

/** 활성 카테고리만 통과시키는 필터. evIsFilterEnabled 사용. */
function evFilterEvents(events) {
  return (Array.isArray(events) ? events : []).filter(ev => evIsFilterEnabled(evGetFilterMeta(ev).key));
}

/** 옵션 중 비활성이 하나라도 있으면 true — 필터 버튼에 활성 표시(badge)할지 결정. */
function evHasActiveFilter(filterOptions) {
  const options = Array.isArray(filterOptions) ? filterOptions : [];
  if (!options.length) return false;
  const enabledCount = options.filter(option => evIsFilterEnabled(option.key)).length;
  return enabledCount !== options.length;
}

/** 표시명 sanitize — 빈/null/undefined/하이픈 단독은 fallback으로 대체. */
function evNormalizeDisplayName(value, fallback = '') {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || /^(null|undefined|-)$/i.test(trimmed)) return fallback;
  return trimmed;
}

/**
 * 이벤트의 선수명 또는 어시스트명 선택 — 'event' 설정(long/short)에 따라 분기.
 * long 모드면 한글 풀네임(KoLong) 우선, 없으면 short fallback.
 * 닉네임(player-menu.js)이 설정돼 있으면 최우선 — settings-popup.js의 pickName()과 동일한
 * 우선순위. 이벤트의 playerId/assistId는 호출 측(fixture.js)이 buildEffectiveFixtureData를
 * 거쳐 넘기므로, alt ID가 유사도 매칭으로 canonical ID에 연결된 경우에도 이미 canonical
 * playerId가 들어와 있어 닉네임이 자동으로 같이 연결된다.
 */
function evPickPlayerName(ev, kind /* 'player'|'assist' */, fallback = '') {
  const useLong = (typeof getSetting === 'function') && getSetting('event') === 'long';
  const pid = kind === 'assist' ? ev.assistId : ev.playerId;
  if (pid && Number(pid) !== 0 && typeof getPlayerNickname === 'function') {
    const nick = getPlayerNickname(pid);
    if (nick) return nick;
  }
  if (kind === 'assist') {
    const long = evNormalizeDisplayName(ev.assistNameKoLong || '');
    const short = evNormalizeDisplayName(ev.assistName || '');
    return evNormalizeDisplayName(useLong ? (long || short) : (short || long), fallback);
  }
  const long = evNormalizeDisplayName(ev.playerNameKoLong || '');
  const short = evNormalizeDisplayName(ev.playerName || '');
  return evNormalizeDisplayName(useLong ? (long || short) : (short || long), fallback);
}

/**
 * 이벤트 텍스트 — 비교체 케이스용 단일 문자열.
 * 교체 케이스는 evCreateRow에서 IN/OUT 두 줄로 별도 렌더(여기서 처리 X).
 */
function evMainText(ev) {
  const name = evTypeIs(ev, 'Goal')
    ? evPickPlayerName(ev, 'player', '득점')
    : evPickPlayerName(ev, 'player');
  if (ev.type === 'Goal') {
    const assist = evPickPlayerName(ev, 'assist');
    return assist ? `${name} (어시스트: ${assist})` : name;
  }
  return name;
}

/**
 * 같은 선수가 옐로우를 두 번 받았을 때, 두 번째 옐로우 대신 API가 보내는 Red Card 이벤트를
 * "경고 누적 퇴장"으로 자동 분류. detail이 'Second Yellow Card'로 직접 명시된 경우도 같은 처리.
 *
 * 알고리즘:
 *   1. 시간 오름차순 정렬해서 옐로우 카드 카운트를 선수별로 집계
 *   2. Red Card 이벤트가 들어왔는데 그 선수가 이전에 옐로우를 받았으면 _isCumulativeRed = true 마킹
 *   3. comments가 비어있으면 "경고 누적 퇴장"으로 자동 채움
 *   4. 표시용으로 다시 시간 내림차순 정렬해서 반환
 */
function evProcess(rawEvents) {
  if (!Array.isArray(rawEvents)) return [];
  const orderedEvents = rawEvents
    .map((ev, index) => ({ ev, index }))
    .sort((a, b) => {
      const elapsedDiff = Number(a.ev?.elapsed ?? 0) - Number(b.ev?.elapsed ?? 0);
      if (elapsedDiff !== 0) return elapsedDiff;
      const extraDiff = Number(a.ev?.extra ?? 0) - Number(b.ev?.extra ?? 0);
      if (extraDiff !== 0) return extraDiff;
      return a.index - b.index;
    });
  const yellows = new Map(); // playerId -> count (이전 시점까지의 경고 수)
  const processed = [];

  for (let index = 0; index < orderedEvents.length; ) {
    const current = orderedEvents[index];
    const elapsed = Number(current.ev?.elapsed ?? 0);
    const extra = Number(current.ev?.extra ?? 0);
    const group = [];

    while (index < orderedEvents.length) {
      const candidate = orderedEvents[index];
      if (Number(candidate.ev?.elapsed ?? 0) !== elapsed || Number(candidate.ev?.extra ?? 0) !== extra) break;
      group.push(candidate);
      index += 1;
    }

    const sameMomentYellowPlayers = new Set(
      group
        .filter(({ ev }) => evTypeIs(ev, 'Card') && evDetailIs(ev.detail, 'Yellow Card') && ev.playerId != null)
        .map(({ ev }) => String(ev.playerId))
    );

    group.forEach(({ ev }) => {
      const out = { ...ev };
      if (evTypeIs(out, 'Var')) {
        const parsedVar = evParseVarDetail(out.detail);
        if (parsedVar.key) {
          out._displayDetail = parsedVar.displayDetail;
          if (!out.comments && parsedVar.displayComment) out._displayComment = parsedVar.displayComment;
        }
      }

      const isYellow = evTypeIs(ev, 'Card') && evDetailIs(ev.detail, 'Yellow Card');
      const isRed = evTypeIs(ev, 'Card') && evDetailIs(ev.detail, 'Red Card');
      const isSecondYellow = evTypeIs(ev, 'Card') && evDetailIs(ev.detail, 'Second Yellow Card');
      const playerKey = ev.playerId == null ? '' : String(ev.playerId);
      const priorYellowCount = playerKey ? (yellows.get(playerKey) || 0) : 0;

      if (
        isSecondYellow
        || (isRed && playerKey && sameMomentYellowPlayers.has(playerKey) && priorYellowCount > 0)
      ) {
        out._isCumulativeRed = true;
        out._displayDetail = 'Red Card';
        if (!out.comments) out.comments = '경고 누적 퇴장';
      }

      processed.push(out);
    });

    group.forEach(({ ev }) => {
      if (ev.playerId == null) return;
      if (evTypeIs(ev, 'Card') && evDetailIs(ev.detail, 'Yellow Card')) {
        const playerKey = String(ev.playerId);
        yellows.set(playerKey, (yellows.get(playerKey) || 0) + 1);
      }
    });
  }
  const hiddenIndexes = new Set();

  processed.forEach((ev, idx) => {
    if (!ev?._isCumulativeRed) return;

    const sameMomentYellow = (candidate, candidateIdx) => (
      candidateIdx !== idx
      && evTypeIs(candidate, 'Card')
      && evDetailIs(candidate.detail, 'Yellow Card')
      && candidate.playerId === ev.playerId
      && Number(candidate.elapsed ?? -1) === Number(ev.elapsed ?? -2)
      && Number(candidate.extra ?? 0) === Number(ev.extra ?? 0)
    );

    for (let i = idx - 1; i >= 0; i -= 1) {
      if (sameMomentYellow(processed[i], i)) {
        hiddenIndexes.add(i);
        return;
      }
    }

    for (let i = idx + 1; i < processed.length; i += 1) {
      if (sameMomentYellow(processed[i], i)) {
        hiddenIndexes.add(i);
        return;
      }
    }
  });

  return processed.filter((_, idx) => !hiddenIndexes.has(idx)).reverse();
}

/**
 * 한 이벤트의 base 키 — side/type/detail/comments/시간/선수/어시스트 조합.
 * 같은 이벤트가 폴링 응답에서 반복 등장해도 동일 키로 식별돼 DOM 재생성 대신 위치만 보정.
 */
function evBaseEventKey(ev) {
  const playerToken = ev?.playerId != null && String(ev.playerId).trim() !== ''
    ? `pid:${String(ev.playerId).trim()}`
    : `pn:${evNormalizeDisplayName(ev?.playerNameKoLong || ev?.playerName || '', '-')}`;
  const assistToken = evNormalizeDisplayName(ev?.assistNameKoLong || ev?.assistName || '', '-');
  return [
    String(ev?.side || ''),
    String(ev?.type || ''),
    String(ev?._displayDetail || ev?.detail || ''),
    String(ev?._displayComment || ev?.comments || ''),
    Number(ev?.elapsed ?? -1),
    Number(ev?.extra ?? 0),
    playerToken,
    `assist:${assistToken}`,
  ].join('|');
}

/**
 * 이벤트 배열 → 고유 renderKey 배열.
 * 같은 base 키가 반복되면 #1/#2/...로 disambiguate (드물게 동시각 중복 이벤트 대응).
 */
function evBuildRenderKeys(events) {
  const seen = new Map();
  return events.map(ev => {
    const base = evBaseEventKey(ev);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return `${base}#${count}`;
  });
}

/**
 * 재렌더 직전에 현재 row들의 화면 위치를 evKey 기준으로 캡처.
 * FLIP 애니메이션의 First 단계 — 이후 새 DOM과 비교해 deltaY 계산.
 */
function evCaptureRowRects(list) {
  const rects = new Map();
  if (!list) return rects;
  list.querySelectorAll('.ev-row[data-ev-key]').forEach(row => {
    rects.set(row.dataset.evKey, row.getBoundingClientRect());
  });
  return rects;
}

/**
 * FLIP 애니메이션 — 새로 렌더된 row 목록을 이전 위치(previousRects) 기준으로 부드럽게 이동.
 *
 * 1) 모든 row 순회.
 * 2) 이전에 있던 row면 deltaY 계산 → translateY로 이전 위치로 보낸 뒤 0으로 transition.
 * 3) 새로 들어온 row면 위에서 살짝 떨어뜨리며 fade-in.
 * 4) 애니메이션 종료 후 inline style 정리.
 */
function evAnimateListInsertion(list, previousRects) {
  if (!list || !previousRects?.size) return;
  const rows = Array.from(list.querySelectorAll('.ev-row[data-ev-key]'));
  const insertedRows = rows.filter(row => !previousRects.has(row.dataset.evKey));
  if (!insertedRows.length) return;

  rows.forEach(row => {
    const prevRect = previousRects.get(row.dataset.evKey);
    if (prevRect) {
      const nextRect = row.getBoundingClientRect();
      const deltaY = prevRect.top - nextRect.top;
      if (Math.abs(deltaY) < 0.5) return;

      row.style.transition = 'none';
      row.style.transform = `translateY(${deltaY}px)`;
      row.getBoundingClientRect();
      row.style.transition = `transform ${EVENTS_PANEL_ROW_ANIM_MS}ms cubic-bezier(.22,.78,.2,1)`;
      row.style.transform = 'translateY(0)';
      setTimeout(() => {
        row.style.transition = '';
        row.style.transform = '';
      }, EVENTS_PANEL_ROW_ANIM_MS + 40);
      return;
    }

    row.classList.add('ev-row-new');
    row.style.transition = 'none';
    row.style.opacity = '0';
    row.style.transform = `translateY(-${EVENTS_PANEL_ROW_ENTER_OFFSET_PX}px) scale(.985)`;
    row.getBoundingClientRect();
    row.style.transition = `transform ${EVENTS_PANEL_ROW_ANIM_MS}ms cubic-bezier(.22,.78,.2,1), opacity 220ms ease`;
    row.style.opacity = '1';
    row.style.transform = 'translateY(0) scale(1)';
    setTimeout(() => {
      row.style.transition = '';
      row.style.transform = '';
      row.style.opacity = '';
      row.classList.remove('ev-row-new');
    }, EVENTS_PANEL_ROW_ANIM_MS + 220);
  });
}

function evIconHtml(iconKey) {
  // 기본 placeholder — 단순한 도형/유니코드. 추후 .ev-icon-{key} 클래스에 background-image로 커스텀 가능.
  switch (iconKey) {
    case 'goal':           return '<span class="ev-icon-glyph">⚽</span>';
    case 'pk-goal':        return '<span class="ev-icon-glyph">⚽</span><span class="ev-icon-sub">PK</span>';
    case 'own-goal':       return '<span class="ev-icon-glyph ev-icon-own">⚽</span>';
    case 'pk-miss':        return '<span class="ev-icon-glyph">⚽</span><span class="ev-icon-sub ev-icon-x">✕</span>';
    case 'yellow-card':    return '<span class="ev-icon-card ev-icon-card-yellow"></span>';
    case 'red-card':       return '<span class="ev-icon-card ev-icon-card-red"></span>';
    case 'cumulative-red': return '<span class="ev-icon-card ev-icon-card-yellow ev-icon-card-stack"></span><span class="ev-icon-card ev-icon-card-red ev-icon-card-stack"></span>';
    case 'subst':          return '<span class="ev-icon-glyph">⇅</span>';
    case 'var-cancel':     return '<span class="ev-icon-var">VAR</span><span class="ev-icon-sub ev-icon-x">✕</span>';
    case 'var-confirm':    return '<span class="ev-icon-var">VAR</span><span class="ev-icon-sub">✓</span>';
    default:               return '<span class="ev-icon-glyph">•</span>';
  }
}

// ─── 구간 구분자 (하프타임/후반종료/연장전반종료/연장후반종료/풀타임) ───────────
// API가 이런 경계를 별도 이벤트로 안 주기 때문에 matchInfo.status/elapsed 전이로
// 추론해서 합성한 "가짜 이벤트"를 실제 이벤트 사이에 끼워 넣는다.
const EV_PERIOD_MARKER_SORT_PADDING = 50; // 같은 분(elapsed)의 실제 추가시간 이벤트보다 항상 뒤(=더 늦은 시점)로 보내는 패딩
// 하프타임 마커 표시 허용 status — "NS/1H가 아니면 전부"식 부정 조건은 PST/CANC/SUSP/INT/ABD/AWD/WO
// 같은 비정상 status에도 걸려 하프타임 마커가 잘못 붙었음. 진행된 상태만 명시적으로 허용한다.
const EV_HALFTIME_REACHED_STATUSES = new Set(['HT', '2H', 'ET1', 'ET2', 'PSO', 'FT']);

/**
 * matchInfo로 지금까지 지나온 구간 구분자 목록을 만든다. 두 쌍(후반종료/풀타임,
 * 연장후반종료/풀타임)은 그 경기가 연장으로 갔는지에 따라 서로 배타적으로 하나만 나온다.
 *   - 하프타임   : status가 HT 이후로 진행됐으면(HT/2H/ET1/ET2/PSO/FT) 표시.
 *   - 후반종료   : 연장으로 이어진 경우에만(정규시간 종료 시 FT가 바로 안 왔다는 뜻).
 *   - 연장 전반 종료 : status가 ET2/PSO까지 진행됐거나(=elapsed 106 이상), FT인데
 *                  사후적으로 연장이 있었다고 판단되는 경우.
 *   - 연장 후반 종료 : status가 PSO이거나 승부차기 스코어가 존재하는 경우.
 *   - 풀타임     : 연장 없이 FT로 끝났을 때, 또는 연장에서 승부차기 없이 FT로 끝났을 때.
 * FT 시점엔 status만으론 연장 여부를 알 수 없어(정규/연장/PK 종료 모두 그냥 "FT") elapsed가
 * 105를 넘었는지/승부차기 스코어가 있는지로 사후 추정한다 — 생방송 중에는 ET1/ET2/PSO 상태를
 * 직접 거치므로 이 추정이 필요 없다.
 */
function evBuildPeriodMarkers(matchInfo) {
  if (!matchInfo) return [];

  const status = String(matchInfo.status || '').toUpperCase();
  const elapsed = Number(matchInfo.elapsed ?? 0);
  const hadPenalties = matchInfo.homePenaltyScore != null || matchInfo.awayPenaltyScore != null;

  const isLiveExtraTime = status === 'ET1' || status === 'ET2' || status === 'PSO';
  const ftLooksLikeExtraTime = status === 'FT' && (elapsed > 105 || hadPenalties);
  const extraTimePlayed = isLiveExtraTime || ftLooksLikeExtraTime;
  const reachedEt2 = status === 'ET2' || status === 'PSO' || ftLooksLikeExtraTime;
  const reachedHalftime = EV_HALFTIME_REACHED_STATUSES.has(status);

  const markers = [];
  const addMarker = (label, sortElapsed) => markers.push({
    _isPeriodMarker: true,
    label,
    elapsed: sortElapsed,
    extra: EV_PERIOD_MARKER_SORT_PADDING,
  });

  if (reachedHalftime) addMarker('하프타임', 45);

  if (extraTimePlayed) {
    addMarker('후반종료', 90);
    if (reachedEt2) addMarker('연장 전반 종료', 105);
    if (status === 'PSO' || hadPenalties) addMarker('연장 후반 종료', 120);
    else if (status === 'FT') addMarker('풀타임', 120);
  } else if (status === 'FT') {
    addMarker('풀타임', 90);
  }

  return markers;
}

/**
 * 필터링된 실제 이벤트(내림차순)와 구간 마커를 합쳐 시간 내림차순 단일 리스트로 반환.
 * 마커는 evFilterEvents의 카테고리 필터 대상이 아니라 항상 포함됨 — 정렬 키(elapsed*100+extra)에
 * EV_PERIOD_MARKER_SORT_PADDING을 더해 같은 분의 실제 이벤트보다 항상 늦게(=내림차순에서 더 위로) 배치.
 */
function evMergeWithPeriodMarkers(eventsDesc, markers) {
  const eventItems = eventsDesc.map(ev => ({ kind: 'event', ev }));
  if (!markers.length) return eventItems;

  const markerItems = markers.map(marker => ({ kind: 'marker', marker }));
  const sortKeyOf = item => {
    const src = item.kind === 'marker' ? item.marker : item.ev;
    return Number(src?.elapsed ?? 0) * 100 + Number(src?.extra ?? 0);
  };

  return [...eventItems, ...markerItems]
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => (sortKeyOf(b.item) - sortKeyOf(a.item)) || (a.idx - b.idx))
    .map(({ item }) => item);
}

/** 구간 구분자 row — 가운데 정렬 라벨 + 양옆 디바이더 라인. 폰트는 일반 이벤트와 동일 크기. */
function evCreateMarkerRow(marker) {
  const row = document.createElement('div');
  row.className = 'ev-row ev-period-marker';

  const lineBefore = document.createElement('span');
  lineBefore.className = 'ev-marker-line';

  const label = document.createElement('span');
  label.className = 'ev-marker-label';
  label.textContent = marker.label;
  label.style.fontSize = evGetBaseFontSize() + 'px';

  const lineAfter = document.createElement('span');
  lineAfter.className = 'ev-marker-line';

  row.append(lineBefore, label, lineAfter);
  return row;
}

/** 한 이벤트 row의 DOM 생성. fixtureData에서 팀 로고 URL 가져옴. */
function evCreateRow(ev, fixtureData, renderKey = '') {
  const style = evStyle(ev);
  const row = document.createElement('div');
  row.className = `ev-row ev-bar-${style.color}`;
  if (renderKey) row.dataset.evKey = renderKey;
  if (evTypeIs(ev, 'subst')) row.classList.add('ev-row-subst');

  // 좌측 컬러 막대
  const bar = document.createElement('div');
  bar.className = 'ev-bar';
  row.appendChild(bar);

  // 메인 줄 (flex row): 시간 + 라벨 + 아이콘 + 텍스트(또는 IN/OUT 스택) + 인라인 코멘트 + 팀 로고
  const main = document.createElement('div');
  main.className = 'ev-main';

  const time = document.createElement('span');
  time.className = 'ev-time';
  time.textContent = evFormatTime(ev);
  main.appendChild(time);

  // 라벨 — 배경색을 이벤트 색상과 매칭(.ev-label-{color})
  const label = document.createElement('span');
  label.className = `ev-label ev-label-${style.color}`;
  label.textContent = evLabelKo(ev);
  main.appendChild(label);

  const icon = document.createElement('span');
  icon.className = `ev-icon ev-icon-${style.icon}`;
  icon.innerHTML = evIconHtml(style.icon);
  main.appendChild(icon);

  // 텍스트 영역 — 케이스별 레이아웃:
  //   subst : IN(어시스트Name) / OUT(playerName) 2줄 스택. (기본 2줄 보장, 각 line wrap 시 최대 4줄)
  //   Goal  : 1줄 = playerName, 2줄 = "어시스트: assistName" (회색, 작게). 어시스트 없으면 1줄.
  //   기타  : 단일 라인 = playerName.
  // 코멘트(ev.comments)는 별도 flex 아이템이 아닌, 첫 라인의 인라인 자식으로 붙여 선수 이름 바로 옆에 위치.
  const rawComment = String(ev._displayComment || ev.comments || '').trim();
  const translatedComment = (rawComment && window.translateEventComment)
    ? window.translateEventComment(rawComment)
    : rawComment;

  function appendName(parent, name) {
    const nameEl = document.createElement('span');
    nameEl.className = 'ev-text-name';
    nameEl.textContent = name;
    parent.appendChild(nameEl);
  }
  function appendInlineComment(parent) {
    if (!translatedComment) return;
    const cmt = document.createElement('span');
    cmt.className = 'ev-comment';
    cmt.textContent = translatedComment;
    parent.appendChild(cmt);
  }

  if (evTypeIs(ev, 'subst')) {
    const fixtureId = String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
    const stack = document.createElement('span');
    stack.className = 'ev-text ev-text-stack';

    const inLine = document.createElement('span');
    inLine.className = 'ev-text-line ev-text-in';
    inLine.append('IN: ');
    const inName = evGetSubstDisplayName(ev, 'assist', fixtureId);
    if (inName) appendName(inLine, inName);
    else inLine.appendChild(evCreateSubstFixBtn(ev, 'assist', fixtureData));
    appendInlineComment(inLine); // subst의 코멘트는 IN 라인 옆에

    const outLine = document.createElement('span');
    outLine.className = 'ev-text-line ev-text-out';
    outLine.append('OUT: ');
    const outName = evGetSubstDisplayName(ev, 'player', fixtureId);
    if (outName) appendName(outLine, outName);
    else outLine.appendChild(evCreateSubstFixBtn(ev, 'player', fixtureData));

    stack.appendChild(inLine);
    stack.appendChild(outLine);
    main.appendChild(stack);
  } else if (evTypeIs(ev, 'Goal')) {
    const assistName = evPickPlayerName(ev, 'assist');
    const stack = document.createElement('span');
    stack.className = assistName ? 'ev-text ev-text-stack' : 'ev-text';

    if (assistName) {
      const primary = document.createElement('span');
      primary.className = 'ev-text-line ev-text-primary';
      appendName(primary, evPickPlayerName(ev, 'player', '득점'));
      appendInlineComment(primary);

      const assistLine = document.createElement('span');
      assistLine.className = 'ev-text-line ev-text-assist';
      assistLine.textContent = `어시스트: ${assistName}`;

      stack.appendChild(primary);
      stack.appendChild(assistLine);
    } else {
      // 어시스트 없는 골 — 단일 라인. 코멘트는 인라인.
      appendName(stack, evPickPlayerName(ev, 'player', '득점'));
      appendInlineComment(stack);
    }
    main.appendChild(stack);
  } else {
    // 카드 / VAR / 기타 — 단일 라인. 선수 이름 + 인라인 코멘트.
    const text = document.createElement('span');
    text.className = 'ev-text';
    appendName(text, evPickPlayerName(ev, 'player'));
    appendInlineComment(text);
    main.appendChild(text);
  }

  // 팀 로고 — row 우측 끝. teamLogo 설정(logo/fa) 반영하기 위해 state.homeLogo/awayLogo 우선 사용.
  // state는 fixture.js의 applyFixtureToState가 resolveTeamLogoUrl로 fa/logo 분기해 채워줌.
  // state 없거나 비었으면 fixtureData.matchInfo로 폴백.
  const logoUrl = evResolveTeamLogo(ev, fixtureData);
  if (logoUrl) {
    const logoBox = document.createElement('span');
    logoBox.className = 'ev-team-logo';
    const img = document.createElement('img');
    img.src = logoUrl;
    img.alt = ev.side === 'home' ? 'HOME' : 'AWAY';
    logoBox.appendChild(img);
    main.appendChild(logoBox);
  }

  row.appendChild(main);
  return row;
}

/** 이벤트 side로 로고 URL 선택. state.{side}Logo(teamLogo 설정 반영) → fixtureData.matchInfo 폴백. */
function evResolveTeamLogo(ev, fixtureData) {
  const useState = typeof state !== 'undefined' && state;
  if (ev.side === 'home') {
    if (useState && state.homeLogo) return state.homeLogo;
    return fixtureData?.matchInfo?.homeTeamLogo || null;
  }
  if (ev.side === 'away') {
    if (useState && state.awayLogo) return state.awayLogo;
    return fixtureData?.matchInfo?.awayTeamLogo || null;
  }
  return null;
}

/** 설정의 eventNameSize(없으면 default) 가져오기. */
function evGetBaseFontSize() {
  const fromSetting = (typeof getSetting === 'function') ? Number(getSetting('eventNameSize')) : NaN;
  if (Number.isFinite(fromSetting) && fromSetting >= EVENTS_PANEL_FONT_MIN) return fromSetting;
  return EVENTS_PANEL_FONT_DEFAULT;
}

/**
 * 폰트 적용 정책 (사용자 요청):
 *   1. 기본 폰트로 1줄 시도. 잘리면 2줄로 wrap (subst는 IN/OUT 각 최대 2줄 → 총 4줄).
 *   2. 허용된 최대 줄수에서도 넘치면 폰트 px 감소 (10px 하한).
 *   3. 최소 폰트에서도 넘치면 그냥 둠(ellipsis).
 *
 * subst에서는 IN/OUT 두 line 영역이 별도로 wrap 가능 (CSS .ev-text-line { line-clamp: 2 }).
 * 일반 이벤트는 단일 .ev-text가 line-clamp: 2.
 * 코멘트(.ev-comment)는 텍스트 폰트 -2px로 동기화.
 */
function evFitText(row) {
  const main = row.querySelector('.ev-main');
  if (!main) return;
  const isSubst = row.classList.contains('ev-row-subst');
  const baseSize = evGetBaseFontSize();
  const linePerSlot = 2; // 한 슬롯(.ev-text 또는 .ev-text-line)당 허용 줄수

  const textTargets = isSubst
    ? [...row.querySelectorAll('.ev-text-line')]
    : [...row.querySelectorAll('.ev-text')];
  const comment = row.querySelector('.ev-comment');

  /** scrollHeight > clientHeight면 line-clamp로 잘렸다는 뜻 → 넘침. */
  const isOverflow = el => el.scrollHeight - el.clientHeight > 1;

  function applyAndCheck(size) {
    textTargets.forEach(el => {
      el.style.fontSize = size + 'px';
      el.style.webkitLineClamp = String(linePerSlot);
      el.style.lineClamp = String(linePerSlot);
    });
    if (comment) comment.style.fontSize = Math.max(EVENTS_PANEL_FONT_MIN - 1, size - 2) + 'px';
    return textTargets.some(isOverflow);
  }

  let size = baseSize;
  let overflowing = applyAndCheck(size);
  while (overflowing && size > EVENTS_PANEL_FONT_MIN) {
    size--;
    overflowing = applyAndCheck(size);
  }
}

/** 패널이 실제로 보이는 시점에 row 텍스트 피팅을 다시 계산한다. */
function evRefitPanelRows(container) {
  if (!container) return;
  container.querySelectorAll('.ev-row').forEach(evFitText);
}

/** 현재 fixture 데이터로 이벤트 패널을 즉시 다시 그린다. */
function evRerenderCurrentPanel() {
  if (window._eventsLastData) {
    window.applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

/** 필터 popover 닫고 패널 즉시 재렌더 (ESC/외부 클릭 핸들러). */
function evCloseFilterPopover() {
  if (!eventsPanelFilterState.isOpen) return;
  eventsPanelFilterState.isOpen = false;
  evRerenderCurrentPanel();
}

/** 패널 상단 제목 줄 ('이벤트' 라벨 + 우측 필터 버튼) DOM 빌드. */
function evCreateTitleBar(filterOptions, container) {
  const titleBar = document.createElement('div');
  titleBar.className = 'ev-title-bar';

  // lp-stat 컨텍스트에서는 cycle 버튼이 내비게이션을 담당 — HTH 토글 불필요
  const isStatPanel = container?.closest?.('.lp-stat');

  // 작은 메뉴는 HTH를 lazy-load하므로, 팀 ID만 있으면 전환 버튼을 먼저 노출한다.
  const canLoadHth = typeof window.hthCanLoadForFixture === 'function'
    && window.hthCanLoadForFixture(window._eventsLastData);
  if (canLoadHth && !isStatPanel) {
    const hthBtn = document.createElement('button');
    hthBtn.type = 'button';
    hthBtn.className = 'hth-ev-toggle-btn';
    hthBtn.title = '상대 전적 보기';
    hthBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h10M9 2l2 2-2 2"/><path d="M13 10H3M5 8l-2 2 2 2"/></svg>`;
    hthBtn.addEventListener('click', () => {
      if (typeof window.hthShowForFixture === 'function') {
        window.hthShowForFixture(window._eventsLastData).catch(err => console.warn('HTH fetch failed:', err));
      }
    });
    titleBar.appendChild(hthBtn);
  }

  const title = document.createElement('div');
  title.className = 'ev-title';
  title.textContent = '이벤트';
  titleBar.appendChild(title);

  titleBar.appendChild(evCreateFilterUi(filterOptions));
  return titleBar;
}

/**
 * 필터 버튼 + popover UI 빌드.
 *
 * 1) 가용한 필터 카테고리 수와 활성/비활성 카운트로 버튼 라벨/뱃지 결정.
 * 2) 버튼 클릭 → popover open/close 토글.
 * 3) popover가 열린 상태일 때만 내부(헤딩/리셋 버튼/옵션 체크박스 목록) 빌드.
 * 4) 각 옵션 체크박스 change → evSetFilterEnabled로 localStorage 영속화 + 재렌더.
 * 5) "전체 표시" 버튼 → 모든 카테고리 enable + 재렌더.
 */
function evCreateFilterUi(filterOptions) {
  const options = Array.isArray(filterOptions) ? filterOptions : [];
  const totalCount = options.length;
  const enabledCount = options.filter(option => evIsFilterEnabled(option.key)).length;
  const isFiltered = evHasActiveFilter(options);

  const shell = document.createElement('div');
  shell.className = 'ev-filter-shell';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ev-filter-btn';
  if (isFiltered) button.classList.add('is-active');
  if (eventsPanelFilterState.isOpen) button.classList.add('is-open');
  button.disabled = !totalCount;
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', eventsPanelFilterState.isOpen ? 'true' : 'false');
  button.title = totalCount ? '이벤트 필터' : '필터할 이벤트가 없습니다';
  button.innerHTML = [
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
    '<path d="M2 3.25C2 2.56 2.56 2 3.25 2h9.5C13.44 2 14 2.56 14 3.25c0 .3-.11.59-.31.82L10 8.08v4.17c0 .25-.12.49-.32.64l-1.75 1.25A.75.75 0 0 1 6.75 13.5V8.08L2.31 4.07A1.25 1.25 0 0 1 2 3.25Z" fill="currentColor"></path>',
    '</svg>',
    '<span class="ev-filter-btn-label">필터</span>',
  ].join('');
  if (isFiltered) {
    const badge = document.createElement('span');
    badge.className = 'ev-filter-badge';
    badge.textContent = `${enabledCount}/${totalCount}`;
    button.appendChild(badge);
  }
  button.addEventListener('click', event => {
    event.preventDefault();
    if (!totalCount) return;
    eventsPanelFilterState.isOpen = !eventsPanelFilterState.isOpen;
    evRerenderCurrentPanel();
  });
  shell.appendChild(button);

  const popover = document.createElement('div');
  popover.className = 'ev-filter-popover';
  popover.hidden = !eventsPanelFilterState.isOpen || !totalCount;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', '이벤트 필터');
  if (!popover.hidden) {
    const heading = document.createElement('div');
    heading.className = 'ev-filter-heading';

    const headingText = document.createElement('div');
    headingText.className = 'ev-filter-heading-text';
    headingText.textContent = '표시할 이벤트';
    heading.appendChild(headingText);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ev-filter-reset';
    resetBtn.textContent = '전체 표시';
    resetBtn.disabled = !isFiltered;
    resetBtn.addEventListener('click', event => {
      event.preventDefault();
      evSetAllFilters(options.map(option => option.key), true);
      eventsPanelFilterState.isOpen = true;
      evRerenderCurrentPanel();
    });
    heading.appendChild(resetBtn);

    const optionList = document.createElement('div');
    optionList.className = 'ev-filter-options';

    options.forEach(option => {
      const item = document.createElement('label');
      item.className = 'ev-filter-option';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = evIsFilterEnabled(option.key);
      input.addEventListener('change', () => {
        evSetFilterEnabled(option.key, input.checked);
        eventsPanelFilterState.isOpen = true;
        evRerenderCurrentPanel();
      });

      const swatch = document.createElement('span');
      swatch.className = `ev-filter-swatch ev-filter-swatch-${option.color}`;

      const text = document.createElement('span');
      text.className = 'ev-filter-option-text';
      text.textContent = option.label;

      const count = document.createElement('span');
      count.className = 'ev-filter-count';
      count.textContent = String(option.count);

      item.append(input, swatch, text, count);
      optionList.appendChild(item);
    });

    popover.append(heading, optionList);
  }
  shell.appendChild(popover);
  return shell;
}

/**
 * fixture data를 받아 이벤트 패널을 렌더링하는 외부 진입점.
 *
 * 1) fixtureData를 캐시(window._eventsLastData) — 설정 변경 시 즉시 재사용.
 * 2) 컨테이너([data-events-panel]) 못 찾으면 종료.
 * 3) data null이면 패널 비우기.
 * 4) evProcess로 이벤트 가공(누적 레드 분류) + 필터링 → renderKey 빌드.
 * 5) 기존 row의 위치 캡처(FLIP First) → 새 DOM 그림 → evAnimateListInsertion으로 부드럽게 이동/insertion.
 * 6) 폰트 자동 축소(evFitText) 한 row씩 적용.
 *
 * options.animate=false면 FLIP 애니메이션 건너뜀 (필터 토글 등 즉각적 변경용).
 */
/**
 * 모든 [data-events-panel] 인스턴스에 같은 데이터/렌더 적용.
 * 캠 작은 페이지(메인 이벤트 패널) + 전술판 페이지(타임라인 호스트) 등 여러 곳에 동시 노출.
 */
function applyEventsPanel(fixtureData, options = {}) {
  // settings:change에서 재사용할 마지막 fixture 캐시
  window._eventsLastData = fixtureData;

  const containers = document.querySelectorAll('[data-events-panel]');
  if (!containers.length) return;

  const nextFixtureId = String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
  const processedEvents = evProcess(fixtureData?.events);
  const filterOptions = evBuildFilterOptions(processedEvents);
  if (!filterOptions.length) eventsPanelFilterState.isOpen = false;
  const events = evFilterEvents(processedEvents);
  const periodMarkers = evBuildPeriodMarkers(fixtureData?.matchInfo);
  const renderItems = evMergeWithPeriodMarkers(events, periodMarkers);

  containers.forEach(container => {
    const previousFixtureId = String(container.dataset.evFixtureId || '').trim();
    const shouldAnimate = options.animate !== false
      && !!nextFixtureId
      && previousFixtureId === nextFixtureId;
    const previousRects = shouldAnimate
      ? evCaptureRowRects(container.querySelector('.ev-list'))
      : new Map();
    // 각 컨테이너마다 별도의 titleBar 인스턴스 (DOM 노드는 공유 불가).
    const titleBar = evCreateTitleBar(filterOptions, container);

    // 패널 제목 바 — 교체명단/부상 패널 구조 참고 (.dp-title 톤 유지)
    if (!processedEvents.length && !periodMarkers.length) {
      container.replaceChildren(titleBar);
      container.dataset.evFixtureId = nextFixtureId;
      const empty = document.createElement('div');
      empty.className = 'ev-empty';
      empty.textContent = '이벤트가 없습니다';
      container.appendChild(empty);
      container.dispatchEvent(new CustomEvent('events-panel:rendered', { bubbles: true }));
      return;
    }

    if (!renderItems.length) {
      container.replaceChildren(titleBar);
      container.dataset.evFixtureId = nextFixtureId;
      const empty = document.createElement('div');
      empty.className = 'ev-empty';
      empty.textContent = '선택한 필터에 맞는 이벤트가 없습니다';
      container.appendChild(empty);
      container.dispatchEvent(new CustomEvent('events-panel:rendered', { bubbles: true }));
      return;
    }

    const list = document.createElement('div');
    list.className = 'ev-list';
    const renderKeys = evBuildRenderKeys(events);
    let eventKeyIndex = 0;
    renderItems.forEach(item => {
      if (item.kind === 'marker') {
        list.appendChild(evCreateMarkerRow(item.marker));
        return;
      }
      list.appendChild(evCreateRow(item.ev, fixtureData, renderKeys[eventKeyIndex]));
      eventKeyIndex += 1;
    });
    container.replaceChildren(titleBar, list);
    container.dataset.evFixtureId = nextFixtureId;

    // 외부 모듈(예: tactics-timeline.js)이 렌더 후 추가 DOM을 끼워넣을 수 있도록 알림.
    // bubbles:true로 document-level 리스너가 받을 수 있게.
    container.dispatchEvent(new CustomEvent('events-panel:rendered', { bubbles: true }));

    // 레이아웃 후 폰트 자동 축소 — getBoundingClientRect 사용 가능 시점에 호출
    requestAnimationFrame(() => {
      evRefitPanelRows(container);
      requestAnimationFrame(() => {
        if (shouldAnimate) evAnimateListInsertion(list, previousRects);
      });
    });
  });

  // lp-stat cycle 버튼 상태 갱신 (Iter 7)
  if (typeof window.lpStatUpdateBtn === 'function') window.lpStatUpdateBtn();
}

// 전역 노출 (fixture.js에서 호출)
window.applyEventsPanel = applyEventsPanel;
window.evRefitPanelRows = evRefitPanelRows;

// settings 변경(이벤트 풀네임 토글 + 폰트 크기 + 팀 로고 모드) 시 즉시 다시 그림.
// applyEventsPanel 호출 시 window._eventsLastData에 fixtureData 캐시됨.
document.addEventListener('settings:change', e => {
  const cat = e.detail?.category;
  if (cat !== 'event' && cat !== 'eventNameSize' && cat !== 'teamLogo') return;
  if (window._eventsLastData) {
    window.applyEventsPanel(window._eventsLastData, { animate: false });
  }
});

document.addEventListener('pointerdown', event => {
  if (!eventsPanelFilterState.isOpen) return;
  const shell = typeof event.target?.closest === 'function'
    ? event.target.closest('.ev-filter-shell')
    : null;
  if (shell) return;
  if (!document.querySelector('.ev-filter-shell')) {
    eventsPanelFilterState.isOpen = false;
    return;
  }
  evCloseFilterPopover();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !eventsPanelFilterState.isOpen) return;
  event.preventDefault();
  evCloseFilterPopover();
});
