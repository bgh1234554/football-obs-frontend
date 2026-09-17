// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 패널 / 이름 라벨·팀칩 텍스트 피팅]
// 라인업 이름 pill, 벤치 하단 텍스트, 팀 칩을 렌더 후 실제 픽셀 기준으로 보정한다.
// fitLineupNamePills 4단계: 0) 자연 1줄(폰트 유지) 1) 2줄 클램프(폰트 유지)
// 2) 축소 필요 시 복합 성을 최대 3줄로 분리 후 폭/폰트 축소 3) 큰 캠 잔여 충돌 보정. lineup-render.js가 렌더한
// DOM을 다음 frame에 다시 읽어 보정하므로 그 이후 로드돼도 무방하다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── 텍스트 피팅 / 충돌 보정 ─────────────────────────────────────────────
// 라인업 이름 pill, 벤치 하단 텍스트, 팀 칩은 모두 렌더 후 실제 픽셀 기준으로 한 번 더 보정한다.
const LINEUP_NAME_MIN_FONT_PX = 7;
const LINEUP_NAME_MIN_WIDTH_PX = 44;
const LINEUP_NAME_PITCH_PADDING_PX = 2;
const BIG_LINEUP_NAME_PITCH_PADDING_PX = 6;
const BENCH_FOOTER_MIN_FONT_PX = 8;
const TEAM_CHIP_NAME_MIN_FONT_PX = 7;
const TEAM_CHIP_NAME_MIN_WIDTH_PX = 44;
const TEAM_CHIP_META_MIN_FONT_PX = 7;
const TEAM_CHIP_BUTTON_MIN_FONT_PX = 7;
const TEAM_CHIP_BUTTON_MIN_WIDTH_PX = 48;
const TEXT_FIT_FONT_STEP_PX = 1;

/** el이 DOM에 붙어 있고 실제로 렌더돼 치수를 잴 수 있는 상태인지. */
function canMeasureTextElement(el) {
  return !!(el && el.isConnected && el.getClientRects().length && (el.offsetWidth > 0 || el.offsetHeight > 0));
}

/** 폰트 크기를 1px 단계로 줄인다. 이미 최소값이면 false. */
function shrinkTextElement(el, minFontPx) {
  // 기존 1~2줄 피팅이 실패해 축소가 필요한 때만 성 경계를 사용한다.
  if (el.classList.contains('dp-lineup-name') && tryLineupSurnameBreaks(el)) return true;
  const current = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(current) || current <= minFontPx + 0.01) return false;
  const next = Math.max(minFontPx, current - TEXT_FIT_FONT_STEP_PX);
  if (next >= current) return false;
  el.style.fontSize = `${next}px`;
  return true;
}

/**
 * 3줄 분리 후보 라인 배열 계산.
 * 1) 하이픈 성 경계(예: "A. 메인틀런드-나일스")가 있으면 기존 방식대로 [이니셜/앞부분,
 *    첫 성, 둘째 성] 또는(앞부분에 공백이 없으면) [앞부분, 성] 2줄.
 * 2) 하이픈이 없어도 공백 2개 이상(3토큰 이상 — "후안 마누엘 보셀리"처럼 중간 이름이 있는
 *    경우)이면 공백 기준으로 최대 3줄 분리. 4토큰 이상인 드문 경우는 마지막 두 토큰을
 *    둘째/셋째 줄로 두고 나머지를 첫 줄에 몰아준다.
 * 둘 다 해당 없으면 null.
 */
function computeLineupSurnameBreakLines(raw) {
  const text = String(raw || '');
  const hyphenParts = text.split(/(?<=[가-힣])-(?=[가-힣])/);
  if (hyphenParts.length === 2 && hyphenParts.every(part => part.trim())) {
    const prefixEnd = hyphenParts[0].lastIndexOf(' ');
    return prefixEnd > 0
      ? [hyphenParts[0].slice(0, prefixEnd), hyphenParts[0].slice(prefixEnd + 1), hyphenParts[1]]
      : hyphenParts;
  }
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    const last = tokens[tokens.length - 1];
    const secondLast = tokens[tokens.length - 2];
    const rest = tokens.slice(0, -2).join(' ');
    return [rest, secondLast, last];
  }
  return null;
}

/** 폰트를 줄이기 직전에 (이니셜/중간 이름 등을 나눈) 최대 3줄을 시도한다. */
function tryLineupSurnameBreaks(nameEl) {
  if (nameEl.classList.contains('has-surname-breaks')) return false;
  const textEl = nameEl.querySelector('.dp-lineup-name-text[data-surname-breaks]');
  if (!textEl) return false;
  const lines = computeLineupSurnameBreakLines(textEl.dataset.surnameBreaks);
  if (!lines) return false;
  const candidate = getPreferredLineupSurnameCandidate(nameEl, lines);
  if (!candidate) return false;
  applyLineupCaptainBadgePlacement(nameEl, candidate.placement);
  applyLineupSurnameLines(nameEl, lines);
  nameEl.style.fontSize = `${candidate.font}px`;
  return true;
}

/** 이름을 지정된 줄별 span으로 다시 만들고 이전 고정 폭·단일 줄 스타일을 해제한다. */
function applyLineupSurnameLines(nameEl, lines) {
  const textEl = nameEl.querySelector('.dp-lineup-name-text');
  textEl.replaceChildren();
  lines.forEach((line, index) => {
    if (index) textEl.appendChild(document.createElement('br'));
    const segment = document.createElement('span');
    segment.className = 'dp-lineup-surname-part';
    segment.textContent = line;
    textEl.appendChild(segment);
  });
  nameEl.classList.add('has-surname-breaks');
  nameEl.style.whiteSpace = '';
  nameEl.style.display = '';
  nameEl.style.flexShrink = '';
  nameEl.style.maxWidth = '';
  nameEl.style.width = '';
}

/** 2줄/성 경계 줄바꿈 중 안전하게 표시 가능한 폰트가 큰 쪽. 동률이면 기본 2줄. */
function getPreferredLineupSurnameFont(nameEl, lines) {
  return getPreferredLineupSurnameCandidate(nameEl, lines)?.font ?? null;
}

/** 기본 줄바꿈보다 큰 폰트가 가능한 성 경계 줄바꿈·주장 배지 배치 후보만 반환한다. 개선이 없으면 null. */
function getPreferredLineupSurnameCandidate(nameEl, lines) {
  if (!canMeasureTextElement(nameEl)) return null;
  const wrap = getLineupNameWrap(nameEl) || nameEl.parentElement;
  const scope = nameEl.closest('.dp-lineup-vertical-pitch') || wrap;
  const labels = Array.from(scope.querySelectorAll('.dp-lineup-name'));
  const targets = getLineupNameNaturalWidthCollisionTargets(nameEl, labels);
  const twoLine = getCaptainPlacementCandidate(nameEl, null, targets);
  const surname = getCaptainPlacementCandidate(nameEl, lines, targets);
  if (surname.font === null || (twoLine.font !== null && surname.font <= twoLine.font)) return null;
  return surname;
}

/** 주장 배지를 앞·뒤에 놓은 경우의 안전한 폰트를 비교한다. 더 큰 쪽을 고르고 동률이면 앞 배치를 유지한다. */
function getCaptainPlacementCandidate(nameEl, lines, targets) {
  const prefixFont = measureLineupNameCandidateFont(nameEl, lines, targets);
  const suffixFont = measureLineupNameCandidateFont(
    nameEl,
    lines,
    targets,
    clone => moveLineupCaptainBadgeToLastToken(clone)
  );
  if (suffixFont !== null && (prefixFont === null || suffixFont > prefixFont)) {
    return { font: suffixFont, placement: 'suffix' };
  }
  return { font: prefixFont, placement: 'prefix' };
}

/** 주장 배지를 이름 접두부의 맨 앞으로 이동한다. 배지나 접두부가 없으면 아무 작업도 하지 않는다. */
function moveLineupCaptainBadgeToPrefix(nameEl) {
  const badge = nameEl.querySelector('.dp-lineup-captain-badge');
  if (!badge) return;
  const prefix = nameEl.querySelector('.dp-lineup-name-prefix');
  if (!prefix) return;
  prefix.insertBefore(badge, prefix.firstChild);
}

/** 주장 배지를 이름의 마지막 줄 토큰 뒤로 옮긴다. 줄별 토큰이 없으면 이름 텍스트 요소 끝에 붙인다. */
function moveLineupCaptainBadgeToLastToken(nameEl) {
  const badge = nameEl.querySelector('.dp-lineup-captain-badge');
  const textEl = nameEl.querySelector('.dp-lineup-name-text');
  if (!badge || !textEl) return;
  const prefix = badge.closest('.dp-lineup-name-prefix');
  if (prefix) prefix.removeChild(badge);
  const lastToken = textEl.querySelector('.dp-lineup-surname-part:last-of-type');
  (lastToken || textEl).appendChild(badge);
}

/** 후보의 suffix/prefix 값에 따라 주장 배지를 이름 뒤 또는 접두부로 이동한다. */
function applyLineupCaptainBadgePlacement(nameEl, placement) {
  if (placement === 'suffix') moveLineupCaptainBadgeToLastToken(nameEl);
  else moveLineupCaptainBadgeToPrefix(nameEl);
}

/**
 * 원본에 손대지 않고 각 후보의 최대 폰트를 피치 경계/라벨/원/배지 충돌까지 검사한다.
 * prepare(clone)을 넘기면 lines 적용 직후, 나머지 측정 준비 전에 클론만 추가로 변형할 수 있다
 * (예: resolveLineupCaptainBadgePlacement이 주장 완장 배지 위치를 바꿔서 비교할 때 사용).
 */
function measureLineupNameCandidateFont(nameEl, lines, targets, prepare, maxFont) {
  const wrap = getLineupNameWrap(nameEl) || nameEl.parentElement;
  const clone = nameEl.cloneNode(true);
  if (maxFont !== undefined) moveLineupCaptainBadgeToPrefix(clone);
  if (lines) applyLineupSurnameLines(clone, lines);
  else resetLineupSurnameBreaks(clone);
  if (typeof prepare === 'function') prepare(clone);
  clone.style.whiteSpace = '';
  clone.style.display = '';
  clone.style.flexShrink = '';
  clone.style.width = '';
  clone.style.position = 'absolute';
  clone.style.visibility = 'hidden';
  clone.style.pointerEvents = 'none';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.maxWidth = `${wrap.clientWidth}px`;
  wrap.appendChild(clone);
  try {
    let font = maxFont ?? parseFloat(getComputedStyle(nameEl).fontSize);
    if (!Number.isFinite(font)) return null;
    while (font >= LINEUP_NAME_MIN_FONT_PX) {
      clone.style.fontSize = `${font}px`;
      clone.style.width = '';
      if (canStayWithinLineupNameLayout(clone)) {
        lockLineupNameWidth(clone);
        const size = getDisplayLayoutRect(clone);
        const wrapRect = getDisplayLayoutRect(wrap);
        const centerX = wrapRect.left + wrapRect.width / 2;
        const candidate = {
          left: centerX - size.width / 2,
          right: centerX + size.width / 2,
          top: wrapRect.top,
          bottom: wrapRect.top + size.height,
        };
        const outsidePitch = hasLineupNamePitchOverflowForRect(candidate, nameEl, getLineupNamePitchPaddingPxForContext(nameEl));
        const overlaps = targets.some(target => canMeasureTextElement(target) && rectsOverlap(candidate, getDisplayLayoutRect(target)));
        if (!outsidePitch && !overlaps) return font;
      }
      const next = Math.max(LINEUP_NAME_MIN_FONT_PX, font - TEXT_FIT_FONT_STEP_PX);
      if (next === font) break;
      font = next;
    }
    return null;
  } finally {
    clone.remove();
  }
}

/** 등번호·이름의 강제 줄바꿈을 제거하고 원래 이름 텍스트를 복원한다. */
function resetLineupSurnameBreaks(nameEl) {
  if (nameEl.classList.contains('has-number-line-break')) {
    moveLineupCaptainBadgeToPrefix(nameEl);
    nameEl.querySelector('.dp-lineup-name-text').textContent = nameEl.dataset.numberLineOriginal;
    delete nameEl.dataset.numberLineOriginal;
    nameEl.querySelector('.dp-lineup-number-break')?.remove();
    nameEl.classList.remove('has-number-line-break', 'has-four-name-lines');
  }
  const textEl = nameEl.querySelector('.dp-lineup-name-text[data-surname-breaks]');
  if (textEl) textEl.textContent = stripKoreanSurnameBreaks(textEl.dataset.surnameBreaks);
  nameEl.classList.remove('has-surname-breaks');
}

/** 기존 피팅을 끝낸 뒤, 등번호를 독립된 첫 줄로 두면 폰트가 더 커질 때만 채택한다. */
function improveLineupNameWithNumberLine(nameEl, labels, maxFont) {
  if (!canMeasureTextElement(nameEl) || !nameEl.querySelector('.dp-lineup-name-num')) return;
  const currentFont = parseFloat(getComputedStyle(nameEl).fontSize);
  if (!Number.isFinite(maxFont) || currentFont >= maxFont) return;
  const textEl = nameEl.querySelector('.dp-lineup-name-text');
  if (!textEl) return;
  const nameText = textEl.cloneNode(true);
  nameText.querySelector('.dp-lineup-captain-badge')?.remove();
  const raw = textEl.dataset.surnameBreaks || nameText.textContent;
  const lines = computeLineupSurnameBreakLines(raw) || raw.trim().split(/\s+/);
  // 이름 자체가 2~3줄로 나뉘는 경우에만 번호 한 줄을 추가한다.
  if (lines.length < 2 || lines.length > 3) return;
  const targets = getLineupNameNaturalWidthCollisionTargets(nameEl, labels);
  const prepare = clone => applyLineupNumberLine(clone, lines);
  const font = measureLineupNameCandidateFont(nameEl, null, targets, prepare, maxFont);
  if (font === null || font <= currentFont) return;
  applyLineupNumberLine(nameEl, lines);
  nameEl.style.fontSize = `${font}px`;
  const wrap = getLineupNameWrap(nameEl) || nameEl.parentElement;
  nameEl.style.maxWidth = `${wrap.clientWidth}px`;
  lockLineupNameWidth(nameEl);
}

/** 등번호를 별도 첫 줄에 배치하고, 지정한 이름 줄과 마지막 토큰의 주장 배지를 적용한다. */
function applyLineupNumberLine(nameEl, lines) {
  const textEl = nameEl.querySelector('.dp-lineup-name-text');
  // 이름 끝에 있던 주장 배지가 텍스트 재구성 중 사라지지 않도록 잠시 옮긴다.
  moveLineupCaptainBadgeToPrefix(nameEl);
  nameEl.dataset.numberLineOriginal = stripKoreanSurnameBreaks(textEl.dataset.surnameBreaks || textEl.textContent);
  applyLineupSurnameLines(nameEl, lines);
  // 첫 줄에는 등번호만 표시하고 주장 배지는 이름 끝에 유지한다.
  moveLineupCaptainBadgeToLastToken(nameEl);
  const lineBreak = document.createElement('br');
  lineBreak.className = 'dp-lineup-number-break';
  textEl.before(lineBreak);
  nameEl.classList.add('has-number-line-break');
  nameEl.classList.toggle('has-four-name-lines', lines.length === 3);
}

/** Range API로 el 안 텍스트가 실제로 몇 개의 줄 사각형으로 렌더됐는지 읽어온다. */
function getTextLineRects(el) {
  if (!canMeasureTextElement(el) || !el.firstChild) return [];
  const range = document.createRange();
  try {
    range.selectNodeContents(el);
    return Array.from(range.getClientRects(), toDisplayLayoutRect).filter(rect => rect.width > 0 && rect.height > 0);
  } finally {
    range.detach && range.detach();
  }
}

/** getTextLineRects 결과를 세로 위치 기준으로 묶어 "줄" 단위 사각형 목록으로 합친다. */
function getMergedTextLines(el) {
  const rects = getTextLineRects(el)
    .sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const lines = [];

  rects.forEach(rect => {
    const centerY = rect.top + (rect.height / 2);
    const tolerance = Math.max(1, rect.height * 0.35);
    const line = lines.find(item => Math.abs(item.centerY - centerY) <= tolerance);
    if (!line) {
      lines.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        centerY,
      });
      return;
    }
    line.top = Math.min(line.top, rect.top);
    line.bottom = Math.max(line.bottom, rect.bottom);
    line.left = Math.min(line.left, rect.left);
    line.right = Math.max(line.right, rect.right);
    line.centerY = line.top + ((line.bottom - line.top) / 2);
  });

  return lines;
}

/** 렌더된 줄들 중 가장 넓은 줄의 픽셀 폭. */
function measureMaxTextLineWidth(el) {
  const rects = getMergedTextLines(el);
  let maxLineWidth = 0;
  rects.forEach(rect => {
    const width = rect.right - rect.left;
    if (width > maxLineWidth) maxLineWidth = width;
  });
  return maxLineWidth;
}

/** 좌우 padding + border 합 — 텍스트 폭에 더해 box 전체 너비를 구할 때 사용. */
function getHorizontalChromeWidth(el) {
  const styles = getComputedStyle(el);
  return ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
    .reduce((sum, key) => sum + (parseFloat(styles[key]) || 0), 0);
}

/** el의 width를 현재 렌더된 텍스트의 실제 폭(+여백)에 딱 맞춰 고정. */
function lockTextElementWidth(el, bufferPx = 1) {
  const maxLineWidth = measureMaxTextLineWidth(el);
  if (maxLineWidth > 0) {
    el.style.width = `${Math.ceil(maxLineWidth + getHorizontalChromeWidth(el) + bufferPx)}px`;
  }
}

/** 이름 라벨 width를 실제 텍스트 폭으로 고정 (폰트 축소 후 박스를 다시 줄일 때 사용). */
function lockLineupNameWidth(nameEl) {
  lockTextElementWidth(nameEl, 1);
}

/** 현재 클램프(기본 2줄, 복합 성 분리 시 3줄)의 높이를 넘지 않는지. */
function canStayWithinLineupNameClamp(nameEl) {
  return nameEl.scrollHeight <= nameEl.clientHeight + 0.5;
}

/** 주장 배지가 이름 텍스트와 별도 줄로 밀리면 클램프 높이 계산만으로는 잘림을 감지하지 못한다. */
function lineupCaptainBadgeSharesTextLine(nameEl) {
  const badge = nameEl.querySelector('.dp-lineup-captain-badge');
  const textEl = nameEl.querySelector(':scope > .dp-lineup-name-text');
  if (!badge || !canMeasureTextElement(textEl)) return true;
  const badgeRect = getDisplayLayoutRect(badge);
  return getMergedTextLines(textEl).some(line => (
    badgeRect.top < line.bottom - 0.5 && badgeRect.bottom > line.top + 0.5
  ));
}

// tryLineupNameNaturalSingleLine이 white-space:nowrap 1줄 모드로 확정한 라벨은 폭을 줄여도
// 줄바꿈이 일어나지 않아 scrollHeight가 절대 안 변한다 — canStayWithinLineupNameClamp가 항상
// true를 반환해, 실제로는 안 맞는 폭까지 깎여 overflow:hidden에 텍스트가 잘려 보이는 사고로
// 이어진다(예: "스티븐 안투네스" -> "스티"). nowrap 상태에서는 scrollWidth <= clientWidth로
// 실제 텍스트가 박스 안에 들어가는지 직접 검사한다.
/** 주장 배지가 이름과 같은 줄에 있고, 단일 줄 또는 줄 수 제한 내에서 가로 넘침 없이 표시되는지 검사한다. */
function canStayWithinLineupNameLayout(nameEl) {
  if (!lineupCaptainBadgeSharesTextLine(nameEl)) return false;
  if (getComputedStyle(nameEl).whiteSpace === 'nowrap') {
    return nameEl.scrollWidth <= nameEl.clientWidth + 0.5;
  }
  return canStayWithinLineupNameClamp(nameEl)
    && nameEl.scrollWidth <= nameEl.clientWidth + 0.5;
}

/** 실제로 렌더된 줄 수 (Range 기반, line-clamp 자체 줄 수가 아니라 실측치). */
function getRenderedTextLineCount(el) {
  const rects = getMergedTextLines(el);
  return rects.length || 1;
}

/** 팀칩 텍스트가 2줄 이내로 잘리지 않고 들어가는지 — fitTeamChip의 canFitFn으로 사용. */
function canStayWithinTwoTextLines(el) {
  return getRenderedTextLineCount(el) <= 2
    && el.scrollHeight <= el.clientHeight + 0.5
    && el.scrollWidth <= el.clientWidth + 0.5;
}

/** 이분탐색으로 el의 width를 canFitFn이 통과하는 한도 내 최소값까지 줄인다. */
function tightenTextElementWidth(el, minWidthPx, canFitFn) {
  if (!canMeasureTextElement(el) || typeof canFitFn !== 'function') return false;
  const currentWidth = Math.ceil(getDisplayLayoutRect(el).width);
  if (!Number.isFinite(currentWidth) || currentWidth <= minWidthPx) return false;

  let low = minWidthPx;
  let high = currentWidth;
  let best = currentWidth;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    el.style.width = `${mid}px`;
    if (canFitFn(el)) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  el.style.width = `${best}px`;
  return best < currentWidth;
}

/** 일반(작은 캠) 이름 라벨 폭 좁히기. */
function tightenLineupNameWidth(nameEl) {
  return tightenTextElementWidth(nameEl, LINEUP_NAME_MIN_WIDTH_PX, canStayWithinLineupNameLayout);
}

// 1단계(tryLineupNameNaturalSingleLine)가 nowrap 1줄로 확정해둔 라벨인지 판별.
/** 이름 라벨이 white-space:nowrap으로 자연스러운 한 줄 너비를 사용하는 상태인지 반환한다. */
function isLineupNameInNaturalSingleLineMode(nameEl) {
  return !!nameEl && getComputedStyle(nameEl).whiteSpace === 'nowrap';
}

// 폰트를 줄이기 전에 우선 시도: nowrap/inline-block/고정폭을 모두 풀어 2단계(설정 폰트
// 그대로 2줄 클램프)로 되돌린다. 폰트 크기를 유지하는 게 한 줄 유지보다 우선이기 때문에,
// 충돌 보정 루프에서 폭 좁히기가 실패하면 폰트 축소보다 이 복귀를 먼저 시도해야 한다.
/** 자연 한 줄 모드의 인라인 폭·줄바꿈 설정을 해제하고 기본 줄 수 제한에 맞춰 이름을 다시 보정한다. */
function revertLineupNameToClampMode(nameEl) {
  nameEl.style.maxWidth = '';
  nameEl.style.whiteSpace = '';
  nameEl.style.display = '';
  nameEl.style.flexShrink = '';
  nameEl.style.width = '';
  fitLineupNameSelf(nameEl);
}

/** 큰 캠(layout-big) 라인업 안의 이름 라벨인지 — 작은 캠과 보정 강도/하한선이 다르다. */
function isBigLineupName(nameEl) {
  return !!nameEl?.closest('.layout-big .lp-lineup');
}

/** 큰 캠 이름 라벨의 최소 폭 — wrap 폭의 58%, 단 30~44px 범위로 clamp. */
function getBigLineupNameMinWidthPx(nameEl) {
  const wrap = nameEl?.closest('.dp-lineup-name-wrap');
  const wrapWidth = wrap ? Math.floor(getDisplayLayoutRect(wrap).width) : 0;
  if (!Number.isFinite(wrapWidth) || wrapWidth <= 0) return LINEUP_NAME_MIN_WIDTH_PX;
  return Math.max(30, Math.min(LINEUP_NAME_MIN_WIDTH_PX, Math.floor(wrapWidth * 0.58)));
}

/** 큰 캠 이름 라벨 폭 좁히기 (최소 폭이 wrap 크기에 비례). */
function tightenBigLineupNameWidth(nameEl) {
  return tightenTextElementWidth(nameEl, getBigLineupNameMinWidthPx(nameEl), canStayWithinLineupNameLayout);
}

/** 자기 박스 안에서(2줄 클램프 기준) 넘치면 폰트를 줄이고, 끝나면 width를 텍스트에 맞게 고정. */
function fitLineupNameSelf(nameEl) {
  if (!canMeasureTextElement(nameEl) || !nameEl.firstChild) return;
  let safety = 0;
    while (safety < 16 && !canStayWithinLineupNameLayout(nameEl)) {
      if (!shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) break;
      safety += 1;
  }
  lockLineupNameWidth(nameEl);
}

/** 일반 이름 라벨 폰트 한 단계 축소 + 재고정. */
function shrinkLineupName(nameEl) {
  if (!shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) return false;
  fitLineupNameSelf(nameEl);
  return true;
}

/** 큰 캠 이름 라벨 폰트 한 단계 축소 + 재고정 + 폭 재타이트닝. */
function shrinkBigLineupName(nameEl) {
  if (!shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) return false;
  fitLineupNameSelf(nameEl);
  tightenBigLineupNameWidth(nameEl);
  return true;
}

/** 이름 라벨을 감싸는 위치 결정 wrap(.dp-lineup-name-wrap) 엘리먼트. */
function getLineupNameWrap(nameEl) {
  return nameEl?.closest('.dp-lineup-name-wrap') || null;
}

/** 이전 패스에서 줬던 마진 보정값(피치 경계 회피용)을 초기화. */
function resetLineupNameWrapOffset(nameEl) {
  const wrap = getLineupNameWrap(nameEl);
  if (!wrap) return;
  wrap.style.marginLeft = '';
  wrap.style.marginTop = '';
}

/** 이름 라벨이 피치 경계를 4방향으로 얼마나 넘어가는지(px). 안 넘으면 0. 측정 불가 시 null. */
function getLineupNamePitchOverflow(nameEl, paddingPx = LINEUP_NAME_PITCH_PADDING_PX) {
  const wrap = getLineupNameWrap(nameEl);
  const pitch = wrap?.closest('.dp-lineup-vertical-pitch');
  if (!wrap || !pitch || !canMeasureTextElement(nameEl) || !canMeasureTextElement(pitch)) return null;

  const wrapRect = getDisplayLayoutRect(nameEl);
  const pitchRect = getDisplayLayoutRect(pitch);
  return {
    left: Math.max(0, (pitchRect.left + paddingPx) - wrapRect.left),
    right: Math.max(0, wrapRect.right - (pitchRect.right - paddingPx)),
    top: Math.max(0, (pitchRect.top + paddingPx) - wrapRect.top),
    bottom: Math.max(0, wrapRect.bottom - (pitchRect.bottom - paddingPx)),
  };
}

/** 4방향 중 어느 쪽이든 피치 경계를 0.5px 넘게 넘어가면 true. */
function hasLineupNamePitchOverflow(nameEl, paddingPx = LINEUP_NAME_PITCH_PADDING_PX) {
  const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
  return !!(overflow && (overflow.left > 0.5 || overflow.right > 0.5 || overflow.top > 0.5 || overflow.bottom > 0.5));
}

/** 큰 캠은 더 넓은 피치 경계 패딩을 쓴다. */
function getLineupNamePitchPaddingPxForContext(nameEl) {
  return isBigLineupName(nameEl) ? BIG_LINEUP_NAME_PITCH_PADDING_PX : LINEUP_NAME_PITCH_PADDING_PX;
}

/** 위/아래로 피치 경계를 넘으면 wrap에 marginTop을 줘서 안쪽으로 밀어넣는다 (큰 캠 전용 보정). */
function nudgeLineupNameWrapVerticallyWithinPitch(nameEl, paddingPx = getLineupNamePitchPaddingPxForContext(nameEl)) {
  const wrap = getLineupNameWrap(nameEl);
  const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
  if (!wrap || !overflow) return false;

  let deltaY = 0;
  if (overflow.top > 0.5) deltaY += overflow.top + 1;
  if (overflow.bottom > 0.5) deltaY -= overflow.bottom + 1;
  if (Math.abs(deltaY) < 0.5) return false;

  const currentMarginTop = parseFloat(wrap.style.marginTop) || 0;
  wrap.style.marginTop = `${currentMarginTop + deltaY}px`;
  return true;
}

/** marginTop 보정이 더 이상 필요 없어졌으면(현재 크기로도 경계 안에 들어가면) 되돌린다. */
function relaxLineupNameWrapVerticalOffsetIfPossible(nameEl, paddingPx = getLineupNamePitchPaddingPxForContext(nameEl)) {
  const wrap = getLineupNameWrap(nameEl);
  if (!wrap) return false;

  const currentMarginTop = parseFloat(wrap.style.marginTop) || 0;
  if (Math.abs(currentMarginTop) < 0.5) return false;

  const previousMarginTop = wrap.style.marginTop;
  wrap.style.marginTop = '';
  const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
  const baselineFits = !!overflow && overflow.top <= 0.5 && overflow.bottom <= 0.5;
  if (baselineFits) return true;

  wrap.style.marginTop = previousMarginTop;
  return false;
}

/** 큰 캠/작은 캠에 맞는 폭 좁히기 함수를 골라 호출. */
function tightenLineupNameWidthForContext(nameEl) {
  return isBigLineupName(nameEl) ? tightenBigLineupNameWidth(nameEl) : tightenLineupNameWidth(nameEl);
}

/** 이름 라벨이 피치 경계를 넘으면 폭 좁히기 → 수직 nudge(큰 캠) → 폰트 축소 순으로 안에 들어올 때까지 보정. */
function fitLineupNameWithinPitchBounds(nameEl) {
  if (!canMeasureTextElement(nameEl)) return false;

  const paddingPx = getLineupNamePitchPaddingPxForContext(nameEl);
  let changed = false;
  let safety = 0;
    while (safety < 16 && hasLineupNamePitchOverflow(nameEl, paddingPx)) {
      const overflow = getLineupNamePitchOverflow(nameEl, paddingPx);
      const horizontalOverflow = overflow && (overflow.left > 0.5 || overflow.right > 0.5);
      const verticalOverflow = overflow && (overflow.top > 0.5 || overflow.bottom > 0.5);

    if (horizontalOverflow && tightenLineupNameWidthForContext(nameEl)) {
      changed = true;
      safety += 1;
      continue;
    }

    if (verticalOverflow && isBigLineupName(nameEl) && nudgeLineupNameWrapVerticallyWithinPitch(nameEl, paddingPx)) {
      changed = true;
      safety += 1;
      continue;
    }

    if (!shrinkLineupName(nameEl)) break;
    changed = true;
    safety += 1;
  }

  // 큰 화면에서 하단 GK 라벨이 두 줄→한 줄로 줄어든 뒤에도 이전의 위쪽 보정값이 남아
  // 얼굴 위로 말려 올라오지 않게, 현재 크기에서 기본 위치가 다시 가능하면 되돌린다.
  if (isBigLineupName(nameEl) && relaxLineupNameWrapVerticalOffsetIfPossible(nameEl, paddingPx)) {
    changed = true;
  }

  return changed;
}

/** 두 라벨(또는 wrap)의 bounding rect가 실제로 겹치는지 (1px 여유). */
function wrapsOverlap(leftWrap, rightWrap) {
  const leftRect = getDisplayLayoutRect(leftWrap);
  const rightRect = getDisplayLayoutRect(rightWrap);
  return leftRect.left < rightRect.right - 1
    && leftRect.right > rightRect.left + 1
    && leftRect.top < rightRect.bottom - 1
    && leftRect.bottom > rightRect.top + 1;
}

/** 겹치는 두 라벨 중 먼저 줄여야 할 쪽 — 더 넓은 쪽, 동률이면 텍스트 더 긴 쪽, 그래도 같으면 더 아래쪽. */
function chooseWrapToShrink(leftWrap, rightWrap) {
  const leftRect = getDisplayLayoutRect(leftWrap);
  const rightRect = getDisplayLayoutRect(rightWrap);
  if (Math.abs(leftRect.width - rightRect.width) > 1) {
    return leftRect.width > rightRect.width ? leftWrap : rightWrap;
  }

  const leftName = leftWrap.matches?.('.dp-lineup-name') ? leftWrap : leftWrap.querySelector('.dp-lineup-name');
  const rightName = rightWrap.matches?.('.dp-lineup-name') ? rightWrap : rightWrap.querySelector('.dp-lineup-name');
  const leftLen = String(leftName?.textContent || '').trim().length;
  const rightLen = String(rightName?.textContent || '').trim().length;
  if (leftLen !== rightLen) return leftLen > rightLen ? leftWrap : rightWrap;

  return leftRect.top > rightRect.top ? leftWrap : rightWrap;
}

/**
 * 큰 캠 라인업 축소 시에만 추가로 도는 보정 패스.
 * 기본 pill 로직이 끝난 뒤에도 남는 충돌만 대상으로 폭 축소 → 폰트 축소 순서로 한 번 더 정리한다.
 */
function fitResidualBigLineupNameCollisions(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (bigLabels.length < 2) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (let i = 0; i < bigLabels.length; i += 1) {
      for (let j = i + 1; j < bigLabels.length; j += 1) {
        const leftEl = bigLabels[i];
        const rightEl = bigLabels[j];
        if (!canMeasureTextElement(leftEl) || !canMeasureTextElement(rightEl)) continue;
        if (!wrapsOverlap(leftEl, rightEl)) continue;

        const primaryEl = chooseWrapToShrink(leftEl, rightEl);
        const secondaryEl = primaryEl === leftEl ? rightEl : leftEl;

        if ((primaryEl && tightenBigLineupNameWidth(primaryEl))
          || (secondaryEl && tightenBigLineupNameWidth(secondaryEl))) {
          changed = true;
          break;
        }

        if ((primaryEl && shrinkBigLineupName(primaryEl))
          || (secondaryEl && shrinkBigLineupName(secondaryEl))) {
          changed = true;
          break;
        }
      }
      if (changed) break;
    }

    if (!changed) break;
    pass += 1;
  }
}

/** 이름 라벨이 홈/원정 어느 쪽인지 — wrap의 is-home/is-away 클래스로 판별. */
function getLineupNameSide(nameEl) {
  const wrap = getLineupNameWrap(nameEl);
  if (!wrap) return '';
  if (wrap.classList.contains('is-home')) return 'home';
  if (wrap.classList.contains('is-away')) return 'away';
  return '';
}

/** 상대팀 노드의 배지/평점 — 충돌 검사 시 "양보하면 안 되는" 우선순위 대상. */
function getOpposingLineupBadgeTargets(nameEl) {
  const side = getLineupNameSide(nameEl);
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!side || !pitch) return [];

  const opposingSide = side === 'home' ? 'away' : 'home';
  return Array.from(
    pitch.querySelectorAll(`.dp-lineup-node.is-${opposingSide} .dp-node-badge, .dp-lineup-node.is-${opposingSide} .dp-node-rating`)
  ).filter(target => canMeasureTextElement(target));
}

/** 교체/어시스트 배지처럼 이름 라벨이 절대 가리면 안 되는 우선순위 배지들. */
function getPriorityLineupBadgeTargets(nameEl) {
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!pitch) return [];

  return Array.from(
    pitch.querySelectorAll('.dp-node-sub-in, .dp-node-sub-out, .dp-node-assist')
  ).filter(target => canMeasureTextElement(target));
}

/** 같은 피치 안 양 팀 팀칩(이름/입력버튼) — 충돌 검사 대상. */
function getTeamChipTargetsForLineupName(nameEl) {
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!pitch) return [];

  return Array.from(
    pitch.querySelectorAll('.dp-lineup-team-main, .dp-lineup-team-chip .dp-side-edit-btn')
  ).filter(target => canMeasureTextElement(target));
}

/** 자기 팀 팀칩만 — getTeamChipTargetsForLineupName과 달리 side로 필터링. */
function getOwnTeamChipTargetsForLineupName(nameEl) {
  const side = getLineupNameSide(nameEl);
  const pitch = nameEl?.closest('.dp-lineup-vertical-pitch');
  if (!side || !pitch) return [];

  return Array.from(
    pitch.querySelectorAll(`.dp-lineup-team-chip.is-${side} .dp-lineup-team-main, .dp-lineup-team-chip.is-${side} .dp-side-edit-btn`)
  ).filter(target => canMeasureTextElement(target));
}

// 동일 피치 안에서 이 라벨의 선수를 제외한 나머지 선수 원(node 자체)을 반환한다.
// name-wrap과 node는 동일한 data-player-id를 가지므로 이것으로 자기 원을 구분한다.
/** 같은 피치에서 충돌을 검사할 다른 선수 원들을 모은다. 본인은 ID로, ID 0이면 원래 이름·진영으로 제외한다. */
function getSiblingNodeCirclesForLabel(nameEl) {
  const nameWrap = getLineupNameWrap(nameEl);
  const playerId = nameWrap?.dataset?.playerId;
  const playerOrigName = nameWrap?.dataset?.playerOrigName || '';
  const playerSide = getLineupNameSide(nameEl);
  const pitch = nameWrap?.closest('.dp-lineup-vertical-pitch');
  if (!pitch) return [];

  return Array.from(pitch.querySelectorAll('.dp-lineup-node'))
    .filter(node => {
      if (!canMeasureTextElement(node)) return false;
      if (playerId && playerId !== '0' && node.dataset.playerId === playerId) return false;
      if (playerId === '0' && playerOrigName && node.dataset.playerId === '0') {
        const nodeSide = node.classList.contains('is-home')
          ? 'home'
          : node.classList.contains('is-away') ? 'away' : '';
        if (node.dataset.playerOrigName === playerOrigName
          && (!playerSide || !nodeSide || nodeSide === playerSide)) {
          return false;
        }
      }
      return true;
    });
}

/** badgeTargets와 겹치는 동안 큰 캠 라벨을 (폰트 축소 → 폭 축소 순으로) 반복 보정. */
function shrinkBigLineupNameForBadgeCollision(nameEl, badgeTargets) {
  let changed = false;
  let safety = 0;

  while (safety < 12
    && canMeasureTextElement(nameEl)
    && Array.isArray(badgeTargets)
    && badgeTargets.length
    && elementOverlapsAny(nameEl, badgeTargets)) {
    if (shrinkBigLineupName(nameEl)) {
      fitLineupNameWithinPitchBounds(nameEl);
      changed = true;
      safety += 1;
      continue;
    }

    if (tightenBigLineupNameWidth(nameEl)) {
      fitLineupNameWithinPitchBounds(nameEl);
      changed = true;
      safety += 1;
      continue;
    }

    break;
  }

  return changed;
}

/** 큰 캠 잔여 보정: 이름 라벨이 교체/어시 우선순위 배지를 가리면 라벨을 줄인다. */
function fitBigLineupNameAgainstPriorityBadges(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const badgeTargets = getPriorityLineupBadgeTargets(nameEl);
      if (!badgeTargets.length) continue;
      if (!elementOverlapsAny(nameEl, badgeTargets)) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, badgeTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

/** 큰 캠 잔여 보정: 다른 이름 라벨과 겹치는 라벨을 줄인다. */
function fitBigLineupNameAgainstOtherLabels(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const labelTargets = labels.filter(target => target !== nameEl && canMeasureTextElement(target));
      if (!labelTargets.length) continue;
      if (!elementOverlapsAny(nameEl, labelTargets)) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, labelTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

/** 큰 캠 잔여 보정: 이름 라벨이 (상대팀) 팀칩과 겹치면 줄인다. 자기 팀칩과의 충돌은 팀칩 쪽이 양보. */
function fitBigLineupNameAgainstTeamChips(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const chipTargets = getTeamChipTargetsForLineupName(nameEl);
      if (!chipTargets.length) continue;
      if (!elementOverlapsAny(nameEl, chipTargets)) continue;

      const ownChipTargets = getOwnTeamChipTargetsForLineupName(nameEl);
      const foreignChipTargets = chipTargets.filter(target => !ownChipTargets.includes(target));
      const overlapsOwnChipOnly = elementOverlapsAny(nameEl, ownChipTargets)
        && !elementOverlapsAny(nameEl, foreignChipTargets);
      // 자기 팀 칩과의 충돌은 이름을 올리거나 줄이지 말고,
      // 마지막 team-chip fitting 패스가 칩 쪽을 가장자리로 물리도록 맡긴다.
      // 특히 하단 원정 GK는 이 편이 라벨 기준선을 안정적으로 지킨다.
      if (overlapsOwnChipOnly) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, chipTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

/** 큰 캠 잔여 보정: 이름 라벨이 상대팀 노드의 배지/평점을 가리면 줄인다. */
function fitBigLineupNameAgainstOpposingBadges(labels) {
  const bigLabels = labels.filter(nameEl => isBigLineupName(nameEl) && canMeasureTextElement(nameEl));
  if (!bigLabels.length) return;

  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (const nameEl of bigLabels) {
      if (!canMeasureTextElement(nameEl)) continue;
      const badgeTargets = getOpposingLineupBadgeTargets(nameEl);
      if (!badgeTargets.length) continue;
      if (!elementOverlapsAny(nameEl, badgeTargets)) continue;

      if (shrinkBigLineupNameForBadgeCollision(nameEl, badgeTargets)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
    pass += 1;
  }
}

// 이름 라벨이 다른 선수의 바둑알(원) 자체와 겹칠 때 감지·보정한다.
// 기존 시스템이 라벨-라벨, 라벨-배지만 감지하고 라벨-원은 놓치던 gap을 메운다.
//
// 판정 기준: 이름 pill의 "텍스트 실제 표시 영역"이 바둑알(원)과 실제로 겹쳐야만 발동한다.
//   - pill 좌우 패딩(6px) + 상하 패딩(2px)을 뺀 텍스트 내부 rect 사용
//   - 원의 border-radius:50% 코너 빈 공간은 실제 원-사각형 충돌 알고리즘으로 제외
//     (중심점에서 텍스트 rect 최근접점까지의 거리 < 반지름 → 실제 겹침)
//   - AABB만 쓰면 코너 투명 공간 때문에 false positive가 발생하므로 이 방식이 정확함
/** 이름의 패딩을 뺀 텍스트 영역이 다른 선수 원의 반지름 절반 안쪽까지 침범하는지 판정한다. */
function nameOverlapsNodeCircleSignificantly(nameEl, nodeEl) {
  if (!canMeasureTextElement(nameEl) || !canMeasureTextElement(nodeEl)) return false;
  const nr = getDisplayLayoutRect(nameEl);
  const cr = getDisplayLayoutRect(nodeEl);
  // pill 패딩 제외한 텍스트 표시 영역
  const tL = nr.left + 6, tR = nr.right - 6;
  const tT = nr.top + 2,  tB = nr.bottom - 2;
  if (tR <= tL + 0.5 || tB <= tT + 0.5) return false;
  // 바둑알 중심 + 반지름 (getBoundingClientRect는 transform 적용 후 뷰포트 좌표)
  const cX = (cr.left + cr.right) / 2;
  const cY = (cr.top + cr.bottom) / 2;
  const radius = (cr.right - cr.left) / 2;
  // 텍스트 rect에서 원 중심까지의 최단 거리 (원-사각형 충돌 표준 알고리즘)
  const nearX = Math.max(tL, Math.min(cX, tR));
  const nearY = Math.max(tT, Math.min(cY, tB));
  const dist = Math.sqrt((cX - nearX) ** 2 + (cY - nearY) ** 2);
  // 원 반지름의 50% 이내까지 들어왔을 때만 발동.
  // 라벨 테두리나 바둑알 테두리가 아주 살짝 닿는 수준은 무시하고,
  // 이름 텍스트가 바둑알 안쪽 중심부에 확실히 겹칠 때만 축소한다.
  return dist < radius * 0.5;
}

/** circles 중 하나라도 nameEl과 의미 있게 겹치면 true. */
function nameOverlapsAnyNodeCircle(nameEl, circles) {
  return circles.some(node => nameOverlapsNodeCircleSignificantly(nameEl, node));
}

/** 다른 선수 원과 겹치는 라벨을 폰트→폭→(큰 캠만) 수직 nudge 순으로 보정. 기존 패스가 놓친 gap 보완용. */
function fitLineupNamesAgainstNodeCircles(labels) {
  labels.forEach(nameEl => {
    if (!canMeasureTextElement(nameEl)) return;
    const circles = getSiblingNodeCirclesForLabel(nameEl);
    if (!circles.length || !nameOverlapsAnyNodeCircle(nameEl, circles)) return;

    let safety = 0;
    while (safety < 8 && canMeasureTextElement(nameEl) && nameOverlapsAnyNodeCircle(nameEl, circles)) {
      if (shrinkTextElement(nameEl, LINEUP_NAME_MIN_FONT_PX)) {
        fitLineupNameSelf(nameEl);
        fitLineupNameWithinPitchBounds(nameEl);
        safety++;
        continue;
      }
      if (tightenLineupNameWidthForContext(nameEl)) {
        fitLineupNameWithinPitchBounds(nameEl);
        safety++;
        continue;
      }
      // 위 두 방법이 모두 한계에 달하면 큰 캠에서만 수직 nudge를 마지막 수단으로 사용.
      if (isBigLineupName(nameEl)) nudgeLineupNameWrapVerticallyWithinPitch(nameEl);
      break;
    }
  });
}

/**
 * 벤치 패널 하단 감독 이름(홈/원정 두 칸이 한 줄을 나눠 씀) 텍스트가 넘치면 폰트를 점진 축소.
 *
 * 주심/대회/경기장/킥오프는 더 이상 이 폭 좁은 다단 레이아웃을 쓰지 않는다 — 캠 큰 메뉴
 * 경기 정보 패널과 동일하게 .dp-bench-info 안에서 한 줄씩(.mi-row/.mi-value) 표시되고,
 * .mi-value 자체가 CSS로 overflow:hidden + text-overflow:ellipsis를 처리하므로
 * (css/panels/bench-injury.css: .dp-bench-info .mi-value) 별도의 JS 폰트 축소가 필요 없다.
 */
function fitBenchFooterNames(root) {
  const scope = root || document;
  scope.querySelectorAll('.dp-bench-footer .dp-coach-name').forEach(nameEl => {
    if (!nameEl || nameEl.classList.contains('dp-coach-editing')) return;
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;

    let safety = 0;
    while (safety < 12) {
      const overflow = nameEl.scrollWidth > nameEl.clientWidth + 0.5;
      if (!overflow) break;
      if (!shrinkTextElement(nameEl, BENCH_FOOTER_MIN_FONT_PX)) break;
      safety += 1;
    }
  });
}

// ─── 벤치/부상 패널 높이 균형 ────────────────────────────────────────────
// 벤치 패널과 부상자 패널은 같은 컬럼을 나눠 쓰는데, 한쪽 명단이 짧으면 그만큼 남는 공간을
// 다른 쪽이 넘칠 때 빌려 쓸 수 있도록 flex-basis(height)를 동적으로 재배분한다.

/** margin까지 포함한 엘리먼트 바깥쪽 전체 높이. */
function getPanelOuterHeight(el) {
  if (!el) return 0;
  const style = getComputedStyle(el);
  return getDisplayLayoutRect(el).height
    + (parseFloat(style.marginTop) || 0)
    + (parseFloat(style.marginBottom) || 0);
}

/** 상하 padding 합. */
function getPanelPaddingY(el) {
  if (!el) return 0;
  const style = getComputedStyle(el);
  return (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
}

/** 리스트 안 실제 항목들이 차지하는 콘텐츠 높이(스크롤 유무 무관하게 실측). */
function getListContentHeight(list) {
  if (!list) return 0;
  const style = getComputedStyle(list);
  const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const children = Array.from(list.children);
  if (!children.length) return paddingY;
  const listRect = getDisplayLayoutRect(list);
  const measuredBottom = children.reduce((maxBottom, child) => (
    Math.max(
      maxBottom,
      (getDisplayLayoutRect(child).bottom - listRect.top) + list.scrollTop
    )
  ), 0);
  return Math.max(paddingY, measuredBottom + (parseFloat(style.paddingBottom) || 0));
}

/** 패널 안 dp-split의 양쪽 컬럼 중 더 긴 쪽 기준 — 헤더+콘텐츠를 다 보여주려면 필요한 최소 높이. */
function getPanelSplitMinHeight(splitEl) {
  if (!splitEl) return 0;
  const columns = Array.from(splitEl.children).filter(child => child.classList.contains('dp-col'));
  if (!columns.length) return 0;

  return Math.max(...columns.map(column => {
    const header = column.querySelector('.dp-side-header');
    const list = column.querySelector('.dp-list');
    return getPanelOuterHeight(header) + getListContentHeight(list);
  }));
}

/** 패널의 현재 높이 대비 필요 높이 — spare(남는 만큼)/deficit(모자란 만큼)로 환산. */
function getPanelSplitMetrics(panel) {
  const split = panel?.querySelector('.dp-split');
  if (!split) return { current: 0, required: 0, spare: 0, deficit: 0 };
  const current = getDisplayLayoutRect(split).height;
  const required = getPanelSplitMinHeight(split);
  return {
    current,
    required,
    spare: Math.max(0, current - required),
    deficit: Math.max(0, required - current),
  };
}

/** 패널 전체 높이 중 dp-split을 제외한 나머지(타이틀 등 chrome) 높이. */
function getPanelChromeHeight(panel) {
  if (!panel) return 0;
  const split = panel.querySelector('.dp-split');
  const panelHeight = getDisplayLayoutRect(panel).height;
  const splitHeight = split ? getDisplayLayoutRect(split).height : 0;
  return Math.max(0, panelHeight - splitHeight);
}

/** 벤치/부상 패널 높이 균형 계산에 필요한 DOM 참조 묶음. */
function getBenchPanelSections() {
  const benchPanel = document.getElementById('benchPanel');
  const injuryPanel = document.getElementById('injuryPanel');
  const benchSection = benchPanel?.closest('.lp-bench') || null;
  const injurySection = injuryPanel?.closest('.lp-injury') || null;
  const benchColumn = benchSection?.closest('.lp-col-bench') || null;
  return { benchPanel, injuryPanel, benchSection, injurySection, benchColumn };
}

/** 이전에 준 flex/height 강제값을 지워 기본(CSS) 비율로 되돌린다. */
function resetBenchInjuryPanelHeights() {
  const { benchSection, injurySection } = getBenchPanelSections();
  if (benchSection) {
    benchSection.style.flex = '';
    benchSection.style.height = '';
  }
  if (injurySection) {
    injurySection.style.flex = '';
    injurySection.style.height = '';
  }
}

/**
 * 벤치/부상 패널 중 한쪽이 모자라고 다른 쪽이 남으면 height를 옮겨 균형을 맞춘다.
 * 이 함수가 두 패널 "사이" 공간을 먼저 정리한 뒤, 마지막에 항상(중간의 어느 return 경로를
 * 타든) #benchPanel "안"의 후보명단/정보 블록 공간을 재분배(lpBenchPanelRebalanceInfoSpace,
 * js/lineup/lineup-render.js)한다 — 순서가 바뀌면 그 함수가 먼저 .dp-split을 줄여버려
 * 여기서 "벤치가 여유있다"고 오판하게 된다. 얇은 wrapper로 분리해 아래 로직의 여러 early
 * return을 건드리지 않고도 항상 호출을 보장한다.
 */
function balanceBenchInjuryPanelHeights() {
  let manualHeight = false;
  try {
    manualHeight = typeof applySmallBenchHeightOverride === 'function' && applySmallBenchHeightOverride();
    if (!manualHeight) balanceBenchInjuryPanelHeightsImpl();
  } finally {
    if (typeof lpBenchPanelRebalanceInfoSpace === 'function') {
      const benchPanel = document.getElementById('benchPanel');
      lpBenchPanelRebalanceInfoSpace(benchPanel);
      // 수동 분할에서는 목록이 넘치면 스크롤한다. 자동 높이 회수가 드래그를 되돌리면 안 된다.
      if (!manualHeight) reclaimBenchListOverflowHeight(benchPanel);
    }
    if (typeof updateSmallBenchHeightHandle === 'function') updateSmallBenchHeightHandle();
  }
}

/** 실제 교체 목록이 아직 스크롤되면 미출전 패널에서 초과 높이만 회수한다. */
function reclaimBenchListOverflowHeight(benchPanel) {
  if (!benchPanel) return;
  const { injuryPanel, injurySection } = getBenchPanelSections();
  const lists = Array.from(benchPanel.querySelectorAll('.dp-list'));
  const overflow = Math.max(0, ...lists.map(list => list.scrollHeight - list.clientHeight));
  if (overflow <= DETAIL_PANEL_BALANCE_EPSILON_PX || !injuryPanel || !injurySection) return;

  const injuryRect = getDisplayLayoutRect(injurySection);
  const injuryMinimum = getPanelChromeHeight(injuryPanel) + DETAIL_PANEL_BALANCE_EPSILON_PX;
  const available = Math.max(0, injuryRect.height - injuryMinimum);
  const transfer = Math.min(Math.ceil(overflow), Math.floor(available));
  if (transfer <= DETAIL_PANEL_BALANCE_EPSILON_PX) return;

  const benchSection = benchPanel.closest('.lp-bench');
  if (!benchSection) return;
  const nextBenchHeight = getDisplayLayoutRect(benchSection).height + transfer;
  const nextInjuryHeight = injuryRect.height - transfer;
  benchSection.style.flex = `0 0 ${nextBenchHeight}px`;
  benchSection.style.height = `${nextBenchHeight}px`;
  injurySection.style.flex = `0 0 ${nextInjuryHeight}px`;
  injurySection.style.height = `${nextInjuryHeight}px`;
}

/** 기본 배치에서 교체 명단의 부족한 높이를 측정해 미출전 패널에서 공간을 가져오고 양쪽 높이를 고정한다. */
function balanceBenchInjuryPanelHeightsImpl() {
  // 1) 이전 높이 보정을 지우고 활성 페이지의 실제 패널 크기를 측정한다.
  const {
    benchPanel,
    injuryPanel,
    benchSection,
    injurySection,
    benchColumn,
  } = getBenchPanelSections();

  if (!benchPanel || !injuryPanel || !benchSection || !injurySection || !benchColumn) return;

  resetBenchInjuryPanelHeights();

  const page = benchColumn.closest('.page');
  if (page && !page.classList.contains('active')) return;

  const benchRect = getDisplayLayoutRect(benchSection);
  const injuryRect = getDisplayLayoutRect(injurySection);
  if (benchRect.height <= DETAIL_PANEL_BALANCE_EPSILON_PX
    || injuryRect.height <= DETAIL_PANEL_BALANCE_EPSILON_PX) {
    return;
  }

  // 2) 콘텐츠 기준 여유·부족 높이를 비교한다. 교체 명단이 부족할 때만 공간을 이동한다.
  const benchMetrics = getPanelSplitMetrics(benchPanel);
  const injuryMetrics = getPanelSplitMetrics(injuryPanel);
  let transferTarget = null;
  let sourceSpare = 0;
  let targetDeficit = 0;

  // 미출전 명단은 부족한 높이를 자체 스크롤로 처리한다. 교체 명단이 잘리지 않도록
  // 교체 명단이 부족할 때만 미출전 패널의 여유 공간을 가져온다.
  if (benchMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && injuryMetrics.spare > DETAIL_PANEL_BALANCE_EPSILON_PX) {
    transferTarget = 'bench';
    sourceSpare = injuryMetrics.spare;
    targetDeficit = benchMetrics.deficit;
  } else if (benchMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && injuryMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX) {
    // 3-a) 양쪽 모두 부족하면 미출전 패널의 제목 등 최소 영역만 남기고 교체 명단에 우선 배분한다.
    const minInjuryHeight = getPanelChromeHeight(injuryPanel) + DETAIL_PANEL_BALANCE_EPSILON_PX;
    const maxTransferFromInjury = Math.max(0, injuryRect.height - minInjuryHeight);
    const transfer = Math.min(
      Math.floor(maxTransferFromInjury),
      Math.ceil(benchMetrics.deficit)
    );
    if (transfer <= DETAIL_PANEL_BALANCE_EPSILON_PX) return;

    const nextBenchHeight = benchRect.height + transfer;
    const nextInjuryHeight = injuryRect.height - transfer;

    benchSection.style.flex = `0 0 ${nextBenchHeight}px`;
    benchSection.style.height = `${nextBenchHeight}px`;
    injurySection.style.flex = `0 0 ${nextInjuryHeight}px`;
    injurySection.style.height = `${nextInjuryHeight}px`;
    return;
  } else {
    return;
  }

  // 3-b) 미출전 패널에 여유가 있으면 그 여유와 교체 명단의 부족분 중 작은 만큼만 옮긴다.
  const transfer = Math.min(
    Math.floor(sourceSpare),
    Math.ceil(targetDeficit)
  );
  if (transfer <= DETAIL_PANEL_BALANCE_EPSILON_PX) return;

  // 4) 두 패널의 합계 높이는 유지하면서 flex 기준 크기와 명시적 높이를 함께 갱신한다.
  const nextBenchHeight = transferTarget === 'bench'
    ? benchRect.height + transfer
    : benchRect.height - transfer;
  const nextInjuryHeight = transferTarget === 'injury'
    ? injuryRect.height + transfer
    : injuryRect.height - transfer;

  benchSection.style.flex = `0 0 ${nextBenchHeight}px`;
  benchSection.style.height = `${nextBenchHeight}px`;
  injurySection.style.flex = `0 0 ${nextInjuryHeight}px`;
  injurySection.style.height = `${nextInjuryHeight}px`;
}

/** balanceBenchInjuryPanelHeights를 다음 frame에 한 번만 호출 (rAF로 디바운스). */
function scheduleBenchInjuryPanelBalance() {
  if (detailBenchBalanceRaf) cancelAnimationFrame(detailBenchBalanceRaf);
  detailBenchBalanceRaf = requestAnimationFrame(() => {
    detailBenchBalanceRaf = 0;
    balanceBenchInjuryPanelHeights();
  });
}

/** 벤치 컬럼 크기 변화를 감지해 높이 균형을 자동 재계산하는 ResizeObserver 등록(1회). */
function initBenchInjuryPanelObserver() {
  if (detailBenchResizeObserver || !window.ResizeObserver) return;
  const { benchColumn } = getBenchPanelSections();
  if (!benchColumn) return;

  detailBenchResizeObserver = new ResizeObserver(() => {
    scheduleBenchInjuryPanelBalance();
  });
  detailBenchResizeObserver.observe(benchColumn);
}

/** subjectEl이 targets 중 하나와 겹치면 true. */
function elementOverlapsAny(subjectEl, targets) {
  if (!canMeasureTextElement(subjectEl) || !Array.isArray(targets) || !targets.length) return false;
  return targets.some(target => canMeasureTextElement(target) && wrapsOverlap(subjectEl, target));
}

/**
 * nameEl의 자연 1줄 폭 시도용 충돌 대상 — 같은 피치의 다른 이름 라벨 + 원(circle) +
 * 팀칩 + 우선순위/상대팀 배지. 기존 충돌 보정 패스들이 이미 쓰는 타겟 수집 함수를 그대로
 * 재사용해 새 동작이 기존 로직과 다른 기준으로 판정하지 않도록 한다.
 */
function getLineupNameNaturalWidthCollisionTargets(nameEl, labels) {
  return [
    ...labels.filter(other => other !== nameEl),
    ...getSiblingNodeCirclesForLabel(nameEl),
    ...getTeamChipTargetsForLineupName(nameEl),
    ...getPriorityLineupBadgeTargets(nameEl),
    ...getOpposingLineupBadgeTargets(nameEl),
  ];
}

/**
 * 주장 완장 배지(.dp-lineup-captain-badge) 위치를 두 후보 중 이름이 더 큰 폰트로 표시되는
 * 쪽으로 확정한다 — (A) 기본 렌더 순서인 "등번호 왼쪽"(완장→번호→이름) vs (B) 완장을
 * 맨 끝(번호→이름→완장)으로 옮긴 경우, measureLineupNameCandidateFont로 각각의 최대 허용
 * 폰트를 재서 비교. 완장이 없는 라벨은 그대로 둔다. 다른 fit 단계가 시작되기 전, 라벨이
 * 아직 기본 렌더 상태일 때 한 번만 호출한다(fitLineupNamePills 맨 앞).
 */
function resolveLineupCaptainBadgePlacement(nameEl, labels) {
  const badge = nameEl.querySelector('.dp-lineup-captain-badge');
  if (!badge || !canMeasureTextElement(nameEl)) return;
  moveLineupCaptainBadgeToPrefix(nameEl);

  // 이 fit 호출이 라벨을 새로 렌더한 직후가 아니라 리사이즈 등으로 같은 DOM에 재실행되는
  // 경우, 배지가 이미 지난 판정으로 "끝"에 가 있을 수 있다 — 매번 "왼쪽" 기준선으로 되돌린
  // 뒤 두 후보를 비교해야 나중에 조건이 바뀌었을 때 다시 "왼쪽"으로도 돌아올 수 있다.
  if (nameEl.firstChild !== badge) nameEl.insertBefore(badge, nameEl.firstChild);

  const targets = getLineupNameNaturalWidthCollisionTargets(nameEl, labels);
  const candidate = getCaptainPlacementCandidate(nameEl, null, targets);
  applyLineupCaptainBadgePlacement(nameEl, candidate.placement);
}

/** 두 DOMRect가 실제로 겹치는지 (1px 여유). wrapsOverlap과 동일 기준, 가상 rect에도 사용 가능. */
function rectsOverlap(rectA, rectB) {
  return rectA.left < rectB.right - 1
    && rectA.right > rectB.left + 1
    && rectA.top < rectB.bottom - 1
    && rectA.bottom > rectB.top + 1;
}

/**
 * nameEl은 전혀 건드리지 않고, 같은 부모에 임시로 붙인 복제본에서만 "한 줄로 폈을 때"의
 * 자연 폭/높이를 측정한다. .dp-lineup-name은 -webkit-box+line-clamp 레이아웃인데, 원본을
 * 직접 mutate(inline-block 등으로 토글)했다가 되돌리는 방식은 그 라운드트립 자체가 실패한
 * 뒤에도 이어지는 fitLineupNameSelf의 측정에 영향을 주는 부작용이 있었다(서브픽셀/내부
 * line-clamp 상태 오염으로 추정). 복제본에서만 측정하면 실패 시 원본은 처음 상태 그대로
 * 남아있어 기존(이 기능 추가 전) 동작과 완전히 동일하게 폴백된다.
 */
function measureLineupNameNaturalSizeViaClone(nameEl) {
  const clone = nameEl.cloneNode(true);
  clone.style.position = 'absolute';
  clone.style.visibility = 'hidden';
  clone.style.pointerEvents = 'none';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.maxWidth = 'none';
  clone.style.width = 'auto';
  clone.style.whiteSpace = 'nowrap';
  clone.style.display = 'inline-block';
  nameEl.parentNode.appendChild(clone);
  const width = clone.scrollWidth;
  const height = getDisplayLayoutRect(clone).height;
  clone.remove();
  return { width, height };
}

/** hasLineupNamePitchOverflow와 동일 판정이지만, 아직 실제로 적용 안 한 가상의 rect로 미리 검사. */
function hasLineupNamePitchOverflowForRect(rect, nameEl, paddingPx) {
  const pitch = getLineupNameWrap(nameEl)?.closest('.dp-lineup-vertical-pitch');
  if (!pitch || !canMeasureTextElement(pitch)) return false;
  const pitchRect = getDisplayLayoutRect(pitch);
  return rect.left < pitchRect.left + paddingPx - 0.5
    || rect.right > pitchRect.right - paddingPx + 0.5
    || rect.top < pitchRect.top + paddingPx - 0.5
    || rect.bottom > pitchRect.bottom - paddingPx + 0.5;
}

/**
 * 113px 캡 없이 "현재 설정된 폰트 크기" 그대로 한 줄로 폈을 때가 안전한지 시도한다 — 폰트는
 * 절대 건드리지 않는다 (1순위: 옆 공간이 있으면 설정 폰트로 1줄).
 * 복제본으로만 측정해(measureLineupNameNaturalSizeViaClone) nameEl 자체는 안전 여부를
 * 판단하기 전까지 한 번도 건드리지 않는다. 안전하면(피치 경계 안 넘고, 다른 라벨/원/배지/
 * 팀칩과도 안 겹치면) 그제서야 nameEl을 1번만 실제로 inline-block+nowrap으로 전환해 그
 * 폭을 확정한다 — nowrap이라 구조적으로 줄바꿈이 일어날 수 없다.
 * 안전하지 않으면 nameEl을 전혀 안 건드린 채 false를 반환해 호출 측의 기존 경로(2순위: 설정
 * 폰트로 2줄 — fitLineupNameSelf는 자기 박스가 line-clamp 2줄을 넘칠 때만 폰트를 줄이므로
 * 2줄로 충분하면 폰트는 그대로 유지됨, 3순위: 그래도 다른 라벨과 겹치면 fitLineupNamePills
 * 2)/3) 단계의 기존 폭/폰트 점진 축소)에 그대로 맡긴다.
 * 순서 보장: labels.forEach 순서대로 처리하므로, 뒤에 처리되는 라벨은 앞서 이미 자연폭으로
 * 확정된 라벨의 "현재" 크기를 기준으로 겹침을 검사 — 두 라벨이 동시에 넓어져 결과적으로
 * 겹치는 경우는 생기지 않는다.
 */
function tryLineupNameNaturalSingleLine(nameEl, labels) {
  if (!canMeasureTextElement(nameEl)) return false;

  const wrap = getLineupNameWrap(nameEl);
  if (!wrap) return false;
  const wrapRect = getDisplayLayoutRect(wrap);
  const centerX = wrapRect.left + (wrapRect.width / 2);
  const top = wrapRect.top;

  const { width: naturalWidthPx, height: naturalHeightPx } = measureLineupNameNaturalSizeViaClone(nameEl);
  if (!Number.isFinite(naturalWidthPx) || naturalWidthPx <= 0) return false;

  const hypotheticalRect = {
    left: centerX - (naturalWidthPx / 2),
    right: centerX + (naturalWidthPx / 2),
    top,
    bottom: top + naturalHeightPx,
  };

  const fitsWithinPitch = !hasLineupNamePitchOverflowForRect(hypotheticalRect, nameEl, getLineupNamePitchPaddingPxForContext(nameEl));
  const collisionTargets = getLineupNameNaturalWidthCollisionTargets(nameEl, labels);
  const overlapsAnything = collisionTargets.some(target => canMeasureTextElement(target) && rectsOverlap(hypotheticalRect, getDisplayLayoutRect(target)));

  if (!fitsWithinPitch || overlapsAnything) return false; // nameEl 자체는 한 번도 안 건드림

  nameEl.style.maxWidth = 'none';
  nameEl.style.whiteSpace = 'nowrap';
  nameEl.style.display = 'inline-block';
  // .dp-lineup-name-wrap이 display:flex; width:113px라서, nameEl(flex item)은 기본
  // flex-shrink:1 때문에 113px보다 넓은 width를 줘도 다시 컨테이너 폭으로 짜부러진다.
  // nowrap 상태에서 짜부러지면 줄바꿈은 못 하고 overflow:hidden에 텍스트가 그대로 잘린다.
  // flex-shrink:0으로 풀어줘야 실제로 설정한 폭만큼 넓어진다.
  nameEl.style.flexShrink = '0';
  nameEl.style.width = `${naturalWidthPx}px`;
  return true;
}

/** 팀칩을 위/아래 가장자리 쪽으로 1px씩 밀어, collisionEls와의 충돌이 풀리는 지점을 찾는다.
 * forceBottomAnchored를 명시하면 클래스 기반 추정 대신 그 값을 그대로 쓴다 — 항상 top으로
 * 앵커링되는 .dp-lineup-team-name-tag(분할 모드 좌상단 팀명 라벨)처럼 is-home/away 클래스가
 * 실제 CSS 앵커와 무관한 경우를 위함. */
function nudgeTeamChipTowardEdge(chipEl, collisionEls, options = {}) {
  if (!chipEl || !Array.isArray(collisionEls) || !collisionEls.length) return false;

  // split 모드에서는 CSS가 home chip도 top이 아닌 bottom으로 앵커링한다(양 팀 GK가 모두
  // 피치 아래쪽에 있으므로 — lineup-manual.css의 `.dp-lineup-vertical-pitch.is-split
  // .dp-lineup-team-chip.is-home` 참고). is-away 여부만으로 prop을 고르면 split 모드의
  // home chip에 엉뚱하게 top을 인라인으로 써버려 (실제 앵커는 bottom인데) top+bottom이
  // 동시에 고정값이 되어 chip이 피치 중간까지 늘어나 버리는 버그가 있었다.
  const isBottomAnchored = options.forceBottomAnchored != null
    ? options.forceBottomAnchored
    : (chipEl.classList.contains('is-away')
      || (chipEl.classList.contains('is-home') && !!chipEl.closest('.dp-lineup-vertical-pitch.is-split')));
  const prop = isBottomAnchored ? 'bottom' : 'top';
  const currentOffset = parseFloat(getComputedStyle(chipEl)[prop]);
  const minOffset = 2;
  if (!Number.isFinite(currentOffset) || currentOffset <= minOffset + 0.5) return false;

  let changed = false;
  for (let next = Math.floor(currentOffset) - 1; next >= minOffset; next -= 1) {
    chipEl.style[prop] = `${next}px`;
    changed = true;
    if (!elementOverlapsAny(chipEl, collisionEls)) break;
  }
  return changed;
}

/** 팀칩 이름/포메이션 텍스트 폰트를 한 단계씩 축소 (둘 중 하나라도 줄면 width는 재계산되게 리셋). */
function shrinkTeamChipMainText(nameEl, formationEl) {
  let changed = false;
  if (shrinkTextElement(nameEl, TEAM_CHIP_NAME_MIN_FONT_PX)) changed = true;
  if (formationEl && shrinkTextElement(formationEl, TEAM_CHIP_META_MIN_FONT_PX)) changed = true;
  if (changed) {
    nameEl.style.width = '';
    if (formationEl) formationEl.style.width = '';
  }
  return changed;
}

/** 이전 피팅에서 적용한 팀 이름 줄바꿈을 제거해 리사이즈 시 새 조건으로 다시 판단한다. */
function resetTeamChipNameBreak(nameEl) {
  if (!nameEl?.classList.contains('has-team-name-break')) return;
  nameEl.textContent = nameEl.dataset.teamNameOriginal || nameEl.textContent;
  delete nameEl.dataset.teamNameOriginal;
  nameEl.classList.remove('has-team-name-break');
}

/**
 * text를 nameEl에 실제로 렌더한 뒤(줄바꿈 없이 1줄), 실제 DOM 기준으로 겹침/잘림이 없어질
 * 때까지 폰트를 1px씩 낮춰 최종 정착한 폰트 크기를 반환한다. 0이면 최소 폰트(TEAM_CHIP_NAME_
 * MIN_FONT_PX)에서도 못 풀린다는 뜻.
 *
 * 이전에는 clone을 따로 만들어 "이 폭에 들어갈 폰트"를 예측(clientWidth 자기참조, 예측한
 * 폭과 실제 flex 레이아웃이 주는 폭의 불일치, line-clamp scrollHeight 오판정 등)했는데, 예측이
 * 실제 렌더와 계속 어긋나 짧은 이름으로 끝내 안 바뀌는 문제가 반복됐다. 여기서는 nameEl 자체를
 * 실제로 그 텍스트/폰트로 렌더해보고 실제 scrollWidth/충돌 여부를 그대로 판정 기준으로 쓰므로
 * "쟀던 값과 실제 렌더가 다르다"는 불일치가 구조적으로 생길 수 없다.
 */
function settleTeamChipNameCandidate(nameEl, mainEl, collisionEls, text) {
  nameEl.textContent = text;
  nameEl.classList.remove('has-team-name-break');
  nameEl.style.whiteSpace = 'nowrap';
  nameEl.style.width = '';
  nameEl.style.fontSize = '';
  const baseFont = parseFloat(getComputedStyle(nameEl).fontSize);
  if (!Number.isFinite(baseFont)) return 0;
  for (let font = Math.round(baseFont); font >= TEAM_CHIP_NAME_MIN_FONT_PX; font -= 1) {
    nameEl.style.fontSize = `${font}px`;
    const fits = nameEl.scrollWidth <= nameEl.clientWidth + 0.5
      && !elementOverlapsAny(mainEl, collisionEls);
    if (fits) return font;
  }
  return 0;
}

/**
 * 긴 이름과 짧은 이름 후보를 각각 실제로 1줄 렌더해보고(settleTeamChipNameCandidate), 더 큰
 * 폰트로 정착하는 쪽을 최종 선택한다. 동점이면(둘 다 같은 폰트, 혹은 둘 다 0) 긴 이름을
 * 유지한다 — teamName(풀네임) 설정이 ON일 때만 이 함수가 호출 대상이 되므로(currentName이
 * 이미 longName인 경우만 진입), 굳이 우열이 없으면 설정을 그대로 따르는 게 맞다.
 */
function tryTeamChipBetterName(nameEl, mainEl, collisionEls) {
  if (!nameEl || nameEl.dataset.teamNameShortTried === 'true') return false;
  nameEl.dataset.teamNameShortTried = 'true';

  const shortName = String(nameEl.dataset.teamNameShort || '').trim();
  const longName = String(nameEl.dataset.teamNameLong || '').trim();
  const currentName = String(nameEl.textContent || '').trim();
  if (!shortName || !longName || shortName === longName || currentName !== longName) return false;

  const longFont = settleTeamChipNameCandidate(nameEl, mainEl, collisionEls, longName);
  const shortFont = settleTeamChipNameCandidate(nameEl, mainEl, collisionEls, shortName);
  const preferShort = shortFont > longFont;

  const finalText = preferShort ? shortName : longName;
  const finalFont = preferShort ? shortFont : longFont;
  nameEl.textContent = finalText;
  nameEl.style.whiteSpace = '';
  nameEl.style.width = '';
  // finalFont가 0이면(최소 폰트로도 1줄에 안 들어감) 폰트를 강제하지 않고 이후 단계
  // (tryTeamChipTwoTokenBreak의 2줄 나누기, 일반 축소 루프)에 판단을 맡긴다.
  nameEl.style.fontSize = finalFont > 0 ? `${finalFont}px` : '';
  return preferShort;
}

/** 팀 이름이 두 토큰이면 현재 폰트를 유지한 채 두 줄로 나눠, 더 큰 글자를 살릴 수 있는지 시도한다. */
function tryTeamChipTwoTokenBreak(nameEl, collisionEls) {
  if (!nameEl || nameEl.classList.contains('has-team-name-break')) return false;
  const tokens = String(nameEl.textContent || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return false;

  const originalText = nameEl.textContent;
  const first = document.createElement('span');
  const second = document.createElement('span');
  first.textContent = tokens[0];
  second.textContent = tokens[1];
  nameEl.replaceChildren(first, document.createElement('br'), second);
  nameEl.classList.add('has-team-name-break');
  // max-content는 줄바꿈 이후에도 원래 한 줄의 폭을 유지할 수 있다. 두 줄 각각의
  // 실제 렌더 폭을 재서 가장 긴 줄만 감싸도록 지정해야 pill 배경이 과하게 넓어지지 않는다.
  const textWidth = Math.max(first.getBoundingClientRect().width, second.getBoundingClientRect().width);
  nameEl.style.width = `${Math.ceil(textWidth)}px`;
  nameEl.style.whiteSpace = '';

  if (!elementOverlapsAny(nameEl.closest('.dp-lineup-team-main'), collisionEls)) {
    nameEl.dataset.teamNameOriginal = originalText;
    return true;
  }

  nameEl.textContent = originalText;
  nameEl.style.width = '';
  nameEl.classList.remove('has-team-name-break');
  return false;
}

/** 자동 줄바꿈 라벨도 현재 렌더된 가장 긴 줄의 폭만 차지하도록 팀명 pill을 조인다. */
function tightenTeamChipNameToRenderedLines(nameEl) {
  if (!canMeasureTextElement(nameEl)) return false;
  const lineWidth = measureMaxTextLineWidth(nameEl);
  if (!Number.isFinite(lineWidth) || lineWidth <= 0) return false;

  const nextWidth = Math.ceil(lineWidth);
  const currentWidth = parseFloat(nameEl.style.width);
  if (Number.isFinite(currentWidth) && Math.abs(currentWidth - nextWidth) < 0.5) return false;
  nameEl.style.width = `${nextWidth}px`;
  return true;
}

/** 팀칩이 collisionEls와 겹치면 (stacked 전환 → 가장자리 nudge → 폭/폰트 축소 순으로) 풀릴 때까지 보정. */
function fitTeamChip(chipEl, collisionEls, options = {}) {
  const preferShrink = options?.preferShrink === true;
  const mainEl = chipEl?.querySelector('.dp-lineup-team-main');
  const nameEl = mainEl?.querySelector('.dp-lineup-team-name');
  const formationEl = mainEl?.querySelector('.dp-lineup-team-fm');
  const buttonEl = chipEl?.querySelector('.dp-side-edit-btn');
  const preserveBigFormationButton = !!(
    mainEl?.classList.contains('is-formation-only')
    && chipEl?.closest('.layout-big .lp-lineup')
  );
  if (!mainEl || !nameEl || !Array.isArray(collisionEls)) return;

  resetTeamChipNameBreak(nameEl);
  delete nameEl.dataset.teamNameShortTried;
  const nameIsClipped = () => nameEl.scrollWidth > nameEl.clientWidth + 0.5
    || nameEl.scrollHeight > nameEl.clientHeight + 0.5;

  // 잘림/충돌 여부와 관계없이 먼저 긴 이름과 짧은 이름의 최대 폰트를 비교한다. 긴 이름이
  // 2줄로는 보이더라도 짧은 이름이 더 큰 글자를 허용할 수 있다. preferShrink(작은 캠) 여부와
  // 무관하게 항상 시도한다 — 분할 모드(splitLineup=on)의 팀 이름 라벨(.dp-lineup-team-name-tag)은
  // 캠 큼에서만 나타나는데 이 비교가 preferShrink에 묶여 있으면 캠 큼에서는 전혀 동작하지
  // 않았다(2026-09 피드백). tryTeamChipBetterName 내부 가드가 포메이션 전용 칩(짧은/긴 이름
  // data 속성 자체가 없음)은 안전하게 스킵하므로 여기서 preferShrink로 막을 필요가 없다.
  if (tryTeamChipBetterName(nameEl, mainEl, collisionEls)) return;
  if (nameIsClipped() && tryTeamChipTwoTokenBreak(nameEl, collisionEls)) return;

  let safety = 0;
  while (safety < 32) {
    const mainOverlaps = elementOverlapsAny(mainEl, collisionEls);
    const buttonOverlaps = elementOverlapsAny(buttonEl, collisionEls);
    // mainEl/buttonEl는 칩 좌우 끝의 실제 pill만 가리켜서, 라벨(예: GK 이름표)이 그 사이
    // 빈 여백(예: formationOnly 모드에서 포메이션 텍스트와 버튼 사이)에 걸리는 경우를
    // 놓친다 — 시각적으로는 칩 바(is-home/away 가로 전체 라인)와 겹쳐 지저분해 보이는데도
    // mainOverlaps/buttonOverlaps 둘 다 false라 아래 nudge/shrink 단계로 못 내려갔다.
    // 칩 전체 rect까지 같이 확인해 그 경우도 remediation 루프에 들어오게 한다.
    const chipOverlaps = elementOverlapsAny(chipEl, collisionEls);
    if (!mainOverlaps && !buttonOverlaps && !chipOverlaps) break;

    // 긴 팀명을 먼저 줄이지 않는다. 짧은 이름이 현재 폰트 크기로 안전하게 들어가면 그
    // 이름을 유지해 글자 크기를 보존한다(preferShrink/캠 큼-작음 무관, 위 설명 참조).
    if ((mainOverlaps || nameIsClipped())
      && tryTeamChipBetterName(nameEl, mainEl, collisionEls)) {
      safety += 1;
      continue;
    }

    // 두 토큰 팀 이름은 먼저 두 줄로 나눠 본다. 같은(더 큰) 폰트에서 충돌이
    // 풀리면 폰트를 줄이는 대신 이 상태를 유지하고, 실패하면 기존 보정으로 넘긴다.
    if ((mainOverlaps || nameIsClipped()) && tryTeamChipTwoTokenBreak(nameEl, collisionEls)) {
      safety += 1;
      continue;
    }

    if (preferShrink && mainOverlaps) {
      if (shrinkTeamChipMainText(nameEl, formationEl)) {
        safety += 1;
        continue;
      }
      if (tightenTextElementWidth(nameEl, TEAM_CHIP_NAME_MIN_WIDTH_PX, canStayWithinTwoTextLines)) {
        safety += 1;
        continue;
      }
    }

    if (!preferShrink && mainOverlaps && formationEl && !mainEl.classList.contains('is-stacked')) {
      mainEl.classList.add('is-stacked');
      safety += 1;
      continue;
    }

    if (options.allowNudge !== false
      && nudgeTeamChipTowardEdge(chipEl, collisionEls, { forceBottomAnchored: options.forceBottomAnchored })) {
      safety += 1;
      continue;
    }

    if (!preserveBigFormationButton && buttonOverlaps && buttonEl
      && tightenTextElementWidth(buttonEl, TEAM_CHIP_BUTTON_MIN_WIDTH_PX, canStayWithinTwoTextLines)) {
      safety += 1;
      continue;
    }

    let changed = false;
    if (mainOverlaps) {
      changed = shrinkTeamChipMainText(nameEl, formationEl);
    }
    if (changed) {
      safety += 1;
      continue;
    }

    if (mainOverlaps && tightenTextElementWidth(nameEl, TEAM_CHIP_NAME_MIN_WIDTH_PX, canStayWithinTwoTextLines)) {
      safety += 1;
      continue;
    }

    if (!preserveBigFormationButton && buttonOverlaps && buttonEl && shrinkTextElement(buttonEl, TEAM_CHIP_BUTTON_MIN_FONT_PX)) {
      tightenTextElementWidth(buttonEl, TEAM_CHIP_BUTTON_MIN_WIDTH_PX, canStayWithinTwoTextLines);
      safety += 1;
      continue;
    }

    break;
  }
}

/** 큰/작은 캠 라인업 패널의 모든 팀칩에 대해 노드/이름라벨과의 충돌을 fitTeamChip으로 정리. */
function fitBigLineupTeamChips(root) {
  const TEAM_LABEL_REFERENCE_WIDTH_PX = 280;
  const TEAM_LABEL_MIN_SCALE = 0.55;
  const scope = root || document;
  const panels = scope?.matches?.('[data-dp-role="lineup"]')
    ? [scope]
    : Array.from(scope.querySelectorAll('[data-dp-role="lineup"]'));

  panels.forEach(panel => {
    const isBigLayout = !!panel.closest('.layout-big .lp-lineup');
    const isSmallLayout = !!panel.closest('.layout-small .lp-lineup-s');
    if (!isBigLayout && !isSmallLayout) return;

    const pitches = Array.from(panel.querySelectorAll('.dp-lineup-vertical-pitch'));
    if (!pitches.length) return;

    pitches.forEach(pitch => {
      const pitchWidth = pitch.getBoundingClientRect().width;
      const teamLabelScale = pitchWidth > 0
        ? Math.max(TEAM_LABEL_MIN_SCALE, Math.min(1, pitchWidth / TEAM_LABEL_REFERENCE_WIDTH_PX))
        : 1;
      pitch.style.setProperty('--lp-team-label-scale', teamLabelScale.toFixed(3));

      pitch.querySelectorAll('.dp-lineup-team-name, .dp-lineup-team-chip .dp-side-edit-btn').forEach(el => {
        el.style.width = '';
        el.style.fontSize = '';
      });
      pitch.querySelectorAll('.dp-lineup-team-fm').forEach(el => {
        el.style.fontSize = '';
      });
      pitch.querySelectorAll('.dp-lineup-team-main').forEach(el => {
        el.classList.remove('is-stacked');
      });
      // .dp-lineup-team-name-tag(분할 모드 좌상단 팀명 라벨)도 같은 파이프라인으로 처리해야
      // 포메이션 chip과 마찬가지로 노드/이름표와 겹칠 때 가장자리로 밀리며, 그래야 두 라벨의
      // 실제 렌더 위치가 하프라인 기준 대칭을 유지한다 — 둘 다 겹침이 없으면 기본값(3%) 그대로,
      // 겹치면 똑같은 규칙으로 안쪽으로 밀린다.
      pitch.querySelectorAll('.dp-lineup-team-chip, .dp-lineup-team-name-tag').forEach(chip => {
        chip.style.top = '';
        chip.style.bottom = '';
      });

      pitch.querySelectorAll('.dp-lineup-team-chip, .dp-lineup-team-name-tag').forEach(chip => {
        const collisionEls = Array.from(
          pitch.querySelectorAll('.dp-lineup-node, .dp-lineup-name-wrap')
        ).filter(target => target !== chip && !chip.contains(target));
        const isNameTag = chip.classList.contains('dp-lineup-team-name-tag');
        fitTeamChip(chip, collisionEls, {
          preferShrink: isSmallLayout,
          // 라벨의 기준점(팀명=좌상단, 포메이션=좌하단, 버튼=우하단)을 고정하고
          // 충돌은 폭/폰트 축소로만 해결해 리사이즈 때 피치 안쪽으로 밀리지 않게 한다.
          allowNudge: false,
          // name-tag는 항상 top 앵커(CSS: .dp-lineup-team-name-tag { top:3% }) — chip처럼
          // is-home/away 클래스로 top/bottom을 추정하면 안 된다.
          forceBottomAnchored: isNameTag ? false : undefined,
        });
        tightenTeamChipNameToRenderedLines(chip.querySelector('.dp-lineup-team-name'));
      });

      // 팀 이름 라벨(top 앵커)과 포메이션 chip(split 모드에서는 항상 bottom 앵커)은 기본값이
      // 같아도(3%) 서로 다른 콘텐츠(윗줄 포워드 vs 아랫줄 GK)와 겹쳐서 각자 다른 만큼 밀릴 수
      // 있다 — 그러면 더 이상 하프라인 기준 대칭이 아니게 된다. 둘 다 있으면 더 많이 밀린
      // (=더 작은 오프셋) 쪽으로 강제 통일해 항상 대칭을 유지한다.
      const nameTag = pitch.querySelector('.dp-lineup-team-name-tag');
      const teamChip = pitch.querySelector('.dp-lineup-team-chip');
      if (nameTag && teamChip) {
        const tagOffset = parseFloat(getComputedStyle(nameTag).top);
        const chipOffset = parseFloat(getComputedStyle(teamChip).bottom);
        if (Number.isFinite(tagOffset) && Number.isFinite(chipOffset)) {
          const unified = Math.min(tagOffset, chipOffset);
          nameTag.style.top = `${unified}px`;
          teamChip.style.bottom = `${unified}px`;
        }
      }
    });
  });
}

/**
 * 라인업 토큰 이름 pill 처리 — 네 단계.
 *  0) 고정폭(113px) 캡 없이 한 줄로 폈을 때의 자연 폭을 먼저 시도한다. 주변 라벨/원/배지/팀칩/
 *     피치 경계 중 실제로 겹치는 게 하나도 없으면 그 폭을 그대로 유지(원톱처럼 옆이 비어 있는
 *     경우 불필요하게 2줄로 줄바꿈되는 것을 막음). 겹치는 게 있으면 즉시 되돌리고 기존 1)~3)
 *     로직에 그대로 맡긴다 — 안전망은 그대로 유지.
 *  1) (0단계가 실패한 라벨만) fitLineupNameSelf — 설정 폰트 그대로 2줄 클램프 유지 시도.
 *     2줄로도 넘치면(scrollHeight > clientHeight) 그제서야 font-size를 min 7px까지 축소,
 *     끝나면 항상 lockLineupNameWidth로 width를 실제 텍스트 폭에 맞춰 고정.
 *  2) 다른 라벨/팀칩과 겹치는 쌍이 남으면 페어별로: 폭 좁히기(tightenLineupNameWidth) →
 *     (그 라벨이 nowrap 1줄 상태였다면) 폰트 유지한 채 2단계로 되돌리기 → 그래도 안 풀리면
 *     그제서야 font-size 축소. 폰트 유지가 항상 우선이므로 이 순서를 지킨다.
 *  3) 큰 캠 축소 상황에서만 남는 충돌(잔여 라벨-라벨, 라벨-팀칩, 라벨-배지, 라벨-원)을
 *     별도 패스로 한 번 더 폭/폰트 축소.
 *
 * 호출 시점: innerHTML 갱신 후 다음 frame, 라인업 리사이즈 종료 후에도 다시 호출.
 */
function fitLineupNamePills(root) {
  const scope = root || document;
  const labels = Array.from(scope.querySelectorAll('.dp-lineup-name'))
    .filter(nameEl => !!(nameEl && nameEl.firstChild));
  const configuredFonts = new Map();

  // 0) 모든 라벨을 먼저 CSS 기본 상태로 되돌린다 — 이 reset과 아래 1)의 처리를 같은 루프
  // 안에서 하면, 처리 순서상 앞선 라벨이 아직 reset 안 된(직전 렌더의 낡은 크기로 남아있는)
  // 뒤쪽 라벨을 기준으로 충돌을 판정하게 되어 — 폰트 크기 등 조건이 바뀐 직후엔 그 낡은
  // 스냅샷이 실제 결과와 달라져 둘 다 넓어진 라벨이 서로 겹치는 사고가 날 수 있다. 그래서
  // reset을 전부 끝낸 뒤에야 1)을 시작해, 모든 충돌 판정이 항상 "이번 렌더의 동일한 기준선"
  // 위에서 이뤄지도록 한다.
  labels.forEach(nameEl => {
    resetLineupNameWrapOffset(nameEl);
    resetLineupSurnameBreaks(nameEl);
    nameEl.style.width = '';
    nameEl.style.fontSize = '';
    nameEl.style.maxWidth = '';
    nameEl.style.whiteSpace = '';
    nameEl.style.display = '';
    nameEl.style.flexShrink = '';
    configuredFonts.set(nameEl, parseFloat(getComputedStyle(nameEl).fontSize));
  });

  // 0-a) 주장 완장 배지가 있는 라벨은 reset된 측정값을 기준으로 "등번호 왼쪽" vs
  // "번호+이름 뒤" 중 이름이 더 크게 표시되는 배치로 확정한다. 이후 단계(자연 1줄/2줄/축소)가
  // 이 확정된 순서를 그대로 측정 대상으로 삼는다.
  labels.forEach(nameEl => {
    resolveLineupCaptainBadgePlacement(nameEl, labels);
  });

  // 1) 먼저 자연 1줄 폭이 안전한지 시도하고(주변과 안 겹치면 그대로 유지), 안전하지 않으면
  // 기존 텍스트 폭 고정/축소 로직으로 넘긴다.
  labels.forEach(nameEl => {
    if (!canMeasureTextElement(nameEl)) return;
    if (tryLineupNameNaturalSingleLine(nameEl, labels)) return;
    fitLineupNameSelf(nameEl);
  });

  labels.forEach(nameEl => {
    fitLineupNameWithinPitchBounds(nameEl);
  });

  // 2) 공통 충돌 보정: 좁히기 가능한 쪽부터 width를 줄이고, 더 이상 안 되면 font-size를 줄인다.
  let pass = 0;
  while (pass < 24) {
    let changed = false;

    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const leftEl = labels[i];
        const rightEl = labels[j];
        if (!canMeasureTextElement(leftEl) || !canMeasureTextElement(rightEl)) continue;
        if (!wrapsOverlap(leftEl, rightEl)) continue;

        const primaryEl = chooseWrapToShrink(leftEl, rightEl);
        const secondaryEl = primaryEl === leftEl ? rightEl : leftEl;

        if ((primaryEl && tightenLineupNameWidth(primaryEl))
          || (secondaryEl && tightenLineupNameWidth(secondaryEl))) {
          changed = true;
          break;
        }

        // 폰트를 줄이기 전에, nowrap 1줄로 확정됐던 라벨이 있으면 먼저 2단계(같은 폰트로
        // 2줄 클램프)로 되돌려서 겹침이 풀리는지 시도한다. 1단계가 욕심을 내서 한 줄을
        // 시도했다가 안 맞으면, 폰트를 줄이는 것보다 줄바꿈을 허용하는 쪽이 우선이다.
        if (primaryEl && isLineupNameInNaturalSingleLineMode(primaryEl)) {
          revertLineupNameToClampMode(primaryEl);
          changed = true;
          break;
        }
        if (secondaryEl && isLineupNameInNaturalSingleLineMode(secondaryEl)) {
          revertLineupNameToClampMode(secondaryEl);
          changed = true;
          break;
        }

        if ((primaryEl && shrinkTextElement(primaryEl, LINEUP_NAME_MIN_FONT_PX))
          || (secondaryEl && shrinkTextElement(secondaryEl, LINEUP_NAME_MIN_FONT_PX))) {
          if (primaryEl) lockLineupNameWidth(primaryEl);
          if (secondaryEl) lockLineupNameWidth(secondaryEl);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }

    if (!changed) break;
    pass += 1;
  }

  // 3) 큰 캠 축소 상태에서만 남는 충돌은 별도 패스로 한 번 더 정리한다.
  fitResidualBigLineupNameCollisions(labels);
  fitBigLineupNameAgainstOtherLabels(labels);
  fitBigLineupNameAgainstTeamChips(labels);
  fitBigLineupNameAgainstPriorityBadges(labels);
  fitBigLineupNameAgainstOpposingBadges(labels);
  labels.forEach(nameEl => {
    fitLineupNameWithinPitchBounds(nameEl);
  });
  fitResidualBigLineupNameCollisions(labels);
  fitBigLineupNameAgainstOtherLabels(labels);
  fitBigLineupNameAgainstTeamChips(labels);
  fitBigLineupNameAgainstPriorityBadges(labels);
  fitBigLineupNameAgainstOpposingBadges(labels);
  // 라벨이 다른 선수의 원 자체와 겹치는 경우 (기존 패스가 감지 못하는 gap 보완)
  fitLineupNamesAgainstNodeCircles(labels);
  labels.forEach(nameEl => { fitLineupNameWithinPitchBounds(nameEl); });
  fitBigLineupTeamChips(scope);
  // 기존 결과가 우선이다. 모든 충돌 보정 이후 더 큰 폰트가 안전하게 들어갈 때만 개선한다.
  labels.forEach(nameEl => improveLineupNameWithNumberLine(nameEl, labels, configuredFonts.get(nameEl)));
}

// 라인업 리사이즈/설정 변경 후 외부에서 다시 fit을 호출할 수 있도록 노출
window.fitLineupNamePills = fitLineupNamePills;
window.fitBenchFooterNames = fitBenchFooterNames;

// 전체화면/창 모드 전환과 display-scale의 resize가 끝난 뒤 실제 피치 폭 기준으로
// 라벨을 다시 계산한다. 한 프레임만 기다리면 transform/zoom 적용 전 치수를 읽을 수
// 있으므로 두 프레임을 건너뛴다.
let lineupViewportFitRaf = 0;
function syncBigLineupFullscreenGeometry() {
  document.querySelectorAll('.layout-big .lp-lineup').forEach(panel => {
    // 사용자가 엣지 핸들로 폭을 직접 조절한 패널은 그 값을 보존한다.
    if (panel.classList.contains('has-edge-override') || panel.classList.contains('has-w-override')) return;

    let rememberedWidth = Number(panel.dataset.lineupWindowWidth);
    if (!(rememberedWidth > 0)) {
      rememberedWidth = typeof getDisplayLayoutRect === 'function'
        ? getDisplayLayoutRect(panel).width
        : panel.getBoundingClientRect().width;
      if (rememberedWidth > 0) panel.dataset.lineupWindowWidth = String(rememberedWidth);
    }
    if (rememberedWidth > 0) {
      panel.style.width = `${Math.round(rememberedWidth)}px`;
      panel.classList.add('lp-width-locked');
    }
  });
}
function scheduleLineupViewportFit() {
  if (lineupViewportFitRaf) cancelAnimationFrame(lineupViewportFitRaf);
  lineupViewportFitRaf = requestAnimationFrame(() => {
    lineupViewportFitRaf = requestAnimationFrame(() => {
      lineupViewportFitRaf = 0;
      syncBigLineupFullscreenGeometry();
      const activePage = document.querySelector('.page.active');
      const scope = activePage || document;
      scope.querySelectorAll('[data-dp-role="lineup"]').forEach(panel => fitLineupNamePills(panel));
      fitBigLineupTeamChips(scope);
      fitBenchFooterNames(scope.querySelector('#benchPanel') || document.getElementById('benchPanel'));
      balanceBenchInjuryPanelHeights();

    });
  });
}

window.addEventListener('resize', scheduleLineupViewportFit);
document.addEventListener('fullscreenchange', scheduleLineupViewportFit);

// 첫 page:activated를 기다리면 사용자가 그 전에 F11을 눌렀을 때 원본 폭이
// 저장되지 않을 수 있다. DOM이 이미 준비된 경우 즉시 한 프레임 안에서 폭을 잠근다.
function initializeBigLineupWidthLock() {
  requestAnimationFrame(() => {
    syncBigLineupFullscreenGeometry();
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBigLineupWidthLock, { once: true });
} else {
  initializeBigLineupWidthLock();
}

document.addEventListener('page:activated', () => {
  scheduleLineupViewportFit();
});

