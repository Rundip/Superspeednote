// ---------------------------------------------------------------- notes
function newNote(quick) {                        // a new note goes last; quick === true: a quick memo (it drops itself if left empty)
  if (S.notes.length >= MAX_NOTES) { toast(`메모는 ${MAX_NOTES}개까지 만들 수 있어요`); return false; }
  const n = { id: uid(), title: '', color: COLOR_KEYS[S.notes.length % COLOR_KEYS.length], pinned: false, hotkey: null, created: now(), updated: now(), preview: '' };
  S.notes.push(n);
  if (quick !== true) { if (!freshIds.has(selId)) freshPrevSel = selId; freshIds.add(n.id); }
  bodies[n.id] = '<div><br></div>';
  host.send('saveNote', n.id, bodies[n.id]);
  saveStateSoon();
  query = ''; boardSearch.value = '';
  openNote(n.id);                                  // straight into the body: write first, title later (or never)
}
function newNoteTitled(t) {                       // searched for a note that isn't there yet: make it, caret in the body
  if (newNote() === false) return;
  const n = noteById(cur);
  n.title = t; titleIn.value = t; staleRows.add(n.id);
  renderHead(); renderSidebar(); saveStateSoon();
}
function deleteNote(id) { deleteNotes([id]); }
// Several notes at once: ask first, so a stray Ctrl+A → Del can't clear the board. One note goes straight to
// the trash (with 되돌리기). Cancel is focused; Del again confirms.
// o.confirm: ask for a single note too (the list's Delete); o.after / o.cancel run once the dialog is gone
function askDeleteNotes(ids, o = {}) {
  ids = ids.filter(id => noteById(id));
  if (!ids.length) return;
  if (ids.length < 2 && !o.confirm) { deleteNotes(ids); return; }
  const one = ids.length === 1, all = ids.length === S.notes.length && !one;
  const names = ids.slice(0, 6).map(id => `<li>${esc(titleOf(noteById(id)) || '제목 없음')}</li>`).join('') +
    (ids.length > 6 ? `<li class="more">외 ${ids.length - 6}개</li>` : '');
  const head = one ? `${josa(`‘${titleOf(noteById(ids[0])) || '제목 없음'}’ 메모`, '을', '를')} 삭제할까요?` : all ? `메모 ${ids.length}개를 모두 삭제할까요?` : `메모 ${ids.length}개를 삭제할까요?`;
  let done = false;
  openModal(`<div class="dlg confirm"><div class="dlg-head">${ic('i-trash')}<h3>${esc(head)}</h3></div>` +
    `<div class="dlg-body">${one ? '' : `<ul class="del-list">${names}</ul>`}<div class="khint">휴지통으로 옮겨져서 언제든 복원할 수 있어요.</div></div>` +
    `<div class="dlg-foot"><span class="ver">Del 한 번 더 = 삭제 · Esc = 취소</span><span style="flex:1"></span><button class="btn" id="delNo">취소</button><button class="btn danger-fill" id="delYes">${one ? '삭제' : `${ids.length}개 삭제`}</button></div></div>`,
    () => { if (!done && o.cancel) setTimeout(o.cancel, 0); });
  const yes = $('#delYes');
  $('#delNo').onclick = closeModal;
  yes.onclick = () => { done = true; closeModal(); deleteNotes(ids); if (o.after) setTimeout(o.after, 0); };
  modal.querySelector('.dlg').addEventListener('keydown', e => { if (e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); yes.click(); } });
  $('#delNo').focus();
}
// Deleted notes go to the data folder's trash\ (never erased); one "되돌리기" puts them all back in place.
function deleteNotes(ids) {
  const items = [];
  for (const id of ids) {
    const i = S.notes.findIndex(n => n.id === id);
    if (i < 0) continue;
    if (cur === id) { clearTimeout(saveT); dirty = false; bodies[id] = editor.innerHTML; }
    items.push({ i, meta: S.notes[i], html: bodies[id] });
  }
  if (!items.length) return;
  items.sort((a, b) => a.i - b.i);
  const gone = new Set(items.map(x => x.meta.id));
  // the next card takes the selection (the one after, else before) - not the first card, often off screen
  const vis = view === 'board' ? visibleIds() : [], at = Math.min(...items.map(x => vis.indexOf(x.meta.id)).filter(i => i >= 0));
  const nextSel = isFinite(at) ? vis.slice(at).find(id => !gone.has(id)) || vis.slice(0, at).reverse().find(id => !gone.has(id)) || null : selId;
  const wasOpen = cur && gone.has(cur) ? cur : null;
  S.notes = S.notes.filter(n => !gone.has(n.id));
  for (const x of items) {                        // empty: gone for good; else to the trash with its title, colour, place
    const id = x.meta.id;
    x.empty = !x.meta.title && emptyHtml(x.html) && !missing.has(id) && !unread.has(id);
    delete bodies[id]; H.delete(id); textCache.delete(id); memo.delete(id); sentNames.delete(id);
    host.send('delNote', id, x.empty ? 'purge' : 'trash', x.empty ? '' : JSON.stringify(Object.assign({}, x.meta, { pos: x.i })));
  }
  multi.clear(); sbMulti.clear(); sbAnchor = null; selAnchor = null;
  if (gone.has(selId)) selId = nextSel;
  stateDirty = true; flushState();
  applyHotkeys();
  if (cur && gone.has(cur)) { cur = null; goHome(); } else rerender();
  markSb();
  if (view === 'board') { const c = grid.querySelector('.card.sel'); if (c) c.scrollIntoView({ block: 'nearest' }); }
  const kept = items.filter(x => !x.empty).length, purged = items.length - kept;
  const label = items.length === 1 ? (purged ? '빈 메모를 삭제했어요' : `‘${titleOf(items[0].meta) || '제목 없음'}’ 메모를 휴지통으로 옮겼어요`)
    : purged ? `메모 ${items.length}개를 삭제했어요 · 빈 메모 ${purged}개는 휴지통에 남기지 않아요` : `메모 ${items.length}개를 휴지통으로 옮겼어요`;
  let done = false;
  const undoDel = () => {                         // once only, from the toast or Ctrl+Z on the board
    if (done) return;
    done = true;
    if (boardUndo === undoDel) boardUndo = null;
    // already restored from the trash: never a second copy. A note whose file wasn't read stays in the trash
    // (its text is only there): restored from the trash, never re-saved from the empty copy here
    const keep = items.filter(x => unread.has(x.meta.id) || missing.has(x.meta.id));
    const back = items.filter(x => !noteById(x.meta.id) && !keep.includes(x));
    if (!back.length) { toast(keep.length ? '읽지 못했던 메모는 휴지통에서 복원해 주세요' : '이미 복원된 메모예요'); return; }
    for (const x of back) {                       // ascending original positions -> each lands where it was
      if (S.notes.length >= MAX_NOTES) break;
      S.notes.splice(Math.min(x.i, S.notes.length), 0, x.meta);
      bodies[x.meta.id] = x.html;
      host.send('saveNote', x.meta.id, x.html);
      if (!x.empty) host.send('unTrash', x.meta.id);   // no copy left behind in the trash
    }
    if (trashItems) { const ids = new Set(back.map(x => x.meta.id)); trashItems = trashItems.filter(t => !(t.m && ids.has(t.m.id))); renderTrash(); }
    stateDirty = true; flushState();
    applyHotkeys();
    selId = back[0].meta.id; rerender();
    if (view === 'board') { const c = grid.querySelector('.card.sel'); if (c) c.scrollIntoView({ block: 'nearest' }); }
    if (wasOpen && noteById(wasOpen) && view === 'board' && !modalOpen()) openNote(wasOpen);
  };
  boardUndo = undoDel;
  toast(label, '되돌리기 (Ctrl+Z)', undoDel);
}
let boardUndo = null;                             // the last delete, undoable with Ctrl+Z on the board until the next one
function duplicate(id) {
  const n = noteById(id);
  if (!n) return;
  if (S.notes.length >= MAX_NOTES) { toast(`메모는 ${MAX_NOTES}개까지 만들 수 있어요`); return; }
  if (id === cur) flushNote();
  const c = Object.assign({}, n, { id: uid(), title: (titleOf(n) || '제목 없음') + ' 사본', hotkey: null, pinned: false, created: now(), updated: now(), at: null });
  S.notes.splice(S.notes.indexOf(n) + 1, 0, c);
  bodies[c.id] = bodies[id];
  host.send('saveNote', c.id, bodies[c.id]);
  saveStateSoon(); selId = c.id; rerender();
  toast('메모를 복제했어요');
}
function togglePin(id) { const n = noteById(id); if (!n) return; n.pinned = !n.pinned; saveStateSoon(); rerender(); }
function setColor(id, c) { const n = noteById(id); if (!n) return; n.color = c; saveStateSoon(); rerender(); }
function rerender() { if (view === 'board') renderBoard(true); else { renderSidebar(true); renderHead(); } }
function copyText(id) {
  const t = noteText(id);
  navigator.clipboard.writeText(t).then(() => toast('텍스트로 복사했어요'), () => toast('복사하지 못했어요'));
}
const EXPORT_CSS = 'body{font:15px/1.75 "Malgun Gothic",sans-serif;max-width:880px;margin:40px auto;padding:0 24px;color:#0f1b33;white-space:pre-wrap}h1.title{font-size:28px;margin:0 0 24px}table{border-collapse:collapse;white-space:normal}td{border:1px solid #cbd5e6;padding:6px 12px;vertical-align:top}table.hdr tr:first-child td{background:#edf2fd;font-weight:700}ul.checklist{list-style:none;padding-left:4px}ul.checklist li::before{content:"\\2610  "}ul.checklist li[data-checked=true]::before{content:"\\2611  "}ul.checklist li[data-checked=true]{text-decoration:line-through;color:#8a97b0}blockquote{border-left:3px solid #3b6cf6;margin:8px 0;padding:4px 14px;background:#f1f5ff}pre{background:#0d1a36;color:#dbe6ff;padding:12px;border-radius:8px}img{max-width:100%}';
// the same numbering order as in the app (1. 가. 1) 가) ...) and bullet-less lines
const EXPORT_LIST_CSS = '@counter-style ko-ga{system:alphabetic;symbols:"가" "나" "다" "라" "마" "바" "사" "아" "자" "차" "카" "타" "파" "하";suffix:". "}' +
  '@counter-style ko-num-paren{system:extends decimal;suffix:") "}@counter-style ko-ga-paren{system:extends ko-ga;suffix:") "}' +
  '@counter-style ko-num-wrap{system:extends decimal;prefix:"(";suffix:") "}@counter-style ko-ga-wrap{system:extends ko-ga;prefix:"(";suffix:") "}' +
  'ol ol{list-style-type:ko-ga}ol ol ol{list-style-type:ko-num-paren}ol ol ol ol{list-style-type:ko-ga-paren}ol ol ol ol ol{list-style-type:ko-num-wrap}ol ol ol ol ol ol{list-style-type:ko-ga-wrap}' +
  'ol[data-type=number]{list-style-type:decimal}ol[data-type=hangul]{list-style-type:ko-ga}ol[data-type=alpha]{list-style-type:lower-alpha}' +
  'li.nob{display:block}ul.checklist li.nob::before{content:none}';
// a Windows file name that reads as the note's name (the same rule as the readable copies in the 메모 folder):
// refused characters become their full-width twins, at most 80 characters, never a device name
// (Windows' refused characters, and the ones Chromium would swap for '_' in a dropped file's name: invisible
// format characters go, '~' becomes its full-width twin, no dots or spaces at either end)
function fileBaseOf(name) {
  let s = String(name || '').normalize('NFC').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\p{Cf}+/gu, '').replace(/[\\/:*?"<>|~]/g, c => '＼／：＊？＂＜＞｜～'['\\/:*?"<>|~'.indexOf(c)]);
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 80) s = s.slice(0, /[\ud800-\udbff]/.test(s[79]) ? 79 : 80);
  s = s.replace(/[. ]+$/, '').replace(/^[. ]+/, '');
  if (!s) s = '제목 없음';
  if (/^(CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³]) *(\..*)?$/i.test(s)) s = '_' + s;
  return s;
}
function exportContent(id, kind) {
  const n = noteById(id);
  const name = fileBaseOf(titleOf(n) || '메모') + '.' + kind;
  const content = kind === 'txt'
    ? (n.title ? n.title + '\n\n' : '') + noteText(id)
    : `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(titleOf(n) || '메모')}</title><style>${EXPORT_CSS + EXPORT_LIST_CSS}</style></head><body><h1 class="title">${esc(n.title || '')}</h1><div>${bodies[id] || ''}</div></body></html>`;
  return { name, content };
}
function exportNote(id, kind) {
  const n = noteById(id);
  if (!n) return;
  if (id === cur) flushNote();
  const { name, content } = exportContent(id, kind);
  if (HOST) { host.send('export', name, kind === 'txt' ? content.replace(/\r?\n/g, '\r\n') : content); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: kind === 'txt' ? 'text/plain' : 'text/html' }));
  a.download = name; a.click();
}

