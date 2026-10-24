// ---------------------------------------------------------------- modal
let modalOnClose = null;
function openModal(html, onClose) {
  closePop();
  if (modalOpen()) closeModal();
  modal.innerHTML = html;
  modal.classList.add('show');
  app.classList.add('modal-on');                  // toasts move up, off the dialog's buttons
  modalOnClose = onClose || null;
  modalFocus();                                   // keys go to the dialog, never to the note behind it
}
// where keys belong while a dialog is open: its search box, a field marked data-autofocus, else the dialog itself
function modalFocus() {
  const d = modal.querySelector('.dlg');
  if (!d) return null;
  d.tabIndex = -1;
  const f = modal.querySelector('#palIn, #qsIn, [data-autofocus]') || d;
  if (document.activeElement !== f && !modal.contains(document.activeElement)) f.focus({ preventScroll: true });
  return f;
}
// a key with the focus outside the open dialog (clicked its backdrop, the page behind ...) is pulled back into it;
// Tab cycles inside the dialog
document.addEventListener('keydown', e => {
  if (!modalOpen() || recording) return;
  if (!modal.contains(document.activeElement)) {
    const f = modalFocus();
    if (e.key !== 'Escape' && !(f && f.nodeName === 'INPUT')) { e.preventDefault(); e.stopPropagation(); }   // a search box takes the key itself
    return;
  }
  if (e.key !== 'Tab' || e.target.id === 'palIn') return;   // Tab in the find-and-paste box picks a part of the line
  const f = $$('button:not(:disabled),input,select,[tabindex="0"]', modal).filter(x => x.offsetParent && !x.hidden);
  if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  e.preventDefault();
  f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1)].focus();
}, true);
function closeModal() {
  if (!modalOpen()) return;
  modal.classList.remove('show');
  app.classList.remove('modal-on');
  modal.innerHTML = '';
  const f = modalOnClose;
  modalOnClose = null;
  if (f) f();
  refocus();
}
function modalOpen() { return modal.classList.contains('show'); }
modal.addEventListener('mousedown', e => { if (e.target === modal) { e.preventDefault(); closeModal(); } });   // the caret goes back where it was

