// ---------------------------------------------------------------- popovers & menus
let popPick = null;
let menuOn = false;                               // a showMenu() list is open: arrows / Enter drive it
let popKey = null;                                // a popover's own keys (the table size picker)
// Below the point (or the button it drops from); else above that button, not over it; in a low window the compact
// form (smaller grid, no hint), and if that still doesn't fit, the roomier side with a scroll.
let popAnchorTop = null;                          // top of the button a menu drops from (set just before showPop)
function showPop(x, y, html, onPick) {
  pop.innerHTML = html;
  pop.hidden = false;
  pop.classList.remove('tight');
  pop.style.maxHeight = '';
  popPick = onPick;
  const top0 = popAnchorTop == null ? y - 6 : popAnchorTop;
  popAnchorTop = null;
  const below = innerHeight - 8 - y, above = top0 - 6 - 8;
  let h = pop.offsetHeight;
  if (h > below && h > above) { pop.classList.add('tight'); h = pop.offsetHeight; }
  let t = y;
  if (h > below) {
    if (h <= above) t = top0 - 6 - h;
    else if (above > below) { t = 8; pop.style.maxHeight = above + 'px'; }
    else pop.style.maxHeight = Math.max(80, below) + 'px';
  }
  pop.style.left = clamp(x, 8, innerWidth - pop.offsetWidth - 8) + 'px';
  pop.style.top = t + 'px';
}
function closePop() { if (pop.hidden) return; pop.hidden = true; pop.innerHTML = ''; popPick = null; menuOn = false; popKey = null; }
pop.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
pop.addEventListener('click', e => {
  const b = e.target.closest('[data-v],[data-i]');
  if (!b || !popPick) return;
  const f = popPick;
  closePop();
  f(b);
});
document.addEventListener('mousedown', e => { if (!pop.hidden && !pop.contains(e.target)) closePop(); }, true);
window.addEventListener('blur', closePop);
function showMenu(x, y, items) {
  const html = items.map((it, i) => {
    if (it.sep) return '<div class="msep"></div>';
    if (it.colors) return `<div class="mlabel">색상</div><div class="swatches">${COLOR_KEYS.map(k => `<button class="sw${it.value === k ? ' on' : ''}" data-i="${i}" data-c="${k}" title="${COLOR_NAMES[k]}" style="--c:${NOTE_COLORS[k]};background:var(--c)"></button>`).join('')}</div>`;
    return `<button class="mit${it.danger ? ' danger' : ''}${it.on ? ' on' : ''}" data-i="${i}"${it.disabled ? ' disabled' : ''}>${it.glyph ? `<i class="mg">${it.glyph}</i>` : it.icon ? ic(it.icon) : '<i></i>'}<span>${esc(it.label)}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ''}</button>`;
  }).join('');
  showPop(x, y, html, b => {
    const it = items[+b.dataset.i];
    if (it.colors) it.pick(b.dataset.c); else if (it.action) it.action();
  });
  menuOn = true;
}
function menuMove(d) {
  const rows = $$('.mit:not(:disabled)', pop);
  if (!rows.length) return;
  const i = rows.findIndex(b => b.classList.contains('cur'));
  rows.forEach(b => b.classList.remove('cur'));
  rows[i < 0 ? (d > 0 ? 0 : rows.length - 1) : (i + d + rows.length) % rows.length].classList.add('cur');
}
pop.addEventListener('mousemove', e => {
  const b = e.target.closest('.mit');
  if (b && !b.classList.contains('cur')) { $$('.mit.cur', pop).forEach(x => x.classList.remove('cur')); b.classList.add('cur'); }
});
// While a menu is open the keyboard drives it; any other key closes it and then does its usual job,
// so the shortcuts printed in the menu (Ctrl+C, Ctrl+B ...) work right there.
document.addEventListener('keydown', e => {
  if (pop.hidden || e.isComposing || e.keyCode === 229) return;   // Korean typing closes it on compositionstart (below)
  const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
  // a row that prints this very key (Enter / F2 / Del / Esc in the note menus) runs, wherever the menu was opened
  const row = menuOn && plain ? $$('.mit:not(:disabled)', pop).find(b => { const k = b.querySelector('kbd'); return k && k.textContent === (e.key === 'Escape' ? 'Esc' : keyName(codeOf(e))); }) : null;
  if (e.key === 'Escape' && !row) { e.preventDefault(); e.stopPropagation(); closePop(); return; }
  if (popKey && popKey(e)) { e.preventDefault(); e.stopPropagation(); return; }
  if (!menuOn) { if (!/^(Control|Shift|Alt|Meta|AltGraph|HangulMode|HanjaMode)$/.test(e.key)) closePop(); return; }   // a color picker: any other key lets go
  if (plain && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); e.stopPropagation(); menuMove(e.key === 'ArrowDown' ? 1 : -1); return; }
  const cur = plain && e.key === 'Enter' && $('.mit.cur', pop);
  if (cur || row) { e.preventDefault(); e.stopPropagation(); (cur || row).click(); return; }
  if (/^(Control|Shift|Alt|Meta|AltGraph|HangulMode|HanjaMode)$/.test(e.key)) return;
  closePop();
}, true);
// the IME's first key is keyCode 229 (left alone above, no DOM work allowed then): close the menu once it composes
editor.addEventListener('compositionstart', () => { if (menuOn) closePop(); });
function colorMenu(id, x, y) {
  const n = noteById(id);
  if (n) showMenu(x, y, [{ colors: true, value: n.color, pick: c => setColor(id, c) }]);
}
function noteMenu(id, x, y) {
  const n = noteById(id);
  if (!n) return;
  const here = view === 'editor' && id === cur;   // the ⋯ menu of the open note: no '열기', and Del means a character here
  showMenu(x, y, [
    ...(here ? [] : [{ label: '열기', icon: 'i-open', kbd: 'Enter', action: () => openNote(id) }]),
    { label: '이름 바꾸기', icon: 'i-edit', kbd: 'F2', action: () => (view === 'board' ? renameInline(id) : openNote(id, { focusTitle: true })) },
    { label: n.hotkey ? `단축키 변경 (${n.hotkey.label})` : '전역 단축키 지정…', icon: 'i-key', action: () => setNoteHotkey(id) },
    { label: n.pinned ? '고정 해제' : '맨 앞에 고정', icon: 'i-pin', action: () => togglePin(id) },
    { colors: true, value: n.color, pick: c => setColor(id, c) },
    { sep: true },
    { label: '복사', icon: 'i-copy', kbd: here ? '' : 'Ctrl+C', action: () => copyNote(id) },
    { label: '텍스트로 복사', icon: 'i-copy', action: () => copyText(id) },
    { label: '복제', icon: 'i-plus', action: () => duplicate(id) },
    { label: '내보내기 (.txt)', icon: 'i-export', action: () => exportNote(id, 'txt') },
    { label: '내보내기 (.html)', icon: 'i-export', action: () => exportNote(id, 'html') },
    { sep: true },
    { label: '삭제', icon: 'i-trash', kbd: here ? '' : 'Del', danger: true, action: () => deleteNote(id) }
  ]);
}

