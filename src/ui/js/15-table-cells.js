// ---------------------------------------------------------------- table cells work like Excel
// "nav": one cell (or a range) is selected - arrows move it, typing replaces the value, Delete clears,
// F2 / double-click edit it with the caret at the end, Esc while editing restores the old value.
let nav = null;                                   // { t, ar, ac, fr, fc }  anchor / focus row + column
let editCell = null, editKind = '', editOrig = '';
let editMark = null;                              // { id, i }: the undo step a cell edit began after (Esc drops what it added)
function markEdit() { const hs = H.get(cur); editMark = hs ? { id: cur, i: hs.i } : null; }
let tabFrom = -1;                                 // column a run of Tabs started in (Enter no longer goes back to it)
// the status bar says what a key will do in a table (written only when the mode changes)
let hintMode = '', defaultHint = '', tipAfterIme = false;
function tblHint(m) {
  if (m === hintMode) return;
  hintMode = m;
  const h = $('#stHint');
  h.classList.toggle('tbl', !!m);
  h.textContent = m === 'nav' ? '칸 선택 · 입력하면 새로 씀 · F2 이어 쓰기 · Delete 지우기 · Ctrl+Enter 표 밖으로'
    : m === 'edit' ? '칸 편집 중 · 방향키는 칸 안에서 · Enter 확정 · Esc 칸 선택으로 · Shift+Enter 줄바꿈'
    : m === 'obj' ? '표 선택됨 · Ctrl+C 복사 · Delete 삭제 · Esc 해제' : defaultHint;
}
let parked = null, mouseSel = false, parkAfterMouse = false, dragFrom = null;   // dragFrom: the cell a mouse drag began in
const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
function cellAt(t, r, c) { const tr = t.rows[r]; return tr ? tr.cells[Math.min(c, tr.cells.length - 1)] || null : null; }
function navRect() { return { t: nav.t, r0: Math.min(nav.ar, nav.fr), r1: Math.max(nav.ar, nav.fr), c0: Math.min(nav.ac, nav.fc), c1: Math.max(nav.ac, nav.fc) }; }
function navLive() { if (nav && !nav.t.isConnected) clearNav(); return !!nav && !editCell; }
function rectCells(rc) { const out = []; for (let i = rc.r0; i <= rc.r1; i++) for (let j = rc.c0; j <= rc.c1; j++) { const c = rc.t.rows[i] && rc.t.rows[i].cells[j]; if (c) out.push(c); } return out; }
function clearNav() { nav = null; editCell = null; tabFrom = -1; parked = null; editor.classList.remove('cellnav'); posOvSoon(); if (hintMode !== 'obj') tblHint(''); }
function endPoint(td) {                           // just after the last character of a cell
  const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
  let n, last = null;
  while ((n = w.nextNode())) if (n.nodeValue.length) last = n;
  return last ? [last, last.nodeValue.length] : [td, 0];
}
function parkCaret(td) {
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  const [n, o] = endPoint(td);
  const r = document.createRange(); r.setStart(n, o); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
// A selected cell keeps its whole text selected (unseen, see .cellnav ::selection). Typing then replaces it, and the
// Korean IME composes its first syllable straight over it: touching the DOM or the selection on that first key
// (keyCode 229) makes the IME commit the lone jamo, so "ㅎㅏㄴ" came out as "ㅎ안".
function parkNav(td) {
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  const r = document.createRange();
  if (td.textContent || td.querySelector('img')) r.selectNodeContents(td);
  else { const [n, o] = endPoint(td); r.setStart(n, o); r.collapse(true); }
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  const g = s.rangeCount ? s.getRangeAt(0) : r;    // as Chrome normalized it
  parked = { sc: g.startContainer, so: g.startOffset, ec: g.endContainer, eo: g.endOffset };
}
function isParked(r) { return !!parked && r.startContainer === parked.sc && r.startOffset === parked.so && r.endContainer === parked.ec && r.endOffset === parked.eo; }
function setNav(t, r, c, extend) {
  r = clamp(r, 0, t.rows.length - 1); c = clamp(c, 0, Math.max(0, tableCols(t) - 1));
  if (extend && nav && nav.t === t) { nav.fr = r; nav.fc = c; } else nav = { t, ar: r, ac: c, fr: r, fc: c };
  editCell = null; tabFrom = -1;
  editor.classList.add('cellnav');
  const td = cellAt(t, r, c);
  if (td) { parkNav(td); td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  showOv(t); posOv(); updateToolbar(); tblHint('nav');
}
// Esc on a cell edit: the steps recorded while typing in it are dropped too, so the next Ctrl+Z takes back what was
// done before the edit - not the cancelled text (it used to come back)
function dropEditSteps() {
  const hs = H.get(cur), m = editMark;
  editMark = null;
  clearTimeout(histT); histT = 0; burstSel = null;
  if (hs && m && m.id === cur && hs.i > m.i && m.i >= 0) { hs.st.length = m.i + 1; hs.i = m.i; }
  histCommit();                                   // a change made before the edit and not yet recorded: its own step
}
function startEdit(kind, td, keepCaret) {
  td = td || (nav && cellAt(nav.t, nav.fr, nav.fc));
  if (!td) return;
  const r = td.parentElement.rowIndex, c = td.cellIndex;
  nav = { t: td.closest('table'), ar: r, ac: c, fr: r, fc: c };
  if (editCell !== td) markEdit();
  editCell = td; editKind = kind; editOrig = td.innerHTML;
  editor.classList.remove('cellnav');
  if (!keepCaret) parkCaret(td);
  showOv(nav.t); posOv(); tblHint('edit');
}
function beginReplace() {                         // a key typed on a selected cell starts it over, like Excel
  const td = cellAt(nav.t, nav.fr, nav.fc);
  if (!td) return;
  histCommit();
  const hs = H.get(cur);
  if (hs) hs.st[hs.i].u = selSave();
  const orig = td.innerHTML;
  markEdit();
  td.innerHTML = '<br>';
  startEdit('type', td);
  editOrig = orig;
  markDirty();
  if (frag(orig).textContent.trim()) tipReplace();
}
function tipReplace() {                           // once: why the cell's text went away
  if (st.tipReplace) return;
  st.tipReplace = 1; saveStateSoon();
  const back = undoThis(true);
  setTimeout(() => toast('선택한 칸에 입력하면 내용이 새로 바뀌어요 · 이어 쓰려면 F2나 더블클릭', '되돌리기', back), 0);
}
// the IME's first key on a selected cell: no DOM or selection change here (see parkNav) - the composition replaces
// the parked selection by itself; we only switch the cell to editing
function imeReplace() {
  const r = selRange(), td = (r && cellOf(r.startContainer)) || cellAt(nav.t, nav.fr, nav.fc);
  if (!td) return;
  const row = td.parentElement.rowIndex, col = td.cellIndex;
  markEdit();
  editCell = td; editKind = 'type'; editOrig = td.innerHTML;
  nav = { t: td.closest('table'), ar: row, ac: col, fr: row, fc: col };
  requestAnimationFrame(() => { if (editCell === td) { editor.classList.remove('cellnav'); tblHint('edit'); } });   // not even a class change on this key
  if (td.textContent.trim() && !st.tipReplace) tipAfterIme = true;   // the tip waits for the syllable to finish
  posOvSoon();
}
function leaveTable(t, up) {
  clearNav();
  let n = up ? t.previousElementSibling : t.nextElementSibling;
  if (!n || /^(TABLE|HR)$/.test(n.nodeName)) edit(() => { n = document.createElement('div'); n.innerHTML = '<br>'; if (up) t.before(n); else t.after(n); });
  placeCaret(n, up);
}
function moveNav(dr, dc, extend, jump) {
  const t = nav.t, R = t.rows.length, C = tableCols(t);
  let r = nav.fr + dr, c = nav.fc + dc;
  if (jump) { if (dr) r = dr < 0 ? 0 : R - 1; if (dc) c = dc < 0 ? 0 : C - 1; }
  setNav(t, r, c, extend);
}
function navDown(t) {                             // Enter: the cell right below (also after Tabs); on the last row a new row
  const r = nav.fr, c = nav.fc;
  if (r < t.rows.length - 1) { setNav(t, r + 1, c); return; }
  edit(() => addRow(t, t.rows.length));
  setNav(t, t.rows.length - 1, c);
}
function navTab(t, back) {
  const C = tableCols(t), from = tabFrom >= 0 ? tabFrom : nav.fc;
  let r = nav.fr, c = nav.fc + (back ? -1 : 1);
  if (c >= C) edit(() => addCol(t, C));           // Tab on the last column adds a column
  if (c < 0) { c = C - 1; r--; }
  if (r < 0) { setNav(t, 0, 0); return; }
  const sameRow = r === nav.fr;
  setNav(t, r, c);
  if (sameRow) tabFrom = from;                    // Shift+Tab within the run keeps where it began
}
function navKey(e) {
  const t = nav.t, mod = e.ctrlKey || e.metaKey, k = e.key;
  if (ARROWS[k] && !e.altKey) {
    e.preventDefault();
    const [dr, dc] = ARROWS[k];
    if (!e.shiftKey && !mod && ((dr < 0 && nav.fr === 0) || (dr > 0 && nav.fr === t.rows.length - 1))) leaveTable(t, dr < 0);
    else moveNav(dr, dc, e.shiftKey, mod);
    return true;
  }
  if (k === 'Enter' && e.altKey && !mod) { e.preventDefault(); startEdit('f2'); edit(() => exec('insertLineBreak')); return true; }
  if (e.altKey) return false;
  if (k === 'Tab' && !mod) { e.preventDefault(); navTab(t, e.shiftKey); return true; }
  if (k === 'Enter' && !mod) { e.preventDefault(); if (e.shiftKey) moveNav(-1, 0); else navDown(t); return true; }
  if (k === 'F2') { e.preventDefault(); startEdit('f2'); return true; }
  if (k === 'Delete' && !mod) { e.preventDefault(); const rc = navRect(); edit(() => { for (const c of rectCells(rc)) c.innerHTML = '<br>'; }); setNav(t, nav.fr, nav.fc); return true; }
  if (k === 'Backspace' && !mod) { e.preventDefault(); beginReplace(); return true; }
  if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); leaveTable(t, false); return true; }
  if (k === 'Home') { e.preventDefault(); setNav(t, mod ? 0 : nav.fr, 0, e.shiftKey); return true; }
  if (k === 'End') { e.preventDefault(); setNav(t, mod ? t.rows.length - 1 : nav.fr, tableCols(t) - 1, e.shiftKey); return true; }
  if (mod && e.code === 'KeyA' && !e.shiftKey) {  // first Ctrl+A: the whole table, second: the whole note
    const rc = navRect();
    if (rc.r0 || rc.c0 || rc.r1 < t.rows.length - 1 || rc.c1 < tableCols(t) - 1) {
      e.preventDefault(); nav.ar = 0; nav.ac = 0; nav.fr = t.rows.length - 1; nav.fc = tableCols(t) - 1; parkNav(cellAt(t, nav.fr, nav.fc)); posOv(); return true;
    }
    clearNav(); return false;
  }
  if (mod) return false;
  if (e.keyCode === 229 || k === 'Process') imeReplace();     // IME: composes over the parked text by itself
  else if (k.length === 1) beginReplace();                    // the key itself is then typed into the emptied cell
  return false;
}
function editKey(e) {
  const td = editCell;
  if (!td.isConnected) { clearNav(); return false; }
  const t = td.closest('table'), r = td.parentElement.rowIndex, c = td.cellIndex;
  const back = () => { histCommit(); nav = { t, ar: r, ac: c, fr: r, fc: c }; editCell = null; };
  if (e.key === 'Escape') {                      // back to selecting the cell (what was typed stays; Ctrl+Z takes it back)
    e.preventDefault(); e.stopPropagation();
    histCommit();
    setNav(t, r, c);
    return true;
  }
  if (e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); edit(() => exec('insertLineBreak')); return true; }   // Excel's in-cell line break
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); back(); navDown(t); return true; }
  if (e.key === 'Tab') { e.preventDefault(); back(); navTab(t, e.shiftKey); return true; }
  if (ARROWS[e.key] && !e.shiftKey) {
    // Editing a cell (caret in it): the arrows move in its text - ↑ / ↓ to the line above / below, ← / → by a
    // letter - and never out of the cell; at its first / last line or its edges the caret goes to its start / end.
    // Esc goes back to selecting the cell, where the arrows move between cells.
    e.preventDefault();
    const s = getSelection(), up = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    if (!s.isCollapsed) s.collapse(up ? s.anchorNode : s.focusNode, up ? s.anchorOffset : s.focusOffset);   // a selection: to its side
    else s.modify('move', up ? 'backward' : 'forward', e.key === 'ArrowUp' || e.key === 'ArrowDown' ? 'line' : 'character');
    if (!s.focusNode || !td.contains(s.focusNode) || s.focusNode === td.parentNode) {
      if (up) placeCaret(td, false);
      else { const [n, o] = endPoint(td), rr = document.createRange(); rr.setStart(n, o); rr.collapse(true); s.removeAllRanges(); s.addRange(rr); }
    }
    return true;
  }
  return false;
}
// the caret landing in a cell (click, arrow from outside, Tab, paste ...) selects that cell
function syncNav() {
  const r = selRange();
  if (!r || objSel) return;                       // focus is in the title / find box (or a picture is selected): keep the state
  const a = cellOf(r.startContainer), b = cellOf(r.endContainer);
  if (!a && !b) { if (nav || editCell) clearNav(); return; }
  if (a !== b) return;                            // dragging across cells: decided on mouseup
  if (editCell === a) return;
  const t = a.closest('table'), ri = a.parentElement.rowIndex, ci = a.cellIndex;
  if (nav && !editCell && nav.t === t && nav.fr === ri && nav.fc === ci) {   // the selected cell itself
    tblHint('nav');
    if (isParked(r)) return;                      // our own parked selection
    if (!r.collapsed) startEdit('f2', a, true);   // text selected in it (double-click) = editing it
    else if (mouseSel) parkAfterMouse = true; else parkNav(a);   // a stray caret (right-click ...): park again
    return;
  }
  // text selected inside one cell = editing it - unless it is the whole cell coming back (undo, reopening the note)
  if (!r.collapsed && (mouseSel || !a.textContent || r.toString() !== a.textContent)) { startEdit('f2', a, true); return; }
  nav = { t, ar: ri, ac: ci, fr: ri, fc: ci };
  editCell = null; tabFrom = -1;
  editor.classList.add('cellnav');
  if (mouseSel) parkAfterMouse = true; else parkNav(a);    // a click: park once the button is up (not mid-drag)
  showOv(t); posOv(); tblHint('nav');
}
// formatting a selected cell / range applies to the whole cells (Excel-style); false if not in cell mode
function onCells(fn, after) {
  if (!navLive()) return false;
  const keep = Object.assign({}, nav), cells = rectCells(navRect());
  edit(() => {
    const s = getSelection();
    cells.forEach((c, i) => { const r = document.createRange(); r.selectNodeContents(c); s.removeAllRanges(); s.addRange(r); fn(c, i); });
    if (after) after();
  });
  nav = keep;
  editor.classList.add('cellnav');
  const f = cellAt(nav.t, nav.fr, nav.fc);
  if (f) parkNav(f);
  posOv(); updateToolbar();
  return true;
}
// Clicking several times in a cell, one rule whether it was being edited or only selected:
//   2 clicks = the word (어절: up to the spaces / line breaks around it), 3 = the line (up to the line breaks - a long
//   line that only wraps is one line), 4 = everything in the cell. The cell opens for editing on the 2nd click.
// The app picks the range itself (the browser's own double / triple click is stopped, so nothing flashes) and sets it
// when the button comes up.
function cellModel(td) {                          // the cell as text (a line break = '\n') and where each letter is
  const s = [], pts = [];
  const at = c => [c.parentNode, Array.prototype.indexOf.call(c.parentNode.childNodes, c)];
  const walk = n => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { for (let i = 0; i < c.nodeValue.length; i++) { s.push(c.nodeValue[i]); pts.push([c, i]); } }
      else if (c.nodeName === 'BR') { s.push('\n'); pts.push(at(c)); }
      else if (c.nodeType === 1) {
        if (/^(DIV|P|LI|UL|OL)$/.test(c.nodeName) && s.length && s[s.length - 1] !== '\n') { s.push('\n'); pts.push(at(c)); }
        walk(c);
      }
    }
  };
  walk(td);
  pts.push(endPoint(td));
  return { s: s.join(''), pts };
}
function selectInCell(td, x, y, clicks) {
  const m = cellModel(td), s = m.s, len = s.length, sel = getSelection();
  const body = s.replace(/\n+$/, '').length;      // not the cell's closing line break
  if (!s.trim()) { parkCaret(td); return; }
  let p = body;
  const cr = document.caretRangeFromPoint(x, y);
  if (cr && td.contains(cr.startContainer)) {
    const here = document.createRange(); here.setStart(cr.startContainer, cr.startOffset);
    p = len;
    for (let i = 0; i <= len; i++) { try { if (here.comparePoint(m.pts[i][0], m.pts[i][1]) >= 0) { p = i; break; } } catch (e) { /* elsewhere */ } }
  }
  let a, b;
  if (clicks >= 4) { a = 0; b = body; }
  else if (clicks === 3) {
    a = s.lastIndexOf('\n', p - 1) + 1;
    b = s.indexOf('\n', p); if (b < 0) b = body;
    if (p >= body) { b = body; a = s.lastIndexOf('\n', b - 1) + 1; }   // clicked after the last line: that line
  } else {
    const sp = c => /\s/.test(c || ' ');
    // the letter the click is on (the caret lands before or after it): a word only when that is a letter of one.
    // A click on a space or in the blank past the end of a line puts the caret there - the word before it used to
    // get selected.
    const box = i => { if (i < 0 || i >= len || s[i] === '\n') return null; const lr = document.createRange(); lr.setStart(m.pts[i][0], m.pts[i][1]); lr.setEnd(m.pts[i + 1][0], m.pts[i + 1][1]); return lr.getBoundingClientRect(); };
    const hits = slack => [p, p - 1].find(i => { const bx = box(i); return bx && bx.width && x >= bx.left - slack && x < bx.right + slack && y >= bx.top - 1 && y <= bx.bottom + 1; });
    const on = hits(0) !== undefined ? hits(0) : hits(0.5);   // the letter that really holds the point first
    if (on === undefined || sp(s[on])) { const r = document.createRange(); r.setStart(m.pts[Math.min(p, len)][0], m.pts[Math.min(p, len)][1]); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); return; }
    p = on;
    a = p; while (a > 0 && !sp(s[a - 1])) a--;
    b = p; while (b < len && !sp(s[b])) b++;
  }
  const r = document.createRange();
  r.setStart(m.pts[a][0], m.pts[a][1]);
  r.setEnd(m.pts[Math.min(b, len)][0], m.pts[Math.min(b, len)][1]);
  sel.removeAllRanges(); sel.addRange(r);
}
let cellClicks = null;                            // the multi-click waiting for the button to come up
// A cell that was only selected has its whole text selected, unseen (see parkNav). On the press that selection
// becomes a caret, before the cell opens for editing - opening it first showed it, the whole cell flashing blue until
// the button came up. Its letters are then drawn once unselected before the new range comes: going straight from it
// to a word, Chrome kept the letters around the word drawn as selected ones (they looked bold).
editor.addEventListener('mousedown', e => {
  if (e.button !== 0 || e.detail < 2 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const td = e.target.closest && e.target.closest('td');
  if (!td || !editor.contains(td)) return;
  e.preventDefault();                             // no double / triple click of the browser's own
  const fresh = td !== editCell;
  if (fresh) {                                    // the hidden whole-cell selection becomes a caret where you clicked
    const cr = document.caretRangeFromPoint(e.clientX, e.clientY), s = getSelection();
    if (cr && td.contains(cr.startContainer)) { s.removeAllRanges(); s.addRange(cr); } else parkCaret(td);
    parked = null;
    startEdit('f2', td, true);
  }
  cellClicks = { td, x: e.clientX, y: e.clientY, n: e.detail, fresh };
});
document.addEventListener('mouseup', () => {
  const c = cellClicks;
  cellClicks = null;
  if (!c || !c.td.isConnected || c.td !== editCell) return;
  if (!c.fresh) { selectInCell(c.td, c.x, c.y, c.n); return; }   // already editing: word -> line -> cell at once
  let done = false;                               // after two frames - or 0.1 s, when the window isn't drawn (behind others)
  const go = () => { if (done) return; done = true; if (c.td === editCell && c.td.isConnected) selectInCell(c.td, c.x, c.y, c.n); };
  requestAnimationFrame(() => requestAnimationFrame(go));
  setTimeout(go, 100);
}, true);
document.addEventListener('mouseup', e => {
  const park = parkAfterMouse, from = dragFrom;
  mouseSel = parkAfterMouse = false; dragFrom = null;
  if (view !== 'editor') return;
  // a drag from one cell to another is exactly that range - wherever in the cells it began and ended
  const at = from && document.elementFromPoint(e.clientX, e.clientY), to = at && at.closest && at.closest('td');
  if (to && to !== from && editor.contains(to) && from.isConnected && to.closest('table') === from.closest('table')) {
    const t = to.closest('table');
    nav = { t, ar: from.parentElement.rowIndex, ac: from.cellIndex, fr: to.parentElement.rowIndex, fc: to.cellIndex };
    editCell = null; tabFrom = -1;
    editor.classList.add('cellnav');
    parkNav(to); showOv(t); posOv(); updateToolbar(); tblHint('nav');
    return;
  }
  if (editCell) return;
  const rc = domCellRect();                       // a mouse drag across cells becomes a cell range
  if (!rc) { const f = park && navLive() && cellAt(nav.t, nav.fr, nav.fc); if (f) parkNav(f); return; }
  const s = getSelection(), fa = cellOf(s.anchorNode), ff = cellOf(s.focusNode);
  const inRect = c => c && c.closest('table') === rc.t;
  const a = inRect(fa) ? [fa.parentElement.rowIndex, fa.cellIndex] : [rc.r0, rc.c0];
  const f = inRect(ff) ? [ff.parentElement.rowIndex, ff.cellIndex] : [rc.r1, rc.c1];
  nav = { t: rc.t, ar: clamp(a[0], rc.r0, rc.r1), ac: clamp(a[1], rc.c0, rc.c1), fr: clamp(f[0], rc.r0, rc.r1), fc: clamp(f[1], rc.c0, rc.c1) };
  editCell = null; tabFrom = -1;
  editor.classList.add('cellnav');
  parkNav(cellAt(nav.t, nav.fr, nav.fc));
  showOv(rc.t); posOv();
});

