/**
 * 점수판 홈·원정 로고의 바깥 투명 여백을 자동으로 보정한다.
 *
 * 처리 흐름: URL별 캐시 확인 → 필요할 때 픽셀 분석 → 경계 저장 → CSS 크기·중심 보정.
 * Canvas는 경계를 찾는 용도로만 사용하며, 화면에는 원본 PNG/SVG를 계속 표시한다.
 * 따라서 SVG를 PNG로 교체하지 않으며, 로고 내부의 투명한 부분도 그대로 유지된다.
 *
 * 저장 형식: { bounds: { left, top, right, bottom, width, height }, expiresAt }.
 * 좌표는 분석용 이미지의 픽셀 단위이고, CSS 적용 시 비율로 변환한다.
 * 완전히 투명한 이미지의 bounds는 null이다. 분석 실패도 화면에서는 원본으로 처리하지만,
 * 성공 결과와 달리 실패 결과는 localStorage에 저장하지 않고 메모리에서 잠시만 유지한다.
 *
 * 외부에는 render(img, source)만 공개한다. 점수판이 다시 렌더링될 때 호출하면
 * 로고 교체, 중복 분석 방지, 캐시 만료 확인까지 이 모듈 안에서 처리한다.
 */
const LogoTrim = (() => {
  // TTL은 분석 완료 시각부터 30일이다. 읽을 때마다 만료 시각을 연장하지 않는다.
  const TTL = 30 * 24 * 60 * 60 * 1000;
  // 경계 계산이나 저장 형식이 바뀌면 버전을 올려 이전 좌표가 재사용되지 않게 한다.
  const PREFIX = 'football-obs:logo-trim:v1:';
  // URL별 분석 결과: 같은 페이지에서 localStorage 접근과 재분석을 줄인다.
  const memory = new Map();
  // URL별 진행 중인 Promise: 홈·원정이 같은 로고를 요청해도 분석은 한 번만 수행한다.
  const pending = new Map();
  // 이미지 요소별 현재 요청 상태: DOM이 제거되면 별도 정리 없이 참조도 해제된다.
  const elements = new WeakMap();
  // 자동 보정용 속성만 관리한다. 사용자가 지정한 배율·위치 속성은 건드리지 않는다.
  const properties = ['--logo-trim-width', '--logo-trim-height', '--logo-trim-x', '--logo-trim-y'];

  /**
   * 투명하지 않은 모든 픽셀을 감싸는 최소 사각형을 구한다.
   * 네 방향에서 각 행·열 전체를 탐색하는 것과 같은 경계를, 전체 픽셀 한 번 순회로 찾는다.
   * 중앙선만 탐색하거나 가장 큰 덩어리만 선택하지 않으므로 떨어진 별·문자도 포함된다.
   * 알파값이 정확히 0인 픽셀만 제외한다. 알파값 1인 희미한 테두리도 보존 대상이다.
   *
   * left/top은 첫 픽셀을 포함하고, right/bottom은 마지막 픽셀 바로 다음 좌표다.
   * 예: x=10~19에 그림이 있으면 left=10, right=20, 그림의 너비=10이다.
   * 보이는 픽셀이 하나도 없으면 null을 반환해 원본 표시를 유지한다.
   */
  function findBounds({ data, width, height }) {
    let left = width, top = height, right = 0, bottom = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
    return right > left ? { left, top, right, bottom, width, height } : null;
  }

  /** 저장된 좌표가 정수이고 이미지 안에 있는지 확인한다. 빈 이미지의 null도 유효하다. */
  function validBounds(b) {
    return b === null || !!b && ['left', 'top', 'right', 'bottom', 'width', 'height']
      .every(key => Number.isInteger(b[key])) && b.width > 0 && b.height > 0
      && b.left >= 0 && b.top >= 0 && b.left < b.right && b.top < b.bottom
      && b.right <= b.width && b.bottom <= b.height;
  }

  /**
   * 메모리를 우선 확인하고, 없으면 localStorage에서 URL별 결과를 읽는다.
   * localStorage에는 자동 TTL 기능이 없으므로 매번 expiresAt을 직접 검사한다.
   * 만료·손상된 항목은 조회 시 삭제한다. 사용하지 않는 URL을 주기적으로 일괄 삭제하지는 않는다.
   * 현재 시각보다 30일을 넘겨 설정된 만료 시각도 비정상 값으로 보고 재분석한다.
   */
  function readCache(url) {
    let record = memory.get(url);
    // data URL은 이미지 본문까지 키에 들어가 용량을 크게 차지하고,
    // blob URL은 새 세션에서 재사용할 수 없으므로 두 종류는 메모리 캐시만 사용한다.
    const persistent = !/^(data:|blob:)/i.test(url);
    if (!record && persistent) {
      try { record = JSON.parse(localStorage.getItem(PREFIX + url)); } catch (_) { /* 저장소 접근 실패·JSON 손상은 캐시 없음으로 처리 */ }
    }
    if (record && Number.isFinite(record.expiresAt) && record.expiresAt > Date.now()
        && record.expiresAt <= Date.now() + TTL && validBounds(record.bounds)) {
      memory.set(url, record);
      return record;
    }
    memory.delete(url);
    if (persistent) {
      try { localStorage.removeItem(PREFIX + url); } catch (_) { /* 저장소를 사용할 수 없어도 원본 표시와 재분석은 계속 진행 */ }
    }
    return null;
  }

  /**
   * 분석을 마친 시점에 30일 만료 시각을 부여하고 좌표만 저장한다.
   * 저장 용량 초과·접근 제한이 있어도 메모리 결과는 유지해 현재 페이지에서는 재사용한다.
   */
  function writeCache(url, bounds) {
    const record = { bounds, expiresAt: Date.now() + TTL };
    memory.set(url, record);
    if (!/^(data:|blob:)/i.test(url)) {
      try { localStorage.setItem(PREFIX + url, JSON.stringify(record)); } catch (_) { /* 영구 저장 실패 시 메모리 캐시로 계속 동작 */ }
    }
    return record;
  }

  /**
   * 픽셀 분석 전용 이미지 요소를 로드한다. 점수판에 보이는 원본 요소와는 별개다.
   * 외부 이미지의 픽셀을 읽으려면 서버의 CORS 허용이 필요하므로,
   * src를 지정하기 전에 crossOrigin을 설정한다. 실패해도 원본 표시에는 영향을 주지 않는다.
   * 8초 안에 완료되지 않으면 분석을 중단하고, 이벤트 핸들러와 타이머를 정리한다.
   */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const finish = (error) => {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        if (error) reject(error); else resolve(img);
      };
      const timer = setTimeout(() => finish(new Error('Logo trim timeout')), 8000);
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => finish();
      img.onerror = () => finish(new Error('Logo trim image unavailable'));
      img.src = url;
    });
  }

  /** 원본을 임시 Canvas에 그린 뒤 알파 채널로 경계를 찾는다. 분석용 비트맵은 저장하지 않는다. */
  async function analyse(url) {
    const img = await loadImage(url);
    let width = img.naturalWidth, height = img.naturalHeight;
    if (!width || !height) throw new Error('Empty logo dimensions');
    // URL에서 SVG임을 식별할 수 있으면 긴 변을 최소 1024픽셀로 분석한다.
    // 작은 벡터의 별·가는 선을 더 세밀하게 읽기 위한 것이며, 화면에는 원본 SVG를 표시한다.
    // PNG 등 래스터 이미지는 작은 장식이 축소 과정에서 사라지지 않도록 원래 크기로 분석한다.
    if (/\.svg(?:[?#]|$)|^data:image\/svg\+xml/i.test(url)) {
      const scale = Math.max(1, 1024 / Math.max(width, height));
      width = Math.ceil(width * scale);
      height = Math.ceil(height * scale);
    }
    // 지나치게 큰 이미지로 메모리 사용과 메인 스레드 작업이 늘어나는 것을 제한한다.
    // 제한을 넘으면 축소 분석 대신 원본 표시로 돌아가 작은 요소의 누락을 피한다.
    if (width * height > 16 * 1024 * 1024) throw new Error('Logo too large to analyse safely');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);
      return findBounds(ctx.getImageData(0, 0, width, height));
    } finally {
      // 성공·실패와 관계없이 임시 Canvas의 큰 픽셀 버퍼를 해제한다.
      canvas.width = canvas.height = 0;
    }
  }

  /** 유효한 캐시 → 진행 중인 분석 공유 → 새 분석 순서로 결과를 얻는다. */
  function getBounds(url) {
    const cached = readCache(url);
    if (cached) return Promise.resolve(cached);
    if (pending.has(url)) return pending.get(url);
    const task = analyse(url).then(bounds => writeCache(url, bounds)).catch(() => {
      // CORS·네트워크 등의 일시적 실패를 30일 동안 고정하지 않는다.
      // 실패 결과는 메모리에 1분만 두어 반복 요청을 막고, 이후 render 호출 시 재시도한다.
      // 별도 타이머로 1분 뒤 자동 재시도하는 방식은 아니다.
      const retry = { bounds: null, expiresAt: Date.now() + 60000 };
      memory.set(url, retry);
      return retry;
    }).finally(() => pending.delete(url));
    pending.set(url, task);
    return task;
  }

  /** 이전 로고의 자동 크기·중심 보정만 제거한다. 수동 설정과 원본 URL은 유지한다. */
  function clearLayout(img) {
    img.classList.remove('logo-trimmed');
    for (const name of properties) img.style.removeProperty(name);
  }

  /**
   * 경계의 긴 변을 점수판의 정사각형 로고 영역에 맞추고, 보이는 그림의 중심을 정렬한다.
   * 원본 전체의 크기와 위치를 CSS로 조절하므로 SVG의 벡터 표현을 유지할 수 있다.
   * 실제 픽셀 삭제나 clip-path 절단을 하지 않아 분석 경계 밖의 원본 요소도 잘라내지 않는다.
   */
  function applyLayout(img, b) {
    clearLayout(img);
    if (!b) return;
    // 그림의 긴 변 1%를 올림한 값(최소 분석 픽셀 1개)을 안전 여백으로 더한다.
    // 원본 경계까지 이미 그림이 차 있으면 그 방향에는 추가 여백을 만들지 않는다.
    const pad = Math.max(1, Math.ceil(Math.max(b.right - b.left, b.bottom - b.top) * 0.01));
    const left = Math.max(0, b.left - pad), top = Math.max(0, b.top - pad);
    const right = Math.min(b.width, b.right + pad), bottom = Math.min(b.height, b.bottom + pad);
    // 안전 여백을 포함했을 때 원본 전체와 같으면 기존 contain 표시를 그대로 사용한다.
    if (left === 0 && top === 0 && right === b.width && bottom === b.height) return;
    const size = Math.max(right - left, bottom - top);
    // 보정 후 긴 변이 48px 영역을 채우도록 원본 크기를 같은 비율로 조절한다.
    // 양옆 여백만 있는 세로형 로고는 이미 높이가 꽉 차 있으므로 불필요하게 확대되지 않는다.
    img.style.setProperty('--logo-trim-width', `${b.width / size * 100}%`);
    img.style.setProperty('--logo-trim-height', `${b.height / size * 100}%`);
    // 이동량 = 원본 중심 - 보이는 경계의 중심. translate의 % 기준은 이미지 자신의 크기다.
    // 원본 크기로 나누어 백분율로 전달하면 분석 해상도가 달라도 같은 위치로 정렬된다.
    img.style.setProperty('--logo-trim-x', `${(b.width - left - right) / (2 * b.width) * 100}%`);
    img.style.setProperty('--logo-trim-y', `${(b.height - top - bottom) / (2 * b.height) * 100}%`);
    img.classList.add('logo-trimmed');
  }

  /**
   * 점수판 render에서 호출하는 진입점. URL이 바뀌면 이전 보정을 먼저 지우고 원본을 표시한다.
   * 같은 URL의 처리 중·캐시 유효 상태에서는 불필요한 이미지 재설정과 분석을 생략한다.
   * 오래 열린 페이지도 호출 시 만료를 확인하며, 만료 좌표 대신 원본을 표시하면서 재분석한다.
   */
  function render(img, source) {
    if (!img) return;
    const url = String(source || '').trim();
    let current = elements.get(img);
    if (!current || current.url !== url) {
      current = { url, expiresAt: 0, busy: false };
      elements.set(img, current);
      clearLayout(img);
      if (url) img.src = url; else img.removeAttribute('src');
      img.classList.toggle('hidden', !url);
    }
    if (!url || current.busy || current.expiresAt > Date.now()) return;
    // 캐시가 있으면 Promise를 기다리지 않고 즉시 적용해 반복 표시 시 크기 변화를 줄인다.
    const cached = readCache(url);
    if (cached) {
      applyLayout(img, cached.bounds);
      current.expiresAt = cached.expiresAt;
      return;
    }
    clearLayout(img);
    current.busy = true;
    getBounds(url).then(record => {
      // 분석 중 경기가 바뀌거나 로고를 지웠다면 이전 요청의 응답은 적용하지 않는다.
      // URL 문자열뿐 아니라 상태 객체 자체를 비교하므로 A→B→A로 바뀐 경우도 구분된다.
      if (elements.get(img) !== current) return;
      current.busy = false;
      current.expiresAt = record.expiresAt;
      applyLayout(img, record.bounds);
    });
  }

  return { render };
})();
