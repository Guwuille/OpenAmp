import { store } from '../state/store.js';
import { formatTime } from '../lib/formatTime.js';
import { toFileUrl } from '../lib/fileUrl.js';

function groupTracks(tracks) {
  const groups = new Map();
  for (const track of tracks) {
    const artist = track.artist || 'Unknown Artist';
    const album = track.album || 'Unknown Album';
    const key = `${artist}||${album}`;
    if (!groups.has(key)) groups.set(key, { artist, album, coverPath: null, tracks: [] });
    const group = groups.get(key);
    group.tracks.push(track);
    if (!group.coverPath && track.cover_path) group.coverPath = track.cover_path;
  }
  return [...groups.values()].sort((a, b) =>
    a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album)
  );
}

function filterTracks(tracks, search) {
  if (!search) return tracks;
  const q = search.toLowerCase();
  return tracks.filter((t) =>
    (t.title || '').toLowerCase().includes(q) ||
    (t.artist || '').toLowerCase().includes(q) ||
    (t.album || '').toLowerCase().includes(q)
  );
}

export function initLibraryBrowser({ onPlayTrack, onAddToActivePlaylist }) {
  const listEl = document.getElementById('library-list');
  const searchInput = document.getElementById('library-search');
  const statusEl = document.getElementById('library-scan-status');
  const addFolderBtn = document.getElementById('btn-add-folder');
  const openFilesBtn = document.getElementById('btn-open-files');

  let currentFilteredFlat = [];

  function render() {
    const { tracks, librarySearch, currentTrack } = store.getState();
    const filtered = filterTracks(tracks, librarySearch);
    currentFilteredFlat = filtered;

    const groups = groupTracks(filtered);
    listEl.innerHTML = '';

    for (const group of groups) {
      const header = document.createElement('div');
      header.className = 'group-header';

      const thumb = document.createElement('span');
      thumb.className = 'group-thumb';
      if (group.coverPath) {
        const img = document.createElement('img');
        img.src = toFileUrl(group.coverPath);
        img.alt = '';
        thumb.appendChild(img);
      }

      const label = document.createElement('span');
      label.className = 'group-label';
      label.textContent = `${group.artist} — ${group.album}`;

      header.appendChild(thumb);
      header.appendChild(label);
      listEl.appendChild(header);

      for (const track of group.tracks) {
        const row = document.createElement('div');
        row.className = 'track-row';
        if (currentTrack && currentTrack.id === track.id) row.classList.add('playing');
        row.draggable = true;
        row.dataset.trackId = track.id;

        const title = document.createElement('span');
        title.className = 't-title';
        title.textContent = track.title || '(sin titulo)';

        const meta = document.createElement('span');
        meta.className = 't-artist';
        meta.textContent = formatTime(track.duration);

        row.appendChild(title);
        row.appendChild(meta);

        row.addEventListener('dblclick', () => {
          const index = currentFilteredFlat.findIndex((t) => t.id === track.id);
          onPlayTrack(currentFilteredFlat, index);
        });

        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/x-track-id', String(track.id));
          e.dataTransfer.effectAllowed = 'copy';
        });

        listEl.appendChild(row);
      }
    }
  }

  searchInput.addEventListener('input', () => {
    store.setState({ librarySearch: searchInput.value });
  });

  addFolderBtn.addEventListener('click', async () => {
    const folders = await window.api.dialogs.selectFolders();
    if (!folders || folders.length === 0) return;
    statusEl.classList.remove('hidden');
    statusEl.textContent = 'Escaneando...';
    await window.api.library.addFolders(folders);
  });

  openFilesBtn.addEventListener('click', async () => {
    const files = await window.api.dialogs.selectAudioFiles();
    if (!files || files.length === 0) return;
    const adHocTracks = files.map((filePath, i) => ({
      id: `adhoc-${i}-${filePath}`,
      file_path: filePath,
      title: filePath.split(/[\\/]/).pop(),
      artist: '',
      album: '',
      duration: 0
    }));
    onPlayTrack(adHocTracks, 0);
  });

  window.api.library.onScanProgress(({ scanned, total }) => {
    statusEl.classList.remove('hidden');
    statusEl.textContent = `Escaneando... ${scanned}/${total}`;
  });

  window.api.library.onScanComplete(async () => {
    statusEl.textContent = 'Listo';
    setTimeout(() => statusEl.classList.add('hidden'), 2000);
    const tracks = await window.api.library.getAllTracks();
    store.setState({ tracks });
  });

  window.api.library.onScanError(({ message }) => {
    statusEl.textContent = `Error: ${message}`;
  });

  listEl.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.track-row');
    if (!row) return;
    e.preventDefault();
    onAddToActivePlaylist(Number(row.dataset.trackId));
  });

  store.subscribe(render);
  render();
}
