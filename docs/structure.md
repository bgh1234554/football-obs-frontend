# 프론트엔드 파일 구조

## 진입점

`overlay_dashboard_five_cols.html` — HTML 셸 (~930줄). CSS/JS는 모두 외부 파일로 분리.

---

## css/

| 파일 | 설명 |
|---|---|
| `main.css` | 전체 스타일시트. CSS 변수, 점수판(`.board` 하위 스코프), 탭/페이지 레이아웃, 전술판, 위젯 CSS 격리(`--home-bg` 등 변수 초기화), 토스트 등. |
| `hamburger-nav.css` | 햄버거 사이드바 네비게이션 스타일. 플로팅 버튼, 사이드바 패널, 백드롭, BMC 위젯 사이드바 연동(`body.sidebar-open` 조건). |

**주의사항**:
- 점수판 클래스(`.name`, `.score`, `.digits` 등)는 반드시 `.board` 하위로만 스코프를 제한 — 위젯 오염 방지
- 위젯 격리 블록(`#game-content { --home-bg: initial; ... }`) 절대 제거 금지
- `box-sizing: content-box` 위젯 오버라이드 금지 (score 원형 뱃지 파괴됨)

---

## js/

로드 순서대로 정렬. 평범한 스크립트(non-module)이므로 전역 스코프를 공유.  
`init.js`는 반드시 마지막에 로드 (모든 함수 정의 완료 후 초기화 코드 실행).

| 파일 | 역할 | 주요 함수/변수 |
|---|---|---|
| `utils.js` | 공통 유틸 | `$()`, `setCSS()`, `getCSS()`, `fmtClock()`, `clampNum()`, `downloadBlob()`, `slugify()`, `parseStartTime()`, `appAssetPath()` |
| `state.js` | 전역 상태 | `state` (점수·로고·색상·half·timer 등 모든 UI 상태), `el` (DOM 엘리먼트 참조), `persist()`, `restore()` |
| `render.js` | 점수판 렌더링 | `render()`, `autoLayoutNotes()`, `autoLayoutNote()`, `formatScorers()`, `applyBoardScale()`, `initBoardScale()`, `pkPush()`, `pkUndo()`, `pkReset()`, `syncScoreCol()`, `setMatchHalf()` |
| `timer.js` | 경기 시간 | 200ms 인터벌 tick, 인라인 시간 편집기 (시계 더블클릭 → 분/초 직접 입력) |
| `theme.js` | 테마/수동 모드 | `loadTemplates()`, `saveTemplate()`, `bindColor()`, `syncManualInputs()`, `resetManualScore()`, `toggleManualExtra()` |
| `router.js` | 탭/URL 동기화 | `activatePage()`, `toggleTabsAndPages()`, path-based URL 동기화 (`/detail`, `/theme`, `/schedule`, `/tactics`, `/about`) |
| `fixture.js` | 경기 연동 | 위젯 MutationObserver (경기 ID 추출), 경기 ID 입력 오버레이, `fetchAndApplyFixtureData()` (현재 stub) |
| `api.js` | 백엔드 fetch | `fetchFixture()`, `fetchPlayerStats()`, `fetchHeadToHead()` — 구현 예정 |
| `keyboard.js` | 키보드 단축키 | `window keydown` 핸들러. 단축키 목록은 하단 참조. |
| `tactics.js` | 전술판 | `TACTICS_FM` (포메이션 좌표), `tacticsRenderTokens()`, `tacticsApplyLineup()`, `tdRenderSVG()`, `tdUndo()`, `tdRedo()`, `tacticsToggleFullscreen()` |
| `init.js` | 초기화 | `restore()` → `render()` → `initBoardScale()` → 이벤트 핸들러 등록 → `loadAbout()` |
| `sidebar.js` | 햄버거 사이드바 제어 | `openSidebar()`, `closeSidebar()`, 수동 모드 미러 토글 동기화, `toggleTabsAndPages` 패치, Tab/Esc 단축키 |

---

## 키보드 단축키 (keyboard.js + sidebar.js)

입력 포커스(`INPUT`, `TEXTAREA`, `SELECT`)가 있을 때는 모두 무시.

| 키 | 동작 | 담당 파일 |
|---|---|---|
| `Tab` | 햄버거 사이드바 열기/닫기 | sidebar.js |
| `Esc` | 사이드바 열려있으면 닫기 | sidebar.js |
| `Space` | 타이머 시작/정지 | keyboard.js |
| `R` | 타이머 리셋 (00:00) | keyboard.js |
| `[` / `]` | 전/후반 이전/다음 (`1H → 2H → ET1 → ET2 → PK`) | keyboard.js |
| `H` | 메뉴 바(햄버거 버튼) 숨기기/표시 토글 | keyboard.js |
| `\` | 전술판 전체화면 토글 (전술판 탭 활성화 시에만) | keyboard.js |
| `1` ~ `6` | 탭 직접 전환 (메인 큰/작은, 테마, 일정, 전술판, 어바웃) | keyboard.js |
| `7` | 경기 ID 입력 오버레이 열기 | keyboard.js |
| `8` | Buy me a coffee 새 탭 열기 | keyboard.js |
| `Ctrl+Z` | 전술판 Undo | keyboard.js |
| `Ctrl+Y` | 전술판 Redo | keyboard.js |
| `Q` / `A` | 수동 모드: 홈 점수 +1 / -1. PK 하프: 홈 골(G) / 실축(M) | keyboard.js |
| `W` / `S` | 수동 모드: 어웨이 점수 +1 / -1. PK 하프: 어웨이 골(G) / 실축(M) | keyboard.js |
| `F` | 수동 모드: 홈/어웨이 점수 초기화 | keyboard.js |
| `T` | 수동 모드: 추가시간 표시/숨김 토글 | keyboard.js |
| `Z` | PK 하프: 마지막 킥 결과 Undo | keyboard.js |
| `X` | PK 하프: PK 결과 전체 초기화 | keyboard.js |

---

## state 플래그 (중요)

```javascript
state.fixtureLinked       // 경기 ID 연동 여부
state.halfManualOverride  // 전/후반 수동 조작 시 true → 자동 업데이트 건너뜀
state.extraManualOverride // 추가시간 수동 입력 시 true
```

경기 ID 새로 입력 시 전부 리셋.

---

## 백엔드 연동 (api.js 구현 시 참고)

백엔드 URL: `https://football-obs-backend.onrender.com`

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/fixtures/{fixtureId}` | 경기 전체 정보 (FixtureResponseDto) |
| `GET /api/playerStats/{playerId}` | 선수 시즌별 대회별 스탯 |
| `GET /api/hth?teamA={teamA}&teamB={teamB}` | 상대 전적 |

응답 → state 매핑, 득점자/카드 가공 로직은 `CLAUDE.md` "백엔드 연동 시 프런트엔드 구현 사항" 섹션 참조.
