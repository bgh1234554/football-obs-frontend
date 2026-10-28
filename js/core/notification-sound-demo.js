/** 콘솔에서 알림음 세트를 실제 화면과 함께 순회하고 원래 상태로 복원한다. */
(() => {
  let button = null;
  let controller = null;
  window.notificationSounds.stopDemo = () => {
    if (controller) controller.abort();
    else { button?.remove(); button = null; }
  };
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
