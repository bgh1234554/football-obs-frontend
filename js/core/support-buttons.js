// 숨겨진 페이지의 컨테이너 단위 대신 실제 표시 영역으로 공식 버튼을 축소한다.
(() => {
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
