# 프론트엔드 파일 구조

## 진입점

`overlay_dashboard.html` — HTML 셸과 메뉴/설정/전술판 마크업. 주요 CSS/JS는 외부 파일로 분리하며 일부 인라인 스타일·이벤트 연결이 남아 있다.

`about.md`는 사용자용 안내서다. `js/core/init.js`에서 불러와 Markdown을 렌더링하고 DOMPurify로 정제한 뒤 About 탭에 표시한다. 이 구조 문서는 현재 브랜치의 실제 파일을 기준으로 한다.

---

## css/

로드 순서는 `overlay_dashboard.html`의 `<link>` 태그 순서와 동일.

### css/core/

| 파일 | 설명 |
|---|---|
| `variables.css` | `:root` CSS 변수. 팀 컬러(`--home-bg` 등), 점수판 치수(`--board-width`), 폰트, 패널 배경 알파 등. |
| `board.css` | 점수판 핵심 컴포넌트. `.board`, `.team`, `.logo-box`, `.score`, `.digits`, `.timer`, `.pk-wrap`, `.rc-rail`. 득점자 박스 수동 편집 인터랙션 포함. **모든 선택자는 `.board` 하위에서만 적용** (위젯 오염 방지). |
| `layout.css` | 전체 레이아웃과 body 화면 배율, `display-viewport` 컨테이너, 전술판 전체화면 내부 래퍼, 스크롤 경계. `board-stage`, `.note-side/.note`, 페이지·테마·About 영역, 위젯 CSS 격리, `.layout-wrap/.lp-col/.lp` 캠 큰/작음 레이아웃. |

### css/tactics/

| 파일 | 설명 |
|---|---|
| `tactics-timeline.css` | 전술판 타임라인 패널 (Iter 5-8). `#tactics-topbar`, `#tactics-timeline-panel`, `.td-tl-*`, `#tactics-time-slider`, 풀스크린 슬라이드 패널. |

### css/panels/

| 파일 | 설명 |
|---|---|
| `events-panel.css` | 이벤트 패널 (문자중계 타임라인). `.ev-title-bar`, `.ev-filter-*`, `.ev-subst-picker-*`, `.ev-list`, `.ev-row`, `.ev-bar`, `.ev-label`, `.ev-icon`, `.ev-text`, `.ev-team-logo`. |
| `stats-panel.css` | 경기 스탯 패널. `.lp-stat` 컨트롤, `.lp-stat-cycle-btn`, `.lp-stat-pause-btn`, `.lp-stat-standings-popup-btn`, `.lp-force-refresh-btn`, `.bc-*` 교체명단 사이클, `.st-*` 스탯, `scoreaxis-standings-*`. |
| `bench-injury.css` | 벤치/부상 패널 공통. `.dp-panel`, `.dp-title`, `.dp-split`, `.dp-col`, `.dp-list`, `.dp-item`, 카드 마커, 부상 아이콘, 벤치 푸터, 로딩/빈 상태. |
| `hth-panel.css` | 상대 전적 패널. `.hth-*`, `.small-panel-mode-buttons`, `.small-panel-mode-btn`. |

### css/lineup/

| 파일 | 설명 |
|---|---|
| `lineup-layout.css` | 라인업 레이아웃과 리사이즈 핸들. 캠 작은 좌우 칼럼 너비·교체/미출전 높이 경계(`.lp-small-bench-height-resize`), 명단 스크롤바, 캠 큰 패널 너비/높이 및 라인업 모서리·축별 핸들. |
| `lineup-pitch.css` | 라인업 피치 렌더링. `.dp-lineup-body`, `.dp-lineup-vertical-pitch`, 피치 마킹 SVG, `.dp-lineup-league-wash`, `.dp-lineup-team-chip`, `.dp-lineup-node`, `.dp-node-badge`(평점 뱃지), `.dp-lineup-name`. |
| `lineup-manual.css` | 수동 입력 모달 + 그리드 모드. `.dp-manual-backdrop/modal/header/footer/body`, `.dp-field`, `.dp-manual-grid`, `.dp-grid-*`, `.sp-radio-cluster`, `.tn-tabs`(전술판 선수 이름 입력 모달). |

### css/player/

| 파일 | 설명 |
|---|---|
| `player-menu.css` | 선수 컨텍스트 메뉴 (Iter 6). `.pm-*`(pmContainer, pm-popup, pm-close, pm-info, pm-avatar, pm-btns, pm-nick-*, pm-stat-table, pm-szn-*), `pirPopup`. |

### css/ (루트)

| 파일 | 설명 |
|---|---|
| `hamburger-nav.css` | 햄버거 사이드바 네비게이션. 플로팅 버튼, 사이드바 패널/헤더/본문, 백드롭, BMC 연동(`body.sidebar-open` 조건). |
| `settings-popup.css` | 설정 모달. 사이드바 톱니 버튼, 백드롭, 토글 스위치, 탭 구조, 확장 섹션. |

**주의사항**:
- 점수판 클래스(`.name`, `.score`, `.digits` 등)는 반드시 `.board` 하위로만 스코프 제한 — 위젯 오염 방지
- 위젯 격리 블록(`#game-content { --home-bg: initial; ... }`) 절대 제거 금지 (`layout.css`)
- `box-sizing: content-box` 위젯 오버라이드 금지 (score 원형 뱃지 파괴됨)

---

## js/

로드 순서는 `overlay_dashboard.html`의 `<script>` 태그 순서와 동일. 전역 스코프를 공유(non-module).  
`display-scale.js`는 head에서 동기 실행해 본문 측정 전에 좌표 헬퍼와 배율을 준비한다. `init.js`는 상태·렌더·패널 모듈 뒤에서 초기화하며, 현재 마크업에서는 `sidebar.js`가 그 다음에 로드된다.

### js/core/

| 파일 | 역할 | 주요 함수/변수 |
|---|---|---|
| `display-scale.js` | 1920px 기준 전체 UI 배율, DPI/뷰포트 변경 감지, 빈 배경 터치 스크롤 방지 | `toDisplayLayoutPixels/Point/Rect()`, `getDisplayLayoutRect()`, `--display-*` CSS 변수 |
| `utils.js` | 공통 유틸 | `$()`, `setCSS()`, `getCSS()`, `fmtClock()`, `clampNum()`, `downloadBlob()` |
| `state.js` | 전역 상태 | `state` (점수·로고·색상·half·timer 등), `el` (DOM 참조), `persist()`, `restore()` |
| `render.js` | 점수판 렌더링 | `render()`, `formatScorers()`, `applyBoardScale()`, `pkPush/Undo/Reset()`, `setMatchHalf()`, `flashElement()` |
| `timer.js` | 경기 시간 타이머 | `startClockTimer()`, `pauseClockTimer()`, `setClockSeconds()`, `syncRunningClockToNow()`, 인라인 시간 편집기 |
| `fixture.js` | 경기 ID 연동 + 폴링 | `fetchAndApplyFixtureData()`, `buildScorers()`, `schedulePoll()`, `forceRefreshCurrentFixture()`. 진행 중 15초 / FT 감지 후 3분간 1분 간격 / INT 5분 간격(30분 후 중단) |
| `api.js` | 백엔드 fetch | `fetchFixture()`, `fetchPlayerStats()`, `fetchHeadToHead()`, `ApiError` |
| `router.js` | 탭/URL 동기화 | `activatePage()`. 배포 환경에서는 `/detail`, `/theme`, `/schedule` 등의 경로, localhost·명시적 HTML 진입점에서는 `#/detail` 등의 hash를 사용. LAN Live Server의 HTML 경로를 보존. 일정 위젯 lazy mount와 API 폴링 제어 |
| `schedule-resize.js` | 일정 확인 탭 칼럼 리사이즈 | `ensureScheduleGridResizeHandles()`, `startScheduleGridResize()`, `resetScheduleGridPair()`. Leagues/Games/Details/Standings 4칼럼 경계 3곳에 드래그 핸들 — 각 핸들은 인접한 두 칼럼의 비율 합만 유지한 채 재분배(나머지 두 칼럼 불변), 더블클릭 시 그 두 칼럼만 기본 비율로 복원. 비율(합=1)로 저장해 ResizeObserver로 화면 폭 변화에도 재적용 |
| `keyboard.js` | 전역 단축키 | `window keydown` 핸들러 — Space/R/E/[/]/H/T/1~8/Q/W/A/S/F/Z/X/Ctrl+Z·Y 등 |
| `init.js` | 초기화 | `restore()` → `render()` → `initBoardScale()` → 이벤트 핸들러 등록 |

### js/theme/

| 파일 | 역할 |
|---|---|
| `theme.js` | 템플릿 관리, 색상/폰트 바인딩, 수동 모드, `autoApplyTemplateByLeagueId()` |

### js/tactics/

| 파일 | 역할 |
|---|---|
| `tactics.js` | 전술판 토큰 드래그, 포메이션 좌표(`TACTICS_FM`), 드로잉, SVG 렌더 |
| `tactics-timeline.js` | 전술판 타임라인 패널 (Iter 5-8) — 교체/퇴장 이벤트 기반 라인업 시뮬레이션 |
| `tactics-manual-names.js` | 경기 ID 미연동 시 전술판 선수 이름 수동 입력 모달 |

### js/data/

| 파일 | 역할 |
|---|---|
| `injury-reason.js` | 부상 사유 한글화 (`INJURY_REASON_KO`) + `isSuspension()` |
| `stats-config.js` | 경기 스탯 라벨 한글 매핑 + 표시 순서 + 자동 스와이프 간격 (사용자 편집용) |
| `scoreaxis-standings-embed-map.js` | ScoreAxis 리그 순위 위젯 embed 코드 맵 (Iter 14) |
| `team-color-overrides.js` | (deprecated) 팀 컬러 수동 보정 맵 — 백엔드 `teams.csv`의 `primary_color_override`/`number_color_override` 컬럼으로 이전됨 |

### js/settings/

| 파일 | 역할 |
|---|---|
| `settings-popup.js` | 설정 팝업 제어 (탭: 이름/라인업/패널·스탯/배경·OBS/관리) + localStorage 영속화 + `settings:change` 이벤트 |

### js/lineup/

로드 순서: `lineup-events` → `lineup-manual-store` → `lineup-data` → `lineup-render` → `lineup-name-fit` → `lineup-manual-modal` → `lineup-resize`

| 파일 | 역할 |
|---|---|
| `lineup-events.js` | 라인업 노드/벤치 행에 골·어시·카드·교체 IN/OUT·평점 표시용 헬퍼 |
| `lineup-manual-store.js` | 공통 유틸(`dpEscape/clonePlayers`) + `lineupPanelState` + fixture 단위 수동 override localStorage CRUD |
| `lineup-data.js` | `buildEffectiveFixtureData()` — API 응답 + 수동 override 합성, 그리드/포메이션/색상 변환 |
| `lineup-render.js` | 벤치/부상/라인업 패널 HTML 빌더 + 렌더 + 교체명단 사이클 패널 + 전술판 동기화. 진입점: `applyLineupPanels()` |
| `lineup-name-fit.js` | 이름 pill·팀칩·벤치 텍스트 충돌 보정(`fitLineupNamePills`), 교체/미출전 자동 높이 배분(`balanceBenchInjuryPanelHeights`), 칼럼 ResizeObserver. 화면 사각형을 논리 좌표로 변환해 측정 |
| `lineup-manual-modal.js` | 수동 입력 모달(그리드 모드 + 라인업/벤치/부상자 풀폼) + 감독/주심 인라인 편집 |
| `lineup-resize.js` | 캠 큰 라인업 크기·축별 조절, 우측 패널 연결/독립 너비·높이, 캠 작은 좌우 너비·교체/미출전 높이 비율. 포인터 좌표 변환, localStorage 저장, 더블클릭 초기화와 `resetAllLayoutSizes()` |

### js/panels/

| 파일 | 역할 |
|---|---|
| `event-comments.js` | 이벤트 코멘트 한글 매핑 (`translateEventComment()`) — Foul/Tripping/Argument 등 33종 |
| `events-panel.js` | 이벤트 타임라인 렌더 (`lp-events-s` 전용). 시간 내림차순, 구간 구분자, 필터 UI |
| `hth-panel.js` | 상대 전적 패널 렌더. `/api/hth` 호출 → 결과 카드 |
| `stats-panel.js` | 경기 스탯 패널 (`lp-stat` + `lp-stat-s`). 동적 페이지네이션, 막대 비율, 자동 스와이프 |
| `stat-cycle.js` | 캠 큰 패널 모드 순환 — 스탯/이벤트/HTH/홈교체/원정교체/경기 정보. 데이터 유무·사용자 포함 설정에 따른 자동 전환과 스크롤. 순위표는 별도 팝업 |
| `scoreaxis-standings-panel.js` | ScoreAxis 실시간 순위 위젯의 캠 작은 패널 및 공용 팝업. `<iframe srcdoc>` 렌더 |

### js/player/

| 파일 | 역할 |
|---|---|
| `player-menu-stat-labels.js` | 경기별 스탯 한글 레이블 매핑 (사용자 편집용) |
| `player-menu-szn-labels.js` | 시즌별 스탯 한글 레이블 매핑 (사용자 편집용) |
| `player-menu.js` | 선수 컨텍스트 메뉴. 등번호·이름·포지션·닉네임·ID 연결 진입·경기/시즌 스탯. 전체 UI 배율을 고려한 팝업 위치와 화면 안 배치 |
| `player-id-resolve.js` | id=0 선수 ID 연결 (Iter 10). alt ID 수동/자동 연결, 유사도 매칭(Jaro-Winkler) |

### js/sidebar/

| 파일 | 역할 |
|---|---|
| `sidebar.js` | 햄버거 사이드바 제어 (`openSidebar/closeSidebar`), 수동 모드 미러, Tab/Esc 단축키 |

---

## 키보드 단축키

입력 포커스(`INPUT`, `TEXTAREA`, `SELECT`) 상태에서는 모두 무시.

| 키 | 동작 |
|---|---|
| `Tab` | 햄버거 사이드바 열기/닫기 |
| `Esc` | 사이드바 닫기 |
| `Space` | 타이머 시작/정지 |
| `R` / `Shift+R` | 타이머 리셋 00:00 / 90:00 |
| `E` / `Shift+E` | 타이머 45:00 / 105:00 |
| `[` / `]` | 전/후반 이전/다음 (`1H → HT → 2H → ET1 → ET2 → PK → FT`) |
| `H` | 메뉴 바 숨기기/표시 토글 |
| `T` | 추가시간 표시/숨김 토글 |
| `\` | 전술판 전체화면 토글 (전술판 탭 활성화 시에만) |
| `1` ~ `6` | 탭 직접 전환 (메인 큰/작음, 테마, 일정, 전술판, 어바웃) |
| `7` | 경기 ID 입력 오버레이 열기 |
| `8` | Buy me a coffee 페이지 열기 |
| `Ctrl+Z` / `Ctrl+Y` | 전술판 Undo / Redo |
| `Q` / `A` | 수동 모드: 홈 점수 +1 / -1. PK: 홈 골(G) / 실축(M) |
| `W` / `S` | 수동 모드: 어웨이 점수 +1 / -1. PK: 어웨이 골(G) / 실축(M) |
| `F` | 수동 모드: 홈/어웨이 점수 초기화 |
| `Z` / `X` | PK: 마지막 킥 Undo / 전체 초기화 |

---

## state 플래그 (중요)

```javascript
state.fixtureLinked         // 경기 ID 연동 여부
state.halfManualOverride    // 전/후반 수동 조작 시 true → 폴링 업데이트 건너뜀
state.extraManualOverride   // 추가시간 수동 조작 시 true → 폴링이 extra 덮어쓰지 않음
state.pkScore               // { home: number|null, away: number|null } — PSO 점수
state.teamColorOverride     // 사용자가 theme 탭에서 컬러 수정 시 true → 폴링이 API 컬러로 덮지 않음
state.lastRunningTickMs     // 새로고침 사이 타이머 drift 보정용 (Date.now 기반)
```

경기 ID 새로 입력 시 `fixtureLinked / halfManualOverride / extraManualOverride / pkScore / teamColorOverride` 리셋.

---

## 백엔드 연동

백엔드 URL: `https://football-obs-backend.onrender.com`

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/fixtures/{fixtureId}` | 경기 전체 정보 (`FixtureResponseDto`) |
| `GET /api/playerStats/{playerId}` | 선수 시즌별 대회별 스탯 |
| `GET /api/hth?teamA={id}&teamB={id}` | 상대 전적 |

응답 구조는 [api-endpoints.md](api-endpoints.md), 실제 호출은 `js/core/api.js`, 응답 → state 및 득점자/카드 가공은 `js/core/fixture.js`, 라인업 수동값 합성은 `js/lineup/lineup-data.js`를 확인한다.

---

## 화면 배율과 좌표

가로 1920px의 기존 UI가 기준이다. `display-scale.js`가 `가용 CSS 뷰포트 폭 / 1920`을 전체 배율로 정하고 body를 변환한다. 논리 높이는 `가용 높이 / 전체 배율`로 계산하므로 주소창 때문에 높이가 줄어도 글씨까지 축소하지 않는다. 같은 화면비의 4K는 FHD의 2배, 다른 화면비는 패널이 남는 높이를 채운다. 피치·이미지는 종횡비를 유지한다.

- `clientWidth/Height`, `offsetWidth/Height`, `scrollWidth/Height`는 논리 레이아웃 값이다. 화면 bbox를 이 값과 섞을 때는 `getDisplayLayoutRect()`를 사용한다.
- 포인터를 CSS 위치에 넣을 때는 `toDisplayLayoutPoint()`, 길이·이동량에는 `toDisplayLayoutPixels()`를 사용한다. 화면 좌표끼리 비교하는 히트 테스트는 그대로 비교한다.
- CSS의 뷰포트 기준 치수는 `--display-vw/--display-vh`, 반응형 분기는 `@container display-viewport`를 확인한다.
- 사용자 점수판 배율은 `applyBoardScale()`이 별도로 담당한다. 전체 배율을 점수판 내부에 다시 곱하지 않는다. 좌표 헬퍼는 body 배율만 제거하며 내부 요소의 별도 transform까지 제거하지 않는다.
- 전술판 전체화면은 top layer에서 body 변환을 벗어나므로 `.tactics-viewport` 내부 래퍼에 같은 화면 보정을 적용한다.
- DPR < 1의 layout zoom은 테두리·스크롤바의 최소 픽셀 반올림 보정용이다. 모든 기기에 `zoom = 1 / DPR`만 적용하는 이전 구현으로 돌아가지 않는다.

## 패널 크기 저장과 자동 높이

캠 큰 우측 너비는 `obs.bigLayout.colWidth.v1`, 개별 패널 크기와 높이 비율은 같은 접두어의 키에 저장한다. 캠 작은 좌우 비율은 `obs.smallLayout.eventsStatRatio.v1`, 교체/미출전 세로 비율은 `obs.smallLayout.benchHeightRatio.v1`이다. 화면 bbox를 그대로 저장해 다음 로드에서 또 확대하지 않도록 논리 크기 또는 비율을 저장한다.

교체/미출전 높이는 저장값이 없으면 기존 자동 배분을 사용한다. 수동 비율이 있으면 그 비율을 먼저 적용하고 명단 내부 스크롤을 허용한다. 이후 `lpBenchPanelRebalanceInfoSpace()`가 교체 패널 내부 명단/경기 정보 공간만 배분한다. 자동 높이 회수(`reclaimBenchListOverflowHeight`)는 수동 분할을 덮어쓰지 않는다. 경계 더블클릭은 저장값을 제거해 현재 내용에 맞는 자동 높이로 복원한다.

## 로컬 검증

별도 빌드 없이 Live Server 등 정적 서버에서 `overlay_dashboard.html`을 연다. 명시적 HTML 진입점에서는 `overlay_dashboard.html#/tactics`처럼 hash 경로를 유지해야 새로고침이 정적 서버의 404로 이어지지 않는다.

로컬 `tests/display-viewport.cjs`는 DPR·해상도·전체화면·태블릿 스크롤·펜 좌표를, `tests/display-scale-layout.cjs`는 라인업·패널 크기·저장값·세로 핸들·초기화를 검증한다. Playwright/Chromium이 필요하며 실제 Windows 설정 변경이나 실제 OBS CEF 검증을 대신하지는 않는다.

`tools/`, `tests/`, 스크린샷은 현재 Git 제외 대상이다. 이 작업 폴더에는 `tools/testMethod/tablet-live-test.md`(연결 방법), `tools/testMethod/display-verification.md`(검증 기록), `tools/fsm-display-scale-notes.md`(`feature/Indvel` 점수판 통합 메모)가 있다. 새 clone에는 포함되지 않으므로 로컬 파일 존재 여부를 확인한다.
