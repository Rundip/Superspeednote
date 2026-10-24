// ---------------------------------------------------------------- paste (Excel -> table, images, clean HTML)
let plainNext = false;
editor.addEventListener('paste', e => {
  e.preventDefault();
  const cd = e.clipboardData;
  const files = Array.from(cd.files || []).filter(f => /^image\/(png|jpeg|gif|webp|bmp)$/.test(f.type));
  const plain = plainNext;
  plainNext = false;
  doPaste(cd.getData('text/plain'), cd.getData('text/html'), files, plain);
});
function doPaste(text, html, files, plain) {
  text = text || '';
  // Windows hands HTML over as a page with line breaks around the copied part: only the part itself (the line
  // break before it came in as a space at the start)
  const fr = html && /<!--StartFragment-->([\s\S]*)<!--EndFragment-->/.exec(html);
  if (fr) html = fr[1];
  if (files.length && !text.trim()) { files.forEach(insertImageFile); return; }
  const g = plain ? null : (html && gridFromHtml(html)) || gridFromTSV(text);
  if (g && (g.length > 1 || g[0].length > 1)) { pasteGrid(g, text); return; }
  if (g) { text = g[0][0]; html = ''; }          // a single cell pastes as its text
  if (navLive()) {                                // cell(s) selected: the value replaces them, like Excel
    const val = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    const keep = Object.assign({}, nav), cells = rectCells(navRect());
    edit(() => { for (const c of cells) c.innerHTML = cellHTML(val); });
    nav = keep; editor.classList.add('cellnav'); parkNav(cellAt(nav.t, nav.fr, nav.fc)); posOv();
    return;
  }
  edit(() => {
    const t = text.trim();
    if (/^https?:\/\/\S+$/i.test(t)) exec('insertHTML', `<a href="${esc(t)}">${esc(t)}</a>`);
    else if (plain || !html) exec('insertText', text);
    else {
      const d = document.createElement('div');
      d.appendChild(sanitize(html));
      // white space around the copied part (the source's layout) is not part of it
      while (d.firstChild && d.firstChild.nodeType === 3 && !d.firstChild.nodeValue.trim()) d.firstChild.remove();
      while (d.lastChild && d.lastChild.nodeType === 3 && !d.lastChild.nodeValue.trim()) d.lastChild.remove();
      // one list item from elsewhere: just its text, not another bullet
      const only = d.children.length === 1 && d.childNodes.length === 1 && /^(UL|OL)$/.test(d.firstChild.nodeName) && d.firstChild.children.length === 1 ? d.firstChild.firstElementChild : null;
      if (only) { d.innerHTML = ''; while (only.firstChild) d.appendChild(only.firstChild); }
      if (d.innerHTML) exec('insertHTML', d.innerHTML); else exec('insertText', text);
    }
  });
}
function gridFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style,script,meta,link,title,colgroup,col').forEach(n => n.remove());
  const tables = doc.body.querySelectorAll('table');
  if (tables.length !== 1 || tables[0].querySelector('table')) return null;
  const rest = doc.body.cloneNode(true);
  rest.querySelector('table').remove();
  if (rest.textContent.trim()) return null;          // a table inside other content: paste as rich HTML instead
  const rows = tableGrid(tables[0], cellText, '');
  return rows.length && rows[0].length ? rows : null;
}
// An HTML table as a full grid. Merged cells are spread out (the value stays in the top-left cell, like Excel's
// unmerge) - skipping rowspan shifted every cell under a merge one column left. Excel's hidden helper row
// (<tr style='display:none'> under "supportMisalignedColumns") is left out.
function helperRow(tr) {                         // Excel: display:none; Word: an empty height=0 row
  return tr.hidden || (tr.style && tr.style.display === 'none') || (tr.getAttribute('height') === '0' && !tr.textContent.trim());
}
function tableGrid(table, read, blank) {
  const trs = Array.from(table.rows).filter(tr => !helperRow(tr));
  const rows = [];
  let w = 0;                                      // columns some cell starts in (a colspan="100" doesn't widen the table)
  trs.forEach((tr, r) => {
    const row = rows[r] || (rows[r] = []);
    let c = 0;
    for (const td of tr.cells) {
      while (row[c] !== undefined) c++;           // slot taken by a merge from a row above
      const cs = clamp(+td.colSpan || 1, 1, 200), rs = clamp(+td.rowSpan || 1, 1, trs.length - r);
      for (let i = 0; i < rs; i++) {
        const rr = rows[r + i] || (rows[r + i] = []);
        for (let j = 0; j < cs; j++) rr[c + j] = i || j ? blank : read(td);
      }
      w = Math.max(w, c + 1);
      c += cs;
    }
  });
  rows.length = trs.length;
  for (const x of rows) { x.length = Math.min(x.length, w); for (let j = 0; j < w; j++) if (x[j] === undefined) x[j] = blank; }
  return rows;
}
function cellText(td) {
  const c = td.cloneNode(true);
  c.querySelectorAll('br').forEach(b => b.replaceWith('\x01'));
  c.querySelectorAll('p,div').forEach(b => b.append('\x01'));
  return c.textContent.replace(/[ \t\r\n\xa0]+/g, ' ').replace(/ ?\x01 ?/g, '\n').replace(/^\n+|\n+$/g, '').trim();
}
function gridFromTSV(text) {
  if (!text || !text.includes('\t')) return null;
  text = text.replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const w = rows.length ? rows[0].length : 0;
  if (w < 2 || rows.some(r => r.length !== w)) return null;   // ragged text with tabs is just text
  return rows;
}
// Cells covered by a selection that spans several cells of one table, as a rectangle.
// (Chrome's own copy takes cells in document order, so B1:C2 also grabbed A2 and the paste came out shifted.)
function cellOf(n) {
  const el = n && (n.nodeType === 3 ? n.parentNode : n);
  const td = el && el.closest && el.closest('td');
  return td && editor.contains(td) ? td : null;
}
function selCellRect() {                          // cell mode range first, then a DOM selection spanning cells
  if (navLive()) return navRect();
  return domCellRect();
}
function domCellRect() {
  const r = selRange();
  if (!r || r.collapsed) return null;
  let a = cellOf(r.startContainer), b = cellOf(r.endContainer);
  if (!a || !b || a === b) return null;
  const t = a.closest('table');
  if (b.closest('table') !== t) return null;
  const cells = Array.from(t.querySelectorAll('td'));
  const empty = (c, s, o, fromStart) => { const x = document.createRange(); if (fromStart) { x.setStart(c, 0); x.setEnd(s, o); } else { x.setStart(s, o); x.setEnd(c, c.childNodes.length); } return !x.toString(); };
  // a drag that begins at the very end of a cell, or ends at the very start of one, selects nothing there
  if (a.textContent && empty(a, r.startContainer, r.startOffset, false) && cells[cells.indexOf(a) + 1]) a = cells[cells.indexOf(a) + 1];
  if (b.textContent && empty(b, r.endContainer, r.endOffset, true) && cells.indexOf(b) > 0) b = cells[cells.indexOf(b) - 1];
  const ra = a.parentElement.rowIndex, rb = b.parentElement.rowIndex;
  return { t, r0: Math.min(ra, rb), r1: Math.max(ra, rb), c0: Math.min(a.cellIndex, b.cellIndex), c1: Math.max(a.cellIndex, b.cellIndex) };
}
function rectRows(rc) {
  const rows = [];
  for (let i = rc.r0; i <= rc.r1; i++) {
    const tr = rc.t.rows[i], row = [];
    for (let j = rc.c0; j <= rc.c1; j++) row.push(tr.cells[j] ? toPlain(tr.cells[j]) : '');
    rows.push(row);
  }
  return rows;
}
function rowsText(rows) { return rows.map(r => r.map(tsvCell).join('\t')).join('\r\n'); }          // Excel / Sheets / Notepad
function rowsHTML(rows) { return '<table>' + rows.map(r => '<tr>' + r.map(v => '<td>' + (v ? cellHTML(v) : '') + '</td>').join('') + '</tr>').join('') + '</table>'; }
function gridToClipboard(cd, rows) {
  cd.setData('text/plain', rowsText(rows));
  cd.setData('text/html', rowsHTML(rows));
}
function wholeTable(t) { return { t, r0: 0, r1: t.rows.length - 1, c0: 0, c1: Math.max(0, tableCols(t) - 1) }; }
let copyT = 0;
// Copying text in a note: exactly what is selected, no empty line from a triple-click. Lines from a list go out as
// the text you see - indented by their level, their bullet / number / box as characters ("1. ", "가. ", "• ", "☐ ")
// - so Word, 한글 or Notion show them as they are with nothing to fix after pasting. The numbers are the note's own
// (a part copied from the middle keeps "다."). A line copied from its middle, or one line alone (pasted into
// another line), comes without its bullet.
function selClip() {
  const r = selRange();
  if (!r || r.collapsed || !editor.contains(r.commonAncestorContainer)) return null;
  // the list lines the copy holds (in the order cloneContents gives them), and what each shows in front of it
  const live = $$('li', editor).filter(li => r.intersectsNode(li) && !li.contains(r.commonAncestorContainer));
  const marks = live.map(li => {
    const st = document.createRange(); st.setStart(li, 0);
    if (r.compareBoundaryPoints(Range.START_TO_START, st) > 0) {               // starts inside this line: only from its very start
      st.setEnd(r.startContainer, r.startOffset);
      if (st.toString() || st.cloneContents().querySelector('img')) return '';
    }
    let depth = 0;
    for (let q = li.parentElement; q && q !== editor && q.nodeName !== 'TD'; q = q.parentElement) if (isList(q)) depth++;
    const L = li.parentElement;
    const mark = li.classList.contains('nob') ? '' : L.classList.contains('checklist') ? (li.dataset.checked === 'true' ? '☑ ' : '☐ ')
      : L.nodeName === 'OL' ? olLabel(li) : '• ';
    return ('    '.repeat(Math.max(0, depth - 1)) + mark).replace(/ /g, ' ');   // non-breaking: the spaces survive pasting
  });
  const box = document.createElement('div');
  box.appendChild(r.cloneContents());
  const copies = box.querySelectorAll('li'), markNodes = [];
  copies.forEach((li, i) => {
    const d = document.createElement('div');
    const m = copies.length === live.length ? marks[i] : '';
    if (m && (li.textContent.trim() || li.querySelector('img,hr,table'))) { const t = document.createTextNode(m); d.appendChild(t); markNodes.push(t); }
    while (li.firstChild) d.appendChild(li.firstChild);
    li.replaceWith(d);
  });
  box.querySelectorAll('ul,ol').forEach(unwrap);
  const blank = n => n && (n.nodeType === 3 ? !n.nodeValue.trim() : n.nodeType === 1 && !n.textContent.trim() && !n.querySelector('img,hr,table') && !/^(IMG|HR|TABLE)$/.test(n.nodeName));
  while (box.childNodes.length > 1 && blank(box.lastChild)) box.lastChild.remove();     // the next line's start, caught by a triple-click
  while (box.childNodes.length > 1 && blank(box.firstChild)) box.firstChild.remove();
  // one line (or part of one): its contents only, without a bullet, so the paste goes into the line it lands in
  if (box.childNodes.length === 1 && box.firstChild.nodeType === 1 && /^(DIV|P)$/.test(box.firstChild.nodeName)) {
    markNodes.forEach(t => { if (t.parentNode === box.firstChild) t.remove(); });
    unwrap(box.firstChild);
  }
  return { html: box.innerHTML, text: toPlain(box).replace(/ /g, ' ').replace(/\n+$/, '') };
}
editor.addEventListener('copy', e => {
  const whole = objSel && objSel.nodeName === 'TABLE', rc = whole ? wholeTable(objSel) : selCellRect();
  if (!rc) {
    const c = !objSel && selClip();
    if (c) { e.preventDefault(); e.clipboardData.setData('text/plain', c.text); e.clipboardData.setData('text/html', c.html); }
    return;
  }
  e.preventDefault();
  gridToClipboard(e.clipboardData, rectRows(rc));
  const box = whole ? objbox : cellbox;           // the copied cells get a dashed frame for a moment
  box.classList.add('copied'); clearTimeout(copyT); copyT = setTimeout(() => { cellbox.classList.remove('copied'); objbox.classList.remove('copied'); }, 900);
  if (whole) toast('표를 복사했어요 · 엑셀에 바로 붙여넣을 수 있어요');
});
editor.addEventListener('cut', e => {
  if (objSel && objSel.nodeName === 'TABLE') { e.preventDefault(); gridToClipboard(e.clipboardData, rectRows(wholeTable(objSel))); deleteObj(); return; }
  const rc = selCellRect();
  if (!rc) {
    const c = !objSel && selClip();
    if (c) { e.preventDefault(); e.clipboardData.setData('text/plain', c.text); e.clipboardData.setData('text/html', c.html); edit(() => exec('delete')); }
    return;
  }
  e.preventDefault();
  gridToClipboard(e.clipboardData, rectRows(rc));
  edit(() => { for (const c of rectCells(rc)) c.innerHTML = '<br>'; });
  setNav(rc.t, rc.r0, rc.c0);
});
function pasteGrid(rows, src) {
  const rc = selCellRect();                           // pasting over a multi-cell selection starts at its top-left cell
  const td = rc ? rc.t.rows[rc.r0].cells[rc.c0] : closestSel('td');
  const w = Math.max(...rows.map(r => r.length));
  let grew = false;
  edit(() => {
    if (td) {                      // fill the existing table from the caret cell, growing it as needed
      const t = td.closest('table');
      const r0 = td.parentElement.rowIndex, c0 = td.cellIndex;
      grew = t.rows.length < r0 + rows.length || tableCols(t) < c0 + w;
      while (t.rows.length < r0 + rows.length) addRow(t, t.rows.length);
      while (tableCols(t) < c0 + w) addCol(t, tableCols(t));
      rows.forEach((r, i) => {
        const tr = t.rows[r0 + i];
        r.forEach((v, j) => {
          while (tr.cells.length <= c0 + j) newCell(tr, -1);
          tr.cells[c0 + j].innerHTML = cellHTML(v);
        });
      });
      // like Excel: the pasted block stays selected
      nav = { t, ar: r0, ac: c0, fr: r0 + rows.length - 1, fc: c0 + w - 1 };
      editCell = null; tabFrom = -1;
      editor.classList.add('cellnav');
      parkNav(cellAt(t, nav.fr, nav.fc));
    } else {                       // a header row only when the first row reads like one (words, not numbers)
      const hdr = rows.length > 1 && rows[0].every(v => v.trim() && !/^[-+]?[\d,.]+%?$/.test(v.trim()));
      const t = buildTable(rows, hdr);
      placeBlock(t);
      placeCaret(t.nextElementSibling || t.rows[0].cells[0], false);
    }
  });
  const back = undoThis();
  if (td) toast(`${rows.length}행 × ${w}열을 붙여넣었어요${grew ? ' · 표를 늘렸어요' : ''}`, '되돌리기', back);
  else toast(`표로 붙여넣었어요 · ${rows.length}행 × ${w}열`, '텍스트로', () => { const n = H.get(cur), i = n && n.i; back(); if (n && n.i < i) doPaste(src || rowsText(rows), '', [], true); });
}
const KEEP = new Set(['B', 'I', 'U', 'S', 'BR', 'P', 'DIV', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'TABLE', 'TBODY', 'TR', 'TD', 'IMG', 'SUB', 'SUP']);
const DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'CANVAS', 'VIDEO', 'AUDIO', 'COLGROUP', 'COL']);
const RENAME = { STRONG: 'B', EM: 'I', STRIKE: 'S', DEL: 'S', INS: 'U', H4: 'H3', H5: 'H3', H6: 'H3', THEAD: 'TBODY', TFOOT: 'TBODY', TH: 'TD', SECTION: 'DIV', ARTICLE: 'DIV', HEADER: 'DIV', FOOTER: 'DIV', MAIN: 'DIV', ASIDE: 'DIV', NAV: 'DIV', FIGURE: 'DIV', DD: 'DIV', DT: 'DIV', DL: 'DIV' };
// '#fff176' for 'rgb(255, 241, 118)' (a highlight's colour as the editor writes it)
function rgbHex(c) { const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c || ''); return m ? '#' + m.slice(1).map(x => (+x).toString(16).padStart(2, '0')).join('') : String(c || '').toLowerCase(); }
// o.doc: build in that (inert) document, so nothing loads yet; o.own: the app's own file (an export, a dragged-out
// note) - its checklists, colours, highlights and header rows stay
function sanitize(html, o = {}) {
  const D = o.doc || document;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = D.createDocumentFragment();
  const walk = (src, dst, pre) => {
    for (let n = src.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const t = pre ? n.nodeValue : n.nodeValue.replace(/[ \t\r\n]+/g, ' ');
        if (t) dst.appendChild(D.createTextNode(t));
        continue;
      }
      if (n.nodeType !== 1) continue;
      let tag = n.nodeName.toUpperCase();
      if (DROP.has(tag)) continue;
      if (tag === 'TR' && helperRow(n)) continue;   // Excel's / Word's hidden helper row
      tag = RENAME[tag] || tag;
      const stl = n.style || {};
      const fw = stl.fontWeight || '';
      if (o.own && tag === 'FONT' && FG.some(f => f.v && f.v === (n.getAttribute('color') || '').toLowerCase())) {
        const el = D.createElement('font'); el.setAttribute('color', n.getAttribute('color').toLowerCase()); dst.appendChild(el); walk(n, el, pre); continue;
      }
      if (o.own && tag === 'SPAN' && HL.some(h => h.v === rgbHex(stl.backgroundColor))) {
        const el = D.createElement('span'); el.style.backgroundColor = stl.backgroundColor; dst.appendChild(el); walk(n, el, pre); continue;
      }
      if (!KEEP.has(tag) || (tag === 'B' && (fw === 'normal' || fw === '400'))) {
        // unknown wrapper (span, font, Google Docs <b style=normal> ...): keep only bold/italic/underline/strike from its style
        let inner = dst;
        const deco = (stl.textDecorationLine || stl.textDecoration || '');
        const wraps = [[fw === 'bold' || +fw >= 600, 'b'], [stl.fontStyle === 'italic', 'i'], [deco.includes('underline'), 'u'], [deco.includes('line-through'), 's']];
        for (const [on, t2] of wraps) if (on && tag !== 'B') { const e2 = D.createElement(t2); inner.appendChild(e2); inner = e2; }
        walk(n, inner, pre);
        continue;
      }
      const el = D.createElement(tag);
      if (tag === 'A') {
        const h = n.getAttribute('href') || '';
        if (!/^(https?:|mailto:)/i.test(h)) { walk(n, dst, pre); continue; }
        el.setAttribute('href', h);
      }
      if (tag === 'IMG') {
        const s = n.getAttribute('src') || '';
        if (/^(https?:|data:image\/(png|jpe?g|gif|webp|bmp)[;,])/i.test(s)) { el.setAttribute('src', s); dst.appendChild(el); }
        continue;
      }
      if (tag === 'TABLE') el.className = o.own && n.classList.contains('hdr') ? 't hdr' : 't';
      if (o.own && tag === 'UL' && n.classList.contains('checklist')) el.className = 'checklist';
      if (o.own && tag === 'LI' && /^(true|false)$/.test(n.getAttribute('data-checked') || '')) el.setAttribute('data-checked', n.getAttribute('data-checked'));
      if (tag === 'TD') { if (n.colSpan > 1) el.colSpan = n.colSpan; if (n.rowSpan > 1) el.rowSpan = n.rowSpan; }   // spread out below
      dst.appendChild(el);
      walk(n, el, pre || tag === 'PRE');
    }
  };
  walk(doc.body, out, false);
  out.querySelectorAll('table').forEach(t => {
    if (!t.rows.length) { t.remove(); return; }
    // one cell per slot: merged cells spread out, short rows padded (the editor's tables are plain grids)
    const loose = Array.from(t.childNodes).filter(n => !/^(TBODY|TR)$/.test(n.nodeName));   // a caption's text
    if (loose.some(n => n.textContent.trim())) { const d = D.createElement('div'); loose.forEach(n => d.appendChild(n)); t.before(d); }
    const g = tableGrid(t, td => td, null), tb = D.createElement('tbody');
    for (const row of g) {
      const tr = tb.insertRow();
      for (const v of row) {
        const td = v || D.createElement('td');
        td.removeAttribute('colspan'); td.removeAttribute('rowspan');
        if (!td.firstChild) td.innerHTML = '<br>';
        tr.appendChild(td);
      }
    }
    t.replaceChildren(tb);
  });
  out.querySelectorAll('tr').forEach(tr => { if (!tr.closest('table')) unwrap(tr); });
  return out;
}
function insertImageFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    const url = String(rd.result);
    let src = url;
    if (HOST) {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' }[file.type] || 'png';
      const name = uid() + '.' + ext;
      host.send('saveImg', name, url.slice(url.indexOf(',') + 1));
      src = IMG_URL + name;
    }
    ensureEditorFocus();
    const r = selRange(), line = r && !cellOf(r.startContainer) && blockOf(r.startContainer);
    if (line && line.parentNode === editor && line.textContent.trim()) {   // a picture on its own line, not inside the sentence
      edit(() => { const d = document.createElement('div'); d.innerHTML = `<img src="${src}">`; line.after(d); const nx = document.createElement('div'); nx.innerHTML = '<br>'; d.after(nx); placeCaret(nx, false); });
    } else edit(() => exec('insertHTML', `<img src="${src}">`));
  };
  rd.readAsDataURL(file);
}
editor.addEventListener('dragover', e => { if (isNoteDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } });
editor.addEventListener('drop', e => {
  if (isNoteDrag(e)) { e.preventDefault(); return; }
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /^image\/(png|jpeg|gif|webp|bmp)$/.test(f.type));
  if (!files.length) return;
  e.preventDefault();
  const r = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  files.forEach(insertImageFile);
});
document.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
// Text and HTML files dropped anywhere become notes named after the files (pictures dropped in a note go in it)
const TEXT_FILE = /\.(txt|text|md|markdown|log|csv|html?|xhtml)$/i;
const IMG_FILE = /^image\/(png|jpeg|gif|webp|bmp)$/;
const isTextFile = f => TEXT_FILE.test(f.name) || /^text\/(plain|html|markdown|csv)$/.test(f.type);
const isHtmlFile = f => /\.x?html?$/i.test(f.name) || f.type === 'text/html';
document.addEventListener('drop', e => {
  if (!e.dataTransfer || isNoteDrag(e)) return;
  const items = Array.from(e.dataTransfer.items || []).filter(it => it.kind === 'file');
  const dropped = items.length ? items.map(it => { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); return { f: it.getAsFile(), dir: !!(en && en.isDirectory) }; })
    : Array.from(e.dataTransfer.files || []).map(f => ({ f, dir: false }));
  if (!dropped.length) return;
  const files = dropped.filter(x => x.f && !x.dir && isTextFile(x.f)).map(x => x.f);
  const inNote = view === 'editor' && editor.isContentEditable && editor.contains(e.target);
  const pics = inNote ? dropped.filter(x => x.f && !x.dir && IMG_FILE.test(x.f.type)).map(x => x.f) : [];
  if (!files.length && pics.length) return;        // pictures only: the note's own drop puts them in
  e.preventDefault(); e.stopPropagation();
  if (pics.length) {                               // pictures and text files together: the pictures still go in the note
    const r = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (r) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    pics.forEach(insertImageFile);
  }
  const dirs = dropped.filter(x => x.dir).length, other = dropped.length - files.length - pics.length - dirs;
  if (!files.length) { toast(dirs ? '폴더는 넣을 수 없어요 · 폴더 안의 텍스트·HTML 파일을 골라 끌어 주세요' : '텍스트·HTML 파일만 메모로 넣을 수 있어요 (txt · md · csv · html)'); return; }
  importFiles(files, dirs + other);
}, true);
// bytes -> text: a BOM says it, else UTF-8 if it is valid, else what an HTML file declares, else whichever of
// UTF-8 and Korean Windows (CP949) reads with fewer broken characters (one stray byte doesn't garble a UTF-8 file)
function decodeText(buf, html) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (err) { /* not clean UTF-8 */ }
  // UTF-16 without a BOM: every other byte is 0 in Latin text
  let z0 = 0, z1 = 0;
  const n = Math.min(b.length & ~1, 4096);
  for (let i = 0; i < n; i += 2) { if (!b[i]) z0++; if (!b[i + 1]) z1++; }
  if (n >= 8 && z1 > n / 6 && z0 < n / 40) return new TextDecoder('utf-16le').decode(b);
  if (n >= 8 && z0 > n / 6 && z1 < n / 40) return new TextDecoder('utf-16be').decode(b);
  if (html) {
    const m = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(new TextDecoder('latin1').decode(b.subarray(0, 2048)));
    if (m && !/^utf-?8$/i.test(m[1])) try { return new TextDecoder(m[1]).decode(b); } catch (err) { /* unknown label */ }
  }
  const bad = t => (t.match(/�/g) || []).length;
  const u = new TextDecoder('utf-8').decode(b), k = new TextDecoder('euc-kr').decode(b);
  return bad(u) <= bad(k) ? u : k;
}
function textToNoteHtml(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  return lines.map(l => `<div>${l ? esc(l) : '<br>'}</div>`).join('') || '<div><br></div>';
}
// an imported page laid out like the editor's own lines: the source's indentation and line breaks between tags
// don't become empty lines (the editor keeps white space as typed), loose text at the top goes in a line of its own
function tidyImported(box) {
  const isBlock = n => !!n && n.nodeType === 1 && BLOCK_TAGS.test(n.nodeName);
  const walk = el => {
    for (let c = el.firstChild; c;) {
      const next = c.nextSibling;
      if (c.nodeType === 3 && !/[^ \t\r\n]/.test(c.nodeValue)) {
        if (/^(UL|OL|TABLE|TBODY|TR)$/.test(el.nodeName) || !c.previousSibling || !next || isBlock(c.previousSibling) || isBlock(next)) c.remove();
      } else if (c.nodeType === 3 && (el === box || isBlock(el))) {     // a line's text starts and ends at its words
        const p = c.previousSibling;
        if (!p || isBlock(p) || p.nodeName === 'BR') c.nodeValue = c.nodeValue.replace(/^ +/, '');
        if (!next || isBlock(next) || next.nodeName === 'BR') c.nodeValue = c.nodeValue.replace(/ +$/, '');
      } else if (c.nodeType === 1 && c.nodeName !== 'PRE') walk(c);
      c = next;
    }
  };
  walk(box);
  let run = null;
  for (let c = box.firstChild; c;) {
    const next = c.nextSibling;
    if (isBlock(c)) run = null;
    else if (c.nodeName === 'BR') { if (!run) { const d = box.ownerDocument.createElement('div'); d.appendChild(box.ownerDocument.createElement('br')); box.insertBefore(d, c); } c.remove(); run = null; }
    else { if (!run) { run = box.ownerDocument.createElement('div'); box.insertBefore(run, c); } run.appendChild(c); }
    c = next;
  }
}
// an HTML file -> { title, html }: our own export's title line becomes the title (an empty one: the note had no
// title, its file was named after the first line); pictures inside are saved like pasted ones, a copy from the
// 메모 folder finds its pictures in images\; nothing in it is fetched while it comes in
function htmlToNote(text, fallback) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  let title = fallback;
  const h = doc.body && doc.body.firstElementChild;
  const own = !!(h && h.matches('h1.title')) || /^<!--ssn:[\w-]+-->/.test(text);
  if (h && h.matches('h1.title')) { title = h.textContent.trim(); h.remove(); }
  for (const img of doc.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src').replace(/\s+/g, ''), m = /^(?:\.\.\/)?images\/([A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp|bmp))$/i.exec(src);
    img.setAttribute('src', m ? IMG_URL + m[1] : src);
  }
  const only = doc.body && doc.body.children.length === 1 && doc.body.firstElementChild.nodeName === 'DIV' ? doc.body.firstElementChild : doc.body;
  const D = document.implementation.createHTMLDocument('');
  const box = D.createElement('div');
  box.appendChild(sanitize(only ? only.innerHTML : text, { doc: D, own }));
  for (const img of box.querySelectorAll('img[src^="data:"]')) {
    const m = /^data:image\/(png|jpe?g|gif|webp|bmp)(?:;[^,;]*)*;base64,([A-Za-z0-9+/=]+)$/i.exec(img.getAttribute('src'));
    if (!m || !HOST) continue;
    const ext = m[1].toLowerCase(), name = uid() + '.' + (ext === 'jpeg' ? 'jpg' : ext);
    host.send('saveImg', name, m[2]);
    img.setAttribute('src', IMG_URL + name);
  }
  tidyImported(box);
  return { title, html: box.innerHTML.trim() || '<div><br></div>' };
}
// Each file is read, checked and added one after another; a second drop waits for the first. A note has to stay
// light enough to type in (about a million characters), and all notes together well inside what the app can load.
const IMPORT_FILE_MAX = 30 * 1048576, IMPORT_NOTE_MAX = 1500000, NOTES_TOTAL_MAX = 150000000;
let importing = Promise.resolve();
function importFiles(files, ignored = 0) { importing = importing.then(() => importNow(files, ignored)).catch(err => console.error(err)); return importing; }
async function importNow(files, ignored) {
  const added = [], big = [], failed = [], same = [];
  let over = 0, broken = false;
  let total = 0;
  for (const id in bodies) total += (bodies[id] || '').length;
  for (const f of files) {
    if (S.notes.length >= MAX_NOTES) { over++; continue; }
    if (f.size > IMPORT_FILE_MAX) { big.push(f.name); continue; }
    let text;
    try { text = decodeText(await f.arrayBuffer(), isHtmlFile(f)); } catch (err) { failed.push(f.name); continue; }
    const base = f.name.replace(/\.[^.]+$/, '').trim() || f.name;
    let title = base, html;
    if (isHtmlFile(f)) ({ title, html } = htmlToNote(text, base));
    else {
      // our own .txt (the title, an empty line, the note) - or an untitled note's, named after its first line
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      if (lines.length > 1 && fileBaseOf(lines[0]) === fileBaseOf(base)) {
        if (!lines[1].trim()) { title = lines[0].trim(); text = lines.slice(2).join('\n'); } else title = '';
      }
      html = textToNoteHtml(text);
    }
    if (html.length > IMPORT_NOTE_MAX || total + html.length > NOTES_TOTAL_MAX) { big.push(f.name); continue; }
    if (S.notes.some(n => n.title === title && bodies[n.id] === html)) { same.push(f.name); continue; }   // the same file again
    if (/�/.test(html)) broken = true;
    const n = { id: uid(), title, color: COLOR_KEYS[S.notes.length % COLOR_KEYS.length], pinned: false, hotkey: null, created: now(), updated: now() };
    const fr = frag(html);
    n.preview = previewOf(fr); n.line1 = firstLineOf(fr);
    bodies[n.id] = html;
    total += html.length;
    S.notes.push(n);
    host.send('saveNote', n.id, html);
    added.push(n);
    if (added.length % 20 === 0) { stateDirty = true; flushState(); }   // a long drop: the list is saved as it grows
  }
  const why = [];
  if (over) why.push(`${MAX_NOTES}개가 넘어 ${over}개는 넣지 않았어요`);
  if (big.length) why.push(`너무 커서 못 넣었어요: ${big.slice(0, 3).join(', ')}${big.length > 3 ? ` 외 ${big.length - 3}개` : ''}`);
  if (failed.length) why.push(`읽지 못했어요: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ` 외 ${failed.length - 3}개` : ''}`);
  if (same.length) why.push(same.length === 1 ? `‘${same[0]}’은 이미 있는 메모예요` : `${same.length}개는 이미 있는 메모예요`);
  if (ignored) why.push(`텍스트·HTML이 아닌 ${ignored}개는 건너뛰었어요`);
  if (broken) why.push('일부 글자가 깨졌을 수 있어요');
  const more = why.length ? ' · ' + why.join(' · ') : '';
  if (!added.length) { toast(over && !big.length && !failed.length && !same.length ? `메모는 ${MAX_NOTES}개까지예요 · 안 쓰는 메모를 지운 뒤 넣어 주세요` : `메모를 추가하지 못했어요${more}`); return; }
  stateDirty = true; flushState();
  if (view === 'board') { multi.clear(); if (added.length > 1) added.forEach(n => multi.add(n.id)); selId = added[added.length - 1].id; }
  rerender();
  if (view === 'board') { const c = grid.querySelector(`.card[data-id="${selId}"]`); if (c) c.scrollIntoView({ block: 'nearest' }); }
  const t1 = added[0].title || titleOf(added[0]) || '제목 없음';
  if (added.length === 1) toast(`${josa(`‘${t1}’ 메모`, '을', '를')} 추가했어요${more}`, '열기', () => openNote(added[0].id));
  else toast(`메모 ${added.length}개를 추가했어요${more}`);
}
document.addEventListener('drop', e => { if (!e.defaultPrevented && e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
async function pasteFromClipboard(plain) {
  try {
    const items = await navigator.clipboard.read();
    let text = '', html = '';
    const files = [];
    for (const it of items) {
      if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
      if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text();
      for (const t of it.types) if (/^image\/(png|jpeg|gif|webp|bmp)$/.test(t)) files.push(new File([await it.getType(t)], 'clip', { type: t }));
    }
    ensureEditorFocus();
    doPaste(text, html, files, plain);
  } catch (err) { toast('클립보드를 읽지 못했어요. Ctrl+V를 써 주세요'); }
}
// the find bar is open and the cell has a match: a right-click copies the cell's value (no menu)
function copyFoundCell(e) {
  if (!findOpen || !hits.length) return false;
  const td = e.target.closest && e.target.closest('td');
  if (!td || !editor.contains(td) || !hits.some(h => td.contains(h.startContainer))) return false;
  const v = cellText(td);
  if (!v) return false;
  if (HOST) host.send('clip', String(v.length), v); else navigator.clipboard.writeText(v).catch(() => {});
  const one = v.replace(/\s*\n\s*/g, ' ');
  toast(`‘${one.length > 40 ? one.slice(0, 40) + '…' : one}’ 복사했어요`);
  return true;
}
editor.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (copyFoundCell(e)) return;
  const s = getSelection();
  const r = s.rangeCount ? s.getRangeAt(0) : null;
  const inSel = inNavRect(e.target.closest && e.target.closest('td')) ||
    (r && !r.collapsed && Array.from(r.getClientRects()).some(b => e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom));
  if (!inSel) { const cr = document.caretRangeFromPoint(e.clientX, e.clientY); if (cr) { s.removeAllRanges(); s.addRange(cr); } }
  const img = e.target.closest && e.target.closest('img');
  const td = e.target.closest && e.target.closest('td');
  const has = !getSelection().isCollapsed || !!td;   // a cell: cut / copy take the selected cell(s)
  const items = [];
  if (img) {                                      // sizes from the line width, never larger than the picture itself
    const lineW = editor.clientWidth - 104, natW = img.naturalWidth || lineW, curW = img.getBoundingClientRect().width;
    const px = f => Math.round(Math.min(natW, lineW * f));
    const size = f => () => edit(() => { if (f) img.style.width = px(f) + 'px'; else img.removeAttribute('style'); });
    const near = w => Math.abs(curW - w) < 2;
    items.push({ label: '작게 (⅓)', disabled: px(1 / 3) >= natW, on: near(px(1 / 3)), action: size(1 / 3) },
      { label: '중간 (⅔)', disabled: px(2 / 3) >= natW, on: near(px(2 / 3)), action: size(2 / 3) },
      { label: '원래 크기', on: !img.getAttribute('style'), action: size(0) }, { sep: true },
      { label: '이미지 삭제', icon: 'i-trash', danger: true, action: () => edit(() => img.remove()) }, { sep: true });
  }
  items.push(
    { label: '잘라내기', icon: 'i-cut', kbd: 'Ctrl+X', disabled: !has, action: () => edit(() => exec('cut')) },
    { label: '복사', icon: 'i-copy', kbd: 'Ctrl+C', disabled: !has, action: () => exec('copy') },
    { label: '붙여넣기', icon: 'i-paste', kbd: 'Ctrl+V', action: () => pasteFromClipboard(false) },
    { label: '서식 없이 붙여넣기', icon: 'i-paste', kbd: 'Ctrl+Shift+V', action: () => pasteFromClipboard(true) });
  if (td) {
    const t = td.closest('table');
    const rc = inNavRect(td) ? navRect() : null, nr = rc ? rc.r1 - rc.r0 + 1 : 1, nc = rc ? rc.c1 - rc.c0 + 1 : 1;
    items.push({ sep: true },
      { label: '위에 행 삽입', kbd: kl('rowAbove'), action: () => tableOp('rowAbove', t, td) },
      { label: '아래에 행 삽입', kbd: kl('rowBelow'), action: () => tableOp('rowBelow', t, td) },
      { label: '왼쪽에 열 삽입', kbd: kl('colBefore'), action: () => tableOp('colBefore', t, td) },
      { label: '오른쪽에 열 삽입', kbd: kl('colAfter'), action: () => tableOp('colAfter', t, td) }, { sep: true },
      { label: nr > 1 ? `행 ${nr}개 삭제` : '행 삭제', kbd: kl('delRow'), action: () => tableOp('delRow', t, td) },
      { label: nc > 1 ? `열 ${nc}개 삭제` : '열 삭제', kbd: kl('delCol'), action: () => tableOp('delCol', t, td) }, { sep: true },
      { label: t.classList.contains('hdr') ? '머리글 행 끄기' : '머리글 행 켜기', action: () => tableOp('header', t, td) },
      { label: '표 통째로 선택', icon: 'i-table', kbd: 'Alt+↑/↓ 옮기기', action: () => selectObj(t) },
      { label: '표 삭제', icon: 'i-trash', danger: true, action: () => tableOp('delTable', t, td) });
  } else if (!img) {                             // text formatting means nothing for a picture
    const pre = e.target.closest && e.target.closest('pre');
    if (pre && !pre.closest('td')) items.push({ sep: true },
      { label: '코드란 통째로 선택', kbd: 'Esc', action: () => selectObj(pre) },
      { label: '코드란 위로 옮기기', kbd: 'Alt+↑', action: () => moveObj(pre, true) },
      { label: '코드란 아래로 옮기기', kbd: 'Alt+↓', action: () => moveObj(pre, false) });
    items.push({ sep: true },
      { label: '굵게', glyph: '<b>B</b>', kbd: kl('bold'), action: () => fmt('bold') },
      { label: '밑줄', glyph: '<u>U</u>', kbd: kl('underline'), action: () => fmt('underline') },
      { label: '형광펜', icon: 'i-marker', kbd: kl('hl'), action: toggleHl },
      { label: '서식 지우기', icon: 'i-eraser', kbd: kl('clearFmt'), action: clearFmt });
  }
  items.push({ sep: true }, { label: '모두 선택', kbd: td ? '' : 'Ctrl+A', action: () => { clearNav(); editor.focus(); exec('selectAll'); } });
  showMenu(e.clientX, e.clientY, items);
});

