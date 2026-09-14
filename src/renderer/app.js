import { store } from './state/store.js';
import { createAudioEngine } from './audio/audioEngine.js';
import { createVisualizer } from './audio/visualizer.js';
import { initTitlebar } from './ui/titlebar.js';
import { initMainPanel } from './ui/mainPanel.js';
import { initEqualizerPanel } from './ui/equalizerPanel.js';
import { initPlaylistPanel } from './ui/playlistPanel.js';
import { initLibraryBrowser } from './ui/libraryBrowser.js';

const audioEngine = createAudioEngine();

let playOrder = [];
let orderPos = -1;

function shuffleArray(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function rebuildOrder(keepTrackIndex) {
  const { queue, shuffle } = store.getState();
  const indices = queue.map((_, i) => i);
  if (!shuffle) {
    playOrder = indices;
  } else if (keepTrackIndex == null) {
    playOrder = shuffleArray(indices);
  } else {
    const rest = indices.filter((i) => i !== keepTrackIndex);
    playOrder = [keepTrackIndex, ...shuffleArray(rest)];
  }
  orderPos = keepTrackIndex == null ? 0 : playOrder.indexOf(keepTrackIndex);
}

async function loadAndPlayCurrent() {
  const { queue } = store.getState();
  const trackIndex = playOrder[orderPos];
  const track = queue[trackIndex];
  if (!track) return;

  store.setState({ currentTrack: track, currentTime: 0 });
  try {
    await audioEngine.loadTrack(track.file_path);
    await audioEngine.play();
  } catch (err) {
    console.error('No se pudo reproducir el archivo:', track.file_path, err);
  }
}

const playback = {
  playTrackAt(list, index) {
    store.setState({ queue: list });
    rebuildOrder(index);
    loadAndPlayCurrent();
  },

  async play() {
    const { currentTrack, queue } = store.getState();
    if (currentTrack) {
      await audioEngine.play();
    } else if (queue.length > 0) {
      orderPos = 0;
      await loadAndPlayCurrent();
    }
  },

  pause() {
    audioEngine.pause();
  },

  stop() {
    audioEngine.stop();
    store.setState({ isPlaying: false, currentTime: 0 });
  },

  next() {
    const { repeat } = store.getState();
    if (orderPos + 1 < playOrder.length) {
      orderPos += 1;
      loadAndPlayCurrent();
    } else if (repeat === 'all') {
      orderPos = 0;
      loadAndPlayCurrent();
    } else {
      audioEngine.stop();
      store.setState({ isPlaying: false });
    }
  },

  prev() {
    if (audioEngine.getCurrentTime() > 3) {
      audioEngine.seek(0);
      return;
    }
    const { repeat } = store.getState();
    if (orderPos - 1 >= 0) {
      orderPos -= 1;
      loadAndPlayCurrent();
    } else if (repeat === 'all') {
      orderPos = playOrder.length - 1;
      loadAndPlayCurrent();
    } else {
      audioEngine.seek(0);
    }
  },

  seek(fraction) {
    const duration = store.getState().duration;
    audioEngine.seek(fraction * duration);
  },

  setVolume(linear) {
    audioEngine.setVolume(linear);
    window.api.settings.set('volume', linear);
  },

  setBalance(pan) {
    audioEngine.setBalance(pan);
    window.api.settings.set('balance', pan);
  },

  setShuffle(shuffle) {
    const { currentTrack, queue } = store.getState();
    const keepIndex = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : null;
    rebuildOrder(keepIndex >= 0 ? keepIndex : null);
  }
};

audioEngine.on('timeupdate', ({ currentTime, duration }) => {
  store.setState({ currentTime, duration });
});
audioEngine.on('loadedmetadata', ({ duration }) => {
  store.setState({ duration });
});
audioEngine.on('play', () => store.setState({ isPlaying: true }));
audioEngine.on('pause', () => store.setState({ isPlaying: false }));
audioEngine.on('ended', () => {
  const { repeat } = store.getState();
  if (repeat === 'one') {
    audioEngine.seek(0);
    audioEngine.play();
  } else {
    playback.next();
  }
});
audioEngine.on('error', (err) => {
  console.error('Error de reproduccion:', err);
  playback.next();
});

async function bootstrap() {
  initTitlebar();

  const visualizer = createVisualizer(document.getElementById('visualizer'), audioEngine.analyserNode);
  visualizer.start();
  document.getElementById('visualizer').addEventListener('click', () => visualizer.toggleMode());

  initMainPanel({ playback, visualizer });

  initEqualizerPanel({ audioEngine });

  const playlistApi = initPlaylistPanel({
    onPlayTrack: (list, index) => playback.playTrackAt(list, index)
  });

  initLibraryBrowser({
    onPlayTrack: (list, index) => playback.playTrackAt(list, index),
    onAddToActivePlaylist: (trackId) => playlistApi.addTrackToActivePlaylist(trackId)
  });

  const [tracks, volume, balance] = await Promise.all([
    window.api.library.getAllTracks(),
    window.api.settings.get('volume'),
    window.api.settings.get('balance')
  ]);

  store.setState({ tracks });

  if (typeof volume === 'number') {
    document.getElementById('volume-slider').value = String(Math.round(volume * 100));
    audioEngine.setVolume(volume);
  }
  if (typeof balance === 'number') {
    document.getElementById('balance-slider').value = String(Math.round(balance * 100));
    audioEngine.setBalance(balance);
  }
}

bootstrap();
