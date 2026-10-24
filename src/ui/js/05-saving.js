// ---------------------------------------------------------------- saving
let dirty = false, saveT = 0, stateT = 0, stateDirty = false;
function markDirty() { dirty = true; freshIds.delete(cur); setSave(true); clearTimeout(saveT); saveT = setTimeout(flushNote, 400); }
// the label stays '저장됨' while typing (a dot pulses once per save); '저장 중…' only if a write hangs on past 2s
function flushNote() {
  clearTimeout(saveT); saveT = 0;
  if (!dirty || !cur) return;
  dirty = false;
  if (unread.has(cur)) return;                    // its file couldn't be read: nothing goes over it
  const h = editor.innerHTML;
  bodies[cur] = h;
  if (isBig !== h.length > 80000) setBig(h.length);
  const n = noteById(cur);
  if (n) { n.preview = previewOf(editor); n.line1 = firstLineOf(editor); n.updated = now(); titlePh(n); }
  host.send('saveNote', cur, h);
  staleCards.add(cur); staleRows.add(cur);
  saveStateSoon();
  setSave(false);
  renderSidebarSoon();
}
function saveStateSoon() { stateDirty = true; clearTimeout(stateT); stateT = setTimeout(flushState, 300); }
// The list goes out first and always: a note that can't be written as it is goes as its plain fields, and nothing
// else (the meta file) runs before it. Any failure is reported to the app's error.log.
const NOTE_KEYS = ['id', 'title', 'color', 'pinned', 'hotkey', 'created', 'updated', 'preview', 'line1', 'at'];
function plainNote(n) { const o = {}; for (const k of NOTE_KEYS) if (n[k] !== undefined) { try { o[k] = JSON.parse(JSON.stringify(n[k])); } catch (e) { /* skip */ } } return o; }
function flushState() {
  clearTimeout(stateT); stateT = 0;
  if (!stateDirty) return;
  stateDirty = false;
  let json;
  try { S.notes = S.notes.filter(n => n && n.id); json = JSON.stringify(S); }
  catch (e) {
    reportError('saveState', e);
    try { json = JSON.stringify({ v: S.v || 1, notes: S.notes.filter(n => n && n.id).map(plainNote), settings: JSON.parse(JSON.stringify(S.settings || {})), lastOpen: S.lastOpen || null }); }
    catch (e2) { reportError('saveState fallback', e2); stateDirty = true; return; }
  }
  host.send('saveState', json);
  try { saveMeta(); } catch (e) { reportError('saveMeta', e); }
}
function reportError(where, e) { try { host.send('jsError', where + ': ' + (e && (e.stack || e.message) || e)); } catch (x) { /* nothing more to do */ } }
window.addEventListener('error', e => reportError('error', e.error || e.message));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason));
// notes-meta.json: every note's name, colour, pin, hotkey and place, written only by this version and later - an
// older version writing its own list never touches it, so whatever that list loses can be found again (above)
let metaSig = '';
function saveMeta() {
  const notes = {};
  S.notes.forEach((n, i) => { notes[n.id] = { title: n.title || '', color: n.color, pinned: !!n.pinned, hotkey: n.hotkey || null, created: n.created, updated: n.updated, pos: i }; });
  const s = JSON.stringify({ v: 1, notes });
  if (s !== metaSig) { metaSig = s; host.send('saveMeta', s); }
}
// the readable copies in the 메모 folder are named like the notes in the app (title, else first line): tell the
// shell when a name changes; at start-up every name (copies of notes no longer here go)
const sentNames = new Map();
function sendNames(all) {
  const out = [];
  for (const n of S.notes) {
    const nm = (titleOf(n) || '제목 없음').replace(/[\t\r\n]+/g, ' ').trim() || '제목 없음';
    if (all || sentNames.get(n.id) !== nm) { sentNames.set(n.id, nm); out.push(n.id + '\t' + nm); }
  }
  if (all) host.send('noteNamesAll', out.join('\n'));
  else if (out.length) host.send('noteNames', out.join('\n'));
}
function flushAll() {
  // hidden, standby, quit: the open note's caret is kept too (normalized first, so its path fits the saved html)
  if (cur && view === 'editor') { if (!composing) editor.normalize(); keepAt(); }
  flushNote(); flushState();
}
let slowT = 0;
function setSave(busy, quiet) {
  const el = $('#stSave');
  clearTimeout(slowT);
  if (busy) { if (!el.classList.contains('saving')) slowT = setTimeout(() => { if (dirty) { el.classList.add('saving'); el.textContent = '저장 중…'; } }, 2000); return; }
  el.classList.remove('saving', 'pulse'); el.textContent = '저장됨';
  if (!quiet) { void el.offsetWidth; el.classList.add('pulse'); }
}
window.addEventListener('blur', flushAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });

