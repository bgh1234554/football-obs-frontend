const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { viewport: { width: 1920, height: 1080 }, dpr: 1, platform: 'Win32' });
    await page.evaluate(() => {
      clearPolling();
      [...document.querySelectorAll('style')].find(style => style.textContent.includes('* { transition: none !important; animation: none !important; }'))?.remove();
      window.soundLog = [];
      // 실제 CSS 애니메이션을 사용하고 오디오 장치만 대체해 예약 시각을 검사한다.
      window.AudioContext = class {
        state = 'running'; destination = {}; sampleRate = 48000;
        get currentTime() { return 10 + performance.now() / 1000; }
        createOscillator() {
          const log = { frequency: 0 };
          soundLog.push(log);
          return { frequency: { setValueAtTime(value) { log.frequency = value; }, exponentialRampToValueAtTime() {} },
            connect() {}, disconnect() {}, start(time) { log.start = time; }, stop(time) { log.stop = time; } };
        }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
        async decodeAudioData(data) { const view = new DataView(data); return { duration: view.getUint32(40, true) / view.getUint32(28, true) }; }
        createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
        createBufferSource() { return this.createOscillator(); }
        createBiquadFilter() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 }, connect() {}, disconnect() {} }; }
      };
    });
    assert.deepEqual(await page.evaluate(() => ['boardFlashSound', 'eventSpotlightSound'].map(getSetting)), ['off', 'off']);
    await page.evaluate(() => flashScore('home'));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => soundLog.length), 0, '기본 OFF에서는 무음');
    assert.equal(await page.evaluate(() => getSetting('notificationSoundSet')), '1', '기본 세트는 첫 번째 차임');
    assert.equal(await page.locator('[data-settings-select="notificationSoundSet"] option:checked').textContent(), '차임');
    await page.evaluate(() => { setSetting('notificationSoundSet', '2'); });
    await page.evaluate(() => notificationSounds.preview('board'));
    const preview = await page.evaluate(() => soundLog);
    assert.equal(preview.length, 9, '벨의 세 음색을 깜빡임 세 번에 예약');
    assert(Math.abs(preview[0].stop - preview[0].start - .4) < 1e-6);
    assert(Math.abs(preview[3].start - preview[0].start - .825) < 1e-6);
    await page.evaluate(() => { notificationSounds.stop(); soundLog.length = 0; setSetting('boardFlashSound', 'on'); flashScore('home'); flashNote('home'); });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => soundLog.length), 9, '점수와 득점자가 함께 바뀌어도 소리는 겹치지 않음');
    await page.evaluate(() => { setSetting('boardFlashSound', 'off'); soundLog.length = 0; setSetting('eventSpotlightSound', 'on');
      const host = document.createElement('div'); host.className = 'ev-spotlight is-visible';
      host.innerHTML = '<div class="ev-row ev-row-new">새 이벤트</div>'; document.body.append(host);
    });
    await page.waitForTimeout(100);
    const event = await page.evaluate(() => soundLog);
    assert.equal(event.length, 3);
    assert(Math.abs(event[0].stop - event[0].start - .9) < 1e-6, '실제 glow 애니메이션 길이와 일치');
    await page.evaluate(() => { notificationSounds.stop(); soundLog.length = 0; setSetting('notificationSoundVolume', 0); });
    await page.evaluate(() => notificationSounds.preview('event'));
    assert.equal(await page.evaluate(() => soundLog.length), 0, '볼륨 0은 완전 무음');
    const volumeInput = page.locator('[data-settings-slider="notificationSoundVolume"]');
    const volume = async value => volumeInput.evaluate((input, value) => {
      input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await page.evaluate(() => { setSetting('eventSpotlightSound', 'off'); soundLog.length = 0; });
    await volume(40);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => soundLog.length), 0, '둘 다 OFF이면 볼륨 조절도 무음');
    await page.evaluate(() => setSetting('eventSpotlightSound', 'on'));
    await volume(45); await volume(50); await volume(55);
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => soundLog.length), 3, '연속 입력은 켜진 이벤트 알림음만 한 번 재생');
    await page.evaluate(() => { setSetting('boardFlashSound', 'on'); soundLog.length = 0; });
    await volume(60);
    await page.waitForTimeout(2800);
    const audition = await page.evaluate(() => soundLog);
    assert.equal(audition.length, 12, '둘 다 ON이면 실제 세 번의 깜빡임 뒤 이벤트 음을 재생');
    for (let index = 0; index < 9; index++) {
      assert(Math.abs((audition[index].start - audition[0].start) - (preview[index].start - preview[0].start)) < 1e-6, '볼륨 미리 듣기 간격은 실제 깜빡임과 일치');
      assert(Math.abs((audition[index].stop - audition[index].start) - (preview[index].stop - preview[index].start)) < 1e-6, '볼륨 미리 듣기 길이는 실제 깜빡임과 일치');
    }
    const sets = await page.locator('[data-settings-select="notificationSoundSet"] option').evaluateAll(options => options.map(option => option.value));
    assert.deepEqual(sets, Array.from({ length: 10 }, (_, index) => String(index + 1)), '목록 순서대로 연속된 세트 값');
    for (const set of sets.filter(set => set !== '2')) {
      await page.evaluate(() => { setSetting('boardFlashSound', 'off'); setSetting('eventSpotlightSound', 'off'); soundLog.length = 0; });
      await page.locator('[data-settings-select="notificationSoundSet"]').selectOption(set, { force: true });
      assert.equal(await page.evaluate(() => getSetting('notificationSoundSet')), set);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => soundLog.length), 0, '둘 다 OFF이면 세트 변경도 무음');
      await page.evaluate(() => notificationSounds.preview('event'));
      const voices = await page.evaluate(() => soundLog);
      assert(voices.length > 0, '선택한 세트의 합성 음색 재생');
      assert(voices.every(voice => voice.stop <= voices[0].start + 4.80001), '신규 이벤트 음원은 사라지기 전에 끝남');
      await page.evaluate(() => { notificationSounds.stop(); soundLog.length = 0; setSetting('boardFlashSound', 'on'); flashScore('away'); });
      await page.waitForTimeout(100);
      const schedule = await page.evaluate(() => soundLog.map(voice => ({ start: voice.start, stop: voice.stop })));
      const start = Math.min(...schedule.map(voice => voice.start));
      for (const end of [.4, 1.25, 2.075]) assert(schedule.some(voice => Math.abs(voice.stop - start - end) < .00001), '타격음이 짧아도 각 깜빡임의 전체 종료 시점은 유지');
      assert(schedule.every(voice => voice.stop <= start + 2.07501));
    }
    await page.reload();
    assert.equal(await page.locator('[data-settings-select="notificationSoundSet"]').inputValue(), sets.at(-1), '선택한 세트를 다음 접속에도 유지');
    const signatures = [];
    for (const set of sets) {
      const waveformPage = await openPage(browser, { viewport: { width: 1280, height: 900 }, dpr: 1, platform: 'Win32' });
      try {
        const waveform = await waveformPage.evaluate(async set => {
          clearPolling();
          const offline = new OfflineAudioContext(1, 48000 * 6, 48000);
          window.AudioContext = class {
            state = 'running'; currentTime = 0; destination = offline.destination; sampleRate = offline.sampleRate;
            createOscillator() { return offline.createOscillator(); }
            createGain() { return offline.createGain(); }
            createBuffer(...args) { return offline.createBuffer(...args); }
            createBufferSource() { return offline.createBufferSource(); }
            createBiquadFilter() { return offline.createBiquadFilter(); }
            decodeAudioData(data) { return offline.decodeAudioData(data); }
          };
          setSetting('notificationSoundSet', set);
          setSetting('notificationSoundVolume', 100);
          await notificationSounds.preview('event');
          const data = (await offline.startRendering()).getChannelData(0);
          let signature = 0, lastSound = 0;
          for (let i = 0; i < data.length; i++) {
            if (i % 73 === 0) signature = Math.imul(signature, 31) ^ Math.round(data[i] * 1000000);
            if (Math.abs(data[i]) > .000001) lastSound = i / 48000;
          }
          return { peak: data.reduce((max, value) => Math.max(max, Math.abs(value)), 0),
            tail: data.slice(48000 * 5).some(value => Math.abs(value) > .000001), signature, lastSound };
        }, set);
        assert(waveform.peak > .001 && waveform.peak < 1, '실제 합성 파형은 무음이나 클리핑이 아님');
        assert.equal(waveform.tail, false, '신규 이벤트가 사라진 뒤 잔향이 남지 않음');
        if (set === '5') assert(waveform.lastSound < 1, '8비트 이벤트음은 짧은 정보 알림');
        signatures.push(waveform.signature);
      } finally { await waveformPage.close(); }
    }
    assert.equal(new Set(signatures).size, sets.length, '각 세트는 서로 다른 파형을 생성');
    for (const [revision, previous, expected] of [[0, '7', '4'], [0, '16', '8'], [0, '10', '7'], [1, '10', '1'], [1, '11', '1'], [1, '12', '5'], [2, '10', '5'], [2, '5', '6'], [3, '5', '5'], [3, '1', '2'], [3, '2', '3'], [3, '3', '1'], [4, '1', '1']]) {
      await page.evaluate(({ revision, previous }) => {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
        saved.notificationSoundSet = previous;
        saved.notificationSoundSetRevision = revision;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(saved));
      }, { revision, previous });
      await page.reload();
      assert.equal(await page.evaluate(() => getSetting('notificationSoundSet')), expected, '이전 선택을 현재 목록으로 변환');
      await page.reload();
      assert.equal(await page.evaluate(() => getSetting('notificationSoundSet')), expected, '다시 접속해도 중복 변환하지 않음');
    }
    const original = await page.evaluate(() => [state.homeScore, getSetting('notificationSoundSet'), getSetting('notificationSoundVolume')]);
    await page.evaluate(() => notificationSounds.demo({ sets: ['1', '5'], volume: 40 }));
    await page.locator('#sound-demo-start').click();
    await page.waitForFunction(() => getSetting('notificationSoundSet') === '5' && document.getElementById('sound-demo-start')?.textContent.includes('점수 변경'), null, { timeout: 20000 });
    await page.locator('#sound-demo-start').click();
    await page.locator('#sound-demo-start').waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => [state.homeScore, getSetting('notificationSoundSet'), getSetting('notificationSoundVolume')]), original, '확장 가능한 콘솔 데모가 다음 세트로 넘어가고 중지 시 원상 복원');
    console.log('notification-sounds: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
