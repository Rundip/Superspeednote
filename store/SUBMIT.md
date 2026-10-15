# Partner Center 제출 순서 (Super speed note 1.4.2)

> **2026-10-15 심사 결과 (1.3.0): 수정 필요**
> 1. `unvirtualizedResources` 제한된 기능 거절 → **1.4.2에서 뺐음.** Store 버전은 메모를 앱 전용 폴더(`%LOCALAPPDATA%\Packages\Mukhodeveloper.Superspeednote_…\LocalState`)에 저장하고, 처음 실행할 때 이 PC의 exe 버전 메모가 있으면 한 번 복사해 옴. 앱을 제거하면 메모도 지워짐(설정에 안내).
> 2. 지원 연락처에 GitHub 링크 불가 → **이메일 주소로 바꾸기.**
>
> 다시 제출: 앱 및 게임 › Super speed note › 실패한 제출 열기(또는 '제출 업데이트') → ④ 패키지에서 1.3.0 패키지를 지우고 `SuperSpeedNote_1.4.2.0_x64.msix` 올리기 → ⑤ 스토어 등록 정보 › '지원 연락처'를 이메일로, '웹사이트'는 비우기 → ⑥ 제출 옵션 › 제한된 기능 사용 이유와 '인증 관련 메모'를 `listing-ko.md`의 새 글로 바꾸기 → 제출.


준비물은 모두 이 폴더에 있습니다.

| 파일 | 쓰는 곳 |
|---|---|
| `dist\store\SuperSpeedNote_1.4.2.0_x64.msix` | ④ 패키지 (프로젝트 폴더 기준, GitHub에는 없음) |
| `store\listing-ko.md` | ⑤ 스토어 등록 정보, ⑥ 제출 옵션에 붙여넣을 글 |
| `store\screenshots\*.png` | ⑤ 스크린샷 (5장) |
| `store\logos\store-logo-1080.png` | ⑤ 스토어 로고 (1:1) |

Partner Center › 앱 및 게임 › **Super speed note** › **제출 시작**(Start submission)을 누르면 아래 항목이 나옵니다. 위에서부터 차례로 채우세요.

## ① 가격 책정 및 가용성 (Pricing and availability)
- **시장:** 기본값(모든 시장) 그대로 두거나, 한국만 원하면 '대한민국'만 선택
- **표시 여부:** 공개(Public). 나만 쓰려면 '비공개 대상 그룹'을 고르고 내 Microsoft 계정 이메일 추가
- **가격:** 무료(Free)

## ② 속성 (Properties)
- **카테고리:** 생산성 (Productivity)
- **개인정보 처리방침 URL:** `https://github.com/Rundip/Superspeednote/blob/main/PRIVACY.md`
- **지원 연락처:** 공개해도 되는 **이메일 주소** (GitHub 링크는 허용되지 않음)
- **웹사이트:** 비워 두기
- **제품 선언:** 기본값 그대로. 'Windows S 모드' 관련 항목이 있으면 체크하지 않음 (데스크톱 앱이라 S 모드에서는 실행되지 않음)
- **시스템 요구 사항(선택):** 메모리 4GB, 키보드

## ③ 연령 등급 (Age ratings)
설문(IARC)에서
- 앱 종류: **앱(유틸리티·생산성)**
- 폭력·성적 내용·도박·약물: 모두 **아니요**
- 사용자끼리 소통·콘텐츠 공유: **아니요** (메모는 내 PC에만 저장)
- 위치·개인정보 공유: **아니요**
- 디지털 상품 구매: **아니요**
- 인터넷·웹 콘텐츠 무제한 접근: **아니요** (통신 없음, 링크는 기본 브라우저로만 엶)

→ 보통 **3세 이상**으로 나옵니다.

## ④ 패키지 (Packages)
- `SuperSpeedNote_1.4.2.0_x64.msix`를 끌어다 놓기
- 장치 패밀리: **Windows 10/11 Desktop**만 체크된 상태면 됩니다
- 업로드하면 이름·게시자를 자동 확인해요. 오류가 나면 메시지를 그대로 보내 주세요

## ⑤ 스토어 등록 정보 (Store listings) › 한국어
`store\listing-ko.md`에서 복사해 붙여넣기
- **설명:** '## 설명' 아래 전체
- **이번 버전의 새로운 기능:** '1.4.2' 한 줄
- **제품 기능:** '기능 목록' 1~10번을 한 칸에 하나씩
- **스크린샷:** `store\screenshots` 5장을 1번부터 순서대로, 캡션은 표의 문구
- **스토어 로고:** 1:1 상자 아트(1:1 box art) 자리에 `store\logos\store-logo-1080.png`
- **짧은 설명:** '## 짧은 설명' 한 줄
- **검색어:** 메모, 메모장, 빠른 메모, 단축키, 클립보드, 붙여넣기, 노트 (한 칸에 하나씩, 최대 7개)
- **저작권:** © 2026 Mukhodeveloper
- 나머지 칸은 비워 둬도 됩니다

## ⑥ 제출 옵션 (Submission options)
- **제한된 기능(restricted capabilities) 사용 이유:** 패키지에 `runFullTrust`가 있어서 입력 칸이 나옵니다. `listing-ko.md`의 '제한된 기능 사용 이유' 영문 단락을 붙여넣기
- **인증 관련 메모(Notes for certification):** `listing-ko.md`의 '심사 담당자 메모' 영문을 붙여넣기
- **게시 시점:** '인증 통과 즉시 게시' 또는 '수동 게시' 중 선택

## ⑦ Microsoft Store에 제출 (Submit to the Store)
- 보통 며칠 안에 결과가 나옵니다. 통과하면 https://apps.microsoft.com/detail/9N4JKW5GFTHS 에 공개돼요
- 거절되면 사유 메일을 보내 주세요. 대표적인 경우와 대응:
  - 그 밖의 정책 지적 → 해당 부분 수정 후 버전을 올려 다시 제출

## 업데이트할 때
1. `src\Program.cs`의 `Version`을 올림 (예: 1.3.1) → `package.ps1` 실행
2. Partner Center › 새 제출 → ④ 패키지에 새 `.msix`만 올리고 제출
