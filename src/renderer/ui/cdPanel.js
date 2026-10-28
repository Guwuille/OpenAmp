import { formatTime } from '../lib/formatTime.js';

// Importa un CD de audio a una carpeta de la biblioteca. Como esa carpeta ya
// esta vigilada, las pistas aparecen solas en la lista a medida que se van
// escribiendo: no hace falta reescanear al terminar.

export function initCdPanel() {
  const toggleBtn = document.getElementById('btn-toggle-cd');
  const panel = document.getElementById('library-cd');
  const infoEl = document.getElementById('cd-info');
  const artistaInput = document.getElementById('cd-artist');
  const albumInput = document.getElementById('cd-album');
  const carpetaSelect = document.getElementById('cd-folder');
  const refreshBtn = document.getElementById('btn-cd-refresh');
  const importBtn = document.getElementById('btn-cd-import');
  const cancelBtn = document.getElementById('btn-cd-cancel');
  const statusEl = document.getElementById('cd-status');
  const barFill = document.getElementById('cd-bar-fill');

  let disco = null;
  let importando = false;

  function setStatus(texto, tipo) {
    statusEl.textContent = texto || '';
    statusEl.className = tipo || '';
  }

  function setProgreso(fraccion) {
    barFill.style.width = fraccion == null ? '0%' : `${Math.max(0, Math.min(1, fraccion)) * 100}%`;
  }

  function setOcupado(valor) {
    importando = valor;
    importBtn.classList.toggle('hidden', valor);
    cancelBtn.classList.toggle('hidden', !valor);
    refreshBtn.disabled = valor;
    artistaInput.disabled = valor;
    albumInput.disabled = valor;
    carpetaSelect.disabled = valor;
  }

  async function refrescar() {
    const estado = await window.api.cd.list();

    // Carpetas de destino. Se cargan siempre, haya disco o no: si dependieran
    // del disco, el selector quedaria vacio sin motivo.
    const previa = carpetaSelect.value;
    carpetaSelect.innerHTML = '';
    for (const carpeta of await window.api.library.getFolders()) {
      const option = document.createElement('option');
      option.value = String(carpeta.id);
      option.textContent = carpeta.path;
      carpetaSelect.appendChild(option);
    }
    if (previa && [...carpetaSelect.options].some((o) => o.value === previa)) {
      carpetaSelect.value = previa;
    }

    if (!estado.ffmpeg.disponible) {
      disco = null;
      infoEl.textContent = 'Falta ffmpeg, que es lo que lee el disco.';
      infoEl.className = 'vacio';
      setStatus('Instalalo con: winget install Gyan.FFmpeg', 'warn');
      importBtn.disabled = true;
      return;
    }

    disco = estado.discos[0] || null;

    if (!disco) {
      infoEl.textContent = 'No hay ningun CD de audio en la lectora.';
      infoEl.className = 'vacio';
      setStatus('');
      importBtn.disabled = true;
      return;
    }

    infoEl.className = '';
    infoEl.textContent = `${disco.unidad}  ${disco.pistas.length} pistas  ${formatTime(disco.duracionTotal)}`;

    if (carpetaSelect.options.length === 0) {
      setStatus('Agrega una carpeta a la biblioteca para poder guardar el disco.', 'warn');
      importBtn.disabled = true;
      return;
    }

    importBtn.disabled = false;
    setStatus('');
    // El disco no trae nombres: se sugiere algo y el usuario lo corrige.
    if (!albumInput.value) albumInput.value = `CD de audio (${disco.pistas.length} pistas)`;
  }

  async function importar() {
    if (!disco || importando) return;

    setOcupado(true);
    setProgreso(0);
    setStatus('Preparando...', '');

    const resultado = await window.api.cd.import({
      unidad: disco.unidad,
      folderId: Number(carpetaSelect.value),
      artista: artistaInput.value.trim(),
      album: albumInput.value.trim()
    });

    if (!resultado || !resultado.ok) {
      setOcupado(false);
      setProgreso(null);
      setStatus(resultado ? resultado.error : 'No se pudo iniciar la importacion.', 'warn');
    }
  }

  toggleBtn.addEventListener('click', () => {
    const cerrado = panel.classList.toggle('hidden');
    toggleBtn.classList.toggle('active', !cerrado);
    if (!cerrado) refrescar();
  });

  refreshBtn.addEventListener('click', refrescar);
  importBtn.addEventListener('click', importar);
  cancelBtn.addEventListener('click', () => window.api.cd.cancel());

  window.api.cd.onProgress(({ pista, indice, total, avancePista, avanceTotal }) => {
    setProgreso(avanceTotal);
    const porcentaje = Math.round(avancePista * 100);
    setStatus(`Pista ${pista} (${indice + 1} de ${total}) — ${porcentaje}%`, '');
  });

  window.api.cd.onDone(({ importadas, total }) => {
    setOcupado(false);
    setProgreso(1);
    setStatus(`Listo: ${importadas} de ${total} pistas importadas.`, 'ok');
  });

  window.api.cd.onError(({ error, importadas }) => {
    setOcupado(false);
    setProgreso(null);
    setStatus(`${error}${importadas ? ` (se importaron ${importadas})` : ''}`, 'warn');
  });

  window.api.cd.onCancelled(({ importadas }) => {
    setOcupado(false);
    setProgreso(null);
    setStatus(`Importacion cancelada${importadas ? `, quedaron ${importadas} pistas` : ''}.`, 'warn');
  });
}
