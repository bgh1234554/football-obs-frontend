/**
 * 점수판 홈·원정 로고의 바깥 투명 여백을 자동으로 보정한다.
 *
 * 처리 흐름: URL별 캐시 확인 → 필요할 때 픽셀 분석 → 경계 저장 → CSS 크기·중심 보정.
 * Canvas는 경계를 찾는 용도로만 사용하며, 화면에는 원본 PNG/SVG를 계속 표시한다.
 * 따라서 SVG를 PNG로 교체하지 않는다.
 *
 * 내부 채우기(2026-09-27): 테두리나 링으로 완전히 둘러싸인 큰 투명 영역(방패 안쪽, 링 안쪽 등)은
 * 흰색(FILL_COLOR)으로 채워 보이게 한다. 원본 이미지는 그대로 두고, 채울 영역만 담은 마스크
 * PNG를 blob URL로 만들어 같은 <img>의 CSS background로 깐다 — 이미지 내용이 배경 위에
 * 그려지므로 원본 로고는 가려지지 않고 투명했던 안쪽만 흰색이 비친다. 글자/문양 속 작은
 * 구멍은 채우지 않도록 로고 면적 대비 MIN_FILL_SHARE 이상인 영역만 채운다.
 *
 * 저장 형식: { bounds: { left, top, right, bottom, width, height }, hasFill, expiresAt }.
 * hasFill은 "채울 영역이 있는 로고인지"만 저장한다. 마스크 자체(blob URL)는 세션을 넘어
 * 재사용할 수 없어 메모리(fills)에만 두고, 새 세션에서 hasFill=true인 로고만 다시 분석한다.
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
  // v2 (2026-09-22): findBounds의 알파 임계값을 0 초과 → ALPHA_MIN(8) 이상으로 변경.
  // v3 (2026-09-27): 내부 채우기 여부(hasFill) 추가 — v2 기록에는 없어 전부 한 번 재분석한다.
  // v4 (2026-09-29): MIN_FILL_SHARE 1% -> 0.1% — v3에서 hasFill=false로 저장된 로고도 다시 분석한다.
  // v5 (2026-09-29): 안쪽 선 밑/작은 칸까지 채우도록 바뀜 + 채우기 분석 예외가 hasFill=false로 30일
  //   고정되던 문제 수정 — v4에서 잘못 저장됐을 수 있는 기록을 버리고 다시 분석한다.
  const PREFIX = 'football-obs:logo-trim:v5:';
  // URL별 분석 결과: 같은 페이지에서 localStorage 접근과 재분석을 줄인다.
  const memory = new Map();
  // URL별 내부 채우기 마스크 blob URL(채울 영역이 없으면 null). 세션 한정이라 메모리에만 둔다.
  const fills = new Map();
  // 예외 목록은 logo-fill-exceptions.js에서 관리한다. 바깥 여백 trim과 중심/크기 보정은 유지한다.
  const FILL_EXCLUDED_URLS = new Set(LOGO_FILL_EXCLUDED_URLS);
  function isFillExcluded(url) {
    // 같은 파일의 쿼리/프래그먼트 변형에도 적용하되, 다른 출처의 동명 파일은 제외하지 않는다.
    return FILL_EXCLUDED_URLS.has(url.split(/[?#]/, 1)[0]);
  }
  // URL별 진행 중인 Promise: 홈·원정이 같은 로고를 요청해도 분석은 한 번만 수행한다.
  const pending = new Map();
  // 캐시 초기화 이후 도착한 이전 분석 결과가 새 캐시에 다시 들어오지 않도록 구분한다.
  let cacheGeneration = 0;
  // 이미지 요소별 현재 요청 상태: DOM이 제거되면 별도 정리 없이 참조도 해제된다.
  let elements = new WeakMap();
  // (2026-09-18 ~ 09-19, 제거됨) 한때 화면의 <img> 요청 URL에 `?logo-v=...` 캐시버스터
  // 쿼리스트링을 붙여, 같은 URL의 CDN 파일이 교체돼도 오래(로고 CDN 응답 헤더 기준 1년)
  // 브라우저에 캐시된 옛 이미지를 계속 쓰지 않게 하려 했다. 세션 단위 랜덤 값(매 페이지
  // 로드마다 그 CDN이 한 번도 못 본 새 URL) → 날짜 단위 고정 값으로 한 번 완화해봤지만,
  // 실제 방송 중 팀 로고가 403으로 깨져서(alt="HOME"/"AWAY" 텍스트가 대체 표시되며 카드
  // 전체가 깨진 것처럼 보임) 새로고침해야만 복구되는 사례가 실측으로 재현됐다 — 값을 날짜
  // 단위로 줄여도 쿼리스트링 자체가 원인일 가능성을 배제할 수 없어, 방송용 도구에서는
  // "로고 갱신이 최대 며칠 늦게 반영될 수 있음"보다 "로고가 방송 중 깨질 수 있음"이 훨씬
  // 치명적이라고 보고 쿼리스트링 부착 자체를 완전히 제거했다. 원본 URL 그대로 요청한다.
  // 실제로 로고 파일이 교체됐을 때 오래된 캐시가 남아있으면, 설정 팝업의 "캐시 초기화"
  // 버튼(clearAppCaches → logoTrimClearCache)으로 trim 분석 캐시는 지울 수 있고, 브라우저
  // 자체의 이미지 HTTP 캐시까지 확실히 비우려면 하드 리프레시(Ctrl+Shift+R)가 필요하다 —
  // 이 문제가 재발하면 이번엔 의도적인 수동 조치이므로 자동 복구가 아니어도 된다.
  // 자동 보정용 속성만 관리한다. 사용자가 지정한 배율·위치 속성은 건드리지 않는다.
  const properties = ['--logo-trim-width', '--logo-trim-height', '--logo-trim-width-factor', '--logo-trim-height-factor', '--logo-fit-aspect', '--logo-fit-width', '--logo-fit-height', '--logo-trim-x', '--logo-trim-y'];

  /**
   * 로드된 로고로 내부 채우기 마스크를 만들어 blob URL로 반환한다. 채울 영역이 없으면 null.
   * 캔버스 크기와 최소 면적은 LogoTrimAnalysis.fillGeometry가 정한다(메인 스레드 경로, Worker를 못 쓸 때).
   */
  async function buildFillUrl(img, bounds) {
    if (!bounds) return null;
    const { width, height, minArea } = LogoTrimAnalysis.fillGeometry(bounds);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);
      const mask = LogoTrimAnalysis.buildFillMask(ctx.getImageData(0, 0, width, height), minArea);
      if (!mask) return null;
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(mask, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return blob ? URL.createObjectURL(blob) : null;
    } finally {
      canvas.width = canvas.height = 0;
    }
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
        && record.expiresAt <= Date.now() + TTL && validBounds(record.bounds)
        && typeof record.hasFill === 'boolean') {
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
  function writeCache(url, bounds, hasFill) {
    const record = { bounds, hasFill: !!hasFill, expiresAt: Date.now() + TTL };
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

  /**
   * 원본을 임시 Canvas에 그린 뒤 알파 채널로 경계를 찾고, 이어서 내부 채우기 마스크를 만든다.
   * 분석용 비트맵은 저장하지 않는다. 반환: { bounds, fillUrl, fillFailed }.
   * 채우기 마스크 생성이 실패해도 경계 결과는 살린다(채우기만 생략).
   * (2026-10-17) 가능하면 픽셀 계산을 Web Worker(logo-trim-worker.js)에서 하고, Worker를 쓸 수 없거나
   * 실패하면 같은 계산을 메인 스레드에서 한다. 두 경로는 같은 크기로 그린 같은 픽셀을 같은 함수로 분석한다.
   */
  async function analyse(url) {
    if (workerUsable() && !isSvgUrl(url)) {
      // PNG 등 래스터 로고는 받기·디코딩·분석을 모두 Worker에서 한다.
      try {
        return await requestWorker({ url, fill: !isFillExcluded(url) }, []);
      } catch (error) {
        console.warn('[LogoTrim] Worker 분석 실패, 메인 스레드로 분석', url, error);
      }
    }
    const img = await loadImage(url);
    const { width, height } = analysisSize(img, url);
    if (workerUsable() && isSvgUrl(url)) {
      try {
        return await analyseInWorker(img, url, width, height);
      } catch (error) {
        // Worker 경로가 실패하면 결과를 버리고 메인 스레드에서 다시 분석한다(표시 결과는 같다).
        console.warn('[LogoTrim] Worker 분석 실패, 메인 스레드로 분석', url, error);
      }
    }
    const bounds = analyseBounds(img, width, height);
    let fillUrl = null;
    let fillFailed = false;
    try {
      if (!isFillExcluded(url)) fillUrl = await buildFillUrl(img, bounds);
    } catch (error) {
      // 채우기 실패는 원본 표시로 대체하되, "채울 칸 없음"으로 30일 저장하지 않도록 표시한다(getBounds).
      fillFailed = true;
      console.warn('[LogoTrim] 내부 채우기 분석 실패', url, error);
    }
    return { bounds, fillUrl, fillFailed };
  }

  /**
   * 경계 분석 캔버스 크기를 정한다.
   * URL에서 SVG임을 식별할 수 있으면 긴 변을 최소 1024픽셀로 분석한다.
   * 작은 벡터의 별·가는 선을 더 세밀하게 읽기 위한 것이며, 화면에는 원본 SVG를 표시한다.
   * PNG 등 래스터 이미지는 작은 장식이 축소 과정에서 사라지지 않도록 원래 크기로 분석한다.
   * 지나치게 큰 이미지로 메모리 사용과 작업이 늘어나는 것을 제한한다.
   * 제한을 넘으면 축소 분석 대신 원본 표시로 돌아가 작은 요소의 누락을 피한다.
   */
  function analysisSize(img, url) {
    let width = img.naturalWidth, height = img.naturalHeight;
    if (!width || !height) throw new Error('Empty logo dimensions');
    if (isSvgUrl(url)) {
      const scale = Math.max(1, 1024 / Math.max(width, height));
      width = Math.ceil(width * scale);
      height = Math.ceil(height * scale);
    }
    if (width * height > 16 * 1024 * 1024) throw new Error('Logo too large to analyse safely');
    return { width, height };
  }

  /** URL만으로 SVG인지 판단한다. SVG는 Worker에서 그릴 수 없어 메인 스레드가 래스터로 그려 넘긴다. */
  function isSvgUrl(url) {
    return /\.svg(?:[?#]|$)|^data:image\/svg\+xml/i.test(url);
  }

  /** 원본을 임시 Canvas에 그린 뒤 알파 채널로 경계를 찾는다(메인 스레드 경로). */
  function analyseBounds(img, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);
      return LogoTrimAnalysis.findBounds(ctx.getImageData(0, 0, width, height));
    } finally {
      // 성공·실패와 관계없이 임시 Canvas의 큰 픽셀 버퍼를 해제한다.
      canvas.width = canvas.height = 0;
    }
  }

  // ── Web Worker 경로(2026-10-17) ─────────────────────────────────────────
  // 처음 보는 로고마다 메인 스레드에서 픽셀을 읽고(getImageData) 경계·채우기 마스크를 계산하면 로고 하나에
  // 약 100ms 화면이 멈췄다. 새 경기를 불러오면 로고 이미지가 점수판 테마 전환 애니메이션(0.9초) 도중에
  // 도착하는 일이 잦아 전환이 끊겼다(Vercel/로컬 공통, 이미지 캐시가 없는 첫 로딩에서만 "가끔").
  // PNG 등 래스터 로고는 Worker가 직접 받아 디코딩까지 한다(메인 스레드에서 디코딩하면 로고당 수십~100ms가 남았다).
  // SVG는 Worker에서 그릴 수 없어 메인 스레드가 분석 크기로 그려 ImageBitmap으로 넘기고, 픽셀 계산만 Worker가 한다.
  // 브라우저 기본 기능이라 별도 창이나 설치가 필요 없고, 지원하지 않으면 메인 스레드 경로를 쓴다.
  const WORKER_URL = document.currentScript ? new URL('logo-trim-worker.js', document.currentScript.src).href : null;
  let worker = null;
  let workerBroken = false;
  let workerSeq = 0;
  const workerRequests = new Map();
  /** Worker와 OffscreenCanvas, ImageBitmap을 모두 쓸 수 있고 이전에 Worker 생성이 실패하지 않았는지. */
  function workerUsable() {
    return !workerBroken && !!WORKER_URL && typeof Worker === 'function'
      && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';
  }
  /** Worker를 처음 필요할 때 만든다. 생성·스크립트 오류가 나면 이후로는 메인 스레드 경로만 쓴다. */
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL);
    worker.onmessage = ({ data }) => {
      const request = workerRequests.get(data.id);
      if (!request) return;
      workerRequests.delete(data.id);
      clearTimeout(request.timer);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data);
    };
    worker.onerror = event => {
      workerBroken = true;
      for (const request of workerRequests.values()) { clearTimeout(request.timer); request.reject(new Error(event.message || 'Logo trim worker error')); }
      workerRequests.clear();
      worker.terminate();
      worker = null;
    };
    return worker;
  }
  /** 로고를 지정 크기 캔버스에 그린 뒤(메인 스레드 경로와 같은 drawImage) ImageBitmap으로 복사한다. */
  async function bitmapAt(img, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      return await createImageBitmap(canvas);
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  /** SVG 로고를 분석 크기로 그려 Worker에 넘기고 { bounds, fillUrl, fillFailed }를 돌려받는다. */
  async function analyseInWorker(img, url, width, height) {
    const fill = !isFillExcluded(url);
    // 채우기 분석 크기는 경계 결과와 무관하게 캔버스 크기로만 정해지므로 미리 계산한다.
    const geometry = LogoTrimAnalysis.fillGeometry({ left: 0, top: 0, right: width, bottom: height, width, height });
    const bitmap = await bitmapAt(img, width, height);
    const fillBitmap = fill && (geometry.width !== width || geometry.height !== height)
      ? await bitmapAt(img, geometry.width, geometry.height) : null;
    return requestWorker({ bitmap, width, height, fill, fillBitmap }, fillBitmap ? [bitmap, fillBitmap] : [bitmap], url);
  }
  /** Worker에 요청을 보내고 결과를 받는다. 8초 안에 답이 없으면 실패로 본다(이미지 로딩 제한과 같음). */
  async function requestWorker(message, transfer, url = message.url) {
    const id = ++workerSeq;
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { workerRequests.delete(id); reject(new Error('Logo trim worker timeout')); }, 8000);
      workerRequests.set(id, { resolve, reject, timer });
      try {
        getWorker().postMessage({ id, ...message }, transfer);
      } catch (error) {
        workerBroken = true;
        workerRequests.delete(id);
        clearTimeout(timer);
        message.bitmap?.close();
        message.fillBitmap?.close();
        reject(error);
      }
    });
    if (reply.fillFailed) console.warn('[LogoTrim] 내부 채우기 분석 실패', url);
    return { bounds: reply.bounds, fillUrl: reply.blob ? URL.createObjectURL(reply.blob) : null, fillFailed: reply.fillFailed };
  }

  /**
   * 화면 적용에 바로 쓸 수 있는 캐시만 반환한다. 채울 영역이 있는 로고(hasFill)인데 이번 세션에
   * 마스크가 아직 없으면(새로고침 직후 등) 경계만으로는 부족하므로 캐시 미스로 보고 재분석한다.
   * localStorage 기록 자체는 유효하므로 지우지 않는다.
   */
  function usableCache(url) {
    const cached = readCache(url);
    // 예외 추가 전에 hasFill=true로 저장됐어도 경계 캐시는 재사용하고 채우기 재분석은 생략한다.
    if (cached && cached.hasFill && !isFillExcluded(url) && !fills.has(url)) return null;
    return cached;
  }

  /** 유효한 캐시 → 진행 중인 분석 공유 → 새 분석 순서로 경계를 얻는다. */
  function getBounds(url) {
    const cached = usableCache(url);
    if (cached) return Promise.resolve(cached);
    if (pending.has(url)) return pending.get(url);
    const generation = cacheGeneration;
    const task = analyse(url).then(({ bounds, fillUrl, fillFailed }) => {
      if (generation !== cacheGeneration) {
        if (fillUrl) URL.revokeObjectURL(fillUrl);
        return { bounds, hasFill: false, expiresAt: Date.now() + TTL };
      }
      if (fillFailed) {
        // 채우기 분석이 예외로 실패하면 경계만 쓰고 1분 뒤 다시 시도한다(영구 저장 안 함).
        const retry = { bounds, hasFill: false, expiresAt: Date.now() + 60000 };
        memory.set(url, retry);
        return retry;
      }
      fills.set(url, fillUrl);
      return writeCache(url, bounds, !!fillUrl);
    }).catch(() => {
      // CORS·네트워크 등의 일시적 실패를 30일 동안 고정하지 않는다.
      // 실패 결과는 메모리에 1분만 두어 반복 요청을 막고, 이후 render 호출 시 재시도한다.
      // 별도 타이머로 1분 뒤 자동 재시도하는 방식은 아니다.
      const retry = { bounds: null, hasFill: false, expiresAt: Date.now() + 60000 };
      if (generation === cacheGeneration) memory.set(url, retry);
      return retry;
    }).finally(() => {
      if (pending.get(url) === task) pending.delete(url);
    });
    pending.set(url, task);
    return task;
  }

  /** 이전 로고의 자동 크기·중심 보정만 제거한다. 수동 설정과 원본 URL은 유지한다. */
  function clearLayout(img) {
    img.classList.remove('logo-trimmed', 'logo-filled');
    for (const name of properties) img.style.removeProperty(name);
    for (const name of ['background-image', 'background-size', 'background-position', 'background-repeat']) {
      img.style.removeProperty(name);
    }
  }

  /**
   * 내부 채우기 마스크를 <img>의 배경으로 깐다. 이미지 내용은 배경 위에 그려지므로 원본 로고는
   * 그대로 보이고 투명했던 안쪽에만 흰색이 비친다. 마스크는 원본과 같은 종횡비라
   * object-fit:contain과 같은 규칙(background-size:contain + 가운데 정렬)으로 맞추면
   * trim 보정/SVG 100% 박스 여부와 무관하게 로고와 정확히 겹친다.
   */
  function applyFill(img, url) {
    if (isFillExcluded(url)) return;
    const fillUrl = fills.get(url);
    if (!fillUrl) return;
    img.style.backgroundImage = `url("${fillUrl}")`;
    img.style.backgroundSize = 'contain';
    img.style.backgroundPosition = 'center';
    img.style.backgroundRepeat = 'no-repeat';
    img.classList.add('logo-filled');
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
    // 직사각형 표시 칸에도 원본 비율을 유지하며 보이는 경계를 맞춥니다.
    img.style.setProperty('--logo-fit-aspect', String(b.width / b.height));
    img.style.setProperty('--logo-fit-width', String(b.width / (right - left)));
    img.style.setProperty('--logo-fit-height', String(b.height / (bottom - top)));
    // 안전 여백을 포함했을 때 원본 전체와 같으면 기존 contain 표시를 그대로 사용한다.
    if (left === 0 && top === 0 && right === b.width && bottom === b.height) return;
    const size = Math.max(right - left, bottom - top);
    // 보정 후 긴 변이 48px 영역을 채우도록 원본 크기를 같은 비율로 조절한다.
    // 양옆 여백만 있는 세로형 로고는 이미 높이가 꽉 차 있으므로 불필요하게 확대되지 않는다.
    img.style.setProperty('--logo-trim-width', `${b.width / size * 100}%`);
    img.style.setProperty('--logo-trim-height', `${b.height / size * 100}%`);
    img.style.setProperty('--logo-trim-width-factor', String(b.width / size));
    img.style.setProperty('--logo-trim-height-factor', String(b.height / size));
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
  function render(img, source, onReady) {
    if (!img) return;
    const url = String(source || '').trim();
    let current = elements.get(img);
    if (!current || current.url !== url) {
      current = { url, expiresAt: 0, busy: false, ready: false, loadRetried: false };
      elements.set(img, current);
      clearLayout(img);
      if (url) img.src = url; else img.removeAttribute('src');
      img.classList.toggle('hidden', !url);
      // 화면에 실제로 보이는 <img> 자체가 로드 실패(네트워크 순단, CDN 일시 오류 등)하면
      // 새로고침 없이도 스스로 한 번 복구를 시도한다 — src를 비웠다가 그대로 다시 대입해
      // 브라우저가 같은 URL로 새 요청을 보내도록 강제한다(값이 그대로면 재요청을 안 하는
      // 브라우저가 있어 한 프레임 비워야 함). 무한 재시도를 막기 위해 요소당 1회만 시도한다.
      if (url) {
        img.addEventListener('error', function onLoadError() {
          img.removeEventListener('error', onLoadError);
          if (elements.get(img) !== current || current.loadRetried) return;
          current.loadRetried = true;
          img.removeAttribute('src');
          requestAnimationFrame(() => { if (elements.get(img) === current) img.src = url; });
        }, { once: true });
      }
    }
    // 항상 최신 렌더의 콜백을 사용한다. 분석 중 색상만 바뀌어도 이전 색을 적용하지 않는다.
    current.onReady = onReady;
    if (!url || current.busy || current.expiresAt > Date.now()) {
      current.onReady?.(current.ready);
      return;
    }
    // 캐시가 있으면 Promise를 기다리지 않고 즉시 적용해 반복 표시 시 크기 변화를 줄인다.
    const cached = usableCache(url);
    if (cached) {
      applyLayout(img, cached.bounds);
      applyFill(img, url);
      current.expiresAt = cached.expiresAt;
      current.ready = !!cached.bounds;
      current.onReady?.(current.ready);
      return;
    }
    clearLayout(img);
    current.busy = true;
    current.ready = false;
    current.onReady?.(false);
    getBounds(url).then(record => {
      // 분석 중 경기가 바뀌거나 로고를 지웠다면 이전 요청의 응답은 적용하지 않는다.
      // URL 문자열뿐 아니라 상태 객체 자체를 비교하므로 A→B→A로 바뀐 경우도 구분된다.
      if (elements.get(img) !== current) return;
      current.busy = false;
      current.expiresAt = record.expiresAt;
      applyLayout(img, record.bounds);
      applyFill(img, url);
      current.ready = !!record.bounds;
      current.onReady?.(current.ready);
    });
  }

  /** localStorage와 현재 페이지 메모리에 저장된 투명 여백 분석 결과를 모두 삭제한다. */
  function clearCache() {
    cacheGeneration += 1;
    memory.clear();
    pending.clear();
    // 이미 화면에 깔린 마스크는 elements 초기화 후 다음 render에서 새 URL로 교체된다.
    for (const fillUrl of fills.values()) if (fillUrl) URL.revokeObjectURL(fillUrl);
    fills.clear();
    elements = new WeakMap();
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
      }
    } catch (_) { /* 저장소 접근이 제한돼도 메모리 캐시는 초기화한다. */ }
  }

  /**
   * 이미 분석이 끝나 캐시된 경계(bounds)를 동기적으로 반환한다. 새 분석은 시작하지 않는다
   * — render()가 ready=true를 넘겨준 시점이면 이미 캐시가 있다고 보고 호출하는 용도.
   * scoreboard-logo-contrast.js가 자기 분석 캔버스를 로고의 실제 화면 표시 크기가 아니라
   * 항상 일정한 해상도로 그리면서, 투명 여백은 이 경계만큼 잘라내 같은 비율로 재사용한다.
   * bounds의 left/top/right/bottom/width/height는 이 모듈이 분석에 사용한 캔버스 기준
   * 픽셀 좌표이므로, 호출부는 자신의 이미지 크기에 맞춰 비율(0~1)로 환산해서 써야 한다.
   * 캐시가 없거나 완전 투명한 이미지(bounds=null)면 null.
   */
  function getCachedBounds(url) {
    const record = readCache(String(url || '').trim());
    return record ? record.bounds : null;
  }

  window.logoTrimClearCache = clearCache;
  return { render, clearCache, getCachedBounds };
})();
