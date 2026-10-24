// ---------------------------------------------------------------- first run
function welcome() {
  const row = (a, b) => `<tr><td>${a}</td><td>${esc(b)}</td></tr>`;   // keys as they are set right now
  const html = '<h2>메모장보다 빠른 메모</h2>' +
    '<div>메모마다 <b>전역 단축키</b>를 지정하면 어떤 프로그램을 쓰고 있든 그 메모가 바로 앞으로 나와요. 같은 단축키를 <u>한 번 더 누르면 방금 쓰던 창으로</u> 돌아가요.</div><div><br></div>' +
    '<ul class="checklist"><li data-checked="true">카드를 더블클릭하거나 Enter로 열기</li><li data-checked="false">메모 제목 옆 <b>[단축키 지정]</b>으로 Ctrl+Alt+1 같은 키 붙이기</li><li data-checked="false">엑셀에서 셀을 복사해 여기에 붙여넣기 → 표로 변환</li></ul><div><br></div>' +
    '<table class="t hdr"><tbody><tr><td>하고 싶은 것</td><td>방법</td></tr>' +
    row('어디서든 한 줄 찾아 붙여넣기', kl0(st.findHotkey) + ' → Enter') + row('어디서든 빠른 메모', kl0(st.quickHotkey)) + row('앱 부르기', kl0(st.appHotkey)) +
    row('보드에서 찾기', '그냥 입력 (초성 ㄱㅊㅅ도 돼요)') + row('빠른 이동', kl('switcher') || 'Ctrl+K') +
    row('칸 내용 고치기', '더블클릭 또는 F2 · 그냥 입력하면 새로 써요') + row('행 추가', '마지막 행에서 Enter · 표 아래 막대 (끌면 여러 행)') +
    row('열 추가', '마지막 칸에서 Tab · 표 오른쪽 막대') + row('중간에 행·열 넣기', '표 왼쪽·위쪽 여백의 + 클릭') + row('삭제한 메모 되살리기', 'Ctrl+Z · 휴지통') + '</tbody></table>' +
    '<div><span style="background-color: rgb(255, 241, 118);">형광펜</span>, <font color="#d92d20">잘 보이는 글자색</font>, <b>굵게</b>, <u>밑줄</u>을 쓸 수 있어요. 모든 단축키는 F1.</div>';
  const n = { id: uid(), title: '⚡ 시작하기', color: 'navy', pinned: true, hotkey: null, created: now(), updated: now(), preview: previewOf(frag(html)) };
  S.notes.push(n);
  bodies[n.id] = html;
  host.send('saveNote', n.id, html);
  selId = n.id;
  saveStateSoon();
}

function bootFailed() {
  openModal(`<div class="dlg confirm"><div class="dlg-head">${ic('i-folder')}<h3>메모를 불러오지 못했어요</h3></div>` +
    `<div class="dlg-body"><div class="khint">메모 파일은 그대로 있어요. 지금은 아무것도 저장하지 않으니 앱을 끝내고 다시 열어 주세요. 계속 이러면 데이터 폴더를 확인해 주세요.</div></div>` +
    `<div class="dlg-foot"><span style="flex:1"></span><button class="btn" id="bfData">데이터 폴더 열기</button><button class="btn danger-fill" id="bfQuit" data-autofocus>끝내기</button></div></div>`,
    () => setTimeout(bootFailed, 0));                // it stays: behind it is an empty app that saves nothing
  $('#bfData').onclick = () => host.send('openData');
  $('#bfQuit').onclick = () => host.send('quit');
}

