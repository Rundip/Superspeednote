'use strict';
// ======================================================================
//  Super Speed Note - UI. Plain JS, no framework, one file: it must start instantly.
// ======================================================================
const SEP = '\x1f';
const HOST = !!(window.chrome && window.chrome.webview);
const MAX_NOTES = 500;          // measured: up to 500 notes every action stays within one frame (see README)
const IMG_URL = 'https://app.ssn/img/';
const BLOCK_TAGS = /^(DIV|P|H[1-6]|LI|TR|TD|TH|BLOCKQUOTE|PRE|UL|OL|TABLE|HR)$/;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => Date.now();
const ic = (id, cls = '') => `<svg class="i ${cls}"><use href="#${id}"/></svg>`;

const NOTE_COLORS = { navy: '#1e3a8a', blue: '#2f6bff', sky: '#0ea5e9', teal: '#0d9488', green: '#16a34a', amber: '#f59e0b', coral: '#f43f5e', violet: '#8b5cf6' };
const COLOR_KEYS = Object.keys(NOTE_COLORS);
const CORNERS = { tl: '왼쪽 위', tr: '오른쪽 위', bl: '왼쪽 아래', br: '오른쪽 아래' };   // where the quick memo opens
const COLOR_NAMES = { navy: '남색', blue: '파랑', sky: '하늘', teal: '청록', green: '초록', amber: '주황', coral: '빨강', violet: '보라' };
// text colours chosen for contrast on white; dark theme remaps them (see injected CSS)
const FG = [
  { n: '검정', v: '#000000', d: 'var(--ink)' }, { n: '남색', v: '#1d3a8a', d: '#a5bdff' }, { n: '파랑', v: '#1d4ed8', d: '#7fa8ff' },
  { n: '빨강', v: '#d92d20', d: '#ff8f84' }, { n: '초록', v: '#067647', d: '#5ad39b' }, { n: '주황', v: '#c2410c', d: '#ffa56e' },
  { n: '보라', v: '#6d28d9', d: '#c9a8ff' }, { n: '회색', v: '#475467', d: '#a6b1c6' }
];
const HL = [
  { n: '노랑', v: '#fff176' }, { n: '민트', v: '#a7f3d0' }, { n: '하늘', v: '#bae6fd' },
  { n: '핑크', v: '#fbcfe8' }, { n: '살구', v: '#fed7aa' }, { n: '라벤더', v: '#ddd6fe' }
];
const BLOCKS = [['div', '본문', ''], ['h1', '제목 1', '# '], ['h2', '제목 2', '## '], ['h3', '제목 3', '### '], ['blockquote', '인용', '> '], ['pre', '코드', '```']];
const FONTS = {
  ui: ['기본 (맑은 고딕)', 'var(--ui)'],
  nanum: ['나눔고딕', '"NanumGothic","나눔고딕",var(--ui)'],
  square: ['나눔스퀘어', '"NanumSquare","나눔스퀘어",var(--ui)'],
  serif: ['명조', '"NanumMyeongjo","나눔명조","Batang",serif'],
  mono: ['고정폭', 'var(--mono)']
};
{
  const st = document.createElement('style');
  st.textContent = FG.filter(c => c.v).map(c => `[data-theme=dark] #editor font[color="${c.v}"]{color:${c.d}}`).join('') +
    '[data-theme=dark] #editor span[style*="background-color"]:not([style*="transparent"]){color:#101828}' +
    '#editor font[color="#010203"]{color:inherit}';   // the old 'default colour' left on text typed after it: the normal ink
  document.head.appendChild(st);
}

