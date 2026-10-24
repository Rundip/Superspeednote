// ---------------------------------------------------------------- board
// The board is built once and then patched: only edited notes' cards are redrawn, and search just hides
// cards. With hundreds of notes a full rebuild on every keystroke / return to the board would be felt.
let boardSig = '';
const staleCards = new Set();                     // notes edited since their card was drawn
function renderBoard(force) {
  const list = ordered();
  const key = list.map(n => n.id).join(',') + '|' + MAX_NOTES;
  if (force || key !== boardSig || !grid.firstChild) {
    boardSig = key;
    staleCards.clear();
    let h = '';
    list.forEach((n, i) => { h += cardHTML(n, i); });
    if (S.notes.length < MAX_NOTES) h += `<div class="card new" data-new="1"><span class="plus">${ic('i-plus')}</span><b>새 메모</b><small data-k="newNote">${esc(kl('newNote'))}</small></div>`;
    h += '<div class="empty" hidden></div>';
    grid.innerHTML = h;
  } else if (staleCards.size) {
    for (const id of staleCards) {
      const el = grid.querySelector(`.card[data-id="${id}"]`), n = noteById(id);
      if (el && n) el.outerHTML = cardHTML(n, list.indexOf(n));
    }
    staleCards.clear();
  }
  filterBoard();
}
function filterBoard() {
  const q = query.trim().toLowerCase(), terms = termsOf(q), kinds = terms.map(kindOf);
  const byId = new Map(S.notes.map(n => [n.id, n]));
  let first = null, selShown = false, shown = 0;
  for (const c of grid.children) {
    const id = c.dataset.id;
    if (!id) { if (c.classList.contains('new')) c.hidden = !!q; continue; }
    const n = byId.get(id);
    const ok = !q || (n && noteMatches(n, terms, kinds));
    c.hidden = !ok;
    if (!ok) multi.delete(id);
    if (ok) { shown++; if (!first) first = id; if (id === selId) selShown = true; }
  }
  if (!selShown) selId = first;
  markSel();
  // the cards filter at once; their text snippets (new text = costly line layout) wait until typing pauses
  clearTimeout(hitsT);
  if (terms.length) hitsT = setTimeout(() => showHits(terms, kinds, new Map(S.notes.map(n => [n.id, n]))), 150);
  else showHits(terms, kinds, byId);
  boardStatus(shown);
}
let hitsT = 0;
// the hero count, the search box's ×, and a next step when no card is shown
function boardStatus(shown) {
  const q = query.trim(), n = S.notes.length, pill = $('#noteCount');
  pill.textContent = q ? `${shown}개 찾음` : `메모 ${n}개${n >= 450 ? ` / ${MAX_NOTES}` : ''}`;
  pill.classList.toggle('warn', !q && n >= 450);
  $('#sClear').hidden = !boardSearch.value;
  const empty = grid.querySelector('.empty');
  if (!empty) return;
  empty.hidden = shown > 0;
  if (shown) return;
  const k = kl('newNote');
  empty.classList.toggle('zero', !q);
  empty.innerHTML = q ? `<b>‘${esc(q)}’ 검색 결과가 없어요</b><small><kbd>Enter</kbd> 이 제목으로 새 메모 · <kbd>Esc</kbd> 검색 지우기</small>`
    : `<b>아직 메모가 없어요</b><small><kbd>Enter</kbd>${k ? ` 또는 <kbd>${esc(k)}</kbd>` : ''} 새 메모 · 삭제한 메모는 휴지통에서 복원</small>`;
}
function cardHTML(n, idx) {
  const pv = previewAfterTitle(n), title = titleOf(n), empty = !pv && !n.line1;
  return `<div class="card" data-id="${n.id}" data-c="${n.color}" draggable="true" style="--c:${NOTE_COLORS[n.color]}">` +
    `<button class="c-copy" tabindex="-1" title="메모 전체 복사 (Ctrl+C)"><i class="mi mi-copy"></i></button>` +
    `<div class="c-head"><span class="c-dot"></span><div class="c-title${title ? '' : ' ph'}">${esc(title || '제목 없음')}</div>` +
    `${n.pinned ? '<i class="mi mi-pin c-pin"></i>' : ''}${idx < 9 ? `<span class="c-idx" title="Ctrl+${idx + 1}">${idx + 1}</span>` : ''}</div>` +
    `<div class="c-prev">${pv ? esc(pv.slice(0, 90)) : empty ? '<span class="ph">비어 있음</span>' : ''}</div>` +
    `<div class="c-foot">${n.hotkey ? `<span class="chip${hkFailed.has(n.id) ? ' bad' : ''}" title="${hkFailed.has(n.id) ? '다른 프로그램이 사용 중' : '전역 단축키'}"><i class="mi mi-key"></i>${esc(n.hotkey.label)}</span>` : ''}<span class="c-time">${relTime(n.updated)}</span></div></div>`;
}
// Selection: selId = the focused card; multi = cards picked with Shift (range) / Ctrl (toggle) for bulk delete.
const multi = new Set();
let selAnchor = null;
function markSel() {
  for (const c of grid.querySelectorAll('.card.sel,.card.msel')) {
    if (c.dataset.id !== selId) c.classList.remove('sel');
    if (!multi.has(c.dataset.id)) c.classList.remove('msel');
  }
  const c = selId && grid.querySelector(`.card[data-id="${selId}"]`);
  if (c) c.classList.add('sel');
  if (multi.size > 1) for (const id of multi) { const m = grid.querySelector(`.card[data-id="${id}"]`); if (m) m.classList.add('msel'); }
  const pill = $('#selCount');
  pill.hidden = multi.size < 2;
  pill.textContent = `${multi.size}개 선택 · Del 삭제 · Esc 해제`;
  selBar();
}
// Several cards picked: a bar that stays at the bottom of the board (the hero's count scrolls away) and gives
// the mouse what the keys do.
let selBarKey = '';
function selBar() {
  const on = multi.size > 1, bar = $('#selBar');
  app.classList.toggle('selbar-on', on && view === 'board');
  bar.hidden = !on;
  if (!on) return;
  const pinned = S.notes.every(n => !multi.has(n.id) || n.pinned), key = multi.size + (pinned ? 'p' : '');
  if (key === selBarKey) return;
  selBarKey = key;
  bar.innerHTML = `<b>${multi.size}개 선택됨</b><button class="btn" data-a="pin">${pinned ? '고정 해제' : '고정'}</button>` +
    '<button class="btn" data-a="copy">복사<kbd>Ctrl+C</kbd></button><button class="btn danger" data-a="del">삭제<kbd>Del</kbd></button><button class="btn" data-a="clear">해제<kbd>Esc</kbd></button>';
}
$('#selBar').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'), a = b && b.dataset.a, ids = [...multi];
  if (a === 'pin') pinNotes(ids); else if (a === 'copy') copySel(); else if (a === 'del') askDeleteNotes(ids); else if (a === 'clear') clearMulti();
});
function pinNotes(ids) {                          // all pinned, or all unpinned when they already are
  const set = new Set(ids), on = !S.notes.every(n => !set.has(n.id) || n.pinned);
  for (const n of S.notes) if (set.has(n.id)) n.pinned = on;
  saveStateSoon(); rerender();
}
// Ctrl+C on the board: the selected card, or every picked card (title + text, a blank line between)
function copySel() {
  if (multi.size < 2) { if (selId) copyNote(selId); return; }
  const list = ordered().filter(n => multi.has(n.id));
  putClip({
    text: list.map(n => (n.title ? n.title + '\n' : '') + noteText(n.id).replace(/\s+$/, '')).join('\n\n'),
    html: list.map(n => (n.title ? `<div><b>${esc(n.title)}</b></div>` : '') + (bodies[n.id] || '')).join('<div><br></div>')
  });
  toast(`메모 ${list.length}개를 복사했어요`);
}
function visibleIds() { return $$('.card[data-id]:not([hidden])', grid).map(c => c.dataset.id); }
// mode: 'single' (default), 'range' (Shift: anchor .. id), 'toggle' (Ctrl: add / remove one)
function setSel(id, scroll = true, mode = 'single') {
  if (mode === 'range' && (selAnchor || selId)) {
    const ids = visibleIds();
    const a = ids.indexOf(selAnchor || selId), b = ids.indexOf(id);
    if (!selAnchor) selAnchor = selId;
    multi.clear();
    if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) multi.add(ids[i]);
  } else if (mode === 'toggle') {
    if (!multi.size && selId) multi.add(selId);
    if (multi.has(id) && multi.size > 1) multi.delete(id); else multi.add(id);
    selAnchor = id;
  } else { multi.clear(); selAnchor = id; }
  selId = id; markSel();
  const c = id && grid.querySelector(`.card[data-id="${id}"]`);
  if (c && scroll) c.scrollIntoView({ block: 'nearest' });
}
function selectAllCards() { const ids = visibleIds(); if (!ids.length) return; multi.clear(); ids.forEach(i => multi.add(i)); selAnchor = ids[0]; if (!selId || !multi.has(selId)) selId = ids[0]; markSel(); }
function clearMulti() { if (multi.size < 2) return false; multi.clear(); markSel(); return true; }
function moveSel(dx, dy, extend) {
  const cards = $$('.card[data-id]:not([hidden])', grid);
  if (!cards.length) return;
  let i = cards.findIndex(c => c.dataset.id === selId);
  if (i < 0) { setSel(cards[0].dataset.id); return; }
  const cols = Math.max(1, cards.filter(c => c.offsetTop === cards[0].offsetTop).length);
  setSel(cards[clamp(i + dx + dy * cols, 0, cards.length - 1)].dataset.id, true, extend ? 'range' : 'single');
}
grid.addEventListener('mousedown', e => {
  const c = e.target.closest('.card[data-id]');
  if (!c || e.target.closest('.rename,.c-copy')) return;
  const id = c.dataset.id;
  if (e.shiftKey) { e.preventDefault(); setSel(id, false, 'range'); }
  else if (e.ctrlKey || e.metaKey) { e.preventDefault(); setSel(id, false, 'toggle'); }
  else if (multi.has(id) && multi.size > 1) {     // pressed inside a multi-selection: it stays, so a right-click or a
    selId = id; markSel();                        // drag (out to a folder) takes them all; a plain click picks this one
    keepPick = e.button === 0 ? id : null;
  }
  else setSel(id, false);
});
let keepPick = null;
grid.addEventListener('click', e => {
  const cp = e.target.closest('.c-copy');
  if (cp) { copyNote(cp.closest('.card').dataset.id); return; }
  const kc = e.target.closest('.card[data-id]');
  if (keepPick && kc && kc.dataset.id === keepPick && !e.shiftKey && !e.ctrlKey && !e.metaKey) { keepPick = null; setSel(kc.dataset.id, false); return; }
  keepPick = null;
  if (e.target.closest('.card.new')) newNote();
  else if (!e.target.closest('.card[data-id]') && e.target === grid) clearMulti();       // click on empty space
});
// Clicks leave the keyboard in the search box: at once on the board's background, and on a card when the
// button is released (stopping a card's mousedown would also stop it being dragged).
$('#board').addEventListener('mousedown', e => {
  const t = e.target, bd = e.currentTarget;
  if (e.button === 1 || t.closest('input,.card[data-id]') || (t === bd && e.offsetX >= bd.clientWidth) || grid.querySelector('.rename')) return;
  e.preventDefault();
  boardSearch.focus({ preventScroll: true });
});
grid.addEventListener('mouseup', () => { if (!grid.querySelector('.rename')) boardSearch.focus({ preventScroll: true }); });
grid.addEventListener('dblclick', e => {
  const c = e.target.closest('.card[data-id]');
  if (c && !e.target.closest('.rename,.c-copy')) openNote(c.dataset.id);
});
grid.addEventListener('contextmenu', e => {
  e.preventDefault();
  const c = e.target.closest('.card[data-id]');
  if (!c) return;
  if (multi.size > 1 && multi.has(c.dataset.id)) {
    const ids = [...multi];
    showMenu(e.clientX, e.clientY, [
      { label: `선택한 ${ids.length}개 삭제`, icon: 'i-trash', kbd: 'Del', danger: true, action: () => askDeleteNotes(ids) },
      { label: '선택 해제', kbd: 'Esc', action: clearMulti }
    ]);
    return;
  }
  setSel(c.dataset.id, false); noteMenu(c.dataset.id, e.clientX, e.clientY);
});
let dragId = null, dropAt = null, dragTold = 0;   // dropAt: { id, after } - exactly where the line is shown
// Dragging a note out of the app (the desktop, a folder, a mail): a file named after the note (Settings › 데이터
// picks HTML or text), made and dragged by the shell, with the note's text for programs that take text.
let noteDrag = 0, dragSrc = null, sbDrag = null, sbDrop = null, pinTold = 0;
// a note being dragged: in the app the shell's own file drag (it carries a file, so it is told apart by this flag),
// in a browser the page's drag (its own type)
const isNoteDrag = e => (HOST && !!noteDrag) || (!!e.dataTransfer && Array.from(e.dataTransfer.types).includes('text/x-ssn'));
// a click means no drag is going on (in case the shell's "ended" never came)
document.addEventListener('mousedown', () => { if (HOST && noteDrag && now() - noteDrag > 400) dragDone(); }, true);
function dragDone() {
  noteDrag = 0; dragId = null; dropAt = null; dragSrc = null; sbDrag = null; sbDrop = null; hideDropMark();
  $$('.card', grid).forEach(c => c.classList.remove('dragging', 'drop-l', 'drop-r'));
}
// where a dragged note will land: a bar in the gap before / after the card (vertical) or list row (horizontal)
const dropMark = document.createElement('div');
dropMark.id = 'dropMark';
document.body.appendChild(dropMark);
function showDropMark(el, after, vertical) {
  const r = el.getBoundingClientRect(), m = dropMark.style, kind = vertical ? 'v' : 'h';
  const fresh = !dropMark.classList.contains(kind);   // just appearing (or switching board <-> list): no gliding in
  if (fresh) { dropMark.className = 'snap'; void dropMark.offsetWidth; }
  if (vertical) {
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
    Object.assign(m, { left: ((after ? r.right + gap / 2 : r.left - gap / 2) - 2) + 'px', top: (r.top + 8) + 'px', width: '4px', height: Math.max(0, r.height - 16) + 'px' });
  } else {                                        // midway between this row and the one before / after it
    const nb = after ? el.nextElementSibling : el.previousElementSibling, q = nb && nb.getBoundingClientRect();
    const y = after ? (q ? (r.bottom + q.top) / 2 : r.bottom + 3) : (q ? (q.bottom + r.top) / 2 : r.top - 3);
    Object.assign(m, { left: (r.left + 14) + 'px', top: (y - 1.5) + 'px', width: Math.max(0, r.width - 26) + 'px', height: '3px' });
  }
  dropMark.className = kind + (fresh ? ' snap' : '');
  if (fresh) requestAnimationFrame(() => dropMark.classList.remove('snap'));
}
function hideDropMark() { dropMark.className = ''; }
// pinned notes keep their name order: dragging one shows it can't go elsewhere (it still drags out of the app)
function pinnedTold(over) {
  const n = noteById(dragSrc);
  if (!n || !n.pinned || !over || over.dataset.id === dragSrc || now() - pinTold < 3000) return;
  pinTold = now(); toast('고정한 메모는 이름 순서로 정렬돼요 · 고정을 풀면 옮길 수 있어요');
}
// group: the notes picked with Ctrl / Shift (board or list) - dragging one of them takes them all out, a file each
function dragNoteOut(e, id, group) {
  const n = noteById(id);
  if (!n) return 0;
  const ids = group && group.size > 1 && group.has(id) ? ordered().map(x => x.id).filter(x => group.has(x)) : [id];
  if (ids.includes(cur)) flushNote();
  noteDrag = now(); dragSrc = id;
  const kind = st.dragFormat === 'txt' ? 'txt' : 'html';
  const textOf = i => { const m = noteById(i); return (m && m.title ? m.title + '\n\n' : '') + noteText(i); };
  const text = ids.map(textOf).join('\n\n');
  if (HOST) {
    // the app drags a real file itself (WebView2 makes no file from a page's drag): this drag stops here, the
    // shell's starts at once while the button is still down. Over the app it reorders like this one did; the
    // shell says when it ended (dragOutDone)
    e.preventDefault();
    const clean = s => s.replace(/[\x1d\x1e\x1f]/g, ' ');
    if (ids.length === 1) {
      const { name, content } = exportContent(id, kind);
      host.send('dragOut', kind, name.replace(/\.[^.]+$/, ''), clean(text), content);
    } else {                                        // several: name and file of each (\x1d inside, \x1e between)
      const items = ids.map(i => { const { name, content } = exportContent(i, kind); return clean(name.replace(/\.[^.]+$/, '')) + '\x1d' + clean(content); });
      host.send('dragOutMany', kind, clean(text), items.join('\x1e'));
    }
    return ids.length;
  }
  e.dataTransfer.setData('text/x-ssn', id);
  // dragend goes to the element the drag started on, even once a re-render (a reorder, a save) has taken it off
  // the page - where it no longer reaches the board's or the list's own listener
  e.target.addEventListener('dragend', dragDone, { once: true });
  e.dataTransfer.setData('text/plain', text);
  return ids.length;
}
grid.addEventListener('dragstart', e => {
  const c = e.target.closest('.card[data-id]');
  if (!c) { e.preventDefault(); return; }
  const pn = noteById(c.dataset.id);
  dragId = query.trim() || (pn && pn.pinned) ? null : c.dataset.id;   // searching / pinned: the order can't change, but the note still drags out
  e.dataTransfer.effectAllowed = 'copyMove';
  keepPick = null;                                // a drag, not a click: the selection stays as it is
  if (dragNoteOut(e, c.dataset.id, multi) > 1) dragId = null;   // several out at once: no reordering by it
  c.classList.add('dragging');
});
grid.addEventListener('dragend', () => { dragDone(); boardSearch.focus({ preventScroll: true }); });
// a note dragged over a text field (the title, a search box, the open note) must not drop its text in there
const noteDropBlocked = e => isNoteDrag(e) && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]');
document.addEventListener('dragover', e => { if (noteDropBlocked(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } }, true);
document.addEventListener('drop', e => { if (noteDropBlocked(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
grid.addEventListener('dragover', e => {
  if (!dragId) {                                   // searching: no reordering - over another card, say why (the note still drags out)
    const c = noteDrag && query.trim() && e.target.closest('.card[data-id]');
    if (c && !c.classList.contains('dragging') && now() - dragTold > 3000) { dragTold = now(); toast('검색 중에는 순서를 바꿀 수 없어요 · Esc로 검색 지우기'); }
    else if (noteDrag && !query.trim()) pinnedTold(e.target.closest('.card[data-id]'));
    return;
  }
  e.preventDefault();
  let c = e.target.closest('.card[data-id]');
  // in the gap between cards: the card beside it, else the one above
  if (!c && e.target === grid) for (const [dx, dy] of [[-12, 0], [12, 0], [0, -12]]) { const x = document.elementFromPoint(e.clientX + dx, e.clientY + dy); if ((c = x && x.closest('.card[data-id]'))) break; }
  const from = noteById(dragId), to = c && noteById(c.dataset.id);
  const across = to && !!to.pinned !== !!from.pinned;   // pinned cards stay in front: no line where a card can't land
  e.dataTransfer.dropEffect = across ? 'none' : 'move';
  $$('.drop-l,.drop-r', grid).forEach(x => x.classList.remove('drop-l', 'drop-r'));
  dropAt = null;
  if (!to || across || to.id === dragId) { hideDropMark(); return; }
  const r = c.getBoundingClientRect();
  dropAt = { id: to.id, after: e.clientX >= r.left + r.width / 2 };
  c.classList.add(dropAt.after ? 'drop-r' : 'drop-l');
  showDropMark(c, dropAt.after, true);
});
grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) { dropAt = null; hideDropMark(); $$('.drop-l,.drop-r', grid).forEach(x => x.classList.remove('drop-l', 'drop-r')); } });
grid.addEventListener('drop', e => {
  if (!dragId) return;
  e.preventDefault();
  const at = dropAt;
  if (!at) return;
  const [m] = S.notes.splice(S.notes.findIndex(n => n.id === dragId), 1);
  let to = S.notes.findIndex(n => n.id === at.id);
  if (at.after) to++;
  S.notes.splice(to, 0, m);
  dragDone();                                      // before the cards are redrawn: dragend lands on the old card
  saveStateSoon();
  renderBoard();
  boardSearch.focus({ preventScroll: true });
});
// The search box is where the keyboard rests on the board: Windows' Korean IME only composes in an editable
// field, so a first syllable typed on the grid came out as a Latin letter. The box passes the board keys on.
let qAuto = false;                                // the text was selected for you on return: typing replaces it, Ctrl+C copies the card
boardSearch.addEventListener('input', () => { qAuto = false; query = boardSearch.value; filterBoard(); });
boardSearch.addEventListener('mousedown', () => { qAuto = false; });
boardSearch.addEventListener('compositionstart', () => { if (menuOn) closePop(); });   // Korean typing over an open card menu
boardSearch.addEventListener('keydown', e => {
  if (e.isComposing) return;
  const k = e.key, typed = !!boardSearch.value, plain = !e.ctrlKey && !e.metaKey && !e.altKey, ctl = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
  if (k === 'Enter' && plain) { e.preventDefault(); boardEnter(); }
  else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (typed) clearSearch(); else clearMulti(); }
  else if ((k === 'ArrowDown' || k === 'ArrowUp') && plain) { e.preventDefault(); moveSel(0, k === 'ArrowDown' ? 1 : -1, e.shiftKey); }
  else if (plain && (k === 'F2' || (!typed && /^(ArrowLeft|ArrowRight|Home|End|Delete| )$/.test(k)))) boardKey(e);
  else if (ctl && e.code === 'KeyC' && (qAuto || boardSearch.selectionStart === boardSearch.selectionEnd)) { e.preventDefault(); copySel(); }
  else if (ctl && e.code === 'KeyA' && !typed) { e.preventDefault(); selectAllCards(); }
  else if (/^(Arrow|Home|End|Page)/.test(k) || (ctl && e.code === 'KeyA')) qAuto = false;   // selecting the text yourself
});
$('#sClear').addEventListener('mousedown', e => e.preventDefault());   // the box keeps the keyboard
$('#sClear').onclick = () => { clearSearch(); boardSearch.focus(); };
function clearSearch() { boardSearch.value = ''; query = ''; qAuto = false; filterBoard(); }
// Enter: open the selected card; nothing shown -> a new note, named after the search if there is one
function boardEnter() {
  const t = boardSearch.value.trim();
  if (selId) openNote(selId); else if (t) newNoteTitled(t); else newNote();
}
function boardKey(e) {
  switch (e.key) {
    case 'ArrowRight': moveSel(1, 0, e.shiftKey); break;
    case 'ArrowLeft': moveSel(-1, 0, e.shiftKey); break;
    case 'ArrowDown': moveSel(0, 1, e.shiftKey); break;
    case 'ArrowUp': moveSel(0, -1, e.shiftKey); break;
    case 'Home': { const c = grid.querySelector('.card[data-id]:not([hidden])'); if (c) setSel(c.dataset.id, true, e.shiftKey ? 'range' : 'single'); break; }
    case 'End': { const c = $$('.card[data-id]:not([hidden])', grid).pop(); if (c) setSel(c.dataset.id, true, e.shiftKey ? 'range' : 'single'); break; }
    case 'Enter': boardEnter(); break;
    case ' ': if (selId) openNote(selId); break;
    case 'Delete': if (multi.size > 1) askDeleteNotes([...multi]); else if (selId) deleteNote(selId); break;
    case 'F2': if (selId) renameInline(selId); break;
    case '/': boardSearch.focus(); break;
    default:
      if (e.key.length === 1 && e.key !== ' ') boardSearch.focus();   // start typing = search
      return;
  }
  e.preventDefault();
}
function renameInline(id) {
  const card = grid.querySelector(`.card[data-id="${id}"]`);
  const n = noteById(id);
  if (!card || !n) return;
  card.draggable = false;
  const t = card.querySelector('.c-title');
  t.classList.remove('ph');
  t.innerHTML = `<input class="rename" placeholder="제목" spellcheck="false">`;
  const inp = t.firstChild;
  inp.value = n.title || '';
  inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    if (ok && inp.value.trim() !== (n.title || '')) { n.title = inp.value.trim(); n.updated = now(); saveStateSoon(); }
    staleCards.add(id); renderBoard(); boardSearch.focus({ preventScroll: true });
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(true));
}

