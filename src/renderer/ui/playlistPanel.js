import { store } from '../state/store.js';
import { formatTime } from '../lib/formatTime.js';
import { toFileUrl } from '../lib/fileUrl.js';

export function initPlaylistPanel({ onPlayTrack }) {
  const selectEl = document.getElementById('playlist-select');
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

  renameBtn.addEventListener('click', async () => {
    const playlist = getActivePlaylist();
    if (!playlist) return;
    const name = prompt('Nuevo nombre de playlist:', playlist.name);
    if (!name) return;
    await window.api.playlists.rename(playlist.id, name);
    await refreshPlaylists();
  });

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
