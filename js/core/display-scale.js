/**
 * display-scale.js
 * Windows 디스플레이 배율(100%/125%/150% 등) 보정.
 *
 * Windows 배율은 Chrome/Edge(OBS Browser Source의 CEF 포함)에서 window.devicePixelRatio에
 * 그대로 반영된다. 배율이 100%보다 높으면 브라우저가 실제로 쓸 수 있는 CSS 논리 픽셀 폭이
 * (물리 해상도 / devicePixelRatio)로 줄어들어, 고정 px로 짜인 레이아웃이 100% 배율일 때보다
 * 좁게 렌더링되어 텍스트 줄바꿈/잘림이 발생한다.
 *
 * <html>에 zoom = 1 / devicePixelRatio를 적용해, 배율과 무관하게 항상 100% 배율 기준과
 * 동일한 논리 픽셀 폭을 페이지에 돌려준다. zoom은 표준 CSS는 아니지만 Chromium 계열
 * (Chrome/Edge/OBS CEF)에서만 동작하면 되는 이 프로젝트 특성상 사용 가능.
 *
 * 방송 결과물(OBS Browser Source로 캡처하는 화면)은 소스에 지정한 해상도로 CEF가 독자
 * 렌더링하므로 이 보정과 원래 무관 — 이건 어디까지나 로컬 브라우저 창에서 작업/테스트할 때
 * 100%처럼 보이게 하기 위한 것.
 *
 * head 맨 앞쪽에서 동기 스크립트로 로드해 다른 모듈/본문 레이아웃이 그려지기 전에 적용한다.
 */
(function(){
  if (typeof document === 'undefined' || !document.documentElement) return;
  if (!('zoom' in document.documentElement.style)) return; // zoom 미지원 브라우저는 그냥 건너뜀

  function applyDisplayScale(){
    var dpr = window.devicePixelRatio;
    if (!dpr || dpr <= 0) dpr = 1;
    const zoom = String(1 / dpr);
    document.documentElement.style.zoom = zoom;
    // vh는 zoom 전 뷰포트 높이이므로 body 높이에도 같은 배율을 보정한다.
    document.documentElement.style.setProperty('--display-zoom', zoom);
  }

  applyDisplayScale();

  // devicePixelRatio 변화 감지(창을 다른 배율의 모니터로 옮기거나, OS 배율을 실행 중 변경한 경우).
  // 일반 resize 이벤트 대신 matchMedia를 쓰는 이유: zoom 적용 자체가 resize를 유발할 수 있어
  // resize 리스너로 재귀 호출될 위험이 있음. matchMedia는 dpr이 실제로 바뀔 때만 발화한다.
  function watchDpr(){
    var mql = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
    function onChange(){
      applyDisplayScale();
      mql.removeEventListener('change', onChange);
      watchDpr();
    }
    mql.addEventListener('change', onChange);
  }
  if (window.matchMedia) watchDpr();
})();
