// ---------------------------------------------------------------- undo history (snapshots; we own it so table edits undo too)
// What one Ctrl+Z takes back, the way word processors do it:
//  - typing: a word with the space after it; a pause (1 s) also ends a step
//  - typing and deleting (Backspace / Delete) are separate steps; Enter starts a step with the line after it
//  - moving the caret (click, arrows) ends the step being typed, so two places never come back together
//  - every command (format, list, table, paste, picture ...) is its own step (edit() below)
// Undo puts the caret where the undone change began, redo where it ended.
const H = new Map();
let histT = 0, burstSel = null, composing = false;
let grpKind = '', grpWord = false, grpAt = null, grpAtKey = '';   // the step being typed: ins / del / para, has a word yet, caret after its last input
function histInit(id, html) { if (!H.has(id)) H.set(id, { st: [{ h: html || editor.innerHTML, s: null, u: null }], i: 0 }); }
function histSoon() { clearTimeout(histT); histT = setTimeout(histCommit, isBig ? 1500 : 1000); }
// Big notes (~80KB+ of HTML): the whole-note work done on typing pauses (undo snapshot, character count)
// runs less often. (content-visibility on every block was tried and made opening big notes far slower.)
let isBig = false;
function setBig(len) { isBig = len > 80000; editor.classList.toggle('big', isBig); }
function histCommit(keepNodes) {
  clearTimeout(histT); histT = 0;
  const hs = H.get(cur);
  if (!hs || composing) return;
  const typed = burstSel ? grpAt : null;          // a typed step: redo puts the caret where the typing ended
  grpKind = ''; grpWord = false; grpAt = null; grpAtKey = '';
  if (!keepNodes) editor.normalize();             // (not when an IME is about to compose: its text node stays as it is)
  const h = editor.innerHTML;
  const top = hs.st[hs.i];
  if (top.h === h) { burstSel = null; return; }
  if (burstSel) top.u = burstSel;
  burstSel = null;
  hs.st.length = hs.i + 1;
  hs.st.push({ h, s: typed || selSave(), u: null });
  hs.i = hs.st.length - 1;
  let size = 0;
  for (const e of hs.st) size += e.h.length;
  while (hs.st.length > 2 && (hs.st.length > 200 || size > 30e6)) { size -= hs.st.shift().h.length; hs.i--; }
}
// Ctrl+Z / Ctrl+Y in the middle of a Korean syllable: the IME is told to finish it first (blur / focus), so the
// syllable is recorded with the words before it and undone with them - not skipped (the step before undone instead)
// and not typed in again after the undo
function finishIme() {
  if (!composing) return;
  const at = selSave();
  editor.blur(); editor.focus({ preventScroll: true });
  if (at) selRestore(at);                         // the caret stays after the finished syllable
  composing = false;
}
function undo() {
  finishIme();
  histCommit();
  const hs = H.get(cur);
  if (!hs || hs.i <= 0) return;
  hs.i--;
  const e = hs.st[hs.i];
  applySnap(e.h, e.u || e.s);
}
function redo() {
  finishIme();
  histCommit();
  const hs = H.get(cur);
  if (!hs || hs.i >= hs.st.length - 1) return;
  hs.i++;
  const e = hs.st[hs.i];
  applySnap(e.h, e.s);
}
function applySnap(h, sel) {
  clearNav(); clearObj();
  editor.innerHTML = h;
  setBig(h.length);
  if (!editor.firstChild) editor.innerHTML = '<div><br></div>';
  relist();
  editor.focus({ preventScroll: true });
  if (sel) selRestore(sel); else placeCaret(editor.lastChild, true);
  // the "type here" hint goes (or comes back) with the undone text at once, not with the delayed character count
  editor.classList.toggle('is-empty', !editor.textContent && !editor.querySelector('img,table,hr,li'));
  markDirty(); statsSoon(); posOvSoon(); updateToolbar();
  if (findOpen) findSoon();
}
// A toast's 되돌리기 undoes the step it is about - only while nothing else was done since (in this note).
// Ctrl+Z would take back whatever came last; the button refuses instead of undoing something else.
// pending: the step is still being typed (a cell started over), so it is the next one recorded.
function undoThis(pending) {
  const id = cur, h0 = H.get(cur), at = h0 ? h0.i + (pending ? 1 : 0) : -1;
  return () => {
    if (id === cur && view === 'editor') histCommit();
    const hs = H.get(id);
    if (id !== cur || view !== 'editor' || !hs || hs.i !== at) { toast('그 뒤에 다른 편집이 있어서 되돌리지 않았어요 · 메모에서 Ctrl+Z로 하나씩 되돌릴 수 있어요'); return; }
    undo();
  };
}
// run a structural/formatting change as exactly one undo step
function edit(fn) {
  histCommit();
  const hs = H.get(cur);
  if (hs) hs.st[hs.i].u = selSave();
  try { fn(); } finally {
    caretBeforeBr();
    relist();
    histCommit();
    if (editor.classList.contains('is-empty')) stats(); else statsSoon();
    markDirty(); posOvSoon();
    if (findOpen) findSoon();
  }
}
function exec(cmd, val = null) { return document.execCommand(cmd, false, val); }

