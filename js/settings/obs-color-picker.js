/**
 * [OBS 색상 선택: HSV 편집과 원본 입력 이벤트 연결]
 * OBS의 네이티브 색상 선택 창을 문서 내부 팝오버로 대체한다.
 *
 * 처리 순서:
 *  1. OBS의 color 입력 클릭을 가로채 재사용 팝오버를 열고 원본 HEX 값을 HSV로 읽는다.
 *  2. 색상 평면/색조 막대/숫자 입력의 변경을 같은 HSV 상태에 모은다.
 *  3. paint는 선택 UI만 갱신하고, commit은 원본 입력기와 기존 미리보기/저장 경로에 값을 전달한다.
 *  4. 드래그 중에는 프레임당 미리보기만 보내고, 종료·캡처 해제·닫기에서 마지막 색을 확정한다.
 *  5. 대상 입력을 바꿀 때는 이전 드래그부터 마쳐 색이 다른 입력기에 저장되지 않게 한다.
 *
 * 원본 input[type=color]를 유지하고 input은 화면 미리보기, change는 확정 저장에 사용한다.
 * 드래그 입력은 rAF당 한 번으로 합치고 종료 시 마지막 값을 확정해 매 포인터 이동마다
 * 설정을 저장하는 부담을 줄인다. 일반 브라우저와 팝오버 미지원 환경은 가로채지 않는다.
 * 내부 계산은 HSV로 통일하고 HEX, RGB, HSL 입력과 표시만 서로 변환한다.
 */
(() => {
  let picker, target, hue = 0, saturation = 0, brightness = 1;
  // previewColor와 committedColor는 각각 마지막 input/change 전달값이다. 화면 미리보기와
  // 저장 시점을 구분해야 같은 색을 반복 저장하지 않으면서 드래그의 마지막 값은 확정할 수 있다.
  let frame = 0, dragging = false, committedColor = '', previewColor = '';
  const rgb = () => {
    const channel = n => {
      const k = (n + hue / 60) % 6;
      return Math.round(255 * brightness * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return [channel(5), channel(3), channel(1)];
  };
  const color = () => '#' + rgb().map(c => c.toString(16).padStart(2, '0')).join('');
  /**
   * 유효한 6자리 HEX 입력을 내부 HSV 상태로 읽는다. 무채색은 색조를 계산할 수 없으므로
   * 기존 hue를 보존해 채도를 다시 올렸을 때 직전에 선택한 색조로 돌아가도록 한다.
   * @param {string} value 원본 color 입력이나 검증된 숫자 입력에서 얻은 HEX 문자열.
   */
  function read(value) {
    const [r, g, b] = value.match(/[0-9a-f]{2}/gi).map(c => parseInt(c, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta) hue = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
    saturation = max ? delta / max : 0;
    brightness = max;
  }
  /** 내부 HSV를 기준으로 선택 점, 색조 막대, HEX/RGB/HSL 필드를 함께 갱신한다. 원본 입력기는 바꾸지 않는다. */
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
  /**
   * 현재 색을 원본 입력기에 전달한다. 미리보기 값과 저장 완료 값을 별도로 기억해
   * 같은 값의 input/change를 중복 발생시키지 않는다. 입력기가 제거되면 전달하지 않는다.
   * @param {boolean} final true면 변경된 값을 확정 저장하고, false면 미리보기만 갱신한다.
   */
  function commit(final = true) {
    if (!target?.isConnected) return;
    const value = color();
    target.value = value;
    if (previewColor !== value) {
      previewColor = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // 드래그는 final=false로 미리보기만 보내고 종료 시 change로 저장한다. 키보드/숫자 입력은
    // 기본 final=true로 즉시 확정하므로 모든 조작이 드래그 종료 이벤트에 의존하는 것은 아니다.
    if (final && committedColor !== value) {
      committedColor = value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  /** 연속 포인터 입력을 한 프레임의 최신 미리보기로 합친다. 저장은 finishDrag()가 담당한다. */
  function queuePreview() {
    dragging = true;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; paint(); commit(false); });
  }
  /** 예약된 미리보기를 정리하고 최종 상태를 직접 반영한다. 팝오버 닫기와 포인터 캡처 해제도 이 경로를 쓴다. */
  function finishDrag() {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(frame); frame = 0;
    paint(); commit();
  }
  // Escape도 취소/되돌리기가 아니라 현재 색을 확정하는 닫기이다. 예약된 미리보기를 먼저
  // 정리해야 팝오버를 닫은 뒤 오래된 프레임이 값을 다시 전달하지 않는다.
  function close() { finishDrag(); picker.hidePopover(); target?.focus({ preventScroll: true }); }
  /**
   * 한 번 생성한 팝오버에 포인터, 방향키, 숫자 입력, 스포이트 처리를 연결한다.
   * 대상 입력기를 바꿔도 이 DOM을 재사용하며, 지원되지 않는 스포이트만 비활성화한다.
   * Tab 포커스는 팝오버 안에서 순환시키고 Escape는 진행 중인 색을 확정한 뒤 닫는다.
   */
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
        // 스포이트 취소 또는 브라우저의 화면 접근 거부 시 기존 색을 유지한다.
      }
    });
    const plane = picker.querySelector('.obs-color-plane');
    // 평면의 화면 좌표를 채도/밝기 0~1로 바꾸고 경계 밖은 제한한다. 포인터를 캡처하므로
    // 평면 밖으로 드래그해도 마지막 위치까지 추적하며, 캡처 해제도 확정 경로로 연결한다.
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
    // HEX는 완성된 6자리일 때만 읽는다. 입력 중 불완전한 값은 기다리고 change 시에도
    // 유효하지 않으면 현재 HSV 표시로 되돌린다. RGB/HSL도 원본 필드의 유효성을 확인한 뒤 계산한다.
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
      // 색상 조절 방향키 등이 점수판 단축키로 전파되지 않게 하고, Tab은 현재 보이는
      // 활성 입력 사이에서만 순환시킨다. 숨겨진 HEX/RGB/HSL 필드는 포커스 목록에서 제외한다.
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
    // 실제 클릭 시점에 OBS와 팝오버 지원 여부를 확인한다. 원본 입력기를 교체하지 않아
    // 나중에 생성된 설정 팝업의 color 입력에도 같은 위임 리스너가 동작한다.
    const input = event.target.closest('input[type="color"]');
    if (!window.obsstudio || typeof HTMLElement.prototype.showPopover !== 'function' || !input || input.disabled) return;
    event.preventDefault();
    if (!picker) create();
    finishDrag();
    target = input;
    committedColor = previewColor = input.value;
    // 팀 컬러 팝업 안에서 열어도 상위 팝업과 원래 입력기를 유지한다.
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
