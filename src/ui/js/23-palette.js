// ---------------------------------------------------------------- quick paste search (찾아 붙여넣기)
// A global hotkey opens a small search window right over the program you are using: find any line of any
// note and Enter pastes it straight back there. It all runs on an in-memory line index built while idle.
let paletteOn = false, palMode = '';             // 'pop' = own little window over another program, 'in' / 'key' = inside the app
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function choOf(s) {                               // 김철수 -> ㄱㅊㅅ (same length, so match positions line up)
  const a = new Array(s.length);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i) - 0xAC00; a[i] = c >= 0 && c < 11172 ? CHO[(c / 588) | 0] : s[i]; }
  return a.join('');
}
const isCho = t => /^[ㄱ-ㅎ]+$/.test(t);
// The Korean IME merges consonants typed without a vowel (ㅂ+ㅅ -> ㅄ), which no 초성 string ever contains
const JAMO2 = { 'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ' };
const normQ = s => s.replace(/[ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ]/g, c => JAMO2[c]);
const termsOf = q => [...new Set(normQ(q.toLowerCase()).split(/\s+/).filter(Boolean))];
const isNum = t => /^\d{4,}$/.test(t);            // a phone / account number typed without its dashes
// the digits of each number in s, dashes and dots dropped: '02-1234-5678 / 3층' -> '0212345678 3'
const digitsOf = s => (s.match(/\d(?:[-. ]?\d)*/g) || []).map(v => v.replace(/\D/g, '')).join(' ');
// where search word t is in o.l (-1: nowhere); as typed, as 초성 (o.k) or as a number without dashes (o.d, at the end).
// o is a note's text entry or one indexed line; both caches are built on the first query that needs them.
function termAt(o, t, kind) {
  let at = o.l.indexOf(t);
  if (at < 0 && kind === 1) { if (o.k === undefined) o.k = choOf(o.l); at = o.k.indexOf(t); }
  else if (at < 0 && kind === 2) { if (o.d === undefined) o.d = digitsOf(o.l); if (o.d.includes(t)) at = o.l.length; }
  return at;
}
const kindOf = t => isCho(t) ? 1 : isNum(t) ? 2 : 0;
// the board and Ctrl+K: every word is in the note's title or text
function noteMatches(n, terms, kinds = terms.map(kindOf)) {
  const tl = { l: titleOf(n).toLowerCase() }, e = textEntry(n.id);
  return terms.every((t, j) => termAt(tl, t, kinds[j]) >= 0 || termAt(e, t, kinds[j]) >= 0);
}
// Board search: a card found by its text shows the words around the hit instead of its first line, so you can
// see why it matched. Only the first 60 (the rest are off-screen); their own preview comes back afterwards.
const snipped = new Map();                        // id -> [card, its own preview HTML]
function showHits(terms, kinds, byId) {
  const was = new Map(snipped);
  snipped.clear();
  if (terms.length) {
    let k = 0;
    for (const c of grid.querySelectorAll('.card[data-id]:not([hidden])')) {
      if (k++ >= 24) break;                       // about a screenful: the rest keep their usual preview
      const n = byId.get(c.dataset.id), pv = c.querySelector('.c-prev'), tl = { l: titleOf(n).toLowerCase() };
      if (!pv || terms.every((t, j) => termAt(tl, t, kinds[j]) >= 0)) continue;   // the title already shows why
      const old = was.get(n.id);
      snipped.set(n.id, [c, old && old[0] === c ? old[1] : pv.innerHTML]);
      pv.innerHTML = snippet(textEntry(n.id), terms, 14);
    }
  }
  for (const [id, [c, h]] of was) if (!snipped.has(id) && c.isConnected) c.querySelector('.c-prev').innerHTML = h;
}
function ctxOf(x) {                               // heading above + column names: words there count as found too
  if (x.cx === undefined) x.cx = ((x.sec || '') + '\t' + (x.h ? x.h.join('\t') : '')).toLowerCase();
  return x.cx;
}
function ctxChoOf(x) { if (x.ck === undefined) x.ck = choOf(ctxOf(x)); return x.ck; }
// What Tab can pick out of a line: a table row's cells, else the value of "label: value" and the single words.
function partsOf(x) {
  if (x.p) return x.p;
  const s = x.s, P = [];
  if (x.c) {
    let at = 0;
    x.c.forEach((v, j) => {
      const d = s.indexOf('\t', at), end = d < 0 ? s.length : d;
      if (v.trim()) P.push({ a: at, b: end, v: v.trim(), k: x.h && x.h[j] ? x.h[j] : '', j });
      at = end + 1;
    });
    if (P.length < 2) P.length = 0;               // one filled cell: the row already is that cell
  } else {
    const m = /^(.{1,30}?[^\d\s])\s*[:：]\s*(\S.*)$/.exec(s);       // "전화: 010-..." (not a time like 10:30)
    if (m) P.push({ a: s.length - m[2].length, b: s.length, v: m[2], k: m[1].trim() });
    const re = /[^\s,;|│]+/g, W = [];
    let w;
    while ((w = re.exec(s))) W.push({ a: w.index, b: w.index + w[0].length, v: w[0].replace(/[:：,.]+$/, ''), k: '' });
    if (W.length > 1 && W.length <= 16) for (const p of W) if (p.v && !(m && p.b <= P[0].a) && !P.some(q => q.a === p.a && q.b === p.b)) P.push(p);   // the label's own words: never wanted
  }
  return (x.p = P);
}
const usedPart = (u, x) => u && u[2] >= 0 && u[2] < partsOf(x).length ? u[2] : -1;
// The part the query points at, so Enter pastes what was asked for: the cell of the column you named
// ('대한물산 계좌' -> the account), or the value of a "label: value" line found by its label alone ('전화').
function autoPart(x, k, end) {
  const P = partsOf(x);
  if (k) return P.findIndex(p => p.k && termAt({ l: p.k.toLowerCase() }, k, kindOf(k)) >= 0);
  return !x.c && P.length && P[0].k && end <= P[0].a ? 0 : -1;
}
const inHead = (x, t, kind) => !!x.h && x.h.some(h => termAt({ l: h.toLowerCase() }, t, kind) >= 0);
function searchLines(q, limit = 50) {
  const ql = normQ(q.toLowerCase().trim());
  const terms = termsOf(q);
  if (!terms.length) return [];
  const kinds = terms.map(kindOf);
  const notes = S.notes.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const use = st.palUse || {}, N = notes.length, out = [], weekAgo = now() - 7 * 864e5;
  for (let r = 0; r < N && out.length < 3000; r++) {
    const n = notes[r], L = linesOf(n.id), tn = { l: titleOf(n).toLowerCase() };
    const fresh = (N - r) / N * 30;               // newer notes first among equals
    // every word is in the note's name: its lines come up too (after lines with the words), in order
    const byTitle = !!n.title && terms.every((t, j) => termAt(tn, t, kinds[j]) >= 0);
    let fromTitle = 0, any = false;
    for (let i = 0; i < L.length; i++) {
      const x = L[i], l = x.l;
      let inLine = 0, inCtx = 0, ok = true, end = 0, ak = '';   // end: where the last word found in the line ends
      for (let j = 0; j < terms.length; j++) {
        const t = terms[j], at = termAt(x, t, kinds[j]);
        if (at >= 0) { inLine++; end = Math.max(end, at + t.length); continue; }
        const cx = ctxOf(x);                                                      // the other words may be the heading,
        if (cx.length > 1 && (cx.includes(t) || (kinds[j] === 1 && ctxChoOf(x).includes(t)))) {   // the column
          inCtx++;
          if (!ak && inHead(x, t, kinds[j])) ak = t;
          continue;
        }
        if (termAt(tn, t, kinds[j]) >= 0) continue;                                // or the note's name
        ok = false; break;
      }
      if (!ok) continue;
      if (!inLine) {
        if (byTitle && fromTitle < 20 && x.s.trim()) { out.push({ n, i, x, sc: 400 + fresh - fromTitle++ * 3, part: usedPart(use[n.id + SEP + x.s], x), ak: '', end: 0 }); any = true; }
        continue;
      }
      any = true;
      let sc = (inLine === terms.length ? 1000 : 0) + inCtx * 50 + fresh - Math.min(60, x.s.length / 6) - (x.hd ? 150 : 0) - (x.hd2 ? 120 : 0);
      if (l === ql && !x.hd2) sc += 300;          // a heading is where to look, not what to paste
      else { const p = l.indexOf(terms[0]); if (p === 0) sc += 80; else if (p > 0 && /[\s\t(\[:/,·-]/.test(l[p - 1])) sc += 40; }
      const u = use[n.id + SEP + x.s];
      if (u) sc += Math.min(240, u[0] * 60) + (u[1] > weekAgo ? 60 : 0);   // what you paste often comes first
      out.push({ n, i, x, sc, part: usedPart(u, x), ak, end });
    }
    // found by its name but no line of text to show (only pictures, or empty): the name itself is the result -
    // Enter pastes the name, Ctrl+Enter opens the note
    if (byTitle && !any) { const t = titleOf(n); out.push({ n, i: -1, x: { s: t, l: t.toLowerCase() }, sc: 450 + fresh, part: -1, ak: '', end: 0 }); }
  }
  out.sort((a, b) => b.sc - a.sc);
  const top = out.slice(0, limit);
  for (const it of top) if (it.part < 0) it.part = autoPart(it.x, it.ak, it.end);   // the part you used last time wins
  return top;
}
function recentLines(limit = 12) {                // empty search box: what you pasted lately
  const use = st.palUse || {}, out = [];
  for (const key of Object.keys(use).sort((a, b) => use[b][1] - use[a][1])) {
    const j = key.indexOf(SEP), id = key.slice(0, j), s = key.slice(j + 1), n = noteById(id);
    if (!n) continue;
    const L = linesOf(id), i = L.findIndex(x => x.s === s);
    if (i < 0) continue;                          // the line was edited or deleted since: never offer stale text
    out.push({ n, i, x: L[i], recent: true, part: usedPart(use[key], L[i]) });
    if (out.length >= limit) break;
  }
  return out;
}
function rememberUse(it) {
  const use = st.palUse || (st.palUse = {}), k = it.n.id + SEP + it.x.s, u = use[k];
  use[k] = [(u ? u[0] : 0) + 1, now(), it.part];
  const keys = Object.keys(use);
  if (keys.length > 300) keys.sort((a, b) => use[a][1] - use[b][1]).slice(0, keys.length - 300).forEach(x => delete use[x]);
  saveStateSoon();
}
function payloadOf(it) {
  const P = it.part >= 0 ? partsOf(it.x)[it.part] : null;
  if (P) return { text: P.v, html: cellHTML(P.v) };
  if (it.x.c) return { text: it.x.c.map(tsvCell).join('\t'), html: rowsHTML([it.x.c]) };   // a table row pastes as cells
  return { text: it.x.s, html: esc(it.x.s) };
}
function hitMap(s, terms) {
  const low = s.toLowerCase(), hit = new Uint8Array(s.length);
  let cho = null;
  for (const t of terms) {
    let src = low;
    if (isNum(t) && !low.includes(t)) {           // typed without dashes: mark those digits and the dashes between
      for (const m of low.matchAll(/\d(?:[-. ]?\d)*/g)) {
        const d = m[0].replace(/\D/g, ''), pos = [];
        for (let i = 0; i < m[0].length; i++) if (m[0][i] >= '0' && m[0][i] <= '9') pos.push(m.index + i);
        for (let k = d.indexOf(t); k >= 0; k = d.indexOf(t, k + 1)) hit.fill(1, pos[k], pos[k + t.length - 1] + 1);
      }
      continue;
    }
    if (isCho(t) && !low.includes(t)) src = cho || (cho = choOf(low));
    for (let i = src.indexOf(t); i >= 0; i = src.indexOf(t, i + 1)) hit.fill(1, i, i + t.length);
  }
  return hit;
}
function marked(s, hit, a, b) {
  let h = '', on = false;
  for (let i = a; i < b; i++) {
    if (!!hit[i] !== on) { on = !on; h += on ? '<mark>' : '</mark>'; }
    const c = s[i];
    h += c === '\t' ? (on ? '</mark>' : '') + '<i class="cell-sep">│</i>' + (on ? '<mark>' : '') : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c;
  }
  return h + (on ? '</mark>' : '');
}
// one line with the search words marked and the picked cell / word boxed; long lines show the part that matters
function lineHTML(s, terms, P, max = 220, lead = 50) {
  const hit = hitMap(s, terms);
  let a = 0, b = s.length;
  if (b > max) {
    const f = P ? P.a : hit.indexOf(1);
    a = Math.max(0, Math.min((f < 0 ? 0 : f) - (P ? 12 : lead), s.length - max));   // near the end: a full window
    while (a && a < f && /\s/.test(s[a])) a++;
    b = Math.min(s.length, a + max);
  }
  const pre = a ? '…' : '', post = b < s.length ? '…' : '';
  if (!P || P.a < a || P.b > b) return pre + marked(s, hit, a, b) + post;
  return pre + marked(s, hit, a, P.a) + '<span class="pick">' + marked(s, hit, P.a, P.b) + '</span>' + marked(s, hit, P.b, b) + post;
}
function openPalette(mode) {
  if (paletteOn) {                                // already open: maybe now in its own window
    if (mode === 'pop' && palMode !== 'pop') { palMode = 'pop'; app.classList.add('pal-pop'); }
    const i = $('#palIn'); if (i) { i.focus(); i.select(); }
    host.send('palette', '1');
    return;
  }
  palMode = mode;
  if (mode === 'pop') app.classList.add('pal-pop');
  closePop();
  if (cur) flushNote();
  if (selRange()) lastSel = selSave();            // now, not on the next selectionchange: a line may go in right here
  const isPop = mode === 'pop', inNote = (mode === 'in' || mode === 'key') && view === 'editor' && !!cur;   // inNote: Alt+Enter puts it here
  openModal(`<div class="dlg qs pal"><div class="qs-in">${ic('i-search')}<input id="palIn" placeholder="${mode === 'quick' ? '다른 메모에서 찾아 넣기 (초성도 돼요)' : '찾을 단어 (초성 ㄱㅊㅅ도 돼요)'}" spellcheck="false" autocomplete="off"><span class="pal-count" id="palCount"></span></div>` +
    `<div class="pal-body"><div class="qs-list" id="palList"></div><div class="pal-pv" id="palPv"></div></div>` +
    (mode === 'quick' ? `<div class="pal-foot"><span><kbd>Enter</kbd>넣기</span><span><kbd>Tab</kbd><kbd>Shift+Tab</kbd>칸·단어 고르기</span><span><kbd>Shift+Enter</kbd>복사만</span><span class="fill"></span><span><kbd>Esc</kbd>닫기</span></div></div>`
      : `<div class="pal-foot">${inNote ? '<span><kbd>Alt+Enter</kbd>이 메모에 넣기</span>' : ''}<span><kbd>Enter</kbd>${isPop ? '붙여넣기' : '이전 창에 붙여넣기'}</span><span><kbd>Tab</kbd><kbd>Shift+Tab</kbd>칸·단어 고르기</span>` +
        `<span><kbd>Shift+Enter</kbd>${isPop ? '복사만' : '복사하고 이전 창으로'}</span><span><kbd>Ctrl+Enter</kbd>메모 열기</span>${inNote ? '' : '<span><kbd>Alt+1~9</kbd>바로 붙여넣기</span>'}<span class="fill"></span><span><kbd>Esc</kbd>${isPop ? '돌아가기' : '닫기'}</span></div></div>`),
    () => { paletteOn = false; app.classList.remove('pal-pop'); modal.classList.remove('palm'); host.send('palette', '0'); });
  modal.classList.add('palm');                    // the quick memo shows it over the whole window
  paletteOn = true;
  host.send('palette', '1');
  const inp = $('#palIn'), list = $('#palList'), pv = $('#palPv');
  const tip = `<p>거래처 이름, 계좌, 전화번호처럼 <b>기억나는 단어</b>를 입력하면 모든 메모에서 그 줄을 찾아요.</p><p>띄어쓰기로 단어를 더 넣으면 좁혀져요. 메모 제목·표의 열 이름도 함께 찾아요. 예) <i>한빛 전화</i></p><p><b>ㄱㅊㅅ</b>처럼 초성만 넣어도 돼요.</p><p>다른 프로그램에서도 <b>${esc(kl0(st.findHotkey))}</b> 단축키로 바로 불러올 수 있어요.</p><p>표의 한 행은 <b>Tab</b>으로 칸 하나만 골라 붙여넣을 수 있어요.</p>`;
  let items = [], idx = 0, terms = [], q = '', fit = 40;   // fit: characters a result row shows (wide Hangul)
  const where = it => [mark(titleOf(it.n) || '제목 없음', terms), !it.x.c && it.x.sec && esc(it.x.sec)].filter(Boolean).join(' › ');
  const itemHTML = (it, i) => {
    const P = it.part >= 0 ? partsOf(it.x)[it.part] : null;
    return `<div class="qs-item${i === idx ? ' on' : ''}" data-i="${i}"><span class="c-dot" data-c="${it.n.color}" style="--c:${NOTE_COLORS[it.n.color]}"></span>` +
      `<div class="qs-txt"><b>${lineHTML(it.x.s, terms, P, fit, 14)}</b><small>${where(it)}${P && P.k ? ` · <em class="pal-col">${esc(P.k)}</em>` : ''}` +
      `${P ? `<span class="pal-pos">${it.part + 1}/${partsOf(it.x).length}</span>` : ''}</small></div>${i < 9 ? `<kbd class="pal-n">${i + 1}</kbd>` : ''}</div>`;
  };
  const preview = () => {
    const it = items[idx];
    if (!it) { pv.innerHTML = q ? `<div class="pv-tip"><b>이렇게 써 보세요</b>${tip}</div>` : ''; return; }
    const L = linesOf(it.n.id), i = it.i;
    const P = it.part >= 0 ? partsOf(it.x)[it.part] : null;
    let h = `<div class="pv-head"><span class="c-dot" data-c="${it.n.color}" style="--c:${NOTE_COLORS[it.n.color]}"></span><b>${esc(titleOf(it.n) || '제목 없음')}</b><small>${relTime(it.n.updated)}</small></div>`;
    if (it.x.c && it.x.h) {                       // a table row: each column name with its value, then rows near it
      const pk = j => partsOf(it.x).findIndex(p => p.j === j);   // the part a column's value is (Tab picks the same)
      h += '<div class="pv-kv">' + it.x.c.map((v, j) => { const k = pk(j); return `<span>${esc(it.x.h[j] || '')}</span><b class="${k >= 0 ? 'pp' : ''}${P && P.j === j ? ' pick' : ''}"${k >= 0 ? ` data-part="${k}" title="클릭: 이 칸만 붙여넣기 · Shift+클릭: 복사만"` : ''}>${mark(v, terms) || '&nbsp;'}</b>`; }).join('') + '</div>';
      const near = [];
      for (let d = 1; d < 4; d++) for (const j of [i - d, i + d]) if (L[j] && L[j].h === it.x.h && near.length < 3) near.push(j);   // same table, not its header
      for (const j of near.sort((x, y) => x - y)) h += `<div class="pv-l">${lineHTML(L[j].s, terms, null, 160)}</div>`;
    } else {
      const a = Math.max(0, i - 4), b = Math.min(L.length, a + 14);
      for (let j = a; j < b; j++) h += `<div class="pv-l${j === i ? ' on' : ''}">${lineHTML(L[j].s, terms, j === i ? P : null, j === i ? 600 : 160)}</div>`;
    }
    const PS = partsOf(it.x);
    if (PS.length) h += '<div class="pv-parts"><span class="pv-pl">골라서 붙여넣기</span>' +   // what Tab / Shift+Tab walk through, to click
      `<button class="pp${it.part < 0 ? ' pick' : ''}" data-part="-1" title="클릭: 줄 전체 붙여넣기 · Shift+클릭: 복사만">줄 전체</button>` +
      PS.map((p, k) => `<button class="pp${k === it.part ? ' pick' : ''}" data-part="${k}" title="${p.k ? esc(p.k) + ' · ' : ''}클릭: 이것만 붙여넣기 · Shift+클릭: 복사만">${mark(p.v.length > 40 ? p.v.slice(0, 40) + '…' : p.v, terms)}</button>`).join('') + '</div>';
    pv.innerHTML = h;
  };
  const render = () => {
    q = inp.value.trim();
    terms = termsOf(q);
    items = q ? searchLines(q) : recentLines();
    idx = clamp(idx, 0, Math.max(0, items.length - 1));
    $('#palCount').textContent = q ? (items.length >= 50 ? '50+' : items.length) + '줄' : '';
    pv.hidden = !items.length && !q;              // nothing typed, nothing recent: the tips fill the list instead
    fit = Math.max(16, (list.clientWidth - 80) / 14 | 0);   // a hit further right is scrolled into view
    list.innerHTML = (!q && items.length ? '<div class="pal-sec">최근 붙여넣은 줄<span><kbd>Del</kbd>목록에서 빼기</span></div>' : '') +
      (items.map(itemHTML).join('') || (q ? '<div class="qs-empty"><b>일치하는 줄이 없어요</b><br>단어를 하나 줄이거나 초성(ㄱㅊㅅ)으로 찾아보세요</div>'
        : `<div class="pal-sec">처음이라면 이렇게 찾아보세요</div><div class="pv-tip pal-tip">${tip}</div>`));
    const on = list.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
    preview();
  };
  const move = i => {
    if (!items.length) return;
    idx = clamp(i, 0, items.length - 1);
    for (const el of list.querySelectorAll('.qs-item')) el.classList.toggle('on', +el.dataset.i === idx);
    const on = list.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
    preview();
  };
  const redraw = i => {                           // one item changed (picked part)
    const el = list.querySelector(`.qs-item[data-i="${i}"]`);
    if (el) el.outerHTML = itemHTML(items[i], i);
    preview();
  };
  // into the note being written, at the caret: a space first if it would stick to a word; a whole table row
  // becomes cells on an empty line or in a table (as Ctrl+V does), elsewhere one line of its values
  const insertLine = (it, p) => {
    const r = selRange(), blk = r && (blockOf(r.startContainer) || editor), row = it.x.c && it.part < 0;
    if (row && (navLive() || editCell || (blk && blk.nodeName !== 'LI' && !blk.textContent.trim()))) { doPaste(p.text, p.html, []); return; }
    if (navLive()) { doPaste(p.text, '', [], true); return; }   // selected cells take the value, like Excel
    let t = row ? it.x.c.map(v => v.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ') : p.text;
    if (blk) { const b = document.createRange(); b.setStart(blk, 0); b.setEnd(r.startContainer, r.startOffset); if (/\S$/.test(b.toString())) t = ' ' + t; }
    edit(() => exec('insertText', t));
  };
  const pick = (i, how) => {
    const it = items[i];
    if (!it) return;
    const quick = palMode === 'quick', pop = palMode === 'pop';
    if (how === 'open') {
      if (quick) return;                          // the memo window stays a memo
      if (it.i < 0) { closeModal(); openNote(it.n.id); if (pop) host.send('show'); return; }   // found by its name only
      const t = terms.map(w => hitText(it.x.s, w)).find(Boolean) || it.x.s.split('\t').find(Boolean).slice(0, 40);
      const L = linesOf(it.n.id), tl = t.toLowerCase();
      let nth = 0;                                // land on this very line: count the same word above it
      for (let j = 0; j < it.i; j++) for (let k = L[j].l.indexOf(tl); k >= 0; k = L[j].l.indexOf(tl, k + 1)) nth++;
      closeModal();
      openNote(it.n.id);
      findText(t, nth, true);
      if (pop) host.send('show');
      return;
    }
    rememberUse(it);
    const p = payloadOf(it);
    if (how === 'note' || (quick && how === 'paste')) { closeModal(); insertLine(it, p); return; }   // closing puts the caret back
    if (quick || how === 'clip') { closeModal(); putClip(p); toast('복사했어요'); return; }       // copy and stay here
    if (!HOST) { closeModal(); putClip(p); toast(`복사됨 · ${p.text.slice(0, 40)} (브라우저 미리보기에서는 창 전환이 없어요)`); return; }
    host.send('sendOut', how, String(p.text.length), p.text + p.html);   // back to the program, then paste
    closeModal();
  };
  const cyclePart = d => {
    const it = items[idx];
    if (!it) return;
    const P = partsOf(it.x);
    if (!P.length) return;
    it.part = d > 0 ? (it.part + 1 >= P.length ? -1 : it.part + 1) : (it.part <= -1 ? P.length - 1 : it.part - 1);
    redraw(idx);
  };
  const forget = it => {                          // a recent line you'd rather not see here again (a password ...)
    const use = st.palUse || {}, key = it.n.id + SEP + it.x.s, old = use[key];
    if (!old) return;
    delete use[key]; saveStateSoon(); render();
    toast('최근 목록에서 뺐어요', '되돌리기', () => { (st.palUse || (st.palUse = {}))[key] = old; saveStateSoon(); if (inp.isConnected && !inp.value.trim()) render(); });
  };
  const howOf = e => e.ctrlKey ? 'open' : e.shiftKey ? 'copy' : e.altKey && inNote ? 'note' : 'paste';
  let raf = 0, tabAfterIme = 0;
  inp.addEventListener('compositionend', () => { if (tabAfterIme) { const d = tabAfterIme; tabAfterIme = 0; setTimeout(() => cyclePart(d), 0); } });
  inp.addEventListener('input', () => { idx = 0; if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); });
  inp.addEventListener('keydown', e => {
    const isTab = e.key === 'Tab' || e.code === 'Tab';
    if (isTab) e.preventDefault();                // never moves the focus (Shift+Tab used to leave the box mid-syllable)
    if (e.isComposing) { if (isTab) tabAfterIme = e.shiftKey ? -1 : 1; return; }   // Korean IME: done once the syllable ends
    const k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); move(idx + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(idx - 1); }
    else if (k === 'PageDown') { e.preventDefault(); move(idx + 8); }
    else if (k === 'PageUp') { e.preventDefault(); move(idx - 8); }
    else if (k === 'Tab') { e.preventDefault(); cyclePart(e.shiftKey ? -1 : 1); }
    else if (k === 'Delete' && !inp.value && items[idx] && items[idx].recent) { e.preventDefault(); forget(items[idx]); }
    else if (k === 'Enter') { e.preventDefault(); if (raf) { cancelAnimationFrame(raf); raf = 0; render(); } pick(idx, howOf(e)); }
    else if (e.altKey && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); if (raf) { cancelAnimationFrame(raf); raf = 0; render(); } pick(+e.code.slice(5) - 1, 'paste'); }
    else if (e.ctrlKey && e.code === 'KeyC' && inp.selectionStart === inp.selectionEnd && items[idx]) { e.preventDefault(); pick(idx, palMode === 'pop' ? 'copy' : 'clip'); }
    else if (k === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (palMode === 'pop') host.send('back');   // summoned over another program: go back there
      closeModal();
    }
  });
  list.addEventListener('mousemove', e => { const it = e.target.closest('.qs-item'); if (it && +it.dataset.i !== idx) move(+it.dataset.i); });
  modal.querySelector('.pal').addEventListener('mousedown', e => { if (e.target !== inp) e.preventDefault(); });   // keep typing in the box
  list.addEventListener('click', e => { const it = e.target.closest('.qs-item'); if (it) pick(+it.dataset.i, howOf(e)); });
  pv.addEventListener('click', e => {             // a cell / word in the preview: that part only, like Tab then Enter
    const b = e.target.closest('[data-part]'), it = items[idx];
    if (!b || !it) return;
    it.part = +b.dataset.part;
    pick(idx, howOf(e));
  });
  render();
  inp.focus();
}

