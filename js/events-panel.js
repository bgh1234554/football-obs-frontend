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

function evSaveDisabledFilterKeys() {
  try {
    localStorage.setItem(
      EVENTS_PANEL_FILTER_STORAGE_KEY,
      JSON.stringify(Array.from(eventsPanelFilterState.disabledKeys))
    );
  } catch {}
}

function evIsFilterEnabled(key) {
  return !eventsPanelFilterState.disabledKeys.has(key);
}

function evSetFilterEnabled(key, enabled) {
  const normalized = String(key || '').trim();
  if (!normalized) return;
  if (enabled) eventsPanelFilterState.disabledKeys.delete(normalized);
  else eventsPanelFilterState.disabledKeys.add(normalized);
  evSaveDisabledFilterKeys();
}

function evSetAllFilters(filterKeys, enabled) {
  Array.from(new Set((Array.isArray(filterKeys) ? filterKeys : []).map(key => String(key || '').trim()).filter(Boolean)))
    .forEach(key => evSetFilterEnabled(key, enabled));
}

function evFilterSortWeight(key) {
  const index = EVENTS_PANEL_FILTER_ORDER.indexOf(String(key || ''));
  return index >= 0 ? index : EVENTS_PANEL_FILTER_ORDER.length + 100;
}

function evTypeIs(ev, type) {
  return String(ev?.type || '').toLowerCase() === String(type || '').toLowerCase();
}

function evDetailIs(detail, target) {
  return String(detail || '').trim().toLowerCase() === String(target || '').trim().toLowerCase();
}

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

function evVarDetailKey(detail) {
  return evParseVarDetail(detail).key;
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

function evGetFilterMeta(ev) {
  const style = evStyle(ev);
  return {
    key: evFilterKey(ev),
    label: evLabelKo(ev) || '기타',
    color: String(style.color || 'white'),
  };
}

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

function evFilterEvents(events) {
  return (Array.isArray(events) ? events : []).filter(ev => evIsFilterEnabled(evGetFilterMeta(ev).key));
}

function evHasActiveFilter(filterOptions) {
  const options = Array.isArray(filterOptions) ? filterOptions : [];
  if (!options.length) return false;
  const enabledCount = options.filter(option => evIsFilterEnabled(option.key)).length;
  return enabledCount !== options.length;
}

function evNormalizeDisplayName(value, fallback = '') {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || /^(null|undefined|-)$/i.test(trimmed)) return fallback;
  return trimmed;
}

function evPickPlayerName(ev, kind /* 'player'|'assist' */, fallback = '') {
  const useLong = (typeof getSetting === 'function') && getSetting('event') === 'long';
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
  const yellows = new Map(); // playerId -> count
  const processed = rawEvents.map(ev => {
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
    if (isYellow) {
      yellows.set(ev.playerId, (yellows.get(ev.playerId) || 0) + 1);
    }
    if (isSecondYellow || (isRed && (yellows.get(ev.playerId) || 0) > 0)) {
      out._isCumulativeRed = true;
      out._displayDetail = 'Red Card';
      if (!out.comments) out.comments = '경고 누적 퇴장';
    }
    return out;
  });
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
  // 표시: 최신이 위
  return processed.reverse();
}

/** 이벤트 종류별 placeholder 아이콘 SVG/HTML. 추후 사용자 커스텀 아이콘으로 교체 가능. */
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

function evBuildRenderKeys(events) {
  const seen = new Map();
  return events.map(ev => {
    const base = evBaseEventKey(ev);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return `${base}#${count}`;
  });
}

function evCaptureRowRects(list) {
  const rects = new Map();
  if (!list) return rects;
  list.querySelectorAll('.ev-row[data-ev-key]').forEach(row => {
    rects.set(row.dataset.evKey, row.getBoundingClientRect());
  });
  return rects;
}

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
    const stack = document.createElement('span');
    stack.className = 'ev-text ev-text-stack';

    const inLine = document.createElement('span');
    inLine.className = 'ev-text-line ev-text-in';
    inLine.append('IN: ');
    appendName(inLine, evPickPlayerName(ev, 'assist') || '?');
    appendInlineComment(inLine); // subst의 코멘트는 IN 라인 옆에

    const outLine = document.createElement('span');
    outLine.className = 'ev-text-line ev-text-out';
    outLine.append('OUT: ');
    appendName(outLine, evPickPlayerName(ev, 'player') || '?');

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
    : [...row.querySelectorAll('.ev-text:not(.ev-text-stack)')];
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

/** 현재 fixture 데이터로 이벤트 패널을 즉시 다시 그린다. */
function evRerenderCurrentPanel() {
  if (window._eventsLastData) {
    window.applyEventsPanel(window._eventsLastData, { animate: false });
  }
}

function evCloseFilterPopover() {
  if (!eventsPanelFilterState.isOpen) return;
  eventsPanelFilterState.isOpen = false;
  evRerenderCurrentPanel();
}

function evCreateTitleBar(filterOptions) {
  const titleBar = document.createElement('div');
  titleBar.className = 'ev-title-bar';

  const title = document.createElement('div');
  title.className = 'ev-title';
  title.textContent = '이벤트';
  titleBar.appendChild(title);

  titleBar.appendChild(evCreateFilterUi(filterOptions));
  return titleBar;
}

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

/** fixture data를 받아 이벤트 패널을 렌더링한다. data가 null이면 비운다. */
function applyEventsPanel(fixtureData, options = {}) {
  // settings:change에서 재사용할 마지막 fixture 캐시
  window._eventsLastData = fixtureData;

  const container = document.querySelector('[data-events-panel]');
  if (!container) return;
  const nextFixtureId = String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
  const previousFixtureId = String(container.dataset.evFixtureId || '').trim();
  const shouldAnimate = options.animate !== false
    && !!nextFixtureId
    && previousFixtureId === nextFixtureId;
  const previousRects = shouldAnimate
    ? evCaptureRowRects(container.querySelector('.ev-list'))
    : new Map();
  const processedEvents = evProcess(fixtureData?.events);
  const filterOptions = evBuildFilterOptions(processedEvents);
  if (!filterOptions.length) eventsPanelFilterState.isOpen = false;
  const titleBar = evCreateTitleBar(filterOptions);
  const events = evFilterEvents(processedEvents);

  // 패널 제목 바 — 교체명단/부상 패널 구조 참고 (.dp-title 톤 유지)
  if (!processedEvents.length) {
    container.replaceChildren(titleBar);
    container.dataset.evFixtureId = nextFixtureId;
    const empty = document.createElement('div');
    empty.className = 'ev-empty';
    empty.textContent = '이벤트가 없습니다';
    container.appendChild(empty);
    return;
  }

  if (!events.length) {
    container.replaceChildren(titleBar);
    container.dataset.evFixtureId = nextFixtureId;
    const empty = document.createElement('div');
    empty.className = 'ev-empty';
    empty.textContent = '선택한 필터에 맞는 이벤트가 없습니다';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'ev-list';
  const renderKeys = evBuildRenderKeys(events);
  events.forEach((ev, index) => list.appendChild(evCreateRow(ev, fixtureData, renderKeys[index])));
  container.replaceChildren(titleBar, list);
  container.dataset.evFixtureId = nextFixtureId;

  // 레이아웃 후 폰트 자동 축소 — getBoundingClientRect 사용 가능 시점에 호출
  requestAnimationFrame(() => {
    list.querySelectorAll('.ev-row').forEach(evFitText);
    requestAnimationFrame(() => {
      if (shouldAnimate) evAnimateListInsertion(list, previousRects);
    });
  });
}

// 전역 노출 (fixture.js에서 호출)
window.applyEventsPanel = applyEventsPanel;

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
  const shell = document.querySelector('.ev-filter-shell');
  if (!shell) {
    eventsPanelFilterState.isOpen = false;
    return;
  }
  if (shell.contains(event.target)) return;
  evCloseFilterPopover();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !eventsPanelFilterState.isOpen) return;
  event.preventDefault();
  evCloseFilterPopover();
});
