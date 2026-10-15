# 테스트

`tests/`의 실행 코드는 기능별로 나눴다. 각 `.cjs` 파일은 독립 실행하며, 기본 작업 디렉터리는 저장소 루트다.

| 폴더 | 검증 대상 |
| --- | --- |
| `display/` | 화면 크기·배치·로고·통계 패널 |
| `scoreboard/` | FSM 점수판 테마·배치·전환·시계·추가시간 |
| `events/` | 이벤트 시간·구간·스크롤·실제 경기 회귀 |
| `fixture/` | 경기 상태와 시계 |
| `lineup/` | 포메이션·선수 표기·수동 편집·주장 |
| `tactics/` | 전술판 도구와 크기 조정 |
| `unit/` | 저장·닉네임·선수 식별 등 공통 로직 회귀 |
| `manual/` | 점수판 브라우저 Console에 직접 붙여 넣는 시각 확인 스크립트. Node 테스트가 아님 |

Node.js가 필요하다. 브라우저 테스트는 Playwright와 Chromium도 필요하다. 새 작업 환경에서는 `tests/`에서 `npm install`과 `npx playwright install chromium`을 실행한다.

저장소 루트에서 빠른 검증은 `npm run test:unit --prefix tests`, 라인업 브라우저 검증은 `npm run test:lineup --prefix tests`, 전체 검증은 `npm test --prefix tests`로 실행한다. 개별 회귀 검증은 `node tests/events/cabo-rwanda.cjs`처럼 해당 파일을 직접 실행한다. 브라우저 테스트가 만든 이미지는 Git에서 제외되는 `screenshots/`에 저장한다.

점수판 검증은 `node tests/scoreboard/fsm-extra-editor.cjs`처럼 실행한다. 자동 생성 이미지는 `screenshots/tests/`에 저장한다. 공통 브라우저 설정과 결과물 폴더 준비는 `tactics/helpers.js`를 사용한다.

CAF·남미·CONCACAF 클럽 대항전과 코파 이탈리아·쿠프 드 프랑스 점수판 테스트는 로고를 CDN URL에서 직접 불러오므로 인터넷 연결이 필요하다. 별도의 `football-obs-logo-cdn` 체크아웃이나 로고 이미지 복사 없이 위의 `npm test --prefix tests`로 실행한다.

중복된 폭·긴 팀명 검증은 `scoreboard/fsm-board-layout.cjs`, K리그·세리에 A의 점수 경계 검증은 `scoreboard/fsm-score-edges.cjs`, EPL·네이션스리그의 글자 정렬 검증은 `scoreboard/fsm-name-vertical-alignment.cjs`로 합쳤다. 추가시간의 숨김 영역 클릭과 기존 편집 동작은 `scoreboard/fsm-extra-editor.cjs`에서 함께 검증한다. 소스에 폭 후보를 주입하던 일회성 비교 스크립트는 제거했다.
