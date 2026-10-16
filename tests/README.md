# 테스트

`tests/`의 실행 코드는 기능별로 나눴다. 각 `.cjs` 파일은 독립 실행하며, 기본 작업 디렉터리는 저장소 루트다.

| 폴더 | 검증 대상 |
| --- | --- |
| `display/` | 화면 크기별 배치, 닉네임 CSV, 단축키 설정, 팀 경기 패널 |
| `scoreboard/` | 모든 FSM 점수판 테마를 도는 정렬·전환·레드카드·승부차기·합계 점수, 리그별 테마 매핑, 시계·추가시간 편집 |
| `events/` | 이벤트 시간 수정·구간 구분·자동 스크롤·새 이벤트 표시 |
| `fixture/` | 경기 상태와 시계 |
| `lineup/` | 포메이션 변환·이름 줄바꿈·수동 입력·선수 검색·교체 선수 합성·팀 닉네임 |
| `tactics/` | 폴링 중 전술판 선수 위치 유지, 공통 브라우저 설정(`helpers.js`) |
| `unit/` | 저장·닉네임·선수 식별 등 공통 로직 회귀 |

Node.js가 필요하다. 브라우저 테스트는 Playwright와 Chromium도 필요하다. 새 작업 환경에서는 `tests/`에서 `npm install`과 `npx playwright install chromium`을 실행한다.

저장소 루트에서 빠른 검증은 `npm run test:unit --prefix tests`, 라인업 브라우저 검증은 `npm run test:lineup --prefix tests`, 전체 검증은 `npm test --prefix tests`로 실행한다. 개별 검증은 `node tests/events/events-period-boundaries.cjs`처럼 해당 파일을 직접 실행한다. 브라우저 테스트가 만든 이미지는 Git에서 제외되는 `screenshots/`에 저장한다.

점수판 검증은 `node tests/scoreboard/fsm-extra-editor.cjs`처럼 실행한다. 자동 생성 이미지는 `screenshots/tests/`에 저장한다. 공통 브라우저 설정과 결과물 폴더 준비는 `tactics/helpers.js`를 사용한다.

## 테스트 작성 기준

백엔드 테스트와 같은 원칙을 따른다. 테스트는 "무엇을 보장하는가(계약)"를 지키는 코드이고, 개발 중 확인용 스크립트가 아니다.

| 종류 | 백엔드에 대응하는 것 | 이 프로젝트의 예 | 실행 |
| --- | --- | --- | --- |
| 로직 테스트 | 서비스 단위 테스트 | 포메이션 변환, 이벤트 구간 계산, 저장 용량 초과 처리 (`lineup/formation-transitions.cjs`, `events/events-period-boundaries.cjs`, `unit/review-regressions.cjs`) | Node만 사용, 빠름 |
| 화면 기능 테스트 | 컨트롤러/통합 테스트(MockMvc) | 경기 데이터를 넣고 화면 결과 확인 (`fixture/`, `lineup/manual-lineup-controls.cjs`, `display/nickname-csv.cjs`) | Playwright 브라우저 |
| 전체 순회 테스트 | 파라미터화 테스트(`@ParameterizedTest`) | 모든 점수판 테마·리그를 도는 정렬·레드카드·승부차기 (`scoreboard/`) | Playwright 브라우저 |

1. **새 파일은 새 기능 단위가 생길 때만 만든다.** 백엔드에서 서비스 클래스 하나에 테스트 클래스 하나를 두는 것과 같다. 버그 수정은 기존 파일에 검사(케이스)를 하나 추가하는 것으로 끝낸다. 백엔드에서 `@Test` 메서드를 추가하지 테스트 클래스를 새로 만들지 않는 것과 같다.
2. **테마·리그·데이터별로 파일을 나누지 않는다.** 목록(`FSM_THEMES`, `LEAGUE_THEME_MAP`)을 도는 테스트에 넣어, 새 테마를 추가하면 자동으로 검사되게 한다.
3. **계약을 검사하고 디자인 값은 고정하지 않는다.** "홈/원정 팀명 높이가 같다", "레드카드는 55%만 보인다"처럼 지켜야 할 규칙을 검사한다. 특정 테마의 색상 코드·px 값을 그대로 적는 검사는 디자인을 바꿀 때마다 깨지므로 피한다(응답 JSON의 필드 계약은 검사하되 내부 private 값은 검사하지 않는 것과 같다).
4. **가능하면 로직 테스트로 쓴다.** 순수 계산(이름 매칭, 데이터 합성, CSV 파싱 등)은 브라우저 없이 Node에서 확인하는 편이 빠르고 덜 깨진다. 화면 결과가 핵심일 때만 브라우저 테스트를 쓴다.
5. **일회성 확인은 커밋하지 않는다.** 픽셀 측정, 특정 경기 재현, 수치 비교처럼 한 번 확인하고 끝나는 스크립트는 임시 폴더에서 돌리고 지운다. 그 확인에서 지켜야 할 규칙이 나오면 3번처럼 기존 테스트에 규칙으로 넣는다.
6. **모든 테스트는 `npm test`(`run-all.cjs`)로 함께 돌고, 다시 돌려도 결과가 같아야 한다.** 실패하는 테스트를 그대로 두지 않는다. 코드가 맞으면 테스트를 고치고, 테스트가 맞으면 코드를 고친다.

점수판 테스트는 `FSM_THEMES`·`LEAGUE_THEME_MAP` 전체를 도는 기능별 테스트로 둔다(정렬, 팀컬러 띠, 레드카드, 승부차기, 합계 점수, 테마 전환 등). 리그 ID별 자동 테마 선택과 수동 선택은 `scoreboard/fsm-league-theme-map.cjs`가 모든 리그·테마에 대해 확인한다.

일부 점수판 테스트는 리그 로고를 CDN URL에서 직접 불러오므로 인터넷 연결이 필요하다.

중복된 폭·긴 팀명 검증은 `scoreboard/fsm-board-layout.cjs`, K리그·세리에 A의 점수 경계 검증은 `scoreboard/fsm-score-edges.cjs`, 팀명 세로 정렬은 `scoreboard/fsm-text-alignment.cjs`(글꼴 기준)와 `scoreboard/fsm-strip-ink-alignment.cjs`(실제 픽셀·홈/원정 기준선)로 확인한다. 추가시간의 숨김 영역 클릭과 기존 편집 동작은 `scoreboard/fsm-extra-editor.cjs`에서 함께 검증한다.
