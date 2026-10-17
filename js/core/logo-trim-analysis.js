/**
 * 로고 픽셀 분석 공용 함수(logo-trim.js 메인 스레드 경로와 logo-trim-worker.js 백그라운드 경로가 함께 사용).
 * 화면(DOM)에 접근하지 않는 순수 계산만 둔다 — 같은 코드를 Web Worker에서 importScripts로 불러 쓰기 위해서다.
 * (2026-10-17) logo-trim.js 안에 있던 경계 탐색(findBounds)·내부 채우기 마스크(buildFillMask)와
 * 관련 상수를 그대로 옮겼다. 계산 내용은 바뀌지 않았다.
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
   * 테두리/링으로 완전히 둘러싸인 큰 투명 영역을 찾아, 그 영역만 FILL_COLOR로 칠한 마스크
   * ImageData를 반환한다. 채울 영역이 없으면 null.
   * 1) 이미지 가장자리에서 시작해 투명 픽셀만 따라가며 "바깥"을 표시한다.
   * 2) 남은 투명 픽셀을 연결 영역별로 묶고, 면적이 minArea 이상인 영역만 채운다.
   *    테두리가 한 군데라도 끊겨 있으면 안쪽이 바깥과 이어져 채우지 않는다(원본 그대로 = 안전한 실패).
   * 3) 채운 영역을 불투명 픽셀 쪽으로만 1px 넓혀, 안티앨리어싱된 테두리 안쪽 가장자리 밑까지
   *    흰색이 깔리게 한다. 투명한 바깥 쪽으로는 넓히지 않아 로고 밖으로 흰 테두리가 새지 않는다.
   */
  function buildFillMask({ data, width, height }, minArea) {
    const n = width * height;
    const clear = new Uint8Array(n);
    for (let i = 0; i < n; i++) clear[i] = data[i * 4 + 3] < FILL_ALPHA_MAX ? 1 : 0;
    const visited = new Uint8Array(n);
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

    // 3) 불투명 쪽으로만 1px 확장해 출력
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
    const scale = Math.min(1, FILL_ANALYSIS_MAX / Math.max(bounds.width, bounds.height));
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    const areaScale = (width / bounds.width) * (height / bounds.height);
    const minArea = Math.max(16, Math.ceil((bounds.right - bounds.left) * (bounds.bottom - bounds.top) * areaScale * MIN_FILL_SHARE));
    return { width, height, minArea };
  }

  return { findBounds, buildFillMask, fillGeometry };
})();
