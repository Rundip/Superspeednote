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
  const tr = t.insertRow(clamp(at, 0, t.rows.length));
  for (let i = 0; i < cols; i++) newCell(tr, -1);
  return tr;
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

