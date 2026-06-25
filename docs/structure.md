# 프론트엔드 파일 구조

## 진입점

`overlay_dashboard.html` — HTML 셸. CSS/JS는 모두 외부 파일로 분리.

---

## css/

로드 순서는 `overlay_dashboard.html`의 `<link>` 태그 순서와 동일.

### css/core/

| 파일 | 설명 |
|---|---|
| `variables.css` | `:root` CSS 변수 전체. 팀 컬러(`--home-bg` 등), 점수판 치수(`--board-width`), 폰트, 패널 배경 알파 등 약 90줄. |
| `board.css` | 점수판 핵심 컴포넌트. `.board`, `.team`, `.logo-box`, `.score`, `.digits`, `.timer`, `.pk-wrap`, `.rc-rail`. 득점자 박스 수동 편집 인터랙션 포함. **모든 선택자는 `.board` 하위에서만 적용** (위젯 오염 방지). |
| `layout.css` | 전체 레이아웃 기반. `html/body` 리셋, `board-stage`, `.note-side/.note`, 탭 바, 수동 모드 섹션, 페이지 영역, `panel-box`, 위젯 CSS 격리(`--home-bg: initial` 블록), 테마 탭 패널, 마크다운 렌더러, `.layout-wrap/.lp-col/.lp`, 캠 큰/작음 레이아웃. |

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
| `lineup-layout.css` | 라인업 레이아웃 보정 + 리사이즈 핸들. `layout-small` 컬럼 비율, `.lp-lineup-resize`, `dp-side-header` 인라인 편집, 캠 큼 리사이즈 핸들(`.lp-big-col-*`), 라인업 독립 edge 리사이즈(`.lp-lineup-right/top-edge`). |
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
`init.js`는 반드시 마지막에 로드.

### js/core/

| 파일 | 역할 | 주요 함수/변수 |
|---|---|---|
| `utils.js` | 공통 유틸 | `$()`, `setCSS()`, `getCSS()`, `fmtClock()`, `clampNum()`, `downloadBlob()` |
| `state.js` | 전역 상태 | `state` (점수·로고·색상·half·timer 등), `el` (DOM 참조), `persist()`, `restore()` |
| `render.js` | 점수판 렌더링 | `render()`, `formatScorers()`, `applyBoardScale()`, `pkPush/Undo/Reset()`, `setMatchHalf()`, `flashElement()` |
| `timer.js` | 경기 시간 타이머 | `startClockTimer()`, `pauseClockTimer()`, `setClockSeconds()`, `syncRunningClockToNow()`, 인라인 시간 편집기 |
| `fixture.js` | 경기 ID 연동 + 폴링 | `fetchAndApplyFixtureData()`, `buildScorers()`, `schedulePoll()`, `forceRefreshCurrentFixture()`. 진행 중 15초 / FT 후 1분 / INT 5분 간격 |
| `api.js` | 백엔드 fetch | `fetchFixture()`, `fetchPlayerStats()`, `fetchHeadToHead()`, `ApiError` |
| `router.js` | 탭/URL 동기화 | `activatePage()`, path-based URL (`/detail`, `/theme`, `/schedule`, `/tactics`, `/about`). 일정 탭 위젯 lazy mount + API 폴링 차단 |
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
| `lineup-name-fit.js` | 이름 pill/팀칩/벤치 텍스트 충돌 보정. `fitLineupNamePills()` 4단계 알고리즘 |
| `lineup-manual-modal.js` | 수동 입력 모달(그리드 모드 + 라인업/벤치/부상자 풀폼) + 감독/주심 인라인 편집 |
| `lineup-resize.js` | 캠 큰 `.lp-lineup` 우상단 핸들 드래그 — height 배율(`--lp-lineup-scale`) 조정 + localStorage 저장 |

### js/panels/

| 파일 | 역할 |
|---|---|
| `event-comments.js` | 이벤트 코멘트 한글 매핑 (`translateEventComment()`) — Foul/Tripping/Argument 등 33종 |
| `events-panel.js` | 이벤트 타임라인 렌더 (`lp-events-s` 전용). 시간 내림차순, 구간 구분자, 필터 UI |
| `hth-panel.js` | 상대 전적 패널 렌더. `/api/hth` 호출 → 결과 카드 |
| `stats-panel.js` | 경기 스탯 패널 (`lp-stat` + `lp-stat-s`). 동적 페이지네이션, 막대 비율, 자동 스와이프 |
| `stat-cycle.js` | 캠 큰 패널 모드 순환 — 스탯/이벤트/HTH/홈교체/원정교체/순위표. 자동 전환 타이머 |
| `scoreaxis-standings-panel.js` | ScoreAxis 실시간 순위 위젯 패널 (Iter 14). `<iframe srcdoc>` 렌더 |

### js/player/

| 파일 | 역할 |
|---|---|
| `player-menu-stat-labels.js` | 경기별 스탯 한글 레이블 매핑 (사용자 편집용) |
| `player-menu-szn-labels.js` | 시즌별 스탯 한글 레이블 매핑 (사용자 편집용) |
| `player-menu.js` | 선수 컨텍스트 메뉴 (Iter 6). 등번호·이름·포지션 + 닉네임/경기스탯/시즌스탯 3개 버튼 |
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

응답 → state 매핑, 득점자/카드 가공 로직은 `CLAUDE.md` "백엔드 연동 시 프런트엔드 구현 사항" 참조.
