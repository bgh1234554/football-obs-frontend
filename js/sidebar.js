(function() {
  const backdrop  = document.getElementById('sidebarBackdrop');
  const nav       = document.getElementById('sidebarNav');
  const toggleBtn = document.getElementById('tabsBar');
  const closeBtn  = document.getElementById('sidebarClose');

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    nav.setAttribute('aria-hidden', 'false');
  }
  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    nav.setAttribute('aria-hidden', 'true');
  }

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
