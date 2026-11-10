// ---------------------------------------------------------------- tables
function cellHTML(text) { return text ? esc(text).replace(/\n/g, '<br>') : '<br>'; }
function buildTable(rows, header) {
  const w = Math.max(1, ...rows.map(r => r.length));
  const t = document.createElement('table');
  t.className = header ? 't hdr' : 't';
  const tb = t.createTBody();
  for (const r of rows) {
    const tr = tb.insertRow();
    for (let i = 0; i < w; i++) tr.insertCell().innerHTML = cellHTML(r[i] || '');
  }
  return t;
}
function tableCols(t) { let m = 0; for (const r of t.rows) m = Math.max(m, r.cells.length); return m; }
function newCell(tr, at) { const td = tr.insertCell(at); td.innerHTML = '<br>'; return td; }
function addRow(t, at) {
  const cols = tableCols(t) || 1;
  at = clamp(at, 0, t.rows.length);
  // a new row looks like the row it is added under (or over, at the top) - its alignment and number commas, like
  // Excel - never like the header row
  const hdr = t.classList.contains('hdr'), ok = i => i >= 0 && i < t.rows.length && !(hdr && i === 0);
  const like = ok(at - 1) ? t.rows[at - 1] : ok(at) ? t.rows[at] : null;
  const tr = t.insertRow(at);
  for (let i = 0; i < cols; i++) { const td = newCell(tr, -1), s = like && like.cells[i]; if (s) for (const c of lookOf(s)) td.classList.add(c); }
  return tr;
}
// ---- how a cell shows its value (kept on the cell as classes, Excel-style): al-c / al-r centred / right-aligned
// (left is the default), num = numbers with thousands commas (1,460,000). The commas are in the text itself, so a
// copy, the search and the find & paste window get what you see; a number typed into such a cell later gets them
// when you leave it.
const LOOK = /^(al-c|al-r|num)$/;
function lookOf(td) { return Array.from(td.classList).filter(c => LOOK.test(c)); }
// a number as one line of a cell, with or without its commas: '1460000', '-2,500.5', '₩1200', '30000원', '15%'.
// Not 010-1234-5678, 2026.11.10 or 0123 (codes, dates: they keep their digits as written).
const NUM_LINE = /^([\s​]*[₩$\\]?[\s​]*[-+]?)(\d{1,3}(?:,\d{3})+|\d+)((?:\.\d+)?[\s​]*[가-힣A-Za-z%]{0,4}[\s​]*)$/;
function numFmt(s, on) {
  const m = NUM_LINE.exec(s);
  if (!m) return s;
  const d = m[2].replace(/,/g, '');
  if (d.length > 1 && d[0] === '0') return s;
  return m[1] + (on ? d.replace(/\B(?=(\d{3})+$)/g, ',') : d) + m[3];
}
function numText(td, on) {                        // every line of the cell that is a number; true if any changed
  let changed = false;
  const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!/\d/.test(n.nodeValue)) continue;
    const v = numFmt(n.nodeValue, on);
    if (v !== n.nodeValue) { n.nodeValue = v; changed = true; }
  }
  return changed;
}
// a value written into a comma cell (typed and left, pasted) gets its commas
function numLeave(td) { return !!td && td.isConnected && !composing && td.classList.contains('num') && numText(td, true); }
// left some other way (a click elsewhere, Ctrl+Enter ...): caught on the next caret move
let numEditing = null;
function numWatch() {
  const c = numEditing;
  if (c && c !== editCell) { numEditing = null; if (numLeave(c)) { markDirty(); histCommit(); } }
  if (editCell && editCell.classList.contains('num')) numEditing = editCell;
}
// the cells a table command works on: the selected ones, else the one being written in (or holding the caret)
function tblCells() {
  if (navLive()) return rectCells(navRect());
  const td = editCell && editCell.isConnected ? editCell : closestSel('td');
  return td ? [td] : [];
}
function cellsLook(fn, text) {                    // text: fn changes the cells' text (the caret goes back to its end)
  const cells = tblCells();
  if (!cells.length) { toast('표 칸에서 쓰는 기능이에요'); return false; }
  finishIme();
  const keep = navLive() ? Object.assign({}, nav) : null, ec = editCell, kind = editKind;
  edit(() => cells.forEach(fn));
  if (keep && keep.t.isConnected) { nav = keep; editCell = null; editor.classList.add('cellnav'); const f = cellAt(nav.t, nav.fr, nav.fc); if (f) parkNav(f); }
  else if (ec && ec.isConnected) { editCell = ec; editKind = kind; if (text) parkCaret(ec); }
  posOv(); updateToolbar();
  return true;
}
function cellAlign(a) {                          // 'l' / 'c' / 'r'
  cellsLook(td => { td.classList.remove('al-c', 'al-r'); if (a !== 'l') td.classList.add('al-' + a); });
}
function cellNum() {                             // on for all the cells (right-aligned), or off if they all had it
  const cells = tblCells(), on = !cells.length || !cells.every(c => c.classList.contains('num'));
  if (!cellsLook(td => { td.classList.toggle('num', on); numText(td, on); td.classList.remove('al-c', 'al-r'); if (on) td.classList.add('al-r'); }, true)) return;
  toast(on ? '천 단위 쉼표를 넣었어요 · 이 칸에 새로 쓰는 숫자에도 찍혀요' : '천 단위 쉼표를 뺐어요', '되돌리기', undoThis());
}
function addCol(t, at) { for (const tr of t.rows) newCell(tr, Math.min(at, tr.cells.length)); }
function removeTable(t) {
  const next = t.nextElementSibling || t.previousElementSibling;
  t.remove();
  if (!editor.firstChild) editor.innerHTML = '<div><br></div>';
  placeCaret(next && editor.contains(next) ? next : editor.firstChild, false);
  hideOv();
}
function insertTable(rows, cols) {
  ensureEditorFocus();
  clearObj();
  edit(() => {
    const t = buildTable(Array.from({ length: rows }, () => Array(cols).fill('')), true);
    placeBlock(t);
    placeCaret(t.rows[0].cells[0], false);
  });
  showOv(closestSel('table'));
}
// insert a block element at the caret: replaces an empty line, otherwise splits the line
function placeBlock(el) {
  const r = selRange();
  if (!r) { editor.appendChild(el); afterBlock(el); return; }
  const sc = r.startContainer;
  const inTable = (sc.nodeType === 1 ? sc : sc.parentNode).closest('table');
  if (!r.collapsed && !inTable) r.deleteContents();   // a selected cell keeps its value (its text is only parked)
  clearNav();
  const block = /^(TABLE|HR)$/;
  if (sc === editor) { editor.insertBefore(el, editor.childNodes[r.startOffset] || null); afterBlock(el); return; }
  const top = topLevel(inTable || sc);
  if (!top) { editor.appendChild(el); afterBlock(el); return; }
  if (inTable || block.test(top.nodeName)) {      // after a table / divider: an empty line between, never glued
    const gap = document.createElement('div'); gap.innerHTML = '<br>';
    top.after(gap); gap.after(el); afterBlock(el); return;
  }
  const empty = n => !n.textContent.trim() && !(n.querySelector && n.querySelector('img,table,hr'));
  if (top.nodeType === 1 && empty(top)) {
    const prev = top.previousElementSibling;      // the empty line under a table stays, as the gap between the two
    if (prev && block.test(prev.nodeName) && block.test(el.nodeName)) { top.after(el); afterBlock(el); return; }
    top.replaceWith(el); afterBlock(el); return;
  }
  const before = document.createRange(); before.setStart(top, 0); before.setEnd(sc, r.startOffset);
  const after = document.createRange(); after.setStart(sc, r.startOffset); after.setEnd(top, top.nodeType === 3 ? top.nodeValue.length : top.childNodes.length);
  if (!after.toString().trim()) { top.after(el); afterBlock(el); return; }
  if (!before.toString().trim()) { top.before(el); return; }
  const tail = after.extractContents();
  const nb = document.createElement(top.nodeType === 1 && /^(DIV|P|H[1-6]|BLOCKQUOTE|PRE|UL|OL)$/.test(top.nodeName) ? top.nodeName : 'DIV');
  nb.appendChild(tail);
  top.after(nb);
  top.after(el);
}
function afterBlock(el) {
  const n = el.nextSibling;
  if (!n || (n.nodeType === 1 && /^(TABLE|HR)$/.test(n.nodeName))) { const d = document.createElement('div'); d.innerHTML = '<br>'; el.after(d); }
}
function exitTable(t) {
  let n = t.nextElementSibling;
  if (!n || /^(TABLE|HR)$/.test(n.nodeName)) edit(() => { n = document.createElement('div'); n.innerHTML = '<br>'; t.after(n); });
  placeCaret(n, false);
}
function onTableKey(e, td) {
  const t = td.closest('table');
  if (e.key === 'Enter' && !e.shiftKey) {            // Shift+Enter = line break inside the cell
    e.preventDefault();
    const ri = td.parentElement.rowIndex;
    if (ri < t.rows.length - 1) {                     // not the last row: move to the cell below, like Excel
      const next = t.rows[ri + 1];
      placeCaret(next.cells[Math.min(td.cellIndex, next.cells.length - 1)], true);
    } else {                                          // last row: add a new row
      edit(() => { const tr = addRow(t, ri + 1); placeCaret(tr.cells[Math.min(td.cellIndex, tr.cells.length - 1)], false); });
    }
    return true;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const tr = td.parentElement;
    if (!e.shiftKey && td.cellIndex >= tableCols(t) - 1) {   // past the last column: a new column
      edit(() => { addCol(t, tableCols(t)); placeCaret(tr.cells[td.cellIndex + 1] || td, false); });
      return true;
    }
    const cells = Array.from(t.querySelectorAll('td'));
    const i = cells.indexOf(td) + (e.shiftKey ? -1 : 1);
    if (i >= 0 && i < cells.length) placeCaret(cells[i], true);
    return true;
  }
  return false;
}
function tableOp(op, t, cell) {
  if (!t || !t.isConnected) return;
  let gone = '';                                   // what to tell afterwards (with undo)
  if (cell && !t.contains(cell)) cell = null;
  // deleting with several cells selected takes all their rows / columns, like Excel
  const rc = cell && nav && nav.t === t ? navRect() : null;
  const inRc = !!rc && cell.parentElement.rowIndex >= rc.r0 && cell.parentElement.rowIndex <= rc.r1 && cell.cellIndex >= rc.c0 && cell.cellIndex <= rc.c1;
  clearObj(); clearNav();                          // the caret landing on the target cell selects it afresh
  edit(() => {
    let ri = cell ? cell.parentElement.rowIndex : 0, ci = cell ? cell.cellIndex : 0;
    let target = null;
    if (inRc && op === 'delRow') { for (let k = rc.r1; k > rc.r0; k--) t.deleteRow(k); ri = rc.r0; }
    if (inRc && op === 'delCol') { for (const tr of Array.from(t.rows)) for (let k = Math.min(rc.c1, tr.cells.length - 1); k > rc.c0; k--) tr.deleteCell(k); ci = rc.c0; }
    if (op === 'delTable') gone = 'table';
    switch (op) {
      case 'rowTop': target = addRow(t, 0).cells[ci]; break;
      case 'rowBottom': target = addRow(t, t.rows.length).cells[ci]; break;
      case 'colLeft': addCol(t, 0); target = t.rows[ri].cells[0]; break;
      case 'colRight': { const c = tableCols(t); addCol(t, c); target = t.rows[ri].cells[c]; break; }
      case 'rowAbove': target = addRow(t, ri).cells[ci]; break;
      case 'rowBelow': target = addRow(t, ri + 1).cells[ci]; break;
      case 'colBefore': addCol(t, ci); target = t.rows[ri].cells[ci]; break;
      case 'colAfter': addCol(t, ci + 1); target = t.rows[ri].cells[ci + 1]; break;
      case 'delRow':
        t.deleteRow(ri);
        if (!t.rows.length) removeTable(t);
        else { const row = t.rows[Math.min(ri, t.rows.length - 1)]; target = row.cells[Math.min(ci, row.cells.length - 1)]; }
        break;
      case 'delCol':
        for (const tr of Array.from(t.rows)) if (tr.cells[ci]) tr.deleteCell(ci);
        if (!tableCols(t)) removeTable(t);
        else target = t.rows[ri].cells[Math.min(ci, t.rows[ri].cells.length - 1)];
        break;
      case 'header': t.classList.toggle('hdr'); target = cell; break;
      case 'delTable': removeTable(t); break;
    }
    if (target) placeCaret(target, false);
  });
  if (gone || !t.isConnected) toast('표를 삭제했어요', '되돌리기', undoThis());
  else if (inRc && (op === 'delRow' || op === 'delCol') && (op === 'delRow' ? rc.r1 > rc.r0 : rc.c1 > rc.c0))
    toast(`${op === 'delRow' ? '행' : '열'} ${op === 'delRow' ? rc.r1 - rc.r0 + 1 : rc.c1 - rc.c0 + 1}개를 삭제했어요`, '되돌리기', undoThis());
}
// table shortcuts (Settings > 단축키): the cell being edited / selected, else the one holding the caret
function tblAct(op) {
  const td = editCell && editCell.isConnected ? editCell : navLive() ? cellAt(nav.t, nav.fr, nav.fc) : closestSel('td');
  if (!td) { toast('표 안에서 쓰는 단축키예요'); return; }
  tableOp(op, td.closest('table'), td);
}

