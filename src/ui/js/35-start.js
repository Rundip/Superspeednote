// ---------------------------------------------------------------- start
document.execCommand('defaultParagraphSeparator', false, 'div');
document.execCommand('styleWithCSS', false, false);
if (!HOST) app.classList.add('web');
if (firstRun) welcome();
applyTheme(); applyZoom(); applyFont(); updateSwatches();
syncQuitLabel(); rebuildKeys(); updateKeyHints();
app.classList.toggle('sb-off', !st.sidebar);
app.classList.toggle('home-list', listHome());
$('#appVer').textContent = 'v' + (boot.version || '');
$('#btnTop').classList.toggle('on', !!st.onTop);
$('#btnTop').title = `항상 위에 표시 · ${st.onTop ? '켜짐' : '꺼짐'}`;
if (listHome() && S.notes.length) showList();
else { renderBoard(); boardSearch.focus({ preventScroll: true }); }
host.send('ready');
if (BOOT_FAILED) bootFailed();
warmSearch();
host.send('closeToTray', st.closeToTray ? '1' : '0');
host.send('quickCorner', st.quickCorner || 'br');
host.send('theme', st.theme);
if (st.onTop) host.send('top', '1');
applyHotkeys();
// v1.1: hotkeys should work even when the app is off -> register the light "standby" start-up once
if (HOST && !st.startupChosen) {
  st.startupChosen = true;
  saveStateSoon();
  if (startMode() === 'off') {
    boot.autostart = 'standby';
    host.send('autostart', 'standby');
    setTimeout(() => toast('앱이 꺼져 있어도 메모 단축키로 열리도록 ‘단축키 대기’를 켰어요 · 설정(Ctrl+,)에서 변경'), 1200);
  }
}
if (recovered) { stateDirty = true; flushState(); setTimeout(() => toast('메모 목록 파일이 손상돼 직전 사본으로 복구했어요'), 600); }
else if (adopted) { stateDirty = true; flushState(); }   // notes the list had lost: written back into it at once
else saveMeta();
setInterval(() => {                                // "3분 전" labels
  if (view !== 'board' || document.hidden) return;
  const byId = new Map(S.notes.map(n => [n.id, n]));
  for (const c of grid.querySelectorAll('.card[data-id]:not([hidden])')) {
    const n = byId.get(c.dataset.id), t = c.querySelector('.c-time');
    if (n && t) { const v = relTime(n.updated); if (t.textContent !== v) t.textContent = v; }
  }
}, 60000);
window.__ssn = { S, bodies, ordered, openNote, showBoard, newNote, applyHotkeys, saveStateSoon, doPaste, tableOp, undo, redo, searchLines, openPalette, quickStart, quickEnd, deleteNotes, openTrash, toPlain, hist: () => ({ burst: !!burstSel, kind: grpKind, word: grpWord, at: grpAtKey, timer: !!histT, i: (H.get(cur) || {}).i, n: ((H.get(cur) || {}).st || []).length }) };   // debugging handle
