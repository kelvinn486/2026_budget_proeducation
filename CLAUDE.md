# CLAUDE.md

부서 공용 예산 관리 웹앱. 매년 데이터만 바꿔 재사용한다. 자세한 구조·시트 열·설정 절차는 `README.md`에 있으니 필요한 부분만 찾아 읽을 것.

## 사용자
- 개발 경험이 많지 않음. 한국어로, 전문 용어는 쉽게 풀고 비유·예시를 곁들여 설명.
- 주로 연초에 1~2번, 새 회계연도 전환이나 개선 요청으로 찾아옴.

## 구조 한눈에
- 사이트 2개: 전문교육부 `index.html`(`/`), 포항혁신지구 `pohang/index.html`(`/pohang/`). GitHub Pages로 `main`에서 배포.
- 공용 코드: `assets/budget.css`, `assets/budget-common.js`. 각 `index.html`에는 설정값(`FISCAL_YEAR`, `SCRIPT_URL` 등)과 목록 그리기만 있음.
- 서버: `apps-script/Code.gs`, `apps-script/pohang/Code.gs`(Google Apps Script). 데이터는 사이트별 Google 시트.

## 지킬 것
- **비밀번호(`PASSCODE`)·시트 ID를 저장소에 올리지 말 것.** 공개 저장소다. 사용자에게 비밀번호를 묻지도 말 것.
- **예산 데이터(시트 내용, 백업 JSON)를 저장소에 넣지 말 것.**
- 폴더나 저장소 이름을 바꾸지 말 것. 사이트 주소가 바뀌어 부서원 북마크가 끊긴다.
- `assets/` 파일을 고치면 두 `index.html`의 `?v=숫자`를 1 올릴 것(브라우저 캐시 무효화).
- `Code.gs`는 사용자가 Apps Script 편집기에 직접 반영한다. 통째로 붙여넣으면 실제 `PASSCODE`/`SHEET_ID`가 자리표시자로 덮이므로, **바뀐 줄만** 안내할 것. 재배포는 "배포 관리 → 기존 배포 수정 → 새 버전"(새 배포는 주소가 바뀜).
- 화면 코드는 예전·새 서버 코드 모두에서 동작하게 유지(저장 응답에 `items`가 없으면 목록을 다시 받음).

## 새 회계연도 전환 (README "새 회계연도로 넘어갈 때"와 같은 순서)
1. 사용자: 시트 사본 만들기 → `items` 금액 수정, `executions` 비우기 → Apps Script 연결·웹앱 배포 → 새 웹앱 주소를 알려줌.
2. Claude: 해당 `index.html`의 `FISCAL_YEAR`, `SCRIPT_URL` 변경 → 브랜치에 커밋 → PR.

## 검증
빌드·테스트 도구는 없다. 화면을 바꾸면 Playwright(Chromium 설치됨)로 페이지를 띄우고 `https://script.google.com/**` 요청을 가짜 응답으로 가로채 확인한다(`localStorage`에 `bm_passcode`, `bm_author_name`을 미리 넣으면 입력창이 안 뜸). 실제 사이트(github.io)와 Apps Script에는 이 환경에서 접속이 안 될 수 있으니, 실제 동작 확인은 사용자에게 방법을 안내한다.
