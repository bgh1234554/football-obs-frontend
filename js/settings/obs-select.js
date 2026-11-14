/**
 * [OBS 선택 목록: 원본 select와 팝오버 연결]
 * OBS 브라우저 소스에서 표시되지 않는 네이티브 select 목록을 문서 내부 팝오버로 대체한다.
 *
 * 처리 순서:
 *  1. 문서에 위임한 마우스/키 입력에서 OBS 환경과 단일 select 지원 조건을 확인한다.
 *  2. 원본 option을 다시 읽어 하나의 재사용 팝오버에 선택 가능 상태와 현재 선택을 표시한다.
 *  3. 화면 안에 목록을 배치하고 선택 항목으로 포커스를 옮긴다.
 *  4. 선택 결과를 원본 selectedIndex에 반영하고 값이 바뀐 경우만 input/change를 발생시킨다.
 *  5. 닫기 경로에 따라 포커스를 복원하며, 화면 크기/페이지 변경 시에는 이전 목록을 닫는다.
 *
 * 원본 select와 option은 그대로 두고 선택 결과를 selectedIndex에 돌려준 뒤 기존 input,
 * change 이벤트를 발생시킨다. 따라서 기존 설정 저장 로직을 별도로 구현할 필요가 없다.
 * 일반 브라우저, 비활성 select, 다중 선택, 상시 표시 목록은 원래 동작을 사용하며,
 * 팝오버 API가 없는 환경에서도 네이티브 동작을 가로채지 않는다.
 */
(() => {
  let popup, source;
  // 네이티브 목록이 필요한 다중 선택/상시 목록과 비활성 입력은 건드리지 않는다.
  // 이벤트 발생 시마다 검사해 나중에 생성되거나 disabled 상태가 바뀐 select도 현재 상태를 따른다.
  const supported = el => window.obsstudio && typeof HTMLElement.prototype.showPopover === 'function' && el?.matches('select') && !el.disabled && !el.multiple && el.size <= 1;
  /**
   * 현재 팝오버를 닫고 필요하면 원본 select로 포커스를 돌린다.
   * 다른 목록을 열거나 화면 크기가 바뀌는 경로는 focus=false로 이전 입력기에
   * 포커스가 튀지 않게 한다. 원본 DOM이 제거됐으면 포커스를 복원하지 않는다.
   */
  function close(focus = true) {
    popup?.hidePopover();
    if (focus && source?.isConnected) source.focus({ preventScroll: true });
  }
  /**
   * 한 개의 팝오버를 재사용해 지정한 select의 현재 option 목록을 표시한다.
   * 매번 목록을 다시 만들어 설정에 따라 바뀐 옵션, 숨김, optgroup 비활성 상태를 반영한다.
   * 기존 팝오버 안의 select라면 그 팝오버 아래에 붙여 상위 선택 UI가 닫히지 않게 한다.
   * @param {HTMLSelectElement} select 선택 결과를 전달할 원본 입력기.
   * @returns {void}
   */
  function open(select) {
    if (popup?.matches(':popover-open') && source === select) { close(); return; }
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'obs-select-list';
      popup.popover = 'auto';
      popup.setAttribute('role', 'listbox');
      popup.addEventListener('keydown', event => {
        // 팝오버 안의 방향키는 목록 이동에만 쓴다. 문서 단축키로 전파하지 않고,
        // disabled 항목을 제외한 버튼 목록에서 순환하므로 비활성 option에 포커스가 가지 않는다.
        event.stopPropagation();
        if (event.key === 'Escape' || event.key === 'Tab') { close(); if (event.key === 'Escape') event.preventDefault(); return; }
        const items = [...popup.querySelectorAll('button:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        let next;
        if (event.key === 'ArrowDown') next = (index + 1) % items.length;
        if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = items.length - 1;
        if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
      });
      popup.addEventListener('beforetoggle', event => {
        if (event.newState === 'closed') source?.setAttribute('aria-expanded', 'false');
      });
    }
    close(false);
    // 기존 목록을 닫은 다음 source를 바꾼다. 이전 입력의 aria-expanded를 정리한 뒤
    // 새 입력 상태를 연결하며, 상위 팝오버 안에서 열 때는 그 하위에 붙여 부모를 유지한다.
    source = select;
    popup.replaceChildren();
    (select.closest(':popover-open') || document.body).append(popup);
    popup.setAttribute('aria-label', select.getAttribute('aria-label') || select.labels?.[0]?.textContent || '선택 목록');
    [...select.options].forEach((option, index) => {
      // 표시 행 번호가 아니라 원본 options의 인덱스를 유지한다. 숨겨진 option을 제외하거나
      // optgroup이 비활성화되어도 실제 선택값과 표시 버튼이 어긋나지 않게 하기 위함이다.
      const group = option.closest('optgroup');
      if (option.hidden || group?.hidden) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.disabled = option.disabled || !!group?.disabled;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.selected));
      if (group) button.title = group.label;
      button.addEventListener('click', () => {
        // 같은 항목을 다시 고를 때는 저장 이벤트를 중복 발생시키지 않는다. option의
        // 실제 인덱스를 사용해 숨겨진 항목을 제외하고 표시했어도 다른 값이 선택되지 않게 한다.
        const changed = select.selectedIndex !== index;
        select.selectedIndex = index;
        close();
        if (changed) {
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      popup.append(button);
    });
    const rect = select.getBoundingClientRect();
    popup.style.width = `${Math.min(Math.max(rect.width, 160), innerWidth - 16)}px`;
    popup.style.maxHeight = `${Math.min(300, Math.max(rect.top, innerHeight - rect.bottom) - 12)}px`;
    // 팝오버를 연 뒤 실제 높이를 측정해야 화면 아래 공간이 모자랄 때 위쪽에 배치할 수 있다.
    popup.showPopover();
    select.setAttribute('aria-expanded', 'true');
    const box = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - box.width - 8))}px`;
    popup.style.top = `${Math.max(8, rect.bottom + box.height + 4 <= innerHeight ? rect.bottom + 4 : rect.top - box.height - 4)}px`;
    (popup.querySelector('[aria-selected="true"]:not(:disabled)') || popup.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
    popup.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  // 캡처 단계에서 mousedown의 네이티브 팝업 실행을 막고 click에서 문서 내부 목록을 연다.
  // 원본 select를 교체하지 않아 기존 설정 저장 리스너와 동적 생성 입력을 그대로 사용할 수 있다.
  document.addEventListener('mousedown', event => {
    if (event.button === 0 && supported(event.target)) event.preventDefault();
  }, true);
  document.addEventListener('click', event => {
    if (!supported(event.target)) return;
    event.preventDefault(); open(event.target);
  }, true);
  document.addEventListener('keydown', event => {
    if (!supported(event.target) || ![' ', 'Enter', 'ArrowDown', 'ArrowUp', 'F4'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); open(event.target);
  }, true);
  window.addEventListener('resize', () => close(false));
  document.addEventListener('page:activated', () => close(false));
})();
