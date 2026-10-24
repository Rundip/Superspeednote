// ---------------------------------------------------------------- view switching
const memo = new Map();        // per-note caret + scroll, restored when you come back
let lastSel = null;
const freshIds = new Set();    // new notes not written in yet: left empty, they go away like an empty quick memo
let freshPrevSel = null;       // the card selected before them, selected again then
function setView(v) { view = v; app.dataset.view = v; if (v !== 'board') app.classList.remove('selbar-on'); }
function openNote(id, o = {}) {
  const n = noteById(id);
  if (!n) return;
  closePop();
  if (!o.browse) app.classList.remove('sb-peek');   // (walking the list in a narrow window keeps its drawer open)
  if (!o.browse) boardUndo = null;                // looking at notes in the list keeps Ctrl+Z for the note just deleted
  const same = cur === id && view === 'editor';
  if (!same) {
    if (cur) leaveNote();
    clearNav(); clearObj();
    if (o.browse) getSelection().removeAllRanges();   // shown from the list: no caret in it (a table cell would take the keys)
    cur = id; selId = id;
    const blank = !bodies[id] || emptyHtml(bodies[id]);
    const doubt = HOST && !unread.has(id) && blank && (missing.has(id) || !!(n.preview || '').trim());   // no file came, or the list remembers text
    editor.contentEditable = unread.has(id) || doubt ? 'false' : 'true';
    if (unread.has(id)) setTimeout(() => toast('이 메모 파일을 읽지 못해서 지금은 고칠 수 없어요 · 앱을 다시 시작해 보세요'), 0);
    if (doubt) { rechecking.add(id); host.send('readNote', id); }
    editor.innerHTML = bodies[id] || '<div><br></div>';
    if (!editor.firstChild) editor.innerHTML = '<div><br></div>';
    relist();
    setBig((bodies[id] || '').length);
    histInit(id, isBig ? bodies[id] : null);   // big notes: reuse the string instead of serializing again
    titleIn.value = n.title || '';
    findClose(true);
    hideOv();
    lastSel = null;
  }
  setView('editor');
  renderHead(); renderSidebar(); stats(); setSave(false, true);
  S.lastOpen = id; saveStateSoon();
  host.send('active', id);
  if (o.focusTitle) { titleIn.focus(); titleIn.select(); return; }
  const m = memo.get(id) || n.at;
  if (o.browse) {                                  // the keys stay in the list; Enter / a click goes in where you left off
    if (!same) { lastSel = m && m.sel || null; scroller.scrollTop = m ? m.top : 0; }
    updateToolbar();
    return;
  }
  editor.focus({ preventScroll: true });
  if (!same) {
    if (m && m.sel) { selRestore(m.sel); scroller.scrollTop = m.top; }
    else { placeCaret(editor.firstChild || editor, false); scroller.scrollTop = 0; }
  } else if (lastSel) selRestore(lastSel);
  updateToolbar();
}
function leaveNote() {
  if (!cur) return;
  const n = noteById(cur);
  if (n && freshIds.has(cur) && noteEmpty(cur) && !n.hotkey && !n.pinned) { freshIds.delete(cur); dropNote(cur); selId = freshPrevSel; return; }
  histCommit();                    // normalizes text nodes so the caret path matches the saved html
  flushNote();
  memo.set(cur, keepAt());
}
// Where to come back to: the caret only (a restored selection would be replaced by the first key typed),
// also kept in the note's meta so it survives standby, Ctrl+Q and restarts.
function keepAt() {
  const s = selSave() || lastSel, n = noteById(cur);
  const at = { sel: s && { a: s.b, ao: s.bo, b: s.b, bo: s.bo }, top: Math.round(scroller.scrollTop) };
  if (n && JSON.stringify(n.at) !== JSON.stringify(at)) { n.at = at; saveStateSoon(); }
  return at;
}
function showBoard() {
  if (cur) leaveNote();
  cur = null;
  clearNav(); clearObj();
  closePop(); hideOv(); findClose(true);
  setView('board');
  $('#tbMid').textContent = '';
  renderBoard();
  host.send('active', '');
  boardSearch.focus({ preventScroll: true });
  if (boardSearch.value) { boardSearch.select(); qAuto = true; }   // back from a search: typing starts a new one
  const c = grid.querySelector('.card.sel');
  if (c) c.scrollIntoView({ block: 'nearest' });
}
// Home is the board (cards) or the list (notes on the left, the one you looked at last on the right)
function listHome() { return st.home === 'list'; }
function setHome(h) {
  if ((st.home || 'board') !== h) { st.home = h; saveStateSoon(); }
  app.classList.toggle('home-list', h === 'list');
  updateKeyHints();
  if (h === 'list') showList(); else showBoard();
}
function showList(id) {
  const n = noteById(id) || noteById(cur) || noteById(S.lastOpen) || noteById(selId) || ordered()[0];
  if (!n) { showBoard(); if (listHome()) toast('메모가 없어서 보드로 보여요 · 새 메모를 만들면 목록으로 볼 수 있어요'); return; }
  if (!narrow.matches && !st.sidebar) { st.sidebar = true; app.classList.remove('sb-off'); saveStateSoon(); }
  clearNav(); clearObj();
  if (n.id === cur && view === 'editor') {        // back from writing it: keep where the caret was, but take it out of
    const at = selSave();                         // the note, or a table cell would pull the keys back in
    if (at) lastSel = at;
    getSelection().removeAllRanges();
  }
  openNote(n.id, { browse: true });
  if (narrow.matches) app.classList.add('sb-peek');
  sbList.focus({ preventScroll: true });
  markSb();
}
function goHome() { if (listHome()) showList(); else showBoard(); }
function cycle(d) {
  const list = ordered();
  if (!list.length) return;
  const base = view === 'editor' ? cur : selId;
  const i = list.findIndex(n => n.id === base);
  const n = list[(i + d + list.length) % list.length];
  if (view === 'editor') openNote(n.id); else setSel(n.id);
}
function refocus() {
  if (modalOpen()) return;
  if (view === 'editor') { if (document.activeElement !== titleIn) { editor.focus({ preventScroll: true }); if (lastSel) selRestore(lastSel); } }
  else if (!isTyping(document.activeElement)) boardSearch.focus({ preventScroll: true });   // (a card being renamed keeps it)
}

