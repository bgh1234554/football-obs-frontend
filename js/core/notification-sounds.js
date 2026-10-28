/** 화면 애니메이션의 시작·길이에 맞춰 짧은 알림음을 합성한다. 기본값은 무음이다. */
(() => {
  let context = null;
  const channels = new Map();
  let volumePreviewVersion = 0;
  let noiseBuffer = null;
  const sampleSets = { '5': 'eightbit' };
  const sampleBuffers = new Map();
  const sampleRequests = new Map();

  /** 선택한 샘플만 미리 읽어 알림 시점의 네트워크 대기를 피한다. */
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

  /** 사용자 입력 안에서만 오디오를 준비하며, 잠긴 상태에서 놓친 알림은 나중에 재생하지 않는다. */
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

  function stop(kind) {
    const channel = channels.get(kind);
    if (!channel) return;
    channel.nodes.forEach(node => { try { node.stop(); } catch {} });
    channels.delete(kind);
  }

  /** 짧게 튕기는 본음 뒤에 높은 음과 유리 배음을 겹치며, 잔향도 표시 구간 안에서 끝낸다. */
  function bell(channel, start, duration, kind) {
    const set = getSetting('notificationSoundSet');
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

  function play(kind, duration, target = null) {
    if (!context || context.state !== 'running' || !Number.isFinite(duration) || duration <= .03) return;
    if (Number(getSetting('notificationSoundVolume')) <= 0) return;
    const now = context.currentTime;
    const previous = channels.get(kind);
    // 동시에 바뀌는 점수·득점자와 양 팀의 소리는 한 번만 재생한다.
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

  function animationKind(event) {
    if (event.animationName === 'board-flash' && event.target.matches('.flash-update')) return 'board';
    if (event.animationName === 'ev-row-glow' && event.target.closest('.ev-spotlight.is-visible')) return 'event';
    return null;
  }

  document.addEventListener('animationstart', event => {
    const kind = animationKind(event);
    if (!kind || !enabled(kind) || !event.target.getClientRects().length) return;
    const animation = event.target.getAnimations().find(item => item.animationName === event.animationName);
    const duration = Number(animation?.effect?.getTiming().duration) / 1000;
    play(kind, duration, event.target);
  });
  document.addEventListener('animationcancel', event => {
    for (const [kind, channel] of channels) {
      if (!channel.targets.has(event.target)) continue;
      channel.targets.delete(event.target);
      if (!channel.targets.size) stop(kind);
    }
  });
  const prepare = () => { if (enabled('board') || enabled('event')) void unlock(); };
  document.addEventListener('pointerdown', prepare, true);
  document.addEventListener('keydown', prepare, true);
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
  /** 볼륨과 세트 선택은 켜진 알림음만 짧게 미리 들려준다. */
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
