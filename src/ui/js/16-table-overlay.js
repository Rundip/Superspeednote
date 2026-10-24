// ---------------------------------------------------------------- table overlay (the table under the mouse / caret)
// A + in the left / top margin inserts a row / column at the nearest border, the full-length bars on the bottom /
// right edge add rows / columns at the end (drag them for several), and the grip selects the whole table.
// Only the margins next to a table are hit-tested, so typing and scrolling cost nothing extra.
let ovTable = null, ovHover = false, ovHideT = 0, ovRaf = 0;
const tins = $('.tins', ov), tinsln = $('.tinsln', ov), tghost = $('.tghost', ov), tgrip = $('.tgrip', ov);
let insAt = null, insRaf = 0, insEv = null, barDrag = null;   // insAt: { row: bool, i: border index }
function setCold(c) { if (ov.classList.contains('cold') !== c) ov.classList.toggle('cold', c); }
function showOv(t) {
  if (!t || !editor.contains(t)) return;
  clearTimeout(ovHideT);
  if (t !== ovTable) { insAt = null; setCold(true); }   // brought up by the caret: quiet until the mouse comes near
  ovTable = t;
  ov.classList.add('show');
  posOv();
}
function hideOv() { clearTimeout(ovHideT); ovTable = null; insAt = null; placeIns(); ov.classList.remove('show'); }
function hideOvSoon() {
  clearTimeout(ovHideT);
  ovHideT = setTimeout(() => { if (!ovHover && !barDrag && objSel !== ovTable && !(nav && nav.t === ovTable) && !(closestSel('td') && ovTable && ovTable.contains(closestSel('td')))) hideOv(); }, 700);
}
function posOvSoon() { if (!ovRaf) ovRaf = requestAnimationFrame(() => { ovRaf = 0; posOv(); posObj(); }); }
function posOv() {
  if (!ovTable) return;
  if (!ovTable.isConnected) { hideOv(); return; }
  const sr = sheet.getBoundingClientRect(), tr = ovTable.getBoundingClientRect();
  ov.style.left = (tr.left - sr.left - sheet.clientLeft) + 'px'; ov.style.top = (tr.top - sr.top - sheet.clientTop) + 'px';
  ov.style.width = tr.width + 'px'; ov.style.height = tr.height + 'px';
  // selection box: the selected cell / range, or the cell being edited
  let a = null, b = null;
  if (nav && nav.t === ovTable) { const rc = navRect(); a = cellAt(rc.t, rc.r0, rc.c0); b = cellAt(rc.t, rc.r1, rc.c1); }
  else { const td = closestSel('td'); if (td && ovTable.contains(td)) a = b = td; }
  if (a && b) {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const L = Math.min(ra.left, rb.left), T = Math.min(ra.top, rb.top), Rr = Math.max(ra.right, rb.right), B = Math.max(ra.bottom, rb.bottom);
    cellbox.className = (editCell ? 'edit' : 'nav') + (cellbox.classList.contains('copied') ? ' copied' : '');
    Object.assign(cellbox.style, { display: 'block', left: (L - tr.left - 1) + 'px', top: (T - tr.top - 1) + 'px', width: (Rr - L + 2) + 'px', height: (B - T + 2) + 'px' });
  } else cellbox.style.display = 'none';
  placeIns();
}
function caretTable() {
  const td = closestSel('td');
  if (td) showOv(td.closest('table'));
  else if (ovTable) { posOv(); if (!ovHover) hideOvSoon(); }
}
// the row / column border nearest to y / x (binary search: big tables stay cheap)
function rowBorder(t, y) {
  const rows = t.rows;
  let lo = 0, hi = rows.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].getBoundingClientRect().bottom <= y) lo = m + 1; else hi = m; }
  const b = rows[lo].getBoundingClientRect();
  return y < (b.top + b.bottom) / 2 ? lo : lo + 1;
}
function colBorder(t, x) {
  const cells = t.rows[0].cells;
  let lo = 0, hi = cells.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cells[m].getBoundingClientRect().right <= x) lo = m + 1; else hi = m; }
  const b = cells[lo].getBoundingClientRect();
  return x < (b.left + b.right) / 2 ? lo : lo + 1;
}
function insHit(t, x, y) {
  if (!t.rows.length || !t.rows[0].cells.length) return null;
  const r = t.getBoundingClientRect();
  if (x < r.left + 3 && x >= r.left - 44 && y >= r.top - 6 && y <= r.bottom + 6) return { row: true, i: rowBorder(t, y) };
  if (y < r.top + 3 && y >= r.top - 24 && x >= r.left - 6 && x <= r.right + 6) return { row: false, i: colBorder(t, x) };
  return null;
}
// the marker and its guide line move by transform only (no layout); size / tooltip are written only when they change
let insLn = '', insTip = '';
function placeIns() {
  const t = ovTable;
  let ok = !!insAt && !!t && t.isConnected && !barDrag && t.rows.length > 0;
  if (ok) {
    const tr = t.getBoundingClientRect();
    let x, y, ln, tip;
    if (insAt.row) {
      const rows = t.rows, i = Math.min(insAt.i, rows.length);
      y = (i < rows.length ? rows[i].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom) - tr.top;
      x = quickOn ? -15 : -22;                    // the quick memo's narrow margin
      tinsln.style.translate = `0 ${y - 1.5}px`;
      ln = `${tr.width}px 3px`;
      tip = i === 0 ? '맨 위에 행 삽입' : i >= rows.length ? '맨 아래에 행 삽입' : '여기에 행 삽입';
    } else {
      const cells = t.rows[0].cells, j = Math.min(insAt.i, cells.length);
      x = (j < cells.length ? cells[j].getBoundingClientRect().left : cells[cells.length - 1].getBoundingClientRect().right) - tr.left;
      y = -15;
      ok = x >= -2 && x <= tr.width + 2;            // a wide table scrolled sideways: border out of view
      tinsln.style.translate = `${x - 1.5}px 0`;
      ln = `3px ${tr.height}px`;
      tip = j === 0 ? '맨 왼쪽에 열 삽입' : j >= cells.length ? '맨 오른쪽에 열 삽입' : '여기에 열 삽입';
    }
    tins.style.translate = `${x}px ${y}px`;     // not transform: the hover `scale` would scale the offset too
    if (ln !== insLn) { insLn = ln; const [w, h] = ln.split(' '); tinsln.style.width = w; tinsln.style.height = h; }
    if (tip !== insTip) { insTip = tip; tins.title = tip; }
  }
  if (tins.classList.contains('show') !== ok) { tins.classList.toggle('show', ok); tinsln.classList.toggle('show', ok); }
  tgrip.classList.toggle('hide', ok && insAt.row && insAt.i === 0);   // the top-border "+" sits right below it
}
// pointer in the margin beside / above a table it isn't over yet
function probeTable(e) {
  for (const [dx, dy] of [[46, 0], [0, 28]]) {
    const el = document.elementFromPoint(e.clientX + dx, e.clientY + dy);
    const t = el && el.closest && el.closest('table.t');
    if (t && editor.contains(t)) return t;
  }
  return null;
}
function trackIns(e) {
  if (view !== 'editor' || barDrag) return;
  if (e.buttons) { if (insAt) { insAt = null; placeIns(); } return; }   // selecting text: stay out of the way
  let t = e.target.closest && e.target.closest('table.t');
  if (t && !editor.contains(t)) t = null;
  if (!t && ovTable && ov.contains(e.target)) t = ovTable;
  if (!t && ovTable) { const r = ovTable.getBoundingClientRect(); if (e.clientX >= r.left - 46 && e.clientX <= r.right + 30 && e.clientY >= r.top - 30 && e.clientY <= r.bottom + 30) t = ovTable; }
  if (!t && e.target === editor) t = probeTable(e);
  if (!t) { if (insAt) { insAt = null; placeIns(); } setCold(true); if (ovTable && !ovHover) hideOvSoon(); return; }
  if (t !== ovTable) showOv(t); else clearTimeout(ovHideT);
  setCold(false);
  const h = insHit(t, e.clientX, e.clientY);
  if (h && ov.contains(e.target) && e.target.closest('.tins')) return;   // on the + itself: keep it where it is
  if (!h ? !insAt : insAt && insAt.row === h.row && insAt.i === h.i) return;
  insAt = h; placeIns();
}
sheet.addEventListener('mousemove', e => { insEv = e; if (!insRaf) insRaf = requestAnimationFrame(() => { insRaf = 0; if (!dragLive(insEv)) trackIns(insEv); }); });
// a mouse drag across cells shows its range while you drag (it used to appear only on release)
function dragLive(e) {
  if (e.buttons !== 1 || !dragFrom || !dragFrom.isConnected) return false;
  const to = e.target.closest && e.target.closest('td'), t = dragFrom.closest('table');
  if (to && to !== dragFrom && to.closest('table') === t) {
    nav = { t, ar: dragFrom.parentElement.rowIndex, ac: dragFrom.cellIndex, fr: to.parentElement.rowIndex, fc: to.cellIndex };
    editCell = null;
    editor.classList.add('cellnav');
    if (ovTable !== t) showOv(t);
    posOv(); tblHint('nav');
  }
  return true;
}
sheet.addEventListener('mouseleave', () => { if (insAt) { insAt = null; placeIns(); } if (ovTable && !ovHover) hideOvSoon(); });
for (const b of [tins, tgrip, ...$$('.tbar', ov)]) {
  b.addEventListener('mouseenter', () => { ovHover = true; clearTimeout(ovHideT); });
  b.addEventListener('mouseleave', () => { ovHover = false; hideOvSoon(); });
  b.addEventListener('mousedown', e => e.preventDefault());   // keep the caret / cell selection where it is
}
tins.addEventListener('click', () => {
  const t = ovTable, at = insAt;
  if (!t || !at || !t.isConnected) return;
  // a Korean syllable still being typed is finished first: the + keeps the focus, so the IME went on composing in
  // the cell it was in - the new row's typing landed there, over that cell's last letter
  finishIme();
  const r = nav && nav.t === t ? nav.fr : 0, c = nav && nav.t === t ? nav.fc : 0;
  clearObj();
  edit(() => { if (at.row) addRow(t, at.i); else addCol(t, at.i); });
  if (at.row) setNav(t, at.i, c); else setNav(t, r >= t.rows.length ? 0 : r, at.i);
  posOv();
});
tgrip.addEventListener('click', () => { finishIme(); if (ovTable) selectObj(ovTable); });
// add bars: a click adds one row / column, dragging out adds as many as the dashed preview shows, dragging back
// into the table takes off the empty rows / columns at the end - it stops before one with anything in it
function lastColWidth(t) {
  let w = 0;
  for (const tr of t.rows) { const c = tr.cells[tr.cells.length - 1]; if (c) { w = c.getBoundingClientRect().width; break; } }
  return w;
}
function colRect(t, j) { for (const tr of t.rows) if (tr.cells[j]) return tr.cells[j].getBoundingClientRect(); return null; }
const cellBlank = td => !td.textContent.replace(/[\s\u200b]/g, '') && !td.querySelector('img,hr,table');
function emptyTail(t, row) {                      // empty rows / columns at the end (one always stays)
  let k = 0;
  if (row) { for (let i = t.rows.length - 1; i > 0 && Array.from(t.rows[i].cells).every(cellBlank); i--) k++; }
  else { for (let j = tableCols(t) - 1; j > 0 && Array.from(t.rows).every(tr => !tr.cells[j] || cellBlank(tr.cells[j])); j--) k++; }
  return k;
}
function tailUnder(d, x, y) {                     // the empty ones at the end whose middle the pointer has passed
  const t = d.t, c = tableCols(t);
  let k = 0;
  for (; k < d.max; k++) {
    const r = d.row ? t.rows[t.rows.length - 1 - k].getBoundingClientRect() : colRect(t, c - 1 - k);
    if (!r || (d.row ? y > (r.top + r.bottom) / 2 : x > (r.left + r.right) / 2)) break;
  }
  return k;
}
function showGhost() {
  const d = barDrag;
  if (!d) { tghost.style.display = 'none'; return; }
  const what = d.row ? '행' : '열';
  tghost.classList.toggle('none', !d.n);
  tghost.classList.toggle('del', d.n < 0);
  if (d.n < 0) {                                   // the rows / columns that go, tinted where they are
    const t = d.t, tr = t.getBoundingClientRect();
    if (d.row) Object.assign(tghost.style, { display: 'block', left: '0', right: '0', top: (t.rows[t.rows.length + d.n].getBoundingClientRect().top - tr.top) + 'px', bottom: '0', width: '', height: '', background: '' });
    else Object.assign(tghost.style, { display: 'block', top: '0', bottom: '0', left: (colRect(t, tableCols(t) + d.n).left - tr.left) + 'px', right: '0', width: '', height: '', background: '' });
    tghost.firstChild.textContent = `빈 ${what} ${-d.n}개 지우기`;
    return;
  }
  const len = Math.max(d.n, .8) * d.step, line = 'color-mix(in srgb,var(--accent) 35%,transparent)', fill = 'linear-gradient(var(--accent-soft),var(--accent-soft)) var(--paper)';
  Object.assign(tghost.style, d.row
    ? { display: 'block', left: '0', right: '0', top: 'calc(100% + 2px)', bottom: '', width: '', height: len + 'px', background: `repeating-linear-gradient(180deg,transparent 0 ${d.step - 1}px,${line} ${d.step - 1}px ${d.step}px),${fill}` }
    : { display: 'block', top: '0', bottom: '0', left: 'calc(100% + 2px)', right: '', height: '', width: len + 'px', background: `repeating-linear-gradient(90deg,transparent 0 ${d.step - 1}px,${line} ${d.step - 1}px ${d.step}px),${fill}` });
  tghost.firstChild.textContent = d.n ? `+${d.n}${what}` : d.into && !d.max ? `지울 빈 ${what}이 없어요` : '놓으면 취소';
}
function finishBar(commit) {
  const d = barDrag;
  if (!d) return;
  barDrag = null;
  d.b.classList.remove('drag');
  showGhost();
  const t = d.t;
  if (!commit || !d.n || !t.isConnected || view !== 'editor' || !editor.contains(t)) { posOvSoon(); return; }
  const r = nav && nav.t === t ? nav.fr : 0, c = nav && nav.t === t ? nav.fc : 0;
  clearObj();
  if (d.n < 0) { dropTail(t, d.row, -d.n); return; }
  if (d.row) { const r0 = t.rows.length; edit(() => { for (let k = 0; k < d.n; k++) addRow(t, t.rows.length); }); setNav(t, r0, c); posOv(); }
  else { const c0 = tableCols(t); edit(() => { for (let k = 0; k < d.n; k++) addCol(t, tableCols(t)); }); setNav(t, r, c0); posOv(); }
  if (d.n > 1) toast(`${d.row ? '행' : '열'} ${d.n}개를 추가했어요`, '되돌리기', undoThis());
}
function dropTail(t, row, k) {
  k = Math.min(k, emptyTail(t, row));             // checked again: only ever empty ones
  if (!k) { posOvSoon(); return; }
  const inNav = !!nav && nav.t === t, fr = inNav ? nav.fr : 0, fc = inNav ? nav.fc : 0;
  const held = closestSel('td'), heldIn = !!held && t.contains(held);
  const hr = heldIn ? held.parentElement.rowIndex : 0, hc = heldIn ? held.cellIndex : 0;
  edit(() => {
    if (row) for (let i = 0; i < k; i++) t.deleteRow(t.rows.length - 1);
    else { const c = tableCols(t); for (const tr of Array.from(t.rows)) for (let j = Math.min(tr.cells.length, c) - 1; j >= c - k; j--) tr.deleteCell(j); }
  });
  // a selected cell / the caret that was in a removed row / column moves to the nearest one left
  if (inNav) setNav(t, fr, fc);
  else if (heldIn && !held.isConnected) placeCaret(cellAt(t, Math.min(hr, t.rows.length - 1), Math.min(hc, tableCols(t) - 1)), true);
  posOv();
  if (k > 1) toast(`빈 ${row ? '행' : '열'} ${k}개를 지웠어요`, '되돌리기', undoThis());
}
document.addEventListener('keydown', e => { if (barDrag && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishBar(false); } }, true);
for (const b of $$('.tbar', ov)) {
  b.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !ovTable || !ovTable.rows.length) return;
    e.preventDefault();
    finishIme();                                   // (as for the +: a syllable being typed is finished first)
    const t = ovTable, row = b.dataset.dir === 'row';
    const step = Math.round(clamp(row ? t.rows[t.rows.length - 1].getBoundingClientRect().height : lastColWidth(t), 24, 400));
    barDrag = { t, row, step, b, x: e.clientX, y: e.clientY, n: 1, max: emptyTail(t, row), into: false };
    insAt = null; placeIns();
    b.setPointerCapture(e.pointerId);
    b.classList.add('drag');
    showGhost();
  });
  b.addEventListener('pointermove', e => {
    const d = barDrag;
    if (!d || d.b !== b) return;
    const dist = d.row ? e.clientY - d.y : e.clientX - d.x;
    let n, into = false;
    if (dist >= -d.step / 3) n = clamp(Math.round(dist / d.step), 1, d.row ? 200 : 50);   // away from the table: add
    else {                                         // back toward it: empty ones at the end go, or nothing (cancel)
      const k = tailUnder(d, e.clientX, e.clientY);
      n = k ? -k : 0;
      if (!d.max) { const t = d.t, r = d.row ? t.rows[t.rows.length - 1].getBoundingClientRect() : colRect(t, tableCols(t) - 1); into = !!r && (d.row ? e.clientY < (r.top + r.bottom) / 2 : e.clientX < (r.left + r.right) / 2); }
    }
    if (n !== d.n || into !== d.into) { d.n = n; d.into = into; showGhost(); }
  });
  b.addEventListener('pointerup', () => { if (barDrag && barDrag.b === b) finishBar(true); });
  b.addEventListener('pointercancel', () => finishBar(false));
  b.addEventListener('lostpointercapture', () => finishBar(false));
}

