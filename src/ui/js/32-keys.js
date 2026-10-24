// ---------------------------------------------------------------- app-wide keys
document.addEventListener('keydown', e => {
  if (recording || e.isComposing || e.keyCode === 229) return;
  if (!pop.hidden && e.key === 'Escape') { e.preventDefault(); closePop(); return; }
  if (modalOpen()) { if (e.key === 'Escape') { e.preventDefault(); if (paletteOn && palMode === 'pop') host.send('back'); closeModal(); } return; }
  const mod = e.ctrlKey || e.metaKey, code = e.code;
  const act = actionFor(e, 'app');                  // shortcuts from Settings > 단축키
  if (e.key === 'F3' && view === 'editor' && !act && !mod && !e.altKey) {   // F3 / Shift+F3: next / previous match, like everywhere else
    e.preventDefault();
    if (findOpen) findStep(e.shiftKey ? -1 : 1); else openFind();
    return;
  }
  if (quickOn) {                                    // the little memo window: no switching notes or views
    if (act && QUICK_OK.has(act.id)) { e.preventDefault(); act.run(); return; }
    if (act && act.id === 'closeView') { e.preventDefault(); $('#qbClose').click(); return; }
    if (act || (mod && /^Digit[1-9]$/.test(code))) {
      e.preventDefault();
      if (now() - quickNag > 3000) { quickNag = now(); toast('빠른 메모에서는 쓸 수 없는 키예요 · ↗ 앱에서 이어서 쓰기'); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); if (findOpen) findClose(); else $('#qbClose').click(); }   // tables, menus, a picked object took theirs already
    return;
  }
  if (act) { e.preventDefault(); act.run(); return; }
  if (e.key === 'F2' && view === 'editor' && !mod && !e.altKey && !e.shiftKey && !e.defaultPrevented && e.target === editor && !closestSel('table')) {
    e.preventDefault(); titleIn.focus(); titleIn.select(); return;   // F2 renames, in the note too (a cell keeps its own F2)
  }
  if (mod && !e.altKey) {                           // fixed keys
    let hit = true;
    switch (code) {
      case 'KeyA': if (view === 'board' && !isTyping(e.target) && !e.shiftKey) selectAllCards(); else hit = false; break;
      case 'KeyZ': if ((view === 'board' || document.activeElement === sbList) && !e.shiftKey && boardUndo && !(isTyping(e.target) && e.target.value)) boardUndo(); else hit = false; break;
      case 'KeyC': if (!e.shiftKey && view === 'board' && !isTyping(e.target) && selId) copySel(); else hit = false; break;
      case 'NumpadAdd': zoom(1); break;
      case 'NumpadSubtract': zoom(-1); break;
      case 'Numpad0': zoom(0); break;
      default:
        if (/^Digit[1-9]$/.test(code) && !e.shiftKey) { const n = ordered()[+code.slice(5) - 1]; if (n) openNote(n.id); }
        else hit = false;
    }
    if (hit) { e.preventDefault(); return; }
  }
  if (e.key === 'Escape') {
    if (view === 'editor') { e.preventDefault(); if (app.classList.contains('sb-peek') && !listHome()) app.classList.remove('sb-peek'); else if (findOpen) findClose(); else if (listHome()) showList(); else showBoard(); }
    else if (!isTyping(e.target)) { if (clearMulti()) e.preventDefault(); else if (query) { e.preventDefault(); clearSearch(); } }   // board: one Esc at a time back to all cards
    return;
  }
  if (view === 'board' && !isTyping(e.target) && !mod && !e.altKey) boardKey(e);
});

