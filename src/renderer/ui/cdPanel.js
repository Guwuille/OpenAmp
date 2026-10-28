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
  const lookupBtn = document.getElementById('btn-cd-lookup');
  const tracksEl = document.getElementById('cd-tracks');
  const importBtn = document.getElementById('btn-cd-import');
  const cancelBtn = document.getElementById('btn-cd-cancel');
  const statusEl = document.getElementById('cd-status');
  const barFill = document.getElementById('cd-bar-fill');

  let disco = null;
  let importando = false;
  // Lo que devolvio MusicBrainz, si se busco. Sin esto las pistas se importan
  // con nombres genericos.
  let metadatos = null;

  function setStatus(texto, tipo) {
    statusEl.textContent = texto || '';
    statusEl.className = tipo || '';
  }

  function setProgreso(fraccion) {
    barFill.style.width = fraccion == null ? '0%' : `${Math.max(0, Math.min(1, fraccion)) * 100}%`;
  }

  function renderPistas() {
    tracksEl.innerHTML = '';
    if (!metadatos) return;

    for (const pista of metadatos.pistas) {
      const fila = document.createElement('div');
      fila.className = 'cd-track';

      const numero = document.createElement('span');
      numero.className = 'cd-track-num';
      numero.textContent = String(pista.numero);

      const titulo = document.createElement('span');
      titulo.className = 'cd-track-title';
      titulo.textContent = pista.titulo;

      const duracion = document.createElement('span');
      duracion.className = 'cd-track-dur';
      duracion.textContent = formatTime(pista.duracion);

      fila.appendChild(numero);
      fila.appendChild(titulo);
      fila.appendChild(duracion);
      tracksEl.appendChild(fila);
    }
  }

  async function buscarDatos() {
    if (!disco || importando) return;

    lookupBtn.disabled = true;
    setStatus('Consultando MusicBrainz...', '');

    const resultado = await window.api.cd.lookup({ unidad: disco.unidad });
    lookupBtn.disabled = false;

    if (!resultado || !resultado.ok) {
      metadatos = null;
      renderPistas();
      setStatus(resultado ? resultado.error : 'No se pudo consultar.', 'warn');
      return;
    }

    metadatos = resultado;
    artistaInput.value = resultado.artista;
    albumInput.value = resultado.album;
    renderPistas();

    const detalle = [resultado.fecha, resultado.pais].filter(Boolean).join(' ');
    const otras = resultado.ediciones > 1 ? `, ${resultado.ediciones} ediciones` : '';
    setStatus(`${resultado.artista} — ${resultado.album}${detalle ? ` (${detalle})` : ''}${otras}`, 'ok');
  }

  function setOcupado(valor) {
    importando = valor;
    importBtn.classList.toggle('hidden', valor);
    cancelBtn.classList.toggle('hidden', !valor);
    refreshBtn.disabled = valor;
    lookupBtn.disabled = valor;
    artistaInput.disabled = valor;
    albumInput.disabled = valor;
    carpetaSelect.disabled = valor;
  }

  async function refrescar() {
    const estado = await window.api.cd.list();
    const idAnterior = disco && disco.idDisco;

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
      metadatos = null;
      renderPistas();
      infoEl.textContent = 'Falta ffmpeg, que es lo que lee el disco.';
      infoEl.className = 'vacio';
      setStatus('Instalalo con: winget install Gyan.FFmpeg', 'warn');
      importBtn.disabled = true;
      lookupBtn.disabled = true;
      return;
    }

    disco = estado.discos[0] || null;

    // Si cambiaron el disco, lo buscado antes ya no corresponde.
    if (!disco || disco.idDisco !== idAnterior) {
      metadatos = null;
      renderPistas();
    }

    if (!disco) {
      infoEl.textContent = 'No hay ningun CD de audio en la lectora.';
      infoEl.className = 'vacio';
      setStatus('');
      importBtn.disabled = true;
      lookupBtn.disabled = true;
      return;
    }

    lookupBtn.disabled = false;

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
      album: albumInput.value.trim(),
      titulos: metadatos ? metadatos.pistas : null,
      // Sin esto no hay de donde sacar la portada: el disco no trae ninguna.
      releaseId: metadatos ? metadatos.releaseId : null
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
  lookupBtn.addEventListener('click', buscarDatos);
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
