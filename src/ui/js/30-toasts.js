// ---------------------------------------------------------------- toasts
function toast(msg, actLabel, act) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${actLabel ? `<button>${esc(actLabel)}</button>` : ''}`;
  box.appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 160); };
  let t = setTimeout(kill, actLabel ? 8000 : clamp(2400 + msg.length * 45, 2800, 7000));   // long enough to read it
  el.onmouseenter = () => clearTimeout(t);        // reading it with the mouse on it: it waits
  el.onmouseleave = () => { t = setTimeout(kill, 2000); };
  if (actLabel) el.querySelector('button').onclick = () => { clearTimeout(t); kill(); act(); };
  while (box.children.length > 3) box.firstChild.remove();
}

