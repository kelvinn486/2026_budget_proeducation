# 2026 전문교육부 예산 관리 (공용)

부서원이 함께 쓰는 예산 집행 관리 화면입니다.

- **화면**: `index.html` — GitHub Pages로 배포됩니다.
- **데이터**: Google 스프레드시트에 저장되며, Google Apps Script 웹앱(`apps-script/Code.gs`)이 읽고 씁니다.
- **접근 제한**: 화면을 처음 열 때 부서 공용 비밀번호를 입력해야 데이터를 볼 수 있습니다.

## 주의

`apps-script/Code.gs`의 `SHEET_ID`와 `PASSCODE` 값은 자리표시자입니다.
실제 시트 ID와 비밀번호는 Apps Script 편집기에만 입력하고, 이 저장소에는 절대 올리지 마세요.

## 화면 수정 후 반영

`index.html`을 고쳐 `main` 브랜치에 올리면 1~2분 뒤 모든 부서원 화면에 반영됩니다.
Apps Script(`Code.gs`)를 고친 경우에만 편집기에 붙여넣고 **배포 관리 → 새 버전**으로 재배포합니다.
