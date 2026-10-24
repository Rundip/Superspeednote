// ---------------------------------------------------------------- host bridge
// Messages are "cmd<US>arg<US>payload"; the payload always goes last so it may contain anything.
// The notes didn't come with the page (the app couldn't build or load them): never start empty over them. Nothing
// is saved this time - only the window itself still answers - and the page says so.
const BOOT_FAILED = HOST && !window.__SSN__;
const BOOT_SAFE = new Set(['ready', 'drag', 'resize', 'stretch', 'min', 'max', 'close', 'quit', 'openData', 'openUrl', 'theme']);
const host = {
  send(...parts) {
    if (BOOT_FAILED && !BOOT_SAFE.has(parts[0])) return;
    if (HOST) window.chrome.webview.postMessage(parts.join(SEP));
    else devHost(parts);
  }
};
function devHost([cmd, a, b, c]) {        // browser preview: keep data in localStorage
  try {
    if (cmd === 'saveNote') localStorage.setItem('ssn.n.' + a, b);
    else if (cmd === 'delNote' || cmd.startsWith('trash') || cmd === 'unTrash') devTrash(cmd, a, b, c);
    else if (cmd === 'saveState') localStorage.setItem('ssn.state', a);
  } catch (e) { /* storage unavailable */ }
}
function devBoot() {
  const notes = {};
  let state = null;
  try {
    state = localStorage.getItem('ssn.state');
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('ssn.n.')) notes[k.slice(6)] = localStorage.getItem(k);
    }
  } catch (e) { /* ignore */ }
  return { state, notes, autostart: 'off', version: 'dev', dataDir: '(브라우저 미리보기)' };
}
// start-up mode registered with Windows: 'off' | 'standby' | 'tray' (older builds sent true/false)
function startMode() { const a = boot.autostart; return typeof a === 'string' ? a : a ? 'tray' : 'off'; }

