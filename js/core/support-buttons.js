/**
 * 공식 후원 버튼의 원본 DOM을 유지하면서 각 표시 영역 안에 맞춰 배치한다.
 *
 * 숨겨진 페이지에서는 호스트나 공식 버튼의 크기가 0일 수 있다. 이때 잘못된 배율을
 * 확정하지 않고 준비 표시를 해제하며, 페이지 표시나 ResizeObserver의 후속 측정에서
 * 다시 맞춘다. 웹폰트가 로드되면 버튼의 원래 폭도 달라질 수 있어 fonts.ready 이후에도
 * 측정한다. 공식 임베드를 별도 이미지나 자체 버튼으로 바꾸는 모듈은 아니다.
 */
(() => {
  /**
   * 호스트와 원본 버튼의 실측 크기로 축소 배율과 가운데 위치를 계산한다.
   * transform이 반영되지 않은 offset 크기를 기준으로 해 반복 측정 때 계속 작아지는
   * 일을 막으며, 배율 상한을 1로 두어 원본 버튼을 확대하지 않는다.
   * @param {HTMLElement} host .support-button 표시 영역.
   * @returns {void}
   */
  function fit(host) {
    const container = host.querySelector('.bmc-btn-container');
    if (!container) return;
    const width = host.clientWidth, height = host.clientHeight;
    const naturalWidth = container.offsetWidth, naturalHeight = container.offsetHeight;
    if (!width || !height || !naturalWidth || !naturalHeight) {
      host.classList.remove('is-ready');
      return;
    }
    const scale = Math.min(1, width / naturalWidth, height / naturalHeight);
    container.style.transform = `scale(${scale})`;
    container.style.left = `${Math.max(0, (width - naturalWidth * scale) / 2)}px`;
    container.style.top = `${Math.max(0, (height - naturalHeight * scale) / 2)}px`;
    host.classList.add('is-ready');
  }
  /** 초기 DOM, 표시 영역 크기 변경, 페이지 전환, 웹폰트 준비에 측정 작업을 연결한다. */
  function init() {
    const hosts = [...document.querySelectorAll('.support-button')];
    const observer = new ResizeObserver(entries => entries.forEach(({ target }) => fit(target)));
    hosts.forEach(host => { observer.observe(host); fit(host); });
    document.addEventListener('page:activated', () => hosts.forEach(fit));
    document.fonts?.ready.then(() => hosts.forEach(fit));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
