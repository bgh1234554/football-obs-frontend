/**
 * [로고 픽셀 분석: 여백 경계와 내부 채우기 마스크]
 * logo-trim.js의 메인 스레드 경로와 logo-trim-worker.js의 Worker 경로가 공유하는 계산 모듈이다.
 * DOM/통신/캐시를 다루지 않고 입력 ImageData에서 결과를 만들므로, Worker에서도 importScripts로
 * 같은 기준을 사용할 수 있다. 원본 그림은 변경하지 않고 경계 객체 또는 별도 흰색 마스크를 반환한다.
 *
 * 호출 순서:
 *  1. findBounds로 의미 있는 알파 픽셀을 감싸는 사각형을 구한다. 그림이 없으면 null이다.
 *  2. fillGeometry로 채우기 분석 해상도와 내부 영역의 최소 면적을 구한다.
 *  3. 호출자가 그 크기로 다시 그린 픽셀을 buildFillMask에 전달한다.
 *  4. buildFillMask는 외부 투명 영역과 내부 영역을 나누고, 조건을 만족할 때만 새 마스크를 만든다.
 *
 * findBounds의 알파 임계값은 희미한 여백 잡음 제거용이고, buildFillMask의 임계값은
 * 안쪽/바깥쪽을 나누는 용도이다. 목적이 달라 같은 값으로 통일하면 경계나 채우기 결과가 달라진다.
 */
const LogoTrimAnalysis = (() => {
  // 내부 채우기 색. 협업 프론트(FSM) 로고 구역 배경에 맞추려면 이 값만 바꾸면 된다.
  const FILL_COLOR = [255, 255, 255];
  // 이 알파값 미만이면 "투명"으로 보고 바깥/안쪽 영역 탐색에 포함한다(안티앨리어싱 가장자리 절반 기준).
  const FILL_ALPHA_MAX = 128;
  // 둘러싸인 투명 영역이 로고 그림 경계 면적의 이 비율 이상일 때만 채운다. 실측: USG 링 안쪽
  // 영역 각각 6~8%, FCF 방패 안쪽 약 44%, 반면 왕관 십자가 가운데 같은 작은 구멍은 0.01% 수준.
  // (2026-09-29) 1% -> 0.1%: 이집트 축구협회 로고(검은 빗살로 나뉜 칸들)는 둘러싸인 칸 35개 중
  // 1% 이상은 6개뿐이고 나머지 빗살 사이 칸이 0.19~0.75%라, 일부 칸만 흰색이 되고 나머지는 팀 컬러가
  // 비쳐 얼룩처럼 보였다. 글자 속 구멍(EGYPTIAN FA 등)은 0.02~0.07%로 여전히 채우지 않는다.
  const MIN_FILL_SHARE = 0.001;
  // 안쪽 선 밑 채우기(buildFillMask 4단계)에서 로고 바깥 가장자리로부터 비워 둘 두께(분석 캔버스 긴 변 대비).
  // 1024px 분석 기준 약 20px — 점수판(약 30~50px)으로 줄이면 1px 안팎이라 외곽선만 팀 컬러와 섞인다.
  const OUTER_KEEP_SHARE = 0.02;
  // 채우기 분석 해상도(긴 변 최대 px). 원본이 커도 이 크기로 줄여 메모리/시간을 제한한다.
  // 마스크는 CSS로 다시 늘려 그리고, 경계는 로고의 불투명 테두리 아래에 숨으므로 이 정도면 충분하다.
  const FILL_ANALYSIS_MAX = 1024;

  /**
   * 투명하지 않은 모든 픽셀을 감싸는 최소 사각형을 구한다.
   * 네 방향에서 각 행·열 전체를 탐색하는 것과 같은 경계를, 전체 픽셀 한 번 순회로 찾는다.
   * 중앙선만 탐색하거나 가장 큰 덩어리만 선택하지 않으므로 떨어진 별·문자도 포함된다.
   *
   * (2026-09-22) 원래는 알파값이 정확히 0인 픽셀만 제외했다(알파 1인 희미한 테두리도
   * 보존 대상으로 간주). 그런데 유벤투스 로고(496.png)에서 실측으로 반례가 발견됐다 —
   * 실제 "J" 마크는 캔버스 중앙 29~104 / 18~136 영역에만 있고 그 밖은 완전히 여백인데도,
   * 캔버스 테두리 전체에 알파값 1~2짜리 픽셀이 30개 넘게 흩어져 있어(리사이징/재압축
   * 과정의 아티팩트로 추정) bbox가 캔버스 전체로 잡혀 버렸다. 같은 이미지를 알파 임계값별로
   * 비교하면 1~2에서는 bbox가 캔버스 전체, 5 이상에서는 (29,18,104,136) 부근으로 안정되는
   * 뚜렷한 단절이 있었다 — 즉 1~4는 노이즈, 5 이상부터가 실제 그림이라는 뜻. ALPHA_MIN을
   * 그 단절보다 위, 진짜 안티앨리어싱 테두리(대체로 수십~수백대)보다는 훨씬 아래로 잡아
   * 노이즈만 제외하고 의도된 희미한 테두리/글로우는 그대로 살린다.
   */
  const ALPHA_MIN = 8;
  function findBounds({ data, width, height }) {
    let left = width, top = height, right = 0, bottom = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < ALPHA_MIN) continue;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
    return right > left ? { left, top, right, bottom, width, height } : null;
  }

  /**
   * 테두리/링으로 완전히 둘러싸인 투명 영역을 찾아 FILL_COLOR 마스크 ImageData를 반환한다.
   * minArea 이상의 내부 영역이 하나도 없으면 null이다. 조건을 만족하는 큰 영역이 하나라도
   * 있으면 흰 바탕을 가진 로고로 간주하고, 16px 이상인 작은 내부 영역도 함께 채운다.
   * 따라서 minArea는 모든 칸의 개별 채움 기준이 아니라 로고 전체의 채우기 활성 조건이다.
   * 1) 이미지 가장자리에서 시작해 투명 픽셀만 따라가며 "바깥"을 표시한다.
   * 2) 남은 내부 투명 픽셀을 연결 영역별로 묶어 면적을 기록하고 채우기 가능 여부를 판단한다.
   * 3) 출력용 ImageData를 따로 만든다. 입력 픽셀과 외부/내부 판정 결과는 변경하지 않는다.
   * 4) 외곽선 근처를 제외한 불투명 내부 선 밑과 채울 영역을 칠하고, 불투명 쪽으로만 1px 확장한다.
   *
   * 연결 판정은 상하좌우 네 방향이다. 그 경로로 외부와 이어진 칸은 내부로 보지 않으며,
   * 바깥 투명 영역으로 흰색을 확장하지 않아 축소 표시에서도 외부 흰 테두리가 생기는 것을 줄인다.
   */
  function buildFillMask({ data, width, height }, minArea) {
    const n = width * height;
    const clear = new Uint8Array(n);
    for (let i = 0; i < n; i++) clear[i] = data[i * 4 + 3] < FILL_ALPHA_MAX ? 1 : 0;
    const visited = new Uint8Array(n);
    // 픽셀마다 객체를 만들거나 재귀 호출하지 않고 고정 길이 숫자 배열을 탐색 스택으로 쓴다.
    // push 시 방문 표시를 해 같은 픽셀이 여러 이웃에서 중복 등록되지 않게 한다.
    const stack = new Int32Array(n);
    let sp = 0;
    const push = i => { if (clear[i] && !visited[i]) { visited[i] = 1; stack[sp++] = i; } };
    const flood = collect => {
      while (sp) {
        const i = stack[--sp];
        if (collect) collect(i);
        const x = i % width;
        if (x > 0) push(i - 1);
        if (x < width - 1) push(i + 1);
        if (i >= width) push(i - width);
        if (i < n - width) push(i + width);
      }
    };
    // 1) 바깥 영역
    for (let x = 0; x < width; x++) { push(x); push(n - width + x); }
    for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
    flood(null);
    // 다음 내부 영역 탐색도 visited를 계속 사용하므로, 바깥 영역만 따로 복사해 둔다.
    // 뒤의 외곽 거리 계산에서 내부 구멍을 바깥 여백으로 잘못 취급하지 않기 위해 필요하다.
    const outside = visited.slice();

    // 2) 둘러싸인 영역 중 큰 것만 채움
    // 큰 칸이 하나라도 있으면(= 흰 바탕 위에 그린 로고로 판단) 글자 속 구멍 같은 작은 칸도 같이 채운다
    // (2026-09-29) — 큰 칸만 흰색이고 "EGYPTIAN FA" 글자 구멍엔 팀 컬러가 비치면 오히려 얼룩져 보인다.
    // 큰 칸이 없는 로고는 예전처럼 아무것도 채우지 않는다. 16px 미만은 잡음으로 보고 건너뛴다.
    const mask = new Uint8Array(n);
    const members = new Int32Array(n);
    const regionId = new Int32Array(n);
    const regionSizes = [0];
    let filled = false;
    for (let s = 0; s < n; s++) {
      if (!clear[s] || visited[s]) continue;
      let count = 0;
      push(s);
      flood(i => { members[count++] = i; });
      const id = regionSizes.push(count) - 1;
      for (let k = 0; k < count; k++) regionId[members[k]] = id;
      if (count >= minArea) filled = true;
    }
    if (!filled) return null;
    for (let i = 0; i < n; i++) {
      if (regionId[i] && regionSizes[regionId[i]] >= 16) mask[i] = 1;
    }

    // 3) 출력 마스크를 만든다. 실제 칠하기는 아래 내부 선 처리와 마지막 영역 확장에서 수행한다.
    const out = new ImageData(width, height);
    const [r, g, b] = FILL_COLOR;
    const paint = i => { const o = i * 4; out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = 255; };

    // 4) 로고 안쪽 선/문양 밑에도 흰색을 깐다(2026-09-29). 점수판처럼 작게 줄여 그리면 가는 선(이집트
    //    로고의 검은 빗살 등)은 반투명 픽셀이 되는데, 그 밑이 비어 있으면 팀 컬러가 비쳐 칸 경계가
    //    얼룩져 보였다(채운 칸 옆 1px 확장만으로는 두꺼운 선의 가운데가 비어 있음). 채울 칸이 있는
    //    로고에 한해, 불투명 픽셀 중 바깥(투명 여백)에서 OUTER_KEEP 이상 떨어진 것은 전부 칠한다.
    //    바깥 테두리 근처는 비워 둬, 줄였을 때 로고 외곽선이 흰 테두리 없이 팀 컬러와 자연스럽게 섞이게 한다.
    const keep = Math.max(2, Math.round(Math.max(width, height) * OUTER_KEEP_SHARE));
    const dist = new Uint16Array(n); // 0 = 미방문, 그 외 바깥에서 불투명 픽셀을 따라 잰 거리
    let head = 0; let tail = 0;
    const queue = stack; // 위 flood가 끝나 비어 있으므로 재사용
    const seed = i => { if (!clear[i] && !dist[i]) { dist[i] = 1; queue[tail++] = i; } };
    for (let i = 0; i < n; i++) {
      if (clear[i]) continue;
      const x = i % width;
      const onEdge = x === 0 || x === width - 1 || i < width || i >= n - width;
      if (onEdge || (x > 0 && outside[i - 1]) || (x < width - 1 && outside[i + 1])
        || (i >= width && outside[i - width]) || (i < n - width && outside[i + width])) seed(i);
    }
    while (head < tail) {
      const i = queue[head++];
      if (dist[i] >= keep) continue;
      const x = i % width;
      const step = j => { if (!clear[j] && !dist[j]) { dist[j] = dist[i] + 1; queue[tail++] = j; } };
      if (x > 0) step(i - 1);
      if (x < width - 1) step(i + 1);
      if (i >= width) step(i - width);
      if (i < n - width) step(i + width);
    }
    for (let i = 0; i < n; i++) {
      if (!clear[i] && (!dist[i] || dist[i] >= keep)) paint(i);
    }
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      paint(i);
      const x = i % width;
      if (x > 0 && !clear[i - 1]) paint(i - 1);
      if (x < width - 1 && !clear[i + 1]) paint(i + 1);
      if (i >= width && !clear[i - width]) paint(i - width);
      if (i < n - width && !clear[i + width]) paint(i + width);
    }
    return out;
  }

  /**
   * 내부 채우기 분석 캔버스 크기와 최소 채우기 면적을 구한다. 기준 크기는 경계 분석에 쓴 캔버스 크기
   * (bounds.width/height — SVG는 이미 1024px 이상으로 확대됨)이고, 긴 변이 FILL_ANALYSIS_MAX를 넘으면
   * 그 이하로 줄인다. 최소 면적은 findBounds가 찾은 그림 경계 면적을 같은 비율로 환산해 계산한다.
   *
   * @param {{left:number, top:number, right:number, bottom:number, width:number, height:number}} bounds 경계 분석 결과.
   * @returns {{width:number, height:number, minArea:number}} 채우기 분석 캔버스 크기와 최소 면적.
   */
  function fillGeometry(bounds) {
    // 원본 분석 캔버스의 비율을 유지해 줄이고, 그림 경계 면적도 같은 면적 비율로 환산한다.
    // 긴 변 제한과 최소 16px 조건을 함께 둬 큰 원본의 계산 비용과 아주 작은 잡음 영역을 제한한다.
    const scale = Math.min(1, FILL_ANALYSIS_MAX / Math.max(bounds.width, bounds.height));
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    const areaScale = (width / bounds.width) * (height / bounds.height);
    const minArea = Math.max(16, Math.ceil((bounds.right - bounds.left) * (bounds.bottom - bounds.top) * areaScale * MIN_FILL_SHARE));
    return { width, height, minArea };
  }

  return { findBounds, buildFillMask, fillGeometry };
})();
