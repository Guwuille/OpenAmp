// Descarga de un enlace directo a una carpeta de la biblioteca. La carpeta ya
// esta vigilada, asi que al terminar la pista aparece sola en la lista sin
// reescanear a mano.

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function initDownloadPanel() {
  const toggleBtn = document.getElementById('btn-toggle-download');
  const panel = document.getElementById('library-download');
  const urlInput = document.getElementById('download-url');
  const folderSelect = document.getElementById('download-folder');
  const startBtn = document.getElementById('btn-download-start');
  const cancelBtn = document.getElementById('btn-download-cancel');
  const statusEl = document.getElementById('download-status');
  const barFill = document.getElementById('download-bar-fill');

  let activeId = null;

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = kind || '';
  }

  function setProgress(fraction) {
    barFill.style.width = fraction == null ? '0%' : `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  function setBusy(busy) {
    startBtn.classList.toggle('hidden', busy);
    cancelBtn.classList.toggle('hidden', !busy);
    urlInput.disabled = busy;
    folderSelect.disabled = busy;
  }

  async function refreshFolders() {
    const folders = await window.api.library.getFolders();
    const previous = folderSelect.value;
    folderSelect.innerHTML = '';

    for (const folder of folders) {
      const option = document.createElement('option');
      option.value = String(folder.id);
      option.textContent = folder.path;
      folderSelect.appendChild(option);
    }

    if (previous && folders.some((f) => String(f.id) === previous)) folderSelect.value = previous;

    const sinCarpetas = folders.length === 0;
    startBtn.disabled = sinCarpetas;
    if (sinCarpetas) setStatus('Agrega una carpeta a la biblioteca antes de descargar.', 'warn');
  }

  async function start() {
    const url = urlInput.value.trim();
    if (!url) {
      setStatus('Pega un enlace.', 'warn');
      return;
    }

    setStatus('Conectando...', '');
    setProgress(0);
    setBusy(true);

    const result = await window.api.downloads.start({
      url,
      folderId: Number(folderSelect.value)
    });

    if (!result || !result.ok) {
      setBusy(false);
      setProgress(null);
      setStatus(result ? result.error : 'No se pudo iniciar la descarga.', 'warn');
      return;
    }

    activeId = result.id;
  }

  toggleBtn.addEventListener('click', () => {
    const abierto = panel.classList.toggle('hidden');
    toggleBtn.classList.toggle('active', !abierto);
    if (!abierto) {
      refreshFolders();
      urlInput.focus();
    }
  });

  startBtn.addEventListener('click', start);

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !startBtn.disabled && activeId === null) start();
  });

  cancelBtn.addEventListener('click', () => {
    if (activeId !== null) window.api.downloads.cancel(activeId);
  });

  window.api.downloads.onProgress(({ id, received, total, name }) => {
    if (id !== activeId) return;
    setProgress(total ? received / total : null);
    setStatus(
      total
        ? `${name} — ${formatBytes(received)} de ${formatBytes(total)}`
        : `${name} — ${formatBytes(received)}`,
      ''
    );
  });

  window.api.downloads.onDone(({ id, name, bytes }) => {
    if (id !== activeId) return;
    activeId = null;
    setBusy(false);
    setProgress(1);
    setStatus(`Listo: ${name} (${formatBytes(bytes)})`, 'ok');
    urlInput.value = '';
  });

  window.api.downloads.onError(({ id, error }) => {
    if (id !== activeId) return;
    activeId = null;
    setBusy(false);
    setProgress(null);
    setStatus(error, 'warn');
  });

  window.api.downloads.onCancelled(({ id, error }) => {
    if (id !== activeId) return;
    activeId = null;
    setBusy(false);
    setProgress(null);
    setStatus(error, 'warn');
  });

  // Las carpetas cambian al agregar o quitar una, y el desplegable tiene que
  // reflejarlo sin reabrir el panel.
  window.api.library.onUpdated(() => {
    if (!panel.classList.contains('hidden')) refreshFolders();
  });
}
