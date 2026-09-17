/**
 * 점수판 홈/원정 로고와 카드 배경색이 거의 같아 보여 로고가 배경에 묻히는 경우를 감지하고,
 * 그런 경우에만 그 카드의 배경색과 등번호색을 화면 표시용으로만 맞바꾼다.
 *
 * 처리 흐름: LogoTrim이 trim(투명 여백 제거) 후 실제 표시 크기를 확정한 뒤(ready=true) →
 * 그 표시 크기 그대로 별도 Canvas에 다시 그려 로고 가장자리 픽셀 색을 추출 →
 * 카드 배경색(homeBg/awayBg)·등번호색(homeText/awayText)과의 유사도·대비 비교 →
 * 등번호색을 배경으로 쓰는 쪽이 뚜렷하게 유리할 때만 CSS 클래스(logo-color-swapped)를 토글한다.
 *
 * state.colors는 절대 변경하지 않는다. 설정 화면 색상 피커, 저장값, 전술판 등 다른 화면에는
 * 전혀 영향이 없고 오직 이 카드(.team.home/.team.away)의 화면 표시만 CSS로 바뀐다.
 *
 * 색상 유사도/대비 판정은 utils.js의 teamColorsVisuallySimilar(CIELAB Delta E)와
 * teamColorContrastRatio(WCAG 명도 대비)를 그대로 재사용해 팀 컬러 유사 판정 기준(홈/원정
 * 색상 충돌 감지 등)과 통일한다. 이 파일에서 별도 임계값을 새로 정의하지 않는다.
 *
 * 외부에는 render(img, card, background, number, ready)만 공개한다.
 * ready는 LogoTrim이 이 로고의 최종 표시 크기 계산을 끝냈는지 여부이며, 아직이면 분석하지
 * 않는다 — 표시 크기가 확정되기 전에 그리면 다른 비율로 분석되어 결과가 신뢰할 수 없다.
 */
const ScoreboardLogoContrast = (() => {
  // 이미지 엘리먼트별 진행 상태(요청 키, 캐시된 색상, 재시도 시각, 최신 배경/번호색)를 보관한다.
  // DOM이 제거되면 별도 정리 없이 WeakMap 항목도 함께 해제된다.
  const elements = new WeakMap();
  // 로고 가장자리 전체 가중치 중 배경색과 "비슷하다"고 판정된 비중이 이 값 이상이어야
  // "로고가 배경에 묻힌다"고 판단한다. 가장자리 일부만 우연히 배경과 겹치는 경우(예: 로고 안의
  // 작은 포인트 컬러)까지 교체 대상으로 삼지 않기 위한 안전장치다.
  const MIN_SIMILAR_SHARE = 0.6;
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

  /**
   * 가장자리 색상 목록을 카드 배경색·등번호색과 비교해 "지금 배경 대신 등번호색을 배경으로
   * 써야 하는지" 판정한다. true면 render()가 카드에 logo-color-swapped 클래스를 붙인다.
   */
  function shouldSwap(colors, background, number) {
    // 로고 구역 배경이 이미 흰색에 가까우면 어떤 로고와도 무난히 구분되므로 검사 자체를 생략한다.
    // FSM(협업 프론트) 이식 후 로고 표시 구역이 항상 흰 배경으로 고정되면
    // 이 조건에 항상 걸려 로직 전체가 자연히 비활성화된다(별도 분기 제거 불필요).
    if (teamColorsVisuallySimilar(background, '#ffffff')) return false;
    let total = 0, similar = 0, alternateSimilar = 0, contrast = 0, alternateContrast = 0;
    for (const [hex, weight] of colors) {
      total += weight;
      // 지금 배경(팀 컬러)과 가장자리 색이 비슷한 비중.
      if (teamColorsVisuallySimilar(hex, background)) similar += weight;
      // 교체 후보(등번호색)와 가장자리 색이 비슷한 비중 — 이것도 높으면 바꿔봤자 소용없다.
      if (teamColorsVisuallySimilar(hex, number)) alternateSimilar += weight;
      contrast += teamColorContrastRatio(hex, background) * weight;
      alternateContrast += teamColorContrastRatio(hex, number) * weight;
    }
    // 1) 가장자리의 60% 이상이 지금 배경과 비슷해야 "로고가 묻힌다"고 판단하고,
    // 2) 등번호색으로 바꿨을 때 유사도가 지금보다 낮아야 하며(둘 다 비슷하면 그나마 덜 비슷한
    //    쪽을 배경으로 쓰려는 것이므로 alternateSimilar < similar가 그 조건을 만족시킨다),
    // 3) 대비도 최소 20% 이상 확실히 좋아질 때만 교체한다 — 애매한 차이로 화면이 자주
    //    바뀌는 것을 막기 위한 여유값이다.
    return total > 0 && similar / total >= MIN_SIMILAR_SHARE
      && alternateSimilar < similar && alternateContrast > contrast * 1.2;
  }

  /**
   * 로고 URL을 화면에 실제로 표시되는 width x height 크기 그대로 별도 Canvas에 그린 뒤
   * edgeColors()로 가장자리 색상을 추출한다. 화면에 보이는 <img>와는 별개의 Image를 새로
   * 로드하므로 crossOrigin이 필요하며(픽셀을 읽으려면 CORS 허용 응답이 있어야 함),
   * 실패해도 화면 표시(원본 로고)에는 영향이 없다.
   */
  function analyse(url, width, height) {
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
        canvas.width = width;
        canvas.height = height;
        try {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          // 원본 이미지를 화면과 같은 contain 비율로, 즉 trim·수동 배율·화면 배율까지
          // 반영된 최종 표시 크기 그대로 그린다. 실제로 시청자 눈에 보이는 크기/위치를
          // 기준으로 가장자리를 판정해야 하므로 원본 픽셀 크기로 분석하지 않는다.
          const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
          const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
          ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
          finish(null, edgeColors(ctx.getImageData(0, 0, width, height)));
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
    const reset = () => card.classList.remove('logo-color-swapped');
    const url = img.getAttribute('src') || '';
    const tracked = elements.get(img);
    // LogoTrim이 아직 이 로고의 최종 표시 크기를 확정하지 못했으면(로딩/분석 중) 대기한다.
    // 로고가 실제로 제거된 경우만 초기화한다.
    if (!ready || !url) {
      if (!url || !tracked || tracked.url !== url) {
        elements.delete(img);
        reset();
      }
      return;
    }

    // 캐시 키는 URL만 쓴다 — 예전엔 표시 width/height까지 키에 포함해서, 포메이션 편집 등
    // 레이아웃 재계산으로 로고 박스 폭이 서브픽셀 단위로 흔들릴 때마다(예: 41.6px → 42.1px
    // 같은 반올림 차이) "표시 크기가 바뀌었다"고 오판해 매번 Canvas를 다시 그려 가장자리
    // 픽셀을 재추출했다. 재추출마다 안티앨리어싱 표본이 미세하게 달라져 판정이 실행 중에
    // 스스로 뒤집히거나(대기 중 자연 복귀), 포메이션/닉네임 편집처럼 잦은 재렌더가 몰리는
    // 시점에 눈에 띄게 원래 배경으로 되돌아가는 원인이었다. 같은 로고 URL이면 어떤 CSS
    // 크기로 그려도 가장자리 색 구성(그 결과인 스왑 판정)은 사실상 동일하므로, 분석은
    // URL이 실제로 바뀔 때만 다시 수행하고, width/height는 최초 1회 분석을 그릴 캔버스
    // 크기로만 쓴다.
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
      card.classList.toggle('logo-color-swapped', shouldSwap(current.colors, background, number));
      return;
    }
    if (current.analyzing || current.retryAt > Date.now()) return;

    const rect = img.getBoundingClientRect();
    const width = Math.ceil(rect.width), height = Math.ceil(rect.height);
    // 화면에 아직 자리를 못 잡았으면(레이아웃 재배치 중 잠깐 0px 등) 이번엔 건너뛴다 —
    // retryAt은 그대로 두므로 유효한 크기가 나오는 다음 render() 호출에서 바로 재시도한다.
    // 비정상적으로 큰 수동 확대도 마찬가지로 건너뛴다(메모리/메인 스레드 보호).
    if (!width || !height || width * height > 16 * 1024 * 1024) return;

    current.analyzing = true;
    const request = current;
    analyse(url, width, height).then(colors => {
      request.analyzing = false;
      // 분석 중 로고가 바뀌었으면(URL 변경으로 새 request가 이미 등록됨) 낡은 결과는 버린다.
      if (elements.get(img) !== request) return;
      request.colors = colors;
      card.classList.toggle('logo-color-swapped', shouldSwap(colors, request.background, request.number));
    }).catch(() => {
      request.analyzing = false;
      if (elements.get(img) !== request) return;
      // CORS·네트워크 등 일시적 실패는 배경 교체 없이(원본 그대로) 유지하고, 잠시 후 재시도한다.
      request.retryAt = Date.now() + RETRY_MS;
    });
  }

  return { render };
})();
