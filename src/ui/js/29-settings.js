// ---------------------------------------------------------------- settings / help
function applyTheme() {
  app.dataset.theme = st.theme;
  if (typeof updateSwatches === 'function') updateSwatches();
  $('#btnTheme').innerHTML = ic(st.theme === 'dark' ? 'i-sun' : 'i-moon');
  $('#btnTheme').title = st.theme === 'dark' ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기';
}
// zoom moves in round steps (never 107% or 113%); an old stored size snaps to the nearest one
const ZOOMS = [70, 80, 90, 100, 110, 125, 150, 175, 200];
const zoomPct = () => Math.round(st.fontSize / 15 * 100);
function zoomIdx() { const p = st.fontSize / 15 * 100; let b = 3; ZOOMS.forEach((z, i) => { if (Math.abs(z - p) < Math.abs(ZOOMS[b] - p)) b = i; }); return b; }
function applyZoom() {
  st.fontSize = 15 * ZOOMS[zoomIdx()] / 100;
  document.documentElement.style.setProperty('--fs', st.fontSize + 'px');
  const z = $('#stZoom'); z.textContent = zoomPct() + '%'; z.hidden = zoomPct() === 100;
  posOvSoon();
}
function applyFont() { document.documentElement.style.setProperty('--ef', (FONTS[st.font] || FONTS.ui)[1]); }
function zoom(d) { st.fontSize = 15 * ZOOMS[d === 0 ? 3 : clamp(zoomIdx() + d, 0, ZOOMS.length - 1)] / 100; applyZoom(); saveStateSoon(); }
function setTheme(t) { st.theme = t; applyTheme(); host.send('theme', t); saveStateSoon(); }
function setOnTop(on) {
  st.onTop = on; const b = $('#btnTop'); b.classList.toggle('on', on); b.title = `항상 위에 표시 · ${on ? '켜짐' : '꺼짐'}`;
  host.send('top', on ? '1' : '0'); saveStateSoon();
}
function openSettings(tab, keep) {               // keep: back from the key recorder, at the same scroll
  tab = tab || 'general';
  if (!keep) keysScroll = 0;
  const sw = (k, on) => `<button class="switch${on ? ' on' : ''}" data-sw="${k}"></button>`;
  const row = (b, s, c) => `<div class="row"><div class="lbl"><b>${b}</b>${s ? `<small>${s}</small>` : ''}</div>${c}</div>`;
  const chip = (k, attr, bad) => `<button class="hk-chip${k ? ' set' : ''}${bad ? ' bad' : ''}" ${attr}${bad ? ' title="다른 프로그램이 이 키를 쓰고 있어 동작하지 않아요 · 눌러서 다른 키로 바꿔 주세요"' : ''}>${ic('i-key')}${k ? esc(k.label) : '지정 안 함'}${bad ? '<small>사용 중</small>' : ''}</button>`;
  let body;
  if (tab === 'keys') {
    const krow = (name, sub, c) => `<div class="krow"><div class="kname">${name}${sub ? `<small>${sub}</small>` : ''}</div><div class="kbtns">${c}</div></div>`;
    const hkNotes = S.notes.filter(n => n.hotkey);
    let h = `<input class="sel kfilter" id="kFilter" placeholder="동작이나 키로 찾기 (예: 표, Ctrl+K)" spellcheck="false" autocomplete="off">` +
      `<h4 class="kh">어디서든 · 전역 단축키 <small>다른 프로그램을 쓰다가 눌러도 동작</small></h4>` +
      krow('앱 부르기 / 원래 창으로', '', chip(st.appHotkey, 'id="setAppHk"', hkFailed.has('@app'))) +
      krow('한 줄 찾아 바로 붙여넣기', '쓰던 창 위에 검색창이 떠요', chip(st.findHotkey, 'id="setFindHk"', hkFailed.has('@find'))) +
      krow('빠른 메모', '화면 구석에 새 메모 · 한 번 더 누르면 닫기', chip(st.quickHotkey, 'id="setQuickHk"', hkFailed.has('@quick'))) +
      hkNotes.map(n => krow(`메모 · ${esc(titleOf(n) || '제목 없음')}`, '', chip(n.hotkey, `data-note="${n.id}"`, hkFailed.has(n.id)))).join('') +
      `<div class="khint">메모마다 단축키는 메모 제목 옆 [단축키 지정]으로 정해요.</div>`;
    let g = '';
    for (const a of ACTIONS) {
      if (a.g !== g) { g = a.g; h += `<h4 class="kh">${esc(g)}${a.s === 'ed' ? ' <small>메모에 글을 쓰는 중에 동작</small>' : ''}</h4>`; }
      const k = keyOf(a.id), d = defKey(a), changed = !(k === d || (k && d && k.mods === d.mods && k.code === d.code));
      h += krow(esc(a.n), '', (changed ? `<button class="kreset" data-reset="${a.id}" title="기본값(${d ? esc(d.label) : '지정 안 함'})으로">↺</button>` : '') + chip(k, `data-act="${a.id}"`));
    }
    h += `<div class="khint">바꿀 수 없는 키: 복사·붙여넣기·실행 취소 (Ctrl+C/V/X/Z/Y/A) · Ctrl+1~9 메모 열기 · Esc · F2 · 표 안의 Enter / Tab / 방향키</div>`;
    body = h;
  } else {
    const pct = zoomPct() + '%';
    body = `<h4 class="kh">보기</h4>
    ${row('테마', '눈이 편한 쪽으로 · 제목 표시줄 버튼으로도 바꿔요', `<div class="seg" id="setTheme"><button data-v="light">라이트</button><button data-v="dark">다크</button></div>`)}
    ${row('에디터 글꼴', `<span class="font-sample" id="fontSample" style="font-family:${(FONTS[st.font] || FONTS.ui)[1]}">가나다 ABC 123 — 빠른 메모</span>`, `<select class="sel" id="setFont">${Object.entries(FONTS).map(([k, v]) => `<option value="${k}"${st.font === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select>`)}
    ${row('글자 크기', 'Ctrl + 마우스 휠로도 조절', `<div class="seg"><button data-z="-1">−</button><span class="val" id="setZ">${pct}</span><button data-z="1">+</button></div>`)}
    ${row('항상 위에 표시', '', sw('onTop', st.onTop))}
    <h4 class="kh">실행</h4>
    ${row('단축키', `앱 부르기 ${esc(kl0(st.appHotkey))} · 한 줄 찾아 붙여넣기 ${esc(kl0(st.findHotkey))} · 빠른 메모 ${esc(kl0(st.quickHotkey))}`, `<button class="btn" id="setGoKeys">단축키 설정</button>`)}
    ${row('빠른 메모 위치', '빠른 메모가 뜨는 모니터 모서리 · 지금 쓰고 있는 화면에 떠요', `<div class="cpick-row"><span class="cpick-l" id="setCornerL">${CORNERS[st.quickCorner] || CORNERS.br}</span><div class="cpick" id="setCorner">${Object.entries(CORNERS).map(([c, n]) => `<button data-q="${c}" title="${n}" aria-label="${n}"${(st.quickCorner || 'br') === c ? ' class="on"' : ''}></button>`).join('')}</div></div>`)}
    ${row('닫기(X) → 트레이로 숨기기', '켜 두면 다음에 부를 때 바로 열려요 (권장) · 끄면 X가 앱을 끄고 단축키만 대기해요', sw('closeToTray', st.closeToTray))}
    ${startMode() === 'package'
      ? row('Windows 시작 시', '<span class="wrap">로그인하면 <b>단축키 대기</b>로 켜져서 꺼져 있어도 단축키가 동작해요.<br>끄려면 작업 관리자 › 시작 앱(또는 설정 › 앱 › 시작 프로그램)에서 Super Speed Note를 끄세요.</span>', '')
      : row('Windows 시작 시', '<span class="wrap"><b>단축키 대기</b> 꺼져 있어도 단축키로 열림 · 메모리 거의 안 씀 · 첫 호출 약 1초<br><b>트레이 상주</b> 언제나 바로 열림 · 메모리 더 사용 · <b>창 열기</b> 로그인하면 앱 창이 바로 열려요<br><b>끔</b> 자동으로 켜지지 않아요 · 앱을 끄면 메모 단축키도 함께 꺼져요<br>exe 파일을 옮기거나 이름을 바꿔도 Windows 시작 때 계속 켜져요</span>', `<div class="seg" id="setStart"><button data-v="standby">단축키 대기 (권장)</button><button data-v="tray">트레이 상주</button><button data-v="open">창 열기</button><button data-v="off">끔</button></div>`).replace('<div class="row">', '<div class="row col">')}
    <h4 class="kh">데이터</h4>
    ${row('데이터 폴더 · 백업', `메모 · 이미지 · 백업이 있는 곳 · 매일 자동 백업(최근 14일)<br>${esc(boot.dataDir || '')}${startMode() === 'package' ? '<br>Store 버전은 앱을 제거하면 이 폴더도 함께 지워져요 · 보관하려면 폴더를 열어 복사해 두세요' : ''}`, `<div class="row-btns"><button class="btn" id="setOpen"${HOST ? '' : ' disabled'}>폴더 열기</button><button class="btn" id="setBackup">지금 백업</button></div>`)}
    ${row('끌어서 꺼내기', '메모를 바탕화면·폴더로 끌어다 놓으면 메모 이름으로 된 파일이 돼요 · 텍스트·HTML 파일을 앱에 끌어 넣으면 메모가 돼요', `<div class="seg" id="setDrag"><button data-v="html">HTML (서식 그대로)</button><button data-v="txt">텍스트 (.txt)</button></div>`)}
    ${row('휴지통', '삭제한 메모는 휴지통을 비우기 전까지 보관해요 · 빈 메모는 바로 없어져요', `<button class="btn" id="setTrash">휴지통 열기</button>`)}`;
  }
  openModal(`<div class="dlg wide set"><div class="dlg-head">${ic('i-gear')}<h3>설정</h3><span style="flex:1"></span><div class="seg" id="setTabs"><button data-v="general"${tab === 'general' ? ' class="on"' : ''}>일반</button><button data-v="keys"${tab === 'keys' ? ' class="on"' : ''}>단축키</button></div></div><div class="dlg-body" id="setBody">${body}</div>` +
    `<div class="dlg-foot">${tab === 'keys' ? '<button class="btn ghost" id="setResetKeys">앱 안 단축키 모두 기본값으로</button>' : `<span class="ver">Super Speed Note ${esc(boot.version || '')} · 자동 저장 · 매일 자동 백업(14일)</span>`}<span style="flex:1"></span><button class="btn primary" id="setDone">완료</button></div></div>`);
  $('#setTabs').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.v !== tab) openSettings(b.dataset.v); };
  $('#setDone').onclick = closeModal;
  const back = () => openSettings(tab, true);
  if (tab === 'keys') {
    const sb = $('#setBody'), kf = $('#kFilter');
    sb.scrollTop = keysScroll;
    sb.addEventListener('scroll', () => { keysScroll = sb.scrollTop; });
    kf.addEventListener('input', () => {          // find an action by its name or its key
      const q = kf.value.trim().toLowerCase();
      for (const r of $$('.krow', sb)) r.hidden = !!q && !r.textContent.toLowerCase().includes(q);
      for (const h of $$('.kh', sb)) { let n = h.nextElementSibling, any = false; while (n && !n.matches('.kh')) { if (n.matches('.krow') && !n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !!q && !any; }
    });
    $('#setQuickHk').onclick = () => recordHotkey('빠른 메모', st.quickHotkey, '@quick', c => { takeKey(c, '@quick'); st.quickHotkey = c; st.quickHotkeyMine = true; hkJustSet = c ? '@quick' : null; saveStateSoon(); applyHotkeys(); rerender(); }, back);
    $('#setFindHk').onclick = () => recordHotkey('한 줄 찾아 바로 붙여넣기', st.findHotkey, '@find', c => { takeKey(c, '@find'); st.findHotkey = c; st.findHotkeyMine = true; hkJustSet = c ? '@find' : null; saveStateSoon(); applyHotkeys(); rerender(); }, back);
    $('#setAppHk').onclick = () => recordHotkey('앱 부르기 / 원래 창으로', st.appHotkey, '@app', c => { takeKey(c, '@app'); st.appHotkey = c; hkJustSet = c ? '@app' : null; saveStateSoon(); applyHotkeys(); rerender(); }, back);
    for (const b of $$('[data-note]', modal)) b.onclick = () => setNoteHotkey(b.dataset.note, back);
    for (const b of $$('[data-act]', modal)) b.onclick = () => {
      const a = ACT.get(b.dataset.act);
      recordHotkey(a.n, keyOf(a.id), a.id, c => setLocalKey(a.id, c), back, true);
    };
    for (const b of $$('[data-reset]', modal)) b.onclick = () => {
      const a = ACT.get(b.dataset.reset), d = defKey(a), g = d && hkOwner(d, null);
      if (g) { toast(`${josa(d.label, '은', '는')} 지금 전역 단축키 ‘${g}’에 쓰고 있어요`); return; }
      setLocalKey(a.id, d); back();
    };
    $('#setResetKeys').onclick = () => {
      const prev = st.keys;
      st.keys = {};
      for (const a of ACTIONS) { const d = defKey(a); if (d && hkOwner(d, null)) st.keys[a.id] = null; }   // a global hotkey still owns those keys
      saveStateSoon(); rebuildKeys(); updateKeyHints(); back();
      toast('앱 안 단축키를 기본값으로 돌렸어요', '되돌리기', () => { st.keys = prev; saveStateSoon(); rebuildKeys(); updateKeyHints(); if (modalOpen() && $('#setResetKeys')) back(); });
    };
    return;
  }
  const cp = $('#setCorner');
  if (cp) cp.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    st.quickCorner = b.dataset.q; host.send('quickCorner', st.quickCorner); saveStateSoon();
    for (const x of cp.children) x.classList.toggle('on', x === b);
    $('#setCornerL').textContent = CORNERS[st.quickCorner];
  };
  const segD = $('#setDrag');
  if (segD) {
    const paintD = () => { for (const b of segD.children) b.classList.toggle('on', b.dataset.v === (st.dragFormat === 'txt' ? 'txt' : 'html')); };
    paintD();
    segD.onclick = e => { const b = e.target.closest('button'); if (b) { st.dragFormat = b.dataset.v; saveStateSoon(); paintD(); } };
  }
  const segT = $('#setTheme');
  const paintSeg = () => { for (const b of segT.children) b.classList.toggle('on', b.dataset.v === st.theme); };
  paintSeg();
  segT.onclick = e => { const b = e.target.closest('button'); if (b) { setTheme(b.dataset.v); paintSeg(); } };
  for (const b of $$('[data-sw]', modal)) b.onclick = () => {
    const k = b.dataset.sw, on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    if (k === 'closeToTray') { st.closeToTray = on; host.send('closeToTray', on ? '1' : '0'); saveStateSoon(); }
    else if (k === 'onTop') setOnTop(on);
  };
  const segS = $('#setStart');
  if (segS) {                                     // not in the Store version (Windows handles its startup)
    const paintStart = () => { for (const b of segS.children) b.classList.toggle('on', b.dataset.v === startMode()); };
    paintStart();
    segS.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      const prev = startMode();
      boot.autostart = b.dataset.v; host.send('autostart', b.dataset.v); paintStart(); syncQuitLabel();
      if (!HOST) toast('브라우저 미리보기에서는 적용되지 않아요');
      else if (b.dataset.v === 'off' && prev !== 'off') toast('이제 앱을 끄면 메모 단축키도 꺼져요', '되돌리기', () => { boot.autostart = prev; host.send('autostart', prev); syncQuitLabel(); if ($('#setStart')) paintStart(); });
    };
  }
  $('#setFont').onchange = e => { st.font = e.target.value; applyFont(); saveStateSoon(); $('#fontSample').style.fontFamily = (FONTS[st.font] || FONTS.ui)[1]; };
  for (const b of $$('[data-z]', modal)) b.onclick = () => { zoom(+b.dataset.z); $('#setZ').textContent = zoomPct() + '%'; };
  $('#setOpen').onclick = () => host.send('openData');
  $('#setBackup').onclick = e => {
    if (!HOST) { toast('브라우저 미리보기에서는 백업하지 않아요'); return; }
    const b = e.currentTarget; b.disabled = true; b.textContent = '백업 중…';
    flushAll(); host.send('backup');               // the host answers with backupDone (folder, or "!" + why not)
  };
  $('#setGoKeys').onclick = () => openSettings('keys');
  $('#setTrash').onclick = () => openTrash(() => openSettings('general'));
}
let keysScroll = 0;
const kl0 = k => k ? k.label : '지정 안 함';
// Korean particles that fit the word before them: josa('Ctrl+F', '은', '는') → 'Ctrl+F는', josa('‘찾기’', '과', '와') → '‘찾기’와'
const josa = (w, a, b) => {
  const c = String(w).replace(/[^가-힣A-Za-z0-9]+$/, '').slice(-1), k = c.charCodeAt(0);
  const f = k >= 0xAC00 && k <= 0xD7A3 ? (k - 0xAC00) % 28 : /[013678LMNR]$/i.test(c) ? (/[178LR]$/i.test(c) ? 8 : 1) : 0;
  if (a === '으로') return w + (f && f !== 8 ? '으로' : '로');
  return w + (f ? a : b);
};
function showHelp() {
  const isKey = v => /^(Ctrl|Alt|Shift|Win|F\d|Esc|Enter|Tab|Del|Delete|Backspace|Space|Home|End|PgUp|PgDn|[←↑→↓]|Num)/.test(v);
  const g = (title, rows) => `<h4>${title}</h4>` + rows.filter(r => r[1]).map(([a, b]) => `<div><span>${a}</span>${isKey(b) ? `<kbd>${esc(b)}</kbd>` : `<em class="hnote">${esc(b)}</em>`}</div>`).join('');
  const k = id => kl(id, '');
  const join = (...ids) => ids.map(k).filter(Boolean).join(' / ');
  openModal(`<div class="dlg wide"><div class="dlg-head">${ic('i-help')}<h3>단축키</h3><input id="helpQ" class="sel" data-autofocus placeholder="단축키 찾기 (예: 표, 형광펜, 붙여넣기)" spellcheck="false" autocomplete="off"></div><div class="dlg-body"><div class="help" id="helpList">
    ${g('어디서든 (전역)', [['앱 부르기 / 원래 창으로', kl0(st.appHotkey)], ['한 줄 찾아 바로 붙여넣기', kl0(st.findHotkey)], ['빠른 메모 (화면 구석에 새 메모 / 닫기)', kl0(st.quickHotkey)], ['메모별 단축키', '누르면 열기 · 다시 누르면 이전 창']])}
    ${g('한 줄 찾아 붙여넣기 검색창', [['원래 창에 바로 붙여넣기', 'Enter / 클릭'], ['N번째 결과 바로 붙여넣기', 'Alt+1~9'], ['칸 · 단어만 골라 붙여넣기', 'Tab / Shift+Tab'], ['복사만 하고 돌아가기', 'Shift+Enter'], ['그 메모 열기', 'Ctrl+Enter'], ['그냥 돌아가기', 'Esc'], ['초성으로 찾기', 'ㄱㅊㅅ → 김철수']])}
    ${g('메모 보드', [['선택 이동', '← ↑ → ↓'], ['열기', 'Enter / 더블클릭'], ['이름 바꾸기', 'F2'], ['삭제 (되돌리기 · 휴지통에서 복원)', 'Del'], ['여러 개 선택', 'Shift+클릭·방향키 / Ctrl+클릭 / Ctrl+A'], ['새 메모', k('newNote')], ['N번째 메모 열기', 'Ctrl+1~9'], ['빠른 이동', k('switcher')], ['검색', k('find')]])}
    ${g('편집', [['굵게 / 밑줄 / 기울임', join('bold', 'underline', 'italic')], ['취소선', k('strike')], ['글자색', k('fgColor')], ['형광펜', k('hl')], ['서식 지우기', k('clearFmt')], ['글머리 / 번호 목록', join('ul', 'ol')], ['체크리스트', k('chk')], ['체크 표시 / 해제', 'Ctrl+Enter'], ['제목 1 / 2 / 3', join('h1', 'h2', 'h3')], ['구분선', k('hr')], ['날짜·시간', k('stamp')], ['서식 없이 붙여넣기', 'Ctrl+Shift+V'], ['찾기', k('find')], ['확대 / 축소', ['Ctrl+휠', join('zoomIn', 'zoomOut')].filter(Boolean).join(', ')], ['보드로', 'Esc'], ['다음 / 이전 메모', join('nextNote', 'prevNote')], ['실행 취소 / 다시', 'Ctrl+Z / Ctrl+Y'], [ACT.get('quit').n, k('quit')]])}
    ${g('표 (엑셀처럼)', [['칸 선택·이동', '클릭 / 방향키'], ['범위 선택', 'Shift+방향키 / 드래그'], ['선택한 칸에 바로 입력', '기존 값을 새로 씀'], ['칸 편집 (끝에 커서)', 'F2 / 더블클릭'], ['편집 취소', 'Esc'], ['칸 지우기', 'Delete'], ['아래 칸 / 마지막 행이면 행 추가', 'Enter'], ['칸 안 줄바꿈', 'Shift+Enter / Alt+Enter'], ['다음 / 이전 칸 (마지막 열이면 열 추가)', 'Tab / Shift+Tab'], ['모든 칸 선택 (한 번 더: 메모 전체)', 'Ctrl+A'], ['표 넣기 / 빠져나가기', [k('table'), 'Ctrl+Enter'].filter(Boolean).join(' / ')], ['위 / 아래에 행 삽입', join('rowAbove', 'rowBelow')], ['왼쪽 / 오른쪽에 열 삽입', join('colBefore', 'colAfter')], ['행 / 열 삭제', join('delRow', 'delCol')], ['중간에 행·열 넣기', '표 왼쪽·위쪽 여백의 +'], ['끝에 행·열 추가 (끌면 여러 개)', '표 아래·오른쪽 막대'], ['끝의 빈 행·열 지우기', '그 막대를 표 쪽으로 끌기'], ['엑셀 붙여넣기 · 범위 복사', 'Ctrl+V / Ctrl+C']])}
    ${g('개체 (그림 · 구분선 · 표)', [['선택', '클릭 (표는 왼쪽 위 손잡이)'], ['삭제', 'Delete / Backspace'], ['선택 풀기', 'Esc / 다른 곳 클릭']])}
    ${g('꺼내 쓰기', [['한 줄 찾아 붙여넣기 (앱 안)', k('palette')], ['복사 → 원래 창에 바로 붙여넣기', k('sendPaste')], ['복사 → 원래 창으로', k('sendCopy')], ['보낼 내용', '선택 > 칸 > 현재 줄 (보드: 메모 전체)'], ['메모 전체 복사 (보드)', 'Ctrl+C / 카드 복사 버튼'], ['검색한 곳으로 바로 이동', (k('switcher') || '빠른 이동') + ' → Enter']])}
    ${g('빠른 서식 (줄 맨 앞에서 입력 후 Space)', [['제목 1 / 2 / 3', '# / ## / ###'], ['글머리 목록', '-'], ['번호 목록', '1.'], ['체크리스트', '[]'], ['인용', '>'], ['코드', '```'], ['구분선', '--- 후 Enter']])}
    </div></div><div class="dlg-foot"><span style="flex:1"></span><button class="btn" id="helpKeys">단축키 바꾸기</button><button class="btn primary" id="helpDone">닫기</button></div></div>`);
  $('#helpDone').onclick = closeModal;
  $('#helpKeys').onclick = () => openSettings('keys');
  const list = $('#helpList'), q = $('#helpQ');
  if (quickOn) {                                  // the small memo window: only what works there, the useful groups first
    const keep = ['편집', '표 (엑셀처럼)', '빠른 서식 (줄 맨 앞에서 입력 후 Space)', '꺼내 쓰기', '어디서든 (전역)'];
    const groups = [];
    for (const h of $$('h4', list)) { const rows = []; let n = h.nextElementSibling; while (n && n.nodeName !== 'H4') { rows.push(n); n = n.nextElementSibling; } groups.push([h, rows]); }
    groups.sort((a, b) => keep.indexOf(a[0].textContent) - keep.indexOf(b[0].textContent));
    for (const [h, rows] of groups) { if (keep.includes(h.textContent)) list.append(h, ...rows); else { h.remove(); rows.forEach(r => r.remove()); } }
    $('#helpKeys').hidden = true;
  }
  q.addEventListener('input', () => {             // filter rows; a heading goes when none of its rows is left
    const t = q.value.trim().toLowerCase();
    let shown = 0;
    for (const d of $$('div', list)) { d.hidden = !!t && !d.textContent.toLowerCase().includes(t); if (!d.hidden) shown++; }
    for (const h of $$('h4', list)) { let n = h.nextElementSibling, any = false; while (n && n.nodeName !== 'H4') { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !!t && !any; }
    let e = $('#helpNone');
    if (!shown && !e) { e = document.createElement('p'); e.id = 'helpNone'; e.className = 'qs-empty'; e.textContent = '찾는 단축키가 없어요'; list.after(e); }
    if (e) e.hidden = !!shown;
  });
}

