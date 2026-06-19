// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 패널 / 이름 라벨·팀칩 텍스트 피팅]
// 라인업 이름 pill, 벤치 하단 텍스트, 팀 칩을 렌더 후 실제 픽셀 기준으로 보정한다.
// fitLineupNamePills 4단계: 0) 자연 1줄(폰트 유지) 1) 2줄 클램프(폰트 유지)
// 2) 충돌 시 폭/폰트 점진 축소 3) 큰 캠 잔여 충돌 보정. lineup-render.js가 렌더한
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
  const current = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(current) || current <= minFontPx + 0.01) return false;
  const next = Math.max(minFontPx, current - TEXT_FIT_FONT_STEP_PX);
  if (next >= current) return false;
  el.style.fontSize = `${next}px`;
  return true;
}

/** Range API로 el 안 텍스트가 실제로 몇 개의 줄 사각형으로 렌더됐는지 읽어온다. */
function getTextLineRects(el) {
  if (!canMeasureTextElement(el) || !el.firstChild) return [];
  const range = document.createRange();
  try {
    range.selectNodeContents(el);
    return Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
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

/** 기본(줄바꿈 허용) 모드에서 2줄 클램프 높이를 넘지 않는지. */
function canStayWithinTwoLineClamp(nameEl) {
  return nameEl.scrollHeight <= nameEl.clientHeight + 0.5;
}

// tryLineupNameNaturalSingleLine이 white-space:nowrap 1줄 모드로 확정한 라벨은 폭을 줄여도
// 줄바꿈이 일어나지 않아 scrollHeight가 절대 안 변한다 — canStayWithinTwoLineClamp가 항상
// true를 반환해, 실제로는 안 맞는 폭까지 깎여 overflow:hidden에 텍스트가 잘려 보이는 사고로
// 이어진다(예: "스티븐 안투네스" -> "스티"). nowrap 상태에서는 scrollWidth <= clientWidth로
// 실제 텍스트가 박스 안에 들어가는지 직접 검사한다.
function canStayWithinLineupNameLayout(nameEl) {
  if (getComputedStyle(nameEl).whiteSpace === 'nowrap') {
    return nameEl.scrollWidth <= nameEl.clientWidth + 0.5;
  }
  return canStayWithinTwoLineClamp(nameEl);
}

/** 실제로 렌더된 줄 수 (Range 기반, line-clamp 자체 줄 수가 아니라 실측치). */
function getRenderedTextLineCount(el) {
  const rects = getMergedTextLines(el);
  return rects.length || 1;
}

/** 팀칩 텍스트가 2줄 이내로 들어가는지 — fitTeamChip의 canFitFn으로 사용. */
function canStayWithinTwoTextLines(el) {
  return getRenderedTextLineCount(el) <= 2;
}

/** 이분탐색으로 el의 width를 canFitFn이 통과하는 한도 내 최소값까지 줄인다. */
function tightenTextElementWidth(el, minWidthPx, canFitFn) {
  if (!canMeasureTextElement(el) || typeof canFitFn !== 'function') return false;
  const currentWidth = Math.ceil(el.getBoundingClientRect().width);
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
function isLineupNameInNaturalSingleLineMode(nameEl) {
  return !!nameEl && getComputedStyle(nameEl).whiteSpace === 'nowrap';
}

// 폰트를 줄이기 전에 우선 시도: nowrap/inline-block/고정폭을 모두 풀어 2단계(설정 폰트
// 그대로 2줄 클램프)로 되돌린다. 폰트 크기를 유지하는 게 한 줄 유지보다 우선이기 때문에,
// 충돌 보정 루프에서 폭 좁히기가 실패하면 폰트 축소보다 이 복귀를 먼저 시도해야 한다.
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
  const wrapWidth = wrap ? Math.floor(wrap.getBoundingClientRect().width) : 0;
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
  while (safety < 16 && nameEl.scrollHeight > nameEl.clientHeight + 0.5) {
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

  const wrapRect = nameEl.getBoundingClientRect();
  const pitchRect = pitch.getBoundingClientRect();
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
  const leftRect = leftWrap.getBoundingClientRect();
  const rightRect = rightWrap.getBoundingClientRect();
  return leftRect.left < rightRect.right - 1
    && leftRect.right > rightRect.left + 1
    && leftRect.top < rightRect.bottom - 1
    && leftRect.bottom > rightRect.top + 1;
}

/** 겹치는 두 라벨 중 먼저 줄여야 할 쪽 — 더 넓은 쪽, 동률이면 텍스트 더 긴 쪽, 그래도 같으면 더 아래쪽. */
function chooseWrapToShrink(leftWrap, rightWrap) {
  const leftRect = leftWrap.getBoundingClientRect();
  const rightRect = rightWrap.getBoundingClientRect();
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
function nameOverlapsNodeCircleSignificantly(nameEl, nodeEl) {
  if (!canMeasureTextElement(nameEl) || !canMeasureTextElement(nodeEl)) return false;
  const nr = nameEl.getBoundingClientRect();
  const cr = nodeEl.getBoundingClientRect();
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

/** 벤치 패널 하단(감독/주심/경기장) 텍스트가 넘치면 폰트를 점진 축소. */
function fitBenchFooterNames(root) {
  const scope = root || document;
  scope.querySelectorAll('.dp-bench-footer .dp-coach-name, .dp-bench-footer .dp-referee-name').forEach(nameEl => {
    if (!nameEl || nameEl.classList.contains('dp-coach-editing') || nameEl.classList.contains('dp-referee-editing')) return;
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;

    const isReferee = nameEl.classList.contains('dp-referee-name');
    let safety = 0;
    while (safety < 12) {
      const overflow = isReferee
        ? (nameEl.scrollHeight > nameEl.clientHeight + 0.5 || nameEl.scrollWidth > nameEl.clientWidth + 0.5)
        : nameEl.scrollWidth > nameEl.clientWidth + 0.5;
      if (!overflow) break;
      if (!shrinkTextElement(nameEl, BENCH_FOOTER_MIN_FONT_PX)) break;
      safety += 1;
    }
  });

  // 경기장 이름 — 2줄 line-clamp 후에도 잘리거나 가로 넘침이면 폰트 점진 축소.
  scope.querySelectorAll('.dp-bench-venue .dp-league-name').forEach(nameEl => {
    if (!nameEl) return;
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

  // 경기장 이름은 'overflow-wrap: anywhere' + 'line-clamp: 2'라 자연스럽게 줄바꿈되며
  // scrollWidth ≤ clientWidth가 되어 일반적인 overflow 검사로는 줄바꿈을 못 잡는다.
  // → 단일 줄(white-space:nowrap) 자연 폭을 측정해 컨테이너 폭과 비교, 가능한 한 1줄에
  // 맞도록 폰트를 점진 축소. 최소 폰트(8px)에 도달했는데도 1줄에 못 들어가면 그대로 wrap 허용.
  scope.querySelectorAll('.dp-bench-venue .dp-venue-name').forEach(nameEl => {
    if (!nameEl) return;
    nameEl.style.fontSize = '';
    if (!canMeasureTextElement(nameEl)) return;
    let safety = 0;
    while (safety < 16) {
      const containerWidth = nameEl.clientWidth;
      if (!containerWidth) break;
      // 임시로 nowrap 적용해 단일 줄 자연 폭 측정.
      const prevWhiteSpace = nameEl.style.whiteSpace;
      nameEl.style.whiteSpace = 'nowrap';
      const naturalWidth = nameEl.scrollWidth;
      nameEl.style.whiteSpace = prevWhiteSpace;
      // 1줄에 들어가거나 추가 오버플로우 없으면 종료.
      const wrapNeeded = naturalWidth > containerWidth + 0.5;
      const heightOverflow = nameEl.scrollHeight > nameEl.clientHeight + 0.5;
      if (!wrapNeeded && !heightOverflow) break;
      if (!shrinkTextElement(nameEl, BENCH_FOOTER_MIN_FONT_PX)) break;
      safety += 1;
    }
  });

  scope.querySelectorAll('.dp-bench-kickoff .dp-kickoff-time').forEach(nameEl => {
    if (!nameEl) return;
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
  return el.getBoundingClientRect().height
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
  const listRect = list.getBoundingClientRect();
  const measuredBottom = children.reduce((maxBottom, child) => (
    Math.max(
      maxBottom,
      (child.getBoundingClientRect().bottom - listRect.top) + list.scrollTop
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
  const current = split.getBoundingClientRect().height;
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
  const panelHeight = panel.getBoundingClientRect().height;
  const splitHeight = split ? split.getBoundingClientRect().height : 0;
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

/** 벤치/부상 패널 중 한쪽이 모자라고 다른 쪽이 남으면 height를 옮겨 균형을 맞춘다. */
function balanceBenchInjuryPanelHeights() {
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

  const benchRect = benchSection.getBoundingClientRect();
  const injuryRect = injurySection.getBoundingClientRect();
  if (benchRect.height <= DETAIL_PANEL_BALANCE_EPSILON_PX
    || injuryRect.height <= DETAIL_PANEL_BALANCE_EPSILON_PX) {
    return;
  }

  const benchMetrics = getPanelSplitMetrics(benchPanel);
  const injuryMetrics = getPanelSplitMetrics(injuryPanel);
  let transferTarget = null;
  let sourceSpare = 0;
  let targetDeficit = 0;

  if (injuryMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && benchMetrics.spare > DETAIL_PANEL_BALANCE_EPSILON_PX) {
    transferTarget = 'injury';
    sourceSpare = benchMetrics.spare;
    targetDeficit = injuryMetrics.deficit;
  } else if (benchMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && injuryMetrics.spare > DETAIL_PANEL_BALANCE_EPSILON_PX) {
    transferTarget = 'bench';
    sourceSpare = injuryMetrics.spare;
    targetDeficit = benchMetrics.deficit;
  } else if (benchMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX
    && injuryMetrics.deficit > DETAIL_PANEL_BALANCE_EPSILON_PX) {
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

  const transfer = Math.min(
    Math.floor(sourceSpare),
    Math.ceil(targetDeficit)
  );
  if (transfer <= DETAIL_PANEL_BALANCE_EPSILON_PX) return;

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
  const height = clone.getBoundingClientRect().height;
  clone.remove();
  return { width, height };
}

/** hasLineupNamePitchOverflow와 동일 판정이지만, 아직 실제로 적용 안 한 가상의 rect로 미리 검사. */
function hasLineupNamePitchOverflowForRect(rect, nameEl, paddingPx) {
  const pitch = getLineupNameWrap(nameEl)?.closest('.dp-lineup-vertical-pitch');
  if (!pitch || !canMeasureTextElement(pitch)) return false;
  const pitchRect = pitch.getBoundingClientRect();
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
  const wrapRect = wrap.getBoundingClientRect();
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
  const overlapsAnything = collisionTargets.some(target => canMeasureTextElement(target) && rectsOverlap(hypotheticalRect, target.getBoundingClientRect()));

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

/** 팀칩을 위/아래 가장자리 쪽으로 1px씩 밀어, collisionEls와의 충돌이 풀리는 지점을 찾는다. */
function nudgeTeamChipTowardEdge(chipEl, collisionEls) {
  if (!chipEl || !Array.isArray(collisionEls) || !collisionEls.length) return false;

  const prop = chipEl.classList.contains('is-away') ? 'bottom' : 'top';
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
  if (!mainEl || !nameEl || !Array.isArray(collisionEls) || !collisionEls.length) return;

  let safety = 0;
  while (safety < 32) {
    const mainOverlaps = elementOverlapsAny(mainEl, collisionEls);
    const buttonOverlaps = elementOverlapsAny(buttonEl, collisionEls);
    if (!mainOverlaps && !buttonOverlaps) break;

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

    if (nudgeTeamChipTowardEdge(chipEl, collisionEls)) {
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
      pitch.querySelectorAll('.dp-lineup-team-chip').forEach(chip => {
        chip.style.top = '';
        chip.style.bottom = '';
      });

      pitch.querySelectorAll('.dp-lineup-team-chip').forEach(chip => {
        const collisionEls = Array.from(
          pitch.querySelectorAll('.dp-lineup-node, .dp-lineup-name-wrap')
        ).filter(target => target !== chip && !chip.contains(target));
        fitTeamChip(chip, collisionEls, { preferShrink: isSmallLayout });
      });
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

  // 0) 모든 라벨을 먼저 CSS 기본 상태로 되돌린다 — 이 reset과 아래 1)의 처리를 같은 루프
  // 안에서 하면, 처리 순서상 앞선 라벨이 아직 reset 안 된(직전 렌더의 낡은 크기로 남아있는)
  // 뒤쪽 라벨을 기준으로 충돌을 판정하게 되어 — 폰트 크기 등 조건이 바뀐 직후엔 그 낡은
  // 스냅샷이 실제 결과와 달라져 둘 다 넓어진 라벨이 서로 겹치는 사고가 날 수 있다. 그래서
  // reset을 전부 끝낸 뒤에야 1)을 시작해, 모든 충돌 판정이 항상 "이번 렌더의 동일한 기준선"
  // 위에서 이뤄지도록 한다.
  labels.forEach(nameEl => {
    resetLineupNameWrapOffset(nameEl);
    nameEl.style.width = '';
    nameEl.style.fontSize = '';
    nameEl.style.maxWidth = '';
    nameEl.style.whiteSpace = '';
    nameEl.style.display = '';
    nameEl.style.flexShrink = '';
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
}

// 라인업 리사이즈/설정 변경 후 외부에서 다시 fit을 호출할 수 있도록 노출
window.fitLineupNamePills = fitLineupNamePills;
window.fitBenchFooterNames = fitBenchFooterNames;

document.addEventListener('page:activated', () => {
  requestAnimationFrame(() => {
    document.querySelectorAll('.page.active [data-dp-role="lineup"]').forEach(panel => fitLineupNamePills(panel));
    fitBenchFooterNames(document.querySelector('.page.active #benchPanel') || document.getElementById('benchPanel'));
    balanceBenchInjuryPanelHeights();
  });
});

