# FSM 점수판 새로고침/로딩 버그 3종 - 원인 분석 및 수정안

> 작성일: 2026-08-29
> 대상: obs-frontend 협업 프론트 개발자 (indvel)
> 관련 문서: [fsm-integration-guide.md](fsm-integration-guide.md)
> 상태: 원인 분석 완료, 코드 수정은 아직 적용 안 함 (검토/합의 후 적용 예정)

---

## 배경

2026-07-04 인디벨과의 대화에서 아래 3개 버그가 보고됨. Vercel 배포본 테스트 기준.

1. 월드컵 등 경기를 처음 로드하면 맞는 테마(WC26 등)로 나오지만, **F5 새로고침하면 기본(친선경기) 점수판으로 돌아감.**
2. 점수판이 새로 로딩(데이터 반영)될 때 나오는 **점수판 자체의 애니메이션이 너무 짧아서** 체감이 안 됨.
3. **두 번째 새로고침** 시 정적 HTML의 기본값(맨유 vs 맨시티 + 퇴장카드 2개)이 **잠깐 보였다가 사라짐.**

당시 인디벨은 1번에 대해 "기본 html로 떴다가 fsmRender 로딩돼서 순간적으로 바뀌는 거라 기본 html 수정하면 됨"이라고 답했고,
사용자는 "점수판 전체를 하나의 state 객체로 묶어서 render()보다 먼저 복원하면 될 것 같다"고 제안했음(`js/core/state.js`의 기존 `obs-scoreboard-state-v2` persist/restore 패턴 재사용 제안).

아래는 실제 코드를 열어 확인한 원인과, 그 제안 방향에 맞춘 구체적 수정안.

---

## 문제 1: 새로고침 시 기본 테마로 리셋됨

### 원인

- `js/core/fsm-board.js` 최하단의 `init()` IIFE가 `localStorage.getItem('obs-last-league-id')`를 읽어서 테마를 복원하려고 시도함:

  ```js
  (function init() {
    changeCSS('css/theme/result_style_default.css');
    const savedLeagueId = localStorage.getItem('obs-last-league-id');
    if (savedLeagueId) {
      window.autoApplyTemplateByLeagueId(Number(savedLeagueId), null);
    }
  })();
  ```

- 그런데 이 `'obs-last-league-id'` 키에 **`localStorage.setItem`으로 값을 써주는 코드가 프로젝트 어디에도 없음** (grep으로 전체 검색해서 확인 — `getItem` 호출 1건만 존재). 그래서 이 값은 항상 `null`이고, 매번 `FSM_FALLBACK_THEME`(default/친선경기)로 폴백함.
- 실제로 리그ID를 알아내서 테마를 적용하는 로직은 `js/core/fixture.js`에 있음(경기 ID 입력/자동 폴링 시):

  ```js
  // js/core/fixture.js (fetchAndApplyFixtureData 내부)
  const leagueId = extractLeagueIdFromFixtureData(data);
  if (!silent && leagueId != null && typeof window.autoApplyTemplateByLeagueId === 'function') {
    await window.autoApplyTemplateByLeagueId(leagueId, data.matchInfo.leagueLogoUrl);
  }
  ```

  이 코드는 `leagueId`를 계산해서 테마를 **적용만** 하고, 어디에도 **저장은 안 함**. 그래서 새로고침하면 그 정보가 통째로 사라짐.

- 한편 `js/core/state.js`의 전역 `state` 객체는 이미 검증된 persist/restore 파이프라인을 갖고 있음:

  ```js
  // state.js
  const SKEY = 'obs-scoreboard-state-v2';
  function persist(){ localStorage.setItem(SKEY, JSON.stringify(state)); /* ... */ }
  function restore(){ const saved = JSON.parse(localStorage.getItem(SKEY)||'null'); Object.assign(state, saved); /* ... */ }
  ```

  `js/core/init.js`가 페이지 로드 시 `restore() → render()` 순서로 호출해서, 팀명/점수/컬러 등은 새로고침해도 그대로 복원됨. **그런데 `state`에는 `leagueId`가 없어서, 테마(CSS 파일 선택)만 이 파이프라인 밖에 있는 상태.**

- 추가로 로드 순서 문제도 있음. `overlay_dashboard.html`의 스크립트 순서는:

  ```
  ... fsm-board.js → init.js
  ```

  `fsm-board.js`의 `init()` IIFE는 스크립트가 파싱되는 즉시 실행되는데, `state.restore()`는 그 다음 스크립트인 `init.js`에서 실행됨. 즉 지금 구조에서 fsm-board.js는 state 복원이 끝나기도 전에, 그것과 무관한 자기만의 (그리고 아무도 안 쓰는) 키를 읽고 있어서 애초에 설계가 어긋나 있음.

### 수정안 (state 객체에 편입 — 사용자가 제안한 방향)

1. **`js/core/state.js`** — `state` 객체에 필드 2개 추가:
   ```js
   leagueId: null, leagueLogoUrl: null,
   ```
   기존 `persist()`/`restore()`가 전체 객체를 JSON으로 통째로 저장/복원하므로 별도 로직 없이 자동으로 영속화됨.

2. **`js/core/fixture.js`** — `leagueId`를 계산한 직후(`silent` 여부와 무관하게) `state`에 기록하고 즉시 `persist()`:
   ```js
   const leagueId = extractLeagueIdFromFixtureData(data);
   state.leagueId = leagueId;
   state.leagueLogoUrl = data.matchInfo?.leagueLogoUrl || null;
   persist();
   if (!silent && leagueId != null && typeof window.autoApplyTemplateByLeagueId === 'function') {
     await window.autoApplyTemplateByLeagueId(leagueId, data.matchInfo.leagueLogoUrl);
   }
   ```
   - `applyFixtureToState()` 안에서 이미 `persist()`가 한 번 호출되지만 그건 이 지점보다 먼저 끝나버리므로, 여기서 별도로 한 번 더 저장해줘야 함 (바로 아래 있는 `localStorage.setItem('last_fixture_id', ...)` 저장 패턴과 동일한 방식).
   - 테마 CSS 실제 교체(`autoApplyTemplateByLeagueId` 호출)는 기존처럼 `!silent`일 때만 유지 — 폴링 중 테마가 깜빡이지 않게 하려는 기존 의도를 그대로 보존.

3. **`js/core/init.js`** — `restore();` 직후, `render();` 호출 이전에 추가:
   ```js
   restore();
   if (state.leagueId != null && typeof window.autoApplyTemplateByLeagueId === 'function') {
     window.autoApplyTemplateByLeagueId(state.leagueId, state.leagueLogoUrl || null);
   }
   // ... (기존 템플릿 목록 복원 등)
   render();
   ```
   이러면 "restore() → 파생 상태 적용 → render()" 순서가 되어, 다른 값들(팀명/점수/컬러)이 새로고침 후에도 그대로 유지되는 것과 똑같은 방식으로 테마도 최초 렌더 전에 복원됨.

4. **`js/core/fsm-board.js`** — 최하단 `init()` IIFE에서 `obs-last-league-id` 읽기/재적용 로직 제거(아무도 안 쓰던 죽은 코드). `changeCSS('css/theme/result_style_default.css');`만 남겨서, 스크립트 로드 직후 즉시 기본 스타일을 깔아주는 세이프티넷 역할만 하게 함 — 실제 테마 결정은 `init.js`가 전담.

---

## 문제 2: 로딩 시 점수판 애니메이션이 너무 짧음

### 조사 결과

- 점수판 전용 "진입 애니메이션"(fade-in, slide-in 등)은 **현재 구현돼 있지 않음**. `gsap` 라이브러리가 `<head>`에 로드는 돼있지만 실제로 `gsap.` 형태로 호출하는 코드는 프로젝트 어디에도 없음 — FSM 원본 위젯에 있었을 수도 있는 진입 연출이 이식 과정에서 빠진 것으로 보임.
- 대신 `css/theme/result_style_*.css` (default/EPL/CL/UEL/ACLE/UNL/EURO24/LIGUE1/SERIEA/KLEAGUE/WC26 — 총 11개 파일, 전부 동일 패턴 반복)에 아래처럼 `.teams-left/.teams-right`, `.team-logo`, `.score-div`, `.scoreboard-timer`, `.time`, `.extra-time` 등에 `transition: 0.4s ease-in-out;`(`.extra-time`은 `0.5s`도 중복 선언돼있음)가 걸려있음:
  ```css
  .fsm-board .teams-left, .teams-right {
    /* ... */
    transition: 0.4s ease-in-out;
  }
  ```
  `js/core/fsm-board.js`의 `applyText()`/`applyTeamColors()`가 팀명/배경색 등을 jQuery `.css()`/`.text()`로 바꿀 때마다 이 transition이 재생됨. 이게 현재 코드에서 유일하게 존재하는 "로딩 시 보이는 애니메이션" 후보.

### 수정안

- 위 11개 CSS 파일에서 반복되는 `transition: 0.4s ease-in-out;`(및 `.extra-time`의 중복된 `0.5s` 선언 정리)을 일괄적으로 더 체감되는 값(예: `0.9s` 안팎)으로 상향.
- 정확한 목표 시간은 정해진 값이 없으므로, 배포 후 실제로 눈으로 보면서 미세조정 필요. **또는 인디벨 쪽에 원래 FSM 위젯에 있었던 진입 애니메이션 스펙(있다면)을 확인 요청하는 게 더 정확할 수도 있음.**

---

## 문제 3: 두 번째 새로고침 시 기본값(맨유 vs 맨시티 + 퇴장카드 2개)이 깜빡임

### 원인

`overlay_dashboard.html`의 정적 마크업에 팀당 퇴장카드 1개씩이 이미 하드코딩돼 있음:

```html
<div class="div-rc home" id="rcHome">
  <div class="rc-card"></div>
</div>
<!-- ... -->
<div class="div-rc away" id="rcAway">
  <div class="rc-card"></div>
</div>
```

`result_style_default.css`(및 다른 테마 CSS)의 `.div-rc`는 기본적으로 `hidden` 클래스가 없고, `.rc-card`는 항상 빨간 배경으로 스타일링됨 — 즉 **정적 HTML 자체가 "양쪽 퇴장카드 1장씩(총 2장)"을 그리고 있는 상태**로 배포됨.

`js/core/render.js`의 `render()`가 `state.redHome`/`state.redAway` 개수만큼 `.rc-card`를 새로 만들어 기존 걸 갈아끼우고, 0장이면 `.hidden` 클래스를 붙임:

```js
// js/core/render.js
if(el.rcHome){ el.rcHome.replaceChildren(...make(state.redHome)); el.rcHome.classList.toggle('hidden', state.redHome===0); }
if(el.rcAway){ el.rcAway.replaceChildren(...make(state.redAway)); el.rcAway.classList.toggle('hidden', state.redAway===0); }
```

하지만 이건 스크립트가 다운로드/실행되고 `render()`가 실제로 호출된 *이후*에나 일어남. `<script>` 태그들이 `<body>` 최하단에 있고(non-defer), 브라우저는 그 앞의 정적 HTML(맨유/맨시티 텍스트, 퇴장카드 2개)을 스크립트 실행 전에 먼저 페인트할 수 있음 — 이게 "깜빡였다 사라지는" 원인.

(참고: `#rcHome`/`#rcAway`라는 id가 `.board` 안(FSM용)과 `.board` 밖(레거시 `.rc-rail`, 이미 `hidden`) 두 군데에 중복으로 존재함. `getElementById`/`$()`는 DOM에 먼저 나오는 쪽을 반환하므로 지금은 FSM 쪽이 정상적으로 잡히긴 하지만, 중복 id 자체는 무효한 HTML이라 정리 대상으로 별도 메모.)

### 수정안

- `overlay_dashboard.html`의 `#rcHome`, `#rcAway` 안에 있는 `<div class="rc-card"></div>`를 각각 제거하고 빈 컨테이너만 남김. `render()`가 필요할 때마다 알아서 채워 넣으므로 정적으로 미리 넣어둘 이유가 없음.
- (부수적, 이번엔 보류) `#team-text-left`/`#team-text-right`의 "맨유"/"맨시티" 기본 텍스트도 실제 `state` 기본값("HOME"/"AWAY")과 다른 목업 값이라 같은 이유로 정리 대상이지만, 사용자가 지적한 핵심 증상(퇴장카드 깜빡임)은 아니라서 이번 수정 범위에서는 제외.

---

## 적용 방법

이 문서는 진단 + 수정안 정리용이며 아직 코드에는 반영하지 않았음. 합의되면 아래 파일들을 수정:

- `js/core/state.js` — `leagueId`/`leagueLogoUrl` 필드 추가
- `js/core/fixture.js` — leagueId를 state에 기록 + persist
- `js/core/init.js` — restore() 직후 테마 재적용 호출 추가
- `js/core/fsm-board.js` — 죽은 `obs-last-league-id` 로직 제거
- `overlay_dashboard.html` — 정적 마크업의 하드코딩된 `.rc-card` 2개 제거
- `css/theme/result_style_*.css` (11개 파일) — `transition` 시간 상향

## 검증 방법

1. WC26 등 리그ID 매칭되는 경기 로드 → F5 반복 시 매번 같은 테마 유지되는지 확인.
2. DevTools Application 탭에서 `obs-scoreboard-state-v2`에 `leagueId`/`leagueLogoUrl`이 저장되는지 확인.
3. 새로고침 순간 화면 녹화 또는 네트워크 쓰로틀링으로 "맨유 vs 맨시티 + 퇴장카드" 플래시가 사라졌는지 확인.
4. 팀 컬러 변경 시점에 transition이 눈에 띄게 늘어났는지 확인.
5. 자동 폴링 중에는 여전히 테마가 깜빡이지 않는지(회귀 없는지) 확인.
