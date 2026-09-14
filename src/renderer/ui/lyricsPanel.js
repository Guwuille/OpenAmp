import { store } from '../state/store.js';
import { parseLRC, serializeLRC, findActiveIndex, findActiveWord } from '../lib/lrc.js';

const NUDGE_STEP = 0.1;
const MANUAL_SCROLL_PAUSE_MS = 4000;

export function initLyricsPanel({ audioEngine }) {
  const viewEl = document.getElementById('lyrics-view');
  const sourceEl = document.getElementById('lyrics-source');
  const editorEl = document.getElementById('lyrics-editor');
  const textArea = document.getElementById('lyrics-text');
  const syncEl = document.getElementById('lyrics-sync');
  const syncProgress = document.getElementById('lyrics-sync-progress');
  const syncDone = document.getElementById('lyrics-sync-done');
  const syncCurrent = document.getElementById('lyrics-sync-current');
  const syncNext = document.getElementById('lyrics-sync-next');

  const overlay = document.getElementById('lyrics-overlay');
  const overlayPrev = document.getElementById('lyrics-overlay-prev');
  const overlayCurrent = document.getElementById('lyrics-overlay-current');
  const overlayNext = document.getElementById('lyrics-overlay-next');

  const autoBtn = document.getElementById('btn-lyrics-auto');
  const fetchBtn = document.getElementById('btn-lyrics-fetch');
  const editBtn = document.getElementById('btn-lyrics-edit');
  const nudgeBackBtn = document.getElementById('btn-lyrics-nudge-back');
  const nudgeFwdBtn = document.getElementById('btn-lyrics-nudge-fwd');
  const syncBtn = document.getElementById('btn-lyrics-sync');
  const saveBtn = document.getElementById('btn-lyrics-save');
  const cancelBtn = document.getElementById('btn-lyrics-cancel');
  const markBtn = document.getElementById('btn-lyrics-mark');
  const undoBtn = document.getElementById('btn-lyrics-undo');
  const syncSaveBtn = document.getElementById('btn-lyrics-sync-save');
  const syncCancelBtn = document.getElementById('btn-lyrics-sync-cancel');

  let doc = { meta: {}, lines: [], synced: false };
  let rawText = '';
  let trackRef = null;
  let lineEls = [];
  let activeIndex = -1;
  let activeWordIndex = -1;
  let nudge = 0;
  let rafId = null;
  let resumeAutoScrollAt = 0;
  let mode = 'view';
  let attemptedFetchFor = null;
  let syncLines = [];
  let syncStamps = [];

  // ── Render ────────────────────────────────────────────────────────────

  function setStatus(text, kind) {
    sourceEl.textContent = text || '';
    sourceEl.className = kind ? `lyrics-status ${kind}` : 'lyrics-status';
  }

  function renderMessage(message) {
    lineEls = [];
    activeIndex = -1;
    viewEl.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'lyrics-empty';
    el.textContent = message;
    viewEl.appendChild(el);
  }

  function renderLines() {
    viewEl.innerHTML = '';
    lineEls = [];
    activeIndex = -1;
    activeWordIndex = -1;

    const fragment = document.createDocumentFragment();
    doc.lines.forEach((line, index) => {
      const el = document.createElement('div');
      el.className = 'lyrics-line';
      if (line.time == null) el.classList.add('untimed');
      el.dataset.index = String(index);

      if (line.words) {
        for (const word of line.words) {
          const span = document.createElement('span');
          span.className = 'lyrics-word';
          span.textContent = word.text;
          el.appendChild(span);
        }
      } else {
        // Las lineas vacias del LRC son pausas instrumentales.
        el.textContent = line.text || '♪';
      }

      lineEls.push(el);
      fragment.appendChild(el);
    });

    viewEl.appendChild(fragment);
  }

  function scrollToActive() {
    if (Date.now() < resumeAutoScrollAt) return;
    const el = lineEls[activeIndex];
    if (!el) return;

    // Se mide contra el contenedor en vez de usar offsetTop: offsetTop es
    // relativo al offsetParent, que no tiene por que ser #lyrics-view, y
    // entonces el destino se va de rango y la letra salta al fondo.
    const container = viewEl.getBoundingClientRect();
    const line = el.getBoundingClientRect();
    const delta = line.top - container.top - (viewEl.clientHeight - line.height) / 2;
    const target = Math.max(0, Math.min(viewEl.scrollHeight - viewEl.clientHeight, viewEl.scrollTop + delta));

    const distance = Math.abs(target - viewEl.scrollTop);
    if (distance < 1) return;

    // Suave entre lineas vecinas, instantaneo en saltos grandes: animar mas
    // de pantalla y media se arrastra casi un segundo, y al buscar un punto
    // lejano la letra tarda en llegar.
    const far = distance > viewEl.clientHeight * 1.5;
    viewEl.scrollTo({ top: target, behavior: far ? 'auto' : 'smooth' });
  }

  function lineText(index) {
    const line = doc.lines[index];
    if (!line) return '';
    return line.text || '♪';
  }

  // La superposicion solo tiene sentido en modo visualizador y con letra
  // sincronizada; sin tiempos no habria linea que destacar.
  function syncOverlayVisibility() {
    const show = store.getState().visualizerMode && doc.synced;
    overlay.classList.toggle('hidden', !show);
  }

  function updateOverlay() {
    if (!doc.synced) {
      overlayPrev.textContent = '';
      overlayCurrent.textContent = '';
      overlayNext.textContent = '';
      return;
    }
    overlayPrev.textContent = activeIndex > 0 ? lineText(activeIndex - 1) : '';
    overlayCurrent.textContent = activeIndex >= 0 ? lineText(activeIndex) : '';
    overlayNext.textContent = lineText(activeIndex + 1);
  }

  function setActive(index) {
    if (activeIndex >= 0 && lineEls[activeIndex]) {
      lineEls[activeIndex].classList.remove('active');
      clearWords(activeIndex);
    }
    activeIndex = index;
    activeWordIndex = -1;
    if (index >= 0 && lineEls[index]) {
      lineEls[index].classList.add('active');
      scrollToActive();
    }
    updateOverlay();
  }

  function clearWords(index) {
    const el = lineEls[index];
    if (!el) return;
    for (const span of el.children) span.classList.remove('sung');
  }

  function updateWords(index, time) {
    const line = doc.lines[index];
    if (!line || !line.words) return;
    const wordIndex = findActiveWord(line.words, time);
    if (wordIndex === activeWordIndex) return;
    activeWordIndex = wordIndex;
    const el = lineEls[index];
    if (!el) return;
    for (let i = 0; i < el.children.length; i++) {
      el.children[i].classList.toggle('sung', i <= wordIndex);
    }
  }

  // ── Bucle de sincronizacion ───────────────────────────────────────────
  //
  // No se puede usar el evento timeupdate del reproductor: dispara unas 4
  // veces por segundo, asi que una linea podria encenderse hasta 250 ms tarde
  // y eso se nota. Se lee currentTime en cada cuadro de animacion.

  function tick() {
    rafId = requestAnimationFrame(tick);
    if (mode !== 'view' || !doc.synced) return;

    const time = audioEngine.getCurrentTime() + nudge;
    const index = findActiveIndex(doc.lines, time);
    if (index !== activeIndex) setActive(index);
    if (index >= 0) updateWords(index, time);
  }

  function startLoop() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ── Carga ─────────────────────────────────────────────────────────────

  function setDoc(parsed, raw, source) {
    doc = parsed;
    rawText = raw || '';
    nudge = 0;

    if (doc.lines.length === 0) {
      renderMessage('Sin letra para esta pista.');
      setStatus('');
    } else {
      renderLines();
      if (doc.synced) {
        setStatus(source === 'lrclib' ? 'LRCLIB' : source === 'tags' ? 'etiquetas' : '.lrc', 'ok');
      } else {
        setStatus('sin sincronizar', 'warn');
      }
    }
    updateOverlay();
    syncOverlayVisibility();
    if (doc.synced) startLoop();
    else stopLoop();
  }

  async function maybeAutoFetch(track) {
    if (!store.getState().lyricsAutoFetch) return;
    if (attemptedFetchFor === track.file_path) return;
    attemptedFetchFor = track.file_path;
    await fetchOnline(track, true);
  }

  async function loadForTrack(track) {
    trackRef = track;
    stopLoop();
    doc = { meta: {}, lines: [], synced: false };
    activeIndex = -1;
    updateOverlay();

    if (!track || !track.file_path) {
      renderMessage('Sin pista en reproduccion.');
      setStatus('');
      return;
    }

    renderMessage('Buscando letra...');
    setStatus('');

    const result = await window.api.lyrics.load(track.file_path);
    // La pista pudo cambiar mientras se leia el archivo.
    if (trackRef !== track) return;

    if (result && result.text) {
      setDoc(parseLRC(result.text), result.text, result.source);
    } else {
      setDoc({ meta: {}, lines: [], synced: false }, '', null);
      maybeAutoFetch(track);
    }
  }

  async function fetchOnline(track, automatic) {
    if (!track) return;
    setStatus('buscando...', 'warn');
    if (!automatic) renderMessage('Consultando LRCLIB...');

    const result = await window.api.lyrics.fetchOnline({
      artist: track.artist,
      title: track.title,
      album: track.album,
      duration: track.duration,
      trackPath: track.file_path,
      save: true
    });

    if (trackRef !== track) return;

    if (!result || !result.ok) {
      if (doc.lines.length === 0) renderMessage('Sin letra para esta pista.');
      setStatus(result && result.notFound ? 'no encontrada' : 'sin conexion', 'warn');
      return;
    }

    setDoc(parseLRC(result.text), result.text, 'lrclib');
    if (!result.synced) setStatus('LRCLIB (sin sincronizar)', 'warn');
  }

  // ── Editor ────────────────────────────────────────────────────────────

  function setMode(next) {
    mode = next;
    viewEl.classList.toggle('hidden', next !== 'view');
    editorEl.classList.toggle('hidden', next !== 'edit');
    syncEl.classList.toggle('hidden', next !== 'sync');
    editBtn.classList.toggle('active', next !== 'view');
  }

  function openEditor() {
    if (!trackRef) return;
    textArea.value = rawText || doc.lines.map((l) => l.text).join('\n');
    setMode('edit');
    textArea.focus();
  }

  async function saveText(text) {
    if (!trackRef) return;
    const result = await window.api.lyrics.save(trackRef.file_path, text);
    if (!result || !result.ok) {
      setStatus('no se pudo guardar', 'warn');
      return;
    }
    setMode('view');
    setDoc(parseLRC(text), text, 'lrc');
    setStatus('guardada', 'ok');
  }

  function startSync() {
    const source = textArea.value
      .split(/\r?\n/)
      // Se descartan las marcas que ya hubiera: se vuelven a tomar todas.
      .map((l) => l.replace(/^\s*(\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/, '').trim())
      .filter((l, i, arr) => l !== '' || (i > 0 && i < arr.length - 1));

    if (source.length === 0) {
      setStatus('no hay texto que sincronizar', 'warn');
      return;
    }

    syncLines = source;
    syncStamps = [];
    setMode('sync');
    renderSync();
  }

  function renderSync() {
    const total = syncLines.length;
    const done = syncStamps.length;
    syncProgress.textContent = `${done} / ${total}`;
    syncDone.textContent = done > 0 ? syncLines[done - 1] : '';
    syncCurrent.textContent = done < total ? syncLines[done] : 'Listo, guarda el resultado.';
    syncNext.textContent = done + 1 < total ? syncLines[done + 1] : '';
    markBtn.disabled = done >= total;
    undoBtn.disabled = done === 0;
  }

  function markLine() {
    if (syncStamps.length >= syncLines.length) return;
    syncStamps.push(audioEngine.getCurrentTime());
    renderSync();
  }

  function undoMark() {
    syncStamps.pop();
    renderSync();
  }

  function saveSync() {
    if (syncStamps.length === 0) {
      setStatus('no marcaste ninguna linea', 'warn');
      return;
    }
    const lines = syncLines.map((text, i) => ({
      time: i < syncStamps.length ? syncStamps[i] : null,
      text
    }));
    saveText(serializeLRC({ meta: { ...doc.meta }, lines }));
  }

  // ── Eventos ───────────────────────────────────────────────────────────

  viewEl.addEventListener('click', (e) => {
    const lineEl = e.target.closest('.lyrics-line');
    if (!lineEl) return;
    const line = doc.lines[Number(lineEl.dataset.index)];
    if (!line || line.time == null) return;
    audioEngine.seek(Math.max(0, line.time - nudge));
  });

  viewEl.addEventListener('wheel', () => {
    resumeAutoScrollAt = Date.now() + MANUAL_SCROLL_PAUSE_MS;
  });

  autoBtn.addEventListener('click', () => {
    const next = !store.getState().lyricsAutoFetch;
    store.setState({ lyricsAutoFetch: next });
    window.api.settings.set('lyricsAutoFetch', next);
    // Si se reactiva, la pista actual merece un intento aunque ya se haya
    // descartado antes con la busqueda apagada.
    if (next) attemptedFetchFor = null;
  });

  fetchBtn.addEventListener('click', () => {
    if (trackRef) fetchOnline(trackRef, false);
  });

  editBtn.addEventListener('click', () => {
    if (mode === 'view') openEditor();
    else setMode('view');
  });

  nudgeBackBtn.addEventListener('click', () => {
    nudge -= NUDGE_STEP;
    setStatus(`desfase ${nudge >= 0 ? '+' : ''}${nudge.toFixed(1)}s`, 'warn');
  });

  nudgeFwdBtn.addEventListener('click', () => {
    nudge += NUDGE_STEP;
    setStatus(`desfase ${nudge >= 0 ? '+' : ''}${nudge.toFixed(1)}s`, 'warn');
  });

  syncBtn.addEventListener('click', startSync);
  saveBtn.addEventListener('click', () => saveText(textArea.value));
  cancelBtn.addEventListener('click', () => setMode('view'));
  markBtn.addEventListener('click', markLine);
  undoBtn.addEventListener('click', undoMark);
  syncSaveBtn.addEventListener('click', saveSync);
  syncCancelBtn.addEventListener('click', () => setMode('edit'));

  document.addEventListener('keydown', (e) => {
    if (mode !== 'sync') return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      markLine();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      undoMark();
    }
  });

  // ── Estado ────────────────────────────────────────────────────────────

  let lastTrackId = null;
  store.subscribe(() => {
    const state = store.getState();
    const track = state.currentTrack;
    const id = track ? String(track.id) : null;
    if (id !== lastTrackId) {
      lastTrackId = id;
      setMode('view');
      loadForTrack(track);
    }

    autoBtn.classList.toggle('active', state.lyricsAutoFetch);

    // La visibilidad del panel la maneja mainPanel junto a EQ y PL; aca solo
    // se decide la superposicion sobre el visualizador.
    syncOverlayVisibility();
  });

  renderMessage('Sin pista en reproduccion.');
  autoBtn.classList.toggle('active', store.getState().lyricsAutoFetch);

  (async () => {
    const saved = await window.api.settings.get('lyricsAutoFetch');
    if (typeof saved === 'boolean' && saved !== store.getState().lyricsAutoFetch) {
      store.setState({ lyricsAutoFetch: saved });
    }
  })();

  return {
    isEditing: () => mode !== 'view'
  };
}
