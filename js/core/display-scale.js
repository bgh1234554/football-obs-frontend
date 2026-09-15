/**
 * display-scale.js
 * OBS 방송용 1920×1080 기준 UI 배율과 화면을 채우는 레이아웃.
 *
 * 가로 1920px의 기존 UI를 기준으로 전체 배율을 정하고, 높이는 가용 영역을 채운다.
 * 4K에서는 2배, 작은 화면에서는 축소되며 글씨/줄바꿈/패널의 상대 크기는 유지된다.
 * 다른 화면비에서는 패널이 여분의 폭/높이를 채우며 피치/사진의 종횡비는 유지한다.
 *
 * 기준 크기의 레이아웃을 먼저 계산하고, 마지막에 transform으로 화면에 맞춘다.
 * CSS zoom은 글꼴/기본 폼 컨트롤의 레이아웃 반올림까지 바꿔 동일한 배치를 보장하지 못한다.
 * vw/vh와 반응형 규칙도 이 레이아웃 기준을 사용한다(layout.css 참조).
 * DPR에는 OS 배율과 브라우저 줌이 함께 포함된다. 1 미만일 때만 선 두께 보정에 사용한다.
 *
 * head 맨 앞쪽에서 동기 스크립트로 로드해 다른 모듈/본문 레이아웃이 그려지기 전에 적용한다.
 */
(function(){
  if (typeof document === 'undefined' || !document.documentElement) return;
  var displayScale = 1;
  var offsetX = 0, offsetY = 0;
  var baseWidth = 1920;
  // 화면 좌표를 CSS 레이아웃에 다시 넣을 때만 변환한다.
  // 포인터와 DOMRect를 직접 비교하는 히트 테스트는 기존 화면 좌표를 그대로 사용한다.
  /** 화면상의 길이 또는 좌표 차이를 현재 배율로 나눠 레이아웃 단위로 변환한다. */
  window.toDisplayLayoutPixels = function(value){ return value / displayScale; };
  /** 화면상의 점에서 원점 오프셋을 제거하고 배율을 나눠 레이아웃 좌표를 반환한다. */
  window.toDisplayLayoutPoint = function(x, y){
    return { x: (x - offsetX) / displayScale, y: (y - offsetY) / displayScale };
  };
  /** 화면 DOMRect의 위치와 크기를 레이아웃 기준 DOMRect로 변환한다. */
  window.toDisplayLayoutRect = function(rect){
    return new DOMRect((rect.x - offsetX) / displayScale, (rect.y - offsetY) / displayScale,
      rect.width / displayScale, rect.height / displayScale);
  };
  /** 요소의 화면 경계를 측정한 뒤 배율 보정된 레이아웃 좌표로 반환한다. */
  window.getDisplayLayoutRect = function(element){
    return window.toDisplayLayoutRect(element.getBoundingClientRect());
  };
  var root = document.documentElement;
  root.setAttribute('data-display-scaled', '');

  /** 뷰포트와 DPR로 FHD 기준 배율을 계산하고 레이아웃 크기·변환·뷰포트 단위 CSS 변수를 갱신한다. */
  function applyDisplayScale(){
    // 1) 현재 뷰포트와 DPR을 읽는다. 아직 화면 크기를 알 수 없으면 이전 배율을 유지한다.
    var dpr = window.devicePixelRatio;
    if (!Number.isFinite(dpr) || dpr <= 0) dpr = 1;
    var viewport = window.visualViewport;
    var width = viewport ? viewport.width * viewport.scale : window.innerWidth;
    var height = viewport ? viewport.height * viewport.scale : window.innerHeight;
    if (!(width > 0 && height > 0)) return;
    // 2) 가로 1920을 기준으로 배율을 정하고, 세로는 남은 화면을 채우는 논리 높이로 환산한다.
    // 브라우저 주소창 때문에 높이가 줄어도 기존 FHD 글씨/점수판까지 작아지면 안 된다.
    displayScale = width / baseWidth;
    var canvasWidth = width / displayScale;
    var canvasHeight = height / displayScale;
    offsetX = 0;
    offsetY = 0;
    // 3) DPR이 1보다 작을 때 선 두께 보정용 zoom을 분리하고 CSS에 최종 크기·배율을 전달한다.
    // 100% 미만에서는 paint 후 확대 시 최소 1px 테두리도 함께 굵어진다.
    // 이 구간은 layout zoom으로 먼저 확대해 선의 최소 두께 계산 전에 상쇄한다.
    var layoutZoom = dpr < 1 ? 1 / dpr : 1;
    root.style.zoom = layoutZoom === 1 ? '' : String(layoutZoom);
    root.style.setProperty('--display-scale', String(displayScale));
    root.style.setProperty('--display-transform', String(displayScale / layoutZoom));
    root.style.setProperty('--display-left', (offsetX / layoutZoom) + 'px');
    root.style.setProperty('--display-top', (offsetY / layoutZoom) + 'px');
    root.style.setProperty('--display-width', canvasWidth + 'px');
    root.style.setProperty('--display-height', canvasHeight + 'px');
    root.style.setProperty('--display-vw', (canvasWidth / 100) + 'px');
    root.style.setProperty('--display-vh', (canvasHeight / 100) + 'px');
  }

  applyDisplayScale();

  // devicePixelRatio 변화 감지(창을 다른 배율의 모니터로 옮기거나, OS 배율을 실행 중 변경한 경우).
  // transform은 뷰포트 크기를 바꾸지 않는다. 창 크기와 DPR 변경을 각각 반영한다.
  window.addEventListener('resize', applyDisplayScale);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', applyDisplayScale);
  /** 현재 DPR에 대한 미디어 쿼리를 구독하고, 배율이 변하면 새 DPR 기준으로 구독을 교체한다. */
  function watchDpr(){
    var mql = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
    /** 화면 배율을 갱신한 뒤 이전 DPR 리스너를 해제하고 다음 변경을 감시한다. */
    function onChange(){
      applyDisplayScale();
      mql.removeEventListener('change', onChange);
      watchDpr();
    }
    mql.addEventListener('change', onChange);
  }
  if (window.matchMedia) watchDpr();

  // Android는 문서 overflow를 숨겨도 빈 영역의 드래그가 visual viewport로 전달될 수 있다.
  // 실제 스크롤 가능한 패널에 남은 이동 거리가 있을 때만 브라우저의 터치 스크롤을 허용한다.
  var previousTouch = null;
  document.addEventListener('touchstart', function(event){
    var touch = event.touches[0];
    previousTouch = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function(event){
    if (!previousTouch || event.touches.length !== 1) return;
    var touch = event.touches[0];
    var dx = previousTouch.x - touch.clientX;
    var dy = previousTouch.y - touch.clientY;
    previousTouch = { x: touch.clientX, y: touch.clientY };
    if (!dx && !dy) return;
    var horizontal = Math.abs(dx) > Math.abs(dy);
    var delta = horizontal ? dx : dy;
    var path = event.composedPath();
    for (var i = 0; i < path.length; i++) {
      var element = path[i];
      if (element === document.body || element === root) break;
      if (!(element instanceof Element)) continue;
      // 범위 슬라이더의 기본 드래그는 그대로 둔다.
      if (element.matches('input[type="range"]')) return;
      var style = getComputedStyle(element);
      var overflow = horizontal ? style.overflowX : style.overflowY;
      if (!/^(auto|scroll|overlay)$/.test(overflow)) continue;
      var position = horizontal ? element.scrollLeft : element.scrollTop;
      var maximum = horizontal ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight;
      if (maximum > 1 && (delta < 0 ? position > 0 : position < maximum - 1)) return;
    }
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('touchend', function(){ previousTouch = null; }, { passive: true });
  document.addEventListener('touchcancel', function(){ previousTouch = null; }, { passive: true });
})();
