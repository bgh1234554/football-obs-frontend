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

const POPOUT_WINDOW_NAME = 'obs_popout_window';
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
  manual:         { width: 620, height: 820 },  // .dp-manual-modal (라인업/교체/미출전)
  'tactics-names': { width: 620, height: 700 }, // 같은 .dp-manual-modal 구조
  settings:       { width: 680, height: 760 },  // .sp-modal
  subst:          { width: 300, height: 420 },  // .ev-subst-picker-modal(소형 리스트)
  theme:          { width: 760, height: 700 },  // 페이지 하나(테마 탭) — 모달보다 살짝 넓게
};

/** 메인 창에서 호출 — key/params로 팝업 창을 열거나(이미 열려있으면) 포커스한다. */
function popoutOpen(key, params) {
  const qs = new URLSearchParams({ popout: key, ...(params || {}) });
  const url = `${window.location.pathname}?${qs.toString()}`;
  const { width, height } = POPOUT_WINDOW_SIZE[key] || { width: 620, height: 700 };
  const win = window.open(url, POPOUT_WINDOW_NAME, `width=${width},height=${height},resizable=yes,scrollbars=yes`);
  if (win) win.focus();
  return win;
}
window.Popout = { open: popoutOpen };

/** "새 창에 열기" 설정이 ON이고, 지금 이 창 자체가 팝업이 아닐 때만 true. */
function popoutModeEnabled() {
  return typeof getSetting === 'function' && getSetting('popoutModals') === 'on' && !window.__POPOUT_MODE__;
}
window.popoutModeEnabled = popoutModeEnabled;

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
  })();
} else {
  // 메인 창 — 팝업이 localStorage에 쓴 변경사항을 감지해 즉시 재반영한다.
  window.addEventListener('storage', event => {
    if (!event.key) return;
    if (event.key === SETTINGS_STORAGE_KEY) {
      // loadSettings()는 settingsState(메모리)와 CSS 변수(applyLayoutSettings)까지 갱신하지만,
      // 설정 팝업의 체크박스/슬라이더 등 DOM UI는 별개 — syncSettingUi를 직접 돌려주지 않으면
      // 팝업에서 바꾼 값이 메인 창에 저장은 되고도 다음에 열었을 때 화면엔 예전 상태로 보인다.
      if (typeof loadSettings === 'function') loadSettings();
      if (typeof SETTINGS_DEFAULTS === 'object' && typeof syncSettingUi === 'function') {
        Object.keys(SETTINGS_DEFAULTS).forEach(syncSettingUi);
      }
      document.dispatchEvent(new CustomEvent('settings:change', { detail: { category: null } }));
      return;
    }
    // 그 외(라인업 수동 입력, 교체 override, 선수 ID/닉네임 연결 등)는 전부 라인업/이벤트/전술판
    // 재렌더로 처리된다. rerenderLineupPanels가 없으면(예: 아직 fixture 미로딩) 조용히 무시.
    if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  });
}
