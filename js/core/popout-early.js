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
    // max-height를 none으로 두면 settings-popup.js의 syncSettingsTabSectionHeights()가
    // getComputedStyle(modal).maxHeight를 숫자로 못 읽어(NaN→0) "실제로 들어갈 수 있는 높이"
    // 계산을 못 해, 모든 탭이 가장 긴 탭(라인업) 높이만큼 강제로 늘어나 짧은 탭에도 불필요한
    // 스크롤이 생겼다 — 100vh는 창을 꽉 채우는 효과는 같으면서 실제 px 숫자로 읽힌다.
    '  max-width: none !important; max-height: 100vh !important;',
    '  border-radius: 0 !important; box-shadow: none !important; border: none !important;',
    '}',
    // 팝업 창은 배율을 1로 고정(위 display-scale.js 참고)해서 실제 창 크기가 작으면
    // body의 레이아웃 폭도 그만큼 작게 잡힌다 — lineup-manual.css의
    // "@container display-viewport (max-width: 900px)"가 이걸 좁은 화면으로 오인해
    // 번호/이름을 세로로 쌓아버리므로, 팝업에서는 원래(넓은 화면용) 배치를 그대로 강제한다.
    'html.is-popout .dp-manual-row { grid-template-columns: 52px 78px minmax(0, 1fr) !important; }',
    'html.is-popout .dp-manual-row.is-injury { grid-template-columns: 72px 72px minmax(0, 1fr) minmax(180px, 240px) !important; }',
    'html.is-popout .dp-slot-label { text-align: center !important; }',
    // 설정 팝업도 같은 이유(팝업 창의 실제 폭이 좁으면 @container 반응형이 "좁은 화면"으로
    // 오인)로 settings-popup.css의 두 반응형 분기(740px/560px)가 오작동할 수 있어, 팝업
    // 창 크기를 자유롭게 줄일 수 있도록 두 분기 모두 무력화하고 원래(데스크톱) 값을 강제한다.
    'html.is-popout .sp-row,',
    'html.is-popout .sp-row:has(.sp-bg-input-cluster) { flex-direction: row !important; align-items: center !important; }',
    // .sp-row-rating-colors는 반응형 분기와 무관하게 원래부터(데스크톱 기본값으로) column
    // 배치다 — 라벨과 색상 그리드를 세로로 쌓아 그리드가 가로 폭을 전부 쓰게 하기 위함.
    // 위 .sp-row 규칙이 이 row에도 걸려 row로 바뀌면 그리드 폭이 좁아져 auto-fit 컬럼이
    // 1개로 줄어버리므로(세로로 길게 쌓임), 같은 우선순위(!important)에서 순서로 다시 되돌린다.
    'html.is-popout .sp-row-rating-colors { flex-direction: column !important; align-items: stretch !important; }',
    'html.is-popout .sp-row-label { max-width: 430px !important; }',
    'html.is-popout .sp-toggle-cluster,',
    'html.is-popout .sp-slider-cluster,',
    'html.is-popout .sp-num-cluster,',
    'html.is-popout .sp-radio-cluster { width: auto !important; }',
    'html.is-popout .sp-file-input { max-width: 320px !important; }',
    'html.is-popout .sp-manual-reset-toggles-nowrap { flex-wrap: nowrap !important; }',
    'html.is-popout .sp-tabs { display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)) !important; overflow-x: visible !important; }',
    'html.is-popout .sp-tab { width: 100% !important; padding-inline: 10px !important; }',
  ].join('\n');
  document.head.appendChild(chromeStyle);

  // 본문이 준비되기 전(위 CSS 적용 + 목표 모달 클릭 시뮬레이션 전) 잠깐의 flash를 가린다.
  // js/core/popout.js가 활성화(activate) 마지막 단계에서 이 스타일만 제거한다.
  var flashStyle = document.createElement('style');
  flashStyle.id = 'popout-early-style';
  flashStyle.textContent = 'body{visibility:hidden !important;}';
  document.head.appendChild(flashStyle);
})();
