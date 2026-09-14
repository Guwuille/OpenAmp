import { store } from '../state/store.js';
import { formatTime } from '../lib/formatTime.js';
import { toFileUrl } from '../lib/fileUrl.js';

const UNKNOWN_ARTIST = 'Unknown Artist';
const UNKNOWN_ALBUM = 'Unknown Album';

function dirName(filePath) {
  const parts = String(filePath || '').split(/[\\/]/);
  parts.pop();
  return parts.join('\\') || '(raiz)';
}

function num(value) {
  const n = Number(value);
  return value == null || Number.isNaN(n) ? null : n;
}

const GROUPERS = {
  album: (t) => {
    // album_artist antes que artist: en recopilatorios cada pista tiene un
    // artista distinto y agrupar por artist partiria el album en pedazos.
    const artist = t.album_artist || t.artist || UNKNOWN_ARTIST;
    const album = t.album || UNKNOWN_ALBUM;
    return { key: `${artist}||${album}`, label: `${artist} — ${album}`, sortKey: [artist, album] };
  },
  artist: (t) => {
    const artist = t.artist || UNKNOWN_ARTIST;
    return { key: artist, label: artist, sortKey: [artist] };
  },
  folder: (t) => {
    const dir = dirName(t.file_path);
    return { key: dir, label: dir, sortKey: [dir] };
  },
  genre: (t) => {
    const genre = t.genre || 'Sin genero';
    return { key: genre, label: genre, sortKey: [t.genre ? genre : null] };
  },
  year: (t) => {
    const year = num(t.year);
    return { key: String(year ?? 'sin'), label: year == null ? 'Sin ano' : String(year), sortKey: [year] };
  }
};

function sortKeyOf(track, sortBy) {
  switch (sortBy) {
    case 'title':
      return [track.title || null];
    case 'artist':
      return [track.artist || null, track.album || null, num(track.track_no)];
    case 'album':
      return [track.album || null, num(track.disc_no), num(track.track_no)];
    case 'year':
      return [num(track.year), track.album || null, num(track.track_no)];
    case 'duration':
      return [num(track.duration)];
    case 'added':
      return [num(track.date_added)];
    case 'track':
    default:
      return [num(track.disc_no), num(track.track_no), track.title || null];
  }
}

// Los valores ausentes van siempre al final, tanto en ascendente como en
// descendente: un album sin ano no deberia encabezar la lista al invertirla.
function compareKeys(a, b, sign) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i];
    const bv = b[i];
    const aMissing = av == null || av === '';
    const bMissing = bv == null || bv === '';
    if (aMissing || bMissing) {
      if (aMissing && bMissing) continue;
      return aMissing ? 1 : -1;
    }
    const result =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'es', { sensitivity: 'base', numeric: true });
    if (result !== 0) return result * sign;
  }
  return 0;
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

function buildGroups(tracks, groupBy, sortBy, sortDir) {
  const sign = sortDir === 'desc' ? -1 : 1;
  const grouper = GROUPERS[groupBy];

  if (!grouper) {
    const flat = tracks.slice().sort((a, b) => compareKeys(sortKeyOf(a, sortBy), sortKeyOf(b, sortBy), sign));
    return [{ key: '__all__', label: null, coverPath: null, tracks: flat }];
  }

  const groups = new Map();
  for (const track of tracks) {
    const { key, label, sortKey } = grouper(track);
    if (!groups.has(key)) groups.set(key, { key, label, sortKey, coverPath: null, tracks: [] });
    const group = groups.get(key);
    group.tracks.push(track);
    if (!group.coverPath && track.cover_path) group.coverPath = track.cover_path;
  }

  const ordered = [...groups.values()].sort((a, b) => compareKeys(a.sortKey, b.sortKey, sign));
  for (const group of ordered) {
    group.tracks.sort((a, b) => compareKeys(sortKeyOf(a, sortBy), sortKeyOf(b, sortBy), sign));
  }
  return ordered;
}

export function initLibraryBrowser({ onPlayTrack, onAddToActivePlaylist }) {
  const listEl = document.getElementById('library-list');
  const searchInput = document.getElementById('library-search');
  const statusEl = document.getElementById('library-scan-status');
  const addFolderBtn = document.getElementById('btn-add-folder');
  const openFilesBtn = document.getElementById('btn-open-files');
  const groupSelect = document.getElementById('library-group');
  const sortSelect = document.getElementById('library-sort');
  const sortDirBtn = document.getElementById('btn-library-sort-dir');

  let visibleTracks = [];
  let rowsByTrackId = new Map();
  let lastSignature = null;
  let lastTracksRef = null;
  let lastPlayingId = null;

  function buildList() {
    const { tracks, librarySearch, libraryGroupBy, librarySortBy, librarySortDir } = store.getState();
    const groups = buildGroups(filterTracks(tracks, librarySearch), libraryGroupBy, librarySortBy, librarySortDir);

    const fragment = document.createDocumentFragment();
    visibleTracks = [];
    rowsByTrackId = new Map();

    for (const group of groups) {
      if (group.label !== null) {
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
        label.textContent = group.label;

        const count = document.createElement('span');
        count.className = 'group-count';
        count.textContent = String(group.tracks.length);

        header.appendChild(thumb);
        header.appendChild(label);
        header.appendChild(count);
        fragment.appendChild(header);
      }

      for (const track of group.tracks) {
        const index = visibleTracks.length;
        visibleTracks.push(track);

        const row = document.createElement('div');
        row.className = 'track-row';
        row.draggable = true;
        row.dataset.trackId = track.id;
        row.dataset.index = String(index);

        const title = document.createElement('span');
        title.className = 't-title';
        title.textContent = track.title || '(sin titulo)';

        const meta = document.createElement('span');
        meta.className = 't-artist';
        meta.textContent = formatTime(track.duration);

        row.appendChild(title);
        row.appendChild(meta);

        rowsByTrackId.set(String(track.id), row);
        fragment.appendChild(row);
      }
    }

    listEl.innerHTML = '';
    listEl.appendChild(fragment);
    lastPlayingId = null;
  }

  function updatePlayingHighlight() {
    const { currentTrack } = store.getState();
    const playingId = currentTrack ? String(currentTrack.id) : null;
    if (playingId === lastPlayingId) return;

    if (lastPlayingId !== null) rowsByTrackId.get(lastPlayingId)?.classList.remove('playing');
    if (playingId !== null) rowsByTrackId.get(playingId)?.classList.add('playing');
    lastPlayingId = playingId;
  }

  // El store emite en cada timeupdate del reproductor (varias veces por
  // segundo). Reconstruir la lista ahi dentro tiraba abajo el rendimiento con
  // bibliotecas grandes, asi que solo se rearma cuando cambia algo que afecta
  // el contenido o el orden.
  function render() {
    const { tracks, librarySearch, libraryGroupBy, librarySortBy, librarySortDir } = store.getState();
    const signature = JSON.stringify([librarySearch, libraryGroupBy, librarySortBy, librarySortDir]);

    if (tracks !== lastTracksRef || signature !== lastSignature) {
      lastTracksRef = tracks;
      lastSignature = signature;
      buildList();
    }
    updatePlayingHighlight();
  }

  function persist(key, value) {
    window.api.settings.set(key, value);
  }

  searchInput.addEventListener('input', () => {
    store.setState({ librarySearch: searchInput.value });
  });

  groupSelect.addEventListener('change', () => {
    store.setState({ libraryGroupBy: groupSelect.value });
    persist('libraryGroupBy', groupSelect.value);
  });

  sortSelect.addEventListener('change', () => {
    store.setState({ librarySortBy: sortSelect.value });
    persist('librarySortBy', sortSelect.value);
  });

  sortDirBtn.addEventListener('click', () => {
    const next = store.getState().librarySortDir === 'asc' ? 'desc' : 'asc';
    store.setState({ librarySortDir: next });
    sortDirBtn.textContent = next === 'asc' ? '▲' : '▼';
    sortDirBtn.classList.toggle('active', next === 'desc');
    persist('librarySortDir', next);
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

  // Las pistas llegan por library:updated, que se emite solo si el escaneo
  // cambio algo; aca alcanza con cerrar el aviso de progreso.
  window.api.library.onScanComplete(() => {
    statusEl.textContent = 'Listo';
    setTimeout(() => statusEl.classList.add('hidden'), 2000);
  });

  window.api.library.onScanError(({ message }) => {
    statusEl.textContent = `Error: ${message}`;
  });

  listEl.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.track-row');
    if (!row) return;
    onPlayTrack(visibleTracks, Number(row.dataset.index));
  });

  listEl.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.track-row');
    if (!row) return;
    e.dataTransfer.setData('application/x-track-id', row.dataset.trackId);
    e.dataTransfer.effectAllowed = 'copy';
  });

  listEl.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.track-row');
    if (!row) return;
    e.preventDefault();
    onAddToActivePlaylist(Number(row.dataset.trackId));
  });

  store.subscribe(render);
  render();

  (async () => {
    const [groupBy, sortBy, sortDir] = await Promise.all([
      window.api.settings.get('libraryGroupBy'),
      window.api.settings.get('librarySortBy'),
      window.api.settings.get('librarySortDir')
    ]);

    const patch = {};
    if (groupBy && (GROUPERS[groupBy] || groupBy === 'none')) patch.libraryGroupBy = groupBy;
    if (sortBy) patch.librarySortBy = sortBy;
    if (sortDir === 'asc' || sortDir === 'desc') patch.librarySortDir = sortDir;

    const state = { ...store.getState(), ...patch };
    groupSelect.value = state.libraryGroupBy;
    sortSelect.value = state.librarySortBy;
    sortDirBtn.textContent = state.librarySortDir === 'asc' ? '▲' : '▼';
    sortDirBtn.classList.toggle('active', state.librarySortDir === 'desc');

    if (Object.keys(patch).length > 0) store.setState(patch);
  })();
}
