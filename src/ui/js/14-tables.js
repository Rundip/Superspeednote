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
  const cells = tblCells();
  if (!cells.length) { textNum(); return; }       // outside a table: the numbers in the selection, else in the line
  const on = !cells.every(c => c.classList.contains('num'));
  if (!cellsLook(td => { td.classList.toggle('num', on); numText(td, on); td.classList.remove('al-c', 'al-r'); if (on) td.classList.add('al-r'); }, true)) return;
  toast(on ? '천 단위 쉼표를 넣었어요 · 이 칸에 새로 쓰는 숫자에도 찍혀요' : '천 단위 쉼표를 뺐어요', '되돌리기', undoThis());
}
// ---- thousands commas in ordinary text: the numbers in the selection, else in the caret's line. A number inside a
// sentence gets them only when it reads as an amount (1460000원, ₩25000, 합계 1500000); numbers that are codes keep
// their digits as written - phone, account and card numbers (010-1234-5678, 1588-1234, 1234 5678, 11 digits or
// more), dates and times (2026-11-19, 2026.11.19, 12:30), years and addresses (2026년, 올해 2026, 2020~2026, 1203호, 101동),
// 0123, A1234, #1234, web and mail addresses. One number selected on its own gets them anyway. Code stays as typed;
// table cells have their own (cellNum, above).
const NUM_TOK = /\d+(?:,\d+)*(?:\.\d+)?/g;
const yearish = t => /^(19|20)\d\d$/.test(t);
function numAmount(s, i, j, d, plain) {          // the number s[i, j) (integer digits d; plain: no commas yet) reads as an amount
  const p = s[i - 1] || '', pp = s[i - 2] || '', n = s[j] || '', nn = s[j + 1] || '';
  if (d.length > 10) return false;
  if (/[\w#@]/.test(p) || /[-/:.]/.test(p) && /[A-Za-z\d]/.test(pp) || p === ' ' && /\d/.test(pp)) return false;   // A1234 #1234 010-1234 1234 5678
  if (/[-/:. ]/.test(n) && /\d/.test(nn)) return false;                                 // 1588-1234 2026.11.19 2026/11
  if (/[년호동층번]/.test(n)) return false;
  // 1900-2099 on its own is a year (올해 2026 실적, 2020~2026); with a unit or a sign it is an amount (2000원, ₩1990)
  if (plain && yearish(d) && !/[-+₩$\\~]/.test(p) && !/[가-힣%A-Za-z~]/.test(n)) return false;
  if (plain && yearish(d) && (n === '~' && yearish((/^\d+/.exec(s.slice(j + 1, j + 12)) || [''])[0]) ||
                              p === '~' && yearish((/\d+$/.exec(s.slice(Math.max(0, i - 12), i - 1)) || [''])[0]))) return false;
  // the word it sits in (a long line is only looked at around the number: the command stays instant)
  const w = (/\S*$/.exec(s.slice(Math.max(0, i - 300), i)) || [''])[0] + (/^\S*/.exec(s.slice(j, j + 300)) || [''])[0];
  return !/:\/\/|www\.|@/.test(w);
}
// one line's own text as a string (a <br>, a picture or a line inside it breaks it) and where each text node sits in it
function numRun(b) {
  let s = '';
  const parts = [], w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 1) { if (!n.firstChild) s += '\n'; continue; }
    if ((blockOf(n) || editor) !== b || n.parentNode.closest('code')) { s += '\n'; continue; }
    parts.push([n, s.length]); s += n.nodeValue;
  }
  return { s, parts };
}
// the text nodes a selection touches, in order: walked from its first to its last one, so a whole long note stays quick
function textIn(r) {
  const w = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const at = (c, o) => {                          // the first node at or after the point (c, o), inside the editor
    if (c.nodeType !== 3 && o < c.childNodes.length) return c.childNodes[o];
    for (let x = c; x && x !== editor; x = x.parentNode) if (x.nextSibling) return x.nextSibling;
    return null;
  };
  let first, last;
  if (r.startContainer.nodeType === 3) first = r.startContainer;
  else { const f = at(r.startContainer, r.startOffset); if (!f) return []; w.currentNode = f; first = f.nodeType === 3 ? f : w.nextNode(); }
  if (r.endContainer.nodeType === 3 && editor.contains(r.endContainer)) last = r.endContainer;
  else { const e = editor.contains(r.endContainer) ? at(r.endContainer, r.endOffset) : null; w.currentNode = e || editor; last = e ? w.previousNode() : w.lastChild(); }
  if (!first || !last || first !== last && first.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING) return [];
  const out = [first];
  w.currentNode = first;
  for (let n = first; n !== last && (n = w.nextNode());) out.push(n);
  return out;
}
// what the command would do here: mode 'on' (some amount has no commas yet), 'off' (they all have them), '' (none)
function numPlan() {
  const r = selRange();
  if (!r) return null;
  const blocks = [], seen = new Set(), sel = !r.collapsed;
  let code = false;
  const add = n => {
    const b = blockOf(n) || editor;
    if (seen.has(b)) return;
    seen.add(b);
    if (b.closest('td, pre')) code = code || !!b.closest('pre'); else blocks.push(b);
  };
  const tn = sel ? textIn(r) : [];
  if (!sel) add(r.startContainer); else tn.forEach(add);
  // only the first and the last line can be partly selected: just their numbers are checked against the selection
  const edge = new Set(tn.length ? [blockOf(tn[0]) || editor, blockOf(tn[tn.length - 1]) || editor] : []);
  const st = sel && r.toString().trim().replace(/^[-+₩$\\]/, '');   // just one number selected: it gets them anyway
  const toks = [];
  let skipped = 0, zero = 0;
  for (const b of blocks) {
    const { s, parts } = numRun(b), part = edge.has(b);
    let pi = 0;
    for (const m of s.matchAll(NUM_TOK)) {
      const t = m[0], i = m.index, j = i + t.length, int = t.split('.')[0], d = int.replace(/,/g, ''), has = int !== d;
      if (has ? !/^\d{1,3}(,\d{3})+$/.test(int) : d.length < 4) continue;
      while (pi < parts.length && parts[pi][1] + parts[pi][0].nodeValue.length <= i) pi++;   // the numbers come in order
      const pt = parts[pi];
      if (!pt || pt[1] > i || j > pt[1] + pt[0].nodeValue.length) continue;   // split over two pieces of formatting (12<b>34</b>): left as it is
      const [n, at] = pt, a = i - at, z = j - at;
      if (part && !((r.endContainer !== n || r.endOffset > a) && r.comparePoint(n, a) < 1 &&
                   (r.startContainer !== n || r.startOffset < z) && r.comparePoint(n, z) > -1)) continue;
      if (d.length > 1 && d[0] === '0') { zero++; continue; }
      if (st !== t && !numAmount(s, i, j, d, !has)) { if (!has) skipped++; continue; }
      toks.push({ n, a, z, t, int, d, has });
    }
  }
  const mode = toks.some(k => !k.has) ? 'on' : toks.length ? 'off' : '';
  return { r, mode, toks, skipped, zero, code, sel };
}
function textNum() {
  finishIme();
  histCommit();                                   // (it joins split text first: the numbers are found in the joined text)
  const p = numPlan();
  if (!p) return;
  if (!p.mode) {
    const where = p.sel ? '선택한 부분의' : '이 줄의';
    toast(p.skipped ? `${where} 숫자는 전화번호·날짜·연도 같은 번호로 보여서 그대로 뒀어요 · 숫자만 선택하고 누르면 쉼표가 들어가요`
      : p.zero ? '0으로 시작하는 번호에는 쉼표를 넣지 않아요'
      : p.code ? '코드란의 숫자는 쓴 그대로 둬요'
      : p.sel ? '선택한 부분에 쉼표를 넣을 숫자(1000 이상)가 없어요' : '이 줄에 쉼표를 넣을 숫자(1000 이상)가 없어요 · 여러 줄은 선택하고 눌러 주세요');
    return;
  }
  const on = p.mode === 'on', r = p.r;
  const pts = [[r.startContainer, r.startOffset], [r.endContainer, r.endOffset]];
  let k = 0;
  edit(() => {
    for (const x of p.toks.slice().reverse()) {   // last first: the offsets of the ones before stay right
      if (on === x.has) continue;
      const v = (on ? x.d.replace(/\B(?=(\d{3})+$)/g, ',') : x.d) + x.t.slice(x.int.length);
      for (const q of pts) {                      // the caret / selection stays by the same digit
        if (q[0] !== x.n || q[1] <= x.a) continue;
        if (q[1] >= x.z) { q[1] += v.length - x.t.length; continue; }
        let c = x.t.slice(0, q[1] - x.a).replace(/,/g, '').length, o = 0;
        while (c > 0 && o < v.length) { if (v[o] !== ',') c--; o++; }
        q[1] = x.a + o;
      }
      x.n.replaceData(x.a, x.z - x.a, v);
      k++;
    }
    if (document.activeElement !== editor) editor.focus({ preventScroll: true });
    const g = document.createRange();
    g.setStart(pts[0][0], pts[0][1]); g.setEnd(pts[1][0], pts[1][1]);
    const s = getSelection(); s.removeAllRanges(); s.addRange(g);
  });
  toast(on ? (k > 1 ? `숫자 ${k}개에 천 단위 쉼표를 넣었어요` : '천 단위 쉼표를 넣었어요') + (p.skipped ? ' · 전화번호·날짜 같은 번호는 그대로 뒀어요' : '')
    : '천 단위 쉼표를 뺐어요', '되돌리기', undoThis());
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

