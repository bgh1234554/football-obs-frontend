/**
 * 로고 내부의 투명 영역을 자동으로 색칠하지 않을 원본 이미지 URL 목록.
 * 예외를 추가할 때는 아래 배열에 URL과 로고 이름/이유를 한 줄씩 추가한다.
 * URL의 쿼리(?...)와 프래그먼트(#...)는 비교에서 제외하므로 원본 주소만 적는다.
 * 다른 출처의 같은 파일명에는 적용하지 않는다.
 *
 * 여기 등록해도 바깥 투명 여백 trim과 크기·중심 보정은 그대로 동작한다.
 * 기존 채우기 캐시가 있어도 예외가 우선한다. logo-trim.js보다 먼저 로드해야 한다.
 */
const LOGO_FILL_EXCLUDED_URLS = Object.freeze([
  // 러시아 축구협회: 문양 사이 빈칸을 원본 그대로 유지(2026-09-30 사용자 지정).
  'https://bgh1234554.github.io/football-obs-logo-cdn/nt/RussiaFA.svg',
  // 독일 축구협회: 가운데만 흰색으로 채워지는 어색한 표시를 피하고 원본 투명 영역 유지.
  'https://bgh1234554.github.io/football-obs-logo-cdn/nt/GermanyFA.png',
]);
