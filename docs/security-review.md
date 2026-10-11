# Super Speed Note 보안 검토 자료 (IT·보안 담당자용)

로컬 전용 메모 앱입니다. 백신이 '알 수 없는 프로그램'으로 판단하는 이유와 실제 동작을 정리했습니다.

## 1. 요약

| 항목 | 내용 |
|---|---|
| 종류 | Windows 데스크톱 메모 앱 (C# .NET Framework 4.8 + Microsoft Edge WebView2) |
| 네트워크 | **통신 없음** (서버·업데이트 확인·통계 없음). 메모 속 링크를 Ctrl+클릭할 때만 기본 브라우저로 엶 |
| 관리자 권한 | 필요 없음 (현재 사용자 범위에서만 동작) |
| 데이터 위치 | `%APPDATA%\SuperSpeedNote` (메모·설정·백업·휴지통), `%LOCALAPPDATA%\SuperSpeedNote` (화면 엔진 캐시, 창 위치) |
| 소스 코드 | 전체 공개: https://github.com/Rundip/Superspeednote |
| 배포 형태 | 단일 exe (서명 없음) · Microsoft Store 버전 준비 중 (Store가 서명) |

## 2. 백신 휴리스틱에 걸릴 수 있는 동작과 그 이유

| 동작 (Windows API) | 왜 필요한가 | 범위 |
|---|---|---|
| 전역 단축키 등록 (`RegisterHotKey`) | 어떤 프로그램에서든 메모·검색창을 단축키로 부르기 | 사용자가 지정한 조합만. 키 입력을 가로채거나 기록하지 않음 (키보드 훅 없음) |
| 맨 앞 창 추적 (`SetWinEventHook` EVENT_SYSTEM_FOREGROUND) | 단축키를 다시 누르면 직전에 쓰던 창으로 돌아가기 | 창 핸들만 기억, 내용은 읽지 않음 |
| 키 입력 보내기 (`keybd_event` Ctrl+V 한 번) | '원래 창에 붙여넣기' 기능 | 사용자가 Enter 등으로 붙여넣기를 실행한 순간에만 |
| 키 상태 확인 (`GetAsyncKeyState`) | 붙여넣기 직전, 사용자가 누르고 있던 Ctrl·Shift·Alt·Win·Enter를 뗐는지만 확인 | 그 6개 키, 최대 1.2초 동안만. 기록하지 않음 |
| 클립보드 쓰기 | 붙여넣기·복사 기능 | 사용자가 실행할 때만 |
| 시작 프로그램 등록 (`HKCU\...\Run`) | 로그인 시 '단축키 대기' 상태로 실행 | 설정에서 끔/대기/상주 선택. Store 버전은 Windows 시작 작업 사용 |
| 내장 라이브러리 로드 | WebView2 SDK(Microsoft 공식 DLL)를 exe 하나에 넣기 위해 리소스로 포함 | Microsoft.Web.WebView2 1.0.4258.31 |

## 3. 직접 확인하는 방법

- **빌드 재현:** 소스를 받아 `powershell -ExecutionPolicy Bypass -File build.ps1` 실행. Windows에 기본 포함된 C# 컴파일러와 nuget.org의 Microsoft WebView2 SDK만 사용합니다.
- **통신 확인:** 실행 중 방화벽 로그나 Process Monitor로 외부 연결이 없음을 확인할 수 있습니다.
- **제거:** 실행 파일 삭제 + 위 두 폴더 삭제 + (있으면) `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\SuperSpeedNote` 값 삭제.

## 4. 파일 지문

릴리스마다 SHA-256 값이 달라집니다. 받은 파일의 값은 PowerShell에서 `Get-FileHash .\SuperSpeedNote.exe` 로 확인하세요.

| 버전 | SHA-256 |
|---|---|
| 1.3.0 (exe) | `7C22F0EA46F6709E4BB171359401CC2E61CCA5685EF6A00DA7CE1323432525A8` |
