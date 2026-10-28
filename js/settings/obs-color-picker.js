// OBS의 네이티브 색상 창 대신 문서 안에서 색을 고릅니다.
(() => {
  let picker, target, hue = 0, saturation = 0, brightness = 1;
  let frame = 0, dragging = false, committedColor = '', previewColor = '';
  const rgb = () => {
    const channel = n => {
      const k = (n + hue / 60) % 6;
      return Math.round(255 * brightness * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return [channel(5), channel(3), channel(1)];
  };
  const color = () => '#' + rgb().map(c => c.toString(16).padStart(2, '0')).join('');
  function read(value) {
    const [r, g, b] = value.match(/[0-9a-f]{2}/gi).map(c => parseInt(c, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta) hue = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
    saturation = max ? delta / max : 0;
    brightness = max;
  }
  function paint() {
    const channels = rgb();
    const value = '#' + channels.map(c => c.toString(16).padStart(2, '0')).join('');
    picker.style.setProperty('--picker-hue', `hsl(${hue} 100% 50%)`);
    picker.querySelector('.obs-color-point').style.cssText = `left:${saturation * 100}%;top:${(1 - brightness) * 100}%`;
    picker.querySelector('[data-picker-hue]').value = 360 - hue;
    picker.querySelector('[data-picker-hex]').value = value;
    picker.querySelector('.obs-color-sample').style.background = value;
    picker.querySelectorAll('[data-picker-rgb]').forEach((input, index) => { input.value = channels[index]; });
    const lightness = brightness * (1 - saturation / 2);
    const hslSaturation = lightness === 0 || lightness === 1 ? 0 : (brightness - lightness) / Math.min(lightness, 1 - lightness);
    [hue, hslSaturation * 100, lightness * 100].forEach((value, index) => {
      picker.querySelector(`[data-picker-hsl="${index}"]`).value = Math.round(value);
    });
  }
  function commit(final = true) {
    if (!target?.isConnected) return;
    const value = color();
    target.value = value;
    if (previewColor !== value) {
      previewColor = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // 모든 색상은 input으로만 미리보기하고 드래그 종료 시 한 번 저장합니다.
    if (final && committedColor !== value) {
      committedColor = value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function queuePreview() {
    dragging = true;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; paint(); commit(false); });
  }
  function finishDrag() {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(frame); frame = 0;
    paint(); commit();
  }
  function close() { finishDrag(); picker.hidePopover(); target?.focus({ preventScroll: true }); }
  function create() {
    picker = document.createElement('div');
    picker.id = 'obsColorPicker';
    picker.setAttribute('popover', 'auto');
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', '색상 선택');
    picker.innerHTML = `
      <div class="obs-color-plane" tabindex="0" role="group" aria-label="채도와 밝기, 방향키로 조절"><span class="obs-color-point"></span></div>
      <div class="obs-color-tools"><button type="button" class="obs-color-eyedropper" aria-label="화면에서 색상 선택" title="화면에서 색상 선택"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="m16 2 6 6-2 2-2-2-9 9-1 4-5 1 1-5 9-9-2-2 2-2 2 2zM6 17l-.5 2.5L8 19l8.5-8.5-2-2z"/></svg></button><span class="obs-color-sample" aria-label="선택한 색상"></span><input aria-label="색조" data-picker-hue type="range" min="0" max="360" step="1"></div>
      <div class="obs-color-fields">
        <div class="obs-color-values" data-picker-fields="hex" hidden><label><input aria-label="HEX" data-picker-hex type="text" maxlength="7" spellcheck="false"><span>HEX</span></label></div>
        <div class="obs-color-values" data-picker-fields="rgb">${['R', 'G', 'B'].map((name, i) => `<label><input aria-label="${name}" data-picker-rgb="${i}" type="number" min="0" max="255" step="1"><span>${name}</span></label>`).join('')}</div>
        <div class="obs-color-values" data-picker-fields="hsl" hidden>${['H', 'S', 'L'].map((name, i) => `<label><input aria-label="${name}" data-picker-hsl="${i}" type="number" min="0" max="${i ? 100 : 360}" step="1"><span>${name}</span></label>`).join('')}</div>
        <button type="button" class="obs-color-format" aria-label="색상 형식 전환: RGB" title="색상 형식 전환"><span>⌃</span><span>⌄</span></button>
      </div>`;
    document.body.append(picker);
    picker.addEventListener('beforetoggle', event => { if (event.newState === 'closed') finishDrag(); });
    const eyedropper = picker.querySelector('.obs-color-eyedropper');
    eyedropper.disabled = typeof window.EyeDropper !== 'function';
    if (eyedropper.disabled) eyedropper.title = '이 OBS 환경에서는 화면 색상 추출을 지원하지 않습니다.';
    eyedropper.addEventListener('click', async () => {
      try {
        const selected = await new window.EyeDropper().open();
        read(selected.sRGBHex); paint(); commit();
      } catch (error) {
        // 스포이트 취소 또는 브라우저의 화면 접근 거부 시 기존 색을 유지합니다.
      }
    });
    const plane = picker.querySelector('.obs-color-plane');
    const move = event => {
      const box = plane.getBoundingClientRect();
      saturation = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      brightness = 1 - Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      queuePreview();
    };
    plane.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); plane.setPointerCapture(event.pointerId); move(event);
    });
    plane.addEventListener('pointermove', event => { if (plane.hasPointerCapture(event.pointerId)) move(event); });
    plane.addEventListener('pointerup', finishDrag);
    plane.addEventListener('lostpointercapture', finishDrag);
    plane.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? .1 : .01;
      saturation = Math.max(0, Math.min(1, saturation + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)));
      brightness = Math.max(0, Math.min(1, brightness + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)));
      paint(); commit();
    });
    const hueInput = picker.querySelector('[data-picker-hue]');
    hueInput.addEventListener('input', event => { hue = 360 - Number(event.target.value); queuePreview(); });
    hueInput.addEventListener('change', finishDrag);
    hueInput.addEventListener('blur', finishDrag);
    const hexInput = picker.querySelector('[data-picker-hex]');
    const updateHex = event => {
      if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) { if (event.type === 'change') paint(); return; }
      read(event.target.value); paint(); commit();
    };
    hexInput.addEventListener('input', updateHex);
    hexInput.addEventListener('change', updateHex);
    const updateRgb = () => {
      const inputs = [...picker.querySelectorAll('[data-picker-rgb]')];
      if (!inputs.every(c => c.value !== '' && c.validity.valid)) return;
      read('#' + inputs.map(c => Number(c.value).toString(16).padStart(2, '0')).join(''));
      paint(); commit();
    };
    picker.querySelectorAll('[data-picker-rgb]').forEach(input => {
      input.addEventListener('input', updateRgb); input.addEventListener('change', updateRgb);
    });
    const updateHsl = () => {
      const inputs = [...picker.querySelectorAll('[data-picker-hsl]')];
      if (inputs.every(c => c.value !== '' && c.validity.valid)) {
        const [h, s, l] = inputs.map(c => Number(c.value));
        hue = h; brightness = l / 100 + s / 100 * Math.min(l / 100, 1 - l / 100);
        saturation = brightness ? 2 * (1 - l / 100 / brightness) : 0;
      }
      paint(); commit();
    };
    picker.querySelectorAll('[data-picker-hsl]').forEach(input => {
      input.addEventListener('input', updateHsl); input.addEventListener('change', updateHsl);
    });
    picker.querySelector('.obs-color-format').addEventListener('click', event => {
      const groups = [...picker.querySelectorAll('[data-picker-fields]')];
      const next = (groups.findIndex(group => !group.hidden) + 1) % groups.length;
      groups.forEach((group, index) => { group.hidden = index !== next; });
      event.currentTarget.setAttribute('aria-label', `색상 형식 전환: ${groups[next].dataset.pickerFields.toUpperCase()}`);
    });
    picker.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const controls = [...picker.querySelectorAll('[tabindex="0"], input, button')].filter(el => el.getClientRects().length && !el.disabled);
        const index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index === 0) { event.preventDefault(); controls.at(-1).focus(); }
        if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
      }
    });
  }
  document.addEventListener('click', event => {
    const input = event.target.closest('input[type="color"]');
    if (!window.obsstudio || typeof HTMLElement.prototype.showPopover !== 'function' || !input || input.disabled) return;
    event.preventDefault();
    if (!picker) create();
    finishDrag();
    target = input;
    committedColor = previewColor = input.value;
    // 팀 컬러 팝업 안에서 열어도 상위 팝업과 원래 입력기를 유지합니다.
    const parent = input.closest(':popover-open') || document.body;
    if (picker.parentElement !== parent) parent.append(picker);
    hue = 0; read(input.value); paint();
    picker.showPopover();
    const rect = input.getBoundingClientRect();
    const width = picker.offsetWidth, height = picker.offsetHeight;
    picker.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
    picker.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - height - 8))}px`;
    picker.querySelector('.obs-color-plane').focus({ preventScroll: true });
  }, true);
  window.addEventListener('resize', () => { if (picker?.matches(':popover-open')) close(); });
  document.addEventListener('page:activated', () => { if (picker?.matches(':popover-open')) close(); });
})();
