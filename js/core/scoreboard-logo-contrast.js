/**
 * 점수판 홈/원정 로고와 카드 배경색이 거의 같아 보여 로고가 배경에 묻히는 경우를 감지하고,
 * 그런 경우에만 그 카드의 배경색을 화면 표시용으로만 다른 색으로 맞바꾼다.
 *
 * 처리 흐름: LogoTrim이 trim(투명 여백 제거) 분석을 끝내면(ready=true) → 그 결과(경계 bounds)를
 * 재사용해 원본 로고에서 투명 여백을 뺀 부분만 항상 일정한 해상도(ANALYSIS_SIZE)의 별도 Canvas에
 * 다시 그려 가장자리 픽셀 색을 추출 → 지금 배경(primary)이 가장자리와 충분히 겹치면(로고가
 * 묻히면) 후보를 순서대로 시도해(등번호색 → 검정 → 흰색 → primary의 보색) 가장자리와 안 겹치고
 * 대비도 충분한 첫 번째 색을 --logo-swap-bg CSS 변수로 세팅하고 logo-color-swapped 클래스를
 * 켠다(pickSwapBackground). 대표색 두 개(primary/number)가 전부 로고 자체에 쓰이는 2색 위주
 * 엠블럼에서는 등번호색으로 바꿔도 다시 묻힐 수 있어, 로고에 없을 가능성이 높은 검정/흰색/보색
 * 까지 순서대로 시도한다.
 *
 * 분석 해상도를 로고의 실제 화면 표시 크기(예전 방식)가 아니라 고정값으로 두는 이유: 캠 작은
 * 메뉴 등에서는 로고가 30px 안팎으로 작게 표시되는데, 이 크기 그대로 분석하면 안티앨리어싱이
 * 가장자리 색 구성에서 차지하는 비중이 커져 "묻힘" 판정 비율이 실제 화면 크기에 따라 흔들린다
 * (실측: 같은 로고를 48px로 분석하면 45%인데 31px로 분석하면 39.4%). 고정 해상도 + LogoTrim의
 * 경계값 재사용으로 화면 표시 크기와 무관하게 항상 같은 결과가 나오도록 한다.
 *
 * state.colors는 절대 변경하지 않는다. 설정 화면 색상 피커, 저장값, 전술판 등 다른 화면에는
 * 전혀 영향이 없고 오직 이 카드(.team.home/.team.away)의 화면 표시만 CSS로 바뀐다.
 *
 * 색상 유사도/대비 판정은 utils.js의 teamColorsVisuallySimilar(CIELAB Delta E)와
 * teamColorContrastRatio(WCAG 명도 대비)를 그대로 재사용해 팀 컬러 유사 판정 기준(홈/원정
 * 색상 충돌 감지 등)과 통일한다.
 *
 * 외부에는 render(img, card, background, number, ready)만 공개한다.
 * ready는 LogoTrim이 이 로고의 경계 분석을 끝냈는지 여부이며, 아직이면 분석하지 않는다 —
 * LogoTrim의 캐시된 경계(getCachedBounds)를 재사용해야 정확한 크롭이 가능하기 때문이다.
 */
const ScoreboardLogoContrast = (() => {
  // 이미지 엘리먼트별 진행 상태(요청 키, 캐시된 색상, 재시도 시각, 최신 배경/번호색)를 보관한다.
  // DOM이 제거되면 별도 정리 없이 WeakMap 항목도 함께 해제된다.
  const elements = new WeakMap();
  // 로고 가장자리 전체 가중치 중 어떤 색과 "비슷하다"고 판정된 비중이 이 값 이상이면 그 색을
  // 배경으로 쓸 때 로고가 묻힌다고 판단한다(현재 배경 판정에도, 교체 후보 판정에도 같은 기준을 쓴다).
  // 원래 0.6이었다. 실제 로고 2건(둘 다 방패 전체가 대표색 2개로만 채워진 벨라루스 하위리그
  // 클럽 엠블럼 — Arsenal Dzerzhinsk 45%, Belshina Bobruisk 58%)으로 검증하니 가장자리가 두
  // 대표색으로 거의 반반 갈리는 경우가 흔해 60%는 너무 높았다. 분석 해상도를 고정하기 전에는
  // 화면 표시 크기에 따라 이 비율 자체가 흔들리는 문제도 있었는데(예: 같은 로고가 31px로
  // 표시되면 39.4%까지 떨어짐, ANALYSIS_SIZE 고정 도입으로 해결) 그 여유분까지 감안해 0.3으로 낮췄다.
  const MIN_SIMILAR_SHARE = 0.3;
  // 가장자리 색 분석에 쓰는 고정 Canvas 해상도(정사각형, px). 로고의 실제 화면 표시 크기와
  // 무관하게 항상 이 해상도로 분석해 MIN_SIMILAR_SHARE 판정이 화면 크기에 따라 흔들리지 않게 한다.
  const ANALYSIS_SIZE = 96;
  // "이미 흰 배경이라 검사를 생략해도 되는지" 판정용 — 팀 컬러 간 유사 판정 기준인
  // TEAM_COLOR_SIMILAR_DELTA_E(20)를 그대로 쓰면 크림/베이지처럼 흰색과는 뚜렷이 다른 색까지
  // "거의 흰색"으로 오판한다(예: #ead6be는 흰색과 ΔE 19.85로 20 미만). 실측 사례(Arsenal
  // Dzerzhinsk의 크림색 primary)로 발견 — "육안으로 거의 순백"인 경우만 걸러내도록 훨씬 좁은
  // 값을 쓴다.
  const NEAR_WHITE_DELTA_E = 8;
  // 이미지 분석(CORS 차단, 네트워크 실패 등)이 실패했을 때 재시도까지 대기하는 시간.
  // 매 render 호출마다 재시도하면 실패가 반복될 때마다 요청이 몰릴 수 있어 간격을 둔다.
  const RETRY_MS = 60000;

  /**
   * 로고 이미지에서 "가장자리" 픽셀만 골라 색상별 가중치(투명도 합)를 모은다.
   * 각 행/열에서 처음·마지막으로 보이는(불투명한) 픽셀만 수집한다 —
   * 로고 내부 색상이나 내부 구멍(예: 방패 안쪽 무늬)을 테두리로 오인하지 않기 위해서다.
   * 같은 픽셀이 행 방향·열 방향 양쪽에서 모두 뽑힐 수 있어 Set으로 중복을 제거한다.
   */
  function edgeColors({ data, width, height }) {
    const indices = new Set();
    // 알파값 128(약 50%) 미만인 픽셀은 사실상 안 보이는 것으로 취급해 가장자리 후보에서 제외한다.
    const visible = index => data[index * 4 + 3] >= 128;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (visible(index)) { indices.add(index); break; }
      }
      for (let x = width - 1; x >= 0; x--) {
        const index = y * width + x;
        if (visible(index)) { indices.add(index); break; }
      }
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const index = y * width + x;
        if (visible(index)) { indices.add(index); break; }
      }
      for (let y = height - 1; y >= 0; y--) {
        const index = y * width + x;
        if (visible(index)) { indices.add(index); break; }
      }
    }
    const colors = new Map();
    for (const index of indices) {
      const offset = index * 4;
      const hex = rgbToHex(data[offset], data[offset + 1], data[offset + 2]);
      // 안티앨리어싱 경계의 반투명 픽셀은 완전 불투명 픽셀보다 영향력을 낮춘다(알파 비례 가중치).
      colors.set(hex, (colors.get(hex) || 0) + data[offset + 3] / 255);
    }
    return [...colors];
  }

  /** 가장자리 색상 전체 가중치 중 hex와 "비슷하다"고 판정된 비중(0~1). */
  function edgeSimilarShare(colors, hex) {
    let total = 0, similar = 0;
    for (const [edgeHex, weight] of colors) {
      total += weight;
      if (teamColorsVisuallySimilar(edgeHex, hex)) similar += weight;
    }
    return total > 0 ? similar / total : 0;
  }

  /**
   * candidate를 배경으로 써도 안전한지 — (1) 로고 가장자리 자체에 그 색이 이미 많이 쓰이고
   * 있지 않아야 하고(그렇지 않으면 로고가 새 배경에도 다시 묻힌다), (2) 지금 배경(primary,
   * 교체 후 글자색으로 쓰임)과 대비가 최소 3:1은 나와야 그 위에 primary로 그려질 텍스트가 보인다.
   */
  function isSafeSwapCandidate(colors, background, candidate) {
    if (!candidate) return false;
    if (edgeSimilarShare(colors, candidate) >= MIN_SIMILAR_SHARE) return false;
    return teamColorContrastRatio(background, candidate) >= TEAM_COLOR_MIN_TEXT_CONTRAST;
  }

  /**
   * 가장자리 색상 목록을 보고 이 카드가 배경으로 써야 할 색을 정한다. null이면 지금 배경(primary)
   * 그대로 둔다는 뜻이고, 값이 있으면 render()가 그 색을 --logo-swap-bg로 세팅해 교체한다.
   *
   * 1) 지금 배경이 가장자리와 충분히 겹치지 않으면(로고가 안 묻히면) 그대로 둔다.
   * 2) 묻힌다면 후보를 순서대로 시도한다 — 등번호색(number) → 검정 → 흰색 → primary의 보색.
   *    2색 위주 엠블럼(예: Arsenal Dzerzhinsk — 크림색 바탕에 빨간 장식만 있는 방패)처럼
   *    대표색 두 개(primary/number)가 전부 로고 자체에 실존하는 색인 경우, number로 바꿔도
   *    그 색 역시 로고 가장자리에 이미 널려 있어 다시 묻히는 일이 흔하다 — 그래서 로고에
   *    없을 가능성이 높은 검정/흰색/보색까지 순서대로 더 시도한다.
   * 3) 후보 각각은 isSafeSwapCandidate로 검사해, 가장자리와 안 겹치고 대비도 충분한 첫 번째
   *    후보를 채택한다. 끝까지 하나도 안전하지 않으면 교체를 포기한다(묻힌 채로 두는 게 애매한
   *    색으로 계속 바뀌는 것보다 낫다는 원래 설계 원칙을 유지).
   */
  function pickSwapBackground(colors, background, number) {
    // 로고 구역 배경이 이미 흰색에 가까우면 어떤 로고와도 무난히 구분되므로 검사 자체를 생략한다.
    // FSM(협업 프론트) 이식 후 로고 표시 구역이 항상 흰 배경으로 고정되면
    // 이 조건에 항상 걸려 로직 전체가 자연히 비활성화된다(별도 분기 제거 불필요).
    const whiteDeltaE = teamColorDeltaE(background, '#ffffff');
    if (whiteDeltaE !== null && whiteDeltaE < NEAR_WHITE_DELTA_E) return null;
    if (edgeSimilarShare(colors, background) < MIN_SIMILAR_SHARE) return null;

    const candidates = [number, '#000000', '#ffffff', teamColorComplementHex(background)];
    for (const candidate of candidates) {
      if (isSafeSwapCandidate(colors, background, candidate)) return candidate;
    }
    return null;
  }

  /** 판정 결과를 카드에 반영. swapBg가 있으면 그 색을 --logo-swap-bg로 세팅하고 클래스를 켠다. */
  function applySwapResult(card, swapBg) {
    if (swapBg) {
      card.style.setProperty('--logo-swap-bg', swapBg);
      card.classList.add('logo-color-swapped');
    } else {
      card.style.removeProperty('--logo-swap-bg');
      card.classList.remove('logo-color-swapped');
    }
  }

  /**
   * LogoTrim이 캐시해 둔 경계(bounds — 자신의 분석 캔버스 기준 픽셀 좌표)를 비율로 환산해,
   * 지금 로드한 이미지의 naturalWidth/naturalHeight 기준 크롭 사각형(sx,sy,sw,sh)으로 변환한다.
   * bounds가 없으면(캐시 미스, 완전 투명 이미지 등) 원본 전체를 그대로 쓴다.
   */
  function cropRectFromBounds(bounds, naturalWidth, naturalHeight) {
    if (!bounds) return { sx: 0, sy: 0, sw: naturalWidth, sh: naturalHeight };
    return {
      sx: (bounds.left / bounds.width) * naturalWidth,
      sy: (bounds.top / bounds.height) * naturalHeight,
      sw: ((bounds.right - bounds.left) / bounds.width) * naturalWidth,
      sh: ((bounds.bottom - bounds.top) / bounds.height) * naturalHeight,
    };
  }

  /**
   * 로고 URL을 항상 일정한 해상도(ANALYSIS_SIZE)의 별도 Canvas에 그린 뒤 edgeColors()로
   * 가장자리 색상을 추출한다. LogoTrim의 캐시된 경계로 투명 여백을 먼저 잘라내(cropRectFromBounds)
   * 실제 로고 그림 부분만 이 해상도를 꽉 채우도록 그린다. 화면에 보이는 <img>와는 별개의 Image를
   * 새로 로드하므로 crossOrigin이 필요하며(픽셀을 읽으려면 CORS 허용 응답이 있어야 함), 실패해도
   * 화면 표시(원본 로고)에는 영향이 없다.
   */
  function analyse(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const finish = (error, colors) => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        if (error) reject(error); else resolve(colors);
      };
      // 8초 안에 로드/디코딩이 끝나지 않으면 포기한다 — 느린 네트워크에서 분석이
      // 무한정 대기하며 재시도 큐를 막는 것을 방지한다.
      const timer = setTimeout(() => finish(new Error('Logo contrast timeout')), 8000);
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = ANALYSIS_SIZE;
        canvas.height = ANALYSIS_SIZE;
        try {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const bounds = typeof LogoTrim !== 'undefined' ? LogoTrim.getCachedBounds(url) : null;
          const { sx, sy, sw, sh } = cropRectFromBounds(bounds, image.naturalWidth, image.naturalHeight);
          if (sw > 0 && sh > 0) {
            const scale = Math.min(ANALYSIS_SIZE / sw, ANALYSIS_SIZE / sh);
            const w = sw * scale, h = sh * scale;
            ctx.drawImage(image, sx, sy, sw, sh, (ANALYSIS_SIZE - w) / 2, (ANALYSIS_SIZE - h) / 2, w, h);
          }
          finish(null, edgeColors(ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE)));
        } catch (error) {
          // getImageData는 캔버스가 오염된 경우(CORS 실패 등) SecurityError를 던진다.
          finish(error);
        } finally {
          // 성공/실패와 무관하게 큰 픽셀 버퍼를 즉시 해제한다.
          canvas.width = canvas.height = 0;
        }
      };
      image.onerror = () => finish(new Error('Logo contrast image unavailable'));
      image.src = url;
    });
  }

  /**
   * render()에서 매번 호출되는 진입점. 이미지·크기가 바뀌지 않았으면 캐시된 색상으로
   * 즉시 재판정하고, 바뀌었으면(또는 이전 분석이 재시도 대기 시간을 지났으면) 새로 분석한다.
   *
   * background/number는 분석 여부와 무관하게 항상 최신값으로 갱신한다 —
   * 사용자가 테마 탭에서 색만 바꾼 경우(로고 자체는 그대로) 픽셀을 다시 읽을 필요 없이
   * 캐시된 가장자리 색상으로 즉시 재판정할 수 있어야 하기 때문이다.
   */
  function render(img, card, background, number, ready) {
    if (!img || !card) return;
    const reset = () => applySwapResult(card, null);
    const url = img.getAttribute('src') || '';
    const tracked = elements.get(img);
    // LogoTrim이 아직 이 로고의 경계 분석을 끝내지 못했으면(로딩/분석 중) 대기한다.
    // 로고가 실제로 제거된 경우만 초기화한다.
    if (!ready || !url) {
      if (!url || !tracked || tracked.url !== url) {
        elements.delete(img);
        reset();
      }
      return;
    }

    // 캐시 키는 URL만 쓴다. 분석 해상도가 ANALYSIS_SIZE로 고정돼 있어(화면 표시 크기와 무관)
    // 같은 로고 URL이면 언제 다시 render()가 불려도 같은 결과가 나오므로, 분석은 URL이 실제로
    // 바뀔 때만 다시 수행한다.
    let current = elements.get(img);
    if (!current || current.url !== url) {
      current = { url, colors: null, analyzing: false, retryAt: 0, background, number };
      elements.set(img, current);
      reset();
    }
    current.background = background;
    current.number = number;

    if (current.colors) {
      // 이미 이 URL의 가장자리 색을 알고 있으면 재분석 없이 최신 배경/번호색으로만 재판정한다
      // (테마 탭에서 색만 바꾼 경우 등).
      applySwapResult(card, pickSwapBackground(current.colors, background, number));
      return;
    }
    if (current.analyzing || current.retryAt > Date.now()) return;

    current.analyzing = true;
    const request = current;
    analyse(url).then(colors => {
      request.analyzing = false;
      // 분석 중 로고가 바뀌었으면(URL 변경으로 새 request가 이미 등록됨) 낡은 결과는 버린다.
      if (elements.get(img) !== request) return;
      request.colors = colors;
      applySwapResult(card, pickSwapBackground(colors, request.background, request.number));
    }).catch(() => {
      request.analyzing = false;
      if (elements.get(img) !== request) return;
      // CORS·네트워크 등 일시적 실패는 배경 교체 없이(원본 그대로) 유지하고, 잠시 후 재시도한다.
      request.retryAt = Date.now() + RETRY_MS;
    });
  }

  return { render };
})();
