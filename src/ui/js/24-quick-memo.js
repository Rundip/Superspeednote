// ---------------------------------------------------------------- quick memo (global hotkey: a new note in the screen corner)
// The page itself becomes the small window: just a bar and the editor on a new note. It stays put while
// you work elsewhere. Put away (hotkey again / X): an empty memo is dropped and the app goes back to what
// it showed before. Opening the app meanwhile carries the memo on in the app window.
let quickOn = false, quickId = null, quickPrev = null, quickNag = 0, mainPh = '';
function emptyHtml(h) { return !/<(img|table|hr)\b/i.test(h || '') && !frag(h).textContent.trim(); }
function noteEmpty(id) {
  const n = noteById(id);
  return !!n && !n.title && emptyHtml(id === cur ? editor.innerHTML : bodies[id]);
}
function dropNote(id) {                           // silent: nothing was written in it
  if (missing.has(id) || unread.has(id)) return;
  if (cur === id) { clearTimeout(saveT); dirty = false; cur = null; }
  S.notes = S.notes.filter(n => n.id !== id);
  delete bodies[id]; H.delete(id); textCache.delete(id); memo.delete(id); sentNames.delete(id);
  host.send('delNote', id, 'purge');
  stateDirty = true; flushState();
}
function quickStart() {
  if (quickOn) { host.send('quick', '1'); return; }
  closeModal(); closePop();
  if (S.notes.length >= MAX_NOTES) { host.send('quick', 'full'); return; }
  quickPrev = { view, cur };
  quickOn = true;
  app.classList.add('quick');
  mainPh = editor.dataset.ph;
  editor.dataset.ph = '바로 입력하세요 · 자동으로 저장돼요';
  newNote(true);
  quickId = cur;
  const hk = st.quickHotkey && st.quickHotkey.label;   // 'Ctrl+Alt+M으로', 'F8로'
  $('#qbHint').textContent = '자동 저장 · Esc' + (hk ? ' 또는 ' + hk + (/([036MN]|Tab|Home|Pg(Up|Dn))$/i.test(hk) ? '으로' : '로') : '로') + ' 닫기';
  $('#qbOpen').title = '앱에서 이어서 쓰기' + (st.appHotkey ? ` (${st.appHotkey.label})` : '');
  $('#qbClose').title = '닫기 (Esc) · 내용은 자동으로 저장돼요';
  host.send('quick', '1');
}
// how: 'close' = put away, 'main' = keep writing in the app window
function quickEnd(how) {
  if (!quickOn) return;
  quickOn = false;
  app.classList.remove('quick');
  if (mainPh) editor.dataset.ph = mainPh;
  closeModal();
  const id = quickId, here = cur === id;
  if (here) flushNote();
  const empty = noteEmpty(id);
  if (!here) { if (empty) dropNote(id); renderSidebar(true); return; }      // already moved on to another note
  if (how === 'main' && !empty) { renderSidebar(true); renderHead(); posOvSoon(); refocus(); return; }
  if (empty) dropNote(id); else leaveNote();
  cur = null;
  const p = quickPrev;
  if (p && p.view === 'editor' && p.cur && noteById(p.cur)) openNote(p.cur); else goHome();
}
$('#qbClose').onclick = () => { quickEnd('close'); host.send('quick', '0'); };
$('#qbOpen').onclick = () => { quickEnd('main'); host.send('quick', 'main'); };

