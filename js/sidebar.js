// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [사이드바] 탭 바를 사이드바 메뉴처럼 열고 닫고, 수동 모드 토글과 기본 단축키를 연결
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function() {
  const backdrop  = document.getElementById('sidebarBackdrop');
  const nav       = document.getElementById('sidebarNav');
  const toggleBtn = document.getElementById('tabsBar');
  const closeBtn  = document.getElementById('sidebarClose');

  /** 사이드바를 화면에 노출하고 접근성 상태를 열린 값으로 바꾼다. */
  function openSidebar() {
    document.body.classList.add('sidebar-open');
    nav.setAttribute('aria-hidden', 'false');
  }

  /** 사이드바를 닫고 접근성 상태를 숨김으로 되돌린다. */
  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    nav.setAttribute('aria-hidden', 'true');
  }

  // 기본 열기/닫기 트리거 연결.
  toggleBtn.addEventListener('click', openSidebar);
  closeBtn.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);

  // 탭 클릭 시 사이드바 닫기
  document.querySelectorAll('.tab[data-page]').forEach(function(btn) {
    btn.addEventListener('click', function() { closeSidebar(); });
  });

  // 사이드바 수동 모드 미러 토글 - 두 체크박스 동기화
  // manualModeToggle은 테마 탭에, sidebarManualMirror는 사이드바에 위치
  // confirm 취소 시 toggleManualMode()가 checked를 false로 되돌리므로 mirror를 재동기화
  var manualCheck   = document.getElementById('manualModeToggle');
  var sidebarMirror = document.getElementById('sidebarManualMirror');
  if (sidebarMirror) {
    sidebarMirror.addEventListener('change', function() {
      if (manualCheck) manualCheck.checked = sidebarMirror.checked;
      toggleManualMode();
      if (manualCheck) sidebarMirror.checked = manualCheck.checked;
    });
  }
  if (manualCheck) {
    manualCheck.addEventListener('change', function() {
      if (sidebarMirror) sidebarMirror.checked = manualCheck.checked;
    });
  }

  // toggleTabsAndPages 패치 — "탭 숨기기/보이기" 텍스트를 "메뉴 바 숨기기/보이기"로 덮어씀
  var _origToggle = window.toggleTabsAndPages;
  window.toggleTabsAndPages = function() {
    _origToggle && _origToggle();
    var btn = document.getElementById('btn-toggle-tabs');
    var bar = document.getElementById('tabsBar');
    if (btn && bar) btn.textContent = bar.style.display === 'none' ? '메뉴 바 보이기 (H)' : '메뉴 바 숨기기 (H)';
  };

  // 키보드 단축키
  document.addEventListener('keydown', function(e) {
    // Esc — 사이드바 닫기
    if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      closeSidebar();
      return;
    }
    // Tab — 사이드바 열기/닫기 (input/textarea/select/button 포커스 중에는 무시)
    if (e.key === 'Tab' && !e.target.matches('input, textarea, select, button')) {
      e.preventDefault();
      document.body.classList.contains('sidebar-open') ? closeSidebar() : openSidebar();
    }
  });
})();
