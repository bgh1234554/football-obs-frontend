/**
 * [알림음: 화면 애니메이션과 재생 채널 연결]
 * 점수판 깜빡임과 신규 이벤트 표시 애니메이션에 맞춰 알림음을 재생한다.
 * 경기 응답의 값 변경을 직접 감시하지 않고, 실제 표시 대상의 CSS animationstart를 재생 진입점으로 쓴다.
 *
 * 처리 순서:
 *  1. 사용자 입력 또는 OBS 전용 경로에서 AudioContext를 준비하고 필요한 녹음 샘플을 가져온다.
 *  2. 알림 대상/애니메이션 이름/설정/표시 여부를 확인한 뒤 애니메이션 길이를 초 단위로 읽는다.
 *  3. board와 event 채널별로 겹치는 요청을 합치거나 이전 소리를 정지하고 새 재생을 예약한다.
 *  4. 선택 세트에 따라 녹음 샘플 또는 합성음을 재생하고, 취소/설정 변경/페이지 전환 때 정리한다.
 *
 * notificationSounds 공개 객체는 설정 미리듣기와 notification-sound-demo.js에서도 사용한다.
 * 자동 알림의 설정 검사는 animationstart 경로가 맡으며, 콘솔 preview는 켜짐 설정을 바꾸지 않고 재생한다.
 *
 * 설정의 board/event 재생 여부와 음량을 따르며 기본값은 무음이다. 실제 animationstart에서
 * 지속 시간을 읽으므로 화면 표시와 소리의 기준이 분리되지 않는다. 두 종류는 독립 채널로
 * 관리하고 같은 종류의 동시 변경은 합쳐 점수와 득점자 갱신이 겹쳐도 소리를 중복하지 않는다.
 * 일반 브라우저는 사용자 입력으로 오디오를 준비하고, 자동 재생이 가능한 OBS만 별도 준비한다.
 */
(() => {
  let context = null;
  // 채널은 알림 종류별 예약 노드와 화면 대상을 보관한다. 점수판 소리의 교체/중지가
  // 신규 이벤트 소리까지 끊지 않도록 종류별로 분리한다. 샘플 캐시는 채널이 바뀌어도 재사용한다.
  const channels = new Map();
  let volumePreviewVersion = 0;
  let noiseBuffer = null;
  const sampleSets = { '5': 'eightbit' };
  const sampleBuffers = new Map();
  const sampleRequests = new Map();

  /**
   * 녹음 샘플을 사용하는 세트만 가져와 AudioBuffer로 미리 디코딩한다.
   * 완료된 버퍼와 진행 중인 Promise를 별도로 캐시해 동시에 준비해도 다운로드가 겹치지
   * 않게 한다. 실패한 Promise는 제거해 다음 준비 요청에서 다시 시도할 수 있게 한다.
   * @param {string} set 설정에서 선택한 알림음 세트 키.
   * @returns {Promise<boolean>} 샘플 준비 성공 여부. 합성 전용 세트는 다운로드 없이 성공한다.
   */
  async function prepareSamples(set) {
    if (!sampleSets[set]) return true;
    if (!context) return false;
    if (sampleBuffers.has(set)) return true;
    if (!sampleRequests.has(set)) {
      sampleRequests.set(set, Promise.all(['board', 'event'].map(async kind => {
        const response = await fetch(`resources/sounds/notifications/${sampleSets[set]}-${kind}.wav`);
        if (!response.ok) throw new Error('Audio sample unavailable');
        return [kind, await context.decodeAudioData(await response.arrayBuffer())];
      })).then(entries => { sampleBuffers.set(set, Object.fromEntries(entries)); return true; }).catch(() => {
        sampleRequests.delete(set);
        return false;
      }));
    }
    return sampleRequests.get(set);
  }
  const enabled = kind => getSetting(kind === 'board' ? 'boardFlashSound' : 'eventSpotlightSound') === 'on';

  /**
   * AudioContext를 생성하거나 재개하고 선택한 샘플의 사전 준비를 시작한다.
   * 일반 브라우저에서는 사용자 입력 경로에서 호출하며, 재개가 거부되면 알림을 쌓아 두지
   * 않고 준비 실패로 돌려준다. OBS는 자동 재생 경로에서도 이 함수를 사용할 수 있다.
   * @returns {Promise<AudioContext|null>} 실행 가능한 오디오 컨텍스트 또는 준비 실패 시 null.
   */
  async function unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      if (!context) context = new Audio();
      if (context.state === 'suspended') await context.resume();
      if (context.state === 'running') void prepareSamples(getSetting('notificationSoundSet'));
      return context.state === 'running' ? context : null;
    } catch { return null; }
  }

  /** 지정한 채널의 예약/재생 노드를 모두 정지한다. 이미 끝난 노드의 중복 stop 오류는 무시한다. */
  function stop(kind) {
    const channel = channels.get(kind);
    if (!channel) return;
    channel.nodes.forEach(node => { try { node.stop(); } catch {} });
    channels.delete(kind);
  }

  /**
   * 선택한 세트에 맞춰 샘플 또는 합성 음성을 채널에 예약한다.
   * 녹음 샘플은 짧은 페이드로 시작과 끝의 잡음을 줄이고, 합성 세트는 발음과 잔향을
   * 지정된 표시 구간 안에 배치한다. 생성한 재생 노드를 channel.nodes에 등록해야
   * 애니메이션 취소나 설정 변경 시 stop()이 남은 소리까지 정리할 수 있다.
   * @param {object} channel 종류별 재생 노드와 표시 대상을 보관하는 채널.
   * @param {number} start AudioContext.currentTime 기준 재생 시작 시각(초).
   * @param {number} duration 재생에 사용할 시간(초). 이벤트 샘플은 별도 표시 길이를 사용한다.
   * @param {'board'|'event'} kind 알림 종류.
   */
  function bell(channel, start, duration, kind) {
    const set = getSetting('notificationSoundSet');
    // 녹음 세트 → 질감 합성 세트 → 차임 세트 순으로 분기한다. 같은 세트에서 두 경로가
    // 겹쳐 재생되지 않게 처리된 경로는 즉시 반환한다. 샘플이 아직 없으면 여기서 대기하지 않는다.
    if (sampleSets[set]) {
      const buffer = sampleBuffers.get(set)?.[kind === 'event' ? 'event' : 'board'];
      if (!buffer) return;
      // 신규 이벤트는 glow가 아닌 화면 표시 시간 안에서 원래 구절과 잔향을 보존한다.
      if (kind === 'event') duration = Math.min(buffer.duration, 4.8);
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      const level = Number(getSetting('notificationSoundVolume')) / 100 * (kind === 'event' ? .32 : .4);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + .004);
      gain.gain.setValueAtTime(level, start + duration - .03);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start(start); source.stop(start + duration);
      channel.nodes.push(source);
      return;
    }
    if (textureSound(channel, start, duration, kind, set)) return;
    if (set !== '2') {
      modernChime(channel, start, duration, kind, set);
      return;
    }
    const volume = Math.max(0, Math.min(100, Number(getSetting('notificationSoundVolume')) || 0)) / 100;
    const base = kind === 'board' ? 659.25 : 783.99;
    // 일정한 순음 대신 짧은 발음과 시차를 둔 완전5도로 부드러운 두 음의 차임을 만든다.
    [[1, .11, 0, 'triangle'], [1.4983, .07, .055, 'sine'], [3.003, .009, .008, 'sine']].forEach(([ratio, strength, delay, type]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const onset = start + Math.min(delay, duration * .15);
      const tail = start + duration;
      const length = tail - onset;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(base * ratio, onset);
      gain.gain.setValueAtTime(0, onset);
      gain.gain.linearRampToValueAtTime(strength * volume, onset + .006);
      gain.gain.exponentialRampToValueAtTime(Math.max(.00001, strength * volume * .22), onset + length * .22);
      gain.gain.exponentialRampToValueAtTime(Math.max(.00001, strength * volume * .006), onset + length * .88);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(onset);
      oscillator.stop(start + duration);
      channel.nodes.push(oscillator);
    });
  }

  /** 재사용할 잡음 버퍼를 만든다. 필터를 통해 바람·관중·타격음의 질감을 나눈다. */
  function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let seed = 0x621b372f;
    for (let i = 0; i < samples.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      samples[i] = (seed >>> 0) / 2147483648 - 1;
    }
    return noiseBuffer;
  }

  /** 발음·필터·주파수 이동을 독립적으로 정해 악기와 효과음 계열을 합성한다. */
  function textureVoice(channel, start, duration, spec) {
    // 음원 → 선택적 필터 → 음량 곡선 → 출력 순서로 연결한다. 시간 값은 AudioContext의
    // 예약 시각을 쓰며, 노드 종료 후 연결을 해제해 짧은 알림이 반복되어도 연결이 쌓이지 않게 한다.
    const source = spec.wave === 'noise' ? context.createBufferSource() : context.createOscillator();
    if (spec.wave === 'noise') { source.buffer = getNoiseBuffer(); source.loop = true; }
    else {
      source.type = spec.wave || 'sine';
      source.frequency.setValueAtTime(spec.frequency, start);
      if (spec.slide) source.frequency.exponentialRampToValueAtTime(spec.slide, start + duration * .75);
    }
    const envelope = context.createGain();
    const volume = Number(getSetting('notificationSoundVolume')) / 100;
    const peak = spec.gain * volume;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + duration * (spec.attack || .015));
    envelope.gain.exponentialRampToValueAtTime(Math.max(.00001, peak * (spec.hold ? .7 : .16)), start + duration * (spec.sustain || (spec.hold ? .6 : .25)));
    envelope.gain.exponentialRampToValueAtTime(.00001, start + duration * .94);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    let filter = null;
    if (spec.filter) {
      filter = context.createBiquadFilter();
      filter.type = spec.filter;
      filter.frequency.setValueAtTime(spec.cutoff, start);
      filter.Q.value = spec.q || .7;
      if (spec.sweep) filter.frequency.exponentialRampToValueAtTime(spec.sweep, start + duration * .85);
      source.connect(filter); filter.connect(envelope);
    } else source.connect(envelope);
    envelope.connect(context.destination);
    source.onended = () => { source.disconnect(); filter?.disconnect(); envelope.disconnect(); };
    source.start(start); source.stop(start + duration);
    channel.nodes.push(source);
  }

  /** 휴대폰 차임과 구별되는 휘슬·브라스·타악기·잡음 기반 효과음 세트. */
  function textureSound(channel, start, duration, kind, set) {
    const base = kind === 'board' ? 523.25 : 659.25;
    const add = (offset, spec, length = 1 - offset) => textureVoice(channel, start + duration * offset, duration * length, spec);
    switch (set) {
      case '10':
        // 가까운 고정 주파수의 맥놀이로 떨림을 만들고, 사이렌처럼 들리는 상승음은 사용하지 않는다.
        add(0, { frequency: 2380, gain: .075, attack: .018, hold: true });
        add(0, { frequency: 2413, gain: .04, attack: .025, hold: true });
        add(0, { wave: 'noise', filter: 'bandpass', cutoff: 2600, q: .9, gain: .018 });
        break;
      case '4':
        [1, 1.25, 2].forEach((ratio, i) => add(i * .22, { wave: 'square', frequency: base * ratio, gain: .045, filter: 'lowpass', cutoff: 3600 }));
        break;
      case '6':
        [1, 1.25, 1.5].forEach((ratio, i) => add(i * .025, { wave: 'triangle', frequency: base * .5 * ratio, gain: .1, filter: 'lowpass', cutoff: 1000, attack: .2, hold: true }));
        break;
      case '8':
        // 16·8·4피트 음역과 상위 배음을 함께 울려 얇은 사각파 대신 지속적인 오르간 음색을 만든다.
        [1, 1.25, 1.5].forEach(ratio => {
          [[.5, .025], [1, .055], [2, .03], [3, .015], [4, .008]].forEach(([harmonic, gain]) => {
            add(0, { frequency: base * .5 * ratio * harmonic, gain, attack: .03, hold: true, sustain: .82 });
          });
        });
        break;
      default: return false;
    }
    return true;
  }

  /** 디지털 플럭과 중계용 저음 타격·상승음을 짧은 FM 차임으로 합성한다. */
  function modernChime(channel, start, duration, kind, set) {
    const volume = Number(getSetting('notificationSoundVolume')) / 100;
    // 세트별 음역·발음·배음·음 사이 간격을 나눠 단순 음높이 변경과 구분한다.
    const profiles = {
      '3': [698.46, 880, [[1, .12, 0, 2.01, .55], [1.25, .06, .045, 1, .3], [1.5, .035, .085, 2, .18]]],
      '1': [392, 523.25, [[.5, .14, 0, 1, 1.1], [1.5, .085, .045, 2, .32], [2, .055, .1, 2.01, .2]]],
      '9': [587.33, 698.46, [[1, .085, 0, 3.5, 1.1], [1.414, .045, .014, 5.01, .7], [2.003, .025, .045, 2.76, .4]]],
      '7': [783.99, 987.77, [[1, .11, 0, 2.01, .35], [1, .045, .08, 2.01, .2], [1.5, .022, .16, 2, .1]]],
    };
    const profile = profiles[set] || profiles['1'];
    const base = profile[kind === 'board' ? 0 : 1];
    const voices = profile[2];
    voices.forEach(([ratio, strength, delay, modulationRatio, depth]) => {
      // 각 음성은 실제 들리는 발진기와 주파수를 흔드는 발진기로 구성된다. 두 노드 모두
      // 채널에 넣어 stop() 한 번으로 아직 시작하지 않은 예약음까지 취소할 수 있게 한다.
      const onset = start + Math.min(delay, duration * .25);
      const length = start + duration - onset;
      const carrier = context.createOscillator();
      const modulator = context.createOscillator();
      const modulation = context.createGain();
      const envelope = context.createGain();
      const frequency = base * ratio;
      carrier.type = modulator.type = 'sine';
      carrier.frequency.setValueAtTime(frequency, onset);
      modulator.frequency.setValueAtTime(frequency * modulationRatio, onset);
      modulation.gain.setValueAtTime(frequency * depth, onset);
      modulation.gain.exponentialRampToValueAtTime(.001, onset + length * .65);
      modulator.connect(modulation);
      modulation.connect(carrier.frequency);
      envelope.gain.setValueAtTime(0, onset);
      envelope.gain.linearRampToValueAtTime(strength * volume, onset + .005);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.00001, strength * volume * .12), onset + length * .25);
      envelope.gain.exponentialRampToValueAtTime(.00001, onset + length * .92);
      envelope.gain.linearRampToValueAtTime(0, start + duration);
      carrier.connect(envelope);
      envelope.connect(context.destination);
      carrier.onended = () => { carrier.disconnect(); envelope.disconnect(); };
      modulator.onended = () => { modulator.disconnect(); modulation.disconnect(); };
      [carrier, modulator].forEach(oscillator => {
        oscillator.start(onset);
        oscillator.stop(start + duration);
        channel.nodes.push(oscillator);
      });
    });
  }

  /**
   * 준비된 컨텍스트에서 알림을 재생하고 같은 종류의 겹치는 요청을 정리한다.
   * 80ms 안에 시작한 화면 대상은 기존 채널에 합쳐 재생 횟수를 늘리지 않는다.
   * 점수판은 깜빡임의 세 번 보이는 구간에 맞추고, 신규 이벤트는 한 구간으로 재생한다.
   * 오디오가 잠겼거나 길이/음량이 유효하지 않으면 나중에 재생할 대기열을 만들지 않는다.
   * @param {'board'|'event'} kind 재생할 알림 채널.
   * @param {number} duration 화면 애니메이션의 길이(초).
   * @param {Element|null} target 취소 시 재생을 정리할 화면 애니메이션 대상.
   */
  function play(kind, duration, target = null) {
    // 오디오 잠금/잘못된 길이/무음은 즉시 버린다. 뒤늦게 준비됐을 때 과거 알림을
    // 재생하지 않도록 미재생 요청 자체를 저장하지 않는다.
    if (!context || context.state !== 'running' || !Number.isFinite(duration) || duration <= .03) return;
    if (Number(getSetting('notificationSoundVolume')) <= 0) return;
    const now = context.currentTime;
    const previous = channels.get(kind);
    // 화면 대상이 있는 자동 알림만 시작 후 80ms 안에 같은 채널로 합친다. 합쳐진 대상은
    // targets에 모두 남겨, 그중 하나의 애니메이션이 취소되어도 나머지 알림은 유지한다.
    // 직접 미리듣기처럼 target이 없는 호출은 병합하지 않고 기존 채널을 교체한다.
    if (target && previous && now - previous.started < .08) {
      previous.targets.add(target);
      return;
    }
    stop(kind);
    const channel = { nodes: [], targets: new Set(target ? [target] : []), started: now };
    channels.set(kind, channel);
    const start = now + .005;
    if (kind === 'board') {
      // board-flash에서 보이는 구간(0–16%, 33–50%, 66–83%)에 맞춘다.
      [[0, .16], [.33, .17], [.66, .17]].forEach(([offset, length]) => bell(channel, start + duration * offset, duration * length, kind));
    } else bell(channel, start, duration, kind);
  }

  /** 같은 CSS 애니메이션을 쓰는 다른 UI가 울리지 않도록 실제 알림 대상과 이름을 함께 판정한다. */
  function animationKind(event) {
    if (event.animationName === 'board-flash' && event.target.matches('.flash-update')) return 'board';
    if (event.animationName === 'ev-row-glow' && event.target.closest('.ev-spotlight.is-visible')) return 'event';
    return null;
  }

  // 자동 재생의 진입점이다. animationKind는 다른 UI의 동명 애니메이션을 걸러 내고,
  // 실제 표시 영역이 없는 대상은 제외한다. 브라우저 애니메이션 길이(ms)는 재생 함수에 초로 전달한다.
  document.addEventListener('animationstart', event => {
    const kind = animationKind(event);
    if (!kind || !enabled(kind) || !event.target.getClientRects().length) return;
    const animation = event.target.getAnimations().find(item => item.animationName === event.animationName);
    const duration = Number(animation?.effect?.getTiming().duration) / 1000;
    // OBS 브라우저 소스는 사용자 입력 없이도 재생할 수 있으므로, 준비되지 않았으면 바로 준비한 뒤 재생한다.
    if (window.obsstudio && context?.state !== 'running') {
      void unlock().then(audio => { if (audio) play(kind, duration, event.target); });
      return;
    }
    play(kind, duration, event.target);
  });
  document.addEventListener('animationcancel', event => {
    // 동시에 묶인 화면 대상 중 하나만 사라진 경우에는 나머지 대상의 소리를 유지한다.
    // 해당 채널에 속한 모든 애니메이션 대상이 사라졌을 때만 전체 재생을 정지한다.
    for (const [kind, channel] of channels) {
      if (!channel.targets.has(event.target)) continue;
      channel.targets.delete(event.target);
      if (!channel.targets.size) stop(kind);
    }
  });
  const prepare = () => { if (enabled('board') || enabled('event')) void unlock(); };
  document.addEventListener('pointerdown', prepare, true);
  document.addEventListener('keydown', prepare, true);
  // OBS 브라우저 소스(자동 재생 허용)는 클릭/키 입력이 없어 위 경로로는 오디오가 준비되지 않는다.
  // 일반 브라우저는 입력 없이 AudioContext를 만들면 경고만 남고 재생되지 않으므로 OBS에서만 미리 준비한다.
  if (window.obsstudio) prepare();
  // 설정 변경은 진행 중인 소리를 먼저 정지하고 새 설정으로 준비한다. version도 증가시켜
  // 샘플 준비나 미리듣기 대기 중이던 이전 설정의 후속 재생을 무효화한다.
  document.addEventListener('settings:change', event => {
    if (['boardFlashSound', 'eventSpotlightSound', 'notificationSoundVolume', 'notificationSoundSet'].includes(event.detail?.category)) {
      volumePreviewVersion++;
      ['board', 'event'].forEach(stop);
      prepare();
      if (event.detail.category === 'notificationSoundSet') previewEnabled();
    }
  });
  document.addEventListener('page:activated', () => { volumePreviewVersion++; ['board', 'event'].forEach(stop); });
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-settings-slider="notificationSoundVolume"]')) return;
    previewEnabled();
  });
  /**
   * 음량이나 세트 변경을 짧게 모아 현재 켜진 알림음만 미리 재생한다.
   * 샘플 준비와 점수판 미리듣기 사이에도 설정이나 페이지가 바뀔 수 있으므로 version을
   * 비교해 오래된 요청의 소리가 뒤늦게 재생되지 않게 한다. 두 알림이 켜져 있으면
   * 점수판 소리가 끝난 뒤 이벤트 소리를 재생해 서로 비교할 수 있게 한다.
   */
  function previewEnabled() {
    const version = ++volumePreviewVersion;
    if ((!enabled('board') && !enabled('event')) || Number(getSetting('notificationSoundVolume')) <= 0) return;
    const ready = unlock().then(audio => audio ? prepareSamples(getSetting('notificationSoundSet')) : false);
    // 연속 드래그 중 소리가 과도하게 겹치지 않도록 짧게 기다린 뒤 최신 음량만 들려준다.
    setTimeout(async () => {
      if (!await ready || version !== volumePreviewVersion) return;
      if (enabled('board')) {
        play('board', 2.5);
        if (enabled('event')) await new Promise(resolve => setTimeout(resolve, 2500));
      }
      if (version === volumePreviewVersion && enabled('event')) play('event', .9);
    }, 120);
  }
  /** 설정을 바꾸지 않고 개발자 콘솔에서 소리를 미리 듣는다. */
  async function preview(kind = 'board') {
    if (!['board', 'event'].includes(kind) || !await unlock() || !await prepareSamples(getSetting('notificationSoundSet'))) return false;
    play(kind, kind === 'board' ? 2.5 : .9);
    return true;
  }
  window.notificationSounds = {
    preview,
    unlock: async () => !!await unlock(),
    ready: async () => !!await unlock() && await prepareSamples(getSetting('notificationSoundSet')),
    stop: kind => kind ? stop(kind) : ['board', 'event'].forEach(stop)
  };
})();
