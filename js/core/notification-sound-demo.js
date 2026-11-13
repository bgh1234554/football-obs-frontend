/**
 * 개발자 콘솔에서 알림음 세트를 실제 점수판과 이벤트 표시로 비교하는 수동 데모.
 *
 * demo() 호출만으로 재생하지 않고 시작 버튼의 클릭 안에서 오디오를 준비해 브라우저의
 * 자동 재생 제한을 따른다. 실행 중에는 같은 버튼으로 중지할 수 있으며, 알림 설정과
 * 임시 점수/득점자 값을 저장했다가 성공, 오류, 취소에 관계없이 finally에서 정리한다.
 * 실제 경기가 바뀌었다면 이전 경기의 점수나 폴링 상태를 새 경기에 덮어쓰지 않는다.
 */
(() => {
  let button = null;
  let controller = null;
  /** 실행 중이면 AbortSignal로 대기를 중단하고, 시작 전이면 버튼만 제거한다. */
  window.notificationSounds.stopDemo = () => {
    if (controller) controller.abort();
    else { button?.remove(); button = null; }
  };
  /**
   * 비교할 세트를 설정 선택 목록에서 골라 시작 버튼을 만든다. 이미 열려 있으면 재사용한다.
   * @param {object} [options] 데모 재생 옵션.
   * @param {string[]} [options.sets] 비교할 세트 값. 생략하면 선택 목록의 모든 세트를 사용한다.
   * @param {number} [options.volume=50] 데모 실행 동안 사용할 음량(0~100).
   * @returns {void}
   */
  window.notificationSounds.demo = (options = {}) => {
    if (button?.isConnected) { button.focus(); return; }
    const selector = document.querySelector('[data-settings-select="notificationSoundSet"]');
    const requested = options.sets?.map(String);
    const sets = [...selector.options].filter(option => !requested || requested.includes(option.value))
      .map(option => [option.value, option.textContent]);
    if (!sets.length) throw new Error('테스트할 알림음 세트가 없습니다.');
    button = document.createElement('button');
    button.id = 'sound-demo-start';
    button.textContent = `▶ 알림음 ${sets.length}종 비교 시작`;
    button.style.cssText = 'position:fixed;right:20px;top:20px;z-index:999999;padding:14px;background:#2563eb;color:white;border:0;border-radius:10px;cursor:pointer';
    document.body.append(button);
    button.onclick = async () => {
      button.disabled = true;
      if (!await notificationSounds.unlock()) {
        button.textContent = '오디오가 차단되었습니다. 다시 클릭'; button.disabled = false; return;
      }
      controller = new AbortController();
      button.disabled = false;
      button.onclick = () => controller.abort();
      const keys = ['notificationSoundSet', 'boardFlashSound', 'eventSpotlightSound', 'notificationSoundVolume', 'eventSpotlight'];
      const settings = Object.fromEntries(keys.map(key => [key, getSetting(key)]));
      const fixture = typeof _lastFixtureData === 'undefined' ? null : _lastFixtureData;
      const saved = { score: state.homeScore, notes: { ...state.notes }, enabled: state.noteEnabled };
      // 대기와 취소를 같은 Promise에 연결한다. 정상 완료 시 abort 리스너를 제거하고,
      // 중지 시 타이머를 해제해 다음 데모 단계나 소리가 뒤늦게 실행되지 않게 한다.
      const wait = ms => new Promise((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(new DOMException('중지', 'AbortError')); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve(); }, ms);
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) cancel();
      });
      let goals = 0;
      try {
        closeSettingsPopup(); activatePage('main-big'); clearPolling(false);
        setSetting('notificationSoundVolume', Math.max(0, Math.min(100, Number(options.volume ?? 50))));
        if (getSetting('eventSpotlight') === 'off') setSetting('eventSpotlight', 'board');
        for (const [set, name] of sets) {
          setSetting('boardFlashSound', 'off'); setSetting('eventSpotlightSound', 'off');
          setSetting('notificationSoundSet', set);
          setSetting('boardFlashSound', 'on'); setSetting('eventSpotlightSound', 'on');
          if (!await notificationSounds.ready()) throw new Error(`${name} 음원을 불러오지 못했습니다.`);
          if (controller.signal.aborted) throw new DOMException('중지', 'AbortError');
          button.textContent = `${name} / 점수 변경 · 클릭하면 중지`;
          state.homeScore = Number(saved.score || 0) + ++goals; render(); flashScore('home');
          await wait(3200);
          button.textContent = `${name} / 득점자 변경 · 클릭하면 중지`;
          state.noteEnabled = true; state.notes.home = `88′ ${name} 테스트 득점자`;
          render(); flashNote('home'); await wait(3200);
          button.textContent = `${name} / 신규 골 이벤트 · 클릭하면 중지`;
          const source = document.createElement('div'); source.innerHTML = '<div class="ev-list"></div>';
          const id = `sound-demo-${set}-${Date.now()}`;
          evSpotlightAfterRender(id, [source]);
          source.firstChild.append(evCreateRow({ type: 'Goal', detail: 'Normal Goal', side: 'home', playerName: `${name} 테스트 득점자`, elapsed: 88 }, { matchInfo: { status: '2H', elapsed: 88 } }, id));
          evSpotlightMarkNewEvents(); evSpotlightAfterRender(id, [source]); await wait(5600);
        }
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      } finally {
        // 원래 알림 설정을 돌리기 전에 임시 재생과 표시부터 끈다. 점수와 폴링은 데모를
        // 시작한 경기 객체가 그대로인 경우에만 복원해 사용자가 새로 고른 경기를 보호한다.
        notificationSounds.stop();
        setSetting('boardFlashSound', 'off'); setSetting('eventSpotlightSound', 'off'); setSetting('eventSpotlight', 'off');
        if ((typeof _lastFixtureData === 'undefined' ? null : _lastFixtureData) === fixture) {
          state.homeScore = saved.score; state.notes = saved.notes; state.noteEnabled = saved.enabled;
          if (fixture) schedulePoll(fixture);
        }
        Object.entries(settings).forEach(([key, value]) => setSetting(key, value));
        render(); button?.remove(); button = null; controller = null;
      }
    };
  };
})();
