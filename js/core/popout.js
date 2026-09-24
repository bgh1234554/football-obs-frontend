// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [팝업 분리] 관리 탭 "입력창/설정을 새 창으로 열기"(popoutModals) 설정이 ON이면
// 교체 IN/OUT 선택, 포메이션/라인업/교체/미출전 입력, 설정 팝업, 테마 탭을
// 별도 window.open() 창으로 띄운다.
//
// OBS는 Browser Source(그 URL 하나만 렌더)든 특정 창을 지정한 Window Capture든
// "메인 창 하나"만 캡처하므로, 별도 OS 창으로 뜨는 팝업은 두 캡처 방식 어디에도 잡히지 않는다.
// (전체 화면을 통째로 Display Capture하는 경우만 예외 — 그때는 팝업을 다른 모니터/캡처 영역
// 밖으로 옮겨둬야 한다.)
//
// 구현 방식: 팝업은 같은 overlay_dashboard.html을 ?popout=... 쿼리로 다시 로드해 앱 전체를
// 독립적으로 부팅한다. sessionStorage(cached_fixture_data)는 window.open() 시 오프너로부터
// 그대로 복사되므로(동일 출처 규칙), 팝업도 메인 창과 동일한 경기 데이터로 라인업/이벤트
// 패널을 똑같이 렌더한다. 그 뒤 실제 열고 싶은 모달의 "트리거 버튼"을 찾아 click()을
// 시뮬레이션한다 — openManualPanel 등 내부 함수를 직접 호출하지 않으므로 트리거 쪽 코드가
// 나중에 바뀌어도 그대로 맞물린다.
// 모달을 저장/취소/닫으면(localStorage 기록은 그 기존 로직이 그대로 처리) 팝업 창을 자동으로
// 닫는다. 메인 창은 'storage' 이벤트(팝업이 쓴 localStorage 변경만 감지 — 같은 창의 쓰기는
// storage 이벤트가 뜨지 않는다)로 즉시 재렌더한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const POPOUT_CLOSE_TRIGGER_SELECTOR = [
  // manualPanelReset/tacticsNamesReset은 각각 resetManualPanelKind()/전술판 리셋 로직이
  // 값 삭제 후 closeManualPanel() 등으로 모달 자체를 닫아버린다 — 팝업에서는 모달을 닫아도
  // 뒤에 보여줄 대시보드가 없어(전부 숨김) 창만 텅 빈 채로 남으므로 같이 닫아줘야 한다.
  '#manualPanelClose', '#manualPanelCancel', '#manualPanelSave', '#manualPanelReset',
  '#settingsCloseBtn',
  '.ev-subst-picker-confirm', '.ev-subst-picker-cancel', '.ev-subst-picker-close',
  '#tacticsNamesClose', '#tacticsNamesCancel', '#tacticsNamesSave', '#tacticsNamesReset',
].join(', ');

/** 전술판 선수 이름 입력 버튼(onclick 인라인) 공용 진입점 — 새 창 분리 설정을 확인해 분기한다. */
function handleTacticsNamesBtnClick() {
  if (popoutModeEnabled()) {
    window.Popout.open('tactics-names', {});
  } else if (typeof openTacticsNamesPanel === 'function') {
    openTacticsNamesPanel();
  }
}
window.handleTacticsNamesBtnClick = handleTacticsNamesBtnClick;

// 대상별 창 크기 — 각 모달이 OFF(인라인)일 때 자연스럽게 갖는 가로세로 비율에 맞춰,
// 팝업이 그 비율 그대로 열리도록 한다(억지로 넓게/좁게 늘어나 보이지 않게).
// 데스크톱(OFF) 모달의 반응형 분기(lineup-manual.css/settings-popup.css)는 전부 팝업 CSS에서
// 무력화해뒀으므로, 창 크기는 "그 분기점을 넘는지"와 무관하게 순수하게 화면에 편한 크기로
// 자유롭게 고를 수 있다 — "팝업"다운 작은 크기로 축소.
const POPOUT_WINDOW_SIZE = {
  manual:         { width: 495, height: 820 },  // .dp-manual-modal (라인업/교체/미출전)
  'tactics-names': { width: 620, height: 850 }, // 같은 .dp-manual-modal 구조
  settings:       { width: 570, height: 760 },  // .sp-modal
  subst:          { width: 300, height: 420 },  // .ev-subst-picker-modal(소형 리스트)
  theme:          { width: 760, height: 700 },  // 페이지 하나(테마 탭) — 모달보다 살짝 넓게
};

/**
 * key/params로 고유한 window.open() 대상 이름을 만든다. 같은 대상(예: "홈 교체 명단")을
 * 다시 클릭하면 같은 이름이라 기존 창을 재사용/포커스하고, 다른 대상(예: "원정 미출전 명단")은
 * 이름이 달라 별도 창으로 동시에 뜬다 — 창 이름 하나로 전부 재사용하던 이전 방식과 차이.
 */
function popoutWindowName(key, params) {
  const parts = [key, ...Object.values(params || {})].map(v => String(v ?? ''));
  const safe = parts.join('_').replace(/[^a-zA-Z0-9_-]/g, '');
  return `obs_popout_${safe || 'default'}`;
}

/** 메인 창에서 호출 — key/params로 팝업 창을 열거나(같은 대상이 이미 열려있으면) 포커스한다. */
function popoutOpen(key, params) {
  const qs = new URLSearchParams({ popout: key, ...(params || {}) });
  const url = `${window.location.pathname}?${qs.toString()}`;
  const { width, height } = POPOUT_WINDOW_SIZE[key] || { width: 620, height: 700 };
  const win = window.open(url, popoutWindowName(key, params), `width=${width},height=${height},resizable=yes,scrollbars=yes`);
  if (win) win.focus();
  return win;
}
window.Popout = { open: popoutOpen };

/** "새 창에 열기" 설정이 ON이고, 지금 이 창 자체가 팝업이 아닐 때만 true. */
function popoutModeEnabled() {
  return typeof getSetting === 'function' && getSetting('popoutModals') === 'on' && !window.__POPOUT_MODE__;
}
window.popoutModeEnabled = popoutModeEnabled;

/**
 * obs.settings.v3 storage 이벤트 공통 처리 — settingsState를 최신 값으로 맞추고 체크박스/
 * 슬라이더 등 UI를 재동기화한다. "설정 초기화" 버튼은 값을 쓰는 게 아니라 키 자체를
 * removeItem으로 지우므로(settings-popup.js), 그 경우 event.newValue가 null이 되는데
 * loadSettings()는 저장된 값이 없으면 settingsState를 건드리지 않고 그냥 반환해버려
 * "초기화했는데 다른 창엔 반영이 안 되는" 문제가 있었다 — 그 경우엔 SETTINGS_DEFAULTS로
 * 직접 리셋한다. 반환값은 실제로 바뀐 카테고리 목록(호출자가 필요하면 이벤트 재발행에 사용).
 */
function syncSettingsFromStorage(newValue) {
  const before = { ...settingsState };
  if (newValue === null) {
    Object.assign(settingsState, SETTINGS_DEFAULTS);
    if (typeof applyLayoutSettings === 'function') applyLayoutSettings();
  } else if (typeof loadSettings === 'function') {
    loadSettings();
  }
  if (typeof SETTINGS_DEFAULTS === 'object' && typeof syncSettingUi === 'function') {
    Object.keys(SETTINGS_DEFAULTS).forEach(syncSettingUi);
  }
  return typeof SETTINGS_DEFAULTS === 'object'
    ? Object.keys(SETTINGS_DEFAULTS).filter(category => before[category] !== settingsState[category])
    : [];
}

/**
 * obs-scoreboard-state-v2(state.js SKEY) storage 이벤트 공통 처리 — 메인 창과 팝업 둘 다
 * 이 창의 로컬 state를 최신으로 맞추는 데 써야 한다. 이 함수를 메인 창에서만 등록해두면,
 * 테마 탭 팝업이 열려있는 동안 메인 창(또는 다른 팝업)에서 점수/색상이 바뀌어도 그 팝업의
 * state는 부팅 시점 스냅샷에 멈춰있다가, 팝업에서 아무 필드나 하나 바꿔 persist()가 그
 * 오래된 state 전체를 다시 저장하면서 메인 창의 변경사항을 되돌려버리는 문제가 있었다 —
 * 설정(syncSettingsFromStorage)과 똑같은 구조의 문제라 같은 함수를 메인/팝업 양쪽에서 공유한다.
 * event.oldValue와 비교해 "무엇이 바뀌었는지" 추정하지 않는다 — 오히려 그러면 이 창이 이미
 * 알고 있던 값과 반영해야 할 값이 어긋날 수 있다. 그 대신 저장된 최신 스냅샷(saved)을
 * 이 창의 현재 state와 직접 비교해 필드 단위로만 반영한다(항상 정확, 순서 무관).
 */
function syncScoreboardStateFromStorage(newValue) {
  try {
    const saved = JSON.parse(newValue || 'null');
    if (!saved) return;
    let changed = false;
    const apply = (key, value) => { if (state[key] !== value) { state[key] = value; changed = true; } };
    const applyIfPresent = keys => keys.forEach(key => { if (key in saved) apply(key, saved[key]); });

    // 1) 수동 모드 ON/OFF — theme.js:toggleManualMode()의 부수효과를 확인창 없이 재현.
    if (typeof saved.manualMode === 'boolean' && saved.manualMode !== state.manualMode) {
      apply('manualMode', saved.manualMode);
      if (el.manualModeToggle) el.manualModeToggle.checked = saved.manualMode;
      const sidebarMirror = document.getElementById('sidebarManualMirror');
      if (sidebarMirror) sidebarMirror.checked = saved.manualMode;
      if (el.manualSection) el.manualSection.classList.toggle('visible', saved.manualMode);
      if (!saved.manualMode) { apply('homeLogo', ''); apply('awayLogo', ''); }
    }

    // 2) 순수 표시/레이아웃 설정 — API 폴링이 절대 건드리지 않는 값들이라 수동 모드
    // 여부와 무관하게 항상 동기화해도 안전하다(색상/보드 폭/테두리/득점자 폰트/로고
    // 배율·위치/레드카드 레일/팀컬러 override 표시 등, 전부 theme.js·render.js가
    // 테마 탭 컨트롤에서 직접 쓰는 필드).
    if (saved.colors && typeof saved.colors === 'object') {
      Object.keys(saved.colors).forEach(key => {
        if (state.colors[key] !== saved.colors[key]) { state.colors[key] = saved.colors[key]; changed = true; }
      });
    }
    applyIfPresent([
      'aggEnabled', 'aggHomeBase', 'aggAwayBase',
      'logoAlign', 'radiusMode', 'boardWidth',
      'homeOutlineEnabled', 'awayOutlineEnabled', 'boardOutlineEnabled', 'scoreOutlineEnabled',
      'homeOutlineWidth', 'awayOutlineWidth', 'boardOutlineWidth', 'scoreOutlineWidth',
      'noteEnabled', 'noteFontSize', 'fontFamily',
      'homeLogoScale', 'awayLogoScale', 'homeLogoX', 'homeLogoY', 'awayLogoX', 'awayLogoY',
      'rcSize', 'rcGap', 'rcTop', 'rcHomeInset', 'rcAwayInset',
      'teamColorOverride', 'teamColorOverrideFixtureId',
    ]);

    // 3) 추가시간 — extraManualOverride가 켜져 있으면(수동으로 조작함) 수동 모드 여부와
    // 무관하게 동기화한다. 메인 창의 API 폴링도 이 플래그를 보고 자동 갱신을 건너뛰므로
    // (js/core/fixture.js) 값을 가져와도 서로 충돌하지 않는다.
    if (saved.extraManualOverride) applyIfPresent(['extra', 'extraShown', 'extraManualOverride']);

    // 4) 수동 모드에서만 사람이 직접 입력하는 필드 — 켜져 있을 때만 동기화한다. 꺼져
    // 있으면 이 값들(이름/전후반/점수/로고)은 API 폴링이 대신 채우므로, 팝업이 부팅
    // 시점에 들고 있던 오래된 스냅샷으로 덮어쓰면 안 된다.
    if (state.manualMode) {
      applyIfPresent(['homeName', 'awayName', 'half', 'homeScore', 'awayScore',
        'homeLogoManual', 'awayLogoManual', 'homeLogo', 'awayLogo']);
      if (saved.notes) {
        ['home', 'away'].forEach(side => {
          if (typeof saved.notes[side] === 'string' && saved.notes[side] !== state.notes[side]) {
            state.notes[side] = saved.notes[side];
            changed = true;
          }
        });
      }
    }

    // 일부러 동기화하지 않는 것: seconds/running/lastRunningTickMs(타이머 진행 — 매 초
    // 바뀌는 값을 다른 창의 스냅샷으로 덮으면 방송 시계가 튄다), boardScale(창마다 다른
    // 미리보기 배율이라 다른 창에 맞지 않음), pk/pkScore/pkLastExitedAt(PK는 버튼/단축키로
    // 진행 중인 이벤트 시퀀스라 오래된 값으로 되돌리면 진행 상황이 깨진다).

    if (changed) {
      if (state.manualMode && typeof syncManualInputs === 'function') syncManualInputs();
      if (typeof render === 'function') render();
    }
  } catch {}
}

if (window.__POPOUT_MODE__) {
  // 이 창 자신이 팝업인 경우 — 보드/사이드바/탭바 숨기고, 부팅이 끝나면 목표 트리거를 클릭한다.
  (function () {
    const p = window.__POPOUT_PARAMS__ || {};
    // 보드/사이드바/탭바/.pages는 js/core/popout-early.js가 붙인 CSS(html.is-popout ...)가
    // head 단계에서부터 이미 영구히 숨겨둔 상태 — 여기서는 목표 트리거만 찾아 클릭하면 된다.

    function resolveTriggerSelector() {
      if (p.popout === 'manual' && p.kind && p.side) {
        return `.dp-side-edit-btn[data-manual="${p.kind}"][data-side="${p.side}"]`;
      }
      if (p.popout === 'subst' && p.evkey && p.field) {
        const key = `${p.evkey}:${p.field}`.replace(/"/g, '\\"');
        return `[data-ev-key="${key}"]`;
      }
      if (p.popout === 'settings') return '#settingsGearBtn';
      if (p.popout === 'theme') return '.tab[data-page="theme"]';
      if (p.popout === 'tactics-names') return '#btn-tactics-manual-names';
      return null;
    }

    function reveal() {
      document.getElementById('popout-early-style')?.remove();
      document.body.style.visibility = '';
    }

    function activate() {
      const sel = resolveTriggerSelector();
      const trigger = sel && document.querySelector(sel);
      if (trigger) {
        trigger.click();
      } else {
        document.title = '입력창을 열 수 없음 (경기 데이터 없음)';
      }
      reveal();
    }

    // fixture.js의 DOMContentLoaded → sessionStorage 캐시 복원(requestAnimationFrame 1회)이
    // 끝난 뒤 실행되도록, 같은 이벤트에 나중에 등록(스크립트 로드 순서상 fixture.js보다 뒤) +
    // rAF 한 번 더 미뤄 순서를 보장한다. fixture 캐시가 아예 없는 targets(settings/theme)는
    // 어차피 그 체인과 무관하게 항상 존재하는 DOM을 찾으므로 늦게 실행돼도 문제 없다.
    document.addEventListener('DOMContentLoaded', () => {
      requestAnimationFrame(() => requestAnimationFrame(activate));
    });

    // 모달/설정 팝업의 저장·취소·닫기 버튼을 클릭하면 창도 함께 닫는다. 실제 저장/닫기 로직은
    // 각 모듈의 기존 delegated 클릭 핸들러가 그대로 처리하고, 여기서는 같은 클릭을 별도로
    // 감지해 window.close()만 얹는다(기존 코드 수정 없이 병행 리스너로 동작). 배경(backdrop)
    // 클릭은 일부러 포함하지 않는다 — 작업 중 실수로 바깥을 눌러 창이 닫히는 걸 막기 위함.
    document.addEventListener('click', event => {
      if (event.target.closest(POPOUT_CLOSE_TRIGGER_SELECTOR)) {
        setTimeout(() => window.close(), 50);
      }
    });
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') setTimeout(() => window.close(), 50);
    });

    // 팝업 자신의 settingsState도 부팅 시점 스냅샷이라 곧 낡을 수 있다 — 메인 창이나 다른
    // 팝업에서 설정이 바뀌는 동안 이 팝업에서 아무 설정이나 하나 바꾸면, setSetting()이
    // settingsState 전체를 localStorage에 다시 쓰면서(js/settings/settings-popup.js:
    // saveSettings) 그 사이 다른 창에서 바뀐 값을 롤백시켜버린다. 메인 창과 동일하게
    // storage 이벤트로 최신 값을 반영해둔다.
    window.addEventListener('storage', event => {
      if (event.key === SETTINGS_STORAGE_KEY) {
        syncSettingsFromStorage(event.newValue).forEach(category => {
          if (typeof applySettingSideEffects === 'function') applySettingSideEffects(category);
        });
        return;
      }
      // 팝업의 로컬 state(점수/색상/보드 폭 등)도 같은 이유로 낡을 수 있다 — 테마 탭
      // 팝업이 열려있는 동안 메인 창(또는 다른 팝업)에서 점수/색상이 바뀌었는데 이 팝업
      // 쪽에서 아무 필드나 하나 바꾸면, persist()가 이 팝업의 오래된 state 전체를 다시
      // 저장하면서 메인 창의 변경사항을 되돌려버린다. 메인 창과 동일한 필드별 규칙으로
      // 동기화한다(syncScoreboardStateFromStorage 참고).
      if (event.key === 'obs-scoreboard-state-v2') syncScoreboardStateFromStorage(event.newValue);
    });
  })();
} else {
  // 메인 창 — 팝업이 localStorage에 쓴 변경사항을 감지해 즉시 재반영한다.
  window.addEventListener('storage', event => {
    if (!event.key) return;
    if (event.key === SETTINGS_STORAGE_KEY) {
      // setSetting()이 로컬 변경 시 보내는 것과 똑같은 모양({category, value, mode})으로,
      // 실제로 바뀐 카테고리마다 따로 dispatch해야 한다 — lineup-render.js/events-panel.js/
      // stats-panel.js 등 대부분의 'settings:change' 리스너가 category 화이트리스트로
      // 필터링하기 때문에, category:null 하나만 보내면(이전 코드) 전부 무시되어 값은
      // 저장돼도 실제 화면(이름 표시 등)에는 아무것도 반영되지 않는 버그가 있었다.
      syncSettingsFromStorage(event.newValue).forEach(category => {
        // setSetting()이 로컬 변경 시에만 실행하던 부수효과(배경 CSS 변수, 그린스크린 재렌더,
        // bigPanelLinked 패널 높이 등)를 원격 변경/초기화에도 똑같이 적용 — 안 하면 값은
        // settingsState에 반영돼도 화면(CSS 변수 갱신 등)엔 반영되지 않는 카테고리가 있었다.
        if (typeof applySettingSideEffects === 'function') applySettingSideEffects(category);
        const value = settingsState[category];
        document.dispatchEvent(new CustomEvent('settings:change', { detail: { category, value, mode: value } }));
      });
      return;
    }
    if (typeof SUBST_OVERRIDE_STORAGE_KEY !== 'undefined' && event.key === SUBST_OVERRIDE_STORAGE_KEY) {
      // 팝업에서 교체 IN/OUT을 다시 고르면(evOpenSubstPicker) 같은 창 안에서는 확인 버튼이
      // evRerenderCurrentPanel + applyLineupPanels + ttRefreshEventsData 세 가지를 전부
      // 호출해 이벤트 패널/라인업/전술판 타임라인을 같이 갱신한다(js/panels/events-panel.js).
      // 아래 공용 fallback(rerenderLineupPanels만 호출)은 라인업만 갱신해, 이벤트 패널의
      // 선수명과 전술판 타임라인은 팝업에서 override를 바꿔도 반영되지 않았다 — 같은 세
      // 함수를 그대로 재사용해 메인 창에서도 동일하게 갱신한다.
      if (typeof evRerenderCurrentPanel === 'function') evRerenderCurrentPanel();
      if (typeof applyLineupPanels === 'function' && window._eventsLastData) {
        applyLineupPanels(window._eventsLastData);
      }
      if (typeof window.ttRefreshEventsData === 'function' && window._eventsLastData) {
        const fixtureId = window._eventsLastData?.matchInfo?.fixtureId;
        const patchedEvents = typeof evPatchSubstEvents === 'function'
          ? evPatchSubstEvents(window._eventsLastData.events, fixtureId)
          : window._eventsLastData.events;
        window.ttRefreshEventsData({ ...window._eventsLastData, events: patchedEvents });
      }
      return;
    }
    // 테마 탭 컨트롤은 obs.settings.v3가 아니라 점수판 전체 state(state.js:
    // SKEY='obs-scoreboard-state-v2')에 실려 저장된다 — 필드별 동기화 규칙은
    // syncScoreboardStateFromStorage 참고(메인 창/팝업 공용).
    if (event.key === 'obs-scoreboard-state-v2') {
      syncScoreboardStateFromStorage(event.newValue);
      return;
    }
    // 그 외(라인업 수동 입력, 교체 override, 선수 ID/닉네임 연결 등)는 전부 라인업/이벤트/전술판
    // 재렌더로 처리된다. rerenderLineupPanels가 없으면(예: 아직 fixture 미로딩) 조용히 무시.
    if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  });
}
