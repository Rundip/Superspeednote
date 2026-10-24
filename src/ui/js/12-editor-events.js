// ---------------------------------------------------------------- editor events
const inputKind = t => t.startsWith('delete') ? 'del' : t === 'insertParagraph' || t === 'insertLineBreak' ? 'para'
  : t === 'insertText' || t === 'insertCompositionText' || t === 'insertReplacementText' ? 'ins' : 'other';
editor.addEventListener('beforeinput', e => {
  if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); return; }
  if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); return; }
  const kind = inputKind(e.inputType);
  // a new step: typing after deleting (or the other way round), Enter, a drop / anything else, or the caret was
  // moved since the last key (checked here too, in case its selectionchange hasn't come yet)
  if (burstSel && !composing && (kind === 'para' || kind === 'other' || (kind === 'del') !== (grpKind === 'del') || (grpAtKey && JSON.stringify(selSave()) !== grpAtKey))) histCommit();
  if (!histT && !burstSel) burstSel = selSave();
  grpKind = kind;
  if (e.inputType.startsWith('insert')) editor.classList.remove('is-empty');   // hide the hint on the first keystroke
});
editor.addEventListener('input', e => {
  if (objSel && !objSel.isConnected) clearObj();
  if (!composing && needsRoot()) ensureRoot();
  if (editor.classList.contains('is-empty') && editor.textContent) editor.classList.remove('is-empty');
  if (e.inputType === 'insertParagraph') {
    const li = closestSel('ul.checklist > li');
    if (li && li.dataset.checked === 'true' && !li.textContent) li.dataset.checked = 'false';
  }
  if (!/^insert(Text|CompositionText|ReplacementText)$/.test(e.inputType)) relist();   // Enter, deleting, a drop: numbers again
  markDirty();
  histSoon();
  statsSoon();
  posOvSoon();
  if (findOpen) findSoon();
  if (arrowAfterTyping(e)) return;
  if (burstSel) {                                 // where the caret is now: moved away from here = the step ends
    grpAt = selSave(); grpAtKey = JSON.stringify(grpAt);
    if (/^insert(Text|CompositionText)$/.test(e.inputType) && e.data) {
      if (/\S/.test(e.data)) grpWord = true;
      else if (grpWord && !composing && e.inputType === 'insertText') histCommit();   // a word and its space: one step
    }
    if (grpKind === 'other') histCommit();        // a drop / an IME suggestion ... on its own
  }
});
// "->" typed in a note becomes "→" (not in code). Backspace right after it, or Ctrl+Z, gives "->" back.
let autoArrow = null;                             // { node, at }: the caret right after an arrow just made
function arrowAfterTyping(e) {
  if (composing || e.inputType !== 'insertText' || e.data !== '>') return false;
  const r = selRange();
  if (!r || !r.collapsed || r.startContainer.nodeType !== 3) return false;
  const n = r.startContainer, k = r.startOffset;
  if (k < 2 || n.nodeValue[k - 2] !== '-' || (n.parentNode.closest && n.parentNode.closest('pre,code'))) return false;
  histCommit();                                   // "->" as typed is a step of its own: Ctrl+Z brings it back
  edit(() => {
    const x = document.createRange(); x.setStart(n, k - 2); x.setEnd(n, k);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(x);
    exec('insertText', '→');
  });
  const r2 = selRange();
  autoArrow = r2 && r2.collapsed ? { node: r2.startContainer, at: r2.startOffset } : null;
  return true;
}
function arrowBack() {
  const a = autoArrow, r = selRange();
  autoArrow = null;
  if (!a || !r || !r.collapsed || r.startContainer !== a.node || r.startOffset !== a.at || a.node.nodeType !== 3 || a.node.nodeValue[a.at - 1] !== '→') return false;
  edit(() => {
    const x = document.createRange(); x.setStart(a.node, a.at - 1); x.setEnd(a.node, a.at);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(x);
    exec('insertText', '->');
  });
  return true;
}
editor.addEventListener('mousedown', () => { autoArrow = null; }, true);
editor.addEventListener('compositionstart', () => {
  if (burstSel && (grpKind === 'del' || (grpAtKey && JSON.stringify(selSave()) !== grpAtKey))) histCommit(true);   // Korean typing after deleting / somewhere else: a new step
  composing = true; editor.classList.remove('is-empty');
});
editor.addEventListener('compositionend', () => { composing = false; if (needsRoot()) ensureRoot(); histSoon(); if (tipAfterIme) { tipAfterIme = false; tipReplace(); } });
editor.addEventListener('keydown', e => {
  if (objSel && !e.isComposing && objKey(e)) return;   // a selected picture / divider / table
  if (!e.isComposing) {                           // table cells first (Excel-style navigation / editing)
    if (editCell) { if (!editCell.isConnected) clearNav(); else if (e.keyCode !== 229 && editKey(e)) return; }
    else if (navLive() && navKey(e)) return;
  }
  if (e.isComposing || e.keyCode === 229) { autoArrow = null; return; }
  if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && arrowBack()) { e.preventDefault(); return; }
  if (e.key !== 'Shift') autoArrow = null;
  const mod = e.ctrlKey || e.metaKey, code = e.code;
  const act = actionFor(e, 'ed');                   // editing shortcuts from Settings > 단축키
  if (act) { e.preventDefault(); e.stopPropagation(); act.run(); return; }
  if (mod && !e.altKey) {                           // fixed keys
    const sh = e.shiftKey;
    let done = true;
    if (code === 'KeyZ' && !sh) undo();
    else if (code === 'KeyY' || (code === 'KeyZ' && sh)) redo();
    else if (code === 'Enter' && !sh) {
      const td = closestSel('td'), chk = !td && closestSel('ul.checklist > li');
      if (td) { clearNav(); exitTable(td.closest('table')); }
      else if (chk) keepSel(() => edit(() => { chk.dataset.checked = chk.dataset.checked === 'true' ? 'false' : 'true'; }));   // tick a to-do
      else done = false;
    }
    else if (/^Key[BIU]$/.test(code) && !sh) { /* the browser's own bold/italic/underline would bypass undo: these keys were moved */ }
    else { done = false; if (code === 'KeyV' && sh) plainNext = true; }
    if (done) { e.preventDefault(); return; }
  }
  if (!mod && !e.shiftKey && (e.key === 'Escape' || (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')))) {
    const pre = closestSel('pre');                 // in a code block: Esc selects it as one block, Alt+↑/↓ moves it
    if (pre && !pre.closest('td')) {
      e.preventDefault(); e.stopPropagation();
      selectObj(pre);
      if (e.key !== 'Escape') moveObj(pre, e.key === 'ArrowUp');
      return;
    }
  }
  if (mod || e.altKey) return;
  if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && lineSelect(e.key === 'ArrowDown')) { e.preventDefault(); return; }
  if (e.key === 'ArrowDown' && !e.shiftKey && boxDown()) { e.preventDefault(); return; }   // out of a code block / quote below
  const td = closestSel('td');
  if (td && (e.key === 'Enter' || e.key === 'Tab') && onTableKey(e, td)) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    if (closestSel('li')) listIndent(e.shiftKey);
    else if (!e.shiftKey) edit(() => exec('insertText', '\t'));
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') linkifyBefore();   // a typed address becomes a link (the key still goes in)
  if (e.key === 'Enter' && !e.shiftKey && boxEnter()) { e.preventDefault(); return; }
  if (e.key === 'Backspace' && !e.shiftKey && blockBackspace()) { e.preventDefault(); return; }
  if (e.key === 'Backspace' && !e.shiftKey && listBackspace()) { e.preventDefault(); return; }
  if ((e.key === 'Backspace' || e.key === 'Delete') && !e.shiftKey && besideTable(e.key === 'Backspace')) { e.preventDefault(); return; }
  if (e.key === ' ' && mdShortcut()) { e.preventDefault(); return; }
  if (e.key === 'Enter' && !e.shiftKey && hrShortcut()) { e.preventDefault(); return; }
});
function inNavRect(td) {
  if (!td || !navLive() || td.closest('table') !== nav.t) return false;
  const rc = navRect(), ri = td.parentElement.rowIndex, ci = td.cellIndex;
  return ri >= rc.r0 && ri <= rc.r1 && ci >= rc.c0 && ci <= rc.c1;
}
editor.addEventListener('mousedown', e => {
  if (e.button === 0) { mouseSel = true; dragFrom = !e.shiftKey && e.detail < 2 && e.target.closest ? e.target.closest('td') : null; }
  if (e.button === 2 && inNavRect(e.target.closest && e.target.closest('td'))) { e.preventDefault(); return; }   // right-click keeps the range
  const td = e.button === 0 && e.target.closest && e.target.closest('td');
  if (td && editor.contains(td) && td !== editCell) {
    if (e.shiftKey && nav && nav.t === td.closest('table')) {   // Shift+click extends the cell range
      e.preventDefault();
      setNav(nav.t, td.parentElement.rowIndex, td.cellIndex, true);
      return;
    }
    if (e.detail < 2) {                                         // a fresh click selects just that cell
      // the parked text is really selected: pressing on it would start a drag that moves it - drop it first
      if (parked) { const cr = document.caretRangeFromPoint(e.clientX, e.clientY); if (cr) { const s = getSelection(); s.removeAllRanges(); s.addRange(cr); } parked = null; }
      // a click on the cell that is already selected (just that one): the caret goes in where you clicked, for
      // editing - a drag from there selects text in it as usual
      if (navLive() && nav.ar === nav.fr && nav.ac === nav.fc && cellAt(nav.t, nav.fr, nav.fc) === td) { startEdit('f2', td, true); return; }
      nav = null; editCell = null;
    }
  }
  const li = e.target.closest && e.target.closest('ul.checklist > li:not(.nob)');
  if (li && e.target === li && e.offsetX < parseFloat(getComputedStyle(li).paddingLeft)) {
    e.preventDefault();
    edit(() => { li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true'; });
  }
});
editor.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openUrl(a.getAttribute('href')); }
});
editor.addEventListener('mouseover', e => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (a && !a.title) a.title = 'Ctrl+클릭으로 열기 · ' + a.getAttribute('href');
});
// Ctrl held: links look clickable
editor.addEventListener('keydown', e => { if (e.key === 'Control') editor.classList.add('ctrl'); });
document.addEventListener('keyup', e => { if (e.key === 'Control') editor.classList.remove('ctrl'); });
window.addEventListener('blur', () => editor.classList.remove('ctrl'));
function linkifyBefore() {
  const r = selRange();
  if (!r || !r.collapsed || r.startContainer.nodeType !== 3 || editCell || navLive()) return;
  const n = r.startContainer;
  if (n.parentNode.closest('a,pre,code')) return;
  const before = n.nodeValue.slice(Math.max(0, r.startOffset - 300), r.startOffset);
  const m = /(?:https?:\/\/|www\.)[^\s<>"]+$/i.exec(before);
  if (!m) return;
  const url = m[0].replace(/[.,)\]'"]+$/, '');
  if (url.length < 8) return;
  const start = r.startOffset - before.length + m.index, end = start + url.length, caret = r.startOffset;
  edit(() => {
    const rr = document.createRange(); rr.setStart(n, start); rr.setEnd(n, end);
    const a = document.createElement('a'); a.setAttribute('href', /^www\./i.test(url) ? 'https://' + url : url);
    rr.surroundContents(a);
    const nx = a.nextSibling, c = document.createRange();
    if (nx && nx.nodeType === 3) c.setStart(nx, Math.min(caret - end, nx.nodeValue.length)); else c.setStartAfter(a);
    c.collapse(true); const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(c);
  });
}
function openUrl(u) { if (!/^(https?:|mailto:)/i.test(u)) return; if (HOST) host.send('openUrl', u); else window.open(u, '_blank'); }
document.addEventListener('selectionchange', () => {
  if (view !== 'editor') return;
  if (burstSel && grpAtKey && !composing && selRange() && JSON.stringify(selSave()) !== grpAtKey) histCommit();   // the caret moved: the typed step ends here
  if (selRange()) { lastSel = selSave(); syncNav(); }
  if (!tbRaf) tbRaf = requestAnimationFrame(() => { tbRaf = 0; updateToolbar(); caretTable(); selCount(); });
});
let tbRaf = 0;
let statsT = 0;
function statsSoon() { clearTimeout(statsT); statsT = setTimeout(stats, isBig ? 1500 : 300); }
function stats() {
  const t = editor.textContent;
  const noSp = t.replace(/\s+/g, '').length;
  editor.classList.toggle('is-empty', !t && !editor.querySelector('img,table,hr,li'));
  statTxt = `${t.length.toLocaleString()}자 · 공백 제외 ${noSp.toLocaleString()}자`; statLen = t.length;
  selCount();
}
// a text selection shows its own size; cells walked with the keyboard (an invisible selection) do not
let statTxt = '', statLen = 0;
function selCount() {
  const r = selRange(), el = $('#stCount');
  const n = r && !r.collapsed && !isBig && !navLive() && editor.contains(r.commonAncestorContainer) ? r.toString().length : 0;
  const txt = n ? `선택 ${n.toLocaleString()}자 · 전체 ${statLen.toLocaleString()}자` : statTxt;
  if (el.textContent !== txt) el.textContent = txt;
}

