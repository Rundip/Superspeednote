// ---------------------------------------------------------------- messages from the shell
if (HOST) window.chrome.webview.addEventListener('message', e => {
  const m = String(e.data);
  const i = m.indexOf(SEP);
  const cmd = i < 0 ? m : m.slice(0, i), arg = i < 0 ? '' : m.slice(i + 1);
  switch (cmd) {
    case 'open': if (noteById(arg)) { closeModal(); closePop(); openNote(arg); } break;
    case 'board': closeModal(); goHome(); break;
    case 'new': closeModal(); newNote(); break;
    case 'focus': if (!paletteOn) app.classList.remove('pal-pop'); refocus(); break;   // the app window shown: never its hidden pop-up look
    case 'hidden': flushAll(); closePop(); if (recording || (paletteOn && palMode !== 'pop')) closeModal(); break;
    case 'winState': app.classList.toggle('maxed', arg === '1'); break;
    case 'hotkeyStatus': onHotkeyStatus(arg); break;
    case 'flush': if (freshIds.has(cur)) leaveNote(); flushAll(); host.send('flushed'); break;   // quit / standby: an untouched new note goes too
    case 'toast': toast(arg); break;
    case 'noteBody': onNoteBody(arg); break;
    case 'backupDone': {
      const b = $('#setBackup');
      if (b) { b.disabled = false; b.textContent = '지금 백업'; }
      if (arg.startsWith('!')) toast('백업하지 못했어요 · ' + arg.slice(1));
      else toast('백업했어요', '폴더 열기', () => host.send('openData'));
      break;
    }
    case 'outerInfo': try { paintOuter(JSON.parse(arg)); } catch (e) { /* settings closed */ } break;
    case 'outerDone': {
      const b = $('#outerNow');
      if (b) { b.disabled = false; b.textContent = '지금 백업'; }
      if (arg.startsWith('!')) toast('백업하지 못했어요 · ' + arg.slice(1));
      else toast('백업했어요', '폴더 열기', () => host.send('outerOpen'));
      break;
    }
    case 'trash': onTrash(arg); break;
    case 'trashRestored': onTrashRestored(arg); break;
    case 'dragOutDone': if (noteDrag) { dragDone(); if (view === 'board') boardSearch.focus({ preventScroll: true }); } break;
    case 'quick':                                 // global quick memo hotkey
      if (arg === 'open') quickStart();
      else if (arg === 'close' || arg === 'main') quickEnd(arg);
      else if (arg === 'focus') refocus();
      break;
    case 'palette':                               // global "find & paste" hotkey
      if (arg === 'close') { if (paletteOn) closeModal(); }
      else if (arg === 'focus') { const i = $('#palIn'); if (i) i.focus(); }
      else openPalette(arg === 'pop' || arg === 'quick' ? arg : 'in');
      break;
  }
});

