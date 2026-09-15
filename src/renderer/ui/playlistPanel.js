import { store } from '../state/store.js';
import { formatTime } from '../lib/formatTime.js';
import { toFileUrl } from '../lib/fileUrl.js';

export function initPlaylistPanel({ onPlayTrack }) {
  const selectEl = document.getElementById('playlist-select');
  const renameInput = document.getElementById('playlist-rename-input');
  const listEl = document.getElementById('playlist-list');
  const newBtn = document.getElementById('btn-playlist-new');
  const renameBtn = document.getElementById('btn-playlist-rename');
  const deleteBtn = document.getElementById('btn-playlist-delete');
  const exportBtn = document.getElementById('btn-playlist-export');
  const importBtn = document.getElementById('btn-playlist-import');

  function getActivePlaylist() {
    const { playlists, activePlaylistId } = store.getState();
    return playlists.find((p) => p.id === activePlaylistId) || null;
  }

  async function refreshPlaylists() {
    let playlists = await window.api.playlists.getAll();
    if (playlists.length === 0) {
      await window.api.playlists.create('Playlist 1');
      playlists = await window.api.playlists.getAll();
    }
    let { activePlaylistId } = store.getState();
    if (!activePlaylistId || !playlists.some((p) => p.id === activePlaylistId)) {
      activePlaylistId = playlists[0]?.id ?? null;
    }
    store.setState({ playlists, activePlaylistId });
  }

  function renderSelect() {
    const { playlists, activePlaylistId } = store.getState();
    selectEl.innerHTML = '';
    for (const p of playlists) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.tracks.length})`;
      opt.selected = p.id === activePlaylistId;
      selectEl.appendChild(opt);
    }
  }

  function renderTracks() {
    const { currentTrack } = store.getState();
    const playlist = getActivePlaylist();
    listEl.innerHTML = '';
    if (!playlist) return;

    playlist.tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = 'pl-row';
      if (currentTrack && currentTrack.id === track.id) row.classList.add('playing');
      row.draggable = true;
      row.dataset.playlistTrackId = track.playlist_track_id;
      row.dataset.index = index;

      const idx = document.createElement('span');
      idx.className = 'pl-index';
      idx.textContent = String(index + 1);

      const thumb = document.createElement('span');
      thumb.className = 'pl-thumb';
      if (track.cover_path) {
        const img = document.createElement('img');
        img.src = toFileUrl(track.cover_path);
        img.alt = '';
        thumb.appendChild(img);
      }

      const title = document.createElement('span');
      title.className = 'pl-title';
      title.textContent = `${track.artist || 'Unknown'} - ${track.title || track.file_path}`;

      const dur = document.createElement('span');
      dur.className = 'pl-duration';
      dur.textContent = formatTime(track.duration);

      const remove = document.createElement('span');
      remove.className = 'pl-remove';
      remove.textContent = 'x';
      remove.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updated = await window.api.playlists.removeTrack(playlist.id, track.playlist_track_id);
        applyUpdatedPlaylist(updated);
      });

      row.appendChild(idx);
      row.appendChild(thumb);
      row.appendChild(title);
      row.appendChild(dur);
      row.appendChild(remove);

      row.addEventListener('dblclick', () => {
        onPlayTrack(playlist.tracks, index);
      });

      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-playlist-reorder', String(index));
        e.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.classList.add('drag-over');
      });

      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));

      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        await handleDrop(e, index);
      });

      listEl.appendChild(row);
    });
  }

  function applyUpdatedPlaylist(updated) {
    const { playlists } = store.getState();
    const next = playlists.map((p) => (p.id === updated.id ? updated : p));
    store.setState({ playlists: next });
  }

  async function handleDrop(e, targetIndex) {
    const playlist = getActivePlaylist();
    if (!playlist) return;

    const trackId = e.dataTransfer.getData('application/x-track-id');
    const reorderFrom = e.dataTransfer.getData('application/x-playlist-reorder');

    if (trackId) {
      const updated = await window.api.playlists.addTracks(playlist.id, [Number(trackId)], targetIndex);
      applyUpdatedPlaylist(updated);
    } else if (reorderFrom !== '') {
      const fromIndex = Number(reorderFrom);
      const ids = playlist.tracks.map((t) => t.playlist_track_id);
      const [moved] = ids.splice(fromIndex, 1);
      const insertAt = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      ids.splice(insertAt, 0, moved);
      const updated = await window.api.playlists.reorder(playlist.id, ids);
      applyUpdatedPlaylist(updated);
    }
  }

  listEl.addEventListener('dragover', (e) => {
    if (e.target === listEl) e.preventDefault();
  });

  listEl.addEventListener('drop', async (e) => {
    if (e.target !== listEl) return;
    e.preventDefault();
    const playlist = getActivePlaylist();
    if (!playlist) return;
    await handleDrop(e, playlist.tracks.length);
  });

  selectEl.addEventListener('change', () => {
    store.setState({ activePlaylistId: Number(selectEl.value) });
  });

  newBtn.addEventListener('click', async () => {
    const name = `Playlist ${store.getState().playlists.length + 1}`;
    const created = await window.api.playlists.create(name);
    const playlists = await window.api.playlists.getAll();
    store.setState({ playlists, activePlaylistId: created.id });
  });

  // Renombrado en linea. Antes esto usaba prompt(), que en Electron existe
  // pero lanza "prompt() is not supported.": el boton reventaba apenas se
  // tocaba y no pasaba nada. Ademas, en una cabecera tan compacta un campo
  // que reemplaza al desplegable se lee mejor que un dialogo.
  let renamingId = null;

  function stopRename() {
    renamingId = null;
    renameInput.classList.add('hidden');
    selectEl.classList.remove('hidden');
  }

  function startRename() {
    const playlist = getActivePlaylist();
    if (!playlist || renamingId !== null) return;
    renamingId = playlist.id;
    renameInput.value = playlist.name;
    selectEl.classList.add('hidden');
    renameInput.classList.remove('hidden');
    renameInput.focus();
    renameInput.select();
  }

  async function commitRename() {
    if (renamingId === null) return;
    const id = renamingId;
    const name = renameInput.value.trim();
    stopRename();

    const playlist = store.getState().playlists.find((p) => p.id === id);
    // Un nombre vacio o igual al anterior no amerita tocar la base.
    if (!name || (playlist && name === playlist.name)) return;

    await window.api.playlists.rename(id, name);
    await refreshPlaylists();
  }

  // mousedown y no click: el blur del campo ocurre entre ambos, asi que con
  // click el boton confirmaria y acto seguido volveria a entrar en edicion.
  // preventDefault evita que el foco se mueva, y por lo tanto el blur.
  let ignorarProximoClic = false;

  renameBtn.addEventListener('mousedown', (e) => {
    if (renamingId === null) return;
    e.preventDefault();
    ignorarProximoClic = true;
    commitRename();
  });

  renameBtn.addEventListener('click', () => {
    if (ignorarProximoClic) {
      ignorarProximoClic = false;
      return;
    }
    startRename();
  });

  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      stopRename();
    }
  });

  // Al salir del campo se confirma, como en el explorador de archivos. El
  // Escape ya limpio el estado, asi que el blur que provoca no hace nada.
  renameInput.addEventListener('blur', () => commitRename());

  deleteBtn.addEventListener('click', async () => {
    const playlist = getActivePlaylist();
    if (!playlist) return;
    if (!confirm(`Borrar la playlist "${playlist.name}"?`)) return;
    await window.api.playlists.delete(playlist.id);
    store.setState({ activePlaylistId: null });
    await refreshPlaylists();
  });

  exportBtn.addEventListener('click', async () => {
    const playlist = getActivePlaylist();
    if (!playlist) return;
    const filePath = await window.api.dialogs.selectSaveM3U(playlist.name);
    if (!filePath) return;
    await window.api.playlists.exportM3U(playlist.id, filePath);
  });

  importBtn.addEventListener('click', async () => {
    const filePath = await window.api.dialogs.selectOpenM3U();
    if (!filePath) return;
    const imported = await window.api.playlists.importM3U(filePath);
    const playlists = await window.api.playlists.getAll();
    store.setState({ playlists, activePlaylistId: imported.id });
  });

  store.subscribe(() => {
    renderSelect();
    renderTracks();
  });

  refreshPlaylists();

  return {
    async addTrackToActivePlaylist(trackId) {
      const playlist = getActivePlaylist();
      if (!playlist) return;
      const updated = await window.api.playlists.addTracks(playlist.id, [trackId]);
      applyUpdatedPlaylist(updated);
    }
  };
}
