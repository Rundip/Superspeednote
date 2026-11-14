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
  quickPrev = { view, cur, sel: selId, last: S.lastOpen, query, search: boardSearch.value, top: (view === 'board' ? $('#board') : scroller).scrollTop, w: innerWidth, h: innerHeight,
    list: view === 'editor' && document.activeElement === sbList, peek: app.classList.contains('sb-peek') };   // list: the keys were walking the memo list
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
  const p = quickPrev;
  if (empty) {                                    // as if it never opened: what opening it changed goes back
    selId = noteById(p.sel) ? p.sel : freshPrevSel;   // (the note open then: a new one left empty, gone by now)
    S.lastOpen = p.last;
    query = p.query; boardSearch.value = p.search;
    dropNote(id);
  } else leaveNote();
  cur = null;
  if (p.view === 'editor' && p.cur && noteById(p.cur)) {
    if (p.list) {                                 // back to walking the list: the note only shown, the keys in the list
      openNote(p.cur, { stay: true, browse: true });
      if (p.peek) app.classList.add('sb-peek');
      sbList.focus({ preventScroll: true });
    } else openNote(p.cur, { stay: true });
  } else goHome();
  const same = view === p.view && cur === p.cur;
  if (same && (empty || view === 'editor')) quickBack(p);
  else if (view === 'board') quickBack(p, true);  // the written memo's card picked, or the board instead of a note gone by now
}
// Where the board / the note was scrolled. At the memo's size the cards and lines lie elsewhere, so once more when the
// page is back at the app window's size (the resize comes before that size is drawn, under the window's picture).
// card: the picked card is brought into view too, the board moving no more than that takes
function quickBack(p, card) {
  const el = view === 'board' ? $('#board') : scroller, v = view, c = cur;
  const back = () => {
    if (view !== v || cur !== c) return;           // moved on meanwhile
    if (v === p.view) el.scrollTop = p.top;
    const s = card && grid.querySelector('.card.sel');
    if (s) s.scrollIntoView({ block: 'nearest' });
  };
  back();
  if (innerWidth !== p.w || innerHeight !== p.h) addEventListener('resize', back, { once: true });
}
// Writing at the bottom of the memo window: the line you write in stays about three lines above its bottom edge,
// so you never have to press Enter a few times to see where you are writing
function quickCaretRoom() {
  if (!quickOn || view !== 'editor') return;
  const r = selRange();
  if (!r || !editor.contains(r.endContainer)) return;
  let b = r.getBoundingClientRect();
  if (!b.height) { const blk = blockOf(r.endContainer); b = blk && blk !== editor ? blk.getBoundingClientRect() : null; }   // an empty line
  if (!b || !b.height) return;
  const box = scroller.getBoundingClientRect(), room = Math.min(90, box.height * 0.25);
  const over = b.bottom - (box.bottom - room);
  if (over > 0) scroller.scrollTop += Math.ceil(over);
}
editor.addEventListener('input', () => { if (quickOn) requestAnimationFrame(quickCaretRoom); });
$('#qbClose').onclick = () => { quickEnd('close'); host.send('quick', '0'); };
$('#qbOpen').onclick = () => { quickEnd('main'); host.send('quick', 'main'); };

