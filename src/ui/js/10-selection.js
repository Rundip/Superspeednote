// ---------------------------------------------------------------- selection utils
function selRange() {
  const s = getSelection();
  if (!s.rangeCount) return null;
  const r = s.getRangeAt(0);
  return editor.contains(r.startContainer) ? r : null;
}
function selNode() {
  const r = selRange();
  if (!r) return null;
  const n = r.startContainer;
  return n.nodeType === 3 ? n.parentNode : n;
}
function closestSel(q) {
  const n = selNode();
  const c = n && n.closest(q);
  return c && c !== editor && editor.contains(c) ? c : null;
}
function pathOf(n) {
  const p = [];
  while (n && n !== editor) {
    let i = 0;
    for (let c = n.previousSibling; c; c = c.previousSibling) i++;
    p.push(i);
    n = n.parentNode;
  }
  return n === editor ? p.reverse() : null;
}
function nodeAt(p) {
  let n = editor;
  for (const i of p) { if (!n.childNodes[i]) return [n, true]; n = n.childNodes[i]; }
  return [n, false];
}
function selSave() {
  const r = selRange();
  if (!r || !editor.contains(r.endContainer)) return null;
  const a = pathOf(r.startContainer), b = pathOf(r.endContainer);
  return a && b ? { a, ao: r.startOffset, b, bo: r.endOffset } : null;
}
function selRestore(x) {
  if (!x) return;
  const len = n => n.nodeType === 3 ? n.nodeValue.length : n.childNodes.length;
  const [a, fa] = nodeAt(x.a), [b, fb] = nodeAt(x.b);
  try {
    const r = document.createRange();
    r.setStart(a, fa ? len(a) : Math.min(x.ao, len(a)));
    r.setEnd(b, fb ? len(b) : Math.min(x.bo, len(b)));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    scrollCaretIntoView();
  } catch (e) { /* stale path */ }
}
function placeCaret(node, atEnd) {
  if (!node) return;
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  const r = document.createRange();
  if (node.nodeType === 3) { r.setStart(node, atEnd ? node.nodeValue.length : 0); }
  else { r.selectNodeContents(node); r.collapse(!atEnd); }
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  caretBeforeBr();
  scrollCaretIntoView();
}
// A caret after a line's closing <br> (an empty line is "<br>" alone) makes Windows' Korean IME type the first
// consonant twice ("ㄱ가"): it goes in front of that <br>, which is the same place on screen
function caretBeforeBr() {
  const sel = getSelection(), r = sel.rangeCount ? sel.getRangeAt(0) : null;
  if (!r || !r.collapsed || r.startContainer.nodeType !== 1 || !editor.contains(r.startContainer)) return;
  const el = r.startContainer, k = r.startOffset, prev = el.childNodes[k - 1];
  if (!prev || prev.nodeName !== 'BR' || k !== el.childNodes.length) return;
  const c = document.createRange(); c.setStartBefore(prev); c.collapse(true);
  sel.removeAllRanges(); sel.addRange(c);
}
function scrollCaretIntoView() {
  const r = selRange();
  if (!r) return;
  let rect = r.getBoundingClientRect();
  if (!rect.height) { const n = selNode(); if (n) rect = n.getBoundingClientRect(); }
  const sr = scroller.getBoundingClientRect();
  if (rect.bottom > sr.bottom - 24) scroller.scrollTop += rect.bottom - sr.bottom + sr.height / 3;
  else if (rect.top < sr.top + 8) scroller.scrollTop += rect.top - sr.top - sr.height / 3;
}
function ensureEditorFocus() {
  if (document.activeElement === editor) return;
  editor.focus({ preventScroll: true });
  if (lastSel) selRestore(lastSel);
}
function topLevel(n) { while (n && n.parentNode !== editor) n = n.parentNode; return n; }
// keep every top-level line inside a block element (Chrome types bare text into an empty editor)
const loose = c => !!c && (c.nodeType === 3 || (c.nodeType === 1 && !BLOCK_TAGS.test(c.nodeName)));
function needsRoot() {
  if (!editor.firstChild) return true;
  const r0 = selRange();
  if (r0 && r0.startContainer.nodeType === 3 && r0.startContainer.parentNode === editor) return true;   // bare text at the top
  const n = selNode();
  return loose(editor.firstChild) || (!!n && n !== editor && loose(topLevel(n)));
}
function ensureRoot() {
  if (!editor.firstChild) { editor.innerHTML = '<div><br></div>'; placeCaret(editor.firstChild, false); return; }
  const n = selNode(), r0 = selRange();
  const top = r0 && r0.startContainer.parentNode === editor && r0.startContainer.nodeType === 3 ? r0.startContainer   // typed after a table / divider
    : n && n !== editor ? topLevel(n) : null;
  const bad = loose;
  const start = bad(top) ? top : bad(editor.firstChild) ? editor.firstChild : null;
  if (!start) return;
  const r = selRange();
  const keep = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
  let a = start;
  while (a.previousSibling && bad(a.previousSibling)) a = a.previousSibling;
  const wrap = document.createElement('div');
  editor.insertBefore(wrap, a);
  while (wrap.nextSibling && bad(wrap.nextSibling)) {
    const x = wrap.nextSibling;
    wrap.appendChild(x);
    if (x.nodeName === 'BR' && x.nextSibling && bad(x.nextSibling)) break;
  }
  if (!wrap.firstChild) wrap.innerHTML = '<br>';
  if (keep) { try { const nr = document.createRange(); nr.setStart(keep[0], keep[1]); nr.setEnd(keep[2], keep[3]); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); } catch (e) { /* ignore */ } }
}

