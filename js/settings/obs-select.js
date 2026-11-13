/**
 * OBS 브라우저 소스에서 표시되지 않는 네이티브 select 목록을 문서 내부 팝오버로 대체한다.
 *
 * 원본 select와 option은 그대로 두고 선택 결과를 selectedIndex에 돌려준 뒤 기존 input,
 * change 이벤트를 발생시킨다. 따라서 기존 설정 저장 로직을 별도로 구현할 필요가 없다.
 * 일반 브라우저, 비활성 select, 다중 선택, 상시 표시 목록은 원래 동작을 사용하며,
 * 팝오버 API가 없는 환경에서도 네이티브 동작을 가로채지 않는다.
 */
(() => {
  let popup, source;
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
    source = select;
    popup.replaceChildren();
    (select.closest(':popover-open') || document.body).append(popup);
    popup.setAttribute('aria-label', select.getAttribute('aria-label') || select.labels?.[0]?.textContent || '선택 목록');
    [...select.options].forEach((option, index) => {
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
  // mousedown의 네이티브 팝업 실행만 막고 click에서 내부 목록을 엽니다.
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
