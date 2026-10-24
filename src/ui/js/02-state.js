// ---------------------------------------------------------------- state
const boot = window.__SSN__ || (HOST ? { notes: {}, version: '' } : devBoot());
const bodies = boot.notes || {};           // id -> html
let S = null, recovered = false;
for (const src of [boot.state, boot.stateBak]) {           // state.json, then the copy kept before the last save
  if (S || !src) continue;
  try { const v = JSON.parse(src); if (v && Array.isArray(v.notes)) { S = v; recovered = src !== boot.state; } } catch (e) { /* try the next one */ }
}
const firstRun = !BOOT_FAILED && !S && !Object.keys(bodies).length;
// notes whose file is there but couldn't be read this time: shown read-only, never saved over
const unread = new Set(boot.unread || []);
// in the list but no file came with them (one that couldn't be read, a write that never landed): never deleted
// for good as 'empty' - into the trash like any other note
const missing = new Set();
// notes being read again from disk (opened blank though they shouldn't be): read-only until the answer comes
const rechecking = new Set();
function onNoteBody(arg) {
  const k = arg.indexOf(SEP), id = k < 0 ? arg : arg.slice(0, k), h = k < 0 ? null : arg.slice(k + 1);
  if (!rechecking.delete(id)) return;
  if (h === '\u0001') { unread.add(id); if (cur === id) toast('이 메모 파일을 읽지 못해서 지금은 고칠 수 없어요 · 앱을 다시 시작해 보세요'); return; }
  if (h != null && !emptyHtml(h)) {                // its text was there after all: shown now, nothing was lost
    bodies[id] = h; missing.delete(id); textCache.delete(id); H.delete(id);
    const n = noteById(id);
    if (n) n.preview = previewOf(frag(h));
    if (cur === id && view === 'editor') { editor.innerHTML = h; setBig(h.length); histInit(id, null); stats(); renderSidebarSoon(); }
  } else if (h != null) missing.delete(id);       // the file is there and really empty
  if (cur === id) editor.contentEditable = unread.has(id) ? 'false' : 'true';
}
if (!S || !Array.isArray(S.notes)) S = { v: 1, notes: [], settings: {} };
S.settings = Object.assign({
  theme: 'light', closeToTray: true, onTop: false, fontSize: 15, font: 'ui', sidebar: true,
  appHotkey: { mods: 3, vk: 78, label: 'Ctrl+Alt+N' }, findHotkey: { mods: 3, vk: 70, code: 'KeyF', label: 'Ctrl+Alt+F' },
  quickHotkey: { mods: 3, vk: 77, code: 'KeyM', label: 'Ctrl+Alt+M' }, fg: '#000000', hl: '', quickCorner: 'br'
}, S.settings || {});
const st = S.settings;
if (!st.fg || !FG.some(c => c.v === st.fg)) st.fg = '#000000';           // the old '기본' (no colour) is black now
if (st.hl && !HL.some(c => c.v === st.hl)) st.hl = '';
// v1.2: the first default (Ctrl+Alt+Space) is taken by other apps (e.g. Claude desktop) -> F for "find"
if (!st.findHotkeyMine && st.findHotkey && st.findHotkey.label === 'Ctrl+Alt+Space') st.findHotkey = { mods: 3, vk: 70, code: 'KeyF', label: 'Ctrl+Alt+F' };
// Reconcile the list with the note files, whichever version wrote them last: no note file is ever left out of the
// list, and a note the list lost (an older version wrote its own list over this one, a crash) comes back with its
// name, colour, pin and place - from notes-meta.json (kept by this version only), else the list's previous copy.
// A note still listed whose file went to the trash since was deleted (by another version): it isn't brought back
// as a blank note - it is in the trash.
let adopted = 0;
{
  S.notes = S.notes.filter(n => n && n.id);
  const known = new Set(S.notes.map(n => n.id));
  let arch = {};
  try { const a = JSON.parse(boot.meta || 'null'); if (a && a.notes && typeof a.notes === 'object') arch = a.notes; } catch (e) { /* none */ }
  const bak = {};
  try { const b = JSON.parse(boot.stateBak || 'null'); if (b && Array.isArray(b.notes)) b.notes.forEach((n, i) => { if (n && n.id) bak[n.id] = Object.assign({ pos: i }, n); }); } catch (e) { /* none */ }
  const trashed = new Set(boot.trashed || []);
  S.notes = S.notes.filter(n => n.id in bodies || !trashed.has(n.id) || unread.has(n.id));
  // an older version found such a note first and listed it as a fresh '제목 없음' note (it has no names to go by):
  // a note's 'created' never changes, so a different one than this version knew means exactly that - it gets its
  // name, colour and pin back
  for (const n of S.notes) {
    const m = arch[n.id];
    if (!m || n.title || !m.title || !m.created || n.created === m.created) continue;
    n.title = m.title; n.color = m.color || n.color; n.pinned = !!m.pinned; n.created = m.created || n.created;
    adopted++;
  }
  const keys = new Set(S.notes.map(n => n.hotkey && n.hotkey.label).filter(Boolean));
  const back = [];
  for (const id of Object.keys(bodies)) {
    if (known.has(id)) continue;
    const m = arch[id] || bak[id] || {}, hk = m.hotkey && m.hotkey.label && !keys.has(m.hotkey.label) ? m.hotkey : null;
    if (hk) keys.add(hk.label);
    back.push({ pos: typeof m.pos === 'number' ? m.pos : 1e9, n: { id, title: m.title || '', color: m.color || 'navy', pinned: !!m.pinned, hotkey: hk,
      created: m.created || now(), updated: m.updated || now(), preview: previewOf(frag(bodies[id])) } });
  }
  back.sort((a, b) => a.pos - b.pos);
  for (const x of back) { if (S.notes.length >= MAX_NOTES) break; S.notes.splice(Math.min(x.pos, S.notes.length), 0, x.n); adopted++; }
  for (const n of S.notes) {
    if (!(n.id in bodies)) { bodies[n.id] = ''; missing.add(n.id); }
    if (!NOTE_COLORS[n.color]) n.color = 'navy';
    if (n.line1 === undefined) n.line1 = firstLineOf(frag(bodies[n.id]));   // notes saved by older versions
  }
}

let view = 'board';
let cur = null;                  // note open in the editor
let selId = S.lastOpen || null;  // selected card
let query = '';
let hkFailed = new Set();
let hkJustSet = null;

