// ---------------------------------------------------------------- quick switcher (Ctrl+K)
function openSwitcher() {
  flushNote();
  openModal(`<div class="dlg qs"><div class="qs-in">${ic('i-search')}<input id="qsIn" placeholder="제목이나 내용으로 메모 찾기" spellcheck="false" autocomplete="off"></div><div class="qs-list" id="qsList"></div>` +
    `<div class="pal-foot"><span><kbd>↑↓</kbd>선택</span><span><kbd>Enter</kbd>열기</span><span class="fill"></span><span><kbd>Esc</kbd>닫기</span></div></div>`);
  const inp = $('#qsIn'), list = $('#qsList');
  let items = [], idx = 0, terms = [], shownN = 0;
  // rows are drawn 60 at a time (more as you scroll or arrow down): a word in every note must not lay out 500 rows per key
  const rowHTML = (x, i) => `<div class="qs-item${i === idx ? ' on' : ''}" data-i="${i}"><span class="c-dot" data-c="${x.n.color}" style="--c:${NOTE_COLORS[x.n.color]}"></span><div class="qs-txt"><b>${mark(titleOf(x.n) || '제목 없음', terms)}</b><small>${snippet(x.e, terms)}</small></div>${x.n.hotkey ? `<span class="chip">${esc(x.n.hotkey.label)}</span>` : ''}</div>`;
  const more = upTo => {
    const to = Math.min(items.length, Math.max(upTo, shownN + 60));
    if (to <= shownN) return;
    list.insertAdjacentHTML('beforeend', items.slice(shownN, to).map((x, j) => rowHTML(x, shownN + j)).join(''));
    shownN = to;
  };
  const render = () => {
    terms = termsOf(inp.value);
    const kinds = terms.map(kindOf);
    items = [];
    for (const n of ordered()) {                  // same rule as the board; the note you named comes first
      if (terms.length && !noteMatches(n, terms, kinds)) continue;
      const tl = { l: titleOf(n).toLowerCase() };
      let sc = terms.length && termAt(tl, terms[0], kinds[0]) === 0 ? 300 : 0;
      terms.forEach((t, j) => { if (termAt(tl, t, kinds[j]) >= 0) sc += 200; });
      items.push({ n, e: textEntry(n.id), sc });
    }
    items.sort((a, b) => b.sc - a.sc);            // stable: ties keep the board order (pinned first)
    idx = clamp(idx, 0, Math.max(0, items.length - 1));
    shownN = Math.min(items.length, Math.max(60, idx + 1));
    list.innerHTML = items.slice(0, shownN).map(rowHTML).join('') || '<div class="qs-empty">일치하는 메모가 없어요</div>';
    if (!items.length && terms.length) list.innerHTML = `<div class="qs-item qs-new on" data-i="0">${ic('i-plus')}<div class="qs-txt"><b>새 메모 만들기</b><small>‘${esc(inp.value.trim())}’ 제목으로</small></div></div>`;
    const on = list.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const move = i => {                             // like the palette: only the highlight moves
    if (!items.length) return;
    idx = clamp(i, 0, items.length - 1);
    if (idx >= shownN) more(idx + 1);
    for (const el of list.querySelectorAll('.qs-item.on')) el.classList.remove('on');
    const row = list.querySelector(`.qs-item[data-i="${idx}"]`);
    if (row) row.classList.add('on');
    const on = list.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const go = i => {
    if (!items.length) { const t = inp.value.trim(); if (t) { closeModal(); newNoteTitled(t); } return; }   // nothing found: make it
    const x = items[i];
    if (!x) return;
    let w = '';                                   // land on the first word found in the text (as written there)
    for (const t of terms) if ((w = hitText(x.e.t, t))) break;
    closeModal();
    openNote(x.n.id);
    if (w) findText(w, 0, true);
  };
  inp.addEventListener('input', () => { idx = 0; render(); });
  inp.addEventListener('keydown', e => {
    if (e.isComposing) return;
    const d = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[e.key];
    if (d) { e.preventDefault(); move(idx + d); }
    else if (e.key === 'Enter') { e.preventDefault(); go(idx); }
  });
  list.addEventListener('mousemove', e => { const it = e.target.closest('.qs-item'); if (it && +it.dataset.i !== idx) move(+it.dataset.i); });
  list.addEventListener('scroll', () => { if (shownN < items.length && list.scrollTop + list.clientHeight > list.scrollHeight - 200) more(0); });
  list.addEventListener('click', e => { const it = e.target.closest('.qs-item'); if (it) go(+it.dataset.i); });
  modal.querySelector('.qs').addEventListener('mousedown', e => { if (e.target !== inp) e.preventDefault(); });   // keep typing in the box
  render();
  inp.focus();
}
function mark(s, terms) { return terms.length ? marked(s, hitMap(s, terms), 0, s.length) : esc(s); }
// a note's text (its textEntry) from a little before the first hit (lead characters), the hits marked
function snippet(e, terms, lead = 24) {
  let i = -1;
  for (const t of terms) { const k = termAt(e, t, kindOf(t)); if (k >= 0 && k < e.l.length && (i < 0 || k < i)) i = k; }
  if (i < 0 && terms.some(isNum)) i = hitMap(e.l, terms.filter(isNum)).indexOf(1);   // only matched without its dashes
  if (i < 0) { const t = e.t.slice(0, 300).replace(/\s+/g, ' ').trim(); return esc(t.slice(0, 70)) || '<span class="ph">비어 있음</span>'; }
  const a = Math.max(0, i - lead * 3);
  let s = e.t.slice(a, i + 200).replace(/\s+/g, ' ');
  if (!a) s = s.trimStart();
  const hit = hitMap(s, terms);
  let b = Math.max(0, hit.indexOf(1) - lead);
  while (s[b] === ' ') b++;
  return (a || b ? '…' : '') + marked(s, hit, b, Math.min(s.length, b + 120));
}
function hitText(s, t) {                          // what search word t matched in s: '김철수' for ㄱㅊㅅ, '02-1234' for 021234
  const h = hitMap(s, [t]), a = h.indexOf(1);
  let b = a;
  while (b >= 0 && h[b]) b++;
  return a < 0 ? '' : s.slice(a, b);
}

