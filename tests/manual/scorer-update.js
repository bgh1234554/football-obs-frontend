/**
 * 득점자 문구 업데이트 + 깜빡임 — 파일 전체를 점수판 페이지의 Console에 붙여 넣기.
 * 준비: 점수판이 보이고 득점자 표시가 켜져 있어야 합니다. 인라인 편집기는 닫아 주세요.
 * 홈에 테스트 득점자 추가 → 3초 뒤 원정에 추가 → 6초 뒤 최신 실제 문구로 원복.
 * 정상: '콘솔 테스트 홈 득점자' / '콘솔 테스트 원정 득점자'가 나오고 해당 박스가
 * 2.5초 동안 3번 깜빡입니다. 홈 미리보기는 원정 검사 시 실제 문구로 돌아갑니다.
 * 실제 buildScorers() → autoLayoutNotes() → maybeTriggerFixtureFlash() 경로를 사용합니다.
 * 테스트하는 것은 문구 생성/배치/변경 감지/깜빡임입니다. API 응답 수신은 모사하지 않습니다.
 * state.notes와 비교 스냅샷은 매 렌더 직후 finally에서 동기적으로 원복합니다.
 * API를 호출하거나 persist()/localStorage 저장을 하지 않으며 실제 점수도 바꾸지 않습니다.
 * 일반 폴링/설정 변경이 발생하면 미리보기가 먼저 실제 화면으로 돌아올 수 있습니다.
 * 중단/원복: window.stopScorerUpdateTest(). 재실행은 파일 전체를 다시 붙여 넣기.
 */
(() => {
  window.stopScorerUpdateTest?.();
  if (typeof state === 'undefined' || typeof buildScorers !== 'function'
      || typeof autoLayoutNotes !== 'function' || typeof maybeTriggerFixtureFlash !== 'function'
      || typeof _flashSnapshot === 'undefined') {
    throw new Error('점수판 페이지에서 실행하세요. 득점자 업데이트 함수가 없습니다.');
  }
  if (!state.noteEnabled || !document.getElementById('board')?.offsetHeight) {
    throw new Error('점수판을 표시하고 득점자 표시를 켠 뒤 실행하세요.');
  }
  if (typeof activeNoteEditor !== 'undefined' && activeNoteEditor) {
    throw new Error('득점자 인라인 편집기를 닫은 뒤 실행하세요.');
  }
  const timers = [];
  const stop = () => {
    timers.forEach(clearTimeout);
    ['homeNoteSide', 'awayNoteSide'].forEach(id =>
      document.getElementById(id)?.classList.remove('flash-update'));
    // 과거 백업 대신 현재 state를 그려, 테스트 중 도착한 실제 업데이트도 보존합니다.
    autoLayoutNotes();
    if (window.stopScorerUpdateTest === stop) delete window.stopScorerUpdateTest;
  };
  window.stopScorerUpdateTest = stop;

  const preview = side => {
    const previousNotes = state.notes;
    const previousSnapshot = _flashSnapshot;
    const playerName = `콘솔 테스트 ${side === 'home' ? '홈' : '원정'} 득점자`;
    try {
      // 첫 조회는 원래 깜빡이지 않으므로, 변경 전 값을 비교 기준으로 설정합니다.
      _flashSnapshot = {
        homeScore: state.homeScore, awayScore: state.awayScore,
        homeNote: previousNotes?.home ?? '', awayNote: previousNotes?.away ?? '',
      };
      const text = buildScorers([{
        side, type: 'Goal', detail: 'Normal Goal', elapsed: 67, extra: null,
        playerId: 0, playerName, playerNameKoLong: playerName, comments: null,
      }], side);
      state.notes = { ...previousNotes,
        [side]: [previousNotes?.[side], text].filter(Boolean).join('\n') };
      autoLayoutNotes();
      maybeTriggerFixtureFlash();
      const target = document.getElementById(`${side}NoteSide`);
      console.log(`[득점자 업데이트] ${side}: ${text}`, {
        flashClass: target?.classList.contains('flash-update'),
        animation: target ? getComputedStyle(target).animationName : '요소 없음',
      });
    } finally {
      state.notes = previousNotes;
      _flashSnapshot = previousSnapshot;
    }
  };
  try {
    preview('home');
    timers.push(setTimeout(() => {
      try { preview('away'); } catch (error) { stop(); console.error(error); }
    }, 3000));
    timers.push(setTimeout(() => { stop(); console.log('[득점자 업데이트] 원복 완료'); }, 6000));
  } catch (error) { stop(); throw error; }
})();
