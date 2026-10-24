// ---------------------------------------------------------------- helpers
function noteById(id) { return S.notes.find(n => n.id === id); }
// Pinned notes first, in name order (Korean rules: symbols, numbers by value, Hangul ㄱ-ㅎ, Hanja, then A-Z);
// the rest in the order you put them in
const nameOrder = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
let pinKey = '', pinIds = [];                    // the name sort runs again only when a pinned note or its name changed
function ordered() {
  const pin = S.notes.filter(n => n.pinned);
  if (!pin.length) return S.notes.slice();
  const names = pin.map(n => titleOf(n).trim()), key = pin.map((n, i) => n.id + '\x1f' + names[i]).join('\x1e');
  if (key !== pinKey) {
    pinKey = key;
    pinIds = pin.map((n, i) => [n.id, names[i]]).sort((a, b) => nameOrder.compare(a[1], b[1])).map(x => x[0]);
  }
  const byId = new Map(pin.map(n => [n.id, n]));
  return pinIds.map(id => byId.get(id)).concat(S.notes.filter(n => !n.pinned));
}
function frag(html) { const t = document.createElement('template'); t.innerHTML = html || ''; return t.content; }
function previewOf(root, max = 120) {
  let out = '';
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode()) && out.length < max * 2) {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeName === 'BR' || n.nodeName === 'TD' || n.nodeName === 'TH') out += ' ';
    else if (BLOCK_TAGS.test(n.nodeName)) out += '\n';
  }
  return out.trim().replace(/\s*\n\s*/g, ' · ').replace(/\s+/g, ' ').slice(0, max);   // lines read "a · b" on a card
}
// readable plain text (tables become TSV) - used for search, copy and .txt export
function toPlain(root) {
  const out = [];
  let line = '';
  const flush = () => { out.push(line); line = ''; };
  const walk = node => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { line += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.nodeName;
      if (tag === 'BR') { flush(); continue; }
      if (tag === 'IMG') { line += '[이미지]'; continue; }
      if (tag === 'HR') { if (line) flush(); out.push('────────────'); continue; }
      if (tag === 'TABLE') {
        if (line) flush();
        for (const tr of c.rows) out.push(Array.from(tr.cells, td => tsvCell(toPlain(td))).join('\t'));
        continue;
      }
      const block = /^(DIV|P|H[1-6]|LI|BLOCKQUOTE|PRE|UL|OL)$/.test(tag);
      if (block && line) flush();
      if (tag === 'LI') {                         // indented two spaces per level, with the same bullet / number as on screen
        const p = c.parentElement;
        let depth = 0;
        for (let q = p; q && q.nodeName !== 'TD' && q !== editor; q = q.parentElement) if (q.nodeName === 'UL' || q.nodeName === 'OL') depth++;
        line += '  '.repeat(Math.max(0, depth - 1));
        if (!c.classList.contains('nob'))
          line += p && p.classList.contains('checklist') ? (c.dataset.checked === 'true' ? '[x] ' : '[ ] ')
            : p && p.nodeName === 'OL' ? olLabel(c) : '• ';
      }
      walk(c);
      if (block && line) flush();
    }
  };
  walk(root);
  if (line) flush();
  return out.join('\n');
}
function tsvCell(s) { return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
// first non-empty line of a note: shown as its title when no title was typed (write first, title later)
function firstLineOf(root) {
  for (const c of root.childNodes) {
    let t = c.nodeName === 'TABLE' ? Array.from((c.rows[0] || { cells: [] }).cells, td => td.textContent.trim()).join(' ')
      : /^(UL|OL)$/.test(c.nodeName) ? (c.firstElementChild || c).textContent : c.textContent;
    t = (t || '').replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 60);
  }
  return '';
}
function titleOf(n) { return n ? (n.title || n.line1 || '') : ''; }
function previewAfterTitle(n) {                   // don't repeat a first-line title in the preview
  const pv = n.preview || '';
  return !n.title && n.line1 && pv.startsWith(n.line1) ? pv.slice(n.line1.length).replace(/^\s*·?\s*/, '') : pv;
}
const textCache = new Map();                      // id -> { u: updated, t: plain text, l: lower-cased }
function textEntry(id) {
  if (id === cur) flushNote();
  const n = noteById(id);
  const c = textCache.get(id);
  if (c && n && c.u === n.updated) return c;
  const t = toPlain(frag(bodies[id]));
  const e = { u: n ? n.updated : 0, t, l: t.toLowerCase() };
  textCache.set(id, e);
  return e;
}
function noteText(id) { return textEntry(id).t; }
// A note as searchable lines: { s: text (a table row's cells joined by tabs), l: lower-case, c: the row's cells,
// h: that table's first row (column names), sec: the heading above, hd2: is a heading }. Built while idle, kept until
// the note changes.
function linesOf(id) {
  const e = textEntry(id);
  if (!e.L) e.L = indexLines(frag(bodies[id]));
  return e.L;
}
function indexLines(root) {
  const L = [];
  let line = '', sec = '', pre = 0;
  const add = (s, c, h) => { if (s && s !== '[이미지]') L.push({ s, l: s.toLowerCase(), c, h, sec }); };
  const flush = () => {
    if (pre) for (const p of line.split('\n')) add(p.replace(/[ \t\xa0]+/g, ' ').trim());
    else add(line.replace(/\s+/g, ' ').trim());
    line = '';
  };
  const walk = node => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { line += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.nodeName;
      if (tag === 'BR' || tag === 'HR' || tag === 'IMG') { flush(); continue; }
      if (tag === 'TABLE') {
        flush();
        const rows = Array.from(c.rows, tr => Array.from(tr.cells, td => toPlain(td).trim()));
        const h = rows.length > 1 ? rows[0].map(v => v.replace(/\s+/g, ' ')) : null;
        rows.forEach((r, i) => {
          const s = r.map(v => v.replace(/\s+/g, ' ')).join('\t'), n = L.length;
          if (s.trim()) add(s, r, i ? h : null);
          if (!i && h && L.length > n) L[n].hd = true;              // the column-name row itself
        });
        continue;
      }
      const block = /^(DIV|P|H[1-6]|LI|BLOCKQUOTE|PRE|UL|OL)$/.test(tag);
      if (block) flush();
      if (tag === 'PRE') pre++;
      walk(c);
      if (block) {
        const head = /^H[1-3]$/.test(tag) ? line.replace(/\s+/g, ' ').trim() : '';
        if (head) sec = '';                       // a heading isn't under the section above it
        const n = L.length;
        flush();
        if (head) { if (L.length > n) L[n].hd2 = true; sec = head.slice(0, 40); }
      }
      if (tag === 'PRE') pre--;
    }
  };
  walk(root);
  flush();
  return L;
}
function noteTextLower(id) { return textEntry(id).l; }
// build the search text of every note while the app is idle, so the first search is instant
function warmSearch() {
  const ids = S.notes.map(n => n.id);
  let i = 0;
  const step = dl => {
    while (i < ids.length && dl.timeRemaining() > 3) { if (bodies[ids[i]] !== undefined) linesOf(ids[i]); i++; }
    if (i < ids.length) requestIdleCallback(step, { timeout: 2000 });
  };
  requestIdleCallback(step, { timeout: 2000 });
}
function relTime(t) {
  if (!t) return '';
  const d = (now() - t) / 1000;
  if (d < 45) return '방금';
  if (d < 3600) return Math.floor(d / 60) + '분 전';
  if (d < 86400) return Math.floor(d / 3600) + '시간 전';
  const a = new Date(t), b = new Date();
  if (a >= new Date(b.getFullYear(), b.getMonth(), b.getDate() - 1)) return '어제';
  return (a.getFullYear() !== b.getFullYear() ? a.getFullYear() + '년 ' : '') + (a.getMonth() + 1) + '월 ' + a.getDate() + '일';
}
function isTyping(el) { return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.nodeName)); }
function unwrap(el) { const p = el.parentNode; if (!p) return; while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); }

