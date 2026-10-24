// ---------------------------------------------------------------- in-app shortcuts (every one can be changed in Settings > 단축키)
// A key is { mods, code, vk, label }; mods bits as for global hotkeys: 1 Alt, 2 Ctrl, 4 Shift, 8 Win.
// s: 'app' = anywhere in the window, 'ed' = while writing in a note.
const ACTIONS = [
  { id: 'newNote', g: '앱 전체', n: '새 메모', k: [2, 'KeyN'], run: () => newNote() },
  { id: 'switcher', g: '앱 전체', n: '빠른 이동 (메모 찾아 열기)', k: [2, 'KeyK'], run: () => openSwitcher() },
  { id: 'find', g: '앱 전체', n: '찾기 (메모 안 / 보드 검색)', k: [2, 'KeyF'], run: () => { if (view === 'editor') openFind(); else { boardSearch.focus(); boardSearch.select(); } } },
  { id: 'nextNote', g: '앱 전체', n: '다음 메모', k: [2, 'Tab'], run: () => cycle(1) },
  { id: 'prevNote', g: '앱 전체', n: '이전 메모', k: [6, 'Tab'], run: () => cycle(-1) },
  { id: 'closeView', g: '앱 전체', n: '보드로 / 창 닫기', k: [2, 'KeyW'], run: () => { if (view === 'editor' && !listHome()) showBoard(); else { flushAll(); host.send('close'); } } },
  { id: 'save', g: '앱 전체', n: '저장 (원래 자동 저장)', k: [2, 'KeyS'], run: () => { flushAll(); toast('저장했어요 · 따로 누르지 않아도 자동으로 저장돼요'); } },
  { id: 'quit', g: '앱 전체', n: '끄기 (단축키는 계속 대기)', k: [2, 'KeyQ'], run: () => { flushAll(); host.send('quit'); } },
  { id: 'settings', g: '앱 전체', n: '설정', k: [2, 'Comma'], run: () => openSettings() },
  { id: 'help', g: '앱 전체', n: '단축키 모두 보기', k: [0, 'F1'], run: () => showHelp() },
  { id: 'zoomIn', g: '앱 전체', n: '글자 크게', k: [2, 'Equal'], run: () => zoom(1) },
  { id: 'zoomOut', g: '앱 전체', n: '글자 작게', k: [2, 'Minus'], run: () => zoom(-1) },
  { id: 'zoomReset', g: '앱 전체', n: '글자 크기 원래대로', k: [2, 'Digit0'], run: () => zoom(0) },
  { id: 'onTop', g: '앱 전체', n: '항상 위에 표시 켜기 / 끄기', k: null, run: () => { setOnTop(!st.onTop); toast(st.onTop ? '항상 위에 표시' : '항상 위에 표시 끔'); } },
  { id: 'theme', g: '앱 전체', n: '라이트 / 다크 바꾸기', k: null, run: () => setTheme(st.theme === 'dark' ? 'light' : 'dark') },
  { id: 'trash', g: '앱 전체', n: '휴지통 (삭제한 메모 복원)', k: null, run: () => openTrash() },
  { id: 'sidebar', g: '앱 전체', n: '메모 목록 접기 / 펼치기', k: null, run: () => $('#hSide').click() },
  { id: 'palette', g: '꺼내 쓰기', n: '한 줄 찾아 붙여넣기 (앱 안에서)', k: [6, 'KeyF'], run: () => openPalette(quickOn ? 'quick' : 'key') },
  { id: 'sendPaste', g: '꺼내 쓰기', n: '복사 → 원래 창에 바로 붙여넣기', k: [6, 'Enter'], run: () => sendOut('paste') },
  { id: 'sendCopy', g: '꺼내 쓰기', n: '복사 → 원래 창으로', k: [6, 'KeyC'], run: () => sendOut('copy') },
  { id: 'bold', s: 'ed', g: '편집 (메모 안)', n: '굵게', k: [2, 'KeyB'], run: () => fmt('bold') },
  { id: 'underline', s: 'ed', g: '편집 (메모 안)', n: '밑줄', k: [2, 'KeyU'], run: () => fmt('underline') },
  { id: 'italic', s: 'ed', g: '편집 (메모 안)', n: '기울임', k: [2, 'KeyI'], run: () => fmt('italic') },
  { id: 'strike', s: 'ed', g: '편집 (메모 안)', n: '취소선', k: [6, 'KeyS'], run: () => fmt('strikeThrough') },
  { id: 'fgColor', s: 'ed', g: '편집 (메모 안)', n: '글자색 (마지막에 고른 색)', k: null, run: () => applyFg(st.fg) },
  { id: 'hl', s: 'ed', g: '편집 (메모 안)', n: '형광펜', k: [6, 'KeyH'], run: () => toggleHl() },
  { id: 'clearFmt', s: 'ed', g: '편집 (메모 안)', n: '서식 지우기', k: [2, 'Backslash'], run: () => clearFmt() },
  { id: 'ul', s: 'ed', g: '편집 (메모 안)', n: '글머리 목록', k: [6, 'Digit8'], run: () => toggleList('ul') },
  { id: 'ol', s: 'ed', g: '편집 (메모 안)', n: '번호 목록', k: [6, 'Digit7'], run: () => toggleList('ol') },
  { id: 'chk', s: 'ed', g: '편집 (메모 안)', n: '체크리스트', k: [6, 'KeyL'], run: () => toggleList('chk') },
  { id: 'table', s: 'ed', g: '편집 (메모 안)', n: '표 넣기', k: [6, 'KeyT'], run: () => insertTable(3, 3) },
  { id: 'hr', s: 'ed', g: '편집 (메모 안)', n: '구분선', k: null, run: () => insertHr() },
  { id: 'stamp', s: 'ed', g: '편집 (메모 안)', n: '날짜·시간 넣기', k: [2, 'Semicolon'], run: () => stamp() },
  { id: 'h1', s: 'ed', g: '편집 (메모 안)', n: '제목 1', k: null, run: () => setBlock('h1') },
  { id: 'h2', s: 'ed', g: '편집 (메모 안)', n: '제목 2', k: null, run: () => setBlock('h2') },
  { id: 'h3', s: 'ed', g: '편집 (메모 안)', n: '제목 3', k: null, run: () => setBlock('h3') },
  { id: 'para', s: 'ed', g: '편집 (메모 안)', n: '본문으로', k: null, run: () => setBlock('div') },
  { id: 'rowAbove', s: 'ed', g: '표 (셀 안에서)', n: '위에 행 삽입', k: [5, 'ArrowUp'], run: () => tblAct('rowAbove') },
  { id: 'rowBelow', s: 'ed', g: '표 (셀 안에서)', n: '아래에 행 삽입', k: [5, 'ArrowDown'], run: () => tblAct('rowBelow') },
  { id: 'colBefore', s: 'ed', g: '표 (셀 안에서)', n: '왼쪽에 열 삽입', k: [5, 'ArrowLeft'], run: () => tblAct('colBefore') },
  { id: 'colAfter', s: 'ed', g: '표 (셀 안에서)', n: '오른쪽에 열 삽입', k: [5, 'ArrowRight'], run: () => tblAct('colAfter') },
  { id: 'delRow', s: 'ed', g: '표 (셀 안에서)', n: '행 삭제 (선택한 행 모두)', k: [6, 'Minus'], run: () => tblAct('delRow') },
  { id: 'delCol', s: 'ed', g: '표 (셀 안에서)', n: '열 삭제 (선택한 열 모두)', k: [3, 'Minus'], run: () => tblAct('delCol') }
];
const ACT = new Map(ACTIONS.map(a => [a.id, a]));
function syncQuitLabel() { ACT.get('quit').n = startMode() === 'off' ? '끄기 (완전 종료)' : '끄기 (단축키는 계속 대기)'; }
const QUICK_OK = new Set(['find', 'save', 'zoomIn', 'zoomOut', 'zoomReset', 'help', 'theme', 'palette', 'sendPaste', 'sendCopy']);
// keys that keep their meaning everywhere (copy, undo, open n-th note, ...): they can't be reassigned
const FIXED_KEYS = (() => {
  const m = new Map(), C = 2, S = 4, A = 1;
  [[C, 'KeyC', '복사'], [C, 'KeyV', '붙여넣기'], [C, 'KeyX', '잘라내기'], [C, 'KeyA', '모두 선택'], [C, 'KeyZ', '실행 취소'], [C, 'KeyY', '다시 실행'],
   [C | S, 'KeyZ', '다시 실행'], [C | S, 'KeyV', '서식 없이 붙여넣기'], [C, 'Enter', '표 빠져나가기'], [A, 'F4', '창 닫기'], [A, 'Tab', '창 전환'],
   [A, 'Space', '창 메뉴'], [0, 'F2', '이름 바꾸기'], [C, 'NumpadAdd', '글자 크게'], [C, 'NumpadSubtract', '글자 작게'], [C, 'Numpad0', '글자 크기 원래대로']
  ].forEach(([mods, code, n]) => m.set(mods + ':' + code, n));
  for (let d = 1; d <= 9; d++) m.set(C + ':Digit' + d, d + '번째 메모 바로 열기');
  return m;
})();
const mkKey = (mods, code) => ({ mods, code, vk: vkOf(code), label: [...modNames(mods), keyName(code)].join('+') });
const defKey = a => a.k ? mkKey(a.k[0], a.k[1]) : null;
function keyOf(id) {
  const o = st.keys && st.keys[id];
  return o !== undefined ? o : defKey(ACT.get(id));
}
function kl(id, dflt = '') { const k = keyOf(id); return k ? k.label : dflt; }       // label for hints
function modsOf(e) { return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.shiftKey ? 4 : 0) | (e.metaKey ? 8 : 0); }
function codeOf(e) {                              // some keyboards / remote tools send no e.code
  if (e.code) return e.code;
  const k = e.keyCode;
  if (k >= 65 && k <= 90) return 'Key' + String.fromCharCode(k);
  if (k >= 48 && k <= 57) return 'Digit' + (k - 48);
  if (k >= 96 && k <= 105) return 'Numpad' + (k - 96);
  if (k >= 112 && k <= 135) return 'F' + (k - 111);
  for (const c in VK) if (VK[c] === k) return c;
  return '';
}
let keyMap = new Map();                           // 'scope|mods|code' -> action
function rebuildKeys() {
  keyMap = new Map();
  for (const a of ACTIONS) { const k = keyOf(a.id); if (k) keyMap.set((a.s || 'app') + '|' + k.mods + '|' + k.code, a); }
}
function actionFor(e, scope) { return keyMap.get(scope + '|' + modsOf(e) + '|' + codeOf(e)) || null; }
function localOwner(c, skip) {
  for (const a of ACTIONS) { if (a.id === skip) continue; const k = keyOf(a.id); if (k && k.mods === c.mods && k.code === c.code) return a; }
  return null;
}
function localProblem(c, skip) {
  const fkey = /^F\d{1,2}$/.test(c.code);
  if (c.mods & 8) return { lvl: 2, msg: 'Win 키 조합은 Windows가 먼저 가져가서 앱 안 단축키로 쓸 수 없어요.' };
  if (!c.mods && !fkey) return { lvl: 2, msg: 'Ctrl · Alt · Shift와 함께 눌러 주세요. (F1~F12는 단독 가능)' };
  if (c.mods === 4 && !fkey) return { lvl: 2, msg: 'Shift만 쓰면 글자 입력과 겹쳐요. Ctrl이나 Alt를 함께 눌러 주세요.' };
  const fixed = FIXED_KEYS.get(c.mods + ':' + c.code);
  if (fixed) return { lvl: 2, msg: `${josa(c.label, '은', '는')} ‘${fixed}’에 쓰는 키라서 바꿀 수 없어요.` };
  const g = hkOwner(c, null);
  if (g) return { lvl: 2, msg: `${josa(c.label, '은', '는')} 전역 단축키 ‘${g}’에 쓰고 있어서 앱 안에서는 그쪽이 먼저 실행돼요. 다른 키를 골라 주세요.` };
  const o = localOwner(c, skip);
  if (o) return { lvl: 1, msg: `‘${o.n}’에 쓰던 키예요. 저장하면 이쪽으로 옮겨지고 ${josa(`‘${o.n}’`, '은', '는')} 지정 안 함이 돼요.` };
  return null;
}
function setLocalKey(id, c) {
  st.keys = st.keys || {};
  if (c) for (const a of ACTIONS) { if (a.id === id) continue; const k = keyOf(a.id); if (k && k.mods === c.mods && k.code === c.code) st.keys[a.id] = null; }
  const d = defKey(ACT.get(id));
  if (c ? d && d.mods === c.mods && d.code === c.code : !d) delete st.keys[id]; else st.keys[id] = c;
  saveStateSoon(); rebuildKeys(); updateKeyHints();
}
// shortcut labels shown around the app follow the current keys
function updateKeyHints() {
  for (const el of $$('[data-k]')) {
    const k = keyOf(el.dataset.k), t = el.dataset.t;
    if (t) el.title = k ? `${t} (${k.label})` : t;
    else el.textContent = k ? k.label : '';
    if (!t) el.hidden = !k;
  }
  const sw = kl('switcher'), nx = kl('nextNote');
  defaultHint = [listHome() ? 'Esc 목록' : 'Esc 보드', sw && sw + ' 빠른 이동'].filter(Boolean).join(' · ');
  if (!hintMode) $('#stHint').textContent = defaultHint;
  $('#sbFoot').textContent = [nx && nx + ' 다음 메모', sw && sw + ' 빠른 이동'].filter(Boolean).join(' · ');
}

