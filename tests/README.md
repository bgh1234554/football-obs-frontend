# 테스트

`tests/`의 실행 코드는 기능별로 나눴다. 각 `.cjs` 파일은 독립 실행하며, 기본 작업 디렉터리는 저장소 루트다.

| 폴더 | 검증 대상 |
| --- | --- |
| `display/` | 화면 크기·배치·로고·통계 패널 |
| `events/` | 이벤트 시간·구간·스크롤·실제 경기 회귀 |
| `fixture/` | 경기 상태와 시계 |
| `lineup/` | 포메이션·선수 표기·수동 편집·주장 |
| `tactics/` | 전술판 도구와 크기 조정 |
| `manual/` | 점수판 브라우저 Console에 직접 붙여 넣는 시각 확인 스크립트. Node 테스트가 아님 |

Node.js가 필요하다. 브라우저 테스트는 Playwright와 Chromium도 필요하다. 새 작업 환경에서는 `tests/`에서 `npm install`과 `npx playwright install chromium`을 실행한다.

저장소 루트에서 빠른 검증은 `npm run test:unit --prefix tests`, 라인업 브라우저 검증은 `npm run test:lineup --prefix tests`, 전체 검증은 `npm test --prefix tests`로 실행한다. 개별 회귀 검증은 `node tests/events/cabo-rwanda.cjs`처럼 해당 파일을 직접 실행한다. 브라우저 테스트가 만든 이미지는 Git에서 제외되는 `screenshots/`에 저장한다.
