// OBS에서 표시되지 않는 네이티브 선택 목록을 문서 내부 목록으로 대체합니다.
(() => {
  let popup, source;
  const supported = el => window.obsstudio && el?.matches('select') && !el.disabled && !el.multiple && el.size <= 1;
  function close(focus = true) {
    popup?.hidePopover();
    if (focus && source?.isConnected) source.focus({ preventScroll: true });
  }
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
