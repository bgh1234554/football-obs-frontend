// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [팝업 분리 - 조기 감지] head 맨 앞(display-scale.js보다 먼저)에서 동기 실행 —
// body가 파싱/렌더되기 전에 popout 모드를 확정하고, 보드/사이드바/탭/페이지 등
// 팝업에서는 보여줄 필요 없는 UI를 "영구히" 숨기는 CSS를 주입한다.
//
// 이 파일이 붙이는 스타일은 절대 나중에 제거되지 않는다(js/core/popout.js가 부팅 완료 후
// 지우는 건 "본문이 준비될 때까지 잠깐 가리는" 별도의 flash-guard 스타일뿐). 클래스+CSS로만
// 처리해야 js 실행 순서/타이밍에 상관없이 항상 같은 결과가 나온다 — 이전에는 JS로
// el.style.display='none'을 직접 주는 방식이었는데, display-scale.js의 배율 계산과
// 겹치면서 목표 모달만 이상하게 작게/엉뚱한 위치에 뜨는 문제가 있었다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
  var params = new URLSearchParams(window.location.search);
  var popout = params.get('popout');
  if (!popout) return;

  window.__POPOUT_MODE__ = true;
  window.__POPOUT_PARAMS__ = Object.fromEntries(params.entries());

  var root = document.documentElement;
  root.classList.add('is-popout');
  root.classList.add('popout-target-' + popout);

  var chromeStyle = document.createElement('style');
  chromeStyle.id = 'popout-chrome-style';
  chromeStyle.textContent = [
    // 보드/사이드바/탭바/로딩 오버레이는 어떤 팝업 대상이든 항상 숨긴다.
    'html.is-popout #boardStageWrap,',
    'html.is-popout .sidebar-nav,',
    'html.is-popout .sidebar-backdrop,',
    'html.is-popout #tabsBar,',
    'html.is-popout #dpLoading { display: none !important; }',
    // 대시보드 탭 콘텐츠(.pages)는 테마 탭 팝업일 때만 필요하다.
    'html.is-popout .pages { display: none !important; }',
    'html.is-popout.popout-target-theme .pages { display: block !important; }',
    // 모달류(라인업/설정/교체 선택/전술판 이름 입력)는 팝업 창 안에서는 "배경을 어둡게 깐
    // 오버레이 + 가운데 뜬 카드"가 아니라 그 카드 자체가 창 전체를 꽉 채우도록 만든다.
    // 배경이 남아있으면 뒤에 사용자가 설정한 배경 이미지/색이 반투명하게 비쳐 보이고,
    // 배경을 클릭했을 때 되돌아올 트리거가 화면에 하나도 없어 복구할 방법이 없었다.
    'html.is-popout .dp-manual-backdrop,',
    'html.is-popout .sp-backdrop,',
    'html.is-popout .ev-subst-picker-overlay { padding: 0 !important; background: #14161a !important; }',
    'html.is-popout .dp-manual-modal,',
    'html.is-popout .sp-modal,',
    'html.is-popout .ev-subst-picker-modal {',
    '  width: 100% !important; height: 100% !important;',
    '  max-width: none !important; max-height: none !important;',
    '  border-radius: 0 !important; box-shadow: none !important; border: none !important;',
    '}',
    // 팝업 창은 배율을 1로 고정(위 display-scale.js 참고)해서 실제 창 크기가 작으면
    // body의 레이아웃 폭도 그만큼 작게 잡힌다 — lineup-manual.css의
    // "@container display-viewport (max-width: 900px)"가 이걸 좁은 화면으로 오인해
    // 번호/이름을 세로로 쌓아버리므로, 팝업에서는 원래(넓은 화면용) 배치를 그대로 강제한다.
    'html.is-popout .dp-manual-row { grid-template-columns: 52px 78px minmax(0, 1fr) !important; }',
    'html.is-popout .dp-manual-row.is-injury { grid-template-columns: 72px 72px minmax(0, 1fr) minmax(180px, 240px) !important; }',
    'html.is-popout .dp-slot-label { text-align: center !important; }',
  ].join('\n');
  document.head.appendChild(chromeStyle);

  // 본문이 준비되기 전(위 CSS 적용 + 목표 모달 클릭 시뮬레이션 전) 잠깐의 flash를 가린다.
  // js/core/popout.js가 활성화(activate) 마지막 단계에서 이 스타일만 제거한다.
  var flashStyle = document.createElement('style');
  flashStyle.id = 'popout-early-style';
  flashStyle.textContent = 'body{visibility:hidden !important;}';
  document.head.appendChild(flashStyle);
})();
