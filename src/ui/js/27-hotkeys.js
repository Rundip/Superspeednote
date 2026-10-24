// ---------------------------------------------------------------- global hotkeys (registered by the native shell)
const VK = { Space: 32, Enter: 13, Tab: 9, Backspace: 8, Escape: 27, Insert: 45, Delete: 46, Home: 36, End: 35, PageUp: 33, PageDown: 34, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222, Pause: 19, NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111 };
const KEYNAME = { Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓', Semicolon: ';', Equal: '=', Comma: ',', Minus: '-', Period: '.', Slash: '/', Backquote: '`', BracketLeft: '[', Backslash: '\\', BracketRight: ']', Quote: "'", Pause: 'Pause', NumpadMultiply: 'Num*', NumpadAdd: 'Num+', NumpadSubtract: 'Num-', NumpadDecimal: 'Num.', NumpadDivide: 'Num/' };
function vkOf(code) {
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1].charCodeAt(0);
  if ((m = /^Digit(\d)$/.exec(code))) return 48 + +m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return 96 + +m[1];
  if ((m = /^F(\d{1,2})$/.exec(code)) && +m[1] >= 1 && +m[1] <= 24) return 111 + +m[1];
  return VK[code] || 0;
}
function keyName(code) {
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return 'Num' + m[1];
  if (/^F\d{1,2}$/.test(code)) return code;
  return KEYNAME[code] || code;
}
function modNames(m) { return [m & 2 && 'Ctrl', m & 1 && 'Alt', m & 4 && 'Shift', m & 8 && 'Win'].filter(Boolean); }
const sameKey = (a, b) => a && b && a.mods === b.mods && a.vk === b.vk;
// Windows and everyday shortcuts a global hotkey would take over. lvl 2 = refused, lvl 1 = allowed with a warning.
const SYS_KEYS = (() => {
  const m = new Map(), A = 1, C = 2, S = 4, W = 8;
  const add = (mods, codes, name, lvl = 1) => { for (const code of [].concat(codes)) m.set(mods + ':' + vkOf(code), { name, lvl }); };
  const digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
  const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  // Win
  [['KeyA', '빠른 설정'], ['KeyB', '알림 영역'], ['KeyC', 'Copilot'], ['KeyD', '바탕 화면 보기'], ['KeyE', '파일 탐색기'], ['KeyF', '피드백 허브'],
   ['KeyG', 'Xbox Game Bar'], ['KeyH', '음성 입력'], ['KeyI', 'Windows 설정'], ['KeyK', '무선 디스플레이 연결'], ['KeyM', '모든 창 최소화'],
   ['KeyN', '알림 센터'], ['KeyO', '화면 회전 잠금'], ['KeyP', '디스플레이 전환'], ['KeyQ', '검색'], ['KeyR', '실행 창'], ['KeyS', '검색'],
   ['KeyT', '작업 표시줄 앱 순환'], ['KeyU', '접근성 설정'], ['KeyV', '클립보드 기록'], ['KeyW', '위젯'], ['KeyX', '빠른 링크 메뉴'],
   ['KeyZ', '스냅 레이아웃'], ['Tab', '작업 보기'], ['Period', '이모지 패널'], ['Semicolon', '이모지 패널'], ['Comma', '바탕 화면 미리 보기'],
   ['Space', '입력 언어 전환'], ['Home', '다른 창 최소화'], ['Escape', '돋보기 종료'], ['Pause', '시스템 정보'], ['Equal', '돋보기'], ['Minus', '돋보기']
  ].forEach(([k, n]) => add(W, k, n));
  add(W, 'KeyL', '화면 잠금', 2);
  add(W, digits, '작업 표시줄 앱 실행'); add(W, arrows, '창 스냅(정렬)');
  add(W | S, 'KeyS', '화면 캡처'); add(W | S, ['ArrowLeft', 'ArrowRight'], '창을 다른 모니터로'); add(W | S, 'KeyM', '최소화한 창 복원');
  add(W | C, 'KeyD', '새 가상 데스크톱'); add(W | C, 'F4', '가상 데스크톱 닫기'); add(W | C, ['ArrowLeft', 'ArrowRight'], '가상 데스크톱 전환');
  add(W | C, 'Enter', '내레이터'); add(W | A, 'KeyR', '화면 녹화'); add(W | A, 'KeyG', '최근 장면 녹화'); add(W | C | S, 'KeyB', '그래픽 드라이버 재시작');
  // Alt
  add(A, 'Tab', '창 전환', 2); add(A | S, 'Tab', '창 전환', 2); add(A, 'F4', '창 닫기', 2);
  add(A, 'Escape', '창 순환'); add(A, 'Space', '창 메뉴'); add(A, 'Enter', '속성 / 전체 화면'); add(A, ['ArrowLeft', 'ArrowRight'], '뒤로 / 앞으로');
  add(A, 'ArrowUp', '상위 폴더'); add(A, 'KeyD', '주소 표시줄'); add(A, 'KeyF', '파일 메뉴');
  // Ctrl
  [['KeyA', '모두 선택'], ['KeyC', '복사'], ['KeyV', '붙여넣기'], ['KeyX', '잘라내기'], ['KeyZ', '실행 취소'], ['KeyY', '다시 실행'], ['KeyS', '저장']].forEach(([k, n]) => add(C, k, n, 2));
  [['KeyF', '찾기'], ['KeyP', '인쇄'], ['KeyN', '새로 만들기'], ['KeyO', '열기'], ['KeyW', '탭·창 닫기'], ['KeyT', '새 탭'], ['KeyR', '새로 고침'],
   ['KeyH', '바꾸기 / 방문 기록'], ['KeyB', '굵게'], ['KeyI', '기울임'], ['KeyU', '밑줄'], ['KeyE', '검색 / 가운데 정렬'], ['KeyD', '즐겨찾기 / 복제'],
   ['KeyK', '링크 넣기'], ['KeyL', '주소창'], ['KeyG', '다음 찾기'], ['KeyJ', '다운로드'], ['KeyQ', '앱 종료'], ['Tab', '다음 탭'], ['F4', '탭 닫기'],
   ['F5', '강력 새로 고침'], ['Equal', '확대'], ['Minus', '축소'], ['Digit0', '확대 초기화'], ['Space', '한/영·입력기 전환'], ['Enter', '보내기 / 줄 삽입']
  ].forEach(([k, n]) => add(C, k, n));
  add(C, 'Escape', '시작 메뉴', 2); add(C | S, 'Escape', '작업 관리자', 2);
  [['KeyN', '새 폴더 / 시크릿 창'], ['KeyT', '닫은 탭 다시 열기'], ['KeyV', '서식 없이 붙여넣기'], ['KeyZ', '다시 실행'], ['Tab', '이전 탭'],
   ['KeyS', '다른 이름으로 저장'], ['KeyI', '개발자 도구'], ['KeyC', '요소 검사'], ['KeyE', '파일 탐색기 탐색 창']].forEach(([k, n]) => add(C | S, k, n));
  add(C | A, 'Tab', '창 전환'); add(C | A, arrows, '화면 회전 (일부 그래픽 드라이버)');
  // single keys
  [['F1', '도움말'], ['F2', '이름 바꾸기'], ['F3', '검색'], ['F4', '주소 표시줄'], ['F5', '새로 고침'], ['F6', '주소창 이동'], ['F7', '맞춤법 검사'],
   ['F10', '메뉴 표시줄'], ['F11', '전체 화면'], ['F12', '다른 이름으로 저장 / 개발자 도구']].forEach(([k, n]) => add(0, k, n));
  add(S, 'F10', '바로 가기 메뉴'); add(S, 'Space', '한/영 전환 (일부 설정)');
  return m;
})();
function hkProblem(c) {
  const fkey = c.vk >= 112 && c.vk <= 135;
  if (!c.mods && !fkey) return { lvl: 2, msg: 'Ctrl · Alt · Shift · Win 중 하나와 함께 눌러 주세요. (F1~F12는 단독 가능)' };
  if (c.mods === 15) return { lvl: 2, msg: '키는 최대 4개까지예요. Ctrl·Alt·Shift·Win 중 3개 이하 + 키 1개로 눌러 주세요.' };
  if (c.mods === 4 && !fkey && c.vk !== 32) return { lvl: 2, msg: 'Shift만 쓰면 글자 입력과 겹쳐요. Ctrl이나 Alt를 함께 눌러 주세요.' };
  const sys = SYS_KEYS.get(c.mods + ':' + c.vk);
  if (sys && sys.lvl === 2) return { lvl: 2, msg: `${josa(c.label, '은', '는')} Windows 기본 단축키 ${josa(`‘${sys.name}’`, '이라서', '라서')} 쓸 수 없어요.` };
  if (sys) return { lvl: 1, name: sys.name, msg: `⚠ Windows 기본 단축키 ${josa(`‘${sys.name}’`, '과', '와')} 겹쳐요. 저장하면 어디서 누르든 그 기능 대신 이 메모가 열려요.` };
  if (c.mods & 8) return { lvl: 1, name: 'Win 키 조합', msg: '⚠ Win 키 조합은 Windows가 예약해 둔 경우가 많아 겹치거나 등록이 안 될 수 있어요.' };
  return null;
}
function hkConflictName(c) { const p = c && hkProblem(c); return p && p.lvl === 1 ? p.name : ''; }
function hkOwner(c, skip) {
  if (skip !== '@app' && sameKey(st.appHotkey, c)) return '앱 부르기';
  if (skip !== '@find' && sameKey(st.findHotkey, c)) return '한 줄 찾아 붙여넣기';
  if (skip !== '@quick' && sameKey(st.quickHotkey, c)) return '빠른 메모';
  const n = S.notes.find(x => x.id !== skip && sameKey(x.hotkey, c));
  return n ? (titleOf(n) || '제목 없음') : '';
}
function applyHotkeys() {
  const parts = [];
  if (st.appHotkey) parts.push(['@app', st.appHotkey.mods, st.appHotkey.vk].join(','));
  if (st.findHotkey) parts.push(['@find', st.findHotkey.mods, st.findHotkey.vk].join(','));
  if (st.quickHotkey) parts.push(['@quick', st.quickHotkey.mods, st.quickHotkey.vk].join(','));
  for (const n of S.notes) if (n.hotkey) parts.push([n.id, n.hotkey.mods, n.hotkey.vk].join(','));
  host.send('hotkeys', parts.join(';'));
}
let recording = false;
// local = an in-app shortcut (owner = action id) instead of a system-wide hotkey
function hkSnap() {                              // every hotkey, so any change can be undone in one step
  return { keys: JSON.stringify(st.keys || {}), app: st.appHotkey, find: st.findHotkey, quick: st.quickHotkey, notes: S.notes.map(n => [n.id, n.hotkey]) };
}
function hkRestore(x) {
  st.keys = JSON.parse(x.keys); st.appHotkey = x.app; st.findHotkey = x.find; st.quickHotkey = x.quick;
  for (const [id, k] of x.notes) { const n = noteById(id); if (n) n.hotkey = k; }
  rebuildKeys(); updateKeyHints(); applyHotkeys(); saveStateSoon(); rerender();
  if (modalOpen() && $('#setTabs')) openSettings('keys', true);
}
function recordHotkey(title, current, owner, onSave, after, local) {
  recording = true;
  host.send('hkSuspend', '1');                 // so pressing an existing combo can be re-recorded
  let combo = current || null, clearing = false, typed = false;
  const say = (cls, html) => { hint.className = 'hint ' + cls; hint.innerHTML = html; keys.classList.toggle('bad', cls === 'bad'); sync(); };
  const onKey = e => {
    e.preventDefault(); e.stopPropagation();
    if (e.isComposing) return;
    const plainKey = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (e.key === 'Escape' && plainKey) { closeModal(); return; }
    if (e.key === 'Enter' && plainKey) { save(); return; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && plainKey && current) {   // the key to clear it
      combo = null; clearing = true; typed = true; cap.textContent = '새 단축키';
      keys.innerHTML = '<kbd class="ghost">지정 안 함</kbd>';
      say('warn', '저장하면 단축키를 해제해요');
      return;
    }
    clearing = false;
    const mods = (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.shiftKey ? 4 : 0) | (e.metaKey ? 8 : 0);
    // Some keyboards, remote desktop and macro tools send keys without e.code: fall back to the key number
    const isMod = /^(Control|Alt|Shift|Meta|OS|Hangul|Hanja|Lang)/.test(e.code) || [16, 17, 18, 91, 92, 21, 25].includes(e.keyCode);
    let vk = vkOf(e.code);
    if (!vk && !isMod && e.keyCode && e.keyCode !== 229) vk = e.keyCode;
    if (!typed) { typed = true; cap.textContent = '새 단축키'; }
    if (!vk || isMod) {
      keys.innerHTML = modNames(mods).map(k => `<kbd>${k}</kbd><span class="plus">+</span>`).join('') + '<kbd class="ghost">?</kbd>';
      return;
    }
    // Right-hand keypad digits: with Shift held (NumLock on) or NumLock off, Windows turns them into
    // End / ↓ / PgDn ... and drops the Shift, so such a combo can never fire as a global hotkey.
    if (/^Numpad(\d|Decimal)$/.test(e.code) && e.keyCode && !(e.keyCode >= 96 && e.keyCode <= 105) && e.keyCode !== 110) {
      combo = null;
      keys.innerHTML = [...modNames(mods), 'Num' + e.code.replace('Numpad', '').replace('Decimal', '.')].map(k => `<kbd>${esc(k)}</kbd>`).join('<span class="plus">+</span>');
      say('bad', '✕ Windows는 Shift를 누른 채(또는 NumLock이 꺼진 상태에서) 오른쪽 숫자키를 누르면 숫자 대신 End·↓ 같은 이동키로 바꿔서 단축키로 쓸 수 없어요. NumLock을 켜고 Ctrl+Alt+숫자키를 써 주세요.');
      return;
    }
    const code = codeOf(e);
    const name = code ? keyName(code) : (e.key && e.key.length === 1 ? e.key.toUpperCase() : (e.key || 'Key' + vk));
    const c = { mods, vk, code, label: [...modNames(mods), name].join('+') };
    show(c);
    const p = local ? localProblem(c, owner) : hkProblem(c);
    if (p && p.lvl === 2) { combo = null; say('bad', '✕ ' + esc(p.msg)); return; }
    combo = c;
    const who = local ? '' : hkOwner(c, owner), inApp = local ? null : localOwner(c, null);
    const warns = [p && p.msg, who && `‘${who}’에 쓰던 키예요. 저장하면 이쪽으로 옮겨져요.`,
      inApp && `${josa(`앱 안 단축키 ‘${inApp.n}’`, '과', '와')} 같은 키예요. 저장하면 그쪽은 지정 안 함이 돼요.`].filter(Boolean);
    if (warns.length) say('warn', warns.map(w => '⚠ ' + esc(w)).join('<br>'));
    else say('ok', sameKey(c, current) ? '지금 쓰고 있는 키예요' : '✓ 쓸 수 있는 키예요 · Enter로 저장');
  };
  const onBlur = () => closeModal();              // switching away must never leave every hotkey switched off
  const done = () => { recording = false; document.removeEventListener('keydown', onKey, true); window.removeEventListener('blur', onBlur); host.send('hkSuspend', '0'); if (after) after(); };
  openModal(`<div class="dlg"><div class="dlg-head">${ic('i-key')}<h3>${local ? '앱 안 단축키' : '전역 단축키'}</h3><span class="dlg-sub">${esc(title)}</span></div>
    <div class="dlg-body"><div class="hk-cap" id="hkCap">${current ? '지금 단축키' : '새 단축키'}</div><div class="keys" id="hkKeys"></div><div class="hint" id="hkHint">${local
      ? '쓰고 싶은 키 조합을 한 번에 눌러 주세요.<br>예) Ctrl+Alt+B · Ctrl+Shift+1 · F7 — 이 앱 안에서만 동작해요.'
      : '쓰고 싶은 키 조합을 한 번에 눌러 주세요.<br>예) Ctrl+Alt+1 · Ctrl+Shift+F9 · F8 — 누르면 이 메모가 앞으로 나오고, 한 번 더 누르면 쓰던 창으로 돌아가요.'}</div></div>
    <div class="dlg-foot"><span class="ver">Enter 저장 · Esc 취소${current ? ' · Backspace 해제' : ''}</span><span style="flex:1"></span>${current ? '<button class="btn ghost" id="hkClear">단축키 해제</button>' : ''}<button class="btn" id="hkCancel">취소</button><button class="btn primary" id="hkSave">저장</button></div></div>`, done);
  const keys = $('#hkKeys'), hint = $('#hkHint'), cap = $('#hkCap');
  const show = c => { keys.innerHTML = c ? c.label.split('+').map(k => `<kbd>${esc(k || '+')}</kbd>`).join('<span class="plus">+</span>') : '<kbd class="ghost">?</kbd>'; };
  const sync = () => { $('#hkSave').disabled = !(combo || clearing) || (!!combo && sameKey(combo, current)); };
  const commit = c => {                            // one toast, with undo, for every way a hotkey changes
    const snap = hkSnap(), who = c && !local ? hkOwner(c, owner) : '', inApp = c && !local ? localOwner(c, null) : null;
    onSave(c);
    closeModal();
    toast(c ? `‘${title}’ → ${c.label}${who ? ` · ‘${who}’의 단축키는 해제됐어요` : ''}${inApp ? ` · ${josa(`‘${inApp.n}’`, '은', '는')} 지정 안 함` : ''}` : `‘${title}’ 단축키를 해제했어요`,
      '되돌리기', () => hkRestore(snap));
  };
  const save = () => {
    if (clearing) { commit(null); return; }
    if (!combo) { keys.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 }); return; }   // refused: nothing to save
    if (sameKey(combo, current)) { closeModal(); return; }
    commit(combo);
  };
  show(combo);
  sync();
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', onBlur);
  $('#hkCancel').onclick = closeModal;
  $('#hkSave').onclick = save;
  if (current) $('#hkClear').onclick = () => commit(null);
}
function takeKey(c, owner) {            // a combo lives in one place only
  if (!c) return;
  if (owner !== '@app' && sameKey(st.appHotkey, c)) st.appHotkey = null;
  if (owner !== '@find' && sameKey(st.findHotkey, c)) st.findHotkey = null;
  if (owner !== '@quick' && sameKey(st.quickHotkey, c)) st.quickHotkey = null;
  for (const n of S.notes) if (n.id !== owner && sameKey(n.hotkey, c)) n.hotkey = null;
  // a global hotkey wins over an in-app shortcut on the same keys: free that one
  const lo = localOwner(c, null);
  if (lo) { st.keys = st.keys || {}; st.keys[lo.id] = null; rebuildKeys(); updateKeyHints(); }
}
function setNoteHotkey(id, after) {
  const n = noteById(id);
  if (!n) return;
  recordHotkey(titleOf(n) || '제목 없음', n.hotkey, id, c => {
    takeKey(c, id);
    n.hotkey = c;
    hkJustSet = c ? id : null;
    saveStateSoon(); applyHotkeys(); rerender();
  }, after);
}
const hkWarned = new Set();
function hotkeyOf(key) { return key === '@app' ? st.appHotkey : key === '@find' ? st.findHotkey : key === '@quick' ? st.quickHotkey : (noteById(key) || {}).hotkey; }
// a default global hotkey you never chose yourself moves on to a free combo if another program already has it
const AUTO_KEYS = {
  '@find': { prop: 'findHotkey', mine: 'findHotkeyMine', name: '한 줄 찾아 붙여넣기', keys: [{ mods: 3, vk: 70, code: 'KeyF', label: 'Ctrl+Alt+F' },
    { mods: 3, vk: 32, code: 'Space', label: 'Ctrl+Alt+Space' }, { mods: 7, vk: 70, code: 'KeyF', label: 'Ctrl+Alt+Shift+F' }, { mods: 3, vk: 74, code: 'KeyJ', label: 'Ctrl+Alt+J' }] },
  '@quick': { prop: 'quickHotkey', mine: 'quickHotkeyMine', name: '빠른 메모', keys: [{ mods: 3, vk: 77, code: 'KeyM', label: 'Ctrl+Alt+M' },
    { mods: 7, vk: 77, code: 'KeyM', label: 'Ctrl+Alt+Shift+M' }, { mods: 3, vk: 81, code: 'KeyQ', label: 'Ctrl+Alt+Q' }, { mods: 3, vk: 186, code: 'Semicolon', label: 'Ctrl+Alt+;' }] }
};
const autoTried = new Set();
function onHotkeyStatus(list) {
  hkFailed = new Set(list ? list.split(',') : []);
  for (const [key, A] of Object.entries(AUTO_KEYS)) {
    const curK = st[A.prop];
    if (!hkFailed.has(key) || st[A.mine] || !curK) continue;
    autoTried.add(key + curK.mods + ':' + curK.vk);
    const next = A.keys.find(c => !autoTried.has(key + c.mods + ':' + c.vk) && !hkOwner(c, key) && !localOwner(c, null));
    if (!next) continue;
    st[A.prop] = Object.assign({}, next);
    saveStateSoon(); applyHotkeys();
    toast(`${josa(curK.label, '은', '는')} 다른 프로그램이 쓰고 있어서 ${josa(`‘${A.name}’`, '을', '를')} ${josa(next.label, '으로')} 정했어요 · 설정에서 바꿀 수 있어요`);
    return;
  }
  if (hkJustSet) {
    const c = hotkeyOf(hkJustSet), label = c && c.label, clash = hkConflictName(c);
    if (hkFailed.has(hkJustSet)) toast(`${josa(label, '은', '는')} Windows나 다른 프로그램이 이미 쓰고 있어 등록하지 못했어요. 다른 조합을 골라 주세요.`);
    else if (clash) toast(`${josa(label, '으로')} 정했어요 · ⚠ Windows 기본 단축키 ${josa(`‘${clash}’`, '과', '와')} 겹쳐요`);
    else if (label) toast(`${josa(label, '으로')} 정했어요 · 어디서든 눌러 보세요`);
    hkWarned.add(hkJustSet + ':' + label);
    hkJustSet = null;
  }
  // hotkeys that stopped registering (another program grabbed them since): say so once
  const lost = [...hkFailed].map(k => ({ k, c: hotkeyOf(k) })).filter(x => x.c && !hkWarned.has(x.k + ':' + x.c.label));
  if (lost.length) {
    lost.forEach(x => hkWarned.add(x.k + ':' + x.c.label));
    toast(`단축키 ${lost.map(x => x.c.label).join(', ')} — 다른 프로그램이 쓰고 있어 등록하지 못했어요 (빨간 표시)`);
  }
  rerender();
  if (modalOpen() && $('#setAppHk')) {
    $('#setAppHk').classList.toggle('bad', hkFailed.has('@app'));
    $('#setFindHk').classList.toggle('bad', hkFailed.has('@find'));
    $('#setQuickHk').classList.toggle('bad', hkFailed.has('@quick'));
    for (const b of $$('[data-note]', modal)) b.classList.toggle('bad', hkFailed.has(b.dataset.note));
  }
}

