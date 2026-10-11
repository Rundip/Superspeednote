# Microsoft Store 등록 정보 (Partner Center에 붙여넣기용)

## 기본 정보

| 항목 | 값 |
|---|---|
| 앱 이름 (예약한 이름과 똑같이) | Super speed note |
| 카테고리 | 생산성 (Productivity) |
| 가격 | 무료 |
| 개인정보 처리방침 URL | https://github.com/Rundip/Superspeednote/blob/main/PRIVACY.md |
| 지원 연락처 / 웹사이트 | https://github.com/Rundip/Superspeednote/issues |
| 저작권 | © 2026 Mukhodeveloper |
| 시스템 요구 사항 | Windows 10 버전 2004 이상, Windows 11 · Microsoft Edge WebView2 런타임(Windows 11과 최신 Windows 10에 기본 포함) |
| 연령 등급 설문 | 사용자 간 공유·채팅·구매·위치·개인정보 수집 모두 "아니요" → 3세 이상 예상 |

## 짧은 설명 (검색 결과에 보이는 한 줄)

메모장보다 빠른 메모. 어떤 프로그램에서든 단축키로 불러오고, 찾아서 바로 붙여넣기.

## 설명

**Super Speed Note**는 업무 중에 필요한 정보를 가장 빠르게 꺼내 쓰기 위한 메모 앱입니다.
거래처 연락처, 계좌번호, 자주 쓰는 문구, 서버 주소처럼 하루에도 몇 번씩 찾는 정보를 메모해 두면,
지금 쓰고 있는 프로그램을 떠나지 않고 단축키 한 번으로 찾아서 원래 창에 바로 붙여넣을 수 있습니다.

■ 한 줄 찾아 바로 붙여넣기 (Ctrl+Alt+F)
쓰던 창 위에 작은 검색창이 뜨고, 모든 메모를 한 줄 단위로 찾습니다. Enter를 누르면 원래 창의 커서 자리에 바로 붙여넣어집니다.
초성 검색(ㄱㅊㅅ → 김철수), 표의 칸 하나만 골라 붙여넣기, 최근 붙여넣은 줄 기억까지.

■ 빠른 메모 (Ctrl+Alt+M)
화면 구석에 작은 메모창이 바로 뜹니다. 다른 일을 하는 동안 계속 떠 있고, 단축키를 한 번 더 누르면 닫히며 쓰던 창으로 돌아갑니다.

■ 메모별 단축키
메모마다 단축키를 지정하면 어디서든 그 메모가 바로 앞으로 나오고, 한 번 더 누르면 방금 쓰던 창의 커서 자리로 돌아갑니다.

■ 엑셀처럼 쓰는 표
엑셀에서 복사한 셀을 붙여넣으면 표가 되고, 방향키·F2·Enter로 엑셀과 같은 방식으로 편집합니다. 표의 행은 엑셀 칸 그대로 다시 붙여넣어집니다.

■ 빠르고 가볍게
메모 500개에서도 검색이 한 화면 프레임(16ms) 안에 끝납니다. 꺼져 있어도 단축키 대기 상태(메모리 약 30MB)로 바로 불러올 수 있습니다.

■ 내 PC에만 저장
인터넷 통신·계정·광고가 없습니다. 모든 메모는 내 PC에만 저장되고 매일 자동 백업되며, 지운 메모는 휴지통에서 복원할 수 있습니다.

## 기능 목록 (Partner Center '제품 기능', 항목당 200자 이내)

1. 어떤 프로그램에서든 단축키로 검색창을 띄워 모든 메모의 한 줄을 찾고 원래 창에 바로 붙여넣기
2. 초성 검색, 여러 단어 검색, 표의 칸 하나만 골라 붙여넣기
3. 화면 구석에 뜨는 빠른 메모 (단축키 한 번으로 열고 닫기)
4. 메모마다 전역 단축키 지정, 다시 누르면 원래 창의 커서 자리로 복귀
5. 엑셀 셀 복사 → 표 붙여넣기, 엑셀처럼 방향키·F2·Enter로 편집
6. 굵게, 밑줄, 형광펜, 잘 보이는 글자색, 체크리스트, 제목, 목록
7. 앱 안의 모든 단축키를 원하는 키로 변경
8. 자동 저장, 매일 자동 백업, 휴지통에서 복원
9. 인터넷 통신·계정·광고 없음, 모든 데이터는 내 PC에만 저장
10. 라이트 / 다크 네이비 테마

## 검색 키워드 (최대 7개)

메모, 메모장, 빠른 메모, 단축키, 클립보드, 붙여넣기, 노트

## 이번 버전의 새로운 기능 (1.3.0)

빠른 메모(Ctrl+Alt+M), 휴지통 복원, 빈 메모 자동 정리, 모든 단축키 변경, 한 줄 찾아 붙여넣기 창.

## 제한된 기능(restricted capability) 사용 이유 — Partner Center '제출 옵션'에 영어로 입력

**runFullTrust**
Super Speed Note is a Win32 desktop app (WinForms + WebView2) packaged with the Desktop Bridge. It needs full trust to register the global hotkeys the user assigns, to bring its window to the front when a hotkey is pressed, and to paste into the window the user came from.

**unvirtualizedResources**
The app keeps all user notes in %APPDATA%\SuperSpeedNote. Users of the earlier non-Store version already have their notes there, and keeping that location (instead of the virtualized package folder) means the Store version opens the same notes and that notes are never lost when the app is uninstalled or reinstalled. Registry virtualization is disabled only so the app can remove the start-up entry (HKCU\...\Run\SuperSpeedNote) that the earlier non-Store version created, since the Store version starts through its own startup task. The app writes nothing else outside %APPDATA%\SuperSpeedNote and %LOCALAPPDATA%\SuperSpeedNote.

## 심사 담당자 메모 (Notes for certification, 영어)

No account or sign-in is needed. Try: press Ctrl+Alt+F in any app (e.g. Notepad) to open the search window, type a word from a note and press Enter to paste that line back. Ctrl+Alt+M opens a quick memo in the screen corner; press it again to close. The app has no network communication.

## 스크린샷 (store\screenshots 폴더, 1920×1080 PNG · 가상의 예시 데이터)

| 파일 | 캡션 (Partner Center 스크린샷 설명) |
|---|---|
| 1-board.png | 메모를 카드로 한눈에 · 메모마다 전역 단축키 |
| 2-table.png | 엑셀처럼 쓰는 표 · 엑셀 셀을 붙여넣으면 바로 표 |
| 3-find-paste.png | 한 줄 찾아 바로 붙여넣기 · 표의 칸 하나만 골라서 |
| 4-quick-memo.png | 단축키 한 번에 화면 구석에 빠른 메모 |
| 5-shortcuts.png | 모든 단축키를 원하는 키로 |
