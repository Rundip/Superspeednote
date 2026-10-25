// ---------------------------------------------------------------- formatting
function fmt(cmd) {
  ensureEditorFocus();
  if (cmd === 'bold' && !closestSel('b,strong')) {      // headings and header cells already look bold
    const hc = navLive() ? navRect().r0 === 0 && navRect().r1 === 0 && nav.t.classList.contains('hdr') : !!closestSel('table.t.hdr tr:first-child > td');
    if (hc) { toast('머리글 행은 이미 굵게 보여요 · 끄려면 오른쪽 클릭 › 머리글 행 끄기'); return; }
    if (!navLive() && closestSel('h1,h2,h3')) { toast('제목은 이미 굵게 보여요'); return; }
  }
  let on = null;                                  // on cells: follow the first cell's state so the range ends up uniform
  if (onCells(() => { const s = document.queryCommandState(cmd); if (on === null) on = s; if (s === on) exec(cmd); })) return;
  edit(() => exec(cmd)); updateToolbar();
}
function rgbOf(hex) { const v = parseInt(hex.slice(1), 16); return `rgb(${v >> 16 & 255}, ${v >> 8 & 255}, ${v & 255})`; }
function keepSel(fn) {
  const r = selRange();
  const k = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
  fn();
  if (!k) return;
  try { const nr = document.createRange(); nr.setStart(k[0], k[1]); nr.setEnd(k[2], k[3]); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); } catch (e) { /* node moved */ }
}
// Text colour / highlight: the pen picked in the menu stays the toolbar's pen (shown on its bar, saved) until another
// is picked - the A / marker button applies that pen. Black is a colour like the others; '형광펜 없음' is a pen too
// (the button then takes highlights off).
function applyFg(v, choose) {
  ensureEditorFocus();
  if (choose && v) { st.fg = v; saveStateSoon(); updateSwatches(); }
  const strip = () => keepSel(() => {
    for (const f of $$('font[color]', editor)) if (f.getAttribute('color').toLowerCase() === '#010203') { f.removeAttribute('color'); if (!f.attributes.length) unwrap(f); }
    for (const sp of $$('span[style*="color"]', editor)) if (sp.style.color === 'rgb(1, 2, 3)') { sp.style.removeProperty('color'); if (!sp.getAttribute('style')) unwrap(sp); }
  });
  // no colour = apply a sentinel colour, then strip it
  if (onCells(() => exec('foreColor', v || '#010203'), v ? null : strip)) return;
  edit(() => { exec('foreColor', v || '#010203'); if (!v) strip(); });
}
function applyHl(v, choose) {
  ensureEditorFocus();
  if (choose) { st.hl = v || ''; saveStateSoon(); updateSwatches(); }
  if (onCells(() => exec('hiliteColor', v || 'rgb(1, 2, 3)'), v ? null : () => keepSel(stripSentinelBg))) return;
  const r = selRange();
  // no highlight at a bare caret: what is typed next gets none (a see-through background beats the one around it;
  // the old way left a near-black background on it)
  if (!v && r && r.collapsed) { edit(() => exec('hiliteColor', 'transparent')); return; }
  edit(() => { exec('hiliteColor', v || 'rgb(1, 2, 3)'); if (!v) keepSel(stripSentinelBg); });
}
function stripSentinelBg() {
  for (const el of $$('[style*="background"]', editor)) {
    if (el.style.backgroundColor !== 'rgb(1, 2, 3)') continue;
    el.style.removeProperty('background-color');
    if (!el.getAttribute('style')) { el.removeAttribute('style'); if (el.nodeName === 'SPAN' && !el.attributes.length) unwrap(el); }
  }
}
function toggleHl() {
  ensureEditorFocus();
  if (!st.hl) { applyHl(null); return; }          // pen '형광펜 없음': the button takes highlights off
  const want = rgbOf(st.hl).replace(/\s/g, '');
  let has;
  if (navLive()) {                                // selected cells: is the first cell already highlighted?
    const c = cellAt(nav.t, Math.min(nav.ar, nav.fr), Math.min(nav.ac, nav.fc));
    has = !!c && Array.from(c.querySelectorAll('[style*="background"]')).some(x => x.style.backgroundColor.replace(/\s/g, '') === want);
  } else has = (document.queryCommandValue('backColor') || '').replace(/\s/g, '') === want;
  applyHl(has ? null : st.hl);
}
function clearFmt() {
  ensureEditorFocus();
  if (onCells(() => { exec('removeFormat'); exec('hiliteColor', 'rgb(1, 2, 3)'); }, () => keepSel(stripSentinelBg))) return;
  const r = selRange(), bare = !!r && r.collapsed;   // at a bare caret: the next letters plain (no near-black background)
  edit(() => { exec('removeFormat'); exec('hiliteColor', bare ? 'transparent' : 'rgb(1, 2, 3)'); if (!bare) keepSel(stripSentinelBg); });
  updateToolbar();
}
function setBlock(tag) {
  ensureEditorFocus();
  edit(() => {
    const curTag = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    exec('formatBlock', curTag === tag && tag !== 'div' ? 'div' : tag);
  });
  updateToolbar();
}
// ---- list lines (글머리 / 번호 / 체크): Backspace and Tab work line by line, like a word processor
const isList = n => !!n && (n.nodeName === 'UL' || n.nodeName === 'OL');
// the list item the caret sits at the very start of (nothing typed before it on that line)
function liAtLineStart() {
  const r = selRange();
  if (!r || !r.collapsed) return null;
  const li = closestSel('li');
  if (!li || !editor.contains(li)) return null;
  const pre = document.createRange();
  pre.setStart(li, 0); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString() || pre.cloneContents().querySelector('img') ? null : li;
}
// Backspace at the start of a list line, the way back up:
//  - a sub-item goes up one level at once, bullet and all (like Shift+Tab): it becomes the next item of the
//    level above - numbered on from it - and the lines below it become its sub-items
//  - a top-level line: the 1st press takes its bullet off (the text stays where it is, the numbers below carry
//    on), the next press makes it a normal line; an empty top-level line leaves the list at once
function listBackspace() {
  const li = liAtLineStart();
  if (!li) return false;
  const up = li.parentElement.parentElement, nested = isList(up) || (up && up.nodeName === 'LI');
  if (!nested && up && up.nodeName === 'TD') { edit(() => cellUnlist(li)); return true; }
  edit(() => {
    if (nested) {
      li.classList.remove('nob');
      liftItem(li);
      const L = li.parentElement;
      if (L && !L.classList.contains('checklist')) delete li.dataset.checked;
      else if (L && !li.dataset.checked) li.dataset.checked = 'false';
    } else if (!li.classList.contains('nob') && !emptyHtml(li.innerHTML)) {
      li.classList.add('nob'); delete li.dataset.checked;
      placeCaret(li, false);
    } else liftItem(li);
  });
  return true;
}
// Shift+↑/↓ from the start (or end) of a line: Chrome keeps the caret's x from line to line, so a selection made
// line by line ran a few characters into a less indented line (a sub-item -> the item below it: 2 Hangul / 3 Latin
// letters). Crossing into another line it now lands on that line's start (or end), like a word processor.
function lineEdge(node, off) {                    // 'start' / 'end' of its visual line, or null in the middle
  const blk = blockOf(node);
  if (!blk || blk.nodeName === 'TD') return null;
  const t = textOffset(blk, node, off), len = blk.textContent.length;
  if (t === 0) return 'start';
  if (t >= len) return 'end';
  const at = k => { const [n, o] = textPos(blk, k), r = document.createRange(); r.setStart(n, o); r.setEnd(...textPos(blk, k + 1)); return r.getBoundingClientRect(); };
  const before = at(t - 1), after = at(t);
  return after.top > before.top + 2 ? 'start' : null;    // the character after it starts the next visual line
}
function lineSelect(down) {
  const s = getSelection();
  if (!s.rangeCount || !s.focusNode || !editor.contains(s.focusNode)) return false;
  const edge = lineEdge(s.focusNode, s.focusOffset);
  if (!edge) return false;
  const b0 = blockOf(s.focusNode);
  s.modify('extend', down ? 'forward' : 'backward', 'line');
  if (blockOf(s.focusNode) !== b0) s.modify('extend', edge === 'start' ? 'backward' : 'forward', 'lineboundary');
  return true;
}
// a list item straight in a table cell: one Backspace and it is the cell's plain text again (no bullet-less step -
// an indented line in a narrow cell only looks broken); lines before / after it stay list items
function cellUnlist(li) {
  const list = li.parentElement, after = [];
  for (let n = li.nextSibling; n; n = n.nextSibling) after.push(n);
  let tail = null;
  if (after.length) { tail = list.cloneNode(false); tail.removeAttribute('start'); after.forEach(n => tail.appendChild(n)); }
  const frag = document.createDocumentFragment();
  Array.from(li.childNodes).forEach(n => frag.appendChild(n));
  const first = frag.firstChild, at = document.createTextNode('');
  list.after(at);
  li.remove();
  if (!list.querySelector('li')) list.remove();
  at.before(frag);                                // its text where the item was (a list is a block: lines stay apart)
  if (tail) at.after(tail);
  const td = at.parentNode, r = document.createRange();
  if (first && first.isConnected) r.setStartBefore(first); else r.setStartBefore(at);
  r.collapse(true);
  at.remove();
  if (!td.firstChild) { td.innerHTML = '<br>'; r.setStart(td, 0); r.collapse(true); }
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
// one level out; from the top level the line leaves the list as a normal line
function liftItem(li) {
  const list = li.parentElement, holder = list.parentElement;
  const after = [];
  for (let n = li.nextSibling; n; n = n.nextSibling) after.push(n);
  let tail = null;
  if (after.length) { tail = list.cloneNode(false); tail.removeAttribute('start'); after.forEach(n => tail.appendChild(n)); }
  let moved;
  if (isList(holder)) {                           // Chrome nests a list straight inside its parent list
    list.after(li);
    if (tail) li.after(tail);                     // the lines below become this line's sub-items
    moved = li;
  } else if (holder.nodeName === 'LI') {          // pasted HTML: list inside a list item
    holder.after(li);
    if (tail) li.appendChild(tail);
    moved = li;
  } else {                                        // top level: a normal line between the two halves
    if (tail) {
      list.after(tail);
    }
    const d = document.createElement('div');
    while (li.firstChild) d.appendChild(li.firstChild);
    if (!d.firstChild) d.innerHTML = '<br>';
    list.after(d);
    li.remove();
    moved = d;
  }
  if (!list.querySelector('li')) list.remove();
  placeCaret(moved, false);
  return moved;
}
// one level in: the line joins the sub-list right above it (or starts one), its own sub-items go along one level
// deeper. Done here rather than by the browser's indent, which wraps a line it doesn't take for a list item (a list
// split by earlier edits) in a quote box.
function sinkItem(li) {
  const L = li.parentElement, prev = li.previousElementSibling;
  const kids = li.nextElementSibling && isList(li.nextElementSibling) ? li.nextElementSibling : null;
  let T = null;
  if (prev && isList(prev)) T = prev;                                            // Chrome's shape: a list after its item
  else if (prev && prev.nodeName === 'LI' && isList(prev.lastElementChild)) T = prev.lastElementChild;   // pasted shape
  if (!T) {
    T = document.createElement(L.nodeName === 'OL' ? 'OL' : 'UL');
    if (L.classList.contains('checklist')) T.className = 'checklist';
    li.before(T);
  }
  T.appendChild(li);
  if (kids) li.after(kids);
  const nx = T.nextElementSibling;                // the rest of a sub-list that was split off: one list again
  if (nx && nx !== kids && isList(nx) && nx.nodeName === T.nodeName) { while (nx.firstChild) T.appendChild(nx.firstChild); nx.remove(); }
  if (T.classList.contains('checklist')) { if (!li.dataset.checked) li.dataset.checked = 'false'; } else delete li.dataset.checked;
}
// Tab / Shift+Tab on a list line: indent / outdent the line, keeping checklists checklists
function listIndent(out) {
  const li = closestSel('li'), r = selRange();
  if (li && r && li.contains(r.startContainer) && li.contains(r.endContainer) && !li.closest('td')) {   // one line: done by hand,
    const k = [textOffset(li, r.startContainer, r.startOffset), textOffset(li, r.endContainer, r.endOffset)];   // caret kept
    edit(() => {
      const moved = out ? liftItem(li) : (sinkItem(li), li);
      if (moved) setSelOffsets(moved, k[0], k[1]);
    });
    updateToolbar();
    return;
  }
  // several lines: each list line in the selection moves one level (top to bottom in, bottom to top out); the
  // selection then covers the same lines again
  if (!r) return;
  const lis = $$('li', editor).filter(x => r.intersectsNode(x) && !x.closest('td'));
  if (!lis.length) return;
  edit(() => {
    const moved = [];
    if (out) for (let i = lis.length - 1; i >= 0; i--) moved.unshift(liftItem(lis[i]) || lis[i]);
    else for (const x of lis) { sinkItem(x); moved.push(x); }
    const a = moved[0], z = moved[moved.length - 1];
    if (a && z && a.isConnected && z.isConnected) {
      const nr = document.createRange(); nr.selectNodeContents(a); const e2 = document.createRange(); e2.selectNodeContents(z);
      nr.setEnd(e2.endContainer, e2.endOffset);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(nr);
    }
  });
  updateToolbar();
}
// Numbers of numbered lists, in one pass from the top of the note (the way word processors do it). A line keeps
// no number of its own: only its depth (list nesting) and its list's kind (data-type: number / hangul / alpha, or
// none = the depth's default 1. 가. 1) ...). For each list line, top to bottom, counters[depth] goes up by one and
// every deeper counter starts again; a normal line between lists ends the run (all counters start again). A list
// split in two by edits carries on its numbers (its start), and a list made without a kind takes the kind of the
// list before it at the same depth - so deleting or adding a line in the middle never jumps back to '1.'.
const LIST_KINDS = new Set(['number', 'hangul', 'alpha']);
function relist() {
  if (!editor.querySelector('ol')) return;
  const counters = new Array(10).fill(0), kinds = new Array(10).fill(null);
  const run = (L, d) => {
    d = Math.min(d, 9);
    let kind = 'bullet';
    if (L.nodeName === 'OL') {
      kind = LIST_KINDS.has(L.dataset.type) ? L.dataset.type : '';
      if (!kind && kinds[d] && kinds[d] !== 'bullet') { kind = kinds[d]; L.dataset.type = kind; }   // inherited
    }
    if (kinds[d] !== null && kinds[d] !== kind) counters[d] = 0;      // another kind at this depth counts again
    kinds[d] = kind;
    // started by typing its number ("2. ", "다. ", "c. "): it starts right there, whatever came before it
    const from = L.nodeName === 'OL' ? parseInt(L.dataset.start, 10) : 0;
    if (from > 0) counters[d] = from - 1;
    if (L.nodeName === 'OL') {
      const first = counters[d] + 1;
      if (first > 1) { if (L.getAttribute('start') !== String(first)) L.setAttribute('start', first); }
      else if (L.hasAttribute('start')) L.removeAttribute('start');
    }
    for (const c of L.children) {
      if (c.nodeName === 'LI') {
        if (!c.classList.contains('nob')) { counters[d]++; for (let k = d + 1; k < 10; k++) counters[k] = 0; }
        for (const sub of c.children) if (isList(sub)) run(sub, d + 1);   // pasted shape: a list inside its item
      } else if (isList(c)) run(c, d + 1);                               // Chrome's shape: a list after its item
    }
  };
  for (const b of editor.children) {
    if (isList(b)) run(b, 0);
    else { counters.fill(0); kinds.fill(null); }                       // a normal line: the list run ends
  }
}
// what number a numbered line shows (1. 가. 1) 가) (1) (가) ① ㉮ by depth, or its list's own kind) - for copying as text
function olLabel(li) {
  const ol = li.parentElement;
  let n = ol.start || 1, depth = 0;
  for (let s = li.previousElementSibling; s; s = s.previousElementSibling) if (s.nodeName === 'LI' && !s.classList.contains('nob')) n++;
  for (let p = ol; p && p !== editor; p = p.parentElement) if (p.nodeName === 'OL') depth++;
  const ko = i => { let t = ''; for (i--; i >= 0; i = Math.floor(i / 14) - 1) t = '가나다라마바사아자차카타파하'[i % 14] + t; return t; };
  if (ol.dataset.type === 'number') return n + '. ';
  if (ol.dataset.type === 'hangul') return ko(n) + '. ';
  if (ol.dataset.type === 'alpha') { let t = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) t = String.fromCharCode(97 + i % 26) + t; return t + '. '; }
  switch ((depth - 1) % 8) {
    case 1: return ko(n) + '. ';
    case 2: return n + ') ';
    case 3: return ko(n) + ') ';
    case 4: return '(' + n + ') ';
    case 5: return '(' + ko(n) + ') ';
    case 6: return n <= 20 ? String.fromCharCode(0x2460 + n - 1) + ' ' : '(' + n + ') ';
    case 7: return n <= 14 ? String.fromCharCode(0x326E + n - 1) + ' ' : '(' + ko(n) + ') ';
    default: return n + '. ';
  }
}
// the caret as character offsets inside a block, so it can be put back after the block is rebuilt
function textOffset(root, node, off) { const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, off); return r.toString().length; }
function setSelOffsets(root, a, b) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), at = [null, 0, null, 0];
  let n, pos = 0, last = null;
  while ((n = w.nextNode())) {
    const len = n.nodeValue.length;
    if (!at[0] && a <= pos + len) { at[0] = n; at[1] = a - pos; }
    if (!at[2] && b <= pos + len) { at[2] = n; at[3] = b - pos; break; }
    pos += len; last = n;
  }
  if (!at[0]) { placeCaret(root, true); return; }
  if (!at[2]) { at[2] = last || at[0]; at[3] = at[2].nodeValue.length; }
  const r = document.createRange(); r.setStart(at[0], at[1]); r.setEnd(at[2], at[3]);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function caretKeep() {                            // [block, start, end] for a caret inside one non-list line
  const r = selRange(), b = r && blockOf(r.startContainer);
  if (!b || /^(LI|TD)$/.test(b.nodeName) || !b.contains(r.endContainer)) return null;
  return [textOffset(b, r.startContainer, r.startOffset), textOffset(b, r.endContainer, r.endOffset)];
}
// Chrome builds a list made from a top-level line inside that line's <div>: lift it out (the caret stays put)
function liftList() {
  const li = closestSel('li'), L = li && li.closest('ul,ol'), w = L && L.parentNode;
  if (!w || w === editor || w.nodeName !== 'DIV' || w.parentNode !== editor || w.childNodes.length !== 1) return;
  const r = selRange(), k = r && li.contains(r.startContainer) ? [textOffset(li, r.startContainer, r.startOffset), textOffset(li, r.endContainer, r.endOffset)] : null;
  unwrap(w);
  if (k) setSelOffsets(li, k[0], k[1]);
}
function toggleList(kind) {
  // A Korean syllable still being typed is finished first, and a first line typed as bare text gets its line box:
  // the list made around a syllable the IME was still composing came apart (the box gone, the letters doubled)
  finishIme();
  ensureEditorFocus();
  // selected cells (not being edited): each whole cell, they stay selected. Chrome copies the selected cell's look
  // (no caret, clear background) onto the text it takes out of a list: that wrapper goes
  if (onCells(c => { editor.classList.remove('cellnav'); listInner(kind); plainSpans(c); })) return;
  if (needsRoot()) ensureRoot();
  const keep = caretKeep();                       // making a list keeps the caret where you were typing
  // in a cell being edited: the caret's place in the cell's text, kept the same way
  const td = !keep && closestSel('td'), r0 = td && selRange();
  const keepTd = r0 ? [textOffset(td, r0.startContainer, r0.startOffset), textOffset(td, r0.endContainer, r0.endOffset)] : null;
  edit(() => {
    listInner(kind);
    const li = closestSel('li');
    if (li) { liftList(); if (keep) setSelOffsets(li, keep[0], keep[1]); }
    if (keepTd && td.isConnected) setSelOffsets(td, keepTd[0], keepTd[1]);
  });
  updateToolbar();
}
// <span style="background-color: rgba(0, 0, 0, 0); caret-color: transparent"> left by an edit command: nothing to keep
function plainSpans(root) {
  for (const sp of root.querySelectorAll('span[style]')) {
    const st = sp.style;
    if (/^(transparent|rgba\(0, 0, 0, 0\))$/.test(st.backgroundColor)) st.removeProperty('background-color');
    st.removeProperty('caret-color');
    if (!sp.getAttribute('style').trim()) unwrap(sp);
  }
}
function listInner(kind) {
  const li = closestSel('li');
  const list = li && li.parentElement;
  const isChk = list && list.classList.contains('checklist');
  if (li && li.classList.contains('nob')) {     // a line whose bullet was taken off: the button puts it back
    li.classList.remove('nob');
    if (!li.className) li.removeAttribute('class');
    const same = kind === 'chk' ? isChk : kind === 'ol' ? list.nodeName === 'OL' : list.nodeName === 'UL' && !isChk;
    if (same) return;
  }
  if (kind === 'chk') {
    if (isChk) { exec('insertUnorderedList'); return; }
    if (list && list.nodeName === 'UL') { list.classList.add('checklist'); return; }
    exec('insertUnorderedList');
    const l2 = closestSel('li');
    if (l2 && l2.parentElement.nodeName === 'UL') l2.parentElement.classList.add('checklist');
    return;
  }
  if (kind === 'ul' && isChk) { list.classList.remove('checklist'); if (!list.className) list.removeAttribute('class'); return; }
  exec(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
}
function stamp() {
  ensureEditorFocus();
  const d = new Date(), p = x => String(x).padStart(2, '0');
  edit(() => exec('insertText', `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} (${'일월화수목금토'[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}`));
}
function insertHr() {
  ensureEditorFocus();
  clearObj();
  edit(() => { const hr = document.createElement('hr'); placeBlock(hr); placeCaret(hr.nextElementSibling, false); });
}
function blockOf(n) {
  while (n && n !== editor) {
    if (n.nodeType === 1 && /^(DIV|P|H[1-6]|LI|BLOCKQUOTE|PRE|TD)$/.test(n.nodeName)) return n;
    n = n.parentNode;
  }
  return null;
}
// "# ", "- ", "1. ", "[] ", "> ", "``` " at the start of a line
// the number a typed marker stands for: "3" -> 3, "다" -> 3, "c" -> 3
const KO_ORDER = '가나다라마바사아자차카타파하';
function markerNum(t) { return /\d/.test(t) ? parseInt(t, 10) : /[a-zA-Z]/.test(t) ? t.toLowerCase().charCodeAt(0) - 96 : KO_ORDER.indexOf(t) + 1; }
// a numbered list of its own from this line on (the lines before it stay as they were), started at the typed number
function startListAt(li, kind, num) {
  let L = li.parentElement;
  if (L.firstElementChild !== li) {
    const nl = document.createElement('ol');
    L.after(nl);
    while (li.nextSibling) nl.appendChild(li.nextSibling);   // the lines after it (and their sub-items) go along
    nl.prepend(li);
    L = nl;
  }
  L.dataset.type = kind;
  L.dataset.start = num;
}
// Typing a marker - "1. ", "2. ", "가. ", "다. ", "a. " - at the start of a line makes it a numbered line starting at
// that number, also several lines (or a picture, a table) after a list: "2. " carries on from a "1." above, "1. "
// starts again at 1.
function mdShortcut() {
  const r = selRange();
  if (!r || !r.collapsed) return false;
  const blk = blockOf(r.startContainer);
  if (blk && blk.nodeName === 'LI' && blk.parentElement.nodeName === 'OL' && !blk.closest('td')) {   // "가. " typed in a numbered line
    const pre0 = document.createRange(); pre0.setStart(blk, 0); pre0.setEnd(r.startContainer, r.startOffset);
    const m0 = /^(\d{1,3}|[가나다라마바사아자차카타파하]|[a-zA-Z])[.)]$/.exec(pre0.toString());
    if (!m0) return false;
    const k0 = /\d/.test(m0[1]) ? 'number' : /[a-zA-Z]/.test(m0[1]) ? 'alpha' : 'hangul';
    exec('insertText', ' '); histCommit();
    edit(() => {
      const r2 = selRange(), p2 = document.createRange(); p2.setStart(blk, 0); p2.setEnd(r2.startContainer, r2.startOffset);
      const s0 = getSelection(); s0.removeAllRanges(); s0.addRange(p2);
      exec('delete');
      startListAt(blk, k0, markerNum(m0[1]));
    });
    return true;
  }
  if (!blk || /^(LI|TD|PRE)$/.test(blk.nodeName)) return false;
  const pre = document.createRange();
  pre.setStart(blk, 0); pre.setEnd(r.startContainer, r.startOffset);
  const map = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'ul', '*': 'ul', '[]': 'chk', '[ ]': 'chk', '>': 'blockquote', '```': 'pre' };
  const typed = pre.toString(), m = /^(\d{1,3}|[가나다라마바사아자차카타파하]|[a-zA-Z])[.)]$/.exec(typed);
  const numKind = m ? (/\d/.test(m[1]) ? 'number' : /[a-zA-Z]/.test(m[1]) ? 'alpha' : 'hangul') : null;
  const kind = numKind ? 'ol' : map[typed];
  if (!kind) return false;
  // Only a 본문 line turns into a list (or a quote / code) by what is typed at its start. A heading, a quote's line
  // keep it as their text: "1. 개요", "- 참고". (In a heading "# ", "## " still change its level.)
  const body = /^(DIV|P)$/.test(blk.nodeName) && !blk.closest('blockquote, pre, td, li');
  if (!body && !(/^H[1-6]$/.test(blk.nodeName) && /^h\d$/.test(kind))) return false;
  exec('insertText', ' '); histCommit();          // Ctrl+Z brings back what you typed ("# "), not an empty line
  edit(() => {
    const r2 = selRange(), pre2 = document.createRange(); pre2.setStart(blk, 0); pre2.setEnd(r2.startContainer, r2.startOffset);
    const s = getSelection(); s.removeAllRanges(); s.addRange(pre2);
    exec('delete');
    if (kind === 'ul' || kind === 'ol') {
      exec(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList'); liftList();
      const li = closestSel('li');
      if (numKind && li && li.parentElement.nodeName === 'OL') startListAt(li, numKind, markerNum(m[1]));   // the pass gives the numbers
    }
    else if (kind === 'chk') { exec('insertUnorderedList'); const li = closestSel('li'); if (li) li.parentElement.classList.add('checklist'); liftList(); }
    else exec('formatBlock', kind);
  });
  updateToolbar();
  return true;
}
// Code blocks and quotes stay ONE box while you type (Enter = a new line inside it); Enter on an empty last line
// leaves the box, like most editors. (Chrome split each Enter into a new <pre>, with no way out.)
function textPos(root, k) {                       // [text node, offset] k characters into root
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n, pos = 0, last = null;
  while ((n = w.nextNode())) { if (k <= pos + n.nodeValue.length) return [n, k - pos]; pos += n.nodeValue.length; last = n; }
  return last ? [last, last.nodeValue.length] : [root, 0];
}
// A quote holds its lines as <div>s: Enter starts a new <div> line inside it with the caret at its very start. (A <br>
// line break put the caret after a <br>, where Windows' Korean IME types the first consonant twice: "ㄱ가".) An
// older quote whose lines are split by <br> is turned into <div> lines first. Enter on an empty last line leaves.
function quoteLines(box) {
  const kids = [...box.childNodes];
  if (!kids.some(n => n.nodeType === 3 || (n.nodeType === 1 && !BLOCK_TAGS.test(n.nodeName)))) return;
  const lines = [];
  let cur = [];
  for (const n of kids) {
    if (n.nodeName === 'BR') { lines.push(cur); cur = []; }
    else if (n.nodeType === 1 && BLOCK_TAGS.test(n.nodeName)) { if (cur.length) lines.push(cur); lines.push(n); cur = []; }
    else cur.push(n);
  }
  if (cur.length || !lines.length) lines.push(cur);
  else if (Array.isArray(lines[lines.length - 1]) && !lines[lines.length - 1].length && kids[kids.length - 1].nodeName === 'BR' && lines.length > 1) lines.pop();   // the closing <br> only shows the line before it
  box.textContent = '';
  for (const l of lines) {
    if (!Array.isArray(l)) { box.appendChild(l); continue; }
    const d = document.createElement('div');
    l.forEach(n => d.appendChild(n));
    if (!d.textContent && !d.querySelector('img,br')) d.appendChild(document.createElement('br'));
    box.appendChild(d);
  }
}
function quoteEnter(box) {
  edit(() => {
    const r = selRange(), mk = document.createElement('span');
    r.insertNode(mk);
    quoteLines(box);
    let line = mk;
    while (line && line.parentNode !== box) line = line.parentNode;
    const empty = n => !n.textContent.replace(/​/g, '').trim() && !n.querySelector('img,table,hr');
    if (!line || !/^(DIV|P)$/.test(line.nodeName)) {   // somewhere unexpected: a plain line break as before
      const c = document.createRange(); c.setStartBefore(mk); c.collapse(true); mk.remove();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(c);
      exec('insertLineBreak');
      return;
    }
    if (empty(box)) {                              // an empty quote: Enter makes it a normal line
      mk.remove();
      const d = document.createElement('div'); d.innerHTML = '<br>';
      box.replaceWith(d); placeCaret(d, false);
      return;
    }
    if (empty(line) && line === box.lastElementChild) {   // empty last line: out of the quote
      mk.remove(); line.remove();
      const d = document.createElement('div'); d.innerHTML = '<br>';
      box.after(d); placeCaret(d, false);
      return;
    }
    const rest = document.createRange(); rest.setStartAfter(mk); rest.setEnd(line, line.childNodes.length);
    const tail = rest.extractContents();
    mk.remove();
    const nl = document.createElement(line.nodeName === 'P' ? 'P' : 'DIV');
    nl.appendChild(tail);
    for (const x of [line, nl]) if (!x.textContent && !x.querySelector('img')) x.innerHTML = '<br>';
    line.after(nl);
    placeCaret(nl, false);                        // the very start of the new line (in front of its <br>)
  });
}
function boxEnter() {
  const r = selRange();
  if (!r || !r.collapsed) return false;
  const box = closestSel('pre') || closestSel('blockquote');
  if (!box || box.closest('td')) return false;
  if (box.nodeName === 'BLOCKQUOTE') {            // a list inside a quote: its own Enter
    const li = closestSel('li');
    if (li && box.contains(li)) return false;
    quoteEnter(box);
    return true;
  }
  const before = document.createRange(); before.setStart(box, 0); before.setEnd(r.startContainer, r.startOffset);
  const after = document.createRange(); after.setStart(r.startContainer, r.startOffset); after.setEnd(box, box.childNodes.length);
  const tb = before.toString();
  if (after.toString().replace(/\n$/, '') === '' && (tb === '' || tb.endsWith('\n'))) {   // empty last line: out of the box
    edit(() => {
      if (tb) { const [n, o] = textPos(box, tb.length - 1), cut = document.createRange(); cut.setStart(n, o); cut.setEnd(box, box.childNodes.length); cut.deleteContents(); }
      const d = document.createElement('div'); d.innerHTML = '<br>';
      if (box.textContent.trim()) box.after(d); else box.replaceWith(d);
      placeCaret(d, false);
    });
  } else edit(() => exec('insertLineBreak'));
  return true;
}
// A code block (or quote) at the very end of a note had no way out below it. ↓ on its last line now goes to the
// line under it - made when there is none - and so does a click in the empty space under the note's last block.
function lineBelow(box) {
  let n = box.nextElementSibling;
  if (!n || !/^(DIV|P|H[1-6])$/.test(n.nodeName)) edit(() => { n = document.createElement('div'); n.innerHTML = '<br>'; box.after(n); });
  placeCaret(n, false);
  scrollCaretIntoView();
}
function boxDown() {
  const r = selRange();
  if (!r || !r.collapsed) return false;
  const box = closestSel('pre') || closestSel('blockquote');
  if (!box || box.closest('td')) return false;       // also a code block inside a list item / a wrapping line
  const rest = document.createRange(); rest.setStart(r.startContainer, r.startOffset); rest.setEnd(box, box.childNodes.length);
  const tail = document.createElement('div');
  tail.appendChild(rest.cloneContents());
  if (toPlain(tail).replace(/\n+$/, '').includes('\n')) return false;     // another line still follows: the browser's own ↓
  const s = getSelection(), top0 = r.getBoundingClientRect().top, at = [s.focusNode, s.focusOffset];
  s.modify('move', 'forward', 'line');
  const f = s.focusNode;
  if (f && !box.contains(f)) {                    // the browser went down by itself - onto a real line below?
    const b = blockOf(f);
    if (b && !b.contains(box)) return true;
  } else {
    const r1 = selRange(), top1 = r1 ? r1.getBoundingClientRect().top : 0;
    if (top0 && top1 > top0 + 2) return true;     // a long last line wraps: down within it
  }
  // stuck, or somewhere with no line (beside the block, or the list item holding it): a line under it all
  try { s.collapse(at[0], at[1]); } catch (e) { /* moved */ }
  lineBelow(topLevel(box) || box);
  return true;
}
editor.addEventListener('mousedown', e => {
  if (e.button !== 0 || e.target !== editor || e.shiftKey || e.detail > 1) return;
  const last = editor.lastElementChild;
  // under the last block when it isn't a plain line (a code block, quote, table, divider, a list - or a line or
  // list item holding a code block / table)
  if (!last || e.clientY <= last.getBoundingClientRect().bottom) return;
  if (/^(DIV|P|H[1-6])$/.test(last.nodeName) && !last.querySelector('pre,table,blockquote')) return;
  e.preventDefault();
  ensureEditorFocus();
  lineBelow(last);
});
// Backspace at the start of the line after a table (Delete at the end of the line before one) used to do nothing:
// an empty line goes away into the table's last cell, otherwise the table gets selected (pressed again: deleted)
function besideTable(back) {
  const r = selRange();
  if (!r || !r.collapsed || cellOf(r.startContainer)) return false;
  const blk = topLevel(r.startContainer);
  if (!blk || blk.nodeType !== 1 || /^(TABLE|HR|UL|OL)$/.test(blk.nodeName)) return false;
  const t = back ? blk.previousElementSibling : blk.nextElementSibling;
  if (!t || t.nodeName !== 'TABLE' || !t.rows.length) return false;
  const off = textOffset(blk, r.startContainer, r.startOffset);
  if (back ? off !== 0 : off !== blk.textContent.length) return false;
  if (back && !blk.textContent && !blk.querySelector('img,hr') && blk.nextElementSibling) {
    edit(() => blk.remove());
    setNav(t, t.rows.length - 1, t.rows[t.rows.length - 1].cells.length - 1);
    return true;
  }
  selectObj(t);
  return true;
}
function blockBackspace() {
  const r = selRange();
  if (!r || !r.collapsed) return false;
  const blk = blockOf(r.startContainer);
  if (!blk || blk.parentNode !== editor || !/^(H1|H2|H3|BLOCKQUOTE|PRE)$/.test(blk.nodeName) || textOffset(blk, r.startContainer, r.startOffset)) return false;
  edit(() => exec('formatBlock', 'div'));
  updateToolbar();
  return true;
}
function hrShortcut() {
  const blk = blockOf(selNode());
  if (!blk || blk.nodeName !== 'DIV' || blk.textContent !== '---') return false;
  const w = blk.parentNode;                       // a line inside an older list wrapper <div>: split it out first
  if (w !== editor && !(w.nodeName === 'DIV' && w.parentNode === editor)) return false;
  edit(() => {
    if (w !== editor) {
      const tail = document.createElement('div');
      while (blk.nextSibling) tail.appendChild(blk.nextSibling);
      w.after(blk);
      if (tail.firstChild) blk.after(tail);
      if (!w.firstChild) w.remove();
    }
    const hr = document.createElement('hr');
    const d = document.createElement('div'); d.innerHTML = '<br>';
    blk.replaceWith(hr); hr.after(d); placeCaret(d, false);
  });
  return true;
}
function updateToolbar() {
  if (view !== 'editor' || document.activeElement !== editor) return;
  const boldShown = closestSel('h1,h2,h3') || closestSel('table.t.hdr tr:first-child > td');   // bold by style: only a real <b> counts
  for (const b of $$('[data-cmd]', toolbar)) b.classList.toggle('on', b.dataset.cmd === 'bold' && boldShown ? !!closestSel('b,strong') : document.queryCommandState(b.dataset.cmd));
  const blk = (document.queryCommandValue('formatBlock') || 'div').toLowerCase();
  $('#tbBlockLbl').textContent = (BLOCKS.find(x => x[0] === blk) || BLOCKS[0])[1];
  const li = closestSel('li'), L = li && li.parentElement;
  const chk = !!(L && L.classList.contains('checklist'));
  toolbar.querySelector('[data-list=ul]').classList.toggle('on', !!L && L.nodeName === 'UL' && !chk);
  toolbar.querySelector('[data-list=ol]').classList.toggle('on', !!L && L.nodeName === 'OL');
  toolbar.querySelector('[data-list=chk]').classList.toggle('on', chk);
}
function updateSwatches() {                      // the bars show the pen as it looks in the note (dark theme too)
  const c = FG.find(x => x.v === st.fg);
  $('#fgBar').style.background = st.theme === 'dark' && c && c.d ? c.d : st.fg || 'var(--ink)';
  $('#hlBar').style.background = st.hl || 'repeating-linear-gradient(135deg, var(--line-2) 0 2px, transparent 2px 4px)';
}
toolbar.addEventListener('mousedown', e => { if (!e.target.closest('#findbar')) e.preventDefault(); });
toolbar.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.closest('#findbar')) return;
  finishIme();                                    // the button keeps the focus, so a syllable may still be open
  if (b.dataset.cmd) fmt(b.dataset.cmd);
  else if (b.dataset.list) toggleList(b.dataset.list);
  else if (b.dataset.pop) toolPop(b.dataset.pop, b);
  else if (b.id === 'tbFg') applyFg(st.fg);
  else if (b.id === 'tbHl') toggleHl();
  else if (b.id === 'tbHr') insertHr();
  else if (b.id === 'tbStamp') stamp();
  else if (b.id === 'tbClear') clearFmt();
  else if (b.id === 'tbFind') openFind();
});
function toolPop(kind, anchor) {
  ensureEditorFocus();
  const r = anchor.getBoundingClientRect();
  popAnchorTop = r.top;
  if (kind === 'block') {
    const look = { div: 'font-size:13.5px', h1: 'font-size:19px;font-weight:800', h2: 'font-size:16.5px;font-weight:750', h3: 'font-size:14.5px;font-weight:700', blockquote: 'font-size:13.5px;border-left:3px solid var(--accent);padding-left:8px', pre: 'font:12.5px var(--mono)' };
    const now0 = (document.queryCommandValue('formatBlock') || 'div').toLowerCase();
    showPop(r.left, r.bottom + 6, BLOCKS.map(([t, l, k]) => `<button class="mit blk${t === now0 ? ' on' : ''}" data-v="${t}"${t === 'blockquote' || t === 'pre' ? ' title="빈 줄에서 Enter를 누르면 빠져나가요"' : ''}><span style="${look[t]}">${l}</span>${t === now0 ? '<b class="blk-on">✓</b>' : ''}<kbd>${esc(k.trim())}</kbd></button>`).join(''),
      b => { setBlock(b.dataset.v); });
    menuOn = true;                                 // ↑ / ↓ / Enter / Esc, like the other menus
  } else if (kind === 'fg') {
    showPop(r.left, r.bottom + 6, `<div class="mlabel">글자색 · 잘 보이는 색만 골랐어요</div><div class="swatches">${FG.map(c => c.v
      ? `<button class="sw txt${st.fg === c.v ? ' on' : ''}" data-v="${c.v}" title="${c.n}" style="color:${st.theme === 'dark' && c.d ? c.d : c.v}">A</button>`
      : '').join('')}</div>`, b => { applyFg(b.dataset.v, true); });
  } else if (kind === 'hl') {
    showPop(r.left, r.bottom + 6, `<div class="mlabel">형광펜</div><div class="swatches"><button class="sw none${st.hl ? '' : ' on'}" data-v="" title="형광펜 없음"></button>${HL.map(c => `<button class="sw${st.hl === c.v ? ' on' : ''}" data-v="${c.v}" title="${c.n}" style="background:${c.v}"></button>`).join('')}</div>`,
      b => { applyHl(b.dataset.v || null, true); });
  } else if (kind === 'table') {
    let cells = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cells += `<i data-x="${x}" data-y="${y}"></i>`;
    showPop(r.left, r.bottom + 6, `<div class="tgrid">${cells}</div><div class="tglabel" id="tgl"></div><div class="tghint">방향키로 크기, Enter로 넣기 · 엑셀·구글시트에서 복사한 셀을 붙여넣어도 표가 돼요.</div>`, null);
    const tg = pop.querySelector('.tgrid');
    let X = 2, Y = 2;                              // starts on 3 × 3, the size most tables begin with
    const hl = (x, y) => {
      X = clamp(x, 0, 7); Y = clamp(y, 0, 7);
      for (const i of tg.children) i.classList.toggle('on', +i.dataset.x <= X && +i.dataset.y <= Y);
      $('#tgl').textContent = `${Y + 1}행 × ${X + 1}열`;
    };
    hl(2, 2);
    popKey = e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) { hl(X + d[0], Y + d[1]); return true; }
      if (e.key === 'Enter') { closePop(); insertTable(Y + 1, X + 1); return true; }
      return false;
    };
    tg.addEventListener('mousemove', e => {
      const c = e.target.closest('i');
      if (c) hl(+c.dataset.x, +c.dataset.y);
    });
    tg.addEventListener('click', e => {
      const c = e.target.closest('i');
      if (!c) return;
      closePop();
      insertTable(+c.dataset.y + 1, +c.dataset.x + 1);
    });
  }
}

