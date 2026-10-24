// ---------------------------------------------------------------- objects: click an image / divider (or a table's
// grip) to select it, Delete / Backspace removes it as one undo step. The frame is an overlay: the note is untouched.
const objbox = $('#objbox');
let objSel = null;
function selectObj(el) {
  if (!el || !editor.contains(el)) return;
  clearNav();
  if (el.nodeName === 'PRE' && objSel !== el) toast('코드란 선택 · Alt+↑/↓ 옮기기 · Delete 삭제 · Enter 다시 쓰기');
  objSel = el;
  editor.classList.add('objsel');
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  const r = document.createRange();
  if (el.nodeName === 'TABLE') {                  // caret parked after the table: a key typed lands there, not in a cell
    const n = el.nextElementSibling;
    if (n && !/^(TABLE|HR)$/.test(n.nodeName)) r.setStart(n, 0); else r.setStartAfter(el);
    r.collapse(true);
    showOv(el);
    tgrip.classList.add('on'); tblHint('obj');
  } else r.selectNode(el);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  objbox.classList.toggle('img', el.nodeName === 'IMG');
  posObj();
}
function clearObj() {
  if (!objSel) return;
  objSel = null;
  editor.classList.remove('objsel');
  objbox.style.display = 'none';
  objbox.classList.remove('img');
  tgrip.classList.remove('on');
  if (hintMode === 'obj') tblHint('');
}
function posObj() {
  if (!objSel) return;
  if (!objSel.isConnected) { clearObj(); return; }
  const sr = sheet.getBoundingClientRect(), r = objSel.getBoundingClientRect();
  Object.assign(objbox.style, { display: 'block', left: (r.left - sr.left - 4) + 'px', top: (r.top - sr.top - 4) + 'px', width: (r.width + 8) + 'px', height: (r.height + 8) + 'px' });
}
function deleteObj() {
  const el = objSel;
  clearObj();
  if (!el || !el.isConnected) return;
  if (el.nodeName === 'TABLE') { edit(() => removeTable(el)); toast('표를 삭제했어요', '되돌리기', undoThis()); return; }
  edit(() => {
    const p = el.parentNode;
    if (p === editor) {                           // a divider (or a picture on its own line)
      const next = el.nextElementSibling, prev = el.previousElementSibling;
      el.remove();
      if (!editor.firstChild) editor.innerHTML = '<div><br></div>';
      placeCaret(next || prev || editor.firstChild, !next);
      return;
    }
    const i = Array.prototype.indexOf.call(p.childNodes, el);
    el.remove();
    if (!p.firstChild) p.innerHTML = '<br>';        // the emptied line stays a line
    const r = document.createRange(); r.setStart(p, Math.min(i, p.childNodes.length)); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
}
// A selected block (code block, table, divider, a picture on its own line) moves up / down past the block next to it
// with Alt+↑ / Alt+↓ - and stays selected, so it can go on moving. One undo step each.
function objBlock(el) {
  if (!el || !el.isConnected) return null;
  if (el.parentNode === editor) return el;
  if (el.nodeName === 'PRE') return el;            // a code block inside a list item / line: it moves among what is next to it there
  const p = el.parentNode;                        // a picture alone on its line: the line moves
  return el.nodeName === 'IMG' && p.parentNode === editor && !p.textContent.trim() && p.querySelectorAll('img').length === 1 ? p : null;
}
function moveObj(el, up) {
  const b = objBlock(el);
  if (!b) { toast('줄 안에 든 그림은 옮길 수 없어요 · 그림만 있는 줄이면 돼요'); return; }
  const sib = up ? b.previousElementSibling : b.nextElementSibling;
  if (!sib) { toast(up ? '맨 위예요' : '맨 아래예요'); return; }
  edit(() => { if (up) sib.before(b); else sib.after(b); });
  selectObj(el);
  el.scrollIntoView({ block: 'nearest' });
}
function codeSelectedKey(e, el, mod) {             // a selected code block: back to writing in it
  if (el.nodeName !== 'PRE' || mod || e.altKey) return false;
  const typing = e.key.length === 1 || e.keyCode === 229;   // a letter, or Korean typing: never over the whole block
  if (!(e.key === 'Enter' || e.key === 'Escape' || e.key === 'F2' || typing)) return false;
  clearObj();
  const [n, o] = endPoint(el), r = document.createRange(); r.setStart(n, o); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  if (typing) return false;                       // the key is typed at its end
  e.preventDefault(); e.stopPropagation();
  return true;
}
function objKey(e) {
  if (!objSel.isConnected) { clearObj(); return false; }
  const mod = e.ctrlKey || e.metaKey;
  if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && !e.altKey) { e.preventDefault(); deleteObj(); return true; }
  if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); moveObj(objSel, e.key === 'ArrowUp'); return true; }
  if (objSel.nodeName === 'PRE') { const done = codeSelectedKey(e, objSel, mod); if (done || !objSel) return done; }
  if (/^(Control|Shift|Alt|Meta)$/.test(e.key) || (mod && /^Key[CX]$/.test(e.code))) return false;   // copy / cut keep it
  const el = objSel;
  clearObj();
  if (el.nodeName === 'TABLE' && e.key.length === 1 && !mod && !e.altKey && e.keyCode !== 229) {
    edit(() => { const d = document.createElement('div'); d.innerHTML = '<br>'; el.after(d); placeCaret(d, false); });
    return false;                                 // the key is typed on the new line
  }
  // a divider / table on its own line: arrows step to the line before / after it
  const back = /^Arrow(Up|Left)$/.test(e.key), fwd = /^Arrow(Down|Right)$/.test(e.key);
  if ((back || fwd) && !mod && !e.altKey && !e.shiftKey && el.parentNode === editor) {
    const to = back ? el.previousElementSibling : el.nextElementSibling;
    if (to && !/^(TABLE|HR)$/.test(to.nodeName)) { e.preventDefault(); placeCaret(to, back); return true; }
  }
  if (e.key !== 'Escape') return false;           // anything else: let go, the key does its usual job
  e.preventDefault(); e.stopPropagation();
  if (el.nodeName !== 'TABLE') { const s = getSelection(); if (s.rangeCount) s.collapseToEnd(); }
  return true;
}
// any click elsewhere lets go (a click on the same picture selects it again)
document.addEventListener('mousedown', e => { if (objSel && !(e.target.closest && e.target.closest('.tgrip, .oh'))) clearObj(); }, true);
// a selected picture: drag the right edge / corner to size it (the height follows). Nothing runs until a handle is
// pressed; while dragging only the picture's width changes, and letting go makes it one undo step.
let objDrag = null;
const osz = $('.osz', objbox);
function endObjDrag(commit) {
  const d = objDrag;
  if (!d) return;
  objDrag = null;
  cancelAnimationFrame(d.raf);
  objbox.classList.remove('drag');
  if (d.style === null) d.img.removeAttribute('style'); else d.img.setAttribute('style', d.style);   // as it was, then
  if (commit && d.img.isConnected && Math.abs(d.w - d.w0) >= 1) edit(() => { d.img.style.width = d.w + 'px'; d.img.style.removeProperty('height'); });
  posObj();
}
for (const h of $$('.oh', objbox)) {
  h.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !objSel || objSel.nodeName !== 'IMG') return;
    e.preventDefault(); e.stopPropagation();
    const img = objSel, box = img.closest('td,li,blockquote,div,p'), w0 = Math.round(img.getBoundingClientRect().width);
    objDrag = { img, h, x: e.clientX, w0, w: w0, style: img.getAttribute('style'), max: Math.max(24, (box && editor.contains(box) ? box : editor).clientWidth), raf: 0 };
    h.setPointerCapture(e.pointerId);
    objbox.classList.add('drag'); osz.textContent = w0 + 'px';
  });
  h.addEventListener('pointermove', e => {
    const d = objDrag;
    if (!d || d.h !== h) return;
    d.w = Math.round(clamp(d.w0 + e.clientX - d.x, 24, d.max));
    if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; d.img.style.width = d.w + 'px'; d.img.style.removeProperty('height'); posObj(); osz.textContent = d.w + 'px'; });
  });
  h.addEventListener('pointerup', () => endObjDrag(true));
  h.addEventListener('pointercancel', () => endObjDrag(false));
  h.addEventListener('lostpointercapture', () => endObjDrag(false));
}
editor.addEventListener('click', e => {
  if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
  const o = e.target.closest && e.target.closest('img, hr');
  if (o && editor.contains(o)) selectObj(o);
});
scroller.addEventListener('scroll', () => { if (ovTable) posOvSoon(); }, { passive: true });
window.addEventListener('resize', posOvSoon);
editor.addEventListener('scroll', posOvSoon, true);   // horizontally scrolled wide tables

