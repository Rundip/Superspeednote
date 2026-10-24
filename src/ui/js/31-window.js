// ---------------------------------------------------------------- window chrome (frameless window driven by the shell)
let dragArm = null;
document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const rz = e.target.closest('.rz');
  if (rz) { e.preventDefault(); host.send(e.detail === 2 ? 'stretch' : 'resize', rz.dataset.edge); return; }   // double-click: stretch that way
  const d = e.target.closest('[data-drag]');
  if (!d || e.target.closest('button,input,select,a,label,.search')) return;
  if (e.detail === 2 && d.id === 'titlebar') { host.send('max'); return; }
  dragArm = { x: e.screenX, y: e.screenY };
});
document.addEventListener('mousemove', e => {
  if (!dragArm) return;
  if (!(e.buttons & 1)) { dragArm = null; return; }
  if (Math.abs(e.screenX - dragArm.x) + Math.abs(e.screenY - dragArm.y) > 3) { dragArm = null; host.send('drag'); }
});
document.addEventListener('mouseup', () => { dragArm = null; });
$('#wcMin').onclick = () => host.send('min');
$('#wcMax').onclick = () => host.send('max');
$('#wcClose').onclick = () => { flushAll(); host.send('close'); };
$('#btnSwitch').onclick = openSwitcher;
$('#btnTop').onclick = () => { setOnTop(!st.onTop); toast(st.onTop ? '항상 위에 표시를 켰어요' : '항상 위에 표시를 껐어요'); };
$('#btnPal').onclick = () => openPalette('key');
$('#btnTheme').onclick = () => setTheme(st.theme === 'dark' ? 'light' : 'dark');
$('#btnSettings').onclick = openSettings;
$('#stZoom').onclick = () => zoom(0);
$('#noteHead').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
$('#status').addEventListener('mousedown', e => e.preventDefault());
$('#pane').addEventListener('mousedown', e => { if (e.target.id === 'pane' || e.target.id === 'doc' || e.target === scroller || e.target === sheet) { e.preventDefault(); ensureEditorFocus(); } });
scroller.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
document.addEventListener('contextmenu', e => { if (!e.defaultPrevented && !isTyping(e.target)) e.preventDefault(); });

