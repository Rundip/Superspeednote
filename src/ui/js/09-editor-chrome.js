// ---------------------------------------------------------------- editor chrome
let sbT = 0;
function renderSidebarSoon() { clearTimeout(sbT); sbT = setTimeout(() => renderSidebar(), 250); }
let sbSig = '';
const staleRows = new Set();                      // notes edited since their sidebar row was drawn
function sbItemHTML(n) {
  return `<div class="sb-item${n.id === cur ? ' on' : ''}${sbMulti.has(n.id) ? ' msel' : ''}" data-id="${n.id}" data-c="${n.color}" draggable="true" style="--c:${NOTE_COLORS[n.color]}"><div class="sb-row"><div class="t${titleOf(n) ? '' : ' ph'}">${esc(titleOf(n) || '제목 없음')}</div>` +
    `${n.hotkey ? `<span class="sb-hk">${esc(n.hotkey.label)}</span>` : ''}</div><div class="p">${esc(previewAfterTitle(n).slice(0, 80)) || '&nbsp;'}</div></div>`;
}
// like the board: full build only when the list itself changed, otherwise just the open note's row
function renderSidebar(force) {
  if (view !== 'editor') return;
  const list = ordered(), sig = list.map(n => n.id).join(',');
  if (force || sig !== sbSig || !sbList.firstChild) {
    sbSig = sig;
    staleRows.clear();
    sbList.innerHTML = list.map(sbItemHTML).join('');
  } else {
    const was = sbList.querySelector('.sb-item.on');
    if (was && was.dataset.id !== cur) was.classList.remove('on');
    staleRows.add(cur);
    for (const id of staleRows) {
      const it = sbList.querySelector(`.sb-item[data-id="${id}"]`), n = noteById(id);
      if (it && n) it.outerHTML = sbItemHTML(n);
    }
    staleRows.clear();
  }
  const on = sbList.querySelector('.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}
// Shift+click (range) / Ctrl+click (toggle) pick several rows; Delete or the right-click menu deletes them together.
const sbMulti = new Set();
let sbAnchor = null;
function markSb() {
  for (const el of sbList.querySelectorAll('.sb-item')) el.classList.toggle('msel', sbMulti.has(el.dataset.id));
  const lbl = $('#sbLabel');
  const keys = document.activeElement === sbList;
  lbl.textContent = sbMulti.size ? `${sbMulti.size}개 선택 · Del 삭제 · Esc 해제` : keys ? '↑↓ 이동 · Del 삭제 · Enter 쓰기' : '메모 목록';
  lbl.classList.toggle('on', sbMulti.size > 0 || keys);
}
function clearSb() { if (!sbMulti.size) return false; sbMulti.clear(); markSb(); return true; }
sbList.addEventListener('mousedown', e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); });   // no text selection
sbList.addEventListener('click', e => {
  const it = e.target.closest('.sb-item');
  if (!it) return;
  const id = it.dataset.id;
  if (e.shiftKey) {
    const ids = $$('.sb-item', sbList).map(x => x.dataset.id);
    if (!sbAnchor) sbAnchor = cur;
    const a = ids.indexOf(sbAnchor), b = ids.indexOf(id);
    sbMulti.clear();
    if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) sbMulti.add(ids[i]);
  } else if (e.ctrlKey || e.metaKey) {
    if (sbMulti.has(id)) sbMulti.delete(id); else sbMulti.add(id);
    sbAnchor = id;
  } else {                                        // like a file list: the note shows, the keys stay here (Del deletes it)
    clearSb(); sbAnchor = null; openNote(id, { browse: !narrow.matches });
    if (!narrow.matches) sbList.focus({ preventScroll: true });
    return;
  }
  markSb();
  sbList.focus({ preventScroll: true });          // so Delete / Esc go to the list
});
// Del in the list: ask, then the next note in the list opens and the keys stay here for the next one
function sbDelete(ids) {
  const order = $$('.sb-item', sbList).map(x => x.dataset.id), gone = new Set(ids);
  const last = Math.max(...ids.map(id => order.indexOf(id)));
  const next = order.slice(last + 1).find(id => !gone.has(id)) || order.slice(0, last).reverse().find(id => !gone.has(id));
  const stay = () => { if (view === 'editor') sbList.focus({ preventScroll: true }); };
  askDeleteNotes(ids, { confirm: true, cancel: stay, after: () => { if (next && noteById(next) && (!cur || gone.has(cur) || view !== 'editor')) openNote(next, { browse: true }); stay(); } });
}
sbList.addEventListener('keydown', e => {
  if (e.isComposing) return;
  const mods = e.ctrlKey || e.altKey || e.metaKey;
  if (e.key === 'Delete' && !mods) {
    e.preventDefault(); e.stopPropagation();
    sbDelete(sbMulti.size ? [...sbMulti] : cur && view === 'editor' ? [cur] : []);
    return;
  }
  if (!sbMulti.size) {                            // the list has the keys: ↑ / ↓ walk the notes, Enter / Esc go back to writing
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !mods && !e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      const ids = $$('.sb-item', sbList).map(x => x.dataset.id), i = ids.indexOf(cur);
      const to = ids[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, ids.length - 1)];
      if (to && to !== cur) openNote(to, { browse: true });   // only shows it: the caret stays out of the note
      sbList.focus({ preventScroll: true });
    } else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); refocus(); }
    else if (e.key === 'Escape') {                // as from the note: Esc = home (the board; in the list view the list is home)
      e.preventDefault(); e.stopPropagation();
      if (!listHome()) showBoard(); else if (app.classList.contains('sb-peek')) { app.classList.remove('sb-peek'); refocus(); }
    }
    // a key that writes: into the note (the list can't take Korean input, so this first key only switches over)
    else if (!mods && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Process' || e.keyCode === 229)) { e.preventDefault(); e.stopPropagation(); refocus(); }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearSb(); refocus(); }
});
// while the list has the keys, its label says which ones
sbList.addEventListener('focus', () => markSb());
sbList.addEventListener('blur', () => markSb());
sbList.addEventListener('dragstart', e => {
  const it = e.target.closest('.sb-item');
  if (!it) { e.preventDefault(); return; }
  e.dataTransfer.effectAllowed = 'copyMove';
  const many = dragNoteOut(e, it.dataset.id, sbMulti) > 1;
  const n = noteById(it.dataset.id);
  sbDrag = n && !n.pinned && !many ? n.id : null;          // the list reorders like the board (pinned notes keep their name order)
});
sbList.addEventListener('dragend', dragDone);
sbList.addEventListener('dragover', e => {
  if (!noteDrag) return;
  const it = e.target.closest('.sb-item');
  if (!sbDrag) { pinnedTold(it); return; }
  e.preventDefault();
  const from = noteById(sbDrag), to = it && noteById(it.dataset.id);
  const across = to && !!to.pinned !== !!from.pinned;   // pinned notes stay on top
  e.dataTransfer.dropEffect = across ? 'none' : 'move';
  sbDrop = null;
  if (!to || across || to.id === sbDrag) { hideDropMark(); return; }
  const r = it.getBoundingClientRect();
  sbDrop = { id: to.id, after: e.clientY >= r.top + r.height / 2 };
  showDropMark(it, sbDrop.after, false);
});
sbList.addEventListener('dragleave', e => { if (!sbList.contains(e.relatedTarget)) { sbDrop = null; hideDropMark(); } });
sbList.addEventListener('drop', e => {
  if (!sbDrag) return;
  e.preventDefault();
  const at = sbDrop, id = sbDrag;
  dragDone();
  if (!at) return;
  const [m] = S.notes.splice(S.notes.findIndex(n => n.id === id), 1);
  let to = S.notes.findIndex(n => n.id === at.id);
  if (at.after) to++;
  S.notes.splice(to, 0, m);
  saveStateSoon();
  renderSidebar(true); markSb();
});
sbList.addEventListener('contextmenu', e => {
  e.preventDefault();
  const it = e.target.closest('.sb-item');
  if (!it) return;
  if (sbMulti.size > 1 && sbMulti.has(it.dataset.id)) {
    const ids = [...sbMulti];
    showMenu(e.clientX, e.clientY, [
      { label: `선택한 ${ids.length}개 삭제`, icon: 'i-trash', kbd: 'Del', danger: true, action: () => askDeleteNotes(ids) },
      { label: '선택 해제', kbd: 'Esc', action: clearSb }
    ]);
    return;
  }
  noteMenu(it.dataset.id, e.clientX, e.clientY);
});
function renderHead() {
  const n = noteById(cur);
  if (!n) return;
  $('#hColor').style.setProperty('--c', NOTE_COLORS[n.color]); $('#hColor').dataset.c = n.color;
  const hk = $('#hHotkey');
  hk.className = 'hk-chip' + (n.hotkey ? ' set' : '') + (n.hotkey && hkFailed.has(n.id) ? ' bad' : '');
  hk.innerHTML = ic('i-key') + (n.hotkey ? esc(n.hotkey.label) : '단축키 지정');
  hk.title = n.hotkey && hkFailed.has(n.id) ? '다른 프로그램이 이 단축키를 쓰고 있어요. 다른 조합을 지정해 주세요.' : '이 메모를 어디서든 부르는 전역 단축키';
  $('#hPin').classList.toggle('on', !!n.pinned); $('#hPin').title = n.pinned ? '고정 해제' : '맨 앞에 고정';
  $('#tbMid').textContent = titleOf(n);
  titlePh(n);
}
// an empty title shows the first line it falls back to, greyed: what the board and the list will call this note
function titlePh(n) { titleIn.placeholder = (n && n.line1) || '제목 없음'; }
titleIn.addEventListener('input', () => {
  const n = noteById(cur);
  if (!n) return;
  n.title = titleIn.value; n.updated = now(); staleCards.add(n.id); staleRows.add(n.id); freshIds.delete(n.id);
  $('#tbMid').textContent = titleOf(n);
  saveStateSoon(); renderSidebarSoon();
});
// Enter / Tab / ↓ in the title: on to the very start of the note (into the first cell / list line if it begins
// with one). Pressed while a Korean syllable is still being typed, it goes once the syllable is done.
function bodyStart() {
  let n = editor.firstChild;
  while (n && n.nodeType === 1 && /^(TABLE|TBODY|THEAD|TR|UL|OL)$/.test(n.nodeName)) n = n.firstElementChild;
  return n || editor.firstChild || editor;
}
function toBody() { editor.focus(); scroller.scrollTop = 0; placeCaret(bodyStart(), false); }
let titleGo = false;
titleIn.addEventListener('keydown', e => {
  const go = e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter' || ((e.code === 'Tab' || e.key === 'Tab') && !e.shiftKey && !e.ctrlKey && !e.altKey);
  if (e.isComposing) { if (go) { e.preventDefault(); titleGo = true; } return; }
  if (go || e.key === 'ArrowDown') { e.preventDefault(); toBody(); }
});
titleIn.addEventListener('compositionend', () => { if (titleGo) { titleGo = false; setTimeout(toBody, 0); } });
const narrow = matchMedia('(max-width:820px)');  // a half-screen window: the list opens as a drawer over the note
$('#hSide').onclick = () => {
  if (narrow.matches) { app.classList.toggle('sb-peek'); return; }
  st.sidebar = !st.sidebar; app.classList.toggle('sb-off', !st.sidebar); saveStateSoon(); posOvSoon();
};
$('#pane').addEventListener('mousedown', () => app.classList.remove('sb-peek'));
$('#hColor').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); popAnchorTop = r.top; colorMenu(cur, r.left, r.bottom + 6); };
$('#hHotkey').onclick = () => setNoteHotkey(cur);
$('#hPin').onclick = () => togglePin(cur);
$('#hMore').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); popAnchorTop = r.top; noteMenu(cur, r.right - 220, r.bottom + 6); };
$('#btnBack').onclick = showBoard;
for (const g of $$('.vseg')) g.onclick = e => { const b = e.target.closest('button[data-home]'); if (b) setHome(b.dataset.home); };
$('#btnSbNew').onclick = newNote;
$('#btnNew').onclick = newNote;
$('#btnTrash').onclick = openTrash;

