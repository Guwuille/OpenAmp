import { createEventBus } from '../lib/eventBus.js';

const bus = createEventBus();

const state = {
  tracks: [],
  folders: [],
  playlists: [],
  activePlaylistId: null,
  queue: [],
  queueIndex: -1,
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  balance: 0,
  shuffle: false,
  repeat: 'none',
  eq: { enabled: true, preamp: 0, bands: new Array(10).fill(0), preset: 'Flat' },
  visiblePanels: { playlist: true, equalizer: false, lyrics: false },
  librarySearch: '',
  lyricsAutoFetch: true,
  visualizerMode: false,
  visualizerFullscreen: false,
  // Capas del visualizador: video de fondo, barras encima y letra encima.
  stage: { video: true, visualizer: true, lyrics: true },
  hasVideo: false,
  miniMode: false,
  miniOptions: { visualizer: true, art: true, lyrics: false },
  minimizeToMini: false,
  libraryGroupBy: 'album',
  librarySortBy: 'track',
  librarySortDir: 'asc'
};

function getState() {
  return state;
}

function setState(patch) {
  Object.assign(state, patch);
  bus.emit('change', state);
}

function subscribe(handler) {
  return bus.on('change', handler);
}

export const store = { getState, setState, subscribe };
