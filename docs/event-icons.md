# 경기 아이콘 사용처

이미지는 `resources/icons/events/`, 공통 렌더링은 `js/core/event-icons.js`, 크기와 정렬은 `css/core/event-icons.css`에서 관리한다. 원본 PNG는 유지하고 SVG viewBox로 투명 여백만 표시 영역 밖으로 뺀다.

| 사용처 | 아이콘 | 연결 파일 |
| --- | --- | --- |
| 이벤트 목록: 캠 큼·작음, 전술판 | 골, 자책골, PK 골·실축, 경고, 퇴장, 경고누적 퇴장, 교체, VAR 검토·인정·취소 | `js/panels/events-panel.js` |
| 라인업 피치와 교체 OUT 선수 표시 | 골, 자책골, 도움, 카드 | `js/lineup/lineup-render.js` |
| 선발 목록, 교체 명단, 캠 큼 명단 사이클 | 골, 자책골, 도움, 카드 | `js/lineup/lineup-render.js` |
| 미출전 명단, 미출전 사이클 | 출장정지 레드카드 | `js/lineup/lineup-render.js` |
| 수동 라인업 입력 | 통계 열 제목, 카드 체크박스 | `js/lineup/lineup-manual-modal.js` |
| 전술판 | 드래그 가능한 공 | `js/tactics/tactics.js` |
| 전술판 시간 슬라이더 | 교체, 퇴장, 경고누적 퇴장 | `js/tactics/tactics-timeline.js` |
| 점수판·전광판, 모든 FSM 테마 | 퇴장 개수만큼 레드카드 | `js/core/render.js` |

교체 IN/OUT 시간 화살표와 주장 C는 기존 표시를 유지한다. 승부차기 결과 도트, 득점자 문구의 PK·OG는 별개의 정보 표시다.

VAR 인정은 그린스크린 OFF에서 `var-confirm.png`를 그대로 사용한다. ON에서는 빈 모니터 `var-monitor.png`와 SVG 체크를 조합한다. 체크와 교체 IN 화살표는 기존 그린스크린 설정의 `--overlay-in-text` 색상을 따른다. 도움은 외곽선·끈·내부 마크를 강화한 `assist.png`를 사용하고 이전 이미지는 `deprecated/icons/events/assist.png`에 보관한다.

피치 골·도움은 기본 14px이며 캠 큼에서는 기존 노드 배율을 따른다. 자책골 1회는 숫자를 생략하고 2회 이상만 표시한다. 정규 골과 자책골을 함께 기록하면 서로 다른 공으로 표시한다. 숫자는 별도의 원형 배지 안에 중앙 정렬한다.

## 검증

`node tests/display/event-icons.cjs`는 실제 Chromium에서 카드 정렬, 피치 평점과의 겹침, 모든 FSM 테마, 공 드래그, 시간 슬라이더, 수동 폼, 그린스크린 5단계, 숫자 2·10·99를 확인한다. 화면은 gitignore 대상인 `screenshots/event-icons/`에 저장한다.

아이콘 적용 전 리비전과 비교할 때는 PowerShell에서 다음과 같이 실행한다.

```powershell
$env:ICON_COMPARE_REF='<아이콘 적용 전 커밋>'
node tests/display/event-icons.cjs
Remove-Item Env:ICON_COMPARE_REF
```

비교 대상은 선수 노드 위치, 이벤트 내용·시간·순서, 명단 정보, 퇴장 개수와 각 테마 카드의 크기·기울기다. 새 그림과 자책골 숫자 생략 등 승인한 표현 변경은 별도로 화면을 확인한다. OBS 내부 브라우저 실기 검증은 포함하지 않는다.
