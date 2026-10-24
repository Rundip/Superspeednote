// ---------------------------------------------------------------- trash (휴지통)
// Read from disk only while this dialog is open, so it costs nothing the rest of the time.
let trashItems = null;
let trashQuiet = 0, trashFocus = -1;              // trashQuiet: restores still to come from "모두 복원" (one toast at the end)
function openTrash(after) {                       // after: where Esc / 닫기 goes back to (Settings)
  openModal(`<div class="dlg wide trash"><div class="dlg-head">${ic('i-trash')}<h3>휴지통</h3><span class="dlg-sub" id="trSub"></span></div>` +
    `<div class="dlg-body tr-body" id="trList"><div class="qs-empty">불러오는 중…</div></div><div class="dlg-foot"><span class="ver">↑↓ 선택 · Enter 복원 · Delete 영구 삭제</span><span style="flex:1"></span>` +
    `<button class="btn" id="trAll" hidden>모두 복원</button><button class="btn ghost danger" id="trEmpty" hidden>휴지통 비우기</button><button class="btn primary" id="trDone">닫기</button></div></div>`,
    () => { trashItems = null; trashQuiet = 0; if (after) setTimeout(after, 0); });
  trashItems = null; trashFocus = -1;
  $('#trDone').onclick = closeModal;
  $('#trAll').onclick = () => {                   // oldest deleted last, so they land in their old order
    const list = trashItems.slice().reverse().slice(0, MAX_NOTES - S.notes.length);
    if (!list.length) { toast(`메모는 ${MAX_NOTES}개까지예요`); return; }
    trashQuiet = list.length;
    list.forEach(x => restoreTrash(x));
  };
  const tl = $('#trList');
  tl.addEventListener('dblclick', e => { const row = e.target.closest('.tr-item'); if (row && !e.target.closest('button') && trashItems) restoreTrash(trashItems[+row.dataset.i], true); });
  modal.querySelector('.dlg').addEventListener('keydown', e => {
    if (!trashItems || !trashItems.length || e.target.nodeName === 'INPUT') return;
    const rows = $$('.tr-item', tl);
    let i = rows.findIndex(r => r.classList.contains('cur'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      i = clamp(i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1), 0, rows.length - 1);
      rows.forEach(r => r.classList.toggle('cur', r === rows[i])); rows[i].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && i >= 0 && !e.target.closest('.dlg-foot')) { e.preventDefault(); restoreTrash(trashItems[+rows[i].dataset.i], e.shiftKey); }
    else if (e.key === 'Delete' && i >= 0) { e.preventDefault(); rows[i].querySelector('.tr-del').click(); }
  });
  $('#trList').onclick = e => {
    const b = e.target.closest('button'), row = e.target.closest('.tr-item');
    if (!b || !row || !trashItems) return;
    const x = trashItems[+row.dataset.i];
    if (b.dataset.act === 'restore') restoreTrash(x, e.shiftKey);
    else if (armed(b)) { host.send('trashPurge', x.f); trashItems = trashItems.filter(t => t !== x); renderTrash(); toast('영구 삭제했어요'); }
    else if (!b.classList.contains('arm')) arm(b, '한 번 더 누르면 영구 삭제', '영구 삭제');
  };
  $('#trEmpty').onclick = e => {
    const b = e.currentTarget;
    if (!b.classList.contains('arm')) { arm(b, '', `정말 비울까요? ${trashItems.length}개 영구 삭제`); return; }
    if (!armed(b)) return;
    const n = trashItems.length;
    host.send('trashEmpty');
    trashItems = []; renderTrash();
    toast(`휴지통을 비웠어요 · ${n}개 영구 삭제`);
  };
  host.send('trashList');
}
let trashOpenNext = null;                          // restore and open: the id of the one to open when it is back
// two-step for anything permanent: the first click arms the button for a few seconds
function arm(b, title, text) {
  const t0 = b.title, x0 = b.innerHTML;
  b.classList.add('arm');
  b.dataset.armAt = now();
  if (title) b.title = title;
  if (text) b.textContent = text;
  setTimeout(() => { if (b.isConnected) { b.classList.remove('arm'); b.title = t0; b.innerHTML = x0; } }, 4000);
}
// the confirming click must come a moment later: a habitual double-click never deletes for good
function armed(b) { return b.classList.contains('arm') && now() - +b.dataset.armAt > 450; }
function onTrash(json) {
  if (!$('#trList')) return;
  let list = [];
  try { list = JSON.parse(json); } catch (e) { /* unreadable: show it empty */ }
  trashItems = list.map(x => { let m = null; try { m = x.m ? JSON.parse(x.m) : null; } catch (e) { /* old file without info */ } return { f: x.f, at: x.at, m, p: x.p || '' }; });
  renderTrash();
}
function renderTrash() {
  const list = $('#trList');
  if (!list || !trashItems) return;
  const n = trashItems.length, b = $('#trEmpty');
  $('#trSub').textContent = n ? `삭제한 메모 ${n}개` : '';
  b.hidden = !n; b.classList.remove('arm'); b.textContent = '휴지통 비우기';
  $('#trAll').hidden = n < 2;
  list.innerHTML = trashItems.map((x, i) => {
    const m = x.m || {}, lines = x.p.split('\n');               // x.p: the note's first lines
    const title = m.title || m.line1 || (lines[0] || '').slice(0, 60) || '제목 없음';
    const pv = (m.title ? lines : lines.slice(1)).join(' ').slice(0, 90);
    return `<div class="tr-item" data-i="${i}"><span class="c-dot" data-c="${NOTE_COLORS[m.color] ? m.color : 'navy'}" style="--c:${NOTE_COLORS[m.color] || NOTE_COLORS.navy}"></span>` +
      `<div class="tr-txt"><b>${esc(title)}</b><small>${esc(pv) || '&nbsp;'}</small></div><span class="tr-at">${relTime(x.at)} 삭제</span>` +
      `<button class="btn tr-restore" data-act="restore">복원</button><button class="tr-del" title="영구 삭제">${ic('i-trash')}</button></div>`;
  }).join('') || `<div class="qs-empty">${ic('i-trash')}<b>휴지통이 비어 있어요</b><small>메모를 삭제하면 여기에 보관돼요. 복원하면 원래 자리 · 색 · 단축키 그대로 돌아와요.</small></div>`;
  if (trashFocus >= 0) {                          // after a restore: on to the next row (or 닫기 when none is left)
    const r = $$('.tr-item', list)[Math.min(trashFocus, n - 1)];
    if (r) { r.classList.add('cur'); r.querySelector('.tr-restore').focus({ preventScroll: true }); } else $('#trDone').focus();
    trashFocus = -1;
  }
}
function restoreTrash(x, open) {                 // open: restore, then open it (Shift+Enter / double-click)
  if (!x) return;
  if (S.notes.length >= MAX_NOTES) { toast(`메모는 ${MAX_NOTES}개까지예요 · 다른 메모를 삭제한 뒤 복원해 주세요`); return; }
  const old = x.m && x.m.id;
  const id = old && /^[A-Za-z0-9_-]{1,64}$/.test(old) && !noteById(old) ? old : uid();
  if (trashItems) trashFocus = trashItems.indexOf(x);
  if (open) trashOpenNext = id;
  host.send('trashRestore', x.f, id);
}
function onTrashRestored(arg) {                   // file name, new id, saved info, contents
  const p = arg.split(SEP), f = p[0], id = p[1], html = p.slice(3).join(SEP);
  if (trashItems) { trashItems = trashItems.filter(t => t.f !== f); renderTrash(); }
  if (!id) { toast('복원하지 못했어요 · 이미 복원했거나 파일이 없어요'); return; }
  if (noteById(id)) { toast('이미 목록에 있는 메모예요'); return; }
  let m = {};
  try { m = p[2] ? JSON.parse(p[2]) : {}; } catch (e) { /* no info: defaults */ }
  const root = frag(html);
  const n = { id, title: m.title || '', color: NOTE_COLORS[m.color] ? m.color : 'navy', pinned: !!m.pinned, hotkey: null,
    created: m.created || now(), updated: m.updated || now(), preview: previewOf(root), line1: firstLineOf(root) };
  if (m.hotkey && m.hotkey.vk && !hkOwner(m.hotkey, id)) n.hotkey = m.hotkey;   // its hotkey too, unless taken since
  S.notes.splice(Math.min(typeof m.pos === 'number' ? m.pos : 0, S.notes.length), 0, n);
  bodies[id] = html;
  stateDirty = true; flushState();
  if (n.hotkey) applyHotkeys();
  if (view === 'board') selId = id;
  rerender();
  if (trashOpenNext === id) { trashOpenNext = null; closeModal(); openNote(id); return; }
  if (trashQuiet > 0) { if (--trashQuiet === 0) toast('삭제한 메모를 모두 복원했어요'); return; }
  toast(`‘${titleOf(n) || '제목 없음'}’ 복원했어요`, '열기', () => { closeModal(); openNote(id); });
}
function devTrash(cmd, a, b, c) {                 // browser preview: the trash in localStorage
  const all = () => Object.keys(localStorage).filter(k => k.startsWith('ssn.t.'));
  if (cmd === 'delNote') {
    const h = localStorage.getItem('ssn.n.' + a);
    localStorage.removeItem('ssn.n.' + a);
    if (b !== 'purge' && h != null) localStorage.setItem('ssn.t.' + a + '_' + Date.now(), JSON.stringify({ m: c || '', h, at: Date.now() }));
  } else if (cmd === 'trashList') {
    const list = all().map(k => { const v = JSON.parse(localStorage.getItem(k)); return { f: k.slice(6), at: v.at, m: v.m, p: toPlain(frag(v.h)).split('\n').filter(l => l.trim()).slice(0, 6).join('\n') }; }).sort((x, y) => y.at - x.at);
    setTimeout(() => onTrash(JSON.stringify(list)), 30);
  } else if (cmd === 'trashRestore') {
    const v = JSON.parse(localStorage.getItem('ssn.t.' + a) || 'null');
    localStorage.removeItem('ssn.t.' + a);
    if (v) localStorage.setItem('ssn.n.' + b, v.h);
    setTimeout(() => onTrashRestored([a, v ? b : '', v ? v.m : '', v ? v.h : ''].join(SEP)), 30);
  } else if (cmd === 'trashPurge') localStorage.removeItem('ssn.t.' + a);
  else if (cmd === 'trashEmpty') all().forEach(k => localStorage.removeItem(k));
  else if (cmd === 'unTrash') { const k = all().filter(k => k.startsWith('ssn.t.' + a + '_')).sort().pop(); if (k) localStorage.removeItem(k); }
}

