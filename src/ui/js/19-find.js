// ---------------------------------------------------------------- find in note (CSS highlight API: no DOM changes)
const canHL = !!(window.Highlight && window.CSS && CSS.highlights);
const hlAll = canHL ? new Highlight() : { add() {}, clear() {} }, hlCur = canHL ? new Highlight() : { add() {}, clear() {} };
if (canHL) { CSS.highlights.set('ssn-find', hlAll); CSS.highlights.set('ssn-cur', hlCur); }
let findOpen = false, hits = [], hitI = -1, findT = 0;
function openFind() {
  if (view !== 'editor') return;
  findOpen = true;
  $('#findbar').classList.add('show');
  const s = navLive() ? '' : getSelection().toString();   // a selected cell's parked text isn't a search
  if (s && s.length < 80 && !s.includes('\n')) findIn.value = s;
  findIn.focus(); findIn.select();
  runFind(true);
}
// open the find bar on q and jump to its nth match; toEditor (after a jump from Ctrl+K / the palette) puts the
// caret right after the match, so the next key writes in the note instead of replacing the search
function findText(q, nth = 0, toEditor = false) {
  findOpen = true;
  $('#findbar').classList.add('show');
  findIn.value = q;
  runFind(false);
  if (hits.length) { hitI = clamp(nth, 0, hits.length - 1); showHit(); }
  if (toEditor && hits.length) {
    editor.focus({ preventScroll: true });
    const c = hits[hitI].cloneRange(); c.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(c);
    return;
  }
  findIn.focus(); findIn.select();
}
function findSoon() { clearTimeout(findT); findT = setTimeout(() => runFind(false), 200); }
function runFind(fromCaret) {
  hlAll.clear(); hlCur.clear(); hits = []; hitI = -1;
  const q = findIn.value.toLowerCase();
  if (!q) { $('#findCount').textContent = ''; $('#findbar').classList.remove('none'); return; }
  const w = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode()) && hits.length < 5000) {
    const t = n.nodeValue.toLowerCase();
    for (let i = t.indexOf(q); i >= 0 && hits.length < 5000; i = t.indexOf(q, i + q.length)) {
      const r = new Range(); r.setStart(n, i); r.setEnd(n, i + q.length);
      hits.push(r); hlAll.add(r);
    }
  }
  if (hits.length) {
    hitI = 0;
    const c = fromCaret && lastSel && selRangeFrom(lastSel);
    if (c) { const k = hits.findIndex(h => h.compareBoundaryPoints(Range.START_TO_START, c) >= 0); if (k >= 0) hitI = k; }
  }
  showHit(fromCaret);
}
function selRangeFrom(x) { const [a] = nodeAt(x.a); try { const r = document.createRange(); r.setStart(a, Math.min(x.ao, a.nodeType === 3 ? a.nodeValue.length : a.childNodes.length)); return r; } catch (e) { return null; } }
function showHit(scroll = true) {
  hlCur.clear();
  $('#findbar').classList.toggle('none', hitI < 0 && !!findIn.value);
  if (hitI < 0) { $('#findCount').textContent = findIn.value ? '결과 없음' : ''; return; }
  const r = hits[hitI];
  hlCur.add(r);
  $('#findCount').textContent = (hitI + 1) + '/' + hits.length;
  if (!scroll) return;
  const rect = r.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
  if (rect.top < sr.top + 20 || rect.bottom > sr.bottom - 20) scroller.scrollTop += rect.top - sr.top - sr.height / 3;
}
function findStep(d) { if (!hits.length) return; hitI = (hitI + d + hits.length) % hits.length; showHit(); }
function findClose(silent) {
  if (!findOpen) return;
  findOpen = false;
  $('#findbar').classList.remove('show');
  const r = hits[hitI];
  hlAll.clear(); hlCur.clear(); hits = []; hitI = -1;
  if (silent || document.activeElement === editor) return;   // writing in the note: the caret stays where it is
  editor.focus({ preventScroll: true });
  if (r && r.startContainer.isConnected) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  else if (lastSel) selRestore(lastSel);
}
findIn.addEventListener('input', () => runFind(false));
findIn.addEventListener('keydown', e => {
  if (e.isComposing) return;
  if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); findClose(); }
});
$('#findNext').onclick = () => findStep(1);
$('#findPrev').onclick = () => findStep(-1);
$('#findX').onclick = () => findClose();

