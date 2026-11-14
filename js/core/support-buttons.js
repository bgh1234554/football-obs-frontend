/**
 * [후원 버튼: 공식 임베드의 크기 맞춤]
 * 공식 후원 버튼의 원본 DOM을 유지하면서 각 표시 영역 안에 맞춰 배치한다.
 * 공식 스크립트가 만든 .bmc-btn-container를 대상으로 하며 링크나 버튼 내용을 다시 만들지 않는다.
 *
 * 처리 순서:
 *  1. DOM 준비 후 각 표시 영역을 찾아 최초 측정과 ResizeObserver 감시를 연결한다.
 *  2. 표시 영역과 원본 버튼의 크기가 모두 있으면 축소 배율과 중앙 배치 좌표를 계산한다.
 *  3. 계산이 끝난 영역만 is-ready로 표시하고, 페이지 전환/웹폰트 준비 후 다시 측정한다.
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
    // 숨겨진 페이지에서는 정상적인 버튼도 크기가 0일 수 있다. 이를 배율 0으로 저장하지 않고
    // 준비 표시만 해제한다. 표시 영역 크기 변경이나 페이지 활성화가 다음 측정 기회가 된다.
    if (!width || !height || !naturalWidth || !naturalHeight) {
      host.classList.remove('is-ready');
      return;
    }
    const scale = Math.min(1, width / naturalWidth, height / naturalHeight);
    // 축소된 크기로 남는 여백을 계산하되, 좌표는 원본 컨테이너의 left/top에 적용한다.
    // 측정에 transform 적용 후 크기를 쓰지 않으므로 반복해서 맞춰도 배율이 누적되지 않는다.
    container.style.transform = `scale(${scale})`;
    container.style.left = `${Math.max(0, (width - naturalWidth * scale) / 2)}px`;
    container.style.top = `${Math.max(0, (height - naturalHeight * scale) / 2)}px`;
    host.classList.add('is-ready');
  }
  /** 초기 DOM, 표시 영역 크기 변경, 페이지 전환, 웹폰트 준비에 측정 작업을 연결한다. */
  function init() {
    // 초기화 시 존재하는 표시 영역 목록을 재사용한다. 버튼의 자연 너비는 웹폰트 로드 후
    // 달라질 수 있어, 표시 영역 자체의 리사이즈가 없어도 fonts.ready에서 다시 맞춘다.
    const hosts = [...document.querySelectorAll('.support-button')];
    const observer = new ResizeObserver(entries => entries.forEach(({ target }) => fit(target)));
    hosts.forEach(host => { observer.observe(host); fit(host); });
    document.addEventListener('page:activated', () => hosts.forEach(fit));
    document.fonts?.ready.then(() => hosts.forEach(fit));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
