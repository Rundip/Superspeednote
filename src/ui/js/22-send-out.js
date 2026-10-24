// ---------------------------------------------------------------- send out: copy -> back to the previous window -> paste
// What gets taken: selected cells, else selected text, else the cell being edited, else the current line.
// On the board (or with the title focused) it is the whole note.
function notePayload(id) {
  if (id === cur) flushNote();
  const n = noteById(id);
  return n ? { text: noteText(id), html: bodies[id] || '', what: '‘' + (titleOf(n) || '메모') + '’ 전체' } : null;
}
function copyPayload() {
  if (view === 'board') return selId ? notePayload(selId) : null;
  if (document.activeElement === titleIn) return notePayload(cur);
  if (navLive()) {
    const rows = rectRows(navRect());
    return { text: rowsText(rows), html: rowsHTML(rows), what: rows.length * rows[0].length > 1 ? '선택한 칸' : '칸 값' };
  }
  const r = selRange();
  if (r && !r.collapsed) {
    const f = r.cloneContents(), d = document.createElement('div');
    d.appendChild(f.cloneNode(true));
    return { text: toPlain(f), html: d.innerHTML, what: '선택한 내용' };
  }
  if (editCell) return { text: toPlain(editCell), html: editCell.innerHTML, what: '칸 값' };
  const blk = r && blockOf(r.startContainer);
  if (blk && blk.textContent.trim()) return { text: toPlain(blk).replace(/\n+$/, ''), html: blk.outerHTML, what: '현재 줄' };
  return null;
}
function putClip(p) {
  if (HOST) { host.send('clip', String(p.text.length), p.text + p.html); return; }
  try {
    navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([p.text], { type: 'text/plain' }), 'text/html': new Blob([p.html], { type: 'text/html' }) })]);
  } catch (e) { navigator.clipboard.writeText(p.text); }
}
function copyNote(id) {
  const p = notePayload(id);
  if (!p) return;
  putClip(p);
  toast(`${josa(p.what, '을', '를')} 복사했어요 · 원하는 곳에 붙여넣으세요`);
}
// mode 'paste': copy, return to the window you came from and paste there; 'copy': copy and return
function sendOut(mode) {
  const p = copyPayload();
  if (!p || (!p.text.trim() && !/<img/i.test(p.html))) { toast('보낼 내용이 없어요 · 글을 선택하거나 보낼 줄에 커서를 두세요'); return; }
  flushAll();
  if (!HOST) { putClip(p); toast(`${p.what} 복사됨 (브라우저 미리보기에서는 창 전환이 없어요)`); return; }
  host.send('sendOut', mode, String(p.text.length), p.text + p.html);
}

