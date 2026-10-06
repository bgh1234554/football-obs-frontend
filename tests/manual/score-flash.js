/**
 * 점수 숫자 깜빡임 확인 — 파일 전체를 점수판 페이지의 개발자 도구 Console에 붙여 넣기.
 * 홈 즉시 → 3초 뒤 원정. 각 숫자가 2.5초 동안 3번 깜빡이면 정상.
 * 실제 업데이트에 쓰이는 flashScore()만 호출하는 시각 효과 테스트입니다.
 * 점수 변경 감지/API 통신 테스트는 아니며 점수, state, localStorage를 수정하지 않습니다.
 * 중단: window.stopScoreFlashTest() / 재실행: 파일 전체를 다시 붙여 넣기.
 */
(() => {
  window.stopScoreFlashTest?.();
  if (typeof window.flashScore !== 'function') {
    throw new Error('점수판 페이지를 연 뒤 실행하세요. flashScore()가 없습니다.');
  }
  const targets = ['homeScore', 'awayScore'].map(id => document.getElementById(id));
  if (targets.some(node => !node || !node.getClientRects().length)) {
    throw new Error('홈/원정 점수가 보이는 페이지에서 실행하세요.');
  }
  const timers = [];
  const stop = () => {
    timers.forEach(clearTimeout);
    targets.forEach(node => node.classList.remove('flash-update'));
    if (window.stopScoreFlashTest === stop) delete window.stopScoreFlashTest;
  };
  window.stopScoreFlashTest = stop;
  const flash = side => {
    window.flashScore(side);
    const css = getComputedStyle(document.getElementById(`${side}Score`));
    console.log(`[점수 효과] ${side}: ${css.animationName}, ${css.animationDuration}`);
    // 정상 CSS: board-flash / 2.5s. none이면 CSS 로딩 상태를 확인하세요.
  };
  flash('home');
  timers.push(setTimeout(() => flash('away'), 3000));
  timers.push(setTimeout(() => { stop(); console.log('[점수 효과] 완료'); }, 6000));
})();
